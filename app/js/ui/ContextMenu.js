import { cmd } from '../interaction/CommandRegistry.js';
import { getSheet } from '../appContext.js';
import { TargetType, getTargetType } from '../interaction/MouseRouter.js';

/**
 * Context menu custom element displayed on right-click over cells, columns, and rows.
 */
class ContextMenu extends HTMLElement {
  constructor() {
    super();
    this.table = document.createElement("table");
    this.firstBlock = document.createElement("div");
    this.firstBlock.classList.add("cmenu_header");

    this.targetCol = null;
    this.list = [
      { key: "fl", txt: "Filter", opt: "", run: () => cmd.filter?.run(this.targetCol) },
      { key: "sa", txt: "Sort", opt: "A<br>Z", run: (e) => cmd.sort?.run(e) },
      { key: "sd", txt: "Sort", opt: "Z<br>A", run: (e) => cmd.sort_reverse?.run(e) },
      { key: "rn", txt: "Round", opt: "N", run: (e) => cmd.integer?.run(e) },
      { key: "rf", txt: "Round", opt: "$", run: (e) => cmd.decimal?.run(e) },
      { key: "ic", txt: "Insert", opt: "&verbar;", run: (e) => cmd.insertLeft?.run(e) },
      { key: "ir", txt: "Insert", opt: "&horbar;", run: (e) => cmd.insertUp?.run(e) },
      { key: "dc", txt: "Delete", opt: "&verbar;", run: (e) => cmd.deleteCol?.run(e) },
      { key: "dr", txt: "Delete", opt: "&horbar;", run: (e) => cmd.deleteRow?.run(e) },
    ];

    this.addEventListener('mouseout', event => {
      if (this.contains(event.relatedTarget)) return;
      this.classList.remove('open', 'visible');
      this.removeAttribute('open');
      this.style.display = "none";
    });
  }

  ensureInitialized() {
    if (this._menuInitialized) return;
    this._menuInitialized = true;
    this.buildMenu();
    if (!this.firstBlock.parentNode) {
      this.appendChild(this.firstBlock);
      this.appendChild(this.table);
    }
  }

  connectedCallback() {
    this.classList.remove('open', 'visible');
    this.removeAttribute('open');
    this.style.display = "none";
    this.ensureInitialized();
  }

  showItems(show_list) {
    for (let i = 0; i < this.list.length; i++) {
      const isVisible = show_list.includes(this.list[i].key);
      this.table.rows[i].classList.toggle('hidden', !isVisible);
      this.table.rows[i].style.display = isVisible ? "table-row" : "none";
    }
  }

  pop(e) {
    this.ensureInitialized();
    this.event = e;
    this.ttype = getTargetType(e);
    if (!this.isValidTarget()) return;
    const cell = e.target.closest ? (e.target.closest("td") || e.target.closest("th")) : e.target;
    const targetCell = cell || e.target;
    this.x = targetCell.tx;
    this.y = targetCell.ty;
    this.reposition();
    const sheet = getSheet();
    if (!sheet) return;
    if (this.ttype === TargetType.colH) {
      this.targetCol = this.x + sheet.baseX;
      sheet.slctCol(this.targetCol);
      this.firstBlock.innerText = "col : " + targetCell.innerText;
      this.showItems(["fl", "sa", "sd", "rn", "rf", "ic", "dc"]);
    } else if (this.ttype === TargetType.rowH) {
      this.targetCol = null;
      sheet.slctRow(this.y + sheet.baseY);
      this.firstBlock.innerText = "row : " + targetCell.innerText;
      this.showItems(["rn", "rf", "ir", "dr"]);
    } else if (targetCell.classList.contains("slct")) {
      this.targetCol = null;
      this.firstBlock.innerText = "selection";
      this.showItems(["rn", "rf", "dc", "dr"]);
    } else {
      this.targetCol = targetCell.tx + sheet.baseX;
      sheet.x = targetCell.tx + sheet.baseX;
      sheet.y = targetCell.ty + sheet.baseY;
      sheet.slctRefresh();
      this.firstBlock.innerText = "cell";
      this.showItems(["rn", "rf", "ic", "ir", "dc", "dr"]);
    }
    this.classList.add('open', 'visible');
    this.setAttribute('open', '');
    this.style.display = "block";
  }

  buildMenu() {
    while (this.table.rows.length > 0) this.table.rows[0].remove();
    for (const item of this.list) {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const div = document.createElement("div");
      div.innerHTML = item.txt;
      td1.appendChild(div);
      tr.appendChild(td1);

      if (item.opt) {
        const td2 = document.createElement("td");
        const optDiv = document.createElement("div");
        optDiv.innerHTML = item.opt;
        optDiv.classList.add("cmenu_opt");
        td2.appendChild(optDiv);
        tr.appendChild(td2);
      }
      tr.addEventListener('click', (ev) => {
        this.classList.remove('open', 'visible');
        this.removeAttribute('open');
        this.style.display = "none";
        item.run(ev);
      });
      this.table.appendChild(tr);
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
    const e = this.event;
    const menuWidth = 140;
    const menuHeight = 220;
    const x = (typeof window !== 'undefined' && e.clientX + menuWidth > window.innerWidth)
      ? Math.max(0, e.clientX - menuWidth)
      : e.clientX - 2;
    const y = (typeof window !== 'undefined' && e.clientY + menuHeight > window.innerHeight)
      ? Math.max(0, e.clientY - menuHeight)
      : e.clientY - 2;
    this.style.left = x + "px";
    this.style.top = y + "px";
  }
}

if (!customElements.get('ui-cmenu')) {
  customElements.define('ui-cmenu', ContextMenu);
}

export { ContextMenu };
