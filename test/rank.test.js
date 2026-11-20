import test from 'node:test';
import assert from 'node:assert/strict';
import { tierAt, scoreRank, scoreLeave, localDay, ESCAPE_EXTRA } from '../src/rank.js';

const today = localDay();

test('段位：边界和星级', () => {
  assert.equal(tierAt(0).name, '青铜');
  assert.equal(tierAt(-5).index, 0);
  assert.equal(tierAt('abc').index, 0);
  assert.equal(tierAt(99).name, '青铜');
  assert.equal(tierAt(99).star, 5);
  assert.equal(tierAt(100).name, '白银');
  assert.equal(tierAt(100).star, 1);
  const top = tierAt(5000);
  assert.equal(top.name, '车神');
  assert.equal(top.next, 0);
  assert.equal(top.star, 0);
});

test('个人竞速：名次加减分，没完赛按最后一名', () => {
  const st = { pts: 300, day: today };
  assert.equal(scoreRank(st, { rankMode: 'solo', rank: 1, finished: true }).delta, 26);
  assert.equal(scoreRank(st, { rankMode: 'solo', rank: 3, finished: true }).win, true);
  assert.equal(scoreRank(st, { rankMode: 'solo', rank: 4, finished: true }).win, false);
  assert.equal(scoreRank(st, { rankMode: 'solo', rank: 6, finished: true }).delta, -18);
  assert.equal(scoreRank(st, { rankMode: 'solo', rank: 1, finished: false }).delta, -18);
});

test('今日首胜多加 8 分', () => {
  const r = scoreRank({ pts: 300, day: '' }, { rankMode: 'solo', rank: 1, finished: true });
  assert.equal(r.first, true);
  assert.equal(r.delta, 34);
});

test('青铜不扣分，刚升段不掉回上一段', () => {
  assert.equal(scoreRank({ pts: 50, day: today }, { rankMode: 'solo', rank: 6, finished: true }).delta, 0);
  const r = scoreRank({ pts: 105, day: today }, { rankMode: 'solo', rank: 6, finished: true });
  assert.equal(r.delta, -5);
  assert.equal(r.after, 100);
});

test('组队：队友中途走了，输了只扣一半', () => {
  const st = { pts: 300, day: today };
  assert.equal(scoreRank(st, { rankMode: 'team', rank: 4, teamWin: false }).delta, -12);
  assert.equal(scoreRank(st, { rankMode: 'team', rank: 4, teamWin: false, mateLeft: true }).delta, -6);
  assert.equal(scoreRank(st, { rankMode: 'team', rank: 1, teamWin: true }).delta, 28);
  assert.equal(scoreRank(st, { rankMode: 'item', rank: 2, teamWin: true, hits: 2 }).delta, 24);
});

test('中途离开：逃跑多扣、不受保护；掉线按输算', () => {
  assert.equal(scoreLeave({ pts: 50 }, 'solo', false).delta, 0);
  assert.equal(scoreLeave({ pts: 50 }, 'solo', true).delta, -18 - ESCAPE_EXTRA);
  assert.equal(scoreLeave({ pts: 105 }, 'solo', false).delta, -5);
  assert.equal(scoreLeave({ pts: 10 }, 'solo', true).after, 0);
  assert.equal(scoreLeave({ pts: 300 }, 'nope', true), null);
  assert.equal(scoreRank({ pts: 300 }, { rankMode: 'nope' }), null);
});
