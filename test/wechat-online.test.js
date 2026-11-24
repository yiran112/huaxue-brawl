import assert from 'node:assert/strict';
import test from 'node:test';

test('微信联机：位置同步只发送当前数据范围内的 ArrayBuffer', async (t) => {
  const sent = [];
  globalThis.__WECHAT_API_ORIGIN__ = 'https://game.example.com';
  globalThis.GameGlobal = {};
  globalThis.wx = {
    createCanvas: () => ({}),
    getFileSystemManager: () => ({}),
    getWindowInfo: () => ({ windowWidth: 1280, windowHeight: 720 }),
    getStorageSync() {},
    setStorageSync() {},
    removeStorageSync() {},
    connectSocket() {
      return {
        onOpen() {},
        onMessage() {},
        onClose() {},
        onError() {},
        send({ data }) {
          assert.ok(typeof data === 'string' || data instanceof ArrayBuffer);
          sent.push(data);
        },
      };
    },
  };
  t.after(() => {
    delete globalThis.__WECHAT_API_ORIGIN__;
    delete globalThis.GameGlobal;
    delete globalThis.wx;
  });

  const { runtime } = await import('../wechat/runtime.js');
  const socket = new runtime.WebSocket('wss://game.example.com/ws');
  const bytes = Uint8Array.of(9, 1, 2, 8);
  socket.send(bytes.subarray(1, 3));
  socket.send('{"t":"ready"}');

  bytes[1] = 7;
  assert.deepEqual([...new Uint8Array(sent[0])], [1, 2]);
  assert.equal(sent[1], '{"t":"ready"}');
});
