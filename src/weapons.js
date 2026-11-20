// 道具箱 + 16 种武器 + 野鹿
import * as THREE from 'three';
import { WEAPONS, WEAPON_KEYS } from './config.js';
import { clamp, damp, lerp, wrapAngle, pickWeighted } from './util.js';
import { buildRocket, buildMine, buildDynamite, buildQuadruped, animateQuadruped, buildJet } from './props.js';
import { COL } from './fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const FREEZE_R = 5; // 冰爆半径
const FREEZE_TIME = 2.6;
const EVADE_R = 55; // 追踪导弹离多近时，漂移喷射 / 空中动作能把它甩掉
// 加特林：一次扣扳机扫一梭子
const GAT_TIME = 1.25; // 一梭子打多久
const GAT_RATE = 16; // 每秒几发
const GAT_RANGE = 110;
const GAT_HITS = 4; // 同一个人挨几发才会被打翻
const GAT_TRACER = 6; // 曳光弹的长度
const GAT_SPEED = 160; // 曳光弹飞多快

// b 是不是 a 的道具该打的对象：不是自己、没被淘汰、不是队友
const foe = (a, b) => b !== a && !b.out && !(a && a.isAlly(b));

// ---------------- 道具箱 ----------------
export class Items {
  constructor(game) {
    this.game = game;
    this.spots = game.course.itemSpots.map((s) => ({ ...s, d: -s.z, active: true, t: 0, pop: 1 }));
    const n = Math.max(1, this.spots.length);
    this.bubble = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x7f8cff, transparent: true, opacity: 0.42, depthWrite: false, fog: false }),
      n
    );
    this.core = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0xaa6a00, flatShading: true }),
      n
    );
    this.bubble.frustumCulled = false;
    this.core.frustumCulled = false;
    this.bubble.count = this.spots.length;
    this.core.count = this.spots.length;
    this.t = 0;
    game.scene.add(this.bubble, this.core);
    this.update(0);
  }

  nearestAhead(pos, d, range) {
    let best = null;
    let bestScore = 1e9;
    for (const s of this.spots) {
      if (!s.active) continue;
      const dd = s.d - d;
      if (dd < 5 || dd > range) continue;
      const lat = Math.abs(s.x - pos.x);
      if (lat > dd * 0.6 + 3) continue;
      const score = dd * 0.4 + lat;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  update(dt) {
    this.t += dt;
    const game = this.game;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.active) {
        s.t -= dt;
        if (s.t <= 0) {
          s.active = true;
          s.pop = 0;
        }
      } else {
        s.pop = Math.min(1, s.pop + dt * 3);
        for (const r of game.racers) {
          // 联机时只判定本机负责的选手，别人捡到了会发消息过来（见 take）
          if (!r.owned || r.weapon || r.finished || r.out || r.state === 'ready') continue;
          const dx = r.pos.x - s.x;
          const dz = r.pos.z - s.z;
          if (dx * dx + dz * dz < 6.2 && Math.abs(r.pos.y + 0.8 - s.y) < 3.2) {
            s.active = false;
            s.t = game.itemRespawn || 6;
            game.weapons.grant(r);
            game.fx.ring(_v.set(s.x, s.y - 1, s.z), 3, 0x9aa6ff, 0.3);
            game.net.ev('pick', { s: i });
            break;
          }
        }
      }
      const sc = s.active ? s.pop : 0;
      const bob = Math.sin(this.t * 2.2 + i) * 0.18;
      _v.set(s.x, s.y + bob, s.z);
      _q.setFromEuler(_e.set(0, this.t * 1.6 + i, 0));
      _m.compose(_v, _q, _s.setScalar(1.05 * sc));
      this.bubble.setMatrixAt(i, _m);
      _q.setFromEuler(_e.set(this.t * 1.3 + i, this.t * 2.1, 0));
      _m.compose(_v, _q, _s.setScalar(sc));
      this.core.setMatrixAt(i, _m);
    }
    this.bubble.instanceMatrix.needsUpdate = true;
    this.core.instanceMatrix.needsUpdate = true;
  }

  // 联机：别的玩家捡走了第 i 个道具箱
  take(i) {
    const s = this.spots[i];
    if (!s || !s.active) return;
    s.active = false;
    s.t = this.game.itemRespawn || 6;
    if (this.game.nearCamera(_v.set(s.x, s.y - 1, s.z), 200)) this.game.fx.ring(_v, 3, 0x9aa6ff, 0.3);
  }

  dispose() {
    for (const m of [this.bubble, this.core]) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

// ---------------- 实体 ----------------
function disposeObj(o) {
  o.removeFromParent();
}

class Projectile {
  // ex：联机时别人开火带过来的数据（这里是追踪目标）；本机开火时为 null
  constructor(W, owner, kind, ex) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.kind = kind;
    this.pos = W.muzzle(owner, new THREE.Vector3());
    this.dir = W.aim(owner, new THREE.Vector3());
    const base = Math.max(owner.speed, 12);
    this.speed = base + { rocket: 62, homing: 34, snowball: 46, freeze: 55 }[kind];
    this.life = { rocket: 3, homing: 6.5, snowball: 2.2, freeze: 2.4 }[kind];
    this.age = 0;
    this.target = kind !== 'homing' ? null : ex ? W.byIdx(ex.tg) : W.targetAhead(owner);
    this.smokeT = 0;
    if (kind === 'rocket' || kind === 'homing') {
      this.mesh = buildRocket(kind === 'homing' ? 0xffd23c : 0xe8eaee);
      this.mesh.scale.setScalar(1.6);
    } else if (kind === 'snowball') {
      // 大雪球：差不多半人高，一路滚一路掉雪渣
      this.R = 0.8;
      this.mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(this.R, 1),
        new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x7f96c4, emissiveIntensity: 0.35, flatShading: true })
      );
      this.mesh.castShadow = true;
      this.mesh.scale.setScalar(0.35);
      this.ownGeo = true;
    } else {
      // 冰晶弹：一根发蓝光的大冰锥，里面一条白芯
      this.R = 0.5;
      this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0x1f9cff, transparent: true, opacity: 0.9, fog: false }));
      this.mesh.scale.set(1.3, 1.3, 4.2);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      this.mesh.add(core);
      this.ownGeo = true;
    }
    this.game.scene.add(this.mesh);
  }

  update(dt) {
    const game = this.game;
    const course = game.course;
    const steps = 3;
    const h = dt / steps;
    this.age += dt;
    this.life -= dt;
    for (let s = 0; s < steps; s++) {
      if (this.kind === 'homing' && this.target && !this.target.finished && !this.target.out) {
        _v.copy(this.target.pos);
        _v.y += 0.9;
        _v.sub(this.pos).normalize();
        this.dir.lerp(_v, damp(3 + this.age * 2.5, h)).normalize();
      }
      if (this.kind === 'snowball') this.dir.y -= 0.12 * h;
      this.pos.addScaledVector(this.dir, this.speed * h);
      const gh = course.height(this.pos.x, this.pos.z);
      const skim = this.kind === 'homing' ? 0.9 : this.kind === 'snowball' ? this.R + 0.1 : 0.75;
      if (this.pos.y < gh + skim) {
        if (gh + 0.75 - this.pos.y > 1.6) return this.hit(null);
        this.pos.y = gh + skim;
        if (this.dir.y < 0) this.dir.y *= 0.5;
        this.dir.normalize();
      }
      for (const r of game.racers) {
        if (!foe(this.owner, r) || r.state === 'ready') continue;
        const dx = r.pos.x - this.pos.x;
        const dy = r.pos.y + 0.8 - this.pos.y;
        const dz = r.pos.z - this.pos.z;
        if (dx * dx + dy * dy + dz * dz < (this.kind === 'snowball' ? 6.2 : 4.4)) return this.hit(r);
      }
      let blocked = false;
      if (this.pos.y - gh < 7) {
        course.forObstacles(-this.pos.z, 12, (o) => {
          const dx = o.x - this.pos.x;
          const dz = o.z - this.pos.z;
          const rr = o.r + (this.kind === 'snowball' ? 0.6 : 0.3);
          if (dx * dx + dz * dz < rr * rr) blocked = true;
        });
      }
      if (blocked) return this.hit(null);
    }
    if (this.life <= 0) return this.hit(null);
    this.mesh.position.copy(this.pos);
    if (this.kind === 'snowball') {
      // 出手时从小变大，然后朝前滚
      this.mesh.scale.setScalar(Math.min(1, 0.35 + this.age * 6));
      _v.set(this.dir.z, 0, -this.dir.x).normalize();
      this.mesh.rotateOnWorldAxis(_v, 13 * dt);
      if (this.age > 0.12) {
        game.fx.spray(this.pos.x - this.dir.x * 1.2 + (Math.random() - 0.5) * 0.8, this.pos.y - 0.3 + (Math.random() - 0.5) * 0.6, this.pos.z - this.dir.z * 1.2 + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.08);
      }
      return true;
    }
    _v.copy(this.pos).add(this.dir);
    this.mesh.lookAt(_v);
    if (this.kind === 'freeze') {
      // 冰锥自转 + 身后拖一条又粗又长的冰雾尾巴
      this.mesh.rotateZ(this.age * 14);
      const step = this.speed * dt;
      for (let i = 0; i < 4; i++) {
        const k = (i / 4) * step + 1.5;
        game.fx.glow.spawn(this.pos.x - this.dir.x * k + (Math.random() - 0.5) * 0.3, this.pos.y - this.dir.y * k + (Math.random() - 0.5) * 0.3, this.pos.z - this.dir.z * k + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.3 + Math.random() * 0.2, 0.38, 0.05, i % 2 ? COL.ice0 : COL.ice1, COL.ice2, 0, 0);
      }
      game.fx.lit.spawn(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.14, 0.05, COL.ice0, COL.ice1, 14, 0.5);
      return true;
    }
    if (this.kind === 'rocket' || this.kind === 'homing') {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.025;
        _v.copy(this.pos).addScaledVector(this.dir, -1);
        game.fx.smokeTrail(_v, 0.22);
        game.fx.flame(_v, -this.dir.x * 6, -this.dir.y * 6, -this.dir.z * 6, 0.26);
      }
    }
    return true;
  }

  hit(r) {
    const W = this.W;
    const game = this.game;
    const name = WEAPONS[this.kind].name;
    if (this.kind === 'rocket') W.explode(this.pos, 9, this.owner, name);
    else if (this.kind === 'homing') W.explode(this.pos, 7.5, this.owner, name);
    else if (this.kind === 'snowball') {
      // 大雪球砸开：一大团雪 + 几块大雪坨
      game.fx.snowBurst(this.pos, 22, 10);
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.28;
        game.fx.lit.spawn(this.pos.x, this.pos.y, this.pos.z, Math.cos(a) * (3 + Math.random() * 5), 3 + Math.random() * 5, Math.sin(a) * (3 + Math.random() * 5),
          0.6 + Math.random() * 0.4, 0.42, 0.2, COL.snow, COL.snow2, 22, 0.5);
      }
      game.sfxAt('thud', this.pos, 1);
      if (r) {
        _v.copy(this.dir).setY(0).normalize().multiplyScalar(8).setY(6.5);
        r.knock(_v, 1.1, this.owner, name);
      }
    } else {
      // 冰爆：炸点周围一圈都会被冻住，地上窜出一丛冰刺
      const R = FREEZE_R;
      const p = _v2.copy(this.pos);
      const gh = game.course.height(p.x, p.z);
      const low = p.y - gh < 4;
      if (low) p.y = gh;
      game.fx.iceBlast(p, R, low ? (x, z) => game.course.height(x, z) : null);
      game.sfxAt('freeze', this.pos, 1);
      game.shakeAt(this.pos, 5);
      const c = this.pos.clone();
      for (const o of game.racers) {
        if (!foe(this.owner, o) || o.state === 'ready') continue;
        if (o === r || _v.copy(o.pos).setY(o.pos.y + 0.8).distanceToSquared(c) < R * R) o.freeze(FREEZE_TIME, this.owner);
      }
    }
    return false;
  }

  dispose() {
    disposeObj(this.mesh);
    if (this.ownGeo) {
      this.mesh.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
  }
}

class Dynamite {
  constructor(W, owner) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.pos = W.muzzle(owner, new THREE.Vector3());
    this.vel = W.aim(owner, new THREE.Vector3()).multiplyScalar(Math.max(owner.speed, 12) + 24);
    this.vel.y += 9;
    this.fuse = 1.6;
    this.mesh = buildDynamite();
    this.mesh.scale.setScalar(1.8);
    this.game.scene.add(this.mesh);
  }

  update(dt) {
    const game = this.game;
    this.fuse -= dt;
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const gh = game.course.height(this.pos.x, this.pos.z) + 0.3;
    if (this.pos.y < gh) {
      this.pos.y = gh;
      game.course.normal(this.pos.x, this.pos.z, _v);
      const vn = this.vel.dot(_v);
      if (vn < 0) this.vel.addScaledVector(_v, -vn * 1.45);
      this.vel.multiplyScalar(0.8);
    }
    let boom = this.fuse <= 0;
    for (const r of game.racers) {
      if (!foe(this.owner, r) || r.state === 'ready') continue;
      if (_v.copy(r.pos).setY(r.pos.y + 0.8).distanceToSquared(this.pos) < 4.5) boom = true;
    }
    if (boom) {
      this.W.explode(this.pos, 8.5, this.owner, WEAPONS.dynamite.name);
      return false;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 11;
    this.mesh.rotation.z += dt * 7;
    if (Math.random() < 0.5) game.fx.glow.spawn(this.pos.x, this.pos.y + 0.4, this.pos.z, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 0.2, 0.08, 0.03, COL.spark, COL.fire1, 10, 0);
    return true;
  }

  dispose() {
    disposeObj(this.mesh);
  }
}

class Mine {
  constructor(W, owner) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.isMine = true;
    this.triggered = 0;
    const f = W.flat(owner, _v);
    const x = owner.pos.x - f.x * 3;
    const z = owner.pos.z - f.z * 3;
    this.pos = new THREE.Vector3(x, this.game.course.height(x, z), z);
    this.age = 0;
    this.mesh = buildMine();
    this.mesh.scale.setScalar(1.5);
    this.mesh.position.copy(this.pos);
    this.game.course.normal(x, z, _v2);
    this.mesh.quaternion.setFromUnitVectors(UP, _v2);
    this.game.scene.add(this.mesh);
  }

  update(dt) {
    this.age += dt;
    const light = this.mesh.userData.light;
    light.visible = Math.floor(this.age * (this.age < 0.9 ? 12 : 3)) % 2 === 0;
    if (this.triggered > 0) {
      this.triggered -= dt;
      if (this.triggered <= 0) return this.boom();
      return true;
    }
    if (this.age > 90) return this.boom();
    if (this.age < 0.9) return true;
    for (const r of this.game.racers) {
      if (r.state === 'ready' || r.finished || r.out) continue;
      if (r === this.owner && this.age < 3) continue;
      if (r !== this.owner && !foe(this.owner, r)) continue;
      const dx = r.pos.x - this.pos.x;
      const dz = r.pos.z - this.pos.z;
      if (dx * dx + dz * dz < 6.5 && Math.abs(r.pos.y - this.pos.y) < 2.5) return this.boom();
    }
    return true;
  }

  boom() {
    this.dead = true;
    this.W.explode(this.pos, 7.5, this.owner, WEAPONS.mine.name);
    return false;
  }

  dispose() {
    disposeObj(this.mesh);
    this.mesh.userData.light.geometry.dispose();
    this.mesh.userData.light.material.dispose();
  }
}

class Goat {
  constructor(W, owner, ex) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.target = ex ? W.byIdx(ex.tg) : W.targetAhead(owner);
    const f = W.flat(owner, _v);
    this.pos = new THREE.Vector3(owner.pos.x + f.x * 3.5, 0, owner.pos.z + f.z * 3.5);
    this.yaw = owner.yaw;
    this.speed = Math.max(owner.speed + 8, 30);
    this.life = 9;
    this.t = 0;
    this.bleatT = 0;
    this.mesh = buildQuadruped('goat');
    this.game.scene.add(this.mesh);
    this.game.sfxAt('bleat', this.pos, 1);
  }

  update(dt) {
    const game = this.game;
    const course = game.course;
    this.t += dt;
    this.life -= dt;
    this.speed = Math.min(54, this.speed + 22 * dt);
    let tg = this.target;
    if (!tg || tg.finished || tg.out) {
      tg = null;
      let best = 1e9;
      for (const r of game.racers) {
        if (!foe(this.owner, r) || r.finished) continue;
        const gap = r.d - -this.pos.z;
        if (gap > -5 && gap < best) {
          best = gap;
          tg = r;
        }
      }
      this.target = tg;
    }
    let want;
    if (tg) want = Math.atan2(-(tg.pos.x - this.pos.x), -(tg.pos.z - this.pos.z));
    else {
      const d = -this.pos.z + 30;
      want = Math.atan2(-(course.cx(d) - this.pos.x), 30);
    }
    this.yaw += clamp(wrapAngle(want - this.yaw), -3.2 * dt, 3.2 * dt);
    this.pos.x += -Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += -Math.cos(this.yaw) * this.speed * dt;
    this.pos.y = course.height(this.pos.x, this.pos.z);
    this.bleatT -= dt;
    if (this.bleatT <= 0) {
      this.bleatT = 1.3;
      game.sfxAt('bleat', this.pos, 0.8);
    }
    for (const r of game.racers) {
      if (!foe(this.owner, r) || r.state === 'ready' || r.finished) continue;
      const dx = r.pos.x - this.pos.x;
      const dz = r.pos.z - this.pos.z;
      if (dx * dx + dz * dz < 7 && Math.abs(r.pos.y - this.pos.y) < 4) return this.boom();
    }
    if (this.life <= 0 || -this.pos.z > course.L + 40) return this.boom();
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.abs(Math.sin(this.t * 22)) * 0.25;
    this.mesh.rotation.y = this.yaw;
    animateQuadruped(this.mesh, this.t, this.speed);
    if (Math.random() < 0.6) game.fx.spray(this.pos.x, this.pos.y + 0.2, this.pos.z, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 0.12);
    return true;
  }

  boom() {
    _v.copy(this.pos);
    _v.y += 0.8;
    this.W.explode(_v, 9.5, this.owner, WEAPONS.goat.name);
    return false;
  }

  dispose() {
    disposeObj(this.mesh);
  }
}

class Airstrike {
  // spec：联机时别人算好的落点 { dc, xs }，照着炸，各端红圈位置才一致
  constructor(W, owner, target, spec) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    const course = this.game.course;
    const lead = 1.9;
    const given = !!spec && Number.isFinite(spec.dc) && Array.isArray(spec.xs) && spec.xs.length === 6 && spec.xs.every(Number.isFinite);
    const dc = given ? clamp(spec.dc, 30, course.L - 10) : clamp(target.d + Math.max(20, target.speed) * lead, 30, course.L - 10);
    const lat = clamp(target.pos.x - course.cx(target.d), -course.halfWidth(dc), course.halfWidth(dc)) * 0.7;
    this.dc = dc;
    this.spec = { dc: Math.round(dc * 10) / 10, xs: [] };
    this.t = 0;
    this.delay = lead;
    this.bombs = [];
    this.markGeo = new THREE.RingGeometry(0.75, 1, 28);
    this.markGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const d = dc + (i - 2.5) * 12;
      const x = given ? spec.xs[i] : Math.round((course.cx(d) + lat + (Math.random() - 0.5) * 9) * 10) / 10;
      this.spec.xs.push(x);
      const z = -d;
      const pos = new THREE.Vector3(x, course.height(x, z), z);
      const mark = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      mark.position.copy(pos);
      mark.position.y += 0.5;
      mark.scale.setScalar(6);
      this.game.scene.add(mark);
      this.bombs.push({ pos, mark, at: lead + i * 0.13, done: false });
    }
    this.jet = buildJet();
    this.jet.scale.setScalar(1.5);
    this.game.scene.add(this.jet);
    this.jetSpeed = 230;
    this.smokeT = 0;
    this.game.sfxAt('jet', target.pos, 1);
    this.updateJet();
  }

  updateJet() {
    const course = this.game.course;
    const d = this.dc + (this.t - this.delay) * this.jetSpeed;
    const dcl = clamp(d, -130, course.D1);
    this.jet.position.set(course.cx(dcl), course.elev(dcl) + 42 + Math.max(0, d - this.dc) * 0.12, -d);
    this.jet.rotation.z = Math.sin(this.t * 1.5) * 0.25;
    this.jet.rotation.x = Math.atan(course.slope(dcl)) * -0.6;
    return d;
  }

  update(dt) {
    this.t += dt;
    const d = this.updateJet();
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.03;
      _v.copy(this.jet.position);
      _v.z += 14;
      this.game.fx.smokeTrail(_v, 1.1);
    }
    let pending = false;
    for (const b of this.bombs) {
      if (b.done) continue;
      pending = true;
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 22);
      b.mark.material.opacity = pulse;
      b.mark.scale.setScalar(6 * (1 - 0.35 * Math.min(1, this.t / b.at)));
      if (this.t >= b.at) {
        b.done = true;
        b.mark.removeFromParent();
        b.mark.material.dispose();
        this.W.explode(b.pos, 9, this.owner, WEAPONS.airstrike.name);
      }
    }
    return pending || d < this.dc + 700;
  }

  dispose() {
    for (const b of this.bombs) {
      if (!b.done) {
        b.mark.removeFromParent();
        b.mark.material.dispose();
      }
    }
    this.markGeo.dispose();
    disposeObj(this.jet);
  }
}

const STRIKE_LOCK = 0.55; // 雷击最后这么久不再跟着人走，劈在按速度预判的落点上
const STRIKE_R = 2.6; // 离落点多近会被劈中

class Strike {
  constructor(W, owner, target, delay) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.target = target;
    this.t = delay;
    this.isStrike = true;
    this.spot = null;
    this.geo = new THREE.RingGeometry(0.8, 1, 24);
    this.geo.rotateX(-Math.PI / 2);
    this.mark = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.game.scene.add(this.mark);
  }

  update(dt) {
    this.t -= dt;
    const tg = this.target;
    if (!this.spot && this.t <= STRIKE_LOCK) {
      const s = (this.spot = new THREE.Vector3()).copy(tg.pos).addScaledVector(tg.vel, Math.max(0, this.t));
      s.y = this.game.course.height(s.x, s.z);
      this.mark.material.color.setHex(0xff4a3d);
    }
    const at = this.spot || tg.pos;
    this.mark.position.copy(at);
    this.mark.position.y += 0.4;
    this.mark.scale.setScalar(this.spot ? (STRIKE_R / 0.9) * (1 + Math.max(0, this.t)) : 1.5 + this.t * 5);
    if (this.t <= 0) {
      this.game.fx.lightning(at);
      this.game.sfxAt('thunder', at, 1);
      this.game.shakeAt(at, 7);
      const dx = tg.pos.x - at.x;
      const dz = tg.pos.z - at.z;
      if (dx * dx + dz * dz < STRIKE_R * STRIKE_R) {
        _v.set((Math.random() - 0.5) * 8, 10, (Math.random() - 0.5) * 8);
        tg.knock(_v, 1.3, this.owner, WEAPONS.lightning.name);
      }
      return false;
    }
    return true;
  }

  dispose() {
    this.mark.removeFromParent();
    this.geo.dispose();
    this.mark.material.dispose();
  }
}

class Rope {
  constructor(W, owner) {
    this.game = W.game;
    this.owner = owner;
    this.geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffd23c, fog: false }));
    this.game.scene.add(this.mesh);
  }

  update() {
    const o = this.owner;
    if (o.hookT <= 0 || !o.hookTarget || o.state !== 'ski') {
      o.hookT = 0;
      return false;
    }
    _v.copy(o.pos);
    _v.y += 1;
    _v2.copy(o.hookTarget.pos);
    _v2.y += 0.9;
    const len = _v.distanceTo(_v2);
    this.mesh.position.copy(_v).add(_v2).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, _v2.sub(_v).normalize());
    this.mesh.scale.set(1, len, 1);
    return true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

class BigBall {
  constructor(W, owner) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    this.R = 2.4;
    const f = W.flat(owner, _v);
    this.pos = new THREE.Vector3(owner.pos.x + f.x * 6, 0, owner.pos.z + f.z * 6);
    this.yaw = owner.yaw;
    this.speed = Math.max(owner.speed + 6, 28);
    this.life = 8;
    this.geo = new THREE.IcosahedronGeometry(this.R, 1);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    this.mesh.castShadow = true;
    this.game.scene.add(this.mesh);
    this.cool = new Map();
  }

  update(dt) {
    const game = this.game;
    const course = game.course;
    this.life -= dt;
    this.speed = Math.min(50, this.speed + 14 * dt);
    const myD = -this.pos.z;
    let tg = null;
    let best = 90;
    for (const r of game.racers) {
      if (!foe(this.owner, r) || r.finished) continue;
      const gap = r.d - myD;
      if (gap > 2 && gap < best) {
        best = gap;
        tg = r;
      }
    }
    let want;
    if (tg) want = Math.atan2(-(tg.pos.x - this.pos.x), -(tg.pos.z - this.pos.z));
    else want = Math.atan2(-(course.cx(myD + 30) - this.pos.x), 30);
    this.yaw += clamp(wrapAngle(want - this.yaw), -1.3 * dt, 1.3 * dt);
    const dx = -Math.sin(this.yaw) * this.speed * dt;
    const dz = -Math.cos(this.yaw) * this.speed * dt;
    this.pos.x += dx;
    this.pos.z += dz;
    this.pos.y = course.height(this.pos.x, this.pos.z) + this.R * 0.9;
    _v.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    _q.setFromAxisAngle(_v, (this.speed * dt) / this.R);
    this.mesh.quaternion.premultiply(_q);
    this.mesh.position.copy(this.pos);
    for (const r of game.racers) {
      if (!foe(this.owner, r) || r.state === 'ready' || r.finished) continue;
      const cd = this.cool.get(r) || 0;
      if (cd > 0) {
        this.cool.set(r, cd - dt);
        continue;
      }
      const rx = r.pos.x - this.pos.x;
      const rz = r.pos.z - this.pos.z;
      if (rx * rx + rz * rz < (this.R + 0.8) ** 2 && Math.abs(r.pos.y + 1 - this.pos.y) < this.R + 1.5) {
        _v.set(rx, 0, rz).normalize().multiplyScalar(9);
        _v.x += -Math.sin(this.yaw) * 6;
        _v.z += -Math.cos(this.yaw) * 6;
        _v.y = 10;
        r.knock(_v, 1.6, this.owner, WEAPONS.bigball.name);
        game.sfxAt('thud', this.pos, 1);
        this.cool.set(r, 2);
      }
    }
    if (Math.random() < 0.7) game.fx.spray(this.pos.x + (Math.random() - 0.5) * 3, this.pos.y - this.R * 0.8, this.pos.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, 4, (Math.random() - 0.5) * 5, 0.18);
    if (this.life <= 0 || myD > course.L + 30) {
      game.fx.snowBurst(this.pos, 26, 12);
      game.sfxAt('thud', this.pos, 1);
      return false;
    }
    return true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

// 加特林的一梭子：枪口跟着人转，边滑边扫
class Gatling {
  constructor(W, owner) {
    this.W = W;
    this.game = W.game;
    this.owner = owner;
    owner.gatFiring = true;
    this.t = 0;
    this.shotT = 0.1; // 枪管先转起来再出子弹
    this.done = false;
    this.hits = new Map();
    this.tracers = [];
    this.a = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.geo = new THREE.CylinderGeometry(1, 1, 1, 5);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xff9a14, fog: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, 48);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.game.scene.add(this.mesh);
  }

  stop() {
    if (this.done) return;
    this.done = true;
    const o = this.owner;
    o.gatFiring = false;
    if (o.weapon === 'gatling') o.consumeAmmo();
  }

  shoot() {
    const W = this.W;
    const game = this.game;
    const course = game.course;
    const o = this.owner;
    const right = this.right.set(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
    const a = o.skier.gatMuzzle.getWorldPosition(this.a);
    const dir = W.aim(o, this.dir);
    // 左右由人自己瞄；上下自动对准正前方最近的那个对手（坡有起伏，不然老是打高打低）
    let near = 1e9;
    let pitch = null;
    for (const r of game.racers) {
      if (!foe(o, r) || r.state === 'ready' || r.finished) continue;
      const rx = r.pos.x - a.x;
      const rz = r.pos.z - a.z;
      const fwd = -Math.sin(o.yaw) * rx - Math.cos(o.yaw) * rz;
      const lat = right.x * rx + right.z * rz;
      if (fwd > 4 && fwd < GAT_RANGE && fwd < near && Math.abs(lat) < 2.5 + fwd * 0.07) {
        near = fwd;
        pitch = (r.pos.y + 0.9 - a.y) / fwd;
      }
    }
    if (pitch !== null) {
      W.flat(o, dir);
      dir.y = clamp(pitch, -0.9, 0.6);
    }
    dir.addScaledVector(right, (Math.random() - 0.5) * 0.06);
    dir.y += (Math.random() - 0.5) * 0.03;
    dir.normalize();

    // 打到地面为止
    let len = GAT_RANGE;
    let ground = false;
    for (let t = 5; t < GAT_RANGE; t += 5) {
      _v.copy(a).addScaledVector(dir, t);
      if (_v.y < course.height(_v.x, _v.z) - 0.2) {
        len = t - 2.5;
        ground = true;
        break;
      }
    }
    // 子弹停在第一个挡路的人身上
    let victim = null;
    for (const r of game.racers) {
      if (!foe(o, r) || r.state === 'ready' || r.finished) continue;
      _v.copy(r.pos);
      _v.y += 0.9;
      _v.sub(a);
      const t = _v.dot(dir);
      if (t < 1 || t > len) continue;
      _v.addScaledVector(dir, -t);
      if (_v.lengthSq() < 3) {
        len = t;
        victim = r;
        ground = false;
      }
    }
    // 打中谁在开枪这一刻就定了，等曳光弹飞到了再结算，画面和结果对得上
    this.tracers.push({ x: a.x, y: a.y, z: a.z, dx: dir.x, dy: dir.y, dz: dir.z, len, s: 1 + Math.random() * 2, ground, victim, landed: false });

    // 枪口火光（一大一小两团，忽大忽小）、抛壳、后坐力
    const fs = 0.4 + Math.random() * 0.3;
    game.fx.glow.spawn(a.x + dir.x * 0.3, a.y + dir.y * 0.3, a.z + dir.z * 0.3, o.vel.x, o.vel.y, o.vel.z, 0.07, fs, fs * 0.4, COL.fire0, COL.fire1, 0, 0);
    game.fx.glow.spawn(a.x + dir.x * 0.8, a.y + dir.y * 0.8, a.z + dir.z * 0.8, o.vel.x, o.vel.y, o.vel.z, 0.05, fs * 0.55, fs * 0.2, COL.frost, COL.fire0, 0, 0);
    game.fx.glow.spawn(a.x - dir.x * 1.1, a.y + 0.1, a.z - dir.z * 1.1, o.vel.x * 0.6 + right.x * (3 + Math.random() * 3), 3 + Math.random() * 3, o.vel.z * 0.6 + right.z * (3 + Math.random() * 3),
      0.55, 0.06, 0.06, COL.spark, COL.brass, 22, 0);
    game.sfxAt(W.snd('gat', 'shot'), o.pos, 0.6);
    W.flat(o, _v);
    o.vel.addScaledVector(_v, -0.1);
    if (o.isPlayer) game.fx.addShake(0.16);
  }

  // 一发曳光弹飞到头了
  land(tr) {
    const game = this.game;
    const victim = tr.victim;
    if (!victim) {
      if (tr.ground) {
        _v.set(tr.x + tr.dx * tr.len, tr.y + tr.dy * tr.len, tr.z + tr.dz * tr.len);
        if (game.nearCamera(_v, 170)) game.fx.snowBurst(_v, 4, 5);
      }
      return;
    }
    const n = (this.hits.get(victim) || 0) + 1;
    this.hits.set(victim, n);
    const p = victim.pos;
    for (let i = 0; i < 5; i++) {
      game.fx.glow.spawn(p.x, p.y + 0.9, p.z, (Math.random() - 0.5) * 12, 2 + Math.random() * 7, (Math.random() - 0.5) * 12, 0.2 + Math.random() * 0.15, 0.2, 0.05, COL.fire0, COL.fire1, 16, 1);
    }
    if (n >= GAT_HITS) {
      _v.set(tr.dx, 0, tr.dz).normalize().multiplyScalar(6).setY(7.5);
      // 打翻之后这一梭子不再重复结算；被护盾或无敌挡掉的话，后面几发接着算
      if (victim.knock(_v, 1.3, this.owner, WEAPONS.gatling.name)) this.hits.set(victim, -99);
    } else if (n > 0 && victim.state === 'ski' && victim.invulnT <= 0 && victim.shieldT <= 0) {
      // 还没打翻：每中一发踉跄一下、掉点速度
      const k = (Math.random() - 0.5) * 2.4;
      victim.vel.multiplyScalar(0.95);
      victim.vel.x += -tr.dz * k;
      victim.vel.z += tr.dx * k;
      game.sfxAt('thud', p, 0.35);
    }
  }

  update(dt) {
    const o = this.owner;
    if (!this.done) {
      // 别人的枪：他手上拿的是什么要等状态包，这里不拿它当停火的依据
      if (o.state !== 'ski' || o.frozenT > 0 || o.finished || (o.owned && o.weapon !== 'gatling')) {
        this.stop();
      } else {
        this.t += dt;
        o.skier.gatFire = true;
        this.shotT -= dt;
        while (this.shotT <= 0) {
          this.shotT += 1 / GAT_RATE;
          this.shoot();
        }
        if (this.t >= GAT_TIME) this.stop();
      }
    }
    // 曳光弹：一小段橙色光条从枪口飞到落点
    const T = this.tracers;
    let n = 0;
    for (let i = T.length - 1; i >= 0; i--) {
      const tr = T[i];
      tr.s += GAT_SPEED * dt;
      if (!tr.landed && tr.s >= tr.len) {
        tr.landed = true;
        this.land(tr);
      }
      if (tr.s - GAT_TRACER >= tr.len) T.splice(i, 1);
    }
    for (const tr of T) {
      if (n >= 48) break;
      const head = Math.min(tr.s, tr.len);
      const tail = Math.max(0, tr.s - GAT_TRACER);
      const mid = (head + tail) / 2;
      _v.set(tr.x + tr.dx * mid, tr.y + tr.dy * mid, tr.z + tr.dz * mid);
      _q.setFromUnitVectors(UP, _v2.set(tr.dx, tr.dy, tr.dz));
      _m.compose(_v, _q, _s.set(0.16, Math.max(0.05, head - tail), 0.16));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    return !this.done || T.length > 0;
  }

  dispose() {
    this.owner.gatFiring = false;
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// 野鹿：有人靠近时横穿赛道冲撞
export class Deer {
  constructor(game, spot, index = 0) {
    this.game = game;
    this.index = index;
    this.d = spot.d;
    this.side = spot.side;
    this.state = 'idle';
    this.cool = 0;
    this.t = Math.random() * 5;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.yaw = 0;
    this.mesh = buildQuadruped('deer');
    game.scene.add(this.mesh);
    this.setIdle();
  }

  edge(side) {
    const c = this.game.course;
    return c.cx(this.d) + side * (c.halfWidth(this.d) + 2.5);
  }

  setIdle() {
    const c = this.game.course;
    const x = this.edge(this.side);
    this.pos.set(x, c.height(x, -this.d), -this.d);
    this.yaw = this.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.state = 'idle';
    this.speed = 0;
  }

  // 开始横穿赛道。side：联机时房主告诉大家这头鹿从哪一侧出发
  charge(side) {
    if (side) {
      this.side = side;
      this.setIdle();
    }
    this.state = 'charge';
    this.tx = this.edge(-this.side);
    this.speed = 18;
    if (this.game.nearCamera(this.pos, 150)) this.game.tip('🦌 小心野鹿！');
  }

  update(dt) {
    const game = this.game;
    const c = game.course;
    this.t += dt;
    if (this.state === 'idle') {
      this.cool -= dt;
      // 联机时什么时候冲出来由房主决定，其他人等通知，这样大家看到的鹿是同一头
      if (this.cool <= 0 && (!game.net.active || game.net.isHost)) {
        for (const r of game.racers) {
          if (r.finished || r.out || r.state === 'ready') continue;
          const gap = this.d - r.d;
          if (gap > 12 && gap < 30 + r.speed * 2.2) {
            this.charge(0);
            game.net.ev('deer', { i: this.index, s: this.side });
            break;
          }
        }
      }
      this.mesh.userData.head.rotation.y = Math.sin(this.t * 0.8) * 0.5;
    } else {
      const dirX = Math.sign(this.tx - this.pos.x);
      this.pos.x += dirX * this.speed * dt;
      this.pos.y = c.height(this.pos.x, this.pos.z);
      this.yaw = dirX > 0 ? -Math.PI / 2 : Math.PI / 2;
      if ((this.tx - this.pos.x) * dirX <= 0) {
        this.side = -this.side;
        this.cool = 5;
        this.setIdle();
      }
      for (const r of game.racers) {
        if (r.finished || r.state !== 'ski') continue;
        const dx = r.pos.x - this.pos.x;
        const dz = r.pos.z - this.pos.z;
        if (dx * dx + dz * dz < 4.2 && Math.abs(r.pos.y - this.pos.y) < 2.5) {
          _v.set(dirX * 12, 9, -4);
          if (r.knock(_v, 1.5, null, '野鹿')) game.sfxAt('thud', this.pos, 1);
        }
      }
      this.mesh.userData.head.rotation.y = 0;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    animateQuadruped(this.mesh, this.t, this.speed);
    return true;
  }

  dispose() {
    this.mesh.removeFromParent();
  }
}

// ---------------- 武器系统 ----------------
export class Weapons {
  constructor(game) {
    this.game = game;
    this.out = {};
  }

  // 根据名次随机发放道具
  grant(r) {
    const game = this.game;
    const n = game.racers.length;
    const frac = n > 1 ? (r.rank - 1) / (n - 1) : 0.5;
    const bucket = frac < 0.2 ? 0 : frac < 0.65 ? 1 : 2;
    const banned = game.rules.banned || [];
    const entries = [];
    for (const id of WEAPON_KEYS) {
      if (banned.includes(id)) continue;
      let w = WEAPONS[id].w[bucket];
      if (n === 1 && ['boost', 'shield'].includes(id)) w = 10;
      if (w > 0) entries.push([id, w]);
    }
    if (!entries.length) return;
    const id = pickWeighted(Math.random, entries);
    r.giveWeapon(id);
    if (r.isPlayer) {
      game.sfx.pick();
      game.tip(`${WEAPONS[id].icon} 获得 ${WEAPONS[id].name}`);
    }
  }

  flat(r, out) {
    return out.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
  }

  aim(r, out) {
    this.flat(r, out);
    if (r.grounded) out.addScaledVector(r.normal, -out.dot(r.normal));
    else out.y = clamp(r.vel.y / Math.max(r.speed, 12), -0.6, 0.25);
    return out.normalize();
  }

  muzzle(r, out) {
    this.flat(r, out).multiplyScalar(1.3);
    out.add(r.pos);
    out.y += 1.1;
    return out;
  }

  targetAhead(r, maxGap = 1e9) {
    let best = null;
    let bg = maxGap;
    for (const o of this.game.racers) {
      if (!foe(r, o) || o.finished || o.state === 'ready') continue;
      const gap = o.d - r.d;
      if (gap > 0 && gap < bg) {
        bg = gap;
        best = o;
      }
    }
    return best;
  }

  byIdx(i) {
    return this.game.racers[i] || null;
  }

  // 被追踪导弹咬住时漂移喷射、空中动作落地：近处咬着他的导弹跟丢，往上偏出去
  // remote：联机时别人那边甩掉的，这里只照做一遍
  evade(r, remote = false) {
    let n = 0;
    for (const e of this.game.entities) {
      const R = remote ? EVADE_R * 1.5 : EVADE_R;
      if (e.kind !== 'homing' || e.target !== r || e.pos.distanceToSquared(r.pos) > R * R) continue;
      e.target = null;
      e.dir.y = Math.max(e.dir.y, 0) + 0.6;
      e.dir.x += (e.pos.x < r.pos.x ? -0.5 : 0.5);
      e.dir.normalize();
      n++;
    }
    if (!n || remote) return;
    if (r.owned) this.game.net.ev('evade', { i: r.idx });
    this.game.onEvade?.(r);
  }

  // 本机负责的选手使用道具
  use(r) {
    if (!r.weapon || r.state !== 'ski' || r.frozenT > 0 || r.finished) return;
    const id = r.weapon;
    // 记下扣扳机这一刻的位置和朝向，联机时别人照着它生成同样的弹体
    const s = { x: r.pos.x, y: r.pos.y, z: r.pos.z, vx: r.vel.x, vy: r.vel.y, vz: r.vel.z, yaw: r.yaw, grounded: r.grounded };
    const out = (this.out = {}); // 各武器把需要同步的东西（目标、落点）写在这里
    const ok = this[id](r, null);
    if (ok === false && !out.fired) return;
    if (ok !== false) r.consumeAmmo();
    delete out.fired;
    this.game.net.fire(r, id, s, out);
  }

  // 联机：别人的选手开火了，在本机生成一份同样的弹体。
  // 弹体在每台机器上各自飞，打没打中由被打的人那台机器说了算（见 Racer.knock）
  replicate(m) {
    const r = this.byIdx(m.i);
    if (!r || r.owned || !Object.prototype.hasOwnProperty.call(WEAPONS, m.w)) return;
    const p = m.p;
    const v = m.v;
    if (!Array.isArray(p) || !Array.isArray(v) || ![p[0], p[1], p[2], v[0], v[1], v[2], m.y].every(Number.isFinite)) return;
    // 画面上的他是 0.1 秒前的位置，开火要用他扣扳机时的真实位置：临时换上，生成完再换回来
    const keep = { x: r.pos.x, y: r.pos.y, z: r.pos.z, vx: r.vel.x, vy: r.vel.y, vz: r.vel.z, yaw: r.yaw, speed: r.speed, grounded: r.grounded };
    r.pos.set(p[0], p[1], p[2]);
    r.vel.set(v[0], v[1], v[2]);
    r.yaw = m.y;
    r.speed = Math.hypot(v[0], v[2]);
    r.grounded = !!m.g;
    if (r.grounded) this.game.course.normal(p[0], p[2], r.normal);
    this.out = {};
    try {
      this[m.w](r, m.ex && typeof m.ex === 'object' ? m.ex : {});
    } finally {
      r.pos.set(keep.x, keep.y, keep.z);
      r.vel.set(keep.vx, keep.vy, keep.vz);
      r.yaw = keep.yaw;
      r.speed = keep.speed;
      r.grounded = keep.grounded;
      if (r.grounded) this.game.course.normal(keep.x, keep.z, r.normal);
    }
  }

  explode(pos, R, owner, cause) {
    const game = this.game;
    game.fx.explosion(pos, R);
    game.sfxAt('boom', pos, 1);
    game.shakeAt(pos, R);
    const p = pos.clone();
    for (const r of game.racers) {
      _v.copy(r.pos);
      _v.y += 0.8;
      const dist = _v.distanceTo(p);
      if (dist > R) continue;
      const fall = 1 - 0.5 * (dist / R);
      _v.sub(p).setY(0);
      if (_v.lengthSq() < 0.01) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      _v.normalize().multiplyScalar(13 * fall);
      _v.y = 11 * fall + 3;
      r.knock(_v, 1.5 + fall * 0.7, owner, cause);
    }
    for (const e of game.entities) {
      if (e.isMine && !e.dead && e.triggered <= 0 && e.pos.distanceTo(p) < R) e.triggered = 0.12 + Math.random() * 0.1;
    }
  }

  add(e) {
    this.game.entities.push(e);
    return e;
  }

  // 音效名：没有这个音效时退回到备用的
  snd(name, fallback) {
    return typeof this.game.sfx[name] === 'function' ? name : fallback;
  }

  // ----- 各武器 -----
  // 第二个参数 ex：本机开火时是 null；联机时别人开火，是他带过来的同步数据
  rocket(r) {
    this.add(new Projectile(this, r, 'rocket'));
    this.game.sfxAt('launch', r.pos, 1);
  }
  homing(r, ex) {
    const p = this.add(new Projectile(this, r, 'homing', ex));
    if (!ex) this.out.tg = p.target ? p.target.idx : -1;
    this.game.sfxAt('launch', r.pos, 1);
  }
  snowball(r) {
    this.add(new Projectile(this, r, 'snowball'));
    this.game.sfxAt('whoosh', r.pos, 0.5);
  }
  freeze(r) {
    const p = this.add(new Projectile(this, r, 'freeze'));
    this.game.fx.glow.spawn(p.pos.x, p.pos.y, p.pos.z, r.vel.x, r.vel.y, r.vel.z, 0.12, 0.9, 0.2, COL.frost, COL.ice1, 0, 0);
    this.game.sfxAt('zap', r.pos, 0.8);
  }
  dynamite(r) {
    this.add(new Dynamite(this, r));
    this.game.sfxAt('whoosh', r.pos, 0.5);
  }
  mine(r) {
    this.add(new Mine(this, r));
    this.game.sfxAt('thud', r.pos, 0.5);
  }
  goat(r, ex) {
    const g = this.add(new Goat(this, r, ex));
    if (!ex) this.out.tg = g.target ? g.target.idx : -1;
  }
  bigball(r) {
    this.add(new BigBall(this, r));
    this.game.sfxAt('whoosh', r.pos, 0.8);
  }
  boost(r) {
    r.boostT = 3;
    this.game.sfxAt('whoosh', r.pos, 1);
  }
  shield(r) {
    r.shieldT = 7 + r.mods.shield;
    this.game.sfxAt('shield', r.pos, 1);
  }

  // 加特林：按一下扫一梭子，打完这一梭子才扣一次弹药（期间枪一直端在手上）
  gatling(r) {
    if (!r.gatFiring) {
      this.add(new Gatling(this, r));
      this.out.fired = true; // 不扣弹药，但确实开火了，要同步给别人
    }
    return false;
  }

  shotgun(r) {
    const game = this.game;
    const a = this.muzzle(r, new THREE.Vector3());
    const dir = this.aim(r, new THREE.Vector3());
    const f = this.flat(r, new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw));
    for (let i = 0; i < 8; i++) {
      const b = a.clone().addScaledVector(dir, 22 + Math.random() * 8).addScaledVector(right, (Math.random() - 0.5) * 20);
      b.y += (Math.random() - 0.3) * 4;
      game.fx.beam(a, b, 0xffe066, 0.14, 0.08);
    }
    game.fx.glow.spawn(a.x, a.y, a.z, 0, 0, 0, 0.12, 0.5, 0.12, COL.fire0, COL.fire1, 0, 0);
    game.sfxAt('shot', r.pos, 1);
    game.shakeAt(r.pos, 3);
    r.vel.addScaledVector(f, -3);
    for (const o of game.racers) {
      if (!foe(r, o) || o.state === 'ready') continue;
      const rx = o.pos.x - r.pos.x;
      const rz = o.pos.z - r.pos.z;
      const fwd = f.x * rx + f.z * rz;
      const lat = right.x * rx + right.z * rz;
      if (fwd > 0 && fwd < 30 && Math.abs(lat) < 2 + fwd * 0.5 && Math.abs(o.pos.y - r.pos.y) < 8) {
        _v.set(rx, 0, rz).normalize().multiplyScalar(15);
        _v.y = 7;
        o.knock(_v, 1.5, r, WEAPONS.shotgun.name);
      }
    }
  }

  punch(r) {
    const game = this.game;
    game.fx.ring(r.pos, 6.5, 0xff3d3d, 0.3);
    game.fx.dome(r.pos, 5, 0xff6a4a, 0.22);
    game.sfxAt('shot', r.pos, 0.7);
    for (const o of game.racers) {
      if (!foe(r, o) || o.state === 'ready') continue;
      _v.copy(o.pos).sub(r.pos);
      if (_v.lengthSq() < 42) {
        _v.setY(0).normalize().multiplyScalar(17);
        _v.y = 8;
        o.knock(_v, 1.5, r, WEAPONS.punch.name);
      }
    }
  }

  hook(r, ex) {
    const tg = ex ? this.byIdx(ex.tg) : this.targetAhead(r, 170);
    if (!tg || tg === r) {
      if (r.isPlayer) this.game.tip('前方没有可钩的对手');
      return false;
    }
    if (!ex) this.out.tg = tg.idx;
    r.hookT = 1.8;
    r.hookTarget = tg;
    this.add(new Rope(this, r));
    this.game.sfxAt('launch', r.pos, 0.8);
  }

  lightning(r, ex) {
    let list;
    if (ex) {
      list = (Array.isArray(ex.tg) ? ex.tg : []).map((i) => this.byIdx(i)).filter((o) => o && o !== r);
    } else {
      list = this.game.racers.filter((o) => foe(r, o) && !o.finished && o.d > r.d).sort((a, b) => a.d - b.d);
    }
    list = list.slice(0, 4);
    if (!list.length) {
      if (r.isPlayer) this.game.tip('前方没有对手');
      return false;
    }
    if (!ex) this.out.tg = list.map((o) => o.idx);
    list.forEach((o, i) => this.add(new Strike(this, r, o, 1.1 + i * 0.15)));
    this.game.sfxAt('zap', r.pos, 0.6);
  }

  airstrike(r, ex) {
    const game = this.game;
    let tg;
    if (ex) {
      tg = this.byIdx(ex.tg);
      if (tg === r) tg = null;
    } else {
      // 优先炸跑在最前面的；自己领先时炸身后最近的
      const others = game.racers.filter((o) => foe(r, o) && !o.finished);
      others.sort((a, b) => b.d - a.d);
      tg = others[0];
    }
    if (!tg) {
      if (r.isPlayer) game.tip('没有可轰炸的对手');
      return false;
    }
    const a = this.add(new Airstrike(this, r, tg, ex ? ex.a : null));
    if (!ex) {
      this.out.tg = tg.idx;
      this.out.a = a.spec;
    }
    if (tg.isPlayer) game.tip('✈️ 空袭来袭！快躲开红圈');
  }
}
