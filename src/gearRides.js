// 坐着滑的装备（雪橇、雪圈、载具）的精细模型。用地面坐标：y = 0 是雪面，-Z 是前方。
// 拼法和 gearModels.js 一样：放样的板面 + 弯管 + 旋转体，再贴程序画的图案。
import * as THREE from 'three';
import {
  CORD, HULL, PRIM, geo, put, box, ball, knob, soft, strut, rod, pipeGeo, mirrorX, lathe, latheSkin, plateGeo, ringOf, radialGeo, studsGeo, loftGeo, skiStations,
  inlay, under, sample, sampleEnds, skin, sticker, flame, glowMat, shade,
} from './gearParts.js';
import { decalMat, INK, WHITE, rect, poly, line, circle, ring, round, text, star, chevrons, hazard, warn, grain, scales, dotRow, css, rng } from './gearDecals.js';

const HALF_PI = Math.PI / 2;
const BONE = 0xeee3c8;
const WOOD = 0x7a5230;

// 贴满一圈的雪圈外皮：和雪圈同样的圆环、半径大一丝丝，图案沿着圆周重复 repeat 次。
// 画布横向是绕圆周（一份 W 米），纵向是绕管子一圈：y = 0 外侧赤道、L/4 底、L/2 内侧、3L/4 顶、L 回到外侧
function tubeSkin(p, key, R, r, y, repeat, paint) {
  const g = geo(`tubeSkin:${R}:${r}`, () => new THREE.TorusGeometry(R, r + 0.003, 14, 40).rotateX(-HALF_PI));
  const W = (Math.PI * 2 * R) / repeat;
  return soft(put(p, g, decalMat(key, W, Math.PI * 2 * r, paint, { px: 256, py: 256, repeat }), 0, y, 0));
}

// ---------- 雪橇 ----------

// 木雪橇：一对弯成钩的木滑轨包着钢条，三对腿撑起四条刷了漆的座板，前面一根横杆拴着拉绳
const woodRunner = () => {
  const st = [{ z: 0.6, y: 0.06, w: 0.04, th: 0.05 }];
  for (let i = 0; i <= 10; i++) st.push({ z: 0.52 - (1.12 * i) / 10, y: 0.03, w: 0.04, th: 0.05 });
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * 2.3;
    st.push({ z: -0.6 - 0.2 * Math.sin(a), y: 0.23 - 0.2 * Math.cos(a), w: 0.04, th: 0.05 });
  }
  return st;
};
const woodSlat = () => sampleEnds(8, (t) => ({ t, z: 0.5 - 1.08 * t, y: 0.265, w: 0.105 * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 16)), th: 0.024 }));
function woodSled(v, c) {
  const wood = c.trim;
  const dark = c.m(WOOD);
  const run = woodRunner();
  const runner = geo('wood.runner', () => loftGeo(run));
  const strip = geo('wood.strip', () => loftGeo(under(run, 0.004, 0.008)));
  const slatSt = woodSlat();
  const slat = geo('wood.slat', () => loftGeo(slatSt));
  for (let i = 0; i < 4; i++) {
    const x = -0.1875 + i * 0.125;
    put(v, slat, c.main, x);
    skin(v, 'wood.slat', slatSt, 0.12, (d, W, L) => {
      grain(d, -W / 2, 0, W / 2, L, null, 0x3a2410, 4);
      rect(d, -W / 2, 0.06, W, 0.012, INK, 0.25);
      rect(d, -W / 2, L - 0.07, W, 0.012, INK, 0.25);
    }, { px: 64, py: 512 }).position.x = x;
  }
  const bolts = [];
  for (const s of [-1, 1]) {
    put(v, runner, wood, s * 0.26);
    put(v, strip, c.steel, s * 0.26);
    box(v, wood, 0.05, 0.04, 1.1, s * 0.235, 0.235, -0.04);
    for (const z of [0.38, -0.05, -0.45]) {
      strut(v, dark, [s * 0.26, 0.05, z], [s * 0.236, 0.236, z], 0.02);
      bolts.push([s * 0.262, 0.215, z]);
    }
    strut(v, dark, [s * 0.258, 0.07, 0.36], [s * 0.24, 0.22, -0.03], 0.012);
    strut(v, dark, [s * 0.258, 0.07, -0.07], [s * 0.24, 0.22, -0.43], 0.012);
  }
  put(v, geo('wood.bolts', () => studsGeo(bolts, 0.011, 'x')), c.gold);
  for (const z of [0.36, -0.05, -0.42]) box(v, dark, 0.5, 0.03, 0.05, 0, 0.238, z);
  strut(v, dark, [-0.26, 0.08, 0.56], [0.26, 0.08, 0.56], 0.02);
  strut(v, dark, [-0.27, 0.4, -0.76], [0.27, 0.4, -0.76], 0.024);
  put(v, geo('wood.rope', () => pipeGeo(mirrorX([[-0.22, 0.4, -0.77], [-0.14, 0.33, -0.92], [0, 0.29, -0.99]]), 0.012, 20, 5)), c.m(CORD));
}

// 雪垫：一块绗缝的软垫，前沿往上卷成挡板，两侧一对软包枕，侧面拉手，前面一根拖带
const padDeck = () =>
  sampleEnds(22, (t) => {
    const b = Math.max(0, (t - 0.72) / 0.28);
    return { t, z: 0.5 - 1.05 * t, y: 0.04 + 0.13 * b * b, w: 0.68 * Math.sqrt(Math.min(1, Math.sin(Math.PI * t) * 5)), th: 0.08 };
  });
function cushion(v, c) {
  const st = padDeck();
  const T = c.trimColor;
  put(v, geo('pad', () => loftGeo(st)), c.main);
  put(v, geo('pad.base', () => loftGeo(under(st, -0.02, 0.016))), c.dark);
  skin(v, 'cushion', st, 0.7, (d, W, L) => {
    d.save();
    d.setLineDash([0.018, 0.012]);
    d.beginPath();
    d.rect(-0.29, 0.06, 0.58, L - 0.12);
    d.clip();
    for (let k = -1.5; k < 1.5; k += 0.12) line(d, [[-0.35, k], [0.35, k + 0.7]], WHITE, 0.006, 0.7);
    for (let k = -1.5; k < 1.5; k += 0.12) line(d, [[0.35, k], [-0.35, k + 0.7]], WHITE, 0.006, 0.7);
    d.restore();
    d.save();
    d.setLineDash([0.02, 0.012]);
    round(d, -0.3, 0.05, 0.6, L - 0.1, 0.08);
    d.strokeStyle = css(INK, 0.45);
    d.lineWidth = 0.007;
    d.stroke();
    d.restore();
    round(d, -0.13, L - 0.36, 0.26, 0.12, 0.03);
    d.fillStyle = css(T);
    d.fill();
    text(d, 'SNOW PAD', 0, L - 0.3, 0.045, WHITE, { squash: 0.85, rot: Math.PI });
    for (let i = 0; i < 3; i++) chevrons(d, 0, 0.1, 0.12, 0.03, 2, 0.045, T, 0.9);
  }, { px: 256, py: 512 });
  const bolster = geo('pad.bolster', () => pipeGeo([[0.31, 0.1, 0.42], [0.32, 0.1, 0.1], [0.32, 0.105, -0.25], [0.3, 0.17, -0.5]], 0.045, 24, 10));
  const loop = geo('pad.loop', () => new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI).rotateY(HALF_PI));
  for (const s of [-1, 1]) {
    put(v, bolster, c.trim).scale.x = s;
    put(v, loop, c.dark, s * 0.36, 0.11, -0.12);
    put(v, loop, c.dark, s * 0.36, 0.11, 0.22);
  }
  put(v, geo('pad.strap', () => pipeGeo([[-0.12, 0.2, -0.57], [-0.08, 0.16, -0.72], [0, 0.13, -0.78], [0.08, 0.16, -0.72], [0.12, 0.2, -0.57]], 0.012, 20, 5)), c.dark);
  box(v, c.rubber, 0.14, 0.03, 0.04, 0, 0.13, -0.78);
}

// 雪橇：一体成型的竞速塑料橇。船形底壳、翘起来的橇头，两侧一圈圆滚滚的护舷接到橇头，
// 底下两条导向滑轨；中间软座，侧面拉手，后面两片尾鳍，橇头贴着号码
const sledHull = () =>
  sampleEnds(26, (t) => {
    const b = Math.max(0, (t - 0.7) / 0.3);
    return { t, z: 0.62 - 1.55 * t, y: 0.1 + 0.24 * b * b, w: (0.66 - 0.2 * b * b) * Math.sqrt(Math.min(1, t * 14)), th: 0.07 };
  });
const SLED_SEAT = [
  { z: 0.52, y: 0.15, w: 0.4, th: 0.04 },
  { z: 0.42, y: 0.152, w: 0.44, th: 0.05 },
  { z: 0.06, y: 0.152, w: 0.44, th: 0.05 },
  { z: -0.06, y: 0.15, w: 0.36, th: 0.04 },
];
function sled(v, c) {
  const st = sledHull();
  const T = c.trimColor;
  put(v, geo('sled', () => loftGeo(st)), c.main);
  put(v, geo('sled.base', () => loftGeo(under(st, -0.04, 0.012))), c.dark);
  skin(v, 'sled', st, 0.68, (d, W, L) => {
    for (const x of [-0.13, 0.13]) rect(d, x - 0.035, 0, 0.07, L, T);
    for (const x of [-0.13, 0.13]) rect(d, x - 0.006, 0, 0.012, L, WHITE, 0.9);
    chevrons(d, 0, 0.06, 0.12, 0.035, 3, 0.05, INK, 0.75);
    circle(d, 0, 0.3, 0.07, WHITE);
    ring(d, 0, 0.3, 0.07, 0.01, INK);
    text(d, '01', 0, 0.298, 0.07, INK, { squash: 0.9, rot: Math.PI });
    text(d, 'SPEED', 0, L - 0.08, 0.06, INK, { a: 0.8, rot: Math.PI });
  }, { px: 256, py: 512 });
  // 护舷：一整圈 U 形，从两侧绕过橇头；外面再压一道装饰色的防撞条
  put(v, geo('sled.pod', () => pipeGeo(mirrorX([[-0.33, 0.15, 0.6], [-0.345, 0.16, 0.1], [-0.33, 0.19, -0.5], [-0.22, 0.3, -0.84], [0, 0.36, -0.95]]), 0.055, 56, 12)), c.main);
  put(v, geo('sled.bumper', () => pipeGeo(mirrorX([[-0.39, 0.15, 0.5], [-0.4, 0.155, 0.1], [-0.385, 0.18, -0.5], [-0.26, 0.29, -0.87], [0, 0.34, -1.0]]), 0.02, 56, 6)), c.trim);
  put(v, geo('sled.seat', () => loftGeo(SLED_SEAT)), c.rubber);
  put(v, geo('sled.seat.line', () => loftGeo(inlay(SLED_SEAT, 0.18))), c.trim);
  // 后挡：一块软包的靠垫，上沿一道装饰色
  box(v, c.deep, 0.56, 0.1, 0.07, 0, 0.18, 0.6);
  box(v, c.trim, 0.56, 0.014, 0.075, 0, 0.236, 0.6);
  const runner = geo('sled.runner', () => loftGeo(skiStations({ tail: 0.58, nose: -0.78, w: 0.05, waist: 0.046, noseKick: 0.08, noseLen: 0.2, th: 0.05, n: 14, y: 0.035 })));
  const handle = geo('sled.handle', () => new THREE.TorusGeometry(0.075, 0.014, 6, 12, Math.PI).rotateY(HALF_PI));
  const fin = geo('sled.fin', () => plateGeo([[0, 0], [0.22, 0], [0.05, 0.16], [-0.03, 0.16]], 0.014, true));
  for (const s of [-1, 1]) {
    put(v, runner, c.dark, s * 0.2);
    put(v, handle, c.black, s * 0.35, 0.2, -0.2);
    put(v, fin, c.trim, s * 0.33, 0.19, 0.6);
    // 刹车扳手
    strut(v, c.dark, [s * 0.36, 0.14, 0.42], [s * 0.42, 0.24, 0.34], 0.012);
    ball(v, c.red, 0.022, 0.022, 0.022, s * 0.42, 0.245, 0.335);
  }
  for (const s of [-1, 1]) ball(v, c.white, 0.035, 0.025, 0.015, s * 0.12, 0.345, -0.94);
}

// 钢刃雪橇：两条镀铬刀刃滑轨，镀铬管车架绕到前面成一道防撞环；拉丝钢板座、两侧铆钉装甲，
// 前面一根转向横把，后面一对雪车那样的推杆
const steelRunner = () => {
  const st = [{ z: 0.8, y: 0.05, w: 0.016, th: 0.06 }];
  for (let i = 0; i <= 10; i++) st.push({ z: 0.72 - (1.38 * i) / 10, y: 0.03, w: 0.016, th: 0.06 });
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * 1.9;
    st.push({ z: -0.66 - 0.13 * Math.sin(a), y: 0.16 - 0.13 * Math.cos(a), w: 0.016, th: 0.06 });
  }
  return st;
};
const STEEL_PAN = [
  { z: 0.66, y: 0.31, w: 0.42, th: 0.03 },
  { z: 0.56, y: 0.27, w: 0.46, th: 0.035 },
  { z: -0.3, y: 0.262, w: 0.46, th: 0.035 },
  { z: -0.5, y: 0.28, w: 0.36, th: 0.03 },
];
function steelSled(v, c) {
  const T = c.trimColor;
  const run = steelRunner();
  const runner = geo('steel.runner', () => loftGeo(run));
  put(v, geo('steel.pan', () => loftGeo(STEEL_PAN)), c.main);
  skin(v, 'steel.pan', STEEL_PAN, 0.48, (d, W, L) => {
    const r = rng(17);
    for (let y = 0.02; y < L; y += 0.008) line(d, [[-W / 2, y], [W / 2, y]], r() > 0.5 ? WHITE : INK, 0.002, 0.12 + r() * 0.12);
    hazard(d, -W / 2, 0, W, 0.05, 0.025);
    hazard(d, -W / 2, L - 0.12, W, 0.05, 0.025);
    const dots = [];
    for (let y = 0.09; y < L - 0.14; y += 0.1) dots.push([-0.2, y], [0.2, y]);
    dotRow(d, dots, 0.008, INK, 0.55);
    text(d, 'STEEL-X', 0, 0.2, 0.05, INK, { a: 0.75, rot: Math.PI });
    warn(d, 0, L - 0.25, 0.07, Math.PI);
  }, { px: 256, py: 512 });
  // 车架：两侧一根管子从车尾绕到车头，三道横管，立柱接到滑轨
  put(v, geo('steel.frame', () => pipeGeo(mirrorX([[-0.27, 0.13, 0.7], [-0.27, 0.135, 0], [-0.25, 0.155, -0.6], [-0.17, 0.25, -0.86], [0, 0.29, -0.93]]), 0.022, 56, 8)), c.chrome);
  for (const z of [0.45, 0, -0.45]) {
    strut(v, c.chrome, [-0.27, 0.135, z], [0.27, 0.135, z], 0.016);
    for (const s of [-1, 1]) strut(v, c.dark, [s * 0.15, 0.135, z], [s * 0.15, 0.25, z], 0.016);
  }
  const studs = [];
  for (const s of [-1, 1]) {
    put(v, runner, c.chrome, s * 0.27);
    for (const z of [0.45, 0, -0.45]) {
      box(v, c.dark, 0.045, 0.07, 0.07, s * 0.27, 0.09, z);
      studs.push([s * 0.294, 0.09, z - 0.018], [s * 0.294, 0.09, z + 0.018]);
    }
    // 侧面装甲板
    put(v, geo('steel.armor', () => plateGeo([[-0.45, 0.17], [0.4, 0.17], [0.5, 0.25], [0.48, 0.3], [-0.5, 0.3]], 0.016, true)), c.deep, s * 0.255, 0, 0);
    for (const z of [-0.4, -0.2, 0, 0.2, 0.36]) studs.push([s * 0.265, 0.235, z]);
    const tag = sticker(v, 'steel.tag', 0.3, 0.07, (d, W, L) => {
      hazard(d, -W / 2, 0, 0.08, L, 0.02);
      text(d, 'BLADE', 0.04, L / 2, 0.05, WHITE, { stroke: INK, strokeW: 0.2 });
    }, { px: 256, py: 64 });
    tag.position.set(s * 0.264, 0.255, -0.12);
    tag.rotation.y = s * HALF_PI;
    // 后推杆
    strut(v, c.chrome, [s * 0.22, 0.28, 0.6], [s * 0.25, 0.44, 0.8], 0.016);
    strut(v, c.rubber, [s * 0.248, 0.43, 0.787], [s * 0.255, 0.475, 0.84], 0.022);
  }
  put(v, geo('steel.studs', () => studsGeo(studs, 0.01, 'x')), c.steel);
  // 转向横把
  strut(v, c.dark, [0, 0.25, -0.6], [0, 0.33, -0.64], 0.02);
  strut(v, c.chrome, [-0.24, 0.335, -0.64], [0.24, 0.335, -0.64], 0.016);
  for (const s of [-1, 1]) strut(v, c.rubber, [s * 0.18, 0.335, -0.64], [s * 0.27, 0.335, -0.64], 0.024);
  box(v, c.lit, 0.08, 0.02, 0.01, 0, 0.27, -0.9);
}

// 龙骨雪橇：两根骨头滑轨，前端弯成龙爪；四对肋骨围在两边，鳞纹鞍座下是一节节的脊椎；
// 前面伸出龙颈和龙头（发光的眼睛、龙角、獠牙、龙须、鬃刺），后面一条带刺的龙尾。加速时龙嘴喷火
const boneRunner = () => {
  const st = [{ z: 0.76, y: 0.05, w: 0.05, th: 0.06 }];
  for (let i = 0; i <= 14; i++) {
    const z = 0.7 - (1.4 * i) / 14;
    const knob = 1 + 0.25 * Math.max(0, Math.cos((z * Math.PI) / 0.25)) ** 6;
    st.push({ z, y: 0.035, w: 0.05 * knob, th: 0.06 * knob });
  }
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * 2.1;
    st.push({ z: -0.7 - 0.16 * Math.sin(a), y: 0.195 - 0.16 * Math.cos(a), w: 0.05 * (1 - i / 12), th: 0.06 * (1 - i / 12) });
  }
  return st;
};
const DRAGON_SEAT = [
  { z: 0.5, y: 0.25, w: 0.38, th: 0.05 },
  { z: 0.4, y: 0.255, w: 0.44, th: 0.06 },
  { z: -0.2, y: 0.255, w: 0.44, th: 0.06 },
  { z: -0.38, y: 0.27, w: 0.28, th: 0.05 },
];
function dragon(v, c) {
  const T = c.trimColor;
  const bone = c.m(BONE);
  // 鬃刺、下颌、尾刃用装饰色压暗的那一档：不跟玩家选的主色走，龙身始终是红配骨白
  const crest = c.m(shade(T, 0.5));
  const eye = c.m(0xffd23c, { emissive: 0xffc01f, emissiveIntensity: 1 });
  const run = boneRunner();
  const runner = geo('dragon.runner', () => loftGeo(run));
  put(v, geo('dragon.seat', () => loftGeo(DRAGON_SEAT)), c.main);
  put(v, geo('dragon.seat.rim', () => loftGeo(under(DRAGON_SEAT, 0.04, 0.03))), crest);
  skin(v, 'dragon.seat', DRAGON_SEAT, 0.46, (d, W, L) => {
    scales(d, -0.24, 0.0, 0.24, L, 0.05, T, 0.014, 0.55);
    for (let y = 0.08; y < L - 0.05; y += 0.13) poly(d, [[0, y - 0.04], [0.035, y], [0, y + 0.04], [-0.035, y]], 0xffc23a, 0.95);
    for (const s of [-1, 1]) line(d, [[s * 0.2, 0.04], [s * 0.205, L / 2], [s * 0.13, L - 0.03]], 0xffc23a, 0.012, 0.95);
  }, { px: 128, py: 256 });
  // 鞍座下的一节节脊椎
  for (let z = 0.58; z > -0.55; z -= 0.12) knob(v, bone, 0.05, 0.045, 0.05, 0, 0.16, z);
  for (const s of [-1, 1]) {
    put(v, runner, bone, s * 0.27);
    // 肋骨：从滑轨弯上来，贴着鞍座两边收进去，末端一个骨节
    for (const z of [0.36, 0.06, -0.24]) {
      strut(v, bone, [s * 0.27, 0.06, z], [0, 0.16, z], 0.016);
      put(v, geo('dragon.rib', () => pipeGeo([[0.27, 0.05, 0], [0.335, 0.14, 0.015], [0.33, 0.24, 0.03], [0.27, 0.31, 0.05]], 0.02, 14, 6)), bone, 0, 0, z).scale.x = s;
      knob(v, bone, 0.026, 0.026, 0.026, s * 0.27, 0.31, z + 0.05);
    }
    // 龙爪的指甲
    const claw = put(v, PRIM.cone, c.dark, s * 0.27, 0.36, -0.79, 0.02, 0.09, 0.02);
    claw.rotation.x = -0.6;
  }
  // 龙颈和颈上的鬃刺
  put(v, geo('dragon.neck', () => pipeGeo([[0, 0.27, -0.34], [0, 0.33, -0.6], [0, 0.42, -0.82], [0, 0.5, -0.94]], 0.075, 20, 12)), c.trim);
  for (const [z, y] of [[-0.42, 0.37], [-0.56, 0.41], [-0.7, 0.47], [-0.82, 0.55]]) {
    const sp = put(v, PRIM.cone4, crest, 0, y, z, 0.03, 0.12, 0.012);
    sp.rotation.x = 0.45;
  }
  // 龙头：头骨、长吻、下颌，发光的眼睛和眉骨，一排獠牙，往后掠的龙角，金色龙须，脑后两片鬃刺
  const h = new THREE.Group();
  h.position.set(0, 0.54, -1.02);
  h.scale.setScalar(1.25);
  v.add(h);
  ball(h, c.trim, 0.13, 0.11, 0.16, 0, 0, 0);
  ball(h, c.trim, 0.095, 0.07, 0.17, 0, -0.03, -0.13);
  ball(h, crest, 0.085, 0.035, 0.15, 0, -0.095, -0.1).rotation.x = 0.18;
  for (const s of [-1, 1]) {
    knob(h, eye, 0.03, 0.026, 0.026, s * 0.075, 0.045, -0.06);
    knob(h, c.black, 0.012, 0.016, 0.01, s * 0.082, 0.045, -0.083);
    box(h, bone, 0.05, 0.018, 0.08, s * 0.07, 0.08, -0.06).rotation.z = s * 0.35;
    knob(h, c.black, 0.014, 0.012, 0.012, s * 0.035, 0.0, -0.29);
    for (let i = 0; i < 4; i++) {
      const t = put(h, PRIM.cone4, c.m(0xffffff), s * 0.06, -0.075, -0.2 + i * 0.045, 0.012, 0.04, 0.012);
      t.rotation.x = Math.PI;
    }
    put(h, geo('dragon.horn', () => pipeGeo([[0.06, 0.08, 0.05], [0.12, 0.18, 0.12], [0.15, 0.22, 0.26]], 0.022, 12, 6)), bone).scale.x = s;
    const tip = put(h, PRIM.cone, bone, s * 0.15, 0.23, 0.31, 0.022, 0.08, 0.022);
    tip.rotation.x = HALF_PI - 0.28;
    put(h, geo('dragon.whisker', () => pipeGeo([[0.06, -0.04, -0.24], [0.18, -0.08, -0.16], [0.28, -0.02, 0.0], [0.34, 0.06, 0.14]], 0.008, 18, 4)), c.gold).scale.x = s;
    for (const [y, z, a] of [[0.1, 0.12, 0.9], [0.04, 0.16, 1.1]]) {
      const m = put(h, PRIM.cone4, crest, s * 0.07, y, z, 0.025, 0.12, 0.01);
      m.rotation.set(a, 0, -s * 0.5);
    }
  }
  // 加速时龙嘴往前喷火
  const breath = new THREE.Group();
  breath.position.set(0, 0.5, -1.4);
  breath.rotation.y = Math.PI;
  v.add(breath);
  flame(breath, c.fx, 0, 0, 0, 0.05, 0.45);
  // 胸口一颗发光的龙珠
  put(v, PRIM.ico, c.lit, 0, 0.3, -0.44, 0.045, 0.045, 0.045);
  soft(put(v, PRIM.sphere, glowMat(T, 0.3), 0, 0.3, -0.44, 0.1));
  // 龙尾：翘起来往后伸，背上一排刺，尾巴尖一片刃
  put(v, geo('dragon.tail', () => pipeGeo([[0, 0.2, 0.56], [0, 0.26, 0.78], [0, 0.38, 0.96], [0, 0.52, 1.06]], 0.05, 20, 10)), c.trim);
  for (const [z, y] of [[0.7, 0.29], [0.86, 0.36], [1.0, 0.46]]) {
    const sp = put(v, PRIM.cone4, crest, 0, y, z, 0.025, 0.1, 0.01);
    sp.rotation.x = 0.6;
  }
  put(v, geo('dragon.tailblade', () => plateGeo([[0, 0], [0.12, 0.12], [0.02, 0.22], [-0.06, 0.1]], 0.016, true)), crest, 0, 0.5, 1.06).rotation.x = -0.5;
}

// ---------- 雪圈 ----------

// 充气圈：尼龙外罩印着色带和字，底下一块耐磨底，两侧织带拉手，前面一根拖绳，后面一个气门
function tube(v, c) {
  const T = c.trimColor;
  put(v, geo('tube', () => new THREE.TorusGeometry(0.6, 0.27, 14, 40).rotateX(-HALF_PI)), c.main, 0, 0.27, 0);
  tubeSkin(v, 'tube', 0.6, 0.27, 0.27, 4, (d, W, L) => {
    rect(d, -W / 2, L * 0.68, W, L * 0.04, T);
    rect(d, -W / 2, L * 0.82, W, L * 0.04, T);
    rect(d, -W / 2, L * 0.735, W, L * 0.008, WHITE, 0.9);
    text(d, 'SNOW TUBE', 0, L * 0.92, 0.09, T, { squash: 0.9 });
    star(d, -W * 0.42, L * 0.92, 0.035, T);
    star(d, W * 0.42, L * 0.92, 0.035, T);
    rect(d, -W / 2, L * 0.08, W, L * 0.3, INK, 0.25);
  });
  put(v, PRIM.cyl, c.dark, 0, 0.1, 0, 0.42, 0.06, 0.42);
  put(v, PRIM.cyl, c.rubber, 0, 0.135, 0, 0.36, 0.02, 0.36);
  const loop = geo('tube.loop', () => new THREE.TorusGeometry(0.075, 0.016, 6, 12, Math.PI).rotateY(HALF_PI));
  for (const s of [-1, 1]) {
    put(v, loop, c.black, s * 0.6, 0.54, 0);
    box(v, c.trim, 0.09, 0.012, 0.22, s * 0.6, 0.538, 0);
  }
  put(v, geo('tube.rope', () => pipeGeo([[0, 0.3, -0.86], [0, 0.22, -1.0], [0, 0.14, -1.08], [0, 0.1, -1.16]], 0.013, 16, 5)), c.m(CORD));
  strut(v, c.dark, [-0.08, 0.1, -1.17], [0.08, 0.1, -1.17], 0.02);
  put(v, PRIM.cyl, c.dark, 0, 0.55, 0.6, 0.025, 0.04, 0.025);
  put(v, PRIM.cyl, c.trim, 0, 0.575, 0.6, 0.03, 0.015, 0.03);
}

// 竞速雪圈：外沿一圈轮胎花纹，中间是一只带五根辐条的轮毂当座，两侧号码牌，后面一片尾翼，前面两盏灯
function ringTube(v, c) {
  const T = c.trimColor;
  put(v, geo('ring', () => new THREE.TorusGeometry(0.62, 0.25, 14, 40).rotateX(-HALF_PI)), c.main, 0, 0.26, 0);
  tubeSkin(v, 'ring', 0.62, 0.25, 0.26, 6, (d, W, L) => {
    // 外侧一整圈是深色胎面：上半圈印白字，下半圈压一排斜花纹块
    rect(d, -W / 2, 0, W, L * 0.24, INK, 0.94);
    rect(d, -W / 2, L * 0.84, W, L * 0.16, INK, 0.94);
    for (let i = 0; i < 8; i++) {
      const x = -W / 2 + (i + 0.5) * (W / 8);
      poly(d, [[x - 0.03, L * 0.015], [x + 0.015, L * 0.015], [x + 0.045, L * 0.2], [x, L * 0.2]], 0x454b58);
    }
    rect(d, -W / 2, L * 0.835, W, L * 0.012, T);
    text(d, 'RACING', 0, L * 0.925, 0.06, WHITE, { squash: 0.9 });
    rect(d, -W / 2, L * 0.72, W, L * 0.05, T);
    rect(d, -W / 2, L * 0.56, W, L * 0.02, T, 0.9);
  });
  // 轮毂：外圈、五根辐条、中间的轮盖
  put(v, geo('ring.rim', () => lathe([[0.4, 0.16], [0.41, 0.22], [0.37, 0.24], [0.33, 0.2], [0.3, 0.2]], 40)), c.chrome);
  put(v, PRIM.cyl, c.black, 0, 0.16, 0, 0.36, 0.05, 0.36);
  put(v, geo('ring.spokes', () => radialGeo(new THREE.BoxGeometry(0.06, 0.03, 0.3).translate(0, 0, 0.15), 5)), c.trim, 0, 0.2, 0);
  put(v, PRIM.cyl, c.lit, 0, 0.215, 0, 0.09, 0.03, 0.09);
  put(v, PRIM.cyl, c.rubber, 0, 0.24, 0.05, 0.22, 0.05, 0.2);
  for (const s of [-1, 1]) {
    const plate = sticker(v, 'ring.number', 0.22, 0.16, (d, W, L) => {
      round(d, -W / 2, 0, W, L, 0.03);
      d.fillStyle = css(WHITE);
      d.fill();
      rect(d, -W / 2, 0, W, 0.035, T);
      text(d, '8', 0, L * 0.6, 0.11, INK);
    }, { px: 128, py: 128 });
    plate.position.set(s * 0.875, 0.3, 0);
    plate.rotation.y = s * HALF_PI;
    // 尾翼的立柱和侧板
    strut(v, c.dark, [s * 0.22, 0.48, 0.56], [s * 0.22, 0.64, 0.72], 0.018);
    box(v, c.trim, 0.016, 0.12, 0.2, s * 0.36, 0.64, 0.76);
    ball(v, c.white, 0.035, 0.03, 0.015, s * 0.22, 0.32, -0.82);
    put(v, geo('ring.loop', () => new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI).rotateY(HALF_PI)), c.black, s * 0.62, 0.51, 0.2);
  }
  const wing = box(v, c.deep, 0.72, 0.022, 0.18, 0, 0.66, 0.76);
  wing.rotation.x = -0.18;
  box(v, c.lit, 0.7, 0.008, 0.02, 0, 0.675, 0.68).rotation.x = -0.18;
}

// 泰坦雪圈：厚实的圆环套着八块金色装甲，块与块之间露出主色；内沿一圈能量灯，四个角挂推进舱，
// 中间一张带靠背和扶手的王座，前面一面盾形徽章
function titan(v, c) {
  const T = c.trimColor;
  const R = 0.66;
  const r = 0.3;
  put(v, geo('titan', () => new THREE.TorusGeometry(R, r, 14, 44).rotateX(-HALF_PI)), c.m(HULL), 0, 0.3, 0);
  // 八块装甲：主色的甲片，两头各包一道金边，顶上三颗金铆钉；甲片之间的缝里透出灯光
  const band = geo('titan.band', () => new THREE.TorusGeometry(R, r + 0.022, 12, 8, 0.64).rotateZ(-0.32).rotateX(-HALF_PI));
  const lip = geo('titan.lip', () => new THREE.TorusGeometry(R, r + 0.032, 12, 1, 0.04).rotateZ(-0.02).rotateX(-HALF_PI));
  const studs = geo('titan.rivets', () => {
    const pts = [];
    for (const a of [-0.2, 0, 0.2]) pts.push([Math.cos(a) * R, r + 0.022, -Math.sin(a) * R]);
    return studsGeo(pts, 0.014);
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    put(v, band, c.main, 0, 0.3, 0).rotation.y = a;
    put(v, studs, c.gold, 0, 0.3, 0).rotation.y = a;
    for (const e of [-0.31, 0.31]) put(v, lip, c.gold, 0, 0.3, 0).rotation.y = a + e;
    const g = a + Math.PI / 8;
    box(v, c.lit, 0.03, 0.012, 0.06, Math.cos(g) * R, 0.3 + r + 0.004, -Math.sin(g) * R).rotation.y = g;
  }
  put(v, geo('titan.core', () => new THREE.TorusGeometry(R - r + 0.01, 0.02, 6, 44).rotateX(-HALF_PI)), c.lit, 0, 0.3, 0);
  // 推进舱：四个角各一个，后面两个加速时喷火
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 0.66;
    const z = sz * 0.66;
    rod(v, c.dark, 0.08, 0.32, x, 0.34, z);
    rod(v, c.gold, 0.086, 0.05, x, 0.34, z - 0.1);
    if (sz > 0) {
      rod(v, c.steel, 0.07, 0.06, x, 0.34, z + 0.18);
      ball(v, c.lit, 0.05, 0.05, 0.02, x, 0.34, z + 0.21);
      flame(v, c.fx, x, 0.34, z + 0.22, 0.06, 0.42);
    } else {
      ball(v, c.lit, 0.06, 0.06, 0.03, x, 0.34, z - 0.165);
    }
  }
  // 王座
  put(v, PRIM.cyl, c.dark, 0, 0.12, 0, 0.42, 0.08, 0.42);
  put(v, PRIM.cyl, c.deep, 0, 0.3, 0.04, 0.24, 0.12, 0.22);
  put(v, geo('titan.cushion', () => lathe([[0, 0.36], [0.2, 0.36], [0.22, 0.38], [0.18, 0.4], [0, 0.4]], 24)), c.rubber, 0, -0.04, 0.04);
  put(v, geo('titan.back', () => new THREE.CylinderGeometry(0.26, 0.24, 0.26, 18, 1, true, -1.1, 2.2)), c.m(c.mainColor, { side: THREE.DoubleSide }), 0, 0.5, 0.06);
  put(v, geo('titan.backtop', () => new THREE.TorusGeometry(0.26, 0.02, 6, 18, 2.2).rotateZ(-HALF_PI - 1.1).rotateX(-HALF_PI)), c.gold, 0, 0.63, 0.06);
  for (const s of [-1, 1]) {
    box(v, c.gold, 0.05, 0.05, 0.3, s * 0.26, 0.47, 0);
    box(v, c.dark, 0.04, 0.12, 0.04, s * 0.26, 0.4, -0.12);
  }
  // 盾形徽章
  const crest = put(v, geo('titan.crest', () => plateGeo([[0, -0.14], [0.13, -0.05], [0.12, 0.1], [0, 0.13], [-0.12, 0.1], [-0.13, -0.05]], 0.03, true)), c.gold, 0, 0.36, -0.97);
  crest.rotation.y = HALF_PI;
  const emblem = sticker(v, 'titan.star', 0.18, 0.18, (d, W, L) => {
    star(d, 0, L / 2, 0.075, T);
    star(d, 0, L / 2, 0.04, WHITE);
  }, { px: 128, py: 128, glow: true });
  emblem.position.set(0, 0.37, -0.987);
  emblem.rotation.y = Math.PI;
}

// ---------- 原来的几台载具（加了贴花和小零件） ----------

// 托博根长橇：五条木板并排，橇头整个卷起来，用绳子拉住；木板上一道道木纹，横档上一排铜钉
const tobSlat = () => {
  const st = sample(6, (t) => ({ z: 0.78 - 1.58 * t, y: 0.045, w: 0.116, th: 0.028 }));
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * 3.4;
    st.push({ z: -0.8 - 0.28 * Math.sin(a), y: 0.325 - 0.28 * Math.cos(a), w: 0.116, th: 0.028 });
  }
  return st;
};
function toboggan(v, c) {
  const st = tobSlat();
  const slat = geo('tob.slat', () => loftGeo(st));
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.128;
    put(v, slat, i % 2 ? c.trim : c.main, x);
    skin(v, 'tob.slat', st, 0.12, (d, W, L) => grain(d, -W / 2, 0, W / 2, L, null, 0x3a2410, 8), { px: 64, py: 512 }).position.x = x;
  }
  const wood = c.m(WOOD);
  const cord = c.m(CORD);
  const nails = [];
  for (const z of [0.64, 0.22, -0.26, -0.64]) {
    box(v, wood, 0.66, 0.035, 0.06, 0, 0.077, z);
    for (let i = 0; i < 5; i++) nails.push([(i - 2) * 0.128, 0.096, z]);
  }
  put(v, geo('tob.nails', () => studsGeo(nails, 0.01)), c.gold);
  box(v, wood, 0.66, 0.04, 0.05, 0, 0.572, -0.8);
  const rail = geo('tob.rail', () => pipeGeo([[0.335, 0.07, 0.74], [0.335, 0.19, 0.54], [0.335, 0.2, 0.1], [0.335, 0.19, -0.3], [0.335, 0.07, -0.52]], 0.017, 20, 6));
  for (const s of [-1, 1]) {
    put(v, rail, wood).scale.x = s;
    strut(v, cord, [s * 0.31, 0.56, -0.8], [s * 0.31, 0.09, -0.26], 0.011);
  }
  // 拉绳搭在橇面上
  put(v, geo('tob.rope', () => pipeGeo([[-0.31, 0.09, -0.26], [-0.16, 0.105, -0.2], [0, 0.105, -0.16], [0.16, 0.105, -0.2], [0.31, 0.09, -0.26]], 0.013, 20, 6)), cord);
  // 坐垫：一块格子呢，整块画满
  const plaid = decalMat('tob.blanket', 0.6, 0.6, (d, W, L) => {
    rect(d, -W / 2, 0, W, L, 0xb8323a);
    for (let k = 0; k < 6; k++) {
      rect(d, -W / 2 + k * 0.1 + 0.03, 0, 0.035, L, 0x1d2a4a, 0.55);
      rect(d, -W / 2, k * 0.1 + 0.03, W, 0.035, 0x1d2a4a, 0.55);
      rect(d, -W / 2 + k * 0.1 + 0.075, 0, 0.006, L, 0xffd23c, 0.8);
      rect(d, -W / 2, k * 0.1 + 0.075, W, 0.006, 0xffd23c, 0.8);
    }
  }, { px: 128, py: 128, opaque: true });
  box(v, plaid, 0.5, 0.07, 0.62, 0, 0.095, 0.2);
}

// 雪地飞碟：一只浅碟，碟沿包边、一圈铆钉，碟心印一圈星芒，中间是坐垫，两侧有把手，碟沿前面拴着牵引绳
function saucer(v, c) {
  const T = c.trimColor;
  const d = new THREE.Group();
  d.position.z = -0.08;
  v.add(d);
  const dish = [[0, 0.02], [0.3, 0.03], [0.55, 0.08], [0.7, 0.16], [0.78, 0.25], [0.8, 0.3], [0.775, 0.325], [0.74, 0.3], [0.68, 0.22], [0.52, 0.135], [0.3, 0.09], [0, 0.08]];
  put(d, geo('saucer', () => lathe(dish, 40)), c.main);
  latheSkin(d, 'saucer', [[0.735, 0.303], [0.676, 0.224], [0.518, 0.139], [0.3, 0.094]], 8, (g, W, L) => {
    poly(g, [[0, L], [0.06, L * 0.35], [0, 0], [-0.06, L * 0.35]], T, 0.9);
    star(g, W / 2, L * 0.55, 0.04, WHITE, { n: 4, inner: 0.35 });
    rect(g, -W / 2, L * 0.85, W, 0.02, INK, 0.5);
  });
  put(d, geo('saucer.rim', () => new THREE.TorusGeometry(0.787, 0.03, 8, 44).rotateX(HALF_PI)), c.trim, 0, 0.305, 0);
  put(d, geo('saucer.band', () => lathe([[0.69, 0.238], [0.6, 0.181], [0.54, 0.149]], 40)), c.trim);
  put(d, geo('saucer.seat', () => lathe([[0, 0.085], [0.3, 0.085], [0.34, 0.112], [0.3, 0.14], [0, 0.145]], 28)), c.rubber);
  put(d, geo('saucer.studs', () => ringOf(new THREE.SphereGeometry(0.022, 8, 6), 12, 0.716)), c.steel, 0, 0.27, 0);
  const handle = geo('saucer.handle', () => new THREE.TorusGeometry(0.09, 0.018, 6, 12, Math.PI).rotateY(HALF_PI));
  for (const s of [-1, 1]) put(d, handle, c.dark, s * 0.62, 0.19, 0);
  // 牵引绳从碟沿顺着碟面搭下来，把手落在两脚之间
  put(v, geo('saucer.leash', () => pipeGeo([[0, 0.33, -0.87], [0, 0.225, -0.72], [0, 0.15, -0.56], [0, 0.13, -0.44]], 0.012, 16, 5)), c.m(CORD));
  strut(v, c.dark, [-0.08, 0.13, -0.43], [0.08, 0.13, -0.43], 0.018);
}

// 雪地单车：前后两块短雪板，三角车架加整流罩，前叉带避震，弯把、鞍座、脚踏；整流罩两侧贴号码
function bike(v, c) {
  const T = c.trimColor;
  const S = [0, 0.5, 0.2]; // 鞍座下
  const HT = [0, 0.76, -0.5]; // 头管上
  const HB = [0, 0.6, -0.56]; // 头管下
  const BB = [0, 0.22, -0.12]; // 车架最低点
  const RM = [0, 0.1, 0.36]; // 后板的座
  const rearSki = { tail: 0.8, nose: -0.12, w: 0.17, waist: 0.15, tailKick: 0.02, noseKick: 0.1, noseLen: 0.3, n: 18, y: 0.02 };
  const frontSki = { tail: -0.42, nose: -1.24, w: 0.17, waist: 0.15, noseKick: 0.15, noseLen: 0.32, n: 18, y: 0.02 };
  const skiArt = (d, W, L) => {
    chevrons(d, 0, 0.05, 0.12, 0.035, 2, 0.05, T, 1);
    for (const x of [-0.06, 0.06]) line(d, [[x, 0.18], [x, L - 0.06]], T, 0.012);
    text(d, 'SNOW', 0, L * 0.55, 0.05, INK, { rot: HALF_PI, a: 0.75 });
  };
  for (const [k, spec] of [['rear', rearSki], ['front', frontSki]]) {
    const st = skiStations(spec);
    put(v, geo('bike.' + k, () => loftGeo(st)), c.main);
    put(v, geo('bike.' + k + '.edge', () => loftGeo(under(st, 0.01, 0.01))), c.steel);
    skin(v, 'bike.' + k, st, 0.18, skiArt, { px: 64, py: 512 });
  }
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
  for (const s of [-1, 1]) {
    const tag = sticker(v, 'bike.fairing', 0.3, 0.16, (d, W, L) => {
      poly(d, [[-W / 2, L * 0.75], [W / 2, 0.01], [W / 2, 0.04], [-W / 2, L * 0.95]], T);
      circle(d, -0.03, L * 0.48, 0.055, WHITE);
      text(d, '23', -0.03, L * 0.5, 0.065, INK, { squash: 0.85 });
      text(d, 'MTB', 0.09, L * 0.72, 0.03, INK, { a: 0.8 });
    }, { px: 256, py: 128 });
    tag.position.set(s * 0.039, 0.5, -0.17);
    tag.rotation.set(0, s * HALF_PI, s * 0.1);
  }
  // 前叉和避震（弹簧圈）
  for (const s of [-1, 1]) strut(v, c.steel, [s * 0.06, 0.62, -0.555], [s * 0.05, 0.1, -0.84], 0.022);
  strut(v, c.m(0xe0263c), [0, 0.52, -0.61], [0, 0.3, -0.73], 0.04);
  for (let i = 0; i < 4; i++) {
    const k = 0.2 + i * 0.2;
    put(v, geo('bike.coil', () => new THREE.TorusGeometry(0.048, 0.008, 5, 14).rotateX(HALF_PI)), c.m(0xffd23c), 0, 0.52 - 0.22 * k, -0.61 - 0.12 * k).rotation.x = -0.5;
  }
  // 鞍座、后挡泥板、尾灯
  ball(v, c.rubber, 0.11, 0.05, 0.27, 0, 0.51, 0.2);
  box(v, c.trim, 0.06, 0.012, 0.3, 0, 0.555, 0.2);
  box(v, c.main, 0.12, 0.02, 0.34, 0, 0.44, 0.52).rotation.x = -0.25;
  ball(v, c.red, 0.03, 0.03, 0.03, 0, 0.485, 0.69);
  // 车把
  strut(v, c.steel, [0, 0.78, -0.49], [0, 0.845, -0.47], 0.028);
  put(v, geo('bike.bar', () => pipeGeo([[-0.39, 0.8, -0.36], [-0.22, 0.84, -0.44], [0, 0.845, -0.47], [0.22, 0.84, -0.44], [0.39, 0.8, -0.36]], 0.02, 20, 8)), c.steel);
  for (const s of [-1, 1]) {
    strut(v, c.rubber, [s * 0.4, 0.797, -0.355], [s * 0.3, 0.827, -0.405], 0.03);
    strut(v, c.dark, [s * 0.24, 0.84, -0.43], [s * 0.3, 0.83, -0.33], 0.008);
  }
  // 号码牌
  const plate = new THREE.Group();
  plate.position.set(0, 0.69, -0.6);
  plate.rotation.x = 0.2;
  box(plate, c.m(0xf4f4f4), 0.2, 0.17, 0.02, 0, 0, 0);
  const num = sticker(plate, 'bike.plate', 0.18, 0.15, (d, W, L) => {
    rect(d, -W / 2, 0, W, 0.03, T);
    text(d, '23', 0, L * 0.58, 0.1, INK);
  }, { px: 128, py: 128 });
  num.position.z = -0.0115;
  num.rotation.y = Math.PI;
  v.add(plate);
  // 脚踏
  strut(v, c.steel, [-0.27, 0.12, -0.29], [0.27, 0.12, -0.29], 0.02);
  strut(v, c.trim, BB, [0, 0.12, -0.29], 0.024);
  for (const s of [-1, 1]) box(v, c.dark, 0.08, 0.016, 0.06, s * 0.3, 0.12, -0.29);
}

// 雪地冲锋艇：一圈 U 形气囊、尖船头，船底两条滑橇，艇尾插一面小旗；气囊两侧印着字和箭头，外侧绑一支桨
function raft(v, c) {
  const T = c.trimColor;
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
    put(v, PRIM.cone, c.trim, s * 0.47, 0.2, 0.79, 0.17, 0.26, 0.17).rotation.x = HALF_PI;
    put(v, runner, c.steel, s * 0.3);
    const tag = sticker(v, 'raft.side', 0.5, 0.09, (d, W, L) => {
      rect(d, -W / 2, 0.005, W, 0.012, T);
      rect(d, -W / 2, L - 0.017, W, 0.012, T);
      text(d, 'SNOW RAID', 0, L / 2, 0.05, WHITE, { stroke: INK, strokeW: 0.2 });
    }, { px: 256, py: 64 });
    tag.position.set(s * 0.644, 0.2, -0.05);
    tag.rotation.y = s * HALF_PI;
  }
  // 绑在左侧气囊外面的一支桨
  strut(v, c.dark, [-0.66, 0.29, 0.5], [-0.66, 0.29, -0.4], 0.016);
  put(v, geo('raft.blade', () => plateGeo([[-0.05, 0], [0.05, 0], [0.06, 0.24], [0, 0.28], [-0.06, 0.24]], 0.012, false)), c.trim, -0.66, 0.29, -0.4).rotation.z = HALF_PI;
  // 坐垫、靠背气囊、船头的挡雪板和提手
  box(v, c.trim, 0.42, 0.07, 0.42, 0, 0.135, 0.16);
  strut(v, c.main, [-0.4, 0.27, 0.46], [0.4, 0.27, 0.46], 0.1);
  const dodger = put(v, geo('raft.dodger', () => plateGeo([[-0.3, 0.62], [0.3, 0.62], [0, 1.04]], 0.02, false)), c.trim, 0, 0.28, 0);
  dodger.rotation.x = 0.2;
  put(v, geo('raft.handle', () => new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI)), c.dark, 0, 0.5, -1.13);
  // 小旗
  strut(v, c.steel, [0.3, 0.36, 0.64], [0.3, 0.98, 0.7], 0.012);
  c.fx.flags.push(put(v, geo('raft.flag', () => plateGeo([[0, 0], [0, 0.16], [-0.3, 0.08]], 0.012, true)), c.trim, 0.3, 0.8, 0.69));
}

// 雪怪摩托：后面一条履带、前面两块转向雪板，流线机罩、风挡、车灯、双排气；车身两侧贴号码和火焰，车尾一副货架
function mobile(v, c) {
  const T = c.trimColor;
  // 履带和负重轮
  put(v, geo('mobile.track', () => new THREE.CapsuleGeometry(0.115, 0.72, 4, 12).rotateX(HALF_PI)), c.rubber, 0, 0.115, 0.42, 1.45, 1, 1);
  for (const z of [0.08, 0.42, 0.76]) strut(v, c.steel, [-0.19, 0.085, z], [0.19, 0.085, z], 0.06);
  const lugs = [];
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) lugs.push([s * 0.168, 0.006, 0.06 + i * 0.09]);
  put(v, geo('mobile.lugs', () => studsGeo(lugs, 0.018, 'x', 0.012)), c.black);
  box(v, c.main, 0.38, 0.14, 0.9, 0, 0.3, 0.45);
  for (const s of [-1, 1]) {
    const tag = sticker(v, 'mobile.side', 0.8, 0.13, (d, W, L) => {
      for (let i = 0; i < 4; i++) poly(d, [[-W / 2 + i * 0.05, L], [-W / 2 + 0.24 + i * 0.06, L * (0.25 + i * 0.12)], [-W / 2 + 0.3 + i * 0.06, L * (0.35 + i * 0.12)], [-W / 2 + 0.06 + i * 0.05, L]], i % 2 ? 0xffd23c : T);
      circle(d, 0.18, L / 2, 0.055, WHITE);
      text(d, '99', 0.18, L / 2 + 0.004, 0.065, INK, { squash: 0.85 });
      text(d, 'YETI', 0.31, L / 2, 0.04, INK, { a: 0.85 });
    }, { px: 256, py: 64 });
    tag.position.set(s * 0.192, 0.3, 0.45);
    tag.rotation.y = s * HALF_PI;
  }
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
  put(v, geo('mobile.rack', () => pipeGeo([[-0.15, 0.55, 0.76], [-0.16, 0.6, 0.86], [-0.12, 0.6, 0.96], [0.12, 0.6, 0.96], [0.16, 0.6, 0.86], [0.15, 0.55, 0.76]], 0.012, 24, 6)), c.steel);
  box(v, c.trim, 0.34, 0.18, 0.02, 0, 0.17, 0.98).rotation.x = -0.3;
  // 两腿之间的油箱
  const tank = [
    { z: -0.02, y: 0.37, w: 0.13, th: 0.26 },
    { z: -0.3, y: 0.38, w: 0.13, th: 0.3 },
    { z: -0.58, y: 0.42, w: 0.26, th: 0.36 },
  ];
  put(v, geo('mobile.tank', () => loftGeo(tank)), c.main);
  put(v, PRIM.cyl, c.chrome, 0, 0.6, -0.25, 0.03, 0.02, 0.03);
  // 车头：深色底壳托着流线形机罩，机罩一直接到仪表台；中间一道装饰条，顶上两个进气口，前脸一排格栅
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
  for (let i = 0; i < 4; i++) box(v, c.chrome, 0.2, 0.006, 0.006, 0, 0.283 + i * 0.012, -1.422);
  for (const s of [-1, 1]) box(v, c.dark, 0.06, 0.035, 0.18, s * 0.2, 0.552, -0.86);
  // 风挡、仪表台、车把
  const shield = soft(put(v, geo('mobile.shield', () => new THREE.CylinderGeometry(0.27, 0.33, 0.36, 14, 1, true, Math.PI - 1, 2)), c.glass, 0, 0.73, -0.42));
  shield.rotation.x = 0.3;
  box(v, c.dark, 0.34, 0.07, 0.14, 0, 0.6, -0.58);
  for (const s of [-1, 1]) put(v, PRIM.cyl, c.lit, s * 0.07, 0.637, -0.6, 0.035, 0.008, 0.035);
  strut(v, c.steel, [0, 0.56, -0.6], [0, 0.775, -0.5], 0.025);
  put(v, geo('mobile.bar', () => pipeGeo([[-0.39, 0.745, -0.385], [-0.22, 0.775, -0.47], [0, 0.78, -0.5], [0.22, 0.775, -0.47], [0.39, 0.745, -0.385]], 0.022, 20, 8)), c.rubber);
  const ski = geo('mobile.ski', () => loftGeo(skiStations({ tail: -0.62, nose: -1.56, w: 0.14, waist: 0.12, noseKick: 0.16, noseLen: 0.25, n: 18, y: 0.02 })));
  const loop = geo('mobile.loop', () => new THREE.TorusGeometry(0.06, 0.012, 6, 10, Math.PI).rotateY(HALF_PI));
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
    rod(v, c.dark, 0.045, 0.04, s * 0.235, 0.3, 0.93);
    flame(v, c.fx, s * 0.235, 0.3, 0.95, 0.035, 0.36);
  }
}

// 星环飞碟：离地悬浮的碟身，碟沿一圈光环，顶上印着分件缝和舷窗，底下一圈会转的灯，后面两片尾翼
function ufo(v, c) {
  const T = c.trimColor;
  const u = new THREE.Group();
  u.position.z = 0.05;
  v.add(u);
  const hull = [[0, 0.18], [0.35, 0.19], [0.68, 0.26], [0.9, 0.33], [0.98, 0.375], [0.95, 0.4], [0.72, 0.41], [0.46, 0.43], [0.4, 0.43], [0.36, 0.41], [0.3, 0.4], [0, 0.4]];
  put(u, geo('ufo', () => lathe(hull, 44)), c.main);
  latheSkin(u, 'ufo.top', [[0.95, 0.402], [0.72, 0.412], [0.46, 0.432]], 6, (d, W, L) => {
    line(d, [[-W / 2, 0], [-W / 2, L]], INK, 0.008, 0.5);
    line(d, [[-W / 2, L * 0.45], [W / 2, L * 0.45]], INK, 0.006, 0.4);
    for (let i = 0; i < 3; i++) {
      round(d, -0.12 + i * 0.1, L * 0.62, 0.06, 0.035, 0.012);
      d.fillStyle = css(0x9ff0ff, 0.95);
      d.fill();
    }
    text(d, 'STAR RING', 0.06, L * 0.22, 0.05, INK, { a: 0.7 });
    dotRow(d, [[-W / 2 + 0.03, L * 0.15], [-W / 2 + 0.03, L * 0.8]], 0.008, INK, 0.6);
  });
  put(u, geo('ufo.rim', () => new THREE.TorusGeometry(0.97, 0.035, 8, 48).rotateX(HALF_PI)), c.lit, 0, 0.378, 0);
  put(u, geo('ufo.band', () => lathe([[0.7, 0.4155], [0.55, 0.427]], 44)), c.trim);
  put(u, geo('ufo.belly', () => lathe([[0, 0.07], [0.2, 0.09], [0.36, 0.15], [0.45, 0.215]], 32)), c.m(0x4a5263));
  put(u, geo('ufo.vents', () => ringOf(new THREE.BoxGeometry(0.03, 0.02, 0.12), 8, 0.55)), c.black, 0, 0.22, 0);
  ball(u, c.lit, 0.15, 0.045, 0.15, 0, 0.075, 0);
  // 碟底的灯圈：两种颜色交替，整圈慢慢转
  const lights = new THREE.Group();
  lights.userData.spin = 1.4;
  put(lights, geo('ufo.lamp0', () => ringOf(new THREE.SphereGeometry(0.045, 8, 6), 6, 0.84)), c.lit, 0, 0.305, 0);
  put(lights, geo('ufo.lamp1', () => ringOf(new THREE.SphereGeometry(0.045, 8, 6), 6, 0.84, Math.PI / 6)), c.white, 0, 0.305, 0);
  u.add(lights);
  c.fx.spin.push(lights);
  // 座舱：一圈软包、靠背、前面的风挡和操纵杆
  put(u, geo('ufo.coaming', () => new THREE.TorusGeometry(0.4, 0.028, 8, 32).rotateX(HALF_PI)), c.rubber, 0, 0.435, 0);
  put(u, geo('ufo.back', () => new THREE.TorusGeometry(0.37, 0.055, 8, 16, Math.PI * 0.9).rotateZ(Math.PI * 0.05).rotateX(HALF_PI)), c.trim, 0, 0.53, 0);
  soft(put(u, geo('ufo.shield', () => new THREE.CylinderGeometry(0.7, 0.76, 0.16, 20, 1, true, Math.PI - 0.8, 1.6)), c.glass, 0, 0.49, 0));
  strut(u, c.steel, [0, 0.4, -0.32], [0, 0.62, -0.36], 0.016);
  ball(u, c.lit, 0.035, 0.035, 0.035, 0, 0.64, -0.36);
  // 尾翼、天线、推进器
  const fin = geo('ufo.fin', () => plateGeo([[0, 0], [-0.3, 0], [-0.42, 0.3], [-0.3, 0.3]], 0.03, true));
  for (const s of [-1, 1]) {
    put(u, fin, c.trim, s * 0.5, 0.4, 0.3).rotation.z = -s * 0.35;
    rod(u, c.steel, 0.05, 0.2, s * 0.22, 0.33, 0.9);
    rod(u, c.dark, 0.056, 0.03, s * 0.22, 0.33, 0.83);
    flame(u, c.fx, s * 0.22, 0.33, 1.0, 0.04, 0.35);
  }
  strut(u, c.steel, [0, 0.42, 0.66], [0, 0.86, 0.74], 0.012);
  ball(u, c.lit, 0.04, 0.04, 0.04, 0, 0.88, 0.745);
  // 照在雪面上的光
  const disc = geo('disc', () => new THREE.CircleGeometry(1, 28).rotateX(-HALF_PI));
  soft(put(u, disc, glowMat(T, 0.26), 0, 0.012, 0, 0.6));
  soft(put(u, disc, glowMat(T, 0.3), 0, 0.014, 0, 0.26));
}

export const RIDES = {
  wood: { build: woodSled },
  sled: { build: sled, sitDrop: 0.45, legBase: 1.45 },
  steel: { build: steelSled },
  dragon: { build: dragon },
  toboggan: { build: toboggan, sitDrop: 0.49, legBase: 1.5 },
  bike: { build: bike, sitDrop: 0.06, legBase: 0.6, grip: 0.28 },
  mobile: { build: mobile, sitDrop: 0.14, legBase: 0.75, grip: 0.34 },
  cushion: { build: cushion, sitDrop: 0.5, legBase: 1.5 },
  tube: { build: tube },
  ring: { build: ringTube },
  titan: { build: titan },
  saucer: { build: saucer, sitDrop: 0.48, legBase: 1.55 },
  raft: { build: raft, sitDrop: 0.45, legBase: 1.5 },
  ufo: { build: ufo, sitDrop: 0.21, legBase: 1.6, bob: 0.025 },
};
