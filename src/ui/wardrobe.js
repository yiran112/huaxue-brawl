import './wardrobe.css';
import { appearanceThumb } from '../gearThumb.js';
import { rarityToken } from '../icon-art.js';
import { WARDROBE_GROUPS, previewWardrobe, wardrobeAction, wardrobeState } from './appearance.js';
import { $, esc, hex } from './common.js';

function wardrobeTile(game, field, option, i, selected, takePhoto) {
  const image = option.model && takePhoto ? appearanceThumb(field, option.value, game.look) : null;
  const icon = option.color === 'rainbow' ? '<i class="wardrobe-swatch rainbow"></i>'
    : option.color != null ? `<i class="wardrobe-swatch" style="--swatch:${hex(option.color)}"></i>`
      : image ? `<img src="${image}" alt="" draggable="false">` : `<i>${option.icon}</i>`;
  const state = option.equipped ? '<span class="wardrobe-badge worn">使用中</span>'
    : !option.owned ? '<span class="wardrobe-badge">未解锁</span>' : '';
  const tier = option.tier ? `<span class="rarity-corner">${rarityToken(option.tier)}</span>` : '';
  return `<button class="wardrobe-tile" data-act="wardrobeItem" data-index="${i}" data-tier="${option.tier || ''}" aria-pressed="${selected}">
    <span class="wardrobe-visual" aria-hidden="true">${icon}</span>${state}${tier}<b>${esc(option.name)}</b></button>`;
}

export const wardrobeMethods = {
  lookHtml() {
    const game = this.game;
    const state = wardrobeState(game, this.wardrobeSelection);
    const { field, group, part, options, focused } = state;
    const { label, detail } = wardrobeAction(state);
    const nav = WARDROBE_GROUPS.map((entry) => {
      const active = entry === group;
      const expanded = active && !this.wardrobeCollapsed;
      const first = entry.id === 'acc' ? 'back' : entry.parts[0].field;
      const children = expanded ? `<div class="wardrobe-parts">${entry.parts.map((p) =>
        `<button data-act="wardrobePart" data-field="${p.field}" aria-pressed="${p === part}">${p.title}</button>`).join('')}</div>` : '';
      return `<button class="wardrobe-group" data-act="wardrobeGroup" data-field="${active ? field : first}" aria-current="${active}" aria-expanded="${expanded}"><span>${entry.title}</span><i aria-hidden="true">${expanded ? '⌄' : '›'}</i></button>${children}`;
    }).join('');
    const tiles = options.map((option, i) => wardrobeTile(game, field, option, i, focused === option, this.tab === 'look')).join('');
    return `<nav class="wardrobe-nav side-nav" aria-label="装扮分类">${nav}</nav>
      <div class="wardrobe-stage sdrag" title="拖动旋转角色"><span>↔ 拖动旋转</span></div>
      <section class="wardrobe-catalog" aria-label="${part.title}">
        <h2>${part.title}</h2>
        <div class="wardrobe-list colBody"><div class="wardrobe-grid${part.swatches ? ' swatches' : ''}">${tiles}</div></div>
      </section>
      <div class="wardrobe-detail" aria-live="polite"><b>${esc(focused.name)}</b><span>${detail}</span></div>
      <div class="wardrobe-action"><button class="wardrobe-primary" data-act="${focused.owned ? 'wardrobeWear' : 'toBox'}" ${focused.equipped ? 'disabled' : ''}>${label}</button></div>`;
  },

  onWardrobeClick(button) {
    const { act, field, index } = button.dataset;
    const state = wardrobeState(this.game, this.wardrobeSelection);
    if (act === 'wardrobeGroup' && state.field === field) {
      this.wardrobeCollapsed = !this.wardrobeCollapsed;
      this.renderTab('look');
      return true;
    }
    if (act === 'wardrobeGroup' || act === 'wardrobePart') {
      if (state.field === field) return true;
      this.wardrobeCollapsed = false;
      this.wardrobeSelection = { field };
      $('tab-look').querySelector('.wardrobe-list').scrollTop = 0;
    } else if (act === 'wardrobeItem') {
      const option = state.options[Number(index)];
      if (!option) return true;
      this.wardrobeSelection = { field: state.field, value: option.value };
    } else if (act === 'wardrobeWear') {
      if (state.focused.owned && !state.focused.equipped) this.game.setLook(state.field, state.focused.value);
    } else return false;
    this.renderTab('look');
    this.revealWardrobeFocus();
    previewWardrobe(this.game, wardrobeState(this.game, this.wardrobeSelection));
    return true;
  },

  revealWardrobeFocus() {
    const list = $('tab-look').querySelector('.wardrobe-list');
    const tile = list.querySelector('[aria-pressed="true"]');
    const visible = list.getBoundingClientRect();
    const selected = tile.getBoundingClientRect();
    if (selected.bottom > visible.bottom) list.scrollTop += selected.bottom - visible.bottom + 2;
    else if (selected.top < visible.top) list.scrollTop -= visible.top - selected.top + 2;
  },
};
