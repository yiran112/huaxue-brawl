// 新滑行装备的精细模型。每件一套独立造型：放样出带翘头和腰线的板面、弯管、旋转体，
// 再加上固定器、悬挂、车灯这些细节。这里只管拼几何体；动画（喷火、转灯、扇翼、悬浮起伏）由 skier.js 驱动。
// 约定：-Z 是前方，+Y 朝上。坐着滑的载具用地面坐标（y = 0 是雪面）；
// 单板用脚底坐标（板面顶在 y = 0.04）；双板用单只脚的坐标（板面中心在 y = 0）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DARK = 0x20222a;
const STEEL = 0x9aa0ac;
const RUBBER = 0x15171c;
const HULL = 0x2b2f3a;
const CORD = 0xe8dcc0;

// 几何体只和造型有关、和颜色无关：每种零件全局只建一份，所有角色共用
const geos = new Map();
function geo(key, make) {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  cone: new THREE.ConeGeometry(1, 1, 14),
};

// 发光的光晕和尾焰不受光照，材质全局共用
const glowMats = new Map();
function glowMat(color, opacity) {
  const key = color + ':' + opacity;
  let m = glowMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    glowMats.set(key, m);
  }
  return m;
}
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85, depthWrite: false });

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function put(parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const box = (p, mat, w, h, d, x, y, z) => put(p, PRIM.box, mat, x, y, z, w, h, d);
const ball = (p, mat, rx, ry, rz, x, y, z) => put(p, PRIM.sphere, mat, x, y, z, rx, ry, rz);
// 不投影子的小零件（光晕、玻璃）
const soft = (m) => {
  m.castShadow = false;
  return m;
};

// 两点之间的一根圆杆
function strut(p, mat, a, b, r) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const m = put(p, PRIM.cyl, mat);
  m.scale.set(r, _a.distanceTo(_b), r);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _b.sub(_a).normalize());
  return m;
}
// 顺着前后方向的圆筒
const rod = (p, mat, r, len, x, y, z) => strut(p, mat, [x, y, z - len / 2], [x, y, z + len / 2], r);

// 穿过一串点的弯管
function pipeGeo(pts, r, seg = 32, sides = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, seg, r, sides, false);
}
// 左半边的点（最后一个在中线上）补成左右对称的一整条
const mirrorX = (pts) => pts.concat(pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z]));

// 旋转体。轮廓 [半径, 高度] 要从底部中心往外、再绕到顶上回来，面才朝外
const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// 一块有厚度的平板。upright：侧面轮廓（X 朝前、Y 朝上）立着放；否则是俯视轮廓（X 朝右、Y 朝前）平着放
function plateGeo(pts, depth, upright) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return upright ? g.rotateY(Math.PI / 2) : g.rotateX(-Math.PI / 2);
}

// 把一个小零件绕一圈复制 count 份，合成一个几何体
function ringOf(base, count, radius, phase = 0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    parts.push(base.clone().translate(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  return mergeGeometries(parts);
}

// 放样：沿侧面轮廓线摆一串截面，连成一块板。
// 截面：{ z, y 中心线位置, w 宽, th 厚, x 左右偏移, off 沿板面法线抬高多少 }。
// 厚度方向跟着轮廓线的法线走，所以能做出翘头和卷起来的橇头。顶、底、两侧各用一套顶点，棱是硬的。
function loftGeo(list) {
  const st = list[0].z < list[list.length - 1].z ? list.slice().reverse() : list;
  const n = st.length;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const s = st[i];
    const p = st[Math.max(0, i - 1)];
    const q = st[Math.min(n - 1, i + 1)];
    let tz = q.z - p.z;
    let ty = q.y - p.y;
    const len = Math.hypot(tz, ty) || 1;
    tz /= len;
    ty /= len;
    const ny = -tz;
    const nz = ty;
    const off = s.off || 0;
    const x = s.x || 0;
    const y = s.y + ny * off;
    const z = s.z + nz * off;
    const hw = s.w / 2;
    const ht = s.th / 2;
    // 左上、右上、右下、左下
    ring.push([
      [x - hw, y + ny * ht, z + nz * ht],
      [x + hw, y + ny * ht, z + nz * ht],
      [x + hw, y - ny * ht, z - nz * ht],
      [x - hw, y - ny * ht, z - nz * ht],
    ]);
  }
  const pos = [];
  const idx = [];
  for (let k = 0; k < 4; k++) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) pos.push(...ring[i][k], ...ring[i][(k + 1) % 4]);
    for (let i = 0; i < n - 1; i++) {
      const a0 = base + i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  // 两头封口
  for (const [i, front] of [[0, false], [n - 1, true]]) {
    const base = pos.length / 3;
    for (let k = 0; k < 4; k++) pos.push(...ring[i][k]);
    if (front) idx.push(base, base + 2, base + 3, base, base + 1, base + 2);
    else idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const sample = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
// 两头密、中间疏：板头板尾的圆角多几个截面才圆
const sampleEnds = (n, f) => sample(n, (u) => f(0.5 - 0.5 * Math.cos(Math.PI * u)));

// 一块滑雪板的截面：t 从板尾 0 到板头 1。两头宽、中间收腰，头尾按各自的长度往上翘
function skiStations({ tail, nose, w, waist, tailKick = 0, noseKick = 0, tailLen = 0.16, noseLen = 0.22, th = 0.03, n = 24, y = 0 }) {
  return sampleEnds(n, (t) => {
    const a = Math.max(0, 1 - t / tailLen);
    const b = Math.max(0, (t - (1 - noseLen)) / noseLen);
    const round = Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 3.5));
    return { t, z: tail + (nose - tail) * t, y: y + tailKick * a * a + noseKick * b * b, w: (waist + (w - waist) * (2 * t - 1) ** 2) * round, th };
  });
}

// 贴在板面上的一条薄色带：沿用板子的截面，收窄后抬到顶面上。t0 ~ t1 是色带覆盖的范围
function inlay(st, k, t0 = 0, t1 = 1, up = 0.003) {
  return st
    .filter((s) => s.t === undefined || (s.t >= t0 && s.t <= t1))
    .map((s) => ({ ...s, w: s.w * k, th: 0.008, off: (s.off || 0) + s.th / 2 + up }));
}

// 垫在板底的一层（钢边、底板）：grow 是比板面宽出多少，负数就是收窄
function under(st, grow, th) {
  return st.map((s) => ({ ...s, w: Math.max(0, s.w + grow * Math.min(1, s.w / 0.05)), th, off: (s.off || 0) - s.th / 2 - th / 2 + 0.003 }));
}

// 加速时才亮的尾焰：尖头朝后
function flame(p, fx, x, y, z, r, len) {
  const g = geo('flame', () => new THREE.ConeGeometry(1, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5));
  const m = soft(put(p, g, flameMat, x, y, z, r, r, len));
  m.visible = false;
  m.userData.len = len;
  fx.flames.push(m);
}

// 一件装备用到的材质和动画零件表。lam 是 skier.js 的材质缓存；ground 是雪面在当前坐标里的高度
export function gearKit(lam, main, trim, ground = 0) {
  return {
    m: lam,
    main: lam(main),
    trim: lam(trim),
    lit: lam(trim, { emissive: trim, emissiveIntensity: 0.7 }),
    dark: lam(DARK),
    steel: lam(STEEL),
    rubber: lam(RUBBER),
    white: lam(0xffffff, { emissive: 0xfff2c8, emissiveIntensity: 0.8 }),
    red: lam(0xff3030, { emissive: 0xff2020, emissiveIntensity: 0.8 }),
    glass: lam(0xbfe8ff, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    trimColor: trim,
    ground,
    // flames：加速时喷火；spin：一直转的灯圈；wings：{ o, s } 腾空时扇动；flags：随速度飘
    fx: { flames: [], spin: [], wings: [], flags: [] },
  };
}

// ---------- 双板 ----------

// 高山固定器：底板、前夹、后跟、扳手，brakes 再加两根止滑器
function skiBinding(g, c, heel, brakes) {
  box(g, c.dark, 0.12, 0.016, 0.44, 0, 0.022, 0.03);
  box(g, c.steel, 0.11, 0.05, 0.07, 0, 0.05, -0.19);
  box(g, heel, 0.1, 0.075, 0.09, 0, 0.06, 0.245);
  box(g, c.dark, 0.05, 0.02, 0.11, 0, 0.11, 0.3).rotation.x = -0.5;
  if (brakes) for (const s of [-1, 1]) strut(g, c.steel, [s * 0.075, 0.03, 0.14], [s * 0.085, 0.07, 0.33], 0.008);
}

// 雪刃短板：一米出头的双翘短板，不用雪杖
const BLADE = { tail: 0.5, nose: -0.62, w: 0.14, waist: 0.112, tailKick: 0.07, noseKick: 0.12, tailLen: 0.24, noseLen: 0.28, n: 22 };
function blades(g, c) {
  put(g, geo('blade', () => loftGeo(skiStations(BLADE))), c.main);
  put(g, geo('blade.top', () => loftGeo(inlay(skiStations(BLADE), 0.5, 0.14, 0.86))), c.trim);
  put(g, geo('blade.edge', () => loftGeo(under(skiStations(BLADE), 0.012, 0.01))), c.steel);
  skiBinding(g, c, c.trim, false);
}

// 自由式双翘板：头尾都翘得高，板面两层色带，钢边，带止滑器的固定器
const TWIN = { tail: 0.84, nose: -0.98, w: 0.136, waist: 0.104, tailKick: 0.11, noseKick: 0.15, tailLen: 0.15, noseLen: 0.19, n: 30 };
function twin(g, c) {
  put(g, geo('twin', () => loftGeo(skiStations(TWIN))), c.main);
  put(g, geo('twin.top', () => loftGeo(inlay(skiStations(TWIN), 0.58, 0.1, 0.9))), c.trim);
  put(g, geo('twin.line', () => loftGeo(inlay(skiStations(TWIN), 0.16, 0.18, 0.82, 0.011))), c.m(0xffffff));
  put(g, geo('twin.edge', () => loftGeo(under(skiStations(TWIN), 0.012, 0.01))), c.steel);
  skiBinding(g, c, c.trim, true);
}

// 机甲双板：宽板身 + 前后装甲 + 发光能量槽，板尾各背一台推进器
const MECH = { tail: 0.78, nose: -1.06, w: 0.2, waist: 0.17, tailKick: 0.04, noseKick: 0.2, tailLen: 0.1, noseLen: 0.22, th: 0.035, n: 28 };
function mech(g, c) {
  put(g, geo('mech', () => loftGeo(skiStations(MECH))), c.dark);
  put(g, geo('mech.edge', () => loftGeo(under(skiStations(MECH), 0.018, 0.012))), c.lit);
  const front = geo('mech.front', () =>
    loftGeo([
      { z: -0.22, y: 0.03, w: 0.15, th: 0.045 },
      { z: -0.4, y: 0.045, w: 0.18, th: 0.07 },
      { z: -0.62, y: 0.045, w: 0.17, th: 0.07 },
      { z: -0.84, y: 0.07, w: 0.1, th: 0.035 },
    ])
  );
  const rear = geo('mech.rear', () =>
    loftGeo([
      { z: 0.74, y: 0.035, w: 0.12, th: 0.04 },
      { z: 0.6, y: 0.045, w: 0.17, th: 0.07 },
      { z: 0.36, y: 0.045, w: 0.17, th: 0.07 },
      { z: 0.26, y: 0.035, w: 0.15, th: 0.045 },
    ])
  );
  put(g, front, c.main);
  put(g, rear, c.main);
  box(g, c.lit, 0.035, 0.012, 0.2, 0, 0.083, -0.51);
  box(g, c.lit, 0.035, 0.012, 0.2, 0, 0.083, 0.48);
  // 板头的撞角
  put(g, PRIM.cone, c.lit, 0, 0.21, -1.0, 0.035, 0.2, 0.035).rotation.x = -1.1;
  // 推进器：筒身、喷口、发光的芯、背鳍
  rod(g, c.steel, 0.05, 0.26, 0, 0.13, 0.64);
  rod(g, c.dark, 0.058, 0.05, 0, 0.13, 0.78);
  ball(g, c.lit, 0.04, 0.04, 0.02, 0, 0.13, 0.805);
  put(g, geo('mech.fin', () => plateGeo([[0, 0], [-0.2, 0], [-0.26, 0.12]], 0.012, true)), c.trim, 0, 0.18, 0.56);
  flame(g, c.fx, 0, 0.13, 0.81, 0.045, 0.4);
  // 夹住靴子的装甲固定器
  box(g, c.dark, 0.14, 0.016, 0.42, 0, 0.022, 0.03);
  for (const s of [-1, 1]) box(g, c.main, 0.02, 0.09, 0.3, s * 0.1, 0.06, 0.02);
  box(g, c.steel, 0.13, 0.05, 0.06, 0, 0.05, -0.19);
  box(g, c.lit, 0.1, 0.07, 0.07, 0, 0.06, 0.235);
}

// ---------- 单板 ----------

// 绑带固定器：底盘、高背板、脚背和脚趾两条绑带
function strapBinding(v, c, x, z, mat) {
  box(v, c.dark, 0.2, 0.02, 0.36, x, 0.05, z);
  box(v, mat, 0.17, 0.24, 0.025, x, 0.18, z + 0.205).rotation.x = 0.16;
  const strap = geo('strap', () => new THREE.TorusGeometry(0.135, 0.015, 6, 12, Math.PI));
  put(v, strap, mat, x, 0.06, z - 0.09, 0.75, 1.55, 2.6);
  put(v, strap, mat, x, 0.06, z + 0.07, 0.75, 1.55, 2.6);
}

// 鱼尾粉雪板：宽而翘的圆板头，板尾分成燕尾
const fishBody = () =>
  sample(28, (u) => {
    const t = 1 - (1 - u) ** 1.7;
    const b = Math.max(0, (t - 0.55) / 0.45);
    const wide = 0.5 + 0.1 * Math.sin((Math.PI / 2) * Math.min(1, t / 0.6));
    return { t, z: 0.4 - 1.38 * t, y: 0.02 + 0.17 * b * b, w: wide * Math.sqrt(Math.min(1, (1 - t) * 4.5)), th: 0.04 };
  });
// 右边那一瓣燕尾：外沿接着板身，内沿斜着收成尖
const fishTail = () => sample(8, (t) => ({ t, z: 0.4 + 0.36 * t, y: 0.02 + 0.03 * t * t, x: (0.25 + 0.21 * t) / 2, w: 0.25 - 0.25 * t, th: 0.04 }));
function fish(v, c) {
  put(v, geo('fish', () => loftGeo(fishBody())), c.main);
  put(v, geo('fish.edge', () => loftGeo(under(fishBody(), 0.014, 0.012))), c.steel);
  put(v, geo('fish.line', () => loftGeo(inlay(fishBody(), 0.14, 0, 0.72))), c.trim);
  put(v, geo('fish.nose', () => loftGeo(inlay(fishBody(), 0.78, 0.72, 0.985))), c.trim);
  const tail = geo('fish.tail', () => loftGeo(fishTail()));
  const tip = geo('fish.tip', () => loftGeo(inlay(fishTail(), 0.7, 0.35, 1)));
  for (const s of [-1, 1]) {
    put(v, tail, c.main).scale.x = s;
    put(v, tip, c.trim).scale.x = s;
    strapBinding(v, c, s * 0.17, 0.02, c.trim);
  }
}

// 悬浮滑板：圆头厚板，板底两台发光的悬浮器，板尾一对小推进器
const hoverDeck = () =>
  sampleEnds(30, (t) => {
    const a = Math.max(0, 1 - t / 0.12);
    const b = Math.max(0, (t - 0.88) / 0.12);
    return { t, z: 0.74 - 1.52 * t, y: 0.01 + 0.035 * (a * a + b * b), w: 0.56 * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 4)), th: 0.06 };
  });
function hover(v, c) {
  put(v, geo('hover', () => loftGeo(hoverDeck())), c.main);
  put(v, geo('hover.belly', () => loftGeo(under(hoverDeck(), -0.14, 0.04))), c.dark);
  put(v, geo('hover.pad', () => loftGeo(inlay(hoverDeck(), 0.62, 0.16, 0.84))), c.rubber);
  // 板面两侧的灯条
  const rail = geo('hover.rail', () => loftGeo(hoverDeck().filter((s) => s.t > 0.14 && s.t < 0.86).map((s) => ({ ...s, x: s.w / 2 - 0.035, w: 0.024, th: 0.01, off: s.th / 2 + 0.004 }))));
  const ring = geo('hover.ring', () => new THREE.TorusGeometry(0.16, 0.022, 8, 28).rotateX(Math.PI / 2));
  const disc = geo('disc', () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
  const fin = geo('hover.fin', () => plateGeo([[0, 0], [-0.2, 0], [-0.26, 0.16], [-0.15, 0.16]], 0.014, true));
  for (const z of [-0.44, 0.42]) {
    put(v, PRIM.cyl, c.dark, 0, -0.08, z, 0.2, 0.05, 0.2);
    put(v, ring, c.lit, 0, -0.105, z);
    soft(put(v, disc, glowMat(c.trimColor, 0.6), 0, -0.106, z, 0.15));
    // 雪面上被照亮的一圈
    soft(put(v, disc, glowMat(c.trimColor, 0.28), 0, c.ground + 0.012, z, 0.32));
  }
  for (const s of [-1, 1]) {
    put(v, rail, c.lit).scale.x = s;
    rod(v, c.steel, 0.04, 0.18, s * 0.15, -0.035, 0.66);
    flame(v, c.fx, s * 0.15, -0.035, 0.75, 0.035, 0.32);
    box(v, c.trim, 0.17, 0.05, 0.03, s * 0.17, 0.065, 0.215);
    put(v, fin, c.trim, s * 0.21, 0.04, 0.46);
  }
  box(v, c.white, 0.26, 0.014, 0.03, 0, 0.047, -0.56);
}

// 凤凰翼板：尖喙板头，两侧三层羽翼，板尾一把尾羽
const phoenixDeck = () =>
  sample(30, (u) => {
    const t = 1 - (1 - u) ** 1.5;
    const a = Math.max(0, 1 - t / 0.12);
    const b = Math.max(0, (t - 0.6) / 0.4);
    const w = t < 0.45 ? 0.3 + 0.26 * Math.sin((Math.PI / 2) * (t / 0.45)) : 0.56 * (1 - ((t - 0.45) / 0.55) ** 1.7);
    return { t, z: 0.7 - 1.7 * t, y: 0.02 + 0.16 * b * b + 0.04 * a * a, w, th: 0.04 };
  });
function phoenix(v, c) {
  put(v, geo('phx', () => loftGeo(phoenixDeck())), c.main);
  put(v, geo('phx.edge', () => loftGeo(under(phoenixDeck(), 0.024, 0.014))), c.trim);
  put(v, geo('phx.spine', () => loftGeo(inlay(phoenixDeck(), 0.16, 0.04, 0.9))), c.lit);
  // 喙和眼睛
  put(v, PRIM.cone, c.trim, 0, 0.19, -1.04, 0.035, 0.16, 0.03).rotation.x = -1.37;
  for (const s of [-1, 1]) ball(v, c.white, 0.022, 0.022, 0.022, s * 0.05, 0.145, -0.84);
  // 一片羽毛：根在原点，往右伸、往后掠
  const feather = geo('phx.feather', () => plateGeo([[0, 0.09], [0.26, 0.1], [0.62, -0.1], [0.72, -0.3], [0.42, -0.2], [0, -0.1]], 0.018, false));
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.27, 0.06, 0.12);
    w.scale.x = s;
    w.rotation.z = s * 0.3;
    put(w, feather, c.trim);
    put(w, feather, c.main, 0, -0.014, 0.15, 0.8);
    put(w, feather, c.trim, 0, -0.028, 0.28, 0.62);
    v.add(w);
    c.fx.wings.push({ o: w, s });
    // 尾羽：外侧一对短的，中间一对长的，左右对称地往外掠
    const side = put(v, feather, c.trim, 0, 0.07, 0.6, 0.85, 0.85, -s * 0.85);
    side.rotation.set(-0.3, -Math.PI / 2 + s * 0.45, 0);
    const mid = put(v, feather, c.main, 0, 0.078, 0.6, 1.05, 1.05, -s * 1.05);
    mid.rotation.set(-0.36, -Math.PI / 2 + s * 0.13, 0);
    flame(v, c.fx, s * 0.08, 0.03, 0.7, 0.04, 0.38);
    strapBinding(v, c, s * 0.17, 0.02, c.trim);
  }
}

// ---------- 坐着滑的载具 ----------

// 托博根长橇：五条木板并排，橇头整个卷起来，用绳子拉住
const tobSlat = () => {
  const st = sample(6, (t) => ({ z: 0.78 - 1.58 * t, y: 0.045, w: 0.116, th: 0.028 }));
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * 3.4;
    st.push({ z: -0.8 - 0.28 * Math.sin(a), y: 0.325 - 0.28 * Math.cos(a), w: 0.116, th: 0.028 });
  }
  return st;
};
function toboggan(v, c) {
  const slat = geo('tob.slat', () => loftGeo(tobSlat()));
  for (let i = 0; i < 5; i++) put(v, slat, i % 2 ? c.trim : c.main, (i - 2) * 0.128);
  const wood = c.m(0x7a5230);
  const cord = c.m(CORD);
  for (const z of [0.64, 0.22, -0.26, -0.64]) box(v, wood, 0.66, 0.035, 0.06, 0, 0.077, z);
  box(v, wood, 0.66, 0.04, 0.05, 0, 0.572, -0.8);
  const rail = geo('tob.rail', () => pipeGeo([[0.335, 0.07, 0.74], [0.335, 0.19, 0.54], [0.335, 0.2, 0.1], [0.335, 0.19, -0.3], [0.335, 0.07, -0.52]], 0.017, 20, 6));
  for (const s of [-1, 1]) {
    put(v, rail, wood).scale.x = s;
    strut(v, cord, [s * 0.31, 0.56, -0.8], [s * 0.31, 0.09, -0.26], 0.011);
  }
  // 拉绳搭在橇面上
  put(v, geo('tob.rope', () => pipeGeo([[-0.31, 0.09, -0.26], [-0.16, 0.105, -0.2], [0, 0.105, -0.16], [0.16, 0.105, -0.2], [0.31, 0.09, -0.26]], 0.013, 20, 6)), cord);
  box(v, c.m(0xb8323a), 0.5, 0.07, 0.62, 0, 0.095, 0.2);
}

// 雪地飞碟：一只浅碟，碟沿包边、一圈铆钉，中间是坐垫，两侧有把手，碟沿前面拴着牵引绳
function saucer(v, c) {
  const d = new THREE.Group();
  d.position.z = -0.08;
  v.add(d);
  const dish = [[0, 0.02], [0.3, 0.03], [0.55, 0.08], [0.7, 0.16], [0.78, 0.25], [0.8, 0.3], [0.775, 0.325], [0.74, 0.3], [0.68, 0.22], [0.52, 0.135], [0.3, 0.09], [0, 0.08]];
  put(d, geo('saucer', () => lathe(dish, 40)), c.main);
  put(d, geo('saucer.rim', () => new THREE.TorusGeometry(0.787, 0.03, 8, 44).rotateX(Math.PI / 2)), c.trim, 0, 0.305, 0);
  put(d, geo('saucer.band', () => lathe([[0.69, 0.238], [0.6, 0.181], [0.54, 0.149]], 40)), c.trim);
  put(d, geo('saucer.seat', () => lathe([[0, 0.085], [0.3, 0.085], [0.34, 0.112], [0.3, 0.14], [0, 0.145]], 28)), c.rubber);
  put(d, geo('saucer.studs', () => ringOf(new THREE.SphereGeometry(0.022, 8, 6), 12, 0.716)), c.steel, 0, 0.27, 0);
  const handle = geo('saucer.handle', () => new THREE.TorusGeometry(0.09, 0.018, 6, 12, Math.PI).rotateY(Math.PI / 2));
  for (const s of [-1, 1]) put(d, handle, c.dark, s * 0.62, 0.19, 0);
  // 牵引绳从碟沿顺着碟面搭下来，把手落在两脚之间
  put(v, geo('saucer.leash', () => pipeGeo([[0, 0.33, -0.87], [0, 0.225, -0.72], [0, 0.15, -0.56], [0, 0.13, -0.44]], 0.012, 16, 5)), c.m(CORD));
  strut(v, c.dark, [-0.08, 0.13, -0.43], [0.08, 0.13, -0.43], 0.018);
}

// 雪地单车：前后两块短雪板，三角车架加整流罩，前叉带避震，弯把、鞍座、脚踏
function bike(v, c) {
  const S = [0, 0.5, 0.2]; // 鞍座下
  const HT = [0, 0.76, -0.5]; // 头管上
  const HB = [0, 0.6, -0.56]; // 头管下
  const BB = [0, 0.22, -0.12]; // 车架最低点
  const RM = [0, 0.1, 0.36]; // 后板的座
  const rearSki = { tail: 0.8, nose: -0.12, w: 0.17, waist: 0.15, tailKick: 0.02, noseKick: 0.1, noseLen: 0.3, n: 18, y: 0.02 };
  const frontSki = { tail: -0.42, nose: -1.24, w: 0.17, waist: 0.15, noseKick: 0.15, noseLen: 0.32, n: 18, y: 0.02 };
  put(v, geo('bike.rear', () => loftGeo(skiStations(rearSki))), c.main);
  put(v, geo('bike.rear.top', () => loftGeo(inlay(skiStations(rearSki), 0.4, 0.15, 0.8))), c.trim);
  put(v, geo('bike.front', () => loftGeo(skiStations(frontSki))), c.main);
  put(v, geo('bike.front.top', () => loftGeo(inlay(skiStations(frontSki), 0.4, 0.15, 0.8))), c.trim);
  box(v, c.dark, 0.07, 0.08, 0.18, 0, 0.075, 0.36);
  box(v, c.dark, 0.07, 0.08, 0.16, 0, 0.075, -0.84);
  // 车架
  strut(v, c.trim, S, HT, 0.035);
  strut(v, c.trim, HB, BB, 0.04);
  strut(v, c.trim, BB, S, 0.033);
  strut(v, c.trim, BB, RM, 0.028);
  strut(v, c.trim, S, RM, 0.026);
  strut(v, c.dark, [0, 0.8, -0.485], [0, 0.56, -0.575], 0.05);
  put(v, geo('bike.fairing', () => plateGeo([[-0.16, 0.47], [0.47, 0.71], [0.5, 0.6], [0.14, 0.27], [-0.06, 0.3]], 0.075, true)), c.main);
  // 前叉和避震
  for (const s of [-1, 1]) strut(v, c.steel, [s * 0.06, 0.62, -0.555], [s * 0.05, 0.1, -0.84], 0.022);
  strut(v, c.m(0xe0263c), [0, 0.52, -0.61], [0, 0.3, -0.73], 0.04);
  // 鞍座、后挡泥板、尾灯
  ball(v, c.rubber, 0.11, 0.05, 0.27, 0, 0.51, 0.2);
  box(v, c.main, 0.12, 0.02, 0.34, 0, 0.44, 0.52).rotation.x = -0.25;
  ball(v, c.red, 0.03, 0.03, 0.03, 0, 0.485, 0.69);
  // 车把
  strut(v, c.steel, [0, 0.78, -0.49], [0, 0.845, -0.47], 0.028);
  put(v, geo('bike.bar', () => pipeGeo([[-0.39, 0.8, -0.36], [-0.22, 0.84, -0.44], [0, 0.845, -0.47], [0.22, 0.84, -0.44], [0.39, 0.8, -0.36]], 0.02, 20, 8)), c.steel);
  for (const s of [-1, 1]) strut(v, c.rubber, [s * 0.4, 0.797, -0.355], [s * 0.3, 0.827, -0.405], 0.03);
  // 号码牌
  const plate = new THREE.Group();
  plate.position.set(0, 0.69, -0.6);
  plate.rotation.x = 0.2;
  box(plate, c.m(0xf4f4f4), 0.2, 0.17, 0.02, 0, 0, 0);
  box(plate, c.trim, 0.11, 0.07, 0.02, 0, 0, -0.004);
  v.add(plate);
  // 脚踏
  strut(v, c.steel, [-0.27, 0.12, -0.29], [0.27, 0.12, -0.29], 0.02);
  strut(v, c.trim, BB, [0, 0.12, -0.29], 0.024);
}

// 雪地冲锋艇：一圈 U 形气囊、尖船头，船底两条滑橇，艇尾插一面小旗
function raft(v, c) {
  const hull = c.m(HULL);
  put(v, geo('raft.tube', () => pipeGeo(mirrorX([[-0.47, 0.2, 0.66], [-0.48, 0.2, 0.1], [-0.44, 0.21, -0.5], [-0.25, 0.27, -0.95], [0, 0.33, -1.14]]), 0.17, 56, 12)), c.main);
  put(v, geo('raft.strake', () => pipeGeo(mirrorX([[-0.63, 0.24, 0.62], [-0.64, 0.24, 0.1], [-0.59, 0.25, -0.53], [-0.34, 0.31, -1.06], [0, 0.37, -1.3]]), 0.03, 56, 6)), c.trim);
  const rope = [[-0.47, 0.385, 0.6], [-0.48, 0.41, 0.35], [-0.48, 0.385, 0.1], [-0.47, 0.415, -0.2], [-0.44, 0.395, -0.5], [-0.36, 0.44, -0.75], [-0.25, 0.455, -0.95], [0, 0.515, -1.14]];
  put(v, geo('raft.rope', () => pipeGeo(mirrorX(rope), 0.012, 64, 5)), c.m(CORD));
  put(v, geo('raft.floor', () => plateGeo([[-0.45, -0.66], [0.45, -0.66], [0.45, 0.5], [0.22, 0.95], [0, 1.1], [-0.22, 0.95], [-0.45, 0.5]], 0.06, false)), hull, 0, 0.07, 0);
  box(v, hull, 0.62, 0.24, 0.05, 0, 0.2, 0.66);
  const runner = geo('raft.runner', () => loftGeo(skiStations({ tail: 0.7, nose: -0.95, w: 0.13, waist: 0.12, noseKick: 0.16, noseLen: 0.25, n: 18, y: 0.02 })));
  for (const s of [-1, 1]) {
    // 艇尾的锥形气囊头
    put(v, PRIM.cone, c.trim, s * 0.47, 0.2, 0.79, 0.17, 0.26, 0.17).rotation.x = Math.PI / 2;
    put(v, runner, c.steel, s * 0.3);
  }
  // 坐垫、靠背气囊、船头的挡雪板和提手
  box(v, c.trim, 0.42, 0.07, 0.42, 0, 0.135, 0.16);
  strut(v, c.main, [-0.4, 0.27, 0.46], [0.4, 0.27, 0.46], 0.1);
  put(v, geo('raft.dodger', () => plateGeo([[-0.3, 0.62], [0.3, 0.62], [0, 1.04]], 0.02, false)), c.trim, 0, 0.28, 0).rotation.x = 0.2;
  put(v, geo('raft.handle', () => new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI)), c.dark, 0, 0.5, -1.13);
  // 小旗
  strut(v, c.steel, [0.3, 0.36, 0.64], [0.3, 0.98, 0.7], 0.012);
  c.fx.flags.push(put(v, geo('raft.flag', () => plateGeo([[0, 0], [0, 0.16], [-0.3, 0.08]], 0.012, true)), c.trim, 0.3, 0.8, 0.69));
}

// 雪怪摩托：后面一条履带、前面两块转向雪板，流线机罩、风挡、车灯、双排气
function mobile(v, c) {
  // 履带和负重轮
  put(v, geo('mobile.track', () => new THREE.CapsuleGeometry(0.115, 0.72, 4, 12).rotateX(Math.PI / 2)), c.rubber, 0, 0.115, 0.42, 1.45, 1, 1);
  for (const z of [0.08, 0.42, 0.76]) strut(v, c.steel, [-0.19, 0.085, z], [0.19, 0.085, z], 0.06);
  box(v, c.main, 0.38, 0.14, 0.9, 0, 0.3, 0.45);
  // 坐垫和尾箱
  const seat = [
    { z: 0.82, y: 0.46, w: 0.3, th: 0.1 },
    { z: 0.62, y: 0.455, w: 0.34, th: 0.13 },
    { z: 0.2, y: 0.43, w: 0.34, th: 0.12 },
    { z: -0.04, y: 0.415, w: 0.24, th: 0.1 },
  ];
  put(v, geo('mobile.seat', () => loftGeo(seat)), c.rubber);
  put(v, geo('mobile.seat.line', () => loftGeo(inlay(seat, 0.2))), c.trim);
  box(v, c.main, 0.36, 0.17, 0.22, 0, 0.46, 0.86);
  box(v, c.red, 0.26, 0.05, 0.02, 0, 0.48, 0.975);
  put(v, geo('mobile.bumper', () => pipeGeo([[-0.2, 0.4, 0.78], [-0.22, 0.45, 1.0], [0, 0.46, 1.07], [0.22, 0.45, 1.0], [0.2, 0.4, 0.78]], 0.02, 20, 6)), c.steel);
  box(v, c.trim, 0.34, 0.18, 0.02, 0, 0.17, 0.98).rotation.x = -0.3;
  // 两腿之间的油箱
  const tank = [
    { z: -0.02, y: 0.37, w: 0.13, th: 0.26 },
    { z: -0.3, y: 0.38, w: 0.13, th: 0.3 },
    { z: -0.58, y: 0.42, w: 0.26, th: 0.36 },
  ];
  put(v, geo('mobile.tank', () => loftGeo(tank)), c.main);
  // 车头：深色底壳托着流线形机罩，机罩一直接到仪表台；中间一道装饰条，顶上两个进气口
  const pan = [
    { z: -0.3, y: 0.2, w: 0.42, th: 0.16 },
    { z: -0.62, y: 0.21, w: 0.68, th: 0.2 },
    { z: -1.15, y: 0.21, w: 0.68, th: 0.2 },
    { z: -1.38, y: 0.24, w: 0.42, th: 0.14 },
    { z: -1.5, y: 0.28, w: 0.2, th: 0.06 },
  ];
  put(v, geo('mobile.pan', () => loftGeo(pan)), c.dark);
  ball(v, c.main, 0.34, 0.24, 0.5, 0, 0.36, -0.92);
  ball(v, c.trim, 0.085, 0.246, 0.507, 0, 0.36, -0.92);
  box(v, c.dark, 0.22, 0.05, 0.03, 0, 0.3, -1.405);
  for (const s of [-1, 1]) box(v, c.dark, 0.06, 0.035, 0.18, s * 0.2, 0.552, -0.86);
  // 风挡、仪表台、车把
  const shield = soft(put(v, geo('mobile.shield', () => new THREE.CylinderGeometry(0.27, 0.33, 0.36, 14, 1, true, Math.PI - 1, 2)), c.glass, 0, 0.73, -0.42));
  shield.rotation.x = 0.3;
  box(v, c.dark, 0.34, 0.07, 0.14, 0, 0.6, -0.58);
  strut(v, c.steel, [0, 0.56, -0.6], [0, 0.775, -0.5], 0.025);
  put(v, geo('mobile.bar', () => pipeGeo([[-0.39, 0.745, -0.385], [-0.22, 0.775, -0.47], [0, 0.78, -0.5], [0.22, 0.775, -0.47], [0.39, 0.745, -0.385]], 0.022, 20, 8)), c.rubber);
  const ski = geo('mobile.ski', () => loftGeo(skiStations({ tail: -0.62, nose: -1.56, w: 0.14, waist: 0.12, noseKick: 0.16, noseLen: 0.25, n: 18, y: 0.02 })));
  const loop = geo('mobile.loop', () => new THREE.TorusGeometry(0.06, 0.012, 6, 10, Math.PI).rotateY(Math.PI / 2));
  for (const s of [-1, 1]) {
    ball(v, c.white, 0.07, 0.045, 0.035, s * 0.16, 0.42, -1.335);
    box(v, c.trim, 0.11, 0.08, 0.02, s * 0.36, 0.75, -0.45);
    // 踏板
    box(v, c.dark, 0.2, 0.03, 0.64, s * 0.27, 0.095, -0.24);
    box(v, c.dark, 0.2, 0.1, 0.03, s * 0.27, 0.15, -0.55).rotation.x = -0.4;
    // 前悬挂：雪板、立柱、上下摆臂、避震
    put(v, ski, c.trim, s * 0.42);
    put(v, loop, c.steel, s * 0.42, 0.09, -1.47);
    strut(v, c.steel, [s * 0.42, 0.03, -1.02], [s * 0.42, 0.27, -1.0], 0.025);
    strut(v, c.steel, [s * 0.3, 0.19, -1.0], [s * 0.42, 0.14, -1.02], 0.02);
    strut(v, c.steel, [s * 0.28, 0.32, -0.98], [s * 0.42, 0.26, -1.0], 0.018);
    strut(v, c.m(0xffd23c), [s * 0.2, 0.48, -0.92], [s * 0.4, 0.17, -1.0], 0.035);
    // 排气管
    rod(v, c.steel, 0.04, 0.32, s * 0.235, 0.3, 0.78);
    flame(v, c.fx, s * 0.235, 0.3, 0.95, 0.035, 0.36);
  }
}

// 星环飞碟：离地悬浮的碟身，碟沿一圈光环，底下一圈会转的灯，后面两片尾翼
function ufo(v, c) {
  const u = new THREE.Group();
  u.position.z = 0.05;
  v.add(u);
  const hull = [[0, 0.18], [0.35, 0.19], [0.68, 0.26], [0.9, 0.33], [0.98, 0.375], [0.95, 0.4], [0.72, 0.41], [0.46, 0.43], [0.4, 0.43], [0.36, 0.41], [0.3, 0.4], [0, 0.4]];
  put(u, geo('ufo', () => lathe(hull, 44)), c.main);
  put(u, geo('ufo.rim', () => new THREE.TorusGeometry(0.97, 0.035, 8, 48).rotateX(Math.PI / 2)), c.lit, 0, 0.378, 0);
  put(u, geo('ufo.band', () => lathe([[0.7, 0.4155], [0.55, 0.427]], 44)), c.trim);
  put(u, geo('ufo.belly', () => lathe([[0, 0.07], [0.2, 0.09], [0.36, 0.15], [0.45, 0.215]], 32)), c.m(0x4a5263));
  ball(u, c.lit, 0.15, 0.045, 0.15, 0, 0.075, 0);
  // 碟底的灯圈：两种颜色交替，整圈慢慢转
  const lights = new THREE.Group();
  lights.userData.spin = 1.4;
  put(lights, geo('ufo.lamp0', () => ringOf(new THREE.SphereGeometry(0.045, 8, 6), 6, 0.84)), c.lit, 0, 0.305, 0);
  put(lights, geo('ufo.lamp1', () => ringOf(new THREE.SphereGeometry(0.045, 8, 6), 6, 0.84, Math.PI / 6)), c.white, 0, 0.305, 0);
  u.add(lights);
  c.fx.spin.push(lights);
  // 座舱：一圈软包、靠背、前面的风挡和操纵杆
  put(u, geo('ufo.coaming', () => new THREE.TorusGeometry(0.4, 0.028, 8, 32).rotateX(Math.PI / 2)), c.rubber, 0, 0.435, 0);
  put(u, geo('ufo.back', () => new THREE.TorusGeometry(0.37, 0.055, 8, 16, Math.PI * 0.9).rotateZ(Math.PI * 0.05).rotateX(Math.PI / 2)), c.trim, 0, 0.53, 0);
  soft(put(u, geo('ufo.shield', () => new THREE.CylinderGeometry(0.7, 0.76, 0.16, 20, 1, true, Math.PI - 0.8, 1.6)), c.glass, 0, 0.49, 0));
  strut(u, c.steel, [0, 0.4, -0.32], [0, 0.62, -0.36], 0.016);
  ball(u, c.lit, 0.035, 0.035, 0.035, 0, 0.64, -0.36);
  // 尾翼、天线、推进器
  const fin = geo('ufo.fin', () => plateGeo([[0, 0], [-0.3, 0], [-0.42, 0.3], [-0.3, 0.3]], 0.03, true));
  for (const s of [-1, 1]) {
    put(u, fin, c.trim, s * 0.5, 0.4, 0.3).rotation.z = -s * 0.35;
    rod(u, c.steel, 0.05, 0.2, s * 0.22, 0.33, 0.9);
    flame(u, c.fx, s * 0.22, 0.33, 1.0, 0.04, 0.35);
  }
  strut(u, c.steel, [0, 0.42, 0.66], [0, 0.86, 0.74], 0.012);
  ball(u, c.lit, 0.04, 0.04, 0.04, 0, 0.88, 0.745);
  // 照在雪面上的光
  const disc = geo('disc', () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
  soft(put(u, disc, glowMat(c.trimColor, 0.26), 0, 0.012, 0, 0.6));
  soft(put(u, disc, glowMat(c.trimColor, 0.3), 0, 0.014, 0, 0.26));
}

// 每种模型的造型函数和站姿参数（gear.js 里用 model 字段指过来）。
// ski：造一只脚上的板；build：造整台载具。poles：是否拿雪杖；armSpread：手臂张开多少。
// sitDrop：坐下后整个人下沉多少（= 0.62 - 坐面离地高度）；legBase：腿往前抬的角度。
// grip：握车把时手臂抬起的角度；lift：悬浮离地多高；bob：悬浮时上下起伏的幅度。
export const GEAR_MODELS = {
  blades: { ski: blades, poles: false, armSpread: 0.35 },
  twin: { ski: twin },
  mech: { ski: mech },
  fish: { build: fish },
  hover: { build: hover, lift: 0.13, bob: 0.022 },
  phoenix: { build: phoenix },
  toboggan: { build: toboggan, sitDrop: 0.49, legBase: 1.5 },
  saucer: { build: saucer, sitDrop: 0.48, legBase: 1.55 },
  bike: { build: bike, sitDrop: 0.06, legBase: 0.6, grip: 0.28 },
  raft: { build: raft, sitDrop: 0.45, legBase: 1.5 },
  mobile: { build: mobile, sitDrop: 0.14, legBase: 0.75, grip: 0.34 },
  ufo: { build: ufo, sitDrop: 0.21, legBase: 1.6, bob: 0.025 },
};
