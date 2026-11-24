import './runtime.js';
import { Game } from '../src/main.js';
import { bindLifecycle, rememberInvite, runtime } from './runtime.js';
import { MiniAccount } from './account.js';
import { MiniTouch } from './touch.js';
import { MiniUI } from './ui.js';
import { installCanvasColorFallback, MiniDisplay } from './display.js';

function start() {
  const canvas = runtime.canvas;
  // Native Canvas has no DOM event target on some devices.
  canvas.addEventListener ||= () => {};
  canvas.removeEventListener ||= () => {};
  const context = canvas.getContext('webgl', { alpha: true, antialias: true });
  if (!context) throw new Error('WebGL 初始化失败');
  runtime.context = context;
  runtime.display = new MiniDisplay(runtime.window, context);
  if (!context.getExtension('EXT_sRGB')) installCanvasColorFallback();
  rememberInvite(wx.getLaunchOptionsSync?.());
  const game = new Game({ Account: MiniAccount, UI: MiniUI, Touch: MiniTouch, mini: runtime });
  try {
    game.sfx.setMuted(!!wx.getStorageSync('huaxue_wechat_mute'));
  } catch {
    // Start with sound enabled if local settings are unavailable.
  }
  let hidden = false;
  bindLifecycle(() => {
    if (hidden) return;
    hidden = true;
    game.touch.release();
    if (!game.net.active && !game.paused) game.setPaused(true);
    game.renderer.setAnimationLoop(null);
    game.account.flush();
  }, () => {
    game.ui.invalidate();
    if (hidden) {
      hidden = false;
      game.clock.getDelta();
      game.renderer.setAnimationLoop(() => game.frame());
    }
    game.joinInvite();
    game.account.flush();
  });
  wx.showShareMenu?.();
  wx.onShareAppMessage?.(() => ({
    title: '雪山大乱斗',
    query: game.customRoom && game.roomId ? `room=${game.roomId}` : '',
  }));
}

try {
  start();
} catch (error) {
  console.error(error);
  wx.showModal({ title: '雪山大乱斗', content: '游戏画面加载失败，请重启小游戏后再试。', showCancel: false });
}
