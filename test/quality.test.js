import test from 'node:test';
import assert from 'node:assert/strict';
import { Quality } from '../src/quality.js';

// 手机：横屏 844×390、像素比 3，触屏默认中档
globalThis.window = { innerWidth: 844, innerHeight: 390, devicePixelRatio: 3 };
globalThis.matchMedia = () => ({ matches: true });

function setup(t) {
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const game = {
    soloRules: { quality: 'auto' },
    state: 'race',
    paused: false,
    renderer: { ratio: 1, getPixelRatio() { return this.ratio; }, setPixelRatio(r) { this.ratio = r; } },
    sun: { shadow: { mapSize: { x: 0, set(x) { this.x = x; } }, map: null } },
    fx: { lit: {}, glow: {} },
  };
  const q = new Quality(game);
  q.apply();
  // 按固定帧率跑若干秒
  const run = (fps, seconds) => {
    for (let i = 0; i < fps * seconds; i++) {
      now += 1000 / fps;
      q.sample();
    }
  };
  return { q, game, run };
}

test('画质：手机屏幕按像素预算渲染，不再是 1 倍', (t) => {
  const { q, game } = setup(t);
  assert.equal(q.level, 'mid');
  assert.ok(game.renderer.ratio > 1.8 && game.renderer.ratio <= 3);
});

test('画质：省电模式锁 30 帧，降档没用就退回原档、不再降', (t) => {
  const { q, run } = setup(t);
  run(30, 5);
  assert.equal(q.level, 'low');
  run(30, 12);
  assert.equal(q.level, 'mid');
  assert.equal(q.locked, true);
  run(30, 30);
  assert.equal(q.level, 'mid');
});

test('画质：真是画面太重，降档后帧率上来了就留在低档', (t) => {
  const { q, run } = setup(t);
  run(30, 5);
  assert.equal(q.level, 'low');
  run(58, 20);
  assert.equal(q.level, 'low');
  assert.equal(q.locked, false);
});

test('画质：手动选了档位就不自动改', (t) => {
  const { q, game, run } = setup(t);
  game.soloRules.quality = 'high';
  q.apply();
  run(30, 20);
  assert.equal(q.level, 'high');
});
