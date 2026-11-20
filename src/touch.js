// 手机触屏：比赛中屏幕上的虚拟按键。最近一次操作是触屏时才显示（按了键盘就收起来）。
// 触屏时自动俯冲，不用一直按着；倒计时最后点一下任意键就算起步
import { EMOTES } from './emotes.js';

const BTNS = [
  ['left', '◀', 'tl'],
  ['right', '▶', 'tr'],
  ['jump', '跳', 'b1'],
  ['drift', '漂移', 'b2'],
  ['brake', '刹车', 'b3'],
  ['fire', '道具', 'b4'],
  ['nitro', '氮气', 'b5'],
  ['reset', '↺', 's1'],
  ['pause', 'Ⅱ', 's2'],
  ['emo', '😀', 's3'],
  ...EMOTES.map((e, i) => [`e${i}`, e, `em em${i}`]),
];

export class Touch {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.held = new Map(); // pointerId → { a: 动作, b: 按钮 }
    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.innerHTML = BTNS.map(([id, text, cls]) => `<button class="tb ${cls}" data-t="${id}">${text}</button>`).join('');
    document.getElementById('hud').after(el);
    el.addEventListener('pointerdown', (e) => this.down(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', (e) => this.setMode(e.pointerType === 'touch'), true);
    window.addEventListener('keydown', () => this.setMode(false), true);
  }

  setMode(on) {
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    this.game.autoTuck = on;
    if (!on) this.release();
    else this.landscape();
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
    const g = this.game;
    const k = g.keys;
    const racing = g.state === 'race' && !g.paused;
    if (down && !/^(pause|emo|e\d)$/.test(a)) g.noteUp(true);
    if (/^e\d$/.test(a)) {
      if (down) {
        g.emotes.send(+a.slice(1));
        this.el.classList.remove('emoOpen');
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
        if (down) this.el.classList.toggle('emoOpen');
        break;
    }
  }
}
