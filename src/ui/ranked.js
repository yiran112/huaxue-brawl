import './ranked.css';
import { FIRST_WIN_BONUS, RANK_MODES, TIERS } from '../rank.js';
import { $, esc } from './common.js';
import { pageTop } from './page-top.js';
import { drawRankCrest, rankedState, RANK_ART_SEED, RANK_COLORS, RANK_MODE_SUMMARY, RANK_RULES, RANK_SECTIONS } from './ranked-state.js';
import { trackArt } from './trackArt.js';

function tiers(view) {
  return `<section class="ranked-tiers"><h2>段位一览</h2><div>${TIERS.map((tier, i) => `<article class="${i === view.index ? 'current' : ''}">
    <canvas data-crest="${i}" width="144" height="144" aria-hidden="true"></canvas><b>${tier.name}</b><small>${tier.min} 分起</small></article>`).join('')}</div></section>`;
}

export const rankedMethods = {
  rankHtml() {
    const g = this.game;
    const { view, mode, games, firstWin, season, dates, left, percent, nextPoints } = rankedState(g.profile, this.rankMode);
    const section = this.rankSection || 'rank';
    const matching = !!this.queueing && !!g.rankMode;
    const nav = RANK_SECTIONS.map(([id, name]) => `<button data-act="rankSection" data-id="${id}" aria-pressed="${section === id}">${name}</button>`).join('');
    const modes = RANK_MODES.map(({ id, name }) => `<button class="${id === mode.id ? 'current' : ''}" data-act="rankMode" data-id="${id}" aria-pressed="${id === mode.id}">${name}</button>`).join('');
    let body;
    if (section === 'tiers') body = tiers(view);
    else if (section === 'rules') body = `<section class="ranked-rules"><h2>排位规则</h2><p>${esc(RANK_RULES)}</p><h3>${mode.name}</h3><p>${esc(mode.blurb)}</p></section>`;
    else body = `<div class="ranked-hero" style="--medal:${RANK_COLORS[view.index][0]}">
      <canvas data-crest="${view.index}" width="360" height="360" aria-hidden="true"></canvas>
      <h1>${view.name}</h1><span class="ranked-stars">${view.star}</span>
      <div class="ranked-points"><b>${view.pts}</b><span>${nextPoints ? `/ ${nextPoints}` : '分'}</span></div>
      <div class="ranked-meter" aria-label="晋级进度 ${percent}%"><i style="width:${percent}%"></i></div>
      <small>${view.next}${nextPoints ? ' 分' : ''}</small></div>
      <aside class="ranked-summary" aria-label="排位进度">
        <article><div><b>今日首胜</b><span>${firstWin ? '已完成' : '未完成'}</span></div><strong>+${FIRST_WIN_BONUS} <small>分</small></strong></article>
        <article><div><b>本赛季</b><span>生涯 ${view.wins} 胜 / ${view.games} 场</span></div><strong>${games} <small>场</small></strong></article>
      </aside>`;
    return `<section class="ranked-screen">
      <div class="ranked-art" aria-hidden="true">${trackArt('night', RANK_ART_SEED)}</div>
      <header class="ptop ranked-head">${pageTop('排位赛', g.profile.coins, { meta: { title: season, detail: `${dates} · ${left}` } })}</header>
      <nav class="ranked-nav side-nav" aria-label="排位赛导航">${nav}<button data-act="rankBoard">段位榜 ›</button></nav>
      ${body}
      <footer class="ranked-footer"><div class="ranked-mode-info"><b>${mode.name}</b><small>${RANK_MODE_SUMMARY[mode.id]}</small></div>
        <div class="ranked-modes" aria-label="排位玩法">${modes}</div>
        <button class="ranked-play" data-act="rankGo" data-id="${mode.id}"><b${matching ? ' id="rankWait"' : ''}>${matching ? `匹配中 ${esc(this.queueLine || '00:00')}` : '开始匹配'}</b>${matching ? '<small>点击取消</small>' : ''}</button></footer>
    </section>`;
  },

  paintRankCrests() {
    for (const canvas of $('tab-race').querySelectorAll('[data-crest]')) {
      const ctx = canvas.getContext('2d');
      if (ctx) drawRankCrest(ctx, canvas.width / 2, canvas.height / 2, canvas.width * .9, Number(canvas.dataset.crest));
    }
  },
};
