// 快捷表情：比赛里按 1~4（触屏点表情键）在自己头顶冒一个表情，联机时别人也看得到；机器人打中人、被打中时偶尔也会冒一个
import * as THREE from 'three';

export const EMOTES = ['😂', '😎', '😡', '👍'];
const LIFE = 2.2;
const COOL = 1.2; // 两次之间至少隔多久
const SIZE = 1.6;
const tex = [];

function emoteTex(i) {
  if (tex[i]) return tex[i];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '100px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(EMOTES[i], 64, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (tex[i] = t);
}

export class Emotes {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.coolT = 0;
  }

  // 本机玩家发一个
  send(i) {
    const g = this.game;
    const p = g.player;
    if (!p || p.out || this.coolT > 0 || !(i >= 0 && i < EMOTES.length)) return;
    if (!['countdown', 'race', 'finished', 'results'].includes(g.state)) return;
    this.coolT = COOL;
    this.show(p, i);
    g.net.ev('emo', { i: p.idx, e: i });
  }

  // 联机：别人发来的
  remote(m) {
    const r = this.game.racers[m.i];
    const i = m.e | 0;
    if (r && !r.owned && i >= 0 && i < EMOTES.length) this.show(r, i);
  }

  // 机器人的反应（只由负责它的那台机器决定，再同步给别人）
  react(victim, source) {
    if (source && source !== victim && source.isBot && source.owned && Math.random() < 0.25) this.botSend(source, 0);
    else if (victim.isBot && victim.owned && Math.random() < 0.12) this.botSend(victim, 2);
  }

  botSend(r, i) {
    this.show(r, i);
    this.game.net.ev('emo', { i: r.idx, e: i });
  }

  show(r, i) {
    for (const e of this.list) if (e.r === r) e.t = 0;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTex(i), transparent: true, depthWrite: false, fog: false }));
    s.renderOrder = 10;
    this.game.scene.add(s);
    this.list.push({ r, s, t: LIFE });
    if (r.isPlayer || this.game.nearCamera(r.pos, 60)) this.game.sfx.tone('triangle', 880, 1320, 0.1, 0.12);
  }

  update(dt) {
    if (this.coolT > 0) this.coolT -= dt;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const e = this.list[k];
      e.t -= dt;
      if (e.t <= 0 || !e.r.skier.group.parent) {
        this.drop(e);
        this.list.splice(k, 1);
        continue;
      }
      const age = LIFE - e.t;
      const pop = age < 0.16 ? (age / 0.16) * 1.25 : age < 0.3 ? 1.25 - ((age - 0.16) / 0.14) * 0.25 : 1;
      e.s.visible = !this.game.replay.on;
      e.s.scale.setScalar(SIZE * pop);
      e.s.material.opacity = e.t < 0.35 ? e.t / 0.35 : 1;
      e.s.position.copy(e.r.pos);
      e.s.position.y += 2.7 + age * 0.25;
    }
  }

  clear() {
    for (const e of this.list) this.drop(e);
    this.list.length = 0;
    this.coolT = 0;
  }

  drop(e) {
    e.s.removeFromParent();
    e.s.material.dispose();
  }
}
