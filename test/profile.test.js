import test from 'node:test';
import assert from 'node:assert/strict';
import { Profile, sanitizeProfile, START_COINS, START_PARTS, xpNeed, ACHIEVEMENTS } from '../src/profile.js';
import { DEFAULT_HAT } from '../src/config.js';
import { GEAR, COSMETIC_SLOTS, BOX_COST, BOX_REFUND, BOX_POOL, UP_KEYS } from '../src/gear.js';

// 测试里没有 localStorage，Profile 只在内存里
const fresh = () => new Profile();
const xpFor = (lv) => {
  let xp = 0;
  for (let i = 1; i < lv; i++) xp += xpNeed(i);
  return xp;
};

test('存档校验：不认识的东西丢掉，数值卡在范围内', () => {
  const d = sanitizeProfile({
    coins: -50,
    xp: 'abc',
    owned: { 'gear:sled': true, 'gear:nope': true, 'hat:99': true, 'back:3': true, x: true, 'a:b:c': true },
    up: { ski: { wax: 9, bind: -2, pad: 'x' }, nope: { wax: 1 } },
    stats: { races: 1e12, maxGrab: 3.14159 },
    rank: { pts: 50, pending: { mode: 'nope', at: 1 } },
  });
  assert.equal(d.coins, 0);
  assert.equal(d.xp, 0);
  assert.deepEqual(Object.keys(d.owned).sort(), ['back:3', 'gear:sled']);
  assert.deepEqual(d.up, { ski: { wax: 3 } });
  assert.equal(d.stats.races, 1e9);
  assert.equal(d.stats.maxGrab, 3.1);
  assert.equal(d.rank.pending, null);
  assert.equal(sanitizeProfile({ rank: { pending: { mode: 'solo', at: 5 } } }).rank.pending.mode, 'solo');
});

test('存档校验：称号要有对应成就', () => {
  const a = ACHIEVEMENTS.find((x) => x.title);
  assert.equal(sanitizeProfile({ title: a.title }).title, '');
  assert.equal(sanitizeProfile({ title: a.title, ach: { [a.id]: 1 } }).title, a.title);
});

test('等级：经验刚好够就升级', () => {
  const p = fresh();
  assert.equal(p.levelInfo(0).lv, 1);
  assert.deepEqual(p.levelInfo(xpNeed(1)), { lv: 2, cur: 0, need: xpNeed(2) });
});

test('购买：等级不够买不了，钱不够买不了，买了扣钱', () => {
  const p = fresh();
  assert.equal(p.coins, START_COINS);
  const u = GEAR.wood.unlock;
  p.data.coins = 5000;
  assert.equal(p.buy('gear:wood'), false);
  p.data.xp = xpFor(u.lv);
  p.data.coins = u.cost - 1;
  assert.equal(p.buy('gear:wood'), false);
  p.data.coins = u.cost + 10;
  assert.equal(p.buy('gear:wood'), true);
  assert.equal(p.coins, 10);
  assert.equal(p.gearOwned('wood'), true);
  assert.equal(p.buy('gear:wood'), false);
});

test('改装：没有的装备不能改，上一个节点改满才解锁，价格按排和稀有度', () => {
  const p = fresh();
  p.data.parts = 10000;
  const coins = p.coins;
  assert.equal(p.upgrade('sled', 'core'), false);
  assert.equal(p.upgradeCost('ski', 'core'), 40);
  assert.equal(p.upgradeCost('race', 'core'), 50);
  assert.equal(p.upgradeFullCost('ski', 'core'), 190);
  assert.equal(p.upNeed('ski', 'wax'), 'core');
  assert.equal(p.upgrade('ski', 'wax'), false);
  assert.equal(p.upgrade('ski', 'core'), true);
  assert.equal(p.parts, 9960);
  assert.equal(p.up('ski').core, 1);
  p.upgrade('ski', 'core');
  p.upgrade('ski', 'core');
  assert.equal(p.upgradeCost('ski', 'core'), 0);
  assert.equal(p.upgrade('ski', 'core'), false);
  assert.equal(p.upNeed('ski', 'wax'), '');
  assert.equal(p.upNeed('ski', 'edge'), 'wax');
  assert.equal(p.upgradeCost('ski', 'wax'), 60);
  assert.equal(p.upgrade('ski', 'wax'), true);
  assert.equal(p.upgradeFullCost('ski', 'wax'), 220);
  assert.equal(p.parts, 10000 - 190 - 60);
  assert.equal(p.coins, coins);
});

test('改装：花的是改装币，不够就改不了', () => {
  const p = fresh();
  p.data.coins = 1e6;
  p.data.parts = 39;
  assert.equal(p.upgrade('ski', 'core'), false);
  p.data.parts = 40;
  assert.equal(p.upgrade('ski', 'core'), true);
  assert.equal(p.parts, 0);
  assert.equal(p.coins, 1e6);
});

test('改装：一件装备整棵树改满的价格', () => {
  const p = fresh();
  const full = (g) => UP_KEYS.reduce((n, k) => n + p.upgradeFullCost(g, k), 0);
  assert.equal(full('ski'), 3670);
  assert.equal(full('aurora'), 7340);
});

test('改装币：新档和没有这一项的旧档都有开局的一份', () => {
  assert.equal(fresh().parts, START_PARTS);
  assert.equal(sanitizeProfile({ coins: 500 }).parts, START_PARTS);
  assert.equal(sanitizeProfile({ parts: 0 }).parts, 0);
  assert.equal(sanitizeProfile({ parts: -5 }).parts, 0);
});

test('补给箱：扣钱，开到重复的折回一部分', () => {
  const p = fresh();
  p.data.coins = BOX_COST - 1;
  assert.equal(p.openBox(() => 0), null);
  p.data.coins = BOX_COST * 2;
  const a = p.openBox(() => 0);
  assert.equal(a.key, BOX_POOL[0].key);
  assert.equal(a.dup, false);
  assert.equal(p.cosmeticOwned('goggles', 2), true);
  assert.equal(p.coins, BOX_COST);
  const b = p.openBox(() => 0);
  assert.equal(b.dup, true);
  assert.equal(p.coins, BOX_REFUND);
});

test('外观：基础造型可用，奖品不会购买或随等级和成就获得，已入库的外观继续可用', () => {
  const p = fresh();
  assert.equal(p.hatOwned(DEFAULT_HAT), true);
  for (const slot of Object.keys(COSMETIC_SLOTS)) assert.equal(p.cosmeticOwned(slot, 0), true);
  p.data.xp = xpFor(60);
  p.data.coins = 10000;
  p.data.ach = Object.fromEntries(ACHIEVEMENTS.map(({ id }) => [id, 1]));
  for (const { key } of BOX_POOL) {
    const [slot, id] = key.split(':');
    assert.equal(slot === 'hat' ? p.hatOwned(+id) : p.cosmeticOwned(slot, +id), false, key);
    assert.equal(p.buy(key), false, key);
  }
  assert.equal(p.coins, 10000);
  assert.deepEqual(p.data.owned, {});
  p.loadData(sanitizeProfile({ owned: { 'hat:6': true, 'back:3': true } }));
  assert.equal(p.hatOwned(6), true);
  assert.equal(p.cosmeticOwned('back', 3), true);
  assert.equal(p.boxOwned('back:3'), true);
});

test('排位：开赛记下待结算，结算或离开时清掉', () => {
  const p = fresh();
  p.rankState().pts = 300;
  p.rankBegin('solo');
  assert.equal(p.data.rank.pending.mode, 'solo');
  p.data.rank.day = '';
  p.applyRank({ rankMode: 'solo', rank: 1, finished: true });
  assert.equal(p.data.rank.pending, null);
  assert.equal(p.rankPoints(), 334);
  assert.equal(p.data.rank.games, 1);
  assert.equal(p.data.rank.wins, 1);
  assert.equal(p.rankLeave(true), null);
  p.rankBegin('solo');
  assert.equal(p.rankLeave(true).delta, -28);
  assert.equal(p.rankPoints(), 306);
  assert.equal(p.data.rank.games, 2);
});

test('每日任务：每天三个', () => {
  const p = fresh();
  assert.equal(p.dailyTasks().length, 3);
  assert.equal(new Set(p.dailyTasks().map((t) => t.id)).size, 3);
});
