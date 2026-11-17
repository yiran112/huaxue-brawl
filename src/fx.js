// 特效：实例化粒子、爆炸、光束、冲击波穹顶、雪痕、降雪
import * as THREE from 'three';
import { lerp, clamp } from './util.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const QUATS = [];
for (let i = 0; i < 24; i++) {
  QUATS.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)));
}
const C = (hex) => new THREE.Color(hex);

class Pool {
  constructor(scene, mat, cap) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.list = [];
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav = 0, drag = 0) {
    if (this.list.length >= this.cap) return;
    this.list.push({ x, y, z, vx, vy, vz, life, max: life, s0, s1, c0, c1, grav, drag, q: (Math.random() * QUATS.length) | 0 });
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
        p.vz *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    const mesh = this.mesh;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      const t = 1 - p.life / p.max;
      const grow = 1 - (1 - t) * (1 - t);
      let s = lerp(p.s0, p.s1, grow);
      if (t > 0.65) s *= 1 - (t - 0.65) / 0.35;
      _p.set(p.x, p.y, p.z);
      _s.set(s, s, s);
      _m.compose(_p, QUATS[p.q], _s);
      mesh.setMatrixAt(i, _m);
      _c.copy(p.c0).lerp(p.c1, t);
      mesh.setColorAt(i, _c);
    }
    mesh.count = L.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

const COL = {
  fire0: C(0xfff3a8), fire1: C(0xff7a14), fire2: C(0xc8300a),
  spark: C(0xffe066), smoke0: C(0x2b2b31), smoke1: C(0x5d5d66),
  snow: C(0xffffff), snow2: C(0xdfeaff), dust: C(0x9b8f86),
  ice0: C(0xbff2ff), ice1: C(0x6fd0ff), boost0: C(0xfff0a0), boost1: C(0xff5a1a),
  trail0: C(0xd8d8de), trail1: C(0x8a8a94), pink: C(0xff5fd0), green: C(0x7dff8a),
  frost: C(0xf2fdff), ice2: C(0x2f9cf0), brass: C(0xe0a53a),
};
export { COL };

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.lit = new Pool(scene, new THREE.MeshLambertMaterial({ flatShading: true }), 700);
    this.glow = new Pool(scene, new THREE.MeshBasicMaterial({ fog: false }), 500);
    this.domes = [];
    this.beams = [];
    this.rings = [];
    this.domeGeo = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    // 冰刺：底面在原点、尖朝上，所有冰刺共用一份几何体和材质
    this.spikes = [];
    this.spikeGeo = new THREE.ConeGeometry(1, 1, 5);
    this.spikeGeo.translate(0, 0.5, 0);
    this.spikeMat = new THREE.MeshLambertMaterial({ color: 0x9fe4ff, emissive: 0x1f7fd0, emissiveIntensity: 0.7, flatShading: true, transparent: true, opacity: 0.9 });
    this.shake = 0;
    this.normalAt = null; // 由 Game 注入：(x, z, out) => 地面法线
  }

  explosion(pos, R = 8) {
    const g = this.glow;
    const l = this.lit;
    const k = R / 8;
    // 火球核心：先亮后暗
    g.spawn(pos.x, pos.y + 0.8, pos.z, 0, 2, 0, 0.26, 1.4 * k, 2.6 * k, COL.fire0, COL.fire1, 0, 0);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28;
      const e = Math.random() * 1.3;
      const sp = (5 + Math.random() * 11) * k;
      g.spawn(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp,
        0.35 + Math.random() * 0.35, 0.6 * k, (1.3 + Math.random() * 0.9) * k, COL.fire0, Math.random() < 0.5 ? COL.fire1 : COL.fire2, 0, 3.5);
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28;
      const e = Math.random() * 1.4;
      const sp = 24 + Math.random() * 30;
      g.spawn(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp,
        0.25 + Math.random() * 0.25, 0.15, 0.06, COL.spark, COL.fire1, 14, 1.5);
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28;
      const sp = (2 + Math.random() * 7) * k;
      l.spawn(pos.x + Math.cos(a) * 1.5, pos.y + 0.8 + Math.random() * 1.5, pos.z + Math.sin(a) * 1.5, Math.cos(a) * sp, 2 + Math.random() * 6, Math.sin(a) * sp,
        1.3 + Math.random() * 1.3, 0.15 * k, (1.5 + Math.random() * 1.2) * k, COL.smoke0, COL.smoke1, -1.2, 1.8);
    }
    this.snowBurst(pos, 14, 13 * k);
    this.dome(pos, R * 0.95, 0xfff2b0, 0.32);
    this.ring(pos, R * 1.25, 0xffffff, 0.45);
  }

  snowBurst(pos, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const sp = power * (0.3 + Math.random() * 0.7);
      this.lit.spawn(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * sp * 0.7, power * (0.5 + Math.random() * 0.8), Math.sin(a) * sp * 0.7,
        0.7 + Math.random() * 0.7, 0.1 + Math.random() * 0.16, 0.08, COL.snow, COL.snow2, 24, 0.6);
    }
  }

  // 滑行溅雪
  spray(x, y, z, vx, vy, vz, size = 0.1) {
    this.lit.spawn(x, y, z, vx, vy, vz, 0.35 + Math.random() * 0.3, size, size * 2.2, COL.snow, COL.snow2, 9, 2.5);
  }

  smokeTrail(pos, size = 0.22) {
    this.lit.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5,
      0.7 + Math.random() * 0.5, size, size * 3, COL.trail0, COL.trail1, -0.5, 1.5);
  }

  flame(pos, vx, vy, vz, size = 0.22) {
    this.glow.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.18 + Math.random() * 0.15, size, size * 0.3, COL.boost0, COL.boost1, 0, 0);
  }

  iceBurst(pos) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28;
      const sp = 4 + Math.random() * 8;
      this.glow.spawn(pos.x, pos.y + 0.8, pos.z, Math.cos(a) * sp, 2 + Math.random() * 7, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 0.18, 0.08, COL.ice0, COL.ice1, 16, 1);
    }
    this.ring(pos, 4, 0x9fe8ff, 0.4);
  }

  // 一根从地里窜出来的冰刺：(dx, dz) 是往外倒的方向，delay 秒后才开始冒
  spike(x, y, z, h, w, dx, dz, tilt, life, delay = 0) {
    const m = new THREE.Mesh(this.spikeGeo, this.spikeMat);
    m.position.set(x, y - 0.25, z);
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) m.quaternion.setFromAxisAngle(_n.set(dz / len, 0, -dx / len), tilt);
    m.rotateY(Math.random() * 6.28);
    m.scale.set(w, 0.001, w);
    m.visible = false;
    this.scene.add(m);
    this.spikes.push({ m, h, w, life, max: life, delay });
  }

  // 冰冻枪命中：地上炸开一圈冰刺 + 冰雾 + 四散的冰碴。heightAt(x, z) 取地面高度
  iceBlast(pos, R, heightAt) {
    const g = this.glow;
    // 中心闪光
    g.spawn(pos.x, pos.y + 0.8, pos.z, 0, 1.5, 0, 0.2, 1.0, 3.0, COL.frost, COL.ice1, 0, 0);
    // 四散的冰碴
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.28;
      const e = Math.random() * 1.2;
      const sp = 7 + Math.random() * 14;
      g.spawn(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp,
        0.5 + Math.random() * 0.5, 0.26 + Math.random() * 0.14, 0.06, COL.frost, Math.random() < 0.5 ? COL.ice1 : COL.ice2, 18, 1.2);
    }
    // 贴地翻滚的冰雾
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28;
      const sp = R * (0.8 + Math.random() * 1.2);
      g.spawn(pos.x + Math.cos(a) * 0.8, pos.y + 0.3 + Math.random() * 0.8, pos.z + Math.sin(a) * 0.8, Math.cos(a) * sp, 0.6 + Math.random() * 1.6, Math.sin(a) * sp,
        0.7 + Math.random() * 0.6, 0.3, 0.9 + Math.random() * 0.6, COL.frost, COL.ice0, -0.6, 2.2);
    }
    this.dome(pos, R, 0x7fdcff, 0.4);
    this.ring(pos, R * 1.35, 0xdff8ff, 0.5);
    this.ring(pos, R * 0.8, 0x4fbcff, 0.35);
    // 冰刺：中间一根最高，外圈越往外越矮、越往外倒
    if (heightAt) {
      this.spike(pos.x, heightAt(pos.x, pos.z), pos.z, 4.2, 0.85, 0, 0, 0, 1.7);
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + Math.random() * 0.4;
        const k = 0.22 + 0.68 * ((i % 3) / 2) + Math.random() * 0.1;
        const d = R * k;
        const x = pos.x + Math.cos(a) * d;
        const z = pos.z + Math.sin(a) * d;
        this.spike(x, heightAt(x, z), z, (3.4 - k * 2) * (0.8 + Math.random() * 0.5), 0.34 + Math.random() * 0.3, Math.cos(a), Math.sin(a),
          0.2 + k * 0.55, 1.4 + Math.random() * 0.5, k * 0.1);
      }
    }
  }

  // 冰块碎裂：解冻时大块冰碴崩开
  iceShatter(pos) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28;
      const sp = 4 + Math.random() * 7;
      this.lit.spawn(pos.x + Math.cos(a) * 0.4, pos.y + 0.5 + Math.random() * 1.6, pos.z + Math.sin(a) * 0.4, Math.cos(a) * sp, 3 + Math.random() * 7, Math.sin(a) * sp,
        0.7 + Math.random() * 0.5, 0.3 + Math.random() * 0.25, 0.14, COL.ice0, COL.ice1, 26, 0.5);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28;
      const sp = 6 + Math.random() * 10;
      this.glow.spawn(pos.x, pos.y + 1, pos.z, Math.cos(a) * sp, 2 + Math.random() * 8, Math.sin(a) * sp, 0.4 + Math.random() * 0.3, 0.16, 0.05, COL.frost, COL.ice2, 16, 1);
    }
    this.ring(pos, 4.5, 0x9fe8ff, 0.4);
  }

  // 冲击波穹顶：只有轮廓边缘发亮（菲涅尔），相机身处其中时不会被整屏糊白
  dome(pos, R, color, life = 0.3) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV;
        void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.2) * opacity;
          gl_FragColor = vec4(color, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const m = new THREE.Mesh(this.domeGeo, mat);
    m.position.copy(pos);
    if (this.normalAt) m.quaternion.setFromUnitVectors(_up, this.normalAt(pos.x, pos.z, _n));
    this.scene.add(m);
    this.domes.push({ m, R, life, max: life });
  }

  // 贴着坡面扩散的冲击环
  ring(pos, R, color, life = 0.4) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos);
    if (this.normalAt) {
      this.normalAt(pos.x, pos.z, _n);
      m.quaternion.setFromUnitVectors(_up, _n);
      m.position.addScaledVector(_n, 0.3);
    } else {
      m.position.y += 0.3;
    }
    this.scene.add(m);
    this.rings.push({ m, R, life, max: life });
  }

  beam(a, b, color, life = 0.25, width = 0.25) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const m = new THREE.Mesh(this.beamGeo, mat);
    const len = a.distanceTo(b);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _p.copy(b).sub(a).normalize());
    m.scale.set(width, len, width);
    this.scene.add(m);
    this.beams.push({ m, life, max: life, width, len });
    return m;
  }

  lightning(pos) {
    let prev = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 30, pos.y + 110, pos.z + (Math.random() - 0.5) * 30);
    const steps = 7;
    const top = prev.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = new THREE.Vector3(
        lerp(top.x, pos.x, t) + (i < steps ? (Math.random() - 0.5) * 9 : 0),
        lerp(top.y, pos.y, t),
        lerp(top.z, pos.z, t) + (i < steps ? (Math.random() - 0.5) * 9 : 0)
      );
      this.beam(prev, next, 0xdff6ff, 0.35, 0.28);
      prev = next;
    }
    this.dome(pos, 5, 0xbfe8ff, 0.3);
    this.ring(pos, 6, 0xdff6ff, 0.4);
    this.snowBurst(pos, 10, 9);
  }

  update(dt) {
    this.lit.update(dt);
    this.glow.update(dt);
    for (let i = this.domes.length - 1; i >= 0; i--) {
      const d = this.domes[i];
      d.life -= dt;
      const t = 1 - d.life / d.max;
      const s = d.R * (0.25 + 0.75 * (1 - (1 - t) * (1 - t)));
      d.m.scale.setScalar(s);
      d.m.material.uniforms.opacity.value = 1.3 * (1 - t);
      if (d.life <= 0) {
        this.scene.remove(d.m);
        d.m.material.dispose();
        this.domes.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const d = this.rings[i];
      d.life -= dt;
      const t = 1 - d.life / d.max;
      d.m.scale.setScalar(d.R * (0.2 + 0.8 * t));
      d.m.material.opacity = 0.8 * (1 - t);
      if (d.life <= 0) {
        this.scene.remove(d.m);
        d.m.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      const t = clamp(b.life / b.max, 0, 1);
      b.m.material.opacity = t;
      b.m.scale.set(b.width * (0.4 + 0.6 * t), b.len, b.width * (0.4 + 0.6 * t));
      if (b.life <= 0) {
        this.scene.remove(b.m);
        b.m.material.dispose();
        this.beams.splice(i, 1);
      }
    }
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.m);
        this.spikes.splice(i, 1);
        continue;
      }
      // 0.12 秒窜出来（略微冲过头再回弹），最后 0.3 秒缩回去
      const k = Math.min(1, (s.max - s.life) / 0.12);
      const pop = 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
      const out = Math.min(1, s.life / 0.3);
      s.m.visible = true;
      s.m.scale.set(s.w * (0.5 + 0.5 * k) * out, Math.max(0.001, s.h * pop * out), s.w * (0.5 + 0.5 * k) * out);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  addShake(amount) {
    this.shake = Math.min(1.4, Math.max(this.shake, amount));
  }

  clear() {
    this.lit.list.length = 0;
    this.glow.list.length = 0;
    for (const arr of [this.domes, this.rings, this.beams]) {
      for (const d of arr) {
        this.scene.remove(d.m);
        d.m.material.dispose();
      }
      arr.length = 0;
    }
    for (const s of this.spikes) this.scene.remove(s.m);
    this.spikes.length = 0;
    this.shake = 0;
  }
}

// 雪面滑痕
let trailTex = null;
function getTrailTex() {
  if (trailTex) return trailTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 4);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillRect(8, 0, 13, 4);
  g.fillRect(43, 0, 13, 4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(4, 0, 4, 4);
  g.fillRect(21, 0, 4, 4);
  g.fillRect(39, 0, 4, 4);
  g.fillRect(56, 0, 4, 4);
  trailTex = new THREE.CanvasTexture(c);
  return trailTex;
}

export class Trail {
  constructor(scene, color = 0x6f8fd0, N = 170) {
    this.N = N;
    this.count = 0;
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 4);
    this.alpha = new Float32Array(N);
    const uv = new Float32Array(N * 2 * 2);
    const idx = new Uint16Array((N - 1) * 6);
    for (let i = 0; i < N; i++) {
      uv[i * 4] = 0; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = 0;
      if (i < N - 1) {
        const k = i * 2;
        idx.set([k, k + 1, k + 2, k + 1, k + 3, k + 2], i * 6);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    // 'rainbow'：每个点按它是第几个推进来的取色相，颜色跟着雪痕走，不会随数组平移而滚动
    this.rainbow = color === 'rainbow';
    this.pushed = 0;
    this.hc = new THREE.Color();
    const c = new THREE.Color(this.rainbow ? 0xffffff : color);
    this.r = c.r; this.g = c.g; this.b = c.b;
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: getTrailTex(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.broken = true;
    this.px = 0; this.py = 0; this.pz = 0; this.sx = 0; this.sy = 0; this.sz = 0;
  }

  push(x, y, z, sx, sy, sz, alpha) {
    const N = this.N;
    if (this.count >= N) {
      this.pos.copyWithin(0, 6);
      this.alpha.copyWithin(0, 1);
      this.count = N - 1;
    }
    const i = this.count;
    const p = this.pos;
    p[i * 6] = x - sx; p[i * 6 + 1] = y - sy; p[i * 6 + 2] = z - sz;
    p[i * 6 + 3] = x + sx; p[i * 6 + 4] = y + sy; p[i * 6 + 5] = z + sz;
    this.alpha[i] = alpha;
    this.count++;
    this.pushed++;
  }

  // 每帧调用；grounded 为 false 时断开
  add(pos, right, normal, grounded, width = 0.34) {
    if (!grounded) {
      this.broken = true;
      return;
    }
    const dx = pos.x - this.lastX;
    const dz = pos.z - this.lastZ;
    if (dx * dx + dz * dz < 0.36) return;
    const x = pos.x + normal.x * 0.05;
    const y = pos.y + normal.y * 0.05;
    const z = pos.z + normal.z * 0.05;
    const sx = right.x * width, sy = right.y * width, sz = right.z * width;
    if (this.broken) {
      if (this.count > 0) this.push(this.px, this.py, this.pz, this.sx, this.sy, this.sz, 0);
      this.push(x, y, z, sx, sy, sz, 0);
      this.broken = false;
    } else {
      this.push(x, y, z, sx, sy, sz, 1);
    }
    this.px = x; this.py = y; this.pz = z; this.sx = sx; this.sy = sy; this.sz = sz;
    this.lastX = pos.x;
    this.lastZ = pos.z;
    const col = this.col;
    const n = this.count;
    const hc = this.hc;
    for (let i = 0; i < n; i++) {
      const a = this.alpha[i] * Math.min(1, i / 24) * (this.rainbow ? 0.8 : 0.55);
      const k = i * 8;
      let r = this.r, g = this.g, b = this.b;
      if (this.rainbow) {
        hc.setHSL((((this.pushed - n + i) * 0.012) % 1 + 1) % 1, 0.95, 0.55);
        r = hc.r; g = hc.g; b = hc.b;
      }
      col[k] = r; col[k + 1] = g; col[k + 2] = b; col[k + 3] = a;
      col[k + 4] = r; col[k + 5] = g; col[k + 6] = b; col[k + 7] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  reset() {
    this.count = 0;
    this.broken = true;
    this.lastX = 1e9;
    this.geo.setDrawRange(0, 0);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

// 飘雪
export class Snowfall {
  constructor(scene, amount) {
    const n = Math.floor(2600 * amount);
    this.n = n;
    this.box = 70;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 1] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      this.vel[i] = 3 + Math.random() * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const cg = cv.getContext('2d');
    cg.fillStyle = '#fff';
    cg.beginPath();
    cg.arc(16, 16, 14, 0, Math.PI * 2);
    cg.fill();
    this.tex = new THREE.CanvasTexture(cv);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, map: this.tex, size: 0.22, transparent: true, alphaTest: 0.4, opacity: 0.95, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }

  update(dt, cam) {
    this.t += dt;
    const p = this.pos;
    const b = this.box;
    const h = b / 2;
    for (let i = 0; i < this.n; i++) {
      let x = p[i * 3] + Math.sin(this.t + i) * 1.6 * dt - 4 * dt;
      let y = p[i * 3 + 1] - this.vel[i] * dt;
      let z = p[i * 3 + 2];
      // 以相机为中心循环
      x = cam.x + ((((x - cam.x + h) % b) + b) % b) - h;
      y = cam.y + ((((y - cam.y + h) % b) + b) % b) - h;
      z = cam.z + ((((z - cam.z + h) % b) + b) % b) - h;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.tex.dispose();
  }
}
