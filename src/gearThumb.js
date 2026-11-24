// 装备缩略图：把一件装备的模型单独拍成一张透明底的小图，给车库的装备卡片用。
// 用一块自己的小画布来拍，不碰主画面；拍过的图按「装备 + 板子颜色」记住，颜色变了才重拍。
import * as THREE from 'three';
import { Skier } from './skier.js';

const W = 320;
const H = 192;
// 镜头在装备的左前上方：车头朝着画面左下
const VIEW = new THREE.Vector3(-1, 0.55, -0.75).normalize();

let stage = null; // { renderer, scene, camera }
let broken = false; // 这台机器开不了第二块 WebGL 画布，卡片上就退回用图标
const cache = new Map(); // 装备 id → { key, url }
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function getStage() {
  if (stage || broken) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a94, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-0.5, 1, -0.6);
    scene.add(sun);
    stage = { renderer, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100) };
  } catch (e) {
    broken = true;
  }
  return stage;
}

// 镜头对准这堆零件，上下左右正好框住，四周留一点边
export function frameGearPreview(camera, root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return false;
  const c = box.getCenter(new THREE.Vector3());
  camera.position.copy(c).addScaledVector(VIEW, 30);
  camera.lookAt(c);
  camera.updateMatrixWorld(true);
  // 按每个顶点在画面里的位置来框，比按包围盒的八个角框得紧（圆的、斜着的东西不会显得小）
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    _m.multiplyMatrices(camera.matrixWorldInverse, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      x0 = Math.min(x0, _v.x);
      x1 = Math.max(x1, _v.x);
      y0 = Math.min(y0, _v.y);
      y1 = Math.max(y1, _v.y);
    }
  });
  const hw = Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * (W / H)) * 1.06;
  const hh = hw * (H / W);
  camera.left = (x0 + x1) / 2 - hw;
  camera.right = (x0 + x1) / 2 + hw;
  camera.top = (y0 + y1) / 2 + hh;
  camera.bottom = (y0 + y1) / 2 - hh;
  camera.updateProjectionMatrix();
  return true;
}

function toBlobUrl(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
}

export function makeGearPreview(id, look) {
  // 拼一个完整的角色，只把脚下的装备（两块雪板，或者整台载具）摘出来拍
  const skier = new Skier({ ...look, gear: id });
  skier.group.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.updateMatrixWorld(true);
  for (const part of [...skier.skis, skier.vehicle]) if (part) root.attach(part);
  // 加速才亮的尾焰、照在雪面上的光晕不拍
  const drop = [];
  root.traverse((o) => {
    if (o.isMesh && (!o.visible || o.material.blending === THREE.AdditiveBlending)) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  root.updateMatrixWorld(true);
  return { root, skier };
}

function shoot(id, look) {
  const st = getStage();
  if (!st) return null;
  const { root, skier } = makeGearPreview(id, look);
  st.scene.add(root);
  let url = null;
  if (frameGearPreview(st.camera, root)) {
    st.renderer.render(st.scene, st.camera);
    url = toBlobUrl(st.renderer.domElement.toDataURL('image/png'));
  }
  st.scene.remove(root);
  skier.dispose();
  return url;
}

// 返回这件装备的缩略图地址；拍不出来就返回 null
export function gearThumb(id, look) {
  const key = String(look.ski);
  const hit = cache.get(id);
  if (hit && hit.key === key) return hit.url;
  let url = null;
  try {
    url = shoot(id, look);
  } catch (e) {
    broken = true;
  }
  if (!url) return null;
  if (hit) URL.revokeObjectURL(hit.url);
  cache.set(id, { key, url });
  return url;
}
