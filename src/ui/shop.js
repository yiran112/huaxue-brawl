// 商城：补给箱和装备货架
import { GEAR, SHOP_GEAR, RARITY, STAT_NAMES, STAT_KEYS, STAT_MAX, BOX_COST, BOX_REFUND, BOX_WEIGHT, BOX_POOL, gearStats } from '../gear.js';
import { gearThumb } from '../gearThumb.js';
import { $, esc, SHOW, cosmeticOf } from './common.js';

export const shopMethods = {
  // ---------- 商城 ----------
  // 左边是货架分区的目录；中间展台试穿正在看的那件，下面一条是它的详情和购买；
  // 右边是往下滚的货架：补给箱，再按稀有度一区一区排白底商品卡。货架上的装备不看等级，攒够雪花币就能买
  shopPick() {
    if (SHOP_GEAR.includes(this.shopGear)) return this.shopGear;
    const P = this.game.profile;
    return SHOP_GEAR.find((k) => !P.gearOwned(k)) || SHOP_GEAR[0];
  },

  shopHtml() {
    // 记住这件，买下之后展台不会跳到下一件没买的
    const id = (this.shopGear = this.shopPick());
    const nav = SHOW.shop.subs.map(([k, name, en]) => `<button class="${k === this.shopSec ? 'on' : ''}" data-act="ssec" data-id="${k}"><b>${name}</b><i>${en}</i></button>`).join('');
    const shelves = SHOW.shop.subs.slice(1).map(([r]) => this.shelfHtml(r, id)).join('');
    return `<div class="sdrag" title="按住左右拖动，可以转动角色"></div><nav class="snav">${nav}</nav>
      <div class="spick sbar">${this.boxWin ? this.boxWinHtml() : this.shopInfoHtml(id)}</div>
      <div class="sright shelfCol"><div class="shelf colBody">${this.boxHtml()}${shelves}</div></div>${this.boxFx && this.boxWin ? this.boxFxHtml() : ''}`;
  },

  // 开箱的全屏演出：礼盒在聚光灯下抖几下，一闪之后按档次换背景色（普通蓝、稀有紫、传说金），开出来的东西摆在正中间。
  // 每次重画都是新元素，动画从头播；「再开一次」就是这么重播的
  boxFxHtml() {
    const w = this.boxWin;
    const c = cosmeticOf(w.key);
    const P = this.game.profile;
    const worn = (this.game.look[c.slot] | 0) === c.i;
    const head = w.dup ? '已经有了' : w.tier === 'S' ? '传说外观！' : w.tier === 'A' ? '稀有外观！' : '开出新外观';
    const line = w.dup ? `重复的外观折成雪花币，返还 ❄${BOX_REFUND}` : `已放进「角色」页的${c.slot === 'hat' ? '造型' : '饰品'}里`;
    // 提示条在演出下面看不见，钱不够就直接把按钮灰掉
    let again = '';
    if (!P.boxDone()) again = P.coins < BOX_COST ? `<button class="sbtn off" disabled><b>再开一次</b><i>还差 ❄${BOX_COST - P.coins}</i></button>` : `<button class="sbtn" data-act="box"><b>再开一次</b><i>❄ ${BOX_COST}</i></button>`;
    const wear = w.dup || worn ? '' : '<button class="sbtn main" data-act="boxWear"><b>立即佩戴</b><i>WEAR</i></button>';
    return `<div class="bfx r${w.tier} ${w.dup ? 'dup' : ''}"><i class="bfxWm">SNOW SUPPLY</i><div class="bfxRays"></div><div class="bfxBox">🎁</div>
      <div class="bfxWin"><small class="bfxHead">${head}</small><div class="bfxIc">${c.icon}</div>
        <span class="bfxTag">${RARITY[w.tier].name} · ${c.part}</span><b class="bfxName">${esc(c.name)}</b><p>${line}</p>
        <div class="bfxAct">${again}${wear}<button class="sbtn" data-act="boxFxOk"><b>收下</b><i>OK</i></button></div></div></div>`;
  },

  // 展台下面的详情条：名字、特性、五项属性（数值右上角是和正在用的那件差多少），右边是 购买 / 选用 / 使用中
  shopInfoHtml(id) {
    const g = this.game;
    const P = g.profile;
    const cur = g.look.gear;
    const G = GEAR[id];
    const cost = G.unlock.cost;
    const s = gearStats(id, P.up(id));
    const mine = gearStats(cur, P.up(cur));
    const stats = STAT_KEYS.map((k) => {
      const d = Math.round((s[k] - mine[k]) * 10) / 10;
      const dlt = id === cur ? '' : `<small class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '+' + d.toFixed(1) : d < 0 ? d.toFixed(1) : '±0'}</small>`;
      return `<div class="sst"><span>${STAT_NAMES[k]}</span><b>${s[k].toFixed(1)}${dlt}</b><i><u style="width:${(s[k] / STAT_MAX) * 100}%"></u></i></div>`;
    }).join('');
    let state;
    let btn;
    if (P.gearOwned(id)) {
      state = id === cur ? '使用中' : '已拥有';
      btn = id === cur ? '<button class="sbtn main off" disabled><b>使用中</b><i>EQUIPPED</i></button>' : `<button class="sbtn main" data-k="look.gear" data-v="${id}"><b>选用</b><i>EQUIP</i></button>`;
    } else {
      const key = 'gear:' + id;
      const confirm = this.pendingBuy === key;
      state = P.coins < cost ? `还差 ❄${cost - P.coins}` : '可购买';
      btn = `<button class="sbtn main ${confirm ? 'confirm' : ''} ${P.coins < cost ? 'poor' : ''}" data-act="buy" data-key="${key}" data-field="gear" data-v="${id}"><b>${confirm ? '确认购买' : '购买'}</b><i>❄ ${cost}</i></button>`;
    }
    const cmp = id === cur ? '' : `<em>属性右上角是和正在用的「${esc((GEAR[cur] || GEAR.ski).name)}」（含改装）相比</em>`;
    return `<div class="sihead"><div class="sbadge">${G.icon}</div>
        <div class="sname"><small>${G.rarity} · ${RARITY[G.rarity].name} · ${state}<button class="slink" data-act="toGarage" data-id="${id}">去车库 ›</button></small><b>${G.name}</b></div>${btn}</div>
      <p class="sdesc">${G.desc}${cmp}</p>
      <div class="ssts">${stats}</div>`;
  },

  // 开箱结果占用详情条的位置，展台上同时试穿开出来的东西
  boxWinHtml() {
    const w = this.boxWin;
    const c = cosmeticOf(w.key);
    const worn = (this.game.look[c.slot] | 0) === c.i;
    const wear = w.dup || worn ? '' : '<button class="sbtn main" data-act="boxWear"><b>立即佩戴</b><i>WEAR</i></button>';
    const line = w.dup ? `已经有了，折成雪花币返还 ❄${BOX_REFUND}` : `已放进「角色」页的${c.slot === 'hat' ? '造型' : '饰品'}里`;
    return `<div class="bwin r${w.tier}"><div class="bwic">${c.icon}</div>
      <div class="sname"><small>${w.dup ? '重复' : '开出新外观！'} · ${RARITY[w.tier].name} · ${c.part}</small><b>${esc(c.name)}</b><span>${line}</span></div>
      <div class="bwact">${wear}<button class="sbtn" data-act="boxOk"><b>好的</b><i>OK</i></button></div></div>`;
  },

  // 货架第一区：补给箱横幅（概率、开箱按钮）
  boxHtml() {
    const P = this.game.profile;
    const got = BOX_POOL.filter((it) => P.boxOwned(it.key)).length;
    const tiers = Object.keys(BOX_WEIGHT).reverse();
    const total = tiers.reduce((n, t) => n + BOX_WEIGHT[t], 0);
    const odds = tiers.map((t) => `<span class="r${t}">${RARITY[t].name} ${Math.round((BOX_WEIGHT[t] / total) * 100)}%</span>`).join('');
    let btn;
    if (got >= BOX_POOL.length) btn = '<button class="bopen off" disabled><b>已全部收集</b><i>ALL CLEAR</i></button>';
    else {
      const confirm = this.pendingBuy === 'box';
      btn = `<button class="bopen ${confirm ? 'confirm' : ''} ${P.coins < BOX_COST ? 'poor' : ''}" data-act="box"><b>${confirm ? '确认开启' : this.boxWin ? '再开一次' : '开启'}</b><i>❄ ${BOX_COST}</i></button>`;
    }
    return `<section class="shsec" data-sec="box"><header class="shhead"><b>雪花补给箱</b><span>已收集 ${got} / ${BOX_POOL.length}</span></header>
      <div class="boxban"><div class="bart"><span>🎁</span></div>
        <div class="btx"><b class="bttl">开箱惊喜</b><small>随机开出一件外观，重复的返还 ❄${BOX_REFUND}</small><div class="bodds">${odds}</div>${btn}</div></div></section>`;
  },

  // 一档稀有度的货架：白底商品卡排成格子，右下角一条黄色斜切价签
  shelfHtml(r, id) {
    const g = this.game;
    const P = g.profile;
    const cur = g.look.gear;
    const list = SHOP_GEAR.filter((k) => GEAR[k].rarity === r);
    const got = list.filter((k) => P.gearOwned(k)).length;
    // 缩略图只在商城页开着的时候拍
    const shots = this.tab === 'shop';
    const cards = list
      .map((k) => {
        const K = GEAR[k];
        const has = P.gearOwned(k);
        const img = shots ? gearThumb(k, g.look) : null;
        const pic = img ? `<img src="${img}" alt="" draggable="false">` : `<span class="ic">${K.icon}</span>`;
        const tag = has ? '<span class="price own">已拥有</span>' : `<span class="price ${P.coins < K.unlock.cost ? 'poor' : ''}">❄ ${K.unlock.cost}</span>`;
        return `<button class="scard r${r} ${k === id && !this.boxWin ? 'on' : ''}" data-act="sview" data-id="${k}"><span class="spic">${pic}</span><span class="srar">${r}</span>${k === cur ? '<em>使用中</em>' : ''}<span class="snm">${K.name}</span>${tag}</button>`;
      })
      .join('');
    return `<section class="shsec" data-sec="${r}"><header class="shhead"><b>${RARITY[r].name}装备</b><span>已拥有 ${got} / ${list.length}</span></header><div class="shgrid">${cards}</div></section>`;
  },

  // 货架滚动时左边目录亮起当前这一区，滚到底就亮最后一区。force：重画后不管变没变都刷一遍
  spyShelf(el, force) {
    const secs = [...el.querySelectorAll('.shsec')];
    if (!secs.length) return;
    let cur = secs[0].dataset.sec;
    for (const s of secs) if (s.offsetTop <= el.scrollTop + 30) cur = s.dataset.sec;
    if (el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = secs[secs.length - 1].dataset.sec;
    if (cur === this.shopSec && !force) return;
    this.shopSec = cur;
    for (const b of $('tab-shop').querySelectorAll('.snav button')) b.classList.toggle('on', b.dataset.id === cur);
  },

  // 把货架滚到某一区（顶对齐）或某张卡片（居中）。窄窗口下货架不单独滚动，滚的是整页
  scrollShelf(target, center) {
    const shelf = $('tab-shop').querySelector('.shelf');
    if (!shelf || !target) return;
    if (getComputedStyle(shelf).overflowY === 'visible') return target.scrollIntoView({ behavior: 'smooth', block: center ? 'center' : 'start' });
    const top = center ? target.offsetTop - (shelf.clientHeight - target.offsetHeight) / 2 : target.offsetTop - 8;
    shelf.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  },
};
