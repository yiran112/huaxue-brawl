import { BOT_NAMES, LOOK_PRESETS } from '../src/config.js';

export function previewResults(game) {
  if (game.state !== 'menu') return;
  const times = ['1:04.29', '1:05.81', '1:06.43', '1:08.24', '1:11.08', '1:12.96', '1:15.20', '1:18.37'];
  const gear = ['storm', 'ski', 'wood'];
  const rows = times.map((time, idx) => ({
    idx,
    rank: idx + 1,
    name: idx === 1 ? '滑雪玩家' : BOT_NAMES[idx],
    me: idx === 1,
    look: { ...LOOK_PRESETS[(idx + 5) % LOOK_PRESETS.length], gear: gear[idx] || 'ski' },
    time,
  }));
  const level = game.profile.levelInfo().lv;
  game.ui.showMenu(false);
  game.state = 'results';
  game.ui.showResults({
    title: '第 2 名',
    sub: '道具赛 · 雪松村 · 用时 1:05.81 · 击中对手 3 次，被击飞 1 次',
    rows,
    awards: [
      { icon: '💥', name: '击飞王', who: rows[0].name, idx: 0, val: '击飞 4 次' },
      { icon: '✨', name: '技巧王', who: rows[1].name, me: true, idx: 1, val: '技巧 1,620 分' },
      { icon: '🚀', name: '极速王', who: rows[2].name, idx: 2, val: '126 km/h' },
    ],
    reward: {
      xp: 90, coins: 125, parts: 4, lvFrom: level, lvTo: level,
      lines: [
        { label: '完赛奖励', xp: 40, coins: 45, parts: 1 },
        { label: '第二名', xp: 50, coins: 80, parts: 3 },
      ],
      extra: [], tasks: [], ach: [], unlocks: [],
    },
    nextLabel: '再来一局 ▶',
  });
}
