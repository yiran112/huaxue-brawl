import { GEAR, TUNE_PLANS, UP_KEYS, UP_MAX } from '../src/gear.js';
import { tuneView } from '../src/ui/tune-state.js';
import { chip, gradient, hit, pageHeader, ribbon, GOLD, PALE } from './paint.js';

function drawTree(ui, graph, view) {
  const { ctx: c } = ui;
  ui.panel(graph.x, graph.y, graph.w, graph.h, gradient(c, graph.x, graph.y, 0, graph.h, '#192f5a', '#0e1b40', '#162c55'), 8, '#6b97d74d');
  const x = (p) => graph.x + graph.w * p.x / 100;
  const y = (p) => graph.y + graph.h * p.y / 100;
  for (const { from, to, recommended } of view.lines) {
    c.beginPath();
    c.moveTo(x(from), y(from));
    c.lineTo(x(to), y(to));
    c.strokeStyle = recommended ? '#71d9f6' : '#45618f';
    c.lineWidth = recommended ? 2.5 : 2;
    c.stroke();
  }

  const nodeW = Math.min(190, graph.w * .19);
  const nodeH = Math.min(83, graph.h * .27);
  for (const node of view.nodes) {
    const box = { x: x(node) - nodeW / 2, y: y(node) - nodeH / 2, w: nodeW, h: nodeH };
    const border = node.selected ? GOLD : node.recommended ? '#85d9f2' : '#688ec6';
    const fill = node.selected ? '#344e86' : node.locked ? '#19284d' : '#253b6a';
    ui.panel(box.x, box.y, box.w, box.h, fill, 8, border);
    if (node.selected) ui.panel(box.x + 2, box.y + 2, box.w - 4, box.h - 4, null, 6, '#ffe38970');
    const iconW = Math.min(44, nodeW * .27);
    const iconSize = Math.min(iconW, nodeH * .64);
    ui.icon(node.id, box.x + iconW / 2 + 4 - iconSize / 2, box.y + (nodeH - iconSize) / 2, iconSize);
    ui.text(node.name, box.x + iconW + 6, box.y + nodeH * .34,
      { size: Math.min(17, nodeH * .30), color: node.locked ? '#bbcde8' : '#edf6ff', bold: true, max: nodeW - iconW - 12 });
    ui.text(`${node.level} / ${UP_MAX}`, box.x + iconW + 6, box.y + nodeH * .71,
      { size: Math.min(13, nodeH * .26), color: node.full ? '#a9f5c0' : PALE, bold: true });
    hit(ui, box, node.name, () => { ui.upSel = node.id; ui.invalidate(); });
  }
}

export function drawTune(ui, gear) {
  const { game, l, r, b, w, h, ctx: c } = ui;
  const profile = game.profile;
  const view = tuneView(profile, gear, ui.upPlan, ui.upSel);
  const { current, reason } = view;
  ui.frame = null;
  c.fillStyle = gradient(c, 0, 0, w * .7, h, '#111d40', '#0a1732');
  c.fillRect(0, 0, w, h);
  const top = pageHeader(ui, '改装', () => ui.back(), { parts: true });
  const compact = b - top < 280;
  const width = r - l;
  const footH = compact ? 56 : 72;
  const foot = b - footH;
  const graphTop = top + (compact ? 40 : 49);
  ui.panel(l, top, width, b - top, '#0c1c4cdd', 8, '#82b9ff66');
  ui.text(GEAR[gear].name, l + 12, top + (compact ? 10 : 15), { size: compact ? 16 : 20, bold: true });
  ui.text(`改装进度 ${view.steps} / ${UP_KEYS.length * UP_MAX}`, l + 12, top + (compact ? 28 : 34), { size: 12, color: PALE });
  const planW = Math.min(116, width * .16);
  Object.entries(TUNE_PLANS).forEach(([id, plan], i) => {
    const on = id === view.plan;
    chip(ui, plan.name, { x: r - 10 - (2 - i) * (planW + 6), y: top + 5, w: planW, h: 30 }, () => {
      ui.upPlan = id;
      ui.upSel = null;
      ui.invalidate();
    }, { fill: on ? '#34466f' : '#14265b', color: on ? GOLD : PALE, size: 14, radius: 6 });
  });
  drawTree(ui, { x: l + 8, y: graphTop, w: width - 16, h: foot - graphTop - 7 }, view);

  const actionW = Math.min(155, width * .24);
  const action = { x: r - actionW - 13, y: foot + (footH - 41) / 2, w: actionW, h: 41 };
  const max = action.x - l - 30;
  ui.panel(l + 8, foot, width - 16, footH - 7, '#233863bb', 6, null);
  ui.text(`${current.name}  ${current.level} / ${UP_MAX}`, l + 18, foot + 12, { size: compact ? 14 : 16, bold: true, max });
  ui.text(`${view.effect} / 级`, l + 18, foot + (compact ? 27 : 32), { size: 12, color: PALE, max });
  if (reason) ui.text(reason, l + 18, foot + (compact ? 41 : 51), { size: 12, color: '#ffc789', max });
  ribbon(ui, '改装', action, reason ? null : () => {
    if (!profile.upgrade(gear, current.id)) ui.toast('改装币不足或节点尚未解锁', true);
    else if (profile.up(gear)[current.id] >= UP_MAX) ui.upSel = null;
    ui.invalidate();
  }, { primary: true, sub: reason ? '' : `⬢ ${view.cost}`, muted: !!reason || profile.parts < view.cost });
}
