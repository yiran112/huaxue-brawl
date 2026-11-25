import * as THREE from 'three';
import { appearancePreviewKey, frameGearPreview, makeAppearancePreview, makeGearPreview } from '../src/gearThumb.js';
import { PodiumView } from '../src/ui/podium3d.js';

function stage(gear) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a94, gear ? 1.4 : 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(...(gear ? [-0.5, 1, -0.6] : [0.6, 1, 0.9]));
  scene.add(sun);
  return scene;
}

export class ModelPreviews {
  constructor() {
    this.gearScene = stage(true);
    this.podiumScene = stage(false);
    this.podiumCamera = new THREE.PerspectiveCamera(26, 1, 0.1, 80);
    this.podium = new PodiumView();
    this.cards = new Map();
    this.slots = new Map();
    this.size = new THREE.Vector2();
    this.last = Date.now();
  }

  cardModel({ gear, appearance }, look) {
    const key = appearance ? `${appearance.field}:${appearance.value}:${appearancePreviewKey(appearance.field, look)}` : `gear:${gear}`;
    if (this.cards.has(key)) return this.cards.get(key);
    const result = appearance ? makeAppearancePreview(appearance.field, appearance.value, look) : makeGearPreview(gear, look);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    frameGearPreview(camera, result.root, result.view);
    const model = { ...result, camera };
    if (this.cards.size >= 32) {
      const oldest = this.cards.keys().next().value;
      this.cards.get(oldest).skier.dispose();
      this.cards.delete(oldest);
    }
    this.cards.set(key, model);
    return model;
  }

  podiumModels(rows) {
    const old = new Map(this.slots);
    this.slots.clear();
    for (const { row, place } of rows) {
      const key = JSON.stringify([row.look, row.team, place]);
      const slot = old.get(key) || this.podium.make(row.look, row.team, key);
      old.delete(key);
      slot.place = place;
      this.slots.set(key, slot);
    }
    for (const slot of old.values()) slot.skier.dispose();
    this.podium.frame.makeEmpty();
    for (const slot of this.slots.values()) this.podium.frame.union(slot.box);
    return [...this.slots.values()];
  }

  draw(ui) {
    const regions = ui.models;
    if (!regions?.length) {
      if (this.slots.size) this.podiumModels([]);
      return;
    }
    const renderer = ui.game.renderer;
    const now = Date.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const slots = this.podiumModels(regions.filter((x) => x.row));
    renderer.getSize(this.size);
    renderer.setScissorTest(true);
    let i = 0;
    try {
      for (const box of regions) {
        const clip = box.clip || box;
        const slot = box.row ? slots[i++] : null;
        if (clip.w <= 0 || clip.h <= 0) continue;
        const s = ui.scale;
        renderer.setViewport(box.x * s, (ui.h - box.y - box.h) * s, box.w * s, box.h * s);
        renderer.setScissor(clip.x * s, (ui.h - clip.y - clip.h) * s, clip.w * s, clip.h * s);
        renderer.clearDepth();
        const model = slot || this.cardModel(box, ui.game.look);
        const scene = slot ? this.podiumScene : this.gearScene;
        if (slot) {
          this.podium.pose(slot, dt);
          this.podium.aim(this.podiumCamera, slot, box.w / box.h);
        }
        scene.add(model.root);
        renderer.render(scene, slot ? this.podiumCamera : model.camera);
        scene.remove(model.root);
      }
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, this.size.x, this.size.y);
      renderer.setScissor(0, 0, this.size.x, this.size.y);
    }
  }
}
