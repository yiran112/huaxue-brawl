// 玩家存档与成长：等级经验、雪花币、改装币、解锁购买、装备改装、每日任务、成就、生涯数据、结算奖励。
// 浏览器里留一份缓存；账号登录之后，服务器上的那份为准（见 src/account.js）。
import { DEFAULT_HAT, MODE_KEYS, MODES, POINTS } from './config.js';
import { rarityToken } from './icon-art.js';
import { GEAR, GEAR_KEYS, RARITY, UPGRADES, UP_KEYS, UP_MAX, UP_COST, COSMETIC_SLOTS, BOX_COST, BOX_REFUND, BOX_POOL, rollBox, unlockOf } from './gear.js';
import { CUPS, TRACKS, medalTimes } from './tracks.js';
import { RANK_LV, RANK_MAP, tierAt, scoreRank, scoreLeave, localDay } from './rank.js';
import { mulberry32 } from './util.js';

const LS = 'huaxue_profile_v1';
export const MAX_LV = 60;
export const CUP_LV = [0, 4, 8, 12]; // 赛道分组按等级解锁
export const START_COINS = 300;
export const START_PARTS = 300; // 改装币：只用来改装，比赛和每日任务里拿
// 从 lv 升到 lv+1 需要的经验
export const xpNeed = (lv) => 150 + (lv - 1) * 60;

export const TASK_XP = 80;
export const TASK_COINS = 60;
export const TASK_PARTS = 50;
export const TASK_BONUS = 150; // 当天三个任务全做完的额外奖励
export const TASK_BONUS_PARTS = 100;

// key：对应一局比赛统计里的字段（modes 特殊处理：当天玩过几种模式）
export const TASKS = [
  { id: 'race3', name: '完成 3 场比赛', goal: 3, key: 'races' },
  { id: 'hit5', name: '击飞对手 5 次', goal: 5, key: 'hits' },
  { id: 'flip10', name: '完成 10 次空翻', goal: 10, key: 'flips' },
  { id: 'drift8', name: '触发 8 次漂移喷射', goal: 8, key: 'driftBoosts' },
  { id: 'short2', name: '成功抄近道 2 次', goal: 2, key: 'shortcuts' },
  { id: 'podium2', name: '拿到 2 次前三名', goal: 2, key: 'podiums' },
  { id: 'win1', name: '赢得 1 场比赛', goal: 1, key: 'wins' },
  { id: 'modes2', name: '玩 2 种不同的模式', goal: 2, key: 'modes' },
  { id: 'pad6', name: '冲过 6 条加速带', goal: 6, key: 'pads' },
  { id: 'cup1', name: '完成 1 场排位赛', goal: 1, key: 'cupRaces' },
  { id: 'chain4', name: '结算 1 条 ×4 以上的技巧链', goal: 1, key: 'chain4' },
  { id: 'skill20k', name: '累计拿到 20000 技巧分', goal: 20000, key: 'skill' },
  { id: 'spin5', name: '完成 5 次转体', goal: 5, key: 'spins' },
  { id: 'grab5', name: '完成 5 次抓板', goal: 5, key: 'grabs' },
];
const TASK_MAP = Object.fromEntries(TASKS.map((t) => [t.id, t]));

// test(stats, profile)
export const ACHIEVEMENTS = [
  { id: 'first', name: '初出茅庐', desc: '完成第一场比赛', test: (s) => s.races >= 1, coins: 100 },
  { id: 'win1', name: '首胜', desc: '赢得一场比赛（至少 4 人参赛）', test: (s) => s.wins >= 1, coins: 150, title: '新星' },
  { id: 'win10', name: '常胜将军', desc: '累计赢得 10 场比赛', test: (s) => s.wins >= 10, coins: 400, title: '常胜将军' },
  { id: 'win50', name: '雪山之王', desc: '累计赢得 50 场比赛', test: (s) => s.wins >= 50, coins: 1000, title: '雪山之王' },
  { id: 'race20', name: '老司机', desc: '完成 20 场比赛', test: (s) => s.races >= 20, coins: 300 },
  { id: 'race100', name: '雪场常客', desc: '完成 100 场比赛', test: (s) => s.races >= 100, coins: 800, title: '雪场常客' },
  { id: 'hit1', name: '第一滴血', desc: '第一次击飞对手', test: (s) => s.hits >= 1, coins: 80 },
  { id: 'hit100', name: '人间大炮', desc: '累计击飞对手 100 次', test: (s) => s.hits >= 100, coins: 500, title: '人间大炮' },
  { id: 'hit500', name: '战争机器', desc: '累计击飞对手 500 次', test: (s) => s.hits >= 500, coins: 1200, title: '战争机器' },
  { id: 'flip3', name: '三周跳', desc: '单次腾空完成 3 圈空翻', test: (s) => s.maxFlip >= 3, coins: 300, title: '空翻大师' },
  { id: 'flip200', name: '翻滚吧', desc: '累计完成 200 次空翻', test: (s) => s.flips >= 200, coins: 500 },
  { id: 'spin3', name: '陀螺', desc: '单次腾空完成 1080 度转体', test: (s) => s.maxSpin >= 3, coins: 300 },
  { id: 'grab2', name: '抓得稳', desc: '一次抓板 2 秒以上并稳稳落地', test: (s) => s.maxGrab >= 2, coins: 200 },
  { id: 'chain5', name: '连招入门', desc: '结算一条 ×5 的技巧链', test: (s) => s.bestMult >= 5, coins: 150 },
  { id: 'chain10', name: '技巧链大师', desc: '结算一条 ×10 满倍率的技巧链', test: (s) => s.bestMult >= 10, coins: 600, title: '连招大师' },
  { id: 'chain30k', name: '一气呵成', desc: '单条技巧链结算 30000 分', test: (s) => s.bestChain >= 30000, coins: 500, title: '一气呵成' },
  { id: 'skill1m', name: '花式百万', desc: '累计拿到 1,000,000 技巧分', test: (s) => s.skill >= 1e6, coins: 1000 },
  { id: 'speed180', name: '风驰电掣', desc: '贴地滑行时速达到 180 km/h', test: (s) => s.maxSpeed >= 180, coins: 200 },
  { id: 'speed230', name: '音障边缘', desc: '贴地滑行时速达到 230 km/h', test: (s) => s.maxSpeed >= 230, coins: 500, title: '速度狂人' },
  { id: 'air3', name: '滞空王', desc: '单次腾空超过 3 秒', test: (s) => s.maxAir >= 3, coins: 300 },
  { id: 'short20', name: '抄近道专家', desc: '累计成功抄近道 20 次', test: (s) => s.shortcuts >= 20, coins: 400, title: '路线鬼才' },
  { id: 'clean', name: '不沾雪', desc: '一场比赛不被击飞并拿到第一（至少 4 人）', test: (s) => s.cleanWins >= 1, coins: 500, title: '不沾雪' },
  { id: 'lv10', name: '小有名气', desc: '达到 10 级', test: (s, p) => p.level >= 10, coins: 500 },
  { id: 'lv20', name: '雪坛名宿', desc: '达到 20 级', test: (s, p) => p.level >= 20, coins: 1000, title: '雪坛名宿' },
  { id: 'gearAll', name: '装备收藏家', desc: '拥有双板、单板、雪橇和充气圈', test: (s, p) => ['ski', 'board', 'sled', 'tube'].every((k) => p.gearOwned(k)), coins: 600 },
  { id: 'gearS', name: '传说入手', desc: '拥有一件 S 级滑行装备', test: (s, p) => GEAR_KEYS.some((k) => GEAR[k].rarity === 'S' && p.gearOwned(k)), coins: 800, title: '传说收藏' },
  { id: 'gearFull', name: '车库满员', desc: '拥有全部滑行装备', test: (s, p) => GEAR_KEYS.every((k) => p.gearOwned(k)), coins: 2500, title: '车库满员' },
  { id: 'upMax', name: '改装狂人', desc: '把一件装备的改装树全部改满', test: (s, p) => GEAR_KEYS.some((k) => UP_KEYS.every((u) => p.up(k)[u] >= UP_MAX)), coins: 600 },
  { id: 'gold1', name: '踏入白银', desc: '排位达到白银', test: (s, p) => p.rankPoints() >= 100, coins: 500, title: '白银车手' },
  { id: 'cupAll', name: '黄金车手', desc: '排位达到黄金', test: (s, p) => p.rankPoints() >= 250, coins: 800, title: '黄金车手' },
  { id: 'chal5', name: '排位新秀', desc: '完成 5 场排位赛', test: (s, p) => (p.data.rank && p.data.rank.games) >= 5, coins: 400 },
  { id: 'chalAll', name: '钻石车手', desc: '排位达到钻石', test: (s, p) => p.rankPoints() >= 700, coins: 1500, title: '钻石车手' },
  { id: 'modesAll', name: '全能选手', desc: '每种模式都玩过一次', test: (s, p) => MODE_KEYS.every((k) => p.data.modes[k]), coins: 400 },
  { id: 'teamWin', name: '团队之光', desc: '赢得一场团队赛', test: (s) => s.teamWins >= 1, coins: 200 },
  { id: 'elimWin', name: '最后的幸存者', desc: '赢得一场淘汰赛', test: (s) => s.elimWins >= 1, coins: 200 },
  { id: 'trick', name: '特技之星', desc: '特技赛单局拿到 30000 分', test: (s) => s.bestTrick >= 30000, coins: 400, title: '特技之星' },
  { id: 'brawl', name: '乱斗之王', desc: '大乱斗单局击飞对手 8 次', test: (s) => s.bestBrawl >= 8, coins: 400, title: '乱斗之王' },
  { id: 'ttGold', name: '计时金牌', desc: '计时赛拿到一块金牌', test: (s) => s.ttGold >= 1, coins: 300 },
];
export const ACH_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const STAT_LABELS = [
  ['races', '比赛场数'], ['wins', '冠军'], ['podiums', '前三名'], ['hits', '击飞对手'], ['knocked', '被击飞'],
  ['flips', '空翻'], ['maxFlip', '单次最多空翻（圈）'], ['spins', '转体'], ['grabs', '抓板'], ['driftBoosts', '漂移喷射'], ['shortcuts', '抄近道'], ['pads', '加速带'],
  ['skill', '累计技巧分'], ['bestChain', '最高单条技巧链'], ['bestMult', '最高技巧链倍率'],
  ['maxSpeed', '最高时速（km/h）'], ['maxAir', '最长滞空（秒）'], ['coinsEarned', '累计获得雪花币'], ['playTime', '比赛总时长（分钟）'],
];

// 赛季按北京时间，每周一 0 点换。第 1 赛季从 2026-11-16 那周开始。
const SEASON_TZ = 8 * 3600000;
const SEASON_EPOCH = Date.UTC(2026, 10, 16) - SEASON_TZ;
const SEASON_WEEK = 7 * 86400000;

export function blankSeason(id) {
  return { id, points: 0, hits: 0, tt: 0, ttTrack: '', ttTime: 0 };
}

// 段位赛季比积分榜长：4 周一换，和周赛季同一天起算
const RANK_SEASON = 4 * SEASON_WEEK;

export function rankSeasonNow(now = Date.now()) {
  const id = Math.max(1, Math.floor((now - SEASON_EPOCH) / RANK_SEASON) + 1);
  const start = SEASON_EPOCH + (id - 1) * RANK_SEASON;
  return { id, start, end: start + RANK_SEASON, left: start + RANK_SEASON - now };
}

export function seasonNow(now = Date.now()) {
  const shifted = new Date(now + SEASON_TZ);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - SEASON_TZ;
  const id = Math.floor((dayStart - SEASON_EPOCH) / SEASON_WEEK) + 1;
  const start = SEASON_EPOCH + (Math.max(1, id) - 1) * SEASON_WEEK;
  return { id: Math.max(1, id), start, end: start + SEASON_WEEK, left: start + SEASON_WEEK - now };
}

export function seasonLeftText(ms) {
  const min = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d) return `${d} 天 ${h} 小时后结束`;
  if (h) return `${h} 小时 ${min % 60} 分钟后结束`;
  return `${Math.max(1, min)} 分钟后结束`;
}

// 积分榜名次奖励。击飞榜和计时榜只排名，不另发雪花币。
export function seasonReward(rank) {
  if (rank === 1) return 500;
  if (rank === 2 || rank === 3) return 250;
  if (rank >= 4 && rank <= 10) return 120;
  if (rank >= 11 && rank <= 50) return 40;
  return 0;
}

export function normalizeSeason(raw) {
  const s = blankSeason(0);
  if (!raw || typeof raw !== 'object') return s;
  s.id = clampNum(raw.id, 0, 100000);
  s.points = clampNum(raw.points, 0, 1000000);
  s.hits = clampNum(raw.hits, 0, 1000000);
  const tt = Number(raw.tt);
  if (Number.isFinite(tt) && tt > 0 && tt < 20) s.tt = Math.round(tt * 1000) / 1000;
  if (TRACK_IDS.has(raw.ttTrack)) s.ttTrack = raw.ttTrack;
  const ttTime = Number(raw.ttTime);
  if (Number.isFinite(ttTime) && ttTime > 0 && ttTime < 86400) s.ttTime = Math.round(ttTime * 100) / 100;
  return s;
}

// 昵称：2~12 位中文、字母、数字或下划线
export const NAME_RE = /^[\u4e00-\u9fffA-Za-z0-9_]{2,12}$/;
export const cleanNick = (s) => (typeof s === 'string' && NAME_RE.test(s.trim()) ? s.trim() : '');
export const randomNick = (rng = Math.random) => `滑雪客${1000 + Math.floor(rng() * 9000)}`;
export const isAutoNick = (s) => /^滑雪客\d{4}$/.test(s || '');

const defaults = () => ({
  v: 1,
  name: '',
  xp: 0,
  coins: START_COINS,
  parts: START_PARTS,
  title: '',
  owned: {}, // 买下的装备或抽中的外观，例如 'gear:sled'、'hat:6'、'back:3'
  up: {}, // 装备改装树：{ ski: { core: 3, wax: 1, … } }，没改过的节点不存
  stats: {
    races: 0, wins: 0, podiums: 0, hits: 0, knocked: 0, flips: 0, driftBoosts: 0, shortcuts: 0, pads: 0,
    maxFlip: 0, maxSpeed: 0, maxAir: 0, cleanWins: 0, teamWins: 0, elimWins: 0, bestTrick: 0, bestBrawl: 0,
    ttGold: 0, cupRaces: 0, coinsEarned: 0, playTime: 0,
    spins: 0, maxSpin: 0, grabs: 0, maxGrab: 0, skill: 0, bestChain: 0, bestMult: 0,
  },
  modes: {}, // 玩过的模式
  best: {}, // 计时赛最好成绩：{ 赛道 key: 秒 }
  medals: {}, // 计时赛最好奖牌：{ 赛道 key: 1~3 }
  ach: {}, // 成就：{ id: 时间戳 }
  cups: {}, // 杯赛最好成绩：{ id: 1 铜 / 2 银 / 3 金 }
  chal: {}, // 旧档里的挑战记录，不再使用
  rank: null, // 排位：{ pts, games, wins, day, season }
  daily: null,
  season: blankSeason(0),
  boxSeed: 0, // 补给箱的随机种子（服务器发）和已经开过几个：开出什么由这两个数决定
  boxN: 0,
});

// days：往后数几天（0 = 今天）。按北京时间换天，服务器重算存档时和浏览器对得上
function todayKey(days = 0) {
  const d = new Date(Date.now() + SEASON_TZ + days * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 某一天的三个每日任务：只由日期决定，所以明天是哪三个今天就能算出来
function pickTasks(dateKey) {
  let h = 0;
  for (const ch of dateKey) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const rng = mulberry32(h);
  const pool = TASKS.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

const TRACK_IDS = new Set(TRACKS.map((t) => t.id));
const TITLE_ACH = new Map(ACHIEVEMENTS.filter((a) => a.title).map((a) => [a.title, a.id]));
const STAT_CAP = {
  maxFlip: 30, maxSpin: 30, maxGrab: 30, maxSpeed: 400, maxAir: 120,
  bestChain: 1e8, bestMult: 10, bestTrick: 1e8, bestBrawl: 100, playTime: 1e7,
};

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function clampDec(v, lo, hi, places) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  const m = 10 ** places;
  return Math.min(hi, Math.max(lo, Math.round(n * m) / m));
}

function mergeProfile(saved) {
  const def = defaults();
  const src = saved && typeof saved === 'object' ? saved : {};
  const d = { ...def, ...src, v: 1 };
  d.name = cleanNick(d.name);
  d.stats = { ...def.stats, ...(src.stats || {}) };
  for (const k of ['owned', 'up', 'modes', 'best', 'medals', 'ach', 'cups', 'chal']) d[k] = { ...(src[k] || {}) };
  d.season = normalizeSeason(src.season);
  return d;
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS)) || {};
  } catch {
    return {};
  }
}

// 服务器收存档时用：只留已知字段，数值卡在合理范围内。
export function sanitizeProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = defaults();
  d.name = cleanNick(src.name);
  d.xp = clampNum(src.xp, 0, 200000);
  d.coins = clampNum(src.coins, 0, 10000000);
  // 改装币是后加的：旧存档里没有这一项的，补上开局的那一份
  d.parts = src.parts == null ? START_PARTS : clampNum(src.parts, 0, 10000000);
  const titleAch = TITLE_ACH.get(src.title);
  d.title = '';
  d.owned = {};
  if (src.owned && typeof src.owned === 'object') {
    for (const key of Object.keys(src.owned)) {
      if (Object.keys(d.owned).length >= 200 || !src.owned[key]) continue;
      const [slot, id] = String(key).split(':');
      if (!id || String(key).split(':').length !== 2) continue;
      if (slot === 'gear' && GEAR_KEYS.includes(id)) d.owned[key] = true;
      else if (unlockOf(key)?.box) d.owned[key] = true;
    }
  }
  d.up = {};
  if (src.up && typeof src.up === 'object') {
    for (const g of GEAR_KEYS) {
      const row = src.up[g];
      if (!row || typeof row !== 'object') continue;
      const out = {};
      for (const k of UP_KEYS) {
        const n = clampNum(row[k], 0, UP_MAX);
        if (n) out[k] = n;
      }
      if (Object.keys(out).length) d.up[g] = out;
    }
  }
  const statSrc = src.stats && typeof src.stats === 'object' ? src.stats : {};
  for (const k of Object.keys(d.stats)) {
    if (k === 'maxGrab' || k === 'maxAir' || k === 'playTime') d.stats[k] = clampDec(statSrc[k], 0, STAT_CAP[k] || 1e9, 1);
    else d.stats[k] = clampNum(statSrc[k], 0, STAT_CAP[k] || 1e9);
  }
  if (src.modes && typeof src.modes === 'object') for (const k of MODE_KEYS) if (src.modes[k]) d.modes[k] = true;
  if (src.best && typeof src.best === 'object') {
    for (const id of TRACK_IDS) {
      const t = Number(src.best[id]);
      if (Number.isFinite(t) && t > 0 && t < 86400) d.best[id] = Math.round(t * 100) / 100;
    }
  }
  if (src.medals && typeof src.medals === 'object') {
    for (const id of TRACK_IDS) {
      const n = clampNum(src.medals[id], 0, 3);
      if (n) d.medals[id] = n;
    }
  }
  if (src.ach && typeof src.ach === 'object') {
    for (const a of ACHIEVEMENTS) {
      const n = clampNum(src.ach[a.id], 0, 1e14);
      if (n) d.ach[a.id] = n;
    }
  }
  if (titleAch && d.ach[titleAch]) d.title = src.title;
  if (src.cups && typeof src.cups === 'object') {
    for (const c of CUPS) {
      const n = clampNum(src.cups[c.id], 0, 3);
      if (n) d.cups[c.id] = n;
    }
  }
  d.rank = sanitizeRank(src.rank);
  d.daily = sanitizeDaily(src.daily);
  d.season = normalizeSeason(src.season);
  d.boxSeed = clampNum(src.boxSeed, 0, 0x7fffffff);
  d.boxN = clampNum(src.boxN, 0, 1e7);
  return d;
}

function sanitizeRank(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    pts: clampNum(r.pts, 0, 100000),
    games: clampNum(r.games, 0, 1e7),
    wins: clampNum(r.wins, 0, 1e7),
    day: typeof r.day === 'string' ? r.day.slice(0, 16) : '',
    season: clampNum(r.season, 0, 100000),
    // 本段位赛季打了几场；老存档没有这项，那时还在第 1 个段位赛季里，全部场次都算
    sg: clampNum(r.sg == null ? r.games : r.sg, 0, 1e7),
    // 正在打、还没结算的那场排位。开赛写上，结算清掉；下次打开游戏还在，说明是中途关掉走的
    pending: r.pending && RANK_MAP[r.pending.mode] ? { mode: r.pending.mode, at: clampNum(r.pending.at, 0, 1e15) } : null,
  };
}

function sanitizeDaily(raw) {
  if (!raw || typeof raw !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') || !Array.isArray(raw.tasks)) return null;
  const tasks = [];
  const seen = new Set();
  for (const t of raw.tasks) {
    if (!t || !TASK_MAP[t.id] || seen.has(t.id)) continue;
    seen.add(t.id);
    const goal = TASK_MAP[t.id].goal;
    const prog = clampNum(t.prog, 0, goal);
    tasks.push({ id: t.id, prog, done: !!t.done && prog >= goal });
    if (tasks.length >= 3) break;
  }
  if (tasks.length !== 3) return null;
  const modes = {};
  if (raw.modes && typeof raw.modes === 'object') for (const k of MODE_KEYS) if (raw.modes[k]) modes[k] = true;
  const bonus = !!raw.bonus && tasks.every((t) => t.done);
  return { date: raw.date, tasks, modes, bonus };
}

// 动到雪花币、经验、装备、排位的操作都会记一条（onOp），服务器按同样的顺序在它那份存档上重做一遍
export class Profile {
  constructor() {
    this.onSave = null;
    this.onOp = null;
    this._silent = false;
    this.data = mergeProfile(readLocal());
    this.ensureDaily();
  }

  log(op) {
    if (this.onOp) this.onOp(op);
  }

  _writeLocal() {
    try {
      localStorage.setItem(LS, JSON.stringify(this.data));
    } catch {
      /* 存不下就算了 */
    }
  }

  save() {
    this._writeLocal();
    if (!this._silent && this.onSave) this.onSave();
  }

  // 用服务器上的存档换掉本地这份。同一天的每日任务不会因此再上传一次。
  loadData(saved) {
    this._silent = true;
    this.data = mergeProfile(saved);
    this._writeLocal();
    this._silent = false;
    this.ensureDaily();
  }

  // ---------- 等级 ----------
  get level() {
    return this.levelInfo().lv;
  }

  levelInfo(xp = this.data.xp) {
    let lv = 1;
    let rest = xp;
    while (lv < MAX_LV && rest >= xpNeed(lv)) {
      rest -= xpNeed(lv);
      lv++;
    }
    return { lv, cur: rest, need: lv >= MAX_LV ? 0 : xpNeed(lv) };
  }

  get coins() {
    return this.data.coins;
  }

  addCoins(n) {
    this.data.coins = Math.max(0, this.data.coins + n);
    if (n > 0) this.data.stats.coinsEarned += n;
  }

  get parts() {
    return this.data.parts | 0;
  }

  addParts(n) {
    this.data.parts = Math.max(0, (this.data.parts | 0) + n);
  }

  // ---------- 解锁 / 购买 ----------
  // 'free' 不需要解锁 / 'owned' 已拥有 / 'buy' 可以买 / 'locked' 尚未解锁
  unlockState(u, key) {
    if (!u) return 'free';
    if (this.data.owned[key]) return 'owned';
    if (u.box) return 'locked';
    if (u.ach) return this.data.ach[u.ach] ? 'owned' : 'locked';
    if (u.lv && this.level < u.lv) return 'locked';
    if (u.cost) return 'buy';
    return 'owned';
  }

  usable(u, key) {
    const s = this.unlockState(u, key);
    return s === 'free' || s === 'owned';
  }

  buy(key) {
    const u = unlockOf(key);
    if (!u?.cost || this.unlockState(u, key) !== 'buy' || this.data.coins < u.cost) return false;
    this.data.coins -= u.cost;
    this.data.owned[key] = true;
    this.log({ op: 'buy', key });
    this.save();
    return true;
  }

  gearOwned(id) {
    return this.usable(GEAR[id] && GEAR[id].unlock, 'gear:' + id);
  }

  hatOwned(i) {
    return i === DEFAULT_HAT || this.boxOwned(`hat:${i}`);
  }

  cosmeticOwned(slot, i) {
    return (i === 0 && !!COSMETIC_SLOTS[slot]?.list[0]) || this.boxOwned(`${slot}:${i}`);
  }

  // ---------- 雪花补给箱 ----------
  boxOwned(key) {
    return unlockOf(key)?.box === true && this.data.owned[key] === true;
  }

  boxDone() {
    return BOX_POOL.every((it) => this.boxOwned(it.key));
  }

  // 返回 { key, tier, dup }；钱不够或者已经全收集了返回 null。rng 只给测试用
  openBox(rng) {
    if (this.data.coins < BOX_COST || this.boxDone()) return null;
    const d = this.data;
    if (!rng) {
      if (!d.boxSeed) d.boxSeed = 1 + Math.floor(Math.random() * 0x7ffffffe);
      rng = mulberry32((d.boxSeed ^ Math.imul(d.boxN + 1, 0x9e3779b1)) | 0);
      d.boxN++;
    }
    const item = rollBox(rng);
    const dup = this.boxOwned(item.key);
    d.coins -= BOX_COST;
    if (dup) d.coins += BOX_REFUND;
    else d.owned[item.key] = true;
    this.log({ op: 'box' });
    this.save();
    return { ...item, dup };
  }

  // ---------- 装备改装树 ----------
  up(gear) {
    const u = this.data.up[gear] || {};
    const out = {};
    for (const k of UP_KEYS) out[k] = Math.min(UP_MAX, u[k] | 0);
    return out;
  }

  // 节点还没解锁时返回要先改满的那个节点，已经解锁返回 ''
  upNeed(gear, line) {
    const need = UP_KEYS.includes(line) ? UPGRADES[line].need : '';
    return need && this.up(gear)[need] < UP_MAX ? need : '';
  }

  // 第 lv 级升到下一级要多少改装币
  upStepCost(gear, line, lv) {
    if (!UP_KEYS.includes(line) || lv >= UP_MAX) return 0;
    const mul = (RARITY[(GEAR[gear] || GEAR.ski).rarity] || RARITY.C).up;
    return Math.round(UP_COST[UPGRADES[line].row][lv] * mul);
  }

  upgradeCost(gear, line) {
    return this.upStepCost(gear, line, this.up(gear)[line]);
  }

  // 从现在的等级一口气改满要花多少
  upgradeFullCost(gear, line) {
    let n = 0;
    for (let lv = this.up(gear)[line] | 0; lv < UP_MAX; lv++) n += this.upStepCost(gear, line, lv);
    return n;
  }

  upgrade(gear, line) {
    const cost = this.upgradeCost(gear, line);
    if (!cost || this.parts < cost || !this.gearOwned(gear) || this.upNeed(gear, line)) return false;
    this.addParts(-cost);
    const u = (this.data.up[gear] = this.up(gear));
    u[line]++;
    this.log({ op: 'up', gear, line });
    this.save();
    return true;
  }

  // ---------- 赛事解锁 ----------
  // 第 i 组赛道：等级够了就能选
  cupUnlocked(i) {
    return this.level >= (CUP_LV[i] || 0);
  }

  // 固定赛道在赛道大厅里能不能选：所属分组的等级到了
  trackUnlocked(id) {
    const k = CUPS.findIndex((c) => c.tracks.includes(id));
    return k >= 0 && this.cupUnlocked(k);
  }

  rankOpen() {
    return this.level >= RANK_LV;
  }

  rankPoints() {
    return this.rankState().pts;
  }

  // 换段位赛季时保留七成积分，当作新赛季的起点
  rankState() {
    const now = rankSeasonNow();
    let r = this.data.rank;
    if (!r || typeof r !== 'object') r = this.data.rank = { pts: 0, games: 0, wins: 0, day: '', season: now.id, sg: 0 };
    r.pts = Math.max(0, r.pts | 0);
    r.games = Math.max(0, r.games | 0);
    r.wins = Math.max(0, r.wins | 0);
    r.sg = Math.max(0, r.sg | 0);
    if ((r.season | 0) !== now.id) {
      r.pts = Math.floor(r.pts * 0.7);
      r.season = now.id;
      r.sg = 0;
      this.save();
    }
    return r;
  }

  rankView() {
    const r = this.rankState();
    const t = tierAt(r.pts);
    const star = t.star ? `${'★'.repeat(t.star)}${'☆'.repeat(5 - t.star)}` : '';
    const next = t.next ? `距${t.nextName}还差 ${t.next - r.pts}` : '已是最高段位';
    return { ...t, pts: r.pts, games: r.games, wins: r.wins, star, line: `${t.name}${star ? ' ' + star : ''} · ${r.pts} 分`, next };
  }

  // ---------- 称号 ----------
  titles() {
    return ACHIEVEMENTS.filter((a) => a.title && this.data.ach[a.id]).map((a) => a.title);
  }

  setTitle(t) {
    this.data.title = this.titles().includes(t) ? t : '';
    this.save();
  }

  // ---------- 每日任务 ----------
  ensureDaily() {
    const today = todayKey();
    if (this.data.daily && this.data.daily.date === today) return;
    const tasks = pickTasks(today).map((t) => ({ id: t.id, prog: 0, done: false }));
    this.data.daily = { date: today, tasks, modes: {}, bonus: false };
    this.save();
  }

  dailyTasks() {
    this.ensureDaily();
    return this.data.daily.tasks.map((t) => ({ ...TASK_MAP[t.id], prog: t.prog, done: t.done }));
  }

  // 明天会刷出来的三个任务（预告用）
  dailyPreview() {
    return pickTasks(todayKey(1));
  }

  // 今天三个任务全做完的额外奖励有没有发过
  get dailyBonusDone() {
    this.ensureDaily();
    return !!this.data.daily.bonus;
  }

  // ---------- 成就 ----------
  checkAch() {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.ach[a.id]) continue;
      if (a.test(this.data.stats, this)) {
        this.data.ach[a.id] = Date.now();
        this.addCoins(a.coins || 0);
        got.push(a);
      }
    }
    if (got.length) this.save();
    return got;
  }

  // 等级提升后新解锁（或可以购买）的东西
  unlocksBetween(from, to) {
    const out = [];
    const hit = (u, key) => u && u.lv && u.lv > from && u.lv <= to && !this.data.owned[key];
    for (const k of GEAR_KEYS) if (hit(GEAR[k].unlock, 'gear:' + k)) out.push(`${GEAR[k].icon} ${GEAR[k].name} ${rarityToken(GEAR[k].rarity)}${GEAR[k].unlock.cost ? '（可购买）' : ''}`);
    return out;
  }

  // 换周了：按上一周积分榜的名次发奖（rank 0 表示没上榜），换成新赛季。返回发了多少雪花币
  claimSeason(id, rank) {
    const now = seasonNow();
    const s = this.data.season;
    if (!s || (s.id | 0) !== (id | 0) || (s.id && s.id >= now.id)) return 0;
    const coins = s.points > 0 ? seasonReward(rank) : 0;
    this.data.season = blankSeason(now.id);
    if (coins) this.addCoins(coins);
    this.log({ op: 'season', id: id | 0, rank });
    this.save();
    return coins;
  }

  // 本周赛季成绩。换周后的第一场会先把旧周清掉，奖励由界面在连上服务器后结算。
  noteSeason(rep) {
    const now = seasonNow();
    if (!this.data.season || this.data.season.id !== now.id) this.data.season = blankSeason(now.id);
    const s = this.data.season;
    if (rep.mode === 'tt' && rep.kind === 'quick' && rep.finished && rep.track && rep.length > 0) {
      const [gold] = medalTimes(rep.length);
      const ratio = gold > 0 ? rep.time / gold : 0;
      if (ratio > 0 && (!s.tt || ratio < s.tt)) {
        s.tt = Math.round(ratio * 1000) / 1000;
        s.ttTrack = rep.track;
        s.ttTime = Math.round(rep.time * 100) / 100;
      }
    }
    const placed = rep.finished || rep.mode === 'elim';
    const ranked = (rep.kind === 'quick' || rep.kind === 'online') && rep.mode !== 'tt' && rep.field >= 4 && rep.difficulty >= 1 && placed;
    if (!ranked) return;
    const base = POINTS[rep.rank - 1] || 0;
    s.points += rep.difficulty >= 2 ? Math.floor(base * 1.5) : base;
    s.hits += rep.hits || 0;
  }

  // ---------- 结算 ----------
  // rep：一局比赛里玩家自己的统计（见 main.js newReport / finishReport）
  // 返回给结算界面显示的奖励明细
  applyRace(rep) {
    this.log({ op: 'race', rep });
    const d = this.data;
    const s = d.stats;
    const lvFrom = this.level;
    const lines = [];
    const field = rep.field;
    const frac = field > 1 ? (rep.rank - 1) / (field - 1) : 0.5;
    let xp = field > 1 ? Math.round(130 - 90 * frac) : 70;
    let coins = field > 1 ? Math.round(70 - 50 * frac) : 30;
    let parts = field > 1 ? Math.round(60 - 30 * frac) : 30;
    if (!rep.finished) {
      xp = Math.round(xp * 0.5);
      coins = Math.round(coins * 0.5);
      parts = Math.round(parts * 0.5);
    }
    lines.push({ label: rep.mode === 'tt' ? '完成计时赛' : rep.finished ? `第 ${rep.rank} 名` : `第 ${rep.rank} 名（未完赛）`, xp, coins, parts });
    const add = (label, x, c) => {
      if (!x && !c) return;
      lines.push({ label, xp: x, coins: c });
    };
    if (rep.hits) add(`击飞对手 ×${rep.hits}`, Math.min(rep.hits, 20) * 12, Math.min(rep.hits, 20) * 4);
    if (rep.flips) add(`空翻 ×${rep.flips}`, Math.min(rep.flips, 30) * 4, 0);
    if (rep.skill) add(`技巧分 ${rep.skill.toLocaleString()}（最高 ×${rep.bestMult}）`, Math.min(100, Math.round(rep.skill / 300)), Math.min(30, Math.round(rep.skill / 1000)));
    if (rep.driftBoosts) add(`漂移喷射 ×${rep.driftBoosts}`, Math.min(rep.driftBoosts, 30) * 2, 0);
    if (rep.shortcuts) add(`抄近道 ×${rep.shortcuts}`, rep.shortcuts * 15, rep.shortcuts * 5);
    if (rep.mode === 'team' && rep.teamWin) add('团队获胜', 60, 40);
    if (rep.mode === 'tt') {
      if (rep.pb) add('刷新个人最佳', 40, 20);
      if (rep.medal) add(['', '铜牌', '银牌', '金牌'][rep.medal], 0, [0, 15, 25, 40][rep.medal]);
    }
    let mult = 1;
    if (field > 1) mult *= [0.8, 1, 1.3][rep.difficulty] ?? 1;
    if (rep.kind === 'online') mult *= 1.2;
    let tx = 0;
    let tc = 0;
    let tp = 0;
    for (const l of lines) {
      l.xp = Math.round(l.xp * mult);
      l.coins = Math.round(l.coins * mult);
      l.parts = Math.round((l.parts || 0) * mult);
      tx += l.xp;
      tc += l.coins;
      tp += l.parts;
    }
    if (mult !== 1) lines.push({ label: rep.kind === 'online' ? '联机加成 ×1.2' : `难度系数 ×${mult.toFixed(1)}`, note: true });

    // 生涯数据
    const won = field >= 4 && rep.rank === 1 && rep.finished;
    const delta = {
      races: 1,
      wins: won ? 1 : 0,
      podiums: field >= 3 && rep.rank <= 3 && rep.finished ? 1 : 0,
      hits: rep.hits,
      flips: rep.flips,
      driftBoosts: rep.driftBoosts,
      shortcuts: rep.shortcuts,
      pads: rep.pads,
      cupRaces: rep.kind === 'rank' ? 1 : 0,
      spins: rep.spins | 0,
      grabs: rep.grabs | 0,
      skill: rep.skill | 0,
    };
    for (const k in delta) s[k] += delta[k];
    const taskDelta = { ...delta, chain4: rep.bestMult >= 4 ? 1 : 0 };
    s.knocked += rep.knocked;
    s.maxFlip = Math.max(s.maxFlip, rep.maxFlip);
    s.maxSpin = Math.max(s.maxSpin, rep.maxSpin | 0);
    s.maxGrab = Math.max(s.maxGrab, Math.round((rep.maxGrab || 0) * 10) / 10);
    s.bestChain = Math.max(s.bestChain, rep.bestChain | 0);
    s.bestMult = Math.max(s.bestMult, rep.bestMult | 0);
    s.maxSpeed = Math.max(s.maxSpeed, rep.maxSpeed);
    s.maxAir = Math.max(s.maxAir, Math.round(rep.maxAir * 10) / 10);
    s.playTime = Math.round((s.playTime + rep.time / 60) * 10) / 10;
    if (won && rep.knocked === 0) s.cleanWins++;
    if (rep.mode === 'team' && rep.teamWin) s.teamWins++;
    if (rep.mode === 'elim' && rep.rank === 1 && rep.finished) s.elimWins++;
    if (rep.mode === 'trick') s.bestTrick = Math.max(s.bestTrick, rep.score | 0);
    if (rep.mode === 'brawl') s.bestBrawl = Math.max(s.bestBrawl, rep.hits);
    if (rep.mode === 'tt' && rep.medal >= 3) s.ttGold++;
    d.modes[rep.mode] = true;
    this.noteSeason(rep);
    if (rep.kind === 'rank') lines.push(this.applyRank(rep));

    d.xp += tx;
    this.addCoins(tc);
    this.addParts(tp);

    // 每日任务
    this.ensureDaily();
    const daily = d.daily;
    daily.modes[rep.mode] = true;
    const tasks = [];
    for (const t of daily.tasks) {
      if (t.done) continue;
      const def = TASK_MAP[t.id];
      t.prog = def.key === 'modes' ? Object.keys(daily.modes).length : t.prog + (taskDelta[def.key] || 0);
      if (t.prog >= def.goal) {
        t.prog = def.goal;
        t.done = true;
        d.xp += TASK_XP;
        this.addCoins(TASK_COINS);
        this.addParts(TASK_PARTS);
        tasks.push({ name: def.name, xp: TASK_XP, coins: TASK_COINS, parts: TASK_PARTS });
      }
    }
    let bonus = 0;
    let bonusParts = 0;
    if (!daily.bonus && daily.tasks.every((t) => t.done)) {
      daily.bonus = true;
      bonus = TASK_BONUS;
      bonusParts = TASK_BONUS_PARTS;
      this.addCoins(bonus);
      this.addParts(bonusParts);
    }
    const extra = rep.extra || [];
    for (const e of extra) {
      d.xp += e.xp || 0;
      this.addCoins(e.coins || 0);
    }
    const ach = this.checkAch();
    const lvTo = this.level;
    this.save();
    return {
      lines,
      xp: tx,
      coins: tc,
      parts: tp,
      tasks,
      bonus,
      bonusParts,
      extra,
      ach,
      lvFrom,
      lvTo,
      unlocks: lvTo > lvFrom ? this.unlocksBetween(lvFrom, lvTo) : [],
    };
  }

  rankBegin(mode) {
    if (!RANK_MAP[mode]) return;
    this.rankState().pending = { mode, at: Date.now() };
    this.log({ op: 'rankBegin', mode });
    this.save();
  }

  // 排位没打完就离开（escape：主动退出 / 关网页；否则是掉线）。返回本次扣分，没有待结算的排位时返回 null
  rankLeave(escape) {
    const state = this.rankState();
    const p = state.pending;
    if (!p) return null;
    state.pending = null;
    this.log({ op: 'rankLeave', escape: !!escape });
    const scored = scoreLeave(state, p.mode, escape);
    if (!scored) {
      this.save();
      return null;
    }
    state.pts = scored.after;
    state.games++;
    state.sg++;
    this.save();
    return scored;
  }

  applyRank(rep) {
    const state = this.rankState();
    state.pending = null;
    const scored = scoreRank(state, rep);
    if (!scored) return { label: '排位未结算', note: true };
    state.pts = scored.after;
    state.games++;
    state.sg++;
    if (scored.win) state.wins++;
    if (scored.win) state.day = localDay();
    const now = tierAt(state.pts);
    this.save();
    const sign = scored.delta > 0 ? `+${scored.delta}` : `${scored.delta}`;
    const extra = scored.first ? ' · 今日首胜' : '';
    return { label: `${RANK_MAP[rep.rankMode] ? RANK_MAP[rep.rankMode].name : '排位'} ${sign} · ${now.name}${extra}`, note: true };
  }

  // 计时赛：返回 { pb, prev }
  recordBest(key, time) {
    const prev = this.data.best[key];
    const pb = !prev || time < prev;
    if (pb) this.data.best[key] = Math.round(time * 100) / 100;
    this.save();
    return { pb, prev };
  }

  recordMedal(key, medal) {
    if (medal > (this.data.medals[key] || 0)) this.data.medals[key] = medal;
    this.save();
  }

  modeName(k) {
    return MODES[k] ? MODES[k].name : k;
  }
}
