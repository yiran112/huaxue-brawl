// 赛道机关：雪崩、横穿雪道的雪地摩托、滚石。
// 雪地摩托和滚石的位置只取决于比赛时间，联机时每台机器看到的都一样；
// 被撞翻由各自负责的那台机器判定（Racer.knock 里只处理本机负责的选手）
import * as THREE from 'three';
import { clamp, smooth } from './util.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

const AV_START = 22; // 雪浪初速（m/s）
const AV_END = 34; // 冲到雪崩区末尾时的速度
const AV_TRIGGER = 40; // 领头的人冲进雪崩区多远后开始塌

// 雪崩：领头的人进入雪崩区后，一道雪浪从区段起点沿下坡方向追下来，追上谁就把谁卷翻
class Avalanche {
  constructor(game, a) {
    this.game = game;
    this.c = game.course;
    this.d0 = a.d0;
    this.d1 = a.d1;
    this.front = -1; // 雪浪前沿所在的 d；-1 表示还没塌
    this.fade = 1;
    this.hit = new Set();
    this.warned = false;
    const N = 70;
    this.puffs = [];
    for (let i = 0; i < N; i++) {
      const front = i < 40;
      this.puffs.push({
        u: front ? (i / 39) * 2 - 1 : Math.random() * 2 - 1,
        back: front ? Math.random() * 4 : 4 + Math.random() * 22,
        r: front ? 2.6 + Math.random() * 2.4 : 1.8 + Math.random() * 2.6,
        ph: Math.random() * 6.28,
      });
    }
    this.geo = new THREE.IcosahedronGeometry(1, 1);
    this.mat = new THREE.MeshLambertMaterial({ color: game.theme.snow, flatShading: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.mesh);
  }

  update(dt, t) {
    const game = this.game;
    const c = this.c;
    if (this.front < 0) {
      const lead = game.racers.reduce((m, r) => (r.out ? m : Math.max(m, r.d)), 0);
      if (lead < this.d0 + AV_TRIGGER) return;
      this.front = this.d0;
      this.mesh.visible = true;
      const p = game.player;
      if (p && !p.finished && p.d > this.d0 - 150 && p.d < this.d1) game.ui.banner('⚠ 雪崩来了！快往下冲！', 'bad', 2);
      game.sfxAt('boom', _v.set(c.cx(this.d0), c.height(c.cx(this.d0), -this.d0) + 20, -this.d0), 1);
    }
    if (this.fade <= 0) return;
    const k = clamp((this.front - this.d0) / (this.d1 - this.d0), 0, 1);
    this.front += (AV_START + (AV_END - AV_START) * k) * dt;
    if (this.front > this.d1 + 25) this.fade -= dt * 0.8;
    const front = this.front;
    // 卷人
    for (const r of game.racers) {
      if (!r.owned || r.finished || r.out || r.state === 'ready' || this.hit.has(r)) continue;
      if (r.d > front || r.d < front - 14 || r.d < this.d0 - 5) continue;
      if (Math.abs(r.pos.x - c.cx(r.d)) > c.halfWidth(r.d) + 12) continue;
      this.hit.add(r);
      const yaw = c.headingAt(r.d);
      _v.set(-Math.sin(yaw) * 16, 9, -Math.cos(yaw) * 16);
      r.knock(_v, 2.2, null, '雪崩');
    }
    // 画面
    const p = game.player;
    if (p && Math.abs(p.d - front) < 70 && this.fade > 0.5) {
      game.fx.addShake(clamp(0.5 - Math.abs(p.d - front) / 140, 0, 0.5) * dt * 6);
      if (!this.warned && p.d > front && p.d - front < 45 && !p.finished) {
        this.warned = true;
        game.tip('雪崩就在身后！', 1.5);
      }
    }
    const sc = Math.max(0, this.fade);
    for (let i = 0; i < this.puffs.length; i++) {
      const q = this.puffs[i];
      const d = front - q.back;
      const w = c.halfWidth(d) + 9;
      const x = c.cx(d) + q.u * w;
      const z = -d;
      const bob = Math.sin(t * 5 + q.ph) * 0.5;
      _v.set(x, c.height(x, z) + q.r * 0.55 + bob, z);
      _q.setFromEuler(_e.set(t * 3 + q.ph, q.ph, 0));
      _m.compose(_v, _q, _s.setScalar(q.r * sc * (1 - 0.35 * smooth(4, 26, q.back))));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (game.nearCamera(_v.set(c.cx(front), c.height(c.cx(front), -front), -front), 160) && sc > 0.3) {
      for (let n = 0; n < 3; n++) {
        const u = Math.random() * 2 - 1;
        const x = c.cx(front) + u * (c.halfWidth(front) + 8);
        const y = c.height(x, -front);
        game.fx.snowBurst(_v.set(x, y + 1, -front), 4, 7);
      }
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// 雪地摩托：在同一个位置来回横穿雪道
class Snowmobile {
  constructor(game, m) {
    this.game = game;
    this.c = game.course;
    this.d = m.d;
    this.period = m.period;
    this.phase = m.phase;
    this.dir = m.dir;
    this.cool = new Map();
    this.warned = false;
    this.prevX = null;
    const g = (this.mesh = new THREE.Group());
    const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: e || 0x000000 });
    this.mats = [mat(0xff6a1f), mat(0x24272e), mat(0xd8dde4), mat(0x2f6bff), mat(0xfff1a0, 0xfff1a0)];
    const [orange, dark, metal, blue, light] = this.mats;
    this.geos = [];
    const add = (geo, m, x, y, z, rx = 0) => {
      this.geos.push(geo);
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.x = rx;
      o.castShadow = true;
      g.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(1.3, 0.7, 2.8), orange, 0, 0.75, 0);
    add(new THREE.BoxGeometry(1.1, 0.5, 1.2), dark, 0, 1.25, 0.5);
    add(new THREE.BoxGeometry(1.2, 0.6, 0.08), blue, 0, 1.35, -0.75, -0.5);
    add(new THREE.BoxGeometry(1.4, 0.35, 1.6), dark, 0, 0.3, 0.6);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.18, 0.1, 1.8), metal, s * 0.6, 0.12, -1.0);
    add(new THREE.BoxGeometry(0.35, 0.2, 0.1), light, 0, 0.85, -1.42);
    // 车手
    add(new THREE.BoxGeometry(0.7, 0.8, 0.5), blue, 0, 1.9, 0.45);
    add(new THREE.SphereGeometry(0.32, 8, 6), orange, 0, 2.55, 0.4);
    this.dummy = g;
    game.scene.add(g);
  }

  // 0~1~0 来回，两头各停一会儿
  offsetAt(t) {
    const q = (((t / this.period + this.phase) % 1) + 1) % 1;
    let s;
    if (q < 0.4) s = smooth(0, 0.4, q);
    else if (q < 0.5) s = 1;
    else if (q < 0.9) s = 1 - smooth(0.5, 0.9, q);
    else s = 0;
    const w = this.c.halfWidth(this.d) + 14;
    return (s * 2 - 1) * w * this.dir;
  }

  update(dt, t) {
    const game = this.game;
    const c = this.c;
    const x = c.cx(this.d) + this.offsetAt(t);
    const z = -this.d;
    const vx = this.prevX === null ? 0 : (x - this.prevX) / Math.max(dt, 1e-3);
    this.prevX = x;
    const moving = Math.abs(vx) > 0.5;
    this.mesh.position.set(x, c.surfaceY(x, z) + 0.05, z);
    if (moving) this.mesh.rotation.y = vx > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.mesh.position.y += moving ? Math.abs(Math.sin(t * 18)) * 0.08 : 0;
    if (moving && game.nearCamera(this.mesh.position, 120) && Math.random() < 0.7) {
      game.fx.spray(x - Math.sign(vx) * 1.5, this.mesh.position.y + 0.2, z, -vx * 0.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.1);
    }
    const p = game.player;
    if (!this.warned && p && p.d > this.d - 90 && p.d < this.d - 40) {
      this.warned = true;
      game.tip('⚠ 前方有雪地摩托横穿！', 1.6);
    }
    if (!moving) return;
    for (const r of game.racers) {
      if (!r.owned || r.finished || r.out || r.state !== 'ski') continue;
      const cd = this.cool.get(r) || 0;
      if (cd > t) continue;
      const dx = r.pos.x - x;
      const dz = r.pos.z - z;
      if (dx * dx + dz * dz < 2.3 * 2.3 && Math.abs(r.pos.y - this.mesh.position.y) < 2.5) {
        this.cool.set(r, t + 1.5);
        _v.set(Math.sign(vx) * 14, 9, -6);
        if (r.knock(_v, 1.5, null, '雪地摩托')) game.sfxAt('thud', r.pos, 1);
      }
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}

// 滚石：每隔一段时间从一侧山坡滚下一块大石头，斜着穿过雪道
const ROLL_T = 5.5;
class Boulder {
  constructor(game, m) {
    this.game = game;
    this.c = game.course;
    this.d = m.d;
    this.period = m.period;
    this.phase = m.phase;
    this.dir = m.dir;
    this.R = 2.3;
    this.cool = new Map();
    this.warned = false;
    this.lastCycle = -1;
    this.geo = new THREE.DodecahedronGeometry(this.R, 0);
    this.mat = new THREE.MeshLambertMaterial({ color: game.theme.rock, flatShading: true });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
  }

  update(dt, t) {
    const game = this.game;
    const c = this.c;
    const T = t + this.phase * this.period;
    const cycle = Math.floor(T / this.period);
    const tc = T - cycle * this.period;
    if (tc > ROLL_T || t <= 0) {
      this.mesh.visible = false;
      return;
    }
    // 单数轮从另一侧滚下来
    const s = cycle % 2 ? -this.dir : this.dir;
    const da = this.d - 22;
    const db = this.d + 30;
    this.a.set(c.cx(da) + s * (c.halfWidth(da) + 26), 0, -da);
    this.b.set(c.cx(db) - s * (c.halfWidth(db) + 26), 0, -db);
    const k = tc / ROLL_T;
    const x = this.a.x + (this.b.x - this.a.x) * k;
    const z = this.a.z + (this.b.z - this.a.z) * k;
    const y = c.height(x, z) + this.R * 0.85;
    const m = this.mesh;
    m.visible = true;
    const vx = (this.b.x - this.a.x) / ROLL_T;
    const vz = (this.b.z - this.a.z) / ROLL_T;
    const sp = Math.hypot(vx, vz);
    m.position.set(x, y, z);
    _v.set(vz, 0, -vx).normalize();
    _q.setFromAxisAngle(_v, -(sp * dt) / this.R);
    m.quaternion.premultiply(_q);
    if (cycle !== this.lastCycle) {
      this.lastCycle = cycle;
      this.cool.clear();
    }
    if (game.nearCamera(m.position, 140) && Math.random() < 0.5) {
      game.fx.spray(x, y - this.R * 0.8, z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.16);
    }
    const p = game.player;
    if (!this.warned && p && p.d > this.d - 100 && p.d < this.d - 50) {
      this.warned = true;
      game.tip('⚠ 小心落石！', 1.5);
    }
    for (const r of game.racers) {
      if (!r.owned || r.finished || r.out || r.state !== 'ski' || this.cool.has(r)) continue;
      const dx = r.pos.x - x;
      const dz = r.pos.z - z;
      if (dx * dx + dz * dz < (this.R + 0.8) ** 2 && Math.abs(r.pos.y + 0.8 - y) < this.R + 1.5) {
        this.cool.set(r, true);
        _v.set(vx, 0, vz).normalize().multiplyScalar(12).setY(10);
        if (r.knock(_v, 1.6, null, '滚石')) game.sfxAt('thud', r.pos, 1);
      }
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class Hazards {
  constructor(game) {
    const c = game.course;
    this.list = [];
    for (const a of c.avalanches) this.list.push(new Avalanche(game, a));
    for (const m of c.movers) this.list.push(m.type === 'boulder' ? new Boulder(game, m) : new Snowmobile(game, m));
  }

  update(dt, t) {
    for (const h of this.list) h.update(dt, t);
  }

  dispose() {
    for (const h of this.list) h.dispose();
    this.list = [];
  }
}

export const NO_HAZARDS = { list: [], update() {}, dispose() {} };
