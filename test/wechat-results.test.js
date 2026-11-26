import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawResults } from '../wechat/results-ui.js';

function canvasContext() {
  return {
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, save() {}, restore() {}, translate() {}, transform() {}, rotate() {}, scale() {}, clip() {},
    fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
    measureText: (text) => ({ width: String(text).length * 9 }),
  };
}

const LOOK = { skin: 0, jacket: 0xff3d6e, stripe: 0xffd21f, hatColor: 0x2f3fd0, gear: 'ski' };

function renderResults(width, height, offset, { practice = false, podium = false, reward = null, awards = [] } = {}) {
  const buttons = [];
  const calls = [];
  const texts = [];
  const ui = {
    w: width, h: height, l: 14, r: width - 14, t: 10, b: height - 12,
    ctx: canvasContext(), models: [], hits: [], scrolls: {},
    game: {
      replay: { btnShown: !practice, play: () => calls.push('replay') },
      session: { gear: 'ski' },
      profile: { coins: 300, parts: 4, levelInfo: () => ({ lv: 3, cur: 20, need: 100 }) },
      toMenu: () => calls.push('menu'),
      nextRace: () => calls.push('next'),
      startPractice: (gear) => calls.push(gear),
    },
    results: {
      title: practice ? '试滑结束' : '第 1 名',
      sub: '雪松村',
      rows: practice ? [] : Array.from({ length: 8 }, (_, i) => ({
        rank: i + 1, name: '滑雪客', time: '01:20.0', me: i === 1, ...(podium ? { look: LOOK } : {}),
      })),
      swapLabel: practice ? '换单板再滑' : '',
      reward,
      awards,
    },
    text(value) { texts.push(String(value)); }, panel() {}, rounded() {}, icon() {}, invalidate() {},
    addHit(hit) { this.hits.push(hit); },
    scrollArea(key, box, content, draw) {
      this.scrolls[key] = { box, content };
      this.scrolling = true;
      draw(offset);
      this.scrolling = false;
    },
    button(label, x, y, w, h, action) {
      buttons.push({ label, x, y, w, h, action, scrolling: this.scrolling });
    },
  };
  drawResults(ui);
  return { ui, buttons, calls, texts };
}

test('微信结算的返回大厅按钮在小屏上无需滚动，滚动成绩时位置也保持固定', () => {
  for (const [width, height] of [[667, 320], [844, 390]]) {
    const awards = ['击飞王', '技巧王', '极速王'].map((name) => ({ icon: '💥', name, who: '滑雪客', val: '3 次' }));
    const initial = renderResults(width, height, 0, { awards });
    const scrolled = renderResults(width, height, 180, { awards });
    const list = initial.ui.scrolls.results;
    const [back] = initial.buttons;
    assert.ok(list.content > list.box.h);
    assert.equal(back.label, '返回大厅');
    assert.equal(back.scrolling, false);
    assert.ok(back.y >= list.box.y + list.box.h);
    assert.ok(back.y + back.h <= initial.ui.b);
    assert.ok(initial.buttons.every((b) => b.x >= initial.ui.l && b.x + b.w <= initial.ui.r + 0.5));
    assert.deepEqual(scrolled.buttons.map(({ y }) => y), initial.buttons.map(({ y }) => y));
    back.action();
    assert.deepEqual(initial.calls, ['menu']);
  }
});

test('微信试滑结算可以直接返回和换装备再滑', () => {
  const { buttons, calls } = renderResults(667, 320, 0, { practice: true });
  buttons[1].action();
  buttons[0].action();
  assert.deepEqual(calls, ['learner', 'menu']);
  assert.ok(buttons.every((button) => !button.scrolling));
});

test('微信结算不再显示标题下的模式和用时说明', () => {
  const { texts } = renderResults(844, 390, 0);
  assert.ok(!texts.includes('雪松村'));
});

test('微信领奖台：前三名的 3D 角色在右边舞台上，不和榜单、按钮重叠；奖励明细可以切换', () => {
  const reward = { xp: 90, coins: 125, parts: 4, lvFrom: 3, lvTo: 3, lines: [{ label: '完赛奖励', xp: 40, coins: 45, parts: 1 }],
    extra: [], tasks: [], ach: [], unlocks: [] };
  const { ui, buttons } = renderResults(844, 390, 0, { podium: true, reward });
  const list = ui.scrolls.results.box;
  assert.equal(ui.models.length, 3);
  assert.deepEqual(ui.models.map((m) => m.place), [0, 1, 2]);
  for (const m of ui.models) {
    assert.ok(m.x >= list.x + list.w, '角色在榜单右边');
    assert.ok(m.y + m.h <= buttons[0].y, '角色在按钮上面');
  }
  const toggle = ui.hits.find((hit) => hit.label === '奖励明细');
  assert.ok(toggle);
  toggle.action();
  assert.equal(ui.resultsDetail, true);
  ui.models.length = 0;
  drawResults(ui);
  assert.equal(ui.models.length, 0);
  assert.ok(ui.scrolls['results-detail']);
});
