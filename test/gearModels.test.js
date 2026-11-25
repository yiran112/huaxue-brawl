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

const { GEAR, GEAR_KEYS, GEAR_COLOR } = await import('../src/gear.js');
const { GEAR_MODELS, gearKit, bakeGear } = await import('../src/gearModels.js');

const lam = (color, opts) => new THREE.MeshLambertMaterial({ color, ...(opts || {}) });

// 照着 skier.js 的拼法造一件装备，返回合并后的零件组和动画零件表
function build(id) {
  const def = GEAR[id];
  const spec = GEAR_MODELS[def.model];
  const kit = gearKit(lam, GEAR_COLOR, def.trim, -(spec.lift || 0));
  const parts = [];
  if (spec.ski) {
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      spec.ski(g, kit);
      bakeGear(g, kit);
      parts.push(g);
    }
  } else {
    const v = new THREE.Group();
    spec.build(v, kit);
    bakeGear(v, kit);
    parts.push(v);
  }
  return { spec, kit, parts };
}

const meshes = (parts) => {
  const out = [];
  for (const p of parts) p.traverse((o) => o.isMesh && out.push(o));
  return out;
};

test('每件装备都有自己的精细模型，站法和滑法对得上', () => {
  for (const k of GEAR_KEYS) {
    const def = GEAR[k];
    const spec = GEAR_MODELS[def.model];
    assert.ok(spec, `${k} 没有模型`);
    assert.equal(!!spec.ski, def.form === 'ski', `${k}：双板用 ski 造单只脚的板，其它用 build 造整台`);
  }
});

test('拼完按材质合并：零件再多，绘制次数也压得住', () => {
  for (const k of GEAR_KEYS) {
    const { kit, parts } = build(k);
    const live = new Set([...kit.fx.flames, ...kit.fx.flags]);
    const list = meshes(parts);
    assert.ok(list.length > 0, `${k} 什么都没拼出来`);
    assert.ok(list.length <= 24, `${k} 合并后还有 ${list.length} 个网格`);
    // 同一个零件组里，不动的零件每种材质只剩一个网格
    for (const p of parts) {
      const seen = new Set();
      for (const ch of p.children) {
        if (!ch.isMesh || live.has(ch)) continue;
        const key = ch.material.uuid + ch.castShadow;
        assert.ok(!seen.has(key), `${k} 有同材质的零件没合并`);
        seen.add(key);
      }
    }
  }
});

test('会动的零件合并后还在：尾焰、灯圈、羽翼、小旗', () => {
  for (const k of GEAR_KEYS) {
    const { kit, parts } = build(k);
    const inside = (o) => parts.some((p) => {
      let hit = false;
      p.traverse((x) => (hit ||= x === o));
      return hit;
    });
    for (const f of kit.fx.flames) assert.ok(inside(f) && !f.visible, `${k} 的尾焰丢了`);
    for (const g of [...kit.fx.spin, ...kit.fx.flags, ...kit.fx.wings.map((w) => w.o)]) assert.ok(inside(g), `${k} 的动画零件丢了`);
  }
  assert.ok(build('mech').kit.fx.flames.length === 2, '机甲双板两只脚各一台推进器');
  assert.ok(build('phoenix').kit.fx.wings.length === 2, '凤凰翼板一对羽翼');
});

test('镜像过的零件合并后面还是朝外', () => {
  // 鱼尾板的燕尾左右是同一份几何体镜像出来的：合并后左半边的三角形法线要和顶点法线同向
  const { parts } = build('fish');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let checked = 0;
  for (const m of meshes(parts)) {
    const pos = m.geometry.attributes.position;
    const nor = m.geometry.attributes.normal;
    if (m.geometry.index) continue;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      if (a.x > -0.2) continue;
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const face = b.sub(a).cross(c.sub(a));
      if (face.lengthSq() < 1e-12) continue;
      n.fromBufferAttribute(nor, i);
      assert.ok(face.dot(n) > 0, '有三角形翻面了');
      checked++;
    }
  }
  assert.ok(checked > 50);
});
