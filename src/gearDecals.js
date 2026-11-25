// 装备上的贴花：板面图案、文字、贴纸。程序画在一张透明底的画布上，盖在板面顶上薄薄一层。
// 只画装饰、不画底色：底色还是零件本身的材质（跟着玩家选的颜色走），
// 半透明的深色线条压在上面就是分件缝，半透明的白色就是高光。
// 画法都按米来：画布先变换到 x ∈ [-W/2, W/2]（右为正）、y ∈ [0, L]（板头 / 上边为 0），图案在模型上不会被拉扁。
import * as THREE from 'three';

const mats = new Map();

// key 相同的贴花共用一张图和一份材质。opts：px / py 画布像素（2 的幂），glow 不受光照（自己发亮），
// opaque 整块不透明（图案自己铺满底色），repeat 横向重复几次（绕一圈的雪圈用），lift 板面皮抬多高
export function decalMat(key, W, L, paint, opts = {}) {
  let m = mats.get(key);
  if (m) return m;
  const px = opts.px || 128;
  const py = opts.py || 512;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = py;
  const g = c.getContext('2d');
  g.setTransform(px / W, 0, 0, py / L, px / 2, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  paint(g, W, L);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = opts.repeat;
  }
  const base = opts.opaque
    ? { map: tex }
    : { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
  m = opts.glow ? new THREE.MeshBasicMaterial(base) : new THREE.MeshLambertMaterial(base);
  mats.set(key, m);
  return m;
}

// ---------- 颜色 ----------

export function css(hex, a = 1) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}
export const INK = 0x16181f;
export const WHITE = 0xffffff;
export const HAZARD = 0xffc81f;

// 固定种子的随机数：同一张贴花每次画出来都一样
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ---------- 基本图形 ----------

export function rect(g, x, y, w, h, color, a = 1) {
  g.fillStyle = css(color, a);
  g.fillRect(x, y, w, h);
}
export function poly(g, pts, color, a = 1) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = css(color, a);
  g.fill();
}
export function line(g, pts, color, lw, a = 1, closed = false) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (closed) g.closePath();
  g.strokeStyle = css(color, a);
  g.lineWidth = lw;
  g.stroke();
}
export function circle(g, x, y, r, color, a = 1) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = css(color, a);
  g.fill();
}
export function ring(g, x, y, r, lw, color, a = 1, a0 = 0, a1 = Math.PI * 2) {
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.strokeStyle = css(color, a);
  g.lineWidth = lw;
  g.stroke();
}

// 圆角矩形的路径
export function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 文字：size 是字高（米）。画布本身按米缩放，这里临时放大到毫米，字形才不会糊
export function text(g, str, x, y, size, color, { rot = 0, weight = 900, italic = true, align = 'center', stroke = null, strokeW = 0.2, a = 1, font = '"Arial Black", Impact, "Microsoft YaHei", sans-serif', squash = 1 } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(0.001 * squash, 0.001);
  g.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(size * 1000)}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (stroke !== null) {
    g.strokeStyle = css(stroke, a);
    g.lineWidth = size * 1000 * strokeW;
    g.strokeText(str, 0, 0);
  }
  g.fillStyle = css(color, a);
  g.fillText(str, 0, 0);
  g.restore();
}

export function star(g, x, y, r, color, { n = 5, inner = 0.45, rot = 0, a = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const k = i % 2 ? r * inner : r;
    const t = rot - Math.PI / 2 + (i * Math.PI) / n;
    pts.push([x + Math.cos(t) * k, y + Math.sin(t) * k]);
  }
  poly(g, pts, color, a);
}

export function heart(g, x, y, s, color, a = 1) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.7, y - s * 0.9, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.3, y + s * 0.1, x, y + s * 0.9);
  g.fillStyle = css(color, a);
  g.fill();
}

// 一排箭头：尖朝板头（y 减小的方向）
export function chevrons(g, x, y, w, h, n, gap, color, a = 1) {
  for (let i = 0; i < n; i++) {
    const y0 = y + i * gap;
    poly(g, [[x - w / 2, y0 + h], [x, y0], [x + w / 2, y0 + h], [x + w / 2, y0 + h * 1.6], [x, y0 + h * 0.6], [x - w / 2, y0 + h * 1.6]], color, a);
  }
}

// 黄黑警示斜纹，裁在矩形里
export function hazard(g, x, y, w, h, band = 0.03, c1 = HAZARD, c2 = INK) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  rect(g, x, y, w, h, c1);
  g.fillStyle = css(c2);
  for (let k = -h; k < w + h; k += band * 2) {
    g.beginPath();
    g.moveTo(x + k, y);
    g.lineTo(x + k + band, y);
    g.lineTo(x + k + band - h, y + h);
    g.lineTo(x + k - h, y + h);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// 三角警示牌，rot 转多少（尖默认朝 y 减小的方向）
export function warn(g, x, y, s, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  poly(g, [[0, -s * 0.55], [s * 0.6, s * 0.45], [-s * 0.6, s * 0.45]], INK);
  poly(g, [[0, -s * 0.38], [s * 0.45, s * 0.36], [-s * 0.45, s * 0.36]], HAZARD);
  text(g, '!', 0, s * 0.08, s * 0.5, INK, { italic: false });
  g.restore();
}

// 白底条形码贴纸
export function barcode(g, x, y, w, h, seed = 7) {
  const r = rng(seed);
  round(g, x, y, w, h, Math.min(w, h) * 0.12);
  g.fillStyle = css(0xf4f6f8);
  g.fill();
  let k = x + w * 0.1;
  while (k < x + w * 0.9) {
    const bw = w * (0.012 + r() * 0.03);
    rect(g, k, y + h * 0.15, bw, h * 0.55, INK);
    k += bw + w * (0.015 + r() * 0.025);
  }
  rect(g, x + w * 0.1, y + h * 0.78, w * 0.5, h * 0.08, INK, 0.7);
}

// 六瓣雪花
export function snowflake(g, x, y, r, color, lw, a = 1) {
  g.strokeStyle = css(color, a);
  g.lineWidth = lw;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const t = (i * Math.PI) / 3;
    const cx = Math.cos(t);
    const sy = Math.sin(t);
    g.moveTo(x, y);
    g.lineTo(x + cx * r, y + sy * r);
    for (const k of [0.5, 0.75]) {
      const bx = x + cx * r * k;
      const by = y + sy * r * k;
      const b = r * (1 - k) * 0.7;
      for (const d of [-1, 1]) g.moveTo(bx, by), g.lineTo(bx + Math.cos(t + d * 0.8) * b, by + Math.sin(t + d * 0.8) * b);
    }
  }
  g.stroke();
}

// 闪电：从 (x0, y0) 折到 (x1, y1)，粗细 w
export function bolt(g, x0, y0, x1, y1, w, color, { seed = 3, kinks = 4, a = 1 } = {}) {
  const r = rng(seed);
  const pts = [[x0, y0]];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = -dy;
  const ny = dx;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < kinks; i++) {
    const t = i / kinks;
    const k = (i % 2 ? 1 : -1) * (0.08 + r() * 0.08);
    pts.push([x0 + dx * t + (nx / nl) * k * Math.hypot(dx, dy), y0 + dy * t + (ny / nl) * k * Math.hypot(dx, dy)]);
  }
  pts.push([x1, y1]);
  line(g, pts, color, w, a);
}

// 鳞片：一排排错开的半圆弧
export function scales(g, x0, y0, x1, y1, r, color, lw, a = 1) {
  g.strokeStyle = css(color, a);
  g.lineWidth = lw;
  let row = 0;
  for (let y = y0; y < y1 + r; y += r * 0.9, row++) {
    g.beginPath();
    for (let x = x0 + (row % 2 ? r : 0); x < x1 + r; x += r * 2) {
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI);
    }
    g.stroke();
  }
}

// 木纹：铺满底色（base 为 null 就不铺，纹线直接压在零件本身的颜色上），再画一道道微微起伏的纹线和几个节疤
export function grain(g, x0, y0, x1, y1, base, ink, seed = 5, a = 1) {
  const r = rng(seed);
  if (base !== null) rect(g, x0, y0, x1 - x0, y1 - y0, base, a);
  const w = x1 - x0;
  for (let i = 0; i < 9; i++) {
    const x = x0 + (w * (i + 0.5 + (r() - 0.5) * 0.6)) / 9;
    const ph = r() * 6;
    const amp = w * (0.01 + r() * 0.02);
    g.beginPath();
    for (let y = y0; y <= y1; y += (y1 - y0) / 40) g.lineTo(x + Math.sin(y * 9 + ph) * amp, y);
    g.strokeStyle = css(ink, 0.25 + r() * 0.25);
    g.lineWidth = w * (0.006 + r() * 0.012);
    g.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const kx = x0 + w * (0.2 + r() * 0.6);
    const ky = y0 + (y1 - y0) * (0.2 + r() * 0.6);
    g.save();
    g.translate(kx, ky);
    g.scale(1, 2.4);
    ring(g, 0, 0, w * 0.04, w * 0.012, ink, 0.45);
    ring(g, 0, 0, w * 0.075, w * 0.008, ink, 0.3);
    g.restore();
  }
}

// 碳纤维编织：两种深色的小方格斜着交错
export function weave(g, x0, y0, x1, y1, cell, c1 = 0x1b1e26, c2 = 0x2c313c, a = 1) {
  rect(g, x0, y0, x1 - x0, y1 - y0, c1, a);
  g.fillStyle = css(c2, a);
  for (let j = 0, y = y0; y < y1; y += cell, j++) {
    for (let i = 0, x = x0; x < x1; x += cell, i++) {
      if ((i + j) % 2) g.fillRect(x, y, cell, cell * 0.5);
      else g.fillRect(x, y + cell * 0.5, cell * 0.5, cell * 0.5);
    }
  }
}

// 六角格
export function hexes(g, x0, y0, x1, y1, r, color, lw, a = 1) {
  g.strokeStyle = css(color, a);
  g.lineWidth = lw;
  const h = r * Math.sqrt(3);
  g.beginPath();
  for (let row = 0, y = y0; y < y1 + h; y += h / 2, row++) {
    for (let x = x0 + (row % 2 ? r * 1.5 : 0); x < x1 + r; x += r * 3) {
      for (let i = 0; i <= 6; i++) {
        const t = (i * Math.PI) / 3;
        const px = x + Math.cos(t) * r;
        const py = y + Math.sin(t) * r;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
    }
  }
  g.stroke();
}

// 一圈小圆点（铆钉、灯珠的印花）
export function dotRow(g, pts, r, color, a = 1) {
  g.fillStyle = css(color, a);
  for (const [x, y] of pts) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}
