// 赛道：程序化高度场 + 岔路近道 + 特殊坡地 + 地形网格 + 树木/岩石/远山 + 障碍查询
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth, mulberry32, makeNoise, pickWeighted } from './util.js';
import { mesh } from './skier.js';
import { buildLandmarks, buildPads } from './landmarks.js';

const STEP = 2;
const D0 = -140;
const CHUNK = 300;
const BUCKET = 16;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// 岔路：主路向一侧绕一个大弯，近道留在原线上，但入口是一段要靠漂移才过得去的之字形窄道
const BR_LEN = 420; // 岔路区沿下坡方向的长度
const BR_AMP = 135; // 主路绕行的横向幅度
const BR_RAMP = 155; // 主路横移出去 / 回来各占的长度
const BR_GATE = 14; // 近道入口在岔路区起点之后多远
const Z_HW = 4.0; // 之字入口半宽
const Z_R = 6.5; // 之字急弯的中线半径
const Z_A1 = 60; // 第一段与下坡方向的夹角（度）
const Z_A2 = 56; // 第二段（反向）的夹角
const CHUTE_HW = 7; // 冰道半宽
const WALL_R = 2.3; // 石墙石块尺寸

// 地形网格：默认每 ROW_STEP 米一行；跳台口、断崖这些起伏很急的地方另外加密，画面才跟得上实际滑行面
const ROW_STEP = 3;
const ROW_D0 = -116;
const TERRAIN_CHUNK_ROWS = 60; // 地形按这么多行切成一段，镜头外的段不画
const ROCK_HULL = 1.25; // 岩石模型最远的顶点离中心有多远（相对缩放尺寸）
const TREE_SINK = 3; // 树干往地下多伸的长度：陡坡上靠下坡的一侧才不会露出悬空的树根
const TREE_LOD_NEAR = 300; // 整段树都比这个距离远时换成低模
// 起点 / 终点拱门的半径。拱门模型在 main.js 的 buildWorld 里创建，这里要和那边保持一致
const ARCH_START_R = 14;
const ARCH_FINISH_R = 12.5;
// 每种坡地 [坡前占用, 坡后占用] 的长度
const FEATURE_SPEC = { jump: [40, 70], big: [50, 125], drop: [62, 105], rollers: [15, 125] };

// 0..1 的斜坡，两头各 25% 缓入缓出；最大斜率是平均斜率的 1.33 倍
function ramp(q) {
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  const e = 0.25;
  if (q < e) return (q * q) / (2 * e * (1 - e));
  if (q > 1 - e) return 1 - ((1 - q) * (1 - q)) / (2 * e * (1 - e));
  return (q - e / 2) / (1 - e);
}

// 点 (x,d) 到线段 a-b 的距离，减去该处走廊半宽
function segU(a, b, x, d) {
  const ex = b.x - a.x;
  const ed = b.d - a.d;
  let t = ((x - a.x) * ex + (d - a.d) * ed) / (ex * ex + ed * ed);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + ex * t - x;
  const pd = a.d + ed * t - d;
  return Math.sqrt(px * px + pd * pd) - (a.hw + (b.hw - a.hw) * t);
}

function paint(geo, color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv');
  return geo;
}

// low = 远处用的低模：棱数更少，其余外形不变
function makeTreeGeo(theme, tall, low = false) {
  const trunkC = new THREE.Color(theme.trunk);
  const g1 = new THREE.Color(theme.tree);
  const g2 = new THREE.Color(theme.tree2);
  const snow = new THREE.Color(theme.snow);
  const parts = [];
  const seg = low ? 5 : 7;
  const trunkH = tall ? 7 : 3.2;
  // 树干从地下 TREE_SINK 一直到 trunkH；底部加粗一点，让地面处的粗细和原来一样（0.36）。两头都埋着，不用封口
  const full = trunkH + TREE_SINK;
  const rBottom = (0.36 - (0.2 * TREE_SINK) / full) / (trunkH / full);
  const trunk = new THREE.CylinderGeometry(0.2, rBottom, full, low ? 4 : 6, 1, true);
  trunk.translate(0, (trunkH - TREE_SINK) / 2, 0);
  parts.push(paint(trunk, trunkC));
  const tiers = tall ? 3 : 4;
  const baseY = tall ? 5.2 : 2.0;
  for (let k = 0; k < tiers; k++) {
    const r = (tall ? 2.2 : 2.7) - k * 0.55;
    const h = 3.1;
    const y = baseY + k * 1.9;
    const cone = new THREE.ConeGeometry(r, h, seg);
    cone.rotateY(k * 0.5);
    cone.translate(0, y + h / 2, 0);
    parts.push(paint(cone, k % 2 ? g2 : g1));
    const hs = h * 0.6;
    const sc = new THREE.ConeGeometry(r * 0.7, hs, seg, 1, low);
    sc.rotateY(k * 0.5);
    sc.translate(0, y + h - hs / 2 + 0.06, 0);
    parts.push(paint(sc, snow));
  }
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return geo;
}

function makeRockGeo(rng, theme) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let f = map.get(key);
    if (f === undefined) {
      f = 0.7 + rng() * 0.55;
      map.set(key, f);
    }
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.85, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const rock = new THREE.Color(theme.rock);
  const rock2 = new THREE.Color(theme.rock2);
  const snow = new THREE.Color(theme.snow);
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const ny = nor.getY(i);
    if (ny > 0.55) tmp.copy(snow);
    else tmp.copy(rock).lerp(rock2, rng() * 0.9);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = tmp.r;
      col[(i + k) * 3 + 1] = tmp.g;
      col[(i + k) * 3 + 2] = tmp.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

export class Course {
  // def：固定赛道的设计（见 tracks.js），null 表示完全随机生成
  constructor({ seed, length, theme, itemRate = 1, def = null }) {
    this.seed = seed;
    this.L = length;
    this.theme = theme;
    this.def = def;
    this.D1 = length + 420;
    const rng = (this.rng = mulberry32(seed));
    this.noise = makeNoise(seed);
    this.p = [];
    for (let i = 0; i < 10; i++) this.p.push(rng() * Math.PI * 2);

    // offTrack() 的附带结果：到主路边缘的距离、到近道边缘的距离、所属岔路
    this._um = 0;
    this._us = 1e9;
    this._br = null;

    // 岔路近道 + 特殊坡地（跳台 / 大跳台 / 断崖 / 波浪坡）
    this.branches = [];
    this.jumps = [];
    this.drops = [];
    this.rollers = [];
    this.features = [];
    // 地标、地表区、加速带、移动障碍、雪崩。用单独的随机数，原有的地形布局不受影响
    this.xrng = mulberry32((seed ^ 0x5bd1e995) | 0);
    this.busy = []; // 已占用的区段 { d0, d1, solid }：solid 的地方不放跳台、也不在道内放树和石头
    this.landmarks = [];
    this.zones = []; // 冰面 / 深雪 { type, d0, d1, side, lake }
    this.pads = []; // 加速带 { x, z, d, w, len }
    this.movers = []; // 雪地摩托 / 滚石 { type, d, period, phase }
    this.avalanches = []; // 雪崩区 { d0, d1 }
    this.exclusions = []; // 不许长树、放石头的圆 { x, z, r }
    this.bands = []; // 不许长树的带状区（隧道两侧）{ d0, d1, u }
    this.anims = []; // 每帧动画（缆车等）
    this.planBranches();
    this.planLandmarks();
    this.planFeatures();

    // 海拔表（坡度积分）
    const n = Math.ceil((this.D1 - D0) / STEP) + 2;
    this.elevTab = new Float32Array(n);
    let e = 0;
    for (let i = 0; i < n; i++) {
      this.elevTab[i] = e;
      e -= this.slope(D0 + i * STEP) * STEP;
    }
    this.planExtras();

    // 道具点
    this.itemSpots = [];
    this.itemRows = [];
    const gap = [300, 190, 135, 95][itemRate] ?? 190;
    let id = 150;
    while (id < length - 140) {
      // 起跳后的滞空段里人在天上，道具放这儿够不着：挪到落地点之后
      const landed = this.airZoneEnd(id);
      if (landed > id) {
        id = landed;
        continue;
      }
      const pile = this.busy.find((r) => r.noItems && id > r.d0 - 4 && id < r.d1 + 4);
      if (pile) {
        id = pile.d1 + 5;
        continue;
      }
      const w = this.halfWidth(id);
      const cnt = w > 26 ? 5 : w > 19 ? 4 : 3;
      const c = this.cx(id);
      this.itemRows.push(id);
      for (let k = 0; k < cnt; k++) {
        const off = (k / (cnt - 1) - 0.5) * 2 * w * 0.72;
        const x = c + off;
        const z = -id;
        this.itemSpots.push({ x, z, y: this.height(x, z) + 1.25 });
      }
      id += gap * (0.85 + rng() * 0.3);
    }

    // 野鹿出没点
    this.deerSpots = [];
    let dd = 380 + rng() * 150;
    while (dd < length - 300) {
      const side = rng() < 0.5 ? -1 : 1;
      if (!this.branches.some((b) => dd > b.d0 - 40 && dd < b.d1 + 40) && !this.busy.some((r) => dd > r.d0 - 30 && dd < r.d1 + 30)) {
        this.deerSpots.push({ d: dd, side });
      }
      dd += 380 + rng() * 280;
    }

    this.obstacles = new Map();
    this.group = new THREE.Group();
    this.build();
  }

  // ---------- 岔路近道 ----------
  planBranches() {
    const rng = this.rng;
    const L = this.L;
    const n = this.def && this.def.branches !== undefined ? this.def.branches : L < 2300 ? 1 : L < 3600 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const center = (L * (i + 1)) / (n + 1) + (rng() - 0.5) * 100;
      // 让入口落在基准线比较直的位置，入口难度才稳定
      let d0 = center - BR_LEN / 2;
      let bestS = 1e9;
      for (let k = -8; k <= 8; k++) {
        const c = center - BR_LEN / 2 + k * 12;
        const sl = Math.abs(this.meanderSlope(c + BR_GATE)) + Math.abs(k) * 0.004;
        if (sl < bestS) {
          bestS = sl;
          d0 = c;
        }
      }
      d0 = clamp(d0, 330, L - 400 - BR_LEN);
      const b = { d0, d1: d0 + BR_LEN, len: BR_LEN, side: 1, sg: -1, A: BR_AMP };
      this.branches.push(b);
      // 两个绕行方向都试一遍：选近道省得更多的一侧，但主路不能弯得太离谱
      const first = rng() < 0.5 ? 1 : -1;
      const trial = (side) => {
        b.side = side;
        b.sg = -side;
        this.buildShortcut(b);
        let steep = 0;
        for (let d = b.d0; d < b.d1; d += 4) steep = Math.max(steep, Math.abs(this.cx(d + 2) - this.cx(d - 2)) / 4);
        return b.saved - (steep > 1.5 ? 1000 : 0);
      };
      // 基准线自己的弯会抵消一部分绕行；省得太少就把绕行幅度加大一档
      const pick = (A) => {
        b.A = A;
        const sa = trial(first);
        const sb = trial(-first);
        if (sa >= sb) trial(first);
        return Math.max(sa, sb);
      };
      let A = BR_AMP;
      let score = pick(A);
      while (score < 80 && A < BR_AMP + 50) {
        const next = pick(A + 25);
        if (next <= score) {
          pick(A); // 没变好（多半是主路弯得太狠被罚分）：退回
          break;
        }
        A += 25;
        score = next;
      }
    }
  }

  // 生成近道中线：入口之字（两个急弯）+ 沿基准线下行的冰道，最后并回主路
  buildShortcut(b) {
    const sg = b.sg; // 近道所在的一侧
    const dG = b.d0 + BR_GATE;
    const xG = this.cx(dG) + sg * (this.halfWidth(dG) - 2.5);
    const phi1 = sg * Z_A1 * DEG;
    const phi2 = -sg * Z_A2 * DEG;
    const lead = 6;
    let phi = phi1;
    let x = xG - Math.sin(phi1) * lead;
    let d = dG - Math.cos(phi1) * lead;
    let s = 0;
    let phase = 0;
    let straight = 0;
    let yc = 0;
    let zEndS = 0;
    const dEnd = b.d0 + 0.97 * b.len;
    const pts = [];
    while (d < dEnd && pts.length < 3000) {
      pts.push({ x, d, z: -d, s, hw: Z_HW, phi });
      let want;
      let rate;
      if (phase === 0) {
        want = phi1;
        rate = 1;
        if (s >= lead + 22) phase = 1;
      } else if (phase === 1) {
        want = phi2;
        rate = 1 / Z_R;
        if (Math.abs(phi - phi2) < 0.01 && ++straight >= 12) {
          phase = 2;
          yc = sg * (x - this.meander(d));
          zEndS = s;
        }
      } else {
        const y = sg * (x - this.meander(d));
        const yT = yc - 22 * smooth(b.d0 + 0.72 * b.len, b.d0 + 0.95 * b.len, d);
        want = Math.atan(this.meanderSlope(d) + sg * clamp((yT - y) / 20, -0.6, 0.6));
        rate = s - zEndS < 26 ? 1 / 11 : 1 / 45;
      }
      phi += clamp(want - phi, -rate, rate);
      x += Math.sin(phi);
      d += Math.cos(phi);
      s += 1;
    }
    let yMax = 0;
    for (const p of pts) {
      if (p.s > zEndS) p.hw = lerp(Z_HW, CHUTE_HW, smooth(zEndS, zEndS + 30, p.s));
      yMax = Math.max(yMax, sg * (p.x - this.meander(p.d)));
    }
    b.pts = pts;
    b.dA = pts[0].d;
    b.dB = pts[pts.length - 1].d;
    b.hwMax = CHUTE_HW;
    b.yMax = yMax;
    b.zEndS = zEndS;
    b.gate = { x: xG, d: dG, phi: phi1 };
    // 按 d 建索引（中线对 d 单调）
    const idx = new Int32Array(Math.ceil(b.dB - b.dA) + 2);
    let k = 0;
    for (let i = 0; i < idx.length; i++) {
      while (k < pts.length - 1 && pts[k].d < b.dA + i) k++;
      idx[i] = k;
    }
    b.idx = idx;
    b.dIce = pts[Math.min(pts.length - 1, zEndS + 8)].d;

    // 给机器人用的进场线：从主路中部画一条弧接到入口
    const phiM = Math.atan((this.cx(dG - 20) - this.cx(dG - 40)) / 20);
    const app = [];
    let ax = pts[0].x;
    let ad = pts[0].d;
    let aphi = phi1;
    let run = 0;
    for (let i = 0; i < 90; i++) {
      ax -= Math.sin(aphi);
      ad -= Math.cos(aphi);
      aphi += clamp(phiM - aphi, -1 / 17, 1 / 17);
      app.push({ x: ax, d: ad, z: -ad });
      if (Math.abs(aphi - phiM) < 1e-3 && ++run > 24) break;
    }
    app.reverse();
    b.path = app.concat(pts);
    b.gateI = app.length;

    // 统计：从入口到并回主路，近道比主路短多少
    let mainLen = 0;
    for (let q = dG; q < b.dB; q += 2) mainLen += Math.hypot(this.cx(q + 2) - this.cx(q), 2);
    b.saved = mainLen - (pts.length - lead);
  }

  // (x,d) 到某条近道走廊边缘的距离，负数表示在走廊里
  shortU(b, x, d) {
    const pts = b.pts;
    const n = pts.length;
    const i0 = b.idx[clamp(Math.floor(d - b.dA), 0, b.idx.length - 1)];
    const hm = b.hwMax;
    let best = 1e9;
    for (let i = i0; i < n - 1; i++) {
      if (pts[i].d - d > best + hm) break;
      const v = segU(pts[i], pts[i + 1], x, d);
      if (v < best) best = v;
    }
    for (let i = i0 - 1; i >= 0; i--) {
      if (d - pts[i + 1].d > best + hm) break;
      const v = segU(pts[i], pts[i + 1], x, d);
      if (v < best) best = v;
    }
    return best;
  }

  // 到最近一条可滑行走廊（主路或近道）边缘的距离：<=0 在道内，>0 在道外
  // 同时写入 _um（主路）、_us（近道）、_br（所在岔路）
  offTrack(x, d, um) {
    let u = um === undefined ? Math.abs(x - this.cx(d)) - this.halfWidth(d) : um;
    this._um = u;
    this._us = 1e9;
    this._br = null;
    if (u > -4) {
      const B = this.branches;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (d < b.dA - 50 || d > b.dB + 50) continue;
        const us = this.shortU(b, x, d);
        this._us = us;
        this._br = b;
        if (us < u) u += (us - u) * smooth(b.dA - 50, b.dA - 8, d) * (1 - smooth(b.dB + 8, b.dB + 50, d));
        break;
      }
    }
    return u;
  }

  // 近道里的冰面：阻力更小
  iceAt(x, d) {
    this.offTrack(x, d);
    return this._us < 0 && this._um > 0.5 && d > this._br.dIce;
  }

  // 复位点：离近道更近就放回近道中线，否则放回主路中央
  respawnPoint(x, d) {
    this.offTrack(x, d);
    const b = this._br;
    if (b && this._us < this._um && d > b.dA && d < b.dB) {
      const p = b.pts[b.idx[clamp(Math.floor(d - b.dA), 0, b.idx.length - 1)]];
      return { x: p.x, d: p.d, yaw: -p.phi };
    }
    return { x: this.cx(d), d, yaw: Math.atan2(-(this.cx(d + 6) - this.cx(d - 6)) / 12, 1) };
  }

  // ---------- 特殊坡地 ----------
  planFeatures() {
    const rng = this.rng;
    const L = this.L;
    const SPEC = FEATURE_SPEC;
    if (this.def && this.def.features) {
      // 手工赛道：按设计的位置放，撞上岔路 / 地标就顺延
      let minD = 250;
      for (const f of this.def.features.slice().sort((a, b) => a.at - b.at)) {
        const [pre, post] = SPEC[f.type];
        let d = Math.max(f.at * L, minD);
        for (let g = 0; g < 20; g++) {
          const e = this.blockedUntil(d - pre, d + post);
          if (!e) break;
          d = e + pre + 5;
        }
        if (d < 250 || d + post > L - 250) continue;
        this.addFeature(f.type, d, rng);
        minD = d + post + 80;
      }
      return;
    }
    let d = 250 + rng() * 80;
    let last = '';
    for (let guard = 0; guard < 200 && d < L - 360; guard++) {
      const kind = pickWeighted(rng, [
        ['jump', last === 'jump' ? 1 : 3],
        ['big', last === 'big' ? 0 : 2.4],
        ['drop', last === 'drop' ? 0 : 2.2],
        ['rollers', last === 'rollers' ? 0 : 1.6],
      ]);
      const [pre, post] = SPEC[kind];
      const e = this.blockedUntil(d - pre, d + post);
      if (e) {
        d = e + pre + rng() * 40;
        continue;
      }
      if (d + post > L - 250) break;
      this.addFeature(kind, d, rng);
      last = kind;
      d += post + 110 + rng() * 110;
    }
  }

  addFeature(kind, d, rng) {
    const [pre, post] = FEATURE_SPEC[kind];
    if (kind === 'jump') this.jumps.push({ d, len: 15 + rng() * 6, h: 3.4 + rng() * 1.8, big: false });
    else if (kind === 'big') this.jumps.push({ d, len: 24, h: 7.6 + rng() * 1.2, big: true });
    else if (kind === 'drop') this.drops.push({ d, len: 7, h: 10 + rng() * 3 });
    else this.rollers.push({ d, len: 108, amp: 1.9, period: 18 });
    this.features.push({ type: kind, d, pre, post });
  }

  // [a, b] 段如果压到岔路区或实心地标，返回挡路那一段之后可以重新开始的位置；不挡返回 0
  blockedUntil(a, b) {
    for (const br of this.branches) if (b > br.d0 - 30 && a < br.d1 + 25) return br.d1 + 25;
    for (const r of this.busy) if (r.solid && b > r.d0 - 10 && a < r.d1 + 10) return r.d1 + 10;
    return 0;
  }

  // 从 d 附近找一段长 len 的空位：不压岔路区、不压已有地标。
  // feat：整段避开坡地；lip：只避开跳台口和滞空段
  // loose：只避开实心地标和近道入口（雪崩这种长区段用，可以和近道、缆车重叠）
  freeSpot(d, len, { feat = false, lip = false, margin = 20, loose = false } = {}) {
    const L = this.L;
    const ok = (a) => {
      const b = a + len;
      if (a < 220 || b > L - 260) return false;
      if (loose) {
        for (const br of this.branches) if (b > br.d0 - 30 && a < br.d0 + 60) return false;
        for (const r of this.busy) if ((r.solid || r.aval) && b > r.d0 - margin && a < r.d1 + margin) return false;
        return true;
      }
      for (const br of this.branches) if (b > br.d0 - 45 && a < br.d1 + 45) return false;
      for (const r of this.busy) if (b > r.d0 - margin && a < r.d1 + margin) return false;
      if (feat) for (const f of this.features) if (b > f.d - f.pre - 10 && a < f.d + f.post + 10) return false;
      if (lip) for (const f of this.features) if (b > f.d - 12 && a < f.d + (f.type === 'rollers' ? 112 : f.post * 0.6)) return false;
      return true;
    };
    for (let k = 0; k <= 80; k++) {
      if (ok(d + k * 12)) return d + k * 12;
      if (k && ok(d - k * 12)) return d - k * 12;
    }
    return null;
  }

  // 赛道在 d 处的朝向（绕 y 轴）
  headingAt(d) {
    return Math.atan2(-(this.cx(d + 3) - this.cx(d - 3)) / 6, 1);
  }

  // ---------- 地标 ----------
  planLandmarks() {
    const def = this.def;
    const L = this.L;
    const rng = this.xrng;
    let list;
    if (def) list = (def.landmarks || []).map((l) => ({ ...l, d: l.at * L }));
    else {
      list = [];
      if (rng() < 0.55) list.push({ type: ['village', 'lift', 'lumber', 'lift'][Math.floor(rng() * 4)], d: L * (0.2 + rng() * 0.55) });
    }
    for (const lm of list) this.placeLandmark(lm, rng);
    const av = def ? def.avalanche || [] : [];
    for (const a of av) {
      const d0 = this.freeSpot(a.at * L, a.len, { loose: true });
      if (d0 === null) continue;
      this.avalanches.push({ d0, d1: d0 + a.len });
      this.busy.push({ d0, d1: d0 + a.len, solid: false, aval: true });
    }
    // 手工赛道的移动障碍先占位（实心），后面随机放的坡地会让开
    if (def) for (const mv of def.movers || []) this.addMover(mv, rng, true);
  }

  addMover(mv, rng, reserve) {
    const d0 = this.freeSpot(mv.at * this.L, 30, { feat: true, margin: 15 });
    if (d0 === null) return;
    this.movers.push({ type: mv.type, d: d0 + 15, period: mv.type === 'boulder' ? 7 + rng() * 2 : 9 + rng() * 3, phase: rng(), dir: rng() < 0.5 ? -1 : 1 });
    this.busy.push({ d0, d1: d0 + 30, solid: !!reserve });
  }

  placeLandmark(lm, rng) {
    const LEN = { village: 170, lift: 24, lumber: 150, tunnel: lm.variant === 'mine' ? 150 : 130, icelake: 240 };
    const len = LEN[lm.type];
    if (!len) return;
    const d0 = this.freeSpot(lm.d, len);
    if (d0 === null) return;
    const d1 = d0 + len;
    const m = { type: lm.type, variant: lm.variant || '', d0, d1, items: [] };
    const solid = (a, b) => this.busy.push({ d0: a, d1: b, solid: true });
    const side = rng() < 0.5 ? -1 : 1;
    const at = (d, s, u) => ({ x: this.cx(d) + s * (this.halfWidth(d) + u), z: -d, d });
    if (lm.type === 'village') {
      solid(d0 - 4, d0 + 16);
      m.gateD = d0 + 6;
      m.name = ['雪松村', '白桦村', '小熊镇', '松果村', '暖炉村'][Math.floor(rng() * 5)];
      for (let k = 0; k < 7; k++) {
        const d = d0 + 26 + k * 20 + rng() * 6;
        const s = k % 2 ? side : -side;
        const c = { kind: 'cabin', ...at(d, s, 8 + rng() * 9), side: s, w: 5.5 + rng() * 2, dep: 4.6 + rng() * 1.4, h: 3.1 + rng() * 0.9, color: Math.floor(rng() * 4) };
        m.items.push(c);
        this.exclusions.push({ x: c.x, z: c.z, r: Math.max(c.w, c.dep) * 0.75 + 2 });
        if (rng() < 0.45) {
          const sm = { kind: 'snowman', ...at(d + 6, s, 3 + rng() * 2), side: s };
          m.items.push(sm);
          this.exclusions.push({ x: sm.x, z: sm.z, r: 2 });
        }
      }
      this.bands.push({ d0: d0 + 15, d1, u: 5 });
    } else if (lm.type === 'lift') {
      m.d = d0 + 12;
      this.bands.push({ d0: d0 - 4, d1: d1 + 4, u: 80 });
    } else if (lm.type === 'lumber') {
      m.side = side;
      for (let k = 0; k < 6; k++) {
        const d = d0 + 8 + k * 25 + rng() * 6;
        const s = k % 2 ? side : -side;
        const p = { kind: 'pile', ...at(d, s, 2.5 + rng() * 6), side: s, rows: 2 + Math.floor(rng() * 2) };
        m.items.push(p);
        this.exclusions.push({ x: p.x, z: p.z, r: 4.5 });
      }
      // 道中间的木头堆：要绕开
      for (const [dd, f] of [[d0 + 48, 0.42], [d0 + 102, -0.42]]) {
        const p = { kind: 'pile', x: this.cx(dd) + f * side * this.halfWidth(dd), z: -dd, d: dd, side: 0, rows: 3, track: true };
        m.items.push(p);
        solid(dd - 14, dd + 14);
        this.busy[this.busy.length - 1].noItems = true;
      }
      const sh = { kind: 'shed', ...at(d0 + 76, -side, 12), side: -side };
      m.items.push(sh);
      this.exclusions.push({ x: sh.x, z: sh.z, r: 9 });
    } else if (lm.type === 'tunnel') {
      solid(d0 - 8, d1 + 8);
      this.bands.push({ d0: d0 - 10, d1: d1 + 10, u: 10 });
    } else if (lm.type === 'icelake') {
      this.zones.push({ type: 'ice', d0: d0 + 10, d1: d1 - 10, side: 0, lake: true });
      for (let k = 0; k < 4; k++) {
        const d = d0 + 35 + k * 52 + rng() * 10;
        const s = k % 2 ? side : -side;
        const h = { kind: 'hut', ...at(d, s, 9 + rng() * 6), side: s, color: Math.floor(rng() * 4) };
        m.items.push(h);
        this.exclusions.push({ x: h.x, z: h.z, r: 4 });
      }
      for (let k = 0; k < 16; k++) {
        const d = d0 + 12 + rng() * (len - 24);
        const c = { kind: 'crystal', ...at(d, rng() < 0.5 ? -1 : 1, 2 + rng() * 12), s: 0.8 + rng() * 1.4 };
        m.items.push(c);
      }
      this.bands.push({ d0, d1, u: 15 });
    }
    this.landmarks.push(m);
    this.busy.push({ d0, d1, solid: false });
  }

  // 地表区、加速带、移动障碍（坡地已经定好之后）
  planExtras() {
    const def = this.def;
    const L = this.L;
    const rng = this.xrng;
    const zones = def
      ? def.zones || []
      : [
          ...(rng() < 0.35 ? [{ type: 'ice', at: 0.2 + rng() * 0.6, len: 110 + rng() * 60 }] : []),
          ...(rng() < 0.35 ? [{ type: 'powder', at: 0.2 + rng() * 0.6, len: 130 + rng() * 60, side: rng() < 0.5 ? -1 : 1 }] : []),
        ];
    for (const z of zones) {
      const d0 = this.freeSpot(z.at * L, z.len, { lip: true, margin: 10 });
      if (d0 === null) continue;
      this.zones.push({ type: z.type, d0, d1: d0 + z.len, side: z.side | 0 });
      this.busy.push({ d0, d1: d0 + z.len, solid: false });
    }
    const nPad = 2 + Math.floor(rng() * 2);
    const pads = def ? def.pads || [] : Array.from({ length: nPad }, (_, i) => (i + 0.3 + rng() * 0.4) / nPad);
    for (const at of pads) {
      const d0 = this.freeSpot(Math.max(260, at * L), 8, { lip: true, margin: 8 });
      if (d0 === null) continue;
      const d = d0 + 4;
      const w = this.halfWidth(d);
      const lanes = w > 25 ? [-0.55, 0, 0.55] : [-0.35, 0.35];
      const j = (rng() - 0.5) * 0.2;
      for (const f of lanes) this.pads.push({ x: this.cx(d) + (f + j) * w, z: -d, d, w: 3.6, len: 7 });
      this.busy.push({ d0, d1: d0 + 8, solid: true });
    }
    this.pads.sort((a, b) => a.d - b.d);
    if (!def) {
      if (rng() < 0.45) this.addMover({ type: 'snowmobile', at: 0.2 + rng() * 0.6 }, rng, false);
      if (rng() < 0.3) this.addMover({ type: 'boulder', at: 0.2 + rng() * 0.6 }, rng, false);
    }
  }

  // 地表类型：0 普通雪 / 1 冰面（滑、难转向）/ 2 深雪（慢）
  surfaceKind(x, d) {
    const Z = this.zones;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      if (d < z.d0 || d > z.d1) continue;
      const off = x - this.cx(d);
      const w = this.halfWidth(d);
      if ((off < 0 ? -off : off) > w + (z.lake ? 8 : 0.5)) return 0;
      if (z.side && off * z.side < w * 0.05) return 0;
      return z.type === 'ice' ? 1 : 2;
    }
    return 0;
  }

  practicePowder(x, d) {
    const edge = this.halfWidth(d) * (0.55 + 0.045 * Math.sin(d * 0.026));
    const off = Math.abs(x - this.cx(d));
    return smooth(edge - 1, edge + 2.6, off) * smooth(20, 68, d);
  }

  // 压到加速带就返回那一块
  padAt(x, d) {
    const P = this.pads;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.d - d > 4) break;
      if (d - p.d > 4) continue;
      if (Math.abs(x - p.x) < p.w * 0.5 + 0.3) return p;
    }
    return null;
  }

  // 是否落在不许长树 / 放石头的地方
  excluded(x, z, pad = 0) {
    const E = this.exclusions;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      const dx = x - e.x;
      const dz = z - e.z;
      const r = e.r + pad;
      if (dx * dx + dz * dz < r * r) return true;
    }
    const d = -z;
    for (const b of this.bands) {
      if (d > b.d0 && d < b.d1 && Math.abs(x - this.cx(d)) - this.halfWidth(d) < b.u + pad) return true;
    }
    return false;
  }

  update(dt) {
    for (const f of this.anims) f(dt);
  }

  slope(d) {
    const p = this.p;
    let s = 0.3 + 0.1 * Math.sin(d * 0.0071 + p[0]) + 0.07 * Math.sin(d * 0.0173 + p[1]) + 0.035 * Math.sin(d * 0.041 + p[2]);
    if (this.def?.practice) s = 0.24 + 0.037 * Math.sin(d / 58) + 0.033 * Math.sin(d / 126);
    // 断崖：先放平成一段平台，再陡降
    const D = this.drops;
    for (let i = 0; i < D.length; i++) {
      const t = d - D[i].d;
      if (t > -46 && t < D[i].len) {
        if (t < 0) s *= 1 - 0.78 * smooth(-46, -26, t);
        else s = s * 0.22 + (D[i].h / D[i].len) * 1.5708 * Math.sin((Math.PI * t) / D[i].len);
      }
    }
    return s * smooth(-22, 28, d) * (1 - smooth(this.L + 12, this.L + 110, d));
  }

  elev(d) {
    const f = clamp((d - D0) / STEP, 0, this.elevTab.length - 1.001);
    const i = f | 0;
    const t = f - i;
    return this.elevTab[i] + (this.elevTab[i + 1] - this.elevTab[i]) * t;
  }

  // 基准线（不含岔路绕行）
  meander(d) {
    if (this.def?.practice) return 30 * Math.sin((d - 52) * TAU / 440) * smooth(52, 153, d);
    const p = this.p;
    const r = smooth(60, 300, d) * (1 - smooth(this.L - 300, this.L - 80, d));
    if (r <= 0) return 0;
    return r * (58 * Math.sin(d * 0.0041 + p[3]) + 20 * Math.sin(d * 0.0103 + p[4]));
  }

  meanderSlope(d) {
    return (this.meander(d + 1) - this.meander(d - 1)) * 0.5;
  }

  // 主路中线
  cx(d) {
    let x = this.meander(d);
    const B = this.branches;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      // 岔路区：主路横移出去，平行走一段，再横移回来
      if (d > b.d0 && d < b.d1) x += b.side * b.A * ramp((d - b.d0) / BR_RAMP) * ramp((b.d1 - d) / BR_RAMP);
    }
    return x;
  }

  halfWidth(d) {
    const p = this.p;
    let w = 27 + 8 * Math.sin(d * 0.0063 + p[5]) + 4 * Math.sin(d * 0.019 + p[6]);
    if (this.def?.practice) w = 20 + 1.5 * Math.sin(d / 120);
    w = lerp(22, w, smooth(-20, 140, d));
    w = lerp(w, 13, smooth(this.L - 170, this.L - 50, d));
    w = lerp(w, 30, smooth(this.L + 8, this.L + 70, d));
    return w;
  }

  height(x, z) {
    const d = -z;
    const c = this.cx(d);
    const w = this.halfWidth(d);
    const off = x - c;
    const a = off < 0 ? -off : off;
    const um = a - w;
    const u = this.offTrack(x, d, um);
    const n = this.noise;
    let h = this.elev(d);
    let amp = smooth(0, 130, d) * (1 - 0.75 * smooth(this.L - 90, this.L, d));
    // 近道里把起伏压平一些，窄道里不至于被颠飞
    if (this._us < 2) amp *= 1 - 0.7 * (1 - smooth(-1.5, 2, this._us)) * smooth(-4, 0, um);
    h += ((n(x * 0.03, z * 0.03) - 0.5) * 2.6 + (n(x * 0.09 + 5, z * 0.09) - 0.5) * 0.45) * amp;
    const ac = a < w ? a : w;
    h += 0.001 * ac * ac;
    if (u > 0) {
      const uu = u < 90 ? u : 90;
      h += uu * 0.3 + uu * uu * 0.022;
      if (u > 90) h += (u - 90) * 1.2;
      h += smooth(0, 30, u) * (n(x * 0.017 + 31, z * 0.017 + 7) - 0.5) * 22;
    }
    const jumps = this.jumps;
    for (let i = 0; i < jumps.length; i++) {
      const j = jumps[i];
      const t = d - j.d;
      if (t > -j.len && t < 4) {
        const lat = j.big ? 1 - smooth(w * 0.62, w * 0.95, a) : 1 - smooth(w * 0.55, w * 0.92, a);
        let k;
        if (t <= 0) {
          const s = 1 + t / j.len;
          k = j.h * s * s;
        } else {
          k = j.h * (1 - smooth(0, 4, t));
        }
        h += k * lat;
      }
    }
    // 波浪坡：一连串雪包
    const R = this.rollers;
    for (let i = 0; i < R.length; i++) {
      const r = R[i];
      const t = d - r.d;
      if (t > 0 && t < r.len) {
        const env = smooth(0, 12, t) * (1 - smooth(r.len - 12, r.len, t));
        h += r.amp * env * (0.5 - 0.5 * Math.cos((TAU * t) / r.period)) * (1 - smooth(w * 0.8, w * 1.05, a));
      }
    }
    return h;
  }

  // 会把人“抛”起来的地方：跳台口、断崖边、波浪坡。
  // 这些位置地面突然让开时，选手保留原来的速度方向飞出去；别处仍然贴地滑，免得满地乱蹦
  liftZone(d) {
    const J = this.jumps;
    for (let i = 0; i < J.length; i++) {
      const t = d - J[i].d;
      if (t > -4 && t < 6) return true;
    }
    const D = this.drops;
    for (let i = 0; i < D.length; i++) {
      const t = d - D[i].d;
      if (t > -3 && t < D[i].len + 3) return true;
    }
    const R = this.rollers;
    for (let i = 0; i < R.length; i++) {
      const t = d - R[i].d;
      if (t > 0 && t < R[i].len) return true;
    }
    return false;
  }

  // d 如果落在跳台 / 断崖之后的滞空段里，返回这一段结束的位置；否则原样返回
  airZoneEnd(d) {
    for (const j of this.jumps) {
      const end = j.d + (j.big ? 70 : 40);
      if (d > j.d - 4 && d < end) return end;
    }
    for (const f of this.drops) {
      const end = f.d + f.len + 45;
      if (d > f.d - 4 && d < end) return end;
    }
    return d;
  }

  // 地表着色用：0 普通 / 1 冰道 / 2 断崖岩面 / 3 跳台 / 4 大跳台 / 5 波浪坡的包顶 / 6 冰面 / 7 深雪。调用前需先 offTrack(x,d)
  tintAt(x, d) {
    if (this._us < 0.5 && this._um > 0.5 && d > this._br.dIce) return 1;
    for (const z of this.zones) {
      if (d < z.d0 || d > z.d1) continue;
      if (this._um > (z.lake ? 16 : 0.3)) break;
      if (z.side && (x - this.cx(d)) * z.side < this.halfWidth(d) * 0.05) break;
      return z.type === 'ice' ? 6 : 7;
    }
    if (this._um > 0) return 0;
    for (const f of this.drops) if (d > f.d - 0.5 && d < f.d + f.len + 1) return 2;
    for (const j of this.jumps) {
      if (d > j.d - 7 && d < j.d + 1 && Math.abs(x - this.cx(d)) < this.halfWidth(d) * (j.big ? 0.72 : 0.64)) return j.big ? 4 : 3;
    }
    // 波浪坡：每个雪包的顶上刷一道绿，远远就能看出起伏
    for (const r of this.rollers) {
      const t = d - r.d;
      if (t > 6 && t < r.len - 6 && Math.cos((TAU * t) / r.period) < -0.45) return 5;
    }
    return 0;
  }

  normal(x, z, out) {
    const e = 0.5;
    const hx = this.height(x - e, z) - this.height(x + e, z);
    const hz = this.height(x, z - e) - this.height(x, z + e);
    out.set(hx, 2 * e, hz).normalize();
    return out;
  }

  addObstacle(x, z, r, kind) {
    const b = Math.floor(-z / BUCKET);
    let arr = this.obstacles.get(b);
    if (!arr) {
      arr = [];
      this.obstacles.set(b, arr);
    }
    // u：障碍边缘离最近的雪道走廊有多远（<=0 表示伸进了雪道），机器人避障时用
    arr.push({ x, z, r, kind, u: this.offTrack(x, -z) - r });
  }

  // 遍历 d 附近的障碍
  forObstacles(d, range, fn) {
    const b0 = Math.floor((d - range) / BUCKET);
    const b1 = Math.floor((d + range) / BUCKET);
    for (let b = b0; b <= b1; b++) {
      const arr = this.obstacles.get(b);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) fn(arr[i]);
    }
  }

  nearSpecial(d) {
    if (d < 230 || d > this.L - 230) return true;
    for (const f of this.features) if (d > f.d - f.pre - 10 && d < f.d + f.post) return true;
    for (const b of this.branches) if (d > b.gate.d - 95 && d < b.gate.d + 45) return true;
    for (const r of this.itemRows) if (Math.abs(d - r) < 14) return true;
    for (const r of this.busy) if (r.solid && d > r.d0 - 14 && d < r.d1 + 10) return true;
    for (const m of this.movers) if (Math.abs(d - m.d) < 22) return true;
    for (const z of this.zones) if (d > z.d0 - 10 && d < z.d1 + 10) return true;
    return false;
  }

  build() {
    this.buildTerrain();
    this.buildScatter();
    buildLandmarks(this);
    buildPads(this);
    this.buildPeaks();
    // 起点 / 终点拱门的柱子也要有碰撞，不然人能直接穿过去
    for (const [d, R] of [[0, ARCH_START_R], [this.L, ARCH_FINISH_R]]) {
      for (const side of [-1, 1]) this.addObstacle(this.cx(d) + side * R, -d, 1.5, 'rock');
    }
  }

  // 地形网格每一行所在的 d。跳台口是个尖、断崖是陡坎，按 ROW_STEP 均匀取行会把它们削平，
  // 人就会悬在雪面上方或者陷进去，所以这些位置单独对齐、加密
  terrainRows() {
    const zones = [];
    for (const j of this.jumps) {
      const ds = [];
      for (let t = -3; t < 0; t++) ds.push(j.d + t);
      for (let t = 0; t <= 4; t += 0.5) ds.push(j.d + t); // 口部正好落在一行上，口后的陡降再细一倍
      ds.push(j.d + 5);
      zones.push(ds);
    }
    for (const f of this.drops) {
      // 海拔表每 STEP 米一个点，行取在整数米上就和它完全重合
      const ds = [];
      for (let d = Math.ceil(f.d - 4); d <= f.d + f.len + 6; d++) ds.push(d);
      zones.push(ds);
    }
    const out = [];
    const dEnd = this.L + 300;
    for (let d = ROW_D0; d <= dEnd; d += ROW_STEP) {
      if (!zones.some((z) => d > z[0] - 1 && d < z[z.length - 1] + 1)) out.push(d);
    }
    for (const z of zones) for (const d of z) out.push(d);
    return out.sort((a, b) => a - b);
  }

  // 看得见的雪面高度（按地形网格插值）。摆树、石头、旗子用它，物体才和画面贴合；
  // 网格有粗有细，路外远处和 height() 能差出好几米。网格范围以外退回 height()
  surfaceY(x, z) {
    const g = this.grid;
    const d = -z;
    if (!g || !(d >= g.rowD[0] && d <= g.rowD[g.rowD.length - 1])) return this.height(x, z);
    const { rowD, cols, pos } = g;
    let lo = 0;
    let hi = rowD.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (rowD[m] <= d) lo = m;
      else hi = m;
    }
    const t = (d - rowD[lo]) / (rowD[lo + 1] - rowD[lo]);
    const a = lo * cols * 3;
    const b = a + cols * 3;
    const ex = (j) => pos[a + j * 3] + (pos[b + j * 3] - pos[a + j * 3]) * t;
    if (x < ex(0) || x > ex(cols - 1)) return this.height(x, z);
    let j0 = 0;
    let j1 = cols - 1;
    while (j1 - j0 > 1) {
      const m = (j0 + j1) >> 1;
      if (ex(m) <= x) j0 = m;
      else j1 = m;
    }
    // 这一格的两个三角形以“上一行右点 - 下一行左点”为对角线，和 buildTerrain 里的索引顺序一致
    const pa = a + j0 * 3;
    const pb = b + j0 * 3;
    const xl = ex(j0);
    const xr = ex(j0 + 1);
    const yl = pos[pa + 1] + (pos[pb + 1] - pos[pa + 1]) * t;
    const yr = pos[pa + 4] + (pos[pb + 4] - pos[pa + 4]) * t;
    const xd = pos[pa + 3] + (pos[pb] - pos[pa + 3]) * t;
    const yd = pos[pa + 4] + (pos[pb + 1] - pos[pa + 4]) * t;
    if (x <= xd) return xd - xl < 1e-9 ? yd : yl + ((yd - yl) * (x - xl)) / (xd - xl);
    return xr - xd < 1e-9 ? yd : yd + ((yr - yd) * (x - xd)) / (xr - xd);
  }

  buildTerrain() {
    const theme = this.theme;
    // 每行：中间 NF 列均匀铺满“精细带”（主路两侧 45m，岔路区再向近道一侧加宽），两边各接 10 列渐疏的外圈
    const NF = 81;
    const outer = [6, 13, 21, 31, 43, 58, 77, 101, 133, 175];
    const NO = outer.length;
    const cols = NF + NO * 2;
    const rowD = this.terrainRows();
    const rows = rowD.length;
    const pos = new Float32Array(rows * cols * 3);
    const us = new Float32Array(rows * cols);
    const tint = new Uint8Array(rows * cols);
    const practiceUV = this.def?.practice ? new Float32Array(rows * cols * 4) : null;
    let k = 0;
    for (let i = 0; i < rows; i++) {
      const d = rowD[i];
      const c = this.cx(d);
      // 雪道特别宽的地方，精细带至少盖到路边外 20m
      const half = Math.max(45, this.halfWidth(d) + 20);
      let xa = c - half;
      let xb = c + half;
      for (const b of this.branches) {
        if (d > b.d0 - 20 && d < b.d1 + 20) {
          const t = (d - b.d0) / b.len;
          const far = this.meander(d) + b.sg * (b.yMax + 24) * smooth(-0.05, 0.06, t) * (1 - smooth(0.94, 1.05, t));
          xa = Math.min(xa, far);
          xb = Math.max(xb, far);
        }
      }
      for (let j = 0; j < cols; j++) {
        let x;
        if (j < NO) x = xa - outer[NO - 1 - j];
        else if (j < NO + NF) x = xa + ((xb - xa) * (j - NO)) / (NF - 1);
        else x = xb + outer[j - NO - NF];
        const z = -d;
        pos[k * 3] = x;
        pos[k * 3 + 1] = this.height(x, z);
        pos[k * 3 + 2] = z;
        us[k] = this.offTrack(x, d);
        tint[k] = this.tintAt(x, d);
        if (practiceUV) {
          const powder = this.practicePowder(x, d);
          const coverage = smooth(4, 27, d) * (1 - smooth(1, 9, this._um));
          practiceUV[k * 4] = x - c;
          practiceUV[k * 4 + 1] = d;
          practiceUV[k * 4 + 2] = (1 - powder) * coverage;
          practiceUV[k * 4 + 3] = powder * coverage;
        }
        k++;
      }
    }
    const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
    let q = 0;
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const dd = c + 1;
        idx[q++] = a; idx[q++] = b; idx[q++] = c;
        idx[q++] = b; idx[q++] = dd; idx[q++] = c;
      }
    }
    // 法线在整张网格上一次算好，再分段，段与段之间才不会出现明暗接缝
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const whole = new THREE.BufferGeometry();
    whole.setAttribute('position', posAttr);
    whole.setIndex(new THREE.BufferAttribute(idx, 1));
    whole.computeVertexNormals();
    const nor = whole.attributes.normal;
    const col = new Float32Array(rows * cols * 3);
    const snow = new THREE.Color(theme.snow);
    const rock = new THREE.Color(theme.rock);
    const rock2 = new THREE.Color(theme.rock2);
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();
    const iceCol = new THREE.Color(0x7fd0ff).multiply(snow);
    const lipCol = new THREE.Color(0x4a8dff);
    const bigCol = new THREE.Color(0xff5a2a);
    const rollCol = new THREE.Color(0x4fd66b);
    const lakeCol = new THREE.Color(0x6fc8ff).multiply(snow);
    const lakeCol2 = new THREE.Color(0xc8f0ff).multiply(snow);
    const powderCol = new THREE.Color(0xe4ecff);
    for (let i = 0; i < rows * cols; i++) {
      const x = pos[i * 3];
      const z = pos[i * 3 + 2];
      const ny = nor.getY(i);
      const u = us[i];
      const rockT = smooth(0.86, 0.6, ny) * smooth(3, 14, u);
      const patch = smooth(0.32, 0.6, this.noise(x * 0.05 + 11, z * 0.05 + 3));
      tmp2.copy(rock).lerp(rock2, this.noise(x * 0.11, z * 0.11 + 40));
      tmp.copy(snow).lerp(tmp2, rockT * (0.3 + 0.7 * patch));
      const tc = tint[i];
      if (tc === 1) tmp.lerp(iceCol, 0.62);
      else if (tc === 2) tmp.copy(tmp2).lerp(snow, 0.12);
      else if (tc === 3) tmp.lerp(lipCol, 0.6);
      else if (tc === 4) tmp.lerp(bigCol, 0.7);
      else if (tc === 5) tmp.lerp(rollCol, 0.5);
      else if (tc === 6) tmp.copy(lakeCol).lerp(lakeCol2, smooth(0.35, 0.75, this.noise(x * 0.07 + 3, z * 0.25)));
      else if (tc === 7) tmp.lerp(powderCol, 0.5).multiplyScalar(0.86 + 0.16 * this.noise(x * 0.45 + 9, z * 0.45));
      if (practiceUV) {
        const drift = practiceUV[i * 4 + 3];
        const wind = this.noise(x * 0.26, z * 0.14);
        tmp.lerp(powderCol, drift * (0.2 + wind * 0.65));
        tmp.multiplyScalar(1 - practiceUV[i * 4 + 2] * 0.09 - drift * wind * 0.045);
      }
      const shade = 0.95 + 0.05 * this.noise(x * 0.2, z * 0.2);
      col[i * 3] = tmp.r * shade;
      col[i * 3 + 1] = tmp.g * shade;
      col[i * 3 + 2] = tmp.b;
    }
    const colAttr = new THREE.BufferAttribute(col, 3);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const practiceAttr = practiceUV && new THREE.BufferAttribute(practiceUV, 4);
    if (practiceAttr) {
      // 沟纹跟着雪道中线走，远处随像素覆盖面积淡出，避免高速时闪烁。
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute vec4 practiceSnow; varying vec4 vPracticeSnow;\n' +
          shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPracticeSnow = practiceSnow;');
        shader.fragmentShader = 'varying vec4 vPracticeSnow;\n' +
          shader.fragmentShader.replace('#include <color_fragment>', `
            #include <color_fragment>
            float grooves = vPracticeSnow.x / 0.34;
            float filterWidth = fwidth(grooves);
            float rib = cos(grooves * 6.2831853) * (1.0 - smoothstep(0.17, 0.53, filterWidth));
            float lanes = cos(vPracticeSnow.x * 1.6) * 0.028;
            float ripples = sin(vPracticeSnow.x * 1.1 + sin(vPracticeSnow.y * 0.20) * 1.9) * 0.032;
            diffuseColor.rgb *= 1.0 + vPracticeSnow.z * (rib * 0.115 + lanes) + vPracticeSnow.w * ripples;
          `);
      };
    }
    // 沿下坡方向切成若干段：各段共用同一份顶点数据，只是索引不同，各自带包围球，镜头外（主要是身后）的段不画
    this.terrainChunks = [];
    const strip = (cols - 1) * 6;
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let r0 = 0; r0 < rows - 1; r0 += TERRAIN_CHUNK_ROWS) {
      const r1 = Math.min(r0 + TERRAIN_CHUNK_ROWS, rows - 1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', posAttr);
      geo.setAttribute('normal', nor);
      geo.setAttribute('color', colAttr);
      if (practiceAttr) geo.setAttribute('practiceSnow', practiceAttr);
      geo.setIndex(new THREE.BufferAttribute(idx.slice(r0 * strip, r1 * strip), 1));
      box.makeEmpty();
      for (let i = r0 * cols; i < (r1 + 1) * cols; i++) box.expandByPoint(p.fromArray(pos, i * 3));
      geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.terrainChunks.push(mesh);
      this.group.add(mesh);
    }
    // surfaceY() 用的网格数据
    this.grid = { rowD, cols, pos };
  }

  buildScatter() {
    const rng = this.rng;
    const theme = this.theme;
    const treeGeos = [makeTreeGeo(theme, false), makeTreeGeo(theme, true)];
    const treeLoGeos = [makeTreeGeo(theme, false, true), makeTreeGeo(theme, true, true)];
    const rockGeos = [makeRockGeo(rng, theme), makeRockGeo(rng, theme), makeRockGeo(rng, theme)];
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const chunkCount = Math.ceil((this.L + 420) / CHUNK) + 1;
    const lists = [];
    for (let i = 0; i < chunkCount; i++) lists.push({ trees: [[], []], rocks: [[], [], []], cliffs: [[], [], []] });
    const chunkOf = (d) => clamp(Math.floor((d + 120) / CHUNK), 0, chunkCount - 1);
    const m = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();

    const finishX = this.cx(this.L);
    const addTree = (x, z, scale, collide) => {
      let variant = rng() < 0.3 ? 1 : 0;
      const ry = rng() * 6.28;
      const sy = scale * (0.9 + rng() * 0.3);
      if (this.excluded(x, z, 1.2 * scale)) return;
      // 不能长在近道里；紧贴近道的树要有碰撞
      this.offTrack(x, -z);
      if (this._us < 3) return;
      if (this._us < 14) collide = true;
      // 也不能和终点拱门的柱子、拱圈挤在一起
      if (Math.abs(-z - this.L) < 5 && Math.abs(x - finishX) < ARCH_FINISH_R + 1.4 + 2.7 * scale) return;
      // 只有树干有碰撞。树冠够得着雪道的树一律用高树干的那种，擦身而过的人才不会从树冠里穿过去
      if (Math.min(this._um, this._us) < 2.7 * scale + 0.5) variant = 1;
      qt.setFromAxisAngle(up, ry);
      v.set(x, this.surfaceY(x, z) - 0.25, z);
      s.set(scale, sy, scale);
      m.compose(v, qt, s);
      lists[chunkOf(-z)].trees[variant].push(m.clone());
      if (collide) this.addObstacle(x, z, 0.5 * scale + 0.15, 'tree');
    };
    // 以 (x,d) 为圆心、半径 R 的范围里有没有雪道（主路或近道）。雪道是长条，只要查圆心和圆周
    const touchesTrack = (x, d, R) => {
      const n = Math.max(12, Math.ceil((TAU * R) / 3));
      for (let i = -1; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = i < 0 ? 0 : R;
        this.offTrack(x + Math.cos(a) * rr, d + Math.sin(a) * rr);
        if (this._um < 0.3 || this._us < 0.3) return true;
      }
      return false;
    };
    // cliff = 两侧岩壁的大石头：不投射阴影，避免整条雪道被罩在影子里
    // wall = 近道的石墙，由调用方自己保证不挡路
    const addRock = (x, z, sx, sy, sz, collide, cliff = false, wall = false) => {
      if (!wall && this.excluded(x, z, Math.max(sx, sz) * (cliff ? 1 : 0.6))) return;
      if (cliff) {
        // 碰撞只是一个比模型小的圆，所以整块模型都得待在雪道外面，不然人会滑进石头里。
        // 放不下就缩小，缩到太小就不放
        let k = 1;
        while (touchesTrack(x, -z, Math.max(sx, sz) * k * ROCK_HULL + 0.5)) {
          k *= 0.85;
          if (Math.max(sx, sz) * k < 2.2) return;
        }
        sx *= k;
        sy *= k;
        sz *= k;
      } else if (!wall) {
        this.offTrack(x, -z);
        if (this._us < Math.max(sx, sz) * ROCK_HULL + 1) return;
      }
      qt.setFromAxisAngle(up, rng() * 6.28);
      // 中心埋进雪里三成；坡很陡时再往下沉，让靠下坡的一侧也扎在雪里而不是悬着
      const m0 = Math.max(sx, sz) * 0.7;
      const gy = this.surfaceY(x, z);
      let low = gy;
      for (let i = 0; i < 8; i++) low = Math.min(low, this.surfaceY(x + Math.cos(i * 0.7854) * m0, z + Math.sin(i * 0.7854) * m0));
      v.set(x, Math.min(gy - sy * 0.3, low + sy * 0.3), z);
      s.set(sx, sy, sz);
      m.compose(v, qt, s);
      lists[chunkOf(-z)][cliff ? 'cliffs' : 'rocks'][Math.floor(rng() * 3)].push(m.clone());
      // 道内的石头人会贴着绕，碰撞圆要和模型差不多大；路外的大石头保持偏小，免得在看着没东西的地方被挡住
      if (collide) this.addObstacle(x, z, Math.max(sx, sz) * (cliff || wall ? 0.8 : 0.95), 'rock');
    };

    // 两侧树林
    for (let d = -100; d < this.L + 280; d += 4) {
      for (const side of [-1, 1]) {
        const cnt = rng() < 0.7 ? 1 : 2;
        for (let k = 0; k < cnt; k++) {
          const dj = d + rng() * 4;
          const u = 3.5 + Math.pow(rng(), 1.5) * 85;
          const x = this.cx(dj) + side * (this.halfWidth(dj) + u);
          const scale = 0.75 + rng() * 0.75 + u * 0.006;
          addTree(x, -dj, scale, u < 30);
        }
      }
    }
    // 终点前的密林夹道
    for (let d = this.L - 150; d < this.L + 40; d += 5) {
      for (const side of [-1, 1]) {
        const dj = d + rng() * 4;
        const x = this.cx(dj) + side * (this.halfWidth(dj) + 2 + rng() * 6);
        addTree(x, -dj, 1 + rng() * 0.6, true);
      }
    }
    // 两侧岩壁
    for (let d = -90; d < this.L + 280; d += 8) {
      for (const side of [-1, 1]) {
        if (rng() < 0.2) continue;
        const dj = d + rng() * 8;
        const u = 7 + rng() * 55;
        const x = this.cx(dj) + side * (this.halfWidth(dj) + u);
        const size = 3.5 + rng() * 6 + u * 0.14;
        addRock(x, -dj, size * (0.8 + rng() * 0.6), size * (0.7 + rng() * 0.8), size * (0.8 + rng() * 0.6), u - size < 16, true);
      }
    }
    // 赛道内的障碍
    let od = 240;
    while (od < this.L - 240) {
      if (!this.def?.practice && !this.nearSpecial(od)) {
        const w = this.halfWidth(od);
        const c = this.cx(od);
        const count = 1 + Math.floor(rng() * 2.4);
        for (let k = 0; k < count; k++) {
          const off = (rng() * 2 - 1) * w * 0.85;
          const dj = od + rng() * 14;
          if (rng() < 0.62) {
            addTree(c + off, -dj, 0.8 + rng() * 0.5, true);
          } else {
            const sz = 1.1 + rng() * 1.2;
            addRock(c + off, -dj, sz, sz * 0.9, sz, true);
          }
        }
      }
      od += 34 + rng() * 52;
    }

    // 近道：之字入口两侧的石墙 + 把主路和冰道隔开的岩脊
    const wallR = WALL_R * 0.8; // 碰撞半径
    for (const b of this.branches) {
      const pts = b.pts;
      for (const sideK of [-1, 1]) {
        let lx = 1e9;
        let ld = 1e9;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p.s > b.zEndS + 16) break;
          const off = p.hw + wallR + 0.75;
          const x = p.x + Math.cos(p.phi) * off * sideK;
          const d = p.d - Math.sin(p.phi) * off * sideK;
          if (Math.hypot(x - lx, d - ld) < 3.1) continue;
          this.offTrack(x, d);
          if (this._um < 1.2 || this._us < wallR + 0.45) continue;
          lx = x;
          ld = d;
          // 石块外沿最多到尺寸的 ROCK_HULL 倍：k 不超过 0.9 时正好不越过近道边线（离中心 wallR + 0.75）
          const k = 0.78 + rng() * 0.12;
          addRock(x, -d, WALL_R * k, WALL_R * (1.3 + rng() * 0.5), WALL_R * k, false, false, true);
          this.addObstacle(x, -d, wallR, 'rock');
        }
      }
      // 岩脊偏向冰道一侧。留距离时按模型外沿算（不是按碰撞圆）：离主路边缘至少 4m，免得切弯的选手蹭上去，也不伸进冰道
      for (let d = b.gate.d + 8; d < b.dB; d += 5) {
        const p = pts[b.idx[clamp(Math.floor(d - b.dA), 0, b.idx.length - 1)]];
        const xe = this.cx(d) + b.sg * this.halfWidth(d);
        const gap = b.sg * (p.x - xe) - p.hw;
        if (gap < 16) continue;
        const size = clamp(gap * 0.25, 4, 6.5);
        const r = size * ROCK_HULL;
        const x = xe + b.sg * clamp(gap * 0.6, r + 4, gap - r - 0.5);
        this.offTrack(x, d);
        if (this._us < r + 0.3 || this._um < r + 3) continue;
        addRock(x, -d, size, size * (1 + rng() * 0.4), size, true, false, true);
      }
    }
    this.buildSigns();

    for (let i = 0; i < chunkCount; i++) {
      const L = lists[i];
      for (let t = 0; t < 2; t++) {
        const arr = L.trees[t];
        if (!arr.length) continue;
        const make = (geo) => {
          const im = new THREE.InstancedMesh(geo, treeMat, arr.length);
          for (let k = 0; k < arr.length; k++) im.setMatrixAt(k, arr[k]);
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          return im;
        };
        // 近处用精模；整段树都在 TREE_LOD_NEAR 以外时换低模（那么远也用不着投影）
        const hi = make(treeGeos[t]);
        hi.castShadow = true;
        const lo = make(treeLoGeos[t]);
        lo.userData.lowDetail = true;
        // LOD 按自身位置算距离：把它放到这段树的中心，子物体反向挪回去，实例矩阵仍是世界坐标
        const center = hi.boundingSphere.center;
        const lod = new THREE.LOD();
        lod.position.copy(center);
        hi.position.copy(center).negate();
        lo.position.copy(center).negate();
        lod.addLevel(hi, 0);
        lod.addLevel(lo, hi.boundingSphere.radius + TREE_LOD_NEAR, 0.05);
        this.group.add(lod);
      }
      for (const kind of ['rocks', 'cliffs']) {
        for (let t = 0; t < 3; t++) {
          const arr = L[kind][t];
          if (!arr.length) continue;
          const im = new THREE.InstancedMesh(rockGeos[t], rockMat, arr.length);
          for (let k = 0; k < arr.length; k++) im.setMatrixAt(k, arr[k]);
          im.castShadow = kind === 'rocks';
          im.receiveShadow = true;
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          this.group.add(im);
        }
      }
    }
  }

  // 各种坡地的旗子
  buildSigns() {
    const flag = (x, d, color, h = 5) => {
      const g = new THREE.Group();
      g.add(mesh('cyl', 0xdfe3ea, 0.07, h, 0.07, 0, h / 2, 0));
      g.add(mesh('box', color, 1.5, 0.9, 0.05, 0.8, h - 0.55, 0));
      g.position.set(x, this.surfaceY(x, -d) - 0.2, -d);
      this.group.add(g);
    };
    for (const j of this.jumps) {
      const w = this.halfWidth(j.d) * (j.big ? 0.72 : 0.62);
      const c = this.cx(j.d);
      const col = j.big ? 0xff3a2a : 0x2f6bff;
      flag(c - w, j.d, col, j.big ? 7 : 5);
      flag(c + w, j.d, col, j.big ? 7 : 5);
    }
    for (const f of this.drops) {
      const w = this.halfWidth(f.d) + 1;
      const c = this.cx(f.d);
      flag(c - w, f.d - 2, 0xffc21a, 6);
      flag(c + w, f.d - 2, 0xffc21a, 6);
    }
    for (const r of this.rollers) {
      const w = this.halfWidth(r.d) + 1;
      const c = this.cx(r.d);
      flag(c - w, r.d + 4, 0x8dff6a, 4.5);
      flag(c + w, r.d + 4, 0x8dff6a, 4.5);
    }
  }

  buildPeaks() {
    const rng = this.rng;
    const theme = this.theme;
    const rock = new THREE.Color(theme.rock);
    const rock2 = new THREE.Color(theme.rock2);
    const snow = new THREE.Color(theme.snow);
    const parts = [];
    const tmp = new THREE.Color();
    for (let d = -500; d < this.L + 900; d += 190) {
      for (const side of [-1, 1]) {
        const dj = d + rng() * 120;
        let lat = 300 + rng() * 300;
        const H = 240 + rng() * 260;
        let R = 170 + rng() * 130;
        const dc = clamp(dj, D0, this.D1);
        const baseY = this.elev(dc) - 40;
        // 山脚不能压到雪道上：先往外挪，挪了还不行再把山收窄
        let tries = 0;
        while (!this.peakClear(this.cx(dc) + side * lat, dj, baseY, R, H) && tries < 16) {
          if (tries < 9) lat += 45;
          else R *= 0.85;
          tries++;
        }
        const clear = tries < 16 || this.peakClear(this.cx(dc) + side * lat, dj, baseY, R, H);
        let g = new THREE.ConeGeometry(R, H, 7, 3);
        g = g.toNonIndexed();
        const pos = g.attributes.position;
        const map = new Map();
        for (let i = 0; i < pos.count; i++) {
          const key = `${pos.getX(i).toFixed(1)},${pos.getY(i).toFixed(1)},${pos.getZ(i).toFixed(1)}`;
          let o = map.get(key);
          if (!o) {
            o = [(rng() - 0.5) * R * 0.35, (rng() - 0.5) * H * 0.12, (rng() - 0.5) * R * 0.35];
            map.set(key, o);
          }
          pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
        }
        g.computeVertexNormals();
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i += 3) {
          const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 / H; // -0.5..0.5
          const snowy = y > -0.08 + (rng() - 0.5) * 0.3 || rng() < 0.25;
          if (snowy) tmp.copy(snow);
          else tmp.copy(rock).lerp(rock2, rng());
          for (let k2 = 0; k2 < 3; k2++) {
            col[(i + k2) * 3] = tmp.r;
            col[(i + k2) * 3 + 1] = tmp.g;
            col[(i + k2) * 3 + 2] = tmp.b;
          }
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.deleteAttribute('uv');
        g.translate(this.cx(dc) + side * lat, baseY + H * 0.5, -dj);
        if (clear) parts.push(g);
        else g.dispose(); // 怎么都躲不开雪道的山就不要了
      }
    }
    if (!parts.length) return;
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  // 一座远山（底面中心 (ax, baseY)、位于 d = ad，底面半径 R、高 H 的锥体）会不会压到雪道上。
  // 顶点有随机抖动（水平最多 0.25R、竖直 0.06H），所以按最坏情况放大一圈算；
  // 雪道两侧各留 45m，山体在这个范围内必须埋在地面以下
  peakClear(ax, ad, baseY, R, H) {
    const Rw = R * 1.25 + 4;
    const under = (x0, x1, d) => {
      const dx = ax < x0 ? x0 - ax : ax > x1 ? ax - x1 : 0;
      const r = Math.hypot(dx, d - ad);
      return r >= Rw || baseY + H * (1.31 - r / R) <= this.elev(d) - 2;
    };
    for (let d = Math.max(ad - Rw, -120); d <= Math.min(ad + Rw, this.L + 300); d += 10) {
      const c = this.cx(d);
      const w = this.halfWidth(d) + 45;
      if (!under(c - w, c + w, d)) return false;
      for (const b of this.branches) {
        if (d < b.dA || d > b.dB) continue;
        const p = b.pts[b.idx[clamp(Math.floor(d - b.dA), 0, b.idx.length - 1)]];
        if (!under(p.x - p.hw - 45, p.x + p.hw + 45, d)) return false;
      }
    }
    return true;
  }

  dispose() {
    const geos = new Set();
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((mm) => mats.add(mm));
        else mats.add(o.material);
      }
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((mm) => {
      if (mm.map) mm.map.dispose();
      mm.dispose();
    });
    this.group.removeFromParent();
  }
}
