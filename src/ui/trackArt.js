// 赛道卡片上的小风景和特色图标
import { mulberry32 } from '../util.js';

// 赛道卡片右侧的小图标：这条赛道上有什么
export const FEAT = {
  village: ['🏘️', '山村'], lift: ['🚡', '缆车'], lumber: ['🪵', '伐木场'], icelake: ['🧊', '冰湖'], tunnel: ['🕳️', '隧道'],
  avalanche: ['🏔️', '雪崩'], snowmobile: ['🏍️', '雪地摩托'], boulder: ['🪨', '滚石'], big: ['🛫', '大跳台'],
  ice: ['❄️', '冰面'], powder: ['☁️', '深雪'], pads: ['⚡', '加速带'],
};
export function trackFeats(t) {
  const out = [];
  const add = (k) => FEAT[k] && !out.includes(k) && out.push(k);
  for (const l of t.landmarks || []) add(l.type);
  if (t.avalanche) add('avalanche');
  for (const m of t.movers || []) add(m.type);
  if ((t.features || []).some((f) => f.type === 'big')) add('big');
  for (const z of t.zones || []) add(z.type);
  if (t.pads && t.pads.length) add('pads');
  return out.slice(0, 4);
}

// 赛道卡片上的小风景（天空是卡片底色）：山形、雪道走向、树由种子决定，同一条赛道每次画得一样
const ART = {
  day: { far: '#a7cbef', near: '#7c9dcd', fg: '#f4f9ff', tree: '#2f6b4f', run: '#4f8dff' },
  sunset: { far: '#e49c8c', near: '#93537f', fg: '#fff0e2', tree: '#5a3a52', run: '#ff6a3d' },
  storm: { far: '#8c90bb', near: '#585a8a', fg: '#e9ecff', tree: '#363a5e', run: '#a77bff' },
  night: { far: '#3a4c9a', near: '#24306e', fg: '#c6d6ff', tree: '#16204a', run: '#5cf0d4' },
};
const artCache = new Map();
export function trackArt(theme, seed) {
  const key = theme + seed;
  if (artCache.has(key)) return artCache.get(key);
  const a = ART[theme] || ART.day;
  const rng = mulberry32(seed);
  const f = (v) => v.toFixed(0);
  let s = '';
  if (theme === 'day') s += '<circle cx="262" cy="30" r="22" fill="#fff8d0" opacity=".3"/><circle cx="262" cy="30" r="12" fill="#fff8d0"/>';
  if (theme === 'sunset') s += `<circle cx="${f(60 + rng() * 80)}" cy="74" r="26" fill="#ffe08a" opacity=".95"/>`;
  if (theme === 'night') {
    s += '<path d="M-10 46 Q60 14 130 40 T270 30 T340 22" stroke="#5cf0b0" stroke-width="14" fill="none" opacity=".22"/>';
    s += '<path d="M-10 52 Q70 24 140 46 T280 36 T340 30" stroke="#8affd0" stroke-width="4" fill="none" opacity=".35"/>';
    for (let i = 0; i < 16; i++) s += `<circle cx="${f(rng() * 320)}" cy="${f(rng() * 60)}" r="${(0.6 + rng() * 0.9).toFixed(1)}" fill="#fff" opacity=".8"/>`;
    s += '<circle cx="272" cy="24" r="9" fill="#f4f7ff"/>';
  }
  // 远山、近山（山顶带雪）。卡片底部约四分之一被信息栏挡住，景物都往上放
  const ridge = (base, amp, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 320 + (i && i < n ? (rng() - 0.5) * 18 : 0);
      pts.push([x, base - (i % 2 ? amp * (0.6 + rng() * 0.5) : amp * rng() * 0.3)]);
    }
    return pts;
  };
  const poly = (pts) => `0,140 ${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')} 320,140`;
  s += `<polygon points="${poly(ridge(66, 30, 9))}" fill="${a.far}"/>`;
  const near = ridge(86, 42, 7);
  s += `<polygon points="${poly(near)}" fill="${a.near}"/>`;
  for (let i = 1; i < near.length; i += 2) {
    const [x, y] = near[i];
    s += `<polygon points="${f(x)},${f(y)} ${f(x - 11)},${f(y + 13)} ${f(x - 4)},${f(y + 9)} ${f(x + 2)},${f(y + 14)} ${f(x + 11)},${f(y + 12)}" fill="${a.fg}" opacity=".9"/>`;
  }
  const ridgeY = (x) => {
    for (let i = 1; i < near.length; i++) {
      const [xa, ya] = near[i - 1];
      const [xb, yb] = near[i];
      if (x <= xb) return ya + ((yb - ya) * (x - xa)) / (xb - xa);
    }
    return near[near.length - 1][1];
  };
  // 前景雪坡 + 一条从山脊蜿蜒下来的雪道
  const y0 = 84 + rng() * 6;
  const y1 = 92 + rng() * 8;
  s += `<path d="M0 ${f(y0)} Q${f(90 + rng() * 60)} ${f(y0 - 16)} 200 ${f(y1)} T320 ${f(y1 - 4)} L320 140 L0 140 Z" fill="${a.fg}"/>`;
  const x0 = 110 + rng() * 100;
  const dir = rng() < 0.5 ? -1 : 1;
  const w1 = dir * (34 + rng() * 30);
  const w2 = -dir * (40 + rng() * 40);
  const top = ridgeY(x0) + 3;
  const run = `M${f(x0)} ${f(top)} C${f(x0 + w1)} ${f(top + 14)} ${f(x0 + w1)} ${f(top + 26)} ${f(x0 + w1 * 0.3)} 100 S${f(x0 + w2)} 118 ${f(x0 + w2 * 0.6)} 146`;
  s += `<path d="${run}" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" opacity=".95"/>`;
  s += `<path d="${run}" stroke="${a.run}" stroke-width="3" fill="none" stroke-dasharray="7 6" stroke-linecap="round"/>`;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const x = x0 + side * (46 + rng() * 120);
    const y = 90 + rng() * 22;
    const h = 8 + rng() * 9;
    s += `<polygon points="${f(x)},${f(y - h)} ${f(x - h * 0.45)},${f(y)} ${f(x + h * 0.45)},${f(y)}" fill="${a.tree}"/>`;
  }
  if (theme === 'storm') for (let i = 0; i < 34; i++) s += `<circle cx="${f(rng() * 320)}" cy="${f(rng() * 140)}" r="${(0.8 + rng() * 1.2).toFixed(1)}" fill="#fff" opacity=".75"/>`;
  const svg = `<svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${s}</svg>`;
  artCache.set(key, svg);
  return svg;
}
