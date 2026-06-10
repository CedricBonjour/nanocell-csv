import { cmd, buildMenu } from './cmd.js';
import { sheet } from './main.js';
import { TargetType, getTargetType } from './mouse.js';
import { Table } from './ui/input/Table.js';

class CMenu extends HTMLElement {
  constructor() {
    super();
    this.table = new Table();
    this.style.display = "none";
    this.firstBlock = document.createElement("div");
    this.firstBlock.classList.add("cmenu_header")

    this.list = [
      { key: "sa", txt: "Sort", opt: "A<br>Z", run: cmd.sort.run },
      { key: "sd", txt: "Sort", opt: "Z<br>A", run: cmd.sort_reverse.run },
      { key: "rn", txt: "Round", opt: "N", run: cmd.integer.run },
      { key: "rf", txt: "Round", opt: "$", run: cmd.decimal.run },
      { key: "ic", txt: "Insert", opt: "&verbar;", run: cmd.insertLeft.run },
      { key: "ir", txt: "Insert", opt: "&horbar;", run: cmd.insertUp.run },
      { key: "dc", txt: "Delete", opt: "&verbar;", run: cmd.deleteCol.run },
      { key: "dr", txt: "Delete", opt: "&horbar;", run: cmd.deleteRow.run },
    ]

    this.addEventListener('mouseout', event => {
      if (this.contains(event.relatedTarget)) return;
      this.style.display = "none";
    });

    this.buildMenu();
    this.appendChild(this.firstBlock);
    this.appendChild(this.table);

  }

  showItems(show_list) {
    for (let i = 0; i < this.list.length; i++) {
      if (show_list.includes(this.list[i].key)) this.table.rows[i].style.display = "table-row";
      else this.table.rows[i].style.display = "none";
    }
  }

  pop(e) {
    this.event = e;
    this.ttype = getTargetType(e);
    if (!this.isValidTarget()) return;
    this.x = e.target.tx;
    this.y = e.target.ty;
    this.reposition();
    if (this.ttype === TargetType.colH) {
      sheet.slctCol(this.x + sheet.baseX);
      this.firstBlock.innerText = "col : " + e.target.innerText;
      this.showItems(["sa", "sd", "rn", "rf", "ic", "dc"])
    } else if (this.ttype === TargetType.rowH) {
      sheet.slctRow(this.y + sheet.baseY);
      this.firstBlock.innerText = "row : " + e.target.innerText;
      this.showItems(["rn", "rf", "ir", "dr"])
    } else if (e.target.classList.contains("slct")) {
      this.firstBlock.innerText = "selection";
      this.showItems(["rn", "rf", "dc", "dr"])
    } else {
      sheet.x = e.target.tx + sheet.baseX;
      sheet.y = e.target.ty + sheet.baseY;
      sheet.slctRefresh();
      this.firstBlock.innerText = "cell";
      this.showItems(["rn", "rf", "ic", "ir", "dc", "dr"])
    }
    this.style.display = "block"
  }

  buildMenu() {
    for (var item of this.list) {
      this.table.br();
      let div = document.createElement("div");
      div.innerHTML = item.txt;
      this.table.push(div);
      if (item.opt) {
        let optDiv = document.createElement("div");
        optDiv.innerHTML = item.opt;
        this.table.push(optDiv);
        optDiv.classList.add("cmenu_opt")
      }
      this.table.activeRow().addEventListener('click', item.run);
    }
  }

  isValidTarget() {
    let okTargets = [
      TargetType.cell,
      TargetType.rowH,
      TargetType.colH,
    ]
    return (okTargets.includes(this.ttype))
  }

  reposition() {
    let e = this.event;
    this.style.left = (e.clientX - 2) + "px";
    this.style.top = (e.clientY - 2) + "px";
  }
}
customElements.define('ui-cmenu', CMenu);

export { CMenu };
