// 比赛中的 HUD：名次、计时、道具、技巧链、播报、暂停菜单
import { THEMES, WEAPONS, MODES } from '../config.js';
import { RANK_MAP } from '../rank.js';
import { PRACTICE_SECONDS } from '../tracks.js';
import { TEAM_COLORS } from '../modes.js';
import { CHAIN_T, MULT_MAX } from '../chain.js';
import { fmtTime } from '../util.js';
import { $, hex, esc } from './common.js';

export const hudMethods = {
  showHud(b) {
    $('hud').classList.toggle('hidden', !b);
  },
  // online：联机比赛中，只是打开菜单，比赛不会停，也不能重开
  // note：联机比赛的说明（比赛不停、现在退出会怎样）
  showPause(b, online = false, note = '') {
    $('pause').classList.toggle('hidden', !b);
    if (!b) return;
    $('pauseTitle').textContent = online ? '菜单' : '暂停';
    $('pauseNote').classList.toggle('hidden', !online);
    $('pauseNote').textContent = note;
    $('btnRestart').classList.toggle('hidden', online);
    const q = $('btnQuit');
    q.textContent = online ? '退出比赛，返回大厅' : '返回大厅';
    q.classList.remove('armed');
  },
  armQuit() {
    const q = $('btnQuit');
    q.textContent = '再点一次，确认退出';
    q.classList.add('armed');
  },
  roundText() {
    const g = this.game;
    if (g.net.active) {
      const where = THEMES[g.themeKey].name;
      const spec = g.session.kind === 'rank' ? RANK_MAP[g.session.rank] : null;
      if (spec) return `${spec.icon} ${spec.name} · ${where}`;
      const m = MODES[g.mode.key];
      return `${m ? `${m.icon} ${m.name}` : '联机'} · ${where}`;
    }
    const s = g.session;
    if (s.kind === 'practice') return `雪松村 · ${s.gear === 'ski' ? '双板' : '单板'}`;
    const where = g.trackDef ? g.trackDef.name : THEMES[g.themeKey].name;
    const m = MODES[g.mode.key];
    return `${m.icon} ${m.name} · ${where}${g.rules.rounds > 1 ? ` · 第 ${g.round} / ${g.rules.rounds} 轮` : ''}`;
  },

  resetHud() {
    const g = this.game;
    $('hud').classList.toggle('practice', g.session.kind === 'practice');
    $('feed').innerHTML = '';
    this.feedItems = [];
    $('banner').className = 'stroke';
    $('tip').className = 'stroke';
    $('count').textContent = '';
    $('posTotal').textContent = '/' + g.racers.length;
    $('pos').classList.toggle('hidden', g.racers.length < 2);
    $('round').textContent = this.roundText();
    const p = $('progress');
    p.innerHTML = '';
    this.dots = g.racers.map((r) => {
      const d = document.createElement('div');
      d.className = 'dot' + (r.isPlayer ? ' me' : '');
      d.style.background = hex(r.look.jacket);
      if (r.team >= 0 && !r.isPlayer) d.style.borderColor = TEAM_COLORS[r.team];
      p.appendChild(d);
      return d;
    });
    this.lastItem = undefined;
    this.rankT = 0;
    this.popT = 0;
    $('trickPop').classList.remove('show');
    this.chainOn = false;
    $('chain').classList.add('hidden');
    this.lastModeHtml = null;
    $('modeBox').classList.add('hidden');
    this.hideImpact();
    $('item').classList.toggle('hidden', !g.rules.items);
  },

  showImpact(name, cause, frozen) {
    const el = $('impact');
    el.classList.remove('hidden');
    const verb = frozen ? '冻住' : '命中';
    $('impactWho').textContent = `${verb} ${name}`;
    $('impactCause').textContent = cause || '';
  },

  hideImpact() {
    $('impact').classList.add('hidden');
  },

  // 自己被冻住时，屏幕四周结一圈霜
  setFrost(on) {
    if (on === !!this.frostOn) return;
    this.frostOn = on;
    if (!this.frostEl) {
      const el = (this.frostEl = document.createElement('div'));
      el.style.cssText =
        'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .18s;' +
        'background:radial-gradient(ellipse at center,rgba(150,220,255,0) 42%,rgba(140,215,255,.5) 78%,rgba(225,247,255,.92) 100%);' +
        'box-shadow:inset 0 0 90px 30px rgba(215,244,255,.75);';
      $('hud').insertBefore(el, $('hud').firstChild);
    }
    this.frostEl.style.opacity = on ? '1' : '0';
  },

  setCount(text) {
    const c = $('count');
    if (c.textContent === text) return;
    c.textContent = text;
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
  },

  banner(text, kind = '', dur = 1.6) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'stroke ' + kind;
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerT = dur;
  },

  tip(text, dur = 1.8) {
    const t = $('tip');
    t.textContent = text;
    t.classList.add('show');
    this.tipT = dur;
  },

  // 技巧链结算 / 中断弹字。kind：good / gold / bad
  chainPop(title, value, kind = 'good') {
    const el = $('trickPop');
    el.innerHTML = `<div class="t">${esc(title)}</div><div class="v">${esc(value)}</div>`;
    el.className = 'stroke ' + kind;
    void el.offsetWidth;
    el.classList.add('show');
    this.popT = 1.5;
  },

  // 技巧链面板：内容变了才重画，倒计时条每帧走
  updateChain(p) {
    const ch = p.chain;
    // 空中正在做的动作（还没落地，不算分）
    let air = '';
    if (!p.grounded && p.state === 'ski') {
      const deg = (a) => Math.round(Math.abs(a) * 18 / Math.PI) * 10;
      const parts = [];
      if (Math.abs(p.flip) > 0.3) parts.push(`${p.flip > 0 ? '后空翻' : '前空翻'} ${deg(p.flip)}°`);
      if (Math.abs(p.spinA) > 0.3) parts.push(`转体 ${deg(p.spinA)}°`);
      if (p.grabT > 0.05) parts.push(`抓板 ${p.grabT.toFixed(1)}s`);
      air = parts.join(' · ');
    }
    const on = !!ch && (ch.active || !!air) && !p.out && !p.finished && this.game.state === 'race';
    if (on !== this.chainOn) {
      this.chainOn = on;
      $('chain').classList.toggle('hidden', !on);
      this.chainSeq = -1;
      this.chainMult = 0;
    }
    if (!on) return;
    const el = $('chain');
    if (ch.seq !== this.chainSeq || air !== this.chainAir) {
      this.chainSeq = ch.seq;
      this.chainAir = air;
      const m = ch.mult;
      const cm = el.querySelector('.cm');
      cm.textContent = `×${m}`;
      cm.className = 'cm' + (m >= MULT_MAX ? ' max' : m >= 5 ? ' hot' : '');
      if (m !== this.chainMult) {
        this.chainMult = m;
        void cm.offsetWidth;
        cm.classList.add('bump');
      }
      el.querySelector('.cp').textContent = ch.pts.toLocaleString();
      const items = ch.list.map((e) => `${esc(e.label)} <i>+${e.pts}</i>`);
      if (ch.live > 0) items.push(`<span class="lv">漂移中 +${ch.live}</span>`);
      const shown = items.slice(air ? -2 : -3);
      if (air) shown.push(`<span class="lv">${air}</span>`);
      el.querySelector('.cl').innerHTML = shown.join(' · ');
    }
    const hold = (!p.grounded && p.state === 'ski') || p.drifting;
    const k = !ch.n || hold ? 1 : Math.max(0, ch.t / CHAIN_T);
    const w = Math.round(k * 100);
    const cls = 'cb' + (hold || !ch.n ? ' hold' : ch.t < 1 ? ' low' : '');
    if (w !== this.chainW || cls !== this.chainCls) {
      this.chainW = w;
      this.chainCls = cls;
      const cb = el.querySelector('.cb');
      cb.className = cls;
      cb.firstChild.style.width = w + '%';
    }
  },

  feed(html) {
    const f = $('feed');
    const d = document.createElement('div');
    d.innerHTML = html;
    const wrap = document.createElement('p');
    wrap.style.margin = '0';
    wrap.appendChild(d);
    f.appendChild(wrap);
    this.feedItems.push({ el: wrap, t: 4 });
    while (this.feedItems.length > 4) this.feedItems.shift().el.remove();
  },

  update(dt) {
    const g = this.game;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) $('banner').classList.remove('show');
    }
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) $('tip').classList.remove('show');
    }
    if (this.popT > 0) {
      this.popT -= dt;
      if (this.popT <= 0) $('trickPop').classList.remove('show');
    }
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const it = this.feedItems[i];
      it.t -= dt;
      if (it.t <= 0) {
        it.el.remove();
        this.feedItems.splice(i, 1);
      }
    }
    const p = g.player;
    this.setFrost(!!p && p.frozenT > 0);
    if (!p) return;
    if (g.session.kind === 'practice') {
      $('timer').textContent = fmtTime(Math.max(0, PRACTICE_SECONDS - g.raceTime));
      $('speedNum').textContent = Math.round(p.vel.length() * 3.6);
      return;
    }
    this.updateChain(p);
    $('posNum').textContent = p.out ? '💀' : p.rank;
    $('timer').textContent = fmtTime(p.finished ? p.finishTime : g.raceTime);
    $('speedNum').textContent = p.out ? 0 : Math.round(p.vel.length() * 3.6);
    const key = p.weapon ? p.weapon + p.ammo : '';
    if (key !== this.lastItem) {
      this.lastItem = key;
      const w = p.weapon ? WEAPONS[p.weapon] : null;
      $('itemIcon').textContent = w ? w.icon : '';
      $('itemName').textContent = w ? w.name : '';
      $('itemSlot').classList.toggle('has', !!w);
      const am = $('itemAmmo');
      am.classList.toggle('hidden', !w || p.ammo <= 1);
      am.textContent = '×' + p.ammo;
    }
    const L = g.course.L;
    for (let i = 0; i < g.racers.length; i++) {
      const r = g.racers[i];
      this.dots[i].style.top = Math.max(0, Math.min(100, (r.d / L) * 100)) + '%';
      this.dots[i].style.opacity = r.out ? '0.25' : '';
    }
    this.rankT -= dt;
    if (this.rankT <= 0) {
      this.rankT = 0.25;
      const mode = g.mode;
      $('rank').innerHTML = g.order
        .map((r, i) => {
          const tag = mode.rankTag(r) ?? (r.finished ? '🏁' : r.weapon ? WEAPONS[r.weapon].icon : '');
          const team = r.team >= 0 ? ` style="border-left:4px solid ${TEAM_COLORS[r.team]}"` : '';
          return `<div class="row ${r.isPlayer ? 'me' : ''} ${r.finished ? 'done' : ''} ${r.out ? 'out' : ''}"${team}><span class="n">${i + 1}</span><span class="nm">${esc(r.name)}</span><span>${tag}</span></div>`;
        })
        .join('');
      const html = mode.hud();
      if (html !== this.lastModeHtml) {
        this.lastModeHtml = html;
        $('modeBox').innerHTML = html;
        $('modeBox').classList.toggle('hidden', !html);
      }
    }
  },
};
