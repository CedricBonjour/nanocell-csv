/**
 * 2D Grid Matrix Data Structure and Command History Manager for NanoCell CSV.
 * Supports transactional cell editing, row/column operations, and time-windowed undo/redo stacks.
 * @module Dataframe
 */
import { stg } from './Setting.js';
import { round } from './utils/misc.js';

/**
 * Encapsulates the 2D tabular data matrix and manages mutation commands with undo/redo capabilities.
 */
class Dataframe {
  /**
   * Instantiates a Dataframe with initial 2D matrix data.
   * @param {Array<Array<string|number>>} [d=[[""]]] - Initial 2D data matrix.
   */
  constructor(d = [[""]]) {
    /** @type {boolean} Prevents modifications when true (e.g. view-only mode). */
    this.lock = false;
    /** @type {boolean} Tracks if data matrix has unsaved changes. */
    this.isSaved = true;
    /** @type {Array<Array<string|number>>} Primary 2D array of cell values. */
    this.data = d;
    /** @type {Array<Object>} Stack of executed command objects for undoing. */
    this.undoStack = [];
    /** @type {Array<Object>} Stack of reverted command objects for redoing. */
    this.redoStack = [];
    this.square();
  }

  /**
   * Retrieves string value of cell at coordinates (x, y). Returns empty string if out of bounds.
   * @param {number} x - Column index (0-indexed).
   * @param {number} y - Row index (0-indexed).
   * @returns {string} Cell string value.
   */
  get(x, y) { return (y >= this.height || x >= this.width || y < 0 || x < 0) ? '' : String(this.data[y][x]) }

  /**
   * Iterates through every cell in the data matrix, invoking callback function.
   * @param {Function} cb - Callback invoked as `cb(val, x, y)`.
   */
  getAll(cb) {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) cb(this.get(x, y), x, y);
  }

  /**
   * Removes all trailing empty columns and rows from the matrix.
   */
  trimAll() {
    if (this.lock) return;
    for (let x = this.width - 1; x >= 0; x--) {
      let emptyCol = true;
      for (let y = 0; y < this.data.length; y++) if (this.data[y][x].length > 0) { emptyCol = false; break }
      if (emptyCol) this.deleteCol(x);
    }
    for (let y = this.data.length - 1; y >= 0; y--) {
      let emptyRow = true;
      for (let x = 0; x < this.data[y].length; x++) if (this.data[y][x].length > 0) { emptyRow = false; break }
      if (emptyRow) this.deleteRow(y);
    }
  }

  /**
   * Reorders rows according to new index order array.
   * @param {Array<number>} new_order - Array of target row indices.
   */
  order(new_order) {
    if (this.lock) return;
    const old_order = new Array(new_order.length);
    for (let i = 0; i < new_order.length; i++) old_order[new_order[i]] = i;
    const timestamp = Date.now();
    this.create({
      type: 'ORDER_ROWS',
      timestamp,
      payload: { newOrder: new_order, oldOrder: old_order }
    });
  }

  /**
   * Shifts column n right to n+1.
   * @param {number} n - Column index to shift.
   */
  shiftCol(n) {
    if (this.lock) return;
    if (n < 0 || n + 1 > this.width) return;
    if (n + 1 === this.width) return this.insertCol(n);
    const timestamp = Date.now();
    this.create({
      type: 'SHIFT_COL',
      timestamp,
      payload: { index: n }
    });
  }

  /**
   * Shifts row n down to n+1.
   * @param {number} n - Row index to shift.
   */
  shiftRow(n) {
    if (this.lock) return;
    if (n < 0 || n + 1 > this.height) return;
    if (n + 1 === this.height) return this.insertRow(n);
    const timestamp = Date.now();
    this.create({
      type: 'SHIFT_ROW',
      timestamp,
      payload: { index: n }
    });
  }

  /**
   * Deletes row at index n.
   * @param {number} n - Row index to delete.
   */
  deleteRow(n) {
    if (this.lock) return;
    if (this.height < 2 || n < 0 || n >= this.height) return;
    const rowData = [...this.data[n]];
    const timestamp = Date.now();
    this.create({
      type: 'DELETE_ROW',
      timestamp,
      payload: { index: n, rowData }
    });
  }

  /**
   * Deletes column at index n.
   * @param {number} n - Column index to delete.
   */
  deleteCol(n) {
    if (this.lock) return;
    if (this.width < 2 || n < 0 || n >= this.width) return;
    const colData = this.data.map(row => row[n]);
    const timestamp = Date.now();
    this.create({
      type: 'DELETE_COL',
      timestamp,
      payload: { index: n, colData }
    });
  }

  /**
   * Inserts an empty column at index n.
   * @param {number} n - Column index for insertion.
   */
  insertCol(n) {
    if (this.lock) return;
    if (n > this.width) return;
    const timestamp = Date.now();
    this.create({
      type: 'INSERT_COL',
      timestamp,
      payload: { index: n }
    });
  }

  /**
   * Inserts an empty row at index n.
   * @param {number} n - Row index for insertion.
   */
  insertRow(n) {
    if (this.lock) return;
    const timestamp = Date.now();
    this.create({
      type: 'INSERT_ROW',
      timestamp,
      payload: { index: n }
    });
  }

  /**
   * Appends an empty column to the end of the data matrix.
   */
  pushCol() {
    if (this.lock) return;
    const timestamp = Date.now();
    this.create({
      type: 'PUSH_COL',
      timestamp,
      payload: {}
    });
  }

  /**
   * Appends an empty row to the end of the data matrix.
   */
  pushRow() {
    if (this.lock) return;
    const timestamp = Date.now();
    this.create({
      type: 'PUSH_ROW',
      timestamp,
      payload: {}
    });
  }

  /**
   * Edits the value of cell (x, y) to n. Automatically expands matrix bounds if necessary.
   * @param {number} x - Column index.
   * @param {number} y - Row index.
   * @param {string|number} n - New cell value.
   */
  edit(x, y, n) {
    if (this.lock) return;
    const o = this.get(x, y);
    if (stg.autoRound) {
      try {
        const array = String(n).split('=');
        array[array.length - 1] = round(array[array.length - 1], false);
        n = array.join('=');
      } catch (e) {
        console.error("autoRound error in edit:", e);
        throw new Error("edit error n = " + n);
      }
    }
    if (n === o) return;
    while (this.width <= x) this.pushCol();
    while (this.height <= y) this.pushRow();
    const timestamp = Date.now();
    this.create({
      type: 'EDIT_CELL',
      timestamp,
      payload: { x, y, oldValue: o, newValue: n }
    });
  }

  /**
   * Executes or reverts a transaction command against the internal 2D matrix data.
   * @param {Object} command - Command descriptor object.
   * @param {string} command.type - Command type identifier.
   * @param {Object} [command.payload] - Command payload details.
   * @param {boolean} [isRevert=false] - Whether to apply reverse mutation logic.
   */
  executeCommand(command, isRevert = false) {
    if (!command || !command.type) return;
    const payload = command.payload || {};
    switch (command.type) {
      case 'EDIT_CELL': {
        const { x, y, oldValue, newValue } = payload;
        const val = isRevert ? oldValue : newValue;
        while (this.width <= x) {
          for (const row of this.data) row.push('');
        }
        while (this.height <= y) {
          this.data.push(Array(this.width).fill(''));
        }
        this.data[y][x] = val;
        break;
      }
      case 'INSERT_ROW': {
        const { index } = payload;
        if (isRevert) {
          this.data.splice(index, 1);
        } else {
          this.data.splice(index, 0, Array(this.width).fill(''));
        }
        break;
      }
      case 'DELETE_ROW': {
        const { index, rowData } = payload;
        if (isRevert) {
          this.data.splice(index, 0, [...rowData]);
        } else {
          this.data.splice(index, 1);
        }
        break;
      }
      case 'INSERT_COL': {
        const { index } = payload;
        if (isRevert) {
          for (const row of this.data) row.splice(index, 1);
        } else {
          for (const row of this.data) row.splice(index, 0, '');
        }
        break;
      }
      case 'DELETE_COL': {
        const { index, colData } = payload;
        if (isRevert) {
          for (let i = 0; i < this.data.length; i++) {
            this.data[i].splice(index, 0, colData[i]);
          }
        } else {
          for (const row of this.data) row.splice(index, 1);
        }
        break;
      }
      case 'PUSH_ROW': {
        if (isRevert) {
          this.data.pop();
        } else {
          this.data.push(Array(this.width).fill(''));
        }
        break;
      }
      case 'PUSH_COL': {
        if (isRevert) {
          for (const row of this.data) row.pop();
        } else {
          for (const row of this.data) row.push('');
        }
        break;
      }
      case 'SHIFT_ROW': {
        const n = payload.index;
        if (n >= 0 && n + 1 < this.height) {
          const t = this.data[n];
          this.data[n] = this.data[n + 1];
          this.data[n + 1] = t;
        }
        break;
      }
      case 'SHIFT_COL': {
        const n = payload.index;
        if (n >= 0 && n + 1 < this.width) {
          for (const row of this.data) {
            const t = row[n];
            row[n] = row[n + 1];
            row[n + 1] = t;
          }
        }
        break;
      }
      case 'ORDER_ROWS': {
        const { newOrder, oldOrder } = payload;
        const order = isRevert ? oldOrder : newOrder;
        this.data = order.map(index => this.data[index]);
        break;
      }
      case 'RANGE_EDIT': {
        const { changes } = payload;
        if (Array.isArray(changes)) {
          for (const edit of changes) {
            const val = isRevert ? edit.oldValue : edit.newValue;
            this.data[edit.y][edit.x] = val;
          }
        }
        break;
      }
      case 'CUSTOM': {
        if (isRevert) {
          if (typeof command._undo === 'function') command._undo();
        } else {
          if (typeof command._redo === 'function') command._redo();
        }
        break;
      }
      default:
        console.warn(`Unknown command type: ${command.type}`);
    }
  }

  /**
   * Creates and registers a new transaction command or custom undo/redo handler.
   * @param {Object|Function} cmd - Command object or redo function callback.
   * @param {Function} [u] - Undo callback function when cmd is a custom function.
   */
  create(cmd, u) {
    if (this.lock) return;
    let command;
    if (typeof cmd === 'object' && cmd !== null && cmd.type) {
      command = cmd;
      if (command.timestamp === undefined) {
        command.timestamp = command.t ?? Date.now();
      }
    } else if (typeof cmd === 'function') {
      const timestamp = Date.now();
      command = {
        type: 'CUSTOM',
        timestamp,
        payload: {},
        _redo: cmd,
        _undo: u
      };
    } else {
      return;
    }

    this.executeCommand(command, false);
    this.undoStack.push(command);
    this.redoStack = [];
    this.isSaved = false;
  }

  /**
   * Reverts the last executed command or group of commands within MS_DELTA time window.
   */
  undo() {
    let prev, action;
    do {
      if (this.undoStack.length < 1) return;
      action = this.undoStack.pop();
      this.executeCommand(action, true);
      this.redoStack.push(action);
      prev = this.undoStack[this.undoStack.length - 1];
    } while (prev && (getCmdTimestamp(action) - getCmdTimestamp(prev)) < Dataframe.MS_DELTA);
    this.isSaved = false;
  }

  /**
   * Re-applies the last reverted command or group of commands within MS_DELTA time window.
   */
  redo() {
    let next, action;
    do {
      if (this.redoStack.length < 1) return;
      action = this.redoStack.pop();
      this.executeCommand(action, false);
      this.undoStack.push(action);
      next = this.redoStack[this.redoStack.length - 1];
    } while (next && (getCmdTimestamp(next) - getCmdTimestamp(action)) < Dataframe.MS_DELTA);
    this.isSaved = false;
  }

  /**
   * Ensures all rows in the 2D matrix have uniform width equal to the maximum row length.
   */
  square() {
    if (this.lock) return;
    let m = 1;
    for (const row of this.data) m = Math.max(m, row.length);
    for (const row of this.data) while (row.length < m) row.push("");
  }

  /**
   * Appends multiple row arrays to the matrix, expanding column width if necessary.
   * @param {Array<Array<string|number>>} rows - 2D array of rows to append.
   */
  appendRows(rows) {
    if (!rows || rows.length === 0) return;
    let targetWidth = this.width;
    for (const row of rows) {
      if (row.length > targetWidth) targetWidth = row.length;
    }
    if (targetWidth > this.width) {
      for (const row of this.data) {
        while (row.length < targetWidth) row.push("");
      }
    }
    for (const row of rows) {
      const r = [...row];
      while (r.length < targetWidth) r.push("");
      this.data.push(r);
    }
  }

  /**
   * Gets total column count of the data matrix.
   * @type {number}
   */
  get width() { return (this.data.length > 0) ? this.data[0].length : 0 }

  /**
   * Gets total row count of the data matrix.
   * @type {number}
   */
  get height() { return this.data.length }

}

/**
 * Extracts timestamp from a command object.
 * @param {Object} cmd - Command object.
 * @returns {number} Command timestamp in milliseconds.
 */
function getCmdTimestamp(cmd) {
  if (!cmd) return 0;
  return cmd.timestamp ?? cmd.t ?? 0;
}

Object.defineProperty(Dataframe, 'MS_DELTA', { value: 100 });

export { Dataframe };

