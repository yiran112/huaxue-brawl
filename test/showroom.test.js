import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// 贴花要一块 2D 画布：Node 里没有，换成什么都不画的假画布
const noop = () => {};
const ctx = new Proxy({}, {
  get: (_, key) => {
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return noop;
  },
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };

const { GEAR_KEYS, GEAR_COLOR } = await import('../src/gear.js');
const { makeGearPreview } = await import('../src/gearThumb.js');
const { placeGear, GEAR_TILT, GEAR_BOB, GEAR_CLEAR } = await import('../src/showroom.js');

test('车库只摆装备：倾过来转一整圈、浮到最低也不穿进展台，最高点不超过镜头按的高度', () => {
  const v = new THREE.Vector3();
  for (const id of GEAR_KEYS) {
    const { root, skier } = makeGearPreview(id, { ski: 0 });
    const { lift, top } = placeGear(root);
    // 和展厅里一样的支架：外层往镜头倾，里层跟着转
    const stand = new THREE.Group();
    stand.rotation.x = GEAR_TILT;
    const spinner = new THREE.Group();
    stand.add(spinner);
    spinner.add(root);
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a < 36; a++) {
      spinner.rotation.y = (a / 36) * Math.PI * 2;
      stand.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          lo = Math.min(lo, v.y);
          hi = Math.max(hi, v.y);
        }
      });
    }
    assert.ok(lift - GEAR_BOB + lo >= GEAR_CLEAR - 1e-6, `${id} 最低点离台面只有 ${(lift - GEAR_BOB + lo).toFixed(3)} 米`);
    assert.ok(lift + GEAR_BOB + hi <= top + 1e-6, `${id} 最高点 ${(lift + GEAR_BOB + hi).toFixed(3)} 超过 top ${top.toFixed(3)}`);
    skier.dispose();
  }
});

test('装备颜色是做好的：老存档里玩家选的装备颜色不起作用', () => {
  const odd = 0x123456;
  for (const id of ['ski', 'hover', 'bike']) {
    const { root, skier } = makeGearPreview(id, { ski: odd });
    const colors = new Set();
    root.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) if (m.color) colors.add(m.color.getHex());
    });
    assert.ok(!colors.has(odd), `${id} 还在用玩家选的颜色`);
    assert.ok(colors.has(GEAR_COLOR), `${id} 板身不是 GEAR_COLOR`);
    skier.dispose();
  }
});
