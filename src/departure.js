import * as THREE from 'three';
import { mesh, limb } from './skier.js';
import { lerp, smooth } from './util.js';

const ARRIVAL = 1.46;
const DURATION = 2.65;
const TRACK_CABLE_Y = 6.9;

function buildStation(course, from, dock) {
  const g = new THREE.Group();
  g.name = 'departure-station';
  const z = dock.z;
  const roof = dock.y + 8.15;
  for (const x of [-5.7, 5.7]) {
    for (const zz of [z - 1.15, z + 3.95]) {
      const y = course.surfaceY(x, zz);
      g.add(mesh('box', 0x465865, 0.36, roof - y, 0.36, x, (roof + y) / 2, zz));
    }
    g.add(mesh('box', 0xdda63a, 0.55, 0.85, 0.58, x, course.surfaceY(x, z - 1.15) + 0.47, z - 1.15));
  }
  g.add(mesh('box', 0x1f4259, 13, 0.52, 7.8, 0, roof, z + 1.65));
  g.add(mesh('box', course.theme.snow, 13.25, 0.16, 8.04, 0, roof + 0.31, z + 1.65));
  g.add(mesh('box', 0x687781, 1.5, 0.5, 1.6, 0, dock.y + TRACK_CABLE_Y + 0.21, z));
  // 索固定在站上，移动的吊椅沿索下方进站。
  const run = new THREE.Vector3().copy(from).sub(dock);
  g.add(limb(0x384955, 0, dock.y + TRACK_CABLE_Y, z,
    0, from.y + TRACK_CABLE_Y + run.y * 1.5, from.z + run.z * 1.5, 0.035));
  course.group.add(g);
  return g;
}

export class Departure {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.from = game.lobby.position.clone();
    this.fromOffset = game.camera.position.clone().sub(this.from);
    // 展台发车时，仍从可看清吊椅的机位开场。
    if (this.fromOffset.length() > 36 || this.fromOffset.z < 5) this.fromOffset.set(0, 2, 20);
    this.fromFov = game.camera.fov;
    this.dock = new THREE.Vector3(0, game.course.surfaceY(0, 18) + 0.62, 18);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    game.course.departureStation ??= buildStation(game.course, this.from, this.dock);
    for (const r of game.racers) r.skier.group.visible = false;
  }

  update(dt) {
    this.time += dt;
    const g = this.game;
    const cam = g.camera;
    if (this.time < ARRIVAL) {
      const chair = g.lobby.position;
      const entry = smooth(0, ARRIVAL, this.time);
      chair.lerpVectors(this.from, this.dock, entry);
      for (const rider of g.lobbySkiers) rider.update(dt, {});
      if (this.reducedMotion) {
        const midY = (this.from.y + this.dock.y) / 2;
        const midZ = (this.from.z + this.dock.z) / 2;
        cam.position.set(17, midY + 4.5, midZ + 13);
        cam.lookAt(0, midY + 1.2, midZ);
        cam.fov = 57;
      } else {
        cam.position.set(
          chair.x + lerp(this.fromOffset.x, 7.8, entry),
          chair.y + lerp(this.fromOffset.y, 2.5, entry),
          chair.z + lerp(this.fromOffset.z, 11.4, entry),
        );
        cam.position.y = Math.max(cam.position.y, g.course.height(cam.position.x, cam.position.z) + 1.1);
        cam.lookAt(chair.x, chair.y + 1.1, chair.z);
        cam.fov = lerp(this.fromFov, 53, entry);
      }
      g.focusShadow(chair);
      if (!this.braked && entry > 0.62) {
        this.braked = true;
        g.sfx.noise(0.38, 680, 'bandpass', 0.19, 240);
      }
    } else {
      if (g.lobby) g.disposeLobby();
      const t = this.time - ARRIVAL;
      const p = g.player;
      if (!this.touched && t >= 0.16) {
        this.touched = true;
        p.landingPress = 0.75;
        g.onSnowContact(p, 0.05);
      }
      for (const r of g.racers) r.update(dt);
      p.skier.group.position.y += 0.17 * (1 - smooth(0, 0.16, t));
      const reveal = this.reducedMotion ? 1 : smooth(0.16, DURATION - ARRIVAL, t);
      const { x, y, z } = p.pos;
      cam.position.set(x + lerp(3.25, 0, reveal), y + lerp(1.32, 2.55, reveal), z + lerp(4.65, 4.9, reveal));
      cam.lookAt(x, y + lerp(0.32, 1.35, reveal), z - lerp(0.45, 9.5, reveal));
      cam.fov = lerp(51, 62, reveal);
      g.focusShadow(p.pos);
    }
    cam.updateProjectionMatrix();
    return this.time >= DURATION;
  }
}
