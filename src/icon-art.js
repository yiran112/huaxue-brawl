// 图片名使用打包后的相对路径，网页和微信小游戏使用同一份素材。
export const ICON_DIRECTORY = 'art/icons';
export const iconPath = (id) => `${ICON_DIRECTORY}/${id}.png`;
export const iconToken = (id) => `{{icon:${id}}}`;
export const rarityIcon = (tier) => `rarity-${tier.toLowerCase()}`;
export const rarityToken = (tier) => iconToken(rarityIcon(tier));
export const rarityLetter = (id) => /^rarity-([sabc])$/.exec(id)?.[1].toUpperCase() || '';

// 旧界面、比赛提示和联机消息仍可能带这些标记。在展示边界统一渲染成游戏素材。
const legacy = {
  '❄': 'coin', '🔒': 'lock', '🏆': 'trophy', '📋': 'tasks', '🎲': 'dice', '🏁': 'flag', '🏔': 'mountain', '🏠': 'room',
  '🥇': 'gold', '🥈': 'silver', '🥉': 'bronze', '⏱': 'timer', '⏳': 'timer', '⚠': 'warning', '💀': 'out',
  '🎁': 'gift', '⚙': 'settings', '🎮': 'settings', '🖥': 'settings', '🔧': 'settings', '⌨': 'settings',
  '😂': 'laugh', '😎': 'cool', '😡': 'angry', '👍': 'approve', '🎿': 'skis', '⛷': 'skis', '🏂': 'board', '🛷': 'sled',
  '🍩': 'tube', '🎒': 'backpack', '🥽': 'goggles', '🧣': 'scarf', '💇': 'hair', '⛑': 'shield',
  '🌀': 'motion', '💨': 'motion', '✨': 'motion', '🤸': 'motion', '🌪': 'motion', '💫': 'motion', '✋': 'approve',
  '🎯': 'target', '💥': 'impact', '📊': 'chart', '📖': 'tasks', '🏅': 'gold', '🎖': 'silver', '👑': 'trophy',
  '🚀': 'rocket', '⚡': 'lightning', '⚪': 'snowball', '🧊': 'freeze', '🔫': 'gatling', '💣': 'mine', '🧨': 'dynamite',
  '🐐': 'goat', '✈': 'airstrike', '🛫': 'airstrike', '🔥': 'boost', '🛡': 'shield', '🥊': 'punch', '⚓': 'hook', '☃': 'bigball',
  '🌲': 'mountain', '⛰': 'mountain', '🏘': 'room', '🗺': 'mountain', '🚡': 'mountain', '🪵': 'mountain', '🪨': 'mountain',
  '🌙': 'mountain', '☀': 'mountain', '🌄': 'mountain', '🌨': 'mountain', '🌌': 'mountain', '☁': 'mountain',
  '💎': 'guard', '🌟': 'gold', '💠': 'guard', '🔗': 'hook', '⛓': 'hook', '🤝': 'flag', '🥏': 'tube',
  '🛹': 'board', '🟦': 'tube', '🗡': 'skis', '🐟': 'board', '🚲': 'sled', '🚤': 'tube', '🏍': 'sled', '🛸': 'tube', '🦅': 'board',
  '🏎': 'sled', '🚘': 'sled', '💾': 'tasks', '📬': 'gift', '🔑': 'lock', '🔓': 'lock', '👻': 'out', '🎨': 'hair', '🧱': 'mountain',
  '🔩': 'bind', '🔋': 'charge', '🕯': 'wax', '🦾': 'brace', '🌈': 'motion', '🕳': 'mountain', '🤖': 'settings',
  '🔇': '', '🔊': '', '🤹': 'motion', '😵': 'impact', '⏩': 'boost', '✅': 'tasks', '⭕': 'tube', '⭐': 'gold', '🦌': 'goat',
};
const iconSyntax = /(\{\{icon:[a-z0-9-]+\}\}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\u200D\p{Extended_Pictographic})*)/u;
const directionalSymbols = new Set(['▶', '◀']);

export function iconRuns(value) {
  const text = String(value);
  if (!iconSyntax.test(text)) return null;
  return text.split(iconSyntax).flatMap((part, i) => {
    if (!part) return [];
    if (i % 2 === 0 || directionalSymbols.has(part)) return [part];
    const id = part.startsWith('{{icon:') ? part.slice(7, -2) : legacy[part.replace(/[\uFE0E\uFE0F]/g, '')];
    return id ? [{ id }] : [];
  });
}

export function plainIconText(value) {
  const runs = iconRuns(value);
  return runs ? runs.filter((part) => typeof part === 'string').join('').trim() : String(value);
}

const images = new Map();

export function gameIconImage(id, onReady) {
  let handle = images.get(id);
  if (!handle) {
    const image = document.createElement('img');
    const ready = new Set();
    handle = { image, loaded: false, failed: false, ready };
    images.set(id, handle);
    image.onload = () => {
      handle.loaded = true;
      for (const callback of ready) callback(image);
      ready.clear();
    };
    image.onerror = () => { handle.failed = true; ready.clear(); };
    image.src = iconPath(id);
  }
  if (onReady && !handle.loaded && !handle.failed) handle.ready.add(onReady);
  return handle.loaded ? handle.image : null;
}
