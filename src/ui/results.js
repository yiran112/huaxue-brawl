// 结算界面：领奖台、本局之最、奖励明细
import { SKINS } from '../config.js';
import { TEAM_COLORS } from '../modes.js';
import { $, hex, esc, PART_ICON } from './common.js';
import { PodiumView } from './podium3d.js';

export const resultsMethods = {
  hideResults() {
    $('results').classList.add('hidden');
    if (this.podium3d) this.podium3d.clear();
    this.resHtml = '';
  },

  rewardHtml(rw) {
    if (!rw) return '';
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
    html += `<div class="rlv">${rw.lvTo > rw.lvFrom ? `<b>⬆ 升到 Lv.${rw.lvTo}！</b>` : `Lv.${info.lv}`}<div class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div><span>❄ ${P.coins}</span><span>${PART_ICON} ${P.parts}</span></div>`;
    if (rw.unlocks.length) html += `<div class="rl good unl">🔓 新解锁：${rw.unlocks.map(esc).join('、')}</div>`;
    return html;
  },

  showResults(data) {
    // data: { title, sub, rows: [{rank,name,me,idx,look,time,pts,team}], nextLabel, reward, backLabel, awards: [{icon,name,who,me,idx,val}] }
    $('resTitle').textContent = data.title;
    $('resSub').textContent = data.sub;
    // 有三个以上带造型的名次：前三名站上领奖台（第二、第一、第三从左到右），下面是「本局之最」，再往下从第四名列起
    const awards = data.awards || [];
    const podium = data.rows.length >= 3 && data.rows.slice(0, 3).every((r) => r.look);
    const rest = podium ? data.rows.slice(3) : data.rows;
    let html = '';
    if (podium) html += `<div class="rpod">${[1, 0, 2].map((i) => this.podiumCard(data.rows[i], i, awards)).join('')}</div>`;
    if (awards.length) {
      const chips = awards.map((a) => `<div class="rawd ${a.me ? 'me' : ''}"><span>${a.icon}</span><b>${a.name}</b><i>${esc(a.who)}</i><em>${a.val}</em></div>`).join('');
      html += `<div class="rawards"><small>本局之最</small>${chips}</div>`;
    }
    html += rest
      .map((r) => {
        const team = r.team >= 0 ? ` style="border-left:5px solid ${TEAM_COLORS[r.team]}"` : '';
        return `<div class="row ${r.me ? 'me' : ''}"${team}><span class="n">${r.rank}</span><span class="nm">${esc(r.name)}</span><span class="tm">${r.time}</span>${r.pts !== undefined ? `<span class="pt">${r.pts}</span>` : ''}</div>`;
      })
      .join('');
    // 联机结算每半秒刷新一次，内容没变就不重画，免得领奖台的入场动画一遍遍重播
    if (this.resHtml !== html) {
      $('resList').innerHTML = html;
      if (podium) this.bindPodium(data.rows);
      else if (this.podium3d) this.podium3d.clear();
    }
    this.resHtml = html;
    const rw = $('resReward');
    if (data.reward) {
      this.lastReward = data.reward;
      rw.innerHTML = this.rewardHtml(data.reward);
    }
    rw.classList.toggle('hidden', !data.reward);
    $('btnNext').textContent = data.nextLabel;
    $('btnLobby').textContent = data.backLabel || '返回大厅';
    $('results').classList.remove('hidden');
  },

  // 领奖台上的一张卡：奖牌、选手的 3D 模型、名字、成绩，拿到的「本局之最」挂在下面，最底下是名次台子
  podiumCard(r, i, awards) {
    const team = r.team >= 0 ? ` style="--tc:${TEAM_COLORS[r.team]}"` : '';
    const mine = awards.filter((a) => a.idx === r.idx).map((a) => `<span title="${a.name}">${a.icon}</span>`).join('');
    const score = [r.time, r.pts].filter((x) => x !== undefined && x !== '').join(' · ');
    return `<div class="rpc p${i + 1} ${r.me ? 'me' : ''} ${r.team >= 0 ? 'team' : ''}"${team}>
      <span class="rmed">${['🥇', '🥈', '🥉'][i]}</span>${r.me ? '<em class="rme">你</em>' : ''}
      <canvas class="rav3d" data-i="${i}"></canvas>
      <b>${esc(r.name)}</b><small>${score}</small>${mine ? `<div class="rpaw">${mine}</div>` : ''}
      <div class="rbase">${i + 1}</div></div>`;
  },

  // 卡片里的画布接上 3D 角色；开不了 3D 画布的机器换回按造型配色的小人
  bindPodium(rows) {
    const cvs = [...$('resList').querySelectorAll('canvas.rav3d')];
    if (!this.podium3d) this.podium3d = new PodiumView();
    const list = cvs.map((cv) => {
      const i = Number(cv.dataset.i);
      return { canvas: cv, look: rows[i].look, place: i, team: rows[i].team };
    });
    if (this.podium3d.bind(list)) return;
    for (const cv of cvs) cv.outerHTML = this.flatAvatar(rows[Number(cv.dataset.i)].look);
  },

  flatAvatar(L) {
    const av = `--c1:${hex(L.jacket ?? 0xff8a1f)};--c2:${hex(L.stripe ?? 0xffd21f)};--hc:${hex(L.hatColor ?? 0x2f3fd0)};--sk:${hex(SKINS[L.skin | 0] ?? SKINS[0])}`;
    return `<div class="rav" style="${av}"><i class="hat"></i><i class="head"></i><i class="body"></i></div>`;
  },
};
