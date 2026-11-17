// 雪山大乱斗 - 主程序
import * as THREE from 'three';
import { THEMES, THEME_KEYS, LENGTHS, LOOK_PRESETS, BOT_NAMES, DEFAULT_RULES, POINTS, SKINS, MODES, WEAPON_KEYS } from './config.js';
import { GEAR, LOOK_EXTRA_DEFAULTS, COSMETIC_SLOTS, uniformUp, pickBotGear } from './gear.js';
import { TRACK_MAP, CUP_MAP, CHALLENGE_MAP, TROPHY, TROPHY_NAME } from './tracks.js';
import { Profile } from './profile.js';
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
import { UI, esc } from './ui.js';
import { Net } from './net.js';
import { clamp, lerp, damp, wrapAngle, fmtTime } from './util.js';

const LS_RULES = 'huaxue_rules_v1';
const LS_LOOK = 'huaxue_look_v1';
const LS_NAME = 'huaxue_name_v1';
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

class Game {
  constructor() {
    this.profile = new Profile();
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
    // 当前这一组比赛：quick 快速赛 / cup 杯赛 / challenge 挑战
    this.session = { kind: 'quick', mode: this.rules.mode, track: this.rules.track };
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
    const savedName = load(LS_NAME);
    this.playerName = typeof savedName === 'string' ? savedName : '';
    this.net = new Net(this);
    this.netMode = false; // 从点“联机匹配”到回大厅之间都是 true
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
    this.orbit = 0;
    this.trailColor = 0x6f8fd0;

    this.initRenderer();
    this.initSky();
    this.sfx = new Sfx();
    this.fx = new FX(this.scene);
    this.weapons = new Weapons(this);
    this.ui = new UI(this);
    this.seed = (Math.random() * 1e9) | 0;
    this.themeKey = this.resolveTheme();
    this.buildWorld();
    this.toMenu();
    this.bindInput();
    this.clock = new THREE.Clock();
    this.frameAt = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    this.initBackgroundTick();
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
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
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
      renderer.setSize(window.innerWidth, window.innerHeight, false);
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
    this.clearImpact();
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
  buildLobby() {
    this.disposeLobby();
    const c = this.course;
    const g = (this.lobby = new THREE.Group());
    const z = 36;
    g.position.set(0, c.height(0, z) + 13, z);
    g.rotation.y = Math.PI;
    g.add(buildChairlift());
    this.lobbySkiers = [];
    // 单机：自己 + 机器人；匹配中：缆车上坐的是已经匹配到的玩家
    const looks = [];
    if (this.matchPlayers) {
      for (const p of this.matchPlayers) looks.push(p.look);
    } else {
      const bots = this.rules.mode === 'tt' ? 0 : this.rules.mode === 'team' ? 7 : this.rules.bots;
      for (let i = 0; i < 1 + bots; i++) looks.push(i === 0 ? this.look : this.botLooks[(i - 1) % 7]);
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
    this.ui.showMenu(true);
    this.ui.buildMenu();
    if (tab) this.ui.openTab(tab);
    this.buildLobby();
    this.sfx.silenceRide();
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
  }

  setRule(k, v) {
    // 比赛中 this.rules 是这一局的临时规则，菜单里改的始终是单机规则
    this.soloRules[k] = v;
    if (this.rules !== this.soloRules && k === 'shadows') this.rules[k] = v;
    save(LS_RULES, this.soloRules);
    if (k === 'theme' || k === 'track') {
      this.trackDef = this.rules.track !== 'random' ? TRACK_MAP[this.rules.track] || null : null;
      this.themeKey = this.resolveTheme();
      this.buildWorld();
      this.buildLobby();
    } else if (k === 'bots' || k === 'mode') {
      this.buildLobby();
    }
    if (k === 'mode' || k === 'track') this.ui.renderTab('race');
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
    if (this.state === 'menu') this.buildLobby();
    this.syncShow();
  }

  // ---------- 展厅（成长 / 车库 / 角色页的背景） ----------
  // label：展台背后的全息大字，传 null 表示回到缆车大厅；
  // gear：车库里正在看的装备，可以是还没拥有的，只用来预览
  setShow(label, gear) {
    this.showLabel = label || null;
    this.showGear = gear || null;
    this.syncShow();
  }

  // 按当前状态进出展厅；force === false 时强制退出（开赛前调用）
  syncShow(force) {
    const on = force !== false && !!this.showLabel && this.state === 'menu' && !this.netMode;
    if (on && !this.showroom) {
      this.showroom = new Showroom();
      this.scene.add(this.showroom.group);
    }
    const room = this.showroom;
    if (!room) return;
    if (on) {
      room.setLabel(this.showLabel);
      room.setLook(this.showGear ? { ...this.look, gear: this.showGear } : this.look);
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
    this.session = { kind: 'quick', mode: this.soloRules.mode, track: this.soloRules.track };
    this.round = 1;
    this.points = new Array(8).fill(0);
    this.shuffleBots(this.soloRules.difficulty ?? 1);
    this.startRace(true);
  }

  // 杯赛：三站固定赛道，按名次累计积分，总排名前三拿奖杯
  startCup(id) {
    const i = Object.keys(CUP_MAP).indexOf(id);
    if (!CUP_MAP[id] || !this.profile.cupUnlocked(i) || this.state !== 'menu') return;
    this.session = { kind: 'cup', cup: id, mode: 'race', raceIdx: 0 };
    this.round = 1;
    this.points = new Array(8).fill(0);
    this.shuffleBots(CUP_MAP[id].difficulty ?? 1);
    this.startRace(true);
  }

  startChallenge(id) {
    const ch = CHALLENGE_MAP[id];
    if (!ch || !this.profile.challengeUnlocked(ch) || this.state !== 'menu') return;
    this.session = { kind: 'challenge', chal: id, mode: ch.mode, track: ch.track };
    this.round = 1;
    this.points = new Array(8).fill(0);
    this.shuffleBots(ch.rules.difficulty ?? 1);
    this.startRace(true);
  }

  nextRace() {
    // 联机：打完一场接着匹配下一场
    if (this.netMode) {
      this.toMenu();
      this.startMatch();
      return;
    }
    const s = this.session;
    if (s.kind === 'cup') {
      if (s.raceIdx < 2) {
        s.raceIdx++;
        this.round = s.raceIdx + 1;
        this.startRace(true);
      } else this.toMenu('events');
      return;
    }
    // 计时赛：同一条赛道接着刷成绩
    if (s.kind === 'challenge' || s.mode === 'tt') {
      this.startRace(s.mode !== 'tt');
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

  // 这一局的实际规则：菜单规则 + 杯赛 / 挑战的固定设置 + 模式的要求
  makeRules(s) {
    const base = this.soloRules;
    const r = { ...base, banned: base.banned.slice(), mode: s.mode || 'race' };
    if (s.kind === 'cup') {
      Object.assign(r, { bots: 7, difficulty: CUP_MAP[s.cup].difficulty, rounds: 1, items: true, itemRate: 1, wildlife: true, banned: [] });
    } else if (s.kind === 'challenge') {
      const ch = CHALLENGE_MAP[s.chal];
      Object.assign(r, { bots: 7, difficulty: 1, rounds: 1, items: true, itemRate: 1, wildlife: true, banned: [] }, ch.rules);
      delete r.only;
      if (ch.rules.only) r.banned = WEAPON_KEYS.filter((k) => !ch.rules.only.includes(k));
    }
    const m = r.mode;
    if (m === 'speed' || m === 'trick') r.items = false;
    if (m === 'brawl') Object.assign(r, { items: true, itemRate: 3 });
    if (m === 'tt') Object.assign(r, { items: false, bots: 0, wildlife: false });
    if (m === 'elim') r.bots = Math.max(r.bots, 3);
    if (m === 'team') r.bots = 7;
    if (m !== 'race' && m !== 'speed') r.rounds = 1;
    return r;
  }

  // 单机比赛：自己 + 机器人
  startRace(newCourse) {
    const s = this.session;
    this.rules = this.makeRules(s);
    const trackId = s.kind === 'cup' ? CUP_MAP[s.cup].tracks[s.raceIdx] : s.track;
    const def = trackId && trackId !== 'random' ? TRACK_MAP[trackId] || null : null;
    if (newCourse || def !== this.trackDef || (!def && this.course && this.course.def)) {
      newCourse = true;
      this.trackDef = def;
      if (!def) this.seed = (Math.random() * 1e9) | 0;
      this.themeKey = this.resolveTheme();
    }
    const botUp = uniformUp(s.kind === 'cup' ? CUP_MAP[s.cup].botUp : [0, 1, 2][this.rules.difficulty] ?? 1);
    const roster = [];
    for (let i = 0; i < 1 + this.rules.bots; i++) {
      roster.push({
        name: i === 0 ? '你' : this.botNames[i - 1],
        look: i === 0 ? this.look : this.botLooks[(i - 1) % 7],
        bot: i > 0,
        up: i === 0 ? this.profile.up(this.look.gear) : botUp,
      });
    }
    this.beginRace(newCourse, roster, 0);
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
      kind: this.net.active ? 'online' : this.session.kind,
      mode: this.mode.key,
      rank,
      field: this.racers.length,
      finished: p.finished,
      time: p.finished ? p.finishTime : this.raceTime,
      difficulty: this.rules.difficulty ?? 1,
      score: this.mode.score[p.idx] || 0,
      teamWin,
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
  beginRace(newCourse, roster, me) {
    this.sfx.init();
    this.ui.showMenu(false);
    this.ui.showMatch(false);
    this.ui.hideResults();
    this.ui.showPause(false);
    this.paused = false;
    this.disposeLobby();
    this.syncShow(false);
    if (newCourse) this.buildWorld();
    else this.clearRace();
    const online = this.net.active;
    this.mode = makeMode(online ? 'race' : this.rules.mode, this);
    const xs = [-2.2, 2.2, -6.6, 6.6];
    for (let i = 0; i < roster.length; i++) {
      const e = roster[i];
      const mine = i === me;
      // 联机时本机只负责模拟自己；房主另外负责所有机器人
      const owned = !online || mine || (!!e.bot && this.net.isHost);
      const up = e.up || (mine ? this.profile.up(e.look.gear || 'ski') : null);
      const r = new Racer(this, i, e.look, e.name, mine, { bot: !!e.bot, owned, id: e.id || 0, up, team: this.mode.teamOf(i) });
      r.scDone = new Set();
      const row = Math.floor(i / 4);
      r.place(xs[i % 4], 3 + row * 4.6, 0);
      this.racers.push(r);
    }
    this.player = this.racers[me];
    this.itemRespawn = this.mode.itemRespawn;
    this.items = this.rules.items ? new Items(this) : NO_ITEMS;
    this.hazards = new Hazards(this);
    this.rep = this.newReport();
    this.rewarded = false;
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
    this.raceTime = 0;
    this.finishCount = 0;
    this.finishedT = 0;
    this.playerHits = 0;
    this.steer = 0;
    this.jumpQ = false;
    this.fireQ = false;
    this.spaceFlip = false;
    this.camYaw = 0;
    this.orbit = 0;
    this.updateOrder();
    this.ui.resetHud();
    this.ui.showHud(true);
    const p = this.player;
    this.camera.position.set(p.pos.x, p.pos.y + 3.2, p.pos.z + 8);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  setPaused(b) {
    if (!['countdown', 'race', 'finished'].includes(this.state)) return;
    // 联机时只是打开菜单，比赛照常进行（见 frame）
    const online = this.net.active;
    this.paused = b;
    this.ui.showPause(b, online);
    this.sfx.musicDuck(b && !online);
    if (b && !online) this.sfx.silenceRide();
  }

  // ---------- 联机匹配 ----------
  setName(name) {
    this.playerName = String(name).trim().slice(0, 12);
    save(LS_NAME, this.playerName);
  }

  startMatch() {
    if (this.netMode || this.state !== 'menu') return;
    this.sfx.init();
    this.netMode = true;
    this.matchPlayers = null;
    this.ui.showMenu(false);
    this.ui.showMatch(true);
    this.ui.setMatch({ status: '正在连接服务器…' });
    this.net.match(this.playerName, this.look);
  }

  cancelMatch() {
    this.toMenu();
  }

  startMatchNow() {
    this.net.sendJson({ t: 'startnow' });
  }

  // 房间里的人变了 / 倒计时变了
  onNetRoom(m) {
    if (!this.netMode || this.state !== 'menu' || !Array.isArray(m.players)) return;
    this.matchPlayers = m.players;
    this.matchEnd = performance.now() + (Number(m.left) || 0);
    this.buildLobby();
    this.ui.setMatch({ players: m.players, me: this.net.id, host: m.host === this.net.id, max: m.max });
  }

  // 服务器宣布开赛：所有人用同一个种子生成同一条赛道
  onNetStart(m) {
    if (!this.netMode) return;
    this.matchPlayers = null;
    this.rules = { ...this.soloRules, ...m.rules, rounds: 1, mode: 'race', track: 'random', banned: Array.isArray(m.rules && m.rules.banned) ? m.rules.banned : [] };
    if (!LENGTHS[this.rules.length]) this.rules.length = 'medium';
    this.seed = m.seed | 0;
    this.trackDef = null;
    this.themeKey = THEMES[m.theme] ? m.theme : 'day';
    this.round = 1;
    this.beginRace(true, m.roster, m.you | 0);
    // 各人机器快慢不一样，等所有人都加载完再一起倒计时
    this.waitGo = true;
    this.ui.tip('等待其他玩家加载赛道…', 20);
    this.net.sendJson({ t: 'ready' });
  }

  onNetGo() {
    if (!this.waitGo) return;
    this.waitGo = false;
    this.countT = 3.9;
    this.lastCount = '';
    this.ui.tip('准备！', 0.8);
  }

  // 比赛中有人走了：他的角色交给机器人，机器人统一由（新）房主负责
  onNetLeave(id, hostChanged) {
    if (!this.racers.length) return;
    const gone = this.racers.find((r) => r.netId === id);
    if (gone && !gone.isBot) {
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
    if (!this.netMode) return;
    if (this.state === 'menu') {
      // 还在匹配：留在匹配面板上，告诉玩家怎么回事
      this.matchPlayers = null;
      this.buildLobby();
      this.ui.setMatch({ status: was === 'connecting' ? '连接不上匹配服务器，请确认服务器已启动' : '与服务器的连接断开了', error: true });
      return;
    }
    // 比赛中断线：其他选手全部交给本机的机器人，把这一局跑完
    this.waitGo = false;
    for (const r of this.racers) if (r !== this.player) r.takeOver(true);
    this.ui.banner('网络断开，已转为单机继续', 'bad', 2.5);
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
    const rows = this.order.map((r, i) => ({ rank: i + 1, name: r.name, me: r.isPlayer, time: r.finished ? fmtTime(r.finishTime) : '比赛中…' }));
    const racing = this.racers.some((r) => !r.finished);
    // 奖励只结算一次（名单还会刷新好几回）
    if (!this.rewarded) {
      this.rewarded = true;
      this.netReward = this.profile.applyRace(this.playerReport(p.rank));
      this.ui.refreshProfile();
    }
    this.ui.showResults({
      title: `第 ${p.rank} 名${p.rank === 1 ? ' 🏆' : ''}`,
      sub: `联机 · ${this.theme.name} · 用时 ${fmtTime(p.finishTime)} · 你击中对手 ${this.playerHits} 次，被击飞 ${p.hits} 次${racing ? ' · 还有人没冲线' : ''}`,
      rows,
      nextLabel: '继续匹配 ▶',
      reward: this.netReward,
    });
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
    const cup = s.kind === 'cup' ? CUP_MAP[s.cup] : null;
    const multi = s.kind === 'quick' && this.rules.rounds > 1;
    const pointsMode = multi || !!cup;
    const last = cup ? s.raceIdx >= 2 : multi && this.round >= this.rules.rounds;
    const timeOf = (r) => (r.finished ? fmtTime(r.finishTime) : r.out ? '淘汰' : '未完赛');
    let rows = stand.map((r, i) => {
      const row = { rank: i + 1, name: r.name, me: r.isPlayer, time: timeOf(r), team: r.team };
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
    if (cup) sub = `${cup.name} 第 ${s.raceIdx + 1} / 3 站 · ` + sub;
    const extra = [];
    let nextLabel = '再来一局 ▶';
    if (last) {
      const tot = this.racers.slice().sort((a, b) => this.points[b.idx] - this.points[a.idx]);
      const mr = tot.indexOf(p) + 1;
      rows = tot.map((r, i) => ({ rank: i + 1, name: r.name, me: r.isPlayer, time: '', pts: `${this.points[r.idx]} 分` }));
      if (cup) {
        const trophy = mr <= 3 ? 4 - mr : 0;
        title = trophy ? `${TROPHY[trophy]} ${cup.name} ${TROPHY_NAME[trophy]}！` : `${cup.name} 总排名第 ${mr} 名`;
        sub = `总积分 ${this.points[p.idx]} 分 · 冠军：${tot[0].name}${trophy ? '' : ' · 总排名前三才能拿到奖杯'}`;
        if (trophy) {
          const cr = this.profile.cupResult(cup, trophy);
          extra.push({ label: `${cup.name} ${TROPHY_NAME[trophy]}${cr.first ? '（新纪录）' : ''}`, xp: cr.xp, coins: cr.coins });
        }
        nextLabel = '返回赛事 ▶';
      } else {
        title = `锦标赛总排名 第 ${mr} 名${mr === 1 ? ' 🏆' : ''}`;
        sub = `冠军：${tot[0].name}（${this.points[tot[0].idx]} 分）`;
        nextLabel = '再来一届 ▶';
      }
    } else if (cup) nextLabel = `下一站：${TRACK_MAP[cup.tracks[s.raceIdx + 1]].name} ▶`;
    else if (multi) nextLabel = '下一轮 ▶';

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

    if (s.kind === 'challenge') {
      const ch = CHALLENGE_MAP[s.chal];
      const rep = this.playerReport(myRank, teamWin);
      const ok = ch.test(rep);
      const cr = this.profile.challengeResult(ch, ok);
      if (cr) extra.push({ label: `挑战「${ch.name}」${cr.first ? '首次完成' : '再次完成'}`, xp: cr.xp, coins: cr.coins });
      title = ok ? `✅ 挑战成功：${ch.name}` : `❌ 挑战失败：${ch.name}`;
      sub = `${ch.desc} · ${ch.prog(rep)}`;
      nextLabel = ok ? '再挑战一次 ▶' : '重新挑战 ▶';
    }

    let reward = null;
    if (!this.rewarded) {
      this.rewarded = true;
      const rep = this.playerReport(myRank, teamWin);
      rep.extra = extra;
      reward = this.profile.applyRace(rep);
      this.ui.refreshProfile();
    }
    this.ui.showResults({ title, sub, rows, nextLabel, reward, backLabel: cup || s.kind === 'challenge' ? '返回赛事' : '返回大厅' });
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
    const rep = this.rep;
    if (source && source.isPlayer && victim !== source) {
      rep.hits++;
      rep.hitsBy[cause] = (rep.hitsBy[cause] || 0) + 1;
    }
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
      // 正在输入昵称：别把字母当成游戏按键
      if (e.target && e.target.tagName === 'INPUT') return;
      const a = act(e);
      if (a) {
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
      } else if (is(e, 'KeyJ', 'KeyF', 'KeyK', 'j', 'f', 'k', 'J', 'F', 'K')) {
        if (racing) this.fireQ = true;
      } else if (is(e, 'KeyR', 'r', 'R')) {
        if (racing && this.player && !this.player.finished) this.player.respawn();
      } else if (is(e, 'Escape')) {
        this.setPaused(!this.paused);
      } else if (is(e, 'KeyM', 'm', 'M')) {
        this.sfx.setMuted(!this.sfx.muted);
        if (this.state !== 'menu') this.tip(this.sfx.muted ? '🔇 已静音' : '🔊 声音开启');
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
    document.getElementById('c').addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.state === 'race' && !this.paused) this.fireQ = true;
    });
  }

  readInput(dt) {
    const p = this.player;
    const k = this.keys;
    const target = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const rate = (target === 0 ? 8 : 5.5) * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    p.input.steer = this.steer;
    p.input.tuck = k.up;
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
  }

  // ---------- 每帧 ----------
  frame() {
    // 联机时宁可一步走长一点（updateRace 里会再切小步），也别让自己的时间比别人慢
    const dt = Math.min(this.clock.getDelta(), this.net.active ? 0.1 : 0.05);
    this.frameAt = performance.now();
    this.sfx.wake();
    // 联机比赛停不下来：打开菜单时游戏照常推进
    if (!this.paused || this.net.active) this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.renderImpact();
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'menu') this.updateLobby(dt);
    else if (this.state === 'countdown') this.updateCountdown(dt);
    else this.updateRace(dt);
    if (this.course) this.course.update(dt);
    this.fx.update(dt);
    this.sky.position.copy(this.camera.position);
    this.clouds.rotation.y += dt * 0.004;
    if (this.aurora.visible) this.auroraTex.offset.x += dt * 0.012;
    if (this.snowfall) this.snowfall.update(dt, this.camera.position);
    if (this.state !== 'menu') this.ui.update(dt);
    this.updateImpact(dt);
  }

  focusShadow(pos) {
    this.sun.castShadow = !!this.rules.shadows;
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
    const lc = this.frameCam(dt, SHOW_W, SHOW_H, 4.5, 14);
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
    if (this.netMode && this.matchPlayers) this.ui.tickMatch(this.matchEnd - performance.now());
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
      this.sfx.musicStart(); // 喊“冲！”的同时音乐响起
      for (const r of this.racers) {
        if (!r.owned) continue; // 别人的角色等他自己出发
        r.state = 'ski';
        r.vel.set(0, 0, -5 - Math.random() * 2);
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
    if (r.isPlayer) {
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
    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) this.ui.setCount('');
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
    if (this.state === 'race' || this.state === 'finished') this.updateShortcuts();
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
    if (this.state === 'race') this.sfx.setRide(p.speed, p.grounded && p.state === 'ski', clamp(p.slip / 12, 0, 1));
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
      const back = 4.9;
      const up = 2.3;
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
      _v2.set(p.pos.x - Math.sin(this.camYaw) * 7, p.pos.y + 1.5, p.pos.z - Math.cos(this.camYaw) * 7);
      const gh = course.height(_v2.x, _v2.z) + 1.0;
      _v2.y = lerp(_v2.y, gh, 0.6);
      cam.lookAt(_v2);
      targetFov = 60 + Math.min(p.speed, 62) * 0.42 + (p.boostT > 0 ? 8 : 0);
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

window.game = new Game();
