import { Account } from './account.js';
import { Game } from './main.js';
import { RaceHud } from './racehud.js';
import { Touch } from './touch.js';
import { UI } from './ui.js';
import { applyGameIcons } from './ui/web-icons.js';
import './ui/web-icons.css';
import './ui/side-nav.css';
import './ui/side-nav.css';

applyGameIcons(document.body);
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('results-preview');
window.game = new Game({ Account, UI, RaceHud, Touch, preview });
if (preview) {
  import('../ref/results-preview.js').then(({ previewResults }) => previewResults(window.game));
}
