import { WEAPONS } from '../src/config.js';
import { CHAIN_T, MULT_MAX } from '../src/chain.js';
import { EMOTES } from '../src/emotes.js';
import { TEAM_COLORS } from '../src/modes.js';
import { PRACTICE_SECONDS } from '../src/tracks.js';
import { clamp, fmtTime } from '../src/util.js';
import { drawIcon, LABELS, rankRows, touchLayout } from '../src/ui/touchKit.js';
import { buildMinimap, drawMinimap } from '../src/ui/minimap.js';
import { card, GOLD, NAVY, PALE, scrim } from './paint.js';
import { plain } from './ui.js';

const DARK = 'rgba(11,21,48,.55)';

// 按键的配色，和网页 index.html 里 #touch 的样式一致：描边色、按下去的颜色
const KEY_COLORS = {
  left: ['rgba(255,255,255,.45)', 'rgba(255,255,255,.34)'],
  right: ['rgba(255,255,255,.45)', 'rgba(255,255,255,.34)'],
  drift: ['rgba(255,158,64,.95)', 'rgba(255,140,40,.7)'],
  brake: ['rgba(255,96,112,.95)', 'rgba(255,70,90,.7)'],
  fire: ['rgba(176,128,255,.95)', 'rgba(150,100,255,.7)'],
  nitro: [null, 'rgba(63,168,255,.7)'],
};
const SYS = ['rgba(255,255,255,.42)', 'rgba(255,210,60,.55)'];

// 圆键，或者转向胶囊的左半 / 右半
function shape(c, { x, y, w, h, round, half }) {
  if (round) {
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    return;
  }
  const big = h / 2;
  const [tl, tr, br, bl] = half === 'l' ? [big, 12, 12, big] : [12, big, big, 12];
  c.beginPath();
  c.moveTo(x + tl, y);
  c.arcTo(x + w, y, x + w, y + h, tr);
  c.arcTo(x + w, y + h, x, y + h, br);
  c.arcTo(x, y + h, x, y, bl);
  c.arcTo(x, y, x + w, y, tl);
  c.closePath();
}

function glass(c, box, top, bottom) {
  const d = Math.min(box.w, box.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.3;
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, d * 0.72);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function badge(ui, box, text, fill) {
  const c = ui.ctx;
  c.font = ui.font(13, true);
  const w = Math.max(22, c.measureText(text).width + 10);
  const x = box.x + box.w + 4 - w;
  const y = box.y - 4;
  ui.panel(x - 2, y - 2, w + 4, 26, NAVY, 13, null);
  ui.panel(x, y, w, 22, fill, 11, null);
  ui.text(text, x + w / 2, y + 11.5, { size: 13, bold: true, center: true });
}

// 画一个比赛按键并登记触摸区域。state：道具键 { item, ammo }，氮气键 { n, fill, burn }
function touchKey(ui, id, box, state = {}) {
  if (!box) return;
  const c = ui.ctx;
  const held = ui.game.touch?.pressed(id);
  const d = Math.min(box.w, box.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const sys = /^(reset|pause|emo|e\d)$/.test(id);
  const [ring, press] = sys ? SYS : KEY_COLORS[id] || SYS;
  c.save();
  if (held) {
    c.translate(cx, cy);
    c.scale(0.9, 0.9);
    c.translate(-cx, -cy);
  }
  let ink = '#fff';
  let ringColor = ring;
  let ringWidth = 2.5;
  shape(c, box);
  if (id === 'jump') {
    c.fillStyle = glass(c, box, held ? '#fff1b8' : 'rgba(255,232,140,.95)', held ? '#ffc23c' : 'rgba(255,178,31,.92)');
    ink = '#3a2400';
    ringColor = 'rgba(255,255,255,.7)';
  } else if (id === 'fire' && state.item) {
    c.fillStyle = glass(c, box, 'rgba(120,84,220,.82)', 'rgba(46,26,104,.82)');
    ringColor = GOLD;
    ringWidth = 3;
  } else if (id === 'nitro' && state.n > 0) {
    c.fillStyle = glass(c, box, 'rgba(63,150,255,.78)', 'rgba(16,44,120,.72)');
  } else if (id === 'emo' && ui.emotesOpen) {
    c.fillStyle = 'rgba(255,210,60,.35)';
    ringColor = GOLD;
  } else c.fillStyle = glass(c, box, held ? press : 'rgba(46,66,128,.6)', 'rgba(11,21,48,.6)');
  c.fill();
  if (id === 'fire' && state.item) {
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,210,60,.3)';
    c.stroke();
  }
  if (ringColor) {
    // 描边往里收半个线宽，和网页的 inset 描边一样贴着边
    shape(c, { ...box, x: box.x + ringWidth / 2, y: box.y + ringWidth / 2, w: box.w - ringWidth, h: box.h - ringWidth });
    c.lineWidth = ringWidth;
    c.strokeStyle = ringColor;
    c.stroke();
  }
  if (id === 'nitro') {
    const r = d * 0.46;
    c.lineWidth = d * 0.06;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,.22)';
    c.stroke();
    if (state.fill > 0) {
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.fill);
      c.strokeStyle = '#7fe0ff';
      c.stroke();
    }
  }
  const emoji = /^e\d$/.test(id) ? EMOTES[+id.slice(1)] : id === 'fire' && state.item ? state.item.icon : '';
  const label = id === 'fire' && state.item ? state.item.name : LABELS[id];
  const font = clamp(d * 0.15, 9, 13);
  const iconSize = d * (sys ? 0.5 : id === 'left' || id === 'right' ? 0.4 : 0.44);
  const stack = label ? iconSize + d * 0.02 + font : iconSize;
  const top = cy - stack / 2;
  c.globalAlpha = id === 'nitro' && !(state.n > 0) ? 0.45 : state.burn && ((Date.now() / 120) | 0) % 2 ? 0.6 : 1;
  if (emoji) ui.text(emoji, cx, top + iconSize / 2, { size: d * (sys ? 0.54 : 0.4), center: true });
  else {
    const nudge = id === 'left' ? d * 0.05 : id === 'right' ? -d * 0.05 : 0;
    drawIcon(c, id, cx - iconSize / 2 + nudge, top, iconSize, ink);
  }
  if (label) {
    ui.text(label, cx, top + iconSize + d * 0.02 + font / 2, {
      size: font, bold: true, center: true, color: id === 'jump' ? ink : id === 'fire' && state.item ? GOLD : '#fff', max: d * 0.9,
    });
  }
  c.restore();
  if (id === 'fire' && state.item && state.ammo > 1) badge(ui, box, '×' + state.ammo, '#ff3d6e');
  if (id === 'nitro' && state.n >= 2) badge(ui, box, '×' + state.n, '#2f7dff');
  ui.addHit({ x: box.x, y: box.y, w: box.w, h: box.h, control: id, circle: !!box.round, label: LABELS[id] || id });
}

function controlLayout(ui) {
  const g = ui.game;
  return touchLayout(ui.w, ui.h, {
    safe: { l: ui.l - 14, r: ui.w - ui.r - 14, t: ui.t - 10, b: ui.h - ui.b - 12 },
    topRight: (y) => ui.headerRight(y),
    items: !!g.rules.items,
    nitro: g.session.kind !== 'practice',
  });
}

// 左手转向，右手跳、漂移、刹车、道具、氮气，右上角暂停、复位、表情。道具键上显示手里的道具，氮气键上是充能圈
function controls(ui, L, p) {
  const g = ui.game;
  const live = !p.out && !p.finished;
  for (const id of ['left', 'right', 'jump', 'drift', 'brake']) touchKey(ui, id, L[id]);
  touchKey(ui, 'fire', L.fire, { item: live && p.weapon ? WEAPONS[p.weapon] : null, ammo: p.ammo });
  const n = live ? p.nitroN : 0;
  touchKey(ui, 'nitro', L.nitro, { n, fill: !live ? 0 : n >= 2 ? 1 : clamp(p.nitro, 0, 1), burn: live && p.nitroT > 0 });
  touchKey(ui, 'pause', L.pause);
  touchKey(ui, 'reset', L.reset);
  if (g.session.kind === 'practice') return;
  touchKey(ui, 'emo', L.emo);
  if (ui.emotesOpen) EMOTES.forEach((_, i) => touchKey(ui, 'e' + i, L['e' + i]));
}

function racePlace(ui, p, zoom) {
  const g = ui.game;
  const x = Math.max(ui.l, 28 * zoom);
  const y = ui.t - 8;
  const multiple = g.racers.length > 1;
  if (multiple) {
    const rank = p.out ? '💀' : p.rank;
    ui.text(rank, x, y + 64 * zoom, { size: 92 * zoom, bold: true, italic: true, color: GOLD, outline: true });
    const width = ui.ctx.measureText(String(rank)).width;
    ui.text('/' + g.racers.length, x + width + 4 * zoom, y + 84 * zoom, { size: 34 * zoom, bold: true, italic: true, outline: true });
  }
  const practice = g.session.kind === 'practice';
  const t = practice ? Math.max(0, PRACTICE_SECONDS - g.raceTime) : p.finished ? p.finishTime : g.raceTime;
  const yy = multiple ? y + 133 * zoom : y + 38 * zoom;
  ui.text(fmtTime(t), x + 4 * zoom, yy, { size: 26 * zoom, bold: true, outline: true });
  // 计时下面直接接名次表（手机上不显示玩法和赛道名那一行）
  return { x, y: yy + 21 * zoom };
}

// 名次表在左上角计时下面，只列第一名和自己附近几个人
function ranks(ui, zoom, { x, y }) {
  const g = ui.game;
  const w = 200 * zoom;
  const row = 26 * zoom;
  const mode = plain(g.mode.hud());
  let last = -1;
  for (const { r, i } of rankRows(g.order, mode ? 4 : 5)) {
    if (last >= 0 && i !== last + 1) y += 7 * zoom;
    last = i;
    const color = r.isPlayer ? NAVY : '#fff';
    ui.ctx.globalAlpha = r.out ? .4 : r.finished ? .75 : 1;
    ui.panel(x, y, w, row, r.isPlayer ? GOLD : DARK, 8 * zoom, null);
    if (r.team >= 0) ui.panel(x, y + 1, 4 * zoom, row - 2, TEAM_COLORS[r.team], 1, null);
    ui.text(i + 1, x + 10 * zoom, y + row / 2, { size: 17 * zoom, color, bold: true, italic: true });
    ui.text(r.name, x + 36 * zoom, y + row / 2, { size: 17 * zoom, color, bold: true, max: w - 66 * zoom });
    const tag = g.mode.rankTag(r) || (r.finished ? '🏁' : (r.weapon ? WEAPONS[r.weapon].icon : ''));
    if (tag) ui.text(plain(String(tag)), x + w - 8 * zoom, y + row / 2, { size: 13 * zoom, right: true, color, max: 30 * zoom });
    ui.ctx.globalAlpha = 1;
    y += row + 3 * zoom;
  }
  if (mode) {
    const yy = y + 5 * zoom;
    ui.panel(x, yy, w, 45 * zoom, 'rgba(11,21,48,.62)', 8 * zoom, null);
    ui.paragraph(mode, x + 7 * zoom, yy + 11 * zoom, w - 14 * zoom, { size: 12 * zoom, bold: true, color: '#fff', lines: 2 });
  }
}

// 速度表在转向键右边（道具和氮气都显示在按键上了）
function speedo(ui, p, zoom, L) {
  const speed = String(p.out ? 0 : Math.round(p.vel.length() * 3.6));
  const big = 60 * zoom;
  const { x, y } = L.speed;
  ui.text(speed, x, y - big * 0.4, { size: big, italic: true, bold: true, outline: true });
  ui.ctx.font = ui.font(big, true, true);
  const width = ui.ctx.measureText(speed).width;
  ui.text('km/h', x + width + 4 * zoom, y - 12 * zoom, { size: 20 * zoom, italic: true, bold: true, outline: true });
}

function chainHud(ui, p, zoom) {
  const g = ui.game;
  const chain = p.chain;
  const x = Math.max(ui.l, ui.w * .03);
  const y = ui.h * .67 - 82 * zoom;
  const w = Math.min(398 * zoom, ui.w * .34), h = 82 * zoom;
  const air = !p.grounded && p.state === 'ski';
  const airText = air && (Math.abs(p.flip) > .3 || Math.abs(p.spinA) > .3 || p.grabT > .05)
    ? [Math.abs(p.flip) > .3 ? (p.flip > 0 ? '后空翻' : '前空翻') : '', Math.abs(p.spinA) > .3 ? '转体' : '', p.grabT > .05 ? '抓板' : ''].filter(Boolean).join(' · ') : '';
  if (g.state === 'race' && !p.out && !p.finished && (chain.active || airText)) {
    ui.panel(x, y, w, h, DARK, 13 * zoom, null);
    ui.text('×' + chain.mult, x + 16 * zoom, y + 37 * zoom, {
      size: 48 * zoom, bold: true, italic: true, outline: true, color: chain.mult >= MULT_MAX ? '#7fe0ff' : chain.mult >= 5 ? '#ff7ad0' : GOLD,
    });
    const bx = x + 94 * zoom;
    ui.text('技巧链', bx, y + 12 * zoom, { size: 12 * zoom, bold: true, color: PALE });
    ui.text(chain.pts, bx, y + 33 * zoom, { size: 26 * zoom, bold: true, outline: true });
    const names = chain.list.slice(-2).map((item) => item.label + ' +' + item.pts);
    ui.text(airText || names.join(' · '), bx, y + 57 * zoom, { size: 13 * zoom, bold: true, max: w - 102 * zoom });
    const hold = p.drifting || air || !chain.n;
    ui.panel(x + 9 * zoom, y + h - 8 * zoom, w - 18 * zoom, 4 * zoom, '#ffffff25', 3 * zoom, null);
    const fill = clamp(hold ? 1 : chain.t / CHAIN_T, 0, 1);
    if (fill > 0) ui.panel(x + 9 * zoom, y + h - 8 * zoom, (w - 18 * zoom) * fill, 4 * zoom, hold ? '#7fe0ff' : chain.t < 1 ? '#ff5a6a' : GOLD, 3 * zoom, null);
  }
  const pop = ui.chainText;
  if (pop?.t > 0) {
    ui.text(pop.title, x, y + 16 * zoom, { size: 24 * zoom, color: shade(pop.kind), bold: true, italic: true, outline: true });
    ui.text(pop.value, x, y + 49 * zoom, { size: 46 * zoom, color: shade(pop.kind), bold: true, italic: true, outline: true });
  }
}

function shade(kind) {
  return kind === 'bad' ? '#ff5a6a' : kind === 'good' ? '#8dff6a' : kind === 'gold' ? GOLD : '#fff';
}

function messages(ui, zoom) {
  const cx = ui.w / 2;
  ui.messages.filter((m) => m.t > 0).forEach((msg, i) => {
    const c = ui.ctx;
    c.font = ui.font(15 * zoom, true);
    const w = Math.min(ui.w * .43, c.measureText(msg.text).width + 26 * zoom);
    const y = ui.t + i * 23 * zoom;
    ui.panel(cx - w / 2, y, w, 21 * zoom, 'rgba(11,21,48,.6)', 12 * zoom, null);
    ui.text(msg.text, cx, y + 10 * zoom, { center: true, size: 15 * zoom, bold: true, max: w - 10 * zoom });
  });
  if (ui.bannerText?.t > 0) ui.text(ui.bannerText.text, cx, ui.h * .29, {
    center: true, size: (ui.bannerText.kind === 'gold' ? 76 : 44) * zoom, outline: true, italic: true, bold: true,
    color: shade(ui.bannerText.kind), max: ui.w * .65,
  });
  if (ui.count) ui.text(ui.count, cx, ui.h * .45, {
    center: true, size: 170 * zoom, outline: true, color: GOLD, italic: true, bold: true, max: ui.w * .7,
  });
  if (ui.tipText?.t > 0 || ui.threat) ui.text(ui.threat || ui.tipText.text, cx, ui.h * .66, {
    center: true, size: 22 * zoom, outline: true, color: ui.threat ? '#ff5a6a' : '#fff', bold: true, max: ui.w * .65,
  });
}

function impact(ui, zoom) {
  const x = Math.max(ui.l, 28 * zoom) + 242 * zoom, y = Math.max(ui.t + 40 * zoom, 96 * zoom);
  const w = Math.min(400, ui.w * .32) * zoom, h = Math.min(220, ui.h * .34) * zoom;
  ui.impactBox = { x, y, w, h };
  ui.rounded(x, y, w, h, 10 * zoom);
  ui.ctx.lineWidth = 3;
  ui.ctx.strokeStyle = '#ff2d3a';
  ui.ctx.stroke();
  ui.panel(x + 7, y + h - 27 * zoom, w - 14, 19 * zoom, 'rgba(11,21,48,.78)', 7 * zoom, null);
  ui.text(`现场  ${ui.impact.frozen ? '冻住' : '命中'} ${ui.impact.name}  ${ui.impact.cause}`, x + 13, y + h - 17 * zoom,
    { size: 14 * zoom, color: GOLD, bold: true, max: w - 24 });
}

// 右上角按键下面的小地图（走线每条赛道算一次）
function minimap(ui, L) {
  const g = ui.game;
  const { x, y, w, h } = L.map;
  const mm = ui.minimapCache;
  if (!mm || mm.course !== g.course || mm.w !== w || mm.h !== h) ui.minimapCache = buildMinimap(g.course, w, h);
  drawMinimap(ui.ctx, ui.minimapCache, g, x, y);
}

export function drawRace(ui) {
  const g = ui.game;
  if (ui.departureVisible) {
    ui.button('跳过', ui.r - 91, ui.b - 47, 86, 41, () => g.finishDeparture(), { size: 15 });
    return;
  }
  const p = g.player;
  if (!p) return;
  const zoom = ui.h <= 560 || ui.w <= 760 ? .62 : 1;
  const practice = g.session.kind === 'practice';
  if (p.frozenT > 0) {
    const c = ui.ctx;
    const edge = c.createRadialGradient(ui.w / 2, ui.h / 2, ui.h * .30, ui.w / 2, ui.h / 2, ui.w * .56);
    edge.addColorStop(0, 'rgba(150,220,255,0)');
    edge.addColorStop(.72, 'rgba(150,220,255,.38)');
    edge.addColorStop(1, 'rgba(215,244,255,.88)');
    scrim(ui, edge);
  }
  const L = controlLayout(ui);
  if (ui.impact && !ui.pause) impact(ui, zoom);
  const under = racePlace(ui, p, zoom);
  minimap(ui, L);
  if (!practice) {
    ranks(ui, zoom, under);
    chainHud(ui, p, zoom);
  }
  speedo(ui, p, zoom, L);
  messages(ui, zoom);
  controls(ui, L, p);
}

export function drawPause(ui) {
  const { pause, game: g } = ui;
  const w = Math.min(360, ui.r - ui.l);
  const h = Math.min(pause.online ? 277 : 311, ui.b - ui.t - 9);
  const x = (ui.w - w) / 2, y = (ui.h - h) / 2;
  scrim(ui, 'rgba(11,21,48,.45)');
  card(ui, { x, y, w, h }, 'rgba(11,21,48,.88)', { radius: 20, stroke: 'rgba(255,255,255,.2)', shadow: 0 });
  ui.text(pause.online ? '菜单' : '暂停', x + w / 2, y + 55, { size: 40, bold: true, italic: true, outline: true, color: GOLD, center: true });
  if (pause.note) ui.paragraph(pause.note, x + 27, y + 91, w - 54, { size: 13, color: PALE, lines: 2 });
  const yy = y + (pause.online ? 141 : 98);
  ui.button('继续比赛', x + 28, yy, w - 56, 51, () => g.setPaused(false), { primary: true, size: 22 });
  if (!pause.online) ui.button('重新开始本局', x + 28, yy + 64, w - 56, 48, () => g.restartRace(), { size: 19 });
  ui.button(pause.armed ? '再点一次，确认退出' : pause.online ? '退出比赛，返回大厅' : '返回大厅',
    x + 28, yy + (pause.online ? 60 : 124), w - 56, 48, () => g.quitRace(), { size: 19 });
}

export function drawReplay(ui) {
  const b = ui.h * .09;
  ui.ctx.fillStyle = '#000';
  ui.ctx.fillRect(0, 0, ui.w, b);
  ui.ctx.fillRect(0, ui.h - b, ui.w, b);
  ui.text('回放', ui.l + 14, b + 29, { size: 28, color: '#ff5a6a', outline: true, bold: true, italic: true });
  ui.button('跳过', ui.r - 105, b + 12, 94, 44, () => ui.game.replay.stop(), { size: 17 });
}
