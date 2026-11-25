import { WARDROBE_GROUPS, previewWardrobe, wardrobeAction, wardrobeState } from '../src/ui/appearance.js';
import { hex } from '../src/ui/common.js';
import { chip, gradient, hit, pageHeader, GOLD, PALE, ribbon } from './paint.js';
import { sideNavPanel, sideNavRow } from './side-nav.js';

const TILE_COLORS = {
  C: ['#3d6087', '#172c49'], A: ['#655c95', '#272944'], S: ['#806949', '#3b3042'],
};

function wardrobeNav(ui, box, state, select) {
  const rows = WARDROBE_GROUPS.length + (ui.wardrobeCollapsed ? 0 : state.group.parts.length);
  const nav = sideNavPanel(ui, box);
  const rowH = Math.max(33, Math.min(44, nav.h / rows));
  const content = rowH * rows;
  const width = nav.w - (content > nav.h ? 6 : 0);
  ui.scrollArea('wardrobe-nav', nav, content, (offset) => {
    let y = nav.y - offset;
    for (const group of WARDROBE_GROUPS) {
      const active = group === state.group;
      const expanded = active && !ui.wardrobeCollapsed;
      const row = { x: nav.x, y, w: width, h: rowH - 4 };
      sideNavRow(ui, row, group.title, () => {
        if (!active) return select(group.id === 'acc' ? 'back' : group.parts[0].field);
        ui.wardrobeCollapsed = !ui.wardrobeCollapsed;
        ui.invalidate();
      }, { active, trailing: expanded ? '⌄' : '›' });
      y += rowH;
      if (!expanded) continue;
      for (const part of group.parts) {
        const on = part === state.part;
        const sub = { x: nav.x + 9, y, w: width - 9, h: rowH - 4 };
        sideNavRow(ui, sub, part.title, on ? null : () => select(part.field), { active: on, nested: true });
        y += rowH;
      }
    }
  });
}

function appearanceCard(ui, box, field, option, focused, select) {
  const { x, y, w, h } = box;
  const { ctx: c } = ui;
  const fill = gradient(c, x, y, w * .28, h, ...(TILE_COLORS[option.tier] || TILE_COLORS.C));
  ui.panel(x, y, w, h, fill, 7, focused ? GOLD : '#53729d');
  if (focused) {
    ui.rounded(x + 1, y + 1, w - 2, h - 2, 6);
    c.strokeStyle = GOLD;
    c.lineWidth = 2;
    c.stroke();
  }

  if (option.model) {
    const modelW = Math.min(w - 8, (h - 24) * (5 / 3));
    const modelH = modelW * (3 / 5);
    ui.models.push({
      x: x + (w - modelW) / 2, y: y + (h - 21 - modelH) / 2, w: modelW, h: modelH,
      appearance: { field, value: option.value },
    });
  } else if (option.color != null) {
    const size = Math.min(w - 16, h - 32, 55);
    const cx = x + w / 2 - size / 2, cy = y + (h - 21) / 2 - size * .3;
    const swatch = option.color === 'rainbow'
      ? gradient(c, cx, cy, size, 0, '#ff5272', '#ffc348', '#73e99e', '#4d8cff', '#b879ff')
      : hex(option.color);
    ui.panel(cx, cy, size, size * .6, swatch, 5, '#eff9ffb0');
  } else {
    ui.text(option.icon, x + w / 2, y + (h - 21) / 2, { size: 31, center: true, color: PALE });
  }

  if ((option.equipped && h > 70) || !option.owned) {
    const status = option.equipped ? '使用中' : '未解锁';
    ui.panel(x + 5, y + 4, 43, 17, option.equipped ? '#153a3aeb' : '#4b233beb', 3, null);
    ui.text(status, x + 26.5, y + 12, { size: 11, bold: true, center: true, color: option.equipped ? '#bcf5dd' : '#ffdbdf' });
  }
  ui.text(option.name, x + w / 2, y + h - 11, { size: 15, bold: true, center: true, max: w - 10 });
  hit(ui, box, option.name, select);
}

export function drawWardrobe(ui) {
  const { game, l, r, b, t, h, ctx: c } = ui;
  const state = wardrobeState(game, ui.wardrobeSelection);
  const { field, part, options, focused } = state;
  const { label, detail } = wardrobeAction(state);
  const w = r - l;
  const top = t + 58;
  const foot = b - 53;
  const leftW = Math.min(174, w * .145);
  const rightW = Math.min(344, w * .268);
  const shelf = { x: r - rightW, y: top, w: rightW, h: b - top };
  const stage = { x: l + leftW + 12, y: t + 43, w: shelf.x - l - leftW - 24, h: foot - t - 48 };
  ui.frame = stage;
  ui.gestures.push({ ...stage, orbit: true });

  const leftShade = stage.x + stage.w * .18;
  c.fillStyle = gradient(c, 0, 0, leftShade, 0, '#061025ec', '#06102500');
  c.fillRect(0, 0, leftShade, h);
  const rightShade = shelf.x - stage.w * .15;
  c.fillStyle = gradient(c, rightShade, 0, ui.w - rightShade, 0, '#06102500', '#061025ed');
  c.fillRect(rightShade, 0, ui.w - rightShade, h);
  pageHeader(ui, '装扮', undefined, { action: { label: '个人资料', onClick: () => game.account.openManage() } });

  const select = (nextField, value) => {
    if (nextField !== field) {
      ui.wardrobeCollapsed = false;
      ui.wardrobeReveal = true;
    }
    ui.wardrobeSelection = { field: nextField, value };
    previewWardrobe(game, wardrobeState(game, ui.wardrobeSelection));
    ui.invalidate();
  };
  wardrobeNav(ui, { x: l, y: top, w: leftW, h: foot - top - 10 }, state, select);

  ui.panel(shelf.x, shelf.y, 3, 22, '#8fdffd', 1, null);
  ui.text(part.title, shelf.x + 11, shelf.y + 11, { size: 22, bold: true, max: shelf.w - 14 });
  const list = { x: shelf.x, y: shelf.y + 34, w: shelf.w, h: shelf.h - 34 };
  const gap = 8;
  const cols = part.swatches ? 3 : 2;
  const cardW = (list.w - 5 - (cols - 1) * gap) / cols;
  const cardH = part.swatches ? 67 : Math.max(86, Math.min(134, (b - t) * .19));
  const height = Math.ceil(options.length / cols) * (cardH + gap) - gap;
  if (ui.wardrobeReveal) {
    const focusBottom = Math.floor(options.indexOf(focused) / cols) * (cardH + gap) + cardH;
    ui.offsets.set('wardrobe-catalog', Math.max(0, focusBottom - list.h));
    ui.wardrobeReveal = false;
  }
  ui.scrollArea('wardrobe-catalog', list, height, (offset) => {
    options.forEach((option, i) => {
      const y = list.y + Math.floor(i / cols) * (cardH + gap) - offset;
      if (y + cardH <= list.y || y >= list.y + list.h) return;
      const box = { x: list.x + (i % cols) * (cardW + gap), y, w: cardW, h: cardH };
      appearanceCard(ui, box, field, option, option === focused, () => select(field, option.value));
    });
  });

  ui.text('↔ 拖动旋转', stage.x + stage.w - 4, foot - 15, { size: 13, color: PALE, right: true, outline: true });
  const detailW = Math.min(185, w * .25);
  ui.panel(l, foot, detailW, 51, '#0a182bdc', 6, null);
  ui.panel(l, foot + 3, 3, 45, '#80ddfb', 1, null);
  ui.text(focused.name, l + 12, foot + 15, { size: 19, bold: true, max: detailW - 20 });
  ui.text(detail, l + 12, foot + 37, { size: 13, color: PALE, max: detailW - 20 });
  const action = { x: stage.x + stage.w / 2 - 75, y: foot + 4, w: 150, h: 42 };
  if (focused.equipped) {
    chip(ui, label, action, null, { fill: '#213a57', color: '#d5e5f6', size: 17 });
  } else {
    ribbon(ui, label, action, () => {
      if (!focused.owned) return ui.openTab('shop');
      game.setLook(field, focused.value);
      select(field, focused.value);
    }, { primary: true });
  }
}
