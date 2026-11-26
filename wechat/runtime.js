const apiOrigin = __WECHAT_API_ORIGIN__;
const screenCanvas = wx.createCanvas();
const events = new Map();
const resize = new Set();
const session = new Map();
const packages = new Map();
const fs = wx.getFileSystemManager();
let info = windowInfo();
let insets = safeInsets();
let pendingRoom = 0;

function windowInfo() {
  return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

function safeInsets() {
  const { windowWidth: w, windowHeight: h, safeArea: area } = info;
  const safe = area && area.right - area.left >= w * 0.7 && area.bottom - area.top >= h * 0.6 &&
    area.right <= w && area.bottom <= h ? area : null;
  const rect = wx.getMenuButtonBoundingClientRect?.();
  return {
    left: Math.max(0, safe?.left || 0),
    right: Math.max(0, w - (safe?.right ?? w)),
    top: Math.max(0, safe?.top || 0),
    bottom: Math.max(0, h - (safe?.bottom ?? h)),
    capsule: rect?.bottom > 0 && rect.bottom < h / 4 ? rect : null,
  };
}

function handlers(type) {
  if (!events.has(type)) events.set(type, new Set());
  return events.get(type);
}

function makeCanvas() { return wx.createCanvas(); }

function storage(read, write, remove) {
  return {
    getItem: (key) => read(key) || null,
    setItem: (key, value) => write(key, String(value)),
    removeItem: (key) => remove(key),
  };
}

function loadPackage(path) {
  const name = path.split('/')[0];
  if (!name.startsWith('music-')) return Promise.resolve();
  if (!packages.has(name)) {
    const loaded = new Promise((success, fail) => wx.loadSubpackage({ name, success, fail }));
    packages.set(name, loaded.catch((e) => {
      packages.delete(name);
      throw e;
    }));
  }
  return packages.get(name);
}

function request(path, options = {}) {
  if (!path.startsWith('/api/')) {
    return loadPackage(path).then(() => {
      if (options.signal?.aborted) throw new Error('请求已取消');
      return new Promise((resolve, reject) => {
        fs.readFile({
          filePath: path,
          success: ({ data }) => resolve({ ok: true, arrayBuffer: () => Promise.resolve(data) }),
          fail: reject,
        });
      });
    });
  }
  if (!apiOrigin) return Promise.reject(new Error('未配置联机服务器'));
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiOrigin + path,
      method: options.method || 'GET',
      header: options.headers,
      data: options.body,
      timeout: 8000,
      success: ({ statusCode, data }) => resolve({
        status: statusCode,
        ok: statusCode >= 200 && statusCode < 300,
        json: async () => typeof data === 'string' ? JSON.parse(data) : data,
      }),
      fail: reject,
    });
  });
}

class Socket {
  constructor(url) {
    this.readyState = 0;
    const task = (this.task = wx.connectSocket({ url, fail: () => this.closed() }));
    task.onOpen(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.();
    });
    task.onMessage((message) => {
      if (this.readyState === 1) this.onmessage?.(message);
    });
    task.onClose(() => this.closed());
    task.onError(() => {
      this.closed();
      task.close({ fail: () => {} });
    });
  }

  send(data) {
    const payload = ArrayBuffer.isView(data)
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
    this.task.send({ data: payload, fail: () => this.closed() });
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.task.close({ fail: () => this.closed() });
  }

  closed() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}

export const documentAdapter = {
  hidden: false,
  get visibilityState() { return this.hidden ? 'hidden' : 'visible'; },
  getElementById: (id) => id === 'c' ? screenCanvas : null,
  createElement: (tag) => tag === 'img' ? wx.createImage?.() : makeCanvas(),
  createElementNS: makeCanvas,
  addEventListener: (type, fn) => handlers(type).add(fn),
  removeEventListener: (type, fn) => handlers(type).delete(fn),
};

const raf = typeof requestAnimationFrame === 'function'
  ? (cb) => requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(Date.now()), 16);
const caf = typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
const media = (query) => ({ matches: query === '(pointer: coarse)' });

export const runtime = {
  online: !!apiOrigin,
  canvas: screenCanvas,
  window: {
    get innerWidth() { return info.windowWidth; },
    get innerHeight() { return info.windowHeight; },
    get devicePixelRatio() { return info.pixelRatio; },
    matchMedia: media,
    addEventListener(type, fn) { if (type === 'resize') resize.add(fn); },
    AudioContext: typeof wx.createWebAudioContext === 'function' ? function WxAudio() {
      return wx.createWebAudioContext();
    } : undefined,
  },
  document: documentAdapter,
  self: { requestAnimationFrame: raf, cancelAnimationFrame: caf },
  matchMedia: media,
  localStorage: storage(wx.getStorageSync.bind(wx), wx.setStorageSync.bind(wx), wx.removeStorageSync.bind(wx)),
  sessionStorage: storage((key) => session.get(key), (key, value) => session.set(key, value), (key) => session.delete(key)),
  fetch: request,
  location: { protocol: 'https:', host: apiOrigin.slice('https://'.length) },
  WebSocket: Socket,
  AbortController: class {
    signal = { aborted: false };
    abort() { this.signal.aborted = true; }
  },
  performance: { now: () => Date.now() },
  takeInvite() {
    const id = pendingRoom;
    pendingRoom = 0;
    return id;
  },
  get insets() { return insets; },
};
GameGlobal.huaxueRuntime = runtime;

export function rememberInvite(options) {
  const room = Number(options?.query?.room);
  if (Number.isSafeInteger(room) && room > 0) pendingRoom = room;
}

export function bindLifecycle(onHide, onShow) {
  const refreshSize = () => {
    info = windowInfo();
    insets = safeInsets();
    for (const fn of resize) fn();
  };
  wx.onWindowResize?.(refreshSize);
  wx.onHide(() => {
    onHide();
    documentAdapter.hidden = true;
    for (const fn of handlers('visibilitychange')) fn();
  });
  wx.onShow((options) => {
    rememberInvite(options);
    refreshSize();
    documentAdapter.hidden = false;
    for (const fn of handlers('visibilitychange')) fn();
    onShow();
  });
}
