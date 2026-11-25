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
window.game = new Game({ Account, UI, RaceHud, Touch });
