import { sheet } from '../../main.js';
import { LBT, TargetType } from '../../mouse.js';

class TCell extends HTMLTableCellElement {
  constructor() {
    super();
    this.tx;
    this.ty;
    this.th;
    this.addEventListener("pointerenter", e => {
      if (LBT == TargetType.cell) {
        sheet.rangeEnd = { x: this.tx + sheet.baseX, y: this.ty + sheet.baseY };
        sheet.slctRefresh(false);
      }
      if (LBT == TargetType.colH && this.tx >= 0)
        sheet.slctCol(sheet.x, this.tx + sheet.baseX);
      if (LBT == TargetType.rowH && this.ty >= 0)
        sheet.slctRow(sheet.y, this.ty + sheet.baseY);

    });

    this.addEventListener("dblclick", e => {
      if (this.tx >= 0 && this.ty >= 0) sheet.input();
      if (this.ty < 0) this.style.width = "auto"
    });
  }

  setPosition(x, y) {
    this.tx = x;
    this.ty = y;
    this.th = (x < 0 || y < 0)
    if (this.th) this.classList.add("tHeader")
    if (y < 0) this.classList.add("tColHeader")
    if (x < 0) this.classList.add("tRowHeader")


  }
}

customElements.define("ui-cell", TCell, { extends: "td" });

export { TCell };
