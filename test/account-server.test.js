import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAccount } from '../server/account.js';
import { Profile, START_COINS } from '../src/profile.js';
import { sanitizeRep } from '../server/ledger.js';

// 临时目录里起一个存档服务器，不碰 data/ 下的真存档
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huaxue-acc-'));
const account = createAccount({ dir });
const server = http.createServer((req, res) => account.handle(req, res));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  account.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}

const rep = { kind: 'quick', mode: 'race', rank: 1, field: 6, finished: true, time: 90, difficulty: 1, hits: 1 };

test('游客：改过的雪花币不认，买不起的东西不给', async () => {
  const { status, data } = await call('POST', '/api/guest', {
    profile: { coins: 999999, xp: 999999, owned: { 'gear:sled': true }, name: '测试员' },
    ops: [{ op: 'buy', key: 'gear:wood', at: Date.now() }],
  });
  assert.equal(status, 200);
  assert.equal(data.profile.coins, START_COINS);
  assert.equal(data.profile.xp, 0);
  assert.deepEqual(data.profile.owned, {});
  assert.equal(data.profile.name, '测试员');
  assert.ok(data.profile.boxSeed > 0);
});

test('存档：奖励按服务器重算，改过的雪花币和装备不认', async () => {
  const g = (await call('POST', '/api/guest', { profile: {}, ops: [] })).data;
  const forged = { ...g.profile, coins: 50000, owned: { 'gear:sled': true } };
  const r1 = await call('PUT', '/api/profile', { profile: forged, ops: [{ op: 'race', rep, at: Date.now() }], revision: g.revision }, g.token);
  assert.equal(r1.status, 200);
  const local = new Profile();
  local.loadData(g.profile);
  local.applyRace(sanitizeRep(rep));
  assert.ok(local.coins > START_COINS);
  assert.equal(r1.data.profile.coins, local.coins);
  assert.equal(r1.data.profile.stats.races, 1);
  assert.equal(r1.data.profile.owned['gear:sled'], undefined);
  // 联机进房时按这份核对装备
  const p = account.gearOf(g.token);
  assert.equal(p.gearOwned('ski'), true);
  assert.equal(p.gearOwned('sled'), false);
  assert.equal(account.gearOf('nope'), null);
});

test('存档：没收到回复重交的同一批操作不会算两次', async () => {
  const g = (await call('POST', '/api/guest', { profile: {}, ops: [] })).data;
  const ops = [{ op: 'race', rep, at: Date.now(), id: 'a1' }];
  const r1 = await call('PUT', '/api/profile', { profile: g.profile, ops, revision: g.revision }, g.token);
  const r2 = await call('PUT', '/api/profile', { profile: g.profile, ops, revision: g.revision }, g.token);
  assert.equal(r1.data.profile.stats.races, 1);
  assert.equal(r2.data.profile.stats.races, 1);
  assert.equal(r2.data.profile.coins, r1.data.profile.coins);
  const r3 = await call('PUT', '/api/profile', { profile: g.profile, ops: [...ops, { op: 'race', rep, at: Date.now(), id: 'a2' }] }, g.token);
  assert.equal(r3.data.profile.stats.races, 2);
});