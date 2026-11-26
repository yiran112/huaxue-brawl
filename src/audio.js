// WebAudio 音效：常规音效现场合成；卡通音效（惨叫、滑哨、弹簧…）用 sfx/ 里的录音。
// 卡通录音来自 freesound.org 的 CC0 素材，剪过头尾、调平了音量，文件名对应的原始编号：
//   scream1-6: 751700 751701 751702 416840 577972 697545 · ow1-3: 743350 834326 274717
//   whistle1: 497093 · fall1: 395443 · boing1-4: 540790 518645 731262 543641
//   pop1-2: 676000 578640 · plant1: 743678 · mumble1-2: 343911 361071（两条都加了低通，听起来像埋在雪里）
import RACE_FALLBACK_URL from './music/black-diamond.mp3';
import MENU_URL from './music/lobby.mp3';
import { TRACKS } from './tracks.js';

const SAMPLE_URLS = import.meta.glob('./sfx/*.mp3', { eager: true, query: '?url', import: 'default' });
// 赛道配乐及 ui*.mp3 使用 m-a-p 的 YuE2-3B 离线生成：https://huggingface.co/m-a-p/YuE2-3B
const TRACK_MUSIC = import.meta.glob('./music/tracks/*.mp3', { eager: true, query: '?url', import: 'default' });
const UI_TONES = {
  click: [380, 245, 0.042],
  select: [480, 325, 0.052],
  confirm: [540, 1080, 0.13],
  back: [620, 350, 0.09],
  blocked: [255, 165, 0.12],
};

function trackMusicId(trackId, theme, seed) {
  if (trackId) return trackId;
  // 随机赛道的配乐跟随场景，同一张随机图重开或重连时仍用同一首。
  const choices = TRACKS.filter((track) => track.theme === theme);
  return choices.length ? choices[(seed >>> 0) % choices.length].id : null;
}

// 备用比赛音乐：Joth 的《Black Diamond》（opengameart.org/content/black-diamond，CC0），
// 一段专门给滑雪 / 冰雪赛道写的鼓打贝斯循环。整首正好 120 小节、每分钟 143 拍，首尾能无缝接上。
const FALLBACK_LOOP_LEN = (120 * 4 * 60) / 143;
const MUSIC_VOL = 0.5; // 相对音效的音量
const MUSIC_PAUSED = 0.3; // 暂停时压到原来的几成
// 大厅音乐：自己写的 16 秒循环，C 调，钟琴旋律加一层很轻的和弦。只在菜单里播。
// 原始 WAV 在 ref/music-src/，第 2 个采样就已经出声，首尾能无缝接上
const MENU_LEN = 16;
const MENU_VOL = 0.42;

function decode(ctx, bytes) {
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(bytes, resolve, reject)?.then?.(resolve, reject);
  });
}

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.vol = 0.7;
    this.samples = {}; // 录音：组名 -> AudioBuffer[]
    this.lastAt = {}; // 每组录音上次播放的时间
    this.raceMusic = null; // 当前赛道的加载请求或解码缓存
    this.musicSrc = null; // 正在播的那一路和它自己的淡出增益
    this.musicOn = false; // 现在该不该有音乐（音乐还没解码完时先记着）
    this.menuBuf = null;
    this.menuSrc = null;
    this.menuOn = false; // 人在大厅时要播大厅音乐
    this.asleep = false; // 页面被切到后台，声音暂停中
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || this.audioUnavailable) return;
    try {
      this.initGraph(new AC());
    } catch (error) {
      this.ctx?.close?.();
      this.ctx = null;
      this.audioUnavailable = true;
      console.warn('音频初始化失败', error);
    }
  }

  initGraph(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOL;
    this.musicGain.connect(this.master);
    this.menuGain = ctx.createGain();
    this.menuGain.gain.value = 0;
    this.menuGain.connect(this.master);
    // 噪声缓冲
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // 持续的风声 / 滑雪声
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    src.start();
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuf;
    src2.loop = true;
    this.carveFilter = ctx.createBiquadFilter();
    this.carveFilter.type = 'highpass';
    this.carveFilter.frequency.value = 2600;
    this.carveGain = ctx.createGain();
    this.carveGain.gain.value = 0;
    src2.connect(this.carveFilter);
    this.carveFilter.connect(this.carveGain);
    this.carveGain.connect(this.master);
    src2.start();
    this.snowFilter = ctx.createBiquadFilter();
    this.snowFilter.type = 'bandpass';
    this.snowFilter.frequency.value = 850;
    this.snowFilter.Q.value = 0.75;
    this.snowGain = ctx.createGain();
    this.snowGain.gain.value = 0;
    src2.connect(this.snowFilter);
    this.snowFilter.connect(this.snowGain);
    this.snowGain.connect(this.master);
    this.loadSamples();
    this.loadMenu();
    // 切到后台时暂停声音，恢复刷新后由 wake 接着播。
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      this.asleep = true;
      ctx.suspend?.();
    });
  }

  // 每帧调用：只要画面还在刷新，声音就该是开着的
  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.ctx.resume?.();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
  }

  setRide(speed, grounded, carve, ride = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 55);
    this.windGain.gain.setTargetAtTime(ride ? 0.023 + s * 0.16 : 0.03 + s * 0.3, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(350 + s * 1300, t, 0.1);
    if (ride) {
      const { board, edge, skid, powder } = ride;
      const slide = Math.abs(skid);
      const pressure = Math.abs(edge);
      const contact = grounded ? Math.min(speed / 11, 1) : 0;
      // 板刃的高频随换刃起落，横刮和粉雪各自压到更宽、更低的频段。
      const edgeHz = board ? 2200 + edge * 850 : 3400;
      this.carveFilter.frequency.setTargetAtTime(edgeHz, t, 0.055);
      this.carveGain.gain.setTargetAtTime(contact * (1 - powder * 0.92) * (1 - slide * 0.62) *
        (0.014 + s * 0.034 + pressure * (board ? 0.13 : 0.105)), t, 0.055);
      const snowHz = (950 + slide * 870) * (1 - powder) + (380 + s * 290) * powder;
      this.snowFilter.frequency.setTargetAtTime(snowHz, t, 0.075);
      this.snowGain.gain.setTargetAtTime(contact *
        (slide * (0.13 + s * 0.27) * (1 - powder * 0.55) + powder * (0.12 + s * 0.39)), t, 0.06);
      return;
    }
    this.carveFilter.frequency.setTargetAtTime(2600, t, 0.065);
    this.snowGain.gain.setTargetAtTime(0, t, 0.08);
    this.carveGain.gain.setTargetAtTime(grounded ? 0.015 + s * 0.05 + carve * 0.14 : 0, t, 0.05);
  }

  silenceRide() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.02, t, 0.2);
    this.carveGain.gain.setTargetAtTime(0, t, 0.1);
    this.snowGain.gain.setTargetAtTime(0, t, 0.1);
  }

  noise(dur, freq, type, vol, freqEnd) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  boom(v = 1) {
    if (v < 0.03) return;
    this.noise(0.9, 900, 'lowpass', 0.9 * v, 60);
    this.tone('sine', 120, 35, 0.5, 0.8 * v);
  }
  zap(v = 1) {
    this.tone('sawtooth', 1800, 200, 0.22, 0.25 * v);
    this.tone('square', 900, 120, 0.25, 0.12 * v);
  }
  launch(v = 1) {
    this.noise(0.5, 400, 'bandpass', 0.5 * v, 2400);
  }
  shot(v = 1) {
    this.noise(0.25, 2500, 'lowpass', 0.8 * v, 200);
    this.tone('square', 160, 50, 0.15, 0.3 * v);
  }
  pick() {
    this.tone('triangle', 660, 660, 0.09, 0.3);
    this.tone('triangle', 990, 990, 0.09, 0.3, 0.08);
    this.tone('triangle', 1320, 1320, 0.16, 0.3, 0.16);
  }
  beep(high) {
    this.tone('square', high ? 1040 : 520, high ? 1040 : 520, high ? 0.5 : 0.18, 0.22);
  }
  // 被追踪导弹锁定：短促的嘀
  lockBeep() {
    this.tone('square', 1480, 1480, 0.06, 0.12);
  }
  // 被雷击瞄准；locked：落点定住了
  strikeWarn(locked) {
    if (locked) this.tone('sawtooth', 1200, 600, 0.18, 0.14);
    else this.tone('triangle', 700, 1400, 0.22, 0.16);
  }
  whoosh(v = 1) {
    this.noise(0.7, 300, 'bandpass', 0.6 * v, 3000);
  }
  thud(v = 1) {
    if (v < 0.03) return;
    this.tone('sine', 150, 45, 0.2, 0.7 * v);
    this.noise(0.15, 700, 'lowpass', 0.4 * v);
  }

  snowContact(v = 1, load = 0) {
    if (load > 0.42) {
      this.noise(0.25, 920, 'lowpass', (0.38 + load * 0.32) * v, 270);
      this.tone('sine', 124, 54, 0.14, 0.18 * load * v);
    } else {
      this.noise(0.13, 2100, 'bandpass', 0.38 * v, 1150);
      this.noise(0.075, 540, 'lowpass', 0.21 * v);
    }
  }
  bleat(v = 1) {
    if (!this.ctx || v < 0.03) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(430, t + 0.55);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 55;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.65);
    lfo.stop(t + 0.65);
  }
  // ---------- 背景音乐 ----------
  prepareMusic(trackId, theme, seed) {
    if (!this.ctx) return;
    const id = trackMusicId(trackId, theme, seed);
    if (this.raceMusic?.id === id) return;
    this.raceMusic?.controller.abort();
    const race = { id, controller: new AbortController(), buffer: null, start: 0, end: 0 };
    this.raceMusic = race;
    this.loadMusic(race);
  }

  async loadMusic(race) {
    const url = TRACK_MUSIC[`./music/tracks/${race.id}.mp3`];
    const { signal } = race.controller;
    for (const candidate of url ? [url, RACE_FALLBACK_URL] : [RACE_FALLBACK_URL]) {
      try {
        const response = await fetch(candidate, { signal });
        if (!response.ok) continue;
        const buf = await decode(this.ctx, await response.arrayBuffer());
        if (signal.aborted) return;
        race.buffer = buf;
        race.end = buf.duration;
        if (candidate === RACE_FALLBACK_URL) {
          // 旧曲目的循环点按小节计算，先跨过 MP3 开头的编码空白。
          const samples = buf.getChannelData(0);
          const head = samples.findIndex((value) => Math.abs(value) >= 0.05);
          race.start = Math.max(0, head) / buf.sampleRate;
          race.end = Math.min(race.start + FALLBACK_LOOP_LEN, buf.duration);
        }
        if (this.musicOn) this.musicStart();
        return;
      } catch {
        if (signal.aborted) return;
      }
    }
    if (this.raceMusic === race) this.raceMusic = null;
  }
  loadMenu() {
    fetch(MENU_URL)
      .then((r) => r.arrayBuffer())
      .then((b) => decode(this.ctx, b))
      .then((buf) => {
        // mp3 开头的编码空白要跳过，否则循环处会断一下
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.003) i++;
        this.menuHead = Math.max(0, i - 1) / buf.sampleRate;
        this.menuBuf = buf;
        if (this.menuOn) this.menuStart();
      })
      .catch(() => {});
  }
  // 大厅：淡入后一直循环。比赛音乐在播时不插进来。
  menuStart() {
    if (this.musicOn) return;
    this.menuOn = true;
    if (!this.ctx || !this.menuBuf || this.menuSrc) return;
    const t = this.ctx.currentTime;
    const src = (this.menuSrc = this.ctx.createBufferSource());
    src.buffer = this.menuBuf;
    src.loop = true;
    src.loopStart = this.menuHead || 0;
    src.loopEnd = Math.min(src.loopStart + MENU_LEN, this.menuBuf.duration);
    src.connect(this.menuGain);
    this.menuGain.gain.cancelScheduledValues(t);
    this.menuGain.gain.setValueAtTime(0, t);
    this.menuGain.gain.linearRampToValueAtTime(MENU_VOL, t + 0.8);
    src.start(t, src.loopStart);
  }
  menuStop(fade = 0.45) {
    this.menuOn = false;
    const src = this.menuSrc;
    if (!src || !this.ctx) return;
    this.menuSrc = null;
    const t = this.ctx.currentTime;
    this.menuGain.gain.cancelScheduledValues(t);
    this.menuGain.gain.setValueAtTime(this.menuGain.gain.value, t);
    this.menuGain.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.05);
  }
  // 从头开始播，一直循环到 musicStop
  musicStart() {
    this.menuStop(0.3);
    this.musicOn = true;
    const race = this.raceMusic;
    if (!race?.buffer || this.musicSrc) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    this.musicSrc = { src, gain };
    src.buffer = race.buffer;
    src.loop = true;
    src.loopStart = race.start;
    src.loopEnd = race.end;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 0.2);
    src.connect(gain);
    gain.connect(this.musicGain);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    src.start(t, race.start);
  }
  // 用 fade 秒淡出后停掉
  musicStop(fade = 0.4) {
    this.musicOn = false;
    if (!this.musicSrc) return;
    const { src, gain } = this.musicSrc;
    this.musicSrc = null;
    const t = this.ctx.currentTime;
    const currentGain = gain.gain.value;
    // 每一路音乐走自己的淡出，这样马上再开下一局也不会被这次淡出压住
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(currentGain, t);
    gain.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.05);
  }
  // 暂停时把音乐压低，继续时恢复
  musicDuck(on) {
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? MUSIC_VOL * MUSIC_PAUSED : MUSIC_VOL, this.ctx.currentTime, 0.12);
  }

  uiSound(kind) {
    if (!this.ctx || this.muted) return;
    const name = `ui${kind}`;
    const soft = kind === 'click' || kind === 'select';
    if (this.samples[name]?.some(Boolean)) {
      this.sample(name, soft ? 0.48 : 0.62, { gap: 0.04, group: 'ui' });
    } else {
      this.tone(soft ? 'sine' : 'triangle', ...UI_TONES[kind], soft ? 0.07 : 0.12);
    }
  }

  // ---------- 卡通音效（录音） ----------
  // 加载 sfx/ 里的录音，按文件名分组：scream1.mp3、scream2.mp3 … 都归到 scream
  loadSamples() {
    for (const [path, url] of Object.entries(SAMPLE_URLS)) {
      const m = path.match(/([a-z]+)(\d+)\.mp3$/);
      if (!m) continue;
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => decode(this.ctx, b))
        .then((buf) => {
          (this.samples[m[1]] ||= [])[m[2] - 1] = buf;
        })
        .catch(() => {});
    }
  }
  // 播一段录音。which：指定第几条（不给就随机）；gap：同一组声音至少隔多久才再响一次
  sample(name, v, { rate = 1, which, delay = 0, gap = 0.06, group = name } = {}) {
    const list = this.samples[name];
    if (!this.ctx || !list || v < 0.03) return;
    const t = this.ctx.currentTime;
    if (t - (this.lastAt[group] ?? -9) < gap) return;
    const ready = list.filter(Boolean);
    if (!ready.length) return;
    this.lastAt[group] = t;
    const src = this.ctx.createBufferSource();
    src.buffer = ready[(which ?? Math.floor(Math.random() * ready.length)) % ready.length];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = v;
    src.connect(g);
    g.connect(this.master);
    src.start(t + delay);
  }
  // 每个选手嗓门不一样：按编号错开音调
  voiceRate(voice) {
    return 0.9 + ((voice * 3) % 5) * 0.05 + Math.random() * 0.04;
  }
  // 被炸飞的惨叫。voice = 选手编号，每个人固定在两条嗓音里换着用
  scream(v = 1, voice = 0) {
    this.sample('scream', v, { which: voice + (Math.random() < 0.5 ? 0 : 3), rate: this.voiceRate(voice) });
  }
  // 轻一点的磕碰：短促的“哎哟”
  ow(v = 1, voice = 0) {
    this.sample('ow', v, { which: voice, rate: this.voiceRate(voice) });
  }
  // 下坠滑哨：按预计滞空时间挑长短两条里的一条，再微调速度，让它差不多在落地时收尾
  whistle(v = 1, air = 1) {
    const long = air > 1.5;
    const rate = Math.min(1.35, Math.max(0.8, (long ? 2.0 : 1.15) / air));
    this.sample(long ? 'fall' : 'whistle', v, { rate, gap: 0.5, group: 'whistle' });
  }
  // 弹簧声：摔在地上弹起来
  boing(v = 1) {
    this.sample('boing', v, { rate: 0.9 + Math.random() * 0.3, gap: 0.15 });
  }
  // 一头扎进雪里的闷响
  plop(v = 1) {
    this.sample('plant', v);
  }
  // 从雪里拔出来
  pop(v = 1) {
    this.sample('pop', v, { rate: 0.95 + Math.random() * 0.15 });
  }
  // 埋在雪里闷声嘟囔
  mumble(v = 1, voice = 0) {
    this.sample('mumble', v, { delay: 0.3, rate: this.voiceRate(voice), gap: 0.4 });
  }
  // 冻住：先“咔”一声闷响，接着一串越来越尖的结冰脆响
  freeze(v = 1) {
    if (v < 0.03) return;
    this.tone('sine', 230, 55, 0.28, 0.6 * v);
    this.tone('triangle', 2600, 700, 0.4, 0.25 * v);
    this.noise(0.5, 6000, 'highpass', 0.35 * v);
    [1568, 2093, 2637, 3136].forEach((f, i) => this.tone('sine', f, f * 1.02, 0.22, 0.15 * v, 0.05 + i * 0.055));
  }
  // 冰坨崩碎：玻璃碎掉似的一把脆响
  shatter(v = 1) {
    if (v < 0.03) return;
    this.noise(0.3, 4500, 'highpass', 0.5 * v);
    this.noise(0.14, 1400, 'bandpass', 0.4 * v);
    [3136, 2349, 2794, 1976].forEach((f, i) => this.tone('sine', f, f * 0.96, 0.16, 0.13 * v, i * 0.035 + Math.random() * 0.02));
  }
  // 加特林：一发一声“哒”，连起来就是“哒哒哒哒”
  gat(v = 1) {
    if (v < 0.03) return;
    this.noise(0.07, 2800, 'lowpass', 0.75 * v, 500);
    this.tone('square', 190, 70, 0.06, 0.28 * v);
  }
  jet(v = 1) {
    this.noise(2.6, 250, 'bandpass', 0.7 * v, 1800);
  }
  thunder(v = 1) {
    this.noise(1.3, 2600, 'lowpass', 0.9 * v, 90);
    this.zap(v * 0.7);
  }
  shield() {
    this.tone('sine', 400, 900, 0.3, 0.25);
  }
  fanfare(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 349, 330];
    notes.forEach((n, i) => this.tone('triangle', n, n, 0.3, 0.3, i * 0.14));
  }
}
