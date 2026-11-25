import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_PRESETS } from '../src/config.js';
import { LOOK_EXTRA_DEFAULTS } from '../src/gear.js';
import { WARDROBE_GROUPS } from '../src/ui/appearance.js';
import { Profile } from '../src/profile.js';
import { drawWardrobe } from '../wechat/wardrobe-ui.js';

function wardrobe(width, height) {
  const profile = new Profile();
  const game = {
    profile,
    look: { ...LOOK_PRESETS[0], ...LOOK_EXTRA_DEFAULTS },
    account: { openManage() { game.managingAccount = true; } },
    setShow: (label, gear, patch, view) => { game.preview = { patch, view }; },
    setLook: (field, value) => { game.look[field] = value; },
  };
  const ui = {
    game, w: width, h: height, l: 14, r: width - 14, t: 10, b: height - 12,
    offsets: new Map(),
    ctx: {
      createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fill() {}, stroke() {},
      save() {}, translate() {}, transform() {}, restore() {},
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    },
    text() {}, panel() {}, rounded() {}, invalidate() {},
    headerRight() { return this.r; },
    addHit(hit) { this.hits.push(hit); },
    scrollArea(key, box, height, draw) { draw(this.offsets.get(key) || 0); },
    openTab(tab) { this.tab = tab; },
    back() { this.openTab('race'); },
  };
  const draw = () => {
    ui.hits = [];
    ui.models = [];
    ui.gestures = [];
    drawWardrobe(ui);
  };
  const find = (label) => ui.hits.find((hit) => hit.label === label);
  return { ui, game, draw, find };
}

test('微信装扮：分类、试穿区和物品卡横向排列，获取按钮位于展台下方', () => {
  for (const [width, height] of [[1191, 541], [667, 320]]) {
    const { ui, game, draw, find } = wardrobe(width, height);
    draw();
    const nav = find('饰品');
    const tile = find('双肩包');
    const action = find('去抽奖');
    assert.ok(nav.x + nav.w < ui.frame.x);
    assert.ok(ui.frame.x + ui.frame.w < tile.x);
    assert.ok(ui.frame.y + ui.frame.h < action.y && action.y + action.h <= ui.b);
    assert.ok(ui.models.some(({ appearance }) => appearance.field === 'back' && appearance.value === 1));
    const back = find('‹  返回');
    assert.ok(back.x === ui.l && back.y + back.h < nav.y);
    find('个人资料').action();
    assert.equal(game.managingAccount, true);
    back.action();
    assert.equal(ui.tab, 'race');
    find('饰品').action();
    draw();
    assert.equal(find('护目镜'), undefined);
    find('饰品').action();
    draw();
    assert.ok(find('护目镜'));
  }
});

test('微信装扮：选卡只试穿，锁定物品去抽奖，已有物品确认后穿戴', () => {
  const { ui, game, draw, find } = wardrobe(1191, 541);
  draw();
  find('超人披风').action();
  assert.deepEqual(game.preview, { patch: { back: 2 }, view: 'back' });
  assert.equal(game.look.back, 0);
  draw();
  find('去抽奖').action();
  assert.equal(ui.tab, 'shop');
  assert.equal(game.profile.data.boxN, 0);
  game.profile.data.owned['back:2'] = true;
  draw();
  find('确认使用').action();
  assert.equal(game.look.back, 2);
  assert.deepEqual(game.preview, { patch: null, view: 'back' });
});

test('装扮：配色里没有滑行装备这一项，装备颜色玩家改不了', () => {
  const fields = WARDROBE_GROUPS.flatMap((group) => group.parts.map((part) => part.field));
  assert.ok(!fields.includes('ski'), '配色里不该再有滑行装备');
  assert.ok(fields.includes('pants'));
  assert.ok(!('ski' in LOOK_PRESETS[0]), '默认造型里不该再带装备颜色');
});
