import { HATS, LOOK_PRESETS, SKINS, SUIT_COLORS } from '../config.js';
import { BOX_POOL, COSMETIC_SLOTS } from '../gear.js';
import { SHOW } from './common.js';

const OFF = '⊘';
const ICONS = { hat: '💇', goggles: '🥽', back: '🎒', scarf: '🧣', trail: '❄' };
const TIERS = new Map(BOX_POOL.map(({ key, tier }) => [key, tier]));
const COLOR_NAMES = {
  0xff3d6e: '玫红', 0xff8a1f: '亮橙', 0xffd21f: '金黄', 0x38d16a: '草绿',
  0x1fc8d6: '湖蓝', 0x2f6bff: '亮蓝', 0x8a4dff: '紫罗兰', 0xff5fd0: '樱粉',
  0xf4f4f4: '雪白', 0x2b2f3a: '炭灰', 0xb7ff3c: '荧光绿', 0xff5a36: '珊瑚橙',
  0x2a1a12: '深棕', 0x7ad21f: '青绿', 0x2f3fd0: '靛蓝',
};

const colors = (list) => list.map((color) => ({ name: COLOR_NAMES[color], value: color, color }));
export const WARDROBE_GROUPS = [
  { id: 'acc', title: '饰品', parts: Object.entries(COSMETIC_SLOTS).map(([field, slot]) => ({
    field, title: slot.name, view: field === 'back' || field === 'trail' ? 'back' : 'front',
    options: slot.list.map(({ name, color }, value) => ({
      name, value, color, model: value !== 0 && field !== 'trail', icon: value === 0 && field !== 'trail' ? OFF : ICONS[field],
    })),
  })) },
  { id: 'style', title: '造型', parts: [
    { field: 'hat', title: '发型 / 帽子', options: HATS.map((name, value) => ({ name, value, model: true, icon: ICONS.hat })) },
    { field: 'skin', title: '肤色', swatches: true, options: SKINS.map((color, i) => ({ name: `肤色 ${i + 1}`, value: color, color })) },
    { field: 'mustache', title: '胡子', options: [{ name: '无胡子', value: false, icon: OFF }, { name: '有胡子', value: true, icon: '〰' }] },
  ] },
  { id: 'color', title: '配色', parts: [
    { field: 'hatColor', title: '发色 / 帽色', swatches: true, options: colors([...SUIT_COLORS, 0x2a1a12, 0x7ad21f, LOOK_PRESETS[0].hatColor]) },
    // 滑行装备的颜色是做好的（gear.js 的 GEAR_COLOR），这里不给改
    ...[['jacket', '上衣'], ['stripe', '条纹 / 袖口'], ['pants', '裤子']].map(([field, title]) => ({
      field, title, swatches: true, options: colors(SUIT_COLORS),
    })),
  ] },
];

export function wardrobeState(game, selection) {
  const field = selection?.field || 'back';
  const group = WARDROBE_GROUPS.find(({ parts }) => parts.some((part) => part.field === field));
  const part = group.parts.find((part) => part.field === field);
  let equipped = game.look[field];
  if (field === 'skin' && equipped < SKINS.length) equipped = SKINS[equipped];
  const options = part.options.map((option) => {
    const { value } = option;
    const owned = field === 'hat' ? game.profile.hatOwned(value) : group.id !== 'acc' || game.profile.cosmeticOwned(field, value);
    return { ...option, owned, equipped: equipped === value, tier: TIERS.get(`${field}:${value}`) };
  });
  if (part.swatches && !options.some((option) => option.equipped) && Number.isInteger(equipped) && equipped >= 0 && equipped <= 0xffffff) {
    options.push({ name: '当前配色', value: equipped, color: equipped, owned: true, equipped: true });
  }
  const focused = options.find(({ value }) => value === selection?.value)
    || (field === 'back' && equipped === 0 ? options[1] : options.find((option) => option.equipped)) || options[0];
  return { field, group, part, options, focused };
}

export function previewWardrobe(game, { field, part, focused }) {
  const patch = focused.equipped ? null : { [field]: focused.value };
  game.setShow(SHOW.look.label, game.look.gear, patch, part.view || 'front');
}

export function wardrobeAction({ part, focused }) {
  if (!focused.owned) return { label: '去抽奖', detail: '雪花补给箱抽奖获得' };
  if (part.swatches) return focused.equipped ? { label: '已应用', detail: '当前使用' } : { label: '应用配色', detail: '预览中' };
  return focused.equipped ? { label: '使用中', detail: '当前使用' } : { label: '确认使用', detail: '试穿中' };
}
