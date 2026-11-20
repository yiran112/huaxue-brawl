// 匹配和房间等待界面
import { MODES } from '../config.js';
import { pageTop } from '../quest.js';
import { $, hex, esc } from './common.js';

export const matchMethods = {
  copyInvite() {
    if (!this.roomId) return;
    const url = `${location.origin}${location.pathname}?room=${this.roomId}`;
    const btn = $('btnInvite');
    const done = () => {
      btn.textContent = '已复制';
      clearTimeout(this.inviteT);
      this.inviteT = setTimeout(() => (btn.textContent = '邀请好友'), 1500);
    };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        window.prompt('', url);
      }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  },

  // ---------- 联机匹配面板 ----------
  showMatch(b) {
    $('match').classList.toggle('hidden', !b);
  },

  // info: { status, error } 只显示一句状态；或 { players, me, host, max } 显示房间里的人
  setMatch(info) {
    const list = $('matchList');
    const status = $('matchStatus');
    const room = info.kind === 'room' || this.game.customRoom;
    status.classList.toggle('bad', !!info.error);
    $('matchTop').innerHTML = pageTop(room ? '房间' : '匹配对战', this.game.profile.coins);
    const note = $('matchNote');
    if (note) note.textContent = room ? '按房主选的玩法和赛道。空位可以继续进人，房主点开始后由机器人补齐。' : `${MODES[this.game.soloRules.mode] ? MODES[this.game.soloRules.mode].name : '道具赛'}，中等长度、随机场景。在线只有你时约 10 秒补机器人，人多最多等 30 秒；满员会提前开。比赛中途不能暂停。`;
    const go = $('btnStartNow');
    if (go) go.textContent = room ? '开始 ▶' : '立即开始 ▶';
    this.roomId = room && info.players && info.id ? info.id : 0;
    $('btnInvite').classList.toggle('hidden', !this.roomId);
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
  },

  // 公开匹配不打开面板，只把首页按钮改成匹配中
  setQueue(on, name) {
    this.queueing = !!on;
    this.queueAt = performance.now();
    this.queueLine = on ? '00:00' : '';
    this.queueName = on ? name || '' : '';
    this.paintGo();
    this.paintPill();
  },

  // 排队时去了别的界面：顶上正中挂一条「匹配中」，点它回到发起匹配的地方，点取消退出队列
  paintPill() {
    let el = $('queuePill');
    const g = this.game;
    const here = this.tab === 'race' && (!this.racePick || (this.racePick === 'rank' && g.rankMode));
    const show = this.queueing && !here && !$('menu').classList.contains('hidden');
    if (!el) {
      if (!show) return;
      el = document.createElement('div');
      el.id = 'queuePill';
      el.innerHTML = '<button type="button" class="qpGo"><i>⏳</i><b></b><small></small></button><button type="button" class="qpX">取消</button>';
      el.addEventListener('click', (e) => {
        if (e.target.closest('.qpX')) return g.leavePublicQueue();
        if (!e.target.closest('.qpGo')) return;
        if (this.tab !== 'race') this.openTab('race');
        this.racePick = g.rankMode ? 'rank' : null;
        this.modeSel = null;
        this.renderTab('race');
        this.paintPill();
      });
      document.body.appendChild(el);
    }
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const b = el.querySelector('b');
    const s = el.querySelector('small');
    const t = `匹配中 ${this.queueLine || '00:00'}`;
    if (b.textContent !== t) b.textContent = t;
    if (s.textContent !== this.queueName) s.textContent = this.queueName;
  },

  // 匹配中后面显示已经等了多久
  tickQueue() {
    if (!this.queueing) return;
    const s = Math.floor((performance.now() - this.queueAt) / 1000);
    const line = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const wait = document.getElementById('rankWait');
    if (wait) wait.textContent = `匹配中 ${line}`;
    if (line !== this.queueLine) {
      this.queueLine = line;
      this.paintGo();
    }
    this.paintPill();
  },

  goTitle() {
    return this.queueing ? `匹配中<span class="qtime">${this.queueLine || '00:00'}</span>` : '开始比赛';
  },

  paintGo() {
    const b = document.querySelector('#tab-race .hready');
    if (!b) return;
    b.classList.toggle('matching', !!this.queueing);
    const title = b.querySelector('b');
    if (title) title.innerHTML = this.goTitle();
  },

  // 开始比赛框：信息块右下角挖一个圆角缺口，大黄按钮嵌在里面，描边沿着缺口走。形状跟着实际尺寸算
  shapePlay(el) {
    if (this.playRO) this.playRO.disconnect();
    const pick = el.querySelector('.hplay .hpick');
    const go = el.querySelector('.hplay .hready');
    if (!pick || !go) return;
    const line = pick.querySelector('.hpline path');
    const draw = () => {
      const w = pick.offsetWidth;
      const h = pick.offsetHeight;
      if (!w || !h) return;
      const gap = pick.offsetLeft;
      const nx = go.offsetLeft - pick.offsetLeft - gap;
      const ny = go.offsetTop - pick.offsetTop - gap;
      const r = 12;
      const c = (parseFloat(getComputedStyle(go).borderTopLeftRadius) || 0) + gap;
      const d = `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${ny - r}A${r} ${r} 0 0 1 ${w - r} ${ny}H${nx + c}A${c} ${c} 0 0 0 ${nx} ${ny + c}`
        + `V${h - r}A${r} ${r} 0 0 1 ${nx - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
      pick.style.clipPath = `path('${d}')`;
      line.setAttribute('d', d);
    };
    draw();
    this.playRO = new ResizeObserver(draw);
    this.playRO.observe(pick);
    this.playRO.observe(go);
  },

  // 匹配倒计时
  tickMatch(ms) {
    if (!this.matchText) return;
    const s = Math.max(0, Math.ceil(ms / 1000));
    const tail = this.matchReason === 'host' ? '等人中 · 房主点开始后开赛' : this.matchReason === 'fill' ? (s > 0 ? `${s} 秒后机器人补位开赛` : '机器人正在进场…') : s > 0 ? `${s} 秒后开赛` : '即将开赛…';
    const text = `${this.matchText} · ${tail}`;
    const el = $('matchStatus');
    if (el.textContent !== text) el.textContent = text;
  },
};
