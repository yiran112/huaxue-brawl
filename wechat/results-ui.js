// 微信结算：和网页版同一套布局。左边名次榜单，右边领奖台（3D 角色站一排、脚下名次牌、底下深色名牌带、彩纸），
// 底栏左边是本局收获（点开在右边看明细），右边是按钮。3D 角色画在 2D 画布上面，所以名次牌放在角色脚下、不和模型区重叠。
import { SKINS } from '../src/config.js';
import { TEAM_COLORS } from '../src/modes.js';
import { clamp } from '../src/util.js';
import { card, gradient, hit, meter, GOLD, NAVY, PALE } from './paint.js';

export const RESULT_MOTION_MS = 6500; // 入场动画和彩纸放这么久，之后画面静止，不再每帧重画
const PLACES = [
  { main: '#ffd23c', dark: '#c46a12', light: '#fff6b8', medal: 'gold' },
  { main: '#dbe8f6', dark: '#6683a0', light: '#ffffff', medal: 'silver' },
  { main: '#f2a46e', dark: '#94492c', light: '#ffdcbf', medal: 'bronze' },
];
const CONFETTI = ['#ffd23c', '#ff3d6e', '#4fd2ff', '#8dff6a', '#ffffff', '#ff8a5c', '#b48cff'];
const SKEW = -0.18;

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const filled = (v) => v != null && v !== '';
const progress = (age, start, length) => clamp((age - start) / length, 0, 1);
const easeOut = (k) => 1 - (1 - k) ** 3;
const popOut = (k) => (k >= 1 ? 1 : 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2);
// 彩纸用的固定伪随机，同一片每帧落在同一条轨迹上
const noise = (i, salt) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function textWidth(ui, text, size, bold = true) {
  const c = ui.ctx;
  if (!c.measureText) return String(text).length * size * 0.62;
  c.font = ui.font ? ui.font(size, bold) : `${size}px sans-serif`;
  return c.measureText(String(text)).width;
}

function fade(ui, alpha, draw) {
  if (alpha <= 0) return;
  const c = ui.ctx;
  const old = c.globalAlpha ?? 1;
  c.globalAlpha = old * alpha;
  try { draw(); } finally { c.globalAlpha = old; }
}

function tone({ title, rows }) {
  if (/失败|掉线/.test(title)) return 'lose';
  const me = rows.find((r) => r.me);
  return me?.rank === 1 || /胜利|🏆|🥇/.test(title) ? 'win' : '';
}

export function rewardRows(reward) {
  const base = (reward.lines || []).map((line) => ({ ...line, color: line.note ? PALE : '#fff' }));
  const extra = (reward.extra || []).map((line) => ({ ...line, color: GOLD }));
  const tasks = (reward.tasks || []).map((task) => ({ ...task, label: `✓ 每日任务 · ${task.name}`, color: '#8dff6a' }));
  const ach = (reward.ach || []).map((a) => ({ ...a, label: `🏆 成就「${a.name}」${a.title ? ` · 称号「${a.title}」` : ''}`, color: GOLD }));
  const bonus = reward.bonus ? [{ label: '🎁 今日任务全部完成', coins: reward.bonus, parts: reward.bonusParts, color: '#8dff6a' }] : [];
  const additions = [...extra, ...tasks, ...bonus, ...ach];
  const total = additions.reduce((sum, line) => ({ xp: sum.xp + (line.xp || 0), coins: sum.coins + (line.coins || 0),
    parts: sum.parts + (line.parts || 0) }), { xp: reward.xp || 0, coins: reward.coins || 0, parts: reward.parts || 0 });
  return { rows: [...base, ...additions], total };
}

function rewardHeight(reward) {
  return 79 + rewardRows(reward).rows.length * 27 + Math.min(3, reward.unlocks?.length || 0) * 20;
}

function drawRewards(ui, area, reward) {
  const p = ui.game.profile;
  const info = p.levelInfo();
  const { x, y, w } = area;
  const { rows, total } = rewardRows(reward);
  const order = [w * .63, w * .82, w - 12];
  ui.text('奖励', x + 11, y + 19, { bold: true, color: PALE, size: 12 });
  ['经验', '雪花币', '改装币'].forEach((label, i) => ui.text(label, x + order[i], y + 19, { bold: true, color: PALE, size: 12, right: true }));
  const columns = (line, yy) => {
    const cells = [[line.xp, '#8dff6a', '+'], [line.coins, '#9fe4ff', '❄+'], [line.parts, '#d7adff', '+']];
    cells.forEach(([value, color, prefix], i) => {
      if (value) ui.text(prefix + value, x + order[i], yy, { right: true, bold: true, color, size: 12, max: w * .2 - 4 });
    });
  };
  rows.forEach((line, i) => {
    const yy = y + 44 + i * 27;
    ui.panel(x + 12, yy - 13, w - 24, 1, '#ffffff18', 0, null);
    ui.text(line.label, x + 12, yy, { size: 13, color: line.color, bold: true, max: line.note ? w - 24 : w * .49 - 14 });
    columns(line, yy);
  });
  const yy = y + 45 + rows.length * 27;
  ui.text('合计', x + 12, yy, { bold: true, size: 17 });
  columns(total, yy);
  ui.text(`Lv.${info.lv}`, x + 12, yy + 27, { size: 14, bold: true, color: reward.lvTo > reward.lvFrom ? GOLD : '#fff' });
  meter(ui, x + 50, yy + 23, w - 172, 7, info.need ? info.cur / info.need : 1,
    gradient(ui.ctx, x, yy, w, 0, '#4fd2ff', '#8dff6a'));
  ui.text(`❄ ${p.coins}   ⬢ ${p.parts}`, x + w - 13, yy + 28, { size: 13, bold: true, right: true, max: 113 });
  (reward.unlocks || []).slice(0, 3).forEach((label, i) => ui.text('解锁 ' + label, x + 12, yy + 48 + i * 20, { size: 12, color: '#8dff6a', max: w - 24 }));
}

// 左上角斜切标题条，右端一排白色细条
function header(ui, r, age) {
  const c = ui.ctx;
  const size = ui.h < 360 ? 25 : 30;
  const h = size + 16;
  const k = easeOut(progress(age, 0, 420));
  const w = Math.min(ui.r - ui.l - 24, textWidth(ui, r.title, size) * 1.08 + 86);
  const x = ui.l + 10 - (1 - k) * 60;
  const y = ui.t;
  const colors = { win: ['#fff27e', '#ffc21f', '#ff9a1a'], lose: ['#8090bb', '#45517d'] }[tone(r)] || ['#ff9960', '#ff3d6e'];
  fade(ui, k, () => {
    card(ui, { x, y, w, h }, colors, { skew: SKEW, radius: 10, stroke: '#ffffffe6', width: 3, shadow: 4 });
    c.save();
    c.translate(x, y);
    c.transform(1, 0, SKEW, 1, -SKEW * h / 2, 0);
    ui.rounded(0, 0, w, h, 10);
    c.clip();
    for (let i = 0; i < 5; i++) {
      c.fillStyle = `rgba(255,255,255,${0.12 + i * 0.1})`;
      c.fillRect(w - 66 + i * 13, 0, 6, h);
    }
    c.restore();
    ui.text(r.title, x + 20, y + h / 2 + 1, { size, bold: true, italic: true, outline: true, max: w - 82 });
  });
  return y + h;
}

// 小头像：天蓝底，外套和条纹在下面，脸和帽子在中间
function face(ui, cx, cy, rad, look) {
  const c = ui.ctx;
  const skin = look.skin >= 16 ? look.skin : SKINS[look.skin] ?? SKINS[0];
  c.save();
  c.beginPath();
  c.arc(cx, cy, rad, 0, Math.PI * 2);
  c.closePath();
  c.fillStyle = '#c6e6ff';
  c.fill();
  c.clip();
  c.fillStyle = hex(look.jacket ?? 0xff8a1f);
  c.fillRect(cx - rad, cy + rad * 0.3, rad * 2, rad);
  c.fillStyle = hex(look.stripe ?? 0xffd21f);
  c.fillRect(cx - rad, cy + rad * 0.66, rad * 2, rad * 0.4);
  c.beginPath();
  c.arc(cx, cy - rad * 0.04, rad * 0.5, 0, Math.PI * 2);
  c.fillStyle = hex(skin);
  c.fill();
  c.beginPath();
  c.arc(cx, cy - rad * 0.3, rad * 0.56, Math.PI, 0);
  c.closePath();
  c.fillStyle = hex(look.hatColor ?? 0x2f3fd0);
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(cx, cy, rad, 0, Math.PI * 2);
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255,255,255,.85)';
  c.stroke();
}

function listLayout(rows, w) {
  const hasTime = rows.some((r) => filled(r.time));
  const hasPoints = rows.some((r) => r.pts != null);
  const pts = hasPoints ? Math.min(104, w * .3) : 0;
  const time = hasTime ? 64 : 0;
  return { hasFace: rows.some((r) => r.look), time, pts };
}

function rankRow(ui, row, i, box, cols, age) {
  const { y, w, h } = box;
  const k = easeOut(progress(age, 180 + i * 55, 380));
  const x = box.x - (1 - k) * 40;
  const place = [1, 2, 3].includes(row.rank) ? PLACES[row.rank - 1] : null;
  fade(ui, k, () => {
    card(ui, { x, y, w, h }, row.me ? ['#fff27e', '#ffc21f'] : ['rgba(19,35,76,.94)', 'rgba(13,26,59,.8)'],
      { skew: SKEW, radius: 7, stroke: row.me ? '#fff' : 'rgba(255,255,255,.12)', width: row.me ? 2 : 1, shadow: row.me ? 3 : 0 });
    const team = TEAM_COLORS[row.team];
    if (team) ui.panel(x + 4, y + 5, 4, h - 10, team, 2, null);
    const ink = row.me ? NAVY : '#fff';
    const cy = y + h / 2 + 1;
    ui.text(row.rank, x + 22, cy, {
      size: Math.round(h * .66), bold: true, italic: true, center: true, max: 34,
      color: row.me ? NAVY : place ? place.main : '#c4d2ee', outline: !row.me && !!place,
    });
    let left = x + 42;
    if (cols.hasFace) {
      if (row.look) face(ui, left + h * .36, y + h / 2, h * .36, row.look);
      left += h * .72 + 9;
    }
    let right = x + w - 12;
    const size = clamp(Math.round(h * .5), 12, 16);
    if (cols.pts) {
      ui.text(row.pts ?? '', right, cy, { size: size - 1, bold: true, right: true, color: row.me ? '#6a3a00' : '#9fe4ff', max: cols.pts - 6 });
      right -= cols.pts;
    }
    if (cols.time) {
      ui.text(row.time ?? '', right, cy, { size, bold: true, right: true, color: ink, max: cols.time - 4 });
      right -= cols.time;
    }
    ui.text(row.name, left, cy, { size, bold: true, color: ink, max: Math.max(10, right - left - 4) });
  });
}

function awardsHeight(awards) {
  return awards.length ? 22 + awards.length * 28 : 0;
}

function drawAwards(ui, { x, y, w }, awards) {
  ui.text('本局之最', x + 6, y + 9, { size: 12, bold: true, color: GOLD });
  awards.forEach((a, i) => {
    const yy = y + 22 + i * 28;
    card(ui, { x, y: yy, w, h: 24 }, a.me ? 'rgba(42,42,74,.92)' : 'rgba(13,26,59,.9)',
      { skew: SKEW, radius: 6, stroke: a.me ? 'rgba(255,210,60,.6)' : 'rgba(255,255,255,.13)', width: 1, shadow: 0 });
    ui.text(`${a.icon} ${a.name}`, x + 10, yy + 12, { size: 12, bold: true, color: GOLD, max: w * .42 });
    ui.text(`${a.who} · ${a.val}`, x + w - 10, yy + 12, { size: 11, bold: true, color: '#bfdaec', right: true, max: w * .55 - 14 });
  });
}

// 浅色舞台：倾斜水印、冠军身后的光芒、底部深色名牌带（青色上边、金色下边）
function stage(ui, box, top, age) {
  const c = ui.ctx;
  const { x, y, w, h } = box;
  card(ui, box, ['#ffffff', '#e4f0fa', '#bcd5ec'], { radius: 16, stroke: '#ffffffe6', width: 3, shadow: 5 });
  const band = clamp(h * .2, 40, 64);
  const bandY = y + h - band;
  const pad = clamp(w * .03, 6, 30);
  const unit = (w - pad * 2) / 3.16;
  const columns = [{ x: x + pad + unit, w: unit * 1.16 }, { x: x + pad, w: unit }, { x: x + pad + unit * 2.16, w: unit }];
  c.save();
  ui.rounded(x + 1.5, y + 1.5, w - 3, h - 3, 15);
  c.clip();

  const mark = clamp(Math.round(h * .16), 26, 66);
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(-0.16);
  for (let j = -3; j <= 3; j++) {
    ui.text('雪山大乱斗　雪山大乱斗　雪山大乱斗　雪山大乱斗', (j % 2) * mark * 1.3, j * mark * 1.45,
      { size: mark, bold: true, italic: true, center: true, color: 'rgba(43,93,138,.09)', max: w * 4 });
  }
  c.restore();

  const champ = columns[0];
  const rx = champ.x + champ.w / 2, ry = y + (bandY - y) * .46, rr = Math.max(champ.w, bandY - y) * .7;
  if (c.createRadialGradient) {
    const glow = c.createRadialGradient(rx, ry, 0, rx, ry, rr);
    glow.addColorStop(0, 'rgba(255,210,60,.42)');
    glow.addColorStop(1, 'rgba(255,210,60,0)');
    c.fillStyle = glow;
    const turn = Math.min(age, RESULT_MOTION_MS) / 9000;
    for (let a = 0; a < 16; a++) {
      const from = turn + a * Math.PI / 8;
      c.beginPath();
      c.moveTo(rx, ry);
      c.arc(rx, ry, rr, from, from + 0.16);
      c.closePath();
      c.fill();
    }
  }

  c.fillStyle = gradient(c, 0, bandY, 0, band, '#1c2a52', '#0b1530');
  c.fillRect(x, bandY, w, band);
  c.fillStyle = '#33d1e6';
  c.fillRect(x, bandY, w, 4);
  c.fillStyle = '#ffc21f';
  c.fillRect(x, y + h - 4, w, 4);

  columns.forEach((col, place) => {
    const row = top[place];
    const spec = PLACES[place];
    const delay = [620, 460, 300][place];
    const rise = easeOut(progress(age, delay, 500));
    const size = place === 0 ? clamp(Math.round(h * .1), 19, 38) : clamp(Math.round(h * .082), 16, 30);
    const bh = Math.round(size * 1.3);
    const bw = Math.round(size * 2.75);
    const by = bandY - bh - 6;
    const cx = col.x + col.w / 2;
    const modelTop = y + (place === 0 ? 8 : h * .13) + (1 - rise) * 30;
    if (age >= delay && ui.models) {
      ui.models.push({ x: col.x - col.w * .1, y: modelTop, w: col.w * 1.2, h: by + 4 - modelTop, row, place });
    }
    const pop = popOut(progress(age, delay + 280, 450));
    if (pop > 0) {
      c.save();
      c.translate(cx, by + bh / 2);
      c.scale(pop, pop);
      c.translate(-cx, -(by + bh / 2));
      card(ui, { x: cx - bw / 2, y: by, w: bw, h: bh }, [spec.light, spec.main, spec.dark],
        { skew: SKEW, radius: 8, stroke: '#fff', width: 2.5, shadow: 3 });
      if (ui.icon) ui.icon(spec.medal, cx - bw / 2 + 5, by + (bh - size) / 2, size, size);
      ui.text(`#${place + 1}`, cx + size * .5, by + bh / 2 + 1, { size, bold: true, italic: true, center: true, outline: true, max: bw - size - 8 });
      c.restore();
    }
    const team = TEAM_COLORS[row.team];
    if (team) ui.panel(col.x + col.w * .14, bandY - 4, col.w * .72, 4, team, 0, null);
    fade(ui, rise, () => {
      const name = clamp(Math.round(band * .3), 13, 18);
      ui.text(row.name, cx, bandY + band * .4, { size: name, bold: true, center: true, color: row.me ? GOLD : '#fff', max: col.w - 10 });
      ui.text([row.time, row.pts].filter(filled).join(' · '), cx, bandY + band * .72,
        { size: clamp(name - 4, 11, 13), bold: true, center: true, color: '#b8c9ea', max: col.w - 10 });
    });
  });

  // 彩纸：每片从顶上落一次，错开出发，动画时间到了就落完
  if (age < RESULT_MOTION_MS) {
    for (let i = 0; i < 42; i++) {
      const start = noise(i, 1) * 3300;
      const length = 2300 + noise(i, 2) * 1300;
      const t = (age - start) / length;
      if (t < 0 || t > 1) continue;
      const px = x + noise(i, 3) * w + Math.sin(t * 6 + i) * 12;
      const py = y - 12 + t * (h + 24);
      c.save();
      c.translate(px, py);
      c.rotate(t * (4 + noise(i, 4) * 8) * (i % 2 ? 1 : -1));
      c.scale(1, Math.abs(Math.cos(t * 14 + i)) * .8 + .2);
      c.fillStyle = CONFETTI[i % CONFETTI.length];
      c.fillRect(-3, -5, 5 + noise(i, 5) * 4, 8 + noise(i, 6) * 6);
      c.restore();
    }
  }
  c.restore();
}

// 底栏左边：本局收获一行，点开在右边看明细
function rewardBar(ui, box, reward, toggle) {
  const { x, y, w, h } = box;
  const { total } = rewardRows(reward);
  card(ui, box, 'rgba(13,26,59,.93)', { radius: 11, stroke: 'rgba(255,255,255,.2)', width: 2, shadow: 3 });
  const up = reward.lvTo > reward.lvFrom;
  const chips = [
    total.xp && [`+${total.xp} 经验`, '#8dff6a'],
    total.coins && [`❄ +${total.coins}`, '#9fe4ff'],
    total.parts && [`⬢ +${total.parts}`, '#d7adff'],
    up && [`⬆ Lv.${reward.lvTo}`, NAVY, GOLD],
  ].filter(Boolean);
  const more = toggle ? (ui.resultsDetail ? '领奖台 ▸' : '明细 ▸') : '';
  const moreW = more ? textWidth(ui, more, 12) + 8 : 0;
  let left = x + 10;
  const limit = x + w - 10 - moreW;
  const size = h < 36 ? 12 : 13;
  for (const [label, color, fill] of chips) {
    const cw = textWidth(ui, label, size) + 16;
    if (left + cw > limit) break;
    ui.panel(left, y + (h - 22) / 2, cw, 22, fill || 'rgba(255,255,255,.09)', 11, null);
    ui.text(label, left + cw / 2, y + h / 2 + 1, { size, bold: true, center: true, color, max: cw - 6 });
    left += cw + 5;
  }
  if (!chips.length) ui.text('本局没有奖励', left, y + h / 2 + 1, { size, bold: true, color: PALE, max: limit - left });
  if (more) {
    ui.text(more, x + w - 10, y + h / 2 + 1, { size: 12, bold: true, right: true, color: '#9fe4ff' });
    hit(ui, box, '奖励明细', toggle);
  }
}

function detailPanel(ui, box, reward) {
  card(ui, box, 'rgba(11,21,48,.96)', { radius: 16, stroke: 'rgba(255,255,255,.3)', width: 2, shadow: 4 });
  const inner = { x: box.x + 8, y: box.y + 6, w: box.w - 16, h: box.h - 12 };
  ui.scrollArea('results-detail', inner, rewardHeight(reward), (offset) => {
    drawRewards(ui, { x: inner.x, y: inner.y - offset, w: inner.w }, reward);
  });
}

export function drawResults(ui) {
  const r = ui.results, g = ui.game;
  const c = ui.ctx;
  const age = ui.resultsAt ? Date.now() - ui.resultsAt : Infinity;
  c.fillStyle = c.createLinearGradient ? gradient(c, 0, 0, ui.w, 0, 'rgba(5,12,31,.9)', 'rgba(7,20,48,.78)', 'rgba(10,26,58,.4)') : 'rgba(11,21,48,.6)';
  c.fillRect(0, 0, ui.w, ui.h);

  const headerBottom = header(ui, r, age);
  const buttonHeight = ui.h < 360 ? 38 : 42;
  const buttonY = ui.b - buttonHeight - 4;
  const bodyY = headerBottom + 10;
  const bodyH = buttonY - bodyY - 10;
  const width = ui.r - ui.l;
  const top = r.rows.slice(0, 3);
  const podium = top.length === 3 && top.every((v) => v.look);
  const reward = r.reward;
  const side = podium || reward;
  const listW = side ? clamp(width * (podium ? .4 : .5), 240, podium ? 440 : 560) : Math.min(620, width);
  const sideBox = { x: ui.l + listW + 14, y: bodyY, w: width - listW - 14, h: bodyH };

  // 名次榜单 + 本局之最，放不下就在左栏里滚
  const list = { x: ui.l + 4, y: bodyY, w: listW - 4, h: bodyH };
  const awards = r.awards || [];
  const rowH = clamp(Math.floor(list.h / Math.max(6, Math.min(8, r.rows.length)) - 4), 24, 34);
  const cols = listLayout(r.rows, list.w);
  const content = r.rows.length * (rowH + 4) + (awards.length ? 8 + awardsHeight(awards) : 0);
  if (ui.offsets && ui.resultsScrolled !== ui.resultsAt) {
    ui.resultsScrolled = ui.resultsAt;
    const me = r.rows.findIndex((row) => row.me);
    if (me >= 0) ui.offsets.set('results', clamp(me * (rowH + 4) - (list.h - rowH) / 2, 0, Math.max(0, content - list.h)));
  }
  ui.scrollArea('results', list, content, (offset) => {
    const box = { x: list.x + 6, w: list.w - 14, h: rowH };
    r.rows.forEach((row, i) => rankRow(ui, row, i, { ...box, y: list.y - offset + i * (rowH + 4) }, cols, age));
    if (awards.length) drawAwards(ui, { x: box.x, y: list.y - offset + r.rows.length * (rowH + 4) + 8, w: box.w }, awards);
  });

  if (podium && !(reward && ui.resultsDetail)) stage(ui, sideBox, top, age);
  else if (reward) detailPanel(ui, sideBox, reward);

  const actions = [[r.backLabel || '返回大厅', () => g.toMenu()]];
  if (g.replay.btnShown) actions.push(['精彩回放', () => g.replay.play()]);
  if (r.swapLabel) actions.push([r.swapLabel, () => g.startPractice(g.session.gear === 'ski' ? 'learner' : 'ski')]);
  actions.push([r.nextLabel || '再来一局 ▶', () => g.nextRace()]);
  const widths = actions.map(([label], i) => i === actions.length - 1 ? 150 : Math.max(96, label.length * 17 + 24));
  const room = Math.max(0, width - (reward ? 230 : 0));
  const fit = Math.min(1, (room - (actions.length - 1) * 10) / widths.reduce((a, b) => a + b, 0));
  const total = widths.reduce((a, b) => a + b * fit, 0) + (actions.length - 1) * 10;
  let bx = ui.r - total;
  if (reward) {
    const toggle = podium ? () => { ui.resultsDetail = !ui.resultsDetail; ui.invalidate?.(); } : null;
    rewardBar(ui, { x: ui.l + 4, y: buttonY, w: Math.min(listW, bx - ui.l - 14), h: buttonHeight }, reward, toggle);
  }
  actions.forEach(([label, run], i) => {
    const last = i === actions.length - 1;
    const bw = widths[i] * fit;
    ui.button(label, bx, buttonY, bw, buttonHeight, run, { primary: last, size: last ? 19 : 16 });
    bx += bw + 10;
  });
}
