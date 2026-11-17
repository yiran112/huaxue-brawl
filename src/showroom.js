// 展厅：成长 / 车库 / 角色页的背景。一间暗蓝色的圆形展厅，中间是发光的圆形展台，玩家的角色踩着装备站在台上。
// 整间展厅是封闭的，主程序把它放在离赛道很远的高空，从里面看不到外面的雪山。
import * as THREE from 'three';
import { Skier, lam } from './skier.js';
import { canvasTex, glowTexture } from './props.js';

const R = 18; // 展厅半径
const H = 15; // 展厅高度
export const STAGE_TOP = 0.34; // 展台台面离地高度
// 角色默认朝向：面对镜头（镜头在 +Z 一侧），再侧过去一点
const FACE = Math.PI - 0.62;
const HOLO_FONT = 'italic 900 168px "Arial Black", Impact, "Microsoft YaHei", sans-serif';

const basic = (opts) => new THREE.MeshBasicMaterial({ fog: false, ...opts });
const glow = (opts) => basic({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts });

// 墙面：深蓝渐变 + 一格格墙板 + 竖灯条，绕一圈重复三次
function wallTex() {
  const t = canvasTex(2048, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#030819');
    bg.addColorStop(0.35, '#0a1d58');
    bg.addColorStop(0.8, '#14409c');
    bg.addColorStop(1, '#0b2466');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const n = 8;
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw;
      g.fillStyle = 'rgba(90, 150, 255, 0.10)';
      g.fillRect(x + 26, 170, pw - 52, 250);
      g.strokeStyle = 'rgba(140, 200, 255, 0.32)';
      g.lineWidth = 2;
      g.strokeRect(x + 26, 170, pw - 52, 250);
      g.fillStyle = 'rgba(140, 200, 255, 0.16)';
      g.fillRect(x + 26, 170, pw - 52, 12);
      // 墙板里的斜纹
      g.strokeStyle = 'rgba(140, 200, 255, 0.08)';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(x + 40 + k * 32, 410);
        g.lineTo(x + 100 + k * 32, 190);
        g.stroke();
      }
    }
    // 墙板之间的竖灯条（画布左右两端各画半条，接缝处正好拼成一条）
    g.shadowColor = '#3fc8ff';
    g.shadowBlur = 26;
    g.fillStyle = '#c8f3ff';
    for (let i = 0; i <= n; i++) g.fillRect(i * pw - 4, 120, 8, 340);
    // 墙脚和高处各一圈灯带
    g.fillRect(0, 474, w, 5);
    g.shadowBlur = 14;
    g.fillStyle = 'rgba(160, 225, 255, 0.7)';
    g.fillRect(0, 140, w, 3);
    g.shadowBlur = 0;
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

// 地面：中间亮、四周暗，一圈圈同心线加放射线
function floorTex() {
  return canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    const bg = g.createRadialGradient(c, c, 0, c, c, c);
    bg.addColorStop(0, '#2a55c0');
    bg.addColorStop(0.3, '#16337f');
    bg.addColorStop(0.7, '#0a1a4a');
    bg.addColorStop(1, '#050d2a');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(150, 205, 255, 0.10)';
    g.lineWidth = 2;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 120, c + Math.sin(a) * 120);
      g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      g.stroke();
    }
    for (const [r, alpha, lw] of [[150, 0.5, 4], [215, 0.22, 2], [300, 0.16, 2], [400, 0.12, 2], [490, 0.1, 2]]) {
      g.strokeStyle = `rgba(150, 215, 255, ${alpha})`;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

// 光柱：上亮下淡
function beamTex() {
  return canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

function flat(geo, mat, y) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

export class Showroom {
  constructor() {
    const g = (this.group = new THREE.Group());
    g.visible = false;
    this.t = 0;
    this.yaw = 0;
    this.skier = null;
    this.lookKey = '';
    this.label = null;

    // 外壳
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 72, 1, true), basic({ map: wallTex(), side: THREE.BackSide })).translateY(H / 2));
    g.add(flat(new THREE.CircleGeometry(R, 72), basic({ map: floorTex() }), 0));
    const ceil = flat(new THREE.CircleGeometry(R, 48), basic({ color: 0x030819, side: THREE.BackSide }), H);
    g.add(ceil);

    // 展台：深色底座 + 浅色台面，台沿一圈灯
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.7, 0.24, 72), lam(0x263c78));
    base.position.y = 0.12;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 72), lam(0x8296d2));
    top.position.y = STAGE_TOP - 0.05;
    g.add(base, top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.04, 8, 96), basic({ color: 0x8fe8ff }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = STAGE_TOP - 0.02;
    g.add(rim);
    g.add(flat(new THREE.RingGeometry(1.56, 1.6, 72), basic({ color: 0xcfe2ff }), STAGE_TOP + 0.004));
    // 地上绕着展台的光圈，会慢慢呼吸
    this.ring = flat(new THREE.RingGeometry(3.1, 3.22, 96), glow({ color: 0x6fdcff, opacity: 0.9 }), 0.02);
    g.add(this.ring);
    g.add(flat(new THREE.RingGeometry(4.7, 4.76, 96), glow({ color: 0x6fdcff, opacity: 0.4 }), 0.02));
    // 展台周围地面被照亮的一片
    const pool = flat(new THREE.PlaneGeometry(17, 17), glow({ map: glowTexture(), color: 0x3f7dff, opacity: 0.55 }), 0.015);
    g.add(pool);
    // 从顶上打下来的光柱
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 3.5, 13, 40, 1, true), glow({ map: beamTex(), color: 0x9fd0ff, opacity: 0.1, side: THREE.DoubleSide }));
    beam.position.y = STAGE_TOP + 6.5;
    g.add(beam);

    // 背后的全息大字
    this.holoTex = canvasTex(1024, 256, () => {});
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), glow({ map: this.holoTex, opacity: 0.85 }));
    this.holo.position.set(0, 3.7, -7.5);
    g.add(this.holo);

    // 转台：只转角色，展台本身是圆的不用转
    this.turn = new THREE.Group();
    this.turn.position.y = STAGE_TOP;
    g.add(this.turn);
    // 脚下一团软阴影，顺着装备的方向拉长，跟着角色一起转（展厅里不用实时阴影）
    const shadow = basic({ map: glowTexture(), color: 0x040a26, transparent: true, opacity: 0.7, depthWrite: false });
    this.turn.add(flat(new THREE.PlaneGeometry(2.7, 3.9), shadow, 0.008));
  }

  // 换装备、换造型后重新拼一个角色
  setLook(look) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    if (this.skier) this.skier.dispose();
    this.skier = new Skier({ ...look });
    this.turn.add(this.skier.group);
  }

  setLabel(text) {
    if (text === this.label) return;
    this.label = text;
    const cv = this.holoTex.image;
    const g = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    g.clearRect(0, 0, w, h);
    g.font = HOLO_FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 字太长就整体压窄，保证不出画布
    const k = Math.min(1, (w - 60) / g.measureText(text).width);
    g.save();
    g.translate(w / 2, h / 2 + 8);
    g.scale(k, 1);
    const fill = g.createLinearGradient(0, -90, 0, 90);
    fill.addColorStop(0, 'rgba(120, 220, 255, 0.55)');
    fill.addColorStop(1, 'rgba(60, 120, 255, 0.25)');
    g.fillStyle = fill;
    g.fillText(text, 0, 0);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(170, 235, 255, 0.95)';
    g.strokeText(text, 0, 0);
    g.restore();
    // 横向扫描线：每隔几行擦掉一条，像全息投影
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    for (let y = 0; y < h; y += 9) g.fillRect(0, y, w, 3);
    g.globalCompositeOperation = 'source-over';
    this.holoTex.needsUpdate = true;
  }

  // 鼠标左右拖动：转动角色
  drag(dx) {
    this.yaw += dx * 0.012;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    if (this.skier) this.skier.update(dt, { grounded: true, speed: 0, steer: Math.sin(t * 0.7) * 0.16 });
    this.turn.rotation.y = FACE + this.yaw + Math.sin(t * 0.4) * 0.1;
    this.holo.material.opacity = 0.8 + Math.sin(t * 2.1) * 0.06 + (Math.sin(t * 23) > 0.96 ? -0.25 : 0);
    this.ring.material.opacity = 0.7 + Math.sin(t * 1.6) * 0.25;
  }
}
