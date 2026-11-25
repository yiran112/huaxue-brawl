import { esc, PART_ICON } from './common.js';

const amount = (value) => (Number(value) || 0).toLocaleString();

export function pageTop(title, coins, { act = 'back', sub = '', parts = null, action = null, meta = null } = {}) {
  return `<button type="button" class="pback" data-act="${esc(act)}"><kbd>Esc</kbd>返回</button>
    <div class="ptitle"><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>
    ${meta ? `<div class="pmeta"><b>${esc(meta.title)}</b><small>${esc(meta.detail)}</small></div>` : ''}
    <div class="pactions">
      ${action ? `<button type="button" class="paction" data-act="${esc(action.act)}">${esc(action.label)}</button>` : ''}
      ${parts == null ? '' : `<div class="pcoin">${PART_ICON} <b>${amount(parts)}</b></div>`}
      <div class="pcoin">❄ <b>${amount(coins)}</b></div>
    </div>`;
}
