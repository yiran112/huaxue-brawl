// 界面各部分共用的小工具和常量
import { HATS } from '../config.js';
import { GEAR, SHOP_GEAR, RARITY, RARITY_KEYS, COSMETIC_SLOTS } from '../gear.js';

export const $ = (id) => document.getElementById(id);
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const TIER_ICONS = ['🥉', '🥈', '🥇', '💠', '💎', '🌟', '👑'];
// 改装币的小图标（样式 .tcn 在 index.html）
export const PART_ICON = '<i class="tcn">T</i>';

// 展厅页：角色站在中间的展台上，左边一列竖排子页签，右边信息面板。
// label 是展台背后的全息大字；subs：[子页 key, 名字, 英文小字]，第一个是默认子页
const RARITY_EN = { C: 'COMMON', B: 'UNCOMMON', A: 'RARE', S: 'LEGEND' };
export const SHOW = {
  growth: { label: 'CAREER', subs: [['home', '总览', 'OVERVIEW'], ['ach', '成就', 'TROPHIES'], ['stats', '生涯', 'RECORDS']] },
  garage: { label: 'GARAGE', subs: [['attr', '属性', 'PROPERTY'], ['up', '改装', 'TUNING']] },
  // 商城左边是货架分区的目录：补给箱，再加上货架上有的每一档稀有度。点了跳到右边货架的那一区
  shop: {
    label: 'SHOP',
    subs: [['box', '补给箱', 'SUPPLY'], ...RARITY_KEYS.filter((r) => SHOP_GEAR.some((k) => GEAR[k].rarity === r)).map((r) => [r, RARITY[r].name, RARITY_EN[r]])],
  },
  look: { label: 'STYLE', subs: [['style', '造型', 'STYLE'], ['color', '配色', 'COLOR'], ['acc', '饰品', 'ACCESSORY']] },
};

// 补给箱里的外观：存档 key → { slot, i, part 部位名, name, icon }
const SLOT_ICON = { hat: '💇', goggles: '🥽', back: '🎒', scarf: '🧣', trail: '🌈' };
export function cosmeticOf(key) {
  const [slot, id] = key.split(':');
  const i = +id;
  const S = COSMETIC_SLOTS[slot];
  return { slot, i, part: slot === 'hat' ? '发型' : S.name, name: slot === 'hat' ? HATS[i] : S.list[i].name, icon: SLOT_ICON[slot] || '🎁' };
}
