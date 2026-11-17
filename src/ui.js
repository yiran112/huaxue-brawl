// DOM 界面：大厅菜单、HUD、结算、暂停
import { THEMES, THEME_KEYS, LENGTHS, WEAPONS, WEAPON_KEYS, SKINS, SUIT_COLORS, HATS, POINTS, MODES, MODE_KEYS } from './config.js';
import { GEAR, GEAR_KEYS, RARITY, RARITY_KEYS, STAT_NAMES, STAT_KEYS, STAT_MAX, UPGRADES, UP_KEYS, UP_MAX, HAT_UNLOCK, COSMETIC_SLOTS, gearStats } from './gear.js';
import { TRACKS, TRACK_MAP, CUPS, CUP_MAP, medalTimes } from './tracks.js';
import { ACH_MAP, CUP_LV, seasonNow, seasonLeftText, seasonReward, blankSeason } from './profile.js';
import { RANK_LV, RANK_MODES, RANK_MAP } from './rank.js';
import { fetchLeaderboard } from './account.js';
import { TEAM_COLORS } from './modes.js';
import { CHAIN_T, MULT_MAX } from './chain.js';
import { fmtTime, mulberry32 } from './util.js';
import { Quest, growthView } from './quest.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const BOARD_COLORS = ['#ff5a7a', '#4f7bff', '#3ddc97', '#ffb21f', '#c084fc', '#ff8a4a', '#49d6e8'];
const boardColor = (name) => {
  let h = 0;
  for (const c of String(name)) h = (Math.imul(h, 33) + c.charCodeAt(0)) >>> 0;
  return BOARD_COLORS[h % BOARD_COLORS.length];
};
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TABS = ['race', 'growth', 'garage', 'look', 'rules', 'keys', 'set'];
const DIFF_NAMES = ['简单', '普通', '困难'];
const MEDAL = ['', '🥉', '🥈', '🥇'];
const THEME_ICON = { day: '☀️', sunset: '🌄', storm: '🌨️', night: '🌌' };

// 模式选择大卡片：配色、英文小字、是否推荐
const MODE_STYLE = {
  race: { en: 'ITEM RACE', c: ['#ffab3d', '#ef5f17'], rec: true },
  speed: { en: 'RACING', c: ['#3f9bff', '#2152d4'], rec: true },
  elim: { en: 'ELIMINATION', c: ['#ff5c78', '#c41f45'] },
  team: { en: 'TEAM', c: ['#2fcfa8', '#11876f'] },
  brawl: { en: 'BRAWL', c: ['#a56bff', '#6527d6'] },
  trick: { en: 'TRICK', c: ['#ff74c8', '#cf2f8d'] },
  tt: { en: 'TIME TRIAL', c: ['#4fd0f0', '#2775b8'] },
};

// 赛道卡片右侧的小图标：这条赛道上有什么
const FEAT = {
  village: ['🏘️', '山村'], lift: ['🚡', '缆车'], lumber: ['🪵', '伐木场'], icelake: ['🧊', '冰湖'], tunnel: ['🕳️', '隧道'],
  avalanche: ['🏔️', '雪崩'], snowmobile: ['🏍️', '雪地摩托'], boulder: ['🪨', '滚石'], big: ['🛫', '大跳台'],
  ice: ['❄️', '冰面'], powder: ['☁️', '深雪'], pads: ['⚡', '加速带'],
};
function trackFeats(t) {
  const out = [];
  const add = (k) => FEAT[k] && !out.includes(k) && out.push(k);
  for (const l of t.landmarks || []) add(l.type);
  if (t.avalanche) add('avalanche');
  for (const m of t.movers || []) add(m.type);
  if ((t.features || []).some((f) => f.type === 'big')) add('big');
  for (const z of t.zones || []) add(z.type);
  if (t.pads && t.pads.length) add('pads');
  return out.slice(0, 4);
}

// 赛道卡片上的小风景（天空是卡片底色）：山形、雪道走向、树由种子决定，同一条赛道每次画得一样
const ART = {
  day: { far: '#a7cbef', near: '#7c9dcd', fg: '#f4f9ff', tree: '#2f6b4f', run: '#4f8dff' },
  sunset: { far: '#e49c8c', near: '#93537f', fg: '#fff0e2', tree: '#5a3a52', run: '#ff6a3d' },
  storm: { far: '#8c90bb', near: '#585a8a', fg: '#e9ecff', tree: '#363a5e', run: '#a77bff' },
  night: { far: '#3a4c9a', near: '#24306e', fg: '#c6d6ff', tree: '#16204a', run: '#5cf0d4' },
};
const artCache = new Map();
function trackArt(theme, seed) {
  const key = theme + seed;
  if (artCache.has(key)) return artCache.get(key);
  const a = ART[theme] || ART.day;
  const rng = mulberry32(seed);
  const f = (v) => v.toFixed(0);
  let s = '';
  if (theme === 'day') s += '<circle cx="262" cy="30" r="22" fill="#fff8d0" opacity=".3"/><circle cx="262" cy="30" r="12" fill="#fff8d0"/>';
  if (theme === 'sunset') s += `<circle cx="${f(60 + rng() * 80)}" cy="74" r="26" fill="#ffe08a" opacity=".95"/>`;
  if (theme === 'night') {
    s += '<path d="M-10 46 Q60 14 130 40 T270 30 T340 22" stroke="#5cf0b0" stroke-width="14" fill="none" opacity=".22"/>';
    s += '<path d="M-10 52 Q70 24 140 46 T280 36 T340 30" stroke="#8affd0" stroke-width="4" fill="none" opacity=".35"/>';
    for (let i = 0; i < 16; i++) s += `<circle cx="${f(rng() * 320)}" cy="${f(rng() * 60)}" r="${(0.6 + rng() * 0.9).toFixed(1)}" fill="#fff" opacity=".8"/>`;
    s += '<circle cx="272" cy="24" r="9" fill="#f4f7ff"/>';
  }
  // 远山、近山（山顶带雪）。卡片底部约四分之一被信息栏挡住，景物都往上放
  const ridge = (base, amp, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 320 + (i && i < n ? (rng() - 0.5) * 18 : 0);
      pts.push([x, base - (i % 2 ? amp * (0.6 + rng() * 0.5) : amp * rng() * 0.3)]);
    }
    return pts;
  };
  const poly = (pts) => `0,140 ${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')} 320,140`;
  s += `<polygon points="${poly(ridge(66, 30, 9))}" fill="${a.far}"/>`;
  const near = ridge(86, 42, 7);
  s += `<polygon points="${poly(near)}" fill="${a.near}"/>`;
  for (let i = 1; i < near.length; i += 2) {
    const [x, y] = near[i];
    s += `<polygon points="${f(x)},${f(y)} ${f(x - 11)},${f(y + 13)} ${f(x - 4)},${f(y + 9)} ${f(x + 2)},${f(y + 14)} ${f(x + 11)},${f(y + 12)}" fill="${a.fg}" opacity=".9"/>`;
  }
  const ridgeY = (x) => {
    for (let i = 1; i < near.length; i++) {
      const [xa, ya] = near[i - 1];
      const [xb, yb] = near[i];
      if (x <= xb) return ya + ((yb - ya) * (x - xa)) / (xb - xa);
    }
    return near[near.length - 1][1];
  };
  // 前景雪坡 + 一条从山脊蜿蜒下来的雪道
  const y0 = 84 + rng() * 6;
  const y1 = 92 + rng() * 8;
  s += `<path d="M0 ${f(y0)} Q${f(90 + rng() * 60)} ${f(y0 - 16)} 200 ${f(y1)} T320 ${f(y1 - 4)} L320 140 L0 140 Z" fill="${a.fg}"/>`;
  const x0 = 110 + rng() * 100;
  const dir = rng() < 0.5 ? -1 : 1;
  const w1 = dir * (34 + rng() * 30);
  const w2 = -dir * (40 + rng() * 40);
  const top = ridgeY(x0) + 3;
  const run = `M${f(x0)} ${f(top)} C${f(x0 + w1)} ${f(top + 14)} ${f(x0 + w1)} ${f(top + 26)} ${f(x0 + w1 * 0.3)} 100 S${f(x0 + w2)} 118 ${f(x0 + w2 * 0.6)} 146`;
  s += `<path d="${run}" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" opacity=".95"/>`;
  s += `<path d="${run}" stroke="${a.run}" stroke-width="3" fill="none" stroke-dasharray="7 6" stroke-linecap="round"/>`;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const x = x0 + side * (46 + rng() * 120);
    const y = 90 + rng() * 22;
    const h = 8 + rng() * 9;
    s += `<polygon points="${f(x)},${f(y - h)} ${f(x - h * 0.45)},${f(y)} ${f(x + h * 0.45)},${f(y)}" fill="${a.tree}"/>`;
  }
  if (theme === 'storm') for (let i = 0; i < 34; i++) s += `<circle cx="${f(rng() * 320)}" cy="${f(rng() * 140)}" r="${(0.8 + rng() * 1.2).toFixed(1)}" fill="#fff" opacity=".75"/>`;
  const svg = `<svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${s}</svg>`;
  artCache.set(key, svg);
  return svg;
}

// 大厅每一页分成左右两栏（side：'l' / 'r'），各自带标题、各自滚动
const col = (side, title, small, body) =>
  `<section class="col ${side} panel"><h2 class="colTitle">${title}${small ? `<small>${small}</small>` : ''}</h2><div class="colBody">${body}</div></section>`;
// 面板没占满屏幕时返回的“整屏”
const FULL_FRAME = { cx: 0.5, cy: 0.5, w: 1, h: 1 };

// 展厅页：角色站在中间的展台上，左边一列竖排子页签，右边信息面板。
// label 是展台背后的全息大字；subs：[子页 key, 名字, 英文小字]，第一个是默认子页
const SHOW = {
  growth: { label: 'CAREER', subs: [['home', '总览', 'OVERVIEW'], ['ach', '成就', 'TROPHIES'], ['stats', '生涯', 'RECORDS']] },
  garage: { label: 'GARAGE', subs: [['attr', '属性', 'PROPERTY'], ['up', '强化', 'UPGRADE']] },
  look: { label: 'STYLE', subs: [['style', '造型', 'STYLE'], ['color', '配色', 'COLOR'], ['acc', '饰品', 'ACCESSORY']] },
};

// 装备的标签：最强和最弱的一项、深雪表现，都从属性表里算出来。返回 [[文字, 样式]]
function gearTags(G) {
  const R = RARITY[G.rarity] || RARITY.C;
  const ks = STAT_KEYS.slice().sort((a, b) => G.stats[b] - G.stats[a]);
  const hi = ks[0];
  const lo = ks[ks.length - 1];
  const tags = [[`${G.rarity} · ${R.name}`, 'r' + (G.rarity || 'C')]];
  tags.push(G.stats[hi] === G.stats[lo] ? ['各项均衡', 'warm'] : [`${STAT_NAMES[hi]}突出`, 'warm']);
  if (G.stats[hi] !== G.stats[lo]) tags.push([`${STAT_NAMES[lo]}偏弱`, '']);
  const powder = G.powder ?? 1;
  if (powder < 1) tags.push(['深雪减速少', 'pink']);
  else if (powder > 1) tags.push(['深雪更慢', '']);
  return tags;
}

// 存档 key（'gear:sled'、'hat:6'、'back:3'）对应的解锁条件
function unlockOf(key) {
  const [slot, id] = key.split(':');
  if (slot === 'gear') return GEAR[id] && GEAR[id].unlock;
  if (slot === 'hat') return HAT_UNLOCK[+id];
  const s = COSMETIC_SLOTS[slot];
  return s && s.list[+id] && s.list[+id].unlock;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.rankT = 0;
    this.bannerT = 0;
    this.tipT = 0;
    this.popT = 0;
    this.toastT = null;
    this.feedItems = [];
    this.dots = [];
    this.lastItem = undefined;
    this.tab = 'race';
    this.pendingBuy = null; // 第一次点“购买”只是让按钮变成“确认购买”
    this.sub = {}; // 展厅页各自停在哪个子页
    for (const t in SHOW) this.sub[t] = SHOW[t].subs[0][0];
    this.viewGear = null; // 车库里正在看的装备（null = 正在用的那件）
    this.gearRank = null; // 车库底部按哪一档稀有度筛选（null = 跟着正在看的那件）
    this.racePick = null; // 'track' 赛道大厅 / 'hall' 房间列表 / 'room' 创建房间
    this.hallMode = 'all';
    this.hallRooms = [];
    this.fromRoom = false; // 赛道大厅是从开房间进去的，返回时回到房间
    this.onlineN = 0;
    this.onlineWait = 0;
    this.queueing = false; // 开始比赛：按钮停在匹配中，再点一次取消
    this.queueLine = '';
    this.board = 'points'; // 首页左侧赛季榜：points / hits / tt
    this.boardFull = false;
    this.boardRules = false;
    this.boardRows = null;
    this.roomCat = 'all';
    this.rankMode = 'solo';
    this.modeSel = null; // 模式选择浮层：{ go } go = 选完直接开赛
    this.quest = new Quest(this); // 任务面板：首页「每日任务」点开的那一层
    // Esc：先关模式选择，再退出赛道大厅
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || $('menu').classList.contains('hidden') || this.tab !== 'race') return;
      const acc = $('account');
      if (acc && !acc.classList.contains('hidden')) return;
      if (this.modeSel) this.modeSel = null;
      else if (this.racePick === 'track' && this.fromRoom) this.racePick = 'room';
      else if (this.racePick) {
        if (this.racePick === 'hall') game.net.leave();
        if (this.racePick === 'rank' && game.netMode && !game.customRoom) game.leavePublicQueue();
        this.racePick = null;
        this.fromRoom = false;
      } else if (this.queueing) {
        game.leavePublicQueue();
        return;
      } else return;
      this.renderTab('race');
    });
    for (const t of TABS) if (t !== 'keys') $('tab-' + t).addEventListener('click', (e) => this.onMenuClick(e));
    for (const t in SHOW) this.bindDrag($('tab-' + t));
    this.buildMenu();
    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.openTab(b.dataset.tab);
    });
    $('btnLobby').addEventListener('click', () => game.toMenu());
    $('btnNext').addEventListener('click', () => game.nextRace());
    $('btnResume').addEventListener('click', () => game.setPaused(false));
    $('btnRestart').addEventListener('click', () => game.restartRace());
    $('btnQuit').addEventListener('click', () => game.toMenu());
    // 每日任务卡片上的刷新倒计时
    setInterval(() => {
      const el = this.tab === 'race' && !$('menu').classList.contains('hidden') && document.querySelector('#tab-race .hdaily .cd');
      if (el) el.textContent = this.dailyLeft();
      const scd = this.tab === 'race' && document.querySelector('#tab-race .scd');
      if (scd) scd.textContent = seasonLeftText(seasonNow().left);
    }, 20000);
    $('btnCancelMatch').addEventListener('click', () => game.cancelMatch());
    $('btnStartNow').addEventListener('click', () => game.startMatchNow());
  }

  // ---------- 联机匹配面板 ----------
  showMatch(b) {
    $('match').classList.toggle('hidden', !b);
  }

  // info: { status, error } 只显示一句状态；或 { players, me, host, max } 显示房间里的人
  setMatch(info) {
    const list = $('matchList');
    const status = $('matchStatus');
    const room = info.kind === 'room' || this.game.customRoom;
    status.classList.toggle('bad', !!info.error);
    const title = $('matchBox') && $('matchBox').querySelector('h2');
    if (title) title.textContent = room ? '房间' : '匹配对战';
    const note = $('matchNote');
    if (note) note.textContent = room ? '按房主选的玩法和赛道。空位可以继续进人，房主点开始后由机器人补齐。' : `${MODES[this.game.soloRules.mode] ? MODES[this.game.soloRules.mode].name : '道具赛'}，中等长度、随机场景。在线只有你时约 10 秒补机器人，人多最多等 30 秒；满员会提前开。比赛中途不能暂停。`;
    const go = $('btnStartNow');
    if (go) go.textContent = room ? '开始 ▶' : '立即开始 ▶';
    if (!info.players) {
      status.textContent = info.status || '';
      list.innerHTML = '';
      go.classList.add('hidden');
      this.matchText = null;
      return;
    }
    const n = info.players.length;
    this.matchReason = info.reason || (room ? 'host' : 'fill');
    this.matchText = room ? `房间里 ${n} / ${info.max} 人` : `已匹配 ${n} / ${info.max} 人`;
    status.textContent = this.matchText;
    const wait = this.matchReason === 'host' ? '等待玩家…' : '等待玩家…（到点由机器人补位）';
    let html = info.players
      .map((p) => `<div class="row ${p.id === info.me ? 'me' : ''}"><span class="dot" style="background:${hex(p.look.jacket)}"></span><span class="nm">${esc(p.name)}</span><span>${p.id === info.me ? '你' : ''}</span></div>`)
      .join('');
    for (let i = n; i < info.max; i++) html += `<div class="row empty"><span class="dot"></span><span class="nm">${wait}</span></div>`;
    list.innerHTML = html;
    go.classList.toggle('hidden', !info.host);
  }

  // 公开匹配不打开面板，只把首页按钮改成匹配中
  setQueue(on) {
    this.queueing = !!on;
    this.queueAt = performance.now();
    this.queueLine = on ? '00:00' : '';
    this.paintGo();
  }

  // 匹配中后面显示已经等了多久
  tickQueue() {
    if (!this.queueing) return;
    const s = Math.floor((performance.now() - this.queueAt) / 1000);
    const line = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const wait = document.getElementById('rankWait');
    if (wait) wait.textContent = `匹配中 ${line}`;
    if (line === this.queueLine) return;
    this.queueLine = line;
    this.paintGo();
  }

  goTitle() {
    return this.queueing ? `匹配中<span class="qtime">${this.queueLine || '00:00'}</span>` : '开始比赛';
  }

  paintGo() {
    const b = document.querySelector('#tab-race .hgo');
    if (!b) return;
    const on = !!this.queueing;
    b.classList.toggle('matching', on);
    const title = b.querySelector('.htx b');
    const ico = b.querySelector('.hico');
    const thumb = b.querySelector('.hthumb');
    if (title) title.innerHTML = this.goTitle();
    let small = b.querySelector('.htx small');
    if (!small) {
      small = document.createElement('small');
      if (title) title.after(small);
    }
    small.textContent = this.goLine();
    if (ico) ico.textContent = on ? '⏳' : '⛷️';
    const M = MODES[this.game.soloRules.mode];
    if (thumb && M) thumb.textContent = M.icon;
  }

  // 「开始比赛」按首页选的玩法匹配，下面那行写明当前玩法
  goLine() {
    const m = this.game.soloRules.mode;
    const name = MODES[m] ? MODES[m].name : '道具赛';
    if (this.queueing) return `${name} · 再点一次取消`;
    if (m === 'tt') return '计时赛 · 一个人滑，直接开始';
    return `${name} · 在线匹配`;
  }

  // 匹配倒计时
  tickMatch(ms) {
    if (!this.matchText) return;
    const s = Math.max(0, Math.ceil(ms / 1000));
    const tail = this.matchReason === 'host' ? '等人中 · 房主点开始后开赛' : this.matchReason === 'fill' ? (s > 0 ? `${s} 秒后机器人补位开赛` : '机器人正在进场…') : s > 0 ? `${s} 秒后开赛` : '即将开赛…';
    const text = `${this.matchText} · ${tail}`;
    const el = $('matchStatus');
    if (el.textContent !== text) el.textContent = text;
  }

  // ---------- 菜单 ----------
  optRow(label, key, options, cur, cls = '') {
    const btns = options
      .map(([v, text, style]) => `<button class="${cls} ${String(v) === String(cur) ? 'on' : ''}" data-k="${key}" data-v="${v}" ${style ? `style="${style}"` : ''}>${text}</button>`)
      .join('');
    return `<div class="field"><label>${label}</label><div class="opts">${btns}</div></div>`;
  }

  lockWhy(u) {
    if (!u) return '';
    if (u.ach) return `达成成就「${ACH_MAP[u.ach] ? ACH_MAP[u.ach].name : u.ach}」解锁`;
    if (u.lv && this.game.profile.level < u.lv) return `Lv.${u.lv} 解锁${u.cost ? `，之后可用 ❄${u.cost} 购买` : ''}`;
    return '';
  }

  // 需要解锁的外观选项。items：[{ name, unlock }]；keyOf(i)：存档里的 key
  lockRow(label, field, items, cur, keyOf) {
    const P = this.game.profile;
    const btns = items
      .map((it, i) => {
        const key = keyOf(i);
        const st = P.unlockState(it.unlock, key);
        if (st === 'free' || st === 'owned') return `<button class="${i === cur ? 'on' : ''}" data-k="look.${field}" data-v="${i}">${esc(it.name)}</button>`;
        if (st === 'buy') return this.buyBtn(key, field, i, it.name, it.unlock.cost, '');
        return `<button class="lock" data-act="locked" data-why="${esc(this.lockWhy(it.unlock))}" title="${esc(this.lockWhy(it.unlock))}">🔒 ${esc(it.name)}</button>`;
      })
      .join('');
    return `<div class="field"><label>${label}</label><div class="opts">${btns}</div></div>`;
  }

  buyBtn(key, field, v, name, cost, cls) {
    const confirm = this.pendingBuy === key;
    const poor = this.game.profile.coins < cost;
    return `<button class="buy ${cls} ${confirm ? 'confirm' : ''} ${poor ? 'poor' : ''}" data-act="buy" data-key="${key}" data-field="${field}" data-v="${v}">${confirm ? `确认购买 ❄${cost}` : `${esc(name)} ❄${cost}`}</button>`;
  }

  buildMenu() {
    this.refreshProfile();
    for (const t of TABS) if (t !== 'keys') this.renderTab(t);
    this.openTab(this.tab);
  }

  openTab(tab) {
    if (!TABS.includes(tab)) return;
    if (tab !== 'race' && this.queueing) this.game.leavePublicQueue();
    if (tab !== this.tab) {
      this.pendingBuy = null;
      this.viewGear = null;
      if (this.racePick === 'hall') this.game.net.leave();
      this.racePick = null;
      this.modeSel = null;
    }
    this.tab = tab;
    for (const x of $('tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
    for (const t of TABS) $('tab-' + t).classList.toggle('hidden', t !== tab);
    if (tab !== 'keys') this.renderTab(tab);
    $('menu').classList.toggle('show', !!SHOW[tab]);
    this.applyShow();
  }

  // 告诉主程序背景该是缆车大厅还是展厅、展台上摆哪件装备
  applyShow() {
    const s = SHOW[this.tab];
    this.game.setShow(s ? s.label : null, this.tab === 'garage' ? this.viewGear : null);
  }

  // 展厅中间的空地：按住左右拖动，转动台上的角色
  bindDrag(el) {
    let lastX = null;
    el.addEventListener('pointerdown', (e) => {
      if (!e.target.classList.contains('sdrag')) return;
      lastX = e.clientX;
      e.target.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (lastX === null) return;
      const room = this.game.showroom;
      if (room) room.drag(e.clientX - lastX);
      lastX = e.clientX;
    });
    const end = () => (lastX = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // 展厅页的骨架。head：{ badge, small, name, side, bar }；tags：[[文字, 样式]]；
  // extra：摆在中间的东西（车库的装备栏）；act：右下角的大按钮
  showHtml(tab, head, tags, body, extra = '', act = '', cls = '') {
    const cur = this.sub[tab];
    const nav = SHOW[tab].subs.map(([k, name, en]) => `<button class="${k === cur ? 'on' : ''}" data-sub="${k}"><b>${name}</b><i>${en}</i></button>`).join('');
    return `<div class="sdrag" title="按住左右拖动，可以转动角色"></div><nav class="snav">${nav}</nav>${extra}
      <div class="sright ${cls}"><section class="sinfo">
        <header class="shead"><div class="sbadge">${head.badge}</div><div class="sname"><small>${head.small}</small><b>${head.name}</b></div>${head.side ? `<div class="sside">${head.side}</div>` : ''}</header>
        ${head.bar || ''}
        ${tags.length ? `<div class="stags">${tags.map(([t, c]) => `<span class="${c}">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="sbody colBody">${body}</div>
      </section>${act ? `<div class="sact">${act}</div>` : ''}</div>`;
  }

  renderTab(t) {
    const el = $('tab-' + t);
    if (!el) return;
    // 重画后两栏各自回到原来的滚动位置
    const tops = [...el.querySelectorAll('.colBody')].map((b) => b.scrollTop);
    if (t === 'race') el.innerHTML = this.raceHtml();
    else if (t === 'growth') el.innerHTML = this.growthHtml();
    else if (t === 'garage') el.innerHTML = this.garageHtml();
    else if (t === 'look') el.innerHTML = this.lookHtml();
    else if (t === 'rules') el.innerHTML = this.rulesHtml();
    else if (t === 'set') el.innerHTML = this.settingsHtml();
    el.querySelectorAll('.colBody').forEach((b, i) => (b.scrollTop = tops[i] || 0));
  }

  raceHtml() {
    const g = this.game;
    const r = g.rules;
    const m = r.mode;
    const def = r.track !== 'random' ? TRACK_MAP[r.track] : null;
    // 首页：开始比赛走匹配。开房间里选玩法、赛道和机器人。赛道大厅单独铺开
    const page = this.racePick === 'track' ? this.roomHtml(def) : this.racePick === 'room' ? this.customRoomHtml(def) : this.racePick === 'hall' ? this.hallHtml() : this.racePick === 'rank' ? this.rankHtml() : this.boardHtml() + `<section class="home">${this.homeHtml(def)}</section>`;
    return page + (this.modeSel ? this.modeSelHtml(def) : '');
  }

  // 首页左侧赛季榜。服务器上的选手，和本机刚打完还没上传的成绩，合成一份。
  boardEntries() {
    const g = this.game;
    const P = g.profile;
    const now = seasonNow();
    const mine = P.data.season && P.data.season.id === now.id ? P.data.season : blankSeason(now.id);
    const me = {
      name: (g.account && g.account.username) || g.playerName || '游客',
      title: P.data.title || '',
      points: mine.points | 0,
      hits: mine.hits | 0,
      tt: mine.tt || 0,
      ttTime: mine.ttTime || 0,
      ttTrack: mine.ttTrack || '',
      me: true,
      jacket: g.look && g.look.jacket,
    };
    const rows = (this.boardRows || []).map((r) => (r.me ? { ...r, ...me, me: true } : r));
    if (!rows.some((r) => r.me)) rows.push(me);
    return rows;
  }

  boardRanked() {
    const key = this.board;
    let rows = this.boardEntries();
    if (key === 'tt') rows = rows.filter((r) => r.tt > 0);
    else rows = rows.filter((r) => (key === 'hits' ? r.hits : r.points) > 0 || r.me);
    rows.sort((a, b) => {
      if (key === 'tt') return a.tt - b.tt || a.ttTime - b.ttTime;
      const d = key === 'hits' ? b.hits - a.hits : b.points - a.points;
      return d || a.name.localeCompare(b.name, 'zh');
    });
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  boardScore(r) {
    if (this.board === 'hits') return `${r.hits}`;
    if (this.board === 'tt') {
      const track = TRACK_MAP[r.ttTrack];
      return `${fmtTime(r.ttTime)}<small>${track ? esc(track.name) : '固定赛道'}</small>`;
    }
    return `${r.points}`;
  }

  boardInner() {
    const now = seasonNow();
    if (this.boardRules) {
      return `<header class="boardHead"><b>第 ${now.id} 赛季</b><small class="scd">${seasonLeftText(now.left)}</small></header>
        <div class="boardRules">
          <p><b>积分榜</b>每周一 0 点（北京时间）结算。只计「比赛」页的快速赛和联机赛：至少 4 人，难度为普通或困难，完赛才计分（淘汰赛出局也算）。名次分 ${POINTS.join(' / ')}，困难再 ×1.5 向下取整。简单、独自练习、排位赛、计时赛不计。</p>
          <p><b>击飞榜</b>记的是上面这些比赛里，你击飞对手的次数。</p>
          <p><b>计时榜</b>只计固定赛道的计时赛，比的是用时 ÷ 金牌时间，越小越靠前。随机赛道每局长度不一样，不进榜。</p>
          <p><b>奖励</b>按积分榜名次，换季并连上服务器时发放：第 1 名 ❄${seasonReward(1)}，第 2–3 名 ❄${seasonReward(2)}，第 4–10 名 ❄${seasonReward(4)}，第 11–50 名 ❄${seasonReward(11)}。击飞榜和计时榜只排名。</p>
        </div>
        <div class="boardFoot"><button type="button" class="boardMore" data-act="boardRules">返回榜单</button></div>`;
    }
    const tabs = [['points', '积分'], ['hits', '击飞'], ['tt', '计时']]
      .map(([id, name]) => `<button type="button" class="${id === this.board ? 'on' : ''}" data-act="board" data-id="${id}">${name}</button>`)
      .join('');
    const ranked = this.boardRanked();
    const shown = this.boardFull ? ranked.slice(0, 30) : ranked.slice(0, 7);
    const unit = this.board === 'hits' ? '次' : this.board === 'tt' ? '' : '分';
    let list;
    if (!shown.length) {
      list = `<p class="boardEmpty">${this.board === 'tt' ? '本赛季还没有人在固定赛道上跑过计时赛。' : '打完一场计入规则的比赛，就会出现在这里。'}</p>`;
    } else {
      list = shown
        .map((r) => {
          const color = r.me && r.jacket != null ? hex(r.jacket) : boardColor(r.name);
          const title = r.title ? `<small>${esc(r.title)}</small>` : '<small> </small>';
          return `<div class="brow ${r.me ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}"><span class="brank">${r.rank}</span><span class="bav" style="background:${color}">${esc(r.name.slice(0, 1))}</span><span class="bmeta"><b>${esc(r.name)}</b>${title}</span><span class="bscore">${this.boardScore(r)}${unit ? `<i>${unit}</i>` : ''}</span></div>`;
        })
        .join('');
    }
    const more = ranked.length > 7 ? `<button type="button" class="boardMore" data-act="boardMore">${this.boardFull ? '收起榜单' : '查看完整排行榜'}</button>` : '';
    return `<header class="boardHead"><b>第 ${now.id} 赛季</b><small class="scd">${seasonLeftText(now.left)}</small></header>
      <div class="boardTabs">${tabs}</div>
      <div class="boardList">${list}</div>
      <div class="breward"><span>第1名 ❄${seasonReward(1)}</span><span>2–3 ❄${seasonReward(2)}</span><span>4–10 ❄${seasonReward(4)}</span><span>11–50 ❄${seasonReward(11)}</span></div>
      <div class="boardFoot">${more}<button type="button" class="boardMore ghost" data-act="boardRules">上榜规则</button></div>`;
  }

  boardHtml() {
    return `<section class="board panel">${this.boardInner()}</section>`;
  }

  patchBoard() {
    const el = document.querySelector('#tab-race .board');
    if (el) el.innerHTML = this.boardInner();
  }

  refreshBoard() {
    if (this.boardJob) return this.boardJob;
    this.boardJob = this._refreshBoard().finally(() => {
      this.boardJob = null;
    });
    return this.boardJob;
  }

  async _refreshBoard() {
    await this.settleSeason();
    await this.loadBoard();
  }

  async settleSeason() {
    const P = this.game.profile;
    const now = seasonNow();
    const s = P.data.season;
    if (!s || !s.id || s.id >= now.id) {
      if (s && !s.id) {
        P.data.season = blankSeason(now.id);
        P.save();
      }
      return;
    }
    if (!(s.points | 0)) {
      P.data.season = blankSeason(now.id);
      P.save();
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
    const coins = seasonReward(rank);
    const old = s.id;
    P.data.season = blankSeason(now.id);
    if (coins) P.addCoins(coins);
    P.save();
    this.toast(coins ? `第 ${old} 赛季积分榜第 ${rank} 名，奖励 ❄${coins}` : `第 ${now.id} 赛季开始了`);
  }

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
  }

  // 「设置」分页：机器人数量、难度、锦标赛轮数
  settingsHtml() {
    return col('l', '对局设置', '', '<p class="note" style="margin-top:0">这些用于赛道大厅里直接开始的比赛。开房间的人数和玩法在房间列表里另设。首页「开始比赛」按玩法卡选的玩法分开匹配。</p>' + this.matchSettingsHtml());
  }

  matchSettingsHtml(forRoom) {
    const r = this.game.rules;
    const m = r.mode;
    const def = r.track !== 'random' ? TRACK_MAP[r.track] : null;
    let set = '';
    if (forRoom) {
      if (m === 'tt') set += '<p class="note" style="margin-top:0">计时赛是一个人滑，不能开房。</p>';
      else if (m === 'team') set += '<p class="note" style="margin-top:0">团队赛固定 8 人，4 对 4。空位可以等人，房主点开始后由机器人补上。</p>';
      else {
        const seats = m === 'elim' ? [4, 6, 8] : [4, 6, 8];
        set += this.optRow('房间人数', 'seats', seats.map((n) => [n, `${n} 人`]), r.seats || 8);
        set += '<p class="note">空出来的位置可以等人进来。房主点开始后，没人的位置由机器人补上。</p>';
      }
      if (m !== 'tt') set += this.optRow('机器人难度', 'difficulty', [[0, '简单'], [1, '普通'], [2, '困难']], r.difficulty);
      return set;
    }
    if (m === 'team') set += '<p class="note" style="margin-top:0">团队赛固定 4 对 4：你和 3 名机器人队友组成红队，对阵蓝队。</p>';
    else if (m !== 'tt') {
      const opts = (m === 'elim' ? [3, 5, 7] : [0, 1, 3, 5, 7]).map((n) => [n, n === 0 ? '独自练习' : `${n} 个`]);
      set += this.optRow(`机器人补位（总人数 = 你 + 机器人）${m === 'elim' ? ' · 淘汰赛至少 4 人' : ''}`, 'bots', opts, m === 'elim' ? Math.max(3, r.bots) : r.bots);
    }
    if (m !== 'tt') set += this.optRow('机器人难度', 'difficulty', [[0, '简单'], [1, '普通'], [2, '困难']], r.difficulty);
    if (m === 'race' || m === 'speed') {
      set += this.optRow('锦标赛轮数', 'rounds', [[1, '单局'], [3, '3 轮'], [5, '5 轮']], r.rounds);
      set += `<p class="note">锦标赛按每轮名次累计积分（${POINTS.join(' / ')}）${def ? '，每轮都在这条赛道上比' : '，每轮赛道随机生成'}。</p>`;
    }
    if (m === 'tt') set += '<p class="note" style="margin-top:0">计时赛没有对手和道具。跑完会留下你的幽灵，下次和它一起滑；固定赛道的幽灵和最好成绩会一直保存，随机赛道的幽灵只保留到关闭页面。</p>';
    else set += `<p class="note">${MODES[m].icon} ${MODES[m].name}：${MODES[m].desc}。</p>`;
    return set;
  }

  // 在线人数仍会记下来，匹配等多久由服务器按这个数算
  setOnline(info) {
    const n = Math.floor(Number(info && info.online));
    const wait = Math.floor(Number(info && info.wait));
    if (!n || !wait) return;
    this.onlineN = n;
    this.onlineWait = wait;
  }

  // 首页：开始比赛是匹配（大）· 玩法 / 开房间（中间两张）· 赛道（竖长）· 下面一排赛事和每日任务
  homeHtml(def) {
    const g = this.game;
    const r = g.rules;
    const P = g.profile;
    const m = r.mode;
    const M = MODES[m];
    let trackCard;
    if (def) {
      const best = P.data.best[def.id];
      const medal = MEDAL[P.data.medals[def.id] || 0];
      trackCard = `<span class="hglow">${THEME_ICON[def.theme] || '🏔️'}</span><b>${esc(def.name)}</b><small>${THEMES[def.theme].name} · ${(def.length / 1000).toFixed(1)} km</small>${best ? `<em>${medal} 最好 ${fmtTime(best)}</em>` : '<em class="dim">还没有成绩</em>'}`;
    } else {
      const theme = r.theme === 'random' ? '随机场景' : THEMES[r.theme].name;
      trackCard = `<span class="hglow">🎲</span><b>随机生成</b><small>${theme}</small><em class="dim">${LENGTHS[r.length].name}</em>`;
    }
    const tasks = P.dailyTasks();
    const dots = tasks.map((t) => `<i class="${t.done ? 'on' : ''}"></i>`).join('');
    return `<div class="hrow top">
        <button class="hc hgo${this.queueing ? ' matching' : ''}" data-act="match"><span class="in">
          <span class="hico">${this.queueing ? '⏳' : '⛷️'}</span>
          <span class="htx"><b>${this.goTitle()}</b><small>${esc(this.goLine())}</small></span>
          <span class="hthumb">${M.icon}</span>
        </span></button>
        <div class="hmid">
          <button class="hc hmode" data-act="msel"><span class="in">
            <span class="hico sm">${M.icon}</span><span class="htx"><b>${M.name}</b><small>玩法模式</small></span><span class="hmore">›</span>
          </span></button>
          <button class="hc hnet" data-act="hall">
            <span class="in"><span class="hico sm">🏠</span><span class="htx"><b>开房间</b></span><span class="hmore">›</span></span>
          </button>
        </div>
        <button class="hc htrack" data-act="pick" data-id="track"><span class="in"><span class="hlbl">赛道 · 场景</span>${trackCard}</span></button>
      </div>
      <div class="hrow bot">
        <button class="hc hev${P.rankOpen() ? '' : ' lock'}" data-act="ranked"><span class="in">
          <span class="hsq">🏅</span><span class="htx"><small class="${P.rankOpen() ? '' : 'hot'}">${P.rankOpen() ? esc(P.rankView().line) : `Lv.${RANK_LV} 开启`}</small><b>排位赛</b></span><span class="hmore">›</span>
        </span></button>
        <button class="hc hdaily" data-act="quest"><span class="in">
          <span class="hsq blue">📋</span><span class="htx"><b>每日任务</b><span class="hdots">${dots}</span><small class="cd">${this.dailyLeft()}</small></span>
        </span></button>
      </div>`;
  }

  // 离每日任务刷新（本地零点）还有多久
  dailyLeft() {
    const P = this.game.profile;
    if (P.dailyTasks().every((t) => t.done)) return '今天的任务全部完成！';
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const min = Math.max(1, Math.ceil((next - now) / 60000));
    const h = Math.floor(min / 60);
    return `${h ? `${h} 小时 ` : ''}${min % 60} 分钟后刷新`;
  }

  // 赛道大厅：左边按杯赛分类，右边赛道卡片，上面是选中赛道的详情，底部一排操作按钮
  roomHtml(def) {
    const g = this.game;
    const P = g.profile;
    const M = MODES[g.rules.mode];
    const cat = this.roomCat;
    let nav = [
      ['all', '🗺️', '全部赛道', `${TRACKS.length} 条固定 + 随机`],
      ['random', '🎲', '随机生成', '每局都不一样'],
    ]
      .map(([id, ic, name, sub]) => `<button class="${cat === id ? 'on' : ''}" data-act="rcat" data-id="${id}"><span class="ic">${ic}</span><b>${name}</b><small>${sub}</small></button>`)
      .join('');
    CUPS.forEach((c, i) => {
      const open = P.trackUnlocked(c.tracks[0]);
      const got = c.tracks.filter((id) => P.data.medals[id]).length;
      nav += `<button class="${cat === c.id ? 'on' : ''} ${open ? '' : 'lock'}" data-act="rcat" data-id="${c.id}"><span class="ic">${open ? c.icon : '🔒'}</span><b>${c.name}</b><small>${open ? `奖牌 ${got} / ${c.tracks.length}` : `Lv.${CUP_LV[i]} 解锁`}</small></button>`;
    });
    let cards;
    if (cat === 'random') cards = this.randCardHtml('random') + THEME_KEYS.map((k) => this.randCardHtml(k)).join('');
    else {
      const list = cat === 'all' ? TRACKS : CUP_MAP[cat].tracks.map((id) => TRACK_MAP[id]);
      cards = (cat === 'all' ? this.randCardHtml(null) : '') + list.map((t) => this.trackCardHtml(t)).join('');
    }
    return `<section class="room">
      <nav class="rnav"><header><b>赛道大厅</b><small>TRACKS</small></header>${nav}</nav>
      <div class="rbar">${this.roomBarHtml(def)}</div>
      <div class="rgrid colBody">${cards}</div>
      <div class="ract">
        ${this.fromRoom
          ? `<button class="rbtn back" data-act="roomBack"><b>‹ 返回</b><small>回到房间</small></button>
             <span class="rtip">选中的卡片再点一次，就带着它回到房间</span>
             <button class="rbtn main" data-act="quick"><b>用这条开始</b><small>${M.icon} ${M.name}</small></button>`
          : `<button class="rbtn back" data-act="pick" data-id=""><b>‹ 返回</b><small>回到首页</small></button>
             <span class="rtip">选中的卡片再点一次，按当前玩法直接出发</span>
             <button class="rbtn" data-act="hall"><b>开房间</b><small>房间列表</small></button>
             <button class="rbtn main" data-act="quick"><b>开始这场</b><small>${M.icon} ${M.name}</small></button>`}
      </div>
    </section>`;
  }

  // 大厅顶部：随机赛道在这里调场景和长度；固定赛道显示介绍和奖牌线
  roomBarHtml(def) {
    const r = this.game.rules;
    const P = this.game.profile;
    if (!def) {
      const chips = (k, list, v) => list.map(([x, n]) => `<button class="${x === v ? 'on' : ''}" data-k="${k}" data-v="${x}">${n}</button>`).join('');
      return `<div class="rsel"><span class="ttag rnd">随机</span><b>随机生成</b><small>每局重新生成地形和近道</small></div>
        <div class="rchips"><label>场景</label>${chips('theme', [...THEME_KEYS.map((k) => [k, `${THEME_ICON[k]} ${THEMES[k].name}`]), ['random', '🎲 随机']], r.theme)}</div>
        <div class="rchips"><label>长度</label>${chips('length', Object.keys(LENGTHS).map((k) => [k, LENGTHS[k].name]), r.length)}</div>`;
    }
    const k = CUPS.findIndex((c) => c.tracks.includes(def.id));
    const best = P.data.best[def.id];
    const [au, ag, cu] = medalTimes(def.length);
    return `<div class="rsel"><span class="ttag c${k + 1}">${CUPS[k].name}</span><b>${esc(def.name)}</b><small>${THEMES[def.theme].name} · ${(def.length / 1000).toFixed(1)} km · ${esc(def.desc)}</small></div>
      <div class="rmed"><label>计时赛奖牌线</label><span>🥇 ${fmtTime(au)}</span><span>🥈 ${fmtTime(ag)}</span><span>🥉 ${fmtTime(cu)}</span>${best ? `<em>最好 ${fmtTime(best)} ${MEDAL[P.data.medals[def.id] || 0]}</em>` : ''}</div>`;
  }

  trackCardHtml(t) {
    const P = this.game.profile;
    const k = CUPS.findIndex((c) => c.tracks.includes(t.id));
    const open = P.trackUnlocked(t.id);
    const on = this.game.rules.track === t.id;
    const medal = P.data.medals[t.id] || 0;
    const best = P.data.best[t.id];
    const why = open ? '' : `达到 Lv.${CUP_LV[k]} 解锁`;
    const feats = trackFeats(t).map((x) => `<i title="${FEAT[x][1]}">${FEAT[x][0]}</i>`).join('');
    const hit = open ? `data-act="tpick" data-id="${t.id}"` : `data-act="locked" data-why="${esc(why)}"`;
    return `<button class="tcard ${on ? 'on' : ''} ${open ? '' : 'lock'}" ${hit} title="${esc(open ? t.desc : why)}">
      <span class="tart ${t.theme}">${trackArt(t.theme, t.seed)}</span>
      <span class="ttag c${k + 1}">${CUPS[k].name}</span><span class="tstar">${'★'.repeat(k + 1)}</span>
      <span class="tfeat">${feats}</span>
      ${open ? '' : `<span class="tlock"><b>🔒</b><small>Lv.${CUP_LV[k]} 解锁</small></span>`}
      ${on ? '<span class="tsel">已选择</span>' : ''}
      <span class="tfoot"><span class="tmed">🏆<b>${medal ? MEDAL[medal] : '—'}</b></span><span class="tnm"><b>${esc(t.name)}</b><small>${best ? `最好 ${fmtTime(best)}` : THEMES[t.theme].name}</small></span><em>${(t.length / 1000).toFixed(1)}<small>km</small></em></span>
    </button>`;
  }

  // 随机赛道卡片。theme：某个场景、'random'（场景也随机），null = 沿用当前场景（「全部赛道」里那一张）
  randCardHtml(theme) {
    const r = this.game.rules;
    const th = theme || r.theme;
    const on = r.track === 'random' && (!theme || r.theme === theme);
    const mix = th === 'random';
    return `<button class="tcard rand ${on ? 'on' : ''}" data-act="rpick" data-id="${theme || ''}">
      <span class="tart ${mix ? 'mix' : th}">${mix ? '' : trackArt(th, 901 + THEME_KEYS.indexOf(th) * 37)}</span>
      <span class="temb"><b>🎲</b><span>${mix ? '全部随机' : '随机生成'}<small>RANDOM</small></span></span>
      <span class="ttag rnd">随机</span>
      ${on ? '<span class="tsel">已选择</span>' : ''}
      <span class="tfoot"><span class="tmed">${mix ? '🎲' : THEME_ICON[th]}</span><span class="tnm"><b>${mix ? '随机场景' : THEMES[th].name}</b><small>每局都是新赛道</small></span><em>${(LENGTHS[r.length].length / 1000).toFixed(1)}<small>km</small></em></span>
    </button>`;
  }

  // 房间列表：别人开的房。没有人开房就是空的。
  hallHtml() {
    const mode = this.hallMode || 'all';
    const filters = [['all', '全部'], ...MODE_KEYS.filter((k) => k !== 'tt').map((k) => [k, `${MODES[k].icon} ${MODES[k].name}`])]
      .map(([id, name]) => `<button class="${mode === id ? 'on' : ''}" data-act="hmode" data-id="${id}">${name}</button>`)
      .join('');
    const list = (this.hallRooms || []).filter((r) => mode === 'all' || r.mode === mode);
    const cards = list.length
      ? list.map((r) => this.hallCard(r)).join('')
      : '<div class="hallEmpty">还没有人开房<br><small>创建一个，别人就能从这里进来</small></div>';
    return `<section class="room hall">
      <div class="hallBar"><b>房间</b><div class="opts">${filters}</div></div>
      <div class="hallGrid">${cards}</div>
      <div class="ract">
        <button class="rbtn back" data-act="pick" data-id=""><b>‹ 返回</b><small>回到首页</small></button>
        <button class="rbtn" data-act="qroom"><b>快速进房</b><small>${mode === 'all' ? '随便进一间' : MODES[mode].name}</small></button>
        <button class="rbtn main" data-act="pick" data-id="room"><b>创建房间</b><small>自己定玩法和赛道</small></button>
      </div>
    </section>`;
  }

  hallCard(r) {
    const M = MODES[r.mode] || MODES.race;
    const def = r.track && r.track !== 'random' ? TRACK_MAP[r.track] : null;
    const theme = def ? def.theme : r.theme && r.theme !== 'random' ? r.theme : 'mix';
    const art = theme === 'mix' ? '' : trackArt(theme, def ? def.seed : 701);
    const title = def ? def.name : '全部随机';
    const sub = def ? THEMES[def.theme].name : r.theme && THEMES[r.theme] ? THEMES[r.theme].name : '赛道和场景都随机';
    const full = r.players >= r.max;
    return `<button class="rcard ${full ? 'full' : ''}" data-act="jroom" data-id="${r.id}">
      <span class="tart ${theme}">${art}</span>
      ${theme === 'mix' ? '<span class="temb"><b>🎲</b><span>全部随机<small>RANDOM</small></span></span>' : ''}
      <span class="ttag">${M.icon} ${M.name}</span>
      <span class="tfoot"><span class="tnm"><b>${esc(title)}</b><small>${esc(r.host || '房主')}</small></span><em class="rcnt">${r.players}/${r.max}</em></span>
    </button>`;
  }

  // 创建房间：选玩法、赛道和人数，创建后出现在列表里
  customRoomHtml(def) {
    const g = this.game;
    const r = g.rules;
    const M = MODES[r.mode] || MODES.race;
    const modes = MODE_KEYS.filter((k) => k !== 'tt').map((k) => {
      const m = MODES[k];
      return `<button class="${k === r.mode ? 'on' : ''}" data-k="mode" data-v="${k}">${m.icon} ${m.name}</button>`;
    }).join('');
    let where;
    let sub;
    if (def) {
      where = def.name;
      sub = `${THEMES[def.theme].name} · ${(def.length / 1000).toFixed(1)} km`;
    } else {
      const theme = r.theme === 'random' ? '随机场景' : THEMES[r.theme].name;
      where = '随机生成';
      sub = `${theme} · ${LENGTHS[r.length].name}`;
    }
    return `<section class="room setup">
      <div class="sheet panel">
        <header class="shead"><div class="sbadge">🏠</div><div class="sname"><small>自己定规则，马上开赛</small><b>开房间</b></div></header>
        <div class="field"><label>玩法</label><div class="opts">${modes}</div></div>
        <button class="roomMap" data-act="pick" data-id="track"><span><b>${esc(where)}</b><small>${esc(sub)}</small></span><em>选赛道 ›</em></button>
        ${this.matchSettingsHtml(true)}
      </div>
      <div class="ract">
        <button class="rbtn back" data-act="hall"><b>‹ 返回</b><small>房间列表</small></button>
        <button class="rbtn main" data-act="mkroom"><b>创建</b><small>${M.icon} ${M.name}</small></button>
      </div>
    </section>`;
  }

  // 模式选择：一排斜切大卡片。选完回到刚才的页面
  modeSelHtml(def) {
    const r = this.game.rules;
    const go = this.modeSel.go;
    const cards = MODE_KEYS.map((k, i) => {
      const M = MODES[k];
      const s = MODE_STYLE[k];
      return `<button class="mcard ${k === r.mode ? 'on' : ''}" data-act="mode" data-id="${k}" style="--c1:${s.c[0]};--c2:${s.c[1]};--i:${i}">
        <span class="in"><span class="mdeco"><i>▸▸▸▸</i><s></s></span>
          ${k === r.mode ? '<span class="mcur">上次玩的</span>' : ''}
          <span class="mico">${M.icon}</span>
          <span class="mrec ${s.rec ? '' : 'none'}">推荐</span>
          <b>${M.name}</b><small class="men">${s.en}</small>
          <span class="mdesc">${M.desc}</span>
        </span></button>`;
    }).join('');
    const where = def ? def.name : '随机赛道';
    return `<div class="msel">
      <div class="mhead"><b><i>›››</i>模式选择</b><small>${go ? `${esc(where)} · 选好玩法就直接出发` : '换一个玩法，回到首页再出发'}</small></div>
      <div class="mrow">${cards}</div>
      <div class="mfoot"><button class="rbtn back" data-act="msel-close"><b>‹ 返回</b><small>Esc</small></button></div>
    </div>`;
  }

  rankHtml() {
    const g = this.game;
    const P = g.profile;
    const view = P.rankView();
    const cur = RANK_MAP[this.rankMode] || RANK_MODES[0];
    const modes = RANK_MODES.map((m) => `<button class="ropt ${m.id === cur.id ? 'on' : ''}" data-act="rankMode" data-id="${m.id}"><span class="ic">${m.icon}</span><b>${m.name}</b><small>${esc(m.blurb)}</small></button>`).join('');
    const matching = !!this.queueing && g.rankMode;
    const go = matching ? '取消匹配' : '开始匹配';
    return `<section class="rank">
      <header class="rankHead"><div><small>排位赛</small><b>${esc(view.name)}${view.star ? ' ' + view.star : ''}</b></div><em>${view.pts} 分 · ${esc(view.next)}<br>${view.wins} 胜 / ${view.games} 场</em></header>
      <div class="rankModes">${modes}</div>
      <p class="note">${esc(cur.blurb)} 单人排队，人不够时由机器人补齐。青铜段位失败不扣分。三种玩法共用这一套段位，新赛季保留七成积分。</p>
      <div class="ract">
        <button class="rbtn back" data-act="pick" data-id=""><b>‹ 返回</b><small>回到首页</small></button>
        <button class="rbtn main" data-act="rankGo" data-id="${cur.id}"><b id="rankWait">${matching ? `匹配中 ${esc(this.queueLine || '00:00')}` : go}</b><small>${matching ? '再点一次取消' : cur.name}</small></button>
      </div>
    </section>`;
  }

  // 成长页：内容在 quest.js 里（总览 / 成就 / 生涯）
  growthHtml() {
    const v = growthView(this);
    return this.showHtml('growth', v.head, v.tags, v.body, v.extra, '', v.cls);
  }

  garageHtml() {
    const g = this.game;
    const P = g.profile;
    const cur = g.look.gear;
    // 展台上摆的是正在看的那件，不一定是正在用的，也不一定已经拥有
    const id = GEAR[this.viewGear] ? this.viewGear : cur;
    const G = GEAR[id];
    const key = 'gear:' + id;
    const st = P.unlockState(G.unlock, key);
    const owned = st === 'free' || st === 'owned';
    const up = P.up(id);
    const upSum = UP_KEYS.reduce((n, k) => n + up[k], 0);
    const sub = this.sub.garage;
    let body;
    const rare = RARITY[G.rarity] || RARITY.C;
    if (sub === 'up') {
      const costNote = rare.up > 1 ? `，${rare.name}装备花费 ×${rare.up}` : '';
      body = `<div class="ssec">强化<small>每条最多 ${UP_MAX} 级，只作用于这一件装备${costNote}</small></div>`;
      for (const k of UP_KEYS) {
        const U = UPGRADES[k];
        const lv = up[k];
        const cost = P.upgradeCost(id, k);
        const pips = Array.from({ length: UP_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        let btn;
        if (!owned) btn = '<span class="tag lock">🔒 未拥有</span>';
        else if (lv >= UP_MAX) btn = '<span class="tag on">已满级</span>';
        else btn = `<button class="btn sm ${P.coins < cost ? 'poor' : ''}" data-act="up" data-line="${k}">强化 ❄${cost}</button>`;
        body += `<div class="uprow"><div class="un"><b>${U.name}</b><small>${U.desc}</small></div><div class="pips">${pips}</div>${btn}</div>`;
      }
    } else {
      const s = gearStats(id, up);
      const bars = STAT_KEYS.map((k) => {
        const b = (G.stats[k] / STAT_MAX) * 100;
        const e = ((s[k] - G.stats[k]) / STAT_MAX) * 100;
        return `<div class="stat"><span>${STAT_NAMES[k]}</span><div class="bar"><i style="width:${b}%"></i>${e > 0 ? `<em style="left:${b}%;width:${e}%"></em>` : ''}</div><b>${s[k].toFixed(1)}</b></div>`;
      }).join('');
      body =
        `<div class="ssec">装备特性</div><div class="strait r${G.rarity || 'C'}"><span class="ic">${G.icon}</span><p>${G.desc}</p></div>` +
        `<div class="ssec">属性<small>会真实影响手感；绿色是强化加成</small></div><div class="gcard">${bars}</div>`;
    }
    // 中间下方：先选稀有度，再换这一档里的装备
    const rank = RARITY[this.gearRank] ? this.gearRank : G.rarity || 'C';
    const chips = RARITY_KEYS.map((k) => `<button class="grank r${k} ${k === rank ? 'on' : ''}" data-act="rank" data-id="${k}"><b>${k}</b><i>${RARITY[k].name}</i></button>`).join('');
    const pick = GEAR_KEYS.filter((k) => (GEAR[k].rarity || 'C') === rank)
      .map((k) => {
        const has = P.gearOwned(k);
        const mark = k === cur ? '<em>使用中</em>' : has ? '' : '<em class="no">🔒</em>';
        return `<button class="r${GEAR[k].rarity} ${k === id ? 'on' : ''} ${has ? '' : 'lock'}" data-act="view" data-id="${k}"><span class="rk">${GEAR[k].rarity}</span><span class="ic">${GEAR[k].icon}</span><b>${GEAR[k].name}</b>${mark}</button>`;
      })
      .join('');
    // 右下角：左边在属性 / 强化之间切换，右边按状态是 选用 / 购买 / 未解锁
    let act = sub === 'up' ? '<button class="sbtn" data-sub="attr"><b>属性</b><i>PROPERTY</i></button>' : '<button class="sbtn" data-sub="up"><b>强化</b><i>UPGRADE</i></button>';
    let state;
    if (owned) {
      state = id === cur ? '使用中' : '已拥有';
      act += id === cur ? '<button class="sbtn main off" disabled><b>使用中</b><i>EQUIPPED</i></button>' : `<button class="sbtn main" data-k="look.gear" data-v="${id}"><b>选用</b><i>EQUIP</i></button>`;
    } else if (st === 'buy') {
      const cost = G.unlock.cost;
      const confirm = this.pendingBuy === key;
      state = '可购买';
      act += `<button class="sbtn main ${confirm ? 'confirm' : ''} ${P.coins < cost ? 'poor' : ''}" data-act="buy" data-key="${key}" data-field="gear" data-v="${id}"><b>${confirm ? '确认购买' : '购买'}</b><i>❄ ${cost}</i></button>`;
    } else {
      const why = this.lockWhy(G.unlock);
      state = '未解锁';
      act += `<button class="sbtn main off" data-act="locked" data-why="${esc(why)}"><b>未解锁</b><i>${G.unlock.lv ? `Lv.${G.unlock.lv}` : 'LOCKED'}</i></button>`;
    }
    const head = { badge: G.icon, small: `${G.rarity} · ${rare.name} · ${state}`, name: G.name, side: `强化 <b>${upSum}</b> / ${UP_KEYS.length * UP_MAX}` };
    return this.showHtml('garage', head, gearTags(G), body, `<div class="spick"><div class="granks">${chips}</div><div class="glist">${pick}</div></div>`, act);
  }

  lookHtml() {
    const g = this.game;
    const L = g.look;
    const sw = (list) => list.map((c) => [c, '', `background:${hex(c)}`]);
    const lockNote = '<p class="note">🔒 的部件升级或达成成就后解锁；标着 ❄ 的用雪花币购买（点两下确认）。</p>';
    const sub = this.sub.look;
    let body;
    if (sub === 'color') {
      body =
        '<div class="ssec">配色</div>' +
        this.optRow('帽子 / 头发', 'look.hatColor', sw([...SUIT_COLORS, 0x2a1a12, 0x7ad21f]), L.hatColor, 'sw') +
        this.optRow('上衣', 'look.jacket', sw(SUIT_COLORS), L.jacket, 'sw') +
        this.optRow('条纹 / 袖口', 'look.stripe', sw(SUIT_COLORS), L.stripe, 'sw') +
        this.optRow('裤子', 'look.pants', sw(SUIT_COLORS), L.pants, 'sw') +
        this.optRow('板子 / 雪橇', 'look.ski', sw(SUIT_COLORS), L.ski, 'sw');
    } else if (sub === 'acc') {
      body = '<div class="ssec">饰品</div>';
      for (const slot in COSMETIC_SLOTS) {
        const S = COSMETIC_SLOTS[slot];
        body += this.lockRow(S.name, slot, S.list, L[slot] | 0, (i) => `${slot}:${i}`);
      }
      body += lockNote;
    } else {
      body =
        '<div class="ssec">造型</div>' +
        this.lockRow('发型 / 帽子', 'hat', HATS.map((h, i) => ({ name: h, unlock: HAT_UNLOCK[i] })), L.hat | 0, (i) => 'hat:' + i) +
        this.optRow('肤色', 'look.skin', sw(SKINS), L.skin, 'sw') +
        this.optRow('胡子', 'look.mustache', [[false, '无'], [true, '有']], L.mustache) +
        lockNote;
    }
    // 标签：现在身上穿戴的东西
    const tags = [[HATS[L.hat | 0], 'warm']];
    for (const slot in COSMETIC_SLOTS) {
      const it = COSMETIC_SLOTS[slot].list[L[slot] | 0];
      if ((L[slot] | 0) > 0 && it) tags.push(slot === 'trail' ? [`${it.name}滑痕`, 'pink'] : [it.name, '']);
    }
    const G = GEAR[L.gear] || GEAR.ski;
    const head = { badge: '🎨', small: '角色造型', name: esc(g.playerName || '我的角色'), side: `${G.icon} ${G.name}` };
    return this.showHtml('look', head, tags, body);
  }

  rulesHtml() {
    const r = this.game.rules;
    const wp = WEAPON_KEYS.map((k) => `<button class="wp ${r.banned.includes(k) ? 'off' : ''}" data-ban="${k}">${WEAPONS[k].icon} ${WEAPONS[k].name}</button>`).join('');
    const set =
      '<p class="note" style="margin-top:0">这里的道具和野生动物用于赛道大厅里直接开始的比赛。开房间和匹配的道具跟着玩法走，排位有固定的规则。竞速赛、特技赛、计时赛不刷道具。</p>' +
      this.optRow('道具', 'items', [[true, '开启'], [false, '禁用道具（纯竞速）']], r.items) +
      this.optRow('道具箱密度', 'itemRate', [[0, '稀少'], [1, '正常'], [2, '密集']], r.itemRate) +
      this.optRow('野生动物袭击', 'wildlife', [[true, '开启'], [false, '关闭']], r.wildlife) +
      this.optRow('实时阴影（卡顿时可关闭）', 'shadows', [[true, '开启'], [false, '关闭']], r.shadows);
    return col('l', '快速赛规则', '', set) + col('r', '武器池', '点击禁用 / 启用单个武器', `<div class="opts">${wp}</div>`);
  }

  onMenuClick(e) {
    const g = this.game;
    const P = g.profile;
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (b.dataset.ban) {
      g.toggleBan(b.dataset.ban);
      b.classList.toggle('off', g.rules.banned.includes(b.dataset.ban));
      return;
    }
    if (act === 'locked') {
      this.toast(b.dataset.why || '还没解锁', true);
      return;
    }
    // 展厅页左边的子页签（车库右下角的 属性 / 强化 按钮也走这里）
    if (b.dataset.sub) {
      this.pendingBuy = null;
      this.sub[this.tab] = b.dataset.sub;
      for (const x of $('tab-' + this.tab).querySelectorAll('.colBody')) x.scrollTop = 0;
      this.renderTab(this.tab);
      return;
    }
    // 车库：换一档稀有度，展台跟着换成这一档的第一件
    if (act === 'rank') {
      this.pendingBuy = null;
      this.gearRank = b.dataset.id;
      const first = GEAR_KEYS.find((k) => (GEAR[k].rarity || 'C') === this.gearRank);
      if (first) this.viewGear = first;
      this.renderTab('garage');
      this.applyShow();
      return;
    }
    // 车库：换一件装备摆上展台看看
    if (act === 'view') {
      this.pendingBuy = null;
      this.viewGear = b.dataset.id;
      this.gearRank = (GEAR[b.dataset.id] && GEAR[b.dataset.id].rarity) || 'C';
      this.renderTab('garage');
      this.applyShow();
      return;
    }
    if (act === 'buy') {
      const key = b.dataset.key;
      const u = unlockOf(key);
      if (!u) return;
      if (P.coins < u.cost) {
        this.toast(`雪花币不够（需要 ❄${u.cost}，你有 ❄${P.coins}）`, true);
        return;
      }
      if (this.pendingBuy !== key) {
        this.pendingBuy = key;
        this.renderTab(this.tab);
        return;
      }
      this.pendingBuy = null;
      if (P.buy(u, key)) {
        const field = b.dataset.field;
        const v = field === 'gear' ? b.dataset.v : parseInt(b.dataset.v, 10);
        g.setLook(field, v);
        const ach = P.checkAch();
        this.toast(`购买成功，已装备！${ach.length ? ` 🏆 达成成就「${ach.map((a) => a.name).join('」「')}」` : ''}`);
        this.refreshProfile();
        this.renderTab(this.tab);
      }
      return;
    }
    this.pendingBuy = null;
    // 比赛页：首页卡片、赛道大厅、模式选择
    if (act === 'board') {
      this.board = b.dataset.id || 'points';
      this.boardFull = false;
      this.boardRules = false;
      this.patchBoard();
      return;
    }
    if (act === 'boardMore') {
      this.boardFull = !this.boardFull;
      this.boardRules = false;
      this.patchBoard();
      return;
    }
    if (act === 'boardRules') {
      this.boardRules = !this.boardRules;
      this.patchBoard();
      return;
    }
    if (act === 'hall' || act === 'pick' || act === 'msel' || act === 'quest' || act === 'tab' || act === 'ranked') {
      if (g.netMode && !g.customRoom && g.state === 'menu' && act !== 'rankGo') g.leavePublicQueue();
    }
    if (act === 'ranked') {
      if (!g.profile.rankOpen()) return this.toast(`排位赛 Lv.${RANK_LV} 开启`, true);
      this.racePick = 'rank';
      this.renderTab('race');
      return;
    }
    if (act === 'rankMode') {
      if (g.netMode && !g.customRoom) g.leavePublicQueue();
      this.rankMode = b.dataset.id || 'solo';
      this.renderTab('race');
      return;
    }
    if (act === 'rankGo') return g.startRank(b.dataset.id || this.rankMode);
    if (act === 'quick') return g.startTournament();
    if (act === 'match') return g.startMatch();
    if (act === 'hall') return g.openHall();
    if (act === 'mkroom') return g.createListedRoom();
    if (act === 'jroom') return g.joinListed(Number(b.dataset.id));
    if (act === 'qroom') return g.quickListed();
    if (act === 'hmode') {
      this.hallMode = b.dataset.id || 'all';
      this.renderTab('race');
      return;
    }
    if (act === 'tab') return this.openTab(b.dataset.id);
    if (act === 'quest') return this.quest.open();
    if (act === 'roomBack') {
      this.racePick = 'room';
      this.renderTab('race');
      return;
    }
    if (act === 'pick') {
      const id = b.dataset.id || null;
      if (id === 'track') this.fromRoom = this.racePick === 'room';
      else {
        if (!id && this.racePick === 'hall') g.net.leave();
        this.fromRoom = false;
      }
      this.racePick = id;
      this.renderTab('race');
      return;
    }
    if (act === 'msel' || act === 'msel-close') {
      this.modeSel = act === 'msel' ? { go: !!b.dataset.go } : null;
      this.renderTab('race');
      return;
    }
    if (act === 'mode') {
      const go = this.modeSel && this.modeSel.go;
      this.modeSel = null;
      if (g.rules.mode !== b.dataset.id) g.setRule('mode', b.dataset.id);
      else this.renderTab('race');
      if (go) g.startTournament();
      return;
    }
    if (act === 'rcat') {
      this.roomCat = b.dataset.id;
      this.renderTab('race');
      return;
    }
    // 赛道卡片：点一下选中，选中的再点一次就去选玩法出发
    if (act === 'tpick') {
      if (g.rules.track === b.dataset.id) {
        if (this.fromRoom) this.racePick = 'room';
        else return g.startTournament();
      } else g.setRule('track', b.dataset.id);
      this.renderTab('race');
      return;
    }
    if (act === 'rpick') {
      const th = b.dataset.id;
      if (g.rules.track !== 'random') {
        // 场景先悄悄写进规则，换赛道时只重建一次世界
        if (th) g.soloRules.theme = th;
        g.setRule('track', 'random');
      } else if (th && g.rules.theme !== th) g.setRule('theme', th);
      else if (this.fromRoom) this.racePick = 'room';
      else return g.startTournament();
      this.renderTab('race');
      return;
    }
    if (act === 'title') {
      P.setTitle(b.dataset.v);
      this.refreshProfile();
      this.renderTab('growth');
      return;
    }
    if (act === 'up') {
      const line = b.dataset.line;
      // 强化的是展台上正在看的那件装备
      const gear = GEAR[this.viewGear] ? this.viewGear : g.look.gear;
      const cost = P.upgradeCost(gear, line);
      if (P.coins < cost) {
        this.toast(`雪花币不够（需要 ❄${cost}，你有 ❄${P.coins}）`, true);
        return;
      }
      if (P.upgrade(gear, line)) {
        const ach = P.checkAch();
        this.toast(`${UPGRADES[line].name} 升到 ${P.up(gear)[line]} 级！${ach.length ? ` 🏆 达成成就「${ach.map((a) => a.name).join('」「')}」` : ''}`);
        this.refreshProfile();
        this.renderTab('garage');
      }
      return;
    }
    if (!b.dataset.k) return;
    let v = b.dataset.v;
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
    const k = b.dataset.k;
    if (k.startsWith('look.')) {
      g.setLook(k.slice(5), v);
      if (k === 'look.gear') this.renderTab('garage');
      if (this.tab === 'look' && this.pendingBuy === null) this.renderTab('look');
    } else {
      g.setRule(k, v);
      // 场景、长度改了，赛道大厅的卡片和首页赛道卡也要跟着变
      if (k === 'theme' || k === 'length') this.renderTab('race');
    }
  }

  toast(text, bad = false) {
    const el = $('menuToast');
    el.textContent = text;
    el.classList.toggle('bad', bad);
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 2400);
  }

  refreshProfile() {
    const P = this.game.profile;
    const info = P.levelInfo();
    const pct = info.need ? (info.cur / info.need) * 100 : 100;
    const who = this.game.account ? this.game.account.label() : '存档';
    $('profileBar').innerHTML =
      `<button type="button" class="acct" data-act="account">${esc(who)}</button>` +
      `<span class="lv">Lv.${info.lv}</span>${P.data.title ? `<span class="ttl">${esc(P.data.title)}</span>` : ''}` +
      `<div class="xpbar"><i style="width:${pct}%"></i></div><span class="xp">${info.need ? `${info.cur}/${info.need}` : 'MAX'}</span>` +
      `<span class="coin">❄ ${P.coins}</span>`;
  }

  showMenu(b) {
    $('menu').classList.toggle('hidden', !b);
    if (!b && this.quest) this.quest.close();
  }

  // 大厅 / 匹配界面里没被面板挡住的那块屏幕，按占整屏的比例给出中心和宽高；
  // 镜头靠它把缆车摆到空地正中
  lobbyFrame() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    let l = 0;
    let t = 0;
    let r = W;
    let b = H;
    if (!$('match').classList.contains('hidden')) l = $('matchBox').getBoundingClientRect().right;
    else if (!$('menu').classList.contains('hidden')) {
      // 赛道大厅铺满了整个大厅，背后的镜头停在原处，退回首页时不用再挪
      if (this.tab === 'race' && (this.racePick === 'track' || this.racePick === 'room' || this.racePick === 'hall' || this.racePick === 'rank')) return this.frame || FULL_FRAME;
      const m = $('menuMid').getBoundingClientRect();
      l = m.left;
      r = m.right;
      t = m.top;
      b = m.bottom;
      const home = this.tab === 'race' && W > 900 && $('tab-race').querySelector('.home');
      if (home) {
        // 比赛页：左侧是赛季榜，卡片在右下。空地是榜单右边、卡片上方。
        const h = home.getBoundingClientRect();
        const board = $('tab-race').querySelector('.board');
        t = $('menuTop').getBoundingClientRect().bottom;
        b = h.top;
        l = board ? board.getBoundingClientRect().right : h.left;
        r = $('menu').getBoundingClientRect().right - 16;
      } else if (SHOW[this.tab]) {
        // 展厅页：空地在竖排页签和右侧面板之间、装备栏之上；窄窗口下是页面里专门留出的那一块
        const el = $('tab-' + this.tab);
        const q = (s) => {
          const x = el.querySelector(s);
          return x && x.getBoundingClientRect();
        };
        if (W <= 900) {
          const d = q('.sdrag');
          if (d) {
            l = d.left;
            r = d.right;
            t = Math.max(0, d.top);
            b = Math.min(H, d.bottom);
          }
        } else {
          const nav = q('.snav');
          const right = q('.sright');
          const pick = q('.spick');
          if (nav) l = nav.right;
          if (right) r = right.left;
          if (pick) b = pick.top;
        }
      }
    }
    // 窄窗口下面板铺满了屏幕，没有空地可言，就按整屏居中
    if (r - l < 220 || b - t < 160) return FULL_FRAME;
    const f = this.frame || (this.frame = { cx: 0, cy: 0, w: 0, h: 0 });
    f.cx = (l + r) / 2 / W;
    f.cy = (t + b) / 2 / H;
    f.w = (r - l) / W;
    f.h = (b - t) / H;
    return f;
  }
  showHud(b) {
    $('hud').classList.toggle('hidden', !b);
  }
  // online：联机比赛中，只是打开菜单，比赛不会停，也不能重开
  showPause(b, online = false) {
    $('pause').classList.toggle('hidden', !b);
    if (!b) return;
    $('pauseTitle').textContent = online ? '菜单' : '暂停';
    $('pauseNote').classList.toggle('hidden', !online);
    $('btnRestart').classList.toggle('hidden', online);
    $('btnQuit').textContent = online ? '退出比赛，返回大厅' : '返回大厅';
  }
  hideResults() {
    $('results').classList.add('hidden');
  }

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
    const where = g.trackDef ? g.trackDef.name : THEMES[g.themeKey].name;
    const m = MODES[g.mode.key];
    return `${m.icon} ${m.name} · ${where}${g.rules.rounds > 1 ? ` · 第 ${g.round} / ${g.rules.rounds} 轮` : ''}`;
  }

  resetHud() {
    const g = this.game;
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
  }

  showImpact(name, cause, frozen) {
    const el = $('impact');
    el.classList.remove('hidden');
    const verb = frozen ? '冻住' : '命中';
    $('impactWho').textContent = `${verb} ${name}`;
    $('impactCause').textContent = cause || '';
  }

  hideImpact() {
    $('impact').classList.add('hidden');
  }

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
  }

  setCount(text) {
    const c = $('count');
    if (c.textContent === text) return;
    c.textContent = text;
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
  }

  banner(text, kind = '', dur = 1.6) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'stroke ' + kind;
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerT = dur;
  }

  tip(text, dur = 1.8) {
    const t = $('tip');
    t.textContent = text;
    t.classList.add('show');
    this.tipT = dur;
  }

  // 技巧链结算 / 中断弹字。kind：good / gold / bad
  chainPop(title, value, kind = 'good') {
    const el = $('trickPop');
    el.innerHTML = `<div class="t">${esc(title)}</div><div class="v">${esc(value)}</div>`;
    el.className = 'stroke ' + kind;
    void el.offsetWidth;
    el.classList.add('show');
    this.popT = 1.5;
  }

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
  }

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
  }

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
  }

  rewardHtml(rw) {
    if (!rw) return '';
    const P = this.game.profile;
    const line = (label, xp, coins, cls = '') =>
      `<div class="rl ${cls}"><span>${esc(label)}</span><span class="rx">${xp ? `+${xp}` : ''}</span><span class="rc">${coins ? `❄+${coins}` : ''}</span></div>`;
    let xp = rw.xp;
    let coins = rw.coins;
    let html = '<div class="rl head"><span>奖励</span><span class="rx">经验</span><span class="rc">雪花币</span></div>';
    for (const l of rw.lines) html += l.note ? `<div class="rl note">${esc(l.label)}</div>` : line(l.label, l.xp, l.coins);
    for (const e of rw.extra) {
      html += line(e.label, e.xp, e.coins, 'gold');
      xp += e.xp || 0;
      coins += e.coins || 0;
    }
    for (const t of rw.tasks) {
      html += line(`✅ 每日任务：${t.name}`, t.xp, t.coins, 'good');
      xp += t.xp;
      coins += t.coins;
    }
    if (rw.bonus) {
      html += line('🎁 今日任务全部完成', 0, rw.bonus, 'good');
      coins += rw.bonus;
    }
    for (const a of rw.ach) {
      html += line(`🏆 成就「${a.name}」${a.title ? ` · 称号「${a.title}」` : ''}`, 0, a.coins, 'gold');
      coins += a.coins || 0;
    }
    html += line('合计', xp, coins, 'total');
    const info = P.levelInfo();
    html += `<div class="rlv">${rw.lvTo > rw.lvFrom ? `<b>⬆ 升到 Lv.${rw.lvTo}！</b>` : `Lv.${info.lv}`}<div class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div><span>❄ ${P.coins}</span></div>`;
    if (rw.unlocks.length) html += `<div class="rl good unl">🔓 新解锁：${rw.unlocks.map(esc).join('、')}</div>`;
    return html;
  }

  showResults(data) {
    // data: { title, sub, rows: [{rank,name,me,time,pts,team}], nextLabel, reward, backLabel }
    $('resTitle').textContent = data.title;
    $('resSub').textContent = data.sub;
    $('resList').innerHTML = data.rows
      .map((r) => {
        const team = r.team >= 0 ? ` style="border-left:5px solid ${TEAM_COLORS[r.team]}"` : '';
        return `<div class="row ${r.me ? 'me' : ''}"${team}><span class="n">${r.rank}</span><span class="nm">${esc(r.name)}</span><span class="tm">${r.time}</span>${r.pts !== undefined ? `<span class="pt">${r.pts}</span>` : ''}</div>`;
      })
      .join('');
    const rw = $('resReward');
    if (data.reward) {
      this.lastReward = data.reward;
      rw.innerHTML = this.rewardHtml(data.reward);
    }
    rw.classList.toggle('hidden', !data.reward);
    $('btnNext').textContent = data.nextLabel;
    $('btnLobby').textContent = data.backLabel || '返回大厅';
    $('results').classList.remove('hidden');
  }
}
