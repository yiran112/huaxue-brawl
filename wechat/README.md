# 雪山大乱斗 · 微信小游戏

运行 `npm ci` 和 `npm run build:wechat`，然后用微信开发者工具以「小游戏」项目导入 `dist-wechat`。构建默认使用 `wechat/project.config.json` 中的 AppID。需要临时使用另一个有开发权限的 AppID 时，可以通过环境变量覆盖。

```powershell
$env:WECHAT_GAME_APPID = 'wx你的小游戏AppID'
npm run build:wechat
```

默认可离线游玩，昵称、解锁、装备、成绩和设置保存在设备上。玩法包含原有七种比赛模式和雪松村试滑。比赛自动俯冲，左手转向，右手使用跳跃、漂移、刹车、道具和氮气。腾空后再按住跳跃可后空翻，按住转体并配合方向键可旋转。

## 联机配置

将现有 Node.js 服务部署到提供 HTTPS 和 WSS 的同一个域名，保留 `/api/*` 路径及 `/ws` 的 WebSocket 升级。在微信公众平台登记 request 和 socket 合法域名。将公开服务地址传给构建，不要把密码或 AppSecret 写入客户端。

```powershell
$env:WECHAT_API_ORIGIN = 'https://snow.example.com'
npm run build:wechat
```

配置服务后，小游戏显示匹配、好友房和排位入口，好友房可通过微信分享。个人面板可开通同一后端的游客云存档。网页的用户名和密码登录、网页存档迁移、微信账号登录尚未接入。

## 构建结构

`dist-wechat/game.js` 和 `game.json` 是小游戏入口及配置。主包包含游戏、UI、大厅音乐和音效，赛道音乐按需加载。小游戏使用支持 WebGL 1 的 Three.js r162，网页继续使用 r170。两端共用赛道、玩法、模型、物理和经济逻辑。网页产物由 `npm run build` 输出到 `dist`。
