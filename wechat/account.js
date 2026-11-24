import { Account } from '../src/account.js';

export class MiniAccount extends Account {
  bindView() {}

  async boot() {
    if (this.game.mini.online && this.token) await super.boot();
  }

  addOp(op) {
    if (this.game.mini.online) super.addOp(op);
  }

  openManage() {
    this.show();
  }

  show() {
    this.game.ui.accountOpen = true;
    this.game.ui.invalidate();
  }

  hide() {
    this.gate = false;
    this.game.ui.accountOpen = false;
    this.game.ui.invalidate();
  }

  render() {
    this.game.ui.invalidate();
  }

  renderOffline(message) {
    this.setErr(message);
  }

  setErr(message) {
    if (message) this.game.ui.toast(message, true);
  }

  showBusy() {
    this.game.ui.invalidate();
  }
}
