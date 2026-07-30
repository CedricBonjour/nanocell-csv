import { dom } from './dom.js';

class Msg extends HTMLElement {
  constructor(txt = "Empty message", opt = {}) {
    super();
    this.txt = txt;
    this.opt = opt;
    this.content = document.createElement("div");
    this.ok = document.createElement("button");
    this.cancel = document.createElement("button");
    this.content.innerHTML = txt;
    this.ok.innerHTML = "Ok";
    this.cancel.innerHTML = "Cancel";

    this.ok.onclick = () => { if (this.opt.cbt) this.opt.cbt(); if (dom?.dialog) dom.dialog.clear(); };
    this.cancel.onclick = () => { if (this.opt.cbf) this.opt.cbf(); if (dom?.dialog) dom.dialog.clear(); };
    this.ok.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB" || k === "ARROWLEFT") this.cancel.focus();
    });
    this.cancel.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB" || k === "ARROWRIGHT") this.ok.focus();
    });
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.appendChild(this.content);
    if (this.opt.id === 3) this.appendChild(this.cancel);
    if (!this.opt.t) this.appendChild(this.ok);
    if (dom?.dialog) dom.dialog.push(this);
    this.ok.focus();
    if (this.opt.t) setTimeout(() => { if (dom?.dialog) dom.dialog.clear(); }, this.opt.t);
  }

  static quick(txt) { new Msg(txt, { id: 0, t: 1000 }); }
  static long(txt) { new Msg(txt, { id: 1, t: 3000 }); }
  static confirm(txt) { new Msg(txt, { id: 2 }); }
  static choice(txt, cbTrue, cbFalse) { new Msg(txt, { id: 3, cbt: cbTrue, cbf: cbFalse }); }
}

if (!customElements.get('ui-msg')) {
  customElements.define('ui-msg', Msg);
}

export { Msg };
