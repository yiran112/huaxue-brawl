import { Account } from './account.js';
import { Game } from './main.js';
import { RaceHud } from './racehud.js';
import { Touch } from './touch.js';
import { UI } from './ui.js';

window.game = new Game({ Account, UI, RaceHud, Touch });
