// 最近一段时间还开着游戏的人。匹配用这个数决定等多久再补机器人。
import { botWaitMs } from '../src/wait.js';

const TTL = 20000;

export function createPresence() {
  const seen = new Map();
  const sweep = (now) => {
    for (const [k, t] of seen) if (now - t > TTL) seen.delete(k);
  };
  return {
    touch(id) {
      const now = Date.now();
      const key = String(id || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (key) seen.set(key, now);
      sweep(now);
      return seen.size;
    },
    count() {
      sweep(Date.now());
      return seen.size;
    },
  };
}

export function onlinePayload(online) {
  const n = Math.max(1, Math.floor(Number(online) || 1));
  return { online: n, wait: Math.round(botWaitMs(n) / 1000) };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

// 处理 /api/online 和 /api/presence。不是这两个地址就返回 false，交给别的接口。
export async function handleOnlineRequest(req, res, presence, onlineCount) {
  let pathname = '';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    return false;
  }
  if (pathname !== '/api/online' && pathname !== '/api/presence') return false;
  if (pathname === '/api/presence') {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return true;
    }
    let id = '';
    try {
      id = JSON.parse(await readBody(req)).id;
    } catch {
      /* 没有正文也算打过卡，只是不记这个人 */
    }
    presence.touch(typeof id === 'string' ? id : '');
  }
  const body = JSON.stringify(onlinePayload(onlineCount()));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
  return true;
}
