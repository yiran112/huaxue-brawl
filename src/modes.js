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
    const p = this.points(order);
    if (p[0] !== p[1]) return p[0] > p[1] ? 0 : 1;
    return order[0] ? order[0].team : 0;
  }

  resultCol(r) {
    return TEAM_NAMES[r.team];
  }

  hud() {
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

// 特技赛：空翻、漂移喷射、滞空、近道、加速带都能得分，连着做有连击加成
const COMBO_T = 3.5;
const TRICK_FINISH = [1000, 800, 600, 500, 400, 300, 200, 100];
class TrickMode extends BaseMode {
  constructor(game, key) {
    super(game, key);
    this.scored = true;
  }

  setup() {
    super.setup();
    const n = this.game.racers.length;
    this.combo = new Array(n).fill(0);
    this.comboT = new Array(n).fill(-99);
    this.air = new Array(n).fill(0);
  }

  mult(i) {
    return 1 + 0.25 * (Math.min(this.combo[i], 9) - 1);
  }

  add(r, pts, label) {
    const i = r.idx;
    const now = this.game.raceTime;
    this.combo[i] = now - this.comboT[i] < COMBO_T ? this.combo[i] + 1 : 1;
    this.comboT[i] = now;
    const v = Math.round(pts * this.mult(i));
    this.score[i] += v;
    if (r.isPlayer) this.game.ui.trickPop(`${label} +${v}`, this.combo[i]);
  }

  onTrick(r, name, n) {
    this.add(r, (250 * n * (n + 1)) / 2, `${name}${n > 1 ? ' ×' + n : ''}`);
  }

  onDrift(r, big) {
    this.add(r, big ? 250 : 100, big ? '漂移大喷射' : '漂移喷射');
  }

  onShortcut(r) {
    this.add(r, 400, '抄近道');
  }

  onPad(r) {
    this.add(r, 50, '加速带');
  }

  onKnock(victim) {
    this.combo[victim.idx] = 0;
    this.comboT[victim.idx] = -99;
    this.air[victim.idx] = 0;
  }

  update(dt) {
    for (const r of this.game.racers) {
      if (r.out || r.finished) continue;
      const i = r.idx;
      if (!r.grounded && r.state === 'ski' && r.airT > 0.7) this.air[i] += dt * 120;
      else if (r.grounded && this.air[i] > 0) {
        if (r.state === 'ski' && this.air[i] >= 20) this.add(r, this.air[i], '滞空');
        this.air[i] = 0;
      }
    }
  }

  onFinish(r) {
    this.score[r.idx] += TRICK_FINISH[this.finishN] ?? 0;
    super.onFinish(r);
  }

  rankTag(r) {
    return `${this.score[r.idx]}`;
  }

  hud() {
    const p = this.game.player;
    if (!p) return '';
    const i = p.idx;
    const live = this.game.raceTime - this.comboT[i] < COMBO_T && this.combo[i] > 1;
    return `特技分 <b>${this.score[i]}</b>${live ? `<br><span style="color:#ffd23c">连击 ×${this.mult(i).toFixed(2)}</span>` : '<br><small>空翻 / 漂移 / 滞空 / 近道 / 加速带连着做有加成</small>'}`;
  }
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
