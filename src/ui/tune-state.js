import { TUNE_PLANS, UPGRADES, UP_KEYS, UP_MAX, upDesc } from '../gear.js';

// 改装数据的 row 表示阶段，col 表示分支。显示时阶段向右，分支纵向排列。
const positions = Object.fromEntries(UP_KEYS.map((id) => {
  const { row, col } = UPGRADES[id];
  return [id, { x: 12.5 + row * 25, y: (col + .5) * 100 / 3 }];
}));

export function tuneView(profile, gear, planId, selectedId) {
  const levels = profile.up(gear);
  const owned = profile.gearOwned(gear);
  const plan = Object.keys(TUNE_PLANS).includes(planId) ? planId : 'race';
  const path = TUNE_PLANS[plan].path;
  const available = (id) => levels[id] < UP_MAX && !profile.upNeed(gear, id);
  const selected = UP_KEYS.includes(selectedId) ? selectedId : path.find(available) || UP_KEYS.find(available) || path[path.length - 1];
  const nodes = UP_KEYS.map((id) => ({
    id, ...positions[id], ...UPGRADES[id], level: levels[id], recommended: path.includes(id),
    locked: !!profile.upNeed(gear, id), full: levels[id] >= UP_MAX, selected: selected === id,
  }));

  const lines = [];
  const add = (from, to, recommended) => lines.push({ from, to, recommended });
  const root = positions.core;
  const forkX = (root.x + positions.wax.x) / 2;
  const fork = { x: forkX, y: root.y };
  add(root, fork, true);
  for (const node of nodes) {
    if (!node.need) continue;
    if (node.need !== 'core') {
      add(positions[node.need], node, node.recommended);
      continue;
    }
    const bend = { x: forkX, y: node.y };
    if (bend.y !== fork.y) add(fork, bend, node.recommended);
    add(bend, node, node.recommended);
  }
  lines.sort((a, b) => Number(a.recommended) - Number(b.recommended));

  const current = nodes.find((node) => node.selected);
  const need = profile.upNeed(gear, selected);
  let reason = '';
  if (current.full) reason = '该节点已改满';
  else if (!owned) reason = '拥有该装备后可改装';
  else if (need) reason = `先将「${UPGRADES[need].name}」改满`;
  return {
    plan, nodes, lines, current, reason, owned, effect: upDesc(selected),
    steps: Object.values(levels).reduce((total, lv) => total + lv, 0),
    cost: profile.upgradeCost(gear, selected), fullCost: profile.upgradeFullCost(gear, selected),
  };
}
