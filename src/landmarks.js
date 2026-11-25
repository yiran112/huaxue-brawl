// 赛道地标（村庄、缆车、伐木场、隧道、冰湖）、地表区提示牌、加速带的模型。
// 位置在 course.js 里规划好，这里负责搭模型、加碰撞。同一类零件合并成一个网格，减少绘制次数
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex } from './props.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const WOOD = 0x7a4f2c;
const WOOD_D = 0x4e3220;
const WOOD_L = 0xe2bd85;
const STEEL = 0x8b939c;
const DARK = 0x30343b;
const CABIN_WALL = [0x9a5a32, 0xb9773f, 0x7d4a2a, 0xc98f55];
const CABIN_ROOF = [0xc8312c, 0x2f6fb5, 0x3c8a4a, 0x7a3d8f];
const HUT = [0xe0453a, 0xf0b432, 0x3b8fd8, 0x46b06a];

function paint(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = _c.r;
    c[i * 3 + 1] = _c.g;
    c[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (!geo.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return geo;
}

// 三角柱（屋顶）：沿 x 长 len，底面在 y=0、半宽 half，高 rise
function prismGeo(len, half, rise) {
  const g = new THREE.CylinderGeometry(1, 1, len, 3);
  g.rotateZ(-Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.5, 0);
  g.scale(1, rise / 1.5, half / 0.866);
  return g;
}

const MATS = {
  solid: () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true }),
  ice: () =>
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.72, emissive: 0x16465e }),
  iceShell: () =>
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      emissive: 0x1d5a78,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  inner: () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.BackSide }),
};
const NO_SHADOW = { glow: true, ice: true, iceShell: true };

// 把零件按材质分组收集，最后合并成几个网格
class Kit {
  constructor() {
    this.lists = {};
    this.frame = null;
  }

  // 当前局部坐标系：位置 + 朝向（绕 y）
  setFrame(x, y, z, ry = 0) {
    _e.set(0, ry, 0, 'YXZ');
    _q.setFromEuler(_e);
    this.frame = new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
  }

  clearFrame() {
    this.frame = null;
  }

  put(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, list = 'solid', sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    if (this.frame) geo.applyMatrix4(this.frame);
    (this.lists[list] ||= []).push(paint(geo, color));
    return geo;
  }

  box(w, h, d, color, x, y, z, ry, rx, rz, list) {
    return this.put(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, rz, list);
  }

  cyl(rt, rb, h, seg, color, x, y, z, ry, rx, rz, list) {
    return this.put(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, ry, rx, rz, list);
  }

  cone(r, h, seg, color, x, y, z, ry, rx, rz, list) {
    return this.put(new THREE.ConeGeometry(r, h, seg), color, x, y, z, ry, rx, rz, list);
  }

  ball(r, color, x, y, z, sx = 1, sy = 1, sz = 1, list) {
    return this.put(new THREE.SphereGeometry(r, 7, 5), color, x, y, z, 0, 0, 0, list, sx, sy, sz);
  }

  prism(len, half, rise, color, x, y, z, list) {
    return this.put(prismGeo(len, half, rise), color, x, y, z, 0, 0, 0, list);
  }

  // 世界坐标里 a→b 的一根杆子（不受 frame 影响）
  rod(ax, ay, az, bx, by, bz, r, color, list = 'solid') {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 4, 1, true);
    _q.setFromUnitVectors(UP, dir.normalize());
    _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    (this.lists[list] ||= []).push(paint(g, color));
  }

  finish(group) {
    for (const key in this.lists) {
      const parts = this.lists[key];
      if (!parts.length) continue;
      const geo = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(geo, MATS[key]());
      mesh.castShadow = !NO_SHADOW[key];
      mesh.receiveShadow = key !== 'glow';
      if (key === 'iceShell') mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.lists = {};
  }
}

// 局部坐标（以 (ox,oz) 为原点、朝向 h）换算到世界坐标
function toWorld(ox, oz, h, lx, lz) {
  const c = Math.cos(h);
  const s = Math.sin(h);
  return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c };
}

// 一块矩形底面下最低的雪面高度
function lowGround(course, x, z, h, hw, hd) {
  let y = course.surfaceY(x, z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = toWorld(x, z, h, sx * hw, sz * hd);
      y = Math.min(y, course.surfaceY(p.x, p.z));
    }
  }
  return y;
}

const signCache = new Map();
function signMaterial(text, bg, fg) {
  const key = text + bg + fg;
  let mat = signCache.get(key);
  if (!mat) {
    const tex = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = fg;
      g.font = '900 72px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    });
    mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    signCache.set(key, mat);
  }
  return mat;
}

// 文字牌：朝向上坡来的选手
function signPlane(group, text, x, y, z, ry, w = 6, bg = '#6b4423', fg = '#fff3d6') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), signMaterial(text, bg, fg));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  group.add(m);
  return m;
}

// 路边立牌：两根柱子 + 文字板
function roadSign(course, kit, group, d, side, text, bg, fg, u = 3) {
  const h = course.headingAt(d);
  const x = course.cx(d) + side * (course.halfWidth(d) + u);
  const z = -d;
  const y = course.surfaceY(x, z);
  kit.setFrame(x, y - 0.3, z, h);
  for (const s of [-1, 1]) kit.cyl(0.1, 0.1, 3.4, 5, WOOD_D, s * 2.2, 1.7, 0);
  kit.clearFrame();
  signPlane(group, text, x, y + 2.6, z, h, 5, bg, fg);
}

export function buildRouteSigns(course) {
  const kit = new Kit();
  const group = new THREE.Group();
  group.name = 'route-signs';
  const mark = (x, d, color, h) => {
    kit.setFrame(x, course.surfaceY(x, -d) - 0.12, -d);
    kit.cyl(0.09, 0.13, h, 6, color, 0, h / 2, 0);
    kit.cyl(0.13, 0.13, 0.4, 6, 0xffefca, 0, h - 0.29, 0);
  };
  const inTunnel = (d) => course.landmarks.some((m) => m.type === 'tunnel' && d > m.d0 - 8 && d < m.d1 + 8);
  for (let d = 30; d < course.L - 32; d += 32) {
    if (inTunnel(d)) continue;
    const x = course.cx(d);
    const w = course.halfWidth(d) - 0.35;
    for (const s of [-1, 1]) mark(x + s * w, d, 0x147789, 2.25);
  }
  kit.clearFrame();
  let last = 0;
  for (let d = 85; d < course.L - 95; d += 16) {
    const turn = course.headingAt(d - 22) - course.headingAt(d + 28);
    if (Math.abs(turn) < 0.25 || d - last < 105 || inTunnel(d - 44)) continue;
    if (course.branches.some((b) => Math.abs(d - b.gate.d) < 110)) continue;
    const side = Math.sign(turn);
    for (const lead of [44, 19]) {
      if (!inTunnel(d - lead)) roadSign(course, kit, group, d - lead, -side, side > 0 ? '❯ ❯' : '❮ ❮', '#175580', '#ffffff', 0.55);
    }
    last = d;
  }
  for (const b of course.branches) {
    const side = b.sg;
    for (const lead of [82, 43]) {
      roadSign(course, kit, group, b.gate.d - lead, side, side > 0 ? '近道 ›' : '‹ 近道', '#78470e', '#fff2c2', 0.8);
    }
    for (const s of [-1, 1]) {
      const off = s * 4.5;
      mark(b.gate.x + Math.cos(b.gate.phi) * off, b.gate.d - Math.sin(b.gate.phi) * off, 0xe89324, 4.15);
    }
  }
  kit.finish(group);
  course.group.add(group);
}

// ---------- 村庄 ----------
function village(course, m, kit, group) {
  const snow = course.theme.snow;
  const d = m.gateD;
  const ox = course.cx(d);
  const oz = -d;
  const h = course.headingAt(d);
  const P = course.halfWidth(d) + 1.6;
  const L = toWorld(ox, oz, h, -P, 0);
  const R = toWorld(ox, oz, h, P, 0);
  const yl = course.surfaceY(L.x, L.z);
  const yr = course.surfaceY(R.x, R.z);
  const top = Math.max(yl, yr) + 9;
  kit.setFrame(ox, 0, oz, h);
  for (const [s, y] of [[-1, yl], [1, yr]]) {
    kit.box(1.2, top - y + 1, 1.2, WOOD_D, s * P, (top + y) / 2 - 0.5, 0);
    kit.cone(0.9, 1.4, 4, snow, s * P, top + 1.4, 0, Math.PI / 4);
  }
  kit.box(2 * P + 2.4, 0.9, 1.1, WOOD, 0, top, 0);
  kit.box(2 * P + 3, 0.3, 2.2, CABIN_ROOF[0], 0, top + 0.6, 0);
  kit.box(2 * P + 3.1, 0.25, 2.3, snow, 0, top + 0.85, 0);
  // 彩旗
  const cols = [0xe83a3a, 0xffcf2a, 0x3a8cff, 0x3ac46a];
  let n = 0;
  for (let x = -P + 1.2; x < P - 1; x += 2.1) {
    const sag = 1.2 * (1 - (x / P) ** 2);
    kit.cone(0.5, 1, 3, cols[n++ % 4], x, top - 1.3 - sag, 0, 0, Math.PI, 0);
  }
  kit.clearFrame();
  const sp = toWorld(ox, oz, h, 0, 0.7);
  signPlane(group, m.name, sp.x, top - 0.1, sp.z, h, 9);
  course.addObstacle(L.x, L.z, 0.9, 'rock');
  course.addObstacle(R.x, R.z, 0.9, 'rock');

  for (const it of m.items) {
    if (it.kind === 'cabin') cabin(course, kit, it);
    else if (it.kind === 'snowman') snowman(course, kit, it);
  }
  // 路灯
  for (let dd = m.d0 + 24; dd < m.d1 - 4; dd += 26) {
    for (const s of [-1, 1]) {
      const x = course.cx(dd) + s * (course.halfWidth(dd) + 1.4);
      const z = -dd;
      const y = course.surfaceY(x, z);
      kit.cyl(0.09, 0.12, 3.4, 5, DARK, x, y + 1.5, z);
      kit.box(0.5, 0.6, 0.5, 0xffd27a, x, y + 3.4, z, 0, 0, 0, 'glow');
      kit.cone(0.45, 0.4, 4, DARK, x, y + 3.9, z, Math.PI / 4);
      course.addObstacle(x, z, 0.3, 'rock');
    }
  }
}

function cabin(course, kit, it) {
  const snow = course.theme.snow;
  const h = course.headingAt(it.d) + it.side * (Math.PI / 2);
  const { w, dep } = it;
  const H = it.h;
  const y = lowGround(course, it.x, it.z, h, w / 2, dep / 2) - 0.5;
  kit.setFrame(it.x, y, it.z, h);
  const wall = CABIN_WALL[it.color];
  kit.box(w, H + 0.5, dep, wall, 0, (H + 0.5) / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.42, H + 0.5, 0.42, WOOD_D, sx * (w / 2), (H + 0.5) / 2, sz * (dep / 2));
  const base = H + 0.5;
  const roof = CABIN_ROOF[it.color];
  const rise = dep * 0.42 + 0.8;
  const windowY = 0.5 + H * 0.58;
  for (const sy of [0.25, 0.46, 0.69, 0.84]) {
    kit.box(w + 0.065, 0.046, dep + 0.065, WOOD_D, 0, base * sy, 0);
  }
  kit.box(w + 0.31, 0.2, dep + 0.31, WOOD_D, 0, base - 0.03, 0);
  kit.prism(w + 0.9, dep / 2 + 0.6, rise, roof, 0, base, 0);
  kit.prism(w + 0.67, dep / 2 + 0.71, rise + 0.06, snow, 0, base + 0.22, 0);
  kit.box(w + 0.57, 0.14, 0.28, snow, 0, base + rise + 0.29, 0);
  kit.box(0.7, rise + 0.8, 0.7, 0x6a5a50, w * 0.28, base + rise * 0.55, dep * 0.15);
  kit.box(0.89, 0.14, 0.88, snow, w * 0.28, base + rise * 1.05 + 0.45, dep * 0.15);
  kit.box(1.3, 2.16, 0.17, roof, 0, 1.54, -dep / 2 - 0.032);
  kit.box(1.1, 2.0, 0.12, WOOD_D, 0, 1.5, -dep / 2 - 0.05);
  kit.box(0.095, 0.085, 0.07, 0xe5ad5d, 0.37, 1.44, -dep / 2 - 0.124);
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.3;
    kit.box(1.2, 1.03, 0.13, WOOD_D, x, windowY, -dep / 2 - 0.05);
    kit.box(1.0, 0.81, 0.07, 0xffd27a, x, windowY, -dep / 2 - 0.1, 0, 0, 0, 'glow');
    kit.box(0.084, 0.93, 0.05, WOOD_D, x, windowY, -dep / 2 - 0.135);
    kit.box(1.22, 0.11, 0.26, snow, x, windowY - 0.49, -dep / 2 - 0.13);
    kit.box(0.17, 1.02, 1.2, WOOD_D, sx * (w / 2 + 0.04), windowY, 0);
    kit.box(0.074, 0.81, 1.0, 0xffd27a, sx * (w / 2 + 0.10), windowY, 0, 0, 0, 0, 'glow');
    kit.box(0.045, 0.92, 0.085, WOOD_D, sx * (w / 2 + 0.14), windowY, 0);
  }
  kit.clearFrame();
  course.addObstacle(it.x, it.z, Math.max(w, dep) * 0.55, 'rock');
}

function snowman(course, kit, it) {
  const snow = course.theme.snow;
  const h = course.headingAt(it.d) + it.side * (Math.PI / 2);
  const y = course.surfaceY(it.x, it.z);
  kit.setFrame(it.x, y - 0.2, it.z, h);
  kit.ball(0.95, snow, 0, 0.8, 0);
  kit.ball(0.68, snow, 0, 2.0, 0);
  kit.ball(0.48, snow, 0, 2.95, 0);
  kit.cone(0.1, 0.55, 5, 0xff7a1a, 0, 2.95, -0.7, 0, -Math.PI / 2, 0);
  kit.cyl(0.32, 0.36, 0.5, 8, 0x22252b, 0, 3.55, 0);
  kit.cyl(0.52, 0.52, 0.06, 8, 0x22252b, 0, 3.32, 0);
  kit.box(1.1, 0.16, 0.2, 0xd8262c, 0, 2.5, -0.1);
  kit.clearFrame();
  course.addObstacle(it.x, it.z, 0.8, 'rock');
}

// ---------- 缆车 ----------
function lift(course, m, kit, group) {
  const d = m.d;
  const ox = course.cx(d);
  const oz = -d;
  const h = course.headingAt(d);
  const hw = course.halfWidth(d);
  const TH = 16;
  const xs = [-(hw + 70), -(hw + 12), hw + 12, hw + 70];
  const tops = [];
  xs.forEach((lx, i) => {
    const p = toWorld(ox, oz, h, lx, 0);
    const g = course.surfaceY(p.x, p.z) - 0.3;
    kit.setFrame(p.x, g, p.z, h);
    kit.box(1.8, 0.8, 1.8, 0x9aa0a6, 0, 0.4, 0);
    kit.cyl(0.34, 0.55, TH, 6, STEEL, 0, TH / 2, 0);
    kit.box(0.5, 0.5, 4.4, STEEL, 0, TH, 0);
    for (const s of [-1, 1]) kit.cyl(0.4, 0.4, 0.3, 8, DARK, 0, TH - 0.3, s * 1.7, 0, 0, Math.PI / 2);
    if (i === 0 || i === 3) {
      // 两头的回转站
      kit.put(new THREE.TorusGeometry(1.7, 0.16, 5, 16), DARK, 0, TH - 0.3, 0, 0, Math.PI / 2, 0);
      kit.box(5, 4, 6, 0xb83a32, 0, 2, 0);
      kit.prism(5.8, 3.6, 1.6, course.theme.snow, 0, 4, 0);
    }
    kit.clearFrame();
    tops.push({ lx, y: g + TH - 0.3 });
    course.addObstacle(p.x, p.z, i === 0 || i === 3 ? 3.5 : 1.0, 'rock');
  });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = toWorld(ox, oz, h, tops[i].lx, s * 1.7);
      const b = toWorld(ox, oz, h, tops[i + 1].lx, s * 1.7);
      kit.rod(a.x, tops[i].y, a.z, b.x, tops[i + 1].y, b.z, 0.05, DARK);
    }
  }
  // 吊椅：沿缆绳循环移动
  const chairGeos = [0, 1, 2].map((k) => chairGeo(k));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const len = xs[3] - xs[0];
  const yAt = (lx) => {
    for (let i = 0; i < 3; i++) {
      if (lx <= tops[i + 1].lx) return tops[i].y + ((tops[i + 1].y - tops[i].y) * (lx - tops[i].lx)) / (tops[i + 1].lx - tops[i].lx);
    }
    return tops[3].y;
  };
  const chairs = [];
  let k = 0;
  for (const s of [-1, 1]) {
    for (let p = 6; p < len - 4; p += 13) {
      const mesh = new THREE.Mesh(chairGeos[k++ % 3], mat);
      mesh.castShadow = true;
      mesh.rotation.y = h + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(mesh);
      chairs.push({ mesh, s, p: s > 0 ? p : p + 6.5 });
    }
  }
  const place = (ch) => {
    const lx = xs[0] + ch.p;
    const w = toWorld(ox, oz, h, lx, ch.s * 1.7);
    ch.mesh.position.set(w.x, yAt(lx), w.z);
  };
  chairs.forEach(place);
  course.anims.push((dt) => {
    for (const ch of chairs) {
      ch.p += ch.s * 2.6 * dt;
      if (ch.p > len - 2) ch.p -= len - 4;
      else if (ch.p < 2) ch.p += len - 4;
      place(ch);
    }
  });
}

// 吊椅模型（挂点在原点，朝 -z）；k>0 时坐着乘客
function chairGeo(k) {
  const kit = new Kit();
  kit.cyl(0.05, 0.05, 2.6, 4, STEEL, 0, -1.3, 0);
  kit.box(2.2, 0.12, 0.7, 0x2f5fa8, 0, -2.7, 0);
  kit.box(2.2, 0.8, 0.1, 0x2f5fa8, 0, -2.25, 0.33);
  kit.box(2.3, 0.06, 0.06, STEEL, 0, -2.1, -0.4);
  if (k) {
    const jackets = [[0xe0453a, 0x3b8fd8], [0xf0b432, 0x46b06a]][k - 1];
    for (const [i, sx] of [[0, -0.5], [1, 0.5]]) {
      kit.box(0.45, 0.6, 0.35, jackets[i], sx, -2.3, 0.1);
      kit.ball(0.2, 0xf2c9a0, sx, -1.82, 0.08);
      kit.ball(0.22, jackets[1 - i], sx, -1.72, 0.08, 1, 0.6, 1);
      kit.box(0.4, 0.18, 0.5, 0x2a2d35, sx, -2.6, -0.2);
    }
  }
  const parts = kit.lists.solid;
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// ---------- 伐木场 ----------
function lumber(course, m, kit, group) {
  for (const it of m.items) {
    if (it.kind === 'pile') logPile(course, kit, it);
    else if (it.kind === 'shed') shed(course, kit, it);
  }
  roadSign(course, kit, group, m.d0 - 6, m.side, '伐木场', '#6b4423', '#ffe7b8');
}

function logPile(course, kit, it) {
  const snow = course.theme.snow;
  const h = course.headingAt(it.d);
  const len = it.track ? 5.2 : 4.4;
  const rows = it.rows;
  const r = 0.46;
  const y = lowGround(course, it.x, it.z, h, rows * r, len / 2) - 0.15;
  kit.setFrame(it.x, y, it.z, h);
  for (let row = 0; row < rows; row++) {
    const cnt = rows - row;
    for (let i = 0; i < cnt; i++) {
      const lx = (i - (cnt - 1) / 2) * r * 2.05;
      const ly = r + row * r * 1.75;
      kit.cyl(r, r, len, 8, WOOD, lx, ly, 0, 0, Math.PI / 2, 0);
      for (const s of [-1, 1]) kit.cyl(r * 0.86, r * 0.86, 0.06, 8, WOOD_L, lx, ly, s * (len / 2 + 0.02), 0, Math.PI / 2, 0);
    }
  }
  kit.box(r * 1.6, 0.18, len * 0.9, snow, 0, r * 2 + (rows - 1) * r * 1.75 - 0.05, 0);
  if (it.track) {
    // 道中间的木堆前后插两根黄黑警示桩
    for (const s of [-1, 1]) kit.box(0.25, 1.6, 0.25, 0xffc21a, 0, 0.8, s * (len / 2 + 0.8));
  }
  kit.clearFrame();
  const n = it.track ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const lz = n === 1 ? 0 : (i / (n - 1) - 0.5) * (len - 1.6);
    const p = toWorld(it.x, it.z, h, 0, lz);
    course.addObstacle(p.x, p.z, rows * r + 0.15, 'rock');
  }
}

function shed(course, kit, it) {
  const snow = course.theme.snow;
  const h = course.headingAt(it.d) + it.side * (Math.PI / 2);
  const y = lowGround(course, it.x, it.z, h, 5, 3.5) - 0.3;
  kit.setFrame(it.x, y, it.z, h);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.35, 4.2, 0.35, WOOD_D, sx * 4.6, 2.1, sz * 3.2);
  kit.box(10.4, 0.35, 7.6, WOOD, 0, 4.3, 0, 0, 0.12, 0);
  kit.box(10.6, 0.3, 7.8, snow, 0, 4.6, 0, 0, 0.12, 0);
  for (let i = 0; i < 4; i++) kit.box(6, 0.18, 1.4, WOOD_L, -1, 0.5 + i * 0.2, 0.6, 0.04 * i);
  kit.cyl(1.5, 1.5, 0.08, 16, 0xc7ccd2, 3.6, 1.6, -3.3, 0, Math.PI / 2 - 0.15, 0);
  kit.cyl(0.3, 0.3, 0.12, 8, DARK, 3.6, 1.6, -3.34, 0, Math.PI / 2 - 0.15, 0);
  kit.clearFrame();
  course.addObstacle(it.x, it.z, 5.5, 'rock');
}

// ---------- 隧道 ----------
function tunnel(course, m, kit, group) {
  const ice = m.variant !== 'mine';
  const snow = course.theme.snow;
  const SEG = 6;
  const center = (d) => {
    const x = course.cx(d);
    return new THREE.Vector3(x, course.height(x, -d) - 0.9, -d);
  };
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  // 按这一段的走向摆一个以 (0,0,0) 为中心的零件
  const place = (geo, A, B, mid, color, list) => {
    zAxis.subVectors(A, B).normalize();
    xAxis.crossVectors(UP, zAxis).normalize();
    yAxis.crossVectors(zAxis, xAxis);
    basis.makeBasis(xAxis, yAxis, zAxis).setPosition(mid);
    geo.applyMatrix4(basis);
    (kit.lists[list] ||= []).push(paint(geo, color));
  };
  let i = 0;
  for (let d = m.d0; d < m.d1 - 0.01; d += SEG, i++) {
    const db = Math.min(d + SEG, m.d1);
    const A = center(d);
    const B = center(db);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const len = A.distanceTo(B) + 0.06;
    const R = course.halfWidth((d + db) / 2) + 2.6;
    const k = Math.min(0.55, 12.5 / R);
    const shell = (r, list, color) => {
      const g = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, Math.PI / 2, Math.PI);
      g.rotateX(Math.PI / 2);
      g.scale(r, r * k, len);
      place(g, A, B, mid, color, list);
    };
    if (ice) shell(R, 'iceShell', 0xa8e8ff);
    else {
      shell(R, 'inner', 0x5a4a3e);
      shell(R + 0.7, 'solid', snow);
    }
    if (i % 2 === 0) {
      const tube = ice ? 0.5 : 0.42;
      const rib = new THREE.TorusGeometry(R - (ice ? 0.2 : 0.35), tube, ice ? 5 : 4, ice ? 22 : 7, Math.PI);
      rib.scale(1, k, 1);
      place(rib, A, B, A, ice ? 0xdff6ff : WOOD, ice ? 'ice' : 'solid');
      if (!ice) {
        const lamp = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        lamp.translate(0, R * k - 1.6, 0);
        place(lamp, A, B, A, 0xffc46a, 'glow');
      }
    }
    if (ice && i % 2 === 1) {
      for (const s of [-1, 1]) {
        for (let q = 0; q < 3; q++) {
          const c = new THREE.ConeGeometry(0.35 + q * 0.12, 1.6 + q * 0.9, 5);
          c.rotateZ(s * (0.35 - q * 0.25));
          c.translate(s * (R - 1.6 - q * 0.5), 0.9 + q * 0.4, (q - 1) * 0.9);
          place(c, A, B, mid, q === 1 ? 0x8ff0ff : 0xc9f6ff, 'ice');
        }
      }
    }
  }
  // 洞口：加粗的拱圈 + 一圈石头 / 冰块
  for (const [d, dir] of [[m.d0, 1], [m.d1, -1]]) {
    const A = center(d + dir * 0.01);
    const B = center(d + dir * 2);
    const R = course.halfWidth(d) + 2.6;
    const k = Math.min(0.55, 12.5 / R);
    const ring = new THREE.TorusGeometry(R + 0.4, 1.3, 6, 22, Math.PI);
    ring.scale(1, k, 1);
    place(ring, A, B, A, ice ? 0x9fdcff : 0x6a5a4c, ice ? 'ice' : 'solid');
    for (let q = 0; q <= 8; q++) {
      const a = (q / 8) * Math.PI;
      const g = new THREE.SphereGeometry(2 + (q % 3) * 0.7, 6, 4);
      g.translate(Math.cos(a) * (R + 2.4), Math.sin(a) * (R * k + 1.6), 0);
      place(g, A, B, A, ice ? 0xbfeaff : q % 2 ? course.theme.rock : snow, ice ? 'ice' : 'solid');
    }
    if (dir > 0) {
      const top = A.y + R * k + 1.2;
      signPlane(group, ice ? '冰晶隧道' : '废弃矿道', A.x, top, A.z + 1.6, course.headingAt(d), 8, ice ? '#1d5a8a' : '#5a3a22', '#ffffff');
    }
  }
  // 两侧洞壁的碰撞
  for (let d = m.d0; d <= m.d1; d += 3) {
    for (const s of [-1, 1]) {
      const x = course.cx(d) + s * (course.halfWidth(d) + 1.7);
      course.addObstacle(x, -d, 1.2, 'rock');
    }
  }
}

// ---------- 冰湖 ----------
function icelake(course, m, kit, group) {
  for (const it of m.items) {
    if (it.kind === 'hut') {
      const h = course.headingAt(it.d) + it.side * (Math.PI / 2);
      const y = lowGround(course, it.x, it.z, h, 1.8, 1.8) - 0.3;
      kit.setFrame(it.x, y, it.z, h);
      kit.box(3.2, 2.6, 3.2, HUT[it.color], 0, 1.3, 0);
      kit.prism(3.8, 2.0, 1.4, course.theme.snow, 0, 2.6, 0);
      kit.box(0.9, 1.7, 0.1, WOOD_D, 0, 0.85, -1.65);
      kit.box(0.6, 0.5, 0.1, 0xffd27a, 0.9, 1.7, -1.66, 0, 0, 0, 'glow');
      kit.cyl(0.6, 0.6, 0.05, 10, 0x123a5a, -2.4, 0.33, -1.2);
      kit.cyl(0.03, 0.03, 1.6, 4, WOOD_D, -2.1, 0.9, -1.2, 0, 0, 0.6);
      kit.clearFrame();
      course.addObstacle(it.x, it.z, 2.3, 'rock');
    } else if (it.kind === 'crystal') {
      const y = course.surfaceY(it.x, it.z);
      const s = it.s;
      for (let q = 0; q < 3; q++) {
        const a = q * 2.1 + it.x;
        kit.cone(0.3 * s, (1.8 - q * 0.4) * s, 5, q ? 0xc9f6ff : 0x8ff0ff, it.x + Math.cos(a) * 0.4 * s, y + (0.7 - q * 0.15) * s, it.z + Math.sin(a) * 0.4 * s, 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 'ice');
      }
    }
  }
  roadSign(course, kit, group, m.d0 - 4, 1, '冰湖 · 小心打滑', '#1d5a8a', '#ffffff', 4);
}

export function buildLandmarks(course) {
  // 上一条赛道 dispose 时把这些材质也释放了，不能接着用
  signCache.clear();
  const kit = new Kit();
  const group = course.group;
  for (const m of course.landmarks) {
    if (m.type === 'village') village(course, m, kit, group);
    else if (m.type === 'lift') lift(course, m, kit, group);
    else if (m.type === 'lumber') lumber(course, m, kit, group);
    else if (m.type === 'tunnel') tunnel(course, m, kit, group);
    else if (m.type === 'icelake') icelake(course, m, kit, group);
  }
  for (const z of course.zones) {
    if (z.lake) continue;
    const t = z.type === 'ice' ? ['冰面', '#2a7fd0', '#ffffff'] : ['深雪减速', '#e8eef8', '#2a3a55'];
    roadSign(course, kit, group, z.d0 - 8, z.side || -1, ...t);
  }
  for (const a of course.avalanches) {
    for (const s of [-1, 1]) roadSign(course, kit, group, a.d0 - 24, s, '雪崩区', '#ffcf1a', '#2a1a00');
  }
  for (const mv of course.movers) {
    if (mv.type === 'snowmobile') roadSign(course, kit, group, mv.d - 40, mv.dir, '横穿车辆', '#ff7a1a', '#ffffff');
    else roadSign(course, kit, group, mv.d - 40, -mv.dir, '落石', '#8a5a3a', '#ffffff');
  }
  kit.finish(group);
}

// ---------- 加速带 ----------
function padTexture() {
  const t = canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,40,90,0.55)';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2; k++) {
      const y0 = k * 64;
      const grd = g.createLinearGradient(0, y0 + 50, 0, y0 + 8);
      grd.addColorStop(0, '#ffb21a');
      grd.addColorStop(1, '#fff36a');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(6, y0 + 54);
      g.lineTo(32, y0 + 14);
      g.lineTo(58, y0 + 54);
      g.lineTo(46, y0 + 54);
      g.lineTo(32, y0 + 32);
      g.lineTo(18, y0 + 54);
      g.closePath();
      g.fill();
    }
  });
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}

export function buildPads(course) {
  if (!course.pads.length) return;
  const parts = [];
  for (const p of course.pads) {
    const g = new THREE.PlaneGeometry(p.w, p.len, 3, 6);
    g.rotateX(-Math.PI / 2);
    g.rotateY(course.headingAt(p.d));
    g.translate(p.x, 0, p.z);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, course.surfaceY(pos.getX(i), pos.getZ(i)) + 0.09);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const tex = padTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  course.group.add(mesh);
  course.anims.push((dt) => {
    tex.offset.y -= dt * 1.8;
  });
}
