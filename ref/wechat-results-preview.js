// 调试用：在浏览器里跑微信版结算的 canvas 绘制（不属于游戏本体）。
// 打开 /ref/wechat-results.html?w=844&h=390&mode=podium|tt|practice&inset=47
import * as THREE from 'three';
import { MiniUI } from '../wechat/ui.js';
import { ModelPreviews } from '../wechat/model-previews.js';
import { drawResults } from '../wechat/results-ui.js';
import { BOT_NAMES, LOOK_PRESETS } from '../src/config.js';
import { Profile } from '../src/profile.js';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') || 844);
const H = Number(q.get('h') || 390);
const inset = Number(q.get('inset') || 0);
const mode = q.get('mode') || 'podium';
const dpr = Math.min(2, devicePixelRatio || 1);

const style = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
const flat = Object.assign(document.createElement('canvas'), { width: W * dpr, height: H * dpr });
flat.style.cssText = style;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(dpr);
renderer.setSize(W, H);
renderer.setClearColor(0, 0);
renderer.autoClear = false;
renderer.domElement.style.cssText = style + ';pointer-events:none';
document.body.append(flat, renderer.domElement);

const game = {
  renderer, profile: new Profile(), look: LOOK_PRESETS[0], session: { gear: 'ski' },
  replay: { btnShown: mode !== 'practice', play: () => console.log('replay') },
  touch: { release() {} },
  toMenu: () => console.log('menu'), nextRace: () => console.log('next'), startPractice: (g) => console.log('practice', g),
};
const ui = Object.create(MiniUI.prototype);
Object.assign(ui, {
  game, ctx: flat.getContext('2d'), scale: 1, w: W, h: H, l: 14 + inset, r: W - 14 - inset, t: 10, b: H - 12 - (inset ? 21 : 0),
  offsets: new Map(), hits: [], gestures: [], models: [], undrawableIcons: new Set(), redrawIcons: () => ui.invalidate(),
  modelPreviews: new ModelPreviews(),
});

const times = ['1:04.29', '1:05.81', '1:06.43', '1:08.24', '1:11.08', '1:12.96', '1:15.20', '1:18.37'];
const gear = ['storm', 'ski', 'wood'];
const rows = times.map((time, idx) => ({
  idx, rank: idx + 1, name: idx === 1 ? '滑雪玩家' : BOT_NAMES[idx], me: idx === 1,
  look: { ...LOOK_PRESETS[(idx + 5) % LOOK_PRESETS.length], gear: gear[idx] || 'ski' }, time,
}));
const lv = game.profile.levelInfo().lv;
const reward = {
  xp: 90, coins: 125, parts: 4, lvFrom: lv, lvTo: lv,
  lines: [{ label: '完赛奖励', xp: 40, coins: 45, parts: 1 }, { label: '第二名', xp: 50, coins: 80, parts: 3 }],
  extra: [], tasks: [], ach: [], unlocks: [],
};
const data = {
  podium: {
    title: '第 2 名', sub: '道具赛 · 雪松村', rows, reward, nextLabel: '再来一局 ▶',
    awards: [
      { icon: '💥', name: '击飞王', who: rows[0].name, val: '击飞 4 次' },
      { icon: '✨', name: '技巧王', who: rows[1].name, me: true, val: '技巧 1,620 分' },
      { icon: '🚀', name: '极速王', who: rows[2].name, val: '126 km/h' },
    ],
  },
  tt: {
    title: '🥈 银牌！', sub: '雪松村', reward, nextLabel: '再跑一趟 ▶',
    rows: [
      { rank: '你', name: '本次成绩', me: true, time: '1:05.81' }, { rank: '👻', name: '幽灵（之前最好）', time: '1:06.20' },
      { rank: '🥇', name: '金牌线', time: '1:02.00' }, { rank: '🥈', name: '银牌线', time: '1:06.00' }, { rank: '🥉', name: '铜牌线', time: '1:10.00' },
    ],
  },
  practice: { title: '试滑结束', sub: '雪松村', rows: [], nextLabel: '再滑一次', swapLabel: '换单板再滑' },
}[mode];
ui.showResults(data);

flat.addEventListener('click', (e) => ui.hit(e.offsetX, e.offsetY)?.action?.());
flat.addEventListener('wheel', (e) => {
  const g = ui.gestureAt(e.offsetX, e.offsetY);
  if (g) ui.offsets.set(g.key, Math.max(0, Math.min(g.max, (ui.offsets.get(g.key) || 0) + e.deltaY)));
});
window.__ui = ui;
function frame() {
  const c = ui.ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  ui.hits = [];
  ui.gestures = [];
  ui.models = [];
  drawResults(ui);
  renderer.clear();
  ui.modelPreviews.draw(ui);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
