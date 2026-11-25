// 手机比赛按键：图标和排版。网页（src/touch.js，DOM + SVG）和微信小游戏（wechat/race-ui.js，canvas）共用，两边长得一样。
// 图标都画在 24×24 的格子里，只用直线、曲线、圆和圆弧，canvas 上不依赖 Path2D。
import { EMOTES } from '../emotes.js';

// p：路径（只用绝对坐标的 M L Q C Z）；c：圆 [x, y, r]；a：圆弧 [x, y, r, 起始角, 结束角]（度，顺时针）
// w：线宽；f：填充而不是描边；o：透明度
export const ICONS = {
  left: [{ p: 'M14.5 4.5 L7 12 L14.5 19.5', w: 3.6 }],
  right: [{ p: 'M9.5 4.5 L17 12 L9.5 19.5', w: 3.6 }],
  // 两道往上的箭头
  jump: [
    { p: 'M5.5 11.5 L12 5 L18.5 11.5', w: 3.2 },
    { p: 'M5.5 18.5 L12 12 L18.5 18.5', w: 3.2, o: 0.5 },
  ],
  // 甩出去的一道弧，尾巴上溅起雪沫
  drift: [
    { p: 'M4.5 17.5 Q5.5 7.5 17 6.5', w: 2.8 },
    { p: 'M13.2 3 L17.2 6.5 L13.6 10.4', w: 2.8 },
    { c: [8.6, 20.6, 1.5], f: 1 },
    { c: [13, 19.8, 1.2], f: 1, o: 0.8 },
    { c: [16.8, 18.2, 0.95], f: 1, o: 0.6 },
  ],
  // 刹车灯的样子：（ ● ）
  brake: [
    { c: [12, 12, 5.4], w: 2.7 },
    { c: [12, 12, 1.6], f: 1 },
    { a: [12, 12, 9.4, 135, 225], w: 2.5 },
    { a: [12, 12, 9.4, -45, 45], w: 2.5 },
  ],
  // 道具箱
  fire: [
    { p: 'M4.5 7.8 L12 4 L19.5 7.8 L19.5 16.2 L12 20 L4.5 16.2 Z', w: 2.3 },
    { p: 'M4.5 7.8 L12 11.6 L19.5 7.8 M12 11.6 L12 20', w: 2.3 },
    { p: 'M8.2 5.9 L15.8 9.7', w: 2, o: 0.55 },
  ],
  // 氮气：一团火
  nitro: [
    { p: 'M12 2.8 C13.3 7 18.2 9 18.2 14.6 C18.2 18.4 15.4 21.2 12 21.2 C8.6 21.2 5.8 18.4 5.8 14.6 C5.8 11.6 7.6 9.8 8.9 8 C9.2 10.2 10.1 11.5 11.2 12.1 C11 9.1 11.1 6 12 2.8 Z', w: 2.2 },
    { p: 'M12 13.4 C13.3 15 14.7 15.9 14.7 17.6 C14.7 19 13.5 19.9 12 19.9 C10.5 19.9 9.3 19 9.3 17.6 C9.3 16.3 10.6 15.2 12 13.4 Z', f: 1 },
  ],
  pause: [{ p: 'M8.5 6 L8.5 18 M15.5 6 L15.5 18', w: 3.4 }],
  // 绕一圈的箭头：回到赛道上
  reset: [
    { a: [12, 12, 7, -35, 245], w: 2.6 },
    { p: 'M12.4 4.1 L7.7 2.8 L10.3 8.6 Z', f: 1 },
  ],
  emo: [
    { c: [12, 12, 8.6], w: 2.2 },
    { c: [9, 10, 1.35], f: 1 },
    { c: [15, 10, 1.35], f: 1 },
    { p: 'M8.2 14 Q12 18 15.8 14', w: 2.2 },
  ],
};

// 按键底下的小字
export const LABELS = { jump: '跳跃', drift: '漂移', brake: '刹车', fire: '道具', nitro: '氮气' };

const rad = (deg) => (deg * Math.PI) / 180;
const n = (v) => +v.toFixed(2);

function arcEnds([x, y, r, a0, a1]) {
  return [x + r * Math.cos(rad(a0)), y + r * Math.sin(rad(a0)), x + r * Math.cos(rad(a1)), y + r * Math.sin(rad(a1))];
}

export function iconSvg(name, cls = 'ic') {
  const body = (ICONS[name] || [])
    .map((s) => {
      const paint = s.f ? 'fill="currentColor"' : `fill="none" stroke="currentColor" stroke-width="${s.w || 2.6}"`;
      const op = s.o ? ` opacity="${s.o}"` : '';
      if (s.c) return `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.c[2]}" ${paint}${op}/>`;
      if (s.a) {
        const [x0, y0, x1, y1] = arcEnds(s.a);
        const sweep = s.a[4] - s.a[3];
        const d = `M${n(x0)} ${n(y0)} A${s.a[2]} ${s.a[2]} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
        return `<path d="${d}" ${paint}${op}/>`;
      }
      return `<path d="${s.p}" ${paint}${op}/>`;
    })
    .join('');
  return `<svg class="${cls}" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const parsed = new Map();
function pathOps(d) {
  let ops = parsed.get(d);
  if (ops) return ops;
  const tok = d.match(/[MLQCZ]|-?\d*\.?\d+/g);
  ops = [];
  let cmd = '';
  for (let i = 0; i < tok.length; ) {
    if (/[A-Z]/.test(tok[i])) cmd = tok[i++];
    const take = { M: 2, L: 2, Q: 4, C: 6, Z: 0 }[cmd];
    ops.push([cmd, ...tok.slice(i, i + take).map(Number)]);
    i += take;
    if (cmd === 'M') cmd = 'L';
  }
  parsed.set(d, ops);
  return ops;
}

// 在 canvas 上画图标：(x, y) 是左上角，size 是边长
export function drawIcon(ctx, name, x, y, size, color = '#fff') {
  const shapes = ICONS[name];
  if (!shapes) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = ctx.strokeStyle = color;
  const alpha = ctx.globalAlpha;
  for (const s of shapes) {
    ctx.globalAlpha = alpha * (s.o || 1);
    ctx.beginPath();
    if (s.c) ctx.arc(s.c[0], s.c[1], s.c[2], 0, Math.PI * 2);
    else if (s.a) ctx.arc(s.a[0], s.a[1], s.a[2], rad(s.a[3]), rad(s.a[4]), s.a[4] < s.a[3]);
    else {
      for (const [c, ...v] of pathOps(s.p)) {
        if (c === 'M') ctx.moveTo(v[0], v[1]);
        else if (c === 'L') ctx.lineTo(v[0], v[1]);
        else if (c === 'Q') ctx.quadraticCurveTo(v[0], v[1], v[2], v[3]);
        else if (c === 'C') ctx.bezierCurveTo(v[0], v[1], v[2], v[3], v[4], v[5]);
        else ctx.closePath();
      }
    }
    if (s.f) ctx.fill();
    else {
      ctx.lineWidth = s.w || 2.6;
      ctx.stroke();
    }
  }
  ctx.restore();
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 比赛按键的位置（CSS 像素，左上角为原点）。
// safe：刘海、圆角让出来的边距；topRight：右上角按键最右能放到哪（数字，或者按这一排的中线高度算的函数；小游戏要让开右上角的胶囊）；
// items / nitro：这一局有没有道具、氮气，没有就不放那个键，右手的弧收紧一格。
// 返回 { 键名: { x, y, w, h, round, half } }，另外 speed 是速度表左下角的位置，map 是小地图的框
export function touchLayout(w, h, { safe = {}, topRight = null, items = true, nitro = true } = {}) {
  const { l = 0, r = 0, t = 0, b = 0 } = safe;
  const S = Math.round(clamp(h * 0.25, 70, 116)); // 大键：跳、转向
  const M = Math.round(S * 0.72); // 小键：漂移、刹车、道具、氮气
  const gap = Math.round(S * 0.1);
  const ml = Math.max(w * 0.03, l + 8);
  const mr = Math.max(w * 0.03, r + 8);
  const mb = Math.max(h * 0.045, b + 6);
  const out = { S, M };
  const box = (id, x, y, bw, bh, extra = {}) => (out[id] = { x: Math.round(x), y: Math.round(y), w: bw, h: bh, ...extra });
  const circ = (id, [cx, cy], d) => box(id, cx - d / 2, cy - d / 2, d, d, { round: true });

  // 左手：一条胶囊从中间分成左右两半
  const sw = Math.round(S * 1.08);
  const sy = h - mb - S;
  box('left', ml, sy, sw, S, { half: 'l' });
  box('right', ml + sw + 4, sy, sw, S, { half: 'r' });

  // 右手：跳在右下角，其它键沿着拇指转动的弧排开
  const jx = w - mr - S / 2;
  const jy = h - mb - S / 2;
  circ('jump', [jx, jy], S);
  const R = Math.max(S / 2 + M / 2 + gap, (M + gap) / (2 * Math.sin(rad(22.5))));
  const at = (deg, d) => [jx + Math.cos(rad(deg)) * d, jy - Math.sin(rad(deg)) * d];
  circ('drift', at(180, R), M);
  circ('brake', at(90, R), M);
  if (items) {
    circ('fire', at(135, R), M);
    if (nitro) circ('nitro', at(157.5, R + M + gap * 0.6), M);
  } else if (nitro) circ('nitro', at(135, R), M);

  // 右上角：暂停、复位、表情；点开表情往左排四个
  const sd = Math.round(clamp(h * 0.11, 38, 46));
  const top = Math.max(h * 0.025, t + 4);
  const edge = (typeof topRight === 'function' ? topRight(top + sd / 2) : topRight) ?? w - Math.max(w * 0.02, r + 6);
  ['pause', 'reset', 'emo'].forEach((id, i) => box(id, edge - sd - i * (sd + 8), top, sd, sd, { round: true }));
  EMOTES.forEach((_, i) => box('e' + i, edge - sd - (3 + i) * (sd + 8) - 6, top, sd, sd, { round: true }));
  out.sysBottom = top + sd;
  out.edgeR = w - Math.max(w * 0.02, r + 6);
  out.speed = { x: Math.round(ml + sw * 2 + 4 + gap * 1.8), y: Math.round(h - mb) };

  // 小地图：右上角按键下面，往下一直放到右手按键的上沿。赛道又长又窄，框做成竖的
  const mapW = Math.round(clamp(h * 0.22, 70, 104));
  const mapX = Math.round(out.edgeR - mapW);
  const mapY = Math.round(out.sysBottom + 10);
  let floor = h;
  for (const id of ['brake', 'fire', 'nitro', 'drift', 'jump']) {
    const k = out[id];
    if (k && k.x < mapX + mapW && k.x + k.w > mapX) floor = Math.min(floor, k.y);
  }
  out.map = { x: mapX, y: mapY, w: mapW, h: Math.round(clamp(floor - 10 - mapY, 60, mapW * 2)) };
  return out;
}

// 手机上名次表只列 max 行：第一名 + 自己附近的几个人
export function rankRows(order, max) {
  const rows = order.map((r, i) => ({ r, i }));
  if (rows.length <= max) return rows;
  const me = Math.max(0, order.findIndex((r) => r.isPlayer));
  const start = clamp(me - Math.floor((max - 1) / 2), 1, order.length - (max - 1));
  return [rows[0], ...rows.slice(start, start + max - 1)];
}
