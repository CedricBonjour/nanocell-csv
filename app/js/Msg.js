import { dom } from './dom.js';

class Msg extends HTMLElement {
  constructor(txt = "Empty message", opt = {}) {
    super();
    this.content = document.createElement("div");
    this.ok = document.createElement("button");
    this.cancel = document.createElement("button");
    this.content.innerHTML = txt;
    this.ok.innerHTML = "Ok";
    this.cancel.innerHTML = "Cancel";
    this.appendChild(this.content);
    if (opt.id === 3) this.appendChild(this.cancel);
    if (!opt.t) this.appendChild(this.ok);
    dom.dialog.push(this);
    this.ok.onclick = () => { if (opt.cbt) opt.cbt(); dom.dialog.clear() }
    this.cancel.onclick = () => { if (opt.cbf) opt.cbf(); dom.dialog.clear() }
    this.ok.focus();
    this.ok.addEventListener('keydown', (e) => {
      var k = e.key.toUpperCase();
      if (k === "TAB") this.cancel.focus();
      if (k === "ARROWLEFT") this.cancel.focus();
    });
    this.cancel.addEventListener('keydown', (e) => {
      var k = e.key.toUpperCase();
      if (k === "TAB") this.ok.focus();
      if (k === "ARROWRIGHT") this.ok.focus();
    });
    if (opt.t) setTimeout(() => { dom.dialog.clear() }, opt.t);
  }
  static quick(txt) { new Msg(txt, { id: 0, t: 1000 }) }
  static long(txt) { new Msg(txt, { id: 1, t: 3000 }) }
  static confirm(txt) { new Msg(txt, { id: 2 }) }
  static choice(txt, cbTrue, cbFalse) { new Msg(txt, { id: 3, cbt: cbTrue, cbf: cbFalse }) }
}

customElements.define('ui-msg', Msg);


export { Msg };
