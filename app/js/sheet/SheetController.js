/**
 * Controller Component for `<ui-sheet>` Web Component.
 * Handles user interactions, keyboard navigation, selection management, sheet mutations, and event bindings.
 * @module SheetController
 */
import { StateManager } from '../StateManager.js';
import { Setting, stg } from '../Setting.js';
import { Msg } from '../Msg.js';
import { LBT, TargetType } from '../mouse.js';

/**
 * Manages input events, grid navigation, selection ranges, and operations on the active Sheet.
 */
export class SheetController {
  /**
   * Instantiates a SheetController attached to a parent Sheet element and SheetView.
   * @param {import('../Sheet.js').Sheet} sheet - Target Sheet web component instance.
   * @param {import('./SheetView.js').SheetView} view - Sheet view rendering engine instance.
   */
  constructor(sheet, view) {
    this.sheet = sheet;
    this.view = view;

    this.bindEvents();
  }

  /**
   * Binds mouse, keyboard, and double-click event listeners to the sheet table and input field.
   */
  bindEvents() {
    this.sheet.addEventListener("mousewheel", (e) => this.scroll(e), { passive: false });
    this.sheet.inputField.addEventListener("focusout", () => { this.inputBlur(); });
    this.sheet.inputField.addEventListener("keydown", (e) => {
      const k = e.key.toUpperCase();
      if (k == "ENTER" && e.shiftKey) return this.sheet.inputField.value = this.sheet.inputField.value + '\u25BE';
      switch (k) {
        case "ENTER":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "TAB":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.x++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ESCAPE":
          this.sheet.escape = true;
          this.sheet.inputField.blur();
          break;
      }
    });

    this.sheet.addEventListener("mouseover", (e) => {
      let td = e.target.closest("td");
      if (!td) return;
      let tx = td.tx;
      let ty = td.ty;
      if (tx === undefined || ty === undefined) return;
      
      if (LBT == TargetType.cell) {
        this.sheet.rangeEnd = { x: tx + this.sheet.baseX, y: ty + this.sheet.baseY };
        this.slctRefresh(false);
      }
      if (LBT == TargetType.colH && tx >= 0)
        this.slctCol(this.sheet.x, tx + this.sheet.baseX);
      if (LBT == TargetType.rowH && ty >= 0)
        this.slctRow(this.sheet.y, ty + this.sheet.baseY);
    });

    this.sheet.addEventListener("dblclick", (e) => {
      let td = e.target.closest("td");
      if (!td) return;
      let tx = td.tx;
      let ty = td.ty;
      if (tx === undefined || ty === undefined) return;
      
      if (tx >= 0 && ty >= 0) this.input();
      if (ty < 0) td.style.width = "auto";
    });
  }

  /**
   * Sets horizontal viewport scroll origin index `baseX`.
   * @param {number} n - Target column index.
   */
  setBaseX(n) {
    if (n < 0) n = 0;
    if (n >= this.sheet.df.width) n = this.sheet.df.width - 1;
    const delta = n - this.sheet.bx;
    this.sheet.bx = n;
    switch (delta) {
      case 0: break;
      default: this.view.refresh();
    }
  }

  /**
   * Sets vertical viewport scroll origin index `baseY`.
   * @param {number} n - Target row index.
   */
  setBaseY(n) {
    if (n < 0) n = 0;
    if (n >= this.sheet.df.height) n = this.sheet.df.height - 1;
    const delta = n - this.sheet.by;
    this.sheet.by = n;
    switch (delta) {
      case 0: break;
      default: this.view.refresh();
    }
  }

  /**
   * Sets active column coordinate `x` and manages selection state.
   * @param {number} n - Target column coordinate.
   */
  setX(n) {
    if (this.sheet.inputing) this.inputBlur();
    if (!this.sheet.slctRange) this.sheet.rangeEnd = undefined;
    if (n >= this.sheet.df.width + this.sheet.width - 1) n = this.sheet.df.width + this.sheet.width - 2;
    if (this.sheet.slctRange && !this.sheet.rangeEnd) this.sheet.rangeEnd = { x: this.sheet.x, y: this.sheet.y };
    this.sheet.xx = n < 0 ? 0 : n;
  }

  /**
   * Sets active row coordinate `y` and manages selection state.
   * @param {number} n - Target row coordinate.
   */
  setY(n) {
    if (this.sheet.inputing) this.inputBlur();
    if (!this.sheet.slctRange) this.sheet.rangeEnd = undefined;
    if (n >= this.sheet.df.height + this.sheet.height - 1) n = this.sheet.df.height + this.sheet.height - 2;
    if (this.sheet.slctRange && !this.sheet.rangeEnd) this.sheet.rangeEnd = { x: this.sheet.x, y: this.sheet.y };
    this.sheet.yy = n < 0 ? 0 : n;
  }

  /**
   * Returns string value of active top-left cell.
   * @returns {string} Cell string value.
   */
  getSlctFirstValue() {
    return this.sheet.df.get(this.sheet.x, this.sheet.y);
  }

  /**
   * Deletes all rows contained within active selection range.
   */
  deleteRows() {
    let r = this.rangeOrdered();
    for (let i = 0; i <= r.ymax - r.ymin; i++) this.sheet.df.deleteRow(r.ymin);
    this.sheet.yy = r.ymin;
    if (this.sheet.rangeEnd) {
      this.sheet.rangeEnd.y = r.ymin;
      if (this.sheet.rangeEnd.x == this.sheet.x) this.sheet.rangeEnd = undefined;
    }
    this.view.refresh();
    this.slctRefresh(false);
  }

  /**
   * Deletes all columns contained within active selection range.
   */
  deleteCols() {
    let r = this.rangeOrdered();
    for (let i = 0; i <= r.xmax - r.xmin; i++) this.sheet.df.deleteCol(r.xmin);
    this.sheet.xx = r.xmin;
    if (this.sheet.rangeEnd) {
      this.sheet.rangeEnd.x = r.xmin;
      if (this.sheet.rangeEnd.y == this.sheet.y) this.sheet.rangeEnd = undefined;
    }
    this.view.refresh();
    this.slctRefresh(false);
  }

  /**
   * Sorts sheet rows based on column n values.
   * @param {number} n - Column index to sort by.
   * @param {boolean} ascending - True for ascending, false for descending.
   */
  sort(n, ascending) {
    let col_items = this.sheet.df.data.map(row => row[n]).map((val, idx) => ({ val, idx }));
    if (stg.sort_header) col_items.shift();
    let numbers = [];
    let strings = [];
    let empty = [];
    col_items.forEach(item => {
      if (item.val === undefined || item.val.length < 1) empty.push(item.idx);
      else if (!isNaN(item.val)) numbers.push({ val: +item.val, idx: item.idx });
      else strings.push(item);
    });
    let str_ordered = strings.sort((a, b) => (ascending) ? a.val.localeCompare(b.val) : b.val.localeCompare(a.val)).map(({ idx }) => idx);
    let num_ordered = numbers.sort((a, b) => (ascending) ? a.val - b.val : b.val - a.val).map(({ idx }) => idx);
    let new_order = stg.sort_num_first ? num_ordered.concat(str_ordered) : str_ordered.concat(num_ordered);
    new_order = new_order.concat(empty);
    if (stg.sort_header) new_order.unshift(0);
    this.sheet.df.order(new_order);
    this.view.refresh();
  }

  /**
   * Formats top header row cells to comply with standard SQL column naming conventions.
   */
  validate_headers() {
    for (let x = 0; x < this.sheet.df.width; x++) {
      let h = this.sheet.df.get(x, 0);
      if (h === undefined || h === "") h = `col_${x + 1}`;
      h = h.toLowerCase();
      h = h.replace(/[^a-zA-Z0-9]/g, '_');
      for (let i = 0; i < x; i++) if (h == this.sheet.df.get(i, 0)) h = h + `_c${x + 1}`;
      this.sheet.df.edit(x, 0, h);
    }

    this.view.refresh();
  }

  /**
   * Navigates selection to next matching cell occurrence of active cell value.
   */
  go_to_next() {
    let d = this.sheet.df.get(this.sheet.x, this.sheet.y);
    let i = this.sheet.x;
    let j = this.sheet.y;
    let found = false;
    while (!found) {
      i = (i + 1) % this.sheet.df.width;
      if (i === 0) j = (j + 1) % this.sheet.df.height;
      found = (this.sheet.df.get(i, j) == d);
    }

    if (i == this.sheet.x && j == this.sheet.y) Msg.quick("No match");
    else {
      this.sheet.x = i;
      this.sheet.y = j;
      this.slctRefresh();
    }
  }

  /**
   * Formats matrix cell values to comply with strict CSV standards based on active settings.
   */
  validate_data() {
    let dot = stg.dv_comma_num;
    let dash = stg.dv_comma_txt;
    let single_quote = stg.dv_quotes;
    let line_return = stg.dv_lr;
    let lower = stg.dv_lower;
    this.allApply((x, y) => {
      let d = this.sheet.df.get(x, y);
      if (d.length < 1 || !isNaN(d)) return;
      if (dot) {
        let numberTry = d.replace(',', '.');
        if (!isNaN(numberTry)) return this.sheet.df.edit(x, y, numberTry);
      }
      if (dash) d = d.replaceAll(',', '-');
      if (line_return) d = d.replaceAll('\n', '|');
      if (single_quote) d = d.replaceAll('\"', '\'');
      if (lower) d = d.toLowerCase();
      this.sheet.df.edit(x, y, d);
    });
    this.view.refresh();
  }

  /**
   * Computes normalized boundary coordinates for active selection range.
   * @returns {{xmin: number, xmax: number, ymin: number, ymax: number}} Bounded coordinate object.
   */
  rangeOrdered() {
    if (this.sheet.rangeEnd === undefined) return { xmin: this.sheet.x, xmax: this.sheet.x, ymin: this.sheet.y, ymax: this.sheet.y };
    let xStart = Math.min(this.sheet.x, this.sheet.rangeEnd.x);
    let yStart = Math.min(this.sheet.y, this.sheet.rangeEnd.y);
    let xEnd = Math.max(this.sheet.x, this.sheet.rangeEnd.x);
    let yEnd = Math.max(this.sheet.y, this.sheet.rangeEnd.y);
    return { xmin: xStart, xmax: xEnd, ymin: yStart, ymax: yEnd };
  }

  /**
   * Expands cell pattern or value across selection range.
   */
  expand() {
    if (this.sheet.rangeEnd === undefined) return;
    let r = this.rangeOrdered();
    if (r.ymin == r.ymax) {
      let base0 = this.sheet.df.get(r.xmin, r.ymin);
      let base1 = this.sheet.df.get(r.xmin + 1, r.ymin);
      let baseN0 = Number(base0);
      let baseN1 = Number(base1);
      let d = baseN1 - baseN0;
      if (isNaN(baseN1) && !isNaN(baseN0)) d = 1;
      if (base0 == "" && base1 == "") d = 1;
      if (isNaN(d)) for (let j = r.xmin; j <= r.xmax; j++) this.sheet.df.edit(j, this.sheet.y, base0);
      else for (let j = r.xmin; j <= r.xmax; j++) this.sheet.df.edit(j, this.sheet.y, baseN0 + d * (j - r.xmin));
      return this.view.refresh();
    }
    for (let i = r.xmin; i <= r.xmax; i++) {
      let base0 = this.sheet.df.get(i, r.ymin);
      let base1 = this.sheet.df.get(i, r.ymin + 1);
      let baseN0 = Number(base0);
      let baseN1 = Number(base1);
      let d = baseN1 - baseN0;
      if ((isNaN(baseN1) || base1 == "") && !isNaN(baseN0)) d = 1;
      if (isNaN(d)) for (let j = r.ymin; j <= r.ymax; j++) this.sheet.df.edit(i, j, base0);
      else for (let j = r.ymin; j <= r.ymax; j++) this.sheet.df.edit(i, j, baseN0 + d * (j - r.ymin));
      this.view.refresh();
    }
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
   * Shifts active selection row or column in specified direction.
   * @param {number} direction - Direction identifier (0: up, 1: right, 2: down, 3: left).
   */
  shift(direction) {
    if (this.sheet.rangeEnd == undefined) {
      switch (direction) {
        case 0: this.sheet.df.shiftRow(this.sheet.y - 1); this.sheet.y--; break;
        case 1: this.sheet.df.shiftCol(this.sheet.x); this.sheet.x++; break;
        case 2: this.sheet.df.shiftRow(this.sheet.y); this.sheet.y++; break;
        case 3: this.sheet.df.shiftCol(this.sheet.x - 1); this.sheet.x--; break;
      }
    } else {
      let r = this.rangeOrdered();
      let bux = this.sheet.rangeEnd.x;
      let buy = this.sheet.rangeEnd.y;
      switch (direction) {
        case 0: for (let y = r.ymin; y <= r.ymax; y++) this.sheet.df.shiftRow(y - 1); this.sheet.y--; this.sheet.rangeEnd = { x: bux, y: buy - 1 }; break;
        case 1: for (let x = r.xmax; x >= r.xmin; x--) this.sheet.df.shiftCol(x); this.sheet.x++; this.sheet.rangeEnd = { x: bux + 1, y: buy }; break;
        case 2: for (let y = r.ymax; y >= r.ymin; y--) this.sheet.df.shiftRow(y); this.sheet.y++; this.sheet.rangeEnd = { x: bux, y: buy + 1 }; break;
        case 3: for (let x = r.xmin; x <= r.xmax; x++) this.sheet.df.shiftCol(x - 1); this.sheet.x--; this.sheet.rangeEnd = { x: bux - 1, y: buy }; break;
      }
    }
    this.view.refresh();
    this.slctRefresh();
  }

  /**
   * Inserts a row or column relative to active selection.
   * @param {number} direction - Direction identifier (0: above, 1: right, 2: below, 3: left).
   */
  insert(direction) {
    switch (direction) {
      case 0: this.sheet.df.insertRow(this.sheet.y); this.sheet.y++; break;
      case 1: this.sheet.df.insertCol(this.sheet.x + 1); break;
      case 2: this.sheet.df.insertRow(this.sheet.y + 1); break;
      case 3: this.sheet.df.insertCol(this.sheet.x); this.sheet.x++; break;
    }
    this.view.refresh();
    this.slctRefresh();
  }

  /**
   * Opens inline cell text editor for the active cell.
   * @param {string} [txt] - Initial text to populate editor with.
   */
  input(txt) {
    let cell = this.bestInputCell();
    if (cell === undefined) return;
    this.sheet.inputing = true;
    this.sheet.inputField.value = txt ? txt : this.sheet.df.get(this.sheet.x, this.sheet.y).replaceAll('\n', '\u25BE');
    cell.appendChild(this.sheet.inputField);
    this.sheet.inputField.focus();
  }

  /**
   * Finds the optimal visible `<td>` element to attach the inline text input field to.
   * @returns {HTMLTableCellElement|undefined} Target table cell element.
   */
  bestInputCell() {
    if (this.cellInView(this.sheet.x, this.sheet.y)) return this.view.rows[this.sheet.y - this.sheet.baseY + 1].cells[this.sheet.x - this.sheet.baseX + 1];

    if (this.sheet.rangeEnd) {
      let viewEnd = { x: this.sheet.baseX + this.sheet.width, y: this.sheet.baseY + this.sheet.height };
      let viewStart = { x: this.sheet.baseX, y: this.sheet.baseY };
      let rx = undefined;
      let ry = undefined;
      let r = this.rangeOrdered();

      if (viewStart.y < r.ymin && viewEnd.y > r.ymin) ry = r.ymin;
      if (viewStart.y > r.ymin && viewStart.y <= r.ymax) ry = viewStart.y;
      if (viewStart.x < r.xmin && viewEnd.x > r.xmin) rx = r.xmin;
      if (viewStart.x > r.xmin && viewStart.x <= r.xmax) rx = viewStart.x;

      if (rx !== undefined && ry !== undefined) return this.view.rows[ry - this.sheet.baseY + 1].cells[rx - this.sheet.baseX + 1];
    }
    return undefined;
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
   * Handles inline cell editor blur event, updating Dataframe state and emitting change events.
   */
  inputBlur() {
    if (!this.sheet.inputing) return;
    this.sheet.inputing = false;
    let e = this.sheet.inputField.value;
    e = e.replaceAll('\u25BE', '\n');
    if (!this.sheet.escape) {
      this.rangeEdit(e);
      StateManager.emit('cell:edited', { x: this.sheet.x, y: this.sheet.y, value: e });
      StateManager.emit('dataframe:changed', { action: 'editCell', x: this.sheet.x, y: this.sheet.y, value: e });
      if (!this.sheet.rangeEnd) this.view.loadCell(this.sheet.inputField.parentNode, this.sheet.x, this.sheet.y);
      else this.view.refresh();
    }
    this.sheet.escape = false;
    try {
      if (this.sheet.inputField.parentNode) {
        this.sheet.inputField.remove();
      }
    } catch (err) { console.warn("Error removing inputField:", err); }
  }

  /**
   * Selects column n (or range from n to m).
   * @param {number} n - Column start index.
   * @param {number} [m] - Column end index.
   */
  slctCol(n, m = undefined) {
    this.sheet.slctRange = true;
    this.sheet.rangeEnd = { x: m !== undefined ? m : n, y: this.sheet.df.height - 1 };
    this.sheet.x = n;
    this.sheet.y = 0;
    this.sheet.slctRange = false;
    this.slctRefresh(false);
  }

  /**
   * Selects row n (or range from n to m).
   * @param {number} n - Row start index.
   * @param {number} [m] - Row end index.
   */
  slctRow(n, m = undefined) {
    this.sheet.slctRange = true;
    this.sheet.rangeEnd = { x: this.sheet.df.width - 1, y: m !== undefined ? m : n };
    this.sheet.x = 0;
    this.sheet.y = n;
    this.sheet.slctRange = false;
    this.slctRefresh(false);
  }

  /**
   * Extracts 2D array matrix of cell values from active selection range.
   * @returns {Array<Array<string>>} 2D array matrix.
   */
  rangeArray() {
    if (!this.sheet.rangeEnd) return [[this.sheet.df.get(this.sheet.x, this.sheet.y)]];
    let r = this.rangeOrdered();
    let mat = [];
    for (let y = r.ymin; y <= r.ymax; y++) {
      let row = [];
      for (let x = r.xmin; x <= r.xmax; x++) row.push(this.sheet.df.get(x, y));
      mat.push(row);
    }
    return mat;
  }

  /**
   * Sets all cells within active selection range to a specified value.
   * @param {string} value - Value to assign.
   */
  rangeEdit(value) {
    if (!this.sheet.rangeEnd) return this.sheet.df.edit(this.sheet.x, this.sheet.y, value);
    let r = this.rangeOrdered();
    for (let x = r.xmin; x <= r.xmax; x++) for (let y = r.ymin; y <= r.ymax; y++) this.sheet.df.edit(x, y, value);
  }

  /**
   * Applies callback function across all cell coordinates in the dataframe.
   * @param {Function} cb - Callback `cb(x, y)`.
   */
  allApply(cb) {
    for (let y = 0; y < this.sheet.df.height; y++) for (let x = 0; x < this.sheet.df.width; x++) cb(x, y);
  }

  /**
   * Applies callback function across all cell coordinates in active selection range.
   * @param {Function} cb - Callback `cb(x, y)`.
   */
  rangeApply(cb) {
    if (!this.sheet.rangeEnd) return cb(this.sheet.x, this.sheet.y);
    let r = this.rangeOrdered();
    for (let x = r.xmin; x <= r.xmax; x++) for (let y = r.ymin; y <= r.ymax; y++) cb(x, y);
  }

  /**
   * Transposes 2D matrix of cell values within active selection range.
   */
  rangeTranspose() {
    if (this.sheet.df.lock) return;
    if (!this.sheet.rangeEnd) return;
    let r = this.rangeArray();
    let t = [];
    for (let x = 0; x < r[0].length; x++) {
      let row = [];
      for (let y = 0; y < r.length; y++) row.push(r[y][x]);
      t.push(row);
    }
    this.rangeEdit('');
    this.paste(t);
  }

  /**
   * Rounds numeric values in selection range to integers or 2 decimal places.
   * @param {boolean} [integer=true] - True for integer rounding, false for 2 decimal places.
   */
  round(integer = true) {
    this.rangeApply((x, y) => {
      let n = this.sheet.df.get(x, y);
      if (!isNaN(n) && n !== '') {
        n = Number(n);
        if (n == Number.POSITIVE_INFINITY || n == Number.NEGATIVE_INFINITY) return;
        if (!integer) n *= 100;
        n = Math.round(n + Number.EPSILON);
        if (!integer) {
          n /= 100;
          n += 0.001;
          n = Math.round(n * 1000) / 1000;
          n = String(n).slice(0, -1);
        }
      }
      this.sheet.df.edit(x, y, n);
    });
  }

  /**
   * Pastes a 2D array matrix into the sheet starting at top-left selection position.
   * @param {Array<Array<string>>} mat - 2D matrix of values to paste.
   */
  paste(mat) {
    let minX = this.sheet.x;
    let minY = this.sheet.y;
    if (this.sheet.rangeEnd) { minX = Math.min(minX, this.sheet.rangeEnd.x); minY = Math.min(minY, this.sheet.rangeEnd.y); }
    for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat[y].length; x++) this.sheet.df.edit(minX + x, minY + y, mat[y][x]);
  }

  /**
   * Handles mouse wheel scrolling for grid navigation and view dimensions.
   * @param {WheelEvent} e - Mouse wheel event object.
   */
  scroll(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (e.deltaY > 0) this.sheet.nViewRows++;
        if (e.deltaY < 0 && Setting.list.find(item => item.key === "rows").min < this.sheet.nViewRows) this.sheet.nViewRows--;
      } else {
        if (e.deltaY > 0) this.sheet.nViewCols++;
        if (e.deltaY < 0 && Setting.list.find(item => item.key === "cols").min < this.sheet.nViewCols) this.sheet.nViewCols--;
      }
      this.view.reload();
      return;
    }
    let coef = 16;
    if (e.altKey) this.sheet.baseX += (e.deltaY > 0) ? Math.floor(e.deltaY / coef) : Math.ceil(e.deltaY / coef);
    else {
      this.sheet.baseX += (e.deltaX > 0) ? Math.floor(e.deltaX / coef) : Math.ceil(e.deltaX / coef);
      this.sheet.baseY += (e.deltaY > 0) ? Math.floor(e.deltaY / coef) : Math.ceil(e.deltaY / coef);
    }
    this.view.refresh();
    this.slctRefresh(false);
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
    let td;
    while (td = this.sheet.getElementsByClassName('slct')[0]) td.classList.remove('slct');
  }

  /**
   * Emits selection change events and updates active cell highlighting on animation frame.
   * @param {boolean} [focus=true] - Whether to automatically focus viewport on active cell.
   */
  slctRefresh(focus = true) {
    StateManager.setState('selection', { x: this.sheet.x, y: this.sheet.y, rangeEnd: this.sheet.rangeEnd });
    StateManager.emit('selection:changed', { x: this.sheet.x, y: this.sheet.y, rangeEnd: this.sheet.rangeEnd });
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : (cb) => cb());
    raf(() => {
      this.slctClear();
      this.view.scrollbarRefresh();
      if (focus) this.slctFocus();
      if (this.sheet.rangeEnd) return this.view.viewRangeRender();
      let y = this.sheet.y - this.sheet.baseY;
      let x = this.sheet.x - this.sheet.baseX;
      if (!this.isInViewRange(x, y)) return;
      if (this.view.rows[y + 1] && this.view.rows[y + 1].cells[x + 1]) {
        this.view.rows[y + 1].cells[x + 1].classList.add("slct");
      }
      this.view.footerUpdate();
    });
  }
}

