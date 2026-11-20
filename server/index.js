// 独立部署用：一个端口同时提供打包好的游戏网页（dist）和联机匹配服务。
// 用法：npm run build && npm run serve      端口用环境变量 PORT 改，默认 8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachMatchServer } from './match.js';
import { createAccount } from './account.js';
import { createPresence, handleOnlineRequest } from './presence.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

let match = null;
const account = createAccount();
const presence = createPresence();
const onlineCount = () => Math.max(presence.count(), match ? match.stats().online : 0, 1);

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/api/online' || pathname === '/api/presence') {
    handleOnlineRequest(req, res, presence, onlineCount).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end();
    });
    return;
  }
  if (pathname.startsWith('/api/')) {
    account.handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"error":"服务器出错了"}');
      }
    });
    return;
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] }).end(JSON.stringify(match.stats()));
    return;
  }
  let file = path.join(DIST, pathname);
  // 不允许跳出 dist 目录
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(DIST, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('找不到 dist 目录，请先运行 npm run build');
        return;
      }
      const hashed = pathname.startsWith('/assets/');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(data);
    });
  });
});

match = attachMatchServer(server, { exclusive: true, log: console.log, online: onlineCount, verify: account.gearOf });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`雪山大乱斗 联机服务器已启动：http://localhost:${PORT}`);
  console.log('局域网或公网的朋友，把 localhost 换成这台机器的 IP 就能进。');
});
