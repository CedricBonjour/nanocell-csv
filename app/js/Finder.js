import { dom } from './dom.js';
import { sheet } from './main.js';
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
    var img;

    this.caseSensitive = new BoolInput(false);
    this.caseSensitive.style.float = "right"
    this.caseSensitive.style.marginRight = ".2em"

    this.findIn = document.createElement("input");
    this.foundInfo = document.createElement("span")
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
    img.addEventListener('click', e => { this.find() });
    img.style.cursor = "pointer";

    img.src = "icn/menu/find.svg";
    img.style.marginLeft = "9em"
    this.table.push(img);
    this.table.push(this.findIn);
    this.table.push(this.foundInfo);
    this.table.br();
    img = document.createElement("img");
    img.src = "icn/menu/replace.svg";
    img.style.marginLeft = "9em"

    this.table.push(img);
    this.table.push(this.replaceIn);


    this.replaceBtn = document.createElement("button");
    this.replaceBtn.innerText = "Replace All"
    this.replaceBtn.style.marginBottom = "1.5em"
    this.table.br();
    this.table.push();
    this.table.push(this.replaceBtn);

    this.listTable = new Table();

    this.appendChild(this.listTable);

    this.appendChild(this.table);

    this.findIn.addEventListener('input', e => { this.find() });
    this.foundInfo.addEventListener('click', e => { this.find() });
    this.replaceBtn.addEventListener('click', e => { this.replaceAll() });
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
      this.find(true)
    }

    this.caseInfo.innerHTML = "A &ne; a";

    this.listTable.style.maxHeight = "20em";

    this.listTable.classList.add("scroll");
    this.listTable.style.margin = "1em";
    this.listTable.style.display = "inline-block";
    this.table.style.display = "inline-block";
  }
  showTable() {
    var i = 0;
    this.listTable.style.display = "block";
    while (this.listTable.rows.length > 0) this.listTable.rows[0].remove();
    for (var e of this.found) {
      i++;
      if (i > 500) return;
      this.listTable.br();
      this.listTable.push(e.x + 1);
      this.listTable.push(e.y + 1);
      this.listTable.push(e.v.replace(this.exp, "<b>" + this.search + "</b>"));


    }
  }
  find(force = false) {

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
      var yStart = 0;
      var xStart = 0;
      var yEnd = this.sheet.df.height - 1;
      var xEnd = this.sheet.df.width - 1;
      for (var y = yStart; y <= yEnd; y++)for (var x = xStart; x <= xEnd; x++) {
        var v = this.sheet.df.get(x, y);
        this.exp.lastIndex = 0;
        if (this.exp.test(v)) this.found.push({ x: x, y: y, v: v });
      }


    }
    var info = (this.found.length === 0) ? "No match" : (this.idx + 1) + ' / ' + this.found.length;
    this.foundInfo.innerHTML = info;
    if (this.found.length > 0) {
      sheet.x = this.found[this.idx].x;
      sheet.y = this.found[this.idx].y;
      sheet.slctRefresh();
    }

  }

  findMenu(prefill = "", adv = false) {
    this.listTable.style.display = "none";
    this.advanced = adv;
    if (this.advanced) for (var row of this.table.rows) row.style.display = "table-row";
    else for (var row of this.table.rows) if (row.rowIndex !== 1) row.style.display = "none";
    if (prefill.length > 0) this.findIn.value = prefill;
    dom.dialog.push(this);
    this.findIn.focus();
    if (prefill.length > 0) this.find(false)
  }

  replaceAll() {
    if (this.search.length < 1) return;
    for (var e of this.found) {
      this.exp.lastIndex = 0;
      this.sheet.df.edit(e.x, e.y, e.v.replace(this.exp, this.replaceIn.value));
    }
    this.sheet.refresh();
    this.sheet.slctRefresh(focus = true);
    this.find(true);
  }

}

customElements.define('ui-finder', Finder);


export { Finder };
