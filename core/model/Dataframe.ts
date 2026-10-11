/**
 * @file core/model/Dataframe.ts
 * Authoritative 2D tabular data store directly managing string[][] cell memory.
 * Incorporates transactional history, cell editing, atomic range/batch operations,
 * and undo/redo stacks with zero browser/DOM dependencies.
 */

import { CellValue, FormatOptions, formatCellValue, normalizeCellValue, roundNumericString, isNumeric } from './Cell.js';
import { CellRange } from './Range.js';

export interface SortOptions {
  ascending?: boolean;
  hasHeader?: boolean;
  numbersFirst?: boolean;
}

export interface CommandDescriptor {
  type: string;
  timestamp?: number;
  payload?: any;
}


function expandSeries(v0: string, v1: string, count: number, hasV1: boolean): string[] {
  const isNum0 = v0 !== '' && isNumeric(v0);
  const isNum1 = hasV1 && v1 !== '' && isNumeric(v1);
  if (isNum0 && isNum1) {
    const num0 = Number(v0);
    const d = Number(v1) - num0;
    const decimals = Math.max((v0.split('.')[1] || '').length, (v1.split('.')[1] || '').length);
    return Array.from({ length: count }, (_, k) => {
      const val = num0 + d * k;
      return decimals > 0 ? String(Number(val.toFixed(decimals))) : String(val);
    });
  }
  if (isNum0) {
    const num0 = Number(v0);
    const decimals = (v0.split('.')[1] || '').length;
    return Array.from({ length: count }, (_, k) => {
      const val = num0 + k;
      return decimals > 0 ? String(Number(val.toFixed(decimals))) : String(val);
    });
  }
  return Array.from({ length: count }, () => v0);
}

export class Dataframe {
  public static readonly MS_DELTA = 100;
  static defaultAutoRound: boolean = false;

  protected _data: string[][];
  protected _isSaved: boolean = true;
  protected _isLocked: boolean = false;

  public undoStack: CommandDescriptor[] = [];
  public redoStack: CommandDescriptor[] = [];
  public autoRound: boolean = false;
  public decimalPlaces: number = 2;
  protected _transactionStack: { description?: string; timestamp: number; commands: CommandDescriptor[] }[] = [];

  constructor(initialData?: CellValue[][]) {
    if (initialData && initialData.length > 0) {
      this._data = initialData.map(row => row.map(v => normalizeCellValue(v)));
      this.square();
    } else if (Array.isArray(initialData) && initialData.length === 0) {
      this._data = [];
    } else {
      this._data = [['']];
    }
    this.undoStack = [];
    this.redoStack = [];
    this._transactionStack = [];
  }

  get width(): number {
    return this._data.length > 0 ? this._data[0].length : 0;
  }

  get height(): number {
    return this._data.length;
  }

  get isSaved(): boolean {
    return this._isSaved;
  }

  set isSaved(val: boolean) {
    this._isSaved = val;
  }

  get isLocked(): boolean { return this._isLocked; }
  set isLocked(val: boolean) { this._isLocked = val; }
  get lock(): boolean { return this._isLocked; }
  set lock(val: boolean) { this._isLocked = val; }

  get data(): string[][] {
    return this._data;
  }

  set data(newRows: string[][]) {
    if (this._isLocked) return;
    this._data = newRows && newRows.length > 0 ? newRows.map(r => [...r]) : [['']];
    this.square();
    this.markDirty();
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): string {
    if (y >= this.height || x >= this.width || y < 0 || x < 0) return '';
    const val = this._data[y]?.[x];
    return val !== undefined && val !== null ? String(val) : '';
  }

  set(x: number, y: number, value: CellValue, options?: FormatOptions): boolean {
    if (this._isLocked) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false;

    const oldVal = this.get(x, y);
    const formatted = formatCellValue(value, options);
    const willExpand = x >= this.width || y >= this.height;

    this.ensureCapacity(x, y);
    this._data[y][x] = formatted;
    if (willExpand || formatted !== oldVal) {
      this.markDirty();
    }
    return true;
  }

  edit(x: number, y: number, n: CellValue, options?: FormatOptions): void {
    if (this.lock) return;
    const o = this.get(x, y);

    const shouldAutoRound = options?.autoRound !== undefined
      ? options.autoRound
      : (this.autoRound || Dataframe.defaultAutoRound);
    const decimalPlaces = options?.decimalPlaces !== undefined ? options.decimalPlaces : this.decimalPlaces;

    const valStr = formatCellValue(n, { autoRound: shouldAutoRound, decimalPlaces });
    if (valStr === o) return;

    this.ensureCapacity(x, y);
    const timestamp = Date.now();
    this.create({
      type: 'EDIT_CELL',
      timestamp,
      payload: { x, y, oldValue: o, newValue: valStr }
    });
  }

  editRange(range: CellRange, value: CellValue, options?: FormatOptions): void {
    if (this.lock) return;
    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);

    const shouldAutoRound = options?.autoRound !== undefined
      ? options.autoRound
      : (this.autoRound || Dataframe.defaultAutoRound);
    const decimalPlaces = options?.decimalPlaces !== undefined ? options.decimalPlaces : this.decimalPlaces;
    const formatted = formatCellValue(value, { autoRound: shouldAutoRound, decimalPlaces });

    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];
    for (let y = ymin; y <= ymax; y++) {
      for (let x = xmin; x <= xmax; x++) {
        const oldVal = this.get(x, y);
        if (oldVal !== formatted) {
          changes.push({ x, y, oldValue: oldVal, newValue: formatted });
        }
      }
    }

    if (changes.length > 0) {
      this.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes, description: 'Range Edit' }
      });
    }
  }

  pasteMatrix(startX: number, startY: number, matrix: CellValue[][]): void {
    if (this.lock || !matrix || matrix.length === 0) return;
    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      const y = startY + r;
      for (let c = 0; c < row.length; c++) {
        const x = startX + c;
        const formatted = normalizeCellValue(row[c]);
        const oldVal = this.get(x, y);
        if (oldVal !== formatted) {
          changes.push({ x, y, oldValue: oldVal, newValue: formatted });
        }
      }
    }

    if (changes.length > 0) {
      this.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes, description: 'Paste Matrix' }
      });
    }
  }

  fillSeries(range: CellRange): void {
    if (this.lock) return;
    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);

    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];

    if (ymin === ymax) {
      const count = xmax - xmin + 1;
      const vals = expandSeries(
        this.get(xmin, ymin),
        this.get(xmin + 1, ymin),
        count,
        xmin + 1 <= xmax
      );
      for (let j = 0; j < count; j++) {
        const x = xmin + j;
        const oldVal = this.get(x, ymin);
        if (oldVal !== vals[j]) {
          changes.push({ x, y: ymin, oldValue: oldVal, newValue: vals[j] });
        }
      }
    } else {
      const count = ymax - ymin + 1;
      for (let i = xmin; i <= xmax; i++) {
        const vals = expandSeries(
          this.get(i, ymin),
          this.get(i, ymin + 1),
          count,
          ymin + 1 <= ymax
        );
        for (let j = 0; j < count; j++) {
          const y = ymin + j;
          const oldVal = this.get(i, y);
          if (oldVal !== vals[j]) {
            changes.push({ x: i, y, oldValue: oldVal, newValue: vals[j] });
          }
        }
      }
    }

    if (changes.length > 0) {
      this.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes, description: 'Expand Pattern' }
      });
    }
  }

  roundRange(range: CellRange, integer: boolean = true): void {
    if (this.lock) return;
    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);

    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];
    for (let y = ymin; y <= ymax; y++) {
      for (let x = xmin; x <= xmax; x++) {
        const oldVal = this.get(x, y);
        if (oldVal !== '' && isNumeric(oldVal)) {
          const rounded = integer ? String(Math.round(Number(oldVal))) : roundNumericString(oldVal, 2);
          if (rounded !== oldVal) {
            changes.push({ x, y, oldValue: oldVal, newValue: rounded });
          }
        }
      }
    }

    if (changes.length > 0) {
      this.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes, description: 'Round Values' }
      });
    }
  }

  getAll(callback: (value: string, x: number, y: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        callback(this.get(x, y), x, y);
      }
    }
  }

  getRow(y: number): string[] {
    if (y < 0 || y >= this.height) return [];
    return [...this._data[y]];
  }

  getCol(x: number): string[] {
    if (x < 0 || x >= this.width) return [];
    const col: string[] = new Array(this.height);
    for (let y = 0; y < this.height; y++) {
      col[y] = this._data[y][x];
    }
    return col;
  }

  insertRow(index: number, rowData?: CellValue[]): void {
    if (this.lock || index < 0 || index > this.height) return;
    const targetWidth = Math.max(1, this.width);
    let newRow: string[];
    if (rowData) {
      newRow = rowData.slice(0, targetWidth).map(v => normalizeCellValue(v));
      if (newRow.length < targetWidth) {
        const curLen = newRow.length;
        newRow.length = targetWidth;
        newRow.fill('', curLen);
      }
    } else {
      newRow = new Array<string>(targetWidth).fill('');
    }
    this.create({
      type: 'INSERT_ROW',
      timestamp: Date.now(),
      payload: { index, rowData: newRow }
    });
  }

  insertCol(index: number, colData?: CellValue[]): void {
    if (this.lock || index < 0 || index > this.width) return;
    const normalized = colData ? colData.map(v => normalizeCellValue(v)) : undefined;
    this.create({
      type: 'INSERT_COL',
      timestamp: Date.now(),
      payload: { index, colData: normalized }
    });
  }

  pushRow(rowData?: CellValue[]): void {
    this.insertRow(this.height, rowData);
  }

  pushCol(colData?: CellValue[]): void {
    this.insertCol(this.width, colData);
  }

  deleteRow(n: number): string[] {
    const res = this.deleteRows(n, 1);
    return res[0] ?? [];
  }

  deleteCol(n: number): string[] {
    const res = this.deleteCols(n, 1);
    return res[0] ?? [];
  }

  deleteRows(startIndex: number, count: number = 1): string[][] {
    if (this.lock || startIndex < 0 || startIndex >= this.height || count <= 0) return [];
    const actualCount = Math.min(count, this.height - startIndex);
    if (this.height - actualCount < 1) return [];

    const rowsData: string[][] = [];
    for (let i = 0; i < actualCount; i++) {
      rowsData.push([...this._data[startIndex + i]]);
    }

    this.create({
      type: 'BATCH_DELETE_ROWS',
      timestamp: Date.now(),
      payload: { index: startIndex, rowsData }
    });
    return rowsData;
  }

  deleteCols(startIndex: number, count: number = 1): string[][] {
    if (this.lock || startIndex < 0 || startIndex >= this.width || count <= 0) return [];
    const actualCount = Math.min(count, this.width - startIndex);
    if (this.width - actualCount < 1) return [];

    const colsData: string[][] = [];
    for (let c = 0; c < actualCount; c++) {
      const colIdx = startIndex + c;
      const col: string[] = new Array(this.height);
      for (let y = 0; y < this.height; y++) {
        col[y] = this._data[y][colIdx];
      }
      colsData.push(col);
    }

    this.create({
      type: 'BATCH_DELETE_COLS',
      timestamp: Date.now(),
      payload: { index: startIndex, colsData }
    });
    return colsData;
  }

  shiftRow(n: number, direction: 'up' | 'down' = 'down'): boolean {
    if (this.lock) return false;
    let idx = n;
    if (direction === 'up') {
      if (idx <= 0 || idx >= this.height) return false;
      idx = idx - 1;
    } else {
      if (idx < 0 || idx >= this.height) return false;
      if (idx + 1 === this.height) {
        this.insertRow(idx);
        return true;
      }
    }
    if (idx < 0 || idx + 1 >= this.height) return false;
    this.create({
      type: 'SHIFT_ROW',
      timestamp: Date.now(),
      payload: { index: idx }
    });
    return true;
  }

  shiftCol(n: number, direction: 'left' | 'right' = 'right'): boolean {
    if (this.lock) return false;
    let idx = n;
    if (direction === 'left') {
      if (idx <= 0 || idx >= this.width) return false;
      idx = idx - 1;
    } else {
      if (idx < 0 || idx >= this.width) return false;
      if (idx + 1 === this.width) {
        this.insertCol(idx);
        return true;
      }
    }
    if (idx < 0 || idx + 1 >= this.width) return false;
    this.create({
      type: 'SHIFT_COL',
      timestamp: Date.now(),
      payload: { index: idx }
    });
    return true;
  }

  shiftRows(startIndex: number, count: number = 1, direction: 'up' | 'down' = 'down'): boolean {
    if (this.lock || count <= 0) return false;
    if (direction === 'up') {
      if (startIndex <= 0 || startIndex >= this.height) return false;
    } else {
      if (startIndex < 0 || startIndex + count > this.height) return false;
    }
    if (count === 1) {
      return this.shiftRow(startIndex, direction);
    }
    let success = false;
    this.runTransaction(direction === 'up' ? 'Shift Rows Up' : 'Shift Rows Down', () => {
      if (direction === 'up') {
        for (let y = startIndex; y < startIndex + count; y++) {
          this.shiftRow(y, 'up');
        }
        success = true;
      } else {
        for (let y = startIndex + count - 1; y >= startIndex; y--) {
          this.shiftRow(y, 'down');
        }
        success = true;
      }
    });
    return success;
  }

  shiftCols(startIndex: number, count: number = 1, direction: 'left' | 'right' = 'right'): boolean {
    if (this.lock || count <= 0) return false;
    if (direction === 'left') {
      if (startIndex <= 0 || startIndex >= this.width) return false;
    } else {
      if (startIndex < 0 || startIndex + count > this.width) return false;
    }
    if (count === 1) {
      return this.shiftCol(startIndex, direction);
    }
    let success = false;
    this.runTransaction(direction === 'left' ? 'Shift Cols Left' : 'Shift Cols Right', () => {
      if (direction === 'left') {
        for (let x = startIndex; x < startIndex + count; x++) {
          this.shiftCol(x, 'left');
        }
        success = true;
      } else {
        for (let x = startIndex + count - 1; x >= startIndex; x--) {
          this.shiftCol(x, 'right');
        }
        success = true;
      }
    });
    return success;
  }


  order(new_order: number[]): void {
    if (this.lock) return;
    if (!Array.isArray(new_order) || new_order.length !== this.height) return;

    const computed_old = new Array(new_order.length);
    let isValid = true;
    const seen = new Set<number>();
    for (let i = 0; i < new_order.length; i++) {
      const idx = new_order[i];
      if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= this.height || seen.has(idx)) {
        isValid = false;
        break;
      }
      seen.add(idx);
      computed_old[idx] = i;
    }

    if (!isValid) return;

    const timestamp = Date.now();
    this.create({
      type: 'ORDER_ROWS',
      timestamp,
      payload: { newOrder: new_order, oldOrder: computed_old }
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

    const startIdx = hasHeader ? 1 : 0;
    const count = this.height;
    const numbers: { val: number; idx: number }[] = [];
    const strings: { val: string; idx: number }[] = [];
    const empty: number[] = [];

    for (let idx = startIdx; idx < count; idx++) {
      const val = this._data[idx][n];
      if (val === undefined || val === null || val.length === 0) {
        empty.push(idx);
      } else {
        const trimmed = val.trim();
        const num = Number(trimmed);
        if (trimmed !== '' && !Number.isNaN(num)) {
          numbers.push({ val: num, idx });
        } else {
          strings.push({ val, idx });
        }
      }
    }

    if (ascending) {
      numbers.sort((a, b) => a.val - b.val);
      strings.sort((a, b) => a.val.localeCompare(b.val));
    } else {
      numbers.sort((a, b) => b.val - a.val);
      strings.sort((a, b) => b.val.localeCompare(a.val));
    }

    const first = numbersFirst ? numbers : strings;
    const second = numbersFirst ? strings : numbers;

    const new_order: number[] = hasHeader ? [0] : [];
    for (let i = 0; i < first.length; i++) new_order.push(first[i].idx);
    for (let i = 0; i < second.length; i++) new_order.push(second[i].idx);
    for (let i = 0; i < empty.length; i++) new_order.push(empty[i]);

    this.order(new_order);
    return new_order;
  }

  static transpose2D<U>(grid: U[][]): U[][] {
    if (!grid || grid.length === 0 || grid[0].length === 0) return [[]];
    const height = grid.length;
    const width = grid[0].length;
    const result: U[][] = [];
    for (let x = 0; x < width; x++) {
      const row: U[] = [];
      for (let y = 0; y < height; y++) {
        row.push(grid[y][x]);
      }
      result.push(row);
    }
    return result;
  }

  transpose(range?: CellRange): void {
    if (this.lock) return;
    if (!range) {
      this.create({
        type: 'TRANSPOSE',
        timestamp: Date.now()
      });
      return;
    }

    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);
    const ordered = { xmin, xmax, ymin, ymax };
    const sliceData = this.slice(ordered);
    const transposedSlice = Dataframe.transpose2D(sliceData);

    const changesMap = new Map<string, { x: number; y: number; oldValue: string; newValue: string }>();

    for (let y = ordered.ymin; y <= ordered.ymax; y++) {
      for (let x = ordered.xmin; x <= ordered.xmax; x++) {
        changesMap.set(`${x}:${y}`, {
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
        const key = `${tx}:${ty}`;
        const existing = changesMap.get(key);
        if (existing) {
          existing.newValue = transposedSlice[r][c];
        } else {
          changesMap.set(key, {
            x: tx,
            y: ty,
            oldValue: this.get(tx, ty),
            newValue: transposedSlice[r][c]
          });
        }
      }
    }

    this.create({
      type: 'RANGE_EDIT',
      timestamp: Date.now(),
      payload: { changes: Array.from(changesMap.values()), description: 'Transpose Range' }
    });
  }

  trimAll(): void {
    if (this.lock) return;
    this.runTransaction('Trim Empty Rows/Cols', () => {
      for (let x = this.width - 1; x >= 0; x--) {
        if (this.width <= 1) break;
        let emptyCol = true;
        for (let y = 0; y < this.height; y++) {
          const val = this._data[y]?.[x];
          if (val && val.trim().length > 0) {
            emptyCol = false;
            break;
          }
        }
        if (emptyCol) this.deleteCol(x);
      }
      for (let y = this.height - 1; y >= 0; y--) {
        if (this.height <= 1) break;
        let emptyRow = true;
        for (let x = 0; x < this.width; x++) {
          const val = this._data[y]?.[x];
          if (val && val.trim().length > 0) {
            emptyRow = false;
            break;
          }
        }
        if (emptyRow) this.deleteRow(y);
      }
    });
  }

  executeCommand(command: CommandDescriptor, isRevert = false): void {
    if (!command || !command.type) return;
    const payload = command.payload || {};
    switch (command.type) {
      case 'EDIT_CELL': {
        const { x, y, oldValue, newValue } = payload;
        const val = isRevert ? oldValue : newValue;
        this.ensureCapacity(x, y);
        this._data[y][x] = normalizeCellValue(val);
        this.markDirty();
        break;
      }
      case 'INSERT_ROW': {
        const { index, rowData } = payload;
        if (isRevert) {
          if (this.height > 1 && index >= 0 && index < this.height) {
            this._data.splice(index, 1);
          }
        } else {
          const targetWidth = Math.max(1, this.width);
          let row: string[];
          if (rowData) {
            row = rowData.slice(0, targetWidth);
            if (row.length < targetWidth) {
              row.length = targetWidth;
              row.fill('', rowData.length);
            }
          } else {
            row = new Array<string>(targetWidth).fill('');
          }
          this._data.splice(index, 0, row);
        }
        this.markDirty();
        break;
      }
      case 'DELETE_ROW': {
        const { index, rowData } = payload;
        if (isRevert) {
          this._data.splice(index, 0, [...rowData]);
        } else {
          if (this.height > 1 && index >= 0 && index < this.height) {
            this._data.splice(index, 1);
          }
        }
        this.markDirty();
        break;
      }
      case 'BATCH_DELETE_ROWS': {
        const { index, rowsData } = payload;
        if (isRevert) {
          for (let i = 0; i < rowsData.length; i++) {
            this._data.splice(index + i, 0, [...rowsData[i]]);
          }
        } else {
          this._data.splice(index, rowsData.length);
        }
        this.markDirty();
        break;
      }
      case 'INSERT_COL': {
        const { index, colData } = payload;
        if (isRevert) {
          if (this.width > 1 && index >= 0 && index < this.width) {
            for (let y = 0; y < this.height; y++) {
              this._data[y].splice(index, 1);
            }
          }
        } else {
          const isAppend = (index === this.width);
          for (let y = 0; y < this.height; y++) {
            const val = (colData && y < colData.length) ? colData[y] : '';
            if (isAppend) {
              this._data[y].push(val);
            } else {
              this._data[y].splice(index, 0, val);
            }
          }
        }
        this.markDirty();
        break;
      }
      case 'DELETE_COL': {
        const { index, colData } = payload;
        if (isRevert) {
          for (let y = 0; y < this.height; y++) {
            const val = (colData && y < colData.length) ? colData[y] : '';
            this._data[y].splice(index, 0, val);
          }
        } else {
          if (this.width > 1 && index >= 0 && index < this.width) {
            for (let y = 0; y < this.height; y++) {
              this._data[y].splice(index, 1);
            }
          }
        }
        this.markDirty();
        break;
      }
      case 'BATCH_DELETE_COLS': {
        const { index, colsData } = payload;
        const count = colsData.length;
        if (isRevert) {
          for (let y = 0; y < this.height; y++) {
            const items: string[] = [];
            for (let c = 0; c < count; c++) {
              items.push(colsData[c][y] ?? '');
            }
            this._data[y].splice(index, 0, ...items);
          }
        } else {
          for (let y = 0; y < this.height; y++) {
            this._data[y].splice(index, count);
          }
        }
        this.markDirty();
        break;
      }
      case 'SHIFT_ROW': {
        const index = payload.index;
        if (index >= 0 && index < this.height - 1) {
          const temp = this._data[index];
          this._data[index] = this._data[index + 1];
          this._data[index + 1] = temp;
          this.markDirty();
        }
        break;
      }
      case 'SHIFT_COL': {
        const index = payload.index;
        if (index >= 0 && index < this.width - 1) {
          for (let y = 0; y < this.height; y++) {
            const temp = this._data[y][index];
            this._data[y][index] = this._data[y][index + 1];
            this._data[y][index + 1] = temp;
          }
          this.markDirty();
        }
        break;
      }
      case 'ORDER_ROWS': {
        const { newOrder, oldOrder } = payload;
        const order = isRevert ? oldOrder : newOrder;
        if (Array.isArray(order) && order.length === this.height) {
          const reordered: string[][] = new Array(this.height);
          for (let i = 0; i < this.height; i++) {
            reordered[i] = this._data[order[i]];
          }
          this._data = reordered;
          this.markDirty();
        }
        break;
      }
      case 'RANGE_EDIT': {
        const { changes } = payload;
        if (Array.isArray(changes)) {
          if (isRevert) {
            for (let i = changes.length - 1; i >= 0; i--) {
              const edit = changes[i];
              this.ensureCapacity(edit.x, edit.y);
              this._data[edit.y][edit.x] = normalizeCellValue(edit.oldValue);
            }
          } else {
            for (let i = 0; i < changes.length; i++) {
              const edit = changes[i];
              this.ensureCapacity(edit.x, edit.y);
              this._data[edit.y][edit.x] = normalizeCellValue(edit.newValue);
            }
          }
          this.markDirty();
        }
        break;
      }
      case 'TRANSPOSE': {
        this._data = Dataframe.transpose2D(this._data);
        this.square();
        this.markDirty();
        break;
      }
      case 'TRANSACTION':
      case 'COMPOSITE': {
        const { commands } = payload;
        if (Array.isArray(commands)) {
          if (isRevert) {
            for (let i = commands.length - 1; i >= 0; i--) {
              this.executeCommand(commands[i], true);
            }
          } else {
            for (let i = 0; i < commands.length; i++) {
              this.executeCommand(commands[i], false);
            }
          }
        }
        break;
      }
      default:
        console.warn(`Unknown command type: ${command.type}`);
    }
  }

  get isInTransaction(): boolean {
    return this._transactionStack.length > 0;
  }

  beginTransaction(description?: string): void {
    this._transactionStack.push({
      description,
      timestamp: Date.now(),
      commands: []
    });
  }

  commitTransaction(): void {
    if (this._transactionStack.length === 0) return;
    const tx = this._transactionStack.pop()!;
    if (tx.commands.length === 0) return;

    if (this._transactionStack.length > 0) {
      this._transactionStack[this._transactionStack.length - 1].commands.push(...tx.commands);
      return;
    }

    let committedCommand: CommandDescriptor;
    const allEditCells = tx.commands.every(c => c.type === 'EDIT_CELL');
    if (allEditCells) {
      const changes = tx.commands.map(c => ({
        x: c.payload.x,
        y: c.payload.y,
        oldValue: c.payload.oldValue,
        newValue: c.payload.newValue
      }));
      committedCommand = {
        type: 'RANGE_EDIT',
        timestamp: tx.timestamp,
        payload: { changes, description: tx.description }
      };
    } else {
      committedCommand = {
        type: 'TRANSACTION',
        timestamp: tx.timestamp,
        payload: { description: tx.description, commands: tx.commands }
      };
    }

    this.undoStack.push(committedCommand);
    this.redoStack = [];
    this.isSaved = false;
  }

  rollbackTransaction(): void {
    if (this._transactionStack.length === 0) return;
    const tx = this._transactionStack.pop()!;
    for (let i = tx.commands.length - 1; i >= 0; i--) {
      this.executeCommand(tx.commands[i], true);
    }
  }

  runTransaction<T>(description: string, fn: () => T): T {
    this.beginTransaction(description);
    try {
      const result = fn();
      this.commitTransaction();
      return result;
    } catch (err) {
      this.rollbackTransaction();
      throw err;
    }
  }

  create(cmd: CommandDescriptor): void {
    if (this.lock || !cmd || typeof cmd !== 'object' || !cmd.type) return;
    if (cmd.timestamp === undefined) {
      cmd.timestamp = Date.now();
    }

    this.executeCommand(cmd, false);
    if (this._transactionStack.length > 0) {
      this._transactionStack[this._transactionStack.length - 1].commands.push(cmd);
    } else {
      this.undoStack.push(cmd);
      this.redoStack = [];
    }
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

  appendRows(rows: CellValue[][], bypassLock = false): void {
    if ((this.lock && !bypassLock) || !rows || rows.length === 0) return;
    let targetWidth = this.width;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length > targetWidth) targetWidth = rows[i].length;
    }
    if (targetWidth > this.width) {
      for (let i = 0; i < this._data.length; i++) {
        const curLen = this._data[i].length;
        if (curLen < targetWidth) {
          this._data[i].length = targetWidth;
          this._data[i].fill('', curLen);
        }
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const copy = rows[i].slice(0, targetWidth).map(v => normalizeCellValue(v));
      const curLen = copy.length;
      if (curLen < targetWidth) {
        copy.length = targetWidth;
        copy.fill('', curLen);
      }
      this._data.push(copy);
    }
    if (!this.lock) {
      this.markDirty();
    }
  }

  slice(range: CellRange): string[][] {
    const xmin = Math.min(range.xmin, range.xmax);
    const xmax = Math.max(range.xmin, range.xmax);
    const ymin = Math.min(range.ymin, range.ymax);
    const ymax = Math.max(range.ymin, range.ymax);
    const result: string[][] = [];
    for (let y = ymin; y <= ymax; y++) {
      const row: string[] = [];
      for (let x = xmin; x <= xmax; x++) {
        row.push(this.get(x, y));
      }
      result.push(row);
    }
    return result;
  }

  square(): void {
    if (this.lock || this._data.length === 0) return;
    let maxWidth = 1;
    for (let i = 0; i < this._data.length; i++) {
      if (this._data[i].length > maxWidth) {
        maxWidth = this._data[i].length;
      }
    }
    for (let i = 0; i < this._data.length; i++) {
      const curLen = this._data[i].length;
      if (curLen < maxWidth) {
        this._data[i].length = maxWidth;
        this._data[i].fill('', curLen);
      }
    }
  }

  ensureCapacity(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return;
    if (x >= this.width) {
      const newWidth = x + 1;
      for (let r = 0; r < this._data.length; r++) {
        const curLen = this._data[r].length;
        if (curLen < newWidth) {
          this._data[r].length = newWidth;
          this._data[r].fill('', curLen);
        }
      }
    }
    if (y >= this.height) {
      const curWidth = Math.max(1, this.width);
      const count = y + 1 - this.height;
      for (let i = 0; i < count; i++) {
        this._data.push(new Array(curWidth).fill(''));
      }
    }
  }

  clone(): Dataframe {
    const clonedData = this._data.map(row => [...row]);
    const cloned = new Dataframe(clonedData);
    cloned.isLocked = this._isLocked;
    cloned.markSaved();
    return cloned;
  }

  /**
   * Performs high-speed linear scan over target column to find matching row indices.
   * Returns matching row index array without mutating dataframe state.
   * @param colIndex - 0-based column index to search.
   * @param query - Substring to search for.
   * @param caseSensitive - Whether search should be case sensitive (default false).
   * @param skipHeader - If true, skips row 0 (default false).
   * @returns Array of 0-based row indices that contain the query substring.
   */
  filterColumn(colIndex: number, query: string, caseSensitive: boolean = false, skipHeader: boolean = false): number[] {
    if (colIndex < 0 || colIndex >= this.width) return [];
    const totalRows = this.height;
    const startRow = skipHeader ? 1 : 0;
    if (startRow >= totalRows) return [];

    if (query === '' || query === null || query === undefined) {
      const all: number[] = [];
      for (let r = startRow; r < totalRows; r++) all.push(r);
      return all;
    }

    const needle = caseSensitive ? String(query) : String(query).toLowerCase();
    const matches: number[] = [];

    for (let r = startRow; r < totalRows; r++) {
      const cellVal = this._data[r]?.[colIndex];
      if (cellVal === undefined || cellVal === null) continue;
      const strVal = caseSensitive ? String(cellVal) : String(cellVal).toLowerCase();
      if (strVal.includes(needle)) {
        matches.push(r);
      }
    }

    return matches;
  }

  markSaved(): void {
    this._isSaved = true;
  }

  markDirty(): void {
    this._isSaved = false;
  }
}

function getCmdTimestamp(cmd?: CommandDescriptor): number {
  return cmd?.timestamp ?? 0;
}

