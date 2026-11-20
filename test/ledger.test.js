import test from 'node:test';
import assert from 'node:assert/strict';
import { Profile, sanitizeProfile, xpNeed, rankSeasonNow, ACHIEVEMENTS } from '../src/profile.js';
import { GEAR, BOX_COST } from '../src/gear.js';
import { TRACKS } from '../src/tracks.js';
import { replayOps, mergeClient, sanitizeRep, settle } from '../server/ledger.js';

const xpFor = (lv) => {
  let xp = 0;
  for (let i = 1; i < lv; i++) xp += xpNeed(i);
  return xp;
};
const clone = (d) => JSON.parse(JSON.stringify(d));

// 浏览器那边：一个记着操作的存档
function client(data) {
  const p = new Profile();
  if (data) p.loadData(data);
  const ops = [];
  p.onOp = (op) => ops.push(op);
  return { p, ops };
}

const raceRep = (over = {}) => ({
  hits: 2, hitsBy: {}, knocked: 1, knockedBy: {}, flips: 3, maxFlip: 2, spins: 1, maxSpin: 1, grabs: 0, maxGrab: 0,
  driftBoosts: 4, bigDrifts: 0, shortcuts: 1, pads: 2, maxSpeed: 90, maxAir: 1.5,
  skill: 4200, chains: 1, bestChain: 4200, bestMult: 3, breaks: 0,
  kind: 'quick', mode: 'race', rankMode: '', rank: 2, field: 6, finished: true, time: 95.3, difficulty: 1,
  score: 0, track: '', length: 0, teamWin: false, mateLeft: false, pb: false, medal: 0,
  ...over,
});

test('重做操作：钱不够、等级不够的购买不算', () => {
  const base = sanitizeProfile({ coins: 5000 });
  const d = replayOps(base, [{ op: 'buy', key: 'gear:wood' }]);
  assert.equal(d.owned['gear:wood'], undefined);
  assert.equal(d.coins, 5000);
  const rich = sanitizeProfile({ coins: GEAR.wood.unlock.cost, xp: xpFor(GEAR.wood.unlock.lv) });
  const d2 = replayOps(rich, [{ op: 'buy', key: 'gear:wood' }, { op: 'buy', key: 'gear:wood' }]);
  assert.equal(d2.owned['gear:wood'], true);
  assert.equal(d2.coins, 0);
});

test('重做操作：没有的装备不能改装，没解锁的节点不能改，不认识的操作跳过', () => {
  const base = sanitizeProfile({ coins: 10000, parts: 10000 });
  const core = { op: 'up', gear: 'ski', line: 'core' };
  const d = replayOps(base, [{ op: 'up', gear: 'sled', line: 'core' }, { op: 'nope' }, null, { op: 'up', gear: 'ski', line: 'wax' }, core, core, core, { op: 'up', gear: 'ski', line: 'wax' }, { op: 'up', gear: 'ski', line: 'toString' }]);
  assert.equal(d.up.sled, undefined);
  assert.equal(d.up.ski.core, 3);
  assert.equal(d.up.ski.wax, 1);
  assert.equal(d.parts, 10000 - 190 - 60);
  assert.equal(d.coins, 10000);
});

test('改装币：比赛按名次给，做完每日任务另给，服务器重算出一样的数', () => {
  const start = sanitizeProfile({ parts: 0 });
  const { p, ops } = client(start);
  const first = p.applyRace(raceRep({ rank: 1, field: 6 }));
  assert.equal(first.lines[0].parts, 60);
  const last = p.applyRace(raceRep({ rank: 6, field: 6, finished: false }));
  assert.equal(last.lines[0].parts, 15);
  const online = p.applyRace(raceRep({ rank: 1, field: 6, kind: 'online' }));
  assert.equal(online.lines[0].parts, 72);
  const gotTasks = [first, last, online].reduce((n, r) => n + r.tasks.reduce((m, t) => m + t.parts, 0) + (r.bonusParts || 0), 0);
  assert.equal(p.parts, 60 + 15 + 72 + gotTasks);
  const d = replayOps(clone(start), ops);
  assert.equal(d.parts, p.parts);
});

test('补给箱：同一个种子，浏览器和服务器开出一样的东西', () => {
  const start = sanitizeProfile({ coins: BOX_COST * 5, boxSeed: 123456 });
  const { p, ops } = client(start);
  const got = [p.openBox(), p.openBox(), p.openBox()].map((r) => r.key);
  assert.equal(p.data.boxN, 3);
  const d = replayOps(clone(start), ops);
  assert.equal(d.boxN, 3);
  assert.equal(d.coins, p.data.coins);
  for (const k of got) assert.equal(d.owned[k], true);
  assert.deepEqual(Object.keys(d.owned).sort(), Object.keys(p.data.owned).sort());
});

test('成绩单：每项卡在一局能达到的范围里', () => {
  const r = sanitizeRep({ hits: 1e9, field: 99, rank: 50, kind: 'cheat', mode: 'x', track: 'nope', length: 1e6, extra: [{ coins: 1e6 }] });
  assert.equal(r.hits, 60);
  assert.equal(r.field, 8);
  assert.equal(r.rank, 8);
  assert.equal(r.kind, 'quick');
  assert.equal(r.mode, 'race');
  assert.equal(r.length, 0);
  assert.deepEqual(r.extra, []);
});

test('排位成绩：没登记开赛的按普通联机算，登记过的照常加分', () => {
  const base = sanitizeProfile({ xp: xpFor(10), rank: { pts: 300, season: rankSeasonNow().id } });
  const rep = raceRep({ kind: 'rank', rankMode: 'solo', mode: 'speed', rank: 1 });
  const forged = replayOps(clone(base), [{ op: 'race', rep }]);
  assert.equal(forged.rank.pts, 300);
  assert.equal(forged.stats.races, 1);
  const real = replayOps(clone(base), [{ op: 'rankBegin', mode: 'solo' }, { op: 'race', rep }]);
  assert.ok(real.rank.pts > 300);
  assert.equal(real.rank.pending, null);
});

test('浏览器那份只认昵称、称号、计时赛成绩，钱和经验不认', () => {
  const a = ACHIEVEMENTS.find((x) => x.title);
  const t = TRACKS[0].id;
  const d = sanitizeProfile({ coins: 100, best: { [t]: 60 } });
  mergeClient(d, { coins: 99999, xp: 1e6, name: '小明', title: a.title, best: { [t]: 50 }, owned: { 'gear:sled': true } });
  assert.equal(d.coins, 100);
  assert.equal(d.xp, 0);
  assert.equal(d.name, '小明');
  assert.equal(d.title, '');
  assert.equal(d.best[t], 50);
  assert.equal(d.owned['gear:sled'], undefined);
  d.ach[a.id] = 1;
  mergeClient(d, { title: a.title, best: { [t]: 70 } });
  assert.equal(d.title, a.title);
  assert.equal(d.best[t], 50);
});

test('正常玩：服务器重算出来的存档和浏览器一致', () => {
  const start = sanitizeProfile({ coins: 2000, xp: xpFor(5), boxSeed: 99 });
  const { p, ops } = client(start);
  p.applyRace(raceRep());
  p.upgrade('ski', 'core');
  p.openBox();
  p.applyRace(raceRep({ mode: 'brawl', rank: 1, hits: 7 }));
  p.buy(GEAR.wood.unlock, 'gear:wood');
  const d = settle(clone(start), { profile: p.data, ops });
  const c = sanitizeProfile(p.data);
  for (const k of ['coins', 'parts', 'xp', 'owned', 'up', 'boxN', 'modes', 'stats', 'season']) assert.deepEqual(d[k], c[k], k);
  assert.deepEqual(d.daily.tasks, p.data.daily.tasks);
  assert.deepEqual(Object.keys(d.ach).sort(), Object.keys(p.data.ach).sort());
});
