import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HAT, HATS } from '../src/config.js';
import { GEAR, GEAR_KEYS, STAT_MAX, FAIR_SUM, COSMETIC_SLOTS, BOX_POOL, gearStats, fairStats, gearMods, uniformUp, pickBotGear, rollBox, unlockOf } from '../src/gear.js';
import { mulberry32 } from '../src/util.js';

const sum = (s) => Object.values(s).reduce((a, b) => a + b, 0);

test('改装：每级加属性，等级和属性都有上限', () => {
  assert.equal(gearStats('ski', { wax: 3 }).speed, 3 + 0.2 * 3);
  assert.equal(gearStats('ski', { wax: 9 }).speed, 3 + 0.2 * 3);
  assert.ok(Math.abs(gearStats('ski', { core: 3, wax: 3, edge: 3 }).speed - (3 + 0.15 + 0.6 + 0.45)) < 1e-9);
  assert.equal(gearStats('dragon', uniformUp(3)).speed, STAT_MAX);
  assert.deepEqual(gearStats('nope'), GEAR.ski.stats);
});

test('改装：树末端的特殊效果', () => {
  const m = gearMods('ski', { charge: 3, jet: 2, guard: 1 });
  assert.ok(Math.abs(m.gain - 1.15) < 1e-9);
  assert.ok(Math.abs(m.nitro - 1.1) < 1e-9);
  assert.equal(m.shield, 1);
  const base = gearMods('ski', null);
  assert.deepEqual([base.gain, base.nitro, base.shield], [1, 1, 0]);
});

test('排位拉平：每件装备五项总和一样，长短板不变', () => {
  for (const k of GEAR_KEYS) {
    const s = fairStats(k);
    for (const v of Object.values(s)) assert.ok(v >= 1 && v <= STAT_MAX, `${k} 属性越界`);
    assert.ok(Math.abs(sum(s) - FAIR_SUM) < 0.6, `${k} 总和 ${sum(s)}`);
    const raw = GEAR[k].stats;
    for (const a in raw) for (const b in raw) if (raw[a] > raw[b]) assert.ok(s[a] >= s[b], `${k} 的 ${a}/${b} 高低反了`);
  }
});

test('排位拉平：改装不起作用', () => {
  assert.deepEqual(gearMods('carbon', uniformUp(3), true), gearMods('carbon', null, true));
  assert.notDeepEqual(gearMods('carbon', uniformUp(3)), gearMods('carbon', null));
});

test('机器人装备：简单难度不出 A / S', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const g = GEAR[pickBotGear(0, rng)];
    assert.ok(g.rarity === 'C' || g.rarity === 'B');
  }
});

test('补给箱：按权重抽档，覆盖全部可收集外观', () => {
  assert.equal(rollBox(() => 0).tier, 'C');
  assert.equal(rollBox(() => 0.999).tier, 'S');
  assert.equal(rollBox(() => 0.65).tier, 'A');
  const hats = HATS.map((_, i) => i).filter((i) => i !== DEFAULT_HAT).map((i) => `hat:${i}`);
  const accessories = Object.entries(COSMETIC_SLOTS).flatMap(([slot, { list }]) => list.slice(1).map((_, i) => `${slot}:${i + 1}`));
  assert.deepEqual(BOX_POOL.map(({ key }) => key).sort(), [...hats, ...accessories].sort());
  for (const { key } of BOX_POOL) assert.deepEqual(unlockOf(key), { box: true }, key);
});
