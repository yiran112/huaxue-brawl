// 账号：游客从第一秒起就是一条记录，创建账号是给它补上用户名和密码，登录是换成另一条。
// 进度存在 SQLite。浏览器只留一把钥匙（随机串），服务器只存这把钥匙的哈希。
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Profile, sanitizeProfile, seasonNow, rankSeasonNow, cleanNick, START_COINS } from '../src/profile.js';
import { settle, MAX_OPS } from './ledger.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sha(token) {
  return createHash('sha256').update(token).digest('hex');
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  const hash = scryptSync(password, salt, expected.length, SCRYPT);
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

function validName(name) {
  return typeof name === 'string' && /^[\u4e00-\u9fffA-Za-z0-9_]{2,12}$/.test(name);
}

// 新存档：和浏览器第一次打开游戏时一样（带开局雪花币）
const blankProfile = (boxSeed) => ({ ...sanitizeProfile({ coins: START_COINS }), boxSeed });

function readJson(req, limit = 80000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new HttpError(413, '存档太大'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!n) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求格式不对'));
      }
    });
    req.on('error', () => reject(new HttpError(400, '请求中断了')));
  });
}

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

// 离上次保存越久，允许一次提交的涨幅越大，这样离线打完再连上也能写回去。
function budget(updatedAt) {
  const hours = Math.min(48, Math.max(0, (Date.now() - (updatedAt || 0)) / 3600000));
  return {
    coins: Math.round(2000 + 8000 * hours),
    xp: Math.round(3000 + 12000 * hours),
    races: Math.max(2, Math.round(2 + 15 * hours)),
    skill: Math.round(200000 + 3000000 * hours),
    stat: Math.round(5000 + 50000 * hours),
  };
}

export function deltaTooBig(prev, next, updatedAt) {
  if (!prev) return false;
  const b = budget(updatedAt);
  const over = (a, c, max) => c > a + max;
  if (over(prev.coins || 0, next.coins || 0, b.coins)) return true;
  if (over(prev.xp || 0, next.xp || 0, b.xp)) return true;
  // 改装币：一局最多九十多，再加每日任务和旧档补发的那一份
  if (over(prev.parts || 0, next.parts || 0, b.races * 100 + 400)) return true;
  const prevS = prev.season || {};
  const nextS = next.season || {};
  const capP = b.races * 20;
  const capH = b.races * 40;
  if ((nextS.id | 0) === (prevS.id | 0)) {
    if (over(prevS.points || 0, nextS.points || 0, capP)) return true;
    if (over(prevS.hits || 0, nextS.hits || 0, capH)) return true;
  } else if ((nextS.points || 0) > capP || (nextS.hits || 0) > capH) return true;
  // 排位一局最多 +36（名次 + 今日首胜），留一点余量
  if (over((prev.rank && prev.rank.pts) || 0, (next.rank && next.rank.pts) || 0, b.races * 40)) return true;
  // 进行中的排位不能凭空抹掉：清掉标记时必须同时多结算一局
  const pr = prev.rank || {};
  const nr = next.rank || {};
  if (pr.pending && !nr.pending && (nr.games | 0) <= (pr.games | 0)) return true;
  const ps = prev.stats || {};
  const ns = next.stats || {};
  if (over(ps.races || 0, ns.races || 0, b.races)) return true;
  if (over(ps.skill || 0, ns.skill || 0, b.skill)) return true;
  for (const k of Object.keys(ns)) {
    if (k === 'skill' || k === 'races' || k.startsWith('max') || k.startsWith('best')) continue;
    if (over(ps[k] || 0, ns[k] || 0, b.stat)) return true;
  }
  return false;
}

export function createAccount(opts = {}) {
  const dir = opts.dir || process.env.HUAXUE_DATA || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'account.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      name_key TEXT,
      password_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_name_key ON users(name_key) WHERE name_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ops_done (
      user_id TEXT NOT NULL,
      op_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (user_id, op_id)
    );
  `);
  db.prepare('DELETE FROM sessions WHERE last_seen < ?').run(Date.now() - 180 * 86400000);
  db.prepare('DELETE FROM ops_done WHERE at < ?').run(Date.now() - 60 * 86400000);

  // 浏览器没收到回复会把同一批操作再交一次：交过的（按操作编号）跳过
  const opId = (o) => (o && typeof o.id === 'string' ? o.id.slice(0, 24) : '');
  function freshOps(userId, ops) {
    const list = Array.isArray(ops) ? ops.slice(0, MAX_OPS) : [];
    const seen = db.prepare('SELECT 1 FROM ops_done WHERE user_id = ? AND op_id = ?');
    return list.filter((o) => !opId(o) || !seen.get(userId, opId(o)));
  }
  function markOps(userId, ops) {
    const ins = db.prepare('INSERT OR IGNORE INTO ops_done (user_id, op_id, at) VALUES (?, ?, ?)');
    const now = Date.now();
    for (const o of ops) if (opId(o)) ins.run(userId, opId(o), now);
  }

  const dummy = hashPassword('not-a-real-password');
  const buckets = new Map();
  let boardCache = { at: 0, season: 0, rows: [] };

  function leaderboardRows(seasonId) {
    const now = Date.now();
    if (boardCache.season === seasonId && now - boardCache.at < 15000) return boardCache.rows;
    const all = db.prepare(
      `SELECT u.id AS id, u.username AS username, p.json AS json
       FROM profiles p JOIN users u ON u.id = p.user_id`
    ).all();
    const rankSeason = rankSeasonNow().id;
    const rows = [];
    for (const row of all) {
      let profile;
      try {
        profile = JSON.parse(row.json);
      } catch {
        continue;
      }
      if (!profile) continue;
      const s = profile.season && (profile.season.id | 0) === seasonId ? profile.season : {};
      const points = s.points | 0;
      const hits = s.hits | 0;
      const tt = Number(s.tt) || 0;
      // 段位榜只看本段位赛季打过排位的人
      const r = profile.rank;
      const rankGames = r && (r.season | 0) === rankSeason ? Math.max(0, (r.sg == null ? r.games : r.sg) | 0) : 0;
      const rankPts = rankGames ? Math.max(0, r.pts | 0) : 0;
      if (points <= 0 && hits <= 0 && !(tt > 0) && !rankGames) continue;
      rows.push({
        id: row.id,
        name: cleanNick(profile.name) || row.username || '游客',
        title: typeof profile.title === 'string' ? profile.title.slice(0, 12) : '',
        points,
        hits,
        tt: tt > 0 && tt < 20 ? Math.round(tt * 1000) / 1000 : 0,
        ttTime: Number(s.ttTime) || 0,
        ttTrack: typeof s.ttTrack === 'string' ? s.ttTrack : '',
        rankPts,
        rankGames,
      });
    }
    boardCache = { at: now, season: seasonId, rows };
    return rows;
  }

  function getLeaderboard(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const asked = parseInt(url.searchParams.get('season') || '', 10);
    const now = seasonNow();
    const seasonId = Number.isFinite(asked) && asked > 0 ? asked : now.id;
    const auth = userByToken(bearer(req));
    const rows = leaderboardRows(seasonId).map((r) => ({
      name: r.name,
      title: r.title,
      points: r.points,
      hits: r.hits,
      tt: r.tt,
      ttTime: r.ttTime,
      ttTrack: r.ttTrack,
      rankPts: r.rankPts,
      rankGames: r.rankGames,
      me: !!(auth && auth.id === r.id),
    }));
    const rs = rankSeasonNow();
    send(res, 200, { season: { id: now.id, left: now.left }, rankSeason: { id: rs.id, left: rs.left }, rows });
  }

  function limit(ip, action, max, windowMs) {
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.t) buckets.delete(k);
    }
    const key = `${ip}|${action}`;
    let b = buckets.get(key);
    if (!b || now > b.t) b = { n: 0, t: now + windowMs };
    b.n += 1;
    buckets.set(key, b);
    if (b.n > max) throw new HttpError(429, '操作太频繁，过一会儿再试');
  }

  function ipOf(req) {
    return req.socket?.remoteAddress || 'local';
  }

  function bearer(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(h);
    return m ? m[1] : '';
  }

  function userByToken(token) {
    if (!token) return null;
    const row = db.prepare(
      `SELECT u.id AS id, u.username AS username, u.password_hash AS password_hash, s.token_hash AS token_hash
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    ).get(sha(token));
    if (!row) return null;
    db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
    return row;
  }

  const newSeed = () => 1 + (randomBytes(4).readUInt32LE(0) % 0x7ffffffe);

  function loadProfile(userId) {
    const row = db.prepare('SELECT json, revision, updated_at FROM profiles WHERE user_id = ?').get(userId);
    if (!row) return { profile: blankProfile(newSeed()), revision: 0, updatedAt: 0 };
    let profile;
    try {
      profile = JSON.parse(row.json);
    } catch {
      profile = sanitizeProfile(null);
    }
    // 老存档还没有补给箱种子：发一个，浏览器下次拿到存档时就跟服务器开出一样的东西
    if (!profile.boxSeed) {
      profile.boxSeed = newSeed();
      db.prepare('UPDATE profiles SET json = ? WHERE user_id = ?').run(JSON.stringify(profile), userId);
    }
    return { profile, revision: row.revision, updatedAt: row.updated_at };
  }

  // 上一周积分榜上的名次，和浏览器里的排法一样：积分高的在前，同分按名字
  function seasonRankOf(userId, seasonId) {
    const rows = leaderboardRows(seasonId)
      .filter((r) => r.points > 0)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh'));
    const i = rows.findIndex((r) => r.id === userId);
    return i >= 0 ? i + 1 : 0;
  }

  // 联机核对装备：按服务器上的存档看这个人有哪些装备、外观，强化到几级
  function gearOf(token) {
    const auth = typeof token === 'string' && token ? userByToken(token) : null;
    if (!auth) return null;
    const p = new Profile();
    p.loadData(loadProfile(auth.id).profile);
    return p;
  }

  function publicUser(row, token) {
    const saved = loadProfile(row.id);
    const out = { username: row.username || null, revision: saved.revision, profile: saved.profile };
    if (token) out.token = token;
    return out;
  }

  function issueToken(userId) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)').run(sha(token), userId, now, now);
    return token;
  }

  async function postGuest(req, res) {
    limit(ipOf(req), 'guest', 30, 10 * 60 * 1000);
    const existing = userByToken(bearer(req));
    const body = await readJson(req);
    if (existing) return send(res, 200, publicUser(existing));
    // 新游客从空白存档开始，把这台设备上离线时记下的操作重做一遍
    const id = randomBytes(16).toString('hex');
    const now = Date.now();
    const seed = body.profile && Number(body.profile.boxSeed);
    const fresh = blankProfile(seed > 0 && seed < 0x7fffffff ? Math.floor(seed) : newSeed());
    let profile = settle(fresh, body, () => 0);
    const first = Array.isArray(body.ops) && body.ops.length ? Number(body.ops[0].at) || now : now;
    if (deltaTooBig(fresh, profile, Math.max(now - 12 * 3600000, Math.min(now, first)))) profile = settle(fresh, { profile: body.profile }, () => 0);
    db.prepare('INSERT INTO users (id, username, name_key, password_hash, created_at) VALUES (?, NULL, NULL, NULL, ?)').run(id, now);
    db.prepare('INSERT INTO profiles (user_id, json, revision, updated_at) VALUES (?, ?, 1, ?)').run(id, JSON.stringify(profile), now);
    const token = issueToken(id);
    send(res, 200, { token, username: null, revision: 1, profile });
  }

  function getMe(req, res) {
    const auth = userByToken(bearer(req));
    if (!auth) throw new HttpError(401, '登录已失效，请重新进入');
    send(res, 200, publicUser(auth));
  }

  async function postUpgrade(req, res) {
    limit(ipOf(req), 'upgrade', 10, 60 * 1000);
    const auth = userByToken(bearer(req));
    if (!auth) throw new HttpError(401, '请先以游客身份进入');
    if (auth.username) throw new HttpError(409, '这个账号已经是正式账号了');
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validName(username)) throw new HttpError(400, '用户名用 2 到 12 位中文、字母或数字');
    if (password.length < 6 || password.length > 64) throw new HttpError(400, '密码至少 6 位');
    const key = username.toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE name_key = ?').get(key)) throw new HttpError(409, '这个名字已经有人用了');
    db.prepare('UPDATE users SET username = ?, name_key = ?, password_hash = ? WHERE id = ?').run(username, key, hashPassword(password), auth.id);
    send(res, 200, { username });
  }

  async function postLogin(req, res) {
    limit(ipOf(req), 'login', 10, 60 * 1000);
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const row = validName(username)
      ? db.prepare('SELECT id, username, password_hash FROM users WHERE name_key = ?').get(username.toLowerCase())
      : null;
    let ok = false;
    if (row && row.password_hash && password.length >= 6 && password.length <= 64) ok = verifyPassword(password, row.password_hash);
    else verifyPassword(password.slice(0, 64) || 'x', dummy);
    if (!ok) throw new HttpError(401, '用户名或密码不对');
    const token = issueToken(row.id);
    send(res, 200, publicUser(row, token));
  }

  async function putProfile(req, res) {
    limit(ipOf(req), 'profile', 120, 60 * 1000);
    const auth = userByToken(bearer(req));
    if (!auth) throw new HttpError(401, '登录已失效，请重新进入');
    const body = await readJson(req);
    const saved = loadProfile(auth.id);
    const ops = freshOps(auth.id, body.ops);
    const next = settle(saved.profile, { ...body, ops }, (sid) => seasonRankOf(auth.id, sid));
    if (saved.revision && JSON.stringify(saved.profile) === JSON.stringify(next)) {
      markOps(auth.id, ops);
      return send(res, 200, { revision: saved.revision, profile: saved.profile });
    }
    if (deltaTooBig(saved.profile, next, saved.updatedAt)) {
      return send(res, 409, {
        error: '这次存档变化太大，已保留服务器上的进度',
        profile: saved.profile,
        revision: saved.revision,
      });
    }
    const now = Date.now();
    const revision = (saved.revision || 0) + 1;
    const json = JSON.stringify(next);
    if (saved.revision) {
      db.prepare('UPDATE profiles SET json = ?, revision = ?, updated_at = ? WHERE user_id = ?').run(json, revision, now, auth.id);
    } else {
      db.prepare('INSERT INTO profiles (user_id, json, revision, updated_at) VALUES (?, ?, ?, ?)').run(auth.id, json, revision, now);
    }
    markOps(auth.id, ops);
    boardCache = { at: 0, season: 0, rows: [] };
    send(res, 200, { revision, profile: next });
  }

  async function handle(req, res) {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      const method = req.method || 'GET';
      if (method === 'POST' && pathname === '/api/guest') return await postGuest(req, res);
      if (method === 'GET' && pathname === '/api/me') return getMe(req, res);
      if (method === 'POST' && pathname === '/api/account') return await postUpgrade(req, res);
      if (method === 'POST' && pathname === '/api/login') return await postLogin(req, res);
      if (method === 'PUT' && pathname === '/api/profile') return await putProfile(req, res);
      if (method === 'GET' && pathname === '/api/leaderboard') return getLeaderboard(req, res);
      send(res, 404, { error: '没有这个接口' });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? '服务器出错了' : e.message });
    }
  }

  return { handle, db, gearOf };
}
