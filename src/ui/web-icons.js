import { iconPath, iconRuns, plainIconText, rarityLetter } from '../icon-art.js';

function replaceTextNode(node) {
  const runs = iconRuns(node.data);
  if (!runs || runs.length === 1 && runs[0] === node.data) return;
  const content = document.createDocumentFragment();
  for (const run of runs) {
    if (typeof run === 'string') {
      content.append(run);
    } else {
      const image = document.createElement('img');
      const letter = rarityLetter(run.id);
      image.src = iconPath(run.id);
      image.alt = letter;
      image.draggable = false;
      image.className = letter ? 'game-icon rarity-art' : 'game-icon';
      content.append(image);
    }
  }
  node.replaceWith(content);
}

export function applyGameIcons(root) {
  const changes = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('style,script,textarea')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walk.nextNode(); node; node = walk.nextNode()) changes.push(node);
  changes.forEach(replaceTextNode);
  for (const el of root.querySelectorAll('[title],[aria-label]')) {
    for (const name of ['title', 'aria-label']) {
      const original = el.getAttribute(name);
      if (!original) continue;
      const label = plainIconText(original);
      if (label !== original) el.setAttribute(name, label);
    }
  }
}

export function setGameHtml(el, html) {
  el.innerHTML = html;
  applyGameIcons(el);
}

export function setGameText(el, text) {
  el.textContent = text;
  if (el.firstChild) replaceTextNode(el.firstChild);
}
