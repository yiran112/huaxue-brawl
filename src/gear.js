// 滑行装备与外观部件目录：属性、强化、解锁条件。
// 不依赖 three.js，联机服务器也会引用这里的列表做数据校验。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// unlock：{ lv } 到等级自动解锁；{ cost } 花雪花币购买；{ lv, cost } 到等级后才能购买；{ ach } 达成成就解锁
export const GEAR = {
  ski: { name: '双板', icon: '🎿', desc: '各项均衡，上手最容易', stats: { speed: 3, accel: 3, turn: 3, air: 3, tough: 3 } },
  board: { name: '单板', icon: '🏂', desc: '漂移蓄力快、空中翻得快，深雪里减速少；极速略低、怕撞', stats: { speed: 2.6, accel: 3, turn: 3.6, air: 4.6, tough: 2.4 }, powder: 0.6, unlock: { lv: 3 } },
  sled: { name: '雪橇', icon: '🛷', desc: '极速最高、抗撞；转向笨重、很难翻跟头，陷进深雪更慢', stats: { speed: 4.6, accel: 2.4, turn: 2.2, air: 1.8, tough: 4 }, powder: 1.3, unlock: { lv: 6, cost: 1500 } },
  tube: { name: '充气圈', icon: '🛟', desc: '起步最快、几乎撞不翻、深雪里照样飘；极速一般', stats: { speed: 3, accel: 4.6, turn: 2.6, air: 1.6, tough: 5 }, powder: 0.45, unlock: { lv: 9, cost: 2500 } },
};
export const GEAR_KEYS = Object.keys(GEAR);

export const STAT_NAMES = { speed: '极速', accel: '起步', turn: '转向', air: '空中', tough: '抗击飞' };
export const STAT_KEYS = Object.keys(STAT_NAMES);
export const STAT_MAX = 6.5;

// 强化：每种装备各自独立的三条线，每条 0~3 级
export const UPGRADES = {
  wax: { name: '板底打蜡', desc: '极速 +0.4 / 级', add: { speed: 0.4 } },
  bind: { name: '固定器调校', desc: '转向、空中各 +0.3 / 级', add: { turn: 0.3, air: 0.3 } },
  pad: { name: '护具升级', desc: '抗击飞 +0.4、起步 +0.2 / 级', add: { tough: 0.4, accel: 0.2 } },
};
export const UP_KEYS = Object.keys(UPGRADES);
export const UP_MAX = 3;
export const UP_COST = [300, 700, 1400];

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

// 换算成物理参数的倍率（3 分为基准 1.0）
export function gearMods(gear, up) {
  const s = gearStats(gear, up);
  return {
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

// 每级强化等级（机器人按难度 / 杯赛档次统一给）
export const uniformUp = (lv) => ({ wax: lv, bind: lv, pad: lv });

// ---------- 外观部件 ----------
// 下标 0 一律是“无 / 默认”，不需要解锁
export const HAT_UNLOCK = [null, null, null, null, { lv: 4 }, { lv: 7 }, { cost: 800 }, { lv: 12 }];

export const GOGGLES = [
  { name: '无' },
  { name: '橙色雪镜' },
  { name: '酷炫墨镜', unlock: { lv: 2 } },
  { name: '心形眼镜', unlock: { cost: 600 } },
  { name: '电竞护目镜', unlock: { ach: 'win10' } },
];

export const BACKS = [
  { name: '无' },
  { name: '双肩包' },
  { name: '超人披风', unlock: { lv: 5 } },
  { name: '火箭背包', unlock: { cost: 1200 } },
  { name: '天使翅膀', unlock: { lv: 15 } },
  { name: '冠军奖杯', unlock: { ach: 'cupAll' } },
];

export const SCARVES = [
  { name: '无' },
  { name: '短围巾', unlock: { lv: 1 } },
  { name: '长围巾', unlock: { cost: 400 } },
];

// color：null 表示跟随场景的默认滑痕颜色；'rainbow' 是彩虹渐变
export const TRAILS = [
  { name: '默认', color: null },
  { name: '冰蓝', color: 0x3fc8ff, unlock: { lv: 2 } },
  { name: '烈焰', color: 0xff6a1f, unlock: { cost: 500 } },
  { name: '樱粉', color: 0xff5fc8, unlock: { lv: 8 } },
  { name: '黄金', color: 0xffc81f, unlock: { ach: 'gold1' } },
  { name: '彩虹', color: 'rainbow', unlock: { lv: 20 } },
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

// 解锁条件的文字说明
export function unlockText(u) {
  if (!u) return '';
  const parts = [];
  if (u.lv) parts.push(`Lv.${u.lv}`);
  if (u.cost) parts.push(`❄${u.cost}`);
  if (u.ach) parts.push('成就解锁');
  return parts.join(' · ');
}
