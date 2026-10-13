/**
 * Controller Component for `<ui-sheet>` Web Component.
 * Coordinates user interaction events, selection helpers, inline cell input, and validation workflows.
 * @module SheetController
 */
import { dom } from '../ui/AppLayout.js';
import { stg } from '../ui/settings/Setting.js';
import { Notification } from '../ui/Notification.js';
import { LBT, TargetType } from '../interaction/MouseRouter.js';
import { formatDate } from '../../../core/utils/date.js';
import { isNumeric, roundNumericString } from '../../../core/model/Cell.js';
import { SearchEngine } from '../../../core/search/SearchEngine.js';
import { SheetSelection } from './SheetSelection.js';

/**
 * Manages input events, grid navigation, and delegates operations on the active Sheet.
 */
export class SheetController {
  /**
   * Instantiates a SheetController attached to a parent Sheet element and SheetView.
   * @param {import('./Sheet.js').Sheet} sheet - Target Sheet web component instance.
   * @param {import('./SheetView.js').SheetView} view - Sheet view rendering engine instance.
   */
  constructor(sheet, view) {
    this.sheet = sheet;
    this.view = view;
    this.selection = new SheetSelection(sheet, view);

    this.bindEvents();
  }

  /**
   * Binds mouse, keyboard, and double-click event listeners to the sheet table and input field.
   */
  bindEvents() {
    const onWheel = (e) => this.selection.scroll(e);
    this.sheet.addEventListener("wheel", onWheel, { passive: false });
    this.sheet.inputField.addEventListener("focusout", () => { this.inputBlur(); });
    this.sheet.inputField.addEventListener("keydown", (e) => {
      const k = e.key.toUpperCase();
      if (k === "ENTER" && e.shiftKey) {
        this.sheet.inputField.value = this.sheet.inputField.value + '\u25BE';
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === ";") {
        e.preventDefault();
        e.stopPropagation();
        this.insertDate();
        return;
      }

      switch (k) {
        case "ENTER":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
          this.selection.slctRefresh();
          this.view.refresh();
          break;
        case "TAB":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          if (e.shiftKey) this.sheet.x--;
          else this.sheet.x++;
          this.selection.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWUP":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y--;
          this.selection.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWDOWN":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
          this.selection.slctRefresh();
          this.view.refresh();
          break;
        case "ESCAPE":
          this.sheet.escape = true;
          this.sheet.inputField.blur();
          break;
      }
    });

    this.sheet.addEventListener("mouseover", (e) => {
      const td = e.target.closest("td");
      if (!td) return;
      const tx = td.tx;
      const ty = td.ty;
      if (tx === undefined || ty === undefined) return;

      if (LBT === TargetType.cell) {
        this.sheet.rangeEnd = { x: tx + this.sheet.baseX, y: ty + this.sheet.baseY };
        this.selection.slctRefresh(false);
      }
      if (LBT === TargetType.colH && tx >= 0) {
        this.selection.slctCol(this.sheet.x, tx + this.sheet.baseX);
      }
      if (LBT === TargetType.rowH && ty >= 0) {
        this.selection.slctRow(this.sheet.y, ty + this.sheet.baseY);
      }
    });

    this.sheet.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td");
      if (!td) return;
      const tx = td.tx;
      const ty = td.ty;
      if (tx === undefined || ty === undefined) return;

      if (tx >= 0 && ty >= 0) {
        if (!this.sheet.df?.lock) this.input();
      }
      if (ty < 0 && tx >= 0) {
        const colIdx = this.sheet.baseX + tx;
        if (this.sheet.expandedCol === colIdx) {
          this.sheet.expandedCol = null;
        } else {
          this.sheet.expandedCol = colIdx;
        }
        this.view.refresh();
      }
    });
  }

  // --- Inline Cell Editing ---

  /**
   * Opens inline cell text editor for the active cell.
   * @param {string} [txt] - Initial text to populate editor with.
   */
  input(txt) {
    if (this.sheet.df?.lock) return;
    const cell = this.selection.bestInputCell();
    if (cell === undefined) return;
    const actualY = this.sheet.getRowIndex(this.sheet.y);
    this.sheet.inputing = true;
    this.sheet.inputField.value = txt ? txt : (actualY >= 0 ? this.sheet.df.get(this.sheet.x, actualY).replaceAll('\n', '\u25BE') : '');
    cell.appendChild(this.sheet.inputField);
    this.sheet.inputField.focus();
  }

  /**
   * Handles inline cell editor blur event, updating Dataframe state.
   */
  inputBlur() {
    if (!this.sheet.inputing) return;
    this.sheet.inputing = false;
    let e = this.sheet.inputField.value;
    e = e.replaceAll('\u25BE', '\n');
    if (!this.sheet.escape) {
      this.rangeEdit(e);
      if (!this.sheet.rangeEnd) this.view.loadCell(this.sheet.inputField.parentNode, this.sheet.x, this.sheet.y);
      else this.view.refresh();
    }
    this.sheet.escape = false;
    try {
      if (this.sheet.inputField.parentNode) {
        this.sheet.inputField.remove();
      }
    } catch (err) {
      console.warn("Error removing inputField:", err);
    }
  }

  /**
   * Inserts current ISO date string ('YYYY-MM-DD') into active cell or inline editor.
   */
  insertDate() {
    const todayStr = formatDate(new Date(), 'yyyy-mm-dd');
    if (this.sheet.inputing && this.sheet.inputField) {
      const input = this.sheet.inputField;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      input.value = input.value.substring(0, start) + todayStr + input.value.substring(end);
      input.selectionStart = input.selectionEnd = start + todayStr.length;
    } else {
      this.rangeEdit(todayStr);
      this.view.refresh();
    }
  }

  // --- Grid Mutation Actions ---

  /**
   * Sets all cells within active selection range to a specified value.
   * @param {string} value - Value to assign.
   */
  rangeEdit(value) {
    const opts = { autoRound: Boolean(stg.autoRound) };
    if (!this.sheet.rangeEnd) {
      this.sheet.df.edit(this.sheet.x, this.sheet.y, value, opts);
      return;
    }
    this.sheet.df.editRange(this.selection.rangeOrdered(), value, opts);
  }

  /**
   * Clears cell contents within active selection range and refreshes view.
   */
  deleteSelection() {
    this.rangeEdit('');
    this.view.refresh();
  }

  /**
   * Deletes all rows contained within active selection range.
   */
  deleteRows() {
    const r = this.selection.rangeOrdered();
    const count = r.ymax - r.ymin + 1;
    this.sheet.df.deleteRows(r.ymin, count);
    this.sheet.yy = r.ymin;
    if (this.sheet.rangeEnd) {
      this.sheet.rangeEnd.y = r.ymin;
      if (this.sheet.rangeEnd.x === this.sheet.x) this.sheet.rangeEnd = undefined;
    }
    this.view.refresh();
    this.selection.slctRefresh(false);
  }

  /**
   * Deletes all columns contained within active selection range.
   */
  deleteCols() {
    const r = this.selection.rangeOrdered();
    const count = r.xmax - r.xmin + 1;
    this.sheet.df.deleteCols(r.xmin, count);
    this.sheet.xx = r.xmin;
    if (this.sheet.rangeEnd) {
      this.sheet.rangeEnd.x = r.xmin;
      if (this.sheet.rangeEnd.y === this.sheet.y) this.sheet.rangeEnd = undefined;
    }
    this.view.refresh();
    this.selection.slctRefresh(false);
  }

  /**
   * Reverts the most recent command or command transaction.
   */
  undo() {
    this.sheet.df.undo();
    this.view.refresh();
  }

  /**
   * Re-applies the most recently reverted command or command transaction.
   */
  redo() {
    this.sheet.df.redo();
    this.view.refresh();
  }

  /**
   * Toggles the frozen/fixed top row header state.
   */
  toggleFixTop() {
    this.sheet.fixTop = !this.sheet.fixTop;
    this.view.refresh();
  }

  /**
   * Shifts active selection row or column in specified direction.
   * @param {number} direction - Direction identifier (0: up, 1: right, 2: down, 3: left).
   */
  shift(direction) {
    if (this.sheet.rangeEnd === undefined) {
      switch (direction) {
        case 0:
          if (this.sheet.df.shiftRow(this.sheet.y, 'up')) {
            this.sheet.y--;
          }
          break;
        case 1:
          if (this.sheet.df.shiftCol(this.sheet.x, 'right')) {
            this.sheet.x++;
          }
          break;
        case 2:
          if (this.sheet.df.shiftRow(this.sheet.y, 'down')) {
            this.sheet.y++;
          }
          break;
        case 3:
          if (this.sheet.df.shiftCol(this.sheet.x, 'left')) {
            this.sheet.x--;
          }
          break;
      }
    } else {
      const r = this.selection.rangeOrdered();
      const bux = this.sheet.rangeEnd.x;
      const buy = this.sheet.rangeEnd.y;
      const rowCount = r.ymax - r.ymin + 1;
      const colCount = r.xmax - r.xmin + 1;
      switch (direction) {
        case 0:
          if (this.sheet.df.shiftRows(r.ymin, rowCount, 'up')) {
            this.sheet.y--;
            this.sheet.rangeEnd = { x: bux, y: buy - 1 };
          }
          break;
        case 1:
          if (this.sheet.df.shiftCols(r.xmin, colCount, 'right')) {
            this.sheet.x++;
            this.sheet.rangeEnd = { x: bux + 1, y: buy };
          }
          break;
        case 2:
          if (this.sheet.df.shiftRows(r.ymin, rowCount, 'down')) {
            this.sheet.y++;
            this.sheet.rangeEnd = { x: bux, y: buy + 1 };
          }
          break;
        case 3:
          if (this.sheet.df.shiftCols(r.xmin, colCount, 'left')) {
            this.sheet.x--;
            this.sheet.rangeEnd = { x: bux - 1, y: buy };
          }
          break;
      }
    }
    this.view.refresh();
    this.selection.slctRefresh();
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
    this.selection.slctRefresh();
  }

  /**
   * Expands cell pattern or value across selection range.
   */
  expand() {
    if (this.sheet.rangeEnd === undefined) return;
    this.sheet.df.fillSeries(this.selection.rangeOrdered());
    this.view.refresh();
  }

  /**
   * Trims empty rows and columns from sheet boundaries and refreshes view.
   */
  trim() {
    this.sheet.df.trimAll();
    this.view.refresh();
  }

  /**
   * Transposes 2D matrix of cell values within active selection range.
   */
  rangeTranspose() {
    if (this.sheet.df.lock) return;
    if (!this.sheet.rangeEnd) {
      this.sheet.df.transpose();
      const newX = Math.min(this.sheet.y, Math.max(0, this.sheet.df.width - 1));
      const newY = Math.min(this.sheet.x, Math.max(0, this.sheet.df.height - 1));
      this.selection.focus_cell(newX, newY);
      this.view.scrollbarRefresh();
      this.view.refresh();
      return;
    }
    const r = this.selection.rangeOrdered();
    this.sheet.df.transpose(r);
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
    if (!this.sheet.rangeEnd) {
      const val = this.sheet.df.get(this.sheet.x, this.sheet.y);
      if (val !== '' && isNumeric(val)) {
        const rounded = integer ? String(Math.round(Number(val))) : roundNumericString(val, 2);
        if (rounded !== val) this.sheet.df.edit(this.sheet.x, this.sheet.y, rounded);
      }
    } else {
      this.sheet.df.roundRange(this.selection.rangeOrdered(), integer);
    }
    this.view.refresh();
  }

  /**
   * Pastes a 2D array matrix into the sheet starting at top-left selection position.
   * @param {Array<Array<string>>} mat - 2D matrix of values to paste.
   */
  paste(mat) {
    let minX = this.sheet.x;
    let minY = this.sheet.y;
    if (this.sheet.rangeEnd) {
      minX = Math.min(minX, this.sheet.rangeEnd.x);
      minY = Math.min(minY, this.sheet.rangeEnd.y);
    }
    this.sheet.df.pasteMatrix(minX, minY, mat);
    this.view.refresh();
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
   * Sorts sheet rows based on active column in ascending order.
   */
  sortAscending() {
    this.sort(this.sheet.x, true);
  }

  /**
   * Sorts sheet rows based on active column in descending order.
   */
  sortDescending() {
    this.sort(this.sheet.x, false);
  }

  /**
   * Navigates selection to next or previous matching cell occurrence of active cell value.
   * @param {boolean} [forward=true] - True for next occurrence, false for previous occurrence.
   */
  go_to_occurrence(forward = true) {
    if (!this.sheet?.df || this.sheet.df.width === 0 || this.sheet.df.height === 0) return;
    const engine = new SearchEngine();
    const next = forward
      ? engine.goToNextMatching(this.sheet.df, { x: this.sheet.x, y: this.sheet.y })
      : engine.goToPreviousMatching(this.sheet.df, { x: this.sheet.x, y: this.sheet.y });

    if (!next) {
      Notification.quick("No match");
    } else {
      this.selection.focus_cell(next.x, next.y);
    }
  }

  go_to_next() {
    this.go_to_occurrence(true);
  }

  go_to_prev() {
    this.go_to_occurrence(false);
  }

  // --- Validation Workflow Coordination ---

  /**
   * Resolves and binds the validation pane custom element.
   * @returns {import('../ui/ValidationPane.js').ValidationPane|null}
   */
  getValidationPane() {
    let pane = dom?.validationPane;
    if (!pane && typeof document !== 'undefined') {
      pane = document.getElementById('validation-pane') || document.querySelector('ui-validation-pane');
    }
    if (pane && typeof pane.bindSheet === 'function') {
      pane.bindSheet(this.sheet);
    }
    return pane;
  }

  /**
   * Opens or toggles the validation pane to the rule selector.
   */
  open_validation_pane() {
    const pane = this.getValidationPane();
    if (pane) {
      if (typeof pane.toggle === 'function') pane.toggle();
      else if (typeof pane.show === 'function') pane.show();
    }
  }

  /**
   * Executes a specific validation rule by ID and opens the validation pane.
   * @param {string} ruleId 
   */
  validate_rule(ruleId) {
    const pane = this.getValidationPane();
    if (pane) {
      if (typeof pane.show === 'function') pane.show();
      if (typeof pane.runRule === 'function') pane.runRule(ruleId);
    }
  }
}
