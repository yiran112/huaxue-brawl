// 结算领奖台上的 3D 角色：前三名按各自的造型和装备拼出模型，站在卡片里。
// 用一块自己的小画布挨个拍，再贴进每张卡片的画布；结算面板开着时每帧都拍，角色会动。
import * as THREE from 'three';
import { Skier } from '../skier.js';

const TEAM_HEX = [0xe8343a, 0x2f7bff];
const FACE = Math.PI - 0.5; // 面朝镜头，稍微侧过去一点
const HOP = 0.42; // 冠军蹦起来的高度

let stage = null; // { renderer, scene, camera }
let broken = false; // 这台机器开不了第二块 WebGL 画布
const _b = new THREE.Box3();

function getStage() {
  if (stage || broken) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a94, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(0.6, 1, 0.9);
    scene.add(sun);
    stage = { renderer, scene, camera: new THREE.PerspectiveCamera(26, 1, 0.1, 80), w: 0, h: 0 };
  } catch (e) {
    broken = true;
  }
  return stage;
}

// 只量看得见的零件（藏起来的道具、护盾、冰坨不算），镜头按它来框
function measure(group) {
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverseVisible((o) => {
    if (!o.isMesh || o.material.blending === THREE.AdditiveBlending) return;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(_b.copy(geo.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

export class PodiumView {
  constructor() {
    this.slots = [];
    this.frame = new THREE.Box3();
    this.raf = 0;
    this.last = 0;
  }

  // list: [{ canvas, look, place, team }]，place 0 是第一名。开不了 3D 画布时返回 false
  bind(list) {
    if (!getStage()) return false;
    const old = this.slots;
    this.slots = list.map((e) => {
      const key = `${JSON.stringify(e.look)}|${e.team ?? -1}`;
      const k = old.findIndex((s) => s.key === key);
      const s = k >= 0 ? old.splice(k, 1)[0] : this.make(e.look, e.team, key);
      s.canvas = e.canvas;
      s.ctx = e.canvas.getContext('2d');
      s.place = e.place;
      return s;
    });
    for (const s of old) s.skier.dispose();
    // 三个人共用一个取景框，坐雪圈的不会比站着的大一圈
    this.frame = this.slots.reduce((b, s) => b.union(s.box), new THREE.Box3());
    this.start();
    return true;
  }

  make(look, team, key) {
    const skier = new Skier({ ...look });
    if (team >= 0) skier.setTeam(TEAM_HEX[team]);
    skier.setProp(null);
    skier.update(0.016, { grounded: true, speed: 0, steer: 0 });
    const root = new THREE.Group();
    root.add(skier.group);
    return { key, skier, root, box: measure(skier.group), t: Math.random() * 3 };
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.draw(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  clear() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of this.slots) s.skier.dispose();
    this.slots = [];
  }

  // 冠军一下一下往上蹦（腾空时两手会张开），二三名原地轻轻晃
  pose(s, dt) {
    s.t += dt;
    const t = s.t;
    let y = 0;
    if (s.place === 0) {
      const k = (t % 1.5) / 1.5;
      y = k < 0.34 ? Math.sin((k / 0.34) * Math.PI) * HOP : 0;
    }
    s.skier.update(dt, { grounded: y < 0.03, speed: 0, steer: Math.sin(t * 0.7 + s.place) * 0.16 });
    s.root.position.y = y;
    s.root.rotation.y = FACE + Math.sin(t * 0.5 + s.place * 1.3) * 0.25;
  }

  // 上下框住全身（冠军留出蹦起来的空），左右按转身时最宽的样子留够
  aim(cam, s, aspect) {
    const b = this.frame;
    const lift = s.place === 0 ? HOP / 2 : 0;
    const hy = (b.max.y - b.min.y) / 2 + lift;
    const cy = (b.max.y + b.min.y) / 2 + lift;
    const hw = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const d = Math.max((hy * 1.06) / tan, (hw * 0.9) / (tan * aspect)) + hw * 0.6;
    if (Math.abs(cam.aspect - aspect) > 1e-3) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    cam.position.set(0, cy + d * 0.16, d);
    cam.lookAt(0, cy, 0);
  }

  draw(dt) {
    const st = stage;
    const shown = this.slots.filter((s) => s.canvas.isConnected && s.canvas.clientWidth > 4 && s.canvas.clientHeight > 4);
    if (!st || !shown.length) {
      if (!this.slots.some((s) => s.canvas.isConnected)) this.clear();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    for (const s of shown) {
      s.pw = Math.round(s.canvas.clientWidth * dpr);
      s.ph = Math.round(s.canvas.clientHeight * dpr);
      W = Math.max(W, s.pw);
      H = Math.max(H, s.ph);
    }
    // 小画布按最大的那张卡开一次，每张卡只用左下角一块，免得每帧来回改尺寸
    const r = st.renderer;
    if (st.w !== W || st.h !== H) {
      r.setSize(W, H, false);
      st.w = W;
      st.h = H;
    }
    r.setScissorTest(true);
    for (const s of shown) {
      const cv = s.canvas;
      if (cv.width !== s.pw || cv.height !== s.ph) {
        cv.width = s.pw;
        cv.height = s.ph;
      }
      this.pose(s, dt);
      this.aim(st.camera, s, s.pw / s.ph);
      r.setViewport(0, 0, s.pw, s.ph);
      r.setScissor(0, 0, s.pw, s.ph);
      st.scene.add(s.root);
      r.render(st.scene, st.camera);
      st.scene.remove(s.root);
      s.ctx.clearRect(0, 0, s.pw, s.ph);
      s.ctx.drawImage(r.domElement, 0, H - s.ph, s.pw, s.ph, 0, 0, s.pw, s.ph);
    }
    r.setScissorTest(false);
  }
}
