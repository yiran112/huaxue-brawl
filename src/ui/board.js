// 首页左侧的赛季榜
import { POINTS } from '../config.js';
import { TRACK_MAP } from '../tracks.js';
import { seasonNow, rankSeasonNow, seasonLeftText, seasonReward, blankSeason } from '../profile.js';
import { tierAt } from '../rank.js';
import { fetchLeaderboard } from '../account.js';
import { fmtTime } from '../util.js';
import { hex, esc, TIER_ICONS } from './common.js';
import { setGameHtml } from './web-icons.js';

const BOARD_COLORS = ['#ff5a7a', '#4f7bff', '#3ddc97', '#ffb21f', '#c084fc', '#ff8a4a', '#49d6e8'];
const boardColor = (name) => {
  let h = 0;
  for (const c of String(name)) h = (Math.imul(h, 33) + c.charCodeAt(0)) >>> 0;
  return BOARD_COLORS[h % BOARD_COLORS.length];
};
const boardTier = (pts) => {
  const t = tierAt(pts);
  return `${TIER_ICONS[t.index]} ${t.name}${t.star ? ` ${'★'.repeat(t.star)}` : ''}`;
};

export const boardMethods = {
  // 首页左侧赛季榜。服务器上的选手，和本机刚打完还没上传的成绩，合成一份。
  boardEntries() {
    const g = this.game;
    const P = g.profile;
    const now = seasonNow();
    const mine = P.data.season && P.data.season.id === now.id ? P.data.season : blankSeason(now.id);
    const rs = P.rankState();
    const me = {
      name: g.playerName || (g.account && g.account.username) || '游客',
      title: P.data.title || '',
      points: mine.points | 0,
      hits: mine.hits | 0,
      tt: mine.tt || 0,
      ttTime: mine.ttTime || 0,
      ttTrack: mine.ttTrack || '',
      rankPts: rs.sg ? rs.pts : 0,
      rankGames: rs.sg,
      me: true,
      jacket: g.look && g.look.jacket,
    };
    const rows = (this.boardRows || []).map((r) => (r.me ? { ...r, ...me, me: true } : r));
    if (!rows.some((r) => r.me)) rows.push(me);
    return rows;
  },

  boardRanked() {
    const key = this.board;
    let rows = this.boardEntries();
    if (key === 'tt') rows = rows.filter((r) => r.tt > 0);
    else if (key === 'rank') rows = rows.filter((r) => r.rankGames > 0);
    else rows = rows.filter((r) => (key === 'hits' ? r.hits : r.points) > 0 || r.me);
    rows.sort((a, b) => {
      if (key === 'tt') return a.tt - b.tt || a.ttTime - b.ttTime;
      if (key === 'rank') return b.rankPts - a.rankPts || a.name.localeCompare(b.name, 'zh');
      const d = key === 'hits' ? b.hits - a.hits : b.points - a.points;
      return d || a.name.localeCompare(b.name, 'zh');
    });
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  },

  boardScore(r) {
    if (this.board === 'hits') return `${r.hits}`;
    if (this.board === 'rank') return `${r.rankPts}`;
    if (this.board === 'tt') {
      const track = TRACK_MAP[r.ttTrack];
      return `${fmtTime(r.ttTime)}<small>${track ? esc(track.name) : '固定赛道'}</small>`;
    }
    return `${r.points}`;
  },

  boardInner() {
    const now = seasonNow();
    if (this.boardRules) {
      return `<header class="boardHead"><b>第 ${now.id} 赛季</b><small class="scd">${seasonLeftText(now.left)}</small></header>
        <div class="boardRules">
          <p><b>积分榜</b>每周一 0 点（北京时间）结算。只计「比赛」页的快速赛和联机赛：至少 4 人，难度为普通或困难，完赛才计分（淘汰赛出局也算）。名次分 ${POINTS.join(' / ')}，困难再 ×1.5 向下取整。简单、独自练习、排位赛、计时赛不计。</p>
          <p><b>击飞榜</b>记的是上面这些比赛里，你击飞对手的次数。</p>
          <p><b>计时榜</b>只计固定赛道的计时赛，比的是用时 ÷ 金牌时间，越小越靠前。随机赛道每局长度不一样，不进榜。</p>
          <p><b>段位榜</b>按排位分排，只列本段位赛季打过排位的人。段位赛季 4 周一换（第 ${rankSeasonNow().id} 季，${seasonLeftText(rankSeasonNow().left)}），换季时排位分保留七成。</p>
          <p><b>奖励</b>按积分榜名次，换季并连上服务器时发放：第 1 名 ❄${seasonReward(1)}，第 2–3 名 ❄${seasonReward(2)}，第 4–10 名 ❄${seasonReward(4)}，第 11–50 名 ❄${seasonReward(11)}。击飞榜和计时榜只排名。</p>
        </div>
        <div class="boardFoot"><button type="button" class="boardMore" data-act="boardRules">返回榜单</button></div>`;
    }
    const tabs = [['points', '积分'], ['hits', '击飞'], ['tt', '计时'], ['rank', '段位']]
      .map(([id, name]) => `<button type="button" class="${id === this.board ? 'on' : ''}" data-act="board" data-id="${id}">${name}</button>`)
      .join('');
    const ranked = this.boardRanked();
    const shown = this.boardFull ? ranked.slice(0, 30) : ranked.slice(0, 7);
    const unit = this.board === 'hits' ? '次' : this.board === 'tt' ? '' : '分';
    let list;
    if (!shown.length) {
      list = `<p class="boardEmpty">${this.board === 'tt' ? '本赛季还没有人在固定赛道上跑过计时赛。' : this.board === 'rank' ? '本段位赛季还没有人打过排位。打一场排位赛，就会出现在这里。' : '打完一场计入规则的比赛，就会出现在这里。'}</p>`;
    } else {
      list = shown
        .map((r) => {
          const color = r.me && r.jacket != null ? hex(r.jacket) : boardColor(r.name);
          const sub = this.board === 'rank' ? boardTier(r.rankPts) : esc(r.title || '');
          const title = sub ? `<small>${sub}</small>` : '<small> </small>';
          return `<div class="brow ${r.me ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}"><span class="brank">${r.rank}</span><span class="bav" style="background:${color}">${esc(r.name.slice(0, 1))}</span><span class="bmeta"><b>${esc(r.name)}</b>${title}</span><span class="bscore">${this.boardScore(r)}${unit ? `<i>${unit}</i>` : ''}</span></div>`;
        })
        .join('');
    }
    const more = ranked.length > 7 ? `<button type="button" class="boardMore" data-act="boardMore">${this.boardFull ? '收起榜单' : '查看完整排行榜'}</button>` : '';
    // 段位榜跟的是 4 周的段位赛季，表头和底栏换成段位赛季的
    const rs = rankSeasonNow();
    const head = this.board === 'rank' ? `<b>段位第 ${rs.id} 赛季</b><small class="scd">${seasonLeftText(rs.left)}</small>` : `<b>第 ${now.id} 赛季</b><small class="scd">${seasonLeftText(now.left)}</small>`;
    const foot =
      this.board === 'rank'
        ? '<span>4 周一换季</span><span>换季保留七成分</span><span>青铜失败不扣分</span>'
        : `<span>第1名 ❄${seasonReward(1)}</span><span>2–3 ❄${seasonReward(2)}</span><span>4–10 ❄${seasonReward(4)}</span><span>11–50 ❄${seasonReward(11)}</span>`;
    return `<header class="boardHead">${head}</header>
      <div class="boardTabs">${tabs}</div>
      <div class="boardList">${list}</div>
      <div class="breward">${foot}</div>
      <div class="boardFoot">${more}<button type="button" class="boardMore ghost" data-act="boardRules">上榜规则</button></div>`;
  },

  boardHtml() {
    return `<section class="board panel">${this.boardInner()}</section>`;
  },

  patchBoard() {
    const el = document.querySelector('#tab-race .board');
    if (el) setGameHtml(el, this.boardInner());
  },

  refreshBoard() {
    if (this.boardJob) return this.boardJob;
    this.boardJob = this._refreshBoard().finally(() => {
      this.boardJob = null;
    });
    return this.boardJob;
  },

  async _refreshBoard() {
    await this.settleSeason();
    await this.loadBoard();
  },

  async settleSeason() {
    const P = this.game.profile;
    const now = seasonNow();
    const s = P.data.season;
    if (!s || (s.id && s.id >= now.id)) return;
    if (!s.id || !(s.points | 0)) {
      P.claimSeason(s.id, 0);
      return;
    }
    if (!this.game.account || !this.game.account.ready) return;
    let rank = 0;
    try {
      if (this.game.account.dirty) await this.game.account.flush();
      const data = await fetchLeaderboard(this.game.account.token, s.id);
      const rows = (data.rows || []).filter((r) => r.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh'));
      const i = rows.findIndex((r) => r.me);
      rank = i >= 0 ? i + 1 : 0;
    } catch {
      return;
    }
    const old = s.id;
    const coins = P.claimSeason(old, rank);
    this.toast(coins ? `第 ${old} 赛季积分榜第 ${rank} 名，奖励 ❄${coins}` : `第 ${now.id} 赛季开始了`);
  },

  async loadBoard() {
    const seq = (this.boardSeq = (this.boardSeq || 0) + 1);
    let rows = null;
    try {
      const token = this.game.account && this.game.account.token;
      const data = await fetchLeaderboard(token);
      rows = data.rows || [];
    } catch {
      rows = null;
    }
    if (seq !== this.boardSeq) return;
    this.boardRows = rows;
    if (this.tab === 'race' && !this.racePick) this.patchBoard();
  },
};
