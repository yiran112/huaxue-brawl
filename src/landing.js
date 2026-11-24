import { smooth } from './util.js';

// 撞向雪坡的速度决定吃力程度，横着接雪或板身偏斜也会损失速度。
export function landingLoad(impact, headingError = 0, trickError = 0) {
  return Math.max(
    smooth(6, 18, impact),
    0.95 * smooth(0.22, 0.95, headingError),
    0.8 * smooth(0.19, 0.82, trickError),
  );
}

export function landingSpeedFactor(load) {
  return 1 - 0.24 * smooth(0.32, 1, load);
}
