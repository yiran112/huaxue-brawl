// 滑雪小人模型：程序化拼装 + 姿态动画
import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';
import { SKINS } from './config.js';
import { GEAR, rarityRank } from './gear.js';

const matCache = new Map();
export function lam(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
    matCache.set(key, m);
  }
  return m;
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  half: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  chunk: new THREE.IcosahedronGeometry(1, 0),
  shard: new THREE.ConeGeometry(1, 1, 5),
};
const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function mesh(geo, color, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(GEO[geo], lam(color, opts));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// 在两点之间放一根“肢体”
export function limb(color, ax, ay, az, bx, by, bz, r) {
  _a.set(ax, ay, az);
  _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const m = new THREE.Mesh(GEO.cyl, lam(color));
  m.scale.set(r, len, r);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, _b.sub(_a).normalize());
  m.castShadow = true;
  const j = mesh('sphere', color, r, r, r, ax, ay, az);
  const g = new THREE.Group();
  g.add(m, j);
  return g;
}

function buildHat(head, look) {
  const c = look.hatColor;
  const hairDark = 0x2a1a12;
  switch (look.hat) {
    case 0: { // 毛线帽
      const cap = mesh('half', c, 0.275, 0.27, 0.275, 0, 0.03, 0);
      const brim = mesh('cyl', 0xf4f4f4, 0.283, 0.07, 0.283, 0, 0.05, 0);
      const pom = mesh('sphere', c, 0.09, 0.09, 0.09, 0, 0.33, 0);
      head.add(cap, brim, pom);
      break;
    }
    case 1: { // 平头 + 头带
      head.add(mesh('box', 0x16161a, 0.42, 0.22, 0.4, 0, 0.26, 0.01));
      head.add(mesh('cyl', c === 0x1a1a1a ? 0xff3d6e : c, 0.262, 0.06, 0.262, 0, 0.1, 0));
      break;
    }
    case 2: { // 莫西干
      for (let i = 0; i < 5; i++) {
        head.add(mesh('box', c, 0.1, 0.2 - Math.abs(i - 2) * 0.03, 0.12, 0, 0.3, -0.2 + i * 0.1));
      }
      head.add(mesh('half', c, 0.258, 0.2, 0.258, 0, 0.06, 0));
      break;
    }
    case 3: { // 长发 + 胡子
      head.add(mesh('half', hairDark, 0.275, 0.25, 0.275, 0, 0.04, 0));
      head.add(mesh('box', hairDark, 0.5, 0.36, 0.16, 0, -0.08, 0.17));
      head.add(mesh('box', hairDark, 0.3, 0.14, 0.1, 0, -0.17, -0.2));
      break;
    }
    case 4: { // 头盔 + 护目镜
      head.add(mesh('half', c, 0.29, 0.3, 0.29, 0, 0.0, 0));
      head.add(mesh('box', 0x1a1a22, 0.44, 0.12, 0.1, 0, 0.06, -0.22));
      head.add(mesh('box', 0xff9a2e, 0.38, 0.08, 0.04, 0, 0.06, -0.275));
      break;
    }
    case 5: { // 爆炸头
      head.add(mesh('sphere', hairDark, 0.35, 0.28, 0.32, 0, 0.21, 0.09));
      head.add(mesh('cyl', 0xff3d6e, 0.265, 0.05, 0.265, 0, 0.08, 0));
      break;
    }
    case 6: { // 礼帽
      head.add(mesh('cyl', c, 0.36, 0.03, 0.36, 0, 0.19, 0));
      head.add(mesh('cyl', c, 0.22, 0.32, 0.22, 0, 0.35, 0));
      head.add(mesh('cyl', 0xff3d6e, 0.225, 0.05, 0.225, 0, 0.24, 0));
      break;
    }
    default: { // 绿毛
      head.add(mesh('half', c, 0.28, 0.3, 0.28, 0, 0.03, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = mesh('cone', c, 0.07, 0.2, 0.07, Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        head.add(sp);
      }
      break;
    }
  }
}

function buildGoggles(head, kind) {
  switch (kind) {
    case 1: // 橙色雪镜
      head.add(mesh('cyl', 0x1a1a22, 0.263, 0.07, 0.263, 0, 0.05, 0));
      head.add(mesh('box', 0x1a1a22, 0.4, 0.14, 0.05, 0, 0.05, -0.228));
      head.add(mesh('box', 0xff9a2e, 0.36, 0.1, 0.05, 0, 0.05, -0.245, { emissive: 0x552200 }));
      break;
    case 2: // 墨镜
      head.add(mesh('box', 0x111118, 0.4, 0.025, 0.025, 0, 0.075, -0.255));
      for (const sx of [-1, 1]) {
        head.add(mesh('box', 0x111118, 0.135, 0.085, 0.025, sx * 0.095, 0.045, -0.258));
        head.add(mesh('box', 0x111118, 0.02, 0.02, 0.22, sx * 0.205, 0.07, -0.15));
      }
      break;
    case 3: // 心形眼镜
      for (const sx of [-1, 1]) {
        const x = sx * 0.095;
        head.add(mesh('sphere', 0xff4fa0, 0.042, 0.042, 0.02, x - 0.026, 0.062, -0.258));
        head.add(mesh('sphere', 0xff4fa0, 0.042, 0.042, 0.02, x + 0.026, 0.062, -0.258));
        const tip = mesh('box', 0xff4fa0, 0.06, 0.06, 0.02, x, 0.035, -0.258);
        tip.rotation.z = Math.PI / 4;
        head.add(tip);
      }
      head.add(mesh('box', 0xff4fa0, 0.06, 0.015, 0.015, 0, 0.06, -0.258));
      break;
    case 4: // 电竞护目镜
      head.add(mesh('cyl', 0x22242c, 0.263, 0.06, 0.263, 0, 0.05, 0));
      head.add(mesh('box', 0x1ff0ff, 0.46, 0.1, 0.07, 0, 0.05, -0.23, { emissive: 0x0a8a99 }));
      break;
  }
}

const GEAR_IDS = new Set(Object.keys(GEAR));

export class Skier {
  constructor(look) {
    this.look = look;
    this.group = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.position.y = 0.75;
    this.inner = new THREE.Group();
    this.inner.position.y = -0.75;
    this.spin.add(this.inner);
    this.group.add(this.spin);
    this.t = Math.random() * 10;
    this.pose = { tuck: 0, lean: 0, air: 0, flail: 0, brake: 0, plant: 0, grab: 0 };
    this.build();
    this.group.scale.setScalar(1.22);
  }

  build() {
    const L = this.look;
    const inner = this.inner;
    const skin = L.skin < 16 ? SKINS[L.skin] : L.skin;
    const boot = 0x2e3038;
    const gear = (this.gear = GEAR_IDS.has(L.gear) ? L.gear : 'ski');
    const def = GEAR[gear];
    // form 决定站姿和模型：同一种滑法的 C/B/A/S 共用一套骨架，稀有度只改尺寸和装饰
    const form = (this.form = def.form || 'ski');
    const rank = rarityRank(def.rarity);
    const trim = def.trim ?? 0xffffff;
    // 雪橇 / 雪圈是坐着滑：整个人往下沉，腿往前伸
    this.sitDrop = form === 'sled' ? 0.34 : form === 'tube' ? 0.26 : 0;
    this.legBase = form === 'sled' ? 1.35 : form === 'tube' ? 1.15 : 0;
    this.seatLean = this.sitDrop > 0 ? 0.38 : 0;
    this.armSpread = form === 'board' ? 0.55 : 0;
    inner.position.y = -0.75 - this.sitDrop;
    this.vehicle = null;

    // 滑雪板（单板 / 雪橇 / 充气圈时只留一个空节点占位，动画代码照常转它）
    this.skis = [];
    this.legs = [];
    for (const sx of [-1, 1]) {
      // 整条腿（连靴子和雪板）挂在髋部，蹬腿时绕髋转
      const leg = new THREE.Group();
      leg.position.set(sx * 0.13, 0.72, 0.1);
      const hold = new THREE.Group();
      hold.position.copy(leg.position).negate();
      leg.add(hold);
      inner.add(leg);
      this.legs.push(leg);
      const g = new THREE.Group();
      g.position.set(sx * 0.17, 0.02, 0);
      if (form === 'ski') this.buildSki(g, L.ski, rank, trim);
      hold.add(g);
      this.skis.push(g);
      // 靴子与腿
      hold.add(mesh('box', boot, 0.17, 0.22, 0.34, sx * 0.17, 0.15, 0.02));
      hold.add(limb(L.pants, sx * 0.17, 0.26, 0.04, sx * 0.18, 0.5, -0.14, 0.105));
      hold.add(limb(L.pants, sx * 0.18, 0.5, -0.14, sx * 0.13, 0.72, 0.1, 0.12));
    }
    this.buildVehicle(form, L, rank, trim);

    // 躯干
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.7, 0.08);
    inner.add(this.torso);
    const body = new THREE.Mesh(GEO.capsule, lam(L.jacket));
    body.scale.set(0.27, 0.2, 0.23);
    body.position.y = 0.3;
    body.castShadow = true;
    this.torso.add(body);
    this.torso.add(mesh('cyl', L.stripe, 0.278, 0.09, 0.238, 0, 0.36, 0));
    this.torso.add(mesh('cyl', L.pants, 0.272, 0.08, 0.232, 0, 0.1, 0));
    this.torso.add(mesh('cyl', 0xf4f4f4, 0.15, 0.08, 0.14, 0, 0.6, 0));

    // 头
    this.head = new THREE.Group();
    this.head.position.set(0, 0.84, -0.02);
    this.torso.add(this.head);
    this.head.add(mesh('sphere', skin, 0.26, 0.25, 0.25));
    this.head.add(mesh('sphere', skin, 0.06, 0.05, 0.07, 0, -0.03, -0.25));
    for (const sx of [-1, 1]) {
      this.head.add(mesh('sphere', 0xffffff, 0.058, 0.07, 0.03, sx * 0.095, 0.045, -0.225));
      this.head.add(mesh('sphere', 0x101014, 0.028, 0.034, 0.02, sx * 0.095, 0.04, -0.25));
      this.head.add(mesh('sphere', skin, 0.05, 0.07, 0.03, sx * 0.26, 0, 0));
    }
    if (L.mustache) this.head.add(mesh('box', 0x3a2416, 0.17, 0.045, 0.05, 0, -0.095, -0.235));
    else this.head.add(mesh('box', 0x7a2f2f, 0.09, 0.02, 0.03, 0, -0.11, -0.232));
    buildHat(this.head, L);
    buildGoggles(this.head, L.goggles | 0);
    this.buildBack(L.back | 0, L);
    this.buildScarf(L.scarf | 0, L);

    // 手臂 + 雪杖
    this.arms = [];
    this.poles = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.31, 0.5, 0);
      arm.add(limb(L.jacket, 0, 0, 0, sx * 0.06, -0.26, -0.1, 0.09));
      arm.add(limb(L.stripe, sx * 0.06, -0.26, -0.1, sx * 0.07, -0.4, -0.3, 0.085));
      arm.add(mesh('sphere', 0x1c1c22, 0.1, 0.1, 0.1, sx * 0.07, -0.42, -0.33));
      const pole = new THREE.Group();
      pole.position.set(sx * 0.07, -0.42, -0.33);
      pole.add(mesh('cyl', 0xff6fae, 0.016, 1.15, 0.016, 0, -0.5, 0));
      pole.add(mesh('cyl', 0x20222a, 0.05, 0.02, 0.05, 0, -1.0, 0));
      pole.rotation.x = -1.05;
      pole.visible = form === 'ski';
      if (form === 'ski' && rank >= 2) pole.children[0].material = lam(trim);
      arm.add(pole);
      this.torso.add(arm);
      this.arms.push(arm);
      this.poles.push(pole);
    }

    // 手持武器道具
    this.propTube = new THREE.Group();
    this.propTube.add(mesh('cyl', 0x3f5a3a, 0.08, 0.95, 0.08, 0, 0, 0));
    this.propTube.add(mesh('cyl', 0x2a2d33, 0.1, 0.12, 0.1, 0, 0.45, 0));
    this.propTube.children.forEach((c) => (c.rotation.x = Math.PI / 2));
    this.propTube.children[1].position.set(0, 0, -0.45);
    this.propTube.position.set(0.3, 0.72, -0.1);
    this.propTube.visible = false;
    this.torso.add(this.propTube);
    this.propGun = new THREE.Group();
    this.propGun.add(mesh('box', 0x2a2d33, 0.07, 0.1, 0.4, 0, 0, 0));
    this.propGun.add(mesh('box', 0xffb020, 0.05, 0.05, 0.12, 0, 0.02, -0.24));
    this.propGun.position.set(0.38, 0.12, -0.42);
    this.propGun.visible = false;
    this.torso.add(this.propGun);
    // 加特林：六根枪管绕着轴转
    this.propGatling = new THREE.Group();
    this.propGatling.add(mesh('box', 0x3a3f4a, 0.17, 0.19, 0.36, 0, 0, 0.12));
    // 黄色弹鼓挂在外侧上方，从背后也看得见
    const drum = mesh('cyl', 0xffb020, 0.13, 0.12, 0.13, 0.13, 0.1, 0.12);
    drum.rotation.z = Math.PI / 2;
    this.propGatling.add(drum);
    this.propGatling.add(mesh('box', 0x20222a, 0.05, 0.17, 0.06, 0, -0.16, 0.18));
    // 枪管束比机匣粗一圈，枪口一圈橙色
    this.gatBarrels = new THREE.Group();
    this.gatBarrels.position.z = -0.06;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = mesh('cyl', 0x9aa0ac, 0.032, 0.74, 0.032, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.37);
      b.rotation.x = Math.PI / 2;
      this.gatBarrels.add(b);
    }
    for (const z of [-0.08, -0.42, -0.72]) {
      const ring = mesh('cyl', z < -0.7 ? 0xff8a1f : 0x2a2d33, 0.15, 0.04, 0.15, 0, 0, z);
      ring.rotation.x = Math.PI / 2;
      this.gatBarrels.add(ring);
    }
    // 枪口位置：子弹和火光从这里出来
    this.gatMuzzle = new THREE.Object3D();
    this.gatMuzzle.position.z = -0.78;
    this.gatBarrels.add(this.gatMuzzle);
    this.propGatling.add(this.gatBarrels);
    this.propGatling.position.set(0.5, 0.26, -0.3);
    this.propGatling.scale.setScalar(1.3);
    this.propGatling.visible = false;
    this.torso.add(this.propGatling);
    this.gatV = 0; // 枪管转速
    this.gatFire = false; // 正在开火（由武器每帧置位）

    // 护盾 / 冰块
    this.shield = new THREE.Mesh(
      GEO.sphere,
      new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.shield.scale.setScalar(1.25);
    this.shield.position.y = 0.8;
    this.shield.visible = false;
    this.group.add(this.shield);
    // 冰坨：一大块棱角分明的冰把人整个裹住，四周和头顶戳出冰刺
    this.iceMat = new THREE.MeshLambertMaterial({ color: 0x9fe4ff, emissive: 0x2a8ae0, emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.8, depthWrite: false });
    this.ice = new THREE.Group();
    const chunk = (sx, sy, sz, x, y, z, ry) => {
      const m = new THREE.Mesh(GEO.chunk, this.iceMat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.ice.add(m);
    };
    chunk(0.74, 1.15, 0.74, 0, 1.0, 0, 0.4);
    chunk(0.82, 0.5, 0.95, 0, 0.32, -0.05, 1.3);
    const shard = (a, d, y, h, w, tilt) => {
      const m = new THREE.Mesh(GEO.shard, this.iceMat);
      m.scale.set(w, h, w);
      m.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      m.quaternion.setFromAxisAngle(_a.set(Math.sin(a), 0, -Math.cos(a)), tilt);
      this.ice.add(m);
    };
    for (let i = 0; i < 7; i++) shard((i / 7) * 6.28 + 0.3, 0.55, 0.5 + (i % 2) * 0.35, 1.0 + (i % 3) * 0.25, 0.2, 0.75);
    for (let i = 0; i < 4; i++) shard((i / 4) * 6.28 + 0.9, 0.22, 2.05, 0.7 + (i % 2) * 0.3, 0.17, 0.3);
    this.ice.visible = false;
    this.iceT = 0;
    this.group.add(this.ice);
  }

  // 双板挂在两只脚上。rank 0 是原来的入门双板；更高稀有度更长，并加上装饰条
  buildSki(g, color, rank, trim) {
    const len = 1.7 + rank * 0.16;
    const z = -0.08 - rank * 0.05;
    g.add(mesh('box', color, 0.115, 0.035, len, 0, 0, z));
    const tip = mesh('box', color, 0.115, 0.035, 0.26, 0, 0.045, z - len / 2 - 0.1);
    tip.rotation.x = 0.45;
    g.add(tip);
    g.add(mesh('box', 0x20222a, 0.12, 0.05, 0.3, 0, 0.03, 0.02));
    if (rank >= 1) g.add(mesh('box', trim, 0.03, 0.04, len * 0.72, 0, 0.02, z));
    if (rank >= 2) {
      for (const sx of [-1, 1]) g.add(mesh('box', trim, 0.018, 0.02, len * 0.88, sx * 0.055, 0.012, z));
    }
    if (rank >= 3) g.add(mesh('box', trim, 0.07, 0.028, 0.2, 0, 0.05, z - len / 2 + 0.02, { emissive: trim }));
  }

  // 单板 / 雪橇 / 雪圈。挂在 inner 上，跟着人一起压弯；inner 下沉了多少，这里就抬回多少，正好贴地。
  // B 级（单板、雪橇、充气圈）保持原来的尺寸，其它稀有度在这套骨架上放大或缩小。
  buildVehicle(form, L, rank, trim) {
    if (form === 'ski') return;
    const v = (this.vehicle = new THREE.Group());
    const y0 = this.sitDrop;
    const glow = rank >= 3 ? { emissive: trim } : undefined;
    if (form === 'board') {
      const d = rank - 1;
      const w = 0.5 + d * 0.05;
      const len = 1.5 + d * 0.14;
      v.add(mesh('box', L.ski, w, 0.04, len, 0, y0 + 0.02, -0.05));
      for (const s of [-1, 1]) {
        const end = mesh('box', L.ski, w, 0.04, 0.22, 0, y0 + 0.06, -0.05 + s * (len / 2 + 0.08));
        end.rotation.x = -s * 0.4;
        v.add(end);
      }
      v.add(mesh('box', trim, 0.12 + Math.max(0, d) * 0.02, 0.045, len * 0.8, 0, y0 + 0.025, -0.05, glow));
      for (const sx of [-1, 1]) v.add(mesh('box', 0x20222a, 0.16, 0.08, 0.24, sx * 0.17, y0 + 0.07, 0.02));
      if (rank >= 2) {
        for (const sx of [-1, 1]) v.add(mesh('box', trim, 0.028, 0.02, len * 0.82, sx * (w / 2 - 0.01), y0 + 0.03, -0.05));
      }
    } else if (form === 'sled') {
      const d = rank - 1;
      const w = 0.7 + d * 0.04;
      const len = 1.55 + d * 0.14;
      const rail = rank === 0 ? trim : rank >= 2 ? trim : 0x9aa0ac;
      v.add(mesh('box', L.ski, w, 0.1, len, 0, y0 + 0.24, -0.3));
      v.add(mesh('box', rank >= 2 ? trim : 0xffffff, w + 0.02, 0.03, 0.12, 0, y0 + 0.3, -0.3, glow));
      const curl = mesh('box', L.ski, w, 0.1, 0.4, 0, y0 + 0.4, -0.3 - len / 2 - 0.095);
      curl.rotation.x = 0.9;
      v.add(curl);
      for (const sx of [-1, 1]) {
        v.add(mesh('box', rail, 0.05, 0.05, len + 0.25, sx * 0.3, y0 + 0.03, -0.35));
        const tip = mesh('box', rail, 0.05, 0.05, 0.3, sx * 0.3, y0 + 0.12, -0.35 - (len + 0.25) / 2 - 0.05);
        tip.rotation.x = 0.8;
        v.add(tip);
        for (const z of [0.2, -0.4, -0.95]) v.add(mesh('box', 0x6f7883, 0.04, 0.2, 0.04, sx * 0.3, y0 + 0.13, z));
      }
      v.add(limb(0xffd23c, -0.3, y0 + 0.45, -1.25, 0.3, y0 + 0.45, -1.25, 0.02));
      if (rank >= 3) v.add(mesh('box', trim, 0.22, 0.08, 0.22, 0, y0 + 0.38, 0.2, glow));
    } else {
      const d = rank - 1;
      const rad = 0.6 + d * 0.07;
      const thick = 0.27 + d * 0.035;
      const torus = new THREE.Mesh(new THREE.TorusGeometry(rad, thick, 10, 22), lam(L.ski));
      torus.rotation.x = Math.PI / 2;
      torus.position.set(0, y0 + 0.27, -0.05);
      torus.castShadow = true;
      this.ownGeos = [torus.geometry];
      v.add(torus);
      if (rank >= 2) {
        const inner = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.62, 0.045, 8, 18), lam(trim, glow));
        inner.rotation.x = Math.PI / 2;
        inner.position.copy(torus.position);
        this.ownGeos.push(inner.geometry);
        v.add(inner);
      }
      v.add(mesh('cyl', 0x2b2f3a, 0.36, 0.06, 0.36, 0, y0 + 0.12, -0.05));
      for (const sx of [-1, 1]) v.add(mesh('box', rank >= 2 ? trim : 0x20222a, 0.07, 0.1, 0.22, sx * (0.72 + (rank - 1) * 0.08), y0 + 0.42, -0.05, glow));
    }
    this.inner.add(v);
  }

  buildBack(kind, L) {
    const t = this.torso;
    this.cape = null;
    this.wings = null;
    this.jetFlames = null;
    switch (kind) {
      case 1: // 双肩包
        t.add(mesh('box', L.stripe, 0.36, 0.4, 0.16, 0, 0.32, 0.3));
        t.add(mesh('box', 0x2b2f3a, 0.37, 0.07, 0.17, 0, 0.52, 0.3));
        for (const sx of [-1, 1]) t.add(mesh('box', 0x2b2f3a, 0.05, 0.05, 0.42, sx * 0.13, 0.55, 0.08));
        break;
      case 2: { // 超人披风
        const cape = (this.cape = new THREE.Group());
        cape.position.set(0, 0.58, 0.2);
        cape.add(mesh('box', 0xe0222a, 0.56, 0.9, 0.03, 0, -0.45, 0));
        cape.add(mesh('box', 0xffd23c, 0.58, 0.06, 0.04, 0, -0.02, 0));
        t.add(cape);
        break;
      }
      case 3: { // 火箭背包
        this.jetFlames = [];
        for (const sx of [-1, 1]) {
          t.add(mesh('cyl', 0xc8ccd6, 0.09, 0.42, 0.09, sx * 0.1, 0.32, 0.32));
          t.add(mesh('cone', 0xe0263c, 0.09, 0.14, 0.09, sx * 0.1, 0.6, 0.32));
          t.add(mesh('cyl', 0x3a3f47, 0.06, 0.08, 0.06, sx * 0.1, 0.08, 0.32));
          const fl = new THREE.Mesh(GEO.cone, new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85, depthWrite: false }));
          fl.scale.set(0.07, 0.35, 0.07);
          fl.rotation.x = Math.PI;
          fl.position.set(sx * 0.1, -0.13, 0.32);
          fl.visible = false;
          t.add(fl);
          this.jetFlames.push(fl);
        }
        t.add(mesh('box', 0x6f7883, 0.12, 0.3, 0.06, 0, 0.32, 0.27));
        break;
      }
      case 4: { // 天使翅膀
        this.wings = [];
        for (const sx of [-1, 1]) {
          const w = new THREE.Group();
          w.position.set(sx * 0.08, 0.46, 0.27);
          w.rotation.z = sx * 0.35;
          w.add(mesh('box', 0xffffff, 0.55, 0.28, 0.035, sx * 0.29, 0.06, 0, { emissive: 0x334455 }));
          w.add(mesh('box', 0xf2f6ff, 0.4, 0.2, 0.035, sx * 0.24, -0.16, 0.01, { emissive: 0x334455 }));
          t.add(w);
          this.wings.push(w);
        }
        break;
      }
      case 5: { // 冠军奖杯
        const gold = { emissive: 0x553300 };
        t.add(mesh('box', 0x2b2f3a, 0.2, 0.08, 0.16, 0, 0.3, 0.3));
        t.add(mesh('cone', 0xffc81f, 0.07, 0.14, 0.07, 0, 0.4, 0.33, gold));
        t.add(mesh('cyl', 0xffc81f, 0.14, 0.2, 0.14, 0, 0.56, 0.33, gold));
        for (const sx of [-1, 1]) t.add(mesh('box', 0xffc81f, 0.05, 0.12, 0.03, sx * 0.17, 0.57, 0.33, gold));
        break;
      }
    }
  }

  buildScarf(kind, L) {
    this.scarfTail = null;
    if (!kind) return;
    const t = this.torso;
    t.add(mesh('cyl', L.stripe, 0.175, 0.1, 0.165, 0, 0.6, 0));
    const len = kind === 2 ? 0.62 : 0.32;
    const tail = (this.scarfTail = new THREE.Group());
    tail.position.set(0.08, 0.6, 0.14);
    tail.add(mesh('box', L.stripe, 0.09, 0.03, len, 0, 0, len / 2));
    tail.add(mesh('box', 0xffffff, 0.095, 0.035, 0.05, 0, 0, len - 0.03));
    t.add(tail);
  }

  // 团队赛：背上插一面队旗
  setTeam(color) {
    if (this.teamFlag) this.teamFlag.removeFromParent();
    if (color === null || color === undefined) {
      this.teamFlag = null;
      return;
    }
    const g = (this.teamFlag = new THREE.Group());
    g.position.set(-0.14, 0.45, 0.3);
    g.add(mesh('cyl', 0xdfe3ea, 0.014, 1.0, 0.014, 0, 0.5, 0));
    const flag = mesh('box', color, 0.012, 0.24, 0.36, 0, 0.86, 0.18);
    g.add(flag);
    this.teamCloth = flag;
    this.torso.add(g);
  }

  // 计时赛的幽灵：所有零件换成半透明的独立材质（缓存的共享材质不能动）
  makeGhost() {
    this.ghostMats = [];
    const map = new Map();
    this.group.traverse((o) => {
      if (!o.isMesh || o === this.shield) return;
      o.castShadow = false;
      let m = map.get(o.material);
      if (!m) {
        m = o.material.clone();
        m.transparent = true;
        m.opacity = 0.34;
        m.depthWrite = false;
        if (m.color) m.color.lerp(new THREE.Color(0x9fd8ff), 0.45);
        map.set(o.material, m);
        this.ghostMats.push(m);
      }
      o.material = m;
    });
  }

  setProp(kind) {
    this.propTube.visible = kind === 'tube';
    this.propGun.visible = kind === 'gun';
    this.propGatling.visible = kind === 'gatling';
  }

  setSeated() {
    this.seated = true;
    this.poles.forEach((p) => (p.visible = false));
    // 缆车上坐着时，雪橇和充气圈不带上去
    if (this.vehicle && this.sitDrop > 0) {
      this.vehicle.visible = false;
      this.inner.position.y = -0.75;
      this.legs.forEach((l) => (l.rotation.x = 0));
    }
    this.torso.rotation.x = 0.05;
    this.arms[0].rotation.x = -0.5;
    this.arms[1].rotation.x = -0.5;
  }

  // s: { tuck, steer, grounded, tumbling, planted, brake, speed, frozen }
  update(dt, s) {
    this.t += dt;
    if (this.seated) {
      this.head.rotation.y = Math.sin(this.t * 0.7 + this.look.hat) * 0.35;
      this.head.rotation.x = Math.sin(this.t * 0.5 + this.look.hat * 2) * 0.08;
      this.arms[0].rotation.x = -0.5 + Math.sin(this.t * 1.3 + this.look.hat) * 0.08;
      return;
    }
    const p = this.pose;
    const k = damp(10, dt);
    p.tuck = lerp(p.tuck, s.tuck ? 1 : 0, k);
    p.lean = lerp(p.lean, s.frozen ? 0 : s.steer, damp(7, dt));
    p.air = lerp(p.air, s.grounded ? 0 : 1, k);
    p.flail = lerp(p.flail, s.tumbling ? 1 : 0, damp(14, dt));
    p.brake = lerp(p.brake, s.brake ? 1 : 0, k);
    p.grab = lerp(p.grab, s.grab ? 1 : 0, damp(14, dt));
    const t = this.t;
    const fl = p.flail;
    const frozen = s.frozen ? 0 : 1;
    // 抓板：站着滑的人收腿弯腰、右手去够板、左手甩开；坐着滑的人往后仰、举手、车头翘起来
    const gb = p.grab * (1 - fl);
    const sit = this.sitDrop > 0;

    this.inner.rotation.z = -p.lean * 0.42 * (1 - fl) + (sit ? 0 : gb * 0.32);
    this.inner.rotation.x = -gb * (sit ? 0.35 : 0.22);
    this.torso.rotation.x = -(0.45 + p.tuck * 0.5 - p.air * 0.2 - p.brake * 0.25) + this.seatLean + fl * Math.sin(t * 17) * 0.5 + gb * (sit ? 0.45 : -0.75);
    this.torso.rotation.z = -p.lean * 0.15;
    this.head.rotation.x = 0.3 + p.tuck * 0.35 - this.seatLean * 0.5 + gb * (sit ? -0.3 : 0.45);
    const wob = Math.sin(t * 9) * 0.04 * clamp(s.speed / 30, 0, 1) * frozen;
    const base = 0.25 - p.tuck * 1.0 + p.air * 1.2 + p.brake * 0.4 + (s.hasProp ? -0.2 : 0);
    const spread = this.armSpread * (1 - fl);
    const a0 = base + wob + fl * Math.sin(t * 21) * 1.6;
    const a1 = base - wob + fl * Math.sin(t * 19 + 1.7) * 1.6 + (s.hasProp ? -0.9 : 0);
    this.arms[0].rotation.x = lerp(a0, sit ? 2.9 : 0.6, gb);
    this.arms[1].rotation.x = lerp(a1, sit ? 0.2 : 0.35, gb);
    this.arms[0].rotation.z = lerp(-p.air * 0.7 - fl * 0.8 - p.brake * 0.3 - spread, sit ? -0.3 : -1.5, gb);
    this.arms[1].rotation.z = lerp(p.air * 0.7 + fl * 0.8 + p.brake * 0.3 + spread, sit ? 0.5 : -0.25, gb);
    this.animateExtras(dt, s);
    const wedge = p.brake * 0.28;
    // 双板抓板时两块板交叉成 X
    const cross = this.form === 'ski' ? gb * 0.42 : 0;
    this.skis[0].rotation.y = -wedge + fl * Math.sin(t * 13) * 0.7 + cross;
    this.skis[1].rotation.y = wedge + fl * Math.sin(t * 15 + 2) * 0.7 - cross;
    this.skis[0].rotation.x = p.air * 0.12;
    this.skis[1].rotation.x = p.air * 0.12;
    // 翻滚时两腿乱晃；倒插在雪里时一前一后使劲蹬
    p.plant = lerp(p.plant, s.planted ? 1 : 0, damp(12, dt));
    const kick = fl * 0.25 + p.plant * 0.55;
    const knee = this.form === 'ski' ? gb * 0.75 : 0;
    this.legs[0].rotation.x = this.legBase + Math.sin(t * 15) * kick + knee;
    this.legs[1].rotation.x = this.legBase - Math.sin(t * 15) * kick + knee;

    // 加特林：枪口放平朝前，开火时枪管飞转、枪身抖动
    if (this.propGatling.visible) {
      this.gatV = lerp(this.gatV, this.gatFire ? 40 : 0, damp(this.gatFire ? 16 : 2.5, dt));
      this.gatBarrels.rotation.z += this.gatV * dt;
      this.propGatling.rotation.x = -this.torso.rotation.x * 0.9;
      this.propGatling.position.z = -0.3 + (this.gatFire ? Math.sin(t * 95) * 0.014 : 0);
    } else {
      this.gatV = 0;
    }
    this.gatFire = false;

    // 冰坨：冻住的一瞬间“嘭”地弹出来，一闪一闪发蓝光；快化开时抖动、闪白
    if (s.frozen) {
      this.iceT += dt;
      const k = Math.min(1, this.iceT / 0.22);
      this.ice.scale.setScalar(Math.max(0.05, 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2));
      const crack = s.thaw < 0.7;
      this.ice.rotation.z = crack ? Math.sin(t * 60) * 0.06 : 0;
      this.iceMat.emissiveIntensity = crack && Math.sin(t * 34) > 0 ? 1.1 : 0.5 + 0.2 * Math.sin(t * 7);
    } else {
      this.iceT = 0;
    }
  }

  // 披风、围巾、队旗随速度飘，翅膀在空中扇，火箭背包加速时喷火
  animateExtras(dt, s) {
    const t = this.t;
    const v = clamp(s.speed / 35, 0, 1);
    if (this.cape) this.cape.rotation.x = -(0.2 + v * 1.0) + Math.sin(t * 13) * 0.07 * (0.3 + v);
    if (this.scarfTail) {
      this.scarfTail.rotation.x = -0.9 + v * 0.75 + Math.sin(t * 17) * 0.12 * v;
      this.scarfTail.rotation.y = Math.sin(t * 11) * 0.3 * v;
    }
    if (this.teamCloth) this.teamCloth.rotation.y = Math.sin(t * 12) * 0.25 * (0.3 + v);
    if (this.wings) {
      const flap = s.grounded ? 0.15 + Math.sin(t * 2) * 0.05 : 0.2 + Math.sin(t * 16) * 0.55;
      this.wings[0].rotation.y = flap;
      this.wings[1].rotation.y = -flap;
    }
    if (this.jetFlames) {
      for (const f of this.jetFlames) {
        f.visible = !!s.boost;
        if (f.visible) f.scale.y = 0.3 + Math.random() * 0.25;
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.shield.material.dispose();
    this.iceMat.dispose();
    if (this.ownGeos) this.ownGeos.forEach((g) => g.dispose());
    if (this.ghostMats) this.ghostMats.forEach((m) => m.dispose());
    if (this.jetFlames) this.jetFlames.forEach((f) => f.material.dispose());
  }
}
