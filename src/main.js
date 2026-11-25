// 雪山大乱斗 - 主程序
import * as THREE from 'three';
import { THEMES, THEME_KEYS, LENGTHS, LOOK_PRESETS, BOT_NAMES, DEFAULT_RULES, POINTS, SKINS, MODES } from './config.js';
import { GEAR, LOOK_EXTRA_DEFAULTS, COSMETIC_SLOTS, uniformUp, pickBotGear } from './gear.js';
import { CEDAR_PRACTICE, PRACTICE_SECONDS, TRACK_MAP } from './tracks.js';
import { RANK_LV, RANK_MAP, scoreLeave, ESCAPE_EXTRA } from './rank.js';
import { Profile, cleanNick, randomNick } from './profile.js';
import { makeMode, TEAM_NAMES } from './modes.js';
import { Hazards, NO_HAZARDS } from './hazards.js';
import { GhostRecorder, GhostRunner, loadGhost, saveGhost } from './ghost.js';
import { Course } from './course.js';
import { Racer } from './racer.js';
import { Skier } from './skier.js';
import { FX, Snowfall, COL } from './fx.js';
import { Sfx } from './audio.js';
import { Items, Weapons, Deer } from './weapons.js';
import { buildArch, buildChairlift, glowTexture, canvasTex } from './props.js';
import { Showroom, STAGE_TOP } from './showroom.js';
import { esc } from './ui/common.js';
import { Quality } from './quality.js';
import { Emotes } from './emotes.js';
import { Replay } from './replay.js';
import { Net } from './net.js';
import { Departure } from './departure.js';
import { clamp, lerp, damp, smooth, wrapAngle, fmtTime } from './util.js';

const LS_RULES = 'huaxue_rules_v1';
const LS_LOOK = 'huaxue_look_v1';
const LS_NAME = 'huaxue_name_v1';
// 正在打的联机比赛的座位钥匙：掉线 / 刷新 / 关掉网页后凭它回到这一局
const LS_SEAT = 'huaxue_seat_v1';
const SEAT_MS = 10 * 60 * 1000;
const load = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || {};
  } catch {
    return {};
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 忽略 */
  }
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _skyHold = new THREE.Vector3();
const _sunPos = new THREE.Vector3();
const _sunTgt = new THREE.Vector3();
const _buf = new THREE.Vector2();
// 对方在主画面里且不超过这个距离（米），就当作玩家自己看得到，不弹现场画面
const IMPACT_VIEW_DIST = 70;
// 大厅镜头要框住的范围（米）：整台缆车的宽度、从雪板到帽顶的高度，都留了点边
const LIFT_W = 10.6;
const LIFT_H = 4.8;
// 展厅镜头要框住的范围：整个展台的宽度、从台面到帽顶的高度
const SHOW_W = 6.2;
const SHOW_H = 4.3;
// 展厅里固定的打光方向（从镜头右上方照向角色），不跟赛道主题走
const SHOW_SUN = new THREE.Vector3(0.45, 0.8, 0.6).normalize();
const NO_ITEMS = { nearestAhead: () => null, update() {}, take() {}, dispose() {} };
// 起步喷：喊“冲”之前这么多秒内按下 W 是完美起步；“冲”之后这么多秒内才按下是普通起步
const START_PERFECT = 0.3;
const START_LATE = 0.25;
const BOT_START = [0.25, 0.45, 0.7]; // 机器人起步喷的概率（按难度）
const FINISH_SLOW = 1.4; // 单机冲线后慢镜头持续几秒（真实时间）

export class Game {
  constructor({ Account, UI, RaceHud, Touch, mini = null }) {
    this.mini = mini;
    this.profile = new Profile();
    this.account = new Account(this);
    this.profile.onSave = () => this.account.noteChanged();
    this.rules = { ...DEFAULT_RULES, ...load(LS_RULES) };
    if (!Array.isArray(this.rules.banned)) this.rules.banned = [];
    if (!THEMES[this.rules.theme] && this.rules.theme !== 'random') this.rules.theme = 'day';
    if (!LENGTHS[this.rules.length]) this.rules.length = 'medium';
    if (!MODES[this.rules.mode]) this.rules.mode = 'race';
    if (this.rules.track !== 'random' && !this.profile.trackUnlocked(this.rules.track)) this.rules.track = 'random';
    this.look = { ...LOOK_PRESETS[0], ...LOOK_EXTRA_DEFAULTS, ...load(LS_LOOK) };
    if (this.look.skin < 16) this.look.skin = SKINS[this.look.skin];
    this.validateLook();
    this.playerHits = 0;
    // 当前这一组比赛：quick 快速赛 / rank 排位
    this.session = { kind: 'quick', mode: this.rules.mode, track: this.rules.track };
    // 认得出「刷新的是不是同一个标签页」：另一个标签页正在打的比赛，这边不去抢
    try {
      this.tabId = sessionStorage.getItem('huaxue_tab') || Math.random().toString(36).slice(2);
      sessionStorage.setItem('huaxue_tab', this.tabId);
    } catch {
      this.tabId = Math.random().toString(36).slice(2);
    }
    this.rejoining = null; // 正在连回原来那一局：{ key, live, until }
    this.rejoinSync = 0; // 连回来后，等房主发来自己角色的位置（剩余秒数）
    this.mode = makeMode('race', this);
    this.hazards = NO_HAZARDS;
    this.ghost = null;
    this.ghostRec = null;
    this.camRacer = null; // 自己被淘汰后镜头跟着谁
    this.itemRespawn = 6;
    this.trackDef = this.rules.track !== 'random' ? TRACK_MAP[this.rules.track] || null : null;
    this.botLooks = [];
    this.genBotLooks();
    this.rep = this.newReport();
    // 联机
    this.soloRules = this.rules; // 单机规则；联机比赛期间 this.rules 临时换成服务器发来的规则
    // 昵称放在存档里（老版本单独存在 LS_NAME）
    if (!this.profile.data.name) {
      this.profile.data.name = cleanNick(load(LS_NAME)) || randomNick();
      this.profile.save();
    }
    this.net = new Net(this);
    this.netMode = false; // 从点“开始比赛”进匹配，到回大厅之间都是 true
    this.customRoom = false; // 正在一间自己开的房间里，退出后回到房间列表
    this.matchPlayers = null; // 匹配中：房间里已经有的玩家
    this.matchEnd = 0;
    this.waitGo = false; // 赛道加载完了，在等其他人
    this.deers = [];
    this.paceD = null; // 机器人调速用的参照进度（真人玩家的进度）
    this.resT = 0;

    this.keys = { left: false, right: false, up: false, down: false, drift: false, flipB: false, flipF: false };
    this.spaceFlip = false; // 空中按下空格：按住期间后空翻
    this.steer = 0;
    this.jumpQ = false;
    this.fireQ = false;
    this.state = 'boot';
    this.paused = false;
    this.time = 0;
    this.racers = [];
    this.entities = [];
    this.order = [];
    this.player = null;
    this.items = NO_ITEMS;
    this.round = 1;
    this.points = [];
    this.botNames = BOT_NAMES.slice();
    this.raceTime = 0;
    this.camYaw = 0;
    this.camLead = 0;
    this.camPitch = 0;
    this.orbit = 0;
    this.trailColor = 0x6f8fd0;

    this.initRenderer();
    this.initSky();
    this.sfx = new Sfx();
    this.fx = new FX(this.scene);
    this.quality = new Quality(this);
    this.quality.apply();
    this.weapons = new Weapons(this);
    this.ui = new UI(this);
    this.hud = RaceHud ? new RaceHud(this) : null;
    this.touch = new Touch(this);
    this.emotes = new Emotes(this);
    this.replay = new Replay(this);
    if (!mini || mini.online) this.beatPresence();
    this.seed = (Math.random() * 1e9) | 0;
    this.themeKey = this.resolveTheme();
    this.buildWorld();
    this.toMenu();
    this.account.boot().then(() => {
      this.resumeSeat();
      this.joinInvite();
    });
    if (!mini) this.bindInput();
    this.clock = new THREE.Clock();
    this.frameAt = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    if (!mini) this.initBackgroundTick();
  }

  // 联机比赛时窗口切到后台（或被最小化、被别的窗口挡住），浏览器会停掉画面刷新。
  // 自己的角色（房主还有机器人）不能跟着停，所以用一个 Worker 定时器盯着：
  // 只要有一阵子没出画面，就由它接着推进游戏逻辑（后台页面里普通定时器会被压到每秒一次）。
  // 不看 document.hidden —— 有些情况下画面停了它却还是 false。
  initBackgroundTick() {
    const tick = () => {
      if (!this.net.active || performance.now() - this.frameAt < 70) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      try {
        this.update(dt);
      } catch (e) {
        console.error(e);
      }
    };
    try {
      const src = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},50)'], { type: 'text/javascript' }));
      const w = new Worker(src);
      w.onmessage = tick;
      w.onerror = () => {
        w.terminate();
        setInterval(tick, 50);
      };
    } catch {
      setInterval(tick, 50);
    }
  }

  // ---------- 初始化 ----------
  initRenderer() {
    const canvas = document.getElementById('c');
    const renderer = (this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: !this.mini, powerPreference: 'high-performance',
      ...(this.mini ? { context: this.mini.context } : null),
    }));
    if (this.mini) renderer.setClearAlpha(1);
    const resize = () => {
      if (this.mini) this.mini.display.resize(renderer);
      else renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    if (!this.mini) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    resize();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 5000);
    this.camera.position.set(0, 20, 40);
    this.impactCam = new THREE.PerspectiveCamera(50, 1.6, 0.3, 4000);
    this.impact = null;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 520;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.6, 0.3).normalize();
    window.addEventListener('resize', () => {
      resize();
      this.quality.fit();
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  initSky() {
    const g = (this.sky = new THREE.Group());
    this.scene.add(g);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        hor: { value: new THREE.Color() },
        sunCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float t = pow(clamp(d.y*1.2+0.03,0.0,1.0),0.6);
          vec3 c = mix(hor, top, t); float s = max(dot(d, sunDir),0.0);
          c += sunCol*(pow(s,10.0)*0.22 + pow(s,90.0)*0.35);
          gl_FragColor = vec4(c,1.0);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 14), this.skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    g.add(dome);

    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    this.sunSprite.scale.setScalar(900);
    g.add(this.sunSprite);

    // 云
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false });
    const blob = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(blob, this.cloudMat);
        const s = 60 + Math.random() * 70;
        m.scale.set(s * 1.5, s * 0.75, s);
        m.position.set((k - n / 2) * 85 + Math.random() * 30, Math.random() * 28, Math.random() * 50);
        c.add(m);
      }
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const r = 1500 + Math.random() * 700;
      c.position.set(Math.cos(a) * r, 330 + Math.random() * 420, Math.sin(a) * r);
      c.rotation.y = -a + Math.PI / 2;
      this.clouds.add(c);
    }
    g.add(this.clouds);

    // 极光
    const auroraTex = canvasTex(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const k = 0.45 + 0.55 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037 + 1.3));
        const gr = c.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(120,80,255,0)');
        gr.addColorStop(0.45, `rgba(90,255,190,${0.35 * k})`);
        gr.addColorStop(0.85, `rgba(60,255,140,${0.95 * k})`);
        gr.addColorStop(1, 'rgba(60,255,140,0)');
        c.fillStyle = gr;
        c.fillRect(x, 0, 1, h);
      }
    });
    auroraTex.wrapS = THREE.RepeatWrapping;
    this.auroraTex = auroraTex;
    this.aurora = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(3200, 520, 48, 1);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 0.0028 + i * 2.1) * 330);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(-700 + i * 700, 620 + i * 170, -1900 - i * 200);
      m.rotation.y = -0.35 + i * 0.35;
      this.aurora.add(m);
    }
    g.add(this.aurora);

    // 星星
    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.asin(0.05 + Math.random() * 0.95);
      sp[i * 3] = Math.cos(a) * Math.cos(e) * 2800;
      sp[i * 3 + 1] = Math.sin(e) * 2800;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 2800;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    g.add(this.stars);
  }

  resolveTheme() {
    if (this.trackDef) return this.trackDef.theme;
    if (this.rules.theme === 'random') return THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
    return this.rules.theme;
  }

  // 用服务器存档换掉本地缓存，并卸下这个账号还没解锁的外观
  adoptProfile(data) {
    const prevName = this.playerName;
    this.profile.loadData(data);
    this.validateLook();
    save(LS_LOOK, this.look);
    if (!this.playerName) this.setName(this.account.username || prevName || randomNick());
    this.checkRankLeave();
    this.ui.refreshProfile();
    this.ui.refreshBoard();
    if (this.state === 'menu') {
      this.ui.renderTab(this.ui.tab);
      this.buildLobby();
      this.syncShow();
    }
  }

  // 存档里的外观如果用了没解锁的东西（比如存档被清过），换回默认
  validateLook() {
    const L = this.look;
    const P = this.profile;
    if (!GEAR[L.gear] || !P.gearOwned(L.gear)) L.gear = 'ski';
    if (!P.hatOwned(L.hat | 0)) L.hat = 0;
    for (const slot in COSMETIC_SLOTS) if (!P.cosmeticOwned(slot, L[slot] | 0)) L[slot] = 0;
  }

  // 机器人：预设外观 + 随机装备和配饰
  genBotLooks(difficulty = 1) {
    const r = (n, p) => (Math.random() < p ? 0 : 1 + Math.floor(Math.random() * n));
    this.botLooks = [];
    for (let i = 0; i < 7; i++) {
      this.botLooks.push({
        ...LOOK_PRESETS[1 + i],
        gear: pickBotGear(difficulty),
        goggles: r(3, 0.5),
        back: r(4, 0.55),
        scarf: r(2, 0.6),
        trail: r(4, 0.65),
      });
    }
  }

  applyTheme(theme) {
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.renderer.setClearColor(theme.fog);
    this.skyMat.uniforms.top.value.set(theme.skyTop);
    this.skyMat.uniforms.hor.value.set(theme.skyHor);
    this.skyMat.uniforms.sunCol.value.set(theme.sunDisc);
    this.sunDir.set(...theme.sunDir).normalize();
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.hemi.intensity = theme.hemiInt;
    this.sun.color.set(theme.sunColor);
    this.sun.intensity = theme.sunInt;
    this.sunSprite.position.copy(this.sunDir).multiplyScalar(2700);
    this.sunSprite.material.color.set(theme.sunDisc);
    this.sunSprite.scale.setScalar(theme.stars ? 420 : 900);
    this.cloudMat.color.set(theme.cloud);
    this.cloudMat.emissive.set(theme.cloud).multiplyScalar(theme.stars ? 0.25 : 0.42);
    this.aurora.visible = !!theme.aurora;
    this.stars.visible = !!theme.stars;
    this.trailColor = theme.stars ? 0x1c2f66 : 0x5f86d6;
  }

  buildWorld() {
    this.clearRace();
    if (this.course) this.course.dispose();
    if (this.snowfall) {
      this.snowfall.dispose();
      this.snowfall = null;
    }
    const def = this.trackDef;
    if (def) this.themeKey = def.theme;
    const theme = (this.theme = THEMES[this.themeKey]);
    this.applyTheme(theme);
    const course = (this.course = new Course({
      seed: def ? def.seed : this.seed,
      length: def ? def.length : LENGTHS[this.rules.length].length,
      theme,
      itemRate: this.rules.itemRate,
      def,
    }));
    this.scene.add(course.group);
    this.fx.normalAt = (x, z, out) => course.normal(x, z, out);
    const L = course.L;
    const fx = course.cx(L);
    const arch = buildArch('FINISH', '#e0263c', 12.5);
    arch.position.set(fx, course.height(fx, -L) + 1.2, -L);
    course.group.add(arch);
    const start = buildArch('START', '#2f6bff', 14);
    start.position.set(0, course.height(0, 0) + 1.2, 0);
    course.group.add(start);
    if (theme.snowfall > 0) this.snowfall = new Snowfall(this.scene, theme.snowfall);
  }

  clearRace() {
    this.clearDeparture();
    this.clearImpact();
    this.replay?.reset();
    this.emotes?.clear();
    this.slowT = 0;
    this.sfx.musicStop();
    for (const r of this.racers) r.dispose();
    for (const e of this.entities) e.dispose();
    if (this.items) this.items.dispose();
    if (this.hazards) this.hazards.dispose();
    this.hazards = NO_HAZARDS;
    if (this.ghost) this.ghost.dispose();
    this.ghost = null;
    this.ghostRec = null;
    this.camRacer = null;
    this.racers = [];
    this.entities = [];
    this.deers = [];
    this.order = [];
    this.items = NO_ITEMS;
    this.player = null;
    if (this.fx) this.fx.clear();
  }

  // ---------- 大厅 ----------
  buildLobby(looks = null, withCable = true) {
    this.disposeLobby();
    const c = this.course;
    const g = (this.lobby = new THREE.Group());
    const z = 36;
    g.position.set(0, c.height(0, z) + 13, z);
    g.rotation.y = Math.PI;
    g.add(buildChairlift(withCable));
    this.lobbySkiers = [];
    // 单机：自己 + 机器人；匹配中：缆车上坐的是已经匹配到的玩家
    if (!looks) {
      looks = [];
      if (this.matchPlayers) {
        for (const p of this.matchPlayers) looks.push(p.look);
      } else {
        const bots = this.rules.mode === 'tt' ? 0 : this.rules.mode === 'team' ? 7 : this.rules.bots;
        for (let i = 0; i < 1 + bots; i++) looks.push(i === 0 ? this.look : this.botLooks[(i - 1) % 7]);
      }
    }
    const n = Math.min(8, looks.length);
    // 玩家坐中间
    const slots = [3, 4, 2, 5, 1, 6, 0, 7];
    for (let i = 0; i < n; i++) {
      const look = looks[i];
      const s = new Skier(look);
      s.setSeated();
      s.group.position.set((slots[i] - 3.5) * 1.14, -0.3, 0.02);
      g.add(s.group);
      this.lobbySkiers.push(s);
    }
    this.scene.add(g);
  }

  disposeLobby() {
    if (!this.lobby) return;
    for (const s of this.lobbySkiers) s.dispose();
    this.lobby.removeFromParent();
    this.lobby = null;
    this.lobbySkiers = [];
  }

  // tab：回到大厅后打开哪一页
  toMenu(tab) {
    // 回大厅就退出联机房间 / 匹配队列，规则换回单机的
    this.net.leave();
    clearTimeout(this.rejoinTimer);
    this.rejoining = null;
    this.rejoinSync = 0;
    this.netDropped = false;
    this.netMode = false;
    this.matchPlayers = null;
    this.waitGo = false;
    this.rules = this.soloRules;
    this.clearRace();
    // 大厅背景换回菜单里选的赛道
    const def = this.rules.track !== 'random' ? TRACK_MAP[this.rules.track] || null : null;
    if (def !== this.trackDef || (def && this.course && this.course.def !== def)) {
      this.trackDef = def;
      this.themeKey = this.resolveTheme();
      this.buildWorld();
    }
    this.state = 'menu';
    this.paused = false;
    this.ui.showPause(false);
    this.ui.hideResults();
    this.ui.showHud(false);
    this.ui.showMatch(false);
    this.ui.setQueue(false);
    this.ui.showMenu(true);
    this.ui.buildMenu();
    if (tab) this.ui.openTab(tab);
    this.buildLobby();
    this.sfx.silenceRide();
    this.sfx.menuStart();
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
  }

  setRule(k, v) {
    // 比赛中 this.rules 是这一局的临时规则，菜单里改的始终是单机规则
    this.soloRules[k] = v;
    if (this.rules !== this.soloRules && (k === 'shadows' || k === 'quality')) this.rules[k] = v;
    save(LS_RULES, this.soloRules);
    if (k === 'quality') this.quality.apply();
    if (k === 'theme' || k === 'track') {
      this.trackDef = this.rules.track !== 'random' ? TRACK_MAP[this.rules.track] || null : null;
      this.themeKey = this.resolveTheme();
      this.buildWorld();
      this.buildLobby();
    } else if (k === 'bots' || k === 'mode') {
      this.buildLobby();
    }
    if (k === 'mode' || k === 'track' || k === 'bots' || k === 'difficulty' || k === 'rounds') {
      this.ui.renderTab('race');
      if (this.ui.tab === 'set') this.ui.renderTab('set');
    }
  }

  toggleBan(id) {
    const b = this.soloRules.banned;
    const i = b.indexOf(id);
    if (i >= 0) b.splice(i, 1);
    else b.push(id);
    save(LS_RULES, this.soloRules);
  }

  setLook(k, v) {
    this.look[k] = v;
    save(LS_LOOK, this.look);
    if (this.netMode && !this.customRoom && this.state === 'menu') this.net.sendJson({ t: 'look', look: this.look });
    if (this.state === 'menu') this.buildLobby();
    this.syncShow();
  }

  // ---------- 展厅（成长 / 车库 / 角色页的背景） ----------
  // label：展台背后的全息大字，传 null 表示回到缆车大厅；
  // gear：车库里正在看的装备，可以是还没拥有的，只用来预览；
  // patch：只在展台上试穿的外观字段（商城补给箱开出来的东西）
  setShow(label, gear, patch) {
    this.showLabel = label || null;
    this.showGear = gear || null;
    this.showPatch = patch || null;
    this.syncShow();
  }

  // 按当前状态进出展厅；force === false 时强制退出（开赛前调用）
  syncShow(force) {
    // 匹配排队时照样能逛车库、角色；只有进了自建房间的等待面板才收起展厅
    const on = force !== false && !!this.showLabel && this.state === 'menu' && !this.customRoom;
    if (on && !this.showroom) {
      this.showroom = new Showroom();
      this.scene.add(this.showroom.group);
    }
    const room = this.showroom;
    if (!room) return;
    if (on) {
      room.setLabel(this.showLabel);
      // 车库里看装备：台上不摆人，只摆放大了的装备
      const gearOnly = !!this.showGear && this.showLabel === 'GARAGE';
      room.setLook({ ...this.look, ...(this.showGear ? { gear: this.showGear } : null), ...this.showPatch }, gearOnly);
      if (!room.group.visible) {
        // 放到起点上空很高的地方，四周的山够不着
        room.group.position.set(0, this.course.height(0, 36) + 700, 36);
        room.group.visible = true;
        this.lobbyCam = null;
      }
    } else if (room.group.visible) {
      room.group.visible = false;
      this.lobbyCam = null;
      // 把雪山和灯光换回来
      const th = this.theme;
      this.hemi.color.set(th.hemiSky);
      this.hemi.groundColor.set(th.hemiGround);
      this.hemi.intensity = th.hemiInt;
      this.sun.color.set(th.sunColor);
      this.sun.intensity = th.sunInt;
      this.course.group.visible = true;
      if (this.lobby) this.lobby.visible = true;
      if (this.snowfall) this.snowfall.points.visible = true;
    }
  }

  // ---------- 比赛流程 ----------
  shuffleBots(difficulty = 1) {
    this.botNames = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    this.genBotLooks(difficulty);
  }

  // 快速赛：按菜单里选的模式 / 赛道
  startTournament() {
    if (this.seatBusy()) return;
    if (this.netMode && !this.customRoom && this.state === 'menu') {
      this.leavePublicQueue();
      this.ui.toast('已取消匹配');
    }
    this.session = { kind: 'quick', mode: this.soloRules.mode, track: this.soloRules.track };
    this.round = 1;
    this.points = new Array(8).fill(0);
    this.shuffleBots(this.soloRules.difficulty ?? 1);
    this.startRace(true);
  }

  startPractice(gear) {
    if ((gear !== 'ski' && gear !== 'learner') || this.seatBusy() || (this.netMode && this.customRoom)) return;
    if (this.netMode) this.leavePublicQueue();
    this.session = { kind: 'practice', mode: 'speed', track: 'cedar', gear };
    this.startRace(this.trackDef !== CEDAR_PRACTICE);
  }

  startRank(id) {
    if (this.state !== 'menu' || this.seatBusy()) return;
    if (!this.profile.rankOpen()) {
      this.ui.toast(`排位赛 Lv.${RANK_LV} 开启`, true);
      return;
    }
    if (this.netMode) {
      const spec0 = RANK_MAP[id] || RANK_MAP.solo;
      const same = !this.customRoom && this.rankMode === spec0.id;
      if (!this.customRoom) this.leavePublicQueue();
      this.ui.racePick = 'rank';
      if (same || this.customRoom) {
        this.ui.renderTab('race');
        return;
      }
    }
    const spec = RANK_MAP[id] || RANK_MAP.solo;
    this.rankMode = spec.id;
    this.session = { kind: 'rank', mode: spec.rules.mode, rank: spec.id, track: 'random' };
    this.sfx.init();
    this.netMode = true;
    this.customRoom = false;
    this.matchPlayers = null;
    this.ui.rankMode = spec.id;
    this.ui.racePick = 'rank';
    this.ui.showMatch(false);
    this.ui.setQueue(true, `排位 · ${spec.name}`);
    this.ui.renderTab('race');
    this.net.match(this.playerName, this.look, spec.rules.mode, spec.queue);
  }

  nextRace() {
    const rank = this.session && this.session.kind === 'rank' ? this.session.rank : '';
    // 联机：打完一场接着匹配下一场；排位接着排同一项；自己开的房间回到同一批人的新房间
    if (this.netMode) {
      const room = this.customRoom ? this.roomId : 0;
      this.toMenu();
      if (rank) this.startRank(rank);
      else if (room) this.enterListed({ t: 'again', id: room });
      else this.startMatch();
      return;
    }
    const s = this.session;
    // 计时赛：同一条赛道接着刷成绩
    if (s.mode === 'tt' || s.kind === 'practice') {
      this.startRace(false);
      return;
    }
    if (this.rules.rounds > 1 && this.round < this.rules.rounds) {
      this.round++;
      this.startRace(true);
    } else {
      this.startTournament();
    }
  }

  restartRace() {
    if (this.netMode) return; // 联机比赛不能单方面重开
    this.startRace(false);
  }

  // 这一局的实际规则。排位的人数、道具和判胜由所选玩法定死。
  makeRules(s) {
    const base = this.soloRules;
    const r = { ...base, banned: base.banned.slice(), mode: s.mode || 'race' };
    if (s.kind === 'practice') Object.assign(r, { items: false, bots: 0, wildlife: false, rounds: 1 });
    const spec = s.kind === 'rank' ? RANK_MAP[s.rank] : null;
    if (spec) Object.assign(r, spec.rules, { rounds: 1, difficulty: 1, wildlife: true, banned: [], track: 'random', theme: 'random' });
    const m = r.mode;
    if (m === 'speed' || m === 'trick') r.items = false;
    if (m === 'brawl') Object.assign(r, { items: true, itemRate: 3 });
    if (m === 'tt') Object.assign(r, { items: false, bots: 0, wildlife: false });
    if (m === 'elim') r.bots = Math.max(r.bots, 3);
    if (m === 'team') r.bots = 7;
    if (spec) r.bots = Math.max(0, (spec.rules.seats || 6) - 1);
    if (m !== 'race' && m !== 'speed') r.rounds = 1;
    return r;
  }

  // 单机比赛：自己 + 机器人
  startRace(newCourse) {
    const s = this.session;
    this.rules = this.makeRules(s);
    const trackId = s.track;
    const practice = s.kind === 'practice';
    const def = practice ? CEDAR_PRACTICE : TRACK_MAP[trackId] || null;
    if (newCourse || def !== this.trackDef || (!def && this.course && this.course.def)) {
      newCourse = true;
      this.trackDef = def;
      if (!def) this.seed = (Math.random() * 1e9) | 0;
      this.themeKey = this.resolveTheme();
    }
    const botUp = uniformUp([0, 1, 2][this.rules.difficulty] ?? 1);
    const practiceLook = practice && { ...this.look, gear: s.gear, ski: s.gear === 'ski' ? 0x297da8 : 0xc44a31, trail: 0 };
    const roster = [];
    for (let i = 0; i < 1 + this.rules.bots; i++) {
      roster.push({
        name: i === 0 ? '你' : this.botNames[i - 1],
        look: practiceLook || (i === 0 ? this.look : this.botLooks[(i - 1) % 7]),
        bot: i > 0,
        up: practice ? null : i === 0 ? this.profile.up(this.look.gear) : botUp,
      });
    }
    this.beginRace(newCourse, roster, 0, this.state === 'menu');
  }

  // 一局里玩家自己的统计（结算奖励、挑战判定用）
  newReport() {
    return {
      hits: 0, hitsBy: {}, knocked: 0, knockedBy: {}, flips: 0, maxFlip: 0, spins: 0, maxSpin: 0, grabs: 0, maxGrab: 0,
      driftBoosts: 0, bigDrifts: 0, shortcuts: 0, pads: 0, maxSpeed: 0, maxAir: 0,
      skill: 0, chains: 0, bestChain: 0, bestMult: 0, breaks: 0,
    };
  }

  playerReport(rank, teamWin = false) {
    const p = this.player;
    return {
      ...this.rep,
      kind: this.session.kind === 'rank' ? 'rank' : this.net.active ? 'online' : this.session.kind,
      mode: this.mode.key,
      rankMode: this.session.kind === 'rank' ? this.session.rank : '',
      rank,
      field: this.racers.length,
      finished: p.finished,
      time: p.finished ? p.finishTime : this.raceTime,
      difficulty: this.rules.difficulty ?? 1,
      score: this.mode.score[p.idx] || 0,
      track: this.trackDef ? this.trackDef.id : '',
      length: this.trackDef ? this.trackDef.length : 0,
      teamWin,
      mateLeft: !!this.mateLeft,
      pb: !!this.ttPB,
      medal: this.ttMedal || 0,
    };
  }

  // 淘汰赛：出局
  eliminate(r) {
    r.out = true;
    r.outAt = this.raceTime;
    r.weapon = null;
    r.skier.setProp(null);
    r.boostT = 0;
    r.hookT = 0;
    r.drifting = false;
    r.chain.reset();
    if (this.nearCamera(r.pos, 220)) {
      this.fx.snowBurst(r.pos, 20, 10);
      this.fx.ring(r.pos, 5, 0xff4a50, 0.45);
      this.sfxAt('pop', r.pos, 1);
    }
    r.skier.group.visible = false;
    r.trail.reset();
    const tag = r.isPlayer ? `<b>${esc(r.name)}</b>` : `<span>${esc(r.name)}</span>`;
    this.ui.feed(`💀 ${tag} 落在最后，被淘汰出局`);
    if (r.isPlayer) {
      this.updateOrder();
      this.camRacer = this.order.find((o) => !o.out) || null;
      this.state = 'finished';
      this.finishedT = 0;
      this.ui.banner('你被淘汰了！', 'bad', 3);
      this.sfx.musicStop(1.5);
    } else if (this.player && !this.player.out && !this.player.finished) {
      this.ui.banner(`💀 ${r.name} 出局`, 'gold', 1.3);
    }
  }

  // roster：按发车位排好的选手名单 [{ name, look, bot, id }]；me：自己是第几个
  beginRace(newCourse, roster, me, fromLobby = false) {
    this.sfx.init();
    this.sfx.menuStop(0.4);
    this.ui.showMenu(false);
    this.ui.showMatch(false);
    this.ui.setQueue(false);
    this.ui.hideResults();
    this.ui.showPause(false);
    this.paused = false;
    this.disposeLobby();
    this.syncShow(false);
    if (newCourse) this.buildWorld();
    else this.clearRace();
    this.sfx.prepareMusic(this.course.def?.id, this.themeKey, this.seed);
    this.sfx.musicDuck(false);
    const online = this.net.active;
    this.mode = makeMode(MODES[this.rules.mode] ? this.rules.mode : 'race', this);
    const xs = [-2.2, 2.2, -6.6, 6.6];
    for (let i = 0; i < roster.length; i++) {
      const e = roster[i];
      const mine = i === me;
      // 联机时本机只负责模拟自己；房主另外负责所有机器人
      const owned = !online || mine || (!!e.bot && this.net.isHost);
      const up = e.up || (mine ? this.profile.up(e.look.gear || 'ski') : null);
      const fair = !!this.session && this.session.kind === 'rank';
      const r = new Racer(this, i, e.look, e.name, mine, { bot: !!e.bot, owned, id: e.id || 0, up, fair, team: this.mode.teamOf(i) });
      r.scDone = new Set();
      const row = Math.floor(i / 4);
      r.place(xs[i % 4], 3 + row * 4.6, 0);
      this.racers.push(r);
    }
    this.player = this.racers[me];
    if (!this.course.def?.practice) this.replay.begin(this.racers);
    this.itemRespawn = this.mode.itemRespawn;
    this.items = this.rules.items ? new Items(this) : NO_ITEMS;
    this.hazards = this.course.def?.practice ? NO_HAZARDS : new Hazards(this);
    this.rep = this.newReport();
    this.rewarded = false;
    this.mateLeft = false;
    this.netDropped = false;
    this.quitArmed = false;
    this.netReward = null;
    this.ttPB = false;
    this.ttMedal = 0;
    this.mode.setup();
    if (this.mode.key === 'tt') {
      const L = this.course.L;
      this.ghostKey = this.trackDef ? this.trackDef.id : `r${this.seed}_${L}`;
      this.ghostData = loadGhost(this.ghostKey);
      this.ghost = this.ghostData ? new GhostRunner(this.scene, this.ghostData) : null;
      this.ghostRec = new GhostRecorder();
    }
    if (this.rules.wildlife) {
      this.course.deerSpots.forEach((s, i) => {
        const deer = new Deer(this, s, i);
        this.deers.push(deer);
        this.entities.push(deer);
      });
    }
    this.paceD = null;
    this.resT = 0;
    this.state = 'countdown';
    this.countT = 3.9;
    this.lastCount = '';
    this.upAt = -1;
    this.upTap = false;
    this.startWin = 0;
    this.nitroQ = false;
    this.raceTime = 0;
    this.finishCount = 0;
    this.finishedT = 0;
    this.playerHits = 0;
    this.steer = 0;
    this.jumpQ = false;
    this.fireQ = false;
    this.spaceFlip = false;
    this.camYaw = 0;
    this.camLead = 0;
    this.camPitch = 0;
    this.orbit = 0;
    this.updateOrder();
    this.ui.resetHud();
    if (fromLobby) {
      this.buildLobby([roster[me].look, ...roster.filter((_, i) => i !== me).map((r) => r.look)], false);
      this.departure = new Departure(this);
      this.ui.showHud(false);
      this.ui.showDeparture(true);
      this.departure.update(0);
    } else {
      this.showStartGrid();
    }
  }

  showStartGrid() {
    for (const r of this.racers) r.update(0);
    this.ui.showHud(true);
    const p = this.player;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(p.pos.x, p.pos.y + 2.85, p.pos.z + 5.4);
    this.updateCamera(1, true);
  }

  clearDeparture() {
    if (!this.departure) return;
    this.departure = null;
    this.disposeLobby();
    this.ui.showDeparture(false);
  }

  finishDeparture() {
    if (!this.departure) return;
    this.clearDeparture();
    this.showStartGrid();
    if (this.waitGo && this.net.active) this.readyAtGrid();
  }

  setPaused(b) {
    if (this.departure || !['countdown', 'race', 'finished'].includes(this.state)) return;
    // 联机时只是打开菜单，比赛照常进行（见 frame）
    const online = this.net.active;
    this.paused = b;
    this.quitArmed = false;
    this.ui.showPause(b, online || this.netDropped, online || this.netDropped ? this.quitNote() : '');
    this.sfx.musicDuck(b && !online);
    if (b && !online) this.sfx.silenceRide();
  }

  // 告诉服务器这页还开着。在线人数决定匹配等多久再补机器人。
  beatPresence() {
    let id = '';
    try {
      id = sessionStorage.getItem('huaxue_pid') || '';
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('huaxue_pid', id);
      }
    } catch {
      id = 'local';
    }
    const beat = () => {
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
        .then((r) => r.json())
        .then((d) => this.ui.setOnline(d))
        .catch(() => {});
    };
    beat();
    setInterval(beat, 8000);
  }

  // ---------- 联机匹配 ----------
  get playerName() {
    return this.profile.data.name;
  }

  // 返回是否是合法昵称
  setName(name) {
    const n = cleanNick(name);
    if (!n) return false;
    if (n !== this.profile.data.name) {
      this.profile.data.name = n;
      this.profile.save();
    }
    return true;
  }

  startMatch() {
    if (this.state !== 'menu' || this.seatBusy()) return;
    if (this.netMode) {
      if (!this.customRoom) this.leavePublicQueue();
      return;
    }
    // 按首页玩法卡选的玩法分开匹配；计时赛是一个人滑，直接开
    const mode = this.soloRules.mode;
    if (mode === 'tt') {
      this.startTournament();
      return;
    }
    this.session = { kind: 'online', mode, track: this.soloRules.track };
    this.rankMode = '';
    this.sfx.init();
    this.netMode = true;
    this.customRoom = false;
    this.matchPlayers = null;
    this.ui.showMatch(false);
    this.ui.setQueue(true, MODES[mode].name);
    this.net.match(this.playerName, this.look, mode);
  }

  // 匹配排队可以去逛其他界面；再点一次开始比赛、首页按 Esc、点提示条上的取消，或者开了别的比赛 / 房间才退出队列
  leavePublicQueue() {
    if (!this.netMode || this.customRoom) return;
    this.net.leave();
    this.netMode = false;
    this.matchPlayers = null;
    this.ui.setQueue(false);
    if (this.state === 'menu') this.buildLobby();
  }

  cancelMatch() {
    if (this.customRoom && this.state === 'menu') {
      this.customRoom = false;
      this.netMode = false;
      this.matchPlayers = null;
      this.net.phase = 'watch';
      this.net.sendJson({ t: 'leave' });
      this.net.sendJson({ t: 'watch' });
      this.ui.showMatch(false);
      this.ui.showMenu(true);
      this.ui.racePick = 'hall';
      this.ui.renderTab('race');
      return;
    }
    if (this.state === 'menu') {
      this.leavePublicQueue();
      return;
    }
    this.toMenu();
  }

  startMatchNow() {
    this.net.sendJson({ t: 'startnow' });
  }

  // 房间列表。只连上看列表，不进匹配队列。
  openHall() {
    if (this.state !== 'menu' || this.seatBusy()) return;
    if (this.netMode && !this.customRoom) {
      this.leavePublicQueue();
      this.ui.toast('已取消匹配');
    }
    if (this.netMode) return;
    this.customRoom = false;
    this.ui.racePick = 'hall';
    this.ui.fromRoom = false;
    this.ui.renderTab('race');
    this.net.watch();
  }

  listedRules() {
    const r = this.soloRules;
    return { mode: r.mode, track: r.track, theme: r.theme, length: r.length, difficulty: r.difficulty, seats: r.seats || 8 };
  }

  enterListed(msg) {
    if (this.state !== 'menu' || this.seatBusy()) return;
    this.sfx.init();
    this.netMode = true;
    this.customRoom = true;
    this.matchPlayers = null;
    this.ui.showMenu(false);
    this.ui.showMatch(true);
    this.ui.setMatch({ status: '正在进入房间…', kind: 'room' });
    this.net.enter({ ...msg, name: this.playerName, look: this.look });
  }

  createListedRoom() {
    if (this.soloRules.mode === 'tt') {
      this.ui.toast('计时赛是一个人滑，换个玩法再开房', true);
      return;
    }
    this.enterListed({ t: 'create', rules: this.listedRules() });
  }

  joinListed(id) {
    this.enterListed({ t: 'join', id });
  }

  // 打开的是邀请链接（?room=房间号）：直接进那个房间
  joinInvite() {
    if (this.mini) {
      if (!this.mini.online || this.state !== 'menu' || this.netMode) return;
      const id = this.mini.takeInvite();
      if (id) this.joinListed(id);
      return;
    }
    const url = new URL(location.href);
    const id = parseInt(url.searchParams.get('room') || '', 10);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (!(id > 0) || this.state !== 'menu' || this.netMode) return;
    this.joinListed(id);
  }

  quickListed() {
    const mode = this.ui.hallMode && this.ui.hallMode !== 'all' ? this.ui.hallMode : '';
    this.enterListed({ t: 'quickroom', mode });
  }

  onNetLobby(m) {
    this.ui.hallRooms = Array.isArray(m.rooms) ? m.rooms : [];
    if (m.error) this.ui.toast(m.error, true);
    if (m.error && this.customRoom && !this.matchPlayers) {
      this.customRoom = false;
      this.netMode = false;
      this.net.phase = 'watch';
      this.ui.showMatch(false);
      this.ui.showMenu(true);
      this.ui.racePick = 'hall';
    }
    if (this.ui.tab === 'race' && this.ui.racePick === 'hall') this.ui.renderTab('race');
  }

  // 房间里的人变了 / 倒计时变了
  onNetRoom(m) {
    if (!this.netMode || this.state !== 'menu' || !Array.isArray(m.players)) return;
    this.matchPlayers = m.players;
    this.matchEnd = performance.now() + (Number(m.left) || 0);
    this.buildLobby();
    if (!this.customRoom) {
      this.ui.tickQueue();
      return;
    }
    this.roomId = m.id | 0;
    this.ui.setMatch({ players: m.players, me: this.net.id, host: m.host === this.net.id, max: m.max, reason: m.reason || 'fill', id: m.id | 0 });
  }

  // 服务器宣布开赛：所有人用同一个种子生成同一条赛道
  onNetStart(m) {
    if (!this.netMode) return;
    this.matchPlayers = null;
    this.netRaceSetup(m);
    this.beginRace(true, m.roster, m.you | 0, true);
    if (m.key) save(LS_SEAT, { key: m.key, at: Date.now(), beat: Date.now(), tab: this.tabId });
    if (this.session.kind === 'rank') {
      // 先记一笔「排位进行中」并马上存到服务器，中途关网页的话下次打开按逃跑补扣
      this.profile.rankBegin(this.session.rank);
      this.account.flush();
    }
    // 各人机器快慢不一样，等所有人都加载完再一起倒计时
    this.waitGo = true;
    if (!this.departure) this.readyAtGrid();
  }

  readyAtGrid() {
    this.ui.tip('等待其他玩家加载赛道…', 20);
    this.net.sendJson({ t: 'ready' });
  }

  // 按服务器给的开赛信息定好这一局的规则、赛道和场景
  netRaceSetup(m) {
    const mode = MODES[m.rules && m.rules.mode] ? m.rules.mode : 'race';
    if (m.rules && m.rules.rank && RANK_MAP[m.rules.rank]) {
      this.session = { kind: 'rank', mode, rank: m.rules.rank, track: m.track || 'random' };
      this.rankMode = m.rules.rank;
    } else {
      this.session = { kind: 'online', mode, track: m.track || 'random' };
      this.rankMode = '';
    }
    this.rules = { ...this.soloRules, ...m.rules, rounds: 1, mode, track: m.track || 'random', banned: Array.isArray(m.rules && m.rules.banned) ? m.rules.banned : [] };
    if (!LENGTHS[this.rules.length]) this.rules.length = 'medium';
    const fixed = m.track && TRACK_MAP[m.track];
    if (fixed) {
      this.trackDef = fixed;
      this.seed = fixed.seed;
      this.themeKey = fixed.theme;
    } else {
      this.trackDef = null;
      this.seed = m.seed | 0;
      this.themeKey = THEMES[m.theme] ? m.theme : 'day';
    }
    this.round = 1;
  }

  onNetGo() {
    if (!this.waitGo) return;
    this.waitGo = false;
    this.finishDeparture();
    this.countT = 3.9;
    this.lastCount = '';
    this.upAt = -1;
    this.upTap = false;
    this.ui.tip('准备！', 0.8);
  }

  // 比赛中有人走了：他的角色交给机器人，机器人统一由（新）房主负责
  onNetLeave(id, hostChanged) {
    if (!this.racers.length) return;
    const gone = this.racers.find((r) => r.netId === id);
    if (gone && !gone.isBot) {
      if (this.session.kind === 'rank' && this.mode.key === 'team' && this.player && gone.team === this.player.team) this.mateLeft = true;
      gone.isBot = true;
      gone.netId = 0;
      this.ui.feed(`<span>${esc(gone.name)}</span> 离开了比赛，由机器人接管`);
    }
    const host = this.net.isHost;
    for (const r of this.racers) {
      if (r === this.player || !r.isBot) continue;
      if (host) r.takeOver(true);
      else if (hostChanged || r === gone) r.netReset(); // 发送方换人了，旧的时间戳作废
    }
  }

  // 断线
  onNetLost(was) {
    if (this.rejoining && (was === 'connecting' || was === 'queue')) return this.onRejoinLost();
    if (was === 'watch' && !this.netMode) {
      this.ui.toast('房间列表断开了', true);
      return;
    }
    if (!this.netMode) return;
    if (this.state === 'menu' && !this.customRoom) {
      this.netMode = false;
      this.matchPlayers = null;
      this.ui.setQueue(false);
      this.buildLobby();
      this.ui.toast(was === 'connecting' ? '连接不上匹配服务器，请确认服务器已启动' : '匹配断开了', true);
      return;
    }
    if (this.state === 'menu') {
      this.matchPlayers = null;
      this.buildLobby();
      this.ui.setMatch({ status: was === 'connecting' ? '连接不上匹配服务器，请确认服务器已启动' : '与服务器的连接断开了', error: true });
      return;
    }
    // 比赛中断线：其他选手先交给本机的机器人接着跑，同时在后台重连。
    // 连回来了照常算成绩；一直连不回来，本局不计成绩，排位按输算、不额外扣
    this.waitGo = false;
    for (const r of this.racers) if (r !== this.player) r.takeOver(true);
    // 自己已经冲线 / 出局了：照常结算
    if (this.state === 'finished' && !this.rewarded) this.showResults();
    if (this.rewarded) {
      this.ui.banner('网络断开', 'bad', 2);
      return;
    }
    this.netDropped = true;
    const seat = this.loadSeat();
    if (seat) {
      this.ui.banner('网络断开，正在重连…', 'bad', 3);
      this.startRejoin(seat.key, true);
    } else this.ui.banner('网络断开，本局不计成绩', 'bad', 3);
  }

  // 联机比赛里点「退出比赛」。还没结算就走算逃跑：要点两下确认，普通匹配没奖励，排位按输再额外扣分。
  // 掉线重连期间点退出：放弃这一局，按掉线算（排位按输，不额外扣）
  quitRace() {
    // 自己已经冲线 / 出局，只是结算面板还没弹出来：照常结算
    if (this.net.active && this.state === 'finished' && !this.rewarded) this.showResults();
    if (!(this.net.active || this.netDropped) || this.rewarded) return this.toMenu();
    if (!this.quitArmed) {
      this.quitArmed = true;
      this.ui.armQuit();
      return;
    }
    this.rewarded = true;
    this.stopRejoin();
    this.dropSeat();
    const dropped = this.netDropped;
    const s = this.profile.rankLeave(!dropped);
    this.toMenu();
    if (s) {
      this.ui.refreshProfile();
      this.ui.toast(dropped ? `排位按输 ${s.delta || '不扣分'}` : `中途退出排位，按逃跑扣 ${-s.delta} 分`, true);
    }
  }

  // 联机比赛里打开菜单时的说明：现在退出会怎样
  quitNote() {
    if (this.netDropped && !this.rewarded) return `网络断开，正在重连。现在退出本局不计成绩${this.session.kind === 'rank' ? '，排位按输' : ''}。`;
    const head = '联机比赛不会暂停，其他人还在跑。';
    if (!this.net.active || this.rewarded || this.state === 'finished') return head;
    const p = this.profile.data.rank && this.profile.data.rank.pending;
    if (this.session.kind === 'rank' && p) {
      const s = scoreLeave(this.profile.rankState(), p.mode, true);
      return `${head}现在退出算逃跑：排位按输，再额外扣 ${ESCAPE_EXTRA} 分，共扣 ${s ? -s.delta : 0} 分。你的角色由机器人跑完。`;
    }
    return `${head}现在退出：你的角色由机器人跑完，这一局没有奖励。`;
  }

  // 上次排位没打完就关掉了网页、也没能连回去：按逃跑补扣。正在打 / 正在连回去的那一场不算
  checkRankLeave() {
    if (this.rejoining || this.loadSeat()) return;
    if (this.session && this.session.kind === 'rank' && this.state !== 'menu' && !this.rewarded) return;
    const s = this.profile.rankLeave(true);
    if (!s) return;
    this.ui.refreshProfile();
    this.ui.toast(`上一场排位中途离开，按逃跑扣 ${-s.delta} 分`, true);
  }

  // ---------- 掉线重连 ----------
  loadSeat() {
    const s = load(LS_SEAT);
    return typeof s.key === 'string' && s.key && Date.now() - (s.at || 0) < SEAT_MS ? s : null;
  }

  dropSeat() {
    try {
      localStorage.removeItem(LS_SEAT);
    } catch {
      /* 忽略 */
    }
  }

  // 打开网页时：上一局联机比赛还没打完（刷新 / 关掉过网页），直接连回去。
  // 另一个标签页正在打这一局（它每隔几秒会更新 beat）就不去抢
  resumeSeat() {
    const s = this.loadSeat();
    if (s && this.state === 'menu' && (s.tab === this.tabId || Date.now() - (s.beat || 0) > 6000)) this.startRejoin(s.key, false);
    else this.checkRankLeave();
  }

  // 上一场联机比赛还没结束：先回去，不能开新的
  seatBusy() {
    const s = this.rejoining ? null : this.loadSeat();
    if (!this.rejoining && !s) return false;
    this.ui.toast('上一场比赛还没结束', true);
    if (s && this.state === 'menu' && (s.tab === this.tabId || Date.now() - (s.beat || 0) > 6000)) this.startRejoin(s.key, false);
    return true;
  }

  // live：比赛画面还在、只是连接断了（本机先接着跑）；否则是重新打开网页后回去
  startRejoin(key, live) {
    clearTimeout(this.rejoinTimer);
    this.rejoining = { key, live, until: Date.now() + (live ? 60000 : 10000) };
    this.net.rejoin(key);
  }

  // 这次没连上：比赛还在、也没超时，过一会儿再试
  onRejoinLost() {
    const j = this.rejoining;
    const still = j && (j.live ? this.netDropped && !this.rewarded && this.state !== 'menu' : this.state === 'menu');
    if (still && Date.now() < j.until) {
      clearTimeout(this.rejoinTimer);
      this.rejoinTimer = setTimeout(() => this.rejoining === j && this.net.rejoin(j.key), 2000);
      return;
    }
    this.rejoinFailed();
  }

  stopRejoin() {
    clearTimeout(this.rejoinTimer);
    if (this.rejoining) this.net.leave();
    this.rejoining = null;
  }

  // 回不去了：比赛已经结束 / 位子过期 / 一直连不上
  rejoinFailed() {
    const j = this.rejoining;
    this.stopRejoin();
    this.dropSeat();
    if (!j) return;
    if (j.live) {
      if (this.netDropped && !this.rewarded && this.state !== 'menu') this.ui.banner('重连失败，本局不计成绩', 'bad', 3);
      return;
    }
    this.netMode = false;
    this.ui.toast('回不到上一场比赛了', true);
    this.checkRankLeave();
  }

  // 服务器的答复：m 为 null 表示位子已经没了
  onNetRejoin(m) {
    const j = this.rejoining;
    if (!j) {
      this.net.leave();
      return;
    }
    if (!m) return this.rejoinFailed();
    clearTimeout(this.rejoinTimer);
    this.rejoining = null;
    // 自己那个角色在别人那边已经由机器人跑完了（或者被淘汰了）：这一局回不去了，按掉线算
    const mine = m.snap && Array.isArray(m.snap.r) ? m.snap.r[m.you] : null;
    if (mine && (mine[7] > 0 || mine[8] >= 0)) {
      this.net.leave();
      this.dropSeat();
      if (j.live) {
        if (!this.rewarded) this.ui.banner('比赛已经结束，本局不计成绩', 'bad', 3);
        return;
      }
      this.netMode = false;
      const s = this.profile.rankLeave(false);
      if (s) this.ui.refreshProfile();
      this.ui.toast(`上一场比赛已经结束，本局不计成绩${s ? ` · 排位按输 ${s.delta || '不扣分'}` : ''}`, true);
      return;
    }
    const at = (this.loadSeat() || {}).at || Date.now();
    save(LS_SEAT, { key: m.key, at, beat: Date.now(), tab: this.tabId });
    if (j.live) this.rejoinLive(m);
    else this.rejoinRebuild(m);
  }

  // 本机一直在跑、只是断了一会儿：别人的角色交还给网络，自己的位置以本机为准
  rejoinLive(m) {
    this.netDropped = false;
    const humans = new Set(m.humans || []);
    const host = this.net.isHost;
    for (const r of this.racers) {
      if (r === this.player) continue;
      if (r.netId && humans.has(r.netId)) r.release(false);
      else if (host) r.takeOver(true);
      else r.release(true);
    }
    if (m.state === 'loading') this.net.sendJson({ t: 'ready' });
    else if (humans.size) this.applySnap(m.snap, false);
    this.net.sendJson({ t: 'back' });
    this.ui.banner('已重新连接', 'gold', 2);
  }

  // 重新打开网页后回来：照开赛信息重建这一局，再按比赛现状把每个人放回去
  rejoinRebuild(m) {
    this.sfx.init();
    this.netMode = true;
    this.customRoom = false;
    this.matchPlayers = null;
    this.netRaceSetup(m);
    const humans = new Set(m.humans || []);
    // 已经走掉的真人，现在由房主的机器人在跑
    const roster = m.roster.map((e) => (e.bot || e.idx === m.you || humans.has(e.id) ? e : { ...e, bot: true }));
    this.beginRace(true, roster, m.you | 0);
    if (m.state === 'loading') {
      this.waitGo = true;
      this.ui.tip('等待其他玩家加载赛道…', 20);
      this.net.sendJson({ t: 'ready' });
      return;
    }
    const s = m.snap;
    this.applySnap(s, true);
    // 没有别人时，大家停在你离开的那一刻；有别人时，比赛一直在走
    this.raceTime = s && Number.isFinite(s.t) ? s.t + (humans.size ? (m.age || 0) / 1000 : 0) : 0;
    this.state = 'race';
    this.countT = 0;
    this.goT = 0;
    this.ui.setCount('');
    this.sfx.musicStart();
    const p = this.player;
    if (humans.size) {
      // 别人那边一直有机器人替你跑：等房主发来它跑到的位置再接手
      this.rejoinSync = 1.5;
      p.state = 'ready';
    } else this.net.sendJson({ t: 'back' });
    this.camera.position.set(p.pos.x, p.pos.y + 3.2, p.pos.z + 8);
    this.ui.banner('已回到比赛', 'gold', 2);
  }

  // 刚连回来：照房主那边替自己跑的机器人的位置接上（s 为 null 是等太久了，就用快照里的位置）
  syncSelf(s) {
    this.rejoinSync = 0;
    const p = this.player;
    if (s) {
      p.pos.set(s.x, s.y, s.z);
      p.vel.set(s.vx, s.vy, s.vz);
      p.yaw = s.yaw;
      p.d = -p.pos.z;
      p.grounded = s.grounded;
      p.trail.reset();
    }
    p.state = 'ski';
    this.camera.position.set(p.pos.x, p.pos.y + 3.2, p.pos.z + 8);
    this.net.sendJson({ t: 'back' });
  }

  // 掉线的人连回来了：他的角色从机器人手里交还给他
  onNetBack(m) {
    const r = this.racers[m.idx];
    if (!r || r.isPlayer) return;
    r.netId = m.id;
    r.release(false);
  }

  // 比赛现状：房主每秒传给服务器一份，掉线的人连回来时照着它把各人放回去
  raceSnap() {
    const f = (v) => Math.round(v * 100) / 100;
    return {
      t: f(this.raceTime),
      fn: this.mode.finishN || 0,
      nx: Number.isFinite(this.mode.next) ? this.mode.next : null,
      sc: this.mode.score.slice(),
      r: this.racers.map((r) => [f(r.pos.x), f(r.pos.y), f(r.pos.z), f(r.vel.x), f(r.vel.y), f(r.vel.z), f(r.yaw), r.finished ? f(r.finishTime) : 0, r.out ? f(r.outAt) : -1]),
    };
  }

  // full：重建的这一局，位置、得分一起放回去；否则只补上断线期间错过的冲线和出局
  applySnap(s, full) {
    if (!s || !Array.isArray(s.r)) return;
    const num = (v) => (Number.isFinite(v) ? v : 0);
    s.r.forEach((a, i) => {
      const r = this.racers[i];
      if (!r || !Array.isArray(a)) return;
      if (full) {
        r.pos.set(num(a[0]), num(a[1]), num(a[2]));
        r.vel.set(num(a[3]), num(a[4]), num(a[5]));
        r.yaw = num(a[6]);
        r.d = -r.pos.z;
        r.state = 'ski';
        r.trail.reset();
      }
      if (r.isPlayer) return;
      const ft = num(a[7]);
      if (ft > 0 && !r.finished) {
        r.finished = true;
        r.finishTime = ft;
        r.weapon = null;
        r.skier.setProp(null);
      } else if (!(ft > 0) && r.finished) {
        r.finished = false;
        r.finishTime = 0;
      }
      if (num(a[8]) >= 0 && !r.out) {
        r.out = true;
        r.outAt = a[8];
        r.weapon = null;
        r.skier.setProp(null);
        r.skier.group.visible = false;
      }
    });
    if (full && Array.isArray(s.sc)) s.sc.forEach((v, i) => i < this.mode.score.length && Number.isFinite(v) && (this.mode.score[i] = v));
    if (full && Number.isFinite(s.fn)) this.mode.finishN = s.fn;
    if (Number.isFinite(s.nx) && Number.isFinite(this.mode.next)) this.mode.next = Math.max(this.mode.next, s.nx);
    this.finishCount = this.racers.filter((r) => r.finished).length;
    this.updateOrder();
  }

  // 其他玩家发来的比赛事件
  onNetEv(m) {
    const R = this.racers;
    if (!R.length) return;
    switch (m.k) {
      case 'fire':
        this.weapons.replicate(m);
        break;
      case 'kn': {
        const victim = R[m.v];
        if (victim && !victim.owned) this.onKnock(victim, R[m.s] || null, String(m.c || '').slice(0, 12), !!m.f, true);
        break;
      }
      case 'pick':
        this.items.take(m.s | 0);
        break;
      case 'evade': {
        const r = R[m.i];
        if (r && !r.owned) this.weapons.evade(r, true);
        break;
      }
      case 'emo':
        this.emotes.remote(m);
        break;
      case 'fin': {
        const r = R[m.i];
        if (r && !r.owned && !r.finished && Number.isFinite(m.ft) && m.ft > 0) this.finishRacer(r, m.ft);
        break;
      }
      case 'deer': {
        const deer = this.deers[m.i];
        if (deer && !this.net.isHost) deer.charge(m.s > 0 ? 1 : -1);
        break;
      }
    }
  }

  updateOrder() {
    this.order = this.racers.slice().sort((a, b) => {
      // 淘汰赛：出局的排在最后，越晚出局名次越靠前
      if (a.out || b.out) return a.out && b.out ? b.outAt - a.outAt : a.out ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.d - a.d;
    });
    for (let i = 0; i < this.order.length; i++) this.order[i].rank = i + 1;
  }

  // 联机结算：自己冲线后就显示，其他人陆续冲线时名单跟着刷新
  showNetResults() {
    const p = this.player;
    const rows = this.order.map((r, i) => ({ rank: i + 1, name: r.name, me: r.isPlayer, idx: r.idx, look: r.look, time: r.finished ? fmtTime(r.finishTime) : '比赛中…' }));
    const racing = this.racers.some((r) => !r.finished);
    // 奖励只结算一次（名单还会刷新好几回）
    if (!this.rewarded) {
      this.rewarded = true;
      this.dropSeat();
      let teamWin = false;
      if (this.mode.key === 'team' && this.player) teamWin = this.mode.winner(this.order) === this.player.team;
      this.netReward = this.profile.applyRace(this.playerReport(p.rank, teamWin));
      this.ui.refreshProfile();
    }
    const rankSpec = this.session.kind === 'rank' ? RANK_MAP[this.session.rank] : null;
    let title = `第 ${p.rank} 名${p.rank === 1 ? ' 🏆' : ''}`;
    if (rankSpec) {
      const teamWin = this.mode.key === 'team' && this.mode.winner(this.order) === p.team;
      const won = this.mode.key === 'team' ? teamWin : p.finished && p.rank <= 3;
      title = `${won ? '胜利' : '失败'} · ${rankSpec.name}`;
    }
    this.ui.showResults({
      title,
      sub: `${rankSpec ? rankSpec.name + ' · ' : '联机 · '}${this.theme.name} · 用时 ${fmtTime(p.finishTime)} · 你击中对手 ${this.playerHits} 次，被击飞 ${p.hits} 次${racing ? ' · 还有人没冲线' : ''}`,
      rows,
      nextLabel: rankSpec ? '继续排位 ▶' : this.customRoom && this.roomId ? '再来一局 ▶' : '继续匹配 ▶',
      reward: this.netReward,
      awards: this.resultAwards(false),
    });
  }

  // 结算「本局之最」：每项挑这局最突出的一个人，数值太小的不发。
  // 技巧分和时速只有自己机器上跑的人才准，联机时不评
  resultAwards(local) {
    const out = [];
    if (this.racers.length < 2) return out;
    const top = (key, min) => {
      let best = null;
      for (const r of this.racers) if (r[key] >= min && (!best || r[key] > best[key])) best = r;
      return best;
    };
    const add = (icon, name, r, val) => r && out.push({ icon, name, who: r.name, me: r.isPlayer, idx: r.idx, val });
    const k = top('knocks', 1);
    add('💥', '击飞王', k, k && `击飞 ${k.knocks} 次`);
    if (local) {
      const s = top('skillPts', 1);
      add('✨', '技巧王', s, s && `技巧 ${s.skillPts.toLocaleString()} 分`);
      const v = top('topSpeed', 1);
      add('🚀', '极速王', v, v && `${v.topSpeed} km/h`);
    }
    const d = top('downs', 2);
    add('🎯', '人肉沙包', d, d && `被击飞 ${d.downs} 次`);
    return out;
  }

  showResults() {
    this.clearImpact();
    this.state = 'results';
    this.updateOrder();
    if (this.net.active) {
      this.resT = 0.5;
      this.showNetResults();
      return;
    }
    const s = this.session;
    const mode = this.mode;
    const p = this.player;
    const stand = mode.standings(this.order);
    const myRank = stand.indexOf(p) + 1;
    const multi = s.kind === 'quick' && this.rules.rounds > 1;
    const pointsMode = multi;
    const last = multi && this.round >= this.rules.rounds;
    const timeOf = (r) => (r.finished ? fmtTime(r.finishTime) : r.out ? '淘汰' : '未完赛');
    let rows = stand.map((r, i) => {
      const row = { rank: i + 1, name: r.name, me: r.isPlayer, idx: r.idx, look: r.look, time: timeOf(r), team: r.team };
      const col = mode.resultCol(r);
      if (col !== undefined) row.pts = col;
      if (pointsMode) {
        const pts = POINTS[i] || 0;
        this.points[r.idx] += pts;
        row.pts = `+${pts}（共 ${this.points[r.idx]}）`;
      }
      return row;
    });
    const where = this.trackDef ? this.trackDef.name : this.theme.name;
    const how = p.finished ? `用时 ${fmtTime(p.finishTime)}` : p.out ? '被淘汰' : '未完赛';
    let title = `第 ${myRank} 名${myRank === 1 ? ' 🏆' : ''}`;
    let sub = `${mode.def.name} · ${where} · ${how} · 击中对手 ${this.rep.hits} 次，被击飞 ${this.rep.knocked} 次`;
    let teamWin = false;
    if (mode.key === 'team') {
      const pts = mode.points(this.order);
      const w = mode.winner(this.order);
      teamWin = w === p.team;
      title = `${TEAM_NAMES[w]}获胜！${teamWin ? ' 🏆' : ''}`;
      sub = `红队 ${pts[0]} : ${pts[1]} 蓝队 · 你第 ${myRank} 个冲线 · ${where}`;
    } else if (mode.scored) {
      sub = `${mode.def.name} · ${where} · 你的得分 ${mode.score[p.idx]} · ${how}`;
    }
    if (multi) sub = `锦标赛 第 ${this.round} / ${this.rules.rounds} 轮 · ` + sub;
    const extra = [];
    let nextLabel = '再来一局 ▶';
    const rankSpec = s.kind === 'rank' ? RANK_MAP[s.rank] : null;
    if (rankSpec) {
      const won = mode.key === 'team' ? teamWin : p.finished && myRank <= 3;
      title = `${this.netDropped ? '掉线' : won ? '胜利' : '失败'} · ${rankSpec.name}`;
      if (mode.key !== 'team') title += ` · 第 ${myRank} 名`;
      nextLabel = '继续排位 ▶';
    }
    if (last) {
      const tot = this.racers.slice().sort((a, b) => this.points[b.idx] - this.points[a.idx]);
      const mr = tot.indexOf(p) + 1;
      rows = tot.map((r, i) => ({ rank: i + 1, name: r.name, me: r.isPlayer, idx: r.idx, look: r.look, time: '', pts: `${this.points[r.idx]} 分` }));
      title = `锦标赛总排名 第 ${mr} 名${mr === 1 ? ' 🏆' : ''}`;
      sub = `冠军：${tot[0].name}（${this.points[tot[0].idx]} 分）`;
      nextLabel = '再来一届 ▶';
    } else if (multi) nextLabel = '下一轮 ▶';

    if (mode.key === 'tt' && p.finished) {
      const t = p.finishTime;
      const key = this.ghostKey;
      const fixed = !!this.trackDef;
      const prev = this.ghostData ? this.ghostData.time : fixed ? this.profile.data.best[key] : null;
      this.ttPB = !prev || t < prev;
      this.ttMedal = mode.medalOf(t);
      if (this.ttPB) saveGhost(key, Math.round(t * 100) / 100, { ...this.look }, this.ghostRec.frames);
      if (fixed) {
        this.profile.recordBest(key, t);
        this.profile.recordMedal(key, this.ttMedal);
      }
      const M = ['', '🥉 铜牌', '🥈 银牌', '🥇 金牌'];
      title = this.ttMedal ? `${M[this.ttMedal]}！` : '完成计时赛';
      if (this.ttPB && prev) title += ' 刷新纪录';
      sub = `${where} · 用时 ${fmtTime(t)}${prev ? ` · 之前最好 ${fmtTime(prev)}` : ''}`;
      const [au, ag, cu] = mode.medals;
      rows = [
        { rank: '你', name: '本次成绩', me: true, time: fmtTime(t) },
        ...(prev ? [{ rank: '👻', name: '幽灵（之前最好）', time: fmtTime(prev) }] : []),
        { rank: '🥇', name: '金牌线', time: fmtTime(au) },
        { rank: '🥈', name: '银牌线', time: fmtTime(ag) },
        { rank: '🥉', name: '铜牌线', time: fmtTime(cu) },
      ];
      nextLabel = '再跑一趟 ▶';
    }

    let reward = null;
    if (!this.rewarded && this.netDropped) {
      // 掉线后一直没连回来，自己跑完了：不计成绩，排位按输
      this.rewarded = true;
      this.stopRejoin();
      this.dropSeat();
      const r = this.profile.rankLeave(false);
      if (r) this.ui.refreshProfile();
      sub = `网络断开，本局不计成绩${r ? ` · 排位按输 ${r.delta || '不扣分'}` : ''} · ${sub}`;
    } else if (!this.rewarded) {
      this.rewarded = true;
      this.dropSeat();
      const rep = this.playerReport(myRank, teamWin);
      rep.extra = extra;
      reward = this.profile.applyRace(rep);
      this.ui.refreshProfile();
    }
    const awards = mode.key === 'tt' || last ? null : this.resultAwards(true);
    this.ui.showResults({ title, sub, rows, nextLabel, reward, backLabel: '返回大厅', awards });
  }

  // ---------- 回调 ----------
  nearCamera(pos, dist) {
    return this.camera.position.distanceToSquared(pos) < dist * dist;
  }

  sfxAt(name, pos, vol = 1, arg) {
    let dist = this.camera.position.distanceTo(pos);
    // 左上角正在播的那个人附近的动静，也当作近处的声音
    if (this.impact) dist = Math.min(dist, this.impact.racer.pos.distanceTo(pos) + 25);
    const v = vol * Math.pow(clamp(1 - dist / 170, 0, 1), 1.5);
    if (v > 0.02) this.sfx[name](v, arg);
  }

  onSnowContact(r, load) {
    const p = r.pos;
    const sideways = r.right;
    const count = Math.round(7 + load * 11);
    for (let i = 0; i < count; i++) {
      const side = (Math.random() - 0.5) * 2;
      const spread = side * (1.4 + load * 5.2);
      this.fx.spray(
        p.x + sideways.x * side * 0.48, p.y + 0.12, p.z + sideways.z * side * 0.48,
        r.vel.x * 0.10 + sideways.x * spread, 0.45 + Math.random() * (0.95 + load * 2.1),
        r.vel.z * 0.10 + sideways.z * spread, 0.043 + Math.random() * (0.045 + load * 0.10),
      );
    }
    this.sfxAt('snowContact', p, 0.74 + load * 0.25, load);
  }

  onPlant(r) {
    this.fx.snowBurst(r.pos, 16, 9);
    this.sfxAt('plop', r.pos, 1);
    this.sfxAt('mumble', r.pos, 0.8, r.idx);
    if (r.isPlayer) this.fx.addShake(0.5);
  }

  onUnplant(r) {
    this.fx.snowBurst(r.pos, 10, 7);
    this.sfxAt('pop', r.pos, 1);
  }

  shakeAt(pos, R) {
    const dist = this.camera.position.distanceTo(pos);
    this.fx.addShake(clamp(1.25 - dist / (R * 5), 0, 1));
  }

  tip(text, dur) {
    this.ui.tip(text, dur);
  }

  // fromNet：这次击飞发生在别人的机器上，是他通知过来的（只播战报和音效）
  onKnock(victim, source, cause, frozen, fromNet) {
    if (!fromNet) this.net.ev('kn', { v: victim.idx, s: source ? source.idx : -1, c: cause, f: frozen ? 1 : 0 });
    this.mode.onKnock(victim, source, frozen);
    if (source && source.owned && victim !== source && !source.out && !source.finished) source.chain.add(frozen ? '冻住对手' : '击中对手', 150);
    if (source && victim !== source) source.knocks++;
    victim.downs++;
    const rep = this.rep;
    if (source && source.isPlayer && victim !== source) {
      rep.hits++;
      rep.hitsBy[cause] = (rep.hitsBy[cause] || 0) + 1;
      this.replay.mark('ko', victim, 3, frozen);
    }
    this.emotes.react(victim, source);
    if (victim.isPlayer) {
      rep.knocked++;
      rep.knockedBy[cause] = (rep.knockedBy[cause] || 0) + 1;
    }
    const verb = frozen ? '冻住了' : '击飞了';
    const cls = (r) => (r.isPlayer ? 'b' : 'span');
    // 名字和原因可能来自其他玩家，写进页面前先转义
    const tag = (r) => `<${cls(r)}>${esc(r.name)}</${cls(r)}>`;
    const why = `<i>${esc(cause)}</i>`;
    if (source && source !== victim) {
      this.ui.feed(`${tag(source)} 用${why}${verb} ${tag(victim)}`);
    } else if (source === victim) {
      this.ui.feed(`${tag(victim)} 被自己的${why}坑了`);
    } else {
      this.ui.feed(`${tag(victim)} ${why}翻车了`);
    }
    if (victim.isPlayer) {
      if (source && source !== victim) this.ui.banner(`被 ${source.name} 的${cause}${frozen ? '冻住' : '击中'}！`, 'bad');
      else if (source === victim) this.ui.banner(`被自己的${cause}炸到了！`, 'bad');
      else this.ui.banner(`${cause}！`, 'bad', 1.1);
      this.fx.addShake(0.8);
    } else if (source && source.isPlayer) {
      this.playerHits++;
      this.ui.banner(`${cause}命中 ${victim.name}！`, 'good', 1.2);
      this.sfx.tone('triangle', 880, 1320, 0.15, 0.25);
      this.showImpact(victim, cause, frozen);
    }
    // 卡通音效：飞得高就惨叫，再高还带下坠的滑哨；只是磕一下就“哎哟”一声
    if (!frozen) {
      const air = victim.predictAir();
      if (air > 0.65) {
        this.sfxAt('scream', victim.pos, 0.9, victim.idx);
        if (air > 0.85) this.sfxAt('whistle', victim.pos, 0.7, air);
      } else {
        this.sfxAt('ow', victim.pos, 0.9, victim.idx);
      }
    }
  }

  // 自己放出的道具影响到其他玩家时，左上角跟拍对方几秒
  showImpact(victim, cause, frozen) {
    if (!victim || victim.isPlayer) return;
    // 正在播的时候不换人：一次打中好几个，只看第一个
    if (this.impact) return;
    // 自己屏幕上本来就看得到对方，就不用再播
    if (this.inPlayerView(victim)) return;
    this.impact = { racer: victim, t: 3.6, yaw: victim.yaw, snap: true };
    this.ui.showImpact(victim.name, cause, frozen);
  }

  // 对方是否就在玩家主画面里：在屏幕范围内、离得不远、没被山体挡住
  inPlayerView(r) {
    const cam = this.camera;
    _v.copy(r.pos);
    _v.y += 0.9;
    const dist = cam.position.distanceTo(_v);
    if (dist > IMPACT_VIEW_DIST) return false;
    _v2.copy(_v).project(cam);
    if (_v2.z < -1 || _v2.z > 1 || Math.abs(_v2.x) > 0.95 || Math.abs(_v2.y) > 0.95) return false;
    // 视线中途被雪坡挡住就算看不到
    const steps = Math.max(2, Math.ceil(dist / 5));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = lerp(cam.position.x, _v.x, k);
      const y = lerp(cam.position.y, _v.y, k);
      const z = lerp(cam.position.z, _v.z, k);
      if (this.course.height(x, z) > y + 0.3) return false;
    }
    return true;
  }

  clearImpact() {
    this.impact = null;
    if (this.ui) this.ui.hideImpact();
  }

  updateImpact(dt) {
    const im = this.impact;
    if (!im) return;
    im.t -= dt;
    if (im.t <= 0) {
      this.clearImpact();
      return;
    }
    this.placeImpactCam(dt);
  }

  placeImpactCam(dt) {
    const im = this.impact;
    const r = im.racer;
    let want = r.yaw;
    if (r.vel.lengthSq() > 9) want = Math.atan2(-r.vel.x, -r.vel.z);
    im.yaw += wrapAngle(want - im.yaw) * (im.snap ? 1 : damp(4, dt));
    const s = Math.sin(im.yaw);
    const c = Math.cos(im.yaw);
    _v.set(r.pos.x + s * 10.5 + c * 3.6, r.pos.y + 5.1, r.pos.z + c * 10.5 - s * 3.6);
    _v.y = Math.max(_v.y, this.course.height(_v.x, _v.z) + 1.8);
    const cam = this.impactCam;
    if (im.snap) {
      cam.position.copy(_v);
      im.snap = false;
    } else cam.position.lerp(_v, damp(8, dt));
    const floorY = this.course.height(cam.position.x, cam.position.z) + 1.2;
    if (cam.position.y < floorY) cam.position.y = floorY;
    const look = r.state === 'tumble' ? 1.6 : 5.5;
    _v2.set(r.pos.x - s * look, r.pos.y + 1.2, r.pos.z - c * look);
    cam.lookAt(_v2);
  }

  impactRect() {
    if (this.mini) return this.ui.impactRect();
    const el = document.getElementById('impact');
    if (!el || el.classList.contains('hidden')) return null;
    const canvas = this.renderer.domElement.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const pad = 3;
    const w = box.width - pad * 2;
    const h = box.height - pad * 2;
    if (w < 8 || h < 8) return null;
    return {
      x: box.left - canvas.left + pad,
      y: canvas.bottom - box.bottom + pad,
      w,
      h,
      aspect: w / h,
    };
  }

  renderImpact() {
    const im = this.impact;
    if (!im || !this.course) return;
    const rect = this.impactRect();
    if (!rect) return;
    const cam = this.impactCam;
    const r = im.racer;
    if (Math.abs(cam.aspect - rect.aspect) > 0.01) {
      cam.aspect = rect.aspect;
      cam.updateProjectionMatrix();
    }
    const renderer = this.renderer;
    renderer.getSize(_buf);
    _skyHold.copy(this.sky.position);
    _sunPos.copy(this.sun.position);
    _sunTgt.copy(this.sun.target.position);
    this.sky.position.copy(cam.position);
    this.focusShadow(r.pos);
    renderer.shadowMap.needsUpdate = true;
    renderer.setScissorTest(true);
    renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
    renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
    try {
      renderer.render(this.scene, cam);
    } finally {
      this.sky.position.copy(_skyHold);
      this.sun.position.copy(_sunPos);
      this.sun.target.position.copy(_sunTgt);
      this.sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, _buf.x, _buf.y);
      renderer.setScissor(0, 0, _buf.x, _buf.y);
    }
  }

  // 空翻 / 转体落地成功。kind：'flip' | 'spin'
  onTrick(r, name, n, kind = 'flip') {
    if (this.nearCamera(r.pos, 130)) this.fx.ring(r.pos, 3.5 + n, kind === 'spin' ? 0x7fe0ff : 0xffe066, 0.35);
    this.mode.onTrick(r, name, n, kind);
    if (!r.isPlayer) return;
    if (kind === 'spin') {
      this.rep.spins += n;
      this.rep.maxSpin = Math.max(this.rep.maxSpin, n);
    } else {
      this.rep.flips += n;
      this.rep.maxFlip = Math.max(this.rep.maxFlip, n);
    }
  }

  // 一次腾空落地，做成了哪些动作（parts：动作名；grab：成功的抓板时长，没有为 0）
  onLanded(r, parts, grab) {
    if (!r.isPlayer) return;
    let big = 0;
    for (const s of parts) {
      const m = s.match(/×(\d+)|转体 (\d+)/);
      big += m ? (m[1] ? +m[1] : +m[2] / 360) : 1;
    }
    if (big >= 2) this.replay.mark('trick', r, 1 + big * 0.4);
    if (grab > 0) {
      this.rep.grabs++;
      this.rep.maxGrab = Math.max(this.rep.maxGrab, grab);
    }
    this.ui.banner(`${parts.join(' + ')}！`, 'good', 1.3);
    this.sfx.tone('triangle', 660, 1320, 0.2, 0.3);
    this.sfx.whoosh(0.7);
  }

  // 抓着板落地
  onSloppy(r) {
    if (!r.isPlayer) return;
    this.tip('抓着板落地没站稳！落地前要松开 S', 1.8);
    this.sfx.tone('square', 220, 140, 0.15, 0.2);
  }

  // ---------- 技巧链 ----------
  onChainAdd(r, label, pts, mult) {
    if (!r.isPlayer) return;
    this.sfx.tone('sine', 420 + mult * 70, 560 + mult * 90, 0.08, 0.12);
  }

  onChainBank(r, total, mult, n) {
    this.mode.onChainBank(r, total, mult, n);
    if (mult >= 3 && this.nearCamera(r.pos, 130)) this.fx.ring(r.pos, 3 + mult * 0.4, 0xffd23c, 0.4);
    r.skillPts += total;
    if (!r.isPlayer) return;
    const rep = this.rep;
    rep.skill += total;
    rep.chains++;
    rep.bestChain = Math.max(rep.bestChain, total);
    rep.bestMult = Math.max(rep.bestMult, mult);
    this.ui.chainPop(`技巧链 ×${mult}`, `+${total.toLocaleString()}`, mult >= 5 ? 'gold' : 'good');
    this.sfx.tone('triangle', 520, 1040 + mult * 60, 0.28, 0.3);
    if (mult >= 5) this.sfx.whoosh(0.8);
  }

  onChainBreak(r, lost, mult, why) {
    this.mode.onChainBreak(r, lost, mult);
    if (!r.isPlayer) return;
    this.rep.breaks++;
    this.ui.chainPop('连招中断', `−${lost.toLocaleString()}`, 'bad');
    this.sfx.tone('sawtooth', 300, 110, 0.3, 0.22);
  }

  // 漂移蓄力喷射
  onDriftBoost(r, big) {
    if (this.nearCamera(r.pos, 110)) this.fx.ring(r.pos, big ? 3.5 : 2.5, big ? 0xff5fd0 : 0xffe066, 0.3);
    this.mode.onDrift(r, big);
    if (!r.isPlayer) return;
    this.rep.driftBoosts++;
    if (big) this.rep.bigDrifts++;
    this.tip(big ? '漂移大喷射！' : '漂移喷射！', 1);
    this.sfx.whoosh(big ? 0.9 : 0.6);
  }

  // 冲过加速带
  onPad(r) {
    if (this.nearCamera(r.pos, 90)) this.fx.ring(r.pos, 2.6, 0x3fc8ff, 0.28);
    this.mode.onPad(r);
    r.chain.add('加速带', 60);
    if (!r.isPlayer) return;
    this.rep.pads++;
    this.sfx.whoosh(0.8);
    this.sfx.tone('sine', 520, 1040, 0.12, 0.18);
  }

  onNitro(r) {
    if (this.nearCamera(r.pos, 110)) this.fx.ring(r.pos, 3, 0x3fa8ff, 0.3);
    if (!r.isPlayer) return;
    this.sfx.whoosh(1);
    this.sfx.tone('sawtooth', 180, 720, 0.35, 0.16);
  }

  onStartBoost(r, perfect) {
    if (this.nearCamera(r.pos, 110)) this.fx.ring(r.pos, perfect ? 3.5 : 2.5, perfect ? 0xffd23c : 0x7fe0ff, 0.3);
    if (!r.isPlayer) return;
    this.ui.chainPop(perfect ? '完美起步' : '起步喷射', '', perfect ? 'gold' : 'good');
    this.sfx.whoosh(perfect ? 1 : 0.7);
    this.sfx.tone('triangle', 520, perfect ? 1560 : 1040, 0.25, 0.25);
  }

  // 从尾流里闪出来
  onDraft(r) {
    if (!r.isPlayer) return;
    this.sfx.whoosh(0.7);
    this.sfx.tone('sine', 440, 880, 0.15, 0.14);
  }

  // 甩掉了追踪导弹
  onEvade(r) {
    if (this.nearCamera(r.pos, 110)) this.fx.ring(r.pos, 4, 0xffd23c, 0.3);
    if (!r.isPlayer) return;
    this.ui.chainPop('甩掉导弹', '', 'good');
    this.sfx.tone('triangle', 880, 1760, 0.18, 0.25);
  }

  // 抄近道成功（滑上近道里的冰面就算）
  updateShortcuts() {
    for (const r of this.racers) {
      if (r.out || r.finished || r.state !== 'ski' || !r.inShort || !r.onIce) continue;
      const b = r.inShort;
      if (r.scDone.has(b)) continue;
      r.scDone.add(b);
      this.mode.onShortcut(r);
      if (r.owned) r.chain.add('抄近道', 400);
      if (!r.isPlayer) continue;
      this.rep.shortcuts++;
      this.ui.banner('抄近道成功！', 'good', 1.6);
      this.sfx.tone('triangle', 520, 1560, 0.3, 0.3);
    }
  }

  // ---------- 输入 ----------
  bindInput() {
    const arm = () => {
      this.sfx.init();
      if (this.state === 'menu') this.sfx.menuStart();
    };
    window.addEventListener('pointerdown', arm);
    const map = {
      KeyA: 'left', ArrowLeft: 'left', a: 'left', A: 'left',
      KeyD: 'right', ArrowRight: 'right', d: 'right', D: 'right',
      KeyW: 'up', ArrowUp: 'up', w: 'up', W: 'up',
      KeyS: 'down', ArrowDown: 'down', s: 'down', S: 'down',
      ShiftLeft: 'drift', ShiftRight: 'drift', Shift: 'drift', KeyL: 'drift', l: 'drift', L: 'drift',
      KeyE: 'flipB', e: 'flipB', E: 'flipB',
      KeyQ: 'flipF', q: 'flipF', Q: 'flipF',
    };
    const act = (e) => map[e.code] || map[e.key];
    const is = (e, ...names) => names.includes(e.code) || names.includes(e.key);
    window.addEventListener('keydown', (e) => {
      arm();
      // 正在输入昵称：别把字母当成游戏按键
      if (e.target && e.target.tagName === 'INPUT') return;
      if (this.departure && is(e, 'Escape', 'Space', ' ')) {
        e.preventDefault();
        this.finishDeparture();
        return;
      }
      const a = act(e);
      if (a) {
        if (a === 'up' && !this.keys.up) this.noteUp();
        this.keys[a] = true;
        if (this.state !== 'menu') e.preventDefault();
        return;
      }
      if (e.repeat) return;
      const racing = this.state === 'race' && !this.paused;
      if (is(e, 'Space', ' ')) {
        // 在地上是起跳；已经腾空时再按，就是按住翻跟头
        if (racing) {
          if (this.player && !this.player.grounded) this.spaceFlip = true;
          else this.jumpQ = true;
        }
        if (this.state !== 'menu') e.preventDefault();
      } else if (is(e, 'KeyJ', 'KeyF', 'j', 'f', 'J', 'F')) {
        if (racing) this.fireQ = true;
      } else if (is(e, 'KeyK', 'KeyC', 'k', 'c', 'K', 'C')) {
        if (racing) this.nitroQ = true;
      } else if (/^Digit[1-4]$/.test(e.code) || /^Numpad[1-4]$/.test(e.code)) {
        if (!this.paused) this.emotes.send(+e.code.slice(-1) - 1);
      } else if (is(e, 'KeyR', 'r', 'R')) {
        if (racing && this.player && !this.player.finished) this.player.respawn();
      } else if (is(e, 'Escape')) {
        this.setPaused(!this.paused);
      } else if (is(e, 'KeyM', 'm', 'M')) {
        this.sfx.setMuted(!this.sfx.muted);
        if (this.state !== 'menu') this.tip(this.sfx.muted ? '🔇 已静音' : '🔊 声音开启');
        else if (this.ui.tab === 'set') this.ui.renderTab('set');
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = act(e);
      if (a) this.keys[a] = false;
      if (is(e, 'Space', ' ')) this.spaceFlip = false;
    });
    window.addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
      this.spaceFlip = false;
    });
    const canvas = document.getElementById('c');
    canvas.addEventListener('mousedown', (e) => {
      // 触屏点画面也会补发一个 mousedown，不能当成开火
      if (this.state !== 'race' || this.paused || this.autoTuck) return;
      if (e.button === 0) this.fireQ = true;
      else if (e.button === 2) this.nitroQ = true;
    });
    canvas.addEventListener('contextmenu', (e) => {
      if (this.state !== 'menu') e.preventDefault();
    });
  }

  // 按下 W：倒计时里记下离“冲”还有几秒；刚喊完“冲”才按的，给个普通起步
  // tap：触屏点了一下（触屏是自动俯冲，不用按住）
  noteUp(tap = false) {
    if (this.state === 'countdown' && !this.departure && !this.waitGo) {
      this.upAt = this.countT - 0.9;
      this.upTap = tap;
    } else if (this.state === 'race' && this.startWin && this.time < this.startWin && this.player && this.player.owned) {
      this.startWin = 0;
      this.player.startBoost(false);
    }
  }

  readInput(dt) {
    const p = this.player;
    const k = this.keys;
    const target = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const rate = (target === 0 ? 8 : 5.5) * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    p.input.steer = this.steer;
    p.input.tuck = k.up || (this.autoTuck && !k.down);
    p.input.brake = k.down;
    p.input.drift = k.drift;
    if (p.grounded) this.spaceFlip = false;
    p.input.flip = k.flipB || this.spaceFlip ? 1 : k.flipF ? -1 : 0;
    // 空中：漂移键 + 方向 = 转体，S = 抓板。离地前就按着的不算，得松开重按（免得漂移 / 刹车带进空中误触）
    if (p.grounded) {
      this.airDriftHeld = k.drift;
      this.airGrabHeld = k.down;
    } else {
      if (!k.drift) this.airDriftHeld = false;
      if (!k.down) this.airGrabHeld = false;
    }
    const air = !p.grounded && p.state === 'ski';
    p.input.spin = air && k.drift && !this.airDriftHeld ? target : 0;
    p.input.grab = air && k.down && !this.airGrabHeld;
    if (this.jumpQ) {
      p.input.jump = true;
      this.jumpQ = false;
    }
    if (this.fireQ) {
      this.fireQ = false;
      if (p.weapon) this.weapons.use(p);
    }
    if (this.nitroQ) {
      this.nitroQ = false;
      p.useNitro();
    }
  }

  // ---------- 每帧 ----------
  frame() {
    // 联机时宁可一步走长一点（updateRace 里会再切小步），也别让自己的时间比别人慢
    const dt = Math.min(this.clock.getDelta(), this.net.active ? 0.1 : 0.05);
    this.frameAt = performance.now();
    this.quality.sample();
    this.sfx.wake();
    // 联机比赛停不下来：打开菜单时游戏照常推进
    if (!this.paused || this.net.active) {
      let sim = dt;
      if (this.slowT > 0) {
        this.slowT -= dt;
        sim *= this.slowT > 0.3 ? 0.3 : 1 - (Math.max(0, this.slowT) / 0.3) * 0.7;
      }
      this.update(sim);
      this.replay.frame(dt);
    }
    const view = this.replay.on ? this.replay.cam : this.camera;
    if (this.mini) this.mini.display.drawScene(this.renderer, this.scene, view);
    else this.renderer.render(this.scene, view);
    this.renderImpact();
    this.ui.draw?.();
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'menu') {
      this.updateLobby(dt);
      // 排队时人可能在车库、商城这些展厅页面，计时放在这里每帧都走
      if (this.netMode) {
        if (!this.customRoom) this.ui.tickQueue();
        else if (this.matchPlayers) this.ui.tickMatch(this.matchEnd - performance.now());
      }
    } else if (this.departure) {
      if (this.departure.update(dt)) this.finishDeparture();
    } else if (this.state === 'countdown') this.updateCountdown(dt);
    else this.updateRace(dt);
    if (this.course) this.course.update(dt);
    this.fx.update(dt);
    this.sky.position.copy(this.camera.position);
    this.clouds.rotation.y += dt * 0.004;
    if (this.aurora.visible) this.auroraTex.offset.x += dt * 0.012;
    if (this.snowfall) this.snowfall.update(dt, this.camera.position);
    if (this.state !== 'menu') {
      this.ui.update(dt);
      this.hud?.update(dt);
      this.touch.update?.(dt);
      this.emotes.update(dt);
    }
    this.updateImpact(dt);
  }

  focusShadow(pos) {
    this.sun.castShadow = !!this.rules.shadows && this.quality.shadows;
    this.sun.position.copy(pos).addScaledVector(this.sunDir, 240);
    this.sun.target.position.copy(pos);
    this.sun.target.updateMatrixWorld();
  }

  // 界面占掉了屏幕四周：镜头退到宽 w、高 h（米）的东西刚好放进中间的空地，再平移，让它落在空地正中。
  // 返回平滑后的平移量和距离
  frameCam(dt, w, h, near, far) {
    const cam = this.camera;
    const f = this.ui.lobbyFrame();
    const tan = Math.tan((cam.fov * Math.PI) / 360);
    const dist = clamp(Math.max(w / (2 * tan * cam.aspect * f.w), h / (2 * tan * f.h)), near, far);
    const tx = (0.5 - f.cx) * 2 * tan * dist * cam.aspect;
    const ty = (f.cy - 0.5) * 2 * tan * dist;
    // 切换面板、缩放窗口时平滑过渡
    const lc = this.lobbyCam || (this.lobbyCam = { x: tx, y: ty, dist });
    const k = damp(5, dt);
    lc.x = lerp(lc.x, tx, k);
    lc.y = lerp(lc.y, ty, k);
    lc.dist = lerp(lc.dist, dist, k);
    return lc;
  }

  // 展厅：镜头略微俯视展台，灯光固定，雪山和缆车先藏起来
  updateShow(dt) {
    const room = this.showroom;
    room.update(dt);
    const p = room.group.position;
    const cam = this.camera;
    // 车库只摆装备时框得比整个人小一圈，装备显得大
    const lc = room.gear ? this.frameCam(dt, 5.2, 3.2, 4, 14) : this.frameCam(dt, SHOW_W, SHOW_H, 4.5, 14);
    const ax = p.x + lc.x;
    const ay = p.y + STAGE_TOP + 0.9 + lc.y;
    cam.position.set(ax + Math.sin(this.time * 0.3) * 0.3, ay + lc.dist * 0.13, p.z + lc.dist);
    cam.lookAt(ax, ay, p.z);
    this.hemi.color.set(0xb4c8ff);
    this.hemi.groundColor.set(0x33448c);
    this.hemi.intensity = 1.7;
    this.sun.color.set(0xffffff);
    this.sun.intensity = 3.4;
    this.sun.castShadow = false; // 展台上用一团假阴影就够了；回到大厅时 focusShadow 会按设置重新打开
    this.sun.position.copy(p).addScaledVector(SHOW_SUN, 240);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
    this.course.group.visible = false;
    if (this.lobby) this.lobby.visible = false;
    if (this.snowfall) this.snowfall.points.visible = false;
  }

  updateLobby(dt) {
    if (this.showroom && this.showroom.group.visible) return this.updateShow(dt);
    for (const s of this.lobbySkiers) s.update(dt, {});
    const g = this.lobby.position;
    const cam = this.camera;
    const lc = this.frameCam(dt, LIFT_W, LIFT_H, 9, 32);
    const ax = g.x + lc.x;
    const ay = g.y + 0.95 + lc.y;
    cam.position.set(ax + Math.sin(this.time * 0.25) * 0.6, ay + 0.25 + Math.sin(this.time * 0.4) * 0.15, g.z + lc.dist);
    cam.position.y = Math.max(cam.position.y, this.course.height(cam.position.x, cam.position.z) + 1.5);
    cam.lookAt(ax, ay, g.z);
    this.focusShadow(g);
  }

  updateCountdown(dt) {
    if (this.waitGo) {
      // 联机：自己加载完了，等其他人
      for (const r of this.racers) r.update(dt);
      this.updateCamera(dt, true);
      return;
    }
    this.countT -= dt;
    const n = Math.ceil(this.countT - 0.9);
    const text = n > 0 ? String(n) : '';
    if (text !== this.lastCount) {
      this.lastCount = text;
      if (text) {
        this.ui.setCount(text);
        this.sfx.beep(false);
      }
    }
    for (const r of this.racers) r.update(dt);
    if (this.ghost) this.ghost.update(dt, 0);
    if (this.countT <= 0.9) {
      this.state = 'race';
      this.playerHits = 0;
      this.ui.setCount('冲！');
      this.goT = 0.9;
      this.sfx.beep(true);
      this.sfx.musicStart();
      for (const r of this.racers) {
        if (!r.owned) continue; // 别人的角色等他自己出发
        r.state = 'ski';
        r.vel.set(0, 0, this.course.def?.practice ? -6 : -5 - Math.random() * 2);
        if (r.isBot && Math.random() < BOT_START[this.rules.difficulty]) r.startBoost(Math.random() < 0.5);
      }
      const p = this.player;
      this.startWin = this.time + START_LATE;
      if (p && p.owned && (this.keys.up || this.upTap)) {
        // 早就按住不放的不算
        if (this.upAt >= 0 && this.upAt <= START_PERFECT) p.startBoost(true);
        this.startWin = 0;
      }
    }
    this.net.tick();
    this.updateCamera(dt, true);
  }

  // 机器人调速的参照：还在跑的真人玩家的平均进度
  updatePace() {
    let sum = 0;
    let n = 0;
    for (const r of this.racers) {
      if (r.isBot || r.finished || r.out) continue;
      sum += r.d;
      n++;
    }
    this.paceD = n ? sum / n : null;
  }

  // 冲线。t：用时（联机时别人的用时由他自己报过来）
  finishRacer(r, t) {
    // 冲线时手上的技巧链直接结算
    if (r.owned && !r.out) {
      if (r.drifting) r.endDrift(true, false);
      r.chain.bank();
    }
    r.finished = true;
    r.finishTime = t;
    this.finishCount++;
    this.mode.onFinish(r);
    r.weapon = null;
    r.skier.setProp(null);
    r.boostT = 0;
    if (this.nearCamera(r.pos, 200)) this.confetti(r.pos);
    // 冲线前后 0.8 秒内有人一起冲线，回放里优先放这一下
    const p = this.player;
    const close = (a) => this.racers.some((o) => o !== a && o.finished && Math.abs(o.finishTime - a.finishTime) < 0.8);
    if (r.isPlayer) this.replay.mark('fin', r, close(r) ? 2.2 : 1);
    else if (p && p.finished && close(p)) this.replay.bump('fin', 2.2);
    if (r.isPlayer) {
      if (!this.net.active) this.slowT = FINISH_SLOW;
      this.updateOrder();
      this.state = 'finished';
      this.finishedT = 0;
      const msg = this.mode.key === 'tt' ? `用时 ${fmtTime(t)}` : this.mode.scored ? `冲线！得分 ${this.mode.score[r.idx]}` : `第 ${r.rank} 名！`;
      this.ui.banner(msg, 'gold', 3);
      this.sfx.fanfare(r.rank <= 3);
      this.sfx.musicStop(1.5); // 冲线后音乐淡出
    }
  }

  updateRace(dt) {
    const practice = this.course.def?.practice;
    if (practice && this.state === 'results') return;
    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) this.ui.setCount('');
    }
    if (this.rejoinSync > 0) {
      this.rejoinSync -= dt;
      if (this.rejoinSync <= 0) this.syncSelf(null);
    }
    // 告诉别的标签页：这一局有人在打
    if ((this.net.active || this.netDropped) && !this.rewarded) {
      this.seatBeatT = (this.seatBeatT || 0) + dt;
      if (this.seatBeatT > 2) {
        this.seatBeatT = 0;
        const seat = this.loadSeat();
        if (seat) save(LS_SEAT, { ...seat, beat: Date.now(), tab: this.tabId });
      }
    }
    // 窗口在后台时一步可能很长（见 initBackgroundTick），多切几小步保证物理稳定
    const steps = dt > 0.05 ? Math.ceil(dt / 0.025) : dt > 0.02 ? 2 : 1;
    const h = dt / steps;
    this.updatePace();
    for (let s = 0; s < steps; s++) {
      if (this.state === 'race') {
        this.raceTime += h;
        this.readInput(h);
      } else if (this.player) {
        // 自己冲线之后别人还在跑，计时接着走
        this.raceTime += h;
        this.player.input.steer = 0;
      }
      for (const r of this.racers) r.update(h);
      this.collideRacers();
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        if (e.update(h) === false) {
          e.dispose();
          const k = this.entities.indexOf(e);
          if (k >= 0) this.entities.splice(k, 1);
        }
      }
      this.items.update(h);
      this.hazards.update(h, this.raceTime);
      this.mode.update(h);
      if (practice && this.raceTime >= PRACTICE_SECONDS - 1e-6) {
        this.raceTime = PRACTICE_SECONDS;
        this.state = 'results';
        this.sfx.musicStop(1.5);
        this.sfx.silenceRide();
        this.ui.showHud(false);
        this.ui.showResults({
          title: '试滑结束',
          sub: `雪松村 · ${GEAR[this.session.gear].form === 'ski' ? '双板' : '单板'} · ${PRACTICE_SECONDS} 秒`,
          rows: [],
          nextLabel: '再滑一次',
          swapLabel: this.session.gear === 'ski' ? '换单板再滑' : '换双板再滑',
        });
        return;
      }
      // 冲线（联机时只判定本机负责的选手，别人冲线会发消息过来）
      const L = this.course.L;
      for (const r of this.racers) {
        if (r.owned && !r.finished && !r.out && r.d >= L) {
          this.finishRacer(r, this.raceTime);
          this.net.ev('fin', { i: r.idx, ft: Math.round(this.raceTime * 100) / 100 });
        }
      }
    }
    this.net.tick();
    this.updateOrder();
    if (this.state === 'race' || this.state === 'finished') {
      this.updateShortcuts();
      for (const r of this.racers) if (r.owned && !r.finished && r.state === 'ski' && r.grounded) r.topSpeed = Math.max(r.topSpeed, Math.round(r.vel.length() * 3.6));
    }
    const p0 = this.player;
    if (p0 && this.state === 'race') {
      const rep = this.rep;
      if (p0.state === 'ski' && p0.grounded) rep.maxSpeed = Math.max(rep.maxSpeed, Math.round(p0.vel.length() * 3.6));
      if (!p0.grounded && p0.state === 'ski') rep.maxAir = Math.max(rep.maxAir, p0.airT);
      if (this.ghostRec) this.ghostRec.sample(this.raceTime, p0);
    }
    if (this.ghost) this.ghost.update(dt, this.raceTime);
    if (this.state === 'finished') {
      this.finishedT += dt;
      if (this.finishedT > 3.2) this.showResults();
    } else if (this.state === 'results' && this.net.active) {
      // 联机结算面板：其他人陆续冲线，名单跟着刷新
      this.resT -= dt;
      if (this.resT <= 0) {
        this.resT = 0.5;
        this.showNetResults();
      }
    }
    const p = this.player;
    if (this.state === 'race') this.sfx.setRide(p.speed, p.grounded && p.state === 'ski', clamp(p.slip / 12, 0, 1), p.ride);
    else this.sfx.silenceRide();
    this.updateCamera(dt, false);
  }

  confetti(pos) {
    const cols = [COL.pink, COL.spark, COL.green, COL.ice1, COL.fire1];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28;
      const sp = 4 + Math.random() * 9;
      const c = cols[i % cols.length];
      this.fx.glow.spawn(pos.x, pos.y + 2, pos.z, Math.cos(a) * sp, 8 + Math.random() * 10, Math.sin(a) * sp, 1.2 + Math.random() * 0.8, 0.13, 0.1, c, c, 14, 0.8);
    }
  }

  collideRacers() {
    const R = this.racers;
    for (let i = 0; i < R.length; i++) {
      const a = R[i];
      if (a.state === 'ready' || a.out) continue;
      for (let j = i + 1; j < R.length; j++) {
        const b = R[j];
        if (b.out) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1.7 || Math.abs(b.pos.y - a.pos.y) > 1.6) continue;
        const dist = Math.sqrt(d2) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        // 联机时只挪本机负责的那一个，对方那一半由他自己的机器算
        const push = (1.3 - dist) * 0.5;
        if (push > 0) {
          if (a.owned) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (b.owned) { b.pos.x += nx * push; b.pos.z += nz * push; }
        }
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          const imp = -rel * 0.8;
          if (a.owned) { a.vel.x -= nx * imp; a.vel.z -= nz * imp; }
          if (b.owned) { b.vel.x += nx * imp; b.vel.z += nz * imp; }
          if (-rel > 6) this.sfxAt('thud', a.pos, 0.6);
        }
        if (a.finished || b.finished) continue;
        if (a.boostT > 0 && b.boostT <= 0 && b.state === 'ski') {
          _v.set(nx * 11, 8, nz * 11);
          b.knock(_v, 1.4, a, '氮气冲撞');
        } else if (b.boostT > 0 && a.boostT <= 0 && a.state === 'ski') {
          _v.set(-nx * 11, 8, -nz * 11);
          a.knock(_v, 1.4, b, '氮气冲撞');
        }
      }
    }
  }

  updateCamera(dt, snap) {
    // 自己被淘汰了：镜头跟着还在跑的领先者
    const watch = this.camRacer && this.player && this.player.out;
    if (watch && (this.camRacer.out || this.camRacer.finished)) {
      const next = this.order.find((o) => !o.out && !o.finished);
      if (next) this.camRacer = next;
    }
    const p = watch ? this.camRacer : this.player;
    const cam = this.camera;
    const course = this.course;
    let targetFov = 62;
    if ((this.state === 'finished' || this.state === 'results') && !watch) {
      this.orbit += dt * 0.45;
      const a = this.camYaw + this.orbit;
      _v.set(p.pos.x + Math.sin(a) * 7.5, p.pos.y + 3, p.pos.z + Math.cos(a) * 7.5);
      _v.y = Math.max(_v.y, course.height(_v.x, _v.z) + 1.4);
      cam.position.lerp(_v, damp(4, dt));
      _v2.copy(p.pos);
      _v2.y += 1.2;
      cam.lookAt(_v2);
    } else {
      let wantYaw = p.yaw;
      if (p.state === 'tumble' && p.speed > 3) wantYaw = Math.atan2(-p.vel.x, -p.vel.z);
      this.camYaw += wrapAngle(wantYaw - this.camYaw) * damp(p.state === 'tumble' ? 2 : 5.5, dt);
      const canLead = this.state === 'race' && p.state === 'ski' && p.vel.z < -3;
      let leadYaw = 0;
      if (canLead) {
        const lead = clamp(13 + p.speed * 0.65, 16, 48);
        const branch = p.inShort;
        const deltaX = course.routeX(p.d + lead, branch) - course.routeX(p.d, branch);
        const deltaYaw = wrapAngle(Math.atan2(-deltaX, lead) - this.camYaw);
        const align = 1 - smooth(0.35, 1.1, Math.abs(deltaYaw));
        leadYaw = clamp(deltaYaw * 0.62, -0.29, 0.29) * align;
      }
      this.camLead = lerp(this.camLead, leadYaw, damp(4.5, dt));
      const back = p.ride ? 4.6 : 4.9;
      const up = (p.ride ? 2.75 : 2.3) - p.landingPress * 0.28;
      _v.set(p.pos.x + Math.sin(this.camYaw) * back, p.pos.y + up, p.pos.z + Math.cos(this.camYaw) * back);
      _v.y = Math.max(_v.y, course.height(_v.x, _v.z) + 1.5);
      if (snap) cam.position.lerp(_v, damp(3, dt));
      else {
        const k = damp(11, dt);
        cam.position.x = lerp(cam.position.x, _v.x, k);
        cam.position.z = lerp(cam.position.z, _v.z, k);
        cam.position.y = lerp(cam.position.y, _v.y, damp(6, dt));
      }
      const minY = course.height(cam.position.x, cam.position.z) + 1.0;
      if (cam.position.y < minY) cam.position.y = minY;
      const aimYaw = this.camYaw + this.camLead;
      const aimDist = canLead ? clamp(7 + p.speed * 0.13, 7, 14) : 7;
      _v2.set(p.pos.x - Math.sin(aimYaw) * aimDist, p.pos.y + 1.5, p.pos.z - Math.cos(aimYaw) * aimDist);
      const gh = course.height(_v2.x, _v2.z) + 1.0;
      const pitch = clamp(gh - _v2.y, -4.8, 3.6) * (p.grounded ? 0.54 : 0.26);
      this.camPitch = lerp(this.camPitch, pitch, damp(5.8, dt));
      _v2.y += this.camPitch;
      cam.lookAt(_v2);
      targetFov = 60 + Math.min(p.speed, 62) * 0.42 + (p.boostT > 0 || p.nitroT > 0 ? 8 : 0);
      if (p.ride) targetFov = 57 + Math.min(p.speed, 52) * 0.28;
    }
    const sh = this.fx.shake;
    if (sh > 0.01) {
      cam.position.x += (Math.random() - 0.5) * sh * 0.5;
      cam.position.y += (Math.random() - 0.5) * sh * 0.5;
      cam.rotateZ((Math.random() - 0.5) * sh * 0.05);
    }
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = lerp(cam.fov, targetFov, damp(3, dt));
      cam.updateProjectionMatrix();
    }
    this.focusShadow(p.pos);
  }
}
