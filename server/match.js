// 联机匹配服务器：排队匹配、开赛、房间内消息中转、房主移交。
// 不跑任何游戏逻辑，所以既能挂在 Vite 开发服务器上（见 vite.config.js），
// 也能挂在独立的 Node 服务器上（见 server/index.js）。
import { WebSocketServer } from 'ws';
import { THEME_KEYS, LOOK_PRESETS, BOT_NAMES } from '../src/config.js';
import { GEAR_KEYS, GOGGLES, BACKS, SCARVES, TRAILS } from '../src/gear.js';

const MAX_PLAYERS = 8;
const WAIT_MS = 20000; // 房间建好后最多等这么久就开赛
const JOIN_GRACE_MS = 5000; // 有人进来后，至少再等这么久
const FULL_MS = 3000; // 满员 / 房主点“立即开始”后的倒计时
const LOAD_TIMEOUT_MS = 15000; // 等所有人加载赛道，超时就不等了
const DROP_BACKLOG = 256 * 1024; // 对方积压超过这么多字节，就丢掉位置包（下一包会补上）
// 匹配赛的统一规则
const MATCH_RULES = { length: 'medium', items: true, itemRate: 1, wildlife: true, difficulty: 1, rounds: 1, banned: [] };

const pick = (list) => list[Math.floor(Math.random() * list.length)];
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [list[i], list[k]] = [list[k], list[i]];
  }
  return list;
}

const int = (v, lo, hi, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : def;
};

function cleanLook(look) {
  const d = LOOK_PRESETS[0];
  const l = look && typeof look === 'object' ? look : {};
  const color = (k) => int(l[k], 0, 0xffffff, d[k]);
  return {
    hat: int(l.hat, 0, 7, d.hat),
    hatColor: color('hatColor'),
    skin: color('skin'),
    jacket: color('jacket'),
    stripe: color('stripe'),
    pants: color('pants'),
    ski: color('ski'),
    mustache: !!l.mustache,
    gear: GEAR_KEYS.includes(l.gear) ? l.gear : 'ski',
    goggles: int(l.goggles, 0, GOGGLES.length - 1, 0),
    back: int(l.back, 0, BACKS.length - 1, 0),
    scarf: int(l.scarf, 0, SCARVES.length - 1, 0),
    trail: int(l.trail, 0, TRAILS.length - 1, 0),
  };
}

// 机器人：预设外观 + 随机装备和配饰
function botLook(k) {
  const r = (n, p) => (Math.random() < p ? 0 : 1 + Math.floor(Math.random() * n));
  return {
    ...LOOK_PRESETS[1 + (k % 7)],
    gear: pick(['ski', 'ski', 'ski', 'board', 'board', 'sled', 'tube']),
    goggles: r(3, 0.5),
    back: r(4, 0.55),
    scarf: r(2, 0.6),
    trail: r(4, 0.65),
  };
}

function cleanName(name, id) {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim() : '';
  return [...s].slice(0, 12).join('') || `滑雪客${id % 1000}`;
}

// exclusive：这台 HTTP 服务器上只有我们一个 WebSocket 服务，其他路径的升级请求直接拒绝
export function attachMatchServer(httpServer, { path = '/ws', exclusive = false, log = () => {} } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const clients = new Set();
  const rooms = new Set();
  let waiting = null; // 正在等人的那个房间
  let nextId = 1;
  let nextRoom = 1;

  const send = (c, obj) => {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  };

  const pushRoom = (room) => {
    const info = {
      t: 'room',
      players: room.members.map((m) => ({ id: m.id, name: m.name, look: m.look })),
      host: room.host.id,
      max: MAX_PLAYERS,
      left: Math.max(0, room.startAt - Date.now()),
    };
    for (const m of room.members) send(m, info);
  };

  const arm = (room) => {
    clearTimeout(room.timer);
    room.timer = setTimeout(() => startRoom(room), Math.max(0, room.startAt - Date.now()));
  };

  const closeRoom = (room) => {
    clearTimeout(room.timer);
    clearTimeout(room.loadTimer);
    rooms.delete(room);
    if (waiting === room) waiting = null;
  };

  function queue(c, msg) {
    if (c.room) return;
    c.look = cleanLook(msg.look);
    const base = cleanName(msg.name, c.id);
    if (!waiting) {
      waiting = { id: nextRoom++, state: 'waiting', members: [], host: c, startAt: Date.now() + WAIT_MS, timer: null, loadTimer: null };
      rooms.add(waiting);
    }
    const room = waiting;
    // 同一个房间里不重名
    let name = base;
    for (let n = 2; room.members.some((m) => m.name === name); n++) name = `${base}${n}`;
    c.name = name;
    c.ready = false;
    c.room = room;
    room.members.push(c);
    const now = Date.now();
    if (room.members.length >= MAX_PLAYERS) {
      room.startAt = Math.min(room.startAt, now + FULL_MS);
      waiting = null; // 满了，后面来的人进新房间
    } else if (room.members.length > 1) {
      room.startAt = Math.max(room.startAt, now + JOIN_GRACE_MS);
    }
    arm(room);
    pushRoom(room);
    log(`[match] ${c.name} 进入房间 #${room.id}（${room.members.length}/${MAX_PLAYERS}）`);
  }

  function startRoom(room) {
    if (room.state !== 'waiting') return;
    if (waiting === room) waiting = null;
    if (!room.members.length) return closeRoom(room);
    room.state = 'loading';
    const seed = (Math.random() * 1e9) | 0;
    const theme = pick(THEME_KEYS);
    // 真人随机排发车位，空位由机器人补齐
    const humans = shuffle(room.members.slice());
    const taken = new Set(humans.map((m) => m.name));
    const botNames = shuffle(BOT_NAMES.filter((n) => !taken.has(n)));
    const roster = [];
    humans.forEach((m, i) => {
      m.idx = i;
      m.ready = false;
      roster.push({ idx: i, id: m.id, name: m.name, look: m.look, bot: false });
    });
    for (let i = humans.length, k = 0; i < MAX_PLAYERS; i++, k++) {
      roster.push({ idx: i, id: 0, name: botNames[k % botNames.length], look: botLook(k), bot: true });
    }
    for (const m of room.members) send(m, { t: 'start', seed, theme, rules: MATCH_RULES, roster, host: room.host.id, you: m.idx });
    room.loadTimer = setTimeout(() => go(room), LOAD_TIMEOUT_MS);
    log(`[match] 房间 #${room.id} 开赛：${humans.length} 人 + ${MAX_PLAYERS - humans.length} 个机器人`);
  }

  // 所有人都加载完赛道了：一起开始倒计时
  function go(room) {
    if (room.state !== 'loading') return;
    clearTimeout(room.loadTimer);
    room.state = 'racing';
    for (const m of room.members) send(m, { t: 'go' });
  }

  function leave(c) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    const i = room.members.indexOf(c);
    if (i >= 0) room.members.splice(i, 1);
    if (!room.members.length) return closeRoom(room);
    if (room.host === c) room.host = room.members[0];
    if (room.state === 'waiting') {
      pushRoom(room);
    } else {
      // 比赛中有人走了：告诉其他人，顺带通知新的房主是谁（机器人归房主管）
      for (const m of room.members) send(m, { t: 'leave', id: c.id, host: room.host.id });
      if (room.state === 'loading' && room.members.every((m) => m.ready)) go(room);
    }
  }

  function onText(c, text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const room = c.room;
    switch (msg.t) {
      case 'queue':
        queue(c, msg);
        break;
      case 'leave':
        leave(c);
        break;
      case 'startnow':
        if (room && room.state === 'waiting' && room.host === c) {
          room.startAt = Math.min(room.startAt, Date.now() + FULL_MS);
          arm(room);
          pushRoom(room);
        }
        break;
      case 'ready':
        if (room && room.state === 'loading') {
          c.ready = true;
          if (room.members.every((m) => m.ready)) go(room);
        }
        break;
      case 'ev':
        // 比赛事件（开火、击飞、冲线……）：原样转给房间里的其他人
        if (room && room.state !== 'waiting') {
          msg.from = c.id;
          const out = JSON.stringify(msg);
          for (const m of room.members) if (m !== c && m.ws.readyState === 1) m.ws.send(out);
        }
        break;
      case 'ping':
        send(c, { t: 'pong', ts: msg.ts });
        break;
    }
  }

  // 位置包：二进制，原样转发；对方网络堵住时直接丢
  function onBinary(c, data) {
    const room = c.room;
    if (!room || room.state === 'waiting') return;
    for (const m of room.members) {
      if (m !== c && m.ws.readyState === 1 && m.ws.bufferedAmount < DROP_BACKLOG) m.ws.send(data, { binary: true });
    }
  }

  wss.on('connection', (ws) => {
    const c = { id: nextId++, ws, name: '', look: null, room: null, ready: false, idx: 0, alive: true };
    clients.add(c);
    send(c, { t: 'hello', id: c.id });
    ws.on('message', (data, isBinary) => {
      if (isBinary) onBinary(c, data);
      else onText(c, data.toString());
    });
    ws.on('pong', () => {
      c.alive = true;
    });
    ws.on('close', () => {
      leave(c);
      clients.delete(c);
    });
    ws.on('error', () => {});
  });

  // 心跳：断网但没正常关闭的连接，30 秒内清掉
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* 连接已经坏了，下一轮清掉 */
      }
    }
  }, 15000);

  const onUpgrade = (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      /* 地址不合法 */
    }
    if (pathname !== path) {
      if (exclusive) socket.destroy();
      return; // 其他升级请求（比如 Vite 的热更新）留给别的监听器
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  httpServer.on('upgrade', onUpgrade);

  return {
    stats: () => ({ online: clients.size, rooms: rooms.size }),
    dispose() {
      clearInterval(heartbeat);
      httpServer.off('upgrade', onUpgrade);
      for (const room of [...rooms]) closeRoom(room);
      for (const c of clients) c.ws.terminate();
      clients.clear();
      wss.close();
    },
  };
}
