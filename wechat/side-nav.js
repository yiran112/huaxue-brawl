import { gradient, hit } from './paint.js';

export function sideNavPanel(ui, { x, y, w, h }) {
  ui.panel(x, y, w, h, '#101d39ed', 9, '#8badde48');
  return { x: x + 6, y: y + 6, w: w - 12, h: h - 12 };
}

export function sideNavRow(ui, box, title, action, {
  active = false, icon = '', detail = '', trailing = '', nested = false, locked = false,
} = {}) {
  const { x, y, w, h } = box;
  if (active) {
    const c = ui.ctx;
    c.fillStyle = gradient(c, x, y, w, 0, '#eef9ff', '#a9ccf9');
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w - 8, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    c.fill();
    ui.panel(x, y, 3, h, '#76d8ff', 1, null);
  } else {
    ui.panel(x, y, w, h, '#75a6f31a', 5, null);
  }

  const color = active ? '#102444' : '#dbeaff';
  const left = x + (icon ? 38 : 11);
  const max = x + w - left - (trailing ? 26 : 10);
  if (icon) ui.text(icon, x + 22, y + h / 2, { size: 22, center: true });
  ui.text(title, left, y + h * (detail ? .35 : .5), { size: nested ? 14 : 16, bold: true, color, max });
  if (detail) ui.text(detail, left, y + h * .73, { size: 11, bold: true, color: active ? '#365374' : locked ? '#ffc5cc' : '#b5cae8', max });
  if (trailing) ui.text(trailing, x + w - 13, y + h / 2, { size: 17, right: true, color });
  hit(ui, box, title, action);
}
