import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaTooBig } from '../server/account.js';

const now = Date.now();
const H = 3600000;

test('没有旧档：直接收', () => {
  assert.equal(deltaTooBig(null, { coins: 1e7 }, 0), false);
});

test('雪花币涨幅：刚存过只允许小涨，隔得越久允许越多', () => {
  assert.equal(deltaTooBig({ coins: 100 }, { coins: 1100 }, now), false);
  assert.equal(deltaTooBig({ coins: 100 }, { coins: 5100 }, now), true);
  assert.equal(deltaTooBig({ coins: 100 }, { coins: 5100 }, now - 10 * H), false);
  assert.equal(deltaTooBig({ coins: 5000 }, { coins: 0 }, now), false);
});

test('场次和排位分不能凭空多', () => {
  assert.equal(deltaTooBig({ stats: { races: 10 } }, { stats: { races: 12 } }, now), false);
  assert.equal(deltaTooBig({ stats: { races: 10 } }, { stats: { races: 13 } }, now), true);
  assert.equal(deltaTooBig({ rank: { pts: 100 } }, { rank: { pts: 180 } }, now), false);
  assert.equal(deltaTooBig({ rank: { pts: 100 } }, { rank: { pts: 181 } }, now), true);
});

test('进行中的排位：清掉标记必须同时多结算一局', () => {
  const prev = { rank: { pts: 100, games: 3, pending: { mode: 'solo', at: 1 } } };
  assert.equal(deltaTooBig(prev, { rank: { pts: 100, games: 3, pending: null } }, now), true);
  assert.equal(deltaTooBig(prev, { rank: { pts: 82, games: 4, pending: null } }, now), false);
});

test('换周赛季：新赛季积分不能一上来就很高', () => {
  const prev = { season: { id: 1, points: 500 } };
  assert.equal(deltaTooBig(prev, { season: { id: 2, points: 30 } }, now), false);
  assert.equal(deltaTooBig(prev, { season: { id: 2, points: 41 } }, now), true);
});
