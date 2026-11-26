// 结算界面：左边名次榜单，右边领奖台（3D 角色 + 名次牌 + 彩纸），底栏本局收获和按钮
import { SKINS } from '../config.js';
import { TEAM_COLORS } from '../modes.js';
import { $, hex, esc, PART_ICON } from './common.js';
import { PodiumView } from './podium3d.js';
import { setGameText, setGameHtml } from './web-icons.js';
import './results.css';

const MEDALS = ['🥇', '🥈', '🥉'];
const CONFETTI = ['#ffd23c', '#ff3d6e', '#4fd2ff', '#8dff6a', '#ffffff', '#ff8a5c', '#b48cff'];
const INTRO_MS = 1900; // 入场动画放完后去掉标记，联机名单刷新时不再重播

function updateHtml(id, html, key = html) {
  const el = $(id);
  if (el.resultMarkup === key) return false;
  setGameHtml(el, html);
  el.resultMarkup = key;
  return true;
}

const filled = (v) => v != null && v !== '';

function lookVars(L) {
  const skin = L.skin >= 16 ? L.skin : SKINS[L.skin] ?? SKINS[0];
  return `--c1:${hex(L.jacket ?? 0xff8a1f)};--c2:${hex(L.stripe ?? 0xffd21f)};--hc:${hex(L.hatColor ?? 0x2f3fd0)};--sk:${hex(skin)}`;
}

function rankings(rows, pointsLabel = '得分') {
  const hasTime = rows.some((r) => filled(r.time));
  const hasPoints = rows.some((r) => r.pts != null);
  const hasFace = rows.some((r) => r.look);
  const cols = ['auto', hasFace && 'auto', 'minmax(0, 1fr)', hasTime && 'auto', hasPoints && 'auto'].filter(Boolean).join(' ');
  const head = `<li class="rr-head" aria-hidden="true"><span class="rr-rank">名次</span>${hasFace ? '<span></span>' : ''}<span>选手</span>${hasTime ? '<span class="rr-stat">用时</span>' : ''}${hasPoints ? `<span class="rr-stat">${esc(pointsLabel)}</span>` : ''}</li>`;
  const body = rows.map((r, i) => {
    const place = [1, 2, 3].includes(r.rank) ? ` rp${r.rank}` : '';
    const color = TEAM_COLORS[r.team];
    const face = hasFace ? `<span class="rr-face"${r.look ? ` style="${lookVars(r.look)}"` : ''}></span>` : '';
    return `<li class="rr-row${r.me ? ' me' : ''}${place}${color ? ' team' : ''}" style="--i:${i}${color ? `;--team:${color}` : ''}">
      <span class="rr-rank">${esc(r.rank)}</span>${face}
      <span class="rr-player"><span class="rr-name" title="${esc(r.name)}">${esc(r.name)}</span>${r.me && r.rank !== '你' ? '<span class="res-you">你</span>' : ''}</span>
      ${hasTime ? `<span class="rr-stat">${esc(r.time ?? '')}</span>` : ''}
      ${hasPoints ? `<span class="rr-stat rr-pts">${esc(r.pts ?? '')}</span>` : ''}
    </li>`;
  }).join('');
  return `<ol class="rr-list" aria-labelledby="resRankTitle" style="grid-template-columns:${cols}">${head}${body}</ol>`;
}

// 彩纸：每片的位置、大小、颜色、下落时间都随机，靠 CSS 变量交给动画
function confetti(n = 46) {
  let html = '';
  for (let i = 0; i < n; i++) {
    const fall = 3.8 + Math.random() * 3.6;
    const vars = [
      `--x:${(Math.random() * 100).toFixed(1)}%`, `--fall:${fall.toFixed(2)}s`,
      `--wait:${(i < n * 0.45 ? Math.random() * 1.1 : Math.random() * fall).toFixed(2)}s`,
      `--w:${(5 + Math.random() * 5).toFixed(1)}px`, `--h:${(8 + Math.random() * 7).toFixed(1)}px`,
      `--dx:${((Math.random() - 0.5) * 90).toFixed(0)}px`, `--spin:${(0.7 + Math.random() * 1.1).toFixed(2)}s`,
      `--c:${CONFETTI[i % CONFETTI.length]}`,
    ];
    html += `<i style="${vars.join(';')}"></i>`;
  }
  return html;
}

// 这一局对自己来说是好结果还是坏结果，标题条换颜色
function tone(data) {
  if (/失败|掉线/.test(data.title)) return 'lose';
  const me = data.rows.find((r) => r.me);
  return me?.rank === 1 || /胜利|🏆|🥇/.test(data.title) ? 'win' : '';
}

export const resultsMethods = {
  hideResults() {
    const results = $('results');
    results.classList.add('hidden');
    results.classList.remove('res-intro');
    clearTimeout(this.resIntroT);
    if (this.podium3d) this.podium3d.clear();
    updateHtml('resPodium', '');
    $('resRewards').open = false;
    $('resBox').querySelector('.res-scroll').scrollTop = 0;
    $('resRanking').scrollTop = 0;
    this.renderedReward = null;
  },

  rewardHtml(rw) {
    const P = this.game.profile;
    const line = (label, xp, coins, parts, cls = '') =>
      `<div class="rl ${cls}"><span>${esc(label)}</span><span class="rx">${xp ? `+${xp}` : ''}</span><span class="rc">${coins ? `❄+${coins}` : ''}</span><span class="rp">${parts ? `+${parts}` : ''}</span></div>`;
    let xp = rw.xp;
    let coins = rw.coins;
    let parts = rw.parts || 0;
    let html = '<div class="rl head"><span>奖励</span><span class="rx">经验</span><span class="rc">雪花币</span><span class="rp">改装币</span></div>';
    for (const l of rw.lines) html += l.note ? `<div class="rl note">${esc(l.label)}</div>` : line(l.label, l.xp, l.coins, l.parts);
    for (const e of rw.extra) {
      html += line(e.label, e.xp, e.coins, 0, 'gold');
      xp += e.xp || 0;
      coins += e.coins || 0;
    }
    for (const t of rw.tasks) {
      html += line(`✅ 每日任务：${t.name}`, t.xp, t.coins, t.parts, 'good');
      xp += t.xp;
      coins += t.coins;
      parts += t.parts || 0;
    }
    if (rw.bonus) {
      html += line('🎁 今日任务全部完成', 0, rw.bonus, rw.bonusParts, 'good');
      coins += rw.bonus;
      parts += rw.bonusParts || 0;
    }
    for (const a of rw.ach) {
      html += line(`🏆 成就「${a.name}」${a.title ? ` · 称号「${a.title}」` : ''}`, 0, a.coins, 0, 'gold');
      coins += a.coins || 0;
    }
    html += line('合计', xp, coins, parts, 'total');
    const info = P.levelInfo();
    const up = rw.lvTo > rw.lvFrom;
    html += `<div class="rlv">${up ? `<b>⬆ 升到 Lv.${rw.lvTo}！</b>` : `Lv.${info.lv}`}<div class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div><span>❄ ${P.coins}</span><span>${PART_ICON} ${P.parts}</span></div>`;
    if (rw.unlocks.length) html += `<div class="rl good unl">🔓 新解锁：${rw.unlocks.map(esc).join('、')}</div>`;
    const chips = [
      xp && `<span class="rg rg-xp">+${xp} 经验</span>`,
      coins && `<span class="rg rg-coin">❄ +${coins}</span>`,
      parts && `<span class="rg rg-part">${PART_ICON} +${parts}</span>`,
      up && `<span class="rg rg-up">⬆ Lv.${rw.lvTo}</span>`,
    ].filter(Boolean).join('');
    const level = up ? '' : `<span class="rg-lv">Lv.${info.lv}<span class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></span></span>`;
    return { html, total: (chips || '<span class="rg">本局没有奖励</span>') + level };
  },

  showResults(data) {
    const results = $('results');
    const fresh = results.classList.contains('hidden');
    if ($('resTitle').resultText !== data.title) {
      setGameText($('resTitle'), data.title);
      $('resTitle').resultText = data.title;
    }
    this.lastResults = data;
    const awards = data.awards || [];
    const hasRows = data.rows.length > 0;
    const top = data.rows.slice(0, 3);
    const podium = top.length === 3 && top.every((r) => r.look);
    results.classList.toggle('has-podium', podium);
    results.classList.toggle('tone-win', tone(data) === 'win');
    results.classList.toggle('tone-lose', tone(data) === 'lose');
    $('resBody').classList.toggle('hidden', !hasRows);
    $('resRankTitle').textContent = data.rows[0]?.rank === '你' ? '计时成绩' : '比赛排名';
    updateHtml('resList', hasRows ? rankings(data.rows, data.pointsLabel) : '');
    $('resStage').classList.toggle('hidden', !podium);
    // 联机榜单会刷新，前三名与他们的成绩没变就保留正在播放的领奖动作。
    const stage = podium ? [1, 0, 2].map((i) => this.podiumCard(top[i], i)).join('') : '';
    const stageKey = podium ? stage + JSON.stringify(top.map((r) => [r.idx, r.look, r.team])) : '';
    if (updateHtml('resPodium', stage, stageKey)) {
      if (podium) this.bindPodium(top);
      else if (this.podium3d) this.podium3d.clear();
    }
    const confettiBox = results.querySelector('.res-confetti');
    if (podium && !confettiBox.childElementCount) confettiBox.innerHTML = confetti();
    const chips = awards.map((a) => `<div class="res-award${a.me ? ' me' : ''}"><span>${esc(a.icon)}</span><b>${esc(a.name)}</b><small>${esc(a.who)} · ${esc(a.val)}</small></div>`).join('');
    updateHtml('resAwards', chips ? `<h3>本局之最</h3>${chips}` : '');
    $('resAwards').classList.toggle('hidden', !chips);

    if (data.reward && this.renderedReward !== data.reward) {
      this.lastReward = data.reward;
      this.renderedReward = data.reward;
      const reward = this.rewardHtml(data.reward);
      setGameHtml($('resReward'), reward.html);
      setGameHtml($('resRewardTotal'), reward.total);
    }
    $('resRewards').classList.toggle('hidden', !data.reward);
    const swap = $('btnPracticeSwap');
    swap.textContent = data.swapLabel || '';
    swap.classList.toggle('hidden', !data.swapLabel);
    $('btnNext').textContent = data.nextLabel;
    $('btnLobby').textContent = data.backLabel || '返回大厅';
    results.classList.remove('hidden');
    if (fresh) {
      clearTimeout(this.resIntroT);
      results.classList.add('res-intro');
      this.resIntroT = setTimeout(() => results.classList.remove('res-intro'), INTRO_MS);
      // 榜单放不下时，先把自己那一行滚到看得见的地方
      const list = $('resRanking');
      const me = list.querySelector('.rr-row.me');
      if (me && list.scrollHeight > list.clientHeight) {
        list.scrollTop = Math.max(0, me.offsetTop - list.offsetTop - (list.clientHeight - me.offsetHeight) / 2);
      }
    }
  },

  podiumCard(r, i) {
    const score = [r.time, r.pts].filter(filled).join(' · ');
    const color = TEAM_COLORS[r.team];
    return `<div class="res-podium-place rp${i + 1}${r.me ? ' me' : ''}"${color ? ` style="--team:${color}"` : ''}>
      <div class="res-podium-model"><canvas class="rav3d" data-i="${i}" aria-hidden="true"></canvas></div>
      <div class="res-badge" aria-label="第 ${i + 1} 名"><span class="res-badge-medal">${MEDALS[i]}</span><b>#${i + 1}</b></div>
      <div class="res-plate">
        <div><b title="${esc(r.name)}">${esc(r.name)}</b>${r.me ? '<span class="res-you">你</span>' : ''}</div>
        <small>${esc(score)}</small>
      </div>
    </div>`;
  },

  bindPodium(rows) {
    const cvs = [...$('resPodium').querySelectorAll('canvas.rav3d')];
    if (!this.podium3d) this.podium3d = new PodiumView();
    const list = cvs.map((cv) => {
      const i = Number(cv.dataset.i);
      return { canvas: cv, look: rows[i].look, place: i, team: rows[i].team };
    });
    if (this.podium3d.bind(list)) return;
    for (const cv of cvs) cv.outerHTML = this.flatAvatar(rows[Number(cv.dataset.i)].look);
  },

  flatAvatar(L) {
    return `<div class="rav" style="${lookVars(L)}"><i class="hat"></i><i class="head"></i><i class="body"></i></div>`;
  },
};
