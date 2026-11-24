import { pressTouch } from '../src/touch.js';

function point(touch) {
  return [touch.clientX ?? touch.x, touch.clientY ?? touch.y];
}

export class MiniTouch {
  constructor(game) {
    this.game = game;
    this.held = new Map();
    game.autoTuck = true;
    wx.onTouchStart((event) => this.start(event.changedTouches));
    wx.onTouchMove?.((event) => this.move(event.changedTouches));
    wx.onTouchEnd((event) => this.end(event.changedTouches));
    wx.onTouchCancel(() => this.release());
  }

  start(touches) {
    const g = this.game;
    g.sfx.init();
    if (g.state === 'menu') g.sfx.menuStart();
    for (const touch of touches) {
      const [x, y] = point(touch);
      const button = g.ui.hit(x, y);
      const gesture = g.ui.gestureAt(x, y);
      if (!button && !gesture) continue;
      this.held.set(touch.identifier, { button, gesture, x, y, lastX: x, moved: false });
      if (button?.control) this.press(button.control, true);
    }
  }

  move(touches) {
    const g = this.game;
    for (const touch of touches) {
      const held = this.held.get(touch.identifier);
      if (!held || held.button?.control) continue;
      const [x, y] = point(touch);
      const { gesture } = held;
      if (!held.moved && Math.hypot(x - held.x, y - held.y) < 7) continue;
      held.moved = true;
      if (gesture?.orbit) g.showroom?.drag((x - held.lastX) / g.ui.scale);
      else if (gesture) {
        const delta = gesture.horizontal ? held.x - x : held.y - y;
        g.ui.offsets.set(gesture.key, Math.max(0, Math.min(gesture.max, gesture.offset + delta / g.ui.scale)));
        g.ui.invalidate();
      }
      held.lastX = x;
    }
  }

  end(touches) {
    for (const touch of touches) {
      const held = this.held.get(touch.identifier);
      if (!held) continue;
      this.held.delete(touch.identifier);
      const { button } = held;
      if (!button) continue;
      if (button.control) {
        if (!this.pressed(button.control)) this.press(button.control, false);
      } else if (!held.moved && this.game.ui.contains(button, ...point(touch))) {
        this.game.sfx.uiSound(button.primary ? 'confirm' : 'click');
        button.action();
      }
    }
  }

  pressed(action) {
    return [...this.held.values()].some(({ button }) => button?.control === action);
  }

  press(action, down) {
    pressTouch(this.game, action, down, (on) => {
      this.game.ui.emotesOpen = on ?? !this.game.ui.emotesOpen;
    });
    this.game.ui.invalidate();
  }

  release() {
    for (const { button } of this.held.values()) {
      if (button?.control) this.press(button.control, false);
    }
    this.held.clear();
  }
}
