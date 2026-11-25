import assert from 'node:assert/strict';
import test from 'node:test';
import { GEAR_KEYS } from '../src/gear.js';
import { Profile } from '../src/profile.js';
import { localDay } from '../src/rank.js';
import { garageEntries } from '../src/ui/garage-catalog-state.js';
import { rankedState } from '../src/ui/ranked-state.js';
import { tuneView } from '../src/ui/tune-state.js';
import { drawShowroom } from '../wechat/showroom-ui.js';
import { drawRankMenu } from '../wechat/ranked-ui.js';
import { MiniUI } from '../wechat/ui.js';

function canvasContext() {
  return {
    createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, save() {}, restore() {}, translate() {}, transform() {},
    fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    scale() {}, arc() {}, quadraticCurveTo() {}, bezierCurveTo() {},
  };
}

test('车库目录：拥有状态、稀有度、搜索和排序来自现有装备目录', () => {
  const profile = new Profile();
  const game = { profile, look: { gear: 'ski' } };
  assert.equal(garageEntries(game).length, GEAR_KEYS.length);
  assert.equal(garageEntries(game, { ownership: 'owned' })[0].equipped, true);
  assert.deepEqual(garageEntries(game, { query: '悬浮', rank: 'A' }).map(({ id }) => id), ['hover']);
  assert.ok(garageEntries(game, { ownership: 'unowned' }).every((entry) => !entry.owned));
  assert.equal(garageEntries(game, { sort: 'rarity' })[0].gear.rarity, 'S');
});

test('微信车库：侧栏按稀有度筛选，目录卡片打开同一件装备的属性页', () => {
  const profile = new Profile();
  const game = { profile, look: { gear: 'ski' }, setShow: (...args) => { game.show = args; } };
  const ui = {
    game, tab: 'garage', w: 1191, h: 541, l: 14, r: 1177, t: 10, b: 529,
    models: [], hits: [], offsets: new Map(),
    ctx: canvasContext(),
    panel() {}, text() {}, rounded() {}, invalidate() {},
    headerRight() { return this.r; },
    addHit(hit) { this.hits.push(hit); },
    scrollArea(key, box, size, draw) { draw(0); },
    page(name) { this.panelPage = name; },
  };
  drawShowroom(ui);
  assert.equal(ui.previewGear, undefined);
  assert.ok(ui.models.some((model) => model.gear === 'wood'));
  ui.hits.find((hit) => hit.label === 'A · 稀有').action();
  assert.equal(ui.garageCatalog.rank, 'A');
  ui.models.length = 0;
  ui.hits.length = 0;
  drawShowroom(ui);
  const rareGear = new Set(garageEntries(game, { rank: 'A' }).map(({ id }) => id));
  assert.ok(ui.models.length && ui.models.every(({ gear }) => rareGear.has(gear)));
  ui.hits.find((hit) => hit.label === '全部').action();
  ui.models.length = 0;
  ui.hits.length = 0;
  drawShowroom(ui);
  ui.hits.find((hit) => hit.label === '木雪橇').action();
  assert.equal(ui.previewGear, 'wood');
  assert.equal(ui.panelPage, 'attr');
  assert.deepEqual(game.show, ['GARAGE', 'wood']);
  assert.equal(game.look.gear, 'ski');
});

test('改装科技树：前置节点在左侧，推荐路线和解锁来自改装进度', () => {
  const profile = new Profile();
  const view = tuneView(profile, 'ski', 'item', 'brace');
  const nodes = new Map(view.nodes.map((node) => [node.id, node]));
  assert.equal(view.current.id, 'brace');
  assert.match(view.reason, /护具升级/);
  assert.equal(nodes.get('pad').recommended, true);
  assert.equal(nodes.get('wax').recommended, false);
  assert.ok(view.nodes.every(({ need, x }) => !need || nodes.get(need).x < x));
});

test('微信改装：隐藏展台和详情快捷键，返回恢复同一件装备的属性页', () => {
  const profile = new Profile();
  const game = { profile, look: { gear: 'ski' }, setShow: (...args) => { game.show = args; } };
  const ui = {
    game, tab: 'garage', previewGear: 'ski', panelPage: 'attr', w: 667, h: 320, l: 14, r: 653, t: 10, b: 308,
    models: [], hits: [], icons: [], offsets: new Map(),
    ctx: canvasContext(), panel() {}, text() {}, rounded() {}, invalidate() {},
    icon(id) { this.icons.push(id); },
    headerRight() { return this.r; },
    addHit(hit) { this.hits.push(hit); },
    page: MiniUI.prototype.page,
    back: MiniUI.prototype.back,
  };
  ui.page('up');
  assert.deepEqual(game.show, [null]);
  drawShowroom(ui);
  assert.equal(ui.frame, null);
  assert.deepEqual(ui.models, []);
  assert.equal(ui.icons.length, 10);
  assert.ok(ui.icons.includes('jet') && ui.icons.includes('guard'));
  assert.ok(!ui.hits.some(({ label }) => label === '属性' || label === '去商城'));
  const core = ui.hits.find(({ label }) => label === '核心调校');
  const wax = ui.hits.find(({ label }) => label === '板底打蜡');
  assert.ok(core.x + core.w < wax.x);
  ui.hits.find(({ label }) => label === '改装').action();
  assert.equal(profile.up('ski').core, 1);
  ui.back();
  assert.equal(ui.panelPage, 'attr');
  assert.deepEqual(game.show, ['GARAGE', 'ski']);
});

test('排位赛界面：展示真实段位、当季场次和首胜进度', () => {
  const profile = new Profile();
  Object.assign(profile.rankState(), { pts: 175, games: 20, sg: 5, wins: 12, day: localDay() });
  const state = rankedState(profile, 'team');
  assert.equal(state.view.name, '白银');
  assert.equal(state.nextPoints, 250);
  assert.equal(state.view.next, '距黄金还差 75');
  assert.equal(state.percent, 50);
  assert.equal(state.games, 5);
  assert.equal(state.firstWin, true);
  assert.equal(state.mode.name, '组队竞速');
});

test('微信排位赛：共用页头保留赛季信息，返回依次回到总览和大厅', () => {
  const profile = new Profile();
  const texts = [];
  const ui = {
    game: { profile }, tab: 'race', panelPage: 'rank', racePick: 'rank', rankSection: 'rules',
    w: 667, h: 320, l: 14, r: 653, t: 10, b: 308, hits: [], offsets: new Map(),
    ctx: canvasContext(), panel() {}, rounded() {}, paragraph() {}, invalidate() {},
    headerRight() { return this.r - 40; },
    text(text, x, y, options) { texts.push({ text, x, y, options }); },
    addHit(hit) { this.hits.push(hit); },
    back: MiniUI.prototype.back, page: MiniUI.prototype.page,
  };
  drawRankMenu(ui);
  const title = texts.find(({ text, y }) => text === '排位赛' && y < ui.t + 45);
  assert.ok(title?.options.italic);
  const season = texts.find(({ text }) => /^第 \d+ 赛季$/.test(text));
  assert.ok(season.x > title.x && season.options.max > 0);
  assert.ok(texts.some(({ text }) => text.includes('后结束')));
  const back = ui.hits.find(({ label }) => label === '‹  返回');
  assert.equal(back.x, ui.l);
  assert.equal(back.w, 96);
  back.action();
  assert.equal(ui.rankSection, 'rank');
  back.action();
  assert.equal(ui.racePick, 'home');
  assert.equal(ui.panelPage, '');
});
