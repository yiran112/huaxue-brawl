import { LENGTHS, MODE_KEYS, MODES, THEMES, THEME_KEYS } from '../src/config.js';
import { CUP_LV, seasonNow, seasonLeftText, rankSeasonNow, seasonReward } from '../src/profile.js';
import { RANK_LV, RANK_MODES, TIERS } from '../src/rank.js';
import { CUPS, TRACKS, TRACK_MAP, medalTimes } from '../src/tracks.js';
import { MODE_STYLE, THEME_ICON, TIER_ICONS, hex } from '../src/ui/common.js';
import { FEAT, trackFeats } from '../src/ui/trackArt.js';
import { clamp, fmtTime } from '../src/util.js';
import { card, chip, gradient, hit, meter, pageHeader, scrim, GOLD, NAVY, PALE, ribbon } from './paint.js';
import { drawTrackArt } from './track-art.js';

const TABS = [['growth', '成长'], ['garage', '车库'], ['shop', '商城'], ['look', '角色'], ['set', '设置']];
const BOARD = [['points', '积分'], ['hits', '击飞'], ['tt', '计时'], ['rank', '段位']];
const CUP_COLORS = ['#42a8fb', '#39cb9c', '#a27af6', '#f9ad42'];
const SKEW = -.14;

function showHall(ui) {
  ui.page('');
  if (ui.game.mini.online) ui.game.openHall();
  else {
    ui.racePick = 'hall';
    ui.invalidate();
  }
}

function profileBar(ui, box) {
  const g = ui.game;
  const p = g.profile;
  const info = p.levelInfo();
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, 'rgba(255,255,255,.08)', 12, null);
  const nick = g.account.ready ? g.playerName : '存档';
  const nickW = Math.min(100, 24 + nick.length * 13);
  chip(ui, nick, { x: x + 12, y: y + 8, w: nickW, h: 22 }, () => g.account.openManage(), { size: 13, radius: 8 });
  ui.text(`Lv.${info.lv}`, x + nickW + 23, y + h / 2, { bold: true, italic: true, size: 19, color: GOLD });
  const bw = Math.max(30, w - nickW - 172);
  meter(ui, x + nickW + 66, y + h / 2 - 4, bw, 8, info.need ? info.cur / info.need : 1,
    gradient(ui.ctx, x, y, w, 0, '#4fd2ff', '#8dff6a'));
  ui.text(info.need ? `${info.cur}/${info.need}` : 'MAX', x + w - 67, y + h / 2, { right: true, bold: true, size: 12, max: 52 });
  ui.text(`❄ ${p.coins}`, x + w - 12, y + h / 2, { right: true, bold: true, size: 15, color: '#9fe4ff', max: 57 });
}

function homeHeader(ui) {
  const { l, t, r } = ui;
  const wrap = ui.w <= 1100;
  const h = wrap ? 105 : 61;
  card(ui, { x: l + 1, y: t + 1, w: r - l - 2, h: h - 2 }, 'rgba(11,21,48,.88)', {
    radius: 22, stroke: 'rgba(220,232,255,.24)', width: 3, shadow: 0,
  });
  ui.text('雪山大乱斗', l + 22, t + (wrap ? 31 : 30), { size: clamp(ui.w * .025, 28, 42), bold: true, italic: true, color: GOLD, outline: true });
  if (!wrap && ui.w > 1320) ui.text('一边高速滑雪，一边掏出火箭筒打架 · 谁先冲到山脚谁就赢', l + 23, t + 47,
    { size: 12, color: PALE, bold: true, max: (ui.w - 640) / 2 });
  const profileW = Math.min(340, (r - l) * .32);
  const right = ui.headerRight(t + 30) - 18;
  profileBar(ui, { x: right - profileW, y: t + (wrap ? 11 : 12), w: profileW, h: 38 });
  const tabW = wrap ? r - l - 40 : Math.min(440, r - l - profileW - 238);
  const x = wrap ? l + 20 : (l + right - tabW - profileW) / 2 + 118;
  TABS.forEach(([key, label], i) => chip(ui, label, {
    x: x + i * (tabW + 6) / 5, y: t + (wrap ? 57 : 12), w: (tabW - 24) / 5, h: 37,
  }, () => ui.openTab(key), { size: 16, radius: 11 }));
  return t + h + 10;
}

function boardEntries(ui, key) {
  const g = ui.game;
  const p = g.profile;
  const mine = p.data.season?.id === seasonNow().id ? p.data.season : {};
  const rank = p.rankState();
  const me = { ...mine, name: g.playerName, jacket: g.look.jacket, title: p.data.title, rankPts: rank.pts, rankGames: rank.sg, me: true };
  const rows = [...(ui.boardRows || []).filter((r) => !r.me), me];
  const score = key === 'rank' ? 'rankPts' : key;
  return rows.filter((r) => key === 'tt' ? r.tt > 0 : key === 'rank' ? r.rankGames > 0 : r.me || r[score] > 0)
    .sort((a, b) => key === 'tt' ? a.tt - b.tt : (b[score] || 0) - (a[score] || 0));
}

function drawBoard(ui, x, y, w) {
  const key = ui.boardKey || 'points';
  const season = key === 'rank' ? rankSeasonNow() : seasonNow();
  const rows = boardEntries(ui, key);
  const listH = clamp(rows.length * 47 + 5, 52, ui.b - y - 258);
  const h = 213 + listH;
  card(ui, { x, y, w, h }, 'rgba(11,21,48,.93)', { radius: 22, stroke: 'rgba(255,255,255,.26)', shadow: 0 });
  ui.rounded(x + 3, y + 3, w - 6, h - 6, 19);
  ui.ctx.save();
  ui.ctx.clip();
  ui.ctx.fillStyle = gradient(ui.ctx, x, y, 0, 75, '#ffc15a', '#ff8a1f');
  ui.ctx.fillRect(x, y, w, 74);
  ui.ctx.restore();
  ui.text(`第 ${season.id} 赛季`, x + 17, y + 29, { color: '#3b2208', size: 22, bold: true, italic: true });
  ui.text(seasonLeftText(season.left), x + 17, y + 53, { color: '#3b2208', size: 12, bold: true });
  const slot = (w - 20) / 4;
  BOARD.forEach(([id, label], i) => chip(ui, label, { x: x + 10 + i * slot, y: y + 82, w: slot - 5, h: 32 }, () => {
    ui.boardKey = id;
    ui.boardRules = false;
    ui.offsets.delete('board');
    ui.invalidate();
    ui.refreshBoard();
  }, { active: key === id, radius: 18 }));
  const list = { x: x + 10, y: y + 122, w: w - 20, h: listH + 17 };
  if (ui.boardRules) {
    ui.paragraph('积分榜按名次计分。快速赛、联机赛需至少 4 人且完成比赛。击飞、计时和段位另行排名。每周结算积分榜奖励。', list.x + 4, list.y + 12, list.w - 10,
      { size: 13, lines: 3, bold: true });
  } else {
    ui.scrollArea('board', list, rows.length * 47, (offset) => {
      if (!rows.length) ui.text('本赛季暂无成绩', list.x + 7, list.y + 12, { size: 13, color: PALE });
      rows.forEach((row, index) => {
        const yy = list.y + index * 47 - offset;
        if (yy + 45 < list.y || yy >= list.y + list.h) return;
        const style = index < 3 ? gradient(ui.ctx, list.x, yy, list.w, 0, 'rgba(255,194,70,.27)', 'rgba(255,255,255,.06)') : 'rgba(255,255,255,.06)';
        ui.panel(list.x + 1, yy + 1, list.w - 2, 45, style, 11, row.me ? GOLD : null);
        ui.text(index + 1, list.x + 20, yy + 23, { size: 18, color: GOLD, bold: true, italic: true, center: true });
        ui.panel(list.x + 37, yy + 6, 34, 34, row.jacket ? hex(row.jacket) : '#ff8a1f', 18, null);
        ui.text(row.name.slice(0, 1), list.x + 54, yy + 23, { size: 15, bold: true, center: true });
        ui.text(row.name, list.x + 80, yy + (row.title ? 17 : 22), { size: 14, bold: true, max: list.w - 137 });
        if (row.title) ui.text(row.title, list.x + 80, yy + 31, { size: 11, color: PALE, max: list.w - 137 });
        ui.text(key === 'tt' ? fmtTime(row.ttTime) : (row[key === 'rank' ? 'rankPts' : key] || 0), list.x + list.w - 8,
          yy + 20, { size: 16, bold: true, right: true, max: 60 });
      });
    });
  }
  [`第1名 ❄${seasonReward(1)}`, `2–3 ❄${seasonReward(2)}`, `4–10 ❄${seasonReward(4)}`, `11–50 ❄${seasonReward(11)}`].forEach((label, i) => chip(ui, label, {
    x: x + 10 + i * slot, y: y + h - 80, w: slot - 5, h: 21,
  }, null, { size: 10, radius: 7 }));
  chip(ui, ui.boardRules ? '返回榜单' : '上榜规则', { x: x + 10, y: y + h - 50, w: w - 20, h: 36 }, () => {
    ui.boardRules = !ui.boardRules;
    ui.invalidate();
  }, { size: 14 });
  return h;
}

export function taskResetText() {
  const now = new Date();
  const minutes = Math.ceil((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 60000);
  const h = Math.floor(minutes / 60);
  return `${h ? h + ' 小时 ' : ''}${minutes % 60} 分钟后刷新`;
}

function daily(ui, box) {
  card(ui, box, ['#fff5d7', '#ffe6aa'], { stripe: .22, radius: 18 });
  const tasks = ui.game.profile.dailyTasks();
  const { x, y, h } = box;
  card(ui, { x: x + 24, y: y + 13, w: 49, h: 49 }, ['#77bfff', '#2f7bff'], { shadow: 3, stroke: null, radius: 11 });
  ui.text('📋', x + 48, y + 38, { size: 28, center: true });
  ui.text('每日任务', x + 89, y + 28, { color: '#3b2208', size: 20, bold: true, italic: true });
  tasks.forEach((t, i) => ui.panel(x + 181 + i * 24, y + 21, 15, 15, t.done ? '#ffb52d' : '#fff', 9, '#c8984b'));
  ui.text(tasks.every((t) => t.done) ? '今天的任务全部完成！' : taskResetText(), x + 89, y + h - 22, { size: 12, color: '#765323', bold: true });
  hit(ui, box, '每日任务', () => ui.page('tasks'));
}

function raceCard(ui, box) {
  const g = ui.game;
  const r = g.soloRules;
  const m = MODES[r.mode];
  const { x, y, w, h } = box;
  card(ui, box, 'rgba(10,18,50,.94)', { skew: SKEW, radius: 16 });
  const go = { x: x + w * .41, y: y + h * .54, w: w * .57 - 5, h: h * .41 };
  const c = ui.ctx;
  c.save();
  c.translate(x + 8, y + 7);
  c.transform(1, 0, SKEW, 1, -SKEW * (h - 14) / 2, 0);
  const left = go.x - x - 22, split = go.y - y - 14, pw = w - 16, ph = h - 14, rr = 12;
  c.beginPath();
  c.moveTo(rr, 0);
  c.arcTo(pw, 0, pw, split, rr);
  c.arcTo(pw, split, left, split, rr);
  c.arcTo(left, split, left, ph, 19);
  c.arcTo(left, ph, 0, ph, rr);
  c.arcTo(0, ph, 0, 0, rr);
  c.arcTo(0, 0, pw, 0, rr);
  c.closePath();
  c.save();
  c.clip();
  c.fillStyle = gradient(c, 0, 0, pw, ph * .4, ...MODE_STYLE[r.mode].c);
  c.fillRect(0, 0, pw, ph);
  c.fillStyle = gradient(c, 0, 0, pw, 0, 'rgba(10,18,50,.9)', 'rgba(10,18,50,.2)');
  c.fillRect(0, 0, pw, ph);
  c.globalAlpha = .38;
  ui.text(m.icon, pw * .52, 48, { size: 103, center: true, max: 122 });
  c.restore();
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,255,255,.52)';
  c.stroke();
  c.restore();
  const track = TRACK_MAP[r.track];
  const solo = r.mode === 'tt';
  const scene = r.theme === 'random' ? '随机场景' : THEMES[r.theme].name;
  ui.text(solo && track ? track.name : '随机赛道', x + 31, y + 22, { size: 18, bold: true, max: w * .52 });
  chip(ui, solo ? '单人' : '8 人', { x: x + 118, y: y + 10, w: 45, h: 19 }, null, { size: 12, radius: 12 });
  chip(ui, solo ? (track ? THEMES[track.theme].name : scene) : '随机场景', { x: x + 31, y: y + 33, w: 75, h: 20 }, null, { size: 12, radius: 12 });
  ui.text(m.name, x + 29, y + 79, { color: GOLD, size: 34, bold: true, italic: true, max: w * .63 });
  chip(ui, '⇄', { x: x + w - 81, y: y + 26, w: 54, h: 54 }, null, { active: true, size: 29, radius: 30 });
  hit(ui, box, '切换玩法', () => ui.page('mode'));
  card(ui, go, ui.queue ? ['#ffb03a', '#ff5a2a'] : ['#ffe55e', '#ffb400'],
    { skew: SKEW, radius: 14, stripe: .16, stroke: '#fff3b0', shadow: 4 });
  const label = ui.queue ? '匹配中' : '开始比赛';
  ui.text(label, go.x + go.w / 2, go.y + go.h / 2, {
    size: Math.min(39, go.w / 5.1), color: ui.queue ? '#fff' : '#3a2400', bold: true, italic: true, center: true,
  });
  hit(ui, go, label, () => g.mini.online && r.mode !== 'tt' ? g.startMatch() : g.startTournament(), true);
}

function midCard(ui, box, title, icon, colors, action, sub = '') {
  card(ui, box, colors, { skew: SKEW, stripe: .08 });
  const { x, y, w, h } = box;
  chip(ui, icon, { x: x + 24, y: y + (h - 42) / 2, w: 42, h: 42 }, null, { active: true, size: 24, radius: 22 });
  ui.text(title, x + 79, y + h * (sub ? .40 : .5), { size: 23, bold: true, italic: true, max: w - 103 });
  if (sub) ui.text(sub, x + 80, y + h * .65, { color: GOLD, size: 12, bold: true, max: w - 103 });
  ui.text('›', x + w - 24, y + h / 2, { size: 28, right: true, bold: true, color: '#ffffffc8' });
  hit(ui, box, title, action);
}

function homeTrack(ui, box) {
  const g = ui.game;
  const r = g.soloRules;
  const t = TRACK_MAP[r.track];
  const theme = t?.theme || r.theme;
  const { x, y, w, h } = box;
  card(ui, box, ['#8658ea', '#2a1270'], { skew: SKEW, stripe: .085 });
  const cx = x + w / 2;
  ui.text('赛道 · 场景', cx, y + 22, { center: true, color: '#d8d1ff', bold: true, size: 12 });
  ui.text(t ? THEME_ICON[theme] : '🎲', cx, y + h * .39, { center: true, size: 40 });
  ui.text(t ? t.name : '随机生成', cx, y + h * .65, { center: true, bold: true, italic: true, size: 18, max: w - 18 });
  ui.text(theme === 'random' ? '随机场景' : THEMES[theme].name, cx, y + h * .77, { center: true, bold: true, size: 12 });
  ui.text(t ? `${(t.length / 1000).toFixed(1)} km` : LENGTHS[r.length].name, cx, y + h * .88, { center: true, color: PALE, size: 11 });
  hit(ui, box, '赛道 · 场景', () => ui.page('track'));
}

export function drawHome(ui) {
  const g = ui.game;
  const p = g.profile;
  scrim(ui, gradient(ui.ctx, 0, 0, 0, ui.h, 'rgba(11,21,48,.4)', 'rgba(11,21,48,0)', 'rgba(11,21,48,.2)'));
  const y = homeHeader(ui);
  const bw = clamp(ui.w * .24, 300, 420);
  const boardH = drawBoard(ui, ui.l, y, bw);
  daily(ui, { x: ui.l + 1, y: y + boardH + 12, w: bw - 2, h: 75 });
  const h = clamp(ui.h * .25, 176, 232);
  const x = Math.max(ui.l + bw + 17, ui.r - 986);
  const rowW = ui.r - x - 14;
  const large = (rowW - 26) * 1.5 / 3.14;
  const mid = (rowW - 26) / 3.14;
  const track = rowW - large - mid - 26;
  const by = ui.b - h - 5;
  raceCard(ui, { x, y: by, w: large, h });
  const mx = x + large + 13;
  const mh = (h - 12) / 2;
  const rank = p.rankOpen() ? p.rankView().line : `Lv.${RANK_LV} 开启`;
  midCard(ui, { x: mx, y: by, w: mid, h: mh }, '排位赛', '🏅', ['#7a5cff', '#4a2fd0'], () => ui.page('rank'), rank);
  midCard(ui, { x: mx, y: by + mh + 12, w: mid, h: mh }, '开房间', '🏠', ['#5bb487', '#2e8a62'],
    () => showHall(ui));
  homeTrack(ui, { x: mx + mid + 13, y: by, w: track, h });
  ui.frame = { x: ui.l + bw, y, w: ui.r - ui.l - bw, h: by - y };
}

export function drawModePicker(ui) {
  const g = ui.game;
  drawHome(ui);
  ui.hits = [];
  ui.gestures = [];
  scrim(ui, 'rgba(10,17,47,.91)');
  pageHeader(ui, '模式选择', () => ui.page(''));
  const gap = 14;
  const h = Math.min(288, ui.b - ui.t - 116);
  const left = ui.l + 21;
  const w = (ui.r - left - 20 - (MODE_KEYS.length - 1) * gap) / MODE_KEYS.length;
  MODE_KEYS.forEach((id, i) => {
    const m = MODES[id], style = MODE_STYLE[id];
    const x = left + i * (w + gap), y = Math.max(ui.t + 64, (ui.h - h) * .57);
    const box = { x, y, w, h };
    const selected = g.soloRules.mode === id;
    card(ui, box, style.c, { skew: -.20, stripe: .10, stroke: selected ? GOLD : '#ffffffe0' });
    ui.text('▸▸▸', x + 28, y + 20, { color: '#ffffffe0', size: 15, bold: true });
    if (selected) chip(ui, '上次玩的', { x: x + w / 2 - 29, y: y + 34, w: 58, h: 17 }, null, {
      fill: 'rgba(57,32,4,.54)', color: '#fff', size: 10, radius: 5,
    });
    ui.panel(x + w / 2 - 40, y + 41, 80, 80, 'rgba(255,255,255,.10)', 44, '#ffffff80');
    ui.text(m.icon, x + w / 2, y + 79, { size: 45, center: true });
    if (style.rec) chip(ui, '推荐', { x: x + w / 2 - 28, y: y + 128, w: 56, h: 20 }, null, { fill: GOLD, color: NAVY, size: 13, radius: 2 });
    ui.text(m.name, x + w / 2, y + 164, { center: true, bold: true, size: 24, max: w - 10 });
    ui.text(style.en, x + w / 2, y + 187, { center: true, size: 11, bold: true, color: '#ffffffe0', max: w - 14 });
    ui.paragraph(m.desc, x + w / 2, y + 208, w - 24, { center: true, size: 12, lines: 4, color: '#fff', bold: true });
    hit(ui, box, m.name, () => { g.setRule('mode', id); ui.page(''); });
  });
}

function choices(ui, label, box, values, value, onChoose) {
  ui.text(label, box.x, box.y + 13, { size: 12, bold: true, color: PALE });
  let x = box.x + 34;
  for (const [key, name] of values) {
    const w = Math.min(125, 19 + name.length * 12);
    chip(ui, name, { x, y: box.y, w, h: 27 }, () => onChoose(key), { active: value === key, size: 12, radius: 14 });
    x += w + 6;
  }
}

function trackTile(ui, box, def, theme, isSelected) {
  const g = ui.game, r = g.soloRules, p = g.profile;
  const { x, y, w, h } = box;
  const selected = isSelected;
  const cup = def ? CUPS.findIndex((c) => c.tracks.includes(def.id)) : -1;
  const open = !def || p.trackUnlocked(def.id);
  const scene = def?.theme || theme || r.theme;
  const seed = def?.seed || 901 + THEME_KEYS.indexOf(scene) * 37;
  ui.ctx.save();
  ui.rounded(x, y, w, h, 12);
  ui.ctx.clip();
  drawTrackArt(ui, box, scene, seed);
  if (!open) {
    ui.panel(x, y, w, h, 'rgba(11,21,48,.52)', 0, null);
    ui.text(`🔒 Lv.${CUP_LV[cup]} 解锁`, x + w / 2, y + h / 2 - 10, { size: 19, bold: true, center: true });
  }
  ui.panel(x, y, 70, 26, cup >= 0 ? CUP_COLORS[cup] : GOLD, 0, null);
  ui.text(cup >= 0 ? CUPS[cup].name : '随机', x + 13, y + 14, { size: 14, bold: true, color: cup >= 0 ? '#fff' : NAVY });
  if (selected) chip(ui, '已选择', { x: x + 12, y: y + 33, w: 55, h: 21 }, null, { fill: GOLD, color: NAVY, size: 12, radius: 7 });
  if (!def) {
    ui.text(scene === 'random' ? '🎲  全部随机' : '🎲  随机生成', x + w / 2, y + h * .37, { size: 25, center: true, outline: true, italic: true, bold: true });
    ui.text('RANDOM', x + w / 2 + 10, y + h * .49, { size: 12, center: true, bold: true, color: PALE });
  } else {
    ui.text('★'.repeat(cup + 1), x + w - 11, y + 20, { size: 17, right: true, color: GOLD, bold: true });
    trackFeats(def).forEach((f, i) => {
      ui.panel(x + w - 35, y + 34 + i * 25, 24, 23, 'rgba(11,21,48,.62)', 6, null);
      ui.text(FEAT[f][0], x + w - 23, y + 46 + i * 25, { size: 14, center: true });
    });
  }
  ui.panel(x, y + h - 44, w, 44, 'rgba(11,21,48,.77)', 0, null);
  ui.text(def ? '🏆' : (THEME_ICON[scene] || '🎲'), x + 24, y + h - 22, { center: true, size: 17 });
  ui.text(def?.name || (THEMES[scene]?.name || '随机场景'), x + 47, y + h - 29, { size: 16, bold: true });
  ui.text(def ? (p.data.best[def.id] ? `最好 ${fmtTime(p.data.best[def.id])}` : THEMES[scene].name) : '每局都是新赛道',
    x + 47, y + h - 12, { size: 11, color: PALE });
  ui.text(`${((def?.length || LENGTHS[r.length].length) / 1000).toFixed(1)} km`, x + w - 13, y + h - 18, {
    size: 24, color: '#ffe285', bold: true, italic: true, right: true,
  });
  ui.ctx.restore();
  ui.rounded(x, y, w, h, 12);
  ui.ctx.strokeStyle = selected ? GOLD : 'rgba(170,215,255,.6)';
  ui.ctx.lineWidth = selected ? 3 : 1.5;
  ui.ctx.stroke();
  hit(ui, box, def?.name || '随机生成', () => {
    if (!open) return ui.toast(`Lv.${CUP_LV[cup]} 解锁`, true);
    if (selected) return ui.racePick === 'room' ? ui.page('') : g.startTournament();
    if (!def && theme) g.setRule('theme', theme);
    if (r.track !== (def?.id || 'random')) g.setRule('track', def?.id || 'random');
    ui.invalidate();
  });
}

export function drawTrackMenu(ui) {
  const g = ui.game, r = g.soloRules, p = g.profile;
  const def = TRACK_MAP[r.track];
  const y = pageHeader(ui, '赛道大厅');
  const x = ui.l, w = ui.r - x, h = ui.b - y;
  card(ui, { x, y, w, h }, ['rgba(44,79,178,.92)', 'rgba(16,30,83,.97)'],
    { stroke: 'rgba(111,165,255,.73)', width: 2, shadow: 4 });
  const active = ui.trackGroup || 'all';
  const nav = [['all', '🗺️', '全部赛道', `${TRACKS.length} 条固定 + 随机`],
    ['random', '🎲', '随机生成', '每局都不一样'],
    ...CUPS.map((cup, i) => [cup.id, p.trackUnlocked(cup.tracks[0]) ? cup.icon : '🔒', cup.name,
      p.trackUnlocked(cup.tracks[0]) ? `奖牌 ${cup.tracks.filter((id) => p.data.medals[id]).length} / ${cup.tracks.length}` : `Lv.${CUP_LV[i]} 解锁`])];
  nav.forEach(([id, icon, label, detail], i) => {
    const row = { x: x + 2, y: y + 15 + i * 57, w: 172, h: 57 };
    if (id === active) {
      ui.panel(row.x, row.y, row.w, row.h, gradient(ui.ctx, row.x, row.y, row.w, 0, 'rgba(120,200,255,.40)', 'rgba(120,200,255,0)'), 0, null);
      ui.panel(row.x, row.y, 4, row.h, '#6fe0ff', 0, null);
    }
    ui.text(icon, x + 35, row.y + 29, { size: 23, center: true });
    ui.text(label, x + 60, row.y + 21, { size: 17, bold: true });
    ui.text(detail, x + 60, row.y + 40, { size: 11, bold: true, color: PALE });
    hit(ui, row, label, () => { ui.trackGroup = id; ui.offsets.delete('tracks'); ui.invalidate(); });
  });
  const bx = x + 188, by = y + 15, bw = w - 205;
  ui.panel(bx, by, bw, 114, 'rgba(10,24,71,.68)', 13, null);
  chip(ui, def ? '固定' : '随机', { x: bx + 13, y: by + 10, w: 59, h: 25 }, null, { color: NAVY, fill: GOLD, size: 13, radius: 3 });
  ui.text(def?.name || '随机生成', bx + 91, by + 23, { size: 21, italic: true, bold: true });
  ui.text(def?.desc || '每局重新生成地形和近道', bx + 184, by + 23, { size: 12, bold: true, color: PALE, max: bw - 196 });
  if (def) {
    const times = medalTimes(def.length);
    ui.text(times.map((time, i) => `${['🥇', '🥈', '🥉'][i]} ${fmtTime(time)}`).join('   '), bx + 15, by + 57, { size: 14, bold: true });
    if (def.id === 'cedar') {
      chip(ui, '🎿 双板试滑', { x: bx + 13, y: by + 77, w: 111, h: 26 }, () => g.startPractice('ski'), { active: true, radius: 15 });
      chip(ui, '🏂 单板试滑', { x: bx + 131, y: by + 77, w: 111, h: 26 }, () => g.startPractice('learner'), { active: true, radius: 15 });
    }
  } else {
    choices(ui, '场景', { x: bx + 13, y: by + 44 }, [...THEME_KEYS.map((key) => [key, THEME_ICON[key] + ' ' + THEMES[key].name]), ['random', '🎲 随机']],
      r.theme, (value) => { g.setRule('theme', value); ui.invalidate(); });
    choices(ui, '长度', { x: bx + 13, y: by + 78 }, Object.entries(LENGTHS).map(([id, item]) => [id, item.name]), r.length,
      (value) => { g.setRule('length', value); ui.invalidate(); });
  }
  const cells = active === 'random' ? ['random', ...THEME_KEYS].map((theme) => ({ theme })) : [
    ...(active === 'all' ? [{}] : []),
    ...(active === 'all' ? TRACKS : CUPS.find((cup) => cup.id === active)?.tracks.map((id) => TRACK_MAP[id]) || []).map((def) => ({ def })),
  ];
  const list = { x: bx + 2, y: by + 129, w: bw, h: ui.b - by - 219 };
  const cols = Math.max(2, Math.floor(list.w / 325));
  const cw = (list.w - (cols - 1) * 13 - 10) / cols;
  const ch = Math.max(132, cw * .438);
  ui.scrollArea('tracks', list, Math.ceil(cells.length / cols) * (ch + 13), (offset) => {
    cells.forEach(({ def, theme }, i) => {
      const cy = list.y + Math.floor(i / cols) * (ch + 13) - offset;
      if (cy + ch < list.y || cy > list.y + list.h) return;
      const selected = def ? r.track === def.id : r.track === 'random' && (!theme || theme === r.theme);
      trackTile(ui, { x: list.x + (i % cols) * (cw + 13), y: cy, w: cw, h: ch }, def, theme, selected);
    });
  });
  ui.text('选中的卡片再点一次，按当前玩法直接出发', x + 22, ui.b - 48, { size: 12, color: PALE, bold: true });
  const fromRoom = ui.racePick === 'room';
  if (!fromRoom) ribbon(ui, '开房间', { x: ui.r - 425, y: ui.b - 76, w: 164, h: 58 }, () => showHall(ui),
    { skew: SKEW, sub: '房间列表' });
  ribbon(ui, fromRoom ? '用这条开始' : '开始这场', { x: ui.r - 247, y: ui.b - 76, w: 224, h: 58 }, () => fromRoom ? ui.page('') : g.startTournament(),
    { skew: SKEW, primary: true, sub: `${MODES[r.mode].icon} ${MODES[r.mode].name}` });
}

export function drawRankMenu(ui) {
  const g = ui.game, p = g.profile;
  const y = pageHeader(ui, '排位赛') - 24;
  const x = ui.l + clamp(ui.w * .24, 300, 420) + 15;
  const w = ui.r - 12 - x, h = ui.b - y;
  const view = p.rankView();
  card(ui, { x, y, w, h }, 'rgba(35,30,78,.89)', { radius: 20 });
  ui.text(`${view.name} ${view.star}`, x + 23, y + 42, { bold: true, italic: true, size: 30 });
  ui.text(`${view.pts} 分 · ${view.next}`, x + w - 19, y + 31, { bold: true, right: true, size: 14 });
  ui.text(`${view.wins} 胜 / ${view.games} 场`, x + w - 19, y + 50, { bold: true, right: true, size: 13 });
  const stride = (w - 46) / TIERS.length;
  TIERS.forEach((tier, i) => {
    const h = 37 + i * 6;
    const b = { x: x + 23 + i * stride, y: y + 184 - h, w: stride - 5, h };
    const on = i === view.index;
    ui.panel(b.x, b.y, b.w, b.h, on ? gradient(ui.ctx, b.x, b.y, 0, b.h, '#daa05d', '#9d5a26') : '#ffffff33', 7, on ? '#fff' : null);
    ui.text(TIER_ICONS[i], b.x + b.w / 2, b.y - 15, { size: 24, center: true });
    ui.text(tier.name, b.x + b.w / 2, b.y + 14, { size: 14, center: true, bold: true });
    ui.text(tier.min + (i === TIERS.length - 1 ? '+' : ''), b.x + b.w / 2, b.y + 30, { size: 11, center: true, color: PALE });
  });
  const picked = RANK_MODES.find((rank) => rank.id === ui.rankMode) || RANK_MODES[0];
  const cell = (w - 46 - 20) / 3;
  RANK_MODES.forEach((rank, i) => {
    const box = { x: x + 23 + i * (cell + 10), y: y + 201, w: cell, h: 146 };
    ui.panel(box.x, box.y, box.w, box.h, rank === picked ? 'rgba(255,210,60,.17)' : 'rgba(255,255,255,.08)', 14, rank === picked ? GOLD : '#ffffff55');
    ui.text(rank.icon, box.x + 16, box.y + 34, { size: 26 });
    ui.text(rank.name, box.x + 15, box.y + 66, { size: 18, bold: true });
    ui.paragraph(rank.blurb, box.x + 15, box.y + 88, box.w - 28, { size: 12, color: PALE, bold: true, lines: 3 });
    hit(ui, box, rank.name, () => { ui.rankMode = rank.id; ui.invalidate(); });
  });
  ribbon(ui, '开始匹配', { x: ui.r - 261, y: ui.b - 73, w: 228, h: 57 }, () => {
    if (g.mini.online) g.startRank(picked.id);
    else ui.toast('联机服务暂不可用', true);
  }, { skew: SKEW, primary: true, sub: picked.name });
}

export function drawHall(ui) {
  const g = ui.game;
  const y = pageHeader(ui, '开房间', () => ui.back());
  const x = ui.l, w = ui.r - x;
  card(ui, { x, y, w, h: ui.b - y }, 'rgba(24,40,91,.92)', { radius: 20 });
  const filters = [['all', '全部'], ...MODE_KEYS.filter((key) => key !== 'tt').map((key) => [key, MODES[key].icon + ' ' + MODES[key].name])];
  choices(ui, '玩法', { x: x + 21, y: y + 18 }, filters, ui.hallMode, (key) => {
    ui.hallMode = key;
    ui.offsets.delete('hall');
    ui.invalidate();
  });
  const rooms = ui.hallRooms.filter((item) => ui.hallMode === 'all' || item.mode === ui.hallMode);
  if (!rooms.length) {
    ui.text(g.mini.online ? '还没有人开房' : '联机服务暂不可用', x + w / 2, y + 173, { center: true, bold: true, size: 22, color: PALE });
    if (g.mini.online) ui.text('创建一个，别人就能从这里进来', x + w / 2, y + 208, { center: true, size: 14, color: PALE });
  }
  const list = { x: x + 22, y: y + 59, w: w - 44, h: ui.b - y - 152 };
  const cw = (list.w - 24) / 3;
  ui.scrollArea('hall', list, Math.ceil(rooms.length / 3) * 160, (offset) => rooms.forEach((room, i) => {
    const box = { x: list.x + i % 3 * (cw + 12), y: list.y + Math.floor(i / 3) * 160 - offset, w: cw, h: 148 };
    if (box.y + box.h < list.y || box.y > list.y + list.h) return;
    const track = TRACK_MAP[room.track];
    const mode = MODES[room.mode] || MODES.race;
    ui.rounded(box.x, box.y, box.w, box.h, 12);
    ui.ctx.save();
    ui.ctx.clip();
    drawTrackArt(ui, box, track?.theme || (THEMES[room.theme] ? room.theme : 'random'), track?.seed || 701);
    ui.panel(box.x, box.y + box.h - 46, box.w, 46, 'rgba(11,21,48,.78)', 0, null);
    chip(ui, mode.icon + ' ' + mode.name, { x: box.x + 9, y: box.y + 7, w: 107, h: 24 }, null, { fill: '#1b2c65', size: 13, radius: 5 });
    ui.text(track?.name || '全部随机', box.x + 12, box.y + box.h - 29, { bold: true, size: 17 });
    ui.text(room.host || '房主', box.x + 12, box.y + box.h - 12, { color: PALE, size: 12 });
    ui.text(`${room.players}/${room.max}`, box.x + box.w - 12, box.y + box.h - 23, { size: 22, color: GOLD, right: true, bold: true, italic: true });
    ui.ctx.restore();
    hit(ui, box, '加入房间', () => g.joinListed(room.id));
  }));
  const online = (fn) => () => g.mini.online ? fn() : ui.toast('联机服务暂不可用', true);
  ribbon(ui, '快速进房', { x: ui.r - 434, y: ui.b - 74, w: 178, h: 55 }, online(() => g.quickListed()),
    { skew: SKEW, sub: MODES[ui.hallMode]?.name || '随便进一间' });
  ribbon(ui, '创建房间', { x: ui.r - 239, y: ui.b - 74, w: 210, h: 55 }, () => {
    ui.racePick = 'room';
    ui.page('');
  }, { skew: SKEW, primary: true, sub: '自己定玩法和赛道' });
}

export function drawRoom(ui) {
  const g = ui.game, r = g.soloRules;
  const y = pageHeader(ui, '创建房间');
  const x = ui.l, w = ui.r - x;
  card(ui, { x, y, w, h: ui.b - y }, ['rgba(44,79,178,.92)', 'rgba(16,30,83,.97)'],
    { stroke: 'rgba(111,165,255,.73)', width: 2, shadow: 4 });
  const sheet = { x: x + 22, y: y + 20, w: w - 44, h: ui.b - y - 119 };
  ui.panel(sheet.x, sheet.y, sheet.w, sheet.h, 'rgba(11,21,48,.62)', 14, '#ffffff37');
  const left = sheet.x + 17;
  choices(ui, '玩法', { x: left, y: sheet.y + 18 }, MODE_KEYS.filter((key) => key !== 'tt').map((key) => [key, MODES[key].icon + ' ' + MODES[key].name]),
    r.mode, (key) => g.setRule('mode', key));
  const def = TRACK_MAP[r.track];
  const track = { x: left, y: sheet.y + 63, w: sheet.w - 34, h: 69 };
  ui.panel(track.x, track.y, track.w, track.h, '#263f85', 12, '#7fa6f2');
  ui.text(def?.name || '随机生成', track.x + 16, track.y + 23, { size: 20, bold: true });
  ui.text(def ? `${THEMES[def.theme].name} · ${(def.length / 1000).toFixed(1)} km`
    : `${THEMES[r.theme]?.name || '随机场景'} · ${LENGTHS[r.length].name}`, track.x + 17, track.y + 48, { size: 13, color: PALE });
  ui.text('选赛道 ›', track.x + track.w - 17, track.y + 35, { size: 17, color: GOLD, bold: true, right: true });
  hit(ui, track, '选赛道', () => ui.page('track'));
  if (r.mode !== 'team' && r.mode !== 'tt') choices(ui, '人数', { x: left, y: track.y + 91 }, [4, 6, 8].map((n) => [n, `${n} 人`]),
    r.seats || 8, (n) => { g.setRule('seats', n); ui.invalidate(); });
  if (r.mode !== 'tt') choices(ui, '难度', { x: left, y: track.y + 134 }, [[0, '简单'], [1, '普通'], [2, '困难']], r.difficulty,
    (n) => g.setRule('difficulty', n));
  ui.text(r.mode === 'tt' ? '计时赛是一个人滑，换个玩法再开房' : r.mode === 'team' ? '团队赛固定 8 人，4 对 4。' : '空位可以等人加入。房主点开始后，由机器人补位。',
    left, track.y + 194, { color: PALE, size: 13, bold: true, max: sheet.w - 35 });
  ribbon(ui, '创建', { x: ui.r - 242, y: ui.b - 73, w: 213, h: 56 }, () => {
    if (g.mini.online) g.createListedRoom();
    else ui.toast('联机服务暂不可用', true);
  }, { skew: SKEW, primary: true, sub: MODES[r.mode].icon + ' ' + MODES[r.mode].name });
}
