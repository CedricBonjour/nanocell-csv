import { createRange } from '../../../core/model/Range.js';
import { Setting } from '../ui/settings/Setting.js';

/**
 * Manages grid selection coordinates, range bounding boxes, cell cursor navigation,
 * and viewport auto-scrolling synchronization.
 */
export class SheetSelection {
  /**
   * @param {import('./Sheet.js').Sheet} sheet - Host sheet element.
   * @param {import('./SheetView.js').SheetView} view - Sheet view renderer.
   */
  constructor(sheet, view) {
    this.sheet = sheet;
    this.view = view;
    this._selectedCells = [];
  }

  /**
   * Sets horizontal viewport scroll origin index `baseX`.
   * @param {number} n - Target column index.
   */
  setBaseX(n) {
    if (n < 0) n = 0;
    const delta = n - this.sheet.bx;
    this.sheet.bx = n;
    if (delta !== 0) {
      this.view.refresh();
    }
  }

  /**
   * Sets vertical viewport scroll origin index `baseY`.
   * @param {number} n - Target row index.
   */
  setBaseY(n) {
    if (n < 0) n = 0;
    const delta = n - this.sheet.by;
    this.sheet.by = n;
    if (delta !== 0) {
      this.view.refresh();
    }
  }

  /**
   * Sets active column coordinate `x` and manages selection state.
   * @param {number} n - Target column coordinate.
   */
  setX(n) {
    if (this.sheet.inputing) this.sheet.controller.inputBlur();
    if (!this.sheet.slctRange) this.sheet.rangeEnd = undefined;
    if (this.sheet.slctRange && !this.sheet.rangeEnd) this.sheet.rangeEnd = { x: this.sheet.x, y: this.sheet.y };
    this.sheet.xx = n < 0 ? 0 : n;
  }

  /**
   * Sets active row coordinate `y` and manages selection state.
   * @param {number} n - Target row coordinate.
   */
  setY(n) {
    if (this.sheet.inputing) this.sheet.controller.inputBlur();
    if (!this.sheet.slctRange) this.sheet.rangeEnd = undefined;
    if (this.sheet.slctRange && !this.sheet.rangeEnd) this.sheet.rangeEnd = { x: this.sheet.x, y: this.sheet.y };
    this.sheet.yy = n < 0 ? 0 : n;
  }

  /**
   * Focuses grid on specified cell (x, y) and highlights it.
   * @param {number} x 
   * @param {number} y 
   */
  focus_cell(x, y) {
    this.sheet.slctRange = false;
    this.sheet.rangeEnd = undefined;
    this.sheet.x = x;
    this.sheet.y = y;
    this.slctRefresh(true);
  }

  /**
   * Returns string value of active top-left cell.
   * @returns {string} Cell string value.
   */
  getSlctFirstValue() {
    return this.sheet.df.get(this.sheet.x, this.sheet.y);
  }

  /**
   * Computes normalized boundary coordinates for active selection range.
   * @returns {{xmin: number, xmax: number, ymin: number, ymax: number}} Bounded coordinate object.
   */
  rangeOrdered() {
    const end = this.sheet.rangeEnd || { x: this.sheet.x, y: this.sheet.y };
    return createRange(this.sheet.x, this.sheet.y, end.x, end.y);
  }

  /**
   * Selects all cells in the dataframe matrix.
   */
  slctAll() {
    this.sheet.x = 0;
    this.sheet.y = 0;
    this.sheet.rangeEnd = { x: this.sheet.df.width - 1, y: this.sheet.df.height - 1 };
    this.slctRefresh(false);
  }

  /**
   * Selects column n (or range from n to m).
   * @param {number} n - Column start index.
   * @param {number} [m] - Column end index.
   */
  slctCol(n, m = undefined) {
    this.sheet.x = n;
    this.sheet.y = 0;
    this.sheet.rangeEnd = { x: m !== undefined ? m : n, y: Math.max(0, this.sheet.df.height - 1) };
    this.sheet.slctRange = false;
    this.slctRefresh(false);
  }

  /**
   * Selects row n (or range from n to m).
   * @param {number} n - Row start index.
   * @param {number} [m] - Row end index.
   */
  slctRow(n, m = undefined) {
    this.sheet.x = 0;
    this.sheet.y = n;
    this.sheet.rangeEnd = { x: Math.max(0, this.sheet.df.width - 1), y: m !== undefined ? m : n };
    this.sheet.slctRange = false;
    this.slctRefresh(false);
  }

  /**
   * Extracts 2D array matrix of cell values from active selection range.
   * @returns {Array<Array<string>>} 2D array matrix.
   */
  rangeArray() {
    if (!this.sheet.rangeEnd) return [[this.sheet.df.get(this.sheet.x, this.sheet.y)]];
    return this.sheet.df.slice(this.rangeOrdered());
  }


  /**
   * Checks whether cell at matrix coordinate (x, y) is currently inside visible viewport bounds.
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @returns {boolean} True if inside viewport bounds.
   */
  cellInView(x, y) {
    return x >= this.sheet.baseX && y >= this.sheet.baseY && x < this.sheet.baseX + this.sheet.width && y < this.sheet.baseY + this.sheet.height;
  }

  /**
   * Checks if viewport-relative offset (x, y) falls within view grid dimensions.
   * @param {number} x - Relative column offset.
   * @param {number} y - Relative row offset.
   * @returns {boolean} True if inside viewport grid bounds.
   */
  isInViewRange(x, y) {
    return !(x < 0 || y < 0 || x >= this.sheet.width || y >= this.sheet.height);
  }

  /**
   * Finds the optimal visible `<td>` element to attach the inline text input field to.
   * @returns {HTMLTableCellElement|undefined} Target table cell element.
   */
  bestInputCell() {
    if (this.cellInView(this.sheet.x, this.sheet.y)) {
      return this.view.rows[this.sheet.y - this.sheet.baseY + 1].cells[this.sheet.x - this.sheet.baseX + 1];
    }

    if (this.sheet.rangeEnd) {
      const viewEnd = { x: this.sheet.baseX + this.sheet.width, y: this.sheet.baseY + this.sheet.height };
      const viewStart = { x: this.sheet.baseX, y: this.sheet.baseY };
      let rx = undefined;
      let ry = undefined;
      const r = this.rangeOrdered();

      if (viewStart.y < r.ymin && viewEnd.y > r.ymin) ry = r.ymin;
      if (viewStart.y > r.ymin && viewStart.y <= r.ymax) ry = viewStart.y;
      if (viewStart.x < r.xmin && viewEnd.x > r.xmin) rx = r.xmin;
      if (viewStart.x > r.xmin && viewStart.x <= r.xmax) rx = viewStart.x;

      if (rx !== undefined && ry !== undefined) {
        return this.view.rows[ry - this.sheet.baseY + 1].cells[rx - this.sheet.baseX + 1];
      }
    }
    return undefined;
  }

  /**
   * Adjusts viewport base coordinates (`baseX`, `baseY`) to bring the active selection into view.
   * Decouples horizontal and vertical checks to allow concurrent two-axis viewport scrolling.
   */
  slctFocus() {
    if (this.sheet.x < this.sheet.baseX) {
      this.sheet.baseX = this.sheet.x;
    } else if (this.sheet.x >= this.sheet.baseX + this.sheet.width) {
      this.sheet.baseX = this.sheet.x - this.sheet.width + 1;
    }

    if (this.sheet.y < this.sheet.baseY) {
      this.sheet.baseY = this.sheet.y;
    } else if (this.sheet.y >= this.sheet.baseY + this.sheet.height) {
      this.sheet.baseY = this.sheet.y - this.sheet.height + 1;
    }
  }

  /**
   * Removes `slct` CSS class from all selected table cell elements.
   */
  slctClear() {
    if (this._selectedCells.length > 0) {
      for (let i = 0; i < this._selectedCells.length; i++) {
        this._selectedCells[i].classList.remove('slct');
      }
      this._selectedCells.length = 0;
    } else {
      const selected = this.sheet.querySelectorAll('.slct');
      for (let i = 0; i < selected.length; i++) {
        selected[i].classList.remove('slct');
      }
    }
  }

  /**
   * Emits selection change events and updates active cell highlighting on animation frame.
   * @param {boolean} [focus=true] - Whether to automatically focus viewport on active cell.
   */
  slctRefresh(focus = true) {
    if (this._slctRafId) {
      cancelAnimationFrame(this._slctRafId);
      this._slctRafId = null;
    }
    this._slctRafId = requestAnimationFrame(() => {
      this._slctRafId = null;
      this.slctClear();
      this.view.scrollbarRefresh();
      if (focus) this.slctFocus();
      if (this.sheet.rangeEnd) return this.view.viewRangeRender();
      const y = this.sheet.y - this.sheet.baseY;
      const x = this.sheet.x - this.sheet.baseX;
      if (!this.isInViewRange(x, y)) return;
      const targetCell = this.view.rows[y + 1]?.cells[x + 1];
      if (targetCell) {
        targetCell.classList.add("slct");
        this._selectedCells.push(targetCell);
      }
      this.view.footerUpdate();
    });
  }

  /**
   * Handles mouse wheel scrolling for grid navigation and view dimensions.
   * @param {WheelEvent} e - Mouse wheel event object.
   */
  scroll(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      const minRows = Setting.getDef ? (Setting.getDef("rows")?.min ?? 10) : 10;
      const minCols = Setting.getDef ? (Setting.getDef("cols")?.min ?? 3) : 3;
      if (e.shiftKey) {
        if (e.deltaY > 0) this.sheet.nViewRows++;
        if (e.deltaY < 0 && minRows < this.sheet.nViewRows) this.sheet.nViewRows--;
      } else {
        if (e.deltaY > 0) this.sheet.nViewCols++;
        if (e.deltaY < 0 && minCols < this.sheet.nViewCols) this.sheet.nViewCols--;
      }
      this.view.reload();
      return;
    }
    const coef = 16;
    if (e.altKey) {
      this.sheet.baseX += (e.deltaY > 0) ? Math.floor(e.deltaY / coef) : Math.ceil(e.deltaY / coef);
    } else {
      this.sheet.baseX += (e.deltaX > 0) ? Math.floor(e.deltaX / coef) : Math.ceil(e.deltaX / coef);
      this.sheet.baseY += (e.deltaY > 0) ? Math.floor(e.deltaY / coef) : Math.ceil(e.deltaY / coef);
    }
    this.view.refresh();
    this.slctRefresh(false);
  }
}
