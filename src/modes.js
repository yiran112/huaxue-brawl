// 玩法模式：道具赛 / 竞速赛 / 淘汰赛 / 团队赛 / 大乱斗 / 特技赛 / 计时赛。
// 每个模式通过一组钩子接进比赛流程：分队、每帧更新、击飞 / 空翻 / 漂移等事件、HUD 信息、结算名次
import { MODES, POINTS } from './config.js';
import { fmtTime } from './util.js';
import { medalTimes } from './tracks.js';

export const TEAM_NAMES = ['红队', '蓝队'];
export const TEAM_COLORS = ['#ff4a50', '#4a8dff'];

class BaseMode {
  constructor(game, key) {
    this.game = game;
    this.key = key;
    this.def = MODES[key];
    this.score = [];
    this.itemRespawn = 6;
    this.scored = false; // 结算按得分排名
  }

  teamOf() {
    return -1;
  }

  setup() {
    this.score = this.game.racers.map(() => 0);
    this.finishN = 0;
  }

  update() {}
  onKnock() {}
  onTrick() {}
  onDrift() {}
  onShortcut() {}
  onPad() {}
  onChainBank() {}
  onChainBreak() {}
  onFinish() {
    this.finishN++;
  }

  // HUD 名次表右侧的标记；返回 null 用默认的（道具图标 / 冲线旗）
  rankTag() {
    return null;
  }

  // HUD 右侧的模式信息（HTML）
  hud() {
    return '';
  }

  // 结算名次（order 是按冲线 / 进度排好的选手）
  standings(order) {
    if (!this.scored) return order;
    return order.slice().sort((a, b) => this.score[b.idx] - this.score[a.idx] || order.indexOf(a) - order.indexOf(b));
  }

  // 结算表格里每人的附加一栏
  resultCol(r) {
    return this.scored ? `${this.score[r.idx]} 分` : undefined;
  }
}

class RaceMode extends BaseMode {}

// 淘汰赛：领先者每过一个淘汰点，最后一名出局；最后剩两个人冲线
class ElimMode extends BaseMode {
  setup() {
    super.setup();
    const g = this.game;
    const n = g.racers.length;
    const L = g.course.L;
    const k = Math.max(0, n - 2);
    this.cps = [];
    for (let i = 0; i < k; i++) this.cps.push(L * (k === 1 ? 0.5 : 0.15 + (0.7 * i) / (k - 1)));
    this.next = 0;
  }

  lead() {
    let m = 0;
    for (const r of this.game.racers) if (!r.out) m = Math.max(m, r.d);
    return m;
  }

  update() {
    const g = this.game;
    if (this.next >= this.cps.length || g.state === 'countdown') return;
    if (this.lead() < this.cps[this.next]) return;
    this.next++;
    let last = null;
    for (const r of g.racers) if (!r.out && !r.finished && (!last || r.d < last.d)) last = r;
    if (last) g.eliminate(last);
  }

  rankTag(r) {
    return r.out ? '💀' : null;
  }

  hud() {
    const alive = this.game.racers.filter((r) => !r.out).length;
    if (this.next >= this.cps.length) return `<b>决赛圈</b><br>剩下 ${alive} 人，先冲线者获胜`;
    const gap = Math.max(0, Math.round(this.cps[this.next] - this.lead()));
    return `下一个淘汰点 <b>${gap} m</b><br>还剩 ${alive} 人 · 最后一名出局`;
  }
}

// 团队赛：偶数号红队（含玩家），奇数号蓝队；按名次给全队加分
class TeamMode extends BaseMode {
  teamOf(i) {
    return i % 2;
  }

  points(order) {
    const p = [0, 0];
    order.forEach((r, i) => {
      if (r.team >= 0) p[r.team] += POINTS[i] || 0;
    });
    return p;
  }

  winner(order) {
    if (this.game.rules.teamFirst) {
      const fin = order.find((r) => r.finished);
      if (fin && fin.team >= 0) return fin.team;
      return order[0] && order[0].team >= 0 ? order[0].team : 0;
    }
    const p = this.points(order);
    if (p[0] !== p[1]) return p[0] > p[1] ? 0 : 1;
    return order[0] ? order[0].team : 0;
  }

  resultCol(r) {
    return TEAM_NAMES[r.team];
  }

  hud() {
    if (this.game.rules.teamFirst) {
      return `<span style="color:${TEAM_COLORS[0]}">红队</span> 对 <span style="color:${TEAM_COLORS[1]}">蓝队</span><br><small>先冲过终点的人所在队伍获胜</small>`;
    }
    const p = this.points(this.game.order);
    return `<span style="color:${TEAM_COLORS[0]}">红队 <b>${p[0]}</b></span> : <span style="color:${TEAM_COLORS[1]}"><b>${p[1]}</b> 蓝队</span><br><small>按名次 ${POINTS.join('/')} 给全队计分</small>`;
  }
}

// 大乱斗：击飞得分，冲线另加分
const BRAWL_FINISH = [8, 6, 5, 4, 3, 2, 1, 0];
class BrawlMode extends BaseMode {
  constructor(game, key) {
    super(game, key);
    this.itemRespawn = 3.5;
    this.scored = true;
  }

  onKnock(victim, source, frozen) {
    if (!source || source === victim) return;
    this.score[source.idx] += frozen ? 2 : 3;
    if (!frozen) this.score[victim.idx] = Math.max(0, this.score[victim.idx] - 1);
  }

  onFinish(r) {
    this.score[r.idx] += BRAWL_FINISH[this.finishN] ?? 0;
    super.onFinish(r);
  }

  rankTag(r) {
    return `${this.score[r.idx]}`;
  }

  hud() {
    const p = this.game.player;
    const me = p ? this.score[p.idx] : 0;
    const best = Math.max(...this.score);
    return `你的得分 <b>${me}</b>${best > me ? ` · 最高 ${best}` : ''}<br><small>击飞 +3 · 冻住 +2 · 被击飞 −1 · 冲线 +8~1</small>`;
  }
}

// 特技赛：只算结算成功的技巧链（总分 × 倍率），冲线按名次另加分
const TRICK_FINISH = [3000, 2400, 1900, 1500, 1200, 900, 600, 300];
class TrickMode extends BaseMode {
  constructor(game, key) {
    super(game, key);
    this.scored = true;
  }

  onChainBank(r, total) {
    this.score[r.idx] += total;
  }

  onFinish(r) {
    this.score[r.idx] += TRICK_FINISH[this.finishN] ?? 0;
    super.onFinish(r);
  }

  rankTag(r) {
    return fmtPts(this.score[r.idx]);
  }

  resultCol(r) {
    return `${this.score[r.idx].toLocaleString()} 分`;
  }

  hud() {
    const p = this.game.player;
    if (!p) return '';
    const me = this.score[p.idx];
    const best = Math.max(...this.score);
    return `特技分 <b>${me.toLocaleString()}</b>${best > me ? ` · 最高 ${best.toLocaleString()}` : ''}<br><small>技巧链结算才进账，摔了整条作废</small>`;
  }
}

function fmtPts(v) {
  return v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : `${v}`;
}

// 计时赛：一个人滑，和幽灵（自己的最好成绩）比
class TTMode extends BaseMode {
  setup() {
    super.setup();
    this.medals = medalTimes(this.game.course.L);
  }

  medalOf(t) {
    const [g, s, b] = this.medals;
    return t <= g ? 3 : t <= s ? 2 : t <= b ? 1 : 0;
  }

  hud() {
    const g = this.game;
    const p = g.player;
    const [au, ag, cu] = this.medals;
    let html = `🥇 ${fmtTime(au)}　🥈 ${fmtTime(ag)}　🥉 ${fmtTime(cu)}`;
    if (g.ghost && p) {
      const gt = g.ghost.timeAtD(p.d);
      if (gt !== null && p.d > 20) {
        const dt = (p.finished ? p.finishTime : g.raceTime) - gt;
        html += `<br>对比幽灵 <b style="color:${dt <= 0 ? '#8dff6a' : '#ff6a7a'}">${dt <= 0 ? '−' : '+'}${Math.abs(dt).toFixed(2)}</b>`;
      }
    } else {
      html += '<br><small>跑完一趟就会留下你的幽灵</small>';
    }
    return html;
  }
}

const CLASSES = { race: RaceMode, speed: RaceMode, elim: ElimMode, team: TeamMode, brawl: BrawlMode, trick: TrickMode, tt: TTMode };

export function makeMode(key, game) {
  const C = CLASSES[key] || RaceMode;
  return new C(game, CLASSES[key] ? key : 'race');
}
