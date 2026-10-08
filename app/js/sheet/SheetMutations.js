import { StateManager } from '../StateManager.js';
import { stg } from '../ui/settings/Setting.js';
import { Notification as Msg } from '../ui/Notification.js';
import { round } from '../utils/misc.js';
import { createRange } from '../../../core/model/Range.js';

/**
 * Manages grid mutations, cell edits, structural row/column modifications,
 * and tabular transformations (transposition, rounding, pattern fill, clipboard paste).
 */
export class SheetMutations {
  /**
   * @param {import('./Sheet.js').Sheet} sheet - Host sheet element.
   * @param {import('./SheetView.js').SheetView} view - Sheet view renderer.
   * @param {import('./SheetSelection.js').SheetSelection} selection - Selection helper.
   */
  constructor(sheet, view, selection) {
    this.sheet = sheet;
    this.view = view;
    this.selection = selection;
  }

  /**
   * Opens inline cell text editor for the active cell.
   * @param {string} [txt] - Initial text to populate editor with.
   */
  input(txt) {
    const cell = this.selection.bestInputCell();
    if (cell === undefined) return;
    this.sheet.inputing = true;
    this.sheet.inputField.value = txt ? txt : this.sheet.df.get(this.sheet.x, this.sheet.y).replaceAll('\n', '\u25BE');
    cell.appendChild(this.sheet.inputField);
    this.sheet.inputField.focus();
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
    } catch (err) {
      console.warn("Error removing inputField:", err);
    }
  }

  /**
   * Sets all cells within active selection range to a specified value.
   * @param {string} value - Value to assign.
   */
  rangeEdit(value) {
    if (!this.sheet.rangeEnd) return this.sheet.df.edit(this.sheet.x, this.sheet.y, value);
    const r = this.selection.rangeOrdered();
    for (let x = r.xmin; x <= r.xmax; x++) {
      for (let y = r.ymin; y <= r.ymax; y++) {
        this.sheet.df.edit(x, y, value);
      }
    }
  }

  /**
   * Applies callback function across all cell coordinates in the dataframe.
   * @param {Function} cb - Callback `cb(x, y)`.
   */
  allApply(cb) {
    for (let y = 0; y < this.sheet.df.height; y++) {
      for (let x = 0; x < this.sheet.df.width; x++) {
        cb(x, y);
      }
    }
  }

  /**
   * Applies callback function across all cell coordinates in active selection range.
   * @param {Function} cb - Callback `cb(x, y)`.
   */
  rangeApply(cb) {
    if (!this.sheet.rangeEnd) return cb(this.sheet.x, this.sheet.y);
    const r = this.selection.rangeOrdered();
    for (let x = r.xmin; x <= r.xmax; x++) {
      for (let y = r.ymin; y <= r.ymax; y++) {
        cb(x, y);
      }
    }
  }

  /**
   * Deletes all rows contained within active selection range.
   */
  deleteRows() {
    const r = this.selection.rangeOrdered();
    for (let i = 0; i <= r.ymax - r.ymin; i++) this.sheet.df.deleteRow(r.ymin);
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
    for (let i = 0; i <= r.xmax - r.xmin; i++) this.sheet.df.deleteCol(r.xmin);
    this.sheet.xx = r.xmin;
    if (this.sheet.rangeEnd) {
      this.sheet.rangeEnd.x = r.xmin;
      if (this.sheet.rangeEnd.y === this.sheet.y) this.sheet.rangeEnd = undefined;
    }
    this.view.refresh();
    this.selection.slctRefresh(false);
  }

  /**
   * Shifts active selection row or column in specified direction.
   * @param {number} direction - Direction identifier (0: up, 1: right, 2: down, 3: left).
   */
  shift(direction) {
    if (this.sheet.rangeEnd === undefined) {
      switch (direction) {
        case 0: this.sheet.df.shiftRow(this.sheet.y - 1); this.sheet.y--; break;
        case 1: this.sheet.df.shiftCol(this.sheet.x); this.sheet.x++; break;
        case 2: this.sheet.df.shiftRow(this.sheet.y); this.sheet.y++; break;
        case 3: this.sheet.df.shiftCol(this.sheet.x - 1); this.sheet.x--; break;
      }
    } else {
      const r = this.selection.rangeOrdered();
      const bux = this.sheet.rangeEnd.x;
      const buy = this.sheet.rangeEnd.y;
      switch (direction) {
        case 0:
          for (let y = r.ymin; y <= r.ymax; y++) this.sheet.df.shiftRow(y - 1);
          this.sheet.y--;
          this.sheet.rangeEnd = { x: bux, y: buy - 1 };
          break;
        case 1:
          for (let x = r.xmax; x >= r.xmin; x--) this.sheet.df.shiftCol(x);
          this.sheet.x++;
          this.sheet.rangeEnd = { x: bux + 1, y: buy };
          break;
        case 2:
          for (let y = r.ymax; y >= r.ymin; y--) this.sheet.df.shiftRow(y);
          this.sheet.y++;
          this.sheet.rangeEnd = { x: bux, y: buy + 1 };
          break;
        case 3:
          for (let x = r.xmin; x <= r.xmax; x++) this.sheet.df.shiftCol(x - 1);
          this.sheet.x--;
          this.sheet.rangeEnd = { x: bux - 1, y: buy };
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
    const r = this.selection.rangeOrdered();
    if (r.ymin === r.ymax) {
      const base0 = this.sheet.df.get(r.xmin, r.ymin);
      const base1 = this.sheet.df.get(r.xmin + 1, r.ymin);
      const baseN0 = Number(base0);
      const baseN1 = Number(base1);
      let d = baseN1 - baseN0;
      if (isNaN(baseN1) && !isNaN(baseN0)) d = 1;
      if (base0 === "" && base1 === "") d = 1;
      if (isNaN(d)) {
        for (let j = r.xmin; j <= r.xmax; j++) this.sheet.df.edit(j, this.sheet.y, base0);
      } else {
        for (let j = r.xmin; j <= r.xmax; j++) this.sheet.df.edit(j, this.sheet.y, baseN0 + d * (j - r.xmin));
      }
      return this.view.refresh();
    }
    for (let i = r.xmin; i <= r.xmax; i++) {
      const base0 = this.sheet.df.get(i, r.ymin);
      const base1 = this.sheet.df.get(i, r.ymin + 1);
      const baseN0 = Number(base0);
      const baseN1 = Number(base1);
      let d = baseN1 - baseN0;
      if ((isNaN(baseN1) || base1 === "") && !isNaN(baseN0)) d = 1;
      if (isNaN(d)) {
        for (let j = r.ymin; j <= r.ymax; j++) this.sheet.df.edit(i, j, base0);
      } else {
        for (let j = r.ymin; j <= r.ymax; j++) this.sheet.df.edit(i, j, baseN0 + d * (j - r.ymin));
      }
      this.view.refresh();
    }
  }

  /**
   * Transposes 2D matrix of cell values within active selection range.
   */
  rangeTranspose() {
    if (this.sheet.df.lock) return;
    if (!this.sheet.rangeEnd) return;
    const r = this.selection.rangeOrdered();
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
    if (this.sheet.rangeEnd) {
      minX = Math.min(minX, this.sheet.rangeEnd.x);
      minY = Math.min(minY, this.sheet.rangeEnd.y);
    }
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        this.sheet.df.edit(minX + x, minY + y, mat[y][x]);
      }
    }
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
   * Navigates selection to next matching cell occurrence of active cell value.
   */
  go_to_next() {
    const d = this.sheet.df.get(this.sheet.x, this.sheet.y);
    let i = this.sheet.x;
    let j = this.sheet.y;
    let found = false;
    while (!found) {
      i = (i + 1) % this.sheet.df.width;
      if (i === 0) j = (j + 1) % this.sheet.df.height;
      found = (this.sheet.df.get(i, j) === d);
    }

    if (i === this.sheet.x && j === this.sheet.y) {
      Msg.quick("No match");
    } else {
      this.sheet.x = i;
      this.sheet.y = j;
      this.selection.slctRefresh();
    }
  }
}
