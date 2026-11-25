export const NAVY = '#0b1530';
export const GOLD = '#ffd23c';
export const PALE = '#d6e6ff';

export function gradient(c, x, y, w, h, ...colors) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color));
  return g;
}

export function card(ui, { x, y, w, h }, colors, {
  skew = 0, radius = 16, stripe = 0, stroke = '#ffffffe0', width = 3, shadow = 6,
} = {}) {
  const c = ui.ctx;
  c.save();
  c.translate(x, y);
  if (skew) c.transform(1, 0, skew, 1, -skew * h / 2, 0);
  if (shadow) ui.panel(0, shadow, w, h, 'rgba(6,10,32,.5)', radius, null);
  ui.rounded(0, 0, w, h, radius);
  c.fillStyle = Array.isArray(colors) ? gradient(c, 0, 0, w * 0.45, h, ...colors) : colors;
  c.fill();
  if (stripe) {
    c.save();
    c.clip();
    c.transform(1, 0, -0.6, 1, 0, 0);
    c.fillStyle = `rgba(255,255,255,${stripe})`;
    for (let i = 0; i < w + h * .6; i += 38) c.fillRect(i, 0, 16, h);
    c.restore();
  }
  if (stroke) {
    c.lineWidth = width;
    c.strokeStyle = stroke;
    c.stroke();
  }
  c.restore();
}

export function hit(ui, box, label, action, primary = false) {
  if (action) ui.addHit({ ...box, label, action, primary });
}

export function chip(ui, label, box, action, { active = false, fill, color, size = 14, radius = 10 } = {}) {
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, fill || (active ? '#fff' : 'rgba(255,255,255,.10)'), radius, null);
  ui.text(label, x + w / 2, y + h / 2, { color: color || (active ? NAVY : '#fff'), center: true, bold: true, size, max: w - 7 });
  hit(ui, box, label, action);
}

export function ribbon(ui, label, box, action, { sub = '', primary = false, muted = false, skew = 0 } = {}) {
  card(ui, box, muted ? ['#c9c1aa', '#a99f77'] : primary ? ['#ffe972', '#ffb400'] : ['#fff', '#d3e0ff'],
    { skew, radius: 6, stroke: null, shadow: 4 });
  const { x, y, w, h } = box;
  ui.text(label, x + w / 2, y + h * (sub ? .42 : .5), {
    color: primary ? '#3a2400' : NAVY, size: 21, bold: true, center: true, italic: !!skew, max: w - 10,
  });
  if (sub) ui.text(sub, x + w / 2, y + h * .73, { color: '#525976', size: 11, bold: true, center: true, max: w - 10 });
  hit(ui, box, label, action, primary);
}

export function pageHeader(ui, title, back = () => ui.back(), { sub = '', parts = false, action = null, meta = null } = {}) {
  const { l, t } = ui;
  const p = ui.game.profile;
  const button = { x: l, y: t + 6, w: 96, h: 35 };
  ui.panel(button.x, button.y + 3, button.w, button.h, 'rgba(11,21,48,.4)', 20, null);
  ui.panel(button.x, button.y, button.w, button.h, '#fff', 20, null);
  chip(ui, '‹', { x: l + 8, y: t + 13, w: 33, h: 21 }, null, { fill: '#252440', size: 18, radius: 12 });
  ui.text('返回', l + 63, t + 24, { size: 15, center: true, bold: true, color: NAVY });
  hit(ui, button, '‹  返回', back);
  const w = Math.max(96, title.length * 23 + 50) + (sub ? sub.length * 12 + 16 : 0);
  card(ui, { x: l + 112, y: t, w, h: 45 }, ['#ff9960', '#ff3d6e'], { skew: -.12, stroke: null, radius: 11, shadow: 4 });
  ui.text(title, l + 135, t + 23, { bold: true, italic: true, size: 23, max: w - 24 });
  if (sub) ui.text(sub, l + 144 + title.length * 23, t + 26, { bold: true, size: 13, max: sub.length * 12 + 10 });
  const right = ui.headerRight(t + 23);
  const coins = { x: right - 85, y: t + 5, w: 85, h: 36 };
  chip(ui, `❄ ${p.coins}`, coins, null, { active: true, size: 18, radius: 20 });
  const partsX = right - 201;
  if (parts) chip(ui, `⬢ ${p.parts}`, { ...coins, x: partsX, w: 89 }, null, { active: true, size: 18, radius: 20 });
  let actionsLeft = parts ? partsX : coins.x;
  if (action) {
    const width = 86;
    actionsLeft -= width + 8;
    chip(ui, action.label, { ...coins, x: actionsLeft, w: width }, action.onClick, { size: 14, radius: 20 });
  }
  if (meta) {
    const x = l + 112 + w + 16;
    const max = Math.max(0, actionsLeft - x - 12);
    ui.text(meta.title, x, t + 14, { size: 16, bold: true, max });
    ui.text(meta.detail, x, t + 33, { size: 12, color: PALE, max });
  }
  return t + 55;
}

export function scrim(ui, color) {
  ui.ctx.fillStyle = color;
  ui.ctx.fillRect(0, 0, ui.w, ui.h);
}

export function meter(ui, x, y, w, h, ratio, fill = '#4f7bff', track = 'rgba(255,255,255,.14)') {
  ui.panel(x, y, w, h, track, h / 2, null);
  if (ratio > 0) ui.panel(x, y, w * Math.min(1, ratio), h, fill, h / 2, null);
}
