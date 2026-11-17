// 联机：连接匹配服务器、收发房间消息、同步选手状态。
// 思路：每个客户端都跑完整的游戏，只规定“谁说了算”——
//   自己的角色自己模拟；机器人和野鹿归房主；别人的角色只按收到的状态做插值。
import { WEAPON_KEYS } from './config.js';
import { clamp, wrapAngle } from './util.js';

const SEND_MS = 50; // 每秒发 20 次状态
const HEAD = 10; // 包头：类型 1 + 人数 1 + 发送方时间戳 8
const REC = 32; // 每个选手一条记录的字节数
const MAX_RACERS = 8;
const STATE_CODE = { ready: 0, ski: 1, tumble: 2 };
const STATE_NAME = ['ready', 'ski', 'tumble', 'ski'];

const i16 = (v) => clamp(Math.round(v), -32767, 32767);
const u8 = (v) => clamp(Math.round(v), 0, 255);

export class Net {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = 0;
    this.hostId = 0;
    // off 未联机 / connecting 正在连 / queue 排队中 / load 加载赛道 / race 比赛中
    this.phase = 'off';
    this.lastSend = 0;
    this.buf = new ArrayBuffer(HEAD + REC * MAX_RACERS);
    this.dv = new DataView(this.buf);
  }

  // 正处在一场联机比赛里
  get active() {
    return this.phase === 'load' || this.phase === 'race';
  }

  // 房主负责机器人和野鹿
  get isHost() {
    return this.active && this.hostId === this.id;
  }

  // 进入匹配队列
  match(name, look) {
    this.leave();
    this.phase = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      this.phase = 'off';
      this.game.onNetLost('connecting');
      return;
    }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.phase = 'queue';
      this.sendJson({ t: 'queue', name, look });
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      if (typeof e.data === 'string') this.onText(e.data);
      else this.onState(e.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const was = this.phase;
      this.ws = null;
      this.phase = 'off';
      this.game.onNetLost(was);
    };
  }

  // 离开队列 / 房间（主动断开，不触发断线回调）
  leave() {
    const ws = this.ws;
    this.ws = null;
    this.phase = 'off';
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* 已经关了 */
    }
  }

  sendJson(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  // 比赛事件：转发给房间里的其他人
  ev(k, data) {
    // t / k 放在后面：data 里不许有同名字段把消息类型盖掉
    if (this.active) this.sendJson({ ...data, t: 'ev', k });
  }

  // 自己（或自己管的机器人）开火了。s 是扣扳机那一刻的位置和朝向，别人照着它生成一样的弹体
  fire(r, id, s, ex) {
    if (!this.active) return;
    const round = (v) => Math.round(v * 100) / 100;
    this.ev('fire', {
      i: r.idx,
      w: id,
      p: [round(s.x), round(s.y), round(s.z)],
      v: [round(s.vx), round(s.vy), round(s.vz)],
      y: Math.round(s.yaw * 10000) / 10000,
      g: s.grounded ? 1 : 0,
      ex,
    });
  }

  onText(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const game = this.game;
    switch (m.t) {
      case 'hello':
        this.id = m.id;
        break;
      case 'room':
        if (this.phase === 'queue') game.onNetRoom(m);
        break;
      case 'start':
        if (this.phase !== 'queue' || !Array.isArray(m.roster)) break;
        this.phase = 'load';
        this.hostId = m.host;
        game.onNetStart(m);
        break;
      case 'go':
        if (this.phase !== 'load') break;
        this.phase = 'race';
        game.onNetGo();
        break;
      case 'leave': {
        if (!this.active) break;
        const hostChanged = this.hostId !== m.host;
        this.hostId = m.host;
        game.onNetLeave(m.id, hostChanged);
        break;
      }
      case 'ev':
        if (this.active) game.onNetEv(m);
        break;
    }
  }

  // 每帧调用：到点就把自己负责的选手状态发出去
  tick() {
    if (this.phase !== 'race') return;
    const now = performance.now();
    if (now - this.lastSend < SEND_MS - 2) return;
    this.lastSend = now;
    const ws = this.ws;
    // 网络堵住时不再往里塞，等下一次
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 65536) return;
    const dv = this.dv;
    let o = HEAD;
    let n = 0;
    for (const r of this.game.racers) {
      if (!r.owned || n >= MAX_RACERS) continue;
      const vis = r.vis;
      dv.setUint8(o, r.idx);
      dv.setFloat32(o + 1, r.pos.x, true);
      dv.setFloat32(o + 5, r.pos.y, true);
      dv.setFloat32(o + 9, r.pos.z, true);
      dv.setInt16(o + 13, i16(r.vel.x * 100), true);
      dv.setInt16(o + 15, i16(r.vel.y * 100), true);
      dv.setInt16(o + 17, i16(r.vel.z * 100), true);
      dv.setInt16(o + 19, i16(wrapAngle(r.yaw) * 10000), true);
      dv.setUint8(o + 21, (r.grounded ? 1 : 0) | ((STATE_CODE[r.state] || 0) << 1) | (r.drifting ? 8 : 0) | (vis.tuck ? 32 : 0) | (vis.brake ? 64 : 0));
      dv.setUint8(o + 22, (r.boostT > 0 ? 1 : 0) | (r.turboT > 0 ? 2 : 0) | (r.plantT > 0 ? 4 : 0) | (r.driftDir > 0 ? 8 : 0));
      dv.setInt8(o + 23, clamp(Math.round(vis.steer * 80), -127, 127));
      dv.setInt16(o + 24, i16(r.flip * 1000), true);
      dv.setUint8(o + 26, u8(Math.ceil(Math.max(0, r.shieldT) * 10)));
      dv.setUint8(o + 27, u8(Math.ceil(Math.max(0, r.frozenT) * 10)));
      dv.setUint8(o + 28, u8(Math.ceil(Math.max(0, r.invulnT) * 10)));
      dv.setUint8(o + 29, u8(r.driftCharge * 50));
      const w = r.weapon ? WEAPON_KEYS.indexOf(r.weapon) : -1;
      dv.setUint8(o + 30, w < 0 ? 255 : w);
      dv.setUint8(o + 31, u8(r.ammo));
      o += REC;
      n++;
    }
    if (!n) return;
    dv.setUint8(0, 1);
    dv.setUint8(1, n);
    dv.setFloat64(2, now / 1000, true);
    ws.send(new Uint8Array(this.buf, 0, o));
  }

  // 收到别人发来的状态包
  onState(buf) {
    if (!this.active || !(buf instanceof ArrayBuffer) || buf.byteLength < HEAD) return;
    const dv = new DataView(buf);
    if (dv.getUint8(0) !== 1) return;
    const n = dv.getUint8(1);
    if (buf.byteLength < HEAD + n * REC) return;
    const ts = dv.getFloat64(2, true);
    if (!Number.isFinite(ts)) return;
    const racers = this.game.racers;
    for (let k = 0, o = HEAD; k < n; k++, o += REC) {
      const r = racers[dv.getUint8(o)];
      // 自己负责的选手不听别人的
      if (!r || r.owned) continue;
      const x = dv.getFloat32(o + 1, true);
      const y = dv.getFloat32(o + 5, true);
      const z = dv.getFloat32(o + 9, true);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const f1 = dv.getUint8(o + 21);
      const w = dv.getUint8(o + 30);
      r.netPush({
        ts,
        x,
        y,
        z,
        vx: dv.getInt16(o + 13, true) / 100,
        vy: dv.getInt16(o + 15, true) / 100,
        vz: dv.getInt16(o + 17, true) / 100,
        yaw: dv.getInt16(o + 19, true) / 10000,
        grounded: !!(f1 & 1),
        state: STATE_NAME[(f1 >> 1) & 3],
        drifting: !!(f1 & 8),
        tuck: !!(f1 & 32),
        brake: !!(f1 & 64),
        f2: dv.getUint8(o + 22),
        steer: dv.getInt8(o + 23) / 80,
        flip: dv.getInt16(o + 24, true) / 1000,
        shield: dv.getUint8(o + 26) / 10,
        frozen: dv.getUint8(o + 27) / 10,
        invuln: dv.getUint8(o + 28) / 10,
        charge: dv.getUint8(o + 29) / 50,
        weapon: WEAPON_KEYS[w] || null,
        ammo: dv.getUint8(o + 31),
      });
    }
  }
}
