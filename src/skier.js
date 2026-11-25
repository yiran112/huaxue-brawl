// 滑雪小人模型：程序化拼装 + 姿态动画
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, damp } from './util.js';
import { SKINS } from './config.js';
import { GEAR, GEAR_COLOR, rarityRank } from './gear.js';
import { GEAR_MODELS, gearKit, bakeGear } from './gearModels.js';
import { outfitKit, buildHat, buildGoggles, buildBack, buildScarf } from './outfitModels.js';

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

const profile = (points) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 18);

const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  rounded: new RoundedBoxGeometry(1, 1, 1, 1, 0.19),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  jacket: profile([[0, 0.065], [0.205, 0.065], [0.234, 0.1], [0.241, 0.21], [0.27, 0.42], [0.261, 0.48], [0.232, 0.535], [0.17, 0.58], [0, 0.58]]),
  yoke: profile([[0.271, 0.434], [0.265, 0.483], [0.235, 0.538], [0.18, 0.579]]),
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

// 同一关节上不需要单独动的衣料与配件合为一份网格，颜色烘到顶点。
function costumeMesh(parts) {
  const geos = parts.map((part) => {
    part.updateMatrix();
    const source = part.geometry;
    const geo = source.index ? source.toNonIndexed() : source.clone();
    geo.applyMatrix4(part.matrix);
    geo.deleteAttribute('uv');
    const { r, g, b } = part.material.color;
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  });
  const geometry = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const result = new THREE.Mesh(geometry, lam(0xffffff, { vertexColors: true }));
  result.castShadow = true;
  return result;
}

function snowJacket(look) {
  const hardware = 0x253749;
  const fabricShade = new THREE.Color(look.jacket).multiplyScalar(0.57).getHex();
  const parts = [
    mesh('jacket', look.jacket, 1, 1, 0.87),
    mesh('yoke', look.stripe, 1, 1, 0.87),
    mesh('cyl', fabricShade, 0.229, 0.045, 0.197, 0, 0.091, 0),
    mesh('cyl', hardware, 0.153, 0.071, 0.14, 0, 0.595, 0),
    mesh('cyl', 0xcbdde9, 0.155, 0.014, 0.141, 0, 0.635, 0),
    mesh('box', hardware, 0.024, 0.34, 0.023, 0, 0.341, -0.222).rotateX(-0.1),
    mesh('rounded', 0xeaf6fb, 0.032, 0.043, 0.019, 0, 0.47, -0.238),
    mesh('rounded', hardware, 0.202, 0.104, 0.024, 0, 0.365, 0.233),
  ];
  for (const side of [-1, 1]) {
    parts.push(mesh('box', hardware, 0.084, 0.015, 0.022, side * 0.114, 0.241, -0.189).rotateY(side * -0.46).rotateZ(side * 0.29));
    parts.push(mesh('box', 0xe7f7f7, 0.078, 0.014, 0.008, side * 0.031, 0.369, 0.247).rotateZ(side * -0.55));
  }
  return costumeMesh(parts);
}

function snowBoot(stripe) {
  return costumeMesh([
    mesh('rounded', 0x263447, 0.182, 0.058, 0.347, 0, 0.067, 0.021),
    mesh('rounded', 0x435874, 0.17, 0.19, 0.315, 0, 0.151, 0.024),
    mesh('rounded', 0x32445c, 0.163, 0.103, 0.18, 0, 0.215, 0.065),
    mesh('box', stripe, 0.175, 0.023, 0.09, 0, 0.207, -0.038).rotateX(-0.31),
    mesh('box', 0xc4d5e2, 0.031, 0.013, 0.036, 0.061, 0.227, -0.034),
  ]);
}

function skierFace(look, skin) {
  const innerEar = new THREE.Color(skin).lerp(new THREE.Color(0xba575c), 0.29).getHex();
  const parts = [mesh('sphere', skin, 0.26, 0.25, 0.25), mesh('sphere', skin, 0.058, 0.05, 0.065, 0, -0.035, -0.248)];
  const goggles = (look.goggles | 0) || (look.hat === 4 ? 1 : 0);
  for (const side of [-1, 1]) {
    parts.push(mesh('sphere', skin, 0.051, 0.072, 0.037, side * 0.252, 0, 0));
    parts.push(mesh('sphere', innerEar, 0.024, 0.044, 0.013, side * 0.274, 0, -0.027));
    if (goggles !== 1 && goggles !== 4) {
      parts.push(mesh('sphere', 0xfff8eb, 0.055, 0.065, 0.031, side * 0.095, 0.043, -0.224));
      parts.push(mesh('sphere', 0x273646, 0.027, 0.035, 0.018, side * 0.088, 0.04, -0.25));
      parts.push(mesh('sphere', 0xffffff, 0.01, 0.012, 0.007, side * 0.088 - 0.007, 0.054, -0.266));
      parts.push(mesh('sphere', 0x553731, 0.055, 0.013, 0.018, side * 0.101, 0.117, -0.209).rotateZ(side * 0.12));
    }
    if (look.mustache) parts.push(mesh('sphere', 0x3d2419, 0.057, 0.024, 0.03, side * 0.045, -0.088, -0.24).rotateZ(side * 0.22));
  }
  if (!look.mustache) parts.push(mesh('sphere', 0x873d3b, 0.047, 0.017, 0.016, 0, -0.107, -0.231));
  return costumeMesh(parts);
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
    this.pose = { tuck: 0, lean: 0, air: 0, flail: 0, brake: 0, plant: 0, grab: 0, landing: 0 };
    this.build();
    this.group.scale.setScalar(1.22);
  }

  build() {
    const L = this.look;
    const inner = this.inner;
    const skin = L.skin < 16 ? SKINS[L.skin] : L.skin;
    const boot = snowBoot(L.stripe);
    this.ownGeos = [boot.geometry];
    const gear = (this.gear = GEAR_IDS.has(L.gear) ? L.gear : 'ski');
    const def = GEAR[gear];
    // form 决定滑法和站姿；每件装备的造型在 gearModels.js（def.model），坐多高、腿伸多远也跟着那台载具走。
    // 万一哪件装备没写 model，就借同一种 form 的基础款
    const form = (this.form = def.form || 'ski');
    const spec = (this.spec = GEAR_MODELS[def.model] || GEAR_MODELS[form]);
    const rank = rarityRank(def.rarity);
    const trim = def.trim ?? 0xffffff;
    // 雪橇 / 雪圈是坐着滑：整个人往下沉，腿往前伸
    this.sit = form === 'sled' || form === 'tube';
    this.sitDrop = spec?.sitDrop ?? (form === 'sled' ? 0.34 : form === 'tube' ? 0.26 : 0);
    this.legBase = spec?.legBase ?? (form === 'sled' ? 1.35 : form === 'tube' ? 1.15 : 0);
    this.seatLean = this.sit ? 0.38 : 0;
    this.armSpread = spec?.armSpread ?? (form === 'board' ? 0.55 : 0);
    this.usePoles = form === 'ski' && spec?.poles !== false;
    // grip：握着车把的载具，手臂抬到车把上；lift / bob：悬浮的载具离地多高、上下起伏多少
    this.grip = spec?.grip || 0;
    this.lift = spec?.lift || 0;
    this.bob = spec?.bob || 0;
    this.innerY = -0.75 - this.sitDrop + this.lift;
    inner.position.y = this.innerY;
    this.vehicle = null;
    // 装备用到的材质，以及要动起来的零件（尾焰、灯圈、羽翼、小旗）
    const kit = gearKit(lam, GEAR_COLOR, trim, -this.lift);
    this.gearFx = kit.fx;

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
      if (spec.ski) {
        spec.ski(g, kit);
        bakeGear(g, kit);
      }
      hold.add(g);
      this.skis.push(g);
      // 靴子与腿
      const shoe = boot.clone();
      shoe.position.x = sx * 0.17;
      hold.add(shoe);
      hold.add(limb(L.pants, sx * 0.17, 0.26, 0.04, sx * 0.18, 0.5, -0.14, 0.105));
      hold.add(limb(L.pants, sx * 0.18, 0.5, -0.14, sx * 0.13, 0.72, 0.1, 0.12));
    }
    if (spec.build) {
      // inner 下沉了多少，载具就抬回多少：坐着滑的载具按雪面坐标造型，单板按脚底坐标
      const v = (this.vehicle = new THREE.Group());
      v.position.y = this.sitDrop;
      spec.build(v, kit);
      inner.add(v);
      bakeGear(v, kit);
    }
    // 合并出来的几何体是这个角色独有的，销毁时一起释放
    this.ownGeos.push(...kit.own);

    // 躯干
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.7, 0.08);
    inner.add(this.torso);
    const body = snowJacket(L);
    this.ownGeos.push(body.geometry);
    this.torso.add(body);

    // 头
    this.head = new THREE.Group();
    this.head.position.set(0, 0.84, -0.02);
    this.torso.add(this.head);
    const face = skierFace(L, skin);
    this.ownGeos.push(face.geometry);
    this.head.add(face);
    // 装扮的造型在 outfitModels.js；合并出来的几何体归这个角色，销毁时一起释放
    const outfit = (this.outfit = outfitKit(lam));
    buildHat(this.head, L, outfit);
    this.eyewear = new THREE.Group();
    this.head.add(this.eyewear);
    buildGoggles(this.eyewear, L.goggles | 0, outfit);
    this.backwear = new THREE.Group();
    this.neckwear = new THREE.Group();
    this.torso.add(this.backwear, this.neckwear);
    this.buildBack(L.back | 0, L);
    this.buildScarf(L.scarf | 0, L);
    this.ownGeos.push(...outfit.own);

    // 手臂 + 雪杖
    this.arms = [];
    this.poles = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.31, 0.5, 0);
      arm.add(limb(L.jacket, 0, 0, 0, sx * 0.06, -0.26, -0.1, 0.09));
      arm.add(limb(L.stripe, sx * 0.06, -0.26, -0.1, sx * 0.07, -0.4, -0.3, 0.085));
      arm.add(mesh('rounded', 0x2c3b51, 0.168, 0.175, 0.191, sx * 0.07, -0.417, -0.32).rotateX(-0.46));
      const pole = new THREE.Group();
      pole.position.set(sx * 0.07, -0.42, -0.33);
      pole.add(mesh('cyl', 0xff6fae, 0.016, 1.15, 0.016, 0, -0.5, 0));
      pole.add(mesh('cyl', 0x20222a, 0.05, 0.02, 0.05, 0, -1.0, 0));
      pole.rotation.x = -1.05;
      pole.visible = this.usePoles;
      if (this.usePoles && rank >= 2) pole.children[0].material = lam(trim);
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

  // 背饰：披风随速度飘、翅膀在空中扇、火箭背包加速时喷火（animateExtras 里动）
  buildBack(kind, L) {
    const { cape, wings, jetFlames } = buildBack(this.backwear, kind, L, this.outfit);
    this.cape = cape;
    this.wings = wings;
    this.jetFlames = jetFlames;
  }

  buildScarf(kind, L) {
    this.scarfTail = buildScarf(this.neckwear, kind, L, this.outfit);
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
    // 缆车上坐着时，雪橇、雪圈这类坐着滑的载具不带上去
    if (this.vehicle && this.sit) {
      this.vehicle.visible = false;
      this.legs.forEach((l) => (l.rotation.x = 0));
    }
    this.inner.position.y = -0.75;
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
    p.landing = lerp(p.landing, s.landing || 0, damp(30, dt));
    const t = this.t;
    const fl = p.flail;
    const frozen = s.frozen ? 0 : 1;
    // 抓板：站着滑的人收腿弯腰、右手去够板、左手甩开；坐着滑的人往后仰、举手、车头翘起来
    const gb = p.grab * (1 - fl);
    const sit = this.sit;
    // 握车把：翻滚和做抓板动作时松手；右手拿着武器时只剩左手握
    const grip = this.grip ? (1 - fl) * (1 - gb) : 0;
    const gripR = s.hasProp ? 0 : grip;
    // 握着车把时少俯一点身，不然手会戳到车把前面去
    const tuckLean = this.grip ? 0.25 : 0.5;

    this.inner.rotation.z = -p.lean * 0.42 * (1 - fl) + (sit ? 0 : gb * 0.32);
    this.inner.rotation.x = -gb * (sit ? 0.35 : 0.22);
    this.torso.rotation.x = -(0.45 + p.tuck * tuckLean - p.air * 0.2 - p.brake * 0.25) + this.seatLean + fl * Math.sin(t * 17) * 0.5 + gb * (sit ? 0.45 : -0.75);
    this.torso.rotation.z = -p.lean * 0.15;
    this.torso.position.y = 0.7;
    this.head.rotation.x = 0.3 + p.tuck * 0.35 - this.seatLean * 0.5 + gb * (sit ? -0.3 : 0.45);
    const wob = Math.sin(t * 9) * 0.04 * clamp(s.speed / 30, 0, 1) * frozen;
    const base = 0.25 - p.tuck * 1.0 + p.air * 1.2 + p.brake * 0.4 + (s.hasProp ? -0.2 : 0);
    const spread = this.armSpread * (1 - fl);
    const a0 = base + wob + fl * Math.sin(t * 21) * 1.6;
    const a1 = base - wob + fl * Math.sin(t * 19 + 1.7) * 1.6 + (s.hasProp ? -0.9 : 0);
    // 身体前后一倾，肩膀跟着挪了位置，手臂要反着补回一部分，手才留在车把上
    const hold = this.grip - 0.4 * (this.torso.rotation.x - this.seatLean + 0.45);
    this.arms[0].rotation.x = lerp(lerp(a0, sit ? 2.9 : 0.6, gb), hold, grip);
    this.arms[1].rotation.x = lerp(lerp(a1, sit ? 0.2 : 0.35, gb), hold, gripR);
    this.arms[0].rotation.z = lerp(lerp(-p.air * 0.7 - fl * 0.8 - p.brake * 0.3 - spread, sit ? -0.3 : -1.5, gb), 0, grip);
    this.arms[1].rotation.z = lerp(lerp(p.air * 0.7 + fl * 0.8 + p.brake * 0.3 + spread, sit ? 0.5 : -0.25, gb), 0, gripR);
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
    for (const leg of this.legs) leg.position.y = 0.72;
    if (s.ride) this.poseRide(s.ride, fl);
    this.torso.position.y -= p.landing * (this.sit ? 0.07 : 0.20);
    this.torso.rotation.x -= p.landing * 0.18;
    const compression = 1 - p.landing * (this.sit ? 0.045 : 0.23);
    for (const leg of this.legs) {
      leg.scale.y = compression;
      leg.position.y *= compression;
    }

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

  poseRide({ board, edge, skid, powder }, flail) {
    const pressure = Math.abs(edge);
    const slide = Math.abs(skid);
    this.inner.rotation.z += this.pose.lean * 0.42 * (1 - flail);
    this.inner.rotation.z -= edge * (board ? 0.52 : 0.32) + skid * 0.13;
    this.inner.rotation.y = -skid * (board ? 0.60 : 0.51);
    this.torso.position.y = 0.7 - pressure * 0.055 - slide * 0.10 - powder * 0.035;
    if (board) {
      // 左脚在前，脚尖朝横向。趾刃屈膝朝板前侧压，跟刃向后坐。
      const toes = Math.max(0, edge);
      const heels = Math.max(0, -edge);
      this.torso.rotation.y = -0.93 + edge * 0.16 + skid * 0.26;
      this.torso.rotation.x += -toes * 0.24 + heels * 0.3;
      this.head.rotation.y = 0.81 - edge * 0.13;
      for (let i = 0; i < 2; i++) {
        const front = i === 0;
        const leg = this.legs[i];
        leg.position.x = front ? -0.036 : 0.036;
        leg.position.z = front ? -0.29 : 0.45;
        leg.rotation.y = front ? -1.02 : -1.43;
        leg.rotation.x += (front ? 0.15 : 0.24) * heels - toes * 0.08;
        leg.rotation.z = -edge * (front ? 0.11 : 0.19);
      }
      this.arms[0].rotation.x += 0.30 + toes * 0.25;
      this.arms[1].rotation.x -= 0.21 + heels * 0.23;
    } else {
      // 双板在外侧脚承重，内腿收一点，肩膀比雪板更平。
      this.torso.rotation.z += edge * 0.23;
      this.torso.position.x = edge * 0.045;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const inside = Math.max(0, edge * side);
        this.legs[i].position.y = 0.72 + inside * 0.052;
        this.legs[i].rotation.x += inside * 0.12;
        this.skis[i].position.z = -inside * 0.067;
        this.skis[i].rotation.z = -edge * 0.20;
        this.arms[i].rotation.x += inside * 0.17;
      }
    }
  }

  // 披风、围巾、队旗随速度飘，翅膀在空中扇，火箭背包加速时喷火
  animateExtras(dt, s) {
    const t = this.t;
    const v = clamp(s.speed / 35, 0, 1);
    if (this.cape) this.cape.rotation.x = -(0.2 + v * 1.0) + Math.sin(t * 13) * 0.07 * (0.3 + v);
    if (this.scarfTail) {
      this.scarfTail.rotation.x = 1.2 - v * 1.35 + Math.sin(t * 17) * 0.12 * v; // 站着时垂在背后，越快越往后飘
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
    // 独立模型上会动的零件
    if (this.bob) this.inner.position.y = this.innerY + this.bob * (1 + Math.sin(t * 3.1));
    const fx = this.gearFx;
    if (!fx) return;
    for (const f of fx.flames) {
      f.visible = !!s.boost;
      if (f.visible) f.scale.z = f.userData.len * (0.7 + Math.random() * 0.6);
    }
    for (const g of fx.spin) g.rotation.y += g.userData.spin * dt;
    // 羽翼贴地时微微起伏，腾空就扇起来
    const flap = s.grounded ? 0.3 + Math.sin(t * 2) * 0.05 : 0.4 + Math.sin(t * 16) * 0.45;
    for (const w of fx.wings) w.o.rotation.z = w.s * flap;
    for (const f of fx.flags) f.rotation.y = Math.sin(t * 12) * 0.25 * (0.3 + v);
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
