import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { BoolInput } from './ui/input/BoolInput.js';
import { Table } from './ui/input/Table.js';

class Finder extends HTMLElement {
  constructor(sheet) {
    super();
    this.sheet = sheet;
    this.found = [];
    this.search = "";

    this.lastSearch = "";
    this.idx = 0;
    this.advanced = false;
    this.table = new Table();
    let img;

    this.caseSensitive = new BoolInput(false);
    this.caseSensitive.style.float = "right";
    this.caseSensitive.style.marginRight = ".2em";

    this.findIn = document.createElement("input");
    this.foundInfo = document.createElement("span");
    this.replaceIn = document.createElement("input");
    this.caseInfo = document.createElement("span");

    this.foundInfo.style.width = "10em";
    this.foundInfo.style.cursor = "pointer";
    this.foundInfo.style.display = "inline-block";
    this.foundInfo.style.textAlign = "left";

    this.table.br();
    this.table.push(this.caseSensitive);
    this.table.push(this.caseInfo);
    this.table.br();

    img = document.createElement("img");
    img.addEventListener('click', e => { this.find(); });
    img.style.cursor = "pointer";

    img.src = "icn/menu/find.svg";
    img.style.marginLeft = "9em";
    this.table.push(img);
    this.table.push(this.findIn);
    this.table.push(this.foundInfo);
    this.table.br();
    img = document.createElement("img");
    img.src = "icn/menu/replace.svg";
    img.style.marginLeft = "9em";

    this.table.push(img);
    this.table.push(this.replaceIn);

    this.replaceBtn = document.createElement("button");
    this.replaceBtn.innerText = "Replace All";
    this.replaceBtn.style.marginBottom = "1.5em";
    this.table.br();
    this.table.push();
    this.table.push(this.replaceBtn);

    this.listTable = new Table();

    this.findIn.addEventListener('input', e => { this.find(); });
    this.foundInfo.addEventListener('click', e => { this.find(); });
    this.replaceBtn.addEventListener('click', e => { this.replaceAll(); });
    this.findIn.addEventListener("keydown", e => {
      switch (e.key.toUpperCase()) {
        case "ENTER": this.find(); break;
        case "TAB": this.replaceIn.focus(); break;
      }
    });
    this.replaceIn.addEventListener("keydown", e => {
      switch (e.key.toUpperCase()) {
        case "ENTER": this.replaceAll(); break;
        case "TAB": this.findIn.focus(); break;
      }
    });
    this.caseSensitive.onchange = e => {
      this.caseInfo.innerHTML = this.caseSensitive.value ? "A &ne; a" : "A = a";
      this.find(true);
    };

    this.caseInfo.innerHTML = "A &ne; a";

    this.listTable.style.maxHeight = "20em";
    this.listTable.classList.add("scroll");
    this.listTable.style.margin = "1em";
    this.listTable.style.display = "inline-block";
    this.table.style.display = "inline-block";
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.appendChild(this.listTable);
    this.appendChild(this.table);
  }

  showTable() {
    let i = 0;
    this.listTable.style.display = "block";
    while (this.listTable.rows.length > 0) this.listTable.rows[0].remove();
    for (const e of this.found) {
      i++;
      if (i > 500) return;
      this.listTable.br();
      this.listTable.push(e.x + 1);
      this.listTable.push(e.y + 1);
      this.listTable.push(e.v.replace(this.exp, "<b>" + this.search + "</b>"));
    }
  }

  find(force = false) {
    const activeSheet = this.sheet || StateManager.getState('sheet');
    this.listTable.style.display = "none";
    this.search = this.findIn.value;
    if (this.search.length < 1) {
      this.lastSearch = this.search;
      this.found = [];
    } else if (this.lastSearch === this.search && !force) {
      this.idx = (this.idx + 1) % this.found.length;
    } else {
      this.lastSearch = this.search;
      this.idx = 0;
      this.found = [];
      this.exp = new RegExp(this.search, (this.caseSensitive.value && this.advanced) ? 'g' : 'gi');
      const yStart = 0;
      const xStart = 0;
      const yEnd = activeSheet ? activeSheet.df.height - 1 : 0;
      const xEnd = activeSheet ? activeSheet.df.width - 1 : 0;
      if (activeSheet) {
        for (let y = yStart; y <= yEnd; y++) for (let x = xStart; x <= xEnd; x++) {
          const v = activeSheet.df.get(x, y);
          this.exp.lastIndex = 0;
          if (this.exp.test(v)) this.found.push({ x: x, y: y, v: v });
        }
      }
    }
    const info = (this.found.length === 0) ? "No match" : (this.idx + 1) + ' / ' + this.found.length;
    this.foundInfo.innerHTML = info;
    if (this.found.length > 0 && activeSheet) {
      activeSheet.x = this.found[this.idx].x;
      activeSheet.y = this.found[this.idx].y;
      activeSheet.slctRefresh();
    }
  }

  findMenu(prefill = "", adv = false) {
    this.listTable.style.display = "none";
    this.advanced = adv;
    if (this.advanced) for (const row of this.table.rows) row.style.display = "table-row";
    else for (const row of this.table.rows) if (row.rowIndex !== 1) row.style.display = "none";
    if (prefill.length > 0) this.findIn.value = prefill;
    if (dom?.dialog) dom.dialog.push(this);
    this.findIn.focus();
    if (prefill.length > 0) this.find(false);
  }

  replaceAll() {
    if (this.search.length < 1) return;
    const activeSheet = this.sheet || StateManager.getState('sheet');
    if (!activeSheet) return;
    for (const e of this.found) {
      this.exp.lastIndex = 0;
      activeSheet.df.edit(e.x, e.y, e.v.replace(this.exp, this.replaceIn.value));
    }
    activeSheet.refresh();
    activeSheet.slctRefresh(true);
    this.find(true);
  }
}

if (!customElements.get('ui-finder')) {
  customElements.define('ui-finder', Finder);
}

export { Finder };
