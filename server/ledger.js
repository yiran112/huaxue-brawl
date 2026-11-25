// 存档结算：雪花币、经验、装备、强化、补给箱、排位分都以服务器为准。
// 浏览器把自己做过的操作（买东西、强化、开箱、一局比赛的成绩单……）按顺序报上来，
// 服务器在自己那份存档上用同一套规则（src/profile.js）重做一遍；钱不够、没解锁之类不合规矩的操作直接跳过。
// 比赛成绩仍然是客户端报的，这里只能把每项卡在一局正常比赛能达到的范围里。
import { Profile, sanitizeProfile, ACHIEVEMENTS } from '../src/profile.js';
import { GEAR, UP_KEYS } from '../src/gear.js';
import { MODE_KEYS } from '../src/config.js';
import { RANK_MAP } from '../src/rank.js';
import { TRACK_MAP } from '../src/tracks.js';

export const MAX_OPS = 60; // 一次最多收这么多条操作
const KINDS = ['quick', 'online', 'rank'];

const num = (v, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(hi, n) : 0;
};

export function sanitizeRep(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const field = Math.max(1, num(r.field, 8));
  return {
    hits: num(r.hits, 60),
    knocked: num(r.knocked, 60),
    flips: num(r.flips, 200),
    maxFlip: num(r.maxFlip, 30),
    spins: num(r.spins, 200),
    maxSpin: num(r.maxSpin, 30),
    grabs: num(r.grabs, 200),
    maxGrab: num(r.maxGrab, 30),
    driftBoosts: num(r.driftBoosts, 300),
    shortcuts: num(r.shortcuts, 30),
    pads: num(r.pads, 100),
    maxSpeed: num(r.maxSpeed, 400),
    maxAir: num(r.maxAir, 120),
    skill: num(r.skill, 5e6),
    bestChain: num(r.bestChain, 5e6),
    bestMult: num(r.bestMult, 10),
    kind: KINDS.includes(r.kind) ? r.kind : 'quick',
    mode: MODE_KEYS.includes(r.mode) ? r.mode : 'race',
    rankMode: RANK_MAP[r.rankMode] ? r.rankMode : '',
    rank: Math.max(1, Math.min(field, Math.floor(num(r.rank, 8)))),
    field: Math.floor(field),
    finished: !!r.finished,
    time: num(r.time, 3600),
    difficulty: Math.floor(num(r.difficulty, 2)),
    score: num(r.score, 1e6),
    track: TRACK_MAP[r.track] ? r.track : '',
    length: TRACK_MAP[r.track] ? TRACK_MAP[r.track].length : 0,
    teamWin: !!r.teamWin,
    mateLeft: !!r.mateLeft,
    pb: !!r.pb,
    medal: Math.floor(num(r.medal, 3)),
    extra: [],
  };
}

// seasonRank(赛季号)：服务器自己从积分榜上查这个人上一周的名次
export function replayOps(base, ops, seasonRank = () => 0) {
  const p = new Profile();
  p.loadData(base);
  const list = Array.isArray(ops) ? ops.slice(0, MAX_OPS) : [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    switch (o.op) {
      case 'buy': {
        const key = typeof o.key === 'string' ? o.key.slice(0, 24) : '';
        p.buy(key);
        break;
      }
      case 'up':
        if (GEAR[o.gear] && UP_KEYS.includes(o.line)) p.upgrade(o.gear, o.line);
        break;
      case 'box':
        p.openBox();
        break;
      case 'race': {
        const rep = sanitizeRep(o.rep);
        // 排位成绩只认开赛时登记过的那项排位
        const pend = p.data.rank && p.data.rank.pending;
        if (rep.kind === 'rank' && !(pend && pend.mode === rep.rankMode)) {
          rep.kind = 'online';
          rep.rankMode = '';
        }
        p.applyRace(rep);
        break;
      }
      case 'rankBegin':
        p.rankBegin(o.mode);
        break;
      case 'rankLeave':
        p.rankLeave(!!o.escape);
        break;
      case 'season': {
        const s = p.data.season;
        p.claimSeason(o.id | 0, s && s.points > 0 ? seasonRank(s.id) : 0);
        break;
      }
    }
    p.checkAch();
  }
  return p.data;
}

// 只认浏览器那份的：昵称、称号（得有对应成就）、计时赛最好成绩和奖牌、杯赛成绩、玩过的模式
export function mergeClient(d, raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const c = sanitizeProfile(src);
  if (c.name) d.name = c.name;
  const title = typeof src.title === 'string' ? src.title : '';
  if (!title) d.title = '';
  else if (ACHIEVEMENTS.some((a) => a.title === title && d.ach[a.id])) d.title = title;
  for (const k in c.best) if (!(d.best[k] > 0) || c.best[k] < d.best[k]) d.best[k] = c.best[k];
  for (const k in c.medals) d.medals[k] = Math.max(d.medals[k] | 0, c.medals[k]);
  for (const k in c.cups) d.cups[k] = Math.max(d.cups[k] | 0, c.cups[k]);
  for (const k in c.modes) d.modes[k] = true;
  return d;
}

export function settle(base, body, seasonRank) {
  const b = body && typeof body === 'object' ? body : {};
  return sanitizeProfile(mergeClient(replayOps(base, b.ops, seasonRank), b.profile));
}
