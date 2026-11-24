import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawResults } from '../wechat/pages.js';

function renderResults(width, height, offset, practice = false) {
  const buttons = [];
  const calls = [];
  const ui = {
    w: width, h: height, l: 14, r: width - 14, t: 10, b: height - 12,
    ctx: { fillRect() {}, save() {}, translate() {}, fill() {}, stroke() {}, restore() {} },
    game: {
      replay: { btnShown: !practice, play: () => calls.push('replay') },
      session: { gear: 'ski' },
      toMenu: () => calls.push('menu'),
      nextRace: () => calls.push('next'),
      startPractice: (gear) => calls.push(gear),
    },
    results: {
      title: practice ? '试滑结束' : '第 1 名',
      sub: '雪松村',
      rows: practice ? [] : Array.from({ length: 8 }, (_, i) => ({ rank: i + 1, name: '滑雪客', time: '01:20.0' })),
      swapLabel: practice ? '换单板再滑' : '',
    },
    text() {}, panel() {}, rounded() {},
    scrollArea(key, box, content, draw) {
      this.scroll = { box, content };
      this.scrolling = true;
      draw(offset);
      this.scrolling = false;
    },
    button(label, x, y, w, h, action) {
      buttons.push({ label, x, y, w, h, action, scrolling: this.scrolling });
    },
  };
  drawResults(ui);
  return { ui, buttons, calls };
}

test('微信结算的返回大厅按钮在小屏上无需滚动，滚动成绩时位置也保持固定', () => {
  for (const [width, height] of [[667, 320], [844, 390]]) {
    const initial = renderResults(width, height, 0);
    const scrolled = renderResults(width, height, 180);
    const [back] = initial.buttons;
    assert.ok(initial.ui.scroll.content > initial.ui.scroll.box.h);
    assert.equal(back.label, '返回大厅');
    assert.equal(back.scrolling, false);
    assert.ok(back.y >= initial.ui.scroll.box.y + initial.ui.scroll.box.h);
    assert.ok(back.y + back.h <= initial.ui.b);
    assert.deepEqual(scrolled.buttons.map(({ y }) => y), initial.buttons.map(({ y }) => y));
    back.action();
    assert.deepEqual(initial.calls, ['menu']);
  }
});

test('微信试滑结算可以直接返回和换装备再滑', () => {
  const { buttons, calls } = renderResults(667, 320, 0, true);
  buttons[1].action();
  buttons[0].action();
  assert.deepEqual(calls, ['learner', 'menu']);
  assert.ok(buttons.every((button) => !button.scrolling));
});
