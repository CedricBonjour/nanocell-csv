import { StateManager } from './StateManager.js';
import { TargetType, getTargetType } from './mouse.js';
import { Table } from './ui/input/Table.js';

const getCmd = () => StateManager.getState('cmd');

class CMenu extends HTMLElement {
  constructor() {
    super();
    this.table = new Table();
    this.firstBlock = document.createElement("div");
    this.firstBlock.classList.add("cmenu_header");

    this.list = [
      { key: "sa", txt: "Sort", opt: "A<br>Z", run: (e) => getCmd()?.sort?.run(e) },
      { key: "sd", txt: "Sort", opt: "Z<br>A", run: (e) => getCmd()?.sort_reverse?.run(e) },
      { key: "rn", txt: "Round", opt: "N", run: (e) => getCmd()?.integer?.run(e) },
      { key: "rf", txt: "Round", opt: "$", run: (e) => getCmd()?.decimal?.run(e) },
      { key: "ic", txt: "Insert", opt: "&verbar;", run: (e) => getCmd()?.insertLeft?.run(e) },
      { key: "ir", txt: "Insert", opt: "&horbar;", run: (e) => getCmd()?.insertUp?.run(e) },
      { key: "dc", txt: "Delete", opt: "&verbar;", run: (e) => getCmd()?.deleteCol?.run(e) },
      { key: "dr", txt: "Delete", opt: "&horbar;", run: (e) => getCmd()?.deleteRow?.run(e) },
    ];

    this.addEventListener('mouseout', event => {
      if (this.contains(event.relatedTarget)) return;
      this.style.display = "none";
    });

    this.buildMenu();
  }

  connectedCallback() {
    this.style.display = "none";
    if (!this.firstBlock.parentNode) {
      this.appendChild(this.firstBlock);
      this.appendChild(this.table);
    }
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
    const cell = e.target.closest ? (e.target.closest("td") || e.target.closest("th")) : e.target;
    const targetCell = cell || e.target;
    this.x = targetCell.tx;
    this.y = targetCell.ty;
    this.reposition();
    const sheet = StateManager.getState('sheet');
    if (!sheet) return;
    if (this.ttype === TargetType.colH) {
      sheet.slctCol(this.x + sheet.baseX);
      this.firstBlock.innerText = "col : " + targetCell.innerText;
      this.showItems(["sa", "sd", "rn", "rf", "ic", "dc"]);
    } else if (this.ttype === TargetType.rowH) {
      sheet.slctRow(this.y + sheet.baseY);
      this.firstBlock.innerText = "row : " + targetCell.innerText;
      this.showItems(["rn", "rf", "ir", "dr"]);
    } else if (targetCell.classList.contains("slct")) {
      this.firstBlock.innerText = "selection";
      this.showItems(["rn", "rf", "dc", "dr"]);
    } else {
      sheet.x = targetCell.tx + sheet.baseX;
      sheet.y = targetCell.ty + sheet.baseY;
      sheet.slctRefresh();
      this.firstBlock.innerText = "cell";
      this.showItems(["rn", "rf", "ic", "ir", "dc", "dr"]);
    }
    this.style.display = "block";
  }

  buildMenu() {
    for (const item of this.list) {
      this.table.br();
      let div = document.createElement("div");
      div.innerHTML = item.txt;
      this.table.push(div);
      if (item.opt) {
        let optDiv = document.createElement("div");
        optDiv.innerHTML = item.opt;
        this.table.push(optDiv);
        optDiv.classList.add("cmenu_opt");
      }
      this.table.activeRow().addEventListener('click', item.run);
    }
  }

  isValidTarget() {
    let okTargets = [
      TargetType.cell,
      TargetType.rowH,
      TargetType.colH,
    ];
    return (okTargets.includes(this.ttype));
  }

  reposition() {
    let e = this.event;
    this.style.left = (e.clientX - 2) + "px";
    this.style.top = (e.clientY - 2) + "px";
  }
}

customElements.define('ui-cmenu', CMenu);

export { CMenu };
