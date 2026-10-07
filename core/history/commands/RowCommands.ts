/**
 * @file core/history/commands/RowCommands.ts
 * Row mutations: InsertRow, DeleteRow, ShiftRow, PushRow, OrderRows.
 * ZERO browser/DOM imports.
 */

import { CellValue } from '../../model/Cell.js';
import { IDataframe } from '../../model/IDataframe.js';
import { BaseCommand } from '../Command.js';

export class InsertRowCommand extends BaseCommand {
  readonly index: number;
  readonly rowData?: CellValue[];

  constructor(index: number, rowData?: CellValue[], description?: string, timestamp?: number) {
    super('INSERT_ROW', description, timestamp);
    this.index = index;
    this.rowData = rowData ? [...rowData] : undefined;
  }

  execute(dataframe: IDataframe): void {
    dataframe.insertRow(this.index, this.rowData);
  }

  undo(dataframe: IDataframe): void {
    dataframe.deleteRow(this.index);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { index: this.index, rowData: this.rowData }
    };
  }
}

export class DeleteRowCommand extends BaseCommand {
  readonly index: number;
  private _rowData: CellValue[];
  private _didDelete: boolean = false;

  constructor(index: number, rowData?: CellValue[], description?: string, timestamp?: number) {
    super('DELETE_ROW', description, timestamp);
    this.index = index;
    this._rowData = rowData ? [...rowData] : [];
  }

  get rowData(): readonly CellValue[] {
    return this._rowData;
  }

  execute(dataframe: IDataframe): void {
    if (this._rowData.length === 0) {
      this._rowData = dataframe.getRow(this.index);
    }
    const deleted = dataframe.deleteRow(this.index);
    this._didDelete = Array.isArray(deleted) && deleted.length > 0;
  }

  undo(dataframe: IDataframe): void {
    if (!this._didDelete) return;
    dataframe.insertRow(this.index, this._rowData);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { index: this.index, rowData: this._rowData, didDelete: this._didDelete }
    };
  }
}

export class ShiftRowCommand extends BaseCommand {
  readonly index: number;
  readonly direction: 'up' | 'down';
  private _didAppendBoundary: boolean = false;

  constructor(index: number, direction: 'up' | 'down' = 'down', description?: string, timestamp?: number) {
    super('SHIFT_ROW', description, timestamp);
    this.index = index;
    this.direction = direction;
  }

  execute(dataframe: IDataframe): void {
    if (this.direction === 'down' && this.index + 1 === dataframe.height) {
      this._didAppendBoundary = true;
    } else {
      this._didAppendBoundary = false;
    }
    dataframe.shiftRow(this.index, this.direction);
  }

  undo(dataframe: IDataframe): void {
    if (this._didAppendBoundary) {
      dataframe.deleteRow(this.index);
    } else {
      const reverseDir = this.direction === 'down' ? 'up' : 'down';
      const targetIdx = this.direction === 'down' ? this.index + 1 : this.index - 1;
      dataframe.shiftRow(targetIdx, reverseDir);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { index: this.index, direction: this.direction, didAppendBoundary: this._didAppendBoundary }
    };
  }
}

export class PushRowCommand extends BaseCommand {
  readonly rowData?: CellValue[];

  constructor(rowData?: CellValue[], description?: string, timestamp?: number) {
    super('PUSH_ROW', description, timestamp);
    this.rowData = rowData ? [...rowData] : undefined;
  }

  execute(dataframe: IDataframe): void {
    dataframe.pushRow(this.rowData);
  }

  undo(dataframe: IDataframe): void {
    dataframe.deleteRow(dataframe.height - 1);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: {}
    };
  }
}

export class OrderRowsCommand extends BaseCommand {
  readonly newOrder: readonly number[];
  readonly oldOrder: readonly number[];

  constructor(newOrder: number[], oldOrder?: number[], description?: string, timestamp?: number) {
    super('ORDER_ROWS', description, timestamp);
    this.newOrder = [...newOrder];
    if (oldOrder) {
      this.oldOrder = [...oldOrder];
    } else {
      const computedOld = new Array(newOrder.length);
      let isValidPermutation = true;
      const seen = new Set<number>();
      for (let i = 0; i < newOrder.length; i++) {
        const target = newOrder[i];
        if (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target >= newOrder.length || seen.has(target)) {
          isValidPermutation = false;
          break;
        }
        seen.add(target);
        computedOld[target] = i;
      }
      if (!isValidPermutation) {
        this.oldOrder = Array.from({ length: newOrder.length }, (_, i) => i);
      } else {
        this.oldOrder = computedOld;
      }
    }
  }

  execute(dataframe: IDataframe): void {
    dataframe.orderRows([...this.newOrder]);
  }

  undo(dataframe: IDataframe): void {
    dataframe.orderRows([...this.oldOrder]);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { newOrder: [...this.newOrder], oldOrder: [...this.oldOrder] }
    };
  }
}
