import { rankSeasonNow, seasonLeftText } from '../profile.js';
import { RANK_MAP, sameDay } from '../rank.js';

export const RANK_SECTIONS = [['rank', '排位赛'], ['tiers', '段位一览'], ['rules', '排位规则']];
export const RANK_MODE_SUMMARY = { solo: '6 人竞速 · 前三名取胜', team: '3 对 3 · 比拼队伍总分', item: '3 对 3 · 队友率先冲线即获胜' };
export const RANK_RULES = '匹配人数不足时由机器人补齐。三种玩法共用段位，青铜段位正常完赛失败不扣分。段位赛季每四周更新，换季时保留七成积分。';
export const RANK_ART_SEED = 17241;
export const RANK_COLORS = [
  ['#ffe2a0', '#bf7747'], ['#e6f7ff', '#859fbc'], ['#fff1a0', '#ca922c'], ['#caffe9', '#41ad98'],
  ['#c3f5ff', '#458fda'], ['#e8d9ff', '#8867d9'], ['#ffe1ec', '#d45a8d'],
];

function beijingDate(ms) {
  const date = new Date(ms + 8 * 3600000);
  return `${date.getUTCMonth() + 1}.${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function rankedState(profile, modeId) {
  const view = profile.rankView();
  const progress = profile.rankState();
  const season = rankSeasonNow();
  return {
    view, mode: RANK_MAP[modeId] || RANK_MAP.solo, games: progress.sg, firstWin: sameDay(progress.day),
    season: `第 ${season.id} 赛季`, dates: `${beijingDate(season.start)} – ${beijingDate(season.end)}`, left: seasonLeftText(season.left),
    nextPoints: view.span ? view.min + view.span : 0,
    percent: view.span ? Math.round(100 * view.into / view.span) : 100,
  };
}

// 雪峰、冰晶和滑雪板组合成游戏自己的段位徽章。
export function drawRankCrest(c, x, y, size, index) {
  const [light, base] = RANK_COLORS[index] || RANK_COLORS[0];
  const poly = (points, fill, stroke = null) => {
    c.beginPath();
    c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
  };
  c.save();
  c.translate(x, y);
  c.scale(size / 160, size / 160);
  c.shadowBlur = 19;
  c.shadowColor = base;
  const metal = c.createLinearGradient(-32, -54, 32, 63);
  metal.addColorStop(0, '#fffaf0');
  metal.addColorStop(.32, light);
  metal.addColorStop(1, base);
  poly([[-67, -28], [-45, -19], [-35, 4], [-46, 22], [-61, 5]], metal);
  poly([[67, -28], [45, -19], [35, 4], [46, 22], [61, 5]], metal);
  poly([[0, -63], [40, -30], [46, 21], [0, 62], [-46, 21], [-40, -30]], metal, light);
  c.shadowBlur = 0;
  poly([[0, -48], [29, -23], [34, 16], [0, 48], [-34, 16], [-29, -23]], '#142946', light);
  poly([[0, -34], [25, 10], [7, 3], [0, -5], [-8, 4], [-25, 10]], light);
  poly([[-19, 18], [-14, 14], [13, 33], [8, 37]], base);
  poly([[19, 18], [14, 14], [-13, 33], [-8, 37]], light);
  c.restore();
}
