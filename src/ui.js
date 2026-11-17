// DOM 界面：大厅菜单、HUD、结算、暂停
import { THEMES, THEME_KEYS, LENGTHS, WEAPONS, WEAPON_KEYS, SKINS, SUIT_COLORS, HATS, POINTS, MODES, MODE_KEYS } from './config.js';
import { GEAR, GEAR_KEYS, STAT_NAMES, STAT_KEYS, STAT_MAX, UPGRADES, UP_KEYS, UP_MAX, HAT_UNLOCK, COSMETIC_SLOTS, gearStats } from './gear.js';
import { TRACKS, TRACK_MAP, CUPS, CHALLENGES, CHALLENGE_MAP, CUP_MAP, TROPHY, TROPHY_NAME, medalTimes } from './tracks.js';
import { ACHIEVEMENTS, ACH_MAP, STAT_LABELS, CUP_LV } from './profile.js';
import { TEAM_COLORS } from './modes.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TABS = ['race', 'events', 'growth', 'garage', 'look', 'rules', 'keys'];
const DIFF_NAMES = ['简单', '普通', '困难'];
const MEDAL = ['', '🥉', '🥈', '🥇'];

// 大厅每一页分成左右两栏（side：'l' / 'r'），各自带标题、各自滚动
const col = (side, title, small, body) =>
  `<section class="col ${side} panel"><h2 class="colTitle">${title}${small ? `<small>${small}</small>` : ''}</h2><div class="colBody">${body}</div></section>`;
// 面板没占满屏幕时返回的“整屏”
const FULL_FRAME = { cx: 0.5, cy: 0.5, w: 1, h: 1 };

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
    for (const t of TABS) if (t !== 'keys') $('tab-' + t).addEventListener('click', (e) => this.onMenuClick(e));
    this.buildMenu();
    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.openTab(b.dataset.tab);
    });
    $('btnGo').addEventListener('click', () => game.startTournament());
    $('btnLobby').addEventListener('click', () => game.toMenu(!game.netMode && game.session.kind !== 'quick' ? 'events' : undefined));
    $('btnNext').addEventListener('click', () => game.nextRace());
    $('btnResume').addEventListener('click', () => game.setPaused(false));
    $('btnRestart').addEventListener('click', () => game.restartRace());
    $('btnQuit').addEventListener('click', () => game.toMenu(!game.netMode && game.session.kind !== 'quick' ? 'events' : undefined));
    // 联机匹配
    const nameInput = $('nameInput');
    nameInput.value = game.playerName;
    nameInput.addEventListener('input', () => game.setName(nameInput.value));
    $('btnMatch').addEventListener('click', () => game.startMatch());
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
    status.classList.toggle('bad', !!info.error);
    if (!info.players) {
      status.textContent = info.status || '';
      list.innerHTML = '';
      $('btnStartNow').classList.add('hidden');
      this.matchText = null;
      return;
    }
    const n = info.players.length;
    this.matchText = `已匹配 ${n} / ${info.max} 人`;
    status.textContent = this.matchText;
    let html = info.players
      .map((p) => `<div class="row ${p.id === info.me ? 'me' : ''}"><span class="dot" style="background:${hex(p.look.jacket)}"></span><span class="nm">${esc(p.name)}</span><span>${p.id === info.me ? '你' : ''}</span></div>`)
      .join('');
    for (let i = n; i < info.max; i++) html += '<div class="row empty"><span class="dot"></span><span class="nm">等待玩家…（开赛时由机器人补位）</span></div>';
    list.innerHTML = html;
    $('btnStartNow').classList.toggle('hidden', !info.host);
  }

  // 匹配倒计时
  tickMatch(ms) {
    if (!this.matchText) return;
    const s = Math.max(0, Math.ceil(ms / 1000));
    const text = `${this.matchText} · ${s > 0 ? `${s} 秒后开赛` : '即将开赛…'}`;
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
    if (tab !== this.tab) this.pendingBuy = null;
    this.tab = tab;
    for (const x of $('tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
    for (const t of TABS) $('tab-' + t).classList.toggle('hidden', t !== tab);
    if (tab !== 'keys') this.renderTab(tab);
    // 赛事页每张卡片有自己的开始按钮
    $('goWrap').classList.toggle('hidden', tab === 'events');
  }

  renderTab(t) {
    const el = $('tab-' + t);
    if (!el) return;
    // 重画后两栏各自回到原来的滚动位置
    const tops = [...el.querySelectorAll('.colBody')].map((b) => b.scrollTop);
    if (t === 'race') el.innerHTML = this.raceHtml();
    else if (t === 'events') el.innerHTML = this.eventsHtml();
    else if (t === 'growth') el.innerHTML = this.growthHtml();
    else if (t === 'garage') el.innerHTML = this.garageHtml();
    else if (t === 'look') el.innerHTML = this.lookHtml();
    else if (t === 'rules') el.innerHTML = this.rulesHtml();
    el.querySelectorAll('.colBody').forEach((b, i) => (b.scrollTop = tops[i] || 0));
    if (t === 'race') $('btnGo').textContent = `开始${MODES[this.game.rules.mode].name} ▶`;
  }

  raceHtml() {
    const g = this.game;
    const r = g.rules;
    const P = g.profile;
    const m = r.mode;
    // 左栏：玩什么、在哪条赛道上玩
    let html = this.optRow('玩法模式', 'mode', MODE_KEYS.map((k) => [k, `${MODES[k].icon} ${MODES[k].name}`]), m);
    html += `<p class="note modeDesc">${MODES[m].desc}</p>`;
    let tb = `<button class="${r.track === 'random' ? 'on' : ''}" data-k="track" data-v="random">🎲 随机生成</button>`;
    for (const t of TRACKS) {
      const medal = MEDAL[P.data.medals[t.id] || 0];
      if (P.trackUnlocked(t.id)) tb += `<button class="${r.track === t.id ? 'on' : ''}" data-k="track" data-v="${t.id}">${esc(t.name)}${medal}</button>`;
      else {
        const k = CUPS.findIndex((c) => c.tracks.includes(t.id));
        const why = `完成「${CUPS[k - 1].name}」拿到奖杯，或达到 Lv.${CUP_LV[k]} 解锁`;
        tb += `<button class="lock" data-act="locked" data-why="${esc(why)}" title="${esc(why)}">🔒 ${esc(t.name)}</button>`;
      }
    }
    html += `<div class="field"><label>赛道</label><div class="opts">${tb}</div></div>`;
    const def = r.track !== 'random' ? TRACK_MAP[r.track] : null;
    if (def) {
      const best = P.data.best[def.id];
      const [au, ag, cu] = medalTimes(def.length);
      html += `<p class="note trackInfo"><b>${esc(def.name)}</b> · ${THEMES[def.theme].name} · ${(def.length / 1000).toFixed(1)} km<br>${esc(def.desc)}`;
      if (m === 'tt') html += `<br>奖牌线：🥇 ${fmtTime(au)} 🥈 ${fmtTime(ag)} 🥉 ${fmtTime(cu)}${best ? ` · 你的最好成绩 ${fmtTime(best)} ${MEDAL[P.data.medals[def.id] || 0]}` : ''}`;
      html += '</p>';
    } else {
      html += this.optRow('场景', 'theme', [...THEME_KEYS.map((k) => [k, THEMES[k].name]), ['random', '随机']], r.theme);
      html += this.optRow('赛道长度', 'length', Object.keys(LENGTHS).map((k) => [k, LENGTHS[k].name]), r.length);
    }
    // 右栏：对手和赛制
    let set = '';
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
    set += '<p class="note">想拿奖杯和更多奖励？去「赛事」页参加杯赛和挑战。</p>';
    return col('l', '玩法与赛道', '', html) + col('r', '对局设置', '', set);
  }

  eventsHtml() {
    const P = this.game.profile;
    let html = '';
    CUPS.forEach((c, i) => {
      const open = P.cupUnlocked(i);
      const best = P.data.cups[c.id] || 0;
      const names = c.tracks.map((id) => TRACK_MAP[id].name).join(' → ');
      const btn = open
        ? `<button class="btn sm go2" data-act="cup" data-id="${c.id}">参赛 ▶</button>`
        : `<span class="tag lock">🔒 完成「${CUPS[i - 1].name}」或 Lv.${CUP_LV[i]}</span>`;
      html += `<div class="card ${open ? '' : 'locked'}">
        <div class="cardHead"><span class="ic">${c.icon}</span><b>${c.name}</b><span class="tro">${best ? TROPHY[best] + ' ' + TROPHY_NAME[best] : ''}</span>${btn}</div>
        <div class="cardSub">${names} · 对手：${DIFF_NAMES[c.difficulty]}${c.botUp ? `（装备强化 ${c.botUp} 级）` : ''}</div>
        <div class="cardSub">金杯奖励 ❄${c.reward.coins} · ${c.reward.xp} 经验（银杯六成、铜杯四成；首次拿到更好的奖杯再 ×1.5）</div>
      </div>`;
    });
    const done = CHALLENGES.filter((c) => P.data.chal[c.id]).length;
    let chal = '';
    for (const c of CHALLENGES) {
      const open = P.challengeUnlocked(c);
      const ok = !!P.data.chal[c.id];
      const btn = open ? `<button class="btn sm ${ok ? '' : 'go2'}" data-act="chal" data-id="${c.id}">${ok ? '再来' : '挑战'} ▶</button>` : `<span class="tag lock">🔒 Lv.${c.lv}</span>`;
      chal += `<div class="card chal ${open ? '' : 'locked'} ${ok ? 'done' : ''}">
        <div class="cardHead"><span class="ic">${c.icon}</span><b>${c.name}</b><span class="tro">${ok ? '✅' : ''}</span>${btn}</div>
        <div class="cardSub">${esc(c.desc)}</div>
        <div class="cardSub">${MODES[c.mode].icon} ${MODES[c.mode].name} · ${TRACK_MAP[c.track].name} · 奖励 ❄${c.reward.coins} · ${c.reward.xp} 经验</div>
      </div>`;
    }
    return (
      col('l', '杯赛', '三站积分赛，总排名前三拿奖杯', html) +
      col('r', '挑战', `已完成 ${done} / ${CHALLENGES.length} · 重复完成奖励三成`, chal)
    );
  }

  growthHtml() {
    const P = this.game.profile;
    const info = P.levelInfo();
    const titles = P.titles();
    let html = `<div class="lvBox"><div class="lvBig">Lv.${info.lv}</div><div class="lvRest">
      <div class="xpbar big"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div>
      <div class="note" style="margin:4px 0 0">${info.need ? `经验 ${info.cur} / ${info.need}` : '已满级'} · ❄ 雪花币 ${P.coins}</div></div></div>`;
    html += `<div class="field"><label>称号（达成部分成就后解锁，佩戴后显示在资料栏）</label><div class="opts">
      <button class="${!P.data.title ? 'on' : ''}" data-act="title" data-v="">无</button>
      ${titles.map((t) => `<button class="${P.data.title === t ? 'on' : ''}" data-act="title" data-v="${esc(t)}">${esc(t)}</button>`).join('')}
      ${titles.length ? '' : '<span class="note">还没有称号</span>'}</div></div>`;
    const tasks = P.dailyTasks();
    html += `<div class="secTitle">每日任务 <small>每个 +80 经验 ❄60，三个全做完再送 ❄150 · 每天零点刷新</small></div>`;
    html += tasks
      .map((t) => `<div class="task ${t.done ? 'done' : ''}"><span>${t.done ? '✅' : '⬜'} ${t.name}</span><div class="xpbar"><i style="width:${(t.prog / t.goal) * 100}%"></i></div><span class="tp">${t.prog} / ${t.goal}</span></div>`)
      .join('');
    html += '<div class="secTitle">生涯数据</div><div class="statGrid">';
    html += STAT_LABELS.map(([k, label]) => `<div><span>${label}</span><b>${P.data.stats[k] ?? 0}</b></div>`).join('');
    html += '</div>';
    const got = ACHIEVEMENTS.filter((a) => P.data.ach[a.id]).length;
    const ach = ACHIEVEMENTS.map((a) => {
      const done = !!P.data.ach[a.id];
      return `<div class="ach ${done ? 'done' : ''}"><b>${done ? '🏆' : '🔒'} ${a.name}</b><small>${a.desc}</small><span>❄${a.coins}${a.title ? ` · 称号「${a.title}」` : ''}</span></div>`;
    }).join('');
    return col('l', '成长', '', html) + col('r', '成就', `${got} / ${ACHIEVEMENTS.length}`, `<div class="achGrid">${ach}</div>`);
  }

  garageHtml() {
    const g = this.game;
    const P = g.profile;
    const cur = g.look.gear;
    let html = '';
    for (const id of GEAR_KEYS) {
      const G = GEAR[id];
      const key = 'gear:' + id;
      const st = P.unlockState(G.unlock, key);
      const s = gearStats(id, P.up(id));
      const bars = STAT_KEYS.map((k) => {
        const b = (G.stats[k] / STAT_MAX) * 100;
        const e = ((s[k] - G.stats[k]) / STAT_MAX) * 100;
        return `<div class="stat"><span>${STAT_NAMES[k]}</span><div class="bar"><i style="width:${b}%"></i>${e > 0 ? `<em style="left:${b}%;width:${e}%"></em>` : ''}</div><b>${s[k].toFixed(1)}</b></div>`;
      }).join('');
      let btn;
      if (st === 'free' || st === 'owned') btn = id === cur ? '<span class="tag on">使用中</span>' : `<button class="btn sm" data-k="look.gear" data-v="${id}">选用</button>`;
      else if (st === 'buy') btn = this.buyBtn(key, 'gear', id, '购买', G.unlock.cost, 'btn sm');
      else btn = `<span class="tag lock">🔒 ${this.lockWhy(G.unlock)}</span>`;
      html += `<div class="card gcard ${id === cur ? 'on' : ''}"><div class="cardHead"><span class="ic">${G.icon}</span><b>${G.name}</b><span class="tro"></span>${btn}</div><div class="cardSub">${G.desc}</div>${bars}</div>`;
    }
    const G = GEAR[cur];
    const up = P.up(cur);
    let ups = '';
    for (const k of UP_KEYS) {
      const U = UPGRADES[k];
      const lv = up[k];
      const cost = P.upgradeCost(cur, k);
      const pips = Array.from({ length: UP_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const btn = lv >= UP_MAX ? '<span class="tag on">已满级</span>' : `<button class="btn sm ${P.coins < cost ? 'poor' : ''}" data-act="up" data-line="${k}">强化 ❄${cost}</button>`;
      ups += `<div class="uprow"><div class="un"><b>${U.name}</b><small>${U.desc}</small></div><div class="pips">${pips}</div>${btn}</div>`;
    }
    return (
      col('l', '滑行装备', '属性会真实影响手感；强化只作用于对应的装备', html) +
      col('r', `强化：${G.icon} ${G.name}`, `每条最多 ${UP_MAX} 级`, ups)
    );
  }

  lookHtml() {
    const g = this.game;
    const L = g.look;
    const sw = (list) => list.map((c) => [c, '', `background:${hex(c)}`]);
    let html = this.lockRow('发型 / 帽子', 'hat', HATS.map((h, i) => ({ name: h, unlock: HAT_UNLOCK[i] })), L.hat | 0, (i) => 'hat:' + i);
    html +=
      this.optRow('帽子 / 头发颜色', 'look.hatColor', sw([...SUIT_COLORS, 0x2a1a12, 0x7ad21f]), L.hatColor, 'sw') +
      this.optRow('肤色', 'look.skin', sw(SKINS), L.skin, 'sw') +
      this.optRow('上衣', 'look.jacket', sw(SUIT_COLORS), L.jacket, 'sw') +
      this.optRow('条纹 / 袖口', 'look.stripe', sw(SUIT_COLORS), L.stripe, 'sw') +
      this.optRow('裤子', 'look.pants', sw(SUIT_COLORS), L.pants, 'sw') +
      this.optRow('板子 / 雪橇颜色', 'look.ski', sw(SUIT_COLORS), L.ski, 'sw') +
      this.optRow('胡子', 'look.mustache', [[false, '无'], [true, '有']], L.mustache);
    let acc = '';
    for (const slot in COSMETIC_SLOTS) {
      const S = COSMETIC_SLOTS[slot];
      acc += this.lockRow(S.name, slot, S.list, L[slot] | 0, (i) => `${slot}:${i}`);
    }
    acc += '<p class="note">🔒 的部件升级或达成成就后解锁；标着 ❄ 的用雪花币购买（点两下确认）。滑行装备在「车库」里换。</p>';
    return col('l', '造型与配色', '', html) + col('r', '饰品', '', acc);
  }

  rulesHtml() {
    const r = this.game.rules;
    const wp = WEAPON_KEYS.map((k) => `<button class="wp ${r.banned.includes(k) ? 'off' : ''}" data-ban="${k}">${WEAPONS[k].icon} ${WEAPONS[k].name}</button>`).join('');
    const set =
      '<p class="note" style="margin-top:0">这里的设置只用于「比赛」页的快速赛；杯赛、挑战和联机有各自固定的规则。竞速赛、特技赛、计时赛不刷道具。</p>' +
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
    if (act === 'cup') return g.startCup(b.dataset.id);
    if (act === 'chal') return g.startChallenge(b.dataset.id);
    if (act === 'title') {
      P.setTitle(b.dataset.v);
      this.refreshProfile();
      this.renderTab('growth');
      return;
    }
    if (act === 'up') {
      const line = b.dataset.line;
      const cost = P.upgradeCost(g.look.gear, line);
      if (P.coins < cost) {
        this.toast(`雪花币不够（需要 ❄${cost}，你有 ❄${P.coins}）`, true);
        return;
      }
      if (P.upgrade(g.look.gear, line)) {
        const ach = P.checkAch();
        this.toast(`${UPGRADES[line].name} 升到 ${P.up(g.look.gear)[line]} 级！${ach.length ? ` 🏆 达成成就「${ach.map((a) => a.name).join('」「')}」` : ''}`);
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
    } else g.setRule(k, v);
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
    $('profileBar').innerHTML =
      `<span class="lv">Lv.${info.lv}</span>${P.data.title ? `<span class="ttl">${esc(P.data.title)}</span>` : ''}` +
      `<div class="xpbar"><i style="width:${pct}%"></i></div><span class="xp">${info.need ? `${info.cur}/${info.need}` : 'MAX'}</span>` +
      `<span class="coin">❄ ${P.coins}</span>`;
  }

  showMenu(b) {
    $('menu').classList.toggle('hidden', !b);
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
      const m = $('menuMid').getBoundingClientRect();
      l = m.left;
      r = m.right;
      t = m.top;
      b = $('goWrap').classList.contains('hidden') ? m.bottom : $('goWrap').getBoundingClientRect().top;
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
    if (g.net.active) return `联机 · ${THEMES[g.themeKey].name}`;
    const s = g.session;
    const where = g.trackDef ? g.trackDef.name : THEMES[g.themeKey].name;
    if (s.kind === 'cup') {
      const c = CUP_MAP[s.cup];
      return `${c.icon} ${c.name} 第 ${s.raceIdx + 1} / 3 站 · ${where}`;
    }
    if (s.kind === 'challenge') {
      const c = CHALLENGE_MAP[s.chal];
      return `${c.icon} 挑战：${c.name} · ${where}`;
    }
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

  // 特技赛得分弹字
  trickPop(text, combo) {
    const el = $('trickPop');
    el.innerHTML = `<div>${esc(text)}</div>${combo > 1 ? `<small>连击 ×${combo}</small>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.popT = 1.3;
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
