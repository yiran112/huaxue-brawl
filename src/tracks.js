// 手工设计的固定赛道。地形仍由种子生成，这里规定种子、长度、场景，以及地标放在哪里。
// 位置一律写成全程的比例（at: 0~1），实际位置会自动避开近道岔口和跳台。

export const TRACKS = [
  {
    id: 'cedar', name: '雪松村', theme: 'day', length: 2200, seed: 11071,
    desc: '从山脚小村穿过，缆车就从头顶掠过',
    landmarks: [{ type: 'village', at: 0.16 }, { type: 'lift', at: 0.58 }],
    pads: [0.4, 0.8],
  },
  {
    id: 'cablecar', name: '缆车坡', theme: 'sunset', length: 2400, seed: 22093,
    desc: '三条缆车线横跨雪道，黄昏的长坡适合漂移',
    landmarks: [{ type: 'lift', at: 0.22 }, { type: 'lift', at: 0.52 }, { type: 'lift', at: 0.8 }],
    pads: [0.3, 0.66],
    movers: [{ type: 'snowmobile', at: 0.4 }],
  },
  {
    id: 'lumber', name: '伐木场', theme: 'day', length: 2500, seed: 33017,
    desc: '原木堆满路边，雪地摩托来回穿梭',
    landmarks: [{ type: 'lumber', at: 0.28 }, { type: 'village', at: 0.7 }],
    movers: [{ type: 'snowmobile', at: 0.5 }, { type: 'snowmobile', at: 0.86 }],
    pads: [0.6],
  },
  {
    id: 'icelake', name: '冰湖环线', theme: 'night', length: 2700, seed: 44021, branches: 2,
    desc: '极光下的冰封湖面又快又滑，两条近道等你来抄',
    landmarks: [{ type: 'icelake', at: 0.34 }],
    zones: [{ type: 'powder', at: 0.62, len: 160, side: 1 }],
    pads: [0.2, 0.78],
  },
  {
    id: 'crystal', name: '冰晶峡谷', theme: 'storm', length: 2800, seed: 55009,
    desc: '暴雪里钻过两座发光的冰洞',
    landmarks: [{ type: 'tunnel', at: 0.28, variant: 'ice' }, { type: 'tunnel', at: 0.7, variant: 'ice' }],
    zones: [{ type: 'ice', at: 0.5, len: 140 }],
    pads: [0.12, 0.88],
  },
  {
    id: 'dusk', name: '黄昏雪崩', theme: 'sunset', length: 3000, seed: 66031,
    desc: '山顶积雪随时会塌，被追上就会被卷走',
    landmarks: [{ type: 'village', at: 0.14 }],
    avalanche: [{ at: 0.46, len: 420 }],
    pads: [0.32, 0.8],
  },
  {
    id: 'mine', name: '暴雪矿道', theme: 'storm', length: 3200, seed: 77013,
    desc: '废弃矿洞、滚石和深雪，一步走错就陷进去',
    landmarks: [{ type: 'tunnel', at: 0.24, variant: 'mine' }, { type: 'tunnel', at: 0.64, variant: 'mine' }],
    movers: [{ type: 'boulder', at: 0.45 }, { type: 'boulder', at: 0.82 }],
    zones: [{ type: 'powder', at: 0.36, len: 170, side: -1 }, { type: 'powder', at: 0.76, len: 170, side: 1 }],
  },
  {
    id: 'aurora', name: '极光大跳台', theme: 'night', length: 3200, seed: 88003, branches: 1,
    desc: '一个接一个的大跳台，在极光下翻跟头',
    features: [
      { type: 'big', at: 0.09 }, { type: 'jump', at: 0.17 }, { type: 'big', at: 0.26 }, { type: 'rollers', at: 0.35 },
      { type: 'big', at: 0.45 }, { type: 'drop', at: 0.54 }, { type: 'big', at: 0.63 }, { type: 'jump', at: 0.71 },
      { type: 'big', at: 0.8 }, { type: 'drop', at: 0.88 },
    ],
    pads: [0.07, 0.43, 0.78],
  },
  {
    id: 'summit', name: '山神之路', theme: 'day', length: 3400, seed: 99041,
    desc: '村庄、缆车、雪崩，一条路看尽整座雪山',
    landmarks: [{ type: 'village', at: 0.1 }, { type: 'lift', at: 0.38 }],
    avalanche: [{ at: 0.6, len: 380 }],
    movers: [{ type: 'snowmobile', at: 0.26 }],
    pads: [0.3, 0.86],
  },
  {
    id: 'glacier', name: '冰川天梯', theme: 'storm', length: 3800, seed: 10103,
    desc: '冰洞、冰湖、冰道连成一线，全程都在打滑',
    landmarks: [{ type: 'tunnel', at: 0.2, variant: 'ice' }, { type: 'icelake', at: 0.46 }, { type: 'tunnel', at: 0.76, variant: 'ice' }],
    zones: [{ type: 'ice', at: 0.62, len: 150 }],
    pads: [0.35, 0.9],
  },
  {
    id: 'avalanche', name: '雪崩狂飙', theme: 'sunset', length: 4000, seed: 12107,
    desc: '两段雪崩追着跑，路上还有雪地摩托和滚石',
    avalanche: [{ at: 0.24, len: 450 }, { at: 0.64, len: 450 }],
    movers: [{ type: 'snowmobile', at: 0.46 }, { type: 'boulder', at: 0.56 }, { type: 'snowmobile', at: 0.9 }],
    pads: [0.15, 0.5, 0.86],
  },
  {
    id: 'ultimate', name: '终极雪山', theme: 'night', length: 4300, seed: 13109,
    desc: '所有地形和机关的大集合，冠军杯的最后一站',
    landmarks: [
      { type: 'village', at: 0.08 }, { type: 'tunnel', at: 0.24, variant: 'ice' }, { type: 'lift', at: 0.36 },
      { type: 'lumber', at: 0.7 }, { type: 'icelake', at: 0.84 },
    ],
    avalanche: [{ at: 0.5, len: 400 }],
    movers: [{ type: 'snowmobile', at: 0.3 }, { type: 'boulder', at: 0.62 }],
    pads: [0.18, 0.44, 0.78],
  },
];

export const TRACK_MAP = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

// 计时赛奖牌线（秒）：[金, 银, 铜]。按长度估算，平均时速约 110 / 101 / 92 km/h
export function medalTimes(length) {
  return [length / 30.5, length / 28, length / 25.5];
}

export const CUPS = [
  { id: 'c1', name: '新手', icon: '❄️', tracks: ['cedar', 'cablecar', 'lumber'], difficulty: 0, botUp: 0, reward: { coins: 400, xp: 300 } },
  { id: 'c2', name: '进阶', icon: '🌙', tracks: ['icelake', 'crystal', 'dusk'], difficulty: 1, botUp: 1, reward: { coins: 700, xp: 450 } },
  { id: 'c3', name: '精英', icon: '⛰️', tracks: ['mine', 'aurora', 'summit'], difficulty: 1, botUp: 2, reward: { coins: 1000, xp: 600 } },
  { id: 'c4', name: '冠军', icon: '👑', tracks: ['glacier', 'avalanche', 'ultimate'], difficulty: 2, botUp: 3, reward: { coins: 1500, xp: 900 } },
];
export const CUP_MAP = Object.fromEntries(CUPS.map((c) => [c.id, c]));
export const TROPHY = ['', '🥉', '🥈', '🥇'];
export const TROPHY_NAME = ['', '铜杯', '银杯', '金杯'];

// 赛道按等级分成四组，够等级就能在赛道大厅里选
export function trackCup(id) {
  return CUPS.findIndex((c) => c.tracks.includes(id));
}

