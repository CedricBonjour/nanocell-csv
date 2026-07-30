import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { Table } from './ui/input/Table.js';

class Shortcuts extends HTMLElement {
  constructor() {
    super();
    this.titleEl = document.createElement("h1");
    this.titleEl.innerHTML = "Keyboard Shortcuts";
    this.table = new Table();
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.style.textAlign = "left";
    this.style.margin = "2em";
    this.table.style.borderSpacing = "1em 0";

    this.build();
    this.appendChild(this.titleEl);
    this.appendChild(this.table);
    if (dom?.dialog) dom.dialog.push(this, true);
  }

  build() {
    for (const c of Object.values(cmd)) {
      let k = c.k || '';
      k = k.replace("ENTER", "&#11152;").replace("BACKSPACE", "&#9003;").replace("TAB", "&#11122;").replace("SPACE", "&#9251;");
      k = k.replace("ARROWUP", '&uarr;').replace("ARROWRIGHT", '&rarr;').replace("ARROWDOWN", '&darr;').replace("ARROWLEFT", '&larr;');

      this.table.br();
      this.table.push((c.ctrl) ? 'Ctrl' : '');
      this.table.push((c.alt) ? 'Alt' : '');
      this.table.push((c.shift) ? '&#8679;' : '');
      this.table.push(k);
      this.table.push(c.description || '');
    }
  }
}

if (!customElements.get('ui-shortcuts')) {
  customElements.define('ui-shortcuts', Shortcuts);
}

export { Shortcuts };
