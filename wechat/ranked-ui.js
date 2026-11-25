import { FIRST_WIN_BONUS, RANK_MODES, TIERS } from '../src/rank.js';
import { drawRankCrest, rankedState, RANK_ART_SEED, RANK_COLORS, RANK_MODE_SUMMARY, RANK_RULES, RANK_SECTIONS } from '../src/ui/ranked-state.js';
import { chip, gradient, meter, pageHeader, ribbon, GOLD, NAVY, PALE } from './paint.js';
import { sideNavPanel, sideNavRow } from './side-nav.js';
import { drawTrackArt } from './track-art.js';

function drawSummary(ui, box, title, note, value) {
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, '#192e52e8', 6, '#94b8ef95');
  ui.panel(x, y + 2, 3, h - 4, '#86ccff', 2, null);
  ui.text(title, x + 11, y + h * .32, { size: 17, bold: true });
  ui.text(note, x + 11, y + h * .73, { size: 12, color: PALE, max: w - 77 });
  ui.text(value, x + w - 11, y + h / 2, { size: 20, bold: true, color: GOLD, right: true, max: 67 });
}

function drawTierList(ui, box, view) {
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, '#122349eb', 10, '#8fb8ee80');
  ui.text('段位一览', x + 14, y + 22, { size: 20, bold: true });
  const cell = (w - 22) / TIERS.length;
  const cardH = Math.min(h - 47, 151);
  TIERS.forEach((tier, i) => {
    const left = x + 11 + i * cell;
    const cy = y + 42 + cardH * .36;
    ui.panel(left, y + 39, cell - 4, cardH, i === view.index ? '#b48a3b66' : '#21395e', 6, i === view.index ? GOLD : '#78a5de80');
    drawRankCrest(ui.ctx, left + (cell - 4) / 2, cy, Math.min(cell - 12, cardH * .72), i);
    ui.text(tier.name, left + (cell - 4) / 2, y + 37 + cardH * .71, { size: 15, bold: true, center: true, max: cell - 8 });
    ui.text(`${tier.min} 分起`, left + (cell - 4) / 2, y + 37 + cardH * .88, { size: 11, color: PALE, center: true, max: cell - 8 });
  });
}

export function drawRankMenu(ui) {
  const { game: g, l, r, b, w, h, ctx: c } = ui;
  const { view, mode, games, firstWin, season, dates, left, percent, nextPoints } = rankedState(g.profile, ui.rankMode);
  const section = ui.rankSection || 'rank';
  const width = r - l;
  drawTrackArt(ui, { x: 0, y: 0, w, h }, 'night', RANK_ART_SEED);
  c.fillStyle = gradient(c, 0, 0, w, 0, '#0b1635f8', '#142243b8', '#15275136');
  c.fillRect(0, 0, w, h);
  c.fillStyle = gradient(c, 0, 0, 0, h, '#101b3800', '#101b3822', '#111b38');
  c.fillRect(0, 0, w, h);
  const top = pageHeader(ui, '排位赛', undefined, { meta: { title: season, detail: `${dates} · ${left}` } }) + 2;
  const foot = b - 49;
  const contentH = foot - top - 10;
  const navW = Math.min(171, width * .14);
  const setSection = (id) => { ui.rankSection = id; ui.invalidate(); };
  const showBoard = () => {
    ui.boardKey = 'rank';
    ui.boardRules = false;
    ui.offsets.delete('board');
    ui.racePick = 'home';
    ui.page('');
    ui.refreshBoard();
  };
  const nav = [...RANK_SECTIONS, ['board', '段位榜 ›']];
  const rowH = Math.min(44, (contentH - 12) / nav.length);
  const navBox = sideNavPanel(ui, { x: l, y: top, w: navW, h: rowH * nav.length + 12 });
  nav.forEach(([id, name], i) => {
    const box = { ...navBox, y: navBox.y + i * rowH, h: rowH - 4 };
    sideNavRow(ui, box, name, id === 'board' ? showBoard : () => setSection(id), { active: id === section });
  });
  const main = { x: l + navW + 16, y: top, w: width - navW - 16, h: contentH };
  if (section === 'tiers') drawTierList(ui, main, view);
  else if (section === 'rules') {
    ui.panel(main.x, main.y, main.w, main.h, '#122349ef', 10, '#8fb8ee80');
    ui.text('排位规则', main.x + 14, main.y + 22, { size: 20, bold: true });
    ui.paragraph(RANK_RULES, main.x + 14, main.y + 49, main.w - 28, { size: 14, lines: 3 });
    ui.text(mode.name, main.x + 14, main.y + 103, { size: 17, bold: true, color: GOLD });
    ui.paragraph(mode.blurb, main.x + 14, main.y + 125, main.w - 28, { size: 14, lines: 3 });
  } else {
    const sideW = Math.min(385, width * .30);
    const center = main.x + (main.w - sideW) / 2;
    const badge = Math.min(234, Math.max(75, contentH - 96), (main.w - sideW) * .72);
    const cy = top + (contentH - (badge + 79)) / 2;
    drawRankCrest(c, center, cy + badge / 2, badge, view.index);
    ui.text(view.name, center, cy + badge + 2, { size: Math.min(34, contentH * .17), bold: true, center: true, color: RANK_COLORS[view.index][0] });
    ui.text(view.star, center, cy + badge + 24, { size: 15, center: true, color: GOLD });
    ui.text(`${view.pts}${nextPoints ? ` / ${nextPoints}` : ' 分'}`, center, cy + badge + 45, { size: 23, bold: true, center: true });
    const meterW = Math.min(208, (main.w - sideW) * .8);
    meter(ui, center - meterW / 2, cy + badge + 59, meterW, 5, percent / 100, '#a7e9ff', '#122346');
    ui.text(`${view.next}${nextPoints ? ' 分' : ''}`, center, cy + badge + 76, { size: 12, center: true, color: PALE });
    const hCard = Math.min(65, contentH * .32);
    const side = { x: r - sideW, y: foot - 17 - 2 * hCard, w: sideW, h: hCard };
    drawSummary(ui, side, '今日首胜', firstWin ? '已完成' : '未完成', `+${FIRST_WIN_BONUS} 分`);
    drawSummary(ui, { ...side, y: side.y + hCard + 6 }, '本赛季', `生涯 ${view.wins} 胜 / ${view.games} 场`, `${games} 场`);
  }

  const infoW = Math.min(253, width * .24);
  const goW = Math.min(200, width * .21);
  const modeW = (width - infoW - goW - 30) / RANK_MODES.length;
  ui.panel(l, foot, infoW, 45, '#192d50e8', 6, '#94b8ef75');
  ui.text(mode.name, l + 10, foot + 13, { size: 15, bold: true, max: infoW - 15 });
  ui.text(RANK_MODE_SUMMARY[mode.id], l + 10, foot + 32, { size: 12, color: PALE, max: infoW - 16 });
  RANK_MODES.forEach((spec, i) => {
    const active = spec.id === mode.id;
    const x = l + infoW + 7 + i * (modeW + 7);
    chip(ui, spec.name, { x, y: foot, w: modeW, h: 45 }, () => {
      if (active) return;
      if (g.netMode && !g.customRoom && g.rankMode) g.leavePublicQueue();
      ui.rankMode = spec.id;
      ui.invalidate();
    }, { fill: active ? '#c9e9ff' : '#304a7a', color: active ? NAVY : '#f0f6ff', size: 17, radius: 6 });
  });
  const matching = !!ui.queue && !!g.rankMode;
  const seconds = matching ? Math.max(0, Math.floor((Date.now() - ui.queue.at) / 1000)) : 0;
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  ribbon(ui, matching ? `匹配中 ${elapsed}` : '开始匹配', { x: r - goW, y: foot, w: goW, h: 45 }, () => {
    if (g.mini.online) g.startRank(mode.id);
    else ui.toast('联机服务暂不可用', true);
  }, { primary: true, sub: matching ? '点击取消' : '' });
}
