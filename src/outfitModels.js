// 角色装扮的精细造型：发型 / 帽子、护目镜、背饰、围巾。拼法和滑行装备一样（gearParts.js）：
// 旋转体、弯管、挤出的平板，再盖一层程序画的贴花（针织纹、印花、警示贴、徽章），拼完把不动的零件按材质合并。
// 坐标：帽子和眼镜挂在头上——头中心是原点，脸朝 -Z，头顶 y≈0.25，眼睛 y≈0.04；
// 背饰和围巾挂在躯干上——脖子 y≈0.6，后背表面 z≈0.22。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRIM, geo, put, box, knob, soft, strut, pipeGeo, lathe, latheSkin, plateGeo, studsGeo, sticker, shade, bakeGear } from './gearParts.js';
import { decalMat, INK, WHITE, HAZARD, rect, poly, line, circle, ring, round, text, star, heart, hazard, css } from './gearDecals.js';

const HALF_PI = Math.PI / 2;
const HAIR_DARK = 0x2a1a12;
const PINK = 0xff3d6e;
const GOLDEN = 0xffc81f;

const rounded = (w, h, d, r) => geo(`rbox:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));

// 一块竖着的平板：XY 平面里的轮廓（x 向右、y 向上），沿 Z 挤出 depth，正面朝 -Z / +Z 两边
function flatGeo(pts, depth, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -depth / 2);
}

// 心形轮廓（尖朝下），中心在原点
function heartPts(s, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([(x / 17) * s, (y / 17) * s]);
  }
  return pts;
}

// 一圈贴着脸的弧面（护目镜的框和镜片）：半径 r、高 h，正对 -Z、左右各展开 half 弧度
const arcGeo = (r, h, half, seg = 20) => new THREE.CylinderGeometry(r, r, h, seg, 1, true, Math.PI - half, half * 2);

// 装扮用的材质表和合并记录（和 gearKit 同样的形状，bakeGear 要用）
export function outfitKit(lam) {
  return { m: lam, fx: { flames: [], spin: [], wings: [], flags: [] }, own: [] };
}

// ---------- 发型 / 帽子 ----------

// 头发底下那顶“帽壳”：前沿往上收，露出额头
const HAIR_CAP = [[0.268, 0.02], [0.266, 0.09], [0.247, 0.16], [0.205, 0.218], [0.14, 0.255], [0.07, 0.272], [0, 0.277]];
function hairCap(p, mat, k = 1, tilt = 0.26, ky = k) {
  const m = put(p, geo('hairCap', () => lathe(HAIR_CAP, 28)), mat, 0, 0.03, 0.012, k, ky, k);
  m.rotation.x = tilt;
  return m;
}

// 毛线帽：帽身一圈圈针织纹和两道白条，厚厚的罗纹翻边，前面一枚织标，顶上一团绒球
function beanie(h, c, lam) {
  const cap = [[0.268, 0.152], [0.265, 0.181], [0.245, 0.226], [0.206, 0.273], [0.145, 0.307], [0.074, 0.328], [0, 0.337]];
  put(h, geo('beanie.cap', () => lathe(cap, 32)), lam(c));
  latheSkin(h, 'beanie.knit', cap.map(([r, y]) => [r * 1.012, y + 0.001]), 14, (d, W, L) => {
    for (let y = 0.01; y < L; y += 0.018) {
      line(d, [[-W / 2, y], [-W / 4, y + 0.01], [0, y], [W / 4, y + 0.01], [W / 2, y]], INK, 0.004, 0.16);
    }
    rect(d, -W / 2, L - 0.07, W, 0.016, WHITE, 0.92);
    rect(d, -W / 2, L - 0.045, W, 0.01, WHITE, 0.92);
  });
  const cuff = [[0.252, 0.098], [0.276, 0.102], [0.284, 0.125], [0.283, 0.152], [0.266, 0.16]];
  put(h, geo('beanie.cuff', () => lathe(cuff, 40)), lam(shade(c, 0.82)));
  latheSkin(h, 'beanie.rib', cuff.map(([r, y]) => [r * 1.008, y]), 40, (d, W, L) => {
    rect(d, -W * 0.12, 0, W * 0.24, L, INK, 0.22);
  });
  const label = sticker(h, 'beanie.label', 0.085, 0.034, (d, W, L) => {
    round(d, -W / 2, 0, W, L, 0.006);
    d.fillStyle = css(WHITE);
    d.fill();
    text(d, 'SNOW', 0, L / 2, 0.022, INK, { squash: 0.9 });
  }, { px: 128, py: 64 });
  label.position.set(0, 0.13, -0.286);
  label.rotation.y = Math.PI;
  // 绒球：一团小球挤在一起
  const pom = lam(shade(c, 1.35));
  knob(h, pom, 0.07, 0.065, 0.07, 0, 0.35, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    knob(h, pom, 0.04, 0.04, 0.04, Math.cos(a) * 0.05, 0.355 + (i % 2) * 0.02, Math.sin(a) * 0.05);
  }
  knob(h, pom, 0.045, 0.04, 0.045, 0, 0.405, 0);
}

// 平头 + 头带：短短的寸头，头带上两道白条、正面一块字标，脑后打个结垂两条带尾
function headband(h, c, lam) {
  hairCap(h, lam(0x16161a), 0.99, 0.3, 0.86);
  const col = c === 0x1a1a1a ? PINK : c;
  const band = [[0.262, 0.07], [0.274, 0.075], [0.276, 0.1], [0.274, 0.125], [0.262, 0.13]];
  put(h, geo('band', () => lathe(band, 36)), lam(col));
  latheSkin(h, 'band.stripes', band.map(([r, y]) => [r * 1.006, y]), 1, (d, W, L) => {
    rect(d, -W / 2, L * 0.18, W, L * 0.1, WHITE, 0.95);
    rect(d, -W / 2, L * 0.72, W, L * 0.1, WHITE, 0.95);
    round(d, -0.07, L * 0.15, 0.14, L * 0.7, 0.01);
    d.fillStyle = css(INK);
    d.fill();
    text(d, 'GO!', 0, L * 0.52, 0.03, WHITE, { squash: 0.9 });
  }, { px: 512, py: 64 });
  const tail = geo('band.tail', () => flatGeo([[-0.025, 0], [0.025, 0], [0.03, -0.12], [0, -0.1], [-0.02, -0.13]], 0.008));
  for (const s of [-1, 1]) {
    const t = put(h, tail, lam(col), s * 0.03, 0.1, 0.275);
    t.rotation.set(0.25, 0, s * 0.35);
  }
  knob(h, lam(col), 0.03, 0.025, 0.02, 0, 0.1, 0.275);
}

// 莫西干：两侧剃短（颜色压暗一档），中间一排七根往后掠的发刺，发梢颜色提亮；左耳一只金耳环
function mohawk(h, c, lam) {
  hairCap(h, lam(shade(c, 0.5)), 0.99, 0.3, 0.86);
  const body = lam(c);
  const tip = lam(shade(c, 1.45));
  for (let i = 0; i < 7; i++) {
    const a = -0.85 + i * 0.3;
    const len = 0.27 - Math.abs(i - 2.2) * 0.03;
    const g = new THREE.Group();
    g.position.set(0, 0.03 + Math.cos(a) * 0.25, Math.sin(a) * 0.25);
    g.rotation.x = a + 0.45;
    put(g, PRIM.cone, body, 0, len / 2, 0, 0.035, len, 0.09);
    put(g, PRIM.cone, tip, 0, len * 0.86, 0, 0.015, len * 0.28, 0.038);
    h.add(g);
  }
  put(h, geo('earring', () => new THREE.TorusGeometry(0.022, 0.005, 6, 16)), lam(GOLDEN, { emissive: 0x553300 }), -0.275, -0.06, -0.005).rotation.y = HALF_PI;
}

// 长发 + 胡子：头顶一层，脑后一绺绺披下来，两鬓盖住耳朵，下巴一大把胡子；几道亮一点的发丝
function longHair(h, c, lam) {
  const hair = lam(HAIR_DARK);
  const shine = lam(0x4a3122);
  hairCap(h, hair, 1.035, 0.18);
  for (let i = 0; i < 6; i++) {
    const x = -0.2 + i * 0.08;
    const m = knob(h, hair, 0.075, 0.2 - Math.abs(i - 2.5) * 0.012, 0.07, x, -0.06, 0.19 - Math.abs(x) * 0.3);
    m.rotation.set(-0.25, 0, x * 0.6);
  }
  for (const s of [-1, 1]) {
    const lock = knob(h, hair, 0.06, 0.17, 0.08, s * 0.25, -0.04, 0.02);
    lock.rotation.z = -s * 0.12;
    put(h, geo('hair.strand', () => pipeGeo([[0.1, 0.2, -0.12], [0.2, 0.12, 0.05], [0.22, -0.05, 0.16], [0.18, -0.2, 0.2]], 0.008, 16, 4)), shine).scale.x = s;
  }
  // 胡子：一大把，加两撇小胡子
  knob(h, hair, 0.19, 0.12, 0.11, 0, -0.15, -0.16);
  knob(h, hair, 0.11, 0.1, 0.08, 0, -0.24, -0.15);
  for (const s of [-1, 1]) knob(h, hair, 0.07, 0.03, 0.035, s * 0.05, -0.085, -0.245).rotation.z = s * 0.3;
}

// 头盔：带通风槽的硬壳，壳上一道赛车条纹和字，后面一盏小尾灯，两侧护耳，一根下巴扣带
const HELMET = [[0.292, 0.0], [0.298, 0.06], [0.29, 0.13], [0.262, 0.2], [0.21, 0.262], [0.14, 0.3], [0.07, 0.318], [0, 0.322]];
function helmet(h, c, lam) {
  const shell = put(h, geo('helmet', () => lathe(HELMET, 40)), lam(c), 0, 0.06, 0.01);
  shell.scale.z = 1.06;
  const skinM = latheSkin(h, 'helmet.paint', HELMET.map(([r, y]) => [r * 1.008, y + 0.001]), 1, (d, W, L) => {
    rect(d, -0.035, 0, 0.07, L, WHITE, 0.95);
    rect(d, -0.012, 0, 0.024, L, INK, 0.85);
    rect(d, W / 2 - 0.035, 0, 0.035, L, WHITE, 0.95);
    rect(d, -W / 2, 0, 0.035, L, WHITE, 0.95);
    for (const s of [-1, 1]) {
      text(d, 'PRO', s * W * 0.25, L * 0.62, 0.05, WHITE, { stroke: INK, strokeW: 0.2 });
      star(d, s * W * 0.25, L * 0.32, 0.025, HAZARD);
    }
    rect(d, -W / 2, L - 0.018, W, 0.018, INK, 0.6);
  }, { px: 512, py: 128 });
  skinM.position.set(0, 0.06, 0.01);
  skinM.scale.z = 1.06;
  put(h, geo('helmet.rim', () => new THREE.TorusGeometry(0.294, 0.012, 6, 40).rotateX(HALF_PI)), lam(0x243647), 0, 0.062, 0.01).scale.z = 1.06;
  // 通风槽：顶上两排，各三道
  const vent = lam(0x10141c);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = -0.55 + i * 0.5;
      const m = put(h, rounded(0.03, 0.02, 0.09, 0.008), vent, s * 0.085, 0.06 + Math.cos(a) * 0.3, Math.sin(a) * 0.31 + 0.01);
      m.rotation.set(a, 0, -s * 0.3);
    }
  }
  knob(h, lam(0xff3030, { emissive: 0xff2020, emissiveIntensity: 0.9 }), 0.02, 0.014, 0.01, 0, 0.18, 0.31);
  for (const s of [-1, 1]) put(h, PRIM.cyl, lam(0x243647), s * 0.285, -0.02, 0.01, 0.075, 0.02, 0.075).rotation.z = HALF_PI;
  put(h, geo('helmet.strap', () => pipeGeo([[0.28, -0.05, 0.02], [0.22, -0.17, -0.07], [0.1, -0.24, -0.13], [0, -0.255, -0.14], [-0.1, -0.24, -0.13], [-0.22, -0.17, -0.07], [-0.28, -0.05, 0.02]], 0.007, 24, 4)), lam(0x243647));
}

// 爆炸头：一团蓬蓬的卷，戴一圈粉色发带，侧面插一把梳子
function afro(h, c, lam) {
  const hair = lam(HAIR_DARK);
  knob(h, hair, 0.33, 0.26, 0.3, 0, 0.2, 0.09);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.15 + r() * 1.2;
    const k = 0.1 + r() * 0.04;
    knob(h, hair, k, k * 0.9, k, Math.cos(a) * Math.cos(e) * 0.3, 0.2 + Math.sin(e) * 0.22, 0.09 + Math.sin(a) * Math.cos(e) * 0.28);
  }
  const band = [[0.262, 0.06], [0.274, 0.065], [0.276, 0.105], [0.262, 0.11]];
  put(h, geo('afro.band', () => lathe(band, 36)), lam(PINK));
  latheSkin(h, 'afro.band', band.map(([q, y]) => [q * 1.006, y]), 12, (d, W, L) => {
    circle(d, 0, L / 2, L * 0.22, WHITE, 0.95);
  }, { px: 64, py: 32 });
  // 梳子：把手 + 一排梳齿
  const comb = new THREE.Group();
  comb.position.set(0.24, 0.36, 0.05);
  comb.rotation.set(0, 0, -0.5);
  box(comb, lam(0xffd23c), 0.03, 0.12, 0.022, 0, 0.06, 0);
  knob(comb, lam(0xffd23c), 0.035, 0.035, 0.02, 0, 0.13, 0);
  for (let i = 0; i < 5; i++) box(comb, lam(0x1a1a1a), 0.008, 0.08, 0.008, -0.024 + i * 0.012, -0.03, 0);
  h.add(comb);
}

// 礼帽：两边微微上卷的帽檐，往上略微张开的帽筒，粉色缎带配金扣，缎带里别着一张扑克牌
function topHat(h, c, lam) {
  put(h, geo('top.brim', () => lathe([[0.19, 0.17], [0.3, 0.172], [0.355, 0.185], [0.372, 0.205], [0.362, 0.212], [0.33, 0.196], [0.26, 0.19], [0.19, 0.19]], 40)), lam(c));
  put(h, geo('top.crown', () => lathe([[0.196, 0.185], [0.205, 0.3], [0.222, 0.47], [0.226, 0.5], [0.2, 0.512], [0, 0.515]], 36)), lam(c));
  put(h, geo('top.band', () => lathe([[0.2, 0.19], [0.208, 0.19], [0.214, 0.265], [0.206, 0.265]], 36)), lam(PINK));
  latheSkin(h, 'top.shine', [[0.21, 0.3], [0.227, 0.47]], 3, (d, W, L) => {
    rect(d, -W * 0.08, 0, W * 0.05, L, WHITE, 0.18);
  }, { px: 64, py: 64 });
  box(h, lam(GOLDEN, { emissive: 0x553300 }), 0.05, 0.05, 0.012, 0, 0.228, -0.214);
  box(h, lam(PINK), 0.022, 0.022, 0.014, 0, 0.228, -0.217);
  const card = sticker(h, 'top.card', 0.07, 0.1, (d, W, L) => {
    round(d, -W / 2, 0, W, L, 0.008);
    d.fillStyle = css(0xfbf8f0);
    d.fill();
    text(d, 'A', -0.02, 0.016, 0.022, 0xd8243a, { italic: false });
    heart(d, 0, L / 2 + 0.004, 0.018, 0xd8243a);
  }, { px: 64, py: 128 });
  card.position.set(0.17, 0.27, -0.13);
  card.rotation.set(0, Math.PI + 0.9, 0.25);
}

// 绿毛：一圈圈往外翘的尖刺，发梢更亮；前面几根刘海往前戳
function spikes(h, c, lam) {
  hairCap(h, lam(c), 1.03, 0.1);
  const body = lam(c);
  const tip = lam(shade(c, 1.5));
  const spike = (x, y, z, len, rx, rz) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rx, 0, rz);
    put(g, PRIM.cone, body, 0, len / 2, 0, 0.075, len, 0.075);
    put(g, PRIM.cone, tip, 0, len * 0.88, 0, 0.032, len * 0.24, 0.032);
    h.add(g);
  };
  spike(0, 0.25, 0.0, 0.3, 0.35, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    spike(Math.cos(a) * 0.14, 0.21, Math.sin(a) * 0.14 + 0.02, 0.27, Math.sin(a) * 0.45 + 0.3, -Math.cos(a) * 0.45);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    if (Math.sin(a) < -0.5) continue;
    spike(Math.cos(a) * 0.23, 0.11, Math.sin(a) * 0.23 + 0.02, 0.22, Math.sin(a) * 0.75 + 0.4, -Math.cos(a) * 0.75);
  }
  for (const x of [-0.08, 0.02, 0.11]) spike(x, 0.21, -0.17, 0.15, -0.75, -0.35);
}

// 基础短发：头顶一层，前额几撮斜着的刘海，两鬓一点鬓角，头顶后面翘起一小撮
function shortHair(h, c, lam) {
  const hair = lam(c);
  hairCap(h, hair, 1.012, 0.24);
  for (let i = 0; i < 5; i++) {
    const x = -0.16 + i * 0.075;
    const m = put(h, PRIM.cone, hair, x, 0.155 - Math.abs(x) * 0.15, -0.225 + Math.abs(x) * 0.33, 0.055, 0.12, 0.022);
    m.rotation.set(Math.PI + 0.35, -x * 2, -0.45);
  }
  for (const s of [-1, 1]) box(h, hair, 0.03, 0.09, 0.05, s * 0.258, 0.03, -0.03);
  const tuft = put(h, PRIM.cone, hair, 0.02, 0.29, 0.11, 0.035, 0.09, 0.05);
  tuft.rotation.set(0.6, 0, -0.3);
}

const HATS = [beanie, headband, mohawk, longHair, helmet, afro, topHat, spikes];

// 在头上加一顶帽子 / 一种发型。helmetGoggles：戴头盔又没另选护目镜时，头盔上自带一副雪镜
export function buildHat(head, look, kit) {
  const lam = kit.m;
  const g = new THREE.Group();
  head.add(g);
  (HATS[look.hat] || shortHair)(g, look.hatColor, lam);
  if (look.hat === 4 && !look.goggles) goggles(g, 1, kit, 0.3);
  bakeGear(g, kit);
}

// ---------- 护目镜 ----------

// 雪镜的绑带：一圈印着字的松紧带，两侧一对扣
const STRAP_OPEN = 1.0; // 正面让出来的半角：这一段是镜框
function strap(p, lam, color, r, key, word) {
  const band = (q) => new THREE.CylinderGeometry(q, q, 0.05, 40, 1, true, -Math.PI + STRAP_OPEN, Math.PI * 2 - STRAP_OPEN * 2);
  put(p, geo('strap:' + r, () => band(r)), lam(color, { side: THREE.DoubleSide }), 0, 0.065, 0);
  const W = (r * (Math.PI * 2 - STRAP_OPEN * 2)) / 4;
  const print = decalMat('strap:' + key + r, W, 0.05, (d, W2, L) => {
    text(d, word, 0, L / 2, L * 0.55, WHITE, { squash: 0.85, a: 0.9 });
  }, { px: 128, py: 32, repeat: 4 });
  soft(put(p, geo('strapPrint:' + r, () => band(r * 1.01)), print, 0, 0.065, 0));
}

// 镜片的颜色渐变加一道斜着的高光
function lensMat(key, top, bottom) {
  return decalMat('lens:' + key, 1, 0.4, (d, W, L) => {
    const gr = d.createLinearGradient(0, 0, 0, L);
    gr.addColorStop(0, css(top));
    gr.addColorStop(1, css(bottom));
    d.fillStyle = gr;
    d.fillRect(-W / 2, 0, W, L);
    poly(d, [[-0.28, 0], [-0.18, 0], [-0.32, L], [-0.42, L]], WHITE, 0.45);
    poly(d, [[-0.12, 0], [-0.09, 0], [-0.23, L], [-0.26, L]], WHITE, 0.3);
  }, { px: 128, py: 64, opaque: true });
}

// 包住眼睛的大雪镜：弧形镜框、渐变镜片、鼻托缺口、两侧扣，绑带一圈。r：绑带半径（戴头盔时更大）
function skiGoggle(p, kit, { lens, frame, word, top, bottom, r = 0.263 }) {
  const lam = kit.m;
  strap(p, lam, frame, r, word, word);
  put(p, geo('gog.frame', () => arcGeo(0.256, 0.118, 0.98)), lam(frame, { side: THREE.DoubleSide }), 0, 0.058, 0);
  put(p, geo('gog.rimT', () => new THREE.TorusGeometry(0.262, 0.011, 6, 24, 1.96).rotateX(HALF_PI).rotateY(HALF_PI + 0.98)), lam(shade(frame, 1.25)), 0, 0.114, 0);
  put(p, geo('gog.rimT', () => new THREE.TorusGeometry(0.262, 0.011, 6, 24, 1.96).rotateX(HALF_PI).rotateY(HALF_PI + 0.98)), lam(shade(frame, 1.25)), 0, 0.002, 0);
  put(p, geo('gog.lens', () => arcGeo(0.265, 0.09, 0.86)), lensMat(lens, top, bottom), 0, 0.06, 0);
  box(p, lam(frame), 0.05, 0.03, 0.02, 0, 0.012, -0.262);
  for (const s of [-1, 1]) box(p, lam(0x9aa0ac), 0.016, 0.045, 0.03, s * 0.236, 0.062, -0.12).rotation.y = s * 0.5;
}

function goggles(p, kind, kit, strapR = 0.263) {
  const lam = kit.m;
  switch (kind) {
    case 1: // 橙色雪镜
      skiGoggle(p, kit, { lens: 'orange', frame: 0x203143, word: 'SNOW', top: 0xffd060, bottom: 0xff6a2a, r: strapR });
      break;
    case 2: { // 墨镜：方框镜架（挖出两个镜孔）、深色渐变镜片、金属铰链和镜腿
      const front = new THREE.Group();
      front.position.set(0, 0.05, -0.258);
      p.add(front);
      const lensHole = (x) => [[x - 0.062, 0.035], [x + 0.062, 0.035], [x + 0.056, -0.025], [x + 0.03, -0.042], [x - 0.04, -0.042], [x - 0.06, -0.02]];
      const outline = [[-0.2, 0.05], [0.2, 0.05], [0.2, 0.02], [0.17, -0.05], [0.03, -0.05], [0.015, -0.02], [-0.015, -0.02], [-0.03, -0.05], [-0.17, -0.05], [-0.2, 0.02]];
      put(front, geo('shades.frame', () => flatGeo(outline, 0.022, [lensHole(-0.1), lensHole(0.1)].map((h) => h.slice().reverse()))), lam(0x111118));
      const tint = lam(0x1c2638, { emissive: 0x0a1020 });
      const glint = lam(0xffffff, { transparent: true, opacity: 0.35 });
      for (const s of [-1, 1]) {
        put(front, geo('shades.lens' + s, () => flatGeo(lensHole(s * 0.1), 0.008)), tint, 0, 0, 0.002);
        soft(box(front, glint, 0.012, 0.06, 0.002, s * 0.1 - 0.025, 0, -0.0035)).rotation.z = -0.5;
        put(front, PRIM.cyl, lam(0xdde3ec), s * 0.198, 0.03, 0.012, 0.008, 0.03, 0.008);
        strut(p, lam(0x111118), [s * 0.205, 0.08, -0.25], [s * 0.255, 0.075, -0.02], 0.009);
      }
      break;
    }
    case 3: { // 心形眼镜：两片粉色半透明心形镜片，外面一圈镜框，中间鼻梁
      const front = new THREE.Group();
      front.position.set(0, 0.055, -0.258);
      p.add(front);
      const glass = lam(0xff7ab8, { transparent: true, opacity: 0.6, emissive: 0xff2f8a, emissiveIntensity: 0.25 });
      for (const s of [-1, 1]) {
        put(front, geo('heart.lens', () => flatGeo(heartPts(0.068), 0.008)), glass, s * 0.098, 0, 0.003);
        put(front, geo('heart.rim', () => flatGeo(heartPts(0.08), 0.016, [heartPts(0.066).reverse()])), lam(0xff2f8a), s * 0.098, 0, 0);
        knob(front, lam(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }), 0.012, 0.012, 0.006, s * 0.125, 0.03, -0.006);
        strut(p, lam(0xff2f8a), [s * 0.17, 0.08, -0.25], [s * 0.255, 0.075, -0.02], 0.008);
      }
      box(front, lam(0xff2f8a), 0.05, 0.014, 0.014, 0, 0.03, 0);
      break;
    }
    case 4: { // 电竞护目镜：青色一体镜片，上沿一道灯带，两侧机械模块各两颗指示灯
      skiGoggle(p, kit, { lens: 'cyber', frame: 0x1b314c, word: 'GAME', top: 0x8af4ff, bottom: 0x1f6dff, r: strapR });
      const lit = lam(0x58e7ff, { emissive: 0x58e7ff, emissiveIntensity: 1 });
      put(p, geo('cyber.led', () => new THREE.TorusGeometry(0.268, 0.006, 4, 24, 1.5).rotateX(HALF_PI).rotateY(HALF_PI + 0.75)), lit, 0, 0.108, 0);
      for (const s of [-1, 1]) {
        const mod = put(p, rounded(0.05, 0.075, 0.07, 0.012), lam(0x22283a), s * 0.245, 0.06, -0.1);
        mod.rotation.y = s * 0.45;
        knob(p, lit, 0.009, 0.009, 0.009, s * 0.273, 0.075, -0.115);
        knob(p, lam(0xff5fc8, { emissive: 0xff5fc8, emissiveIntensity: 1 }), 0.009, 0.009, 0.009, s * 0.273, 0.05, -0.115);
      }
      break;
    }
  }
}

export function buildGoggles(group, kind, kit) {
  goggles(group, kind, kit);
  bakeGear(group, kit);
}

// ---------- 背饰 ----------

// 双肩包：圆角包身、前袋、拉链和拉头、顶上提手、肩带（带扣）、侧袋里插一瓶水，前袋上缝一枚雪花徽章
function backpack(t, L, lam) {
  const body = lam(L.stripe);
  const deep = lam(shade(L.stripe, 0.62));
  const dark = lam(0x2b2f3a);
  put(t, rounded(0.36, 0.42, 0.17, 0.06), body, 0, 0.32, 0.3);
  put(t, rounded(0.27, 0.19, 0.07, 0.03), deep, 0, 0.22, 0.4);
  const zip = sticker(t, 'pack.zip', 0.3, 0.02, (d, W, L2) => {
    rect(d, -W / 2, 0, W, L2, INK, 0.9);
    for (let x = -W / 2; x < W / 2; x += 0.006) rect(d, x, L2 * 0.25, 0.003, L2 * 0.5, 0xc8ccd6);
  }, { px: 256, py: 16 });
  zip.position.set(0, 0.47, 0.386);
  const zip2 = zip.clone();
  zip2.position.set(0, 0.305, 0.436);
  zip2.scale.x = 0.8;
  t.add(zip2);
  for (const [x, y, z] of [[0.13, 0.47, 0.39], [0.1, 0.3, 0.44]]) box(t, lam(0xdde3ec), 0.02, 0.035, 0.008, x, y - 0.02, z);
  const badge = sticker(t, 'pack.badge', 0.08, 0.08, (d, W, L2) => {
    circle(d, 0, L2 / 2, 0.038, INK);
    circle(d, 0, L2 / 2, 0.032, WHITE);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      line(d, [[0, L2 / 2], [Math.cos(a) * 0.024, L2 / 2 + Math.sin(a) * 0.024]], 0x2f6bff, 0.006);
    }
  }, { px: 64, py: 64 });
  badge.position.set(0, 0.22, 0.436);
  put(t, geo('pack.handle', () => new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI)), dark, 0, 0.53, 0.3);
  for (const s of [-1, 1]) {
    put(t, geo('pack.strap', () => pipeGeo([[0.12, 0.48, 0.24], [0.14, 0.6, 0.12], [0.14, 0.56, -0.08], [0.13, 0.42, -0.2], [0.12, 0.24, -0.2]], 0.018, 24, 6)), dark).scale.x = s;
    box(t, lam(0xdde3ec), 0.045, 0.03, 0.012, s * 0.13, 0.34, -0.21);
  }
  // 侧袋和水瓶
  put(t, rounded(0.06, 0.12, 0.1, 0.02), deep, 0.2, 0.2, 0.3);
  put(t, PRIM.cyl, lam(0x3fc8ff, { transparent: true, opacity: 0.8 }), 0.2, 0.3, 0.3, 0.035, 0.18, 0.035);
  put(t, PRIM.cyl, lam(0xffffff), 0.2, 0.4, 0.3, 0.025, 0.03, 0.025);
}

// 披风：下摆剪成燕尾波浪，外面正红、里子深红，背后一枚菱形星徽，领口一圈金边，两侧金色扣子
function cape(t, L, lam) {
  const g = new THREE.Group();
  g.position.set(0, 0.58, 0.2);
  const outline = [[-0.24, 0], [0.24, 0], [0.3, -0.5], [0.34, -0.92], [0.2, -0.84], [0.1, -0.95], [0, -0.86], [-0.1, -0.95], [-0.2, -0.84], [-0.34, -0.92], [-0.3, -0.5]];
  put(g, geo('cape.cloth', () => flatGeo(outline, 0.025)), lam(0xe0222a));
  put(g, geo('cape.lining', () => flatGeo(outline, 0.012).scale(0.97, 0.98, 1)), lam(0x7a0f18), 0, -0.01, -0.016);
  const emblem = sticker(g, 'cape.emblem', 0.24, 0.24, (d, W, L2) => {
    poly(d, [[0, 0.01], [W / 2 - 0.01, L2 / 2], [0, L2 - 0.01], [-W / 2 + 0.01, L2 / 2]], 0xffc81f);
    poly(d, [[0, 0.03], [W / 2 - 0.035, L2 / 2], [0, L2 - 0.03], [-W / 2 + 0.035, L2 / 2]], 0xe0222a);
    star(d, 0, L2 / 2 + 0.006, 0.06, 0xffc81f);
  }, { px: 128, py: 128 });
  emblem.position.set(0, -0.32, 0.014);
  const folds = sticker(g, 'cape.folds', 0.6, 0.9, (d, W, L2) => {
    for (const x of [-0.18, -0.06, 0.06, 0.18]) {
      const gr = d.createLinearGradient(x - 0.04, 0, x + 0.04, 0);
      gr.addColorStop(0, css(INK, 0));
      gr.addColorStop(0.5, css(INK, 0.22));
      gr.addColorStop(1, css(INK, 0));
      d.fillStyle = gr;
      d.fillRect(x - 0.04, L2 * 0.35, 0.08, L2 * 0.65);
    }
  }, { px: 128, py: 128 });
  folds.position.set(0, -0.47, 0.0135);
  box(g, lam(GOLDEN, { emissive: 0x553300 }), 0.5, 0.05, 0.04, 0, -0.01, 0);
  t.add(g);
  for (const s of [-1, 1]) knob(t, lam(GOLDEN, { emissive: 0x553300 }), 0.035, 0.035, 0.015, s * 0.15, 0.56, -0.17);
  put(t, geo('cape.collar', () => pipeGeo([[-0.17, 0.57, -0.15], [-0.2, 0.6, 0.05], [0, 0.62, 0.19], [0.2, 0.6, 0.05], [0.17, 0.57, -0.15]], 0.022, 24, 6)), lam(0xe0222a));
  return g;
}

// 火箭背包：两只带尾翼的火箭罐，罐身一圈警示斜纹，底下喷口；中间一块控制盒，几颗指示灯
const TANK = [[0, -0.21], [0.06, -0.21], [0.085, -0.17], [0.09, -0.1], [0.09, 0.14], [0.08, 0.19], [0.055, 0.25], [0.02, 0.29], [0, 0.3]];
function rocket(t, L, lam, flames) {
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.11, 0.34, 0.33);
    t.add(g);
    put(g, geo('rocket.tank', () => lathe(TANK, 24)), lam(0xc8ccd6));
    put(g, geo('rocket.nose', () => lathe([[0.081, 0.19], [0.056, 0.25], [0.021, 0.29], [0, 0.302]], 24)), lam(0xe0263c), 0, 0.001, 0).scale.setScalar(1.02);
    latheSkin(g, 'rocket.band', [[0.0915, -0.06], [0.0915, -0.01]], 4, (d, W, L2) => hazard(d, -W / 2, 0, W, L2, 0.02), { px: 64, py: 32 });
    put(g, geo('rocket.nozzle', () => lathe([[0.03, -0.21], [0.05, -0.25], [0.068, -0.3], [0.06, -0.3], [0.042, -0.25], [0.025, -0.21]], 18)), lam(0x3a3f47));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + (s > 0 ? 0.5 : -0.5) + Math.PI;
      const fin = put(g, geo('rocket.fin', () => plateGeo([[0, 0], [0.1, 0], [0.06, 0.07], [0, 0.08]], 0.01, true)), lam(0xe0263c), Math.sin(a) * 0.085, -0.18, Math.cos(a) * 0.085);
      fin.rotation.y = a - HALF_PI;
    }
    const fl = new THREE.Mesh(PRIM.cone, new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85, depthWrite: false }));
    fl.scale.set(0.07, 0.35, 0.07);
    fl.rotation.x = Math.PI;
    fl.position.set(0, -0.47, 0);
    fl.visible = false;
    g.add(fl);
    flames.push(fl);
  }
  put(t, rounded(0.12, 0.3, 0.07, 0.02), lam(0x6f7883), 0, 0.32, 0.27);
  const panel = sticker(t, 'rocket.panel', 0.09, 0.14, (d, W, L2) => {
    round(d, -W / 2, 0, W, L2, 0.01);
    d.fillStyle = css(0x1a1f2b);
    d.fill();
    for (const [y, c] of [[0.025, 0x58e7ff], [0.05, 0x8cff5a], [0.075, 0xff3030]]) circle(d, -0.02, y, 0.008, c);
    rect(d, 0.0, 0.017, 0.03, 0.012, WHITE, 0.6);
    rect(d, 0.0, 0.042, 0.03, 0.012, WHITE, 0.6);
    warn(d, 0, 0.11, 0.035);
  }, { px: 64, py: 128, glow: true });
  panel.position.set(0, 0.34, 0.306);
}
function warn(d, x, y, s) {
  poly(d, [[x, y - s * 0.5], [x + s * 0.55, y + s * 0.45], [x - s * 0.55, y + s * 0.45]], HAZARD);
}

// 天使翅膀：每边三层羽毛——外面一排长飞羽，里面两排覆羽，前缘一道金线
function wing(lam, s) {
  const w = new THREE.Group();
  w.position.set(s * 0.08, 0.46, 0.27);
  w.rotation.z = s * 0.35;
  const feather = (len, wid) => geo(`feather:${len}:${wid}`, () => flatGeo([[0, wid / 2], [len * 0.75, wid / 2], [len, 0], [len * 0.8, -wid / 2], [0, -wid / 2]], 0.018));
  const white = lam(0xffffff, { emissive: 0x334455 });
  const soft2 = lam(0xeef3ff, { emissive: 0x2a3344 });
  const k = new THREE.Group();
  k.scale.x = s;
  w.add(k);
  for (let i = 0; i < 6; i++) {
    const f = put(k, feather(0.42 - i * 0.03, 0.09), white, 0.05 + i * 0.07, 0.02 - i * 0.012, 0.004 * i);
    f.rotation.z = -0.55 - i * 0.12;
  }
  for (let i = 0; i < 5; i++) {
    const f = put(k, feather(0.26, 0.085), soft2, 0.02 + i * 0.07, 0.09 - i * 0.01, -0.018);
    f.rotation.z = -0.25 - i * 0.1;
  }
  for (let i = 0; i < 4; i++) {
    const f = put(k, feather(0.16, 0.08), white, 0.0 + i * 0.07, 0.13, -0.034);
    f.rotation.z = -0.1 - i * 0.08;
  }
  put(k, geo('wing.edge', () => pipeGeo([[0, 0.17, -0.04], [0.15, 0.19, -0.04], [0.32, 0.15, -0.035], [0.48, 0.06, -0.03]], 0.012, 16, 5)), lam(GOLDEN, { emissive: 0x553300 }));
  return w;
}

// 冠军奖杯：背上一副小背架托着奖杯——台阶底座、底座上的铭牌、细杯脚、敞口杯身、两侧把手、杯口一圈亮边
function trophy(t, L, lam) {
  const gold = lam(GOLDEN, { emissive: 0x553300 });
  const dark = lam(0x2b2f3a);
  put(t, rounded(0.22, 0.1, 0.16, 0.03), dark, 0, 0.3, 0.3);
  for (const s of [-1, 1]) put(t, geo('trophy.strap', () => pipeGeo([[0.1, 0.34, 0.24], [0.13, 0.58, 0.12], [0.13, 0.52, -0.1], [0.12, 0.3, -0.2]], 0.014, 20, 5)), dark).scale.x = s;
  const g = new THREE.Group();
  g.position.set(0, 0.35, 0.33);
  t.add(g);
  put(g, geo('trophy.base', () => lathe([[0, 0], [0.075, 0], [0.075, 0.035], [0.06, 0.035], [0.06, 0.06], [0.03, 0.065], [0.016, 0.09], [0.014, 0.13], [0, 0.13]], 6)), dark);
  put(g, geo('trophy.cup', () => lathe([[0, 0.12], [0.03, 0.13], [0.03, 0.15], [0.07, 0.19], [0.1, 0.26], [0.11, 0.32], [0.1, 0.32], [0.09, 0.26], [0.06, 0.2], [0, 0.18]], 28)), gold);
  put(g, geo('trophy.rim', () => new THREE.TorusGeometry(0.106, 0.008, 6, 28).rotateX(HALF_PI)), lam(0xfff2b0, { emissive: 0x665522 }), 0, 0.32, 0);
  for (const s of [-1, 1]) put(g, geo('trophy.handle', () => new THREE.TorusGeometry(0.045, 0.01, 6, 14, Math.PI * 1.2).rotateZ(-HALF_PI - 0.3)), gold, s * 0.1, 0.25, 0).scale.x = s;
  const plaque = sticker(g, 'trophy.plaque', 0.08, 0.03, (d, W, L2) => {
    rect(d, -W / 2, 0, W, L2, GOLDEN);
    text(d, 'No.1', 0, L2 / 2, 0.02, INK, { squash: 0.9 });
  }, { px: 128, py: 64 });
  plaque.position.set(0, 0.018, 0.0765);
  knob(g, gold, 0.02, 0.02, 0.02, 0, 0.34, 0);
}

// 背饰。返回要动起来的零件：cape 披风、wings 一对翅膀、jetFlames 火箭尾焰
export function buildBack(group, kind, L, kit) {
  const lam = kit.m;
  const out = { cape: null, wings: null, jetFlames: null };
  switch (kind) {
    case 1:
      backpack(group, L, lam);
      break;
    case 2:
      out.cape = cape(group, L, lam);
      break;
    case 3:
      out.jetFlames = [];
      rocket(group, L, lam, out.jetFlames);
      break;
    case 4:
      out.wings = [-1, 1].map((s) => {
        const w = wing(lam, s);
        group.add(w);
        return w;
      });
      break;
    case 5:
      trophy(group, L, lam);
      break;
  }
  // 会动的零件各自先合并一遍，再把剩下不动的合并
  for (const o of [out.cape, ...(out.wings || [])]) if (o) bakeGear(o, kit);
  kit.fx.flags.push(...[out.cape, ...(out.wings || []), ...(out.jetFlames || [])].filter(Boolean));
  bakeGear(group, kit);
  return out;
}

// ---------- 围巾 ----------

// 针织围巾：绕脖子一圈，印着条纹和针织纹；前面打个结，垂下来的一条（tail，会随速度飘）末端一排流苏
export function buildScarf(group, kind, L, kit) {
  if (!kind) return null;
  const lam = kit.m;
  const wool = lam(L.stripe);
  put(group, geo('scarf.wrap', () => new THREE.TorusGeometry(0.18, 0.05, 10, 32).rotateX(HALF_PI)), wool, 0, 0.6, 0).scale.set(1, 1.1, 0.95);
  const knit = (d, W, L2) => {
    for (let x = -W / 2; x < W / 2; x += 0.02) line(d, [[x, 0], [x + 0.01, L2 / 2], [x, L2]], INK, 0.004, 0.18);
  };
  const wrap = soft(put(group, geo('scarf.wrapSkin', () => new THREE.TorusGeometry(0.18, 0.052, 10, 32).rotateX(HALF_PI)), decalMat('scarf.wrap', 0.14, 0.33, (d, W, L2) => {
    knit(d, W, L2);
    rect(d, -W / 2, L2 * 0.62, W, L2 * 0.09, WHITE, 0.95);
    rect(d, -W / 2, L2 * 0.8, W, L2 * 0.09, WHITE, 0.95);
  }, { px: 64, py: 64, repeat: 8 }), 0, 0.6, 0));
  wrap.scale.set(1, 1.1, 0.95);
  knob(group, wool, 0.06, 0.055, 0.05, 0.08, 0.57, -0.16);
  const len = kind === 2 ? 0.62 : 0.32;
  const tail = new THREE.Group();
  tail.position.set(0.08, 0.6, 0.14);
  const piece = put(tail, rounded(0.1, 0.03, len, 0.012), wool, 0, 0, len / 2);
  piece.castShadow = true;
  const print = sticker(tail, 'scarf.tail' + kind, 0.1, len, (d, W, L2) => {
    knit(d, W, L2);
    for (let y = 0.05; y < L2 - 0.08; y += 0.09) {
      rect(d, -W / 2, y, W, 0.022, WHITE, 0.95);
      rect(d, -W / 2, y + 0.034, W, 0.01, WHITE, 0.95);
    }
  }, { px: 64, py: 256 });
  print.rotation.x = -HALF_PI;
  print.position.set(0, 0.0165, len / 2);
  const fringe = geo('scarf.fringe', () => {
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 4).rotateX(HALF_PI).translate(-0.04 + i * 0.016, 0, 0.035));
    return mergeGeometries(parts);
  });
  put(tail, fringe, lam(0xffffff), 0, 0, len);
  group.add(tail);
  bakeGear(tail, kit);
  kit.fx.flags.push(tail);
  bakeGear(group, kit);
  return tail;
}
