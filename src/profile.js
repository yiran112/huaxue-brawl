// 玩家存档与成长：等级经验、雪花币、解锁购买、装备强化、每日任务、成就、生涯数据、结算奖励。
// 全部存在浏览器本地（localStorage）。
import { HATS, MODE_KEYS, MODES } from './config.js';
import { GEAR, GEAR_KEYS, UP_KEYS, UP_MAX, UP_COST, HAT_UNLOCK, COSMETIC_SLOTS } from './gear.js';
import { CUPS, CHALLENGES } from './tracks.js';
import { mulberry32 } from './util.js';

const LS = 'huaxue_profile_v1';
export const MAX_LV = 60;
export const CUP_LV = [0, 4, 8, 12]; // 不拿上一杯的奖杯，到这个等级也能直接参加
export const START_COINS = 300;
// 从 lv 升到 lv+1 需要的经验
export const xpNeed = (lv) => 150 + (lv - 1) * 60;

const TASK_XP = 80;
const TASK_COINS = 60;
const TASK_BONUS = 150; // 当天三个任务全做完的额外奖励

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
  { id: 'cup1', name: '完成 1 场杯赛比赛', goal: 1, key: 'cupRaces' },
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
  { id: 'speed180', name: '风驰电掣', desc: '贴地滑行时速达到 180 km/h', test: (s) => s.maxSpeed >= 180, coins: 200 },
  { id: 'speed230', name: '音障边缘', desc: '贴地滑行时速达到 230 km/h', test: (s) => s.maxSpeed >= 230, coins: 500, title: '速度狂人' },
  { id: 'air3', name: '滞空王', desc: '单次腾空超过 3 秒', test: (s) => s.maxAir >= 3, coins: 300 },
  { id: 'short20', name: '抄近道专家', desc: '累计成功抄近道 20 次', test: (s) => s.shortcuts >= 20, coins: 400, title: '路线鬼才' },
  { id: 'clean', name: '不沾雪', desc: '一场比赛不被击飞并拿到第一（至少 4 人）', test: (s) => s.cleanWins >= 1, coins: 500, title: '不沾雪' },
  { id: 'lv10', name: '小有名气', desc: '达到 10 级', test: (s, p) => p.level >= 10, coins: 500 },
  { id: 'lv20', name: '雪坛名宿', desc: '达到 20 级', test: (s, p) => p.level >= 20, coins: 1000, title: '雪坛名宿' },
  { id: 'gearAll', name: '装备收藏家', desc: '拥有全部 4 种滑行装备', test: (s, p) => GEAR_KEYS.every((k) => p.gearOwned(k)), coins: 600 },
  { id: 'upMax', name: '改装狂人', desc: '把一件装备的三条强化全部升满', test: (s, p) => GEAR_KEYS.some((k) => UP_KEYS.every((u) => p.up(k)[u] >= UP_MAX)), coins: 600 },
  { id: 'gold1', name: '金杯得主', desc: '第一次拿到杯赛金杯', test: (s, p) => Object.values(p.data.cups).some((t) => t >= 3), coins: 500, title: '金杯得主' },
  { id: 'cupAll', name: '大满贯', desc: '四个杯赛全部拿到金杯', test: (s, p) => CUPS.every((c) => (p.data.cups[c.id] || 0) >= 3), coins: 2000, title: '大满贯' },
  { id: 'chal5', name: '挑战者', desc: '完成 5 个挑战', test: (s, p) => Object.keys(p.data.chal).length >= 5, coins: 400 },
  { id: 'chalAll', name: '无所不能', desc: '完成全部挑战', test: (s, p) => CHALLENGES.every((c) => p.data.chal[c.id]), coins: 1500, title: '挑战王' },
  { id: 'modesAll', name: '全能选手', desc: '每种模式都玩过一次', test: (s, p) => MODE_KEYS.every((k) => p.data.modes[k]), coins: 400 },
  { id: 'teamWin', name: '团队之光', desc: '赢得一场团队赛', test: (s) => s.teamWins >= 1, coins: 200 },
  { id: 'elimWin', name: '最后的幸存者', desc: '赢得一场淘汰赛', test: (s) => s.elimWins >= 1, coins: 200 },
  { id: 'trick', name: '特技之星', desc: '特技赛单局拿到 10000 分', test: (s) => s.bestTrick >= 10000, coins: 400, title: '特技之星' },
  { id: 'brawl', name: '乱斗之王', desc: '大乱斗单局击飞对手 8 次', test: (s) => s.bestBrawl >= 8, coins: 400, title: '乱斗之王' },
  { id: 'ttGold', name: '计时金牌', desc: '计时赛拿到一块金牌', test: (s) => s.ttGold >= 1, coins: 300 },
];
export const ACH_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export const STAT_LABELS = [
  ['races', '比赛场数'], ['wins', '冠军'], ['podiums', '前三名'], ['hits', '击飞对手'], ['knocked', '被击飞'],
  ['flips', '空翻'], ['maxFlip', '单次最多空翻（圈）'], ['driftBoosts', '漂移喷射'], ['shortcuts', '抄近道'], ['pads', '加速带'],
  ['maxSpeed', '最高时速（km/h）'], ['maxAir', '最长滞空（秒）'], ['coinsEarned', '累计获得雪花币'], ['playTime', '比赛总时长（分钟）'],
];

const defaults = () => ({
  v: 1,
  xp: 0,
  coins: START_COINS,
  title: '',
  owned: {}, // 买下的东西：'gear:sled'、'hat:6'、'back:3' ……
  up: {}, // 装备强化：{ ski: { wax, bind, pad } }
  stats: {
    races: 0, wins: 0, podiums: 0, hits: 0, knocked: 0, flips: 0, driftBoosts: 0, shortcuts: 0, pads: 0,
    maxFlip: 0, maxSpeed: 0, maxAir: 0, cleanWins: 0, teamWins: 0, elimWins: 0, bestTrick: 0, bestBrawl: 0,
    ttGold: 0, cupRaces: 0, coinsEarned: 0, playTime: 0,
  },
  modes: {}, // 玩过的模式
  best: {}, // 计时赛最好成绩：{ 赛道 key: 秒 }
  medals: {}, // 计时赛最好奖牌：{ 赛道 key: 1~3 }
  ach: {}, // 成就：{ id: 时间戳 }
  cups: {}, // 杯赛最好成绩：{ id: 1 铜 / 2 银 / 3 金 }
  chal: {}, // 已完成的挑战
  daily: null,
});

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class Profile {
  constructor() {
    const def = defaults();
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(LS)) || {};
    } catch {
      saved = {};
    }
    const d = { ...def, ...saved };
    d.stats = { ...def.stats, ...(saved.stats || {}) };
    for (const k of ['owned', 'up', 'modes', 'best', 'medals', 'ach', 'cups', 'chal']) d[k] = { ...(saved[k] || {}) };
    this.data = d;
    this.ensureDaily();
  }

  save() {
    try {
      localStorage.setItem(LS, JSON.stringify(this.data));
    } catch {
      /* 存不下就算了 */
    }
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

  // ---------- 解锁 / 购买 ----------
  // 'free' 不需要解锁 / 'owned' 已拥有 / 'buy' 可以买 / 'locked' 等级或成就不够
  unlockState(u, key) {
    if (!u) return 'free';
    if (this.data.owned[key]) return 'owned';
    if (u.ach) return this.data.ach[u.ach] ? 'owned' : 'locked';
    if (u.lv && this.level < u.lv) return 'locked';
    if (u.cost) return 'buy';
    return 'owned';
  }

  usable(u, key) {
    const s = this.unlockState(u, key);
    return s === 'free' || s === 'owned';
  }

  buy(u, key) {
    if (this.unlockState(u, key) !== 'buy' || this.data.coins < u.cost) return false;
    this.data.coins -= u.cost;
    this.data.owned[key] = true;
    this.save();
    return true;
  }

  gearOwned(id) {
    return this.usable(GEAR[id] && GEAR[id].unlock, 'gear:' + id);
  }

  hatOwned(i) {
    return this.usable(HAT_UNLOCK[i], 'hat:' + i);
  }

  cosmeticOwned(slot, i) {
    const item = COSMETIC_SLOTS[slot] && COSMETIC_SLOTS[slot].list[i];
    if (!item) return false;
    return this.usable(item.unlock, `${slot}:${i}`);
  }

  // ---------- 装备强化 ----------
  up(gear) {
    const u = this.data.up[gear] || {};
    const out = {};
    for (const k of UP_KEYS) out[k] = Math.min(UP_MAX, u[k] | 0);
    return out;
  }

  upgradeCost(gear, line) {
    const lv = this.up(gear)[line];
    return lv >= UP_MAX ? 0 : UP_COST[lv];
  }

  upgrade(gear, line) {
    const cost = this.upgradeCost(gear, line);
    if (!cost || this.data.coins < cost || !this.gearOwned(gear)) return false;
    this.data.coins -= cost;
    const u = (this.data.up[gear] = this.up(gear));
    u[line]++;
    this.save();
    return true;
  }

  // ---------- 赛事解锁 ----------
  // 第 i 个杯赛：上一个杯赛拿到任意奖杯，或者等级够了
  cupUnlocked(i) {
    if (i <= 0) return true;
    return (this.data.cups[CUPS[i - 1].id] || 0) >= 1 || this.level >= CUP_LV[i];
  }

  // 固定赛道在快速赛里能不能选：所属杯赛已解锁
  trackUnlocked(id) {
    const k = CUPS.findIndex((c) => c.tracks.includes(id));
    return k >= 0 && this.cupUnlocked(k);
  }

  challengeUnlocked(ch) {
    return this.level >= (ch.lv || 1);
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
    let h = 0;
    for (const ch of today) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    const rng = mulberry32(h);
    const pool = TASKS.slice();
    const tasks = [];
    while (tasks.length < 3 && pool.length) {
      const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      tasks.push({ id: t.id, prog: 0, done: false });
    }
    this.data.daily = { date: today, tasks, modes: {}, bonus: false };
    this.save();
  }

  dailyTasks() {
    this.ensureDaily();
    return this.data.daily.tasks.map((t) => ({ ...TASK_MAP[t.id], prog: t.prog, done: t.done }));
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
    const hit = (u) => u && u.lv && u.lv > from && u.lv <= to;
    for (const k of GEAR_KEYS) if (hit(GEAR[k].unlock)) out.push(`${GEAR[k].icon} ${GEAR[k].name}${GEAR[k].unlock.cost ? '（可购买）' : ''}`);
    HAT_UNLOCK.forEach((u, i) => hit(u) && out.push(`发型「${HATS[i]}」${u.cost ? '（可购买）' : ''}`));
    for (const slot in COSMETIC_SLOTS) {
      COSMETIC_SLOTS[slot].list.forEach((it, i) => hit(it.unlock) && out.push(`${COSMETIC_SLOTS[slot].name}「${it.name}」${it.unlock.cost ? '（可购买）' : ''}`));
    }
    return out;
  }

  // ---------- 结算 ----------
  // rep：一局比赛里玩家自己的统计（见 main.js newReport / finishReport）
  // 返回给结算界面显示的奖励明细
  applyRace(rep) {
    const d = this.data;
    const s = d.stats;
    const lvFrom = this.level;
    const lines = [];
    const field = rep.field;
    const frac = field > 1 ? (rep.rank - 1) / (field - 1) : 0.5;
    let xp = field > 1 ? Math.round(130 - 90 * frac) : 70;
    let coins = field > 1 ? Math.round(70 - 50 * frac) : 30;
    if (!rep.finished) {
      xp = Math.round(xp * 0.5);
      coins = Math.round(coins * 0.5);
    }
    lines.push({ label: rep.mode === 'tt' ? '完成计时赛' : rep.finished ? `第 ${rep.rank} 名` : `第 ${rep.rank} 名（未完赛）`, xp, coins });
    const add = (label, x, c) => {
      if (!x && !c) return;
      lines.push({ label, xp: x, coins: c });
    };
    if (rep.hits) add(`击飞对手 ×${rep.hits}`, Math.min(rep.hits, 20) * 12, Math.min(rep.hits, 20) * 4);
    if (rep.flips) add(`空翻 ×${rep.flips}`, Math.min(rep.flips, 30) * 4, 0);
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
    for (const l of lines) {
      l.xp = Math.round(l.xp * mult);
      l.coins = Math.round(l.coins * mult);
      tx += l.xp;
      tc += l.coins;
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
      cupRaces: rep.kind === 'cup' ? 1 : 0,
    };
    for (const k in delta) s[k] += delta[k];
    s.knocked += rep.knocked;
    s.maxFlip = Math.max(s.maxFlip, rep.maxFlip);
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

    d.xp += tx;
    this.addCoins(tc);

    // 每日任务
    this.ensureDaily();
    const daily = d.daily;
    daily.modes[rep.mode] = true;
    const tasks = [];
    for (const t of daily.tasks) {
      if (t.done) continue;
      const def = TASK_MAP[t.id];
      t.prog = def.key === 'modes' ? Object.keys(daily.modes).length : t.prog + (delta[def.key] || 0);
      if (t.prog >= def.goal) {
        t.prog = def.goal;
        t.done = true;
        d.xp += TASK_XP;
        this.addCoins(TASK_COINS);
        tasks.push({ name: def.name, xp: TASK_XP, coins: TASK_COINS });
      }
    }
    let bonus = 0;
    if (!daily.bonus && daily.tasks.every((t) => t.done)) {
      daily.bonus = true;
      bonus = TASK_BONUS;
      this.addCoins(bonus);
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
      tasks,
      bonus,
      extra,
      ach,
      lvFrom,
      lvTo,
      unlocks: lvTo > lvFrom ? this.unlocksBetween(lvFrom, lvTo) : [],
    };
  }

  // 杯赛打完：记录最好奖杯，返回这次的奖励（按奖杯折算，首次拿到更好的奖杯另加一半）
  cupResult(cup, trophy) {
    const prev = this.data.cups[cup.id] || 0;
    if (trophy > prev) this.data.cups[cup.id] = trophy;
    const k = [0, 0.4, 0.6, 1][trophy];
    const first = trophy > prev ? 1.5 : 1;
    this.save();
    return { coins: Math.round(cup.reward.coins * k * first), xp: Math.round(cup.reward.xp * k * first), first: trophy > prev };
  }

  challengeResult(ch, ok) {
    if (!ok) return null;
    const first = !this.data.chal[ch.id];
    this.data.chal[ch.id] = true;
    this.save();
    // 重复完成只给三成
    const k = first ? 1 : 0.3;
    return { coins: Math.round(ch.reward.coins * k), xp: Math.round(ch.reward.xp * k), first };
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
