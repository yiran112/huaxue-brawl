// 任务面板（首页「每日任务」点开的那一层）和「成长」页三个子页的内容。样式在 quest.css。
import './quest.css';
import { ACHIEVEMENTS, STAT_LABELS, MAX_LV, TASK_XP, TASK_COINS, TASK_BONUS, seasonNow, seasonLeftText, seasonReward, blankSeason } from './profile.js';
import { TRACK_MAP } from './tracks.js';
import { RANK_LV } from './rank.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (n) => (Number(n) || 0).toLocaleString();
// 大数字放进小格子：十万以上写成「12.3万」
const short = (n) => {
  n = Number(n) || 0;
  return n >= 100000 ? `${(n / 10000).toFixed(n >= 1e6 ? 0 : 1)}万` : n.toLocaleString();
};

// 每日任务：图标 + 一句怎么做
const TASK_META = {
  race3: ['🏁', '什么模式都行，打完一场算一次'],
  hit5: ['💥', '比赛里用道具把对手打飞'],
  flip10: ['🤸', '腾空时按住 空格 / E 后空翻，Q 前空翻'],
  drift8: ['💨', 'Shift + 方向漂移，蓄满后松开喷射'],
  short2: ['🧱', '收到 100 km/h 以下，连漂两个弯钻进石墙窄口'],
  podium2: ['🏅', '至少 3 人参赛，完赛并进入前三'],
  win1: ['🥇', '至少 4 人参赛，拿下第一名'],
  modes2: ['🎮', '今天玩过两种不同的玩法'],
  pad6: ['⏩', '冲过地上闪着箭头的加速带'],
  cup1: ['🏅', '在首页打开「排位赛」，打完一场'],
  chain4: ['🔗', '一招接一招，把倍率叠到 ×4 再结算'],
  skill20k: ['✨', '今天各场比赛的技巧分加在一起'],
  spin5: ['🌪️', '腾空时 Shift + A / D 转体'],
  grab5: ['✋', '腾空时按住 S 抓板，落地前松开'],
};
// 任务按统计字段分成四类：[名字, 配色]
const TASK_KIND = {
  races: ['比赛', 'g'], podiums: ['比赛', 'g'], wins: ['比赛', 'g'], modes: ['比赛', 'g'], cupRaces: ['比赛', 'g'],
  hits: ['对抗', 'r'],
  flips: ['技巧', 'p'], spins: ['技巧', 'p'], grabs: ['技巧', 'p'], chain4: ['技巧', 'p'], skill: ['技巧', 'p'],
  driftBoosts: ['滑行', 'b'], shortcuts: ['滑行', 'b'], pads: ['滑行', 'b'],
};
const taskMeta = (t) => {
  const m = TASK_META[t.id] || ['📋', ''];
  const k = TASK_KIND[t.key] || ['任务', 'b'];
  return { icon: m[0], tip: m[1], kind: k[0], tone: k[1] };
};

// 离每日任务刷新（本地零点）还有多久
function dailyLeft() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const min = Math.max(1, Math.ceil((next - now) / 60000));
  const h = Math.floor(min / 60);
  return `${h ? `${h} 小时 ` : ''}${min % 60} 分钟`;
}

// 一条任务 / 榜单。pct = null 时不画进度条
function row({ icon, tone, kind, name, desc, pct = null, label = '', pill = '', sub = '', done = false }) {
  const bar = pct === null ? (label ? `<div class="qval">${label}</div>` : '') : `<div class="qbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i><span>${label}</span></div>`;
  return `<div class="qrow ${done ? 'done' : ''}">
    <span class="qic ${tone}">${icon}</span>
    <div class="qmain"><div class="qnm"><i class="qtag ${tone}">${kind}</i><b>${name}</b></div>${desc ? `<small>${desc}</small>` : ''}${bar}</div>
    <div class="qside">${pill ? `<span class="qpill">${pill}</span>` : ''}${sub}</div>
  </div>`;
}

// 卡片头上那条进度：nodes = [[文字, 亮不亮]]
function track(nodes) {
  const lit = nodes.filter((n) => n[1]).length;
  const fill = lit ? ((lit - 1) / (nodes.length - 1)) * 100 : 0;
  return `<div class="qtrack"><s><i style="width:${fill}%"></i></s>${nodes.map(([t, on], i) => `<em class="${on ? 'on' : ''} ${i === nodes.length - 1 ? 'end' : ''}">${t}</em>`).join('')}</div>`;
}

export class Quest {
  constructor(ui) {
    this.ui = ui;
    this.date = '';
    const el = (this.el = document.createElement('div'));
    el.id = 'quest';
    el.className = 'quest hidden';
    $('menu').appendChild(el);
    el.addEventListener('click', (e) => this.onClick(e));
    // Esc 先关这一层，不再往下传（否则比赛页会跟着退一层）
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.isOpen) return;
        const acc = $('account');
        if (acc && !acc.classList.contains('hidden')) return;
        e.preventDefault();
        e.stopPropagation();
        this.close();
      },
      true,
    );
    // 倒计时；过了零点任务换了就整个重画
    setInterval(() => {
      if (!this.isOpen) return;
      const P = this.ui.game.profile;
      P.dailyTasks();
      if (P.data.daily.date !== this.date) return this.render();
      for (const x of this.el.querySelectorAll('.qcd')) x.textContent = `${dailyLeft()}后刷新`;
      for (const x of this.el.querySelectorAll('.qscd')) x.textContent = seasonLeftText(seasonNow().left);
    }, 20000);
  }

  get isOpen() {
    return !this.el.classList.contains('hidden') && !$('menu').classList.contains('hidden');
  }

  open() {
    this.render();
    this.el.classList.remove('hidden');
    // 榜单还没拉到（比如直接从成长页点进来）：拉一次，回来再补上名次
    const ui = this.ui;
    if (ui.boardRows === null && typeof ui.loadBoard === 'function') {
      Promise.resolve(ui.loadBoard()).then(
        () => this.isOpen && this.render(),
        () => {},
      );
    }
  }

  close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  onClick(e) {
    const ui = this.ui;
    const b = e.target.closest('button');
    if (!b) {
      // 点卡片外面的空地也算关闭
      if (e.target === this.el || e.target.classList.contains('qgrid')) this.close();
      return;
    }
    const act = b.dataset.act;
    if (act === 'close') return this.close();
    if (act === 'go') {
      this.close();
      if (ui.tab !== 'race') ui.openTab('race');
      return;
    }
    if (act === 'rank') {
      this.close();
      if (!ui.game.profile.rankOpen()) {
        ui.toast(`排位赛 Lv.${RANK_LV} 开启`, true);
        return;
      }
      ui.racePick = 'rank';
      ui.openTab('race');
      return;
    }
    if (act === 'board') {
      this.close();
      ui.board = b.dataset.id || 'points';
      ui.boardFull = false;
      ui.boardRules = false;
      ui.openTab('race');
    }
  }

  render() {
    const tops = [...this.el.querySelectorAll('.qbody')].map((x) => x.scrollTop);
    const P = this.ui.game.profile;
    this.el.innerHTML = `<header class="qtop">
        <button class="qback" data-act="close"><kbd>Esc</kbd>返回</button>
        <div class="qtitle"><span><b>任务</b><small>每天回来看看 · 本地时间 0 点刷新</small></span></div>
        <div class="qcoin">❄ <b>${num(P.coins)}</b></div>
      </header>
      <div class="qgrid">${this.dayHtml()}${this.weekHtml()}${this.nextHtml()}</div>`;
    this.el.querySelectorAll('.qbody').forEach((x, i) => (x.scrollTop = tops[i] || 0));
    this.date = P.data.daily.date;
  }

  // 今天：三个每日任务 + 全部做完的额外奖励
  dayHtml() {
    const P = this.ui.game.profile;
    const tasks = P.dailyTasks();
    const done = tasks.filter((t) => t.done).length;
    const bonus = P.dailyBonusDone;
    const rows = tasks
      .map((t) => {
        const m = taskMeta(t);
        const prog = Math.min(t.prog, t.goal);
        return row({
          icon: m.icon,
          tone: m.tone,
          kind: m.kind,
          name: esc(t.name),
          desc: esc(m.tip),
          pct: (prog / t.goal) * 100,
          label: `${num(prog)} / ${num(t.goal)}`,
          pill: `❄ +${TASK_COINS}`,
          sub: `<small>+${TASK_XP} 经验</small><span class="qst ${t.done ? 'ok' : ''}">${t.done ? '✔ 已到账' : '进行中'}</span>`,
          done: t.done,
        });
      })
      .join('');
    const all = done === tasks.length;
    const needCup = tasks.some((t) => !t.done && t.key === 'cupRaces');
    return `<section class="qcard day">
      <header class="qhead"><small>每日任务</small><b>今天</b><span class="qcd">${dailyLeft()}后刷新</span><i class="qchip">已完成 ${done} / ${tasks.length}</i>
        ${track([...tasks.map((t, i) => [i + 1, i < done]), ['🎁', bonus]])}
      </header>
      <div class="qbody">${rows}
        <div class="qbox ${bonus ? 'got' : ''}">
          <div class="qboxHead"><span class="qlock">${bonus ? '🎁' : '🔒'}</span><div><b>全勤奖励</b><small>${bonus ? '今天的三个任务都做完了，奖励已到账' : `做完全部三个任务自动发放 · ${done} / ${tasks.length}`}</small></div></div>
          <div class="qtiles">
            <div class="qtile"><span>❄</span><b>+${TASK_BONUS}</b><small>雪花币</small></div>
            <div class="qtile dim"><span>📋</span><b>+${TASK_XP * tasks.length}</b><small>任务经验</small></div>
            <div class="qtile dim"><span>❄</span><b>+${TASK_COINS * tasks.length}</b><small>任务雪花币</small></div>
            ${all ? '' : `<button class="qgo" data-act="${needCup ? 'rank' : 'go'}">${needCup ? '去排位' : '去比赛'} ▶</button>`}
          </div>
        </div>
      </div>
    </section>`;
  }

  // 本周：赛季积分、击飞、计时三张榜上自己的成绩，和按积分榜名次发的奖励
  weekHtml() {
    const ui = this.ui;
    const P = ui.game.profile;
    const now = seasonNow();
    const mine = P.data.season && P.data.season.id === now.id ? P.data.season : blankSeason(now.id);
    const online = Array.isArray(ui.boardRows) && typeof ui.boardEntries === 'function';
    const all = online ? ui.boardEntries() : [];
    const rankOf = (key) => {
      const val = (r) => (key === 'tt' ? r.tt || 0 : r[key] | 0);
      const list = all
        .filter((r) => val(r) > 0)
        .sort((a, b) => (key === 'tt' ? a.tt - b.tt || a.ttTime - b.ttTime : val(b) - val(a) || String(a.name).localeCompare(String(b.name), 'zh')));
      const i = list.findIndex((r) => r.me);
      return { list, rank: i >= 0 ? i + 1 : 0 };
    };
    const rankText = (r) => (!online ? '离线' : r.rank ? `第 ${r.rank} 名` : '未上榜');
    const see = (id) => `<button class="qsee" data-act="board" data-id="${id}">看榜单 ›</button>`;

    // 积分：离下一档奖励还差多少
    const pts = mine.points | 0;
    const pr = rankOf('points');
    let pct = null;
    let label = `${num(pts)} 分`;
    if (online) {
      const tier = pr.rank ? [50, 10, 3, 1].find((t) => t < pr.rank) : 50;
      const at = tier && pr.list[tier - 1];
      if (pr.rank === 1) {
        pct = 100;
        label = `${num(pts)} 分 · 守住第 1 名`;
      } else if (at) {
        const need = (at.points | 0) + 1;
        pct = (pts / need) * 100;
        label = `${num(pts)} / ${num(need)} · 超过第 ${tier} 名`;
      } else if (!pr.rank) {
        pct = 0;
        label = '拿到积分就能上榜';
      } else {
        pct = 100;
        label = `${num(pts)} 分`;
      }
    }
    const reward = seasonReward(pr.rank);
    const hits = mine.hits | 0;
    const hr = rankOf('hits');
    const topHits = hr.list.length ? hr.list[0].hits | 0 : 0;
    const tr = rankOf('tt');
    const ttTrack = TRACK_MAP[mine.ttTrack];
    const rows =
      row({
        icon: '🏅',
        tone: 'p',
        kind: '积分榜',
        name: '赛季积分',
        desc: '快速赛、联机赛（至少 4 人，普通或困难）完赛按名次计分',
        pct,
        label,
        pill: rankText(pr),
        sub: `<small>${online && pr.rank ? (reward ? `当前可得 ❄${reward}` : '50 名以内才有奖励') : ''}</small>${see('points')}`,
      }) +
      row({
        icon: '💥',
        tone: 'r',
        kind: '击飞榜',
        name: '本周击飞',
        desc: '上面这些比赛里击飞对手的次数，只排名',
        pct: online && topHits ? (hits / topHits) * 100 : null,
        label: online && topHits ? `${num(hits)} 次 · 第 1 名 ${num(topHits)} 次` : `${num(hits)} 次`,
        pill: rankText(hr),
        sub: see('hits'),
      }) +
      row({
        icon: '⏱️',
        tone: 'b',
        kind: '计时榜',
        name: '计时赛最好成绩',
        desc: '固定赛道的计时赛，比的是用时 ÷ 金牌时间',
        pct: mine.tt ? (1 / mine.tt) * 100 : null,
        label: mine.tt ? `${fmtTime(mine.ttTime)} · ${ttTrack ? esc(ttTrack.name) : '固定赛道'} · 金牌时间的 ${mine.tt.toFixed(2)} 倍` : '本周还没有成绩',
        pill: rankText(tr),
        sub: see('tt'),
      });
    const tiers = [[1, 1, '第 1 名'], [3, 2, '第 2–3 名'], [10, 4, '第 4–10 名'], [50, 11, '第 11–50 名']];
    const cur = pr.rank ? tiers.find(([hi]) => pr.rank <= hi) : null;
    const tiles = tiers
      .map((t) => `<div class="qtile ${cur === t ? 'cur' : ''}"><span>${t[0] === 1 ? '👑' : '❄'}</span><b>+${seasonReward(t[1])}</b><small>${t[2]}</small></div>`)
      .join('');
    return `<section class="qcard week">
      <header class="qhead"><small>第 ${now.id} 赛季</small><b>本周</b><span class="qscd">${seasonLeftText(now.left)}</span><i class="qchip">我的积分 ${num(pts)}</i>
        ${track([['前 50', pr.rank > 0 && pr.rank <= 50], ['前 10', pr.rank > 0 && pr.rank <= 10], ['前 3', pr.rank > 0 && pr.rank <= 3], ['👑', pr.rank === 1]])}
      </header>
      <div class="qbody">${rows}
        <div class="qbox">
          <div class="qboxHead"><span class="qlock">🏆</span><div><b>赛季奖励</b><small>按积分榜名次，每周一 0 点（北京时间）换季后联网发放</small></div></div>
          <div class="qtiles">${tiles}</div>
        </div>
      </div>
    </section>`;
  }

  // 明天：任务只由日期决定，可以提前看
  nextHtml() {
    const P = this.ui.game.profile;
    const next = typeof P.dailyPreview === 'function' ? P.dailyPreview() : [];
    const items = next
      .map((t) => {
        const m = taskMeta(t);
        return `<div class="qitem"><span class="qic sm ${m.tone}">${m.icon}</span><div><b>${esc(t.name)}</b><small>${esc(m.tip)}</small></div></div>`;
      })
      .join('');
    const rule = (icon, title, text) => `<div class="qitem"><span class="qic sm n">${icon}</span><div><b>${title}</b><small>${text}</small></div></div>`;
    return `<section class="qcard next">
      <header class="qhead"><small>提前看看</small><b>明天</b><span class="qcd">${dailyLeft()}后刷新</span></header>
      <div class="qbody">${items}
        <div class="qsep">怎么算</div>
        ${rule('❄', `每个任务 ❄${TASK_COINS} + ${TASK_XP} 经验`, '进度在每场比赛结算时累加')}
        ${rule('🎁', `全部做完再送 ❄${TASK_BONUS}`, '一天一次')}
        ${rule('📬', '奖励自动到账', '不用手动领取，结算页会列出来')}
        <p class="qnote">没做完的任务不会留到第二天。</p>
      </div>
    </section>`;
  }
}

// ---------- 成长页 ----------
// 返回 { head, tags, body, extra, cls }，交给 UI.showHtml 拼进展厅页的骨架
export function growthView(ui) {
  const P = ui.game.profile;
  const sub = ui.sub.growth;
  if (sub === 'ach') return achView(P);
  if (sub === 'stats') return statsView(P);
  return homeView(ui, P);
}

// 总览：右边是档案（等级、称号、等级奖励），角色脚下一排生涯数字。每日任务只在首页的任务面板里看
function homeView(ui, P) {
  const info = P.levelInfo();
  const titles = P.titles();
  const tasks = P.dailyTasks();
  const done = tasks.filter((t) => t.done).length;
  const got = ACHIEVEMENTS.filter((a) => P.data.ach[a.id]).length;
  const s = P.data.stats;
  let body = `<div class="ssec">称号<small>达成部分成就后解锁</small></div><div class="field"><div class="opts">
    <button class="${!P.data.title ? 'on' : ''}" data-act="title" data-v="">无</button>
    ${titles.map((t) => `<button class="${P.data.title === t ? 'on' : ''}" data-act="title" data-v="${esc(t)}">${esc(t)}</button>`).join('')}
    ${titles.length ? '' : '<span class="note">还没有称号</span>'}</div></div>`;
  // 下一个有东西可解锁的等级
  for (let lv = info.lv + 1; lv <= MAX_LV; lv++) {
    const u = P.unlocksBetween(lv - 1, lv);
    if (!u.length) continue;
    body += `<div class="ssec">等级奖励<small>下一个在 Lv.${lv}</small></div>
      <div class="strait"><span class="ic">🔓</span><p>${u.slice(0, 4).map(esc).join('、')}${u.length > 4 ? ` 等 ${u.length} 样` : ''}</p></div>`;
    break;
  }
  const head = {
    badge: `<small>Lv</small>${info.lv}`,
    small: P.data.title ? `称号「${esc(P.data.title)}」` : '还没佩戴称号',
    name: esc(ui.game.playerName || '我的档案'),
    side: `❄ ${num(P.coins)}`,
    bar: `<div class="sxp"><div class="xpbar"><i style="width:${info.need ? (info.cur / info.need) * 100 : 100}%"></i></div><span>${info.need ? `经验 ${info.cur} / ${info.need}` : '已满级'}</span></div>`,
  };
  const tags = [
    [`成就 ${got} / ${ACHIEVEMENTS.length}`, 'warm'],
    [`今日任务 ${done} / ${tasks.length}`, ''],
  ];
  const rv = P.rankView();
  const strip = [
    ['🏁', short(s.races), '比赛'],
    ['🥇', short(s.wins), '冠军'],
    ['🏅', short(s.podiums), '前三名'],
    ['💥', short(s.hits), '击飞'],
    ['🚀', short(s.maxSpeed), '最高时速'],
    ['🎖️', rv.name, '段位'],
  ];
  const extra = `<div class="spick gstrip">${strip.map(([ic, v, name]) => `<div class="gs"><span>${ic}</span><b>${v}</b><small>${name}</small></div>`).join('')}</div>`;
  return { head, tags, body, extra, cls: '' };
}

// 成就：一整块宽面板，角色让到左边
function achView(P) {
  const total = ACHIEVEMENTS.length;
  const done = ACHIEVEMENTS.filter((a) => P.data.ach[a.id]);
  const got = done.length;
  const coins = done.reduce((n, a) => n + (a.coins || 0), 0);
  const allCoins = ACHIEVEMENTS.reduce((n, a) => n + (a.coins || 0), 0);
  const titleAll = ACHIEVEMENTS.filter((a) => a.title).length;
  const cards = ACHIEVEMENTS.map((a) => {
    const ok = !!P.data.ach[a.id];
    return `<div class="gach ${ok ? 'done' : ''}"><span class="gic">${ok ? '🏆' : '🔒'}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><em>❄${a.coins}${a.title ? ` · 称号「${esc(a.title)}」` : ''}</em></div></div>`;
  }).join('');
  const head = {
    badge: '🏆',
    small: '成就 · 达成时自动发放雪花币',
    name: `${got} <i>/ ${total}</i>`,
    side: `已拿到 <b>❄ ${num(coins)}</b>`,
    bar: `<div class="sxp"><div class="xpbar"><i style="width:${(got / total) * 100}%"></i></div><span>${Math.round((got / total) * 100)}%</span></div>`,
  };
  const tags = [
    [`称号 ${P.titles().length} / ${titleAll}`, 'warm'],
    [`还有 ${total - got} 个没达成`, ''],
    [`剩余奖励 ❄${num(allCoins - coins)}`, ''],
  ];
  return { head, tags, body: `<div class="gachs">${cards}</div>`, extra: '', cls: 'wide' };
}

// 生涯：数字分组排成大格子
const STAT_ICON = {
  races: '🏁', wins: '🥇', podiums: '🏅', hits: '💥', knocked: '😵', playTime: '⏱️', coinsEarned: '❄',
  flips: '🤸', maxFlip: '🌀', spins: '🌪️', grabs: '✋', skill: '✨', bestChain: '🔗', bestMult: '✖️',
  driftBoosts: '💨', shortcuts: '🧱', pads: '⏩', maxSpeed: '🚀', maxAir: '☁️',
};
const STAT_GROUPS = [
  ['比赛', 'RACES', ['races', 'wins', 'podiums', 'playTime', 'coinsEarned']],
  ['对抗与滑行', 'ACTION', ['hits', 'knocked', 'driftBoosts', 'shortcuts', 'pads']],
  ['技巧', 'TRICKS', ['flips', 'spins', 'grabs', 'skill']],
  ['个人纪录', 'BESTS', ['maxSpeed', 'maxAir', 'maxFlip', 'bestChain', 'bestMult']],
];

function statsView(P) {
  const s = P.data.stats;
  const label = Object.fromEntries(STAT_LABELS);
  const used = new Set();
  const tile = (k) => {
    used.add(k);
    return `<div class="gst"><span>${STAT_ICON[k] || '📊'}</span><b>${num(s[k] ?? 0)}</b><small>${esc(label[k])}</small></div>`;
  };
  let body = '';
  for (const [name, en, keys] of STAT_GROUPS) {
    const list = keys.filter((k) => label[k]);
    if (list.length) body += `<div class="ssec">${name}<small>${en}</small></div><div class="gsts">${list.map(tile).join('')}</div>`;
  }
  // 以后新加的统计项，没归类的放在最后
  const rest = STAT_LABELS.map(([k]) => k).filter((k) => !used.has(k));
  if (rest.length) body += `<div class="ssec">其他<small>MORE</small></div><div class="gsts">${rest.map(tile).join('')}</div>`;
  const rv = P.rankView();
  const rs = P.rankState();
  const head = {
    badge: '📊',
    small: '生涯数据 · 每场比赛结算时累计',
    name: `${num(s.races)} <i>场比赛</i>`,
    side: `比赛总时长 <b>${num(s.playTime)}</b> 分钟`,
    bar: '',
  };
  const tags = [
    [`冠军 ${num(s.wins)}`, 'warm'],
    [`前三名 ${num(s.podiums)}`, ''],
    [`段位 ${rv.name}`, ''],
    [`排位 ${num(rs.wins)} 胜 / ${num(rs.games)} 场`, ''],
  ];
  return { head, tags, body, extra: '', cls: 'wide' };
}
