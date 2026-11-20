// 入口。手机上游戏放进一个始终横着的框里：屏幕是竖的（锁了方向、在微信里打开转不过来）就把框转 90°，
// 横过手机就能玩；屏幕自己转成横的，框就摆正。框里的页面永远是横屏，排版和触摸坐标都不用另算。
// 大厅这些界面在框里按至少 LOBBY_W × LOBBY_H 排版再整体缩小，一屏放得下；比赛中不缩放，HUD 和触屏按键保持原来的大小。
const LOBBY_W = 1040;
const LOBBY_H = 540;
const RACING = /^(countdown|race|finished)$/;

function hostFrame() {
  if (window.top !== window) return false;
  if (!matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) > 760) return false;
  const f = document.createElement('iframe');
  f.src = location.href;
  f.allow = 'fullscreen; autoplay';
  f.style.cssText = 'position:fixed;left:0;top:0;border:0;display:block;transform-origin:0 0';
  document.body.replaceChildren(f);
  // 邀请链接交给框里的页面处理，外层地址栏里去掉，免得刷新后又进一次
  const url = new URL(location.href);
  if (url.searchParams.has('room')) {
    url.searchParams.delete('room');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  let lastW = 0;
  let lobby = true;
  const fit = (force) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // 安卓弹出输入法会把页面压矮：正在框里打字时不跟着改，免得界面跳来跳去
    const typing = f.contentDocument && /^(INPUT|TEXTAREA)$/.test((f.contentDocument.activeElement || {}).tagName || '');
    if (!force && typing && W === lastW) return;
    lastW = W;
    const rot = H > W;
    const w = rot ? H : W;
    const h = rot ? W : H;
    const s = lobby ? Math.min(1, w / LOBBY_W, h / LOBBY_H) : 1;
    f.style.width = w / s + 'px';
    f.style.height = h / s + 'px';
    f.style.transform = (rot ? `translateX(${W}px) rotate(90deg) ` : '') + (s < 1 ? `scale(${s})` : '');
  };
  fit();
  window.addEventListener('resize', () => fit());
  window.addEventListener('orientationchange', () => setTimeout(fit, 300));
  setInterval(() => {
    const g = f.contentWindow && f.contentWindow.game;
    const next = !(g && RACING.test(g.state));
    if (next === lobby) return;
    lobby = next;
    fit(true);
  }, 150);
  // 框里第一次触屏时请外层进全屏并锁成横屏（浏览器不支持就算了）
  window.addEventListener('message', (e) => {
    if (e.source !== f.contentWindow || !e.data || e.data.t !== 'landscape') return;
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  });
  return true;
}

if (!hostFrame()) import('./main.js');
