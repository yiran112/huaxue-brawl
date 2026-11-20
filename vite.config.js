import { defineConfig } from 'vite'
import { attachMatchServer } from './server/match.js'
import { createAccount } from './server/account.js'
import { createPresence, handleOnlineRequest } from './server/presence.js'

// 联机匹配和账号接口直接挂在 Vite 的服务器上，开发时不用另开一个进程。
// 独立部署见 server/index.js。
const account = createAccount()
const presence = createPresence()
const matchServer = () => {
  let match = null
  const onlineCount = () => Math.max(presence.count(), match ? match.stats().online : 0, 1)
  const attach = (server) => {
    if (!server.httpServer) return
    match = attachMatchServer(server.httpServer, { log: (s) => console.log(s), online: onlineCount, verify: account.gearOf })
    server.httpServer.once('close', () => match.dispose())
  }
  const api = (middlewares) => {
    middlewares.use((req, res, next) => {
      const url = req.url || ''
      if (url.startsWith('/api/online') || url.startsWith('/api/presence')) {
        handleOnlineRequest(req, res, presence, onlineCount).catch((err) => {
          console.error(err)
          if (!res.headersSent) res.writeHead(500).end()
        })
        return
      }
      if (!url.startsWith('/api/')) return next()
      account.handle(req, res).catch((err) => {
        console.error(err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end('{"error":"服务器出错了"}')
        }
      })
    })
  }
  return {
    name: 'huaxue-match-server',
    configureServer(server) {
      api(server.middlewares)
      attach(server)
    },
    configurePreviewServer(server) {
      api(server.middlewares)
      attach(server)
    },
  }
}

export default defineConfig({
  plugins: [matchServer()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
})
