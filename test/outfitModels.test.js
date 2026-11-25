import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 贴花要一块 2D 画布：Node 里没有，换成什么都不画的假画布
const noop = () => {};
const ctx = new Proxy({}, {
  get: (_, key) => (key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop),
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { HATS } = await import('../src/config.js');
const { GOGGLES, BACKS, SCARVES } = await import('../src/gear.js');
const { outfitKit, buildHat, buildGoggles, buildBack, buildScarf } = await import('../src/outfitModels.js');

// 和 skier.js 的 lam 一样按颜色和参数缓存材质：同一种材质的零件才合得到一起
const mats = new Map();
const lam = (color, opts) => {
  const key = color + JSON.stringify(opts || {});
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
  return mats.get(key);
};
const look = { hatColor: 0x2f3fd0, stripe: 0xffd21f, goggles: 0 };
const meshes = (g) => {
  let n = 0;
  g.traverse((o) => o.isMesh && n++);
  return n;
};

test('每种发型 / 帽子、护目镜都拼得出来，合并后网格数不多', () => {
  for (let hat = 0; hat < HATS.length; hat++) {
    const head = new THREE.Group();
    buildHat(head, { ...look, hat }, outfitKit(lam));
    const n = meshes(head);
    assert.ok(n > 0 && n <= 14, `发型 ${hat}：${n} 个网格`);
  }
  for (let kind = 1; kind < GOGGLES.length; kind++) {
    const g = new THREE.Group();
    buildGoggles(g, kind, outfitKit(lam));
    const n = meshes(g);
    assert.ok(n > 0 && n <= 12, `护目镜 ${kind}：${n} 个网格`);
  }
});

test('背饰和围巾：会动的零件合并后还在', () => {
  const parts = BACKS.map((_, kind) => {
    const g = new THREE.Group();
    return { g, out: buildBack(g, kind, look, outfitKit(lam)) };
  });
  assert.equal(meshes(parts[0].g), 0, '0 号是没有背饰');
  assert.ok(parts[2].out.cape && parts[2].out.cape.parent === parts[2].g, '披风');
  assert.equal(parts[3].out.jetFlames.length, 2, '火箭背包两道尾焰');
  assert.ok(parts[3].out.jetFlames.every((f) => !f.visible), '尾焰平时不亮');
  assert.equal(parts[4].out.wings.length, 2, '一对翅膀');
  for (const { g } of parts.slice(1)) assert.ok(meshes(g) > 0 && meshes(g) <= 12);
  for (let kind = 1; kind < SCARVES.length; kind++) {
    const g = new THREE.Group();
    const tail = buildScarf(g, kind, look, outfitKit(lam));
    assert.ok(tail && tail.parent === g && meshes(tail) > 0, `围巾 ${kind} 的飘带`);
  }
  assert.equal(buildScarf(new THREE.Group(), 0, look, outfitKit(lam)), null);
});
