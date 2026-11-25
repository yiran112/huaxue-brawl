import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachMatchServer } from '../server/match.js';
import { DEFAULT_HAT } from '../src/config.js';
import { Profile, sanitizeProfile } from '../src/profile.js';

// 服务器上的存档含雪橇、打蜡强化和橙色雪镜
function saved() {
  const p = new Profile();
  p.loadData(sanitizeProfile({ owned: { 'gear:sled': true, 'goggles:1': true }, up: { sled: { wax: 2 } } }));
  return p;
}

function open(url) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    inbox.push(m);
    for (const w of waiters.splice(0)) w();
  });
  const next = async (t) => {
    for (;;) {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return inbox.splice(i, 1)[0];
      await new Promise((r) => waiters.push(r));
    }
  };
  const send = (m) => ws.send(JSON.stringify(m));
  return new Promise((resolve) => ws.on('open', () => resolve({ ws, next, send })));
}

test('联机开赛：装备和强化按服务器存档核对，没有账号的用默认装备', async () => {
  const server = http.createServer();
  const match = attachMatchServer(server, { verify: (tok) => (tok === 'good' ? saved() : null) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const a = await open(url);
  const b = await open(url);
  try {
    a.send({ t: 'create', name: '甲', tok: 'good', look: { gear: 'sled', hat: 0, goggles: 1, back: 3 }, rules: { mode: 'race', seats: 2 } });
    const room = await a.next('room');
    b.send({ t: 'join', id: room.id, name: '乙', tok: 'forged', look: { gear: 'sled' } });
    await b.next('room');
    a.send({ t: 'startnow' });
    const start = await a.next('start');
    const me = start.roster.find((e) => e.name === '甲');
    const other = start.roster.find((e) => e.name === '乙');
    assert.equal(me.look.gear, 'sled');
    assert.equal(me.up.wax, 2);
    assert.equal(me.look.hat, DEFAULT_HAT);
    assert.equal(me.look.goggles, 1);
    assert.equal(me.look.back, 0);
    assert.equal(other.look.gear, 'ski');
    assert.equal(other.up, null);
  } finally {
    a.ws.close();
    b.ws.close();
    match.dispose();
    server.close();
  }
});
