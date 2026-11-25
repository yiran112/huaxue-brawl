// 滑行装备与外观部件目录：属性、改装树、解锁条件。
// 不依赖 three.js，联机服务器也会引用这里的列表做数据校验。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 稀有度同时决定属性档和强化花费。五项属性之和大约：C 13~15、B 15~17、A 18~20、S 21~23。
// 同一条滑行路线里，高稀有度整体更强，但短板还在（雪橇仍笨、雪圈仍不适合空翻）。
// up：这条装备的强化价格倍率
export const RARITY = {
  C: { name: '普通', up: 1, order: 0 },
  B: { name: '优秀', up: 1.25, order: 1 },
  A: { name: '稀有', up: 1.6, order: 2 },
  S: { name: '传说', up: 2, order: 3 },
};
export const RARITY_KEYS = ['C', 'B', 'A', 'S'];
export const rarityRank = (r) => (RARITY[r] ? RARITY[r].order : 0);

// 装备板身的颜色：做模型时就是这个颜色，玩家不能改，每个人看到的同一件装备都一样
export const GEAR_COLOR = 0xf4f4f4;

// form：滑法和站姿（ski 双板 / board 单板 / sled 坐着的雪橇 / tube 坐着的雪圈）
// model：用 gearModels.js 里的哪一套模型（每件装备一套独立造型）
// trim：装饰色。unlock：{ lv } 到等级自动解锁；{ cost } 花雪花币购买；{ lv, cost } 到等级后才能购买；
// { cost, shop: true } 只在商城里卖，不看等级
export const GEAR = {
  ski: { name: '双板', icon: '🎿', rarity: 'C', form: 'ski', model: 'ski', trim: 0xff5a3c, desc: '各项均衡，上手最容易', stats: { speed: 3, accel: 3, turn: 3, air: 3, tough: 3 } },
  learner: { name: '练习单板', icon: '❄️', rarity: 'C', form: 'board', model: 'learner', trim: 0xd7e4ff, desc: '入门单板，转向和空中略好；极速低、怕撞', stats: { speed: 2.2, accel: 2.6, turn: 3.2, air: 3.8, tough: 2.2 }, powder: 0.75, unlock: { lv: 2 } },
  wood: { name: '木雪橇', icon: '🌲', rarity: 'C', form: 'sled', model: 'wood', trim: 0xc48a3a, desc: '直道还能跑，转向笨、几乎翻不了跟头，深雪里更慢', stats: { speed: 3.8, accel: 2.2, turn: 1.8, air: 1.4, tough: 3.4 }, powder: 1.45, unlock: { lv: 4, cost: 600 } },
  cushion: { name: '雪垫', icon: '🟦', rarity: 'C', form: 'tube', model: 'cushion', trim: 0x7ec8ff, desc: '起步和抗撞不错，深雪里不太减速；极速一般、空中很笨', stats: { speed: 2.4, accel: 3.8, turn: 2.2, air: 1.4, tough: 4 }, powder: 0.55, unlock: { lv: 5, cost: 800 } },

  race: { name: '竞赛双板', icon: '⛷️', rarity: 'B', form: 'ski', model: 'race', trim: 0xffd23c, desc: '比入门双板更快、转向更灵，空中稍弱', stats: { speed: 4, accel: 3.2, turn: 3.4, air: 2.6, tough: 3.2 }, powder: 0.95, unlock: { lv: 5, cost: 1200 } },
  board: { name: '单板', icon: '🏂', rarity: 'B', form: 'board', model: 'board', trim: 0x3d7bff, desc: '漂移蓄力快、空中翻得快，深雪里减速少；极速略低、怕撞', stats: { speed: 2.6, accel: 3, turn: 3.6, air: 4.6, tough: 2.4 }, powder: 0.6, unlock: { lv: 3 } },
  sled: { name: '雪橇', icon: '🛷', rarity: 'B', form: 'sled', model: 'sled', trim: 0xff3d4f, desc: '极速高、抗撞；转向笨重、很难翻跟头，陷进深雪更慢', stats: { speed: 4.6, accel: 2.4, turn: 2.2, air: 1.8, tough: 4 }, powder: 1.3, unlock: { lv: 6, cost: 1500 } },
  tube: { name: '充气圈', icon: '🍩', rarity: 'B', form: 'tube', model: 'tube', trim: 0xffb020, desc: '起步快、几乎撞不翻、深雪里照样飘；极速一般', stats: { speed: 3, accel: 4.6, turn: 2.6, air: 1.6, tough: 5 }, powder: 0.45, unlock: { lv: 9, cost: 2500 } },
  blades: { name: '雪刃短板', icon: '🗡️', rarity: 'B', form: 'ski', model: 'blades', trim: 0x3ddc97, desc: '不用雪杖的短板：转向灵、空中好翻；极速低、怕撞，深雪里容易陷', stats: { speed: 2.8, accel: 3.4, turn: 4.2, air: 3.8, tough: 2.4 }, powder: 1.15, unlock: { lv: 4, cost: 1000 } },
  fish: { name: '鱼尾粉雪板', icon: '🐟', rarity: 'B', form: 'board', model: 'fish', trim: 0xff8a1f, desc: '宽板头加燕尾，深雪里几乎不减速；各项平均，没有特别突出的', stats: { speed: 3.4, accel: 3.2, turn: 3.2, air: 3.4, tough: 2.8 }, powder: 0.4, unlock: { lv: 7, cost: 1600 } },
  toboggan: { name: '托博根长橇', icon: '🏔️', rarity: 'B', form: 'sled', model: 'toboggan', trim: 0xd9a05b, desc: '卷头木板长橇：抗撞、起步不慢，深雪里不怎么陷；转向和空中都笨', stats: { speed: 4, accel: 3.2, turn: 2, air: 1.6, tough: 4.6 }, powder: 0.85, unlock: { lv: 8, cost: 1800 } },
  saucer: { name: '雪地飞碟', icon: '🥏', rarity: 'B', form: 'tube', model: 'saucer', trim: 0xff5fc8, desc: '一只滑雪碟：起步快、转得动，比充气圈快；没那么抗撞', stats: { speed: 3.4, accel: 4, turn: 3.6, air: 2.6, tough: 3.2 }, powder: 0.7, unlock: { lv: 10, cost: 2200 } },

  carbon: { name: '碳纤维双板', icon: '⚡', rarity: 'A', form: 'ski', model: 'carbon', trim: 0x3fc8ff, desc: '竞速板：极速和转向都高，空中只是中等，深雪略好滑', stats: { speed: 4.8, accel: 3.6, turn: 4, air: 3, tough: 3.8 }, powder: 0.9, unlock: { lv: 10, cost: 3200 } },
  park: { name: '公园单板', icon: '🌙', rarity: 'A', form: 'board', model: 'park', trim: 0xff5fc8, desc: '漂移和空翻很强，深雪减速少；仍然怕撞', stats: { speed: 3.2, accel: 3.6, turn: 4.6, air: 5.6, tough: 2.8 }, powder: 0.48, unlock: { cost: 3600, shop: true } },
  steel: { name: '钢刃雪橇', icon: '🎯', rarity: 'A', form: 'sled', model: 'steel', trim: 0xd8dee8, desc: '极速和抗撞更高，转向仍然迟钝，深雪比普通雪橇好一点', stats: { speed: 5.4, accel: 2.8, turn: 2.6, air: 2.2, tough: 5 }, powder: 1.15, unlock: { cost: 4000, shop: true } },
  ring: { name: '竞速雪圈', icon: '⭕', rarity: 'A', form: 'tube', model: 'ring', trim: 0xff8a1f, desc: '起步很猛、很难被撞翻，深雪里照样飘；不适合空翻', stats: { speed: 3.6, accel: 5.4, turn: 3.2, air: 2, tough: 5.8 }, powder: 0.35, unlock: { cost: 4400, shop: true } },
  twin: { name: '自由式双翘板', icon: '🌀', rarity: 'A', form: 'ski', model: 'twin', trim: 0xff5fc8, desc: '头尾都翘的公园双板：转向和空中很强；极速不如竞速板、怕撞', stats: { speed: 3.8, accel: 3.8, turn: 4.4, air: 4.8, tough: 3 }, powder: 1, unlock: { cost: 3400, shop: true } },
  hover: { name: '悬浮滑板', icon: '🛹', rarity: 'A', form: 'board', model: 'hover', trim: 0x3fe0ff, desc: '离地悬浮：极速、起步、转向、空中都不错，深雪几乎不减速；很怕撞', stats: { speed: 4.4, accel: 4, turn: 4, air: 4.2, tough: 2.6 }, powder: 0.3, unlock: { cost: 3800, shop: true } },
  bike: { name: '雪地单车', icon: '🚲', rarity: 'A', form: 'sled', model: 'bike', trim: 0xffd23c, desc: '坐着滑里最会拐弯的：极速高、转向灵；起步和抗撞一般，深雪里吃力', stats: { speed: 4.8, accel: 3.6, turn: 4, air: 3, tough: 3.4 }, powder: 1.2, unlock: { cost: 4200, shop: true } },
  raft: { name: '雪地冲锋艇', icon: '🚤', rarity: 'A', form: 'tube', model: 'raft', trim: 0xff6a1f, desc: '带滑橇的充气艇：极难撞翻、起步猛、深雪照飘；转向笨、别想空翻', stats: { speed: 4.2, accel: 4.4, turn: 2.8, air: 1.8, tough: 6 }, powder: 0.4, unlock: { cost: 4600, shop: true } },

  aurora: { name: '极光双板', icon: '👑', rarity: 'S', form: 'ski', model: 'aurora', trim: 0xb388ff, desc: '传说双板，五项都强，深雪也滑得开', stats: { speed: 5.6, accel: 4.2, turn: 4.6, air: 3.6, tough: 4.4 }, powder: 0.8, unlock: { cost: 7000, shop: true } },
  storm: { name: '风暴单板', icon: '🔥', rarity: 'S', form: 'board', model: 'storm', trim: 0xff6a1f, desc: '转向和空中拉满，深雪几乎不减速；抗撞仍是短板', stats: { speed: 3.8, accel: 4.2, turn: 5.4, air: 6.4, tough: 3.2 }, powder: 0.38, unlock: { cost: 7600, shop: true } },
  dragon: { name: '龙骨雪橇', icon: '💎', rarity: 'S', form: 'sled', model: 'dragon', trim: 0xff4d3a, desc: '极速和抗撞接近上限，转向仍偏笨，不再特别怕深雪', stats: { speed: 6.4, accel: 3.4, turn: 3.2, air: 2.6, tough: 5.8 }, powder: 1, unlock: { cost: 8200, shop: true } },
  titan: { name: '泰坦雪圈', icon: '⭐', rarity: 'S', form: 'tube', model: 'titan', trim: 0xffd23c, desc: '起步和抗撞封顶，深雪里几乎不减速；空中依然笨重', stats: { speed: 4.2, accel: 6.4, turn: 3.6, air: 2.4, tough: 6.4 }, powder: 0.28, unlock: { cost: 9000, shop: true } },
  mech: { name: '机甲双板', icon: '🤖', rarity: 'S', form: 'ski', model: 'mech', trim: 0x3fe0ff, desc: '装甲板身带推进器：极速和起步都猛，五项没有短板', stats: { speed: 5, accel: 5, turn: 4.2, air: 4.4, tough: 4.2 }, powder: 0.85, unlock: { cost: 7200, shop: true } },
  phoenix: { name: '凤凰翼板', icon: '🦅', rarity: 'S', form: 'board', model: 'phoenix', trim: 0xffc21f, desc: '带羽翼的单板：空中接近上限、转向极灵，比风暴单板快；还是怕撞', stats: { speed: 4.6, accel: 4, turn: 5, air: 6.2, tough: 3 }, powder: 0.35, unlock: { cost: 7800, shop: true } },
  mobile: { name: '雪怪摩托', icon: '🏍️', rarity: 'S', form: 'sled', model: 'mobile', trim: 0xff4d3a, desc: '履带雪地摩托：极速、起步、抗撞都高，转向也跟得上；空中笨重', stats: { speed: 5.6, accel: 5.2, turn: 3.8, air: 2.6, tough: 5.2 }, powder: 0.9, unlock: { cost: 8600, shop: true } },
  ufo: { name: '星环飞碟', icon: '🛸', rarity: 'S', form: 'tube', model: 'ufo', trim: 0x8cff5a, desc: '悬浮飞碟：起步和转向都强，深雪上直接飘过去；空中一般', stats: { speed: 4.8, accel: 5.2, turn: 5, air: 3.6, tough: 4.4 }, powder: 0.25, unlock: { cost: 9400, shop: true } },
};
export const GEAR_KEYS = Object.keys(GEAR);
// 商城的货架：按价格从低到高
export const SHOP_GEAR = GEAR_KEYS.filter((k) => GEAR[k].unlock && GEAR[k].unlock.shop).sort((a, b) => GEAR[a].unlock.cost - GEAR[b].unlock.cost);

// 机器人装备：简单局里几乎只有 C/B，困难局才会偶尔开出 S。
// 先按权重抽稀有度，再在这一档里随便挑一件：各档装备数量不一样，也不会改变稀有度的比例
const BOT_GEAR_WEIGHT = {
  0: { C: 5, B: 2, A: 0, S: 0 },
  1: { C: 3, B: 4, A: 1, S: 0 },
  2: { C: 1, B: 3, A: 3, S: 1 },
};
export function pickBotGear(difficulty = 1, rng = Math.random) {
  const w = BOT_GEAR_WEIGHT[difficulty] || BOT_GEAR_WEIGHT[1];
  let roll = rng() * RARITY_KEYS.reduce((sum, r) => sum + w[r], 0);
  const rarity = RARITY_KEYS.find((r) => (roll -= w[r]) < 0) || 'C';
  const pool = GEAR_KEYS.filter((k) => GEAR[k].rarity === rarity);
  return pool[(rng() * pool.length) | 0] || 'ski';
}

export const STAT_NAMES = { speed: '极速', accel: '起步', turn: '转向', air: '空中', tough: '抗击飞' };
export const STAT_KEYS = Object.keys(STAT_NAMES);
export const STAT_MAX = 6.5;

// 改装树：每件装备各自一棵，节点都一样。row 0 是顶上的核心，下面三列各三个节点：
// 左列操控、中列竞速、右列防护。col 是第几列，need 是要先改满的上一个节点。
// 每个节点 0~3 级；add 是每级加的属性，fx 是每级加的特殊效果（见 TUNE_FX）
export const UPGRADES = {
  core: { name: '核心调校', col: 1, row: 0, add: { speed: 0.05, accel: 0.05, turn: 0.05, air: 0.05, tough: 0.05 } },
  bind: { name: '固定器调校', col: 0, row: 1, need: 'core', add: { turn: 0.2 } },
  flex: { name: '板身弹性', col: 0, row: 2, need: 'bind', add: { air: 0.2, turn: 0.1 } },
  charge: { name: '集气芯片', col: 0, row: 3, need: 'flex', fx: { gain: 0.05 } },
  wax: { name: '板底打蜡', col: 1, row: 1, need: 'core', add: { speed: 0.2 } },
  edge: { name: '钢边打磨', col: 1, row: 2, need: 'wax', add: { speed: 0.15, accel: 0.1 } },
  jet: { name: '氮气喷管', col: 1, row: 3, need: 'edge', fx: { nitro: 0.05 } },
  pad: { name: '护具升级', col: 2, row: 1, need: 'core', add: { tough: 0.2 } },
  brace: { name: '减震支架', col: 2, row: 2, need: 'pad', add: { tough: 0.15, accel: 0.1 } },
  guard: { name: '护盾强化', col: 2, row: 3, need: 'brace', fx: { shield: 1 } },
};
export const UP_KEYS = Object.keys(UPGRADES);
export const UP_MAX = 3;
// 每一排的单级价格（改装币，按当前等级取），再乘装备稀有度的倍率。一棵树改满：C 级 3670
export const UP_COST = [
  [40, 60, 90],
  [60, 90, 130],
  [80, 120, 180],
  [100, 160, 240],
];
// 特殊效果：gain 攒氮气的速度、nitro 一瓶氮气喷的时长（按比例），shield 护盾道具多撑几秒
export const TUNE_FX = { gain: { name: '集气', pct: true }, nitro: { name: '氮气时长', pct: true }, shield: { name: '护盾时长', unit: ' 秒' } };
// 推荐路线：亮起来的那一列
export const TUNE_PLANS = {
  race: { name: '竞速推荐', path: ['core', 'wax', 'edge', 'jet'] },
  item: { name: '道具推荐', path: ['core', 'pad', 'brace', 'guard'] },
};

// 节点每级的效果，拼成一行：「极速 +0.15 · 起步 +0.1」
export function upDesc(k) {
  const U = UPGRADES[k];
  if (!U) return '';
  const out = [];
  for (const st in U.add || {}) out.push(`${STAT_NAMES[st]} +${U.add[st]}`);
  for (const f in U.fx || {}) out.push(`${TUNE_FX[f].name} +${TUNE_FX[f].pct ? Math.round(U.fx[f] * 100) + '%' : U.fx[f] + TUNE_FX[f].unit}`);
  return out.join(' · ');
}

export function gearStats(gear, up) {
  const g = GEAR[gear] || GEAR.ski;
  const s = { ...g.stats };
  if (up) {
    for (const k of UP_KEYS) {
      const lv = clamp(up[k] | 0, 0, UP_MAX);
      const add = UPGRADES[k].add;
      for (const st in add) s[st] += add[st] * lv;
    }
  }
  for (const k in s) s[k] = clamp(s[k], 1, STAT_MAX);
  return s;
}

// 改装树末端的特殊效果合计：{ gain, nitro, shield }
export function tuneFx(up) {
  const f = { gain: 0, nitro: 0, shield: 0 };
  if (!up) return f;
  for (const k of UP_KEYS) {
    const fx = UPGRADES[k].fx;
    const lv = clamp(up[k] | 0, 0, UP_MAX);
    for (const n in fx) f[n] += fx[n] * lv;
  }
  return f;
}

// 排位赛：不看稀有度和强化，只留长短板——五项按比例缩放到同一个总和
export const FAIR_SUM = 16;
export function fairStats(gear) {
  const s = { ...(GEAR[gear] || GEAR.ski).stats };
  let sum = 0;
  for (const k in s) sum += s[k];
  for (const k in s) s[k] = clamp((s[k] * FAIR_SUM) / sum, 1, STAT_MAX);
  return s;
}

// 换算成物理参数的倍率（3 分为基准 1.0）；fair：排位赛，用 fairStats
export function gearMods(gear, up, fair = false) {
  const s = fair ? fairStats(gear) : gearStats(gear, up);
  const f = tuneFx(fair ? null : up);
  return {
    gain: 1 + f.gain, // 攒氮气
    nitro: 1 + f.nitro, // 一瓶氮气的时长
    shield: f.shield, // 护盾多撑的秒数
    cd: 1 - 0.045 * (s.speed - 3), // 风阻：越小极速越高
    acc: 1 + 0.15 * (s.accel - 3), // 低速撑杖起步
    turn: 1 + 0.07 * (s.turn - 3),
    drift: 1 + 0.12 * (s.turn - 3), // 漂移蓄力速度
    flip: 1 + 0.09 * (s.air - 3), // 空翻转速
    flipTol: 1 + 0.1 * (s.air - 3), // 落地容错
    airSteer: 1 + 0.12 * (s.air - 3),
    knock: 1 - 0.07 * (s.tough - 3), // 被击飞的翻滚时间 / 冲量
    crash: 1 + 0.12 * (s.tough - 3), // 撞树撞石头翻车的速度门槛
    powder: (GEAR[gear] || GEAR.ski).powder ?? 1, // 深雪减速
  };
}

// 滑痕颜色：null 表示用场景默认颜色
export function trailColor(look) {
  const t = TRAILS[(look && look.trail) | 0];
  return t ? t.color : null;
}

// 改装树每个节点都是同一级（机器人按难度 / 杯赛档次统一给）
export const uniformUp = (lv) => Object.fromEntries(UP_KEYS.map((k) => [k, lv]));

// ---------- 外观部件 ----------
// 下标 0 一律是“无 / 默认”，不需要解锁
export const GOGGLES = [
  { name: '无' },
  { name: '橙色雪镜' },
  { name: '酷炫墨镜' },
  { name: '心形眼镜' },
  { name: '电竞护目镜' },
];

export const BACKS = [
  { name: '无' },
  { name: '双肩包' },
  { name: '超人披风' },
  { name: '火箭背包' },
  { name: '天使翅膀' },
  { name: '冠军奖杯' },
];

export const SCARVES = [
  { name: '无' },
  { name: '短围巾' },
  { name: '长围巾' },
];

// color：null 表示跟随场景的默认滑痕颜色；'rainbow' 是彩虹渐变
export const TRAILS = [
  { name: '默认', color: null },
  { name: '冰蓝', color: 0x3fc8ff },
  { name: '烈焰', color: 0xff6a1f },
  { name: '樱粉', color: 0xff5fc8 },
  { name: '黄金', color: 0xffc81f },
  { name: '彩虹', color: 'rainbow' },
];

// 外观槽位：look 里的字段名 → 选项列表
export const COSMETIC_SLOTS = {
  goggles: { name: '护目镜', list: GOGGLES },
  back: { name: '背饰', list: BACKS },
  scarf: { name: '围巾', list: SCARVES },
  trail: { name: '滑痕颜色', list: TRAILS },
};

// look 里装备 / 外观字段的默认值
export const LOOK_EXTRA_DEFAULTS = { gear: 'ski', goggles: 0, back: 0, scarf: 0, trail: 0 };

// ---------- 雪花补给箱 ----------
// 花雪花币随机开一件外观：先按权重抽档次（稀有度沿用装备的 C / A / S），再在这一档里随便挑一件。
// 所有可收集的外观都在这里；开出已经有的，折回 BOX_REFUND 雪花币
export const BOX_COST = 600;
export const BOX_REFUND = 300;
export const BOX_WEIGHT = { C: 60, A: 30, S: 10 };
export const BOX_POOL = [
  { key: 'goggles:2', tier: 'C' },
  { key: 'trail:1', tier: 'C' },
  { key: 'scarf:2', tier: 'C' },
  { key: 'hat:4', tier: 'C' },
  { key: 'trail:2', tier: 'C' },
  { key: 'goggles:3', tier: 'C' },
  { key: 'hat:0', tier: 'C' },
  { key: 'hat:1', tier: 'C' },
  { key: 'hat:2', tier: 'C' },
  { key: 'hat:3', tier: 'C' },
  { key: 'goggles:1', tier: 'C' },
  { key: 'back:1', tier: 'C' },
  { key: 'scarf:1', tier: 'C' },
  { key: 'back:2', tier: 'A' },
  { key: 'hat:5', tier: 'A' },
  { key: 'hat:6', tier: 'A' },
  { key: 'trail:3', tier: 'A' },
  { key: 'goggles:4', tier: 'A' },
  { key: 'trail:4', tier: 'A' },
  { key: 'back:3', tier: 'S' },
  { key: 'hat:7', tier: 'S' },
  { key: 'back:4', tier: 'S' },
  { key: 'trail:5', tier: 'S' },
  { key: 'back:5', tier: 'S' },
];
const BOX_KEYS = new Set(BOX_POOL.map(({ key }) => key));
const BOX_UNLOCK = { box: true };

// 存档 key（'gear:sled'、'hat:6'、'back:3'）对应的解锁条件
export function unlockOf(key) {
  if (BOX_KEYS.has(key)) return BOX_UNLOCK;
  const [slot, id, extra] = String(key).split(':');
  if (slot === 'gear' && extra === undefined) return GEAR[id]?.unlock;
}

export function rollBox(rng = Math.random) {
  const tiers = Object.keys(BOX_WEIGHT);
  let roll = rng() * tiers.reduce((n, t) => n + BOX_WEIGHT[t], 0);
  const tier = tiers.find((t) => (roll -= BOX_WEIGHT[t]) < 0) || 'C';
  const pool = BOX_POOL.filter((it) => it.tier === tier);
  return pool[(rng() * pool.length) | 0];
}

// 解锁条件的文字说明
export function unlockText(u) {
  if (!u) return '';
  if (u.box) return '雪花补给箱抽奖';
  const parts = [];
  if (u.lv) parts.push(`Lv.${u.lv}`);
  if (u.cost) parts.push(`❄${u.cost}`);
  if (u.shop) parts.push('商城');
  if (u.ach) parts.push('成就解锁');
  return parts.join(' · ');
}
