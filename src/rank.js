// 排位：三种玩法共用一套段位。积分是这款游戏自己的规则，只借用「个人竞速 / 组队竞速 / 组队道具」的判胜方式。
export const RANK_LV = 1;

export const RANK_MODES = [
  {
    id: 'solo',
    queue: 'rank-solo',
    name: '个人竞速',
    icon: '🏁',
    blurb: '6 人各自比名次，没有道具。前三名算赢。',
    rules: { mode: 'speed', seats: 6, items: false, teamFirst: false },
  },
  {
    id: 'team',
    queue: 'rank-team',
    name: '组队竞速',
    icon: '🤝',
    blurb: '3 对 3，没有道具。名次换成队伍积分，比两队总分。你拿第一，队友名次太差，队伍仍会输。',
    rules: { mode: 'team', seats: 6, items: false, teamFirst: false },
  },
  {
    id: 'item',
    queue: 'rank-item',
    name: '组队道具',
    icon: '🚀',
    blurb: '3 对 3，可以用道具。哪一队先有人冲线，哪一队赢。可以去攻击对方，或保护自己队的领跑。',
    rules: { mode: 'team', seats: 6, items: true, teamFirst: true },
  },
];
export const RANK_MAP = Object.fromEntries(RANK_MODES.map((m) => [m.id, m]));

// 段位按积分升，没有晋级赛。车神之上继续累分。
export const TIERS = [
  { name: '青铜', min: 0 },
  { name: '白银', min: 100 },
  { name: '黄金', min: 250 },
  { name: '铂金', min: 450 },
  { name: '钻石', min: 700 },
  { name: '星耀', min: 1000 },
  { name: '车神', min: 1400 },
];

export function tierAt(pts) {
  const n = Math.max(0, Math.floor(Number(pts) || 0));
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (n >= TIERS[k].min) i = k;
  const cur = TIERS[i];
  const next = TIERS[i + 1] || null;
  const span = next ? next.min - cur.min : 0;
  const into = n - cur.min;
  const star = !next || !span ? 0 : Math.min(5, Math.max(1, Math.ceil((into / span) * 5)));
  return { name: cur.name, index: i, min: cur.min, next: next ? next.min : 0, nextName: next ? next.name : '', into, span, star };
}

// 返回本局排位分变化。青铜不扣分；刚升段的一小段里，失败也不把人打回上一段。
export function scoreRank(state, rep) {
  const spec = RANK_MAP[rep.rankMode];
  if (!spec) return null;
  const before = Math.max(0, state.pts | 0);
  const tier = tierAt(before);
  const place = Math.max(1, Math.min(6, rep.rank | 0));
  let delta = 0;
  let win = false;
  if (spec.id === 'solo') {
    const table = [26, 18, 10, -6, -12, -18];
    win = !!rep.finished && place <= 3;
    delta = rep.finished ? table[place - 1] : table[5];
  } else if (spec.id === 'team') {
    win = !!rep.teamWin;
    delta = win ? 22 : -12;
    if (place === 1) delta += 6;
    else if (place === 2) delta += 3;
  } else {
    win = !!rep.teamWin;
    delta = win ? 20 : -10;
    if (place === 1) delta += 8;
    else if (win && (rep.hits | 0) >= 2) delta += 4;
  }
  // 组队时有队友中途走了，剩下的人输了只扣一半
  if (!win && delta < 0 && spec.id !== 'solo' && rep.mateLeft) delta = Math.ceil(delta / 2);
  const today = localDay();
  const first = win && state.day !== today;
  if (first) delta += 8;
  if (delta < 0 && tier.index === 0) delta = 0;
  else if (delta < 0 && before - tier.min < 20) delta = Math.max(delta, tier.min - before);
  const after = Math.max(0, before + delta);
  return { delta: after - before, win, before, after, first, name: spec.name };
}

export const ESCAPE_EXTRA = 10;

// 没打完就离开：按输、最后一名算。主动退出算逃跑，再多扣 ESCAPE_EXTRA，也不享受青铜和刚升段的保护；掉线只按输算
export function scoreLeave(state, rankMode, escape) {
  const spec = RANK_MAP[rankMode];
  if (!spec) return null;
  const before = Math.max(0, state.pts | 0);
  const tier = tierAt(before);
  let delta = spec.id === 'solo' ? -18 : spec.id === 'team' ? -12 : -10;
  if (escape) delta -= ESCAPE_EXTRA;
  else if (tier.index === 0) delta = 0;
  else if (before - tier.min < 20) delta = Math.max(delta, tier.min - before);
  const after = Math.max(0, before + delta);
  return { delta: after - before, win: false, before, after, first: false, name: spec.name };
}

// 今日首胜按北京时间换天（和每日任务一样），服务器重算时对得上
function localDay() {
  const d = new Date(Date.now() + 8 * 3600000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export function sameDay(day) {
  return day === localDay();
}

export { localDay };
