/**
 * @file core/model/Matrix.ts
 * 2D memory store with fast indexing and rectangular invariant.
 * ZERO browser/DOM imports.
 */

import { CellRange } from './Range.js';

export class Matrix<T = string> {
  private _rows: T[][];
  private _defaultValue: T;

  /**
   * Constructs a Matrix.
   * @param initialRows 2D array of rows or dimensions. Defaults to [[defaultValue]].
   * @param defaultValue Default value used for padding and empty cells.
   */
  constructor(initialRows?: T[][], defaultValue: T = ('' as unknown as T)) {
    this._defaultValue = defaultValue;
    if (initialRows && initialRows.length > 0) {
      // Shallow-copy outer array and row arrays to decouple input references
      this._rows = initialRows.map(row => [...row]);
    } else {
      this._rows = [[defaultValue]];
    }
    this.square();
  }

  /**
   * Creates a Matrix with fixed dimensions initialized to defaultValue.
   */
  static fromDimensions<T>(width: number, height: number, defaultValue: T): Matrix<T> {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const rows: T[][] = new Array(h);
    for (let y = 0; y < h; y++) {
      rows[y] = new Array(w).fill(defaultValue);
    }
    return new Matrix<T>(rows, defaultValue);
  }

  /**
   * Total column count.
   */
  get width(): number {
    return this._rows.length > 0 ? this._rows[0].length : 0;
  }

  /**
   * Total row count.
   */
  get height(): number {
    return this._rows.length;
  }

  /**
   * Returns direct reference to raw rows array.
   * Enables zero-overhead compatibility with legacy code and tests.
   */
  get rawRows(): T[][] {
    return this._rows;
  }

  /**
   * Checks if coordinate (x, y) is within current matrix dimensions.
   */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Retrieves value at (x, y). Returns defaultValue if out of bounds.
   */
  get(x: number, y: number): T {
    if (!this.inBounds(x, y)) {
      return this._defaultValue;
    }
    return this._rows[y][x];
  }

  /**
   * Sets value at (x, y). Returns false if out of bounds without mutating.
   */
  set(x: number, y: number, value: T): boolean {
    if (!this.inBounds(x, y)) {
      return false;
    }
    this._rows[y][x] = value;
    return true;
  }

  /**
   * Enforces rectangular invariant: pads all rows with defaultValue to maximum row length.
   */
  square(): void {
    let maxWidth = 1;
    for (let i = 0; i < this._rows.length; i++) {
      if (this._rows[i].length > maxWidth) {
        maxWidth = this._rows[i].length;
      }
    }
    for (let i = 0; i < this._rows.length; i++) {
      while (this._rows[i].length < maxWidth) {
        this._rows[i].push(this._defaultValue);
      }
    }
  }

  /**
   * Expands matrix dimensions if target (x, y) exceeds current bounds.
   */
  ensureCapacity(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      return;
    }
    while (this.width <= x) {
      this.pushCol();
    }
    while (this.height <= y) {
      this.pushRow();
    }
  }

  /**
   * Retrieves a copy of row at index y.
   */
  getRow(y: number): T[] | undefined {
    if (y < 0 || y >= this.height) return undefined;
    return [...this._rows[y]];
  }

  /**
   * Retrieves a copy of column at index x.
   */
  getCol(x: number): T[] | undefined {
    if (x < 0 || x >= this.width) return undefined;
    const col: T[] = new Array(this.height);
    for (let y = 0; y < this.height; y++) {
      col[y] = this._rows[y][x];
    }
    return col;
  }

  /**
   * Inserts an empty or pre-populated row at index.
   */
  insertRow(index: number, rowData?: T[]): void {
    if (index < 0 || index > this.height) return;
    const targetWidth = this.width;
    const newRow = rowData ? [...rowData] : [];
    while (newRow.length < targetWidth) {
      newRow.push(this._defaultValue);
    }
    if (newRow.length > targetWidth) {
      newRow.length = targetWidth;
    }
    this._rows.splice(index, 0, newRow);
  }

  /**
   * Deletes row at index and returns deleted elements.
   * Enforces minimum 1x1 boundary constraint: will NOT delete if height < 2.
   */
  deleteRow(index: number): T[] | undefined {
    if (this.height < 2 || index < 0 || index >= this.height) {
      return undefined;
    }
    const removed = this._rows.splice(index, 1);
    return removed[0];
  }

  /**
   * Appends a row to the bottom of the matrix.
   */
  pushRow(rowData?: T[]): void {
    this.insertRow(this.height, rowData);
  }

  /**
   * Shifts row at index down or up by swapping with adjacent row.
   * If shifting down at the bottom boundary (index + 1 === height), inserts an empty row.
   */
  shiftRow(index: number, direction: 'up' | 'down' = 'down'): boolean {
    if (direction === 'down') {
      if (index < 0 || index >= this.height) return false;
      if (index + 1 === this.height) {
        this.insertRow(index);
        return true;
      }
      const temp = this._rows[index];
      this._rows[index] = this._rows[index + 1];
      this._rows[index + 1] = temp;
      return true;
    } else {
      if (index <= 0 || index >= this.height) return false;
      const temp = this._rows[index];
      this._rows[index] = this._rows[index - 1];
      this._rows[index - 1] = temp;
      return true;
    }
  }

  /**
   * Reorders rows according to order index permutation.
   */
  orderRows(order: number[]): void {
    if (!Array.isArray(order) || order.length !== this.height) return;
    const newRows: T[][] = new Array(this.height);
    for (let i = 0; i < this.height; i++) {
      const srcIdx = order[i];
      if (typeof srcIdx !== 'number' || !Number.isInteger(srcIdx) || srcIdx < 0 || srcIdx >= this.height) {
        return; // Malformed permutation
      }
      newRows[i] = this._rows[srcIdx];
    }
    this._rows = newRows;
  }

  /**
   * Inserts an empty or pre-populated column at index.
   */
  insertCol(index: number, colData?: T[]): void {
    if (index < 0 || index > this.width) return;
    for (let y = 0; y < this.height; y++) {
      const val = (colData && y < colData.length) ? colData[y] : this._defaultValue;
      this._rows[y].splice(index, 0, val);
    }
  }

  /**
   * Deletes column at index and returns deleted elements.
   * Enforces minimum 1x1 boundary constraint: will NOT delete if width < 2.
   */
  deleteCol(index: number): T[] | undefined {
    if (this.width < 2 || index < 0 || index >= this.width) {
      return undefined;
    }
    const removed: T[] = new Array(this.height);
    for (let y = 0; y < this.height; y++) {
      removed[y] = this._rows[y].splice(index, 1)[0];
    }
    return removed;
  }

  /**
   * Appends an empty column to the right of the matrix.
   */
  pushCol(colData?: T[]): void {
    this.insertCol(this.width, colData);
  }

  /**
   * Shifts column at index right or left by swapping with adjacent column.
   * If shifting right at right boundary (index + 1 === width), inserts an empty column.
   */
  shiftCol(index: number, direction: 'left' | 'right' = 'right'): boolean {
    if (direction === 'right') {
      if (index < 0 || index >= this.width) return false;
      if (index + 1 === this.width) {
        this.insertCol(index);
        return true;
      }
      for (let y = 0; y < this.height; y++) {
        const temp = this._rows[y][index];
        this._rows[y][index] = this._rows[y][index + 1];
        this._rows[y][index + 1] = temp;
      }
      return true;
    } else {
      if (index <= 0 || index >= this.width) return false;
      for (let y = 0; y < this.height; y++) {
        const temp = this._rows[y][index];
        this._rows[y][index] = this._rows[y][index - 1];
        this._rows[y][index - 1] = temp;
      }
      return true;
    }
  }

  /**
   * Appends multiple row arrays, expanding width if necessary.
   */
  appendRows(rows: T[][]): void {
    if (!rows || rows.length === 0) return;
    let targetWidth = this.width;
    for (const r of rows) {
      if (r.length > targetWidth) targetWidth = r.length;
    }
    if (targetWidth > this.width) {
      for (const row of this._rows) {
        while (row.length < targetWidth) row.push(this._defaultValue);
      }
    }
    for (const r of rows) {
      const copy = [...r];
      while (copy.length < targetWidth) copy.push(this._defaultValue);
      this._rows.push(copy);
    }
  }

  /**
   * Slices sub-grid according to CellRange.
   */
  slice(range: CellRange): T[][] {
    const result: T[][] = [];
    for (let y = range.ymin; y <= range.ymax; y++) {
      const row: T[] = [];
      for (let x = range.xmin; x <= range.xmax; x++) {
        row.push(this.get(x, y));
      }
      result.push(row);
    }
    return result;
  }

  /**
   * Removes all trailing empty columns and rows, preserving minimum 1x1 size.
   */
  trimAll(isEmptyFn: (val: T) => boolean = (v => v === this._defaultValue || v === '')): void {
    // Trim trailing empty columns
    for (let x = this.width - 1; x >= 0; x--) {
      if (this.width <= 1) break;
      let emptyCol = true;
      for (let y = 0; y < this.height; y++) {
        if (!isEmptyFn(this._rows[y][x])) {
          emptyCol = false;
          break;
        }
      }
      if (emptyCol) {
        this.deleteCol(x);
      } else {
        break;
      }
    }

    // Trim trailing empty rows
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.height <= 1) break;
      let emptyRow = true;
      for (let x = 0; x < this.width; x++) {
        if (!isEmptyFn(this._rows[y][x])) {
          emptyRow = false;
          break;
        }
      }
      if (emptyRow) {
        this.deleteRow(y);
      } else {
        break;
      }
    }
  }

  /**
   * Clones matrix into a new distinct instance.
   */
  clone(): Matrix<T> {
    const clonedRows = this._rows.map(row => [...row]);
    return new Matrix<T>(clonedRows, this._defaultValue);
  }

  /**
   * Exports data to a standard 2D array copy.
   */
  toArray(): T[][] {
    return this._rows.map(row => [...row]);
  }

  /**
   * Returns a new Matrix containing the transposed elements of this matrix,
   * where rows become columns and columns become rows.
   */
  transpose(): Matrix<T> {
    const newHeight = this.width;
    const newWidth = this.height;
    if (newHeight === 0 || newWidth === 0) {
      return new Matrix<T>([[]], this._defaultValue);
    }
    const newRows: T[][] = [];
    for (let x = 0; x < this.width; x++) {
      const row: T[] = [];
      for (let y = 0; y < this.height; y++) {
        row.push(this.get(x, y));
      }
      newRows.push(row);
    }
    return new Matrix<T>(newRows, this._defaultValue);
  }

  /**
   * Transposes a rectangular 2D slice of values.
   */
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
}
