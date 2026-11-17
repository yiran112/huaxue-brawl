// 计时赛的幽灵车：录下自己最好的一趟，下次和它一起滑。
// 固定赛道的幽灵存在浏览器本地；随机赛道只在这次打开页面期间有效
import * as THREE from 'three';
import { Skier } from './skier.js';

const HZ = 10;
const LS = 'huaxue_ghost_';
const memory = new Map();
const _qa = new THREE.Quaternion();
const XA = new THREE.Vector3(1, 0, 0);

// 每帧 6 个数：t, x, y, z, yaw, flip（flip 的小数位里顺便塞了是否着地：着地时 +100）
export class GhostRecorder {
  constructor() {
    this.frames = [];
    this.nextT = 0;
  }

  sample(t, r) {
    if (t < this.nextT) return;
    this.nextT = t + 1 / HZ;
    const f = this.frames;
    f.push(+t.toFixed(2), +r.pos.x.toFixed(2), +r.pos.y.toFixed(2), +r.pos.z.toFixed(2), +(r.yaw + r.spinA).toFixed(3), +(r.flip + (r.grounded ? 100 : 0)).toFixed(2));
  }
}

export function loadGhost(key) {
  if (memory.has(key)) return memory.get(key);
  if (key.startsWith('r')) return null;
  try {
    const g = JSON.parse(localStorage.getItem(LS + key));
    if (g && Array.isArray(g.f) && g.f.length >= 12 && Number.isFinite(g.time)) {
      memory.set(key, g);
      return g;
    }
  } catch {
    /* 坏数据当作没有 */
  }
  return null;
}

export function saveGhost(key, time, look, frames) {
  const g = { time, look, f: frames };
  memory.set(key, g);
  if (key.startsWith('r')) return;
  try {
    localStorage.setItem(LS + key, JSON.stringify(g));
  } catch {
    /* 存不下就只留在内存里 */
  }
}

// 回放
export class GhostRunner {
  constructor(scene, data) {
    this.data = data;
    this.f = data.f;
    this.n = Math.floor(this.f.length / 6);
    this.skier = new Skier(data.look || {});
    this.skier.makeGhost();
    scene.add(this.skier.group);
    this.i = 0;
    this.pos = new THREE.Vector3();
  }

  // 幽灵在 d 处的用时（按 z 插值），用来算你领先 / 落后多少
  timeAtD(d) {
    const f = this.f;
    const z = -d;
    let lo = 0;
    let hi = this.n - 1;
    if (z >= f[3]) return f[0];
    if (z <= f[hi * 6 + 3]) return null;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (f[m * 6 + 3] > z) lo = m;
      else hi = m;
    }
    const za = f[lo * 6 + 3];
    const zb = f[hi * 6 + 3];
    const k = za === zb ? 0 : (za - z) / (za - zb);
    return f[lo * 6] + (f[hi * 6] - f[lo * 6]) * k;
  }

  update(dt, t) {
    const f = this.f;
    const g = this.skier.group;
    if (t >= f[(this.n - 1) * 6]) {
      g.visible = false;
      return;
    }
    g.visible = true;
    while (this.i < this.n - 2 && f[(this.i + 1) * 6] <= t) this.i++;
    const a = this.i * 6;
    const b = a + 6;
    const k = Math.min(1, Math.max(0, (t - f[a]) / (f[b] - f[a] || 1)));
    this.pos.set(f[a + 1] + (f[b + 1] - f[a + 1]) * k, f[a + 2] + (f[b + 2] - f[a + 2]) * k, f[a + 3] + (f[b + 3] - f[a + 3]) * k);
    let dy = f[b + 4] - f[a + 4];
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    const yaw = f[a + 4] + dy * k;
    const fa = f[a + 5];
    const grounded = fa >= 50;
    const flipA = grounded ? fa - 100 : fa;
    const fb = f[b + 5] >= 50 ? f[b + 5] - 100 : f[b + 5];
    const flip = flipA !== 0 && fb !== 0 ? flipA + (fb - flipA) * k : flipA;
    g.position.copy(this.pos);
    g.rotation.set(0, yaw, 0);
    if (flip) this.skier.spin.quaternion.copy(_qa.setFromAxisAngle(XA, flip));
    else this.skier.spin.quaternion.identity();
    const sp = Math.hypot(f[b + 1] - f[a + 1], f[b + 3] - f[a + 3]) / Math.max(1e-3, f[b] - f[a]);
    this.skier.update(dt, { tuck: !grounded || sp > 20, steer: 0, grounded, speed: sp });
  }

  dispose() {
    this.skier.dispose();
  }
}
