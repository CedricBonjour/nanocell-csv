import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { Table } from './ui/input/Table.js';

class Shortcuts extends HTMLElement {
  constructor() {
    super();
    var title = document.createElement("h1")
    title.innerHTML = "Keyboard Shortcuts";
    this.appendChild(title);
    this.table = new Table();
    this.build();
    this.appendChild(this.table)
    dom.dialog.push(this, true);
    this.style.textAlign = "left";
    this.style.margin = "2em";
    this.table.style.borderSpacing = "1em 0";
  }

  build() {
    for (var c of Object.values(cmd)) {
      var k = c.k;
      k = k.replace("ENTER", "&#11152;").replace("BACKSPACE", "&#9003;").replace("TAB", "&#11122;").replace("SPACE", "&#9251;")
      k = k.replace("ARROWUP", '&uarr;').replace("ARROWRIGHT", '&rarr;').replace("ARROWDOWN", '&darr;').replace("ARROWLEFT", '&larr;')

      this.table.br();
      this.table.push((c.ctrl) ? 'Ctrl' : '');
      this.table.push((c.alt) ? 'Alt' : '');
      this.table.push((c.shift) ? '&#8679;' : '');
      this.table.push(k);
      this.table.push(c.description);
    }
  }
}

customElements.define('ui-shortcuts', Shortcuts);






export { Shortcuts };
