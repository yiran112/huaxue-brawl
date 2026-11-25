import { GEAR_KEYS } from '../src/gear.js';
import { garageEntries, GARAGE_OWNERSHIP, GARAGE_RANKS, GARAGE_SORTS } from '../src/ui/garage-catalog-state.js';
import { chip, gradient, hit, pageHeader, GOLD, NAVY, PALE } from './paint.js';
import { sideNavPanel, sideNavRow } from './side-nav.js';

const RARITY_COLOR = { C: '#d5eaff', B: '#bff7e8', A: '#e8d1ff', S: '#ffe9aa' };
const RARITY_PANEL = { C: ['#749bd0', '#263e70'], B: ['#69a7bc', '#285372'], A: ['#9a88ca', '#473d73'], S: ['#b1a18c', '#525677'] };

function filterControl(ui, box, key, list, value, update) {
  const label = list.find(([id]) => id === value)?.[1] || list[0][1];
  chip(ui, `${label} ⌄`, box, () => wx.showActionSheet({
    itemList: list.map(([, name]) => name),
    success: ({ tapIndex }) => { if (list[tapIndex]) update(key, list[tapIndex][0]); },
  }), { fill: '#193356', color: '#edf6ff', size: 15, radius: 5 });
}

function gearCard(ui, box, entry, inspect) {
  const { id, gear, equipped, owned } = entry;
  const { x, y, w, h } = box;
  const [light, dark] = RARITY_PANEL[gear.rarity];
  const fill = gradient(ui.ctx, x, y + 6, w * .45, h, light, dark);
  ui.panel(x, y, w, h, fill, 7, equipped ? GOLD : '#91b6eaac');
  ui.panel(x + 1, y + h - 27, w - 2, 26, '#102344ed', 4, null);
  chip(ui, equipped ? '使用中' : owned ? '已拥有' : '未拥有', { x: x + 5, y: y + 5, w: 52, h: 19 }, null,
    { fill: equipped ? GOLD : owned ? '#23575a' : '#183354', color: equipped ? NAVY : owned ? '#ccffe5' : '#d4edff', size: 11, radius: 4 });
  chip(ui, gear.rarity, { x: x + w - 28, y: y + 5, w: 23, h: 19 }, null,
    { fill: RARITY_COLOR[gear.rarity], color: NAVY, size: 13, radius: 4 });
  const modelW = Math.min(w - 10, (h - 47) * 5 / 3);
  const modelH = modelW * 3 / 5;
  ui.models.push({ x: x + (w - modelW) / 2, y: y + (h - 27 - modelH) / 2 + 7, w: modelW, h: modelH, gear: id });
  ui.text(gear.name, x + 8, y + h - 13, { size: 15, bold: true, max: w - 15 });
  hit(ui, box, gear.name, () => inspect(id));
}

export function drawGarageCatalog(ui, inspect) {
  const { game, l, r, b, w, h, ctx: c } = ui;
  const settings = ui.garageCatalog || {};
  const width = r - l;
  c.fillStyle = gradient(c, 0, 0, w, h, '#4f6fa8', '#344881', '#162b50');
  c.fillRect(0, 0, w, h);
  const top = pageHeader(ui, '车库', () => ui.back(), { parts: true });

  const update = (key, value) => {
    ui.garageCatalog = { ...ui.garageCatalog, [key]: value };
    ui.offsets.delete('garage-catalog');
    ui.invalidate();
  };
  const navW = Math.min(158, width * .14);
  const nav = sideNavPanel(ui, { x: l, y: top, w: navW, h: b - top });
  const row = Math.min(44, nav.h / (GARAGE_RANKS.length + 1));
  ui.text('滑行装备', nav.x + 11, nav.y + row / 2, { color: '#b5cae8', size: 14, bold: true, max: nav.w - 20 });
  GARAGE_RANKS.forEach(([id, label], i) => {
    const box = { ...nav, y: nav.y + (i + 1) * row, h: row - 4 };
    sideNavRow(ui, box, label, () => update('rank', id), { active: id === (settings.rank || 'all') });
  });

  const x = l + navW + 13;
  const mainW = r - x;
  ui.panel(x, top, mainW, 40, '#253a6ddd', 7, '#b3cff388');
  const control = Math.min(132, mainW * .215);
  const search = Math.min(210, mainW * .29);
  const searchX = r - search - 6;
  const filtersX = searchX - 2 * (control + 6);
  const owned = GEAR_KEYS.filter((id) => game.profile.gearOwned(id)).length;
  ui.text(`${owned} / ${GEAR_KEYS.length} 已拥有`, x + 9, top + 21, { size: 15, bold: true, max: filtersX - x - 15 });
  filterControl(ui, { x: filtersX, y: top + 5, w: control, h: 30 }, 'ownership', GARAGE_OWNERSHIP, settings.ownership, update);
  filterControl(ui, { x: filtersX + control + 6, y: top + 5, w: control, h: 30 }, 'sort', GARAGE_SORTS, settings.sort, update);
  chip(ui, settings.query || '⌕  搜索装备', { x: searchX, y: top + 5, w: search, h: 30 }, () => wx.showModal({
    title: '搜索装备', editable: true, content: settings.query || '', placeholderText: '输入名称，留空显示全部',
    success: (res) => { if (res.confirm) update('query', (res.content || '').trim().slice(0, 24)); },
  }), { fill: '#193356', color: settings.query ? '#fff' : PALE, size: 15, radius: 5 });

  const list = { x, y: top + 49, w: mainW, h: b - top - 49 };
  const columns = mainW >= 780 ? 5 : mainW >= 540 ? 4 : 3;
  const gap = 9;
  const cellW = (list.w - 5 - (columns - 1) * gap) / columns;
  const cellH = Math.max(99, Math.min(215, cellW * 1.08));
  const entries = garageEntries(game, settings);
  if (!entries.length) {
    ui.text('没有符合条件的装备', x + mainW / 2, list.y + 38, { size: 16, color: PALE, center: true });
    return;
  }
  const height = Math.ceil(entries.length / columns) * (cellH + gap) - gap;
  ui.scrollArea('garage-catalog', list, height, (offset) => entries.forEach((entry, i) => {
    const y = list.y + Math.floor(i / columns) * (cellH + gap) - offset;
    if (y + cellH <= list.y || y >= list.y + list.h) return;
    gearCard(ui, { x: list.x + (i % columns) * (cellW + gap), y, w: cellW, h: cellH }, entry, inspect);
  }));
}
