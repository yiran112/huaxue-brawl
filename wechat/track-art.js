import { trackArt } from '../src/ui/trackArt.js';
import { gradient } from './paint.js';

const SKY = {
  day: ['#45a5f8', '#c8ebff'],
  sunset: ['#ff875f', '#ffd2a0'],
  storm: ['#7979bd', '#c1c7e8'],
  night: ['#142353', '#4b63a8'],
  random: ['#5b43b7', '#269aca'],
};
const scenes = new Map();

// The shared track art emits only these absolute SVG path commands.
function path(c, d) {
  let x = 0, y = 0, px = 0, py = 0;
  for (const match of d.matchAll(/([MLQTCSZ])([^A-Z]*)/g)) {
    const command = match[1];
    const v = match[2].trim().split(/\s+/).map(Number);
    if (command === 'M') c.moveTo(...v);
    else if (command === 'L') c.lineTo(...v);
    else if (command === 'Q') { c.quadraticCurveTo(...v); [px, py] = v; }
    else if (command === 'T') { px = 2 * x - px; py = 2 * y - py; c.quadraticCurveTo(px, py, ...v); }
    else if (command === 'C') { c.bezierCurveTo(...v); [px, py] = v.slice(2); }
    else if (command === 'S') { c.bezierCurveTo(2 * x - px, 2 * y - py, ...v); [px, py] = v; }
    else c.closePath();
    [x, y] = v.slice(-2);
  }
}

export function drawTrackArt(ui, { x, y, w, h }, theme, seed) {
  const c = ui.ctx;
  const key = theme + seed;
  if (!scenes.has(key)) {
    const shapes = theme === 'random' ? [] : [...trackArt(theme, seed).matchAll(/<(circle|polygon|path) ([^>]*?)\/>/g)].map(([, tag, attrs]) => {
      const props = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
      return { tag, props };
    });
    scenes.set(key, shapes);
  }
  c.save();
  c.translate(x, y);
  c.scale(w / 320, h / 140);
  c.fillStyle = gradient(c, 0, 0, 0, 140, ...SKY[theme]);
  c.fillRect(0, 0, 320, 140);
  for (const { tag, props: p } of scenes.get(key)) {
    c.beginPath();
    c.globalAlpha = p.opacity ? +p.opacity : 1;
    if (tag === 'circle') c.arc(+p.cx, +p.cy, +p.r, 0, Math.PI * 2);
    else if (tag === 'polygon') {
      const points = p.points.split(' ').map((pair) => pair.split(',').map(Number));
      c.moveTo(...points[0]);
      points.slice(1).forEach((pair) => c.lineTo(...pair));
      c.closePath();
    } else path(c, p.d);
    if (p.fill && p.fill !== 'none') { c.fillStyle = p.fill; c.fill(); }
    if (p.stroke) {
      c.strokeStyle = p.stroke;
      c.lineWidth = +p['stroke-width'];
      c.lineCap = p['stroke-linecap'] || 'butt';
      c.setLineDash?.(p['stroke-dasharray']?.split(' ').map(Number) || []);
      c.stroke();
    }
  }
  c.restore();
}
