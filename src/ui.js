// DOM 界面：大厅菜单、HUD、结算、暂停
import { THEMES, THEME_KEYS, LENGTHS, WEAPONS, WEAPON_KEYS, SKINS, SUIT_COLORS, HATS, POINTS, MODES, MODE_KEYS } from './config.js';
import { GEAR, GEAR_KEYS, RARITY, RARITY_KEYS, STAT_NAMES, STAT_KEYS, STAT_MAX, UPGRADES, UP_KEYS, UP_MAX, HAT_UNLOCK, COSMETIC_SLOTS, gearStats } from './gear.js';
import { TRACKS, TRACK_MAP, CUPS, CHALLENGES, CHALLENGE_MAP, CUP_MAP, TROPHY, TROPHY_NAME, medalTimes } from './tracks.js';
import { ACHIEVEMENTS, ACH_MAP, STAT_LABELS, CUP_LV } from './profile.js';
import { TEAM_COLORS } from './modes.js';
import { CHAIN_T, MULT_MAX } from './chain.js';
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
    for (const t of TABS) if (t !== 'keys') $('tab-' + t).addEventListener('click', (e) => this.onMenuClick(e));
    for (const t in SHOW) this.bindDrag($('tab-' + t));
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
    if (tab !== this.tab) {
      this.pendingBuy = null;
      this.viewGear = null;
    }
    this.tab = tab;
    for (const x of $('tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
    for (const t of TABS) $('tab-' + t).classList.toggle('hidden', t !== tab);
    if (tab !== 'keys') this.renderTab(tab);
    // 赛事页每张卡片有自己的开始按钮；展厅页中间要留给角色
    $('goWrap').classList.toggle('hidden', tab === 'events' || !!SHOW[tab]);
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
  showHtml(tab, head, tags, body, extra = '', act = '') {
    const cur = this.sub[tab];
    const nav = SHOW[tab].subs.map(([k, name, en]) => `<button class="${k === cur ? 'on' : ''}" data-sub="${k}"><b>${name}</b><i>${en}</i></button>`).join('');
    return `<div class="sdrag" title="按住左右拖动，可以转动角色"></div><nav class="snav">${nav}</nav>${extra}
      <div class="sright"><section class="sinfo">
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
    const tasks = P.dailyTasks();
    const got = ACHIEVEMENTS.filter((a) => P.data.ach[a.id]).length;
    const sub = this.sub.growth;
    let body;
    if (sub === 'ach') {
      body = `<div class="ssec">成就<small>${got} / ${ACHIEVEMENTS.length}</small></div><div class="achGrid">`;
      body += ACHIEVEMENTS.map((a) => {
        const done = !!P.data.ach[a.id];
        return `<div class="ach ${done ? 'done' : ''}"><b>${done ? '🏆' : '🔒'} ${a.name}</b><small>${a.desc}</small><span>❄${a.coins}${a.title ? ` · 称号「${a.title}」` : ''}</span></div>`;
      }).join('');
      body += '</div>';
    } else if (sub === 'stats') {
      body = '<div class="ssec">生涯数据</div><div class="statGrid">';
      body += STAT_LABELS.map(([k, label]) => `<div><span>${label}</span><b>${(P.data.stats[k] ?? 0).toLocaleString()}</b></div>`).join('');
      body += '</div>';
    } else {
      body = `<div class="ssec">称号<small>达成部分成就后解锁</small></div><div class="field"><div class="opts">
        <button class="${!P.data.title ? 'on' : ''}" data-act="title" data-v="">无</button>
        ${titles.map((t) => `<button class="${P.data.title === t ? 'on' : ''}" data-act="title" data-v="${esc(t)}">${esc(t)}</button>`).join('')}
        ${titles.length ? '' : '<span class="note">还没有称号</span>'}</div></div>`;
      body += '<div class="ssec">每日任务<small>每天零点刷新</small></div>';
      body += tasks
        .map((t) => `<div class="task ${t.done ? 'done' : ''}"><span>${t.done ? '✅' : '⬜'} ${t.name}</span><div class="xpbar"><i style="width:${(t.prog / t.goal) * 100}%"></i></div><span class="tp">${t.prog.toLocaleString()} / ${t.goal.toLocaleString()}</span></div>`)
        .join('');
      body += '<p class="note">每个任务 +80 经验 ❄60，三个全做完再送 ❄150。</p>';
    }
    const head = {
      badge: `<small>Lv</small>${info.lv}`,
      small: P.data.title ? `称号「${esc(P.data.title)}」` : '还没佩戴称号',
      name: esc(this.game.playerName || '我的档案'),
      side: `❄ ${P.coins.toLocaleString()}`,
      bar: `<div class="sxp"><div class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div><span>${info.need ? `经验 ${info.cur} / ${info.need}` : '已满级'}</span></div>`,
    };
    const tags = [
      [`成就 ${got} / ${ACHIEVEMENTS.length}`, 'warm'],
      [`今日任务 ${tasks.filter((t) => t.done).length} / ${tasks.length}`, ''],
      [`${P.data.stats.races} 场比赛`, ''],
    ];
    return this.showHtml('growth', head, tags, body);
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
      if (SHOW[this.tab]) {
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
