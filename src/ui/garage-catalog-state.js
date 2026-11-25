import { GEAR, GEAR_KEYS, RARITY, RARITY_KEYS, rarityRank } from '../gear.js';

export const GARAGE_RANKS = [['all', '全部'], ...[...RARITY_KEYS].reverse().map((id) => [id, RARITY[id].name])];
export const GARAGE_OWNERSHIP = [['all', '全部装备'], ['owned', '已拥有'], ['unowned', '未拥有']];
export const GARAGE_SORTS = [['default', '默认排序'], ['rarity', '稀有度优先'], ['owned', '已拥有优先']];

export function garageEntries(game, { rank = 'all', ownership = 'all', sort = 'default', query = '' } = {}) {
  const search = query.trim().toLowerCase();
  const entries = [];
  for (const id of GEAR_KEYS) {
    const gear = GEAR[id];
    if (rank !== 'all' && rank !== gear.rarity) continue;
    if (search && !gear.name.toLowerCase().includes(search) && !id.includes(search)) continue;
    const owned = game.profile.gearOwned(id);
    if (ownership === 'owned' && !owned || ownership === 'unowned' && owned) continue;
    entries.push({ id, gear, owned, equipped: id === game.look.gear });
  }
  if (sort === 'rarity') entries.sort((a, b) => rarityRank(b.gear.rarity) - rarityRank(a.gear.rarity));
  if (sort === 'owned') entries.sort((a, b) => Number(b.owned) - Number(a.owned));
  return entries;
}

// 车库详情页的左右切换：按目录当前的筛选和排序走到上一件 / 下一件，首尾相接。
// 正在看的那件不在筛选结果里，就在全部装备里走
export function garageStep(game, settings, id, dir) {
  let list = garageEntries(game, settings).map((e) => e.id);
  if (!list.includes(id)) list = GEAR_KEYS;
  const i = list.indexOf(id);
  return list[(i + dir + list.length) % list.length];
}
