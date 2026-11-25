// 联机匹配服务器：排队匹配、开赛、房间内消息中转、房主移交。
// 不跑任何游戏逻辑，所以既能挂在 Vite 开发服务器上（见 vite.config.js），
// 也能挂在独立的 Node 服务器上（见 server/index.js）。
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { THEME_KEYS, LOOK_PRESETS, HATS, DEFAULT_HAT, BOT_NAMES, MODE_KEYS, LENGTHS } from '../src/config.js';
import { GEAR_KEYS, GOGGLES, BACKS, SCARVES, TRAILS, pickBotGear } from '../src/gear.js';
import { TRACK_MAP } from '../src/tracks.js';
import { botWaitMs } from '../src/wait.js';

const MAX_PLAYERS = 8;
// 排位和首页匹配分开排队。人数和判胜方式跟玩法走。
const RANK_RULES = {
  'rank-solo': { mode: 'speed', seats: 6, items: false, itemRate: 1, teamFirst: false, rank: 'solo' },
  'rank-team': { mode: 'team', seats: 6, items: false, itemRate: 1, teamFirst: false, rank: 'team' },
  'rank-item': { mode: 'team', seats: 6, items: true, itemRate: 1, teamFirst: true, rank: 'item' },
};
const JOIN_GRACE_MS = 5000; // 有人进来、而且剩下的时间比这还短时，再留这么久
const FULL_MS = 3000; // 满员 / 房主点“立即开始”后的倒计时
const LOAD_TIMEOUT_MS = 15000; // 等所有人加载赛道，超时就不等了
const DROP_BACKLOG = 256 * 1024; // 对方积压超过这么多字节，就丢掉位置包（下一包会补上）
const REJOIN_MS = 180000; // 比赛中掉线的人，位子留这么久，可以连回来
const AGAIN_MS = 30 * 60000; // 自建房间开赛后这么久之内，还能点「再来一局」回到同一批人
// 匹配赛的统一规则；玩法由玩家在首页选，每种玩法各排各的队
const MATCH_RULES = { mode: 'race', length: 'medium', items: true, itemRate: 1, wildlife: true, difficulty: 1, rounds: 1, banned: [], track: 'random', theme: 'random' };
const ITEM_MODES = ['race', 'elim', 'team', 'brawl'];
// 计时赛是一个人滑，客户端不会拿它来匹配；万一发来了按道具赛排
const matchMode = (m) => (MODE_KEYS.includes(m) && m !== 'tt' ? m : 'race');
function matchRules(mode) {
  return { ...MATCH_RULES, mode, items: ITEM_MODES.includes(mode), itemRate: mode === 'brawl' ? 3 : 1 };
}

// 开房间：玩法、赛道和人数由房主定。计时赛是一个人滑，不进房间列表。
function cleanRoomRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let mode = MODE_KEYS.includes(r.mode) && r.mode !== 'tt' ? r.mode : 'race';
  let seats = [4, 6, 8].includes(Number(r.seats)) ? Number(r.seats) : 8;
  if (mode === 'team') seats = 8;
  if (mode === 'elim') seats = Math.max(4, seats);
  const track = r.track && r.track !== 'random' && TRACK_MAP[r.track] ? r.track : 'random';
  const theme = r.theme === 'random' || THEME_KEYS.includes(r.theme) ? r.theme : 'day';
  const length = LENGTHS[r.length] ? r.length : 'medium';
  const difficulty = int(r.difficulty, 0, 2, 1);
  const items = mode === 'race' || mode === 'elim' || mode === 'team' || mode === 'brawl';
  return { mode, track, theme, length, difficulty, seats, items, itemRate: mode === 'brawl' ? 3 : 1, wildlife: true, rounds: 1, banned: [] };
}

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
    hat: int(l.hat, 0, HATS.length - 1, d.hat),
    hatColor: color('hatColor'),
    skin: color('skin'),
    jacket: color('jacket'),
    stripe: color('stripe'),
    pants: color('pants'),
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
    gear: pickBotGear(1),
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
// verify(账号钥匙)：返回这个账号在服务器上的存档（Profile），用来核对装备；不给就不核对
export function attachMatchServer(httpServer, { path = '/ws', exclusive = false, log = () => {}, online = null, verify = null } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const clients = new Set();
  const rooms = new Set();
  const waiting = new Map(); // 玩法 → 这个玩法正在等人的那个匹配房间
  const ended = new Map(); // 开过赛的自建房间号 → { 规则, 再来一局开的新房间 }
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
      max: room.rules && room.rules.seats ? room.rules.seats : MAX_PLAYERS,
      left: Math.max(0, room.startAt - Date.now()),
      reason: room.reason || 'fill',
      kind: room.kind || 'match',
      mode: room.rules ? room.rules.mode : 'race',
      id: room.id,
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
    if (room.mode && waiting.get(room.mode) === room) waiting.delete(room.mode);
    if (room.kind === 'custom') pushLobby();
  };

  const roomCard = (room) => ({
    id: room.id,
    mode: room.rules.mode,
    track: room.rules.track,
    theme: room.rules.theme,
    host: room.host ? room.host.name : '',
    players: room.members.length,
    max: room.rules.seats,
  });

  function pushLobby(extra) {
    const msg = { t: 'lobby', rooms: [...rooms].filter((r) => r.kind === 'custom' && r.state === 'waiting').map(roomCard), ...extra };
    for (const c of clients) if (c.listing && !c.room) send(c, msg);
  }

  // 按服务器上的存档核对外观：没拥有的装备、配饰换回默认，强化等级用服务器记的。没有有效账号就全按默认
  function checkLook(c, msg) {
    if (typeof msg.tok === 'string') c.tok = msg.tok.slice(0, 80);
    if (msg.look !== undefined) c.rawLook = msg.look;
    const L = (c.look = cleanLook(c.rawLook));
    c.up = null;
    if (!verify) return;
    let p = null;
    try {
      p = c.tok ? verify(c.tok) : null;
    } catch {
      p = null;
    }
    if (!p || !p.gearOwned(L.gear)) L.gear = 'ski';
    if (!p || !p.hatOwned(L.hat)) L.hat = DEFAULT_HAT;
    for (const slot of ['goggles', 'back', 'scarf', 'trail']) if (!p || !p.cosmeticOwned(slot, L[slot])) L[slot] = 0;
    if (p) c.up = p.up(L.gear);
  }

  function admit(c, room, msg) {
    checkLook(c, msg);
    c.listing = false;
    const base = cleanName(msg.name, c.id);
    let name = base;
    for (let n = 2; room.members.some((m) => m.name === name); n++) name = `${base}${n}`;
    c.name = name;
    c.ready = false;
    c.room = room;
    room.members.push(c);
    if (!room.host) room.host = c;
  }

  function queue(c, msg) {
    if (c.room) return;
    checkLook(c, msg);
    const base = cleanName(msg.name, c.id);
    const onlineNow = () => {
      const n = online ? online() : clients.size;
      return Math.max(1, Math.floor(Number(n) || 1));
    };
    const rankId = typeof msg.rank === 'string' && RANK_RULES[msg.rank] ? msg.rank : '';
    const mode = rankId || matchMode(msg.mode);
    const rules = rankId ? { ...MATCH_RULES, ...RANK_RULES[rankId] } : matchRules(mode);
    const cap = rules.seats || MAX_PLAYERS;
    let room = waiting.get(mode);
    if (!room) {
      // 等人多久看当前在线：人少 10 秒就补机器人，人多最多等 30 秒
      const wait = botWaitMs(onlineNow());
      room = { id: nextRoom++, mode, rules, state: 'waiting', members: [], host: c, startAt: Date.now() + wait, reason: 'fill', timer: null, loadTimer: null };
      waiting.set(mode, room);
      rooms.add(room);
      log(`[match] 新建 ${mode} 房间 #${room.id}，在线 ${onlineNow()} 人，${Math.round(wait / 1000)} 秒后补机器人`);
    }
    // 同一个房间里不重名
    let name = base;
    for (let n = 2; room.members.some((m) => m.name === name); n++) name = `${base}${n}`;
    c.name = name;
    c.ready = false;
    c.room = room;
    room.members.push(c);
    const now = Date.now();
    if (room.members.length >= cap) {
      room.startAt = Math.min(room.startAt, now + FULL_MS);
      room.reason = 'full';
      waiting.delete(mode); // 满了，后面来的人进新房间
    } else if (room.members.length > 1) {
      room.startAt = Math.max(room.startAt, now + JOIN_GRACE_MS);
      room.reason = 'fill';
    }
    arm(room);
    pushRoom(room);
    log(`[match] ${c.name} 进入房间 #${room.id}（${room.members.length}/${cap}）`);
  }

  // 自己开一间，停在列表里，等别人进来。房主点开始才开赛。
  function createCustom(c, msg) {
    if (c.room) return;
    const rules = cleanRoomRules(msg.rules);
    const room = { id: nextRoom++, kind: 'custom', state: 'waiting', members: [], host: null, rules, startAt: 0, reason: 'host', timer: null, loadTimer: null };
    rooms.add(room);
    admit(c, room, msg);
    room.host = c;
    pushRoom(room);
    pushLobby();
    log(`[room] ${c.name} 创建房间 #${room.id}（${rules.mode} / ${rules.track} / ${rules.seats} 人）`);
  }

  function joinCustom(c, msg) {
    if (c.room) return;
    const room = [...rooms].find((r) => r.kind === 'custom' && r.state === 'waiting' && r.id === Math.floor(Number(msg.id)));
    if (!room || room.members.length >= room.rules.seats) {
      c.listing = true;
      send(c, { t: 'lobby', rooms: [...rooms].filter((r) => r.kind === 'custom' && r.state === 'waiting').map(roomCard), error: '这个房间已经满了或开赛了' });
      return;
    }
    admit(c, room, msg);
    pushRoom(room);
    pushLobby();
    log(`[room] ${c.name} 加入房间 #${room.id}（${room.members.length}/${room.rules.seats}）`);
  }

  function quickCustom(c, msg) {
    if (c.room) return;
    const mode = MODE_KEYS.includes(msg.mode) ? msg.mode : '';
    const room = [...rooms].find((r) => r.kind === 'custom' && r.state === 'waiting' && r.members.length < r.rules.seats && (!mode || r.rules.mode === mode));
    if (!room) {
      c.listing = true;
      send(c, { t: 'lobby', rooms: [...rooms].filter((r) => r.kind === 'custom' && r.state === 'waiting').map(roomCard), error: '现在没有可进的房间' });
      return;
    }
    admit(c, room, msg);
    pushRoom(room);
    pushLobby();
    log(`[room] ${c.name} 快速进入房间 #${room.id}`);
  }

  // 自己开的房间打完一局点「再来一局」：第一个点的人按原规则重开一间并当房主，后面点的人进同一间
  function again(c, msg) {
    if (c.room) return;
    const prev = ended.get(Math.floor(Number(msg.id)));
    if (!prev) {
      c.listing = true;
      send(c, { t: 'lobby', rooms: [...rooms].filter((r) => r.kind === 'custom' && r.state === 'waiting').map(roomCard), error: '房间已经解散了' });
      return;
    }
    let room = prev.next;
    if (!room || !rooms.has(room) || room.state !== 'waiting' || room.members.length >= room.rules.seats) {
      room = { id: nextRoom++, kind: 'custom', state: 'waiting', members: [], host: null, rules: prev.rules, startAt: 0, reason: 'host', timer: null, loadTimer: null };
      rooms.add(room);
      prev.next = room;
    }
    admit(c, room, msg);
    pushRoom(room);
    pushLobby();
    log(`[room] ${c.name} 再来一局，进入房间 #${room.id}（${room.members.length}/${room.rules.seats}）`);
  }

  function startRoom(room) {
    if (room.state !== 'waiting') return;
    if (room.mode && waiting.get(room.mode) === room) waiting.delete(room.mode);
    if (!room.members.length) return closeRoom(room);
    room.state = 'loading';
    if (room.kind === 'custom') ended.set(room.id, { rules: room.rules, next: null, at: Date.now() });
    const custom = room.kind === 'custom' ? room.rules : null;
    const seats = (room.rules && room.rules.seats) || MAX_PLAYERS;
    const fixed = custom && custom.track !== 'random' ? TRACK_MAP[custom.track] : null;
    const seed = fixed ? fixed.seed : (Math.random() * 1e9) | 0;
    const theme = fixed ? fixed.theme : custom && custom.theme !== 'random' ? custom.theme : pick(THEME_KEYS);
    const rules = room.rules || MATCH_RULES;
    // 真人随机排发车位，空位由机器人补齐。开赛前按最新存档再核对一次装备（排队时刚买的也算上）
    const humans = shuffle(room.members.slice());
    for (const m of humans) checkLook(m, {});
    const taken = new Set(humans.map((m) => m.name));
    const botNames = shuffle(BOT_NAMES.filter((n) => !taken.has(n)));
    const roster = [];
    humans.forEach((m, i) => {
      m.idx = i;
      m.ready = false;
      m.key = randomBytes(9).toString('hex'); // 掉线后凭它回到这个位子
      roster.push({ idx: i, id: m.id, name: m.name, look: m.look, up: m.up || null, bot: false });
    });
    for (let i = humans.length, k = 0; i < seats; i++, k++) {
      roster.push({ idx: i, id: 0, name: botNames[k % botNames.length], look: botLook(k), bot: true });
    }
    room.start = { seed, theme, track: fixed ? fixed.id : 'random', rules, roster };
    room.away = new Map(); // 座位钥匙 → 掉线的人
    room.snap = null; // 房主每秒传一份比赛现状，给连回来的人用
    room.snapAt = 0;
    for (const m of room.members) send(m, { t: 'start', ...room.start, host: room.host.id, you: m.idx, key: m.key });
    room.loadTimer = setTimeout(() => go(room), LOAD_TIMEOUT_MS);
    pushLobby();
    log(`[match] 房间 #${room.id} 开赛：${humans.length} 人 + ${seats - humans.length} 个机器人`);
  }

  // 所有人都加载完赛道了：一起开始倒计时
  function go(room) {
    if (room.state !== 'loading') return;
    clearTimeout(room.loadTimer);
    room.state = 'racing';
    for (const m of room.members) send(m, { t: 'go' });
  }

  // drop：比赛中连接断了（不是自己点退出），位子先留着
  function leave(c, drop = false) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    const i = room.members.indexOf(c);
    if (i >= 0) room.members.splice(i, 1);
    if (drop && c.key && room.away && room.state !== 'waiting') room.away.set(c.key, { id: c.id, idx: c.idx, name: c.name, look: c.look, at: Date.now() });
    if (!room.members.length) {
      if (room.away && room.away.size && room.state !== 'waiting') {
        room.host = null;
        return;
      }
      return closeRoom(room);
    }
    if (room.host === c) room.host = room.members[0];
    if (room.state === 'waiting') {
      const cap = (room.rules && room.rules.seats) || MAX_PLAYERS;
      if (room.kind !== 'custom' && room.members.length < cap && room.reason === 'full') room.reason = 'fill';
      pushRoom(room);
      if (room.kind === 'custom') pushLobby();
    } else {
      // 比赛中有人走了：告诉其他人，顺带通知新的房主是谁（机器人归房主管）
      for (const m of room.members) send(m, { t: 'leave', id: c.id, host: room.host.id });
      if (room.state === 'loading' && room.members.every((m) => m.ready)) go(room);
    }
  }

  // 掉线的人连回来：按钥匙找回原来的位子，把开赛信息和比赛现状发给他
  function rejoin(c, msg) {
    if (c.room) return;
    const key = typeof msg.key === 'string' ? msg.key.slice(0, 40) : '';
    let room = null;
    for (const r of key ? rooms : []) {
      if (!r.away || r.state === 'waiting') continue;
      // 旧连接服务器这边还没发现断了：当它掉线处理
      const old = r.members.find((m) => m.key === key);
      if (old) {
        leave(old, true);
        old.ws.terminate();
      }
      if (r.away.has(key)) {
        room = r;
        break;
      }
    }
    if (!room) return send(c, { t: 'rejoin', ok: false });
    const seat = room.away.get(key);
    room.away.delete(key);
    c.id = seat.id;
    c.name = seat.name;
    c.look = seat.look;
    c.idx = seat.idx;
    c.key = key;
    c.listing = false;
    c.ready = room.state !== 'loading';
    c.room = room;
    room.members.push(c);
    if (!room.host) room.host = c;
    const now = Date.now();
    send(c, {
      t: 'rejoin',
      ok: true,
      ...room.start,
      host: room.host.id,
      you: c.idx,
      id: c.id,
      key,
      state: room.state,
      humans: room.members.filter((m) => m !== c).map((m) => m.id),
      snap: room.snap,
      age: room.snap ? now - room.snapAt : 0,
    });
    log(`[match] ${c.name} 回到房间 #${room.id}`);
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
        c.listing = false;
        queue(c, msg);
        break;
      case 'watch':
        if (c.room) break;
        c.listing = true;
        send(c, { t: 'lobby', rooms: [...rooms].filter((r) => r.kind === 'custom' && r.state === 'waiting').map(roomCard) });
        break;
      case 'create':
        createCustom(c, msg);
        break;
      case 'join':
        joinCustom(c, msg);
        break;
      case 'quickroom':
        quickCustom(c, msg);
        break;
      case 'again':
        again(c, msg);
        break;
      case 'leave':
        leave(c);
        break;
      case 'rejoin':
        rejoin(c, msg);
        break;
      case 'back':
        // 连回来的人已经对好了自己的位置：其他人把他的角色从机器人手里交还给他
        if (room && room.state !== 'waiting') {
          for (const m of room.members) if (m !== c) send(m, { t: 'back', id: c.id, idx: c.idx, host: room.host.id });
        }
        break;
      case 'snap':
        if (room && room.host === c && room.state === 'racing' && msg.s && typeof msg.s === 'object') {
          room.snap = msg.s;
          room.snapAt = Date.now();
        }
        break;
      case 'look':
        // 排队时去车库换了装备 / 外观：开赛前以最新的为准
        if (room && room.state === 'waiting') {
          checkLook(c, { look: msg.look });
          pushRoom(room);
        }
        break;
      case 'startnow':
        if (room && room.state === 'waiting' && room.host === c) {
          if (room.kind === 'custom') {
            room.startAt = Date.now() + FULL_MS;
            room.reason = 'now';
            arm(room);
            pushRoom(room);
          } else {
            room.startAt = Math.min(room.startAt, Date.now() + FULL_MS);
            room.reason = 'now';
            arm(room);
            pushRoom(room);
          }
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
      leave(c, true);
      clients.delete(c);
    });
    ws.on('error', () => {});
  });

  // 心跳：断网但没正常关闭的连接，30 秒内清掉
  const heartbeat = setInterval(() => {
    // 掉线太久没回来的位子作废；房间里没人、也没有等着回来的人，就关掉
    const now = Date.now();
    for (const [id, e] of ended) if (now - e.at > AGAIN_MS) ended.delete(id);
    for (const room of [...rooms]) {
      if (!room.away || !room.away.size) continue;
      for (const [k, a] of room.away) if (now - a.at > REJOIN_MS) room.away.delete(k);
      if (!room.members.length && !room.away.size) closeRoom(room);
    }
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
