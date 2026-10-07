/**
 * @file core/model/Dataframe.ts
 * Authoritative 2D tabular data store backed by Matrix<string>.
 * Incorporates transactional history, cell editing, row/column mutations,
 * and undo/redo stacks with zero browser/DOM dependencies.
 */

import { CellValue, FormatOptions, formatCellValue, normalizeCellValue, roundNumericString } from './Cell.js';
import { CellRange } from './Range.js';
import { Matrix } from './Matrix.js';
import { IDataframe, SortOptions } from './IDataframe.js';

export interface CommandDescriptor {
  type: string;
  timestamp?: number;
  t?: number;
  payload?: any;
  _redo?: () => void;
  _undo?: () => void;
}

export class Dataframe implements IDataframe {
  static MS_DELTA = 100;

  protected _matrix: Matrix<string>;
  protected _isSaved: boolean = true;
  protected _isLocked: boolean = false;

  public undoStack: CommandDescriptor[] = [];
  public redoStack: CommandDescriptor[] = [];

  constructor(initialData?: CellValue[][]) {
    const stringData = initialData && initialData.length > 0
      ? initialData.map(row => row.map(v => normalizeCellValue(v)))
      : [['']];
    this._matrix = new Matrix<string>(stringData, '');
    if (Array.isArray(initialData) && initialData.length === 0) {
      this._matrix.rawRows.length = 0;
    } else {
      this.square();
    }
    this.undoStack = [];
    this.redoStack = [];
  }

  get width(): number {
    return this._matrix.width;
  }

  get height(): number {
    return this._matrix.height;
  }

  get isSaved(): boolean {
    return this._isSaved;
  }

  set isSaved(val: boolean) {
    this._isSaved = val;
  }

  get isLocked(): boolean {
    return this._isLocked;
  }

  set isLocked(val: boolean) {
    this._isLocked = val;
  }

  get lock(): boolean {
    return this._isLocked;
  }

  set lock(val: boolean) {
    this._isLocked = val;
  }

  get data(): string[][] {
    return this._matrix.rawRows;
  }

  set data(newRows: string[][]) {
    if (this._isLocked) return;
    this._matrix = new Matrix<string>(newRows, '');
    this.square();
    this.markDirty();
  }

  get(x: number, y: number): string {
    if (y >= this.height || x >= this.width || y < 0 || x < 0) return '';
    const val = this.data[y]?.[x];
    return val !== undefined && val !== null ? String(val) : '';
  }

  set(x: number, y: number, value: CellValue, options?: FormatOptions): boolean {
    if (this._isLocked) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false;

    const oldVal = this.get(x, y);
    const formatted = formatCellValue(value, options);
    const willExpand = x >= this.width || y >= this.height;

    this._matrix.ensureCapacity(x, y);
    const success = this._matrix.set(x, y, formatted);
    if (success && (willExpand || formatted !== oldVal)) {
      this.markDirty();
    }
    return success;
  }

  getAll(callback: (value: string, x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        callback(this.get(x, y), x, y);
      }
    }
  }

  getRow(y: number): string[] {
    return this._matrix.getRow(y) ?? [];
  }

  getCol(x: number): string[] {
    return this._matrix.getCol(x) ?? [];
  }

  trimAll(): void {
    if (this.lock) return;
    for (let x = this.width - 1; x >= 0; x--) {
      let emptyCol = true;
      for (let y = 0; y < this.data.length; y++) {
        if (this.data[y] && this.data[y][x] && this.data[y][x].length > 0) {
          emptyCol = false;
          break;
        }
      }
      if (emptyCol) this.deleteCol(x);
    }
    for (let y = this.data.length - 1; y >= 0; y--) {
      let emptyRow = true;
      for (let x = 0; x < this.data[y].length; x++) {
        if (this.data[y] && this.data[y][x] && this.data[y][x].length > 0) {
          emptyRow = false;
          break;
        }
      }
      if (emptyRow) this.deleteRow(y);
    }
  }

  order(new_order: number[]): void {
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

  orderRows(order: number[]): void {
    this.order(order);
  }

  sort(n: number, options?: SortOptions): number[] {
    if (this.lock) return [];
    if (n < 0 || n >= this.width) return [];

    const hasHeader = options?.hasHeader ?? false;
    const ascending = options?.ascending ?? true;
    const numbersFirst = options?.numbersFirst ?? false;

    let col_items = this.data.map((row, idx) => ({ val: row[n], idx }));
    if (hasHeader) col_items.shift();

    const numbers: { val: number; idx: number }[] = [];
    const strings: { val: string; idx: number }[] = [];
    const empty: number[] = [];

    col_items.forEach(item => {
      if (item.val === undefined || item.val.length < 1) {
        empty.push(item.idx);
      } else if (!isNaN(Number(item.val)) && item.val.trim() !== '') {
        numbers.push({ val: Number(item.val), idx: item.idx });
      } else {
        strings.push({ val: String(item.val), idx: item.idx });
      }
    });

    const str_ordered = strings
      .sort((a, b) => (ascending ? a.val.localeCompare(b.val) : b.val.localeCompare(a.val)))
      .map(({ idx }) => idx);

    const num_ordered = numbers
      .sort((a, b) => (ascending ? a.val - b.val : b.val - a.val))
      .map(({ idx }) => idx);

    let new_order = numbersFirst
      ? num_ordered.concat(str_ordered)
      : str_ordered.concat(num_ordered);

    new_order = new_order.concat(empty);
    if (hasHeader) new_order.unshift(0);

    this.order(new_order);
    return new_order;
  }

  transpose(range?: CellRange): void {
    if (this.lock) return;
    if (!range) {
      const transposed = this._matrix.transpose();
      this._matrix = transposed;
      this.square();
      this.markDirty();
      return;
    }

    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);
    const ordered = { xmin, xmax, ymin, ymax };
    const slice = this.slice(ordered);
    const transposedSlice = Matrix.transpose2D(slice);

    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];

    for (let y = ordered.ymin; y <= ordered.ymax; y++) {
      for (let x = ordered.xmin; x <= ordered.xmax; x++) {
        changes.push({
          x,
          y,
          oldValue: this.get(x, y),
          newValue: ''
        });
      }
    }

    for (let r = 0; r < transposedSlice.length; r++) {
      for (let c = 0; c < transposedSlice[r].length; c++) {
        const tx = ordered.xmin + c;
        const ty = ordered.ymin + r;
        const existing = changes.find(ch => ch.x === tx && ch.y === ty);
        if (existing) {
          existing.newValue = transposedSlice[r][c];
        } else {
          changes.push({
            x: tx,
            y: ty,
            oldValue: this.get(tx, ty),
            newValue: transposedSlice[r][c]
          });
        }
      }
    }

    const timestamp = Date.now();
    this.create({
      type: 'RANGE_EDIT',
      timestamp,
      payload: { changes }
    });
  }

  shiftCol(n: number, direction: 'left' | 'right' = 'right'): void {
    if (this.lock) return;
    if (direction === 'left') {
      if (n <= 0 || n >= this.width) return;
      n = n - 1;
    }
    if (n < 0 || n + 1 > this.width) return;
    if (n + 1 === this.width) return this.insertCol(n);
    const timestamp = Date.now();
    this.create({
      type: 'SHIFT_COL',
      timestamp,
      payload: { index: n }
    });
  }

  shiftRow(n: number, direction: 'up' | 'down' = 'down'): void {
    if (this.lock) return;
    if (direction === 'up') {
      if (n <= 0 || n >= this.height) return;
      n = n - 1;
    }
    if (n < 0 || n + 1 > this.height) return;
    if (n + 1 === this.height) return this.insertRow(n);
    const timestamp = Date.now();
    this.create({
      type: 'SHIFT_ROW',
      timestamp,
      payload: { index: n }
    });
  }

  deleteRow(n: number): CellValue[] {
    if (this.lock) return [];
    if (this.height < 2 || n < 0 || n >= this.height) return [];
    const rowData = [...this.data[n]];
    const timestamp = Date.now();
    this.create({
      type: 'DELETE_ROW',
      timestamp,
      payload: { index: n, rowData }
    });
    return rowData;
  }

  deleteCol(n: number): CellValue[] {
    if (this.lock) return [];
    if (this.width < 2 || n < 0 || n >= this.width) return [];
    const colData = this.data.map(row => row[n]);
    const timestamp = Date.now();
    this.create({
      type: 'DELETE_COL',
      timestamp,
      payload: { index: n, colData }
    });
    return colData;
  }

  insertCol(n: number, colData?: CellValue[]): void {
    if (this.lock) return;
    if (n < 0 || n > this.width) return;
    const timestamp = Date.now();
    this.create({
      type: 'INSERT_COL',
      timestamp,
      payload: { index: n, colData }
    });
  }

  insertRow(n: number, rowData?: CellValue[]): void {
    if (this.lock) return;
    if (n < 0 || n > this.height) return;
    const timestamp = Date.now();
    this.create({
      type: 'INSERT_ROW',
      timestamp,
      payload: { index: n, rowData }
    });
  }

  pushCol(colData?: CellValue[]): void {
    if (this.lock) return;
    const timestamp = Date.now();
    this.create({
      type: 'PUSH_COL',
      timestamp,
      payload: { colData }
    });
  }

  pushRow(rowData?: CellValue[]): void {
    if (this.lock) return;
    const timestamp = Date.now();
    this.create({
      type: 'PUSH_ROW',
      timestamp,
      payload: { rowData }
    });
  }

  edit(x: number, y: number, n: CellValue, options?: FormatOptions): void {
    if (this.lock) return;
    const o = this.get(x, y);

    let shouldAutoRound = options?.autoRound;
    if (shouldAutoRound === undefined) {
      const g = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
      const gStg = g?.stg || g?.window?.stg;
      if (gStg) {
        shouldAutoRound = !!gStg.autoRound;
      }
    }
    if (shouldAutoRound) {
      try {
        const array = String(n).split('=');
        array[array.length - 1] = roundNumericString(array[array.length - 1], options?.decimalPlaces ?? 2);
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

  executeCommand(command: CommandDescriptor, isRevert = false): void {
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
        const { index, rowData } = payload;
        if (isRevert) {
          this.data.splice(index, 1);
        } else {
          const insertContent = rowData ? [...rowData] : [];
          while (insertContent.length < this.width) insertContent.push('');
          if (insertContent.length > this.width) insertContent.length = this.width;
          this.data.splice(index, 0, insertContent);
          this.square();
        }
        break;
      }
      case 'DELETE_ROW': {
        const { index, rowData } = payload;
        if (isRevert) {
          const content = rowData ? [...rowData] : [];
          while (content.length < this.width) content.push('');
          if (content.length > this.width) content.length = this.width;
          this.data.splice(index, 0, content);
          this.square();
        } else {
          this.data.splice(index, 1);
        }
        break;
      }
      case 'INSERT_COL': {
        const { index, colData } = payload;
        if (isRevert) {
          for (const row of this.data) row.splice(index, 1);
        } else {
          for (let i = 0; i < this.data.length; i++) {
            const val = colData && colData[i] !== undefined ? colData[i] : '';
            this.data[i].splice(index, 0, val);
          }
          this.square();
        }
        break;
      }
      case 'DELETE_COL': {
        const { index, colData } = payload;
        if (isRevert) {
          for (let i = 0; i < this.data.length; i++) {
            const val = colData && colData[i] !== undefined ? colData[i] : '';
            this.data[i].splice(index, 0, val);
          }
          this.square();
        } else {
          for (const row of this.data) row.splice(index, 1);
        }
        break;
      }
      case 'PUSH_ROW': {
        const { rowData } = payload;
        if (isRevert) {
          this.data.pop();
        } else {
          const content = rowData ? [...rowData] : [];
          while (content.length < this.width) content.push('');
          if (content.length > this.width) content.length = this.width;
          this.data.push(content);
          this.square();
        }
        break;
      }
      case 'PUSH_COL': {
        const { colData } = payload;
        if (isRevert) {
          for (const row of this.data) row.pop();
        } else {
          for (let i = 0; i < this.data.length; i++) {
            const val = colData && colData[i] !== undefined ? colData[i] : '';
            this.data[i].push(val);
          }
          this.square();
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
        this.data = order.map((index: number) => this.data[index]);
        break;
      }
      case 'RANGE_EDIT': {
        const { changes } = payload;
        if (Array.isArray(changes)) {
          for (const edit of changes) {
            const val = isRevert ? edit.oldValue : edit.newValue;
            while (this.width <= edit.x) {
              for (const row of this.data) row.push('');
            }
            while (this.height <= edit.y) {
              this.data.push(Array(this.width).fill(''));
            }
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

  create(cmd: any, u?: any): void {
    if (this.lock) return;
    let command: CommandDescriptor;
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

  undo(): void {
    let prev: CommandDescriptor | undefined, action: CommandDescriptor | undefined;
    do {
      if (this.undoStack.length < 1) return;
      action = this.undoStack.pop();
      if (!action) return;
      this.executeCommand(action, true);
      this.redoStack.push(action);
      prev = this.undoStack[this.undoStack.length - 1];
    } while (prev && action && (getCmdTimestamp(action) - getCmdTimestamp(prev)) < Dataframe.MS_DELTA);
    this.isSaved = false;
  }

  redo(): void {
    let next: CommandDescriptor | undefined, action: CommandDescriptor | undefined;
    do {
      if (this.redoStack.length < 1) return;
      action = this.redoStack.pop();
      if (!action) return;
      this.executeCommand(action, false);
      this.undoStack.push(action);
      next = this.redoStack[this.redoStack.length - 1];
    } while (next && action && (getCmdTimestamp(next) - getCmdTimestamp(action)) < Dataframe.MS_DELTA);
    this.isSaved = false;
  }

  appendRows(rows: CellValue[][]): void {
    if (this.lock || !rows || rows.length === 0) return;
    const strRows = rows.map(r => r.map(v => normalizeCellValue(v)));
    this._matrix.appendRows(strRows);
    this.markDirty();
  }

  slice(range: CellRange): string[][] {
    return this._matrix.slice(range);
  }

  square(): void {
    if (this.lock) return;
    if (this.data.length === 0) return;
    this._matrix.square();
  }

  clone(): IDataframe {
    const cloned = new Dataframe(this._matrix.toArray());
    cloned.isLocked = this._isLocked;
    cloned.markSaved();
    return cloned;
  }

  markSaved(): void {
    this._isSaved = true;
  }

  markDirty(): void {
    this._isSaved = false;
  }
}

Object.defineProperty(Dataframe, 'MS_DELTA', {
  value: 100,
  writable: false,
  configurable: false
});

function getCmdTimestamp(cmd?: CommandDescriptor): number {
  if (!cmd) return 0;
  return cmd.timestamp ?? cmd.t ?? 0;
}
