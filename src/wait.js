// 匹配等人：在线越少，机器人越早补上。
// 只有你自己时 10 秒；每多 1 个在线的人，多等 20/15 秒；16 人及以上封顶 30 秒。
export const BOT_WAIT_FAST = 10000;
export const BOT_WAIT_SLOW = 30000;
export const BOT_WAIT_SPAN = 15;

export function botWaitMs(online) {
  const n = Math.max(1, Math.floor(Number(online) || 1));
  const t = Math.min(1, (n - 1) / BOT_WAIT_SPAN);
  return Math.round(BOT_WAIT_FAST + (BOT_WAIT_SLOW - BOT_WAIT_FAST) * t);
}
