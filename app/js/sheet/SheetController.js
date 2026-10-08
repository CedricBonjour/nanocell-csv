/**
 * Controller Component for `<ui-sheet>` Web Component.
 * Handles user interactions, keyboard navigation, selection management, sheet mutations, and event bindings.
 * @module SheetController
 */
import { StateManager } from '../StateManager.js';
import { stg } from '../Setting.js';
import { Msg } from '../Msg.js';
import { LBT, TargetType } from '../mouse.js';
import { round } from '../utils/misc.js';
import { HeaderValidator } from '../../../core/validation/HeaderValidator.js';
import { DataValidator } from '../../../core/validation/DataValidator.js';
import { DateValidator } from '../../../core/validation/DateValidator.js';
import { createRange } from '../../../core/model/Range.js';
import { formatDate } from '../../../core/utils/date.js';



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

      if ((e.ctrlKey || e.metaKey) && (e.key === ";" || k === "T")) {
        e.preventDefault();
        e.stopPropagation();
        const todayStr = formatDate(new Date(), 'yyyy-mm-dd');
        const input = this.sheet.inputField;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        input.value = input.value.substring(0, start) + todayStr + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + todayStr.length;
        return;
      }

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
          if (e.shiftKey) this.sheet.x--;
          else this.sheet.x++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWUP":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y--;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWDOWN":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
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
      if (ty < 0 && tx >= 0) {
        const colIdx = this.sheet.baseX + tx;
        if (this.sheet.expandedCol === colIdx) {
          this.sheet.expandedCol = null;
        } else {
          this.sheet.expandedCol = colIdx;
        }
        this.sheet.refresh();
      }
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
    this.sheet.df.sort(n, {
      ascending,
      hasHeader: Boolean(stg.sort_header),
      numbersFirst: Boolean(stg.sort_num_first)
    });
    this.view.refresh();
  }

  /**
   * Focuses grid on specified cell (x, y) and highlights it.
   * @param {number} x 
   * @param {number} y 
   */
  focus_cell(x, y) {
    this.sheet.x = x;
    this.sheet.y = y;
    this.slctRefresh(true);
  }

  /**
   * Retrieves validation pane component and displays validation edit proposals.
   * @param {Array<Object>} items 
   */
  openValidationPaneWithItems(items = []) {
    let pane = StateManager.getState('validationPane');
    if (!pane && typeof document !== 'undefined') {
      pane = document.getElementById('validation-pane') || document.querySelector('ui-validation-pane');
    }
    if (pane) {
      if (typeof pane.bindSheet === 'function') pane.bindSheet(this.sheet);
      if (typeof pane.loadItems === 'function') pane.loadItems(items);
      if (typeof pane.show === 'function') pane.show();
    }
  }

  /**
   * Performs read-only scan over header row to propose standard SQL column naming fixes.
   * @returns {Array<Object>} List of proposed header edit objects.
   */
  validate_headers() {
    const rawItems = HeaderValidator.validate(this.sheet.df);
    const items = rawItems.map(item => ({
      ...item,
      category: 'DUPLICATE_FIX',
      categoryName: 'Duplicate Fixes'
    }));

    this.openValidationPaneWithItems(items);
    return items;
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
   * Performs read-only scan over dataframe matrix to propose CSV compliance edits based on active settings.
   * @returns {Array<Object>} List of proposed edit objects.
   */
  validate_data() {
    const items = DataValidator.validate(this.sheet.df, {
      trimWhitespace: true,
      coerceCommaDecimals: Boolean(stg.dv_comma_num),
      replaceCommaWithHyphen: Boolean(stg.dv_comma_txt),
      replaceNewlineWithPipe: Boolean(stg.dv_lr),
      replaceDoubleQuotes: Boolean(stg.dv_quotes),
      toLowerCase: Boolean(stg.dv_lower)
    });

    this.openValidationPaneWithItems(items);
    return items;
  }

  /**
   * Validates and standardizes date cells in the sheet to 'YYYY-mm-dd'.
   * Transforms year-first dates (e.g. YYYY-m-d) systematically to 'YYYY-mm-dd'.
   * Scans for cells matching 'dd-mm-YYYY' or 'mm-dd-YYYY' across any separator.
   * Differentiates year-last source format with certainty based on digits > 12.
   * If both formats coexist or no date has a digit > 12, alerts user via Msg.js.
   * If format is determined with certainty, transforms matching cells to 'YYYY-mm-dd'.
   * @returns {Array<Object>} List of executed change objects with metadata.
   */
  validate_date_format() {
    if (this.sheet.inputing) this.inputBlur();
    if (this.sheet?.df?.lock) {
      Msg.warning("Sheet is locked (view-only mode).", "Date Validation");
      const res = [];
      res.success = false;
      res.reason = 'locked';
      return res;
    }

    const { proposals, success, detectedFormat, reason } = DateValidator.validate(this.sheet.df);

    if (reason === 'no_dates') {
      Msg.info("No matching date cells found in the file.", "Date Validation");
      const res = [];
      res.success = false;
      res.reason = 'no_dates';
      return res;
    }

    if (reason === 'coexistence') {
      Msg.warning("Both 'dd-mm-YYYY' and 'mm-dd-YYYY' formats coexist in the file.", "Date Validation");
    } else if (reason === 'ambiguous') {
      Msg.warning("Cannot determine date format with certainty: no date has a digit over 12.", "Date Validation");
    }

    const changes = proposals.map(p => ({
      x: p.x,
      y: p.y,
      oldValue: p.oldValue,
      newValue: p.newValue
    }));

    if (changes.length > 0) {
      this.sheet.df.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes }
      });
      this.sheet.refresh();
      StateManager.emit('dataframe:changed', { action: 'dateValidate', changes });
      if (!reason) {
        Msg.success(`Converted ${changes.length} date${changes.length === 1 ? '' : 's'} to YYYY-mm-dd${detectedFormat ? ` (${detectedFormat})` : ''}.`, "Date Validation");
      }
    } else if (!reason) {
      Msg.info("All matching dates are already in YYYY-mm-dd format.", "Date Validation");
    }

    const result = changes;
    result.success = success;
    if (reason) result.reason = reason;
    if (detectedFormat) result.detectedFormat = detectedFormat;
    result.count = changes.length;
    return result;
  }


  validate_dates() {
    return this.validate_date_format();
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
    const r = this.rangeOrdered();
    const cellRange = createRange(r.xmin, r.ymin, r.xmax, r.ymax);
    this.sheet.df.transpose(cellRange);
    this.sheet.rangeEnd = {
      x: r.xmin + (r.ymax - r.ymin),
      y: r.ymin + (r.xmax - r.xmin)
    };
    this.view.refresh();
  }

  /**
   * Rounds numeric values in selection range to integers or 2 decimal places.
   * @param {boolean} [integer=true] - True for integer rounding, false for 2 decimal places.
   */
  round(integer = true) {
    this.rangeApply((x, y) => {
      const val = this.sheet.df.get(x, y);
      const rounded = round(val, integer);
      if (rounded !== val) {
        this.sheet.df.edit(x, y, rounded);
      }
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

