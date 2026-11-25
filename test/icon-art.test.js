import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { WEAPONS } from '../src/config.js';
import { RARITY_KEYS, UP_KEYS } from '../src/gear.js';
import { iconPath, iconRuns, plainIconText, rarityIcon, rarityToken } from '../src/icon-art.js';

test('每个改装节点和比赛道具都使用单独的透明底 PNG 素材', async () => {
  const items = Object.values(WEAPONS).map(({ icon }) => iconRuns(icon)[0].id);
  const ids = [...UP_KEYS, ...items];
  assert.equal(new Set(ids).size, ids.length);
  await Promise.all(ids.map(async (id) => {
    const bytes = await readFile(new URL(`../public/${iconPath(id)}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', id);
    assert.equal(bytes.readUInt32BE(16), 96, id);
    assert.equal(bytes.readUInt32BE(20), 96, id);
    assert.equal(bytes[25], 6, id);
  }));
});

test('旧界面图标替换为素材，文字和方向符号仍然可见', () => {
  assert.deepEqual(iconRuns('❄ 300 · 🎁 补给箱'), [{ id: 'coin' }, ' 300 · ', { id: 'gift' }, ' 补给箱']);
  assert.deepEqual(iconRuns('⚠ 小心落石！'), [{ id: 'warning' }, ' 小心落石！']);
  assert.deepEqual(iconRuns('已静音 🔇'), ['已静音 ']);
  assert.deepEqual(iconRuns('继续 ▶'), ['继续 ', '▶']);
});

test('S、A、B、C 稀有度统一使用独立的透明图片，保留可访问字母', async () => {
  await Promise.all(RARITY_KEYS.map(async (tier) => {
    const icon = rarityIcon(tier);
    assert.deepEqual(iconRuns(`${rarityToken(tier)} 装备`), [{ id: icon }, ' 装备']);
    assert.equal(plainIconText(`${rarityToken(tier)} 装备`), `${tier} 装备`);
    const png = await readFile(new URL(`../public/${iconPath(icon)}`, import.meta.url));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 128);
    assert.equal(png[25], 6);
  }));
});
