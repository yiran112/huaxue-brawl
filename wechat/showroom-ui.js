import { HATS, SKINS, SUIT_COLORS } from '../src/config.js';
import {
  BOX_COST, BOX_POOL, BOX_REFUND, BOX_WEIGHT, COSMETIC_SLOTS, GEAR, GEAR_KEYS, HAT_UNLOCK,
  RARITY, RARITY_KEYS, SHOP_GEAR, STAT_KEYS, STAT_MAX, STAT_NAMES, TUNE_PLANS, UPGRADES, UP_KEYS, UP_MAX, gearStats, upDesc,
} from '../src/gear.js';
import { ACHIEVEMENTS, CUP_LV, STAT_LABELS } from '../src/profile.js';
import { CUPS } from '../src/tracks.js';
import { SHOW, cosmeticOf, hex } from '../src/ui/common.js';
import { card, chip, gradient, hit, meter, pageHeader, scrim, GOLD, NAVY, PALE, ribbon } from './paint.js';

const TITLES = { garage: '车库', look: '角色', growth: '成长', shop: '商城' };
const RARE = { C: '#cde2ff', B: '#79edcb', A: '#d9a7ff', S: '#ffd569' };
const SHELF_COLUMNS = 2;
const SHELF_TILE_HEIGHT = 111;
const SHELF_GAP = 8;
const SHELF_HEADER = 25;
const SHELVES = RARITY_KEYS.map((rarity) => ({
  rarity, gear: SHOP_GEAR.filter((key) => GEAR[key].rarity === rarity),
})).filter((shelf) => shelf.gear.length);
let shopHeight = 150;
for (const shelf of SHELVES) {
  shelf.y = shopHeight;
  shopHeight += SHELF_HEADER + Math.ceil(shelf.gear.length / SHELF_COLUMNS) * (SHELF_TILE_HEIGHT + SHELF_GAP) + 5;
}

const subOf = (ui) => ui.panelPage || SHOW[ui.tab].subs[0][0];

function showroom(ui, render) {
  const { w, r, l, b, t } = ui;
  const g = ui.game;
  const shop = ui.tab === 'shop';
  const current = subOf(ui);
  const career = ui.tab === 'growth' && current !== 'home';
  scrim(ui, gradient(ui.ctx, 0, 0, w, 0, 'rgba(3,8,28,.67)', 'rgba(3,8,28,0)', 'rgba(3,8,28,.24)'));
  const y = pageHeader(ui, TITLES[ui.tab], () => ui.back(), { parts: ui.tab === 'garage' });
  const rw = shop ? Math.min(w * .365, 640)
    : career ? Math.max(352, Math.min(440, (r - l) * .36))
      : Math.max(300, Math.min(420, w * .24));
  const x = r - rw;
  SHOW[ui.tab].subs.forEach(([id, name, en], i) => {
    const row = { x: 0, y: y + 14 + i * 61, w: 150 + Math.max(0, l - 14), h: 61 };
    const selected = current === id;
    const c = ui.ctx;
    c.beginPath();
    c.moveTo(0, row.y);
    c.lineTo(row.w, row.y);
    c.lineTo(row.w - 18, row.y + row.h);
    c.lineTo(0, row.y + row.h);
    c.closePath();
    c.fillStyle = selected ? gradient(c, 0, row.y, row.w, 0, '#fff', '#d9e6ff') : 'rgba(10,20,48,.25)';
    c.fill();
    const left = l + 22;
    ui.text(name, left, row.y + 24, { size: 20, bold: true, color: selected ? '#0b1a44' : '#fff' });
    ui.text(en, left, row.y + 44, { size: 10, bold: true, color: selected ? '#657595' : '#a5b5de', max: 100 });
    hit(ui, row, name, () => {
      ui.pendingBuy = null;
      ui.page(id);
      if (shop) {
        ui.offsets.set('shop', SHELVES.find((shelf) => shelf.rarity === id)?.y ?? 0);
      }
    });
  });
  const stage = { x: l + 140, y, w: x - l - 154, h: b - y - (ui.tab === 'look' || career ? 0 : 147) };
  ui.frame = stage;
  ui.gestures.push({ ...stage, orbit: true });
  render(ui, { x, y, w: rw, h: b - y }, current, t, g);
}

function section(ui, label, x, y, note = '') {
  ui.panel(x, y - 10, 4, 20, GOLD, 0, null);
  ui.text(label, x + 14, y, { size: 15, bold: true });
  if (note) ui.text(note, x + 17 + label.length * 15, y + 1, { size: 11, bold: true, color: '#b9c8eb' });
}

function tag(ui, label, x, y, fill = '#3a54a7') {
  const w = label.length * 11 + 17;
  chip(ui, label, { x, y, w, h: 22 }, null, { fill, size: 11, radius: 3 });
  return w + 5;
}

function infoPanel(ui, box, { badge, small, title, side = '' }) {
  const { x, y, w, h } = box;
  ui.panel(x, y, w, h, 'rgba(12,28,76,.85)', 6, '#416297');
  ui.rounded(x + 1, y + 1, w - 2, h - 2, 5);
  ui.ctx.save();
  ui.ctx.clip();
  ui.ctx.fillStyle = gradient(ui.ctx, x, y, w, 0, '#5b3fe0', '#2f6bff', '#1b3e8a');
  ui.ctx.fillRect(x, y, w, 77);
  ui.ctx.restore();
  card(ui, { x: x + 14, y: y + 11, w: 56, h: 56 }, ['#fff', '#cfe0ff'], { radius: 8, shadow: 3, stroke: null });
  ui.text(badge, x + 42, y + 39, { size: 27, center: true, bold: true, color: '#3a2fd0' });
  ui.text(small, x + 82, y + 24, { size: 12, bold: true, color: PALE, max: w - 95 });
  const sideW = side ? Math.min(87, side.length * 9 + 6) : 0;
  ui.text(title, x + 82, y + 51, { size: 24, bold: true, max: w - 95 - sideW });
  if (side) ui.text(side, x + w - 13, y + 44, { size: 12, bold: true, right: true, color: PALE, max: sideW });
  return { x: x + 14, y: y + 86, w: w - 26, h: h - 96 };
}

function gearPick(ui, id, fromShop = false) {
  ui.previewGear = id;
  ui.pendingBuy = null;
  ui.game.setShow(fromShop ? 'SHOP' : 'GARAGE', id);
  ui.invalidate();
}

function tryBuy(ui, unlock, key, equip) {
  const p = ui.game.profile;
  const state = p.unlockState(unlock, key);
  if (state === 'locked') return ui.toast(unlock.lv ? `Lv.${unlock.lv} 解锁` : '达成对应成就后解锁', true);
  if (state === 'buy') {
    if (p.coins < unlock.cost) return ui.toast('雪花币不足', true);
    if (ui.pendingBuy !== key) {
      ui.pendingBuy = key;
      return ui.invalidate();
    }
    if (!p.buy(unlock, key)) return;
  }
  ui.pendingBuy = null;
  equip();
  ui.invalidate();
}

function gearAttrs(ui, box, gear, id, p) {
  const { x, y, w } = box;
  section(ui, '装备特性', x, y + 12);
  ui.panel(x, y + 31, w, 65, '#ffffff12', 6, null);
  card(ui, { x: x + 10, y: y + 40, w: 46, h: 46 }, ['#a5b4cc', '#687998'], { stroke: null, radius: 8, shadow: 0 });
  ui.text(gear.icon, x + 33, y + 62, { size: 26, center: true });
  ui.paragraph(gear.desc, x + 65, y + 51, w - 72, { size: 13, color: '#fff', lines: 2 });
  section(ui, '属性', x, y + 120, '会真实影响手感');
  const stats = gearStats(id, p.up(id));
  STAT_KEYS.forEach((k, i) => {
    const yy = y + 148 + i * 24;
    ui.text(STAT_NAMES[k], x, yy, { size: 13, bold: true, color: PALE });
    meter(ui, x + 52, yy - 4, w - 86, 8, gear.stats[k] / STAT_MAX);
    const plus = stats[k] - gear.stats[k];
    if (plus > 0) ui.panel(x + 52 + (w - 86) * gear.stats[k] / STAT_MAX, yy - 4, (w - 86) * plus / STAT_MAX, 8, '#8dff6a', 2, null);
    ui.text(stats[k].toFixed(1), x + w, yy, { size: 13, bold: true, right: true });
  });
}

function tune(ui, box, id, p) {
  const { x, y, w } = box;
  const levels = p.up(id);
  const plan = ui.tunePlan || 'race';
  const selected = ui.tuneStep || TUNE_PLANS[plan].path.find((key) => levels[key] < UP_MAX) || 'core';
  Object.entries(TUNE_PLANS).forEach(([key, route], i) => chip(ui, route.name, { x: x + i * (w / 2 + 2), y, w: w / 2 - 5, h: 29 },
    () => { ui.tunePlan = key; ui.tuneStep = null; ui.invalidate(); }, { active: key === plan, size: 12 }));
  const cell = (w - 10) / 3;
  const px = (col) => x + col * (cell + 5);
  ui.ctx.strokeStyle = '#869ad7';
  ui.ctx.lineWidth = 2;
  ui.ctx.beginPath();
  ui.ctx.moveTo(px(0) + cell / 2, y + 83);
  ui.ctx.lineTo(px(2) + cell / 2, y + 83);
  for (let i = 0; i < 3; i++) {
    ui.ctx.moveTo(px(i) + cell / 2, y + 81);
    ui.ctx.lineTo(px(i) + cell / 2, y + 204);
  }
  ui.ctx.stroke();
  for (const [key, node] of Object.entries(UPGRADES)) {
    const box = { x: px(node.col), y: y + 39 + node.row * 46, w: cell, h: 38 };
    const ready = p.upgradeCost(id, key) > 0 || levels[key] === UP_MAX;
    ui.panel(box.x, box.y, box.w, box.h, key === selected ? '#4f7bff' : ready ? '#182a67' : '#172144',
      7, key === selected ? '#fff' : TUNE_PLANS[plan].path.includes(key) ? GOLD : '#526896');
    ui.text(`${node.icon} ${node.name}`, box.x + cell / 2, box.y + 12, { center: true, size: 11, bold: true, max: cell - 6 });
    ui.text(`${levels[key]}/${UP_MAX}`, box.x + cell / 2, box.y + 28, { center: true, size: 11, color: GOLD, bold: true });
    hit(ui, box, node.name, () => { ui.tuneStep = key; ui.invalidate(); });
  }
  const node = UPGRADES[selected];
  ui.text(node.name, x, y + 236, { bold: true, size: 14 });
  ui.paragraph(upDesc(selected), x, y + 255, w - 6, { size: 11, color: PALE, lines: 2 });
  const cost = p.upgradeCost(id, selected);
  chip(ui, cost ? `改装 ⬢ ${cost}` : levels[selected] >= UP_MAX ? '已满级' : '前置未完成',
    { x, y: y + 275, w, h: 28 }, cost ? () => {
      if (!p.upgrade(id, selected)) ui.toast('改装币不足或装备尚未解锁', true);
      ui.invalidate();
    } : null, { fill: cost ? GOLD : '#ffffff22', color: cost ? NAVY : PALE, size: 13 });
}

function gearStrip(ui, panel, id, p) {
  const x = Math.max(ui.l + 152, panel.x - Math.min(390, (panel.x - ui.l) * .64));
  const w = panel.x - x - 12;
  const rank = ui.gearRank || GEAR[id].rarity;
  RARITY_KEYS.forEach((key, i) => {
    const all = GEAR_KEYS.filter((k) => GEAR[k].rarity === key);
    const cell = (w - 18) / 4;
    chip(ui, `${key} ${RARITY[key].name} ${all.filter((k) => p.gearOwned(k)).length}/${all.length}`,
      { x: x + i * (cell + 6), y: ui.b - 175, w: cell, h: 31 }, () => {
        ui.gearRank = key;
        ui.offsets.delete('gear');
        gearPick(ui, all[0]);
      }, { active: rank === key, color: rank === key ? NAVY : RARE[key], fill: rank === key ? '#fff' : '#122256', size: 12, radius: 6 });
  });
  const list = { x, y: ui.b - 130, w, h: 126 };
  const items = GEAR_KEYS.filter((key) => GEAR[key].rarity === rank);
  ui.scrollArea('gear', list, items.length * 161, (offset) => {
    items.forEach((gear, i) => {
      const box = { x: x + 1 + i * 161 - offset, y: list.y + 2, w: 151, h: 116 };
      if (box.x + box.w < x || box.x > x + w) return;
      const picked = id === gear;
      const owned = p.gearOwned(gear);
      card(ui, box, owned ? ['#fff', '#e6ecf9'] : ['#dce3f3', '#c6d1e5'],
        { stroke: picked ? GOLD : '#9fb4dd', width: 2, radius: 12, shadow: 3 });
      ui.models.push({ x: box.x + 6, y: box.y + 19, w: 139, h: 69, gear });
      const equipped = gear === ui.game.look.gear;
      if (equipped || !owned) chip(ui, equipped ? '使用中' : '🔒', {
        x: box.x + (equipped ? 7 : 124), y: box.y + 7, w: equipped ? 56 : 20, h: 19,
      }, null, { fill: '#1b2545', color: GOLD, size: 11, radius: 6 });
      ui.text(GEAR[gear].name, box.x + 75, box.y + 102, { center: true, size: 14, color: NAVY, bold: true, max: box.w - 13 });
      hit(ui, box, GEAR[gear].name, () => gearPick(ui, gear));
    });
  }, true);
}

function garage(ui, panel, sub, _, g) {
  const p = g.profile;
  const id = ui.previewGear || g.look.gear;
  const gear = GEAR[id];
  const rare = RARITY[gear.rarity];
  const key = 'gear:' + id;
  const owned = p.gearOwned(id);
  const equipped = id === g.look.gear;
  const st = p.unlockState(gear.unlock, key);
  const origin = { ...panel, h: panel.h - 80 };
  const mods = UP_KEYS.reduce((sum, k) => sum + p.up(id)[k], 0);
  const body = infoPanel(ui, origin, { badge: gear.icon, small: `${gear.rarity} · ${rare.name} · ${equipped ? '使用中' : owned ? '已拥有' : st === 'buy' ? '可购买' : '未解锁'}`,
    title: gear.name, side: `改装 ${mods} / 30` });
  const x = body.x + tag(ui, `${gear.rarity} · ${rare.name}`, body.x, body.y, '#617197');
  const sorted = STAT_KEYS.slice().sort((a, b) => gear.stats[b] - gear.stats[a]);
  tag(ui, gear.stats[sorted[0]] === gear.stats[sorted[4]] ? '各项均衡' : STAT_NAMES[sorted[0]] + '突出', x, body.y, '#d17a20');
  body.y += 37;
  body.h -= 37;
  ui.scrollArea('garage-info', body, sub === 'up' ? 310 : 259, (offset) => {
    const area = { ...body, y: body.y - offset };
    if (sub === 'up') tune(ui, area, id, p);
    else gearAttrs(ui, area, gear, id, p);
  });
  gearStrip(ui, panel, id, p);
  const w = (panel.w - 12) / 2;
  ribbon(ui, sub === 'up' ? '属性' : '改装', { x: panel.x, y: ui.b - 66, w, h: 61 },
    () => ui.page(sub === 'up' ? 'attr' : 'up'), { sub: sub === 'up' ? 'PROPERTY' : 'TUNING' });
  const shop = !owned && gear.unlock?.shop;
  const label = equipped ? '使用中' : owned ? '选用' : shop ? '去商城' : st === 'locked' ? '未解锁' : ui.pendingBuy === key ? '确认购买' : '购买';
  const en = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : shop || st === 'buy' ? `❄ ${gear.unlock.cost}` : `Lv.${gear.unlock?.lv || 1}`;
  ribbon(ui, label, { x: panel.x + w + 12, y: ui.b - 66, w, h: 61 }, equipped ? null : () => {
    if (shop) { ui.openTab('shop'); gearPick(ui, id, true); ui.page(gear.rarity); return; }
    tryBuy(ui, gear.unlock, key, () => g.setLook('gear', id));
  }, { sub: en, primary: true, muted: equipped || (!shop && st === 'locked') });
}

function listChoices(ui, label, x, y, w, options) {
  ui.text(label, x, y + 12, { size: 13, bold: true, color: PALE });
  let dx = x, dy = y + 27;
  for (const option of options) {
    const ww = option.color ? 29 : Math.min(w, Math.max(40, option.label.length * 12 + 15));
    if (dx + ww > x + w) { dy += 38; dx = x; }
    const box = { x: dx, y: dy, w: ww, h: option.color ? 29 : 33 };
    if (option.color) {
      ui.panel(box.x + 2, box.y + 2, 25, 25, option.color, 14, option.selected ? '#fff' : '#ffffff73');
      if (option.selected) {
        ui.rounded(box.x, box.y, 29, 29, 14);
        ui.ctx.strokeStyle = '#fff'; ui.ctx.lineWidth = 2; ui.ctx.stroke();
      }
      hit(ui, box, label, option.run);
    } else {
      chip(ui, option.label, box, option.run, { fill: option.selected ? '#4f7bff' : '#ffffff16', color: option.locked ? '#bbc8ec9c' : '#fff', size: 13 });
      if (option.selected) {
        ui.rounded(box.x, box.y, box.w, box.h, 10);
        ui.ctx.strokeStyle = '#fff'; ui.ctx.lineWidth = 2; ui.ctx.stroke();
      }
    }
    dx += ww + 5;
  }
  return dy + 48;
}

function looks(ui, panel, sub, _, g) {
  const p = g.profile, L = g.look;
  const body = infoPanel(ui, panel, { badge: '🎨', small: '角色造型', title: g.playerName, side: GEAR[L.gear].icon + ' ' + GEAR[L.gear].name });
  tag(ui, HATS[L.hat], body.x, body.y, '#d17a20');
  chip(ui, '个人资料', { x: body.x + body.w - 96, y: body.y - 4, w: 96, h: 32 },
    () => g.account.openManage(), { size: 13 });
  body.y += 42;
  body.h -= 42;
  const assign = (field, value) => { g.setLook(field, value); ui.invalidate(); };
  const sw = (field, colors) => colors.map((value) => ({
    color: hex(value), selected: L[field] === value, run: () => assign(field, value),
  }));
  const pieces = (field, items) => items.map((item, i) => {
    const key = `${field}:${i}`;
    const state = p.unlockState(item.unlock, key);
    return {
      label: state === 'locked' ? '🔒 ' + item.name : state === 'buy'
        ? (ui.pendingBuy === key ? '确认 ❄' + item.unlock.cost : item.name + ' ❄' + item.unlock.cost) : item.name,
      locked: state === 'locked', selected: L[field] === i, run: () => tryBuy(ui, item.unlock, key, () => assign(field, i)),
    };
  });
  const rows = sub === 'color' ? [['帽子 / 头发', sw('hatColor', [...SUIT_COLORS, 0x2a1a12, 0x7ad21f])],
    ['上衣', sw('jacket', SUIT_COLORS)], ['条纹 / 袖口', sw('stripe', SUIT_COLORS)], ['裤子', sw('pants', SUIT_COLORS)], ['板子 / 雪橇', sw('ski', SUIT_COLORS)]]
    : sub === 'acc' ? Object.entries(COSMETIC_SLOTS).map(([field, part]) => [part.name, pieces(field, part.list)]) : [
      ['发型 / 帽子', pieces('hat', HATS.map((name, i) => ({ name, unlock: HAT_UNLOCK[i] })))], ['肤色', sw('skin', SKINS)],
      ['胡子', [[false, '无'], [true, '有']].map(([value, label]) => ({ label, selected: !!L.mustache === value, run: () => assign('mustache', value) }))],
    ];
  const estimated = 25 + rows.reduce((h, [, cells]) => {
    let used = 0, lines = 1;
    for (const item of cells) {
      const n = (item.color ? 29 : Math.max(40, item.label.length * 12 + 15)) + 5;
      if (used && used + n > body.w) { used = 0; lines++; }
      used += n;
    }
    return h + 75 + (lines - 1) * 38;
  }, 0) + (sub === 'color' ? 0 : 40);
  ui.scrollArea('look-' + sub, body, estimated, (offset) => {
    let y = body.y + 5 - offset;
    section(ui, sub === 'color' ? '配色' : sub === 'acc' ? '饰品' : '造型', body.x, y + 5);
    y += 23;
    rows.forEach(([label, items]) => { y = listChoices(ui, label, body.x, y, body.w, items); });
    if (sub !== 'color') ui.paragraph('🔒 的部件升级或达成成就后解锁。标着 ❄ 的用雪花币购买。', body.x, y + 5, body.w, { size: 12, lines: 2 });
  });
}

function levelStrip(ui, panel, p) {
  const x = panel.x - Math.min(370, (panel.x - ui.l) * .63);
  const y = ui.b - 107;
  const w = panel.x - x - 15;
  const items = new Map();
  const add = (rule, icon, name) => {
    if (!(rule?.lv > 1)) return;
    if (!items.has(rule.lv)) items.set(rule.lv, []);
    items.get(rule.lv).push({ name, icon, buy: !!rule.cost });
  };
  GEAR_KEYS.forEach((key) => add(GEAR[key].unlock, GEAR[key].icon, GEAR[key].name));
  HAT_UNLOCK.forEach((rule, i) => add(rule, '💇', HATS[i]));
  for (const slot of Object.values(COSMETIC_SLOTS)) slot.list.forEach((item) => add(item.unlock, '🎁', item.name));
  CUPS.forEach((cup, i) => add({ lv: CUP_LV[i] }, cup.icon, cup.name + '赛道'));
  const rows = [...items].sort((a, b) => a[0] - b[0]);
  const next = rows.find(([lv]) => lv > p.level)?.[0];
  chip(ui, '等级奖励', { x: x + w / 2 - 47, y: y - 43, w: 94, h: 29 }, null, { fill: '#10275d', color: GOLD, radius: 18 });
  ui.scrollArea('levels', { x, y: y - 11, w, h: 116 }, rows.length * 127, (offset) => rows.forEach(([lv, gifts], i) => {
    const cell = { x: x + i * 127 - offset + 2, y, w: 115, h: 95 };
    if (cell.x + cell.w < x || cell.x > x + w) return;
    card(ui, cell, lv === next ? ['#fff', '#f7f0c5'] : ['#edf2fc', '#d6deee'], { radius: 14, stroke: lv === next ? GOLD : null, width: 3, shadow: 4 });
    chip(ui, `Lv.${lv}`, { x: cell.x + 36, y: cell.y - 10, w: 43, h: 19 }, null, {
      fill: lv === next ? GOLD : NAVY, color: lv === next ? NAVY : GOLD, radius: 12, size: 11,
    });
    ui.text(gifts.slice(0, 2).map((v) => v.icon).join(''), cell.x + 57, cell.y + 34, { size: 27, center: true });
    ui.text(gifts[0].name, cell.x + 57, cell.y + 63, { size: 13, bold: true, center: true, color: NAVY, max: 108 });
    ui.text(gifts.length > 1 ? `等 ${gifts.length} 样` : gifts[0].buy ? '解锁后购买' : '直接解锁',
      cell.x + 57, cell.y + 80, { size: 11, color: '#657595', bold: true, center: true });
    hit(ui, cell, gifts[0].name, () => ui.toast(`Lv.${lv} · ${gifts.map((item) => item.name).join('、')}`));
  }), true);
}

function growth(ui, panel, sub, _, g) {
  const p = g.profile;
  const info = p.levelInfo();
  const body = infoPanel(ui, sub === 'home' ? { ...panel, h: panel.h - 42 } : panel, {
    badge: `Lv.${info.lv}`, small: p.data.title ? `称号「${p.data.title}」` : '还没佩戴称号', title: g.playerName, side: `❄ ${p.coins}`,
  });
  const s = p.data.stats;
  if (sub === 'home') {
    const tasks = p.dailyTasks();
    meter(ui, body.x, body.y + 5, body.w - 82, 8, info.need ? info.cur / info.need : 1, '#81ef97');
    ui.text(`经验 ${info.cur} / ${info.need}`, body.x + body.w, body.y + 9, { size: 12, bold: true, color: PALE, right: true });
    tag(ui, `成就 ${Object.keys(p.data.ach).length} / ${ACHIEVEMENTS.length}`, body.x, body.y + 26, '#d17a20');
    tag(ui, `今日任务 ${tasks.filter((t) => t.done).length} / ${tasks.length}`, body.x + 90, body.y + 26);
    section(ui, '称号', body.x, body.y + 73, '达成部分成就后解锁');
    const titles = p.titles();
    let tx = body.x;
    for (const title of ['', ...titles].slice(0, 3)) {
      const w = Math.max(37, title.length * 13 + 15);
      chip(ui, title || '无', { x: tx, y: body.y + 91, w, h: 31 }, () => { p.setTitle(title); ui.invalidate(); },
        { fill: p.data.title === title ? '#4f7bff' : '#ffffff16', size: 13 });
      tx += w + 5;
    }
    if (!titles.length) ui.text('还没有称号', tx, body.y + 108, { size: 12, color: PALE });
    section(ui, '生涯速览', body.x, body.y + 149, '完整数据在「生涯」里');
    const items = [['🏁', s.races, '比赛'], ['🏅', s.wins, '冠军'], ['🥈', s.podiums, '前三名'],
      ['💥', s.hits, '击飞'], ['🚀', Math.round(s.maxSpeed || 0), '最高时速'], ['🎖️', p.rankView().name, '段位']];
    const cell = (body.w - 12) / 3;
    items.forEach(([icon, value, label], i) => {
      const x = body.x + (i % 3) * (cell + 6);
      const y = body.y + 167 + Math.floor(i / 3) * 80;
      ui.panel(x, y, cell, 72, '#ffffff13', 6, '#516fa5');
      const cx = x + cell / 2;
      ui.text(icon, cx, y + 18, { size: 18, center: true });
      ui.text(value || '0', cx, y + 41, { size: 17, color: GOLD, bold: true, italic: true, center: true, max: cell - 5 });
      ui.text(label, cx, y + 60, { size: 12, color: PALE, bold: true, center: true });
    });
    levelStrip(ui, panel, p);
  } else {
    const achievements = sub === 'ach';
    const unlocked = achievements ? ACHIEVEMENTS.filter((a) => p.data.ach[a.id]).length : 0;
    section(ui, achievements ? '成就' : '生涯数据', body.x, body.y + 8,
      achievements ? `${unlocked} / ${ACHIEVEMENTS.length} 已达成` : '');
    body.y += 28;
    body.h -= 28;
    const items = achievements ? ACHIEVEMENTS : STAT_LABELS;
    const columns = body.w >= 400 ? 4 : 3;
    const rows = Math.ceil(items.length / columns);
    const gap = 6;
    const width = (body.w - gap * (columns - 1)) / columns;
    const height = achievements ? 68 : Math.max(36, Math.min(58, Math.floor((body.h - gap * (rows - 1)) / rows)));
    const content = rows * (height + gap) - gap;
    ui.scrollArea('growth-' + sub, body, content, (offset) => items.forEach((item, i) => {
      const x = body.x + (i % columns) * (width + gap);
      const y = body.y + Math.floor(i / columns) * (height + gap) - offset;
      if (y + height <= body.y || y >= body.y + body.h) return;
      const cx = x + width / 2;
      if (achievements) {
        const earned = !!p.data.ach[item.id];
        ui.panel(x, y, width, height, earned ? '#314775' : '#202e56', 8, earned ? '#d7ac58' : '#436095');
        ui.text(earned ? '🏅' : '🔒', cx, y + 16, { size: 19, center: true });
        ui.text(item.name, cx, y + 38, { size: 14, bold: true, center: true, max: width - 10 });
        ui.text(earned ? item.title || '已达成' : '未达成', cx, y + 55,
          { size: 12, bold: true, color: earned ? GOLD : PALE, center: true, max: width - 10 });
        hit(ui, { x, y, w: width, h: height }, item.name, () => { ui.achievement = item; ui.invalidate(); });
      } else {
        const [key, label] = item;
        const [name, unit] = label.split(/[（）]/);
        const value = +Number(s[key] || 0).toFixed(1);
        ui.panel(x, y, width, height, '#213567', 8, '#466298');
        ui.text(name, cx, y + height * .28, { size: 13, bold: true, center: true, color: PALE, max: width - 10 });
        ui.text(unit ? `${value} ${unit}` : value, cx, y + height * .72,
          { size: 17, bold: true, color: GOLD, center: true, max: width - 10 });
      }
    }));
    if (ui.achievement) {
      const a = ui.achievement;
      ui.hits = [];
      ui.gestures = [];
      ui.models = [];
      scrim(ui, 'rgba(3,8,28,.7)');
      const x = ui.w / 2 - 200, y = ui.h / 2 - 110;
      card(ui, { x, y, w: 400, h: 220 }, 'rgba(12,28,76,.98)', { stroke: '#7395df' });
      ui.text(a.name, x + 23, y + 44, { color: GOLD, bold: true, size: 25 });
      ui.paragraph(a.desc, x + 23, y + 86, 354, { size: 15 });
      ui.text([p.data.ach[a.id] ? '已达成' : '未达成', a.title && `称号「${a.title}」`].filter(Boolean).join(' · '),
        x + 23, y + 119, { size: 14, color: PALE, max: 354 });
      if (a.title && p.data.ach[a.id]) ribbon(ui, '佩戴称号', { x: x + 22, y: y + 148, w: 173, h: 49 }, () => {
        p.setTitle(a.title); ui.achievement = null; ui.invalidate();
      }, { primary: true });
      ribbon(ui, '关闭', { x: x + 207, y: y + 148, w: 171, h: 49 }, () => { ui.achievement = null; ui.invalidate(); });
    }
  }
}

function shop(ui, panel, _, __, g) {
  const p = g.profile;
  const id = ui.previewGear || SHOP_GEAR[0], gear = GEAR[id];
  const key = 'gear:' + id;
  const owned = p.gearOwned(id), canBuy = p.coins >= gear.unlock.cost;
  const { x, y, w, h } = panel;
  ui.panel(x, y, w, h, 'rgba(12,28,76,.85)', 6, '#416297');
  const list = { x: x + 15, y: y + 14, w: w - 30, h: h - 16 };
  ui.scrollArea('shop', list, shopHeight, (offset) => {
    const sy = list.y - offset;
    section(ui, '雪花补给箱', list.x, sy + 12);
    tag(ui, `已收集 ${BOX_POOL.filter(({ key }) => p.boxOwned(key)).length} / ${BOX_POOL.length}`, list.x + list.w - 110, sy + 3);
    card(ui, { x: list.x, y: sy + 29, w: list.w, h: 106 }, ['#ff4f95', '#ff9d60'], { stripe: .13, radius: 12, width: 2 });
    ui.text('🎁', list.x + 40, sy + 77, { center: true, size: 44 });
    const bx = list.x + 74;
    ui.text('开箱惊喜', bx, sy + 48, { size: 22, bold: true, italic: true, outline: true });
    ui.text(`随机开出一件外观，重复返还 ❄${BOX_REFUND}`, bx, sy + 68, { size: 12, bold: true, max: list.w - 86 });
    ui.text(`传说 ${BOX_WEIGHT.S}%  稀有 ${BOX_WEIGHT.A}%  普通 ${BOX_WEIGHT.C}%`, bx, sy + 84, { size: 11, bold: true, max: list.w - 86 });
    ui.text(`❄ ${BOX_COST}`, list.x + list.w - 143, sy + 110, { size: 14, bold: true, right: true });
    ribbon(ui, '开启', { x: list.x + list.w - 132, y: sy + 94, w: 120, h: 32 }, () => {
      const item = p.openBox();
      if (!item) return ui.toast(p.boxDone() ? '补给箱外观已集齐' : '雪花币不足', true);
      ui.boxWin = item;
      const reward = cosmeticOf(item.key);
      g.setShow('SHOP', id, { [reward.slot]: reward.i });
      ui.invalidate();
    }, { primary: true, muted: p.coins < BOX_COST || p.boxDone() });
    const tileW = (list.w - SHELF_GAP * (SHELF_COLUMNS - 1)) / SHELF_COLUMNS;
    for (const shelf of SHELVES) {
      const shelfY = sy + shelf.y;
      section(ui, `${RARITY[shelf.rarity].name}装备`, list.x, shelfY + 10);
      shelf.gear.forEach((key, i) => {
        const box = {
          x: list.x + (i % SHELF_COLUMNS) * (tileW + SHELF_GAP),
          y: shelfY + SHELF_HEADER + Math.floor(i / SHELF_COLUMNS) * (SHELF_TILE_HEIGHT + SHELF_GAP),
          w: tileW, h: SHELF_TILE_HEIGHT,
        };
        if (box.y + box.h <= list.y || box.y >= list.y + list.h) return;
        const item = GEAR[key];
        const modelH = 64;
        const modelW = Math.min(box.w - 12, modelH * 5 / 3);
        card(ui, box, ['#fff', '#e8eefb'], { radius: 10, stroke: key === id ? GOLD : '#a7c0ed', width: 2, shadow: 0 });
        chip(ui, item.rarity, { x: box.x + 6, y: box.y + 5, w: 22, h: 18 }, null,
          { fill: RARE[item.rarity], color: NAVY, radius: 4, size: 12 });
        ui.text(item.name, box.x + 34, box.y + 14, { size: 13, bold: true, color: NAVY, max: box.w - 42 });
        ui.models.push({ x: box.x + (box.w - modelW) / 2, y: box.y + 26, w: modelW, h: modelH, gear: key });
        ui.text(p.gearOwned(key) ? '已拥有' : `❄ ${item.unlock.cost}`, box.x + box.w / 2, box.y + box.h - 12,
          { size: 12, bold: true, color: '#3d4c75', center: true, max: box.w - 12 });
        hit(ui, box, item.name, () => gearPick(ui, key, true));
      });
    }
  });
  const infoX = ui.l + 142;
  const info = { x: infoX, y: ui.b - 175, w: x - infoX - 11, h: 168 };
  ui.panel(info.x, info.y, info.w, info.h, 'rgba(12,28,76,.9)', 8, '#416297');
  chip(ui, gear.icon, { x: info.x + 14, y: info.y + 12, w: 48, h: 48 }, null, { active: true, radius: 9, size: 26 });
  ui.text(`${gear.rarity} · ${RARITY[gear.rarity].name}${canBuy || owned ? '' : ' · 还差 ❄' + (gear.unlock.cost - p.coins)}`,
    info.x + 75, info.y + 21, { size: 11, color: PALE, bold: true });
  ui.text(gear.name, info.x + 76, info.y + 48, { size: 22, bold: true, max: info.w - 220 });
  ui.paragraph(gear.desc, info.x + 14, info.y + 80, info.w - 28, { size: 13, lines: 2 });
  const actual = gearStats(id, p.up(id));
  const cur = gearStats(g.look.gear, p.up(g.look.gear));
  const statW = (info.w - 30) / 5;
  STAT_KEYS.forEach((key, i) => {
    const x = info.x + 14 + i * statW;
    const d = actual[key] - cur[key];
    ui.text(STAT_NAMES[key], x, info.y + 119, { size: 11, bold: true, color: PALE });
    ui.text(actual[key].toFixed(1), x, info.y + 140, { size: 18, bold: true });
    if (d > 0.01) ui.text('+' + d.toFixed(1), x + 34, info.y + 142, { size: 11, color: '#8dff6a', bold: true, max: statW - 33 });
    meter(ui, x, info.y + 153, statW - 10, 5, actual[key] / STAT_MAX);
  });
  ribbon(ui, owned ? (id === g.look.gear ? '使用中' : '选用') : ui.pendingBuy === key ? '确认购买' : '购买',
    { x: info.x + info.w - 145, y: info.y + 11, w: 131, h: 50 }, id === g.look.gear ? null : () =>
      tryBuy(ui, gear.unlock, key, () => g.setLook('gear', id)), {
      primary: true, muted: id === g.look.gear || (!owned && !canBuy), sub: owned ? 'EQUIP' : `❄ ${gear.unlock.cost}`,
    });
  if (ui.boxWin) {
    const item = cosmeticOf(ui.boxWin.key);
    ui.hits = [];
    ui.gestures = [];
    ui.models = [];
    scrim(ui, 'rgba(3,8,28,.75)');
    const x = ui.w / 2 - 203, y = ui.h / 2 - 131;
    card(ui, { x, y, w: 406, h: 262 }, ['#ff5c9d', '#ffad67'], { stripe: .10, radius: 18 });
    ui.text(item.icon, x + 203, y + 65, { center: true, size: 55 });
    ui.text(item.name, x + 203, y + 124, { center: true, size: 31, italic: true, bold: true, outline: true });
    if (ui.boxWin.dup) ui.text(`重复获得，返还 ❄ ${BOX_REFUND}`, x + 203, y + 159, { center: true, size: 15, bold: true });
    const close = () => { ui.boxWin = null; g.setShow('SHOP', id); ui.invalidate(); };
    ribbon(ui, '确定', { x: x + 23, y: y + 189, w: 172, h: 49 }, close);
    ribbon(ui, '立即穿戴', { x: x + 211, y: y + 189, w: 172, h: 49 }, () => {
      g.setLook(item.slot, item.i);
      close();
    }, { primary: true });
  }
}

export function drawShowroom(ui) {
  showroom(ui, { garage, look: looks, growth, shop }[ui.tab]);
}
