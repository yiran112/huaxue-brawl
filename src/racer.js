// 选手：滑雪物理 + 翻滚 + 机器人 AI
import * as THREE from 'three';
import { Skier } from './skier.js';
import { Trail, COL } from './fx.js';
import { nameSprite } from './props.js';
import { clamp, lerp, damp, wrapAngle } from './util.js';
import { WEAPONS } from './config.js';
import { gearMods, trailColor } from './gear.js';
import { Chain } from './chain.js';

const G = 24;
const TAU = Math.PI * 2;
const FLIP_RATE = TAU / 0.85; // 一个跟头 0.85 秒
const FLIP_TOL = 0.8; // 落地时允许的角度误差（弧度）
const SPIN_RATE = TAU / 0.75; // 转体一圈 0.75 秒
const SPIN_TOL = 0.85;
const SPIN_SNAP = 1.0; // 松手时离整圈不到这么多，会自己慢慢转正
const GRAB_MIN = 0.25; // 抓板至少抓这么久才算一招
const DRIFT_L1 = 0.55; // 漂移蓄力：小喷射
const DRIFT_L2 = 1.2; // 漂移蓄力：大喷射
const SHORTCUT_CHANCE = [0, 0.12, 0.4]; // 机器人按难度（简单/普通/困难）尝试近道的概率
const PLANT_IMPACT = 10; // 翻滚中砸向地面的速度超过它，就一头栽进雪里
const PLANT_TIME = 1.25; // 倒插在雪里蹬腿的时间
const PLANT_DEPTH = 0.95; // 埋多深：正好埋到腰，只剩两条腿在外面
const NET_DELAY = 0.1; // 联机：别人的角色按 0.1 秒前的状态显示，中间丢一两个包也不抖
const NET_EXTRAP = 0.25; // 联机：断流时最多顺着速度往前推这么久
const Y = new THREE.Vector3(0, 1, 0);
const XA = new THREE.Vector3(1, 0, 0);
const ZA = new THREE.Vector3(0, 0, 1);
const _f = new THREE.Vector3();
const _fs = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Racer {
  // opt.bot：由 AI 控制；opt.owned：由本机负责模拟（联机时别人的角色是 false）；opt.id：联机时对应的玩家编号
  constructor(game, idx, look, name, isPlayer, opt = {}) {
    this.game = game;
    this.idx = idx;
    this.name = name;
    this.look = look;
    this.isPlayer = isPlayer; // 本机玩家自己
    this.isBot = opt.bot !== undefined ? !!opt.bot : !isPlayer;
    this.owned = opt.owned !== undefined ? !!opt.owned : true;
    this.netId = opt.id || 0;
    this.snaps = []; // 联机：收到的状态，按时间排好，用来插值
    this.netOff = 0; // 联机：对方时钟和本机时钟的差
    this.netN = 0;
    this.tpTs = 0;
    this.vis = { steer: 0, tuck: false, brake: false }; // 这一帧的姿态（发给别人用）
    this.skier = new Skier(look);
    game.scene.add(this.skier.group);
    this.trail = new Trail(game.scene, trailColor(look) ?? game.trailColor);
    // 装备属性（强化等级由调用方给）、队伍（-1 不分队）、是否已被淘汰
    this.gear = look.gear || 'ski';
    this.mods = gearMods(this.gear, opt.up);
    this.team = opt.team ?? -1;
    this.out = false;
    this.surf = 0; // 脚下地表：0 普通 / 1 冰面 / 2 深雪
    this.padCool = 0;
    if (this.team >= 0) this.skier.setTeam(this.team === 0 ? 0xe8343a : 0x2f7bff);
    this.label = null;
    if (!isPlayer) {
      // 真人对手的名字用青色，机器人用白色
      this.label = nameSprite(name, this.isBot ? '#ffffff' : '#7fe0ff');
      this.label.scale.set(1.7, 0.425, 1);
      this.label.position.y = 2.0;
      this.skier.group.add(this.label);
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.normal = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.grounded = true;
    this.state = 'ready';
    // flip：空中翻跟头方向，+1 后空翻 / -1 前空翻；spin：空中转体方向（同 steer）；grab：空中抓板
    this.input = { steer: 0, tuck: false, brake: false, jump: false, drift: false, flip: 0, spin: 0, grab: false };
    this.weapon = null;
    this.ammo = 0;
    this.shieldT = 0;
    this.boostT = 0;
    this.turboT = 0; // 漂移 / 空翻奖励的小喷射
    this.flip = 0; // 本次腾空已翻过的角度
    this.spinA = 0; // 本次腾空已转过的角度（绕竖直轴）
    this.grabbing = false;
    this.grabT = 0; // 本次腾空抓板的总时长
    this.chain = new Chain(this);
    this.tricks = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftPts = 0; // 这一段漂移攒的技巧分
    this.driftOutT = 0;
    this.liftZ = false;
    this.wasGrounded = true;
    this.inShort = null; // 所在的近道（岔路对象）
    this.onIce = false;
    this.invulnT = 0;
    this.frozenT = 0;
    this.tumbleT = 0;
    this.plantT = 0; // 倒插在雪里的剩余时间
    this.plantK = 0; // 埋进雪里的程度 0~1（画面用）
    this.planted = false; // 这次被击飞已经栽过一回
    this.airT = 0;
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinSpeed = 0;
    this.d = 0;
    this.rank = 1;
    this.finished = false;
    this.finishTime = 0;
    this.stuckT = 0;
    this.offT = 0;
    this.speed = 0;
    this.slip = 0;
    this.hookT = 0;
    this.hookTarget = null;
    this.sprayAcc = 0;
    this.hits = 0;
    this.t = Math.random() * 10;
    this.cdMul = 1;
    // sc：正在走的近道 { b, i }；scSeen：已经做过“走不走近道”决定的岔路；flipN：这次腾空打算翻几圈
    // spinN / spinDir：这次腾空打算转几圈、往哪边；grabEnd：抓板抓到腾空第几秒
    this.ai = { lane: (Math.random() * 2 - 1) * 0.6, laneT: Math.random() * 3, useT: 0, holdT: 0, steer: 0, sc: null, scSeen: new Set(), flipN: 0, spinN: 0, spinDir: 1, grabEnd: 0 };
  }

  // 清掉这次腾空的空中动作
  clearAir() {
    this.flip = 0;
    this.spinA = 0;
    this.grabbing = false;
    this.grabT = 0;
  }

  place(x, z, yaw) {
    const c = this.game.course;
    this.pos.set(x, c.height(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    c.normal(x, z, this.normal);
    this.up.copy(this.normal);
    this.grounded = true;
    this.d = -z;
    this.trail.reset();
    this.skier.spin.quaternion.identity();
  }

  respawn() {
    const c = this.game.course;
    const rp = c.respawnPoint(this.pos.x, clamp(this.d, 0, c.L + 60));
    const yaw = rp.yaw;
    this.place(rp.x, -rp.d, yaw);
    this.vel.set(-Math.sin(yaw) * 14, 0, -Math.cos(yaw) * 14);
    this.state = 'ski';
    this.tumbleT = 0;
    this.plantT = 0;
    this.frozenT = 0;
    this.invulnT = 2;
    this.stuckT = 0;
    this.offT = 0;
    this.chain.break('复位');
    this.clearAir();
    this.drifting = false;
    this.driftCharge = 0;
    this.driftPts = 0;
    this.ai.sc = null;
  }

  // 结束漂移：score 时把这段漂移记进技巧链；boost 时蓄力够了再给一次小喷射
  endDrift(score, boost = score) {
    const c = this.driftCharge;
    const pts = this.driftPts;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftPts = 0;
    this.driftOutT = 0.4; // 收尾：这段时间里残余的横滑继续转成前进速度
    this.chain.setLive(0);
    if (!score) return;
    const lv = c >= DRIFT_L2 ? 2 : c >= DRIFT_L1 && boost ? 1 : 0;
    if (pts >= 40) this.chain.add(lv === 2 && boost ? '漂移大喷射' : lv ? '漂移喷射' : '漂移', pts + (lv === 2 && boost ? 250 : lv ? 100 : 0));
    if (!boost || c < DRIFT_L1) return;
    const big = c >= DRIFT_L2;
    this.turboT = Math.max(this.turboT, big ? 1.0 : 0.5);
    this.game.onDriftBoost(this, big);
  }

  // 同队（团队赛）：道具互不伤害
  isAlly(o) {
    return this.team >= 0 && !!o && o !== this && o.team === this.team;
  }

  // 翻着跟头落地：转够整圈就加速，没转正就摔
  landTrick() {
    const turns = this.flip / TAU;
    const n = Math.round(turns);
    const err = Math.abs(turns - n) * TAU;
    const back = this.flip > 0;
    // 落地时头是不是朝下
    const headDown = Math.cos(this.flip) < -0.2;
    this.flip = 0;
    if (err > FLIP_TOL * this.mods.flipTol) {
      _v.set(0, 4, 0);
      if (!this.knock(_v, 1.2, null, '空翻没转完')) this.vel.multiplyScalar(0.6);
      else if (headDown) this.plant();
      return;
    }
    if (n === 0) return;
    const k = Math.min(3, Math.abs(n));
    this.turboT = Math.max(this.turboT, 0.5 + 0.55 * k);
    this.vel.x += -Math.sin(this.yaw) * (2 + 2.5 * k);
    this.vel.z += -Math.cos(this.yaw) * (2 + 2.5 * k);
    this.tricks += k;
    this.game.onTrick(this, back ? '后空翻' : '前空翻', Math.abs(n));
  }

  // 预估还要多久落地（机器人决定翻不翻跟头用）
  predictAir() {
    const c = this.game.course;
    const h = 0.05;
    let x = this.pos.x;
    let y = this.pos.y;
    let z = this.pos.z;
    let vy = this.vel.y;
    for (let t = h; t < 3.2; t += h) {
      x += this.vel.x * h;
      z += this.vel.z * h;
      vy -= G * h;
      y += vy * h;
      if (y <= c.height(x, z)) return t;
    }
    return 3.2;
  }

  giveWeapon(id) {
    this.weapon = id;
    this.ammo = WEAPONS[id].ammo;
    this.ai.useT = 0.7 + Math.random() * 2.2;
    this.ai.holdT = 0;
    this.skier.setProp(WEAPONS[id].prop);
  }

  consumeAmmo() {
    if (!this.owned) return; // 别人的弹药以他发来的状态为准
    this.ammo--;
    if (this.ammo <= 0) {
      this.weapon = null;
      this.skier.setProp(null);
    }
  }

  // 被击飞。返回是否生效。联机时只有负责这个角色的那台机器说了算
  knock(impulse, dur, source, cause) {
    if (!this.owned || this.out) return false;
    if (this.finished || this.state === 'ready') return false;
    if (this.invulnT > 0) return false;
    if (this.isAlly(source)) return false;
    const k = this.mods.knock;
    dur *= k;
    if (impulse) impulse.multiplyScalar(0.5 + 0.5 * k);
    if (this.shieldT > 0) {
      this.shieldT = 0;
      this.invulnT = 0.5;
      this.game.fx.ring(this.pos, 4, 0x66d9ff, 0.35);
      this.game.sfxAt('shield', this.pos);
      return false;
    }
    this.state = 'tumble';
    this.tumbleT = dur;
    this.plantT = 0;
    this.planted = false;
    this.frozenT = 0;
    this.boostT = 0;
    this.turboT = 0;
    this.hookT = 0;
    this.flip = 0;
    this.drifting = false;
    this.driftCharge = 0;
    if (impulse) this.vel.add(impulse);
    this.grounded = false;
    this.pos.y += 0.25;
    const a = Math.random() * 6.28;
    this.spinAxis.set(Math.cos(a), (Math.random() - 0.5) * 0.6, Math.sin(a)).normalize();
    this.spinSpeed = 9 + Math.random() * 7;
    this.hits++;
    this.game.onKnock(this, source, cause);
    return true;
  }

  freeze(dur, source) {
    if (!this.owned || this.out) return false;
    if (this.finished || this.invulnT > 0 || this.state !== 'ski') return false;
    if (this.isAlly(source)) return false;
    if (this.shieldT > 0) {
      this.shieldT = 0;
      this.invulnT = 0.5;
      return false;
    }
    this.frozenT = dur;
    this.boostT = 0;
    this.turboT = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.game.onKnock(this, source, '冰冻枪', true);
    return true;
  }

  // 头朝下栽进雪里：定在原地蹬腿，过一会儿自己拔出来
  plant() {
    const c = this.game.course;
    this.planted = true;
    this.plantT = PLANT_TIME;
    this.state = 'tumble';
    this.tumbleT = PLANT_TIME;
    this.vel.set(0, 0, 0);
    this.pos.y = c.height(this.pos.x, this.pos.z);
    c.normal(this.pos.x, this.pos.z, this.normal);
    this.grounded = true;
    this.game.onPlant(this);
  }

  // 从雪里拔出来：往前上方蹦一下，接着滑
  unplant() {
    this.plantT = 0;
    this.tumbleT = 0;
    this.state = 'ski';
    this.invulnT = 1.6;
    // 尽量朝下坡方向
    const dy = wrapAngle(this.yaw);
    if (Math.abs(dy) > 1.2) this.yaw = Math.sign(dy) * 1.0;
    this.vel.set(-Math.sin(this.yaw) * 14, 6.5, -Math.cos(this.yaw) * 14);
    this.grounded = false;
    this.pos.y += 0.1;
    this.game.onUnplant(this);
  }

  update(dt) {
    const game = this.game;
    const course = game.course;
    this.t += dt;
    if (this.out) return;
    if (!this.owned) {
      this.updateRemote(dt);
      return;
    }
    if (this.state === 'ready') {
      this.syncVisual(dt);
      return;
    }
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.padCool > 0) this.padCool -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.turboT > 0) this.turboT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (this.frozenT <= 0) {
        // 冰坨崩碎
        game.fx.iceShatter(this.pos);
        game.sfxAt(game.sfx.shatter ? 'shatter' : 'freeze', this.pos, 0.9);
        this.invulnT = 0.8;
      } else if (Math.random() < dt * 14 && game.nearCamera(this.pos, 130)) {
        // 冻着的时候身上不停往下掉冰碴、冒冷气
        const a = Math.random() * 6.28;
        game.fx.glow.spawn(this.pos.x + Math.cos(a) * 0.8, this.pos.y + 0.4 + Math.random() * 1.8, this.pos.z + Math.sin(a) * 0.8,
          this.vel.x * 0.5, 1 + Math.random() * 1.5, this.vel.z * 0.5, 0.6, 0.1, 0.3, COL.frost, COL.ice0, -0.5, 1.5);
      }
    }
    // 所在地表：道外距离、是否在近道 / 冰面上
    const off = course.offTrack(this.pos.x, this.d);
    this.inShort = course._us < 1.5 && course._um > 1 ? course._br : null;
    this.onIce = !!this.inShort && course._us < 0 && this.d > this.inShort.dIce;
    this.surf = course.zones.length ? course.surfaceKind(this.pos.x, this.d) : 0;
    const mods = this.mods;
    if (this.isBot && !this.finished) this.think(dt);

    const inp = this.input;
    const controllable = this.state === 'ski' && this.frozenT <= 0;
    let steer = controllable ? inp.steer : 0;
    let tuck = controllable && inp.tuck;
    let brake = controllable && inp.brake;
    if (this.finished) {
      steer = clamp(wrapAngle(this.yaw) * 2, -1, 1);
      tuck = false;
      brake = true;
    }

    // 漂移：按住漂移键 + 方向进入；松开时按蓄力给小喷射
    if (this.drifting) {
      if (!controllable || !inp.drift || this.finished || this.speed < 7 || (!this.grounded && this.airT > 0.35)) {
        this.endDrift(controllable && !this.finished && this.grounded);
      } else if (steer * this.driftDir < -0.6) {
        // 一直按着漂移键反打方向：结算这一段，直接换边接着漂
        this.endDrift(this.grounded);
        this.drifting = true;
        this.driftDir = Math.sign(steer);
      }
    } else if (controllable && inp.drift && this.grounded && !this.finished && this.speed > 9 && Math.abs(steer) > 0.3) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
    }

    // 转向
    if (controllable) {
      let turn = (this.grounded ? 2.25 * mods.turn * (this.surf === 1 ? 0.8 : 1) : 0.8) / (1 + this.speed / 75);
      let st = steer;
      if (this.drifting && this.grounded) {
        // 漂移中转得更急；反打方向可以把弧线放大，但不会反向
        turn *= 1.9;
        st = this.driftDir * clamp(0.55 + 0.45 * steer * this.driftDir, 0.1, 1);
      }
      this.yaw -= st * turn * dt;
    }
    const vel = this.vel;
    vel.y -= G * dt;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.slip = 0;

    this.liftZ = course.liftZone(this.d);
    if (this.grounded) {
      const n = this.normal;
      const vn = vel.dot(n);
      // 跳台口 / 断崖边 / 波浪坡：地面让开时保留离地的速度分量，人才飞得出去
      const lift = this.liftZ && vn > 0 ? vn : 0;
      vel.addScaledVector(n, -vn);
      if (this.state === 'tumble') {
        const sp = vel.length();
        const dec = (11 + sp * 0.5) * dt;
        if (sp > dec) vel.multiplyScalar((sp - dec) / sp);
        else vel.set(0, 0, 0);
      } else {
        _fs.copy(_f).addScaledVector(n, -_f.dot(n)).normalize();
        let vF = vel.dot(_fs);
        _lat.copy(vel).addScaledVector(_fs, -vF);
        this.slip = _lat.length();
        const drifting = this.drifting;
        let grip = this.frozenT > 0 ? 1.5 : drifting ? 5.5 : brake ? 4.5 : 8;
        if (this.surf === 1) grip *= 0.45;
        const sp2 = vF * vF + this.slip * this.slip;
        _lat.multiplyScalar(Math.exp(-grip * dt));
        if (this.driftOutT > 0) this.driftOutT -= dt;
        if ((drifting || this.driftOutT > 0) && vF > 0) {
          // 漂移：横滑磨掉的速度大部分转回前进方向，所以急转也不怎么掉速
          vF += (Math.sqrt(Math.max(0, sp2 - _lat.lengthSq())) - vF) * 0.92;
          if (drifting) this.driftCharge += dt * clamp(this.slip / 5, 0, 1) * mods.drift;
        }
        let cd = (tuck ? 0.004 : 0.006) * this.cdMul * mods.cd;
        if (this.onIce) cd *= 0.55;
        else if (this.surf === 1) cd *= 0.6;
        let acc = 0;
        if (this.boostT > 0) {
          // 氮气：强推力 + 固定阻力，极速约 55 m/s（200 km/h）
          acc += 20;
          cd = 0.009;
        }
        if (this.turboT > 0) acc += 13;
        acc -= cd * vF * Math.abs(vF);
        acc -= 0.5 * Math.sign(vF);
        if (tuck && vF < 11) acc += 6.5 * mods.acc;
        // 赛道外的深雪减速
        if (off > 0 && vF > 10) acc -= Math.min(off, 14) * 1.0;
        // 道内的深雪区
        if (this.surf === 2 && vF > 8) acc -= 7 * mods.powder;
        // 冻成冰坨：很快慢下来，只能慢吞吞地往下出溜
        if (this.frozenT > 0 && vF > 8) acc -= 16;
        if (brake) {
          const b = (this.finished ? 22 : 16) * dt;
          if (Math.abs(vF) <= b) vF = 0;
          else vF -= Math.sign(vF) * b;
        }
        vF += acc * dt;
        // 加速带
        if (this.padCool <= 0 && this.state === 'ski' && course.pads.length && course.padAt(this.pos.x, this.d)) {
          this.padCool = 0.6;
          this.turboT = Math.max(this.turboT, 1.2);
          vF += 3;
          game.onPad(this);
        }
        vel.copy(_fs).multiplyScalar(vF).add(_lat);
        // 起跳
        if (controllable && inp.jump && !this.finished) {
          vel.y += 8.5;
          this.grounded = false;
          this.pos.y += 0.06;
          game.fx.snowBurst(this.pos, 3, 3);
        }
      }
      if (lift) vel.addScaledVector(n, lift);
    } else {
      // 空中微调
      const f = Math.exp(-0.08 * dt);
      vel.x *= f;
      vel.z *= f;
      if (controllable) {
        vel.x += Math.cos(this.yaw) * steer * 5 * mods.airSteer * dt;
        vel.z += -Math.sin(this.yaw) * steer * 5 * mods.airSteer * dt;
        // 翻跟头
        if (inp.flip && !this.finished) this.flip += inp.flip * FLIP_RATE * mods.flip * dt;
      }
    }
    inp.jump = false;

    // 钩爪牵引
    if (this.hookT > 0 && this.hookTarget) {
      this.hookT -= dt;
      const tg = this.hookTarget;
      _v.copy(tg.pos).sub(this.pos);
      const dist = _v.length();
      if (dist < 3.2 || tg.finished) {
        this.hookT = 0;
        if (dist < 3.2) tg.knock(_v.normalize().multiplyScalar(6).setY(7), 1.3, this, '钩爪');
      } else {
        _v.multiplyScalar(1 / dist);
        // 只在接近速度不足时加速，避免无限叠加
        if (vel.dot(_v) < tg.vel.dot(_v) + 24) vel.addScaledVector(_v, 55 * dt);
        this.yaw = lerp(this.yaw, this.yaw + wrapAngle(Math.atan2(-_v.x, -_v.z) - this.yaw), damp(6, dt));
      }
    }

    // 倒插在雪里：钉在原地
    if (this.plantT > 0) {
      vel.set(0, 0, 0);
      this.pos.y = course.height(this.pos.x, this.pos.z);
    }
    this.pos.addScaledVector(vel, dt);
    this.d = -this.pos.z;
    this.speed = Math.hypot(vel.x, vel.z);

    // 地面
    const h = course.height(this.pos.x, this.pos.z);
    if (this.pos.y <= h) {
      const wasAir = !this.grounded;
      this.pos.y = h;
      course.normal(this.pos.x, this.pos.z, this.normal);
      this.grounded = true;
      if (wasAir) {
        const impact = -vel.dot(this.normal);
        if (impact > 3) {
          game.fx.snowBurst(this.pos, Math.min(10, 3 + impact * 0.4), Math.min(9, impact * 0.5));
          game.sfxAt('thud', this.pos, Math.min(1, impact / 22));
        }
        if (this.state === 'tumble' && impact > PLANT_IMPACT && !this.planted) {
          // 摔得够狠：一头栽进雪里
          this.plant();
        } else if (this.state === 'tumble' && impact > 5) {
          vel.addScaledVector(this.normal, impact * 1.35);
          vel.multiplyScalar(0.8);
          this.grounded = false;
          this.pos.y += 0.05;
          game.sfxAt('boing', this.pos, Math.min(1, impact / 12));
        } else if (this.state === 'ski' && this.flip !== 0) {
          this.landTrick();
        }
        this.airT = 0;
      }
    } else if (this.grounded && this.pos.y - h < (this.liftZ ? 0.03 : 0.05 + this.speed * dt * 0.1)) {
      this.pos.y = h;
      course.normal(this.pos.x, this.pos.z, this.normal);
    } else {
      this.grounded = false;
      this.airT += dt;
    }

    // 障碍碰撞
    if (this.pos.y - h < 2.2) {
      course.forObstacles(this.d, 12, (o) => {
        const dx = this.pos.x - o.x;
        const dz = this.pos.z - o.z;
        const rr = o.r + 0.45;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) return;
        const dist = Math.sqrt(d2) || 0.01;
        const nx = dx / dist;
        const nz = dz / dist;
        this.pos.x = o.x + nx * rr;
        this.pos.z = o.z + nz * rr;
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          vel.x -= nx * vn * 1.4;
          vel.z -= nz * vn * 1.4;
          if (-vn > 9 * this.mods.crash && this.state === 'ski' && !this.finished) {
            vel.multiplyScalar(0.55);
            game.fx.snowBurst(this.pos, 8, 7);
            game.sfxAt('thud', this.pos, 1);
            if (this.invulnT <= 0) {
              _v.set(0, 5, 0);
              this.knock(_v, 1.25, null, o.kind === 'tree' ? '撞树' : '撞岩石');
            }
          } else {
            vel.multiplyScalar(0.85);
          }
        }
      });
    }

    // 翻滚恢复
    if (this.plantT > 0) {
      this.plantT -= dt;
      if (this.plantT <= 0) this.unplant();
    } else if (this.state === 'tumble') {
      this.tumbleT -= dt;
      if ((this.tumbleT <= 0 && this.grounded) || this.tumbleT < -1.6) {
        this.state = 'ski';
        this.invulnT = 1.6;
        if (this.speed > 4) this.yaw = Math.atan2(-vel.x, -vel.z);
        // 尽量朝下坡方向
        const dy = wrapAngle(this.yaw);
        if (Math.abs(dy) > 1.2) this.yaw = Math.sign(dy) * 1.0;
      }
    }

    // 机器人刚离地时，估一下滞空时间，够长就翻跟头
    if (this.wasGrounded && !this.grounded && !this.isPlayer && this.state === 'ski' && !this.finished) {
      this.ai.flipN = 0;
      if (Math.random() < [0.3, 0.6, 0.9][game.rules.difficulty]) {
        this.ai.flipN = clamp(Math.floor((this.predictAir() - 0.3) / (0.85 / this.mods.flip)), 0, 2);
      }
    }
    this.wasGrounded = this.grounded;

    // 卡住 / 出界自动复位
    if (this.state === 'ski' && !this.finished) {
      const u = course.offTrack(this.pos.x, this.d);
      if (u > 26) this.offT += dt;
      else this.offT = 0;
      // 玩家主动刹车停下不算卡住
      if (this.speed < 2.5 && !(this.isPlayer && inp.brake)) {
        const before = this.stuckT;
        this.stuckT += dt;
        if (this.isPlayer && before < 2.5 && this.stuckT >= 2.5) game.tip('卡住了？转向后按 W 撑杖，或按 R 复位', 3);
      } else {
        this.stuckT = 0;
      }
      if (this.stuckT > (this.isPlayer ? 6 : 3) || this.offT > (this.isPlayer ? 3.5 : 1.5) || u > 70) this.respawn();
    }

    this.emitJets();

    const vis = this.vis;
    vis.steer = this.drifting ? this.driftDir * 1.5 : steer;
    vis.tuck = tuck || this.flip !== 0;
    vis.brake = brake;
    this.syncVisual(dt, vis.steer, vis.tuck, vis.brake);
  }

  // 氮气火焰 / 小喷射的蓝色尾焰
  emitJets() {
    const game = this.game;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (this.boostT > 0) {
      _v.copy(this.pos).addScaledVector(_f, -0.9);
      _v.y += 0.5;
      game.fx.flame(_v, -_f.x * 8 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -_f.z * 8 + (Math.random() - 0.5) * 3, 0.3);
    } else if (this.turboT > 0 && game.nearCamera(this.pos, 140)) {
      _v.copy(this.pos).addScaledVector(_f, -0.8);
      game.fx.glow.spawn(_v.x, _v.y + 0.4, _v.z, -_f.x * 7 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, -_f.z * 7 + (Math.random() - 0.5) * 2,
        0.16 + Math.random() * 0.12, 0.2, 0.06, COL.ice0, COL.ice1, 0, 0);
    }
  }

  // ---------- 联机：别人负责的角色 ----------
  // 收到一条状态。对方的时间戳是他自己的时钟，这里估一个时钟差：取“最小延迟”，并允许慢慢往上漂
  netPush(s) {
    const S = this.snaps;
    if (S.length && s.ts <= S[S.length - 1].ts) return;
    const off = performance.now() / 1000 - s.ts;
    this.netOff = this.netN ? Math.min(off, this.netOff + 0.002) : off;
    this.netN++;
    S.push(s);
    if (S.length > 24) S.shift();
  }

  // 换了发送方（房主移交）：旧的时间戳作废
  netReset() {
    this.snaps.length = 0;
    this.netN = 0;
  }

  // 这个角色改由本机负责（房主走了自己成了房主 / 断线后转单机 / 真人掉线由机器人顶上）
  takeOver(asBot) {
    if (asBot) this.isBot = true;
    if (this.owned) return;
    this.owned = true;
    this.netReset();
    this.input = { steer: 0, tuck: false, brake: false, jump: false, drift: false, flip: 0 };
    this.drifting = false;
    this.driftCharge = 0;
    this.flip = 0;
    this.hookT = 0;
    this.stuckT = 0;
    this.offT = 0;
    this.airT = 0;
    this.wasGrounded = this.grounded;
    this.ai.sc = null;
    if (this.state === 'tumble') {
      this.tumbleT = 0.6;
      this.planted = true;
      if (this.plantT > 0) this.plantT = 0.5;
    }
  }

  // 按收到的状态插值，只管画面，不做物理
  updateRemote(dt) {
    const game = this.game;
    const course = game.course;
    const S = this.snaps;
    if (!S.length) {
      this.syncVisual(dt);
      return;
    }
    const rt = performance.now() / 1000 - this.netOff - NET_DELAY;
    const last = S[S.length - 1];
    let a = S[0];
    let b = S[0];
    if (rt >= last.ts) {
      a = b = last;
    } else {
      for (let i = S.length - 1; i > 0; i--) {
        if (S[i - 1].ts <= rt) {
          a = S[i - 1];
          b = S[i];
          break;
        }
      }
    }
    let k = b.ts > a.ts ? clamp((rt - a.ts) / (b.ts - a.ts), 0, 1) : 0;
    // 一下子挪了 20 米以上：是复位，不是滑过去的
    if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2 > 400) {
      if (this.tpTs !== b.ts) {
        this.tpTs = b.ts;
        this.trail.reset();
      }
      a = b;
      k = 0;
    }
    const prevVy = this.vel.y;
    const wasGrounded = this.grounded;
    const wasState = this.state;
    this.pos.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
    this.vel.set(lerp(a.vx, b.vx, k), lerp(a.vy, b.vy, k), lerp(a.vz, b.vz, k));
    this.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
    const s = a; // 开关类的状态用已经发生的那一条
    const planted = !!(s.f2 & 4);
    // 后面没有新包了：顺着速度往前推一小段，免得原地顿住
    if (a === b && s.state !== 'ready' && !planted) {
      const ex = clamp(rt - a.ts, 0, NET_EXTRAP);
      if (ex > 0) this.pos.addScaledVector(this.vel, ex);
    }

    if (s.state === 'tumble' && wasState !== 'tumble') {
      const ang = Math.random() * 6.28;
      this.spinAxis.set(Math.cos(ang), (Math.random() - 0.5) * 0.6, Math.sin(ang)).normalize();
      this.spinSpeed = 9 + Math.random() * 7;
    }
    this.state = s.state;
    this.drifting = s.drifting;
    this.driftDir = s.f2 & 8 ? 1 : -1;
    this.driftCharge = s.charge;
    this.boostT = s.f2 & 1 ? 1 : 0;
    this.turboT = s.f2 & 2 ? 1 : 0;
    this.shieldT = s.shield;
    this.invulnT = s.invuln;
    this.flip = s.flip !== 0 && b.flip !== 0 ? lerp(a.flip, b.flip, k) : s.flip;
    if (s.weapon !== this.weapon) {
      this.weapon = s.weapon;
      this.skier.setProp(s.weapon ? WEAPONS[s.weapon].prop : null);
    }
    this.ammo = s.ammo;

    // 地面
    const h = course.height(this.pos.x, this.pos.z);
    if (s.grounded || this.pos.y < h) this.pos.y = h;
    if (s.grounded) course.normal(this.pos.x, this.pos.z, this.normal);
    if (s.grounded && !wasGrounded && prevVy < -4 && wasState !== 'ready' && game.nearCamera(this.pos, 150)) {
      const impact = -prevVy;
      game.fx.snowBurst(this.pos, Math.min(10, 3 + impact * 0.4), Math.min(9, impact * 0.5));
      game.sfxAt('thud', this.pos, Math.min(1, impact / 22));
    }
    this.grounded = s.grounded;
    this.d = -this.pos.z;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.slip = s.grounded && s.state === 'ski' ? Math.abs(this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)) : 0;

    // 栽进雪里 / 拔出来 / 冰坨崩碎：补上动静
    if (planted && this.plantT <= 0) {
      this.plantT = 1;
      game.onPlant(this);
    } else if (!planted && this.plantT > 0) {
      this.plantT = 0;
      game.onUnplant(this);
    }
    if (this.frozenT > 0 && s.frozen <= 0) {
      game.fx.iceShatter(this.pos);
      game.sfxAt(game.sfx.shatter ? 'shatter' : 'freeze', this.pos, 0.9);
    }
    this.frozenT = s.frozen;

    // 钩爪：对方拉到跟前时，被钩的人如果归本机管，就在这里结算
    if (this.hookT > 0 && this.hookTarget) {
      this.hookT -= dt;
      const tg = this.hookTarget;
      _v.copy(tg.pos).sub(this.pos);
      const dist = _v.length();
      if (dist < 3.2 || tg.finished) {
        this.hookT = 0;
        if (dist < 3.2) tg.knock(_v.normalize().multiplyScalar(6).setY(7), 1.3, this, '钩爪');
      }
    }

    this.emitJets();
    this.syncVisual(dt, s.steer, s.tuck, s.brake);
  }

  syncVisual(dt, steer = 0, tuck = false, brake = false) {
    const g = this.skier.group;
    const tumbling = this.state === 'tumble';
    g.position.copy(this.pos);
    this.up.lerp(this.grounded ? this.normal : Y, damp(this.grounded ? 12 : 2.5, dt)).normalize();
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _z.copy(_f).multiplyScalar(-1);
    _x.crossVectors(this.up, _z).normalize();
    _z.crossVectors(_x, this.up).normalize();
    this.right.copy(_x);
    _m4.makeBasis(_x, this.up, _z);
    g.quaternion.setFromRotationMatrix(_m4);
    const planted = this.plantT > 0;
    this.plantK = lerp(this.plantK, planted ? 1 : 0, damp(planted ? 30 : 16, dt));
    if (this.plantK > 0.01) g.position.addScaledVector(this.up, -PLANT_DEPTH * this.plantK);
    // 名字牌跟着人一起沉下去会挡住腿，抬回原来的高度
    if (this.label) this.label.position.y = 2.0 + (this.plantK * PLANT_DEPTH) / g.scale.y;
    if (planted) {
      // 头朝下插着，身子左右晃
      _q.setFromAxisAngle(XA, Math.PI);
      _q.multiply(_qi.setFromAxisAngle(ZA, Math.sin(this.t * 13) * 0.16));
      this.skier.spin.quaternion.slerp(_q, damp(25, dt));
    } else if (tumbling) {
      _q.setFromAxisAngle(this.spinAxis, this.spinSpeed * dt);
      this.skier.spin.quaternion.premultiply(_q);
      if (this.grounded) this.spinSpeed = Math.max(3.5, this.spinSpeed * Math.exp(-0.9 * dt));
      g.position.y += 0.3;
    } else if (this.flip !== 0) {
      this.skier.spin.quaternion.setFromAxisAngle(XA, this.flip);
    } else {
      this.skier.spin.quaternion.slerp(_qi.identity(), damp(14, dt));
    }
    this.skier.update(dt, {
      tuck,
      steer,
      brake,
      grounded: this.grounded,
      tumbling,
      planted,
      speed: this.speed,
      frozen: this.frozenT > 0,
      thaw: this.frozenT,
      hasProp: !!(this.weapon && WEAPONS[this.weapon].prop),
      boost: this.boostT > 0 || this.turboT > 0,
    });
    this.skier.shield.visible = this.shieldT > 0;
    if (this.shieldT > 0) this.skier.shield.material.opacity = this.shieldT < 1 ? 0.12 + 0.2 * Math.abs(Math.sin(this.t * 14)) : 0.28;
    this.skier.ice.visible = this.frozenT > 0;
    g.visible = this.invulnT > 0 && this.state === 'ski' && !this.finished ? Math.floor(this.t * 16) % 2 === 0 : true;

    const skiing = this.grounded && this.state === 'ski';
    this.trail.add(this.pos, this.right, this.normal, skiing);

    // 溅雪
    if (skiing && this.speed > 6 && this.game.nearCamera(this.pos, 130)) {
      const amount = this.slip * 0.9 + (brake ? 8 : 0) + this.speed * 0.05;
      this.sprayAcc += amount * dt * 3;
      let n = 0;
      while (this.sprayAcc > 1 && n < 3) {
        this.sprayAcc -= 1;
        n++;
        const side = (Math.random() - 0.5) * 0.7;
        this.game.fx.spray(
          this.pos.x + this.right.x * side - _f.x * 0.5,
          this.pos.y + 0.12,
          this.pos.z + this.right.z * side - _f.z * 0.5,
          this.vel.x * 0.35 + (Math.random() - 0.5) * 3,
          1.5 + Math.random() * 2.5 + this.slip * 0.15,
          this.vel.z * 0.35 + (Math.random() - 0.5) * 3,
          0.07 + Math.min(0.1, this.slip * 0.01)
        );
      }
      if (this.sprayAcc > 3) this.sprayAcc = 3;
    }

    // 漂移火花：蓄力越久颜色越“烫”（白蓝 → 金 → 粉）
    if (this.drifting && skiing && this.driftCharge > 0.12 && this.game.nearCamera(this.pos, 110)) {
      const c = this.driftCharge;
      const c0 = c >= DRIFT_L2 ? COL.pink : c >= DRIFT_L1 ? COL.spark : COL.ice0;
      const c1 = c >= DRIFT_L2 ? COL.fire1 : c >= DRIFT_L1 ? COL.fire1 : COL.ice1;
      const n = c >= DRIFT_L1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const side = (Math.random() < 0.5 ? -1 : 1) * 0.25;
        this.game.fx.glow.spawn(
          this.pos.x + this.right.x * side - _f.x * 0.7,
          this.pos.y + 0.1,
          this.pos.z + this.right.z * side - _f.z * 0.7,
          -this.vel.x * 0.15 + (Math.random() - 0.5) * 5,
          2 + Math.random() * 4,
          -this.vel.z * 0.15 + (Math.random() - 0.5) * 5,
          0.2 + Math.random() * 0.15, 0.1, 0.03, c0, c1, 12, 1
        );
      }
    }
  }

  // ---------- 机器人 ----------
  think(dt) {
    const game = this.game;
    const c = game.course;
    const ai = this.ai;
    const inp = this.input;
    inp.drift = false;
    inp.flip = 0;
    if (this.state !== 'ski' || this.frozenT > 0) {
      inp.steer = 0;
      return;
    }
    // 腾空时间够就翻跟头（flipN 在离地瞬间算好）
    if (!this.grounded && ai.flipN > 0 && Math.abs(this.flip) < TAU * ai.flipN - 0.05) inp.flip = 1;
    const d = this.d;
    const sp = this.speed;

    // 近道：人在近道里就沿近道走；路过入口时按难度决定要不要冒险切进去
    if (!ai.sc) {
      if (this.inShort) {
        const path = this.inShort.path;
        let bi = 0;
        let bd = 1e9;
        for (let i = 0; i < path.length; i++) {
          const q = (path[i].x - this.pos.x) ** 2 + (path[i].z - this.pos.z) ** 2;
          if (q < bd) {
            bd = q;
            bi = i;
          }
        }
        ai.sc = { b: this.inShort, i: bi, vmax: 22 };
      } else {
        for (const b of c.branches) {
          if (ai.scSeen.has(b) || d < b.path[0].d - 45) continue;
          ai.scSeen.add(b);
          const p0 = b.path[0];
          if (d < p0.d + 4 && Math.abs(this.pos.x - p0.x) < 16 && Math.random() < SHORTCUT_CHANCE[game.rules.difficulty]) {
            ai.sc = { b, i: 0, vmax: 23 + game.rules.difficulty * 2 + Math.random() * 3 };
          }
        }
      }
    }
    let diff = ai.sc ? this.thinkShortcut() : null;
    if (diff === null) diff = this.thinkLane(dt);

    // 难度与橡皮筋
    const diffLv = game.rules.difficulty;
    let mul = [1.32, 1.12, 0.98][diffLv];
    // 参照物是真人玩家（联机时取还在跑的真人的平均进度）
    const pace = game.paceD;
    if (pace !== null && pace !== undefined) {
      const gap = d - pace;
      if (gap > 140) mul *= 1.16;
      else if (gap < -160) mul *= 0.88;
    }
    this.cdMul = mul * (1 + (this.idx % 4) * 0.025);

    // 用道具
    if (this.weapon) {
      ai.useT -= dt;
      ai.holdT += dt;
      if (ai.useT <= 0 && this.shouldFire(diff)) {
        game.weapons.use(this);
        ai.useT = 0.6 + Math.random() * 1.3;
      }
    }
  }

  // 常规走线：看前方一段的车道目标 + 追道具 + 避障。返回与目标方向的夹角
  thinkLane(dt) {
    const game = this.game;
    const c = game.course;
    const ai = this.ai;
    const inp = this.input;
    const d = this.d;
    const sp = this.speed;
    ai.laneT -= dt;
    if (ai.laneT <= 0) {
      ai.lane = (Math.random() * 2 - 1) * 0.62;
      ai.laneT = 2.5 + Math.random() * 4;
    }
    const look = 22 + sp * 0.75;
    const dl = d + look;
    let tx = c.cx(dl) + ai.lane * c.halfWidth(dl) * 0.85;
    let tz = -dl;
    if (!this.weapon && game.rules.items) {
      const s = game.items.nearestAhead(this.pos, d, 75);
      if (s) {
        tx = s.x;
        tz = Math.min(s.z, this.pos.z - 8);
      }
    }
    const want = Math.atan2(-(tx - this.pos.x), -(tz - this.pos.z));
    const diff = wrapAngle(want - this.yaw);
    let steer = clamp(-diff * 3, -1, 1);

    // 避障
    const range = 14 + sp * 0.85;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    let best = 1e9;
    let avoid = 0;
    // 人还在雪道里面时，路外的树和石头不用躲：急弯处正前方就是路边的树林，
    // 逐棵去躲会左右乱晃，反而拐不过弯
    const inside = Math.abs(this.pos.x - c.cx(d)) - c.halfWidth(d) < -4;
    // 本来就要大幅转向时，往要转的那一侧躲
    const turnSide = Math.abs(diff) > 0.4 ? Math.sign(-diff) : 0;
    c.forObstacles(d + range * 0.5, range * 0.5 + 6, (o) => {
      if (inside && o.u > 1.5) return;
      const rx = o.x - this.pos.x;
      const rz = o.z - this.pos.z;
      const fwd = -sy * rx - cy * rz;
      if (fwd < 0.5 || fwd > range + o.r) return;
      const lat = cy * rx - sy * rz;
      const clear = o.r + 1.8;
      if (Math.abs(lat) < clear && fwd < best) {
        best = fwd;
        avoid = (turnSide || (lat >= 0 ? -1 : 1)) * (1.25 - 0.6 * (fwd / range));
      }
    });
    if (avoid) steer = clamp(steer * 0.25 + avoid * 2.4, -1, 1);
    ai.steer = lerp(ai.steer, steer, damp(14, dt));
    inp.steer = ai.steer;
    // 速度很低时不管朝向都撑杖，免得横在坡上动不了
    inp.tuck = Math.abs(diff) < 0.55 || sp < 6;
    inp.brake = Math.abs(diff) > 1.15 && sp > 22;
    // 大弯用漂移过：偏差大时进入，基本对正后松开
    ai.drift = this.grounded && sp > 16 && !avoid && Math.abs(diff) > (ai.drift ? 0.16 : 0.5);
    // 漂移方向和想去的方向相反时先松开，否则会越漂越偏
    if (this.drifting && ai.steer * this.driftDir < 0.15) ai.drift = false;
    inp.drift = ai.drift;
    return diff;
  }

  // 沿近道线路走：进场弧线 → 之字入口（收油 + 漂移）→ 冰道。线路走完或被撞出去时返回 null
  thinkShortcut() {
    const ai = this.ai;
    const inp = this.input;
    const sc = ai.sc;
    const b = sc.b;
    const path = b.path;
    const px = this.pos.x;
    const pz = this.pos.z;
    const d2 = (k) => (path[k].x - px) ** 2 + (path[k].z - pz) ** 2;
    let i = sc.i;
    while (i < path.length - 1 && d2(i + 1) <= d2(i)) i++;
    sc.i = i;
    // 走完了；或者已经上了线路却被撞到 14m 以外
    if (i >= path.length - 3 || (i > 2 && d2(i) > 196 && !this.inShort)) {
      ai.sc = null;
      return null;
    }
    const sp = this.speed;
    const inZ = i < b.gateI + b.zEndS + 6;
    const look = inZ ? clamp(4 + sp * 0.22, 6, 11) : 12 + sp * 0.5;
    const t = path[Math.min(path.length - 1, i + Math.round(look))];
    const diff = wrapAngle(Math.atan2(-(t.x - px), -(t.z - pz)) - this.yaw);
    ai.steer = clamp(-diff * 4, -1, 1);
    inp.steer = ai.steer;
    // 偏差大就漂，漂起来以后要基本对正了才松开；方向反了先松开再换边
    inp.drift = inZ && sp > 12 && Math.abs(diff) > (this.drifting ? 0.1 : 0.28) && !(this.drifting && ai.steer * this.driftDir < 0.15);
    inp.brake = inZ && sp > sc.vmax;
    inp.tuck = !inp.brake && Math.abs(diff) < 0.45;
    return diff;
  }

  shouldFire(diff) {
    const game = this.game;
    const ai = this.ai;
    const kind = WEAPONS[this.weapon].ai;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const scan = (test) => {
      for (const r of game.racers) {
        if (r === this || r.finished || r.out || this.isAlly(r)) continue;
        const rx = r.pos.x - this.pos.x;
        const rz = r.pos.z - this.pos.z;
        const fwd = -sy * rx - cy * rz;
        const lat = cy * rx - sy * rz;
        if (test(fwd, lat, r)) return true;
      }
      return false;
    };
    switch (kind) {
      case 'ahead':
        return ai.holdT > 9 || scan((fwd, lat) => fwd > 6 && fwd < 95 && Math.abs(lat) < 2.5 + fwd * 0.05);
      case 'near':
        return ai.holdT > 10 || scan((fwd, lat) => fwd > 1 && fwd < 22 && Math.abs(lat) < 2 + fwd * 0.45);
      case 'anyAhead':
        return (this.rank > 1 && ai.holdT > 0.8) || ai.holdT > 12;
      case 'behind':
        return ai.holdT > 6 || scan((fwd, lat) => fwd < -3 && fwd > -45 && Math.abs(lat) < 14);
      case 'melee':
        return ai.holdT > 14 || scan((fwd, lat) => fwd * fwd + lat * lat < 28);
      case 'self':
        if (this.weapon === 'boost') return Math.abs(diff) < 0.3 && this.grounded;
        return ai.holdT > 1.5;
      default:
        return ai.holdT > 3;
    }
  }

  dispose() {
    this.skier.dispose();
    this.trail.dispose();
    if (this.label) this.label.material.dispose();
  }
}
