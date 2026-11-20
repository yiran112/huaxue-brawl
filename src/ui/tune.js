// 车库「改装」页：六边形节点拼成的改装树、推荐路线、改装 / 节点满改两个按钮
import { UPGRADES, UP_KEYS, UP_MAX, TUNE_PLANS, upDesc } from '../gear.js';
import { esc, PART_ICON } from './common.js';

// 节点在树里的位置：三列的横坐标（百分比），每一排的纵坐标（px）
const COL_X = [18, 50, 82];
const ROW_Y = [34, 112, 190, 268];
const BAR_Y = (ROW_Y[0] + ROW_Y[1]) / 2; // 核心下面那道横梁

// 没手动点过节点时，默认选中推荐路线上下一个能改的；路线走完了就挑别的能改的
export function tunePick(P, gear, plan, sel) {
  const up = P.up(gear);
  if (UP_KEYS.includes(sel)) return sel;
  const open = (k) => up[k] < UP_MAX && !P.upNeed(gear, k);
  const path = (TUNE_PLANS[plan] || TUNE_PLANS.race).path;
  return path.find(open) || UP_KEYS.find(open) || path[path.length - 1];
}

export function tuneHtml(P, gear, owned, plan, sel) {
  const up = P.up(gear);
  const P0 = TUNE_PLANS[plan] ? plan : 'race';
  const path = TUNE_PLANS[P0].path;
  const cur = tunePick(P, gear, P0, sel);
  const pathCol = UPGRADES[path[path.length - 1]].col;

  // 连线：先画暗的，亮的（推荐路线）压在上面
  const lines = [[], []];
  const seg = (x1, y1, x2, y2, on) => lines[on ? 1 : 0].push(`<line x1="${x1}%" y1="${y1}" x2="${x2}%" y2="${y2}"${on ? ' class="on"' : ''}/>`);
  for (const k of UP_KEYS) {
    const U = UPGRADES[k];
    if (!U.need) continue;
    const on = U.col === pathCol;
    const x = COL_X[U.col];
    if (U.row === 1) {
      seg(COL_X[1], ROW_Y[0], COL_X[1], BAR_Y, true);
      if (U.col !== 1) seg(COL_X[1], BAR_Y, x, BAR_Y, on);
      seg(x, BAR_Y, x, ROW_Y[1], on);
    } else {
      seg(x, ROW_Y[U.row - 1], x, ROW_Y[U.row], on);
    }
  }

  const nodes = UP_KEYS.map((k) => {
    const U = UPGRADES[k];
    const lv = up[k];
    const lock = !lv && !!P.upNeed(gear, k);
    const full = lv >= UP_MAX;
    const cls = ['mnode', lock && 'lock', full && 'full', k === cur && 'on', !path.includes(k) && 'dim'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-act="upNode" data-line="${k}" style="--x:${COL_X[U.col]}%;--y:${ROW_Y[U.row]}px">
      <span class="mhx"></span><span class="ic">${lock ? '🔒' : U.icon}</span><b>${lv}/${UP_MAX}</b>${full ? '<i class="ok">✓</i>' : ''}</button>`;
  }).join('');

  const U = UPGRADES[cur];
  const lv = up[cur];
  const need = P.upNeed(gear, cur);
  const one = P.upgradeCost(gear, cur);
  const all = P.upgradeFullCost(gear, cur);
  // 两个按钮：没拥有 / 没解锁 / 已改满时点了只弹原因
  let why = '';
  if (lv >= UP_MAX) why = `${U.name}已经改满了`;
  else if (!owned) why = '还没拥有这件装备';
  else if (need) why = `先把「${UPGRADES[need].name}」改满`;
  const btn = (act, label, cost) => {
    const poor = !why && P.parts < cost;
    const attr = why ? `data-act="locked" data-why="${esc(why)}"` : `data-act="${act}" data-line="${cur}"`;
    return `<div><span class="mcost ${poor ? 'poor' : ''}">${lv >= UP_MAX ? 'MAX' : `${PART_ICON} ${cost}`}</span><button class="mbtn ${why ? 'off' : ''} ${poor ? 'poor' : ''}" ${attr}>${label}</button></div>`;
  };
  const plans = Object.keys(TUNE_PLANS)
    .map((p) => `<button class="${p === P0 ? 'on' : ''}" data-act="upPlan" data-id="${p}">${TUNE_PLANS[p].name}</button>`)
    .join('');

  return `<div class="mtree"><svg>${lines[0].join('')}${lines[1].join('')}</svg>${nodes}</div>
    <div class="minfo"><span class="ic">${U.icon}</span><b>${U.name}</b><span class="lv">${lv}/${UP_MAX}</span><small>${upDesc(cur)} / 级</small></div>
    <div class="mplans">${plans}</div>
    <div class="mbuy">${btn('up', '改装', one)}${btn('upFull', '节点满改', all)}</div>`;
}
