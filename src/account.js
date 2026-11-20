// 游客钥匙存在这台浏览器里。没有钥匙就先建一条游客；创建账号是给当前游客补上用户名和密码。
import { START_COINS, START_PARTS, NAME_RE, isAutoNick, sanitizeProfile } from './profile.js';

const TOKEN_KEY = 'huaxue_token';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function profilePlayed(d) {
  if (!d) return false;
  if ((d.xp | 0) > 0) return true;
  if (d.stats && (d.stats.races | 0) > 0) return true;
  if (d.coins != null && d.coins !== START_COINS) return true;
  if (d.parts != null && d.parts !== START_PARTS) return true;
  if (d.owned && Object.keys(d.owned).some((k) => d.owned[k])) return true;
  if (d.ach && Object.keys(d.ach).length) return true;
  if (d.cups && Object.values(d.cups).some((n) => n > 0)) return true;
  if (d.chal && Object.keys(d.chal).length) return true;
  return false;
}

// 还没交给服务器重算的操作，存在这台设备上（断网、关网页也不丢）
const OPS_KEY = 'huaxue_ops_v1';
const OPS_MAX = 500;
const SEND_MAX = 50; // 和服务器 MAX_OPS 对应，一次少发一点

function loadOps() {
  try {
    const v = JSON.parse(localStorage.getItem(OPS_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 两份存档里服务器说了算的部分是否一致（键的顺序不算）
const sorted = (o) => Object.keys(o || {}).sort().map((k) => [k, o[k] && typeof o[k] === 'object' ? sorted(o[k]) : o[k]]);
function ledgerOf(raw) {
  if (!raw) return '';
  const d = sanitizeProfile(raw);
  const r = d.rank || {};
  const s = d.season || {};
  return JSON.stringify([d.coins | 0, d.xp | 0, sorted(d.owned), sorted(d.up), d.boxN | 0, d.boxSeed | 0, r.pts | 0, r.games | 0, r.pending ? r.pending.mode : '', d.daily, s.id | 0, s.points | 0, s.hits | 0, d.stats ? d.stats.races | 0 : 0, Object.keys(d.ach || {}).sort()]);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: true,
    });
  } catch {
    const err = new Error('连不上存档服务器');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || '存档服务器没有响应');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function fetchLeaderboard(token, season) {
  const q = season ? `?season=${season}` : '';
  return api('/api/leaderboard' + q, { token });
}

export class Account {
  constructor(game) {
    this.game = game;
    this.token = '';
    try {
      this.token = localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      this.token = '';
    }
    this.username = '';
    this.revision = 0;
    this.ready = false;
    this.dirty = false;
    this.ops = loadOps();
    game.profile.onOp = (op) => this.addOp(op);
    this.sending = false;
    this.timer = 0;
    this.gate = true;
    this.pane = 'guest';
    this.busy = false;
    this.box = document.getElementById('accountBox');
    document.getElementById('account').addEventListener('click', (e) => this.onClick(e));
    document.getElementById('profileWrap').addEventListener('click', (e) => {
      if (e.target.closest('[data-act="account"]')) this.openManage();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || document.getElementById('account').classList.contains('hidden') || this.gate) return;
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  label() {
    if (!this.ready) return '存档';
    return this.game.playerName || this.username || '游客';
  }

  show() {
    document.getElementById('account').classList.remove('hidden');
  }

  hide() {
    document.getElementById('account').classList.add('hidden');
    this.gate = false;
  }

  addOp(op) {
    if (this.ops.length >= OPS_MAX) return;
    this.ops.push({ ...op, at: Date.now(), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10) });
    this.saveOps();
  }

  saveOps() {
    try {
      if (this.ops.length) localStorage.setItem(OPS_KEY, JSON.stringify(this.ops));
      else localStorage.removeItem(OPS_KEY);
    } catch {
      /* 存不下就只留在内存里 */
    }
  }

  clearOps() {
    this.ops = [];
    this.saveOps();
  }

  noteChanged() {
    if (!this.ready) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 600);
  }

  // 把存档和攒下的操作交给服务器。服务器重算的结果和本地对不上（比如有操作被拒），就改用服务器那份
  async flush() {
    if (!this.ready || !this.dirty || this.sending) return;
    this.sending = true;
    this.dirty = false;
    clearTimeout(this.timer);
    const ops = this.ops.slice(0, SEND_MAX);
    try {
      const data = await api('/api/profile', {
        method: 'PUT',
        token: this.token,
        body: { profile: this.game.profile.data, ops, revision: this.revision },
      });
      this.revision = data.revision | 0;
      this.ops.splice(0, ops.length);
      this.saveOps();
      if (this.ops.length) this.dirty = true;
      else if (data.profile && ledgerOf(data.profile) !== ledgerOf(this.game.profile.data)) this.game.adoptProfile(data.profile);
    } catch (e) {
      if (e.status === 409 && e.data && e.data.profile) {
        this.dirty = false;
        this.revision = e.data.revision | 0;
        this.clearOps();
        this.game.adoptProfile(e.data.profile);
        this.game.ui.toast(e.message, true);
      } else {
        this.dirty = true;
      }
    } finally {
      this.sending = false;
      if (this.dirty) this.noteChanged();
    }
  }

  storeToken(token) {
    this.token = token || '';
    try {
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* 隐私模式写不了就算了 */
    }
  }

  // 收下服务器返回的账号。有 profile 时用它换掉本地存档；sent 是这次一起交上去的操作条数，剩下的接着交
  take(data, sent = Infinity) {
    if (data.token) this.storeToken(data.token);
    this.username = data.username || '';
    this.revision = data.revision | 0;
    this.ready = true;
    this.dirty = false;
    this.gate = false;
    if (data.profile) {
      this.ops.splice(0, sent);
      this.saveOps();
      this.game.adoptProfile(data.profile);
      if (this.ops.length) this.noteChanged();
    } else this.game.ui.refreshProfile();
  }

  async boot() {
    this.show();
    try {
      if (this.token) {
        const me = await api('/api/me', { token: this.token });
        // 上次有没交上去的操作（断网时打的比赛、买的东西）：先在服务器那份存档上重做
        if (this.ops.length) {
          this.username = me.username || '';
          this.revision = me.revision | 0;
          this.ready = true;
          this.dirty = true;
          await this.flush();
          this.hide();
          this.game.ui.refreshProfile();
          this.game.ui.refreshBoard();
          return;
        }
        this.take(me);
        this.hide();
        this.game.ui.refreshBoard();
        return;
      }
    } catch (e) {
      if (e.status === 401) this.storeToken('');
      else {
        this.renderOffline(e.message);
        this.game.ui.refreshBoard();
        return;
      }
    }
    this.gate = true;
    this.pane = 'guest';
    this.render();
    this.game.ui.refreshBoard();
  }

  openManage() {
    if (this.gate && !document.getElementById('account').classList.contains('hidden')) return;
    if (!this.ready) {
      this.game.ui.toast('正在连接存档服务器');
      return;
    }
    this.gate = false;
    this.pane = 'name';
    this.render();
    this.show();
  }

  saveNick() {
    const el = document.getElementById('accNick');
    const name = el ? el.value.trim() : '';
    if (!NAME_RE.test(name)) return this.setErr('昵称用 2 到 12 位中文、字母或数字');
    this.game.setName(name);
    this.game.ui.refreshProfile();
    this.game.ui.refreshBoard();
    this.hide();
  }

  async onGuest() {
    if (this.busy) return;
    this.busy = true;
    this.box.classList.add('busy');
    this.setErr('');
    try {
      const data = await api('/api/guest', { method: 'POST', body: { profile: this.game.profile.data, ops: this.ops.slice(0, SEND_MAX) } });
      this.take(data, SEND_MAX);
      this.hide();
    } catch (e) {
      this.setErr(e.message);
    } finally {
      this.busy = false;
      this.box.classList.remove('busy');
    }
  }

  async onCreate() {
    if (this.busy || this.username) return;
    const username = document.getElementById('accName')?.value.trim() || '';
    const password = document.getElementById('accPass')?.value || '';
    const again = document.getElementById('accPass2')?.value || '';
    if (!/^[\u4e00-\u9fffA-Za-z0-9_]{2,12}$/.test(username)) return this.setErr('用户名用 2 到 12 位中文、字母或数字');
    if (password.length < 6) return this.setErr('密码至少 6 位');
    if (password !== again) return this.setErr('两次输入的密码不一样');
    this.busy = true;
    this.box.classList.add('busy');
    this.setErr('');
    try {
      if (!this.ready) {
        const guest = await api('/api/guest', { method: 'POST', body: { profile: this.game.profile.data, ops: this.ops.slice(0, SEND_MAX) } });
        this.take(guest, SEND_MAX);
      } else {
        await this.flush();
        if (this.dirty) throw new Error('进度还没保存成功，稍后再试');
      }
      const data = await api('/api/account', { method: 'POST', token: this.token, body: { username, password } });
      this.username = data.username;
      if (isAutoNick(this.game.playerName)) this.game.setName(data.username);
      this.game.ui.refreshProfile();
      if (this.game.ui.tab === 'race') this.game.ui.renderTab('race');
      this.hide();
      this.game.ui.toast(`已升级为正式账号：${data.username}`);
    } catch (e) {
      if (this.ready) {
        this.gate = false;
        this.render();
      }
      this.setErr(e.message);
    } finally {
      this.busy = false;
      this.box.classList.remove('busy');
    }
  }

  async onLogin() {
    if (this.busy) return;
    const username = document.getElementById('accName')?.value.trim() || '';
    const password = document.getElementById('accPass')?.value || '';
    if (!username || !password) return this.setErr('请填写用户名和密码');
    this.busy = true;
    this.box.classList.add('busy');
    this.setErr('');
    try {
      if (this.ready && !this.username) {
        await this.flush();
        if (this.dirty) throw new Error('游客进度还没保存成功，稍后再进入');
      } else if (this.ready) await this.flush();
      const data = await api('/api/login', { method: 'POST', body: { username, password } });
      this.take(data);
      this.hide();
      this.game.ui.toast(`已进入账号：${data.username}`);
    } catch (e) {
      this.setErr(e.message);
    } finally {
      this.busy = false;
      this.box.classList.remove('busy');
    }
  }

  playOffline() {
    this.ready = false;
    this.gate = false;
    this.hide();
    this.game.ui.toast('连不上存档服务器，进度先留在这台设备上', true);
  }

  onClick(e) {
    const tab = e.target.closest('[data-pane]');
    if (tab) {
      this.pane = tab.dataset.pane;
      this.render();
      return;
    }
    const act = e.target.closest('[data-acc]')?.dataset.acc;
    if (act === 'guest') this.onGuest();
    else if (act === 'create') this.onCreate();
    else if (act === 'login') this.onLogin();
    else if (act === 'nick') this.saveNick();
    else if (act === 'close' && !this.gate) this.hide();
    else if (act === 'offline') this.playOffline();
  }

  setErr(msg) {
    const el = document.getElementById('accountErr');
    if (el) el.textContent = msg || '';
  }

  renderOffline(msg) {
    document.getElementById('accountTitle').textContent = '存档服务器没连上';
    document.getElementById('accountClose').classList.add('hidden');
    document.getElementById('accountTabs').innerHTML = '';
    document.getElementById('accountBody').innerHTML =
      `<p class="note" style="margin-top:0">${esc(msg || '连不上存档服务器')}。可以先用这台设备上的进度玩，连上之后再保存。</p>` +
      `<button type="button" class="btn go" data-acc="offline">先在这台设备上玩</button>`;
    this.setErr('');
    this.show();
  }

  warnText() {
    const played = profilePlayed(this.game.profile.data);
    if (!this.ready && this.pane === 'login' && played) {
      return '这台设备上已经有进度。直接进入会改用那个账号的存档，当前进度不会上传。想留住的话，先选游客。';
    }
    if (this.ready && this.pane === 'login') {
      return this.username
        ? '进入后，这台浏览器会改用那个账号的存档。'
        : '进入后，这台浏览器会改用那个账号的存档。当前游客进度还在服务器上，但这台设备不再打开它。';
    }
    return '';
  }

  render() {
    const gate = this.gate;
    document.getElementById('accountTitle').textContent = gate ? '欢迎来滑雪' : this.username ? '账号' : '升级账号';
    document.getElementById('accountClose').classList.toggle('hidden', gate);
    const tabs = gate
      ? [['guest', '游客'], ['login', '进入'], ['create', '创建账号']]
      : this.username
        ? [['name', '昵称'], ['login', '进入']]
        : [['name', '昵称'], ['create', '升级账号'], ['login', '进入']];
    if (!tabs.some(([id]) => id === this.pane)) this.pane = tabs[0][0];
    document.getElementById('accountTabs').innerHTML = tabs
      .map(([id, name]) => `<button type="button" data-pane="${id}" class="${id === this.pane ? 'on' : ''}">${name}</button>`)
      .join('');
    document.getElementById('accountBody').innerHTML = this.paneHtml();
    this.setErr('');
  }

  paneHtml() {
    if (this.pane === 'name') {
      return `<div class="acctField"><label for="accNick">昵称</label><input id="accNick" maxlength="12" value="${esc(this.game.playerName || '')}" /></div>
        <button type="button" class="btn go" data-acc="nick">保存</button>`;
    }
    if (this.pane === 'guest') {
      return `<div class="acctLine"><span>⛷️</span><div>不用注册，现在就能滑。</div></div>
        <div class="acctLine"><span>💾</span><div>进度保存在服务器上，跟这台设备绑在一起。</div></div>
        <div class="acctLine"><span>🔑</span><div>以后可以升级成正式账号，进度还在。</div></div>
        <button type="button" class="btn go" data-acc="guest">以游客身份开滑</button>`;
    }
    if (this.pane === 'create') {
      if (this.username) return `<p class="note" style="margin-top:0">当前账号是 <b>${esc(this.username)}</b>。要换一个账号，用「进入」。</p>`;
      return `${this.fields(true)}
        <p class="note">升级之后，现在这份等级、雪花币和装备都留在这个账号上。换一台设备时用这个用户名和密码进入。</p>
        <button type="button" class="btn go" data-acc="create">${this.ready ? '升级为正式账号' : '创建账号'}</button>`;
    }
    const warn = this.warnText();
    const who = this.username ? `<p class="note" style="margin-top:0">当前账号是 <b>${esc(this.username)}</b>。</p>` : '';
    return `${who}${warn ? `<p class="acctWarn">${esc(warn)}</p>` : ''}${this.fields(false)}
      <button type="button" class="btn go" data-acc="login">进入</button>`;
  }

  fields(again) {
    return `<div class="acctField"><label for="accName">用户名</label><input id="accName" maxlength="12" autocomplete="username" /></div>
      <div class="acctField"><label for="accPass">密码</label><input id="accPass" type="password" maxlength="64" autocomplete="${again ? 'new-password' : 'current-password'}" /></div>
      ${again ? '<div class="acctField"><label for="accPass2">再输入一次密码</label><input id="accPass2" type="password" maxlength="64" autocomplete="new-password" /></div>' : ''}`;
  }
}
