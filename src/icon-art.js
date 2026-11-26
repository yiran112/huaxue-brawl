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
const directionalSymbols = new Set(['▶', '◀']);
const fallbackGlyphs = new Map();
for (const [glyph, id] of Object.entries(legacy)) {
  if (id && !fallbackGlyphs.has(id)) fallbackGlyphs.set(id, glyph);
}

export const fallbackIconGlyph = (id) => rarityLetter(id) || fallbackGlyphs.get(id) || '';

function makeIconSyntax() {
  const token = '\\{\\{icon:[a-z0-9-]+\\}\\}';
  const pattern = (glyph) => '(' + token + '|' + glyph + '(?:[\\uFE0E\\uFE0F]|\\u200D' + glyph + ')*)';
  // Some embedded JS engines reject this Unicode property while parsing a regex literal.
  try {
    return new RegExp(pattern('\\p{Extended_Pictographic}'), 'u');
  } catch {
    const glyph = '(?:' + Object.keys(legacy).join('|') + '|[▶◀]|[\\uD83C-\\uD83E][\\uDC00-\\uDFFF])';
    return new RegExp(pattern(glyph));
  }
}

const iconSyntax = makeIconSyntax();

export function iconRuns(value) {
  const text = String(value);
  if (!iconSyntax.test(text)) return null;
  const runs = [];
  const parts = text.split(iconSyntax);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (i % 2 === 0 || directionalSymbols.has(part)) {
      runs.push(part);
      continue;
    }
    const id = part.startsWith('{{icon:') ? part.slice(7, -2) : legacy[part.replace(/[\uFE0E\uFE0F]/g, '')];
    if (id) runs.push({ id });
  }
  return runs;
}

export function plainIconText(value) {
  const runs = iconRuns(value);
  return runs ? runs.map((part) => typeof part === 'string' ? part : rarityLetter(part.id)).join('').trim() : String(value);
}

const images = new Map();

export function gameIconImage(id, onReady) {
  let handle = images.get(id);
  if (!handle) {
    handle = { image: null, loaded: false, failed: false, ready: new Set() };
    images.set(id, handle);
    const fail = () => { handle.failed = true; handle.ready.clear(); };
    try {
      const image = document.createElement('img');
      if (!image) {
        fail();
      } else {
        handle.image = image;
        image.onload = () => {
          if (handle.failed) return;
          handle.loaded = true;
          for (const callback of handle.ready) callback(image);
          handle.ready.clear();
        };
        image.onerror = fail;
        image.src = iconPath(id);
      }
    } catch {
      // Optional artwork must never interrupt game initialization.
      fail();
    }
  }
  if (onReady && !handle.loaded && !handle.failed) handle.ready.add(onReady);
  return handle.loaded ? handle.image : null;
}
