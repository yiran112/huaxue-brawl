import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = JSON.parse(await readFile(resolve(root, 'wechat/project.config.json'), 'utf8'));
const appid = process.env.WECHAT_GAME_APPID || project.appid;
const apiOrigin = process.env.WECHAT_API_ORIGIN || '';
const outDir = resolve(root, 'dist-wechat');
const localProject = await readFile(resolve(outDir, 'project.config.json'), 'utf8')
  .then((source) => JSON.parse(source.replace(/^\uFEFF/, '')), (error) => {
    if (error.code !== 'ENOENT') throw error;
    return {};
  });
if (appid !== 'touristappid' && !/^wx[0-9a-f]{16}$/.test(appid)) throw new Error('WECHAT_GAME_APPID 格式不正确');
if (apiOrigin && !/^https:\/\/[a-z0-9.-]+$/i.test(apiOrigin)) {
  throw new Error('WECHAT_API_ORIGIN 需要填写 HTTPS 服务域名，例如 https://snow.example.com');
}

const files = new Map();
const icons = (await readdir(resolve(root, 'public/art/icons'))).filter((name) => /^[a-z0-9-]+\.png$/.test(name));
const subpackages = ['music-classic', 'music-alpine', 'music-expedition'].map((name) => ({ name, root: name }));
const tracks = await readdir(resolve(root, 'src/music/tracks'));
for (const [i, track] of tracks.entries()) {
  if (track.endsWith('.mp3')) files.set('music/tracks/' + track, subpackages[1 + (i % 2)].root + '/' + track);
}
files.set('music/black-diamond.mp3', 'music-classic/black-diamond.mp3');
files.set('music/lobby.mp3', 'audio/lobby.mp3');
for (const name of await readdir(resolve(root, 'src/sfx'))) {
  if (name.endsWith('.mp3')) files.set('sfx/' + name, 'audio/' + name);
}
const json = (data) => JSON.stringify(data, null, 2) + '\n';
const globals = ['window', 'document', 'self', 'matchMedia', 'localStorage', 'sessionStorage',
  'fetch', 'location', 'WebSocket', 'AbortController', 'performance'];

await build({
  root,
  configFile: false,
  publicDir: false,
  define: {
    ...Object.fromEntries(globals.map((name) => [name, 'GameGlobal.huaxueRuntime.' + name])),
    __WECHAT_API_ORIGIN__: JSON.stringify(apiOrigin),
  },
  resolve: {
    alias: [
      { find: /^three$/, replacement: 'three-wechat' },
      { find: /^three\/addons\//, replacement: 'three-wechat/addons/' },
    ],
  },
  plugins: [{
    name: 'wechat-build',
    enforce: 'pre',
    load(id) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      const asset = [...files].find(([key]) => path.endsWith('/src/' + key));
      if (asset) return 'export default ' + JSON.stringify(asset[1]);
    },
    async generateBundle(_, bundle) {
      const emit = (fileName, source) => this.emitFile({ type: 'asset', fileName, source });
      const audio = await Promise.all([...files].map(async ([src, dest]) => ({
        dest, bytes: await readFile(resolve(root, 'src', src)),
      })));
      for (const { dest, bytes } of audio) emit(dest, bytes);
      for (const name of icons) emit(`art/icons/${name}`, await readFile(resolve(root, 'public/art/icons', name)));
      for (const { root: folder } of subpackages) emit(folder + '/game.js', '// 配乐资源分包\n');
      emit('game.json', json({ deviceOrientation: 'landscape', showStatusBar: false, subpackages }));
      emit('project.config.json', json({
        ...project,
        ...localProject,
        appid,
        compileType: project.compileType,
        setting: { ...project.setting, ...localProject.setting },
      }));
      emit('three-LICENSE.txt', await readFile(resolve(root, 'node_modules/three-wechat/LICENSE')));
      const base = Object.values(bundle).reduce((sum, file) => sum + Buffer.byteLength(file.code ?? file.source), 0);
      const sizes = subpackages.map(({ root: folder }) => audio.filter(({ dest }) => dest.startsWith(folder + '/'))
        .reduce((sum, { bytes }) => sum + bytes.length, 0));
      const main = base - sizes.reduce((sum, size) => sum + size, 0);
      if (main >= 4_000_000 || sizes.some((size) => size >= 4_000_000) || base >= 20_000_000) {
        this.error('微信小游戏包体超出构建预算');
      }
      console.log(`微信小游戏主包 ${(main / 1e6).toFixed(2)} MB，总计 ${(base / 1e6).toFixed(2)} MB`);
    },
  }],
  build: {
    outDir,
    // Developer Tools stores simulator and private settings in the imported folder.
    emptyOutDir: false,
    target: 'es2019',
    rollupOptions: {
      input: resolve(root, 'wechat/game.js'),
      output: { format: 'iife', entryFileNames: 'game.js', inlineDynamicImports: true },
    },
  },
});
