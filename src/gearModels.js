// 滑行装备的精细模型。每件一套独立造型：放样出带翘头和腰线的板面，再加固定器、推进器、灯条这些零件，
// 板面上盖一层程序画的图案（文字、贴纸、花纹，见 gearDecals.js）。
// 这里只管拼几何体；动画（喷火、转灯、扇翼、悬浮起伏）由 skier.js 驱动。
// 约定：-Z 是前方，+Y 朝上。双板用单只脚的坐标（板面中心在 y = 0）；单板用脚底坐标（板面顶在 y = 0.04）；
// 坐着滑的载具在 gearRides.js，用地面坐标（y = 0 是雪面）。
import * as THREE from 'three';
import {
  PRIM, geo, put, box, ball, soft, strut, rod, plateGeo, studsGeo, loftGeo, skiStations, inlay, under, railOf, sample, sampleEnds,
  skin, flame, glowMat, shade,
} from './gearParts.js';
import {
  INK, WHITE, HAZARD, rect, poly, line, circle, ring, round, text, star, heart, chevrons, hazard, warn, barcode, snowflake, bolt, scales,
  weave, hexes, dotRow, css, rng,
} from './gearDecals.js';
import { RIDES } from './gearRides.js';

export { gearKit, bakeGear } from './gearParts.js';

const HALF_PI = Math.PI / 2;
const SKI_TEX = { px: 64, py: 1024 };
const BOARD_TEX = { px: 256, py: 512 };

// ---------- 双板 ----------

// 高山固定器：底板、前夹（调节盖、刻度窗）、后跟（跟杯、翘起来的扳手）、止滑器、几颗螺丝。lift：垫高板的厚度
function alpineBinding(g, c, accent, { lift = 0, brakes = true } = {}) {
  const y = lift;
  const label = c.m(0xf2f4f6);
  box(g, c.dark, 0.1, 0.014, 0.52, 0, 0.022 + y, 0.03);
  box(g, c.steel, 0.09, 0.034, 0.085, 0, 0.044 + y, -0.205);
  box(g, c.black, 0.114, 0.026, 0.055, 0, 0.07 + y, -0.198);
  box(g, accent, 0.07, 0.03, 0.03, 0, 0.056 + y, -0.255);
  box(g, label, 0.03, 0.004, 0.02, 0, 0.0845 + y, -0.205);
  box(g, accent, 0.094, 0.06, 0.11, 0, 0.055 + y, 0.262);
  box(g, c.black, 0.106, 0.026, 0.08, 0, 0.096 + y, 0.238);
  box(g, c.dark, 0.044, 0.016, 0.15, 0, 0.1 + y, 0.335).rotation.x = -0.42;
  box(g, label, 0.03, 0.004, 0.02, 0, 0.0855 + y, 0.29);
  if (brakes) {
    for (const s of [-1, 1]) {
      strut(g, c.steel, [s * 0.058, 0.03 + y, 0.17], [s * 0.078, 0.004, 0.33], 0.006);
      box(g, c.rubber, 0.016, 0.014, 0.03, s * 0.079, 0.006, 0.338);
    }
  }
  const pts = [];
  for (const z of [-0.12, 0.13]) for (const x of [-0.036, 0.036]) pts.push([x, 0.03 + y, z]);
  put(g, geo('alp.screws' + y, () => studsGeo(pts, 0.007)), c.chrome);
}

// 入门双板：经典的山地板。板头一块装饰色斜收白边，板身两道细线和字标，板尾三道斜纹
const CLASSIC = { tail: 0.78, nose: -0.98, w: 0.125, waist: 0.098, tailKick: 0.035, noseKick: 0.12, tailLen: 0.12, noseLen: 0.2, n: 28 };
function classic(g, c) {
  const st = skiStations(CLASSIC);
  const T = c.trimColor;
  put(g, geo('classic', () => loftGeo(st)), c.main);
  put(g, geo('classic.edge', () => loftGeo(under(st, 0.008, 0.008))), c.steel);
  skin(g, 'classic', st, 0.13, (d, W, L) => {
    poly(d, [[-W / 2, 0], [W / 2, 0], [W / 2, 0.24], [-W / 2, 0.32]], T);
    poly(d, [[-W / 2, 0.335], [W / 2, 0.255], [W / 2, 0.272], [-W / 2, 0.352]], WHITE);
    poly(d, [[-0.04, 0.17], [-0.012, 0.11], [0.004, 0.14], [0.018, 0.12], [0.045, 0.17]], WHITE);
    for (const x of [-0.042, 0.042]) line(d, [[x, 0.4], [x, L - 0.36]], INK, 0.004, 0.45);
    text(d, 'SNOWLINE', 0, 0.58, 0.052, INK, { rot: HALF_PI });
    for (let i = 0; i < 3; i++) {
      const y = L - 0.3 + i * 0.045;
      poly(d, [[-W / 2, y + 0.03], [W / 2, y], [W / 2, y + 0.018], [-W / 2, y + 0.048]], T);
    }
    rect(d, -W / 2, L - 0.12, W, 0.12, T);
    text(d, '168', 0, L - 0.42, 0.032, INK, { rot: HALF_PI, a: 0.7 });
  }, SKI_TEX);
  alpineBinding(g, c, c.trim);
}

// 竞赛双板：大回转板，更长更窄；板头黑白格、三道斜切色带、号码牌，脚下一块加高的竞赛垫板
const GS = { tail: 0.86, nose: -1.1, w: 0.118, waist: 0.09, tailKick: 0.022, noseKick: 0.1, tailLen: 0.08, noseLen: 0.17, n: 30 };
function race(g, c) {
  const st = skiStations(GS);
  const T = c.trimColor;
  put(g, geo('race', () => loftGeo(st)), c.main);
  put(g, geo('race.edge', () => loftGeo(under(st, 0.008, 0.008))), c.steel);
  skin(g, 'race', st, 0.12, (d, W, L) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) rect(d, -W / 2 + (j * W) / 2, 0.05 + i * 0.045, W / 2, 0.045, (i + j) % 2 ? INK : WHITE);
    for (let i = 0; i < 3; i++) {
      const y = 0.3 + i * 0.085;
      poly(d, [[-W / 2, y + 0.06], [W / 2, y], [W / 2, y + 0.04], [-W / 2, y + 0.1]], i === 1 ? INK : T);
    }
    text(d, 'RACE', 0, 0.68, 0.06, WHITE, { rot: HALF_PI, stroke: INK, strokeW: 0.25 });
    for (const x of [-W / 2 + 0.006, W / 2 - 0.006]) line(d, [[x, 0.62], [x, L - 0.2]], T, 0.006);
    round(d, -0.042, L - 0.34, 0.084, 0.14, 0.014);
    d.fillStyle = css(WHITE);
    d.fill();
    text(d, '07', 0, L - 0.27, 0.06, INK, { rot: HALF_PI });
    rect(d, -W / 2, L - 0.12, W, 0.12, T);
    text(d, 'GS', 0, L - 0.06, 0.045, INK, { rot: HALF_PI });
  }, SKI_TEX);
  // 竞赛垫板：两侧各一道装饰色、四颗螺丝
  box(g, c.dark, 0.084, 0.022, 0.68, 0, 0.026, 0.04);
  for (const s of [-1, 1]) box(g, c.trim, 0.003, 0.01, 0.62, s * 0.0425, 0.027, 0.04);
  put(g, geo('race.studs', () => studsGeo([[-0.03, 0.037, -0.27], [0.03, 0.037, -0.27], [-0.03, 0.037, 0.35], [0.03, 0.037, 0.35]], 0.006)), c.chrome);
  alpineBinding(g, c, c.trim, { lift: 0.014 });
}

// 碳纤维双板：板身中段整块碳纤维编织，发光的细线勾边，板头包一块金属护片，脚下是登山式的轻量固定器
const CARBON = { tail: 0.82, nose: -1.04, w: 0.122, waist: 0.092, tailKick: 0.03, noseKick: 0.11, tailLen: 0.1, noseLen: 0.19, th: 0.026, n: 30 };
function carbon(g, c) {
  const st = skiStations(CARBON);
  const T = c.trimColor;
  put(g, geo('carbon', () => loftGeo(st)), c.main);
  put(g, geo('carbon.edge', () => loftGeo(under(st, 0.008, 0.008))), c.steel);
  put(g, geo('carbon.cap', () => loftGeo(inlay(st, 0.94, 0.94, 1, 0.001))), c.chrome);
  skin(g, 'carbon', st, 0.13, (d, W, L) => {
    weave(d, -W / 2, 0.22, W / 2, L - 0.16, 0.011);
    poly(d, [[-W / 2, 0.22], [W / 2, 0.16], [W / 2, 0.22]], 0x1b1e26);
    rect(d, -W / 2, L - 0.16, W, 0.008, WHITE, 0.7);
    text(d, 'CARBON', 0.012, 0.6, 0.05, WHITE, { rot: HALF_PI, a: 0.9 });
    text(d, 'ULTRA LIGHT', -0.026, 0.6, 0.018, WHITE, { rot: HALF_PI, a: 0.6, weight: 700 });
  }, SKI_TEX);
  skin(g, 'carbon.glow', st, 0.13, (d, W, L) => {
    for (const x of [-W / 2 + 0.008, W / 2 - 0.008]) line(d, [[x, 0.3], [x, L - 0.24]], T, 0.0045);
    line(d, [[-W / 2, 0.228], [W / 2, 0.168]], T, 0.005);
    for (let i = 0; i < 5; i++) rect(d, -0.004, L - 0.42 + i * 0.04, 0.008, 0.022, T);
    text(d, 'CX-9', 0, 0.36, 0.04, T, { rot: HALF_PI });
  }, { ...SKI_TEX, glow: true, lift: 0.0025 });
  // 登山式固定器：碳纤维薄底板、两片夹针的前座、一根跟柱
  box(g, c.black, 0.07, 0.01, 0.5, 0, 0.02, 0.03);
  box(g, c.dark, 0.08, 0.024, 0.07, 0, 0.032, -0.205);
  for (const s of [-1, 1]) box(g, c.chrome, 0.014, 0.042, 0.03, s * 0.042, 0.056, -0.2);
  box(g, c.lit, 0.03, 0.01, 0.07, 0, 0.05, -0.245).rotation.x = 0.4;
  put(g, PRIM.cyl, c.dark, 0, 0.058, 0.252, 0.036, 0.074, 0.036);
  put(g, PRIM.cyl, c.lit, 0, 0.098, 0.252, 0.038, 0.01, 0.038);
  for (const s of [-1, 1]) {
    box(g, c.chrome, 0.008, 0.008, 0.032, s * 0.015, 0.076, 0.222);
    strut(g, c.steel, [s * 0.05, 0.026, 0.19], [s * 0.074, 0.004, 0.33], 0.005);
  }
}

// 极光双板：深夜蓝的板面上一层会发光的极光帘幕和星点，侧壁是主色，钢边换成发光的边，
// 板头长出一簇冰晶，跟座后面嵌一颗晶石
const AURORA = { tail: 0.84, nose: -1.08, w: 0.13, waist: 0.1, tailKick: 0.05, noseKick: 0.13, tailLen: 0.12, noseLen: 0.21, n: 30 };
function aurora(g, c) {
  const st = skiStations(AURORA);
  put(g, geo('aurora', () => loftGeo(st)), c.m(0x161a38));
  put(g, geo('aurora.side', () => loftGeo(under(st, 0.006, 0.014))), c.main);
  put(g, geo('aurora.edge', () => loftGeo(under(st, 0.012, 0.008).map((s) => ({ ...s, off: s.off - 0.01 })))), c.lit);
  skin(g, 'aurora', st, 0.14, (d, W, L) => {
    const cols = [0xb388ff, 0x3fe0ff, 0x8cff5a];
    for (let k = 0; k < 3; k++) {
      const gr = d.createLinearGradient(0, 0, 0, L);
      for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, css(cols[(i + k) % 3], 0.85));
      d.fillStyle = gr;
      d.beginPath();
      const x0 = -0.035 + k * 0.035;
      for (let y = 0.05; y <= L - 0.05; y += 0.02) d.lineTo(x0 + Math.sin(y * 7 + k * 2) * 0.022, y);
      for (let y = L - 0.05; y >= 0.05; y -= 0.02) d.lineTo(x0 + 0.012 + Math.sin(y * 7 + k * 2 + 0.5) * 0.026, y);
      d.closePath();
      d.fill();
    }
    const r = rng(11);
    for (let i = 0; i < 26; i++) star(d, (r() - 0.5) * W * 0.9, 0.08 + r() * (L - 0.16), 0.006 + r() * 0.008, WHITE, { n: 4, inner: 0.3 });
  }, { ...SKI_TEX, glow: true });
  // 板头的冰晶：中间一根长的，两边各一根斜出去的短的
  const crystal = c.m(c.trimColor, { emissive: c.trimColor, emissiveIntensity: 0.55, transparent: true, opacity: 0.85 });
  for (const [x, len, tilt, side] of [[0, 0.16, 0.5, 0], [-0.024, 0.1, 0.65, 0.45], [0.024, 0.1, 0.65, -0.45]]) {
    const m = put(g, PRIM.ico, crystal, x, 0.14, -0.99, 0.022, len / 2, 0.022);
    m.rotation.set(-tilt - 0.6, 0, side);
  }
  soft(put(g, PRIM.sphere, glowMat(c.trimColor, 0.35), 0, 0.15, -1.0, 0.07));
  alpineBinding(g, c, c.lit);
  put(g, PRIM.ico, crystal, 0, 0.13, 0.33, 0.026, 0.04, 0.026);
}

// 雪刃短板：一米出头的双翘短板，不用雪杖。加宽的镀铬刃边，板面一道锯齿色带和刀痕
const BLADE = { tail: 0.5, nose: -0.62, w: 0.14, waist: 0.112, tailKick: 0.07, noseKick: 0.12, tailLen: 0.24, noseLen: 0.28, n: 22 };
function blades(g, c) {
  const st = skiStations(BLADE);
  const T = c.trimColor;
  put(g, geo('blade', () => loftGeo(st)), c.main);
  put(g, geo('blade.edge', () => loftGeo(under(st, 0.018, 0.012))), c.chrome);
  for (const [t0, t1] of [[0, 0.07], [0.93, 1]]) put(g, geo('blade.cap' + t0, () => loftGeo(inlay(st, 0.96, t0, t1, 0.001))), c.chrome);
  skin(g, 'blades', st, 0.15, (d, W, L) => {
    const pts = [];
    for (let y = 0.16, i = 0; y <= L - 0.16; y += 0.03, i++) pts.push([(i % 2 ? 0.034 : 0.022), y]);
    for (let y = L - 0.16, i = 0; y >= 0.16; y -= 0.03, i++) pts.push([-(i % 2 ? 0.034 : 0.022), y]);
    poly(d, pts, T);
    line(d, [[0, 0.2], [0, L - 0.2]], INK, 0.006, 0.8);
    for (const y of [0.12, L - 0.14]) for (let i = 0; i < 3; i++) poly(d, [[-W / 2, y + i * 0.022], [W / 2, y - 0.03 + i * 0.022], [W / 2, y - 0.022 + i * 0.022], [-W / 2, y + 0.008 + i * 0.022]], INK, 0.7);
    text(d, 'BLADE', 0, 0.3, 0.036, WHITE, { rot: HALF_PI, stroke: INK, strokeW: 0.3 });
  }, { px: 64, py: 512 });
  alpineBinding(g, c, c.trim, { brakes: false });
}

// 自由式双翘板：头尾都翘得高；板面是喷漆涂鸦（泡泡字、喷圈、星星、滴落的漆）
const TWIN = { tail: 0.84, nose: -0.98, w: 0.136, waist: 0.104, tailKick: 0.11, noseKick: 0.15, tailLen: 0.15, noseLen: 0.19, n: 30 };
function twin(g, c) {
  const st = skiStations(TWIN);
  const T = c.trimColor;
  put(g, geo('twin', () => loftGeo(st)), c.main);
  put(g, geo('twin.edge', () => loftGeo(under(st, 0.012, 0.01))), c.steel);
  skin(g, 'twin', st, 0.14, (d, W, L) => {
    for (const y of [0.18, L - 0.2]) {
      ring(d, 0, y, 0.045, 0.014, T, 0.9);
      ring(d, 0, y, 0.022, 0.008, INK, 0.8);
    }
    rect(d, -0.03, 0.32, 0.06, L - 0.64, T);
    for (let y = 0.4; y < L - 0.4; y += 0.11) rect(d, -0.03 + ((y * 37) % 0.05), y, 0.008, 0.03 + ((y * 53) % 0.04), T);
    text(d, 'TWIN', 0, 0.55, 0.07, WHITE, { rot: HALF_PI, stroke: INK, strokeW: 0.28 });
    text(d, 'TIP', 0, L - 0.55, 0.07, WHITE, { rot: HALF_PI, stroke: INK, strokeW: 0.28 });
    const r = rng(5);
    for (let i = 0; i < 9; i++) star(d, (r() - 0.5) * W * 0.7, 0.3 + r() * (L - 0.6), 0.012 + r() * 0.01, i % 2 ? WHITE : 0xffd23c, { rot: r() });
  }, SKI_TEX);
  alpineBinding(g, c, c.trim);
}

// 机甲双板：宽板身 + 前后装甲（分件缝、警示牌、编号、条形码）+ 发光能量槽，板尾各背一台推进器
const MECH = { tail: 0.78, nose: -1.06, w: 0.2, waist: 0.17, tailKick: 0.04, noseKick: 0.2, tailLen: 0.1, noseLen: 0.22, th: 0.035, n: 28 };
const MECH_FRONT = [
  { z: -0.22, y: 0.03, w: 0.15, th: 0.045 },
  { z: -0.4, y: 0.045, w: 0.18, th: 0.07 },
  { z: -0.62, y: 0.045, w: 0.17, th: 0.07 },
  { z: -0.84, y: 0.07, w: 0.1, th: 0.035 },
];
const MECH_REAR = [
  { z: 0.74, y: 0.035, w: 0.12, th: 0.04 },
  { z: 0.6, y: 0.045, w: 0.17, th: 0.07 },
  { z: 0.36, y: 0.045, w: 0.17, th: 0.07 },
  { z: 0.26, y: 0.035, w: 0.15, th: 0.045 },
];
function mech(g, c) {
  put(g, geo('mech', () => loftGeo(skiStations(MECH))), c.dark);
  put(g, geo('mech.edge', () => loftGeo(under(skiStations(MECH), 0.018, 0.012))), c.lit);
  put(g, geo('mech.front', () => loftGeo(MECH_FRONT)), c.main);
  put(g, geo('mech.rear', () => loftGeo(MECH_REAR)), c.main);
  skin(g, 'mech.front', MECH_FRONT, 0.19, (d, W, L) => {
    hazard(d, -W / 2, 0, W, 0.07, 0.018);
    line(d, [[-0.06, 0.1], [0.06, 0.1], [0.075, 0.2], [0.075, 0.5], [-0.075, 0.5], [-0.075, 0.2]], INK, 0.004, 0.55, true);
    line(d, [[-0.075, 0.33], [0.075, 0.33]], INK, 0.004, 0.55);
    warn(d, -0.035, 0.25, 0.05, HALF_PI);
    text(d, 'MK-7', 0.03, 0.26, 0.032, INK, { rot: HALF_PI });
    barcode(d, -0.055, 0.38, 0.07, 0.04, 3);
    dotRow(d, [[-0.065, 0.12], [0.065, 0.12], [-0.068, 0.48], [0.068, 0.48]], 0.006, INK, 0.7);
  }, { px: 128, py: 512 });
  skin(g, 'mech.rear', MECH_REAR, 0.19, (d, W, L) => {
    line(d, [[-0.075, 0.04], [0.075, 0.04], [0.075, 0.42], [-0.075, 0.42]], INK, 0.004, 0.55, true);
    text(d, '07', 0, 0.2, 0.08, WHITE, { stroke: INK, strokeW: 0.25, rot: HALF_PI });
    for (let i = 0; i < 4; i++) rect(d, -0.05, 0.31 + i * 0.022, 0.1, 0.01, INK, 0.75);
    hazard(d, -W / 2, L - 0.06, W, 0.06, 0.018);
  }, { px: 128, py: 512 });
  box(g, c.lit, 0.035, 0.012, 0.2, 0, 0.083, -0.51);
  box(g, c.lit, 0.035, 0.012, 0.2, 0, 0.083, 0.48);
  // 装甲两侧的进气口、一排螺丝
  for (const s of [-1, 1]) {
    box(g, c.black, 0.012, 0.035, 0.12, s * 0.092, 0.05, -0.5);
    for (let i = 0; i < 3; i++) box(g, c.lit, 0.004, 0.006, 0.09, s * 0.0985, 0.04 + i * 0.012, -0.5);
  }
  const bolts = [];
  for (const z of [-0.3, -0.7]) for (const x of [-0.06, 0.06]) bolts.push([x, 0.084, z]);
  for (const z of [0.3, 0.66]) for (const x of [-0.06, 0.06]) bolts.push([x, 0.084, z]);
  put(g, geo('mech.bolts', () => studsGeo(bolts, 0.008)), c.chrome);
  // 板头的撞角
  put(g, PRIM.cone, c.lit, 0, 0.21, -1.0, 0.035, 0.2, 0.035).rotation.x = -1.1;
  // 推进器：筒身、两道散热环、喷口、发光的芯、背鳍
  rod(g, c.steel, 0.05, 0.26, 0, 0.13, 0.64);
  for (const z of [0.58, 0.68]) rod(g, c.dark, 0.054, 0.018, 0, 0.13, z);
  rod(g, c.dark, 0.058, 0.05, 0, 0.13, 0.78);
  ball(g, c.lit, 0.04, 0.04, 0.02, 0, 0.13, 0.805);
  put(g, geo('mech.fin', () => plateGeo([[0, 0], [-0.2, 0], [-0.26, 0.12]], 0.012, true)), c.trim, 0, 0.18, 0.56);
  flame(g, c.fx, 0, 0.13, 0.81, 0.045, 0.4);
  // 夹住靴子的装甲固定器
  box(g, c.dark, 0.14, 0.016, 0.42, 0, 0.022, 0.03);
  for (const s of [-1, 1]) {
    box(g, c.main, 0.02, 0.09, 0.3, s * 0.1, 0.06, 0.02);
    box(g, c.lit, 0.004, 0.012, 0.22, s * 0.111, 0.08, 0.02);
  }
  box(g, c.steel, 0.13, 0.05, 0.06, 0, 0.05, -0.19);
  box(g, c.lit, 0.1, 0.07, 0.07, 0, 0.06, 0.235);
}

// ---------- 单板 ----------

// 单板固定器：底盘（中间圆盘四颗螺丝）、跟杯、弯成弧的高背，脚背宽绑带、脚尖细绑带，外侧两个棘轮扣
function boardBinding(v, c, x, z, accent) {
  const shell = c.m(accent, { side: THREE.DoubleSide });
  const acc = c.m(accent);
  put(v, geo('bb.base', () => plateGeo([[-0.085, -0.16], [0.085, -0.16], [0.092, 0.08], [0.065, 0.165], [-0.065, 0.165], [-0.092, 0.08]], 0.02, false)), c.dark, x, 0.05, z);
  put(v, PRIM.cyl, c.black, x, 0.062, z - 0.01, 0.062, 0.006, 0.062);
  put(v, geo('bb.screws', () => studsGeo([[-0.034, 0, -0.034], [0.034, 0, -0.034], [-0.034, 0, 0.034], [0.034, 0, 0.034]], 0.008)), c.chrome, x, 0.068, z - 0.01);
  put(v, geo('bb.cup', () => new THREE.TorusGeometry(0.085, 0.013, 6, 14, Math.PI).rotateX(HALF_PI)), c.dark, x, 0.075, z + 0.06);
  const hb = put(v, geo('bb.hb', () => new THREE.CylinderGeometry(0.09, 0.084, 0.25, 14, 1, true, -HALF_PI, Math.PI)), shell, x, 0.2, z + 0.07);
  hb.rotation.x = 0.14;
  const spine = box(v, c.black, 0.03, 0.2, 0.012, x, 0.205, z + 0.165);
  spine.rotation.x = 0.14;
  const strap = geo('strap', () => new THREE.TorusGeometry(0.135, 0.015, 6, 12, Math.PI));
  put(v, strap, c.black, x, 0.06, z + 0.04, 0.76, 1.55, 3.2);
  put(v, strap, acc, x, 0.06, z - 0.1, 0.74, 1.35, 2.2);
  const out = Math.sign(x) || 1;
  box(v, c.chrome, 0.02, 0.05, 0.036, x + out * 0.1, 0.11, z + 0.04);
  box(v, c.chrome, 0.018, 0.04, 0.03, x + out * 0.098, 0.09, z - 0.1);
}

// 入门单板：圆头圆尾的软板，一圈加厚的软包边、头尾护角；板面画一朵大雪花和波点
const learnDeck = () =>
  sampleEnds(28, (t) => {
    const a = Math.max(0, 1 - t / 0.15);
    const b = Math.max(0, (t - 0.85) / 0.15);
    return { t, z: 0.68 - 1.38 * t, y: 0.02 + 0.085 * (a * a + b * b), w: 0.5 * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 3)), th: 0.04 };
  });
function learner(v, c) {
  const st = learnDeck();
  const T = c.trimColor;
  put(v, geo('learn', () => loftGeo(st)), c.main);
  put(v, geo('learn.edge', () => loftGeo(under(st, 0.026, 0.024))), c.trim);
  for (const [t0, t1] of [[0, 0.06], [0.94, 1]]) put(v, geo('learn.tip' + t0, () => loftGeo(inlay(st, 1.02, t0, t1, 0.001))), c.trim);
  skin(v, 'learner', st, 0.52, (d, W, L) => {
    const mid = 0.7;
    circle(d, 0, mid, 0.17, T, 0.55);
    snowflake(d, 0, mid, 0.13, WHITE, 0.02);
    ring(d, 0, mid, 0.2, 0.008, INK, 0.35);
    const r = rng(9);
    for (const [y0, y1] of [[0.12, 0.42], [L - 0.42, L - 0.12]]) {
      for (let y = y0; y < y1; y += 0.06) for (let x = -0.2; x <= 0.2; x += 0.06) circle(d, x + (((y * 100) | 0) % 2) * 0.03, y, 0.012 + r() * 0.008, T, 0.85);
    }
    text(d, 'LEARN', 0, 0.36, 0.07, INK, { a: 0.85, rot: Math.PI });
    text(d, 'FIRST RIDE', 0, L - 0.4, 0.04, INK, { a: 0.7, weight: 700, rot: Math.PI });
    poly(d, [[0, 0.04], [0.035, 0.09], [-0.035, 0.09]], INK, 0.6);
  }, BOARD_TEX);
  box(v, c.rubber, 0.12, 0.008, 0.16, 0, 0.044, -0.3);
  for (let i = 0; i < 4; i++) box(v, c.m(0x2b2f3a), 0.1, 0.006, 0.012, 0, 0.05, -0.36 + i * 0.04);
  for (const s of [-1, 1]) boardBinding(v, c, s * 0.17, 0.02, T);
}

// 单板：全能的方向板，板头长、板尾短；板面是一排雪山和太阳，板头一行大字标，两道沿边的细线
const mtnDeck = () =>
  sampleEnds(30, (t) => {
    const a = Math.max(0, 1 - t / 0.1);
    const b = Math.max(0, (t - 0.82) / 0.18);
    const w = 0.5 + 0.06 * (2 * t - 1) ** 2;
    return { t, z: 0.7 - 1.52 * t, y: 0.02 + 0.06 * a * a + 0.14 * b * b, w: w * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 3.4)), th: 0.04 };
  });
function allMountain(v, c) {
  const st = mtnDeck();
  const T = c.trimColor;
  put(v, geo('mtn', () => loftGeo(st)), c.main);
  put(v, geo('mtn.side', () => loftGeo(under(st, 0.008, 0.014))), c.black);
  put(v, geo('mtn.edge', () => loftGeo(under(st, 0.014, 0.006).map((s) => ({ ...s, off: s.off - 0.01 })))), c.steel);
  skin(v, 'board', st, 0.58, (d, W, L) => {
    for (const x of [-0.22, 0.22]) line(d, [[x, 0.1], [x, L - 0.06]], T, 0.01);
    text(d, 'SUMMIT', 0, 0.4, 0.11, T, { squash: 0.9, rot: Math.PI });
    text(d, 'ALL MOUNTAIN', 0, 0.3, 0.032, INK, { a: 0.7, weight: 700, rot: Math.PI });
    // 板尾一排雪山（从板头这边看是立着的：山脚朝板头、山尖朝板尾），后面一轮太阳
    const b = L - 0.5;
    circle(d, -0.06, b + 0.3, 0.1, T, 0.9);
    ring(d, -0.06, b + 0.3, 0.13, 0.008, T, 0.6);
    const far = [[-0.3, b + 0.1], [-0.22, b + 0.2], [-0.15, b + 0.14], [0.02, b + 0.3], [0.12, b + 0.18], [0.2, b + 0.24], [0.3, b + 0.12], [0.3, b - 0.02], [-0.3, b - 0.02]];
    poly(d, far, shade(T, 0.55), 0.85);
    const near = [[-0.3, b + 0.02], [-0.14, b + 0.09], [-0.05, b + 0.05], [0.1, b + 0.14], [0.22, b + 0.06], [0.3, b + 0.08], [0.3, b - 0.04], [-0.3, b - 0.04]];
    poly(d, near, INK, 0.75);
    poly(d, [[-0.04, b + 0.24], [0.02, b + 0.3], [0.07, b + 0.25], [0.04, b + 0.26], [0.0, b + 0.23]], WHITE);
    poly(d, [[-0.25, b + 0.17], [-0.22, b + 0.2], [-0.19, b + 0.18]], WHITE);
    poly(d, [[0.17, b + 0.22], [0.2, b + 0.24], [0.23, b + 0.21]], WHITE);
    for (let i = 0; i < 3; i++) line(d, [[-0.3, b - 0.07 - i * 0.03], [0.3, b - 0.07 - i * 0.03]], T, 0.008, 0.7 - i * 0.2);
  }, BOARD_TEX);
  for (const s of [-1, 1]) boardBinding(v, c, s * 0.17, 0.02, T);
}

// 公园单板：短而宽的双翘板，板面贴满贴纸（星星、爱心、闪电、圆标、条形码、字块），前面一块星形止滑垫
const parkDeck = () =>
  sampleEnds(30, (t) => {
    const a = Math.max(0, 1 - t / 0.13);
    const b = Math.max(0, (t - 0.87) / 0.13);
    return { t, z: 0.7 - 1.42 * t, y: 0.02 + 0.1 * (a * a + b * b), w: (0.52 + 0.04 * (2 * t - 1) ** 2) * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 3.6)), th: 0.038 };
  });
function stickerBomb(d, W, L, T) {
  const r = rng(21);
  const pal = [T, 0xffd23c, 0x3fe0ff, 0x8cff5a, WHITE, 0xff6a1f];
  const words = ['PARK', 'JIB', 'SHRED', 'NO.1', 'GO!'];
  let n = 0;
  for (let y = 0.1; y < L - 0.05; y += 0.13) {
    for (let x = -0.2; x <= 0.21; x += 0.135) {
      const cx = x + (r() - 0.5) * 0.04;
      const cy = y + (r() - 0.5) * 0.04;
      const col = pal[(r() * pal.length) | 0];
      const kind = n++ % 7;
      d.save();
      d.translate(cx, cy);
      d.rotate(Math.PI + (r() - 0.5) * 1.2);
      if (kind === 0) {
        star(d, 0, 0, 0.06, WHITE);
        star(d, 0, 0, 0.046, col);
      } else if (kind === 1) {
        heart(d, 0, 0, 0.05, WHITE);
        heart(d, 0, 0, 0.038, col === WHITE ? T : col);
      } else if (kind === 2) {
        round(d, -0.06, -0.028, 0.12, 0.056, 0.012);
        d.fillStyle = css(col === WHITE ? INK : col);
        d.fill();
        text(d, words[(r() * words.length) | 0], 0, 0.002, 0.034, WHITE, { squash: 0.85 });
      } else if (kind === 3) {
        circle(d, 0, 0, 0.05, INK);
        ring(d, 0, 0, 0.038, 0.008, col === INK ? WHITE : col);
        text(d, 'P', 0, 0.003, 0.042, WHITE);
      } else if (kind === 4) {
        poly(d, [[-0.01, -0.06], [0.03, -0.06], [0.008, -0.01], [0.034, -0.01], [-0.02, 0.06], [-0.004, 0.006], [-0.03, 0.006]], col === WHITE ? HAZARD : col);
      } else if (kind === 5) {
        barcode(d, -0.05, -0.025, 0.1, 0.05, n);
      } else {
        circle(d, 0, 0, 0.048, HAZARD);
        circle(d, -0.016, -0.01, 0.006, INK);
        circle(d, 0.016, -0.01, 0.006, INK);
        ring(d, 0, 0.004, 0.026, 0.006, INK, 1, 0.3, Math.PI - 0.3);
      }
      d.restore();
    }
  }
}
function park(v, c) {
  const st = parkDeck();
  const T = c.trimColor;
  put(v, geo('park', () => loftGeo(st)), c.main);
  put(v, geo('park.side', () => loftGeo(under(st, 0.01, 0.014))), c.trim);
  put(v, geo('park.edge', () => loftGeo(under(st, 0.016, 0.006).map((s) => ({ ...s, off: s.off - 0.01 })))), c.steel);
  skin(v, 'park', st, 0.6, (d, W, L) => stickerBomb(d, W, L, T), BOARD_TEX);
  put(v, geo('park.pad', () => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const k = i % 2 ? 0.035 : 0.08;
      const a = -HALF_PI + (i * Math.PI) / 5;
      pts.push([Math.cos(a) * k, -Math.sin(a) * k]);
    }
    return plateGeo(pts, 0.008, false);
  }), c.rubber, 0, 0.044, -0.32);
  for (const s of [-1, 1]) boardBinding(v, c, s * 0.17, 0.02, T);
}

// 风暴单板：箭头一样的尖板头、切角板尾；两侧发光包边，板面是乌云卷涡加几道发亮的闪电，
// 板头两侧张开一对刃翼，板尾两台推进器套着发光的线圈
const stormDeck = () =>
  sample(34, (t) => {
    const a = Math.max(0, 1 - t / 0.1);
    const b = Math.max(0, (t - 0.74) / 0.26);
    let w;
    if (t < 0.06) w = 0.42 + 0.14 * (t / 0.06);
    else if (t < 0.7) w = 0.56 - 0.05 * Math.sin((Math.PI * (t - 0.06)) / 0.64);
    else w = 0.56 * (1 - ((t - 0.7) / 0.3) ** 1.3);
    return { t, z: 0.72 - 1.64 * t, y: 0.02 + 0.06 * a * a + 0.16 * b * b, w: Math.max(0.012, w), th: 0.042 };
  });
function storm(v, c) {
  const st = stormDeck();
  const T = c.trimColor;
  put(v, geo('storm', () => loftGeo(st)), c.main);
  put(v, geo('storm.base', () => loftGeo(under(st, 0.014, 0.014))), c.black);
  const rail = geo('storm.rail', () => loftGeo(railOf(st, 0.014, 0.02, 0.02, 0.985)));
  for (const s of [-1, 1]) put(v, rail, c.lit).scale.x = s;
  skin(v, 'storm', st, 0.58, (d, W, L) => {
    d.save();
    d.globalAlpha = 0.5;
    for (const [x, y, s, f] of [[-0.12, 0.62, 0.12, 1], [0.13, 0.78, 0.1, -1], [-0.05, 1.12, 0.14, 1], [0.1, 1.38, 0.09, -1]]) {
      d.lineWidth = 0.03;
      d.strokeStyle = css(INK);
      d.beginPath();
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * Math.PI * 3;
        const k = s * (1 - i / 44);
        i ? d.lineTo(x + f * Math.cos(a) * k, y + Math.sin(a) * k * 0.7) : d.moveTo(x + f * Math.cos(a) * k, y + Math.sin(a) * k * 0.7);
      }
      d.stroke();
    }
    d.restore();
    poly(d, [[-0.26, L - 0.1], [0.26, L - 0.1], [0.2, L - 0.26], [-0.2, L - 0.26]], INK, 0.6);
    text(d, 'STORM', 0, L - 0.18, 0.08, T, { rot: Math.PI });
    chevrons(d, 0, 0.18, 0.16, 0.04, 3, 0.055, INK, 0.65);
  }, BOARD_TEX);
  skin(v, 'storm.bolt', st, 0.58, (d, W, L) => {
    bolt(d, -0.2, 0.42, 0.05, 0.98, 0.028, 0xffe27a, { seed: 4, kinks: 5 });
    bolt(d, -0.2, 0.42, 0.05, 0.98, 0.012, WHITE, { seed: 4, kinks: 5 });
    bolt(d, 0.22, 0.7, -0.02, 1.32, 0.024, T, { seed: 9, kinks: 4 });
    bolt(d, 0.22, 0.7, -0.02, 1.32, 0.01, 0xffe27a, { seed: 9, kinks: 4 });
    bolt(d, 0.04, 1.0, 0.16, 1.2, 0.014, T, { seed: 2, kinks: 3 });
  }, { ...BOARD_TEX, glow: true, lift: 0.0025 });
  // 板头两侧的刃翼：深色刃身加一道发光刃口，往外张开
  const blade = geo('storm.wing', () => plateGeo([[0, 0], [-0.34, 0.02], [-0.42, 0.1], [-0.18, 0.06]], 0.014, true));
  const edge = geo('storm.wing.edge', () => plateGeo([[-0.1, 0.055], [-0.42, 0.1], [-0.34, 0.075]], 0.016, true));
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.2, 0.06, -0.26);
    w.rotation.z = -s * 0.75;
    put(w, blade, c.dark);
    put(w, edge, c.lit);
    v.add(w);
    // 板尾推进器和线圈
    rod(v, c.steel, 0.038, 0.16, s * 0.13, 0.075, 0.66);
    rod(v, c.dark, 0.044, 0.03, s * 0.13, 0.075, 0.74);
    const coil = geo('storm.coil', () => new THREE.TorusGeometry(0.055, 0.008, 6, 20));
    for (const z of [0.61, 0.67]) put(v, coil, c.lit, s * 0.13, 0.075, z);
    flame(v, c.fx, s * 0.13, 0.075, 0.755, 0.034, 0.34);
    boardBinding(v, c, s * 0.17, 0.02, T);
  }
  put(v, PRIM.ico, c.lit, 0, 0.11, -0.66, 0.04, 0.03, 0.06);
  soft(put(v, PRIM.sphere, glowMat(T, 0.3), 0, 0.11, -0.66, 0.09));
}

// 鱼尾粉雪板：宽而翘的圆板头，板尾分成燕尾；板头画成鱼脸（眼睛、腮线），板身一片片鳞，燕尾是鳍条
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
  const st = fishBody();
  const T = c.trimColor;
  put(v, geo('fish', () => loftGeo(st)), c.main);
  put(v, geo('fish.edge', () => loftGeo(under(st, 0.014, 0.012))), c.steel);
  skin(v, 'fish', st, 0.64, (d, W, L) => {
    scales(d, -0.3, 0.55, 0.3, L, 0.05, T, 0.012, 0.85);
    rect(d, -0.3, 0.46, 0.6, 0.06, T, 0.9);
    for (const s of [-1, 1]) {
      d.beginPath();
      d.moveTo(s * 0.05, 0.5);
      d.quadraticCurveTo(s * 0.15, 0.36, s * 0.27, 0.47);
      d.strokeStyle = css(T);
      d.lineWidth = 0.018;
      d.stroke();
      circle(d, s * 0.15, 0.25, 0.075, INK, 0.9);
      circle(d, s * 0.15, 0.25, 0.062, WHITE);
      circle(d, s * 0.158, 0.258, 0.036, INK);
      circle(d, s * 0.145, 0.24, 0.012, WHITE);
    }
    line(d, [[-0.1, 0.06], [0, 0.09], [0.1, 0.06]], INK, 0.012, 0.6);
  }, BOARD_TEX);
  const tailSt = fishTail();
  const tail = geo('fish.tail', () => loftGeo(tailSt));
  for (const s of [-1, 1]) {
    put(v, tail, c.main).scale.x = s;
    skin(v, 'fish.tail', tailSt, 0.6, (d, W, L) => {
      rect(d, -W / 2, 0, W, L, T, 0.85);
      for (let i = 0; i < 5; i++) line(d, [[0.08 + i * 0.03, 0], [0.12 + i * 0.045, L]], INK, 0.008, 0.4);
    }, { px: 128, py: 128 }).scale.x = s;
    boardBinding(v, c, s * 0.17, 0.02, T);
  }
}

// 悬浮滑板：圆头厚板，板底两台发光的悬浮器，板尾一对小推进器。
// 板面是机甲风的涂装：防滑区的六角格、分件缝、警示斜纹、编号和条形码；板头叠两层装甲片
const hoverDeck = () =>
  sampleEnds(30, (t) => {
    const a = Math.max(0, 1 - t / 0.12);
    const b = Math.max(0, (t - 0.88) / 0.12);
    return { t, z: 0.74 - 1.52 * t, y: 0.01 + 0.035 * (a * a + b * b), w: 0.56 * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 4)), th: 0.06 };
  });
const HOVER_NOSE = [
  { z: -0.38, y: 0.048, w: 0.26, th: 0.022 },
  { z: -0.5, y: 0.05, w: 0.34, th: 0.026 },
  { z: -0.66, y: 0.058, w: 0.28, th: 0.022 },
  { z: -0.73, y: 0.064, w: 0.12, th: 0.016 },
];
function hover(v, c) {
  const st = hoverDeck();
  const T = c.trimColor;
  put(v, geo('hover', () => loftGeo(st)), c.main);
  put(v, geo('hover.belly', () => loftGeo(under(st, -0.14, 0.04))), c.dark);
  skin(v, 'hover', st, 0.58, (d, W, L) => {
    hexes(d, -0.19, 0.42, 0.19, L - 0.3, 0.03, INK, 0.006, 0.4);
    line(d, [[-0.2, 0.4], [0.2, 0.4], [0.2, L - 0.3], [-0.2, L - 0.3]], INK, 0.006, 0.55, true);
    hazard(d, -0.2, L - 0.26, 0.4, 0.05, 0.025);
    text(d, 'HV-01', 0.08, L - 0.15, 0.05, INK, { a: 0.85, rot: Math.PI });
    barcode(d, -0.17, L - 0.19, 0.12, 0.07, 12);
    warn(d, 0.13, 0.34, 0.06, Math.PI);
    text(d, 'ANTI-GRAV', -0.04, 0.34, 0.03, INK, { a: 0.75, weight: 700, rot: Math.PI });
    for (const s of [-1, 1]) chevrons(d, s * 0.235, 0.62, 0.03, 0.02, 4, 0.04, T, 0.9);
  }, BOARD_TEX);
  // 板头的装甲片：深色一层，上面再压一道发光的折线
  put(v, geo('hover.nose', () => loftGeo(HOVER_NOSE)), c.deep);
  skin(v, 'hover.nose', HOVER_NOSE, 0.36, (d, W, L) => {
    chevrons(d, 0, 0.08, 0.2, 0.05, 2, 0.08, T, 1);
    line(d, [[-0.15, L - 0.02], [-0.1, 0.1], [0.1, 0.1], [0.15, L - 0.02]], INK, 0.006, 0.5);
  }, { px: 128, py: 128, glow: true });
  // 板面两侧的灯条
  const rail = geo('hover.rail', () => loftGeo(railOf(st, 0.035, 0.024, 0.14, 0.86)));
  const ringG = geo('hover.ring', () => new THREE.TorusGeometry(0.16, 0.022, 8, 28).rotateX(HALF_PI));
  const disc = geo('disc', () => new THREE.CircleGeometry(1, 28).rotateX(-HALF_PI));
  const fin = geo('hover.fin', () => plateGeo([[0, 0], [-0.2, 0], [-0.26, 0.16], [-0.15, 0.16]], 0.014, true));
  for (const z of [-0.44, 0.42]) {
    put(v, PRIM.cyl, c.dark, 0, -0.08, z, 0.2, 0.05, 0.2);
    put(v, ringG, c.lit, 0, -0.105, z);
    put(v, geo('hover.vanes', () => studsGeo([[0.1, 0, 0], [-0.1, 0, 0], [0, 0, 0.1], [0, 0, -0.1]], 0.02, 'y', 0.012)), c.steel, 0, -0.108, z);
    soft(put(v, disc, glowMat(c.trimColor, 0.6), 0, -0.106, z, 0.15));
    // 雪面上被照亮的一圈
    soft(put(v, disc, glowMat(c.trimColor, 0.28), 0, c.ground + 0.012, z, 0.32));
  }
  for (const s of [-1, 1]) {
    put(v, rail, c.lit).scale.x = s;
    rod(v, c.steel, 0.04, 0.18, s * 0.15, -0.035, 0.66);
    rod(v, c.dark, 0.044, 0.025, s * 0.15, -0.035, 0.6);
    flame(v, c.fx, s * 0.15, -0.035, 0.75, 0.035, 0.32);
    put(v, fin, c.trim, s * 0.21, 0.04, 0.46);
    // 侧面的进气口
    box(v, c.black, 0.012, 0.032, 0.18, s * 0.275, 0.012, -0.05);
    for (let i = 0; i < 3; i++) box(v, c.lit, 0.004, 0.005, 0.15, s * 0.2815, 0.002 + i * 0.01, -0.05);
    boardBinding(v, c, s * 0.17, 0.02, T);
  }
  box(v, c.white, 0.26, 0.014, 0.03, 0, 0.047, -0.585);
}

// 凤凰翼板：尖喙板头，两侧三层羽翼，板尾一把尾羽；板面是一片片往后掠的火羽和金线
const phoenixDeck = () =>
  sample(30, (u) => {
    const t = 1 - (1 - u) ** 1.5;
    const a = Math.max(0, 1 - t / 0.12);
    const b = Math.max(0, (t - 0.6) / 0.4);
    const w = t < 0.45 ? 0.3 + 0.26 * Math.sin((Math.PI / 2) * (t / 0.45)) : 0.56 * (1 - ((t - 0.45) / 0.55) ** 1.7);
    return { t, z: 0.7 - 1.7 * t, y: 0.02 + 0.16 * b * b + 0.04 * a * a, w, th: 0.04 };
  });
function phoenix(v, c) {
  const st = phoenixDeck();
  const T = c.trimColor;
  put(v, geo('phx', () => loftGeo(st)), c.main);
  put(v, geo('phx.edge', () => loftGeo(under(st, 0.024, 0.014))), c.trim);
  skin(v, 'phoenix', st, 0.6, (d, W, L) => {
    const plume = (x, y, len, ang, col, a) => {
      d.save();
      d.translate(x, y);
      d.rotate(ang);
      d.beginPath();
      d.moveTo(0, 0);
      d.bezierCurveTo(len * 0.25, len * 0.15, len * 0.2, len * 0.7, 0, len);
      d.bezierCurveTo(-len * 0.2, len * 0.7, -len * 0.25, len * 0.15, 0, 0);
      d.fillStyle = css(col, a);
      d.fill();
      d.restore();
    };
    for (let i = 0; i < 7; i++) {
      const y = 0.35 + i * 0.16;
      for (const s of [-1, 1]) {
        plume(s * 0.05, y, 0.24, s * -0.75, T, 0.85);
        plume(s * 0.07, y + 0.04, 0.16, s * -0.9, 0xff5a1f, 0.8);
      }
    }
    for (const s of [-1, 1]) line(d, [[s * 0.03, 0.25], [s * 0.2, 0.7], [s * 0.25, 1.2], [s * 0.18, L - 0.1]], 0xfff0a0, 0.008, 0.9);
    poly(d, [[0, 0.1], [0.05, 0.22], [0, 0.3], [-0.05, 0.22]], 0xff3a1f, 0.9);
  }, BOARD_TEX);
  put(v, geo('phx.spine', () => loftGeo(inlay(st, 0.16, 0.04, 0.9))), c.lit);
  // 喙和眼睛
  put(v, PRIM.cone, c.trim, 0, 0.19, -1.04, 0.035, 0.16, 0.03).rotation.x = -1.37;
  for (const s of [-1, 1]) ball(v, c.white, 0.022, 0.022, 0.022, s * 0.05, 0.145, -0.84);
  // 头顶的冠羽
  for (const [x, h, r] of [[0, 0.12, -0.5], [-0.035, 0.09, -0.7], [0.035, 0.09, -0.7]]) {
    const m = put(v, PRIM.cone4, c.lit, x, 0.17, -0.74, 0.016, h, 0.006);
    m.rotation.x = r;
  }
  // 一片羽毛：根在原点，往右伸、往后掠
  const feather = geo('phx.feather', () => plateGeo([[0, 0.09], [0.26, 0.1], [0.62, -0.1], [0.72, -0.3], [0.42, -0.2], [0, -0.1]], 0.018, false));
  const vein = geo('phx.vein', () => plateGeo([[0, 0.02], [0.4, 0.0], [0.66, -0.22], [0.4, -0.04], [0, -0.02]], 0.02, false));
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.27, 0.06, 0.12);
    w.scale.x = s;
    w.rotation.z = s * 0.3;
    put(w, feather, c.trim);
    put(w, vein, c.lit, 0, 0.002);
    put(w, feather, c.main, 0, -0.014, 0.15, 0.8);
    put(w, feather, c.trim, 0, -0.028, 0.28, 0.62);
    v.add(w);
    c.fx.wings.push({ o: w, s });
    // 尾羽：外侧一对短的，中间一对长的，左右对称地往外掠
    const side = put(v, feather, c.trim, 0, 0.07, 0.6, 0.85, 0.85, -s * 0.85);
    side.rotation.set(-0.3, -HALF_PI + s * 0.45, 0);
    const mid = put(v, feather, c.main, 0, 0.078, 0.6, 1.05, 1.05, -s * 1.05);
    mid.rotation.set(-0.36, -HALF_PI + s * 0.13, 0);
    flame(v, c.fx, s * 0.08, 0.03, 0.7, 0.04, 0.38);
    boardBinding(v, c, s * 0.17, 0.02, T);
  }
}

// 每种模型的造型函数和站姿参数（gear.js 里用 model 字段指过来）。
// ski：造一只脚上的板；build：造整台载具。poles：是否拿雪杖；armSpread：手臂张开多少。
// sitDrop：坐下后整个人下沉多少（= 0.62 - 坐面离地高度）；legBase：腿往前抬的角度。
// grip：握车把时手臂抬起的角度；lift：悬浮离地多高；bob：悬浮时上下起伏的幅度。
export const GEAR_MODELS = {
  ski: { ski: classic },
  race: { ski: race },
  carbon: { ski: carbon },
  aurora: { ski: aurora },
  blades: { ski: blades, poles: false, armSpread: 0.35 },
  twin: { ski: twin },
  mech: { ski: mech },
  learner: { build: learner },
  board: { build: allMountain },
  park: { build: park },
  storm: { build: storm },
  fish: { build: fish },
  hover: { build: hover, lift: 0.13, bob: 0.022 },
  phoenix: { build: phoenix },
  ...RIDES,
};
