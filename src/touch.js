// 手机触屏：比赛中屏幕上的虚拟按键。最近一次操作是触屏时才显示（按了键盘就收起来）。
// 触屏时自动俯冲，不用一直按着；倒计时最后点一下任意键就算起步。
// 按键的图标和位置见 ui/touchKit.js（微信小游戏也用同一套）；道具键上直接显示手里的道具，氮气键上带充能圈。
// 右上角的小地图（ui/minimap.js）也画在这一层上，代替电脑上左边那根进度条
import { EMOTES } from './emotes.js';
import { WEAPONS } from './config.js';
import { iconSvg, LABELS, touchLayout } from './ui/touchKit.js';
import { buildMinimap, drawMinimap } from './ui/minimap.js';

const KEYS = ['left', 'right', 'jump', 'drift', 'brake', 'fire', 'nitro', 'reset', 'pause', 'emo', ...EMOTES.map((_, i) => `e${i}`)];
const NAMES = { left: '左转', right: '右转', reset: '复位', pause: '暂停', emo: '表情' };

function markup(id) {
  if (/^e\d$/.test(id)) return `<button class="tb em" data-t="${id}">${EMOTES[+id.slice(1)]}</button>`;
  const sys = /^(reset|pause|emo)$/.test(id);
  let extra = '';
  if (id === 'fire') extra = '<span class="wp"></span><b class="badge hidden"></b>';
  if (id === 'nitro') {
    extra = '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/>' +
      '<circle class="rf" cx="50" cy="50" r="46" pathLength="100"/></svg><b class="badge hidden"></b>';
  }
  const label = LABELS[id] ? `<span class="lb">${LABELS[id]}</span>` : '';
  const name = LABELS[id] || NAMES[id] || id;
  return `<button class="tb k-${id}${sys ? ' sys' : ''}" data-t="${id}" aria-label="${name}">${extra}${iconSvg(id)}${label}</button>`;
}

export class Touch {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.held = new Map(); // pointerId → { a: 动作, b: 按钮 }
    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.innerHTML = KEYS.map(markup).join('');
    this.btn = {};
    for (const b of el.querySelectorAll('[data-t]')) this.btn[b.dataset.t] = b;
    const fire = this.btn.fire;
    this.fireEl = { wp: fire.querySelector('.wp'), lb: fire.querySelector('.lb'), badge: fire.querySelector('.badge') };
    const nitro = this.btn.nitro;
    this.nitroEl = { rf: nitro.querySelector('.rf'), badge: nitro.querySelector('.badge') };
    this.shown = {};
    this.mapEl = document.createElement('canvas');
    this.mapEl.className = 'mm';
    el.appendChild(this.mapEl);
    this.mapCtx = this.mapEl.getContext('2d');
    this.mm = null;
    document.getElementById('hud').after(el);
    el.addEventListener('pointerdown', (e) => this.down(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', (e) => this.setMode(e.pointerType === 'touch'), true);
    window.addEventListener('keydown', () => this.setMode(false), true);
    // 转屏、改窗口大小时重新量一次刘海边距再摆按键
    const resize = () => {
      this.insets = null;
      this.layout();
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  }

  setMode(on) {
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    this.game.autoTuck = on;
    if (!on) this.release();
    else {
      this.layout();
      this.landscape();
    }
  }

  // 刘海、圆角让出来的边距（量一次记下来，屏幕尺寸变了再量）
  safe() {
    if (this.insets) return this.insets;
    if (!this.probe) {
      const p = (this.probe = document.createElement('div'));
      p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(p);
    }
    const s = getComputedStyle(this.probe);
    const px = (v) => parseFloat(v) || 0;
    return (this.insets = { l: px(s.paddingLeft), r: px(s.paddingRight), t: px(s.paddingTop), b: px(s.paddingBottom) });
  }

  // 按屏幕大小和这一局有没有道具、氮气摆按键；没变就不动
  layout() {
    if (!this.on) return;
    const g = this.game;
    const practice = !!g.session && g.session.kind === 'practice';
    const items = !!g.rules && !!g.rules.items;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const safe = this.safe();
    const key = [W, H, items, practice, safe.l, safe.r, safe.t, safe.b].join();
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const L = touchLayout(W, H, { safe, items, nitro: !practice });
    for (const [id, b] of Object.entries(this.btn)) {
      const p = L[id];
      const off = !p || (practice && /^(emo|e\d)$/.test(id));
      b.classList.toggle('off', off);
      if (off) continue;
      b.style.left = p.x + 'px';
      b.style.top = p.y + 'px';
      b.style.width = p.w + 'px';
      b.style.height = p.h + 'px';
      b.style.setProperty('--d', Math.min(p.w, p.h) + 'px');
    }
    // 速度表挪到转向键右边
    const hud = document.getElementById('hud').style;
    hud.setProperty('--spdL', L.speed.x + 'px');
    hud.setProperty('--spdB', H - L.speed.y + 'px');
    const m = (this.mapBox = L.map);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    Object.assign(this.mapEl.style, { left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px' });
    this.mapEl.width = Math.round(m.w * dpr);
    this.mapEl.height = Math.round(m.h * dpr);
    this.mapCtx.setTransform(this.mapEl.width / m.w, 0, 0, this.mapEl.height / m.h, 0, 0);
    this.mm = null;
  }

  // 小地图：换了赛道或者地图框大小变了才重算走线，人的位置每帧画
  drawMap() {
    const g = this.game;
    const m = this.mapBox;
    if (!g.course || !m) return;
    if (!this.mm || this.mm.course !== g.course) this.mm = buildMinimap(g.course, m.w, m.h);
    this.mapCtx.clearRect(0, 0, m.w, m.h);
    drawMinimap(this.mapCtx, this.mm, g);
  }

  // 每帧：道具键显示手里的道具，氮气键显示存了几瓶、下一瓶攒到多少
  update() {
    if (!this.on) return;
    this.layout();
    this.drawMap();
    const p = this.game.player;
    const s = this.shown;
    const live = !!p && !p.out && !p.finished;
    const w = live && p.weapon ? WEAPONS[p.weapon] : null;
    const item = w ? p.weapon + p.ammo : '';
    if (item !== s.item) {
      const fresh = !!w && (!s.item || !s.item.startsWith(p.weapon));
      s.item = item;
      const f = this.fireEl;
      f.wp.textContent = w ? w.icon : '';
      f.lb.textContent = w ? w.name : LABELS.fire;
      f.badge.classList.toggle('hidden', !w || p.ammo <= 1);
      f.badge.textContent = '×' + (w ? p.ammo : 0);
      const b = this.btn.fire;
      b.classList.toggle('has', !!w);
      if (fresh) {
        b.classList.remove('pop');
        void b.offsetWidth;
        b.classList.add('pop');
      }
    }
    const n = live ? p.nitroN : 0;
    // 充能圈是下一瓶攒到多少；两瓶都满了就是一整圈
    const fill = !live ? 0 : n >= 2 ? 100 : Math.round(Math.min(1, p.nitro) * 100);
    const burn = live && p.nitroT > 0;
    if (n !== s.n) {
      s.n = n;
      this.btn.nitro.classList.toggle('ready', n > 0);
      this.nitroEl.badge.classList.toggle('hidden', n < 2);
      this.nitroEl.badge.textContent = '×' + n;
    }
    if (fill !== s.fill) {
      s.fill = fill;
      this.nitroEl.rf.style.strokeDasharray = `${fill} 100`;
    }
    if (burn !== s.burn) {
      s.burn = burn;
      this.btn.nitro.classList.toggle('burn', burn);
    }
  }

  // 手机上第一次触屏：进全屏并尽量锁成横屏（不支持的浏览器就算了）。在外层的横屏框里时交给外层去做（见 boot.js）
  landscape() {
    if (this.tried || !matchMedia('(pointer: coarse)').matches) return;
    this.tried = true;
    if (window.parent !== window) {
      window.parent.postMessage({ t: 'landscape' }, location.origin);
      return;
    }
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }

  down(e) {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    e.preventDefault();
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      /* 手指已经抬起来了 */
    }
    const a = b.dataset.t;
    if (/^(reset|pause|emo|e\d)$/.test(a)) {
      this.game.sfx.init();
      this.game.sfx.uiSound(a === 'reset' ? 'confirm' : 'click');
    }
    this.held.set(e.pointerId, { a, b });
    b.classList.add('on');
    this.press(a, true);
  }

  up(e) {
    const h = this.held.get(e.pointerId);
    if (!h) return;
    this.held.delete(e.pointerId);
    h.b.classList.remove('on');
    this.press(h.a, false);
  }

  release() {
    for (const h of this.held.values()) {
      h.b.classList.remove('on');
      this.press(h.a, false);
    }
    this.held.clear();
  }

  press(a, down) {
    pressTouch(this.game, a, down, (on) => {
      if (on === undefined) this.el.classList.toggle('emoOpen');
      else this.el.classList.toggle('emoOpen', on);
    });
  }
}

export function pressTouch(g, a, down, toggleEmotes) {
  const k = g.keys;
  const racing = g.state === 'race' && !g.paused;
  if (down && !/^(pause|emo|e\d)$/.test(a)) g.noteUp(true);
  if (/^e\d$/.test(a)) {
    if (down) {
      g.emotes.send(+a.slice(1));
      toggleEmotes(false);
    }
    return;
  }
  switch (a) {
    case 'left':
    case 'right':
      k[a] = down;
      break;
    case 'drift':
      k.drift = down;
      break;
    case 'brake':
      k.down = down;
      break;
    case 'jump':
      // 和空格一样：在地上是起跳，已经腾空时按住是后空翻
      if (!down) g.spaceFlip = false;
      else if (racing) {
        if (g.player && !g.player.grounded) g.spaceFlip = true;
        else g.jumpQ = true;
      }
      break;
    case 'fire':
      if (down && racing) g.fireQ = true;
      break;
    case 'nitro':
      if (down && racing) g.nitroQ = true;
      break;
    case 'reset':
      if (down && racing && g.player && !g.player.finished) g.player.respawn();
      break;
    case 'pause':
      if (down && g.state !== 'menu') g.setPaused(!g.paused);
      break;
    case 'emo':
      if (down) toggleEmotes();
      break;
  }
}
