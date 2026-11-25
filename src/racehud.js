// 比赛 HUD：氮气槽、来袭预警（被追踪导弹锁定、被雷击瞄准）、吸尾流时的风线
import * as THREE from 'three';
import { COL } from './fx.js';
import { clamp } from './util.js';
import { setGameText } from './ui/web-icons.js';

const $ = (id) => document.getElementById(id);
const _p = new THREE.Vector3();
const EDGE_X = 0.86; // 贴边标记离屏幕边缘多远（NDC）
const EDGE_Y = 0.8;
const NEAR_RED = 60; // 导弹进到这么近，屏幕四周开始泛红

export class RaceHud {
  constructor(game) {
    this.game = game;
    this.nitroEl = $('nitro');
    this.pips = [...this.nitroEl.querySelectorAll('.nn')];
    this.fill = this.nitroEl.querySelector('.nb i');
    this.root = $('alerts');
    this.marks = [];
    this.beepT = 0;
    this.red = -1;
    this.shown = { n: -1, w: -1, burn: null };
    this.warned = new WeakMap(); // 雷击 → 响过哪一声
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const live = !!p && !p.out && !p.finished && (g.state === 'race' || g.state === 'countdown');
    this.updateNitro(live ? p : null);
    this.updateAlerts(dt, live && g.state === 'race' ? p : null);
    if (live && p.draftOn && g.state === 'race') this.windLines(p);
  }

  updateNitro(p) {
    const s = this.shown;
    const n = p ? p.nitroN : 0;
    const w = p ? Math.round(p.nitro * 100) : 0;
    const burn = !!p && p.nitroT > 0;
    if (n !== s.n) {
      s.n = n;
      this.pips.forEach((e, i) => e.classList.toggle('on', i < n));
    }
    if (w !== s.w) {
      s.w = w;
      this.fill.style.width = w + '%';
    }
    if (burn !== s.burn) {
      s.burn = burn;
      this.nitroEl.classList.toggle('burn', burn);
    }
  }

  updateAlerts(dt, p) {
    const g = this.game;
    let used = 0;
    let near = Infinity;
    if (p) {
      for (const e of g.entities) {
        if (e.kind === 'homing' && e.target === p && e.life > 0) {
          const d = e.pos.distanceTo(p.pos);
          near = Math.min(near, d);
          this.place(used++, '🎯', e.pos, true, d < 30);
        } else if (e.isStrike && e.target === p) {
          const stage = e.spot ? 2 : 1;
          if ((this.warned.get(e) || 0) < stage) {
            this.warned.set(e, stage);
            g.sfx.strikeWarn(stage === 2);
          }
          _p.copy(e.spot || p.pos);
          _p.y += 2.4;
          this.place(used++, '⚡', _p, false, stage === 2);
        }
      }
    }
    for (let i = used; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (m.on) {
        m.on = false;
        m.el.style.display = 'none';
      }
    }
    const red = near < NEAR_RED ? Math.round((1 - near / NEAR_RED) * 10) / 10 : 0;
    if (red !== this.red) {
      this.red = red;
      this.root.style.boxShadow = red ? `inset 0 0 ${50 + 90 * red}px rgba(255, 40, 40, ${(0.2 + 0.45 * red).toFixed(2)})` : '';
    }
    if (near === Infinity) {
      this.beepT = 0;
      return;
    }
    this.beepT -= dt;
    if (this.beepT <= 0) {
      this.beepT = clamp(near / 140, 0.1, 0.55);
      g.sfx.lockBeep();
    }
  }

  // 第 i 个标记放到 pos 在屏幕上的位置；edge：在屏幕外（或身后）时贴边，带个箭头指过去
  place(i, icon, pos, edge, hot) {
    let m = this.marks[i];
    if (!m) {
      const el = document.createElement('div');
      el.className = 'al';
      el.innerHTML = '<i></i><span></span>';
      this.root.appendChild(el);
      m = this.marks[i] = { el, arrow: el.firstChild, icon: el.lastChild, on: false, ic: '', cls: '' };
    }
    if (!m.on) {
      m.on = true;
      m.el.style.display = '';
    }
    if (m.ic !== icon) {
      m.ic = icon;
      setGameText(m.icon, icon);
    }
    _p.copy(pos).project(this.game.camera);
    let x = _p.x;
    let y = _p.y;
    const behind = _p.z > 1;
    if (behind) {
      x = -x;
      y = -y;
      if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) y = -1;
    }
    const k = Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y);
    const out = behind || k > 1;
    if (out && k > 0) {
      x /= k;
      y /= k;
    }
    const onEdge = edge && out;
    const cls = 'al' + (hot ? ' hot' : '') + (onEdge ? ' edge' : '');
    if (cls !== m.cls) {
      m.cls = cls;
      m.el.className = cls;
    }
    if (onEdge) m.arrow.style.transform = `rotate(${Math.atan2(x, y).toFixed(3)}rad)`;
    m.el.style.left = ((x * 0.5 + 0.5) * 100).toFixed(2) + '%';
    m.el.style.top = ((0.5 - y * 0.5) * 100).toFixed(2) + '%';
  }

  // 吸尾流：身边一闪一闪往后掠的白色风线
  windLines(p) {
    const fx = this.game.fx;
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    for (let i = 0; i < 2; i++) {
      const f = 2 + Math.random() * 6;
      const l = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.6);
      fx.glow.spawn(p.pos.x - s * f + c * l, p.pos.y + 0.4 + Math.random() * 1.8, p.pos.z - c * f - s * l,
        p.vel.x * 0.25, p.vel.y * 0.25, p.vel.z * 0.25, 0.22, 0.09, 0.03, COL.frost, COL.ice0, 0, 0);
    }
  }
}
