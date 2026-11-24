// 画质档位：高 / 中 / 低。选“自动”时从高档开始，比赛里持续掉帧就往下降一档（这一次打开网页内不再升回去）
// ratio：3D 画面每个 CSS 像素至少画几个真实像素；px：画面总像素的预算。
// 手机屏幕的 CSS 尺寸小、像素比却有 2～3，只按 ratio 画会被拉大 2～3 倍，画面发糊，
// 所以屏幕小的时候在 px 预算内往设备像素比靠（电脑大窗口算出来还是 ratio，和以前一样）
export const QUALITY = {
  high: { ratio: 1.5, px: 2_000_000, shadow: 2048, fx: 1 },
  mid: { ratio: 1, px: 1_200_000, shadow: 1024, fx: 0.6 },
  low: { ratio: 0.75, px: 600_000, shadow: 0, fx: 0.35 },
};
const ORDER = ['high', 'mid', 'low'];
const WINDOW = 2; // 每多少秒算一次平均帧率
const SLOW_FPS = 45; // 低于这个算掉帧
const SLOW_N = 2; // 连续几个窗口掉帧才降档
const COOL = 6; // 降档后先等这么多秒再看

export class Quality {
  constructor(game) {
    this.game = game;
    // 触屏设备默认从中档开始
    this.autoLevel = matchMedia('(pointer: coarse)').matches ? 'mid' : 'high';
    this.level = null;
    this.last = 0;
    this.t = 0;
    this.n = 0;
    this.slow = 0;
    this.cool = 0;
  }

  get setting() {
    const q = this.game.soloRules.quality;
    return QUALITY[q] ? q : 'auto';
  }

  get spec() {
    return QUALITY[this.level] || QUALITY.high;
  }

  // 阴影开不开：设置里的“实时阴影”和画质档位都同意才开
  get shadows() {
    return this.spec.shadow > 0;
  }

  // 3D 画面的像素比：不超过设备像素比，不低于档位的 ratio，中间按像素预算定
  pixelRatio() {
    const q = this.spec;
    const area = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.min(window.devicePixelRatio || 1, Math.max(q.ratio, Math.sqrt(q.px / area)));
  }

  // 换档或窗口大小变了（手机横竖屏、大厅和比赛切换时框的大小会变）都要重算一次
  fit() {
    const g = this.game;
    const ratio = this.pixelRatio();
    if (g.mini) g.mini.display.sceneRatio = ratio;
    else if (g.renderer.getPixelRatio() !== ratio) g.renderer.setPixelRatio(ratio);
  }

  apply() {
    const lv = this.setting === 'auto' ? this.autoLevel : this.setting;
    if (lv === this.level) return;
    this.level = lv;
    const q = this.spec;
    const g = this.game;
    this.fit();
    const sh = g.sun.shadow;
    if (q.shadow && sh.mapSize.x !== q.shadow) {
      sh.mapSize.set(q.shadow, q.shadow);
      if (sh.map) {
        sh.map.dispose();
        sh.map = null;
      }
    }
    g.fx.lit.cap = Math.round(700 * q.fx);
    g.fx.glow.cap = Math.round(500 * q.fx);
  }

  // 每出一帧画面调用一次
  sample() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    const g = this.game;
    const racing = (g.state === 'race' || g.state === 'countdown') && !g.paused;
    if (this.setting !== 'auto' || !racing || dt > 0.25 || dt <= 0) {
      this.t = 0;
      this.n = 0;
      return;
    }
    if (this.cool > 0) {
      this.cool -= dt;
      return;
    }
    this.t += dt;
    this.n++;
    if (this.t < WINDOW) return;
    const fps = this.n / this.t;
    this.t = 0;
    this.n = 0;
    this.slow = fps < SLOW_FPS ? this.slow + 1 : 0;
    if (this.slow < SLOW_N) return;
    this.slow = 0;
    const i = ORDER.indexOf(this.autoLevel);
    if (i >= ORDER.length - 1) return;
    this.autoLevel = ORDER[i + 1];
    this.cool = COOL;
    this.apply();
  }
}
