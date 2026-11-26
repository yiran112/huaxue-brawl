import * as THREE from 'three';
import { fetchLeaderboard } from '../src/account.js';
import { seasonNow } from '../src/profile.js';
import { SHOP_GEAR } from '../src/gear.js';
import { previewWardrobe, wardrobeState } from '../src/ui/appearance.js';
import { drawMenu, drawMatch, drawAccount } from './pages.js';
import { drawResults, RESULT_MOTION_MS } from './results-ui.js';
import { drawRace, drawPause, drawReplay } from './race-ui.js';
import { ModelPreviews } from './model-previews.js';
import { screenQuad } from './display.js';
import { fallbackIconGlyph, gameIconImage, iconRuns, iconToken, rarityLetter } from '../src/icon-art.js';

const COLORS = {
  panel: 'rgba(11,21,48,.88)',
  line: 'rgba(255,255,255,.17)',
  pale: '#d1d9ee',
};

function runWidth(context, run, size) {
  if (typeof run === 'string') return context.measureText(run).width;
  return size * (rarityLetter(run.id) ? 1.45 : 1.1);
}

export class MiniUI {
  constructor(game) {
    this.game = game;
    this.tab = 'race';
    this.racePick = 'home';
    this.hallMode = 'all';
    this.hallRooms = [];
    this.offsets = new Map();
    this.hits = [];
    this.gestures = [];
    this.models = [];
    this.messages = [];
    this.modelPreviews = new ModelPreviews();
    this.warned = new WeakMap();
    this.beepT = 0;
    this.canvas = wx.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.undrawableIcons = new Set();
    this.redrawIcons = () => this.invalidate();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.premultiplyAlpha = true;
    this.overlay = screenQuad(this.texture, true);
    this.size();
    game.mini.window.addEventListener('resize', () => this.size());
  }

  size() {
    const { window, insets } = this.game.mini;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { width, height } = this.game.renderer.domElement;
    const lobby = this.game.state === 'menu' || this.game.state === 'boot';
    const key = [w, h, width, height, lobby, insets.left, insets.right, insets.top, insets.bottom,
      insets.capsule?.left, insets.capsule?.bottom].join(',');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    // 大厅按 1160×600 的逻辑画布缩放：基准越大，手机上每个模块显得越小（原来 1040×540 偏大）
    this.scale = lobby ? Math.min(w / 1160, h / 600, 1) : 1;
    this.w = w / this.scale;
    this.h = h / this.scale;
    this.l = 14 + insets.left / this.scale;
    this.r = this.w - 14 - insets.right / this.scale;
    this.t = 10 + insets.top / this.scale;
    this.b = this.h - 12 - insets.bottom / this.scale;
    this.capsule = insets.capsule;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.setTransform(width / this.w, 0, 0, height / this.h, 0, 0);
    this.invalidate();
  }

  invalidate() { this.dirty = true; }

  draw() {
    const g = this.game;
    const replaying = !!g.replay?.on;
    const replayButton = !!g.replay?.btnShown;
    if (replaying !== this.replaying || replayButton !== this.replayButton) {
      this.replaying = replaying;
      this.replayButton = replayButton;
      this.invalidate();
    }
    const liveHud = this.hudVisible && !this.results && !replaying && (!g.paused || g.net.active) ||
      !!this.results && !replaying && Date.now() - this.resultsAt < RESULT_MOTION_MS;
    if (!this.dirty && !liveHud && !this.notice) {
      this.renderOverlay();
      return;
    }
    const now = Date.now();
    if (!this.dirty && now - this.drawAt < 32) {
      this.renderOverlay();
      return;
    }
    this.size();
    this.dirty = false;
    this.drawAt = now;
    this.hits = [];
    this.gestures = [];
    this.models = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
    if (replaying) drawReplay(this);
    else if (this.results) drawResults(this);
    else if (this.matchVisible) drawMatch(this);
    else if (this.menuVisible) drawMenu(this);
    else if (this.hudVisible || this.departureVisible) drawRace(this);
    if (this.pause) {
      this.hits = [];
      this.gestures = [];
      this.models = [];
      drawPause(this);
    }
    if (this.accountOpen) {
      this.hits = [];
      this.gestures = [];
      this.models = [];
      drawAccount(this);
    }
    if (this.notice && this.notice.until > now) {
      const w = Math.min(440, this.r - this.l);
      this.panel((this.w - w) / 2, this.t + 113, w, 40, this.notice.bad ? '#d9384f' : '#2fae5a', 12, null);
      this.text(this.notice.text, this.w / 2, this.t + 133, { center: true, bold: true, size: 16, max: w - 20 });
    } else this.notice = null;
    this.texture.needsUpdate = true;
    this.renderOverlay();
  }

  renderOverlay() {
    const renderer = this.game.renderer;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.overlay.scene, this.overlay.camera);
      this.modelPreviews.draw(this);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  rounded(x, y, w, h, r) {
    const c = this.ctx;
    const radius = Math.max(0, Math.min(w / 2, h / 2, r));
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  panel(x, y, w, h, fill = COLORS.panel, radius = 12, stroke = COLORS.line) {
    this.rounded(x, y, w, h, radius);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  font(size, bold = false, italic = false) {
    return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  }

  icon(id, x, y, width, height = width) {
    const c = this.ctx;
    if (!this.undrawableIcons.has(id)) {
      const image = gameIconImage(id, this.redrawIcons);
      if (image) {
        try {
          c.drawImage(image, x, y, width, height);
          return;
        } catch {
          this.undrawableIcons.add(id);
        }
      }
    }
    const glyph = fallbackIconGlyph(id);
    if (!glyph) return;
    c.save();
    c.font = this.font(Math.min(width, height) * .8, true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.strokeStyle = '#0b1530';
    c.lineWidth = 2;
    c.strokeText(glyph, x + width / 2, y + height / 2, width);
    c.fillText(glyph, x + width / 2, y + height / 2, width);
    c.restore();
  }

  text(value, x, y, { size = 17, color = '#fff', bold = false, italic = false, center = false, right = false, max = this.r - this.l, outline = false } = {}) {
    const c = this.ctx;
    c.font = this.font(size, bold, italic);
    c.textAlign = center ? 'center' : right ? 'right' : 'left';
    c.textBaseline = 'middle';
    const text = String(value);
    const runs = iconRuns(text);
    if (outline) {
      c.lineWidth = Math.max(2, size / 8);
      c.strokeStyle = '#0b1530';
      c.lineJoin = 'round';
    }
    c.fillStyle = color;
    if (!runs) {
      if (outline) c.strokeText(text, x, y, max);
      c.fillText(text, x, y, max);
      return;
    }
    const widths = runs.map((run) => runWidth(c, run, size));
    const natural = widths.reduce((sum, width) => sum + width, 0);
    const scale = natural > max ? Math.max(0, max / natural) : 1;
    if (!natural || !scale) return;
    let left = x - natural * scale * (center ? .5 : right ? 1 : 0);
    c.textAlign = 'left';
    for (const [i, run] of runs.entries()) {
      const width = widths[i] * scale;
      if (typeof run === 'string') {
        if (outline) c.strokeText(run, left, y, width);
        c.fillText(run, left, y, width);
      } else this.icon(run.id, left, y - width / 2, width);
      left += width;
    }
  }

  paragraph(value, x, y, width, { size = 15, color = COLORS.pale, lines = 3, bold = false, center = false } = {}) {
    this.ctx.font = this.font(size, bold);
    const rows = [[]];
    const runs = iconRuns(value);
    const glyphs = [];
    for (const run of runs || [String(value)]) {
      if (typeof run === 'string') {
        for (const char of run) glyphs.push(char);
      } else glyphs.push(run);
    }
    for (const char of glyphs) {
      const i = rows.length - 1;
      const row = [...rows[i], char];
      const measured = runs ? row.reduce((sum, run) => sum + runWidth(this.ctx, run, size), 0) : this.ctx.measureText(row.join('')).width;
      if (char === '\n' || measured > width) {
        if (rows.length >= lines) { rows[i].pop(); rows[i].push('…'); break; }
        rows.push(char === '\n' ? [] : [char]);
      } else rows[i].push(char);
    }
    rows.forEach((line, i) => this.text(line.map((run) => typeof run === 'string' ? run : iconToken(run.id)).join(''),
      x, y + i * (size + 6), { size, color, max: width, bold, center }));
    return rows.length * (size + 6);
  }

  button(label, x, y, w, h, action, { primary = false, active = false, control = '', disabled = false, size = 17 } = {}) {
    const held = control && this.game.touch?.pressed(control);
    this.panel(x, y + 4, w, h, primary ? '#a11a3e' : '#18265a', 14, null);
    this.panel(x, y, w, h, held ? '#4f7bff' : primary ? '#ff3d6e' : active ? '#4f7bff' : '#2f4a9c', 14, null);
    this.text(label, x + w / 2, y + h / 2 + 1, {
      center: true, size, bold: true, italic: primary, color: disabled ? COLORS.pale : '#fff', max: w - 12,
    });
    if (!disabled && (action || control)) this.addHit({ x, y, w, h, label, action, control, primary });
  }

  contains(button, x, y) {
    x /= this.scale;
    y /= this.scale;
    if (button.circle) return Math.hypot(x - button.x - button.w / 2, y - button.y - button.h / 2) <= button.w / 2;
    return x >= button.x && x < button.x + button.w && y >= button.y && y < button.y + button.h;
  }

  addHit(hit) { this.hits.push(hit); }

  scrollArea(key, box, content, draw, horizontal = false) {
    const max = Math.max(0, content - (horizontal ? box.w : box.h));
    const offset = Math.max(0, Math.min(max, this.offsets.get(key) || 0));
    const first = this.hits.length;
    const modelStart = this.models.length;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(box.x, box.y, box.w, box.h);
    this.ctx.clip();
    draw(offset);
    this.ctx.restore();
    const clip = ({ x, y, w, h }) => {
      const left = Math.max(x, box.x), top = Math.max(y, box.y);
      const right = Math.min(x + w, box.x + box.w), bottom = Math.min(y + h, box.y + box.h);
      return { x: left, y: top, w: right - left, h: bottom - top };
    };
    const hits = this.hits.splice(first).map((hit) => ({ ...hit, ...clip(hit) }));
    this.hits.push(...hits.filter((hit) => hit.w > 0 && hit.h > 0));
    for (let i = modelStart; i < this.models.length; i++) this.models[i].clip = clip(this.models[i]);
    if (!max) return;
    this.gestures.push({ ...box, key, max, horizontal, offset });
    const length = horizontal ? box.w : box.h;
    const thumb = Math.max(18, length * length / content);
    const start = (length - thumb) * offset / max;
    if (horizontal) this.panel(box.x + start, box.y + box.h - 4, thumb, 4, 'rgba(255,255,255,.34)', 2, null);
    else this.panel(box.x + box.w - 5, box.y + start, 5, thumb, 'rgba(255,255,255,.34)', 3, null);
  }

  gestureAt(x, y) {
    for (let i = this.gestures.length - 1; i >= 0; i--) if (this.contains(this.gestures[i], x, y)) return this.gestures[i];
    return null;
  }

  headerRight(y) {
    const c = this.capsule;
    if (!c?.left || y * this.scale >= c.bottom + 8 || c.left / this.scale - 8 < this.w * .62) return this.r;
    return Math.min(this.r, c.left / this.scale - 8);
  }

  hit(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const button = this.hits[i];
      if (this.contains(button, x, y)) return button;
    }
    return null;
  }

  lobbyFrame() {
    if (!this.frame) return { cx: 0.5, cy: 0.5, w: 1, h: 1 };
    const { x, y, w, h } = this.frame;
    return { cx: (x + w / 2) / this.w, cy: (y + h / 2) / this.h, w: w / this.w, h: h / this.h };
  }

  openTab(tab) {
    if (this.racePick === 'hall' && tab !== 'race') this.game.net.leave();
    this.tab = tab;
    this.offsets.clear();
    this.panelPage = '';
    this.pendingBuy = null;
    this.achievement = null;
    this.boxWin = null;
    this.previewGear = tab === 'shop' ? SHOP_GEAR[0] : null;
    if (tab === 'race') this.racePick = 'home';
    if (tab === 'look') {
      this.wardrobeReveal = true;
      previewWardrobe(this.game, wardrobeState(this.game, this.wardrobeSelection));
    }
    else {
      const label = { shop: 'SHOP', growth: 'CAREER' }[tab];
      this.game.setShow(label, label ? this.previewGear || this.game.look.gear : null);
    }
    this.invalidate();
  }

  page(name) {
    if (name !== this.panelPage) {
      this.offsets.delete('garage-info');
      if (this.tab === 'garage' && this.previewGear) {
        if (name === 'up') this.game.setShow(null);
        else if (name === 'attr') this.game.setShow('GARAGE', this.previewGear);
      }
    }
    this.panelPage = name;
    this.invalidate();
  }

  back() {
    if (this.tab === 'garage' && this.previewGear) {
      if (this.panelPage === 'up') { this.page('attr'); return; }
      this.previewGear = null;
      this.pendingBuy = null;
      this.game.setShow(null);
      this.page('');
      return;
    }
    if (this.tab === 'race' && (this.panelPage || this.racePick) === 'rank' && this.rankSection && this.rankSection !== 'rank') {
      this.rankSection = 'rank';
      this.invalidate();
      return;
    }
    if (this.tab === 'race' && this.panelPage) {
      if (this.panelPage === this.racePick) this.racePick = 'home';
      this.page('');
      return;
    }
    if (this.tab === 'race' && this.racePick === 'room') {
      this.racePick = 'hall';
      this.invalidate();
      return;
    }
    if (this.racePick === 'hall') this.game.net.leave();
    this.openTab('race');
  }

  buildMenu() { this.openTab('race'); }
  showMenu(on) { this.menuVisible = on; this.invalidate(); }
  renderTab() { this.invalidate(); }
  refreshProfile() { this.invalidate(); }
  setOnline(info) { this.onlineCount = info?.online; this.invalidate(); }
  toast(text, bad = false) { this.notice = { text, bad, until: Date.now() + 2600 }; this.invalidate(); }

  async refreshBoard() {
    try {
      if (this.game.mini.online) {
        const token = this.game.account.token;
        const data = await fetchLeaderboard(token, seasonNow().id);
        if (token !== this.game.account.token) return;
        this.boardRows = Array.isArray(data.rows) ? data.rows : [];
        this.invalidate();
      }
    } catch {
      this.boardRows = [];
      this.invalidate();
    }
  }

  showMatch(on) { this.matchVisible = on; this.match = null; this.invalidate(); }
  setMatch(info) { this.match = info; this.matchSeconds = null; this.invalidate(); }
  tickMatch(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds !== this.matchSeconds) { this.matchSeconds = seconds; this.invalidate(); }
  }
  setQueue(on, label = '') {
    this.queue = on ? { label, at: Date.now(), info: '' } : null;
    this.invalidate();
  }
  tickQueue() {
    if (!this.queue) return;
    const seconds = Math.floor((Date.now() - this.queue.at) / 1000);
    const info = `${this.queue.label} · ${seconds} 秒${this.game.matchPlayers?.length ? ` · ${this.game.matchPlayers.length} 人` : ''}`;
    if (info !== this.queue.info) { this.queue.info = info; this.invalidate(); }
  }

  showHud(on) { this.hudVisible = on; this.invalidate(); }
  showDeparture(on) { this.departureVisible = on; this.invalidate(); }
  showPause(on, online, note) {
    this.pause = on ? { online, note, armed: false } : null;
    this.game.touch?.release();
    this.invalidate();
  }
  armQuit() { if (this.pause) this.pause.armed = true; this.invalidate(); }
  showResults(data) {
    if (!this.results) {
      this.game.touch.release();
      this.offsets.delete('results');
      this.offsets.delete('results-detail');
      this.resultsDetail = false;
      this.resultsAt = Date.now();
    }
    this.results = data;
    this.pause = null;
    this.invalidate();
  }
  hideResults() { this.results = null; this.invalidate(); }
  setCount(value) { if (value !== this.count) { this.count = value; this.invalidate(); } }
  resetHud() {
    this.count = '';
    this.messages.length = 0;
    this.bannerText = this.tipText = this.chainText = this.impact = null;
    this.emotesOpen = false;
    this.invalidate();
  }
  banner(text, kind, dur = 1.6) { this.bannerText = { text, kind, t: dur }; }
  tip(text, t = 1.8) { this.tipText = { text, t }; }
  chainPop(title, value, kind) { this.chainText = { title, value, kind, t: 1.5 }; }
  feed(html) {
    this.messages.push({ text: plain(html), t: 4 });
    if (this.messages.length > 3) this.messages.shift();
  }
  showImpact(name, cause, frozen) { this.impact = { name, cause, frozen }; }
  hideImpact() { this.impact = null; }
  impactRect() {
    if (!this.impact || this.pause || this.results || this.game.replay?.on) return null;
    const box = this.impactBox;
    if (!box) return null;
    return { x: box.x + 3, y: this.h - box.y - box.h + 3, w: box.w - 6, h: box.h - 6, aspect: (box.w - 6) / (box.h - 6) };
  }
  update(dt) {
    for (const msg of [this.bannerText, this.tipText, this.chainText, ...this.messages]) {
      if (msg) msg.t -= dt;
    }
    const g = this.game;
    const p = g.player;
    this.threat = '';
    if (!p || p.out || p.finished) return;
    let near = Infinity;
    for (const entity of g.entities) {
      if (entity.target !== p) continue;
      if (entity.kind === 'homing' && entity.life > 0) near = Math.min(near, entity.pos.distanceTo(p.pos));
      else if (entity.isStrike) {
        const stage = entity.spot ? 2 : 1;
        if ((this.warned.get(entity) || 0) < stage) {
          this.warned.set(entity, stage);
          g.sfx.strikeWarn(stage === 2);
        }
        this.threat = stage === 2 ? '雷击已锁定' : '雷击预警';
      }
    }
    if (near === Infinity) this.beepT = 0;
    else {
      this.threat = '追踪道具接近';
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = Math.min(0.55, Math.max(0.1, near / 140));
        g.sfx.lockBeep();
      }
    }
  }
}

export function plain(html) {
  return html.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot);/g,
    (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[key]);
}
