import './tune.css';
import { GEAR, TUNE_PLANS, UP_KEYS, UP_MAX } from '../gear.js';
import { iconPath } from '../icon-art.js';
import { esc, PART_ICON } from './common.js';
import { tuneView } from './tune-state.js';

function connection({ from, to, recommended }) {
  const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y);
  return `<i class="tune-line ${w ? 'horizontal' : 'vertical'}${recommended ? ' recommended' : ''}" style="left:${x}%;top:${y}%;--span:${w || h}%"></i>`;
}

export function tuneHtml(profile, gear, plan, selected) {
  const view = tuneView(profile, gear, plan, selected);
  const { current, reason } = view;
  const plans = Object.entries(TUNE_PLANS).map(([id, route]) =>
    `<button data-act="upPlan" data-id="${id}" aria-pressed="${id === view.plan}">${route.name}</button>`).join('');
  const nodes = view.nodes.map((node) => {
    const cls = ['tune-node', node.locked && 'locked', node.full && 'full', node.recommended && 'recommended'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-act="upNode" data-line="${node.id}" aria-pressed="${node.selected}" style="--x:${node.x}%;--y:${node.y}%">
      <img src="${iconPath(node.id)}" alt="" draggable="false"><b>${node.name}</b><small>${node.level} / ${UP_MAX}</small></button>`;
  }).join('');
  const action = (id, label, cost) => {
    const attributes = reason ? `data-act="locked" data-why="${esc(reason)}"` : `data-act="${id}" data-line="${current.id}"`;
    const state = reason ? ' off' : profile.parts < cost ? ' poor' : '';
    return `<button class="tune-action${state}" ${attributes}><b>${label}</b>${reason ? '' : `<small>${PART_ICON} ${cost}</small>`}</button>`;
  };
  return `<section class="tune-page" aria-label="装备改装">
    <header class="tune-head"><div><h1>${GEAR[gear].name}</h1><span>改装进度 ${view.steps} / ${UP_KEYS.length * UP_MAX}</span></div>
      <div class="tune-plans" aria-label="推荐路线">${plans}</div></header>
    <div class="tune-tree-scroll"><div class="tune-graph" aria-label="改装科技树">
      <div class="tune-connections" aria-hidden="true">${view.lines.map(connection).join('')}</div>${nodes}
    </div></div>
    <footer class="tune-foot">
      <div class="tune-info" aria-live="polite"><b>${current.name} <span>${current.level} / ${UP_MAX}</span></b>
        <small>${esc(view.effect)} / 级</small>${reason ? `<small class="tune-reason">${esc(reason)}</small>` : ''}</div>
      <div class="tune-actions">${action('up', '改装', view.cost)}${action('upFull', '节点满改', view.fullCost)}</div>
    </footer></section>`;
}
