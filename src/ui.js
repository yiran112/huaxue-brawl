// DOM 界面：大厅菜单。匹配、积分榜、商城、比赛 HUD、结算分在 ui/ 下，方法都挂在这个 UI 上
import { THEMES, THEME_KEYS, LENGTHS, WEAPONS, WEAPON_KEYS, POINTS, MODES, MODE_KEYS } from './config.js';
import { rarityToken } from './icon-art.js';
import { GEAR, GEAR_KEYS, RARITY, STAT_NAMES, STAT_KEYS, STAT_MAX, UPGRADES, UP_KEYS, UP_MAX, BOX_COST, gearStats, unlockOf } from './gear.js';
import { TRACKS, TRACK_MAP, CUPS, CUP_MAP, PRACTICE_SECONDS, medalTimes } from './tracks.js';
import { ACH_MAP, CUP_LV, seasonNow, rankSeasonNow, seasonLeftText } from './profile.js';
import { RANK_LV } from './rank.js';
import { fmtTime } from './util.js';
import { bindLevelRewards, Quest, growthView } from './quest.js';
import { pageTop } from './ui/page-top.js';
import { matchMethods } from './ui/matching.js';
import { boardMethods } from './ui/board.js';
import { shopMethods } from './ui/shop.js';
import { hudMethods } from './ui/hud.js';
import { resultsMethods } from './ui/results.js';
import { FEAT, trackFeats, trackArt } from './ui/trackArt.js';
import { tuneHtml } from './ui/tune.js';
import { $, esc, SHOW, cosmeticOf, THEME_ICON, MODE_STYLE } from './ui/common.js';
import { previewWardrobe, wardrobeState } from './ui/appearance.js';
import { wardrobeMethods } from './ui/wardrobe.js';
import { rankedMethods } from './ui/ranked.js';
import { garageCatalogMethods } from './ui/garage-catalog.js';
import { garageStep } from './ui/garage-catalog-state.js';
import { applyGameIcons, setGameHtml, setGameText } from './ui/web-icons.js';
export { esc } from './ui/common.js';

const TABS = ['race', 'growth', 'garage', 'shop', 'look', 'set'];
// 首页之外每个界面顶栏上的标题。比赛页里点开的几层按 racePick 区分
const PAGE_TITLE = { growth: '成长', garage: '车库', shop: '商城', look: '装扮', set: '设置' };
const RACE_TITLE = { track: '赛道大厅', hall: '开房间', room: '创建房间', rank: '排位赛' };
const DIFF_NAMES = ['简单', '普通', '困难'];
const MEDAL = ['', '🥉', '🥈', '🥇'];
const BACK_BUTTONS = '[data-act="back"], [data-act="achClose"], [data-acc="close"], .qpX, #btnLobby, #btnQuit, #btnSkip, #skipDeparture';
const CONFIRM_BUTTONS = '[data-acc], .confirm, .btn.go, .rbtn.main, .hready, .wardrobe-primary, .ranked-play, [data-act="practice"], [data-act="boxWear"], [data-act="boxFxOk"]';
const SELECT_BUTTONS = '[data-k], [data-tab], [data-sub], [data-pane], [data-ban], .tcard, .mcard, .scard, .wardrobe-tile, .wardrobe-nav button, .garage-tile, .ranked-modes button';

// 设置页左边的分类：[key, 图标, 名字, 英文小字]
const SET_CATS = [
  ['match', '🎮', '对局', 'MATCH'],
  ['items', '🎁', '道具', 'ITEMS'],
  ['video', '🖥️', '画面声音', 'VIDEO & SOUND'],
  ['keys', '⌨️', '操作', 'CONTROLS'],
  ['guide', '📖', '玩法说明', 'GUIDE'],
];
const KEYS_HTML = `<div class="keys">
  <div><kbd>A</kbd><kbd>D</kbd> 或 <kbd>←</kbd><kbd>→</kbd> 左右转向</div>
  <div><kbd>W</kbd> 或 <kbd>↑</kbd> 俯冲加速（低速时撑杖起步）</div>
  <div><kbd>S</kbd> 或 <kbd>↓</kbd> 犁式刹车</div>
  <div><kbd>空格</kbd> 起跳</div>
  <div><kbd>Shift</kbd> 或 <kbd>L</kbd> + 方向 漂移：转得更急、几乎不掉速，松开时按蓄力喷射</div>
  <div>腾空时按住 <kbd>空格</kbd> / <kbd>E</kbd> 后空翻，<kbd>Q</kbd> 前空翻</div>
  <div>腾空时 <kbd>Shift</kbd> + <kbd>A</kbd>/<kbd>D</kbd> 转体（360 / 720 / 1080）</div>
  <div>腾空时按住 <kbd>S</kbd> 抓板，落地前松开</div>
  <div><kbd>J</kbd> / <kbd>F</kbd> / 鼠标左键 使用道具</div>
  <div><kbd>K</kbd> / <kbd>C</kbd> / 鼠标右键 放氮气</div>
  <div><kbd>1</kbd> ~ <kbd>4</kbd> 表情</div>
  <div><kbd>R</kbd> 复位到赛道中央</div>
  <div><kbd>Esc</kbd> 暂停 &nbsp; <kbd>M</kbd> 静音</div>
</div>`;
const GUIDE_HTML = `<p class="note">撞上蓝紫色泡泡获得随机道具，名次越靠后越容易拿到强力道具。被炸飞后会翻滚一小段再爬起来，爬起后有短暂无敌。高速正面撞树、撞岩石也会翻车。</p>
<p class="note"><b>翻跟头</b>：红旗大跳台、黄旗断崖、绿旗波浪坡都能飞起来。空中转满整圈再落地就加速，圈数越多越快；没转正就落地会摔。转体同理；抓板抓得越久分越高，但抓着板落地会站不稳。<br>
  <b>技巧链</b>：空翻、转体、抓板、长滞空、漂移、加速带、抄近道、击中对手都算一招，一招接一招，每多一招倍率 +1（最高 ×10）。约 3 秒不接新招就结算「总分 × 倍率」，×3 以上结算时还有一小口加速；在空中和漂移中计时暂停。还没结算就摔了、被打中、被冻住或复位，整条作废。<br>
  <b>近道</b>：主路绕大弯的地方，路边会有一个两侧立着石墙的窄口。里面是之字形急弯窄道：先收到 100 km/h 以下，再连着漂两个弯才进得去；不漂移要么撞墙，要么慢到白抄。过了急弯是一条更短、阻力更小的冰道。</p>
<p class="note"><b>地形</b>：淡蓝色的<b>冰面</b>阻力小、速度快，但抓地差、容易甩尾；白色松软的<b>深雪</b>会拖慢速度（单板和充气圈受影响小，雪橇最怕）。地上闪着箭头的<b>加速带</b>冲过去直接提速。<br>
  <b>机关</b>：雪地摩托会横穿雪道、滚石从山坡上砸下来，路边有警示牌；雪崩赛道上，领先者经过触发点后雪崩会从身后追来，被追上就会被卷飞。</p>
<p class="note"><b>装备</b>：分 C 普通、B 优秀、A 稀有、S 传说四档，档位越高属性越强，改装也越贵。双板均衡，单板漂移和空翻强，雪橇极速高但笨重，雪圈起步快、几乎撞不翻；B、A、S 三档里还有雪地单车、冲锋艇、雪地摩托、飞碟这些造型独特的载具，各有各的长短板。前期装备随等级在「车库」里解锁购买；更高级的稀有、传说装备在「商城」里用雪花币直接买，不看等级。改装都在车库里做。</p>`;
// 大厅每一页分成左右两栏（side：'l' / 'r'），各自带标题、各自滚动
// 面板没占满屏幕时返回的“整屏”
const FULL_FRAME = { cx: 0.5, cy: 0.5, w: 1, h: 1 };

// 装备的标签：最强和最弱的一项、深雪表现，都从属性表里算出来。返回 [[文字, 样式]]
function gearTags(G) {
  const R = RARITY[G.rarity] || RARITY.C;
  const ks = STAT_KEYS.slice().sort((a, b) => G.stats[b] - G.stats[a]);
  const hi = ks[0];
  const lo = ks[ks.length - 1];
  const tags = [[`${rarityToken(G.rarity)} ${R.name}`, 'r' + G.rarity]];
  tags.push(G.stats[hi] === G.stats[lo] ? ['各项均衡', 'warm'] : [`${STAT_NAMES[hi]}突出`, 'warm']);
  if (G.stats[hi] !== G.stats[lo]) tags.push([`${STAT_NAMES[lo]}偏弱`, '']);
  const powder = G.powder ?? 1;
  if (powder < 1) tags.push(['深雪减速少', 'pink']);
  else if (powder > 1) tags.push(['深雪更慢', '']);
  return tags;
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
    this.viewGear = null; // null 表示车库总览，装备 ID 表示进入该装备详情
    this.upPlan = 'race'; // 改装树亮哪条推荐路线
    this.upSel = null; // 改装树上选中的节点（null = 推荐路线上下一个能改的）
    this.shopGear = null; // 商城里正在看的商品（null = 第一件还没买的）
    this.shopSec = 'box'; // 商城货架滚到了哪一区，左边目录跟着亮
    this.boxWin = null; // 刚从补给箱开出来的东西：{ key, tier, dup }，展台上试穿给你看
    this.boxFx = false; // 开箱的全屏演出还开着
    this.achCat = 'all'; // 成就页按哪一类筛选
    this.achSel = null; // 点开详情的那枚成就
    this.setCat = 'match'; // 设置页左边停在哪一类
    this.racePick = null; // 'track' 赛道大厅 / 'hall' 房间列表 / 'room' 创建房间
    this.hallMode = 'all';
    this.hallRooms = [];
    this.fromRoom = false; // 赛道大厅是从开房间进去的，返回时回到房间
    this.onlineN = 0;
    this.onlineWait = 0;
    this.queueing = false; // 开始比赛：按钮停在匹配中，再点一次取消
    this.queueLine = '';
    this.board = 'points'; // 首页左侧赛季榜：points / hits / tt / rank
    this.boardFull = false;
    this.boardRules = false;
    this.boardRows = null;
    this.roomCat = 'all';
    this.rankMode = 'solo';
    this.modeSel = null; // 模式选择浮层：{ go } go = 选完直接开赛
    this.quest = new Quest(this); // 任务面板：首页「每日任务」点开的那一层
    document.addEventListener('click', (e) => this.playClick(e), true);
    // Esc：和左上角的返回一样一层层往回退；已经在首页时取消匹配
    window.addEventListener('keydown', (e) => {
      // 车库详情页：← → 切到上一件 / 下一件装备（光标在输入框里时不管）
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest?.('input, select, textarea')) {
        if (this.tab === 'garage' && this.viewGear && this.sub.garage === 'attr' && !$('menu').classList.contains('hidden')) {
          this.stepGarage(e.key === 'ArrowLeft' ? -1 : 1);
        }
        return;
      }
      if (e.key !== 'Escape') return;
      const acc = $('account');
      if (acc && !acc.classList.contains('hidden')) return;
      if (!$('match').classList.contains('hidden')) return game.cancelMatch();
      if ($('menu').classList.contains('hidden')) return;
      if (this.tab === 'race' && !this.racePick && !this.modeSel) {
        if (this.queueing) game.leavePublicQueue();
        return;
      }
      this.back();
    });
    $('pageTop').addEventListener('click', (e) => {
      if (e.target.closest('[data-act="back"]')) this.back();
      else if (e.target.closest('[data-act="wardrobeAccount"]')) this.game.account.openManage();
    });
    $('match').addEventListener('click', (e) => e.target.closest('[data-act="back"]') && game.cancelMatch());
    for (const t of TABS) $('tab-' + t).addEventListener('click', (e) => this.onMenuClick(e));
    for (const event of ['input', 'change']) $('tab-garage').addEventListener(event, (e) => this.filterGarageCatalog(e));
    for (const t in SHOW) this.bindDrag($('tab-' + t));
    // 滚动事件不冒泡，在捕获阶段接住货架的滚动
    $('tab-shop').addEventListener('scroll', (e) => e.target.classList && e.target.classList.contains('shelf') && this.spyShelf(e.target), true);
    this.buildMenu();
    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.openTab(b.dataset.tab);
    });
    $('btnLobby').addEventListener('click', () => game.toMenu());
    $('btnNext').addEventListener('click', () => game.nextRace());
    $('btnPracticeSwap').addEventListener('click', () => game.startPractice(game.session.gear === 'ski' ? 'learner' : 'ski'));
    $('btnResume').addEventListener('click', () => game.setPaused(false));
    $('skipDeparture').addEventListener('click', () => game.finishDeparture());
    $('btnRestart').addEventListener('click', () => game.restartRace());
    $('btnQuit').addEventListener('click', () => game.quitRace());
    // 每日任务卡片上的刷新倒计时
    setInterval(() => {
      const el = this.tab === 'race' && !$('menu').classList.contains('hidden') && document.querySelector('#tab-race .hdaily .cd');
      if (el) el.textContent = this.dailyLeft();
      const scd = this.tab === 'race' && document.querySelector('#tab-race .scd');
      if (scd) scd.textContent = seasonLeftText((this.board === 'rank' && !this.boardRules ? rankSeasonNow() : seasonNow()).left);
    }, 20000);
    $('btnStartNow').addEventListener('click', () => game.startMatchNow());
    $('btnInvite').addEventListener('click', () => this.copyInvite());
  }

  playClick(e) {
    const button = e.target?.closest?.('button, [role="button"]');
    if (!button || button.matches(':disabled, [aria-disabled="true"], [data-t], [data-act="mute"]')) return;
    const sfx = this.game.sfx;
    sfx.init();
    if (this.game.state === 'menu') sfx.menuStart();
    let sound = 'click';
    if (button.matches('[data-act="locked"], .poor, .full, [data-act="ranked"].lock')) sound = 'blocked';
    else if (button.matches(BACK_BUTTONS) || (this.queueing && button.matches('.hready, [data-act="rankGo"]'))) sound = 'back';
    else if (button.matches(CONFIRM_BUTTONS)) sound = 'confirm';
    else if (button.matches(SELECT_BUTTONS)) sound = 'select';
    // 拖拽货架会在后续事件处理里取消这次点击。
    setTimeout(() => {
      if (!e.defaultPrevented) sfx.uiSound(sound);
    }, 0);
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

  buildMenu() {
    this.refreshProfile();
    for (const t of TABS) this.renderTab(t);
    this.openTab(this.tab);
  }

  openTab(tab) {
    if (!TABS.includes(tab)) return;
    if (tab !== this.tab) {
      this.garageCardObserver?.disconnect();
      this.pendingBuy = null;
      this.viewGear = null;
      this.shopGear = null;
      this.boxWin = null;
      this.boxFx = false;
      this.achSel = null;
      if (this.racePick === 'hall') this.game.net.leave();
      this.racePick = null;
      this.modeSel = null;
    }
    this.tab = tab;
    for (const t of TABS) $('tab-' + t).classList.toggle('hidden', t !== tab);
    this.renderTab(tab);
    $('menu').classList.toggle('show', !!SHOW[tab]);
    $('menu').classList.toggle('shopping', tab === 'shop');
    $('menu').classList.toggle('wardrobe-open', tab === 'look');
    if (tab === 'look') this.revealWardrobeFocus();
    this.applyShow();
  }

  // 首页顶上是标题、入口和档案；点开的界面换成 返回 + 标题 + 雪花币
  paintTop() {
    const ranked = this.tab === 'race' && this.racePick === 'rank';
    const garage = this.tab === 'garage';
    const tuning = garage && !!this.viewGear && this.sub.garage === 'up';
    const title = this.tab === 'race' ? RACE_TITLE[this.racePick] : tuning ? '改装' : PAGE_TITLE[this.tab];
    $('menu').classList.toggle('ranked-open', ranked);
    $('menu').classList.toggle('garage-catalog-open', garage && !this.viewGear);
    $('menu').classList.toggle('garage-detail', garage && !!this.viewGear && !tuning);
    $('menu').classList.toggle('tune-open', tuning);
    $('menuTop').classList.toggle('hidden', !!title);
    $('pageTop').classList.toggle('hidden', !title || ranked);
    if (title && !ranked) {
      const bar = $('pageTop');
      setGameHtml(bar, pageTop(title, this.game.profile.coins, {
        parts: garage ? this.game.profile.parts : null,
        action: this.tab === 'look' ? { act: 'wardrobeAccount', label: '个人资料' } : null,
      }));
    }
  }

  // 左上角返回 / Esc：先关掉界面里弹出来的那一层，再退回上一个界面，最后回到首页
  back() {
    const g = this.game;
    if (this.tab !== 'race') {
      if (this.boxFx) {
        this.boxFx = false;
        this.renderTab('shop');
      } else if (this.achSel) {
        this.achSel = null;
        this.renderTab('growth');
      } else if (this.tab === 'garage' && this.viewGear) {
        if (this.sub.garage === 'up') this.sub.garage = 'attr';
        else this.viewGear = null;
        this.pendingBuy = null;
        this.renderTab('garage');
        this.applyShow();
      } else this.openTab('race');
      return;
    }
    if (this.modeSel) this.modeSel = null;
    else if (this.racePick === 'rank' && this.rankSection && this.rankSection !== 'rank') this.rankSection = 'rank';
    else if (this.racePick === 'track' && this.fromRoom) this.racePick = 'room';
    else if (this.racePick === 'room') return g.openHall();
    else if (this.racePick) {
      if (this.racePick === 'hall') g.net.leave();
      this.racePick = null;
      this.fromRoom = false;
    }
    this.renderTab('race');
  }

  // 告诉主程序背景该是缆车大厅还是展厅、展台上摆哪件装备；商城刚开完箱时，展台上试穿开出来的外观
  applyShow() {
    if (this.tab === 'look') return previewWardrobe(this.game, wardrobeState(this.game, this.wardrobeSelection));
    if (this.tab === 'garage' && (!this.viewGear || this.sub.garage === 'up')) return this.game.setShow(null);
    const s = SHOW[this.tab];
    let gear = null;
    let patch = null;
    if (this.tab === 'garage') gear = this.viewGear;
    else if (this.tab === 'shop' && this.boxWin) {
      const c = cosmeticOf(this.boxWin.key);
      patch = { [c.slot]: c.i };
    } else if (this.tab === 'shop') gear = this.shopPick();
    this.game.setShow(s ? s.label : null, gear, patch);
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
    const nav = SHOW[tab].subs.map(([k, name, en]) => `<button aria-pressed="${k === cur}" data-sub="${k}"><b>${name}</b><i>${en}</i></button>`).join('');
    return `<div class="sdrag" title="按住左右拖动，可以转动角色"></div><nav class="snav side-nav" aria-label="${PAGE_TITLE[tab]}分类">${nav}</nav>${extra}
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
    const treeScroll = el.querySelector('.tune-tree-scroll');
    const treeLeft = treeScroll?.scrollLeft || 0;
    const treeTop = treeScroll?.scrollTop || 0;
    const rewardsLeft = t === 'growth' ? el.querySelector('.ltlist')?.scrollLeft || 0 : 0;
    if (t === 'race') el.innerHTML = this.raceHtml();
    else if (t === 'growth') el.innerHTML = this.growthHtml();
    else if (t === 'garage') el.innerHTML = this.garageHtml();
    else if (t === 'shop') el.innerHTML = this.shopHtml();
    else if (t === 'look') el.innerHTML = this.lookHtml();
    else if (t === 'set') el.innerHTML = this.settingsHtml();
    applyGameIcons(el);
    if (t === this.tab) this.paintTop();
    el.querySelectorAll('.colBody').forEach((b, i) => (b.scrollTop = tops[i] || 0));
    if (t === 'race') {
      this.shapePlay(el);
      if (this.racePick === 'rank') this.paintRankCrests();
    }
    if (t === 'growth') {
      const rewards = el.querySelector('.ltlist');
      if (rewards) {
        rewards.scrollLeft = rewardsLeft;
        bindLevelRewards(rewards);
      }
    }
    if (t === 'garage') {
      const tree = el.querySelector('.tune-tree-scroll');
      if (tree) { tree.scrollLeft = treeLeft; tree.scrollTop = treeTop; }
      const grid = el.querySelector('.garage-catalog-list');
      if (grid) grid.scrollTop = this.garageScroll || 0;
      this.observeGarageCards();
    }
    const shelf = el.querySelector('.shelf');
    if (shelf) this.spyShelf(shelf, true);
  }

  raceHtml() {
    const g = this.game;
    const r = g.rules;
    const m = r.mode;
    const def = r.track !== 'random' ? TRACK_MAP[r.track] : null;
    // 首页：开始比赛走匹配。开房间里选玩法、赛道和机器人。赛道大厅单独铺开
    const page = this.racePick === 'track' ? this.roomHtml(def) : this.racePick === 'room' ? this.customRoomHtml(def) : this.racePick === 'hall' ? this.hallHtml() : this.racePick === 'rank' ? this.rankHtml() : `<div class="hside">${this.boardHtml()}${this.dailyCardHtml()}</div><section class="home">${this.homeHtml(def)}</section>`;
    return page + (this.modeSel ? this.modeSelHtml() : '');
  }

  // 「设置」页：一整块大面板，左边竖排分类，右边是这一类的选项（对局、道具、画面声音、操作、玩法说明）
  settingsHtml() {
    const g = this.game;
    const r = g.rules;
    const cat = SET_CATS.some(([k]) => k === this.setCat) ? this.setCat : SET_CATS[0][0];
    const nav = SET_CATS.map(([k, ic, name, en]) => `<button aria-pressed="${k === cat}" data-act="setCat" data-id="${k}"><span>${ic}</span><b>${name}</b><i>${en}</i></button>`).join('');
    let body;
    if (cat === 'match') {
      body = this.matchSettingsHtml();
    } else if (cat === 'items') {
      const wp = WEAPON_KEYS.map((k) => `<button class="wp ${r.banned.includes(k) ? 'off' : ''}" data-ban="${k}">${WEAPONS[k].icon} ${WEAPONS[k].name}</button>`).join('');
      body =
        this.optRow('道具', 'items', [[true, '开启'], [false, '禁用道具（纯竞速）']], r.items) +
        this.optRow('道具箱密度', 'itemRate', [[0, '稀少'], [1, '正常'], [2, '密集']], r.itemRate) +
        this.optRow('野生动物袭击', 'wildlife', [[true, '开启'], [false, '关闭']], r.wildlife) +
        `<div class="field"><label>武器池</label><div class="opts">${wp}</div></div>`;
    } else if (cat === 'video') {
      const m = !!g.sfx.muted;
      body =
        this.optRow('画质', 'quality', [['auto', '自动'], ['high', '高'], ['mid', '中'], ['low', '低']], r.quality || 'auto') +
        this.optRow('实时阴影（卡顿时可关闭）', 'shadows', [[true, '开启'], [false, '关闭']], r.shadows) +
        `<div class="field"><label>声音</label><div class="opts"><button class="${m ? '' : 'on'}" data-act="mute" data-v="0">开启</button><button class="${m ? 'on' : ''}" data-act="mute" data-v="1">静音</button></div></div>`;
    } else if (cat === 'keys') body = KEYS_HTML;
    else body = GUIDE_HTML;
    const [, ic, name, en] = SET_CATS.find(([k]) => k === cat);
    return `<section class="setp panel"><nav class="setnav side-nav" aria-label="设置分类">${nav}</nav>
      <div class="setmain"><h3 class="sethead"><span>${ic}</span>${name}<i>${en}</i></h3><div class="setbody colBody">${body}</div></div></section>`;
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

  // 首页一行卡片：开始比赛（同一个框里，这局玩什么、点了换玩法，右下大黄按钮去匹配）·
  // 排位赛 / 开房间（中间两张）· 赛道
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
    // 匹配固定随机赛道、随机场景、最多 8 人；计时赛不匹配，跑的是赛道卡上选的那条
    const sm = g.soloRules.mode;
    const SM = MODES[sm] || M;
    const st = MODE_STYLE[sm] || MODE_STYLE.race;
    const solo = sm === 'tt';
    const map = solo && def ? def.name : '随机赛道';
    const scene = solo && def ? THEMES[def.theme].name : solo && r.theme !== 'random' ? THEMES[r.theme].name : '随机场景';
    const chips = (solo ? ['单人', scene] : ['8 人', scene]).map((t) => `<i>${t}</i>`).join('');
    return `<div class="hc hplay" style="--c1:${st.c[0]};--c2:${st.c[1]}">
          <button class="hpick" data-act="msel" title="换一个玩法"><svg class="hpline" aria-hidden="true"><path></path></svg><span class="in">
            <span class="hart">${SM.icon}</span>
            <span class="hpinfo"><span class="hmap"><b>${esc(map)}</b>${chips}</span><strong>${SM.name}</strong></span>
            <span class="hswap">⇄</span>
          </span></button>
          <button class="hready${this.queueing ? ' matching' : ''}" data-act="match"><span class="in"><b>${this.goTitle()}</b></span></button>
        </div>
        <div class="hmid">
          <button class="hc hrank${P.rankOpen() ? '' : ' lock'}" data-act="ranked"><span class="in">
            <span class="hico sm">🏅</span><span class="htx"><b>排位赛</b><small>${P.rankOpen() ? esc(P.rankView().line) : `Lv.${RANK_LV} 开启`}</small></span><span class="hmore">›</span>
          </span></button>
          <button class="hc hnet" data-act="hall">
            <span class="in"><span class="hico sm">🏠</span><span class="htx"><b>开房间</b></span><span class="hmore">›</span></span>
          </button>
        </div>
        <button class="hc htrack" data-act="pick" data-id="track"><span class="in"><span class="hlbl">赛道 · 场景</span>${trackCard}</span></button>`;
  }

  // 每日任务：放在左边赛季榜下面
  dailyCardHtml() {
    const dots = this.game.profile.dailyTasks().map((t) => `<i class="${t.done ? 'on' : ''}"></i>`).join('');
    return `<button class="hc hdaily" data-act="quest"><span class="in">
        <span class="hsq blue">📋</span><span class="htx"><b>每日任务</b><span class="hdots">${dots}</span><small class="cd">${this.dailyLeft()}</small></span>
      </span></button>`;
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
      .map(([id, ic, name, sub]) => `<button aria-pressed="${cat === id}" data-act="rcat" data-id="${id}"><span class="ic">${ic}</span><b>${name}</b><small>${sub}</small></button>`)
      .join('');
    CUPS.forEach((c, i) => {
      const open = P.trackUnlocked(c.tracks[0]);
      const got = c.tracks.filter((id) => P.data.medals[id]).length;
      nav += `<button class="${open ? '' : 'lock'}" aria-pressed="${cat === c.id}" data-act="rcat" data-id="${c.id}"><span class="ic">${open ? c.icon : '🔒'}</span><b>${c.name}</b><small>${open ? `奖牌 ${got} / ${c.tracks.length}` : `Lv.${CUP_LV[i]} 解锁`}</small></button>`;
    });
    let cards;
    if (cat === 'random') cards = this.randCardHtml('random') + THEME_KEYS.map((k) => this.randCardHtml(k)).join('');
    else {
      const list = cat === 'all' ? TRACKS : CUP_MAP[cat].tracks.map((id) => TRACK_MAP[id]);
      cards = (cat === 'all' ? this.randCardHtml(null) : '') + list.map((t) => this.trackCardHtml(t)).join('');
    }
    return `<section class="room">
      <nav class="rnav side-nav" aria-label="赛道分类">${nav}</nav>
      <div class="rbar">${this.roomBarHtml(def)}</div>
      <div class="rgrid colBody">${cards}</div>
      <div class="ract">
        ${this.fromRoom
          ? `<span class="rtip">选中的卡片再点一次，就带着它回到房间</span>
             <button class="rbtn main" data-act="quick"><b>用这条开始</b><small>${M.icon} ${M.name}</small></button>`
          : `<span class="rtip">选中的卡片再点一次，按当前玩法直接出发</span>
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
      <div class="rmed"><label>计时赛奖牌线</label><span>🥇 ${fmtTime(au)}</span><span>🥈 ${fmtTime(ag)}</span><span>🥉 ${fmtTime(cu)}</span>${best ? `<em>最好 ${fmtTime(best)} ${MEDAL[P.data.medals[def.id] || 0]}</em>` : ''}</div>
      ${def.id === 'cedar' && !this.fromRoom ? `<div class="rchips rpractice"><label>${PRACTICE_SECONDS} 秒试滑</label>
        <button class="on" data-act="practice" data-id="ski">🎿 双板试滑</button>
        <button class="on" data-act="practice" data-id="learner">🏂 单板试滑</button>
      </div>` : ''}`;
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
      <div class="hallBar"><div class="opts">${filters}</div></div>
      <div class="hallGrid">${cards}</div>
      <div class="ract">
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
        <div class="field"><label>玩法</label><div class="opts">${modes}</div></div>
        <button class="roomMap" data-act="pick" data-id="track"><span><b>${esc(where)}</b><small>${esc(sub)}</small></span><em>选赛道 ›</em></button>
        ${this.matchSettingsHtml(true)}
      </div>
      <div class="ract">
        <button class="rbtn main" data-act="mkroom"><b>创建</b><small>${M.icon} ${M.name}</small></button>
      </div>
    </section>`;
  }

  // 模式选择：一排斜切大卡片。选完回到刚才的页面
  modeSelHtml() {
    const r = this.game.rules;
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
    return `<div class="msel">
      <header class="ptop">${pageTop('模式选择', this.game.profile.coins)}</header>
      <div class="mrow">${cards}</div>
    </div>`;
  }

  // 成长页：内容在 quest.js 里（总览 / 成就 / 生涯）
  growthHtml() {
    const v = growthView(this);
    return this.showHtml('growth', v.head, v.tags, v.body, v.extra, '', v.cls);
  }

  garageHtml() {
    if (!this.viewGear) return this.garageCatalogHtml();
    const g = this.game;
    const P = g.profile;
    const cur = g.look.gear;
    // 展台上摆的是正在看的那件，不一定是正在用的，也不一定已经拥有
    const id = GEAR[this.viewGear] ? this.viewGear : cur;
    if (this.sub.garage === 'up') return tuneHtml(P, id, this.upPlan, this.upSel);
    const G = GEAR[id];
    const key = 'gear:' + id;
    const st = P.unlockState(G.unlock, key);
    const owned = st === 'free' || st === 'owned';
    const up = P.up(id);
    const upSum = UP_KEYS.reduce((n, k) => n + up[k], 0);
    const rare = RARITY[G.rarity] || RARITY.C;
    const s = gearStats(id, up);
    const bars = STAT_KEYS.map((k) => {
      const b = (G.stats[k] / STAT_MAX) * 100;
      const e = ((s[k] - G.stats[k]) / STAT_MAX) * 100;
      return `<div class="stat"><span>${STAT_NAMES[k]}</span><div class="bar"><i style="width:${b}%"></i>${e > 0 ? `<em style="left:${b}%;width:${e}%"></em>` : ''}</div><b>${s[k].toFixed(1)}</b></div>`;
    }).join('');
    const body = `<div class="ssec">装备特性</div><div class="strait r${G.rarity || 'C'}"><span class="ic">${G.icon}</span><p>${G.desc}</p></div>` +
      `<div class="ssec">属性<small>会真实影响手感；绿色是改装加成</small></div><div class="gcard">${bars}</div>`;
    let act = '<button class="sbtn" data-sub="up"><b>改装</b><i>TUNING</i></button>';
    let state;
    if (owned) {
      state = id === cur ? '使用中' : '已拥有';
      act += id === cur ? '<button class="sbtn main off" disabled><b>使用中</b><i>EQUIPPED</i></button>' : `<button class="sbtn main" data-k="look.gear" data-v="${id}"><b>选用</b><i>EQUIP</i></button>`;
    } else if (G.unlock.shop) {
      state = '商城有售';
      act += `<button class="sbtn main" data-act="toShop" data-id="${id}"><b>去商城</b><i>❄ ${G.unlock.cost}</i></button>`;
    } else if (st === 'buy') {
      const cost = G.unlock.cost;
      const confirm = this.pendingBuy === key;
      state = '可购买';
      act += `<button class="sbtn main ${confirm ? 'confirm' : ''} ${P.coins < cost ? 'poor' : ''}" data-act="buy" data-key="${key}" data-v="${id}"><b>${confirm ? '确认购买' : '购买'}</b><i>❄ ${cost}</i></button>`;
    } else {
      const why = this.lockWhy(G.unlock);
      state = '未解锁';
      act += `<button class="sbtn main off" data-act="locked" data-why="${esc(why)}"><b>未解锁</b><i>${G.unlock.lv ? `Lv.${G.unlock.lv}` : 'LOCKED'}</i></button>`;
    }
    const head = { badge: G.icon, small: `${rarityToken(G.rarity)} ${rare.name} · ${state}`, name: G.name, side: `改装 <b>${upSum}</b> / ${UP_KEYS.length * UP_MAX}` };
    // 展台左右两个按钮：切到目录里的上一件 / 下一件
    const steps = '<div class="gstep"><button class="prev" data-act="garageStep" data-dir="-1" aria-label="上一件装备" title="上一件（←）"></button>' +
      '<button class="next" data-act="garageStep" data-dir="1" aria-label="下一件装备" title="下一件（→）"></button></div>';
    return this.showHtml('garage', head, gearTags(G), body, steps, act);
  }

  // 车库详情页换到目录里的上一件 / 下一件（按目录当前的筛选和排序）
  stepGarage(dir) {
    this.viewGear = garageStep(this.game, this.garageCatalog || {}, this.viewGear, dir);
    this.upSel = null;
    this.pendingBuy = null;
    this.renderTab('garage');
    this.applyShow();
  }

  onMenuClick(e) {
    const g = this.game;
    const P = g.profile;
    const b = e.target.closest('button');
    if (!b) return;
    if (this.tab === 'look' && this.onWardrobeClick(b)) return;
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
    if (act === 'back') return this.back();
    if (act === 'garageRank') {
      for (const item of b.parentElement.querySelectorAll('[data-act="garageRank"]')) item.setAttribute('aria-pressed', String(item === b));
      this.setGarageFilter('rank', b.dataset.id);
      return;
    }
    if (act === 'garageStep') return this.stepGarage(Number(b.dataset.dir));
    if (act === 'garageInspect') {
      const id = b.dataset.id;
      if (!GEAR_KEYS.includes(id)) return;
      this.garageScroll = $('tab-garage').querySelector('.garage-catalog-list').scrollTop;
      this.sub.garage = 'attr';
      this.viewGear = id;
      this.upSel = null;
      this.pendingBuy = null;
      this.renderTab('garage');
      this.applyShow();
      return;
    }
    // 展厅页左边的子页签（车库右下角的 属性 / 强化 按钮也走这里）
    if (b.dataset.sub) {
      this.pendingBuy = null;
      this.sub[this.tab] = b.dataset.sub;
      for (const x of $('tab-' + this.tab).querySelectorAll('.colBody')) x.scrollTop = 0;
      this.renderTab(this.tab);
      this.applyShow();
      return;
    }
    // 商城：换一件商品摆上展台看看
    if (act === 'sview') {
      this.pendingBuy = null;
      this.boxWin = null;
      this.boxFx = false;
      this.shopGear = b.dataset.id;
      this.renderTab('shop');
      this.applyShow();
      return;
    }
    // 商城：左边目录，把货架滚到那一区
    if (act === 'ssec') {
      this.shopSec = b.dataset.id;
      for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
      this.scrollShelf($('tab-shop').querySelector(`.shsec[data-sec="${b.dataset.id}"]`));
      return;
    }
    if (act === 'toBox') {
      this.shopSec = 'box';
      this.openTab('shop');
      this.scrollShelf($('tab-shop').querySelector('.shsec[data-sec="box"]'));
      return;
    }
    // 车库和商城之间互相跳，过去之后直接看这件装备
    if (act === 'toShop' || act === 'toGarage') {
      const id = b.dataset.id;
      if (!GEAR[id]) return;
      this.openTab(act === 'toShop' ? 'shop' : 'garage');
      if (act === 'toShop') this.shopGear = id;
      else {
        this.viewGear = id;
        this.sub.garage = 'attr';
        this.upSel = null;
      }
      this.renderTab(this.tab);
      this.applyShow();
      if (act === 'toShop') this.scrollShelf($('tab-shop').querySelector('.scard.on'), true);
      return;
    }
    // 补给箱：第一次点变成确认，开出结果之后「再开一次」直接开
    if (act === 'box') {
      if (P.coins < BOX_COST) {
        this.toast(`雪花币不够（需要 ❄${BOX_COST}，你有 ❄${P.coins}）`, true);
        return;
      }
      if (!this.boxWin && this.pendingBuy !== 'box') {
        this.pendingBuy = 'box';
        this.renderTab('shop');
        return;
      }
      this.pendingBuy = null;
      const win = P.openBox();
      if (!win) return;
      this.boxWin = win;
      this.boxFx = true;
      this.refreshProfile();
      this.renderTab('shop');
      this.applyShow();
      return;
    }
    // 收下：关掉全屏演出，回到商城，展台上继续试穿、详情条上还能再决定戴不戴
    if (act === 'boxFxOk') {
      this.boxFx = false;
      this.renderTab('shop');
      return;
    }
    if (act === 'boxWear' || act === 'boxOk') {
      if (act === 'boxWear' && this.boxWin) {
        const c = cosmeticOf(this.boxWin.key);
        g.setLook(c.slot, c.i);
        this.toast(`已佩戴「${c.name}」`);
      }
      this.boxWin = null;
      this.boxFx = false;
      this.renderTab('shop');
      this.applyShow();
      return;
    }
    if (act === 'buy') {
      const key = b.dataset.key;
      const u = unlockOf(key);
      if (!u?.cost) return;
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
      if (P.buy(key)) {
        g.setLook('gear', b.dataset.v);
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
    if (act === 'ranked') {
      if (!g.profile.rankOpen()) return this.toast(`排位赛 Lv.${RANK_LV} 开启`, true);
      this.racePick = 'rank';
      this.rankSection = 'rank';
      this.renderTab('race');
      return;
    }
    if (act === 'rankSection') {
      this.rankSection = b.dataset.id;
      this.renderTab('race');
      return;
    }
    if (act === 'rankBoard') {
      this.board = 'rank';
      this.boardRules = false;
      this.boardFull = false;
      this.racePick = null;
      this.renderTab('race');
      this.refreshBoard();
      return;
    }
    if (act === 'rankMode') {
      // 正在排的是排位：换一种排位就退出当前队列；排的是普通匹配就不动它
      if (g.netMode && !g.customRoom && g.rankMode) g.leavePublicQueue();
      this.rankMode = b.dataset.id || 'solo';
      this.renderTab('race');
      return;
    }
    if (act === 'rankGo') return g.startRank(b.dataset.id || this.rankMode);
    if (act === 'quick') return g.startTournament();
    if (act === 'practice') return g.startPractice(b.dataset.id);
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
    if (act === 'msel') {
      this.modeSel = { go: !!b.dataset.go };
      this.renderTab('race');
      return;
    }
    if (act === 'mode') {
      const go = this.modeSel && this.modeSel.go;
      this.modeSel = null;
      if (this.queueing && g.rules.mode !== b.dataset.id) {
        this.renderTab('race');
        return this.toast('匹配中不能换玩法，先取消匹配', true);
      }
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
    if (act === 'setCat') {
      this.setCat = b.dataset.id;
      this.renderTab('set');
      const body = $('tab-set').querySelector('.setbody');
      if (body) body.scrollTop = 0;
      return;
    }
    if (act === 'mute') {
      g.sfx.setMuted(b.dataset.v === '1');
      g.sfx.uiSound('select');
      this.renderTab('set');
      return;
    }
    if (act === 'achCat' || act === 'ach' || act === 'achClose') {
      if (act === 'achCat') this.achCat = b.dataset.id;
      this.achSel = act === 'ach' ? b.dataset.id : null;
      this.renderTab('growth');
      return;
    }
    // 改装树：点节点是选中它，推荐路线换了就从新路线上下一个能改的节点开始
    if (act === 'upNode' || act === 'upPlan') {
      if (act === 'upNode') this.upSel = b.dataset.line;
      else {
        this.upPlan = b.dataset.id;
        this.upSel = null;
      }
      this.renderTab('garage');
      return;
    }
    if (act === 'up' || act === 'upFull') {
      const line = b.dataset.line;
      // 改的是展台上正在看的那件装备
      const gear = GEAR[this.viewGear] ? this.viewGear : g.look.gear;
      const cost = act === 'up' ? P.upgradeCost(gear, line) : P.upgradeFullCost(gear, line);
      if (P.parts < cost) {
        this.toast(`改装币不够（需要 ${cost}，你有 ${P.parts}）`, true);
        return;
      }
      let n = 0;
      while (P.upgrade(gear, line)) {
        n++;
        if (act === 'up') break;
      }
      if (n) {
        const ach = P.checkAch();
        const lv = P.up(gear)[line];
        this.toast(`${UPGRADES[line].name} ${lv >= UP_MAX ? '已改满' : `升到 ${lv} 级`}！${ach.length ? ` 🏆 达成成就「${ach.map((a) => a.name).join('」「')}」` : ''}`);
        // 这个节点改满了，就跳到推荐路线上下一个
        if (lv >= UP_MAX) this.upSel = null;
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
      if (k === 'look.gear') this.renderTab(this.tab === 'shop' ? 'shop' : 'garage');
      if (this.tab === 'look' && this.pendingBuy === null) this.renderTab('look');
    } else {
      g.setRule(k, v);
      // 场景、长度改了，赛道大厅的卡片和首页赛道卡也要跟着变
      if (k === 'theme' || k === 'length') this.renderTab('race');
    }
  }

  toast(text, bad = false) {
    const el = $('menuToast');
    setGameText(el, text);
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
    applyGameIcons($('profileBar'));
    this.paintTop();
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
    if (!$('match').classList.contains('hidden')) {
      l = $('matchBox').getBoundingClientRect().right;
      t = $('matchTop').getBoundingClientRect().bottom;
    } else if (!$('menu').classList.contains('hidden')) {
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
      } else if (this.tab === 'look' || (this.tab === 'garage' && this.viewGear)) {
        const stage = $('tab-' + this.tab).querySelector('.sdrag')?.getBoundingClientRect();
        if (stage) ({ left: l, right: r, top: t, bottom: b } = stage);
        t = Math.max(0, t);
        b = Math.min(H, b);
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
}

Object.assign(UI.prototype, matchMethods, boardMethods, shopMethods, hudMethods, resultsMethods, wardrobeMethods, rankedMethods, garageCatalogMethods);
