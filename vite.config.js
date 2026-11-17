import { defineConfig } from 'vite'
import { attachMatchServer } from './server/match.js'

// 联机匹配服务直接挂在 Vite 的服务器上（路径 /ws），开发时不用另开一个进程。
// 独立部署见 server/index.js。
const matchServer = () => {
  const attach = (server) => {
    if (!server.httpServer) return
    const match = attachMatchServer(server.httpServer, { log: (s) => console.log(s) })
    server.httpServer.once('close', () => match.dispose())
  }
  return { name: 'huaxue-match-server', configureServer: attach, configurePreviewServer: attach }
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
