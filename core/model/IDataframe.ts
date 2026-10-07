/**
 * @file core/model/IDataframe.ts
 * Authoritative interface contract for pure headless tabular data store.
 * ZERO browser/DOM imports.
 */

import { CellValue, FormatOptions } from './Cell.js';
import { CellRange } from './Range.js';

export interface SortOptions {
  ascending?: boolean;
  hasHeader?: boolean;
  numbersFirst?: boolean;
}

export interface IDataframe {
  /**
   * Total column count.
   */
  readonly width: number;

  /**
   * Total row count.
   */
  readonly height: number;

  /**
   * True if in-memory data matches authoritative saved state.
   */
  isSaved: boolean;

  /**
   * True if modifications are locked/forbidden (e.g. view-only mode).
   */
  isLocked: boolean;

  /**
   * Legacy alias for isLocked.
   */
  lock?: boolean;

  /**
   * Direct 2D backing array.
   */
  data?: string[][];

  /**
   * Retrieves string value at (x, y). Returns empty string if out of bounds.
   */
  get(x: number, y: number): string;

  /**
   * Sets value at (x, y). Auto-expands matrix bounds if coordinates exceed current dimensions.
   */
  set(x: number, y: number, value: CellValue, options?: FormatOptions): boolean;

  /**
   * Edits value at (x, y), pushing a mutation to undo stack.
   */
  edit(x: number, y: number, value: CellValue, options?: FormatOptions): void;

  /**
   * Iterates through every cell in the matrix in row-major order.
   */
  getAll(callback: (value: string, x: number, y: number) => void): void;

  /**
   * Retrieves entire row as array of string values.
   */
  getRow(y: number): string[];

  /**
   * Retrieves entire column as array of string values.
   */
  getCol(x: number): string[];

  // --- Row Operations ---

  insertRow(index: number, rowData?: CellValue[]): void;
  deleteRow(index: number): CellValue[];
  pushRow(rowData?: CellValue[]): void;
  shiftRow(index: number, direction?: 'up' | 'down'): void;
  orderRows(order: number[]): void;
  order?(order: number[]): void;
  sort(colIndex: number, options?: SortOptions): number[];
  transpose?(range?: CellRange): void;

  // --- Column Operations ---

  insertCol(index: number, colData?: CellValue[]): void;
  deleteCol(index: number): CellValue[];
  pushCol(colData?: CellValue[]): void;
  shiftCol(index: number, direction?: 'left' | 'right'): void;

  // --- Bulk & Structure Operations ---

  appendRows(rows: CellValue[][]): void;
  trimAll(): void;
  slice(range: CellRange): string[][];
  square(): void;

  // --- History & Undo/Redo ---

  undo?(): void;
  redo?(): void;
  undoStack?: readonly any[];
  redoStack?: readonly any[];
  create?(cmd: any, u?: any): void;

  // --- Lifecycle & Dirty State ---

  clone(): IDataframe;
  markSaved(): void;
  markDirty(): void;
}
