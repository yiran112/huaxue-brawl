// 技巧链：空翻、转体、抓板、漂移、滞空、加速带、近道……一招接一招，每多一招倍率 +1（最高 ×10）
// 一段时间不接新招就结算（总分 × 倍率）；在空中、漂移中计时暂停。还没结算时摔了 / 被打中，整条作废
export const CHAIN_T = 3.2;
export const MULT_MAX = 10;
const LIST_MAX = 4;

export class Chain {
  constructor(racer) {
    this.r = racer;
    this.list = [];
    this.reset();
  }

  reset() {
    this.pts = 0; // 还没乘倍率的总分
    this.n = 0; // 招数
    this.t = 0;
    this.list.length = 0;
    this.live = 0; // 正在进行的漂移已经攒的分（还没算一招）
    this.seq = 0; // 每变一次 +1，界面据此决定要不要重画
  }

  get active() {
    return this.n > 0 || this.live > 0;
  }

  get mult() {
    return Math.min(MULT_MAX, Math.max(1, this.n));
  }

  // 一招完成
  add(label, pts) {
    pts = Math.round(pts);
    if (pts <= 0) return;
    this.pts += pts;
    this.n++;
    this.t = CHAIN_T;
    this.list.push({ label, pts });
    if (this.list.length > LIST_MAX) this.list.shift();
    this.seq++;
    this.r.game.onChainAdd?.(this.r, label, pts, this.mult);
  }

  setLive(pts) {
    const v = Math.round(pts);
    if (v !== this.live) {
      this.live = v;
      this.seq++;
    }
  }

  // 在空中 / 漂移中不掉时间
  update(dt) {
    if (!this.n) return;
    const r = this.r;
    if ((!r.grounded && r.state === 'ski') || r.drifting) return;
    this.t -= dt;
    if (this.t <= 0) this.bank();
  }

  // 结算。返回结算的分数
  bank() {
    if (!this.n) {
      this.reset();
      return 0;
    }
    const mult = this.mult;
    const total = Math.round(this.pts * mult);
    const n = this.n;
    this.reset();
    const r = this.r;
    // 连到 ×3 以上：结算时给一小口加速
    if (mult >= 3 && r.state === 'ski' && !r.finished) r.turboT = Math.max(r.turboT, 0.2 + 0.08 * mult);
    r.game.onChainBank?.(r, total, mult, n);
    return total;
  }

  // 中断：没结算的分全丢
  break(why) {
    if (!this.active) return;
    const lost = Math.round((this.pts + this.live) * this.mult);
    const mult = this.mult;
    this.reset();
    if (lost > 0) this.r.game.onChainBreak?.(this.r, lost, mult, why);
  }
}
