import './garage-catalog.css';
import { gearThumb } from '../gearThumb.js';
import { GEAR_KEYS } from '../gear.js';
import { rarityToken } from '../icon-art.js';
import { $, esc } from './common.js';
import { setGameHtml } from './web-icons.js';
import { garageEntries, GARAGE_OWNERSHIP, GARAGE_RANKS, GARAGE_SORTS } from './garage-catalog-state.js';

function options(list, selected) {
  return list.map(([id, name]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${name}</option>`).join('');
}

function tiles(entries) {
  if (!entries.length) return '<p class="garage-empty">没有符合条件的装备</p>';
  return entries.map(({ id, gear, owned, equipped }) => `<button class="garage-tile ${equipped ? 'current' : owned ? 'owned' : 'unowned'}" data-act="garageInspect" data-id="${id}" data-rarity="${gear.rarity}">
      <span class="garage-tile-status">${equipped ? '使用中' : owned ? '已拥有' : '未拥有'}</span>
      <span class="rarity-corner">${rarityToken(gear.rarity)}</span><span class="garage-tile-model" aria-hidden="true">${gear.icon}</span><b>${gear.name}</b></button>`).join('');
}

export const garageCatalogMethods = {
  garageCatalogHtml() {
    const g = this.game;
    const settings = this.garageCatalog || {};
    const nav = GARAGE_RANKS.map(([id, label]) => `<button data-act="garageRank" data-id="${id}" aria-pressed="${id === (settings.rank || 'all')}">${id === 'all' ? label : `${rarityToken(id)} · ${label}`}</button>`).join('');
    return `<section class="garage-catalog">
      <nav class="garage-catalog-nav side-nav" aria-label="装备稀有度"><b class="side-nav-heading">滑行装备</b>${nav}</nav>
      <section class="garage-catalog-body" aria-label="滑行装备列表">
        <header class="garage-filters"><h2>${GEAR_KEYS.filter((id) => g.profile.gearOwned(id)).length} / ${GEAR_KEYS.length} 已拥有</h2>
          <select aria-label="拥有状态" data-garage-filter="ownership">${options(GARAGE_OWNERSHIP, settings.ownership)}</select>
          <select aria-label="排序" data-garage-filter="sort">${options(GARAGE_SORTS, settings.sort)}</select>
          <input type="search" aria-label="搜索装备" placeholder="搜索装备" maxlength="24" data-garage-filter="query" value="${esc(settings.query || '')}">
        </header>
        <div class="garage-catalog-list"><div class="garage-catalog-grid">${tiles(garageEntries(g, settings))}</div></div>
      </section>
    </section>`;
  },

  observeGarageCards() {
    this.garageCardObserver?.disconnect();
    if (this.tab !== 'garage' || this.viewGear) return;
    const list = $('tab-garage').querySelector('.garage-catalog-list');
    if (!list) return;
    const draw = (tile) => {
      const thumb = gearThumb(tile.dataset.id, this.game.look);
      if (!thumb) return;
      const img = document.createElement('img');
      img.src = thumb;
      img.alt = '';
      img.draggable = false;
      tile.querySelector('.garage-tile-model').replaceChildren(img);
    };
    const cards = list.querySelectorAll('.garage-tile');
    if (!('IntersectionObserver' in window)) { cards.forEach(draw); return; }
    const observer = this.garageCardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !entry.target.isConnected) continue;
        observer.unobserve(entry.target);
        draw(entry.target);
      }
    }, { root: list, rootMargin: '60px' });
    cards.forEach((card) => observer.observe(card));
  },

  filterGarageCatalog(event) {
    const key = event.target.dataset.garageFilter;
    if (!key || event.type !== (key === 'query' ? 'input' : 'change')) return;
    this.setGarageFilter(key, event.target.value);
  },

  setGarageFilter(key, value) {
    this.garageCatalog = { ...this.garageCatalog, [key]: value };
    this.garageScroll = 0;
    const list = $('tab-garage').querySelector('.garage-catalog-list');
    list.scrollTop = 0;
    setGameHtml(list.querySelector('.garage-catalog-grid'), tiles(garageEntries(this.game, this.garageCatalog)));
    this.observeGarageCards();
  },
};
