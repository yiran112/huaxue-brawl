// 场景道具模型：终点拱门、起点门、缆车、山羊/鹿、战机、地雷、名字牌
import * as THREE from 'three';
import { mesh, limb, lam } from './skier.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function checkerTex() {
  const t = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16161a';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16);
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

// 弧形横幅：位于 XY 平面，朝向 +Z
function arcBanner(rIn, rOut, text, color) {
  const N = 40;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    pos.push(cx * rIn, sy * rIn, 0, cx * rOut, sy * rOut, 0);
    uv.push(1 - i / N, 0, 1 - i / N, 1);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = '900 96px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`▲  ${text}  ▲`, w / 2, h / 2 + 6);
  });
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}

export function buildArch(text = 'FINISH', color = '#e0263c', R = 10) {
  const g = new THREE.Group();
  const tube = 1.15;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 10, 40, Math.PI), lam(0xf8f8f8));
  torus.castShadow = true;
  g.add(torus);
  const banner = arcBanner(R - tube * 0.85, R + tube * 0.85, text, color);
  banner.position.z = tube + 0.02;
  g.add(banner);
  const back = arcBanner(R - tube * 0.85, R + tube * 0.85, text, color);
  back.rotation.y = Math.PI;
  back.position.z = -tube - 0.02;
  g.add(back);
  const ck = checkerTex();
  const pm = new THREE.MeshLambertMaterial({ map: ck });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(tube * 2.3, 6, tube * 2.3), pm);
    p.position.set(sx * R, -1.5, 0);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

export function buildChairlift(withCable = true) {
  const g = new THREE.Group();
  const metal = 0x9aa3ad;
  const W = 9.4;
  g.add(mesh('box', 0x6f7883, W, 0.1, 0.62, 0, 0.5, 0.1)); // 座板
  g.add(mesh('box', metal, W, 0.07, 0.07, 0, 1.25, 0.42)); // 靠背上梁
  g.add(mesh('box', metal, W, 0.07, 0.07, 0, 0.85, 0.42));
  for (let i = 0; i <= 8; i++) g.add(mesh('box', metal, 0.05, 0.75, 0.05, -W / 2 + (i * W) / 8, 0.9, 0.42));
  g.add(mesh('box', metal, W + 0.3, 0.06, 0.06, 0, 0.98, -0.42)); // 安全杆
  for (const sx of [-1, 1]) {
    g.add(mesh('box', metal, 0.07, 0.07, 0.9, sx * (W / 2), 0.98, 0));
    g.add(limb(metal, sx * (W / 2), 1.25, 0.42, sx * 1.2, 3.3, 0.1, 0.045));
  }
  g.add(mesh('box', metal, 2.6, 0.12, 0.12, 0, 3.3, 0.1));
  g.add(limb(metal, 0, 3.3, 0.1, 0, 6.6, 0.1, 0.07));
  g.add(mesh('box', 0x59616b, 0.5, 0.3, 1.2, 0, 6.7, 0.1));
  if (withCable) {
    const cable = mesh('cyl', 0x3a3f47, 0.035, 400, 0.035, 0, 6.9, 0.1);
    cable.rotation.x = Math.PI / 2 - 0.22;
    g.add(cable);
  }
  g.add(mesh('box', 0x59616b, W, 0.05, 0.25, 0, 0.12, -0.5)); // 脚踏
  return g;
}

// 四足动物（山羊 / 鹿）
export function buildQuadruped(kind) {
  const g = new THREE.Group();
  const goat = kind === 'goat';
  const body = goat ? 0xf09a3a : 0xc9772e;
  const belly = goat ? 0xffd9a0 : 0xe8b27a;
  const legs = [];
  g.add(mesh('sphere', body, 0.42, 0.42, 0.75, 0, 1.0, 0));
  g.add(mesh('sphere', belly, 0.36, 0.3, 0.6, 0, 0.88, 0));
  const neck = limb(body, 0, 1.15, -0.55, 0, 1.75, -0.85, 0.17);
  g.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 1.85, -0.95);
  head.add(mesh('sphere', body, 0.24, 0.24, 0.34));
  head.add(mesh('sphere', belly, 0.15, 0.13, 0.18, 0, -0.07, -0.28));
  head.add(mesh('sphere', 0x2a1a12, 0.06, 0.05, 0.05, 0, -0.03, -0.45));
  for (const sx of [-1, 1]) {
    head.add(mesh('sphere', 0xffffff, 0.11, 0.11, 0.07, sx * 0.17, 0.08, -0.16));
    head.add(mesh('sphere', 0x101014, 0.045, 0.045, 0.04, sx * 0.2, 0.08 + (sx > 0 ? 0.02 : -0.02), -0.2));
    const ear = mesh('sphere', body, 0.16, 0.06, 0.09, sx * 0.3, 0.1, 0.08);
    ear.rotation.z = sx * -0.4;
    head.add(ear);
    if (goat) {
      const horn = mesh('cone', 0xf4f0e0, 0.05, 0.3, 0.05, sx * 0.1, 0.3, 0.08);
      horn.rotation.x = 0.5;
      head.add(horn);
    } else {
      head.add(limb(0xe9dcc0, sx * 0.1, 0.2, 0.05, sx * 0.34, 0.62, 0.12, 0.03));
      head.add(limb(0xe9dcc0, sx * 0.24, 0.44, 0.09, sx * 0.48, 0.52, -0.05, 0.025));
      head.add(limb(0xe9dcc0, sx * 0.3, 0.55, 0.1, sx * 0.3, 0.8, 0.2, 0.025));
    }
  }
  if (goat) {
    head.add(mesh('cone', 0xf4f0e0, 0.07, 0.24, 0.05, 0, -0.26, -0.22)); // 山羊胡
    head.children[head.children.length - 1].rotation.x = Math.PI;
  }
  g.add(head);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.22, 0.85, sz * 0.45);
    leg.add(mesh('cyl', body, 0.07, 0.8, 0.07, 0, -0.4, 0));
    leg.add(mesh('box', 0x2a1a12, 0.13, 0.1, 0.15, 0, -0.82, 0));
    g.add(leg);
    legs.push(leg);
  }
  g.add(mesh('sphere', belly, 0.1, 0.1, 0.1, 0, 1.15, 0.78)); // 尾巴
  if (goat) {
    // 红披风 + 黄项圈
    const cape = mesh('box', 0xe0222a, 0.9, 0.04, 1.1, 0, 1.42, 0.25);
    cape.rotation.x = -0.12;
    g.add(cape);
    const collar = mesh('cyl', 0xffe14a, 0.2, 0.07, 0.2, 0, 1.38, -0.66);
    collar.rotation.x = 0.5;
    g.add(collar);
    g.add(mesh('sphere', 0xffe14a, 0.08, 0.08, 0.08, 0, 1.22, -0.8));
  } else {
    const scarf = mesh('cyl', 0x2f6bff, 0.2, 0.1, 0.2, 0, 1.5, -0.72);
    scarf.rotation.x = 0.5;
    g.add(scarf);
    g.add(mesh('box', 0xff3d6e, 0.1, 0.4, 0.05, 0.15, 1.3, -0.66));
  }
  g.userData.legs = legs;
  g.userData.head = head;
  g.scale.setScalar(goat ? 1.15 : 1.35);
  return g;
}

export function animateQuadruped(g, t, speed) {
  const legs = g.userData.legs;
  const a = Math.min(1, speed / 8);
  for (let i = 0; i < 4; i++) {
    const ph = i === 0 || i === 3 ? 0 : Math.PI;
    legs[i].rotation.x = Math.sin(t * 22 + ph) * 0.9 * a;
  }
  g.userData.head.rotation.x = Math.sin(t * 22) * 0.12 * a;
}

export function buildJet() {
  const g = new THREE.Group();
  const white = 0xf2f4f7;
  const pink = 0xff5fa2;
  const fus = mesh('cyl', white, 1.1, 13, 1.0);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const nose = mesh('cone', white, 1.1, 5, 1.0, 0, 0, -9);
  nose.rotation.x = -Math.PI / 2;
  g.add(nose);
  g.add(mesh('sphere', 0x27313f, 0.8, 0.7, 2.2, 0, 0.75, -4.5));
  for (const sx of [-1, 1]) {
    const wing = mesh('box', white, 6.5, 0.22, 4.2, sx * 3.8, -0.1, 1.2);
    wing.rotation.y = sx * -0.42;
    g.add(wing);
    const tailW = mesh('box', white, 3, 0.18, 2, sx * 2.1, 0, 6);
    tailW.rotation.y = sx * -0.4;
    g.add(tailW);
    const fin = mesh('box', white, 0.2, 3.2, 2.4, sx * 0.9, 1.7, 5.6);
    fin.rotation.z = sx * -0.25;
    fin.rotation.x = -0.3;
    g.add(fin);
    g.add(mesh('cyl', 0x3a3f47, 0.55, 0.6, 0.55, sx * 0.6, 0, 6.6).rotateX(Math.PI / 2));
    g.add(mesh('box', pink, 0.05, 0.9, 5, sx * 1.02, 0.1, -1));
  }
  return g;
}

export function buildMine() {
  const g = new THREE.Group();
  g.add(mesh('cyl', 0x2c3038, 0.55, 0.22, 0.55, 0, 0.11, 0));
  g.add(mesh('cyl', 0x444a55, 0.38, 0.1, 0.38, 0, 0.26, 0));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  light.position.y = 0.36;
  g.add(light);
  g.userData.light = light;
  return g;
}

export function buildDynamite() {
  const g = new THREE.Group();
  for (const x of [-0.11, 0, 0.11]) g.add(mesh('cyl', 0xd8262c, 0.055, 0.42, 0.055, x, 0, 0));
  g.add(mesh('box', 0x2a2d33, 0.36, 0.06, 0.13, 0, 0, 0));
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe28a }));
  sp.position.y = 0.27;
  g.add(sp);
  return g;
}

export function buildRocket(color = 0xe8eaee) {
  const g = new THREE.Group();
  const b = mesh('cyl', color, 0.13, 0.9, 0.13);
  b.rotation.x = Math.PI / 2;
  g.add(b);
  const n = mesh('cone', 0xe0263c, 0.13, 0.32, 0.13, 0, 0, -0.6);
  n.rotation.x = -Math.PI / 2;
  g.add(n);
  for (let i = 0; i < 4; i++) {
    const f = mesh('box', 0xe0263c, 0.3, 0.02, 0.22, 0, 0, 0.38);
    f.rotation.z = (i * Math.PI) / 4;
    g.add(f);
  }
  return g;
}

const labelCache = new Map();
export function nameSprite(text, color = '#ffffff') {
  const key = text + color;
  let tex = labelCache.get(key);
  if (!tex) {
    tex = canvasTex(256, 64, (g, w, h) => {
      g.font = '900 34px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(10,14,30,0.9)';
      g.strokeText(text, w / 2, h / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2);
    });
    labelCache.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(2.6, 0.65, 1);
  return s;
}

export function glowTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

export { canvasTex };
