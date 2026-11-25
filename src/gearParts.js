// 装备模型的公共零件：几何体缓存、拼装小工具、放样板面、贴花用的板面皮，以及拼完以后按材质合并。
// 约定：-Z 是前方，+Y 朝上。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decalMat } from './gearDecals.js';

export const DARK = 0x20222a;
export const STEEL = 0x9aa0ac;
export const RUBBER = 0x15171c;
export const HULL = 0x2b2f3a;
export const CORD = 0xe8dcc0;
export const CHROME = 0xdde3ec;
export const GOLD = 0xffc23a;

// 几何体只和造型有关、和颜色无关：每种零件全局只建一份，所有角色共用
const geos = new Map();
export function geo(key, make) {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  // 小零件（眼睛、骨节、钉头）用的低面数球
  knob: new THREE.SphereGeometry(1, 10, 7),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  ico: new THREE.IcosahedronGeometry(1, 0),
};

// 发光的光晕和尾焰不受光照，材质全局共用
const glowMats = new Map();
export function glowMat(color, opacity) {
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

export function put(parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
export const box = (p, mat, w, h, d, x, y, z) => put(p, PRIM.box, mat, x, y, z, w, h, d);
export const ball = (p, mat, rx, ry, rz, x, y, z) => put(p, PRIM.sphere, mat, x, y, z, rx, ry, rz);
export const knob = (p, mat, rx, ry, rz, x, y, z) => put(p, PRIM.knob, mat, x, y, z, rx, ry, rz);
// 不投影子的小零件（光晕、玻璃、贴花）
export const soft = (m) => {
  m.castShadow = false;
  return m;
};

// 两点之间的一根圆杆
export function strut(p, mat, a, b, r, prim = PRIM.cyl) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const m = put(p, prim, mat);
  m.scale.set(r, _a.distanceTo(_b), r);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _b.sub(_a).normalize());
  return m;
}
// 顺着前后方向的圆筒
export const rod = (p, mat, r, len, x, y, z) => strut(p, mat, [x, y, z - len / 2], [x, y, z + len / 2], r);

// 穿过一串点的弯管
export function pipeGeo(pts, r, seg = 32, sides = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed);
  return new THREE.TubeGeometry(curve, seg, r, sides, closed);
}
// 左半边的点（最后一个在中线上）补成左右对称的一整条
export const mirrorX = (pts) => pts.concat(pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z]));

// 旋转体。轮廓 [半径, 高度] 要从底部中心往外、再绕到顶上回来，面才朝外
export const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// 一块有厚度的平板。upright：侧面轮廓（X 朝前、Y 朝上）立着放；否则是俯视轮廓（X 朝右、Y 朝前）平着放
export function plateGeo(pts, depth, upright, bevel = 0) {
  const opts = bevel ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 } : { depth, bevelEnabled: false };
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), opts);
  g.translate(0, 0, -depth / 2);
  return upright ? g.rotateY(Math.PI / 2) : g.rotateX(-Math.PI / 2);
}

// 把一个小零件绕一圈复制 count 份，合成一个几何体
export function ringOf(base, count, radius, phase = 0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    parts.push(base.clone().translate(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  return mergeGeometries(parts);
}

// 一个零件绕 Y 轴转着复制 count 份（辐条、叶片），合成一个几何体
export function radialGeo(base, count, phase = 0) {
  return mergeGeometries(Array.from({ length: count }, (_, i) => base.clone().rotateY(phase + (i / count) * Math.PI * 2)));
}

// 一把螺丝 / 铆钉：同一个小零件摆到一串点上，合成一个几何体。up：钉头朝向（'y' 朝上、'x' 朝侧面、'z' 朝前后）
export function studsGeo(points, r, up = 'y', h = r * 0.7) {
  const base = new THREE.CylinderGeometry(r, r * 1.05, h, 6);
  if (up === 'x') base.rotateZ(Math.PI / 2);
  else if (up === 'z') base.rotateX(Math.PI / 2);
  return mergeGeometries(points.map(([x, y, z]) => base.clone().translate(x, y, z)));
}

// ---------- 放样板面 ----------

// 截面的局部坐标：顺着侧面轮廓线算切线，板面法线 (ny, nz) 和它垂直。从板尾排到板头
function frames(list) {
  const st = list[0].z < list[list.length - 1].z ? list.slice().reverse() : list;
  const n = st.length;
  return st.map((s, i) => {
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
    return { x: s.x || 0, y: s.y + ny * off, z: s.z + nz * off, ny, nz, hw: s.w / 2, ht: s.th / 2 };
  });
}

// 放样：沿侧面轮廓线摆一串截面，连成一块板。
// 截面：{ z, y 中心线位置, w 宽, th 厚, x 左右偏移, off 沿板面法线抬高多少 }。
// 厚度方向跟着轮廓线的法线走，所以能做出翘头和卷起来的橇头。顶、底、两侧各用一套顶点，棱是硬的。
export function loftGeo(list) {
  const f = frames(list);
  const n = f.length;
  const ring = f.map(({ x, y, z, ny, nz, hw, ht }) => [
    // 左上、右上、右下、左下
    [x - hw, y + ny * ht, z + nz * ht],
    [x + hw, y + ny * ht, z + nz * ht],
    [x + hw, y - ny * ht, z - nz * ht],
    [x - hw, y - ny * ht, z - nz * ht],
  ]);
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

// 板面顶上薄薄一层皮，只有顶面，用来贴图案。
// UV：u 横向、按 W 米铺满（中线是 0.5）；v 从板尾 0 到板头 1，按弧长走，翘头上的图案不会被压扁。
// userData.len 记下弧长，画贴花时按米来画
export function skinGeo(list, W, lift = 0.0015) {
  const f = frames(list);
  const n = f.length;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(f[i].y - f[i - 1].y, f[i].z - f[i - 1].z));
  const L = acc[n - 1] || 1;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const s = f[i];
    const h = s.ht + lift;
    const y = s.y + s.ny * h;
    const z = s.z + s.nz * h;
    pos.push(s.x - s.hw, y, z, s.x + s.hw, y, z);
    const v = acc[i] / L;
    uv.push(0.5 + (s.x - s.hw) / W, v, 0.5 + (s.x + s.hw) / W, v);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.len = L;
  return g;
}

export const sample = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
// 两头密、中间疏：板头板尾的圆角多几个截面才圆
export const sampleEnds = (n, f) => sample(n, (u) => f(0.5 - 0.5 * Math.cos(Math.PI * u)));

// 一块滑雪板的截面：t 从板尾 0 到板头 1。两头宽、中间收腰，头尾按各自的长度往上翘
export function skiStations({ tail, nose, w, waist, tailKick = 0, noseKick = 0, tailLen = 0.16, noseLen = 0.22, th = 0.03, n = 24, y = 0 }) {
  return sampleEnds(n, (t) => {
    const a = Math.max(0, 1 - t / tailLen);
    const b = Math.max(0, (t - (1 - noseLen)) / noseLen);
    const round = Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 3.5));
    return { t, z: tail + (nose - tail) * t, y: y + tailKick * a * a + noseKick * b * b, w: (waist + (w - waist) * (2 * t - 1) ** 2) * round, th };
  });
}

// 贴在板面上的一条薄色带：沿用板子的截面，收窄后抬到顶面上。t0 ~ t1 是色带覆盖的范围
export function inlay(st, k, t0 = 0, t1 = 1, up = 0.003) {
  return st
    .filter((s) => s.t === undefined || (s.t >= t0 && s.t <= t1))
    .map((s) => ({ ...s, w: s.w * k, th: 0.008, off: (s.off || 0) + s.th / 2 + up }));
}

// 垫在板底的一层（钢边、底板）：grow 是比板面宽出多少，负数就是收窄
export function under(st, grow, th) {
  return st.map((s) => ({ ...s, w: Math.max(0, s.w + grow * Math.min(1, s.w / 0.05)), th, off: (s.off || 0) - s.th / 2 - th / 2 + 0.003 }));
}

// 板面两侧的一条细边（灯条、包边）：沿用截面，贴在左右两边、抬到顶面
export function railOf(st, inset, w, t0 = 0, t1 = 1, up = 0.004) {
  return st
    .filter((s) => s.t === undefined || (s.t >= t0 && s.t <= t1))
    .map((s) => ({ ...s, x: (s.x || 0) + Math.max(0, s.w / 2 - inset), w, th: 0.01, off: (s.off || 0) + s.th / 2 + up }));
}

// 在一块放样板面上贴图案：key 是贴花名（同名共用一张图），W 是贴图横向覆盖的宽度（米），
// paint(g, W, L) 按米画在透明底上（x 从 -W/2 到 W/2，y 从板头 0 往板尾 L）。opts 见 gearDecals.decalMat
export function skin(p, key, list, W, paint, opts) {
  const g = geo('skin:' + key, () => skinGeo(list, W, opts && opts.lift));
  return soft(put(p, g, decalMat(key, W, g.userData.len, paint, opts)));
}

// 一张贴纸：w × h 米的小平面，正面朝 +Z，图案画法同 skin（y 从上边 0 往下到 h）
export function sticker(p, key, w, h, paint, opts) {
  const g = geo(`sticker:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
  return soft(put(p, g, decalMat(key, w, h, paint, { px: 128, py: 128, ...opts })));
}

// 加速时才亮的尾焰：尖头朝后
export function flame(p, fx, x, y, z, r, len) {
  const g = geo('flame', () => new THREE.ConeGeometry(1, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5));
  const m = soft(put(p, g, flameMat, x, y, z, r, r, len));
  m.visible = false;
  m.userData.len = len;
  fx.flames.push(m);
}

// 把一个颜色压暗（k < 1）或者提亮（k > 1，往白色靠）
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k <= 1) c.multiplyScalar(k);
  else c.lerp(new THREE.Color(0xffffff), Math.min(1, k - 1));
  return c.getHex();
}

// 一件装备用到的材质和动画零件表。lam 是 skier.js 的材质缓存；ground 是雪面在当前坐标里的高度
export function gearKit(lam, main, trim, ground = 0) {
  return {
    m: lam,
    main: lam(main),
    // 板身的第二种颜色：主色压暗一档，和主色拼出分件
    deep: lam(shade(main, 0.6)),
    trim: lam(trim),
    lit: lam(trim, { emissive: trim, emissiveIntensity: 0.7 }),
    dark: lam(DARK),
    black: lam(0x121318),
    steel: lam(STEEL),
    chrome: lam(CHROME),
    gold: lam(GOLD),
    rubber: lam(RUBBER),
    white: lam(0xffffff, { emissive: 0xfff2c8, emissiveIntensity: 0.8 }),
    red: lam(0xff3030, { emissive: 0xff2020, emissiveIntensity: 0.8 }),
    glass: lam(0xbfe8ff, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    mainColor: main,
    trimColor: trim,
    ground,
    // flames：加速时喷火；spin：一直转的零件（userData.spin 是角速度）；wings：{ o, s } 腾空时扇动；flags：随速度飘
    fx: { flames: [], spin: [], wings: [], flags: [] },
    // 合并以后新建的几何体：这台装备独有，角色销毁时一起释放
    own: [],
  };
}

// ---------- 合并 ----------

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

// 一份几何体按矩阵摆好，只留合并要用的属性。镜像过的零件要把三角形翻个面，否则正面朝里看不见
function placed(src, matrix, keepUv) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name];
      const k = a.itemSize;
      for (let i = 0; i < a.count; i += 3) {
        for (let j = 0; j < k; j++) {
          const t = a.array[(i + 1) * k + j];
          a.array[(i + 1) * k + j] = a.array[(i + 2) * k + j];
          a.array[(i + 2) * k + j] = t;
        }
      }
    }
  }
  return g;
}

// 拼完以后，把不会动的零件按材质合成一个网格：一件装备拼了几十上百个零件，合完只剩十来次绘制。
// 会动的零件（kit.fx 里登记的尾焰、灯圈、羽翼、小旗）和它们下面的东西原样留着
export function bakeGear(root, kit) {
  const fx = kit.fx;
  const live = new Set([...fx.flames, ...fx.spin, ...fx.flags, ...fx.wings.map((w) => w.o)]);
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const bins = new Map();
  const walk = (o) => {
    for (const ch of o.children) {
      if (live.has(ch)) continue;
      if (ch.isMesh && ch.visible) {
        const key = ch.material.uuid + (ch.castShadow ? '+' : '-');
        let bin = bins.get(key);
        if (!bin) bins.set(key, (bin = { mat: ch.material, shadow: ch.castShadow, list: [] }));
        bin.list.push(ch);
      }
      walk(ch);
    }
  };
  walk(root);
  for (const { mat, shadow, list } of bins.values()) {
    if (list.length < 2) continue;
    const keepUv = !!mat.map;
    const parts = list.map((ms) => placed(ms.geometry, _m.multiplyMatrices(_inv, ms.matrixWorld), keepUv));
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const ms of list) ms.removeFromParent();
    const out = new THREE.Mesh(merged, mat);
    out.castShadow = shadow;
    root.add(out);
    kit.own.push(merged);
  }
  // 合并后留下来的空组（只装过零件的）去掉
  const prune = (o) => {
    for (const ch of [...o.children]) {
      prune(ch);
      if (ch.isGroup && !ch.children.length && !live.has(ch)) ch.removeFromParent();
    }
  };
  prune(root);
}
