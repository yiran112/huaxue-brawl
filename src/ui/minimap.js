// 手机比赛右上角的小地图：整条赛道的俯视走线，起点在下、终点在上（和镜头里往前滑的方向一致），
// 已经滑过的一段描金，近道是一条细线，各人是外套颜色的圆点，自己是金色的大圆点。
// 网页（src/touch.js 里的一块 canvas）和微信小游戏（wechat/race-ui.js）共用这一份
import { hex } from './common.js';
import { TEAM_COLORS } from '../modes.js';

const PAD = 10;
const N = 120; // 主路取多少段
const EXAG = 6; // 横向最多放大几倍：赛道又长又窄，照真实比例画只是一条竖线
const GOLD = '#ffd23c';
const NAVY = '#0b1530';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 按赛道和地图框大小算好走线（每条赛道算一次）
export function buildMinimap(course, w, h) {
  const L = course.L;
  const main = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= N; i++) {
    const d = (L * i) / N;
    const x = course.cx(d);
    main.push([x, d]);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  // 岔路区：主路绕到一边，近道留在原来的线上
  const shorts = (course.branches || []).map((b) => {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const d = b.d0 + ((b.d1 - b.d0) * k) / 16;
      const x = course.meander(d);
      pts.push([x, d]);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return pts;
  });
  const ky = (h - PAD * 2) / L;
  const kx = Math.min((w - PAD * 2) / Math.max(1, hi - lo), ky * EXAG);
  const mid = (lo + hi) / 2;
  const map = (x, d) => [w / 2 + (x - mid) * kx, h - PAD - clamp(d, 0, L) * ky];
  return {
    course,
    w,
    h,
    L,
    map,
    line: main.map(([x, d]) => map(x, d)),
    shorts: shorts.map((s) => s.map(([x, d]) => map(x, d))),
  };
}

function poly(ctx, pts, width, color) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(ctx, x, y, r, fill, stroke, width) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// 画到 ctx 上，(ox, oy) 是地图框左上角
export function drawMinimap(ctx, mm, game, ox = 0, oy = 0) {
  const { w, h, line, L } = mm;
  ctx.save();
  ctx.translate(ox, oy);
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 12);
  ctx.fillStyle = 'rgba(11,21,48,.42)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const s of mm.shorts) poly(ctx, s, 2.2, 'rgba(255,255,255,.45)');
  poly(ctx, line, 7, 'rgba(11,21,48,.6)');
  poly(ctx, line, 4.4, 'rgba(255,255,255,.88)');

  // 自己已经滑过的一段
  const p = game.player;
  if (p) {
    const k = (clamp(p.d, 0, L) / L) * N;
    const i = Math.floor(k);
    const done = line.slice(0, i + 1);
    if (i < N) {
      const a = line[i];
      const b = line[i + 1];
      done.push([a[0] + (b[0] - a[0]) * (k - i), a[1] + (b[1] - a[1]) * (k - i)]);
    }
    poly(ctx, done, 4.4, GOLD);
  }

  // 终点：一小块黑白格
  const [fx, fy] = line[N];
  const cell = 3;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = (r + c) % 2 ? NAVY : '#fff';
      ctx.fillRect(fx - cell * 1.5 + c * cell, fy - cell * 2 - 2 + r * cell, cell, cell);
    }
  }

  // 各人的位置，自己最后画、压在最上面
  const racers = game.racers || [];
  for (const r of racers) {
    if (r === p || !r.pos) continue;
    const [x, y] = mm.map(r.pos.x, r.d);
    ctx.globalAlpha = r.out ? 0.3 : r.finished ? 0.7 : 1;
    dot(ctx, x, y, 3.6, hex(r.look.jacket), r.team >= 0 ? TEAM_COLORS[r.team] : NAVY, 1.6);
  }
  ctx.globalAlpha = 1;
  if (p && p.pos) {
    const [x, y] = mm.map(p.pos.x, p.d);
    ctx.beginPath();
    ctx.arc(x, y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,210,60,.3)';
    ctx.fill();
    dot(ctx, x, y, 5.2, GOLD, NAVY, 2);
  }
  ctx.restore();
}
