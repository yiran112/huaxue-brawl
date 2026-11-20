// 赛后精彩回放：整场比赛每秒记 20 帧每个人的画面姿态（位置、朝向、翻滚、动作），
// 结算时挑出自己最精彩的一下（击飞对手 > 连招 / 大空翻 > 冲线），另起一套人偶和镜头重放这一段，
// 正在跑的比赛照常进行（联机结算时别人还在滑），回放只是换了个画面
import * as THREE from 'three';
import { Skier } from './skier.js';
import { clamp, lerp, damp } from './util.js';

const STEP = 0.05;
const MAX_FRAMES = 6000; // 最多记 5 分钟
const F = 16; // 每人每帧几个数：位置 3、朝向 4、翻滚 4、转向、速度、开关、解冻、手上道具
const PROPS = [null, 'tube', 'gun', 'gatling'];
const TUCK = 1;
const BRAKE = 2;
const GROUND = 4;
const TUMBLE = 8;
const PLANT = 16;
const FROZEN = 32;
const BOOST = 64;
const GRAB = 128;
const SHOWN = 256;
const SHIELD = 512;
const PRE = { ko: 2.8, trick: 2.4, fin: 4 }; // 精彩那一下之前放多久
const POST = { ko: 2.6, trick: 1.4, fin: 1.6 };
const SLOW = 0.35; // 那一下前后 0.6 秒放慢
const Y = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

export class Replay {
  constructor(game) {
    this.game = game;
    this.cam = new THREE.PerspectiveCamera(55, 1, 0.3, 5000);
    this.look = new THREE.Vector3();
    this.on = false;
    this.puppets = [];
    this.btnShown = null;
    this.reset();
    $('btnReplay').addEventListener('click', () => this.play());
    $('btnSkip').addEventListener('click', () => this.stop());
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.on || !['Escape', 'Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        this.stop();
      },
      true
    );
  }

  reset() {
    if (this.on) this.stop();
    this.frames = [];
    this.nextT = 0;
    this.moments = [];
    this.n = 0;
  }

  // 比赛开始：把每个人的 skier.update 包一层，记下每帧传进去的动作参数
  begin(racers) {
    this.reset();
    this.n = racers.length;
    for (const r of racers) {
      const sk = r.skier;
      const orig = sk.update.bind(sk);
      sk.update = (dt, s) => {
        r.lastVis = s;
        orig(dt, s);
      };
    }
  }

  // 记一个精彩时刻，镜头跟着 r；score 越高越优先，同分取后发生的
  mark(kind, r, score, ice = false) {
    if (!this.n || this.on) return;
    this.moments.push({ kind, i: r.idx, t: this.game.raceTime, score, ice, at: r.pos.clone() });
  }

  bump(kind, score) {
    for (const x of this.moments) if (x.kind === kind) x.score = Math.max(x.score, score);
  }

  best() {
    let m = null;
    for (const x of this.moments) if (!m || x.score >= m.score) m = x;
    if (!m || this.frames.length < 10 || m.t < this.frames[0].t) return null;
    return m;
  }

  record() {
    const g = this.game;
    if (!this.n || g.racers.length !== this.n || (g.state !== 'race' && g.state !== 'finished')) return;
    const t = g.raceTime;
    if (t < this.nextT) return;
    this.nextT = t + STEP;
    const d = new Float32Array(this.n * F);
    for (let k = 0; k < this.n; k++) {
      const r = g.racers[k];
      const sk = r.skier;
      const s = r.lastVis || {};
      const o = k * F;
      const p = sk.group.position;
      const q = sk.group.quaternion;
      const sq = sk.spin.quaternion;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = q.x;
      d[o + 4] = q.y;
      d[o + 5] = q.z;
      d[o + 6] = q.w;
      d[o + 7] = sq.x;
      d[o + 8] = sq.y;
      d[o + 9] = sq.z;
      d[o + 10] = sq.w;
      d[o + 11] = s.steer || 0;
      d[o + 12] = s.speed || 0;
      d[o + 13] =
        (s.tuck ? TUCK : 0) | (s.brake ? BRAKE : 0) | (s.grounded ? GROUND : 0) | (s.tumbling ? TUMBLE : 0) | (s.planted ? PLANT : 0) |
        (s.frozen ? FROZEN : 0) | (s.boost ? BOOST : 0) | (s.grab ? GRAB : 0) | (sk.group.visible && !r.out ? SHOWN : 0) | (sk.shield.visible ? SHIELD : 0);
      d[o + 14] = s.thaw || 0;
      d[o + 15] = sk.propTube.visible ? 1 : sk.propGun.visible ? 2 : sk.propGatling.visible ? 3 : 0;
    }
    this.frames.push({ t, d });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  play() {
    const m = this.best();
    if (!m || this.on) return;
    const g = this.game;
    const fr = this.frames;
    this.m = m;
    this.from = Math.max(fr[0].t, m.t - PRE[m.kind]);
    this.to = Math.min(fr[fr.length - 1].t, m.t + POST[m.kind]);
    this.rt = this.from;
    let lo = 0;
    let hi = fr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (fr[mid].t <= this.rt) lo = mid;
      else hi = mid - 1;
    }
    this.fi = lo;
    this.boomed = false;
    this.camInit = false;
    this.puppets = g.racers.map((r) => {
      const p = new Skier(r.skier.look);
      if (r.skier.teamFlag) p.setTeam(r.skier.teamCloth.material.color.getHex());
      g.scene.add(p.group);
      return p;
    });
    this.on = true;
    document.body.classList.add('replaying');
    $('replayBar').classList.remove('hidden');
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    for (const p of this.puppets) p.dispose();
    this.puppets = [];
    for (const r of this.game.racers) {
      r.skier.group.visible = !r.out;
      r.trail.mesh.visible = true;
    }
    $('replayBar').classList.add('hidden');
    document.body.classList.remove('replaying');
  }

  // 每出一帧画面调用一次（dt 是真实时间）
  frame(dt) {
    if (!this.on) {
      this.record();
      this.syncButton();
      return;
    }
    const g = this.game;
    if (g.state === 'menu' || g.racers.length !== this.puppets.length) {
      this.stop();
      return;
    }
    const m = this.m;
    const sdt = dt * (Math.abs(this.rt - m.t) < 0.6 ? SLOW : 1);
    this.rt += sdt;
    if (this.rt >= this.to) {
      this.stop();
      return;
    }
    const fr = this.frames;
    while (this.fi < fr.length - 2 && fr[this.fi + 1].t <= this.rt) this.fi++;
    const A = fr[this.fi];
    const B = fr[Math.min(this.fi + 1, fr.length - 1)];
    const k = B.t > A.t ? clamp((this.rt - A.t) / (B.t - A.t), 0, 1) : 0;
    const a = A.d;
    const b = B.d;
    for (let j = 0; j < this.puppets.length; j++) {
      const p = this.puppets[j];
      const o = j * F;
      const grp = p.group;
      const fl = a[o + 13];
      grp.visible = !!(fl & SHOWN);
      grp.position.set(lerp(a[o], b[o], k), lerp(a[o + 1], b[o + 1], k), lerp(a[o + 2], b[o + 2], k));
      _qa.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
      _qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
      grp.quaternion.slerpQuaternions(_qa, _qb, k);
      _qa.set(a[o + 7], a[o + 8], a[o + 9], a[o + 10]);
      _qb.set(b[o + 7], b[o + 8], b[o + 9], b[o + 10]);
      p.spin.quaternion.slerpQuaternions(_qa, _qb, k);
      p.setProp(PROPS[a[o + 15]]);
      p.shield.visible = !!(fl & SHIELD);
      p.ice.visible = !!(fl & FROZEN);
      p.update(sdt, {
        tuck: !!(fl & TUCK),
        steer: lerp(a[o + 11], b[o + 11], k),
        brake: !!(fl & BRAKE),
        grounded: !!(fl & GROUND),
        tumbling: !!(fl & TUMBLE),
        planted: !!(fl & PLANT),
        speed: lerp(a[o + 12], b[o + 12], k),
        frozen: !!(fl & FROZEN),
        thaw: a[o + 14],
        hasProp: a[o + 15] > 0,
        boost: !!(fl & BOOST),
        grab: !!(fl & GRAB),
      });
    }
    for (const r of g.racers) {
      r.skier.group.visible = false;
      r.trail.mesh.visible = false;
    }
    if (m.kind === 'ko' && !this.boomed && this.rt >= m.t) {
      this.boomed = true;
      if (m.ice) g.fx.iceBurst(m.at);
      else g.fx.snowBurst(m.at, 40, 8);
      g.fx.ring(m.at, 3.5, m.ice ? 0x66d9ff : 0xffd23c, 0.45);
      g.sfx.boom(0.4);
    }
    // 镜头：跟在主角身后，慢慢绕到侧面
    const fp = this.puppets[m.i] ? this.puppets[m.i].group : this.puppets[0].group;
    _f.set(0, 0, -1).applyQuaternion(fp.quaternion);
    _f.y = 0;
    if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
    _f.normalize();
    const prog = (this.rt - this.from) / Math.max(0.1, this.to - this.from);
    _v.copy(_f).multiplyScalar(-7.5).applyAxisAngle(Y, -0.5 + prog * 1.3);
    _v.add(fp.position);
    _v.y += 3.2;
    const c = g.course;
    _v.y = Math.max(_v.y, c.height(_v.x, _v.z) + 1.5);
    const cam = this.cam;
    const asp = window.innerWidth / window.innerHeight;
    if (cam.aspect !== asp) {
      cam.aspect = asp;
      cam.updateProjectionMatrix();
    }
    if (!this.camInit) {
      this.camInit = true;
      cam.position.copy(_v);
      this.look.copy(fp.position);
    } else {
      cam.position.lerp(_v, damp(5, dt));
      this.look.lerp(fp.position, damp(8, dt));
    }
    _v.copy(this.look);
    _v.y += 1.1;
    cam.lookAt(_v);
    g.sky.position.copy(cam.position);
    g.focusShadow(fp.position);
  }

  syncButton() {
    const show = this.game.state === 'results' && !!this.best();
    if (show === this.btnShown) return;
    this.btnShown = show;
    $('btnReplay').classList.toggle('hidden', !show);
  }
}
