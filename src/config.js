// 全局配置：主题、武器、角色预设、规则
import { iconToken } from './icon-art.js';

export const THEMES = {
  day: {
    name: '晴空雪岭',
    skyTop: 0x1a63d8, skyHor: 0xbfe2ff, fog: 0xcbe4ff, fogNear: 260, fogFar: 1700,
    sunDir: [0.55, 0.52, 0.35], sunColor: 0xfff0c0, sunInt: 4.4, sunDisc: 0xffffff,
    hemiSky: 0x5f8fff, hemiGround: 0xc9dcff, hemiInt: 1.75,
    snow: 0xffffff, rock: 0xc8632b, rock2: 0x9e4a22,
    tree: 0x1d5a3d, tree2: 0x2c7a4b, trunk: 0x6b4226,
    cloud: 0xffffff, snowfall: 0, aurora: false, stars: false,
  },
  sunset: {
    name: '黄昏金顶',
    skyTop: 0x4f79c9, skyHor: 0xffd493, fog: 0xffd7a6, fogNear: 200, fogFar: 1500,
    sunDir: [0.22, 0.2, -1], sunColor: 0xffb060, sunInt: 4.6, sunDisc: 0xfff2c4,
    hemiSky: 0x8f86cf, hemiGround: 0xffd4ae, hemiInt: 1.45,
    snow: 0xfff4e8, rock: 0xb95a2a, rock2: 0x8a4020,
    tree: 0x2a5a36, tree2: 0x3d7440, trunk: 0x6b4226,
    cloud: 0xffe6c4, snowfall: 0, aurora: false, stars: false,
  },
  storm: {
    name: '暴雪紫岩',
    skyTop: 0x8aa0cc, skyHor: 0xd6e0f2, fog: 0xccd7ee, fogNear: 70, fogFar: 620,
    sunDir: [-0.4, 0.7, 0.3], sunColor: 0xe8ecff, sunInt: 2.2, sunDisc: 0xf0f4ff,
    hemiSky: 0x8fa6e6, hemiGround: 0xd5def5, hemiInt: 2.1,
    snow: 0xf3f6ff, rock: 0x6c5a88, rock2: 0x53446e,
    tree: 0x29535c, tree2: 0x3a6c70, trunk: 0x4e3a34,
    cloud: 0xe4eaf6, snowfall: 1, aurora: false, stars: false,
  },
  night: {
    name: '极光之夜',
    skyTop: 0x040a22, skyHor: 0x1c3d6e, fog: 0x14294c, fogNear: 140, fogFar: 1300,
    sunDir: [-0.35, 0.6, -0.5], sunColor: 0xb6ccff, sunInt: 2.5, sunDisc: 0xeef4ff,
    hemiSky: 0x2f55ad, hemiGround: 0x3b5c9c, hemiInt: 1.5,
    snow: 0xdde8ff, rock: 0x4a5a7c, rock2: 0x37445f,
    tree: 0x12323b, tree2: 0x1b4a4a, trunk: 0x2e2622,
    cloud: 0x2a3d66, snowfall: 0.25, aurora: true, stars: true,
  },
};
export const THEME_KEYS = Object.keys(THEMES);

export const LENGTHS = {
  short: { name: '短（约1分钟）', length: 1900 },
  medium: { name: '中（约2分钟）', length: 2900 },
  long: { name: '长（约3分钟）', length: 4300 },
};

// w: 按名次分段的掉落权重 [领先(1-2名), 中游(3-5名), 落后(6-8名)]
export const WEAPONS = {
  rocket:    { name: '火箭筒',   icon: iconToken('rocket'), ammo: 1, w: [8, 10, 8],  prop: 'tube', ai: 'ahead' },
  homing:    { name: '追踪导弹', icon: iconToken('homing'), ammo: 1, w: [2, 8, 10],  prop: 'tube', ai: 'anyAhead' },
  snowball:  { name: '雪球',     icon: iconToken('snowball'), ammo: 3, w: [10, 6, 3],  prop: 'gun',  ai: 'ahead' },
  freeze:    { name: '冰冻枪',   icon: iconToken('freeze'), ammo: 1, w: [4, 6, 6],   prop: 'gun',  ai: 'ahead' },
  gatling:   { name: '加特林',   icon: iconToken('gatling'), ammo: 2, w: [5, 8, 7],   prop: 'gatling', ai: 'ahead' },
  shotgun:   { name: '霰弹枪',   icon: iconToken('shotgun'), ammo: 2, w: [7, 6, 4],   prop: 'gun',  ai: 'near' },
  mine:      { name: '地雷',     icon: iconToken('mine'), ammo: 2, w: [12, 6, 2],  prop: null,   ai: 'behind' },
  dynamite:  { name: '炸药',     icon: iconToken('dynamite'), ammo: 2, w: [6, 6, 5],   prop: null,   ai: 'ahead' },
  goat:      { name: '爆炸山羊', icon: iconToken('goat'), ammo: 1, w: [2, 6, 9],   prop: null,   ai: 'anyAhead' },
  airstrike: { name: '空袭',     icon: iconToken('airstrike'), ammo: 1, w: [0, 4, 9],   prop: null,   ai: 'anyAhead' },
  lightning: { name: '雷击',     icon: iconToken('lightning'), ammo: 1, w: [0, 3, 8],   prop: null,   ai: 'anyAhead' },
  boost:     { name: '氮气加速', icon: iconToken('boost'), ammo: 1, w: [3, 8, 12],  prop: null,   ai: 'self' },
  shield:    { name: '护盾',     icon: iconToken('shield'), ammo: 1, w: [10, 6, 4],  prop: null,   ai: 'self' },
  punch:     { name: '拳击手套', icon: iconToken('punch'), ammo: 2, w: [7, 5, 3],   prop: null,   ai: 'melee' },
  hook:      { name: '钩爪',     icon: iconToken('hook'), ammo: 1, w: [0, 6, 9],   prop: 'gun',  ai: 'anyAhead' },
  bigball:   { name: '巨型雪球', icon: iconToken('bigball'), ammo: 1, w: [3, 6, 6],   prop: null,   ai: 'anyAhead' },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

export const SKINS = [0xf2c9a0, 0xe0a877, 0xc68655, 0x8f5a36, 0x5e3a22];
export const SUIT_COLORS = [
  0xff3d6e, 0xff8a1f, 0xffd21f, 0x38d16a, 0x1fc8d6, 0x2f6bff, 0x8a4dff, 0xff5fd0,
  0xf4f4f4, 0x2b2f3a, 0xb7ff3c, 0xff5a36,
];
export const HATS = ['毛线帽', '平头+头带', '莫西干', '长发胡子', '头盔护目镜', '爆炸头', '礼帽', '绿毛', '基础短发'];
export const DEFAULT_HAT = HATS.length - 1;

// 8 位选手的默认造型（0 号是玩家默认造型）
export const LOOK_PRESETS = [
  { hat: DEFAULT_HAT, hatColor: 0x2f3fd0, skin: 0, jacket: 0xff8a1f, stripe: 0xffd21f, pants: 0x2f6bff, mustache: false },
  { hat: 1, hatColor: 0x1a1a1a, skin: 1, jacket: 0xff5fd0, stripe: 0xffd21f, pants: 0x8a4dff, mustache: true },
  { hat: 2, hatColor: 0xb03ad6, skin: 0, jacket: 0xffb46b, stripe: 0xf4f4f4, pants: 0xff8a1f, mustache: false },
  { hat: 3, hatColor: 0x2a1a12, skin: 3, jacket: 0x2f6bff, stripe: 0xff5fd0, pants: 0x2f3fd0, mustache: true },
  { hat: 4, hatColor: 0xff8a1f, skin: 2, jacket: 0x4b4f5c, stripe: 0xffd21f, pants: 0xff3d6e, mustache: true },
  { hat: 5, hatColor: 0x2a1a12, skin: 4, jacket: 0x38d16a, stripe: 0xff3d6e, pants: 0x1fc8d6, mustache: false },
  { hat: 6, hatColor: 0x16161a, skin: 0, jacket: 0xf4f4f4, stripe: 0xff8a1f, pants: 0xffb46b, mustache: true },
  { hat: 7, hatColor: 0x7ad21f, skin: 1, jacket: 0x8a4dff, stripe: 0x1fc8d6, pants: 0xff5fd0, mustache: false },
];

export const BOT_NAMES = ['雪豹老张', '火箭阿强', '羊倌小李', '冰镇可乐', '极光妹', '山大王', '老六', '雪球杰克', '滑铲侠', '冲坡大爷'];

// 玩法模式（具体规则见 modes.js）
export const MODES = {
  race: { name: '道具赛', icon: '🚀', desc: '经典玩法：边滑边打，先冲到山脚的人获胜' },
  speed: { name: '竞速赛', icon: '🏁', desc: '没有道具，纯拼走线、漂移和空翻' },
  elim: { name: '淘汰赛', icon: '💀', desc: '领先者每过一个检查点，最后一名就被淘汰出局' },
  team: { name: '团队赛', icon: '🤝', desc: '红蓝 4 对 4，按名次给全队计分，队友的道具不会误伤' },
  brawl: { name: '大乱斗', icon: '🥊', desc: '道具箱翻倍，击飞一人得 3 分、被击飞扣 1 分，冲线另有加分' },
  trick: { name: '特技赛', icon: '🤸', desc: '空翻、转体、抓板、漂移连成技巧链，结算「总分 × 倍率」，最后比总分' },
  tt: { name: '计时赛', icon: '👻', desc: '独自滑，和自己的最好成绩（幽灵）赛跑，冲击奖牌' },
};
export const MODE_KEYS = Object.keys(MODES);

export const DEFAULT_RULES = {
  mode: 'race',
  track: 'random', // 'random' 随机生成，或固定赛道 id
  theme: 'day',
  length: 'medium',
  bots: 7,
  difficulty: 1, // 0 简单 1 普通 2 困难
  items: true,
  wildlife: true,
  rounds: 1,
  itemRate: 1, // 0 稀少 1 正常 2 密集
  banned: [], // 被禁用的武器 id
  shadows: true,
  quality: 'auto', // auto / high / mid / low
};

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
