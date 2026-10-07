/**
 * @file core/history/commands/ColCommands.ts
 * Column mutations: InsertCol, DeleteCol, ShiftCol, PushCol.
 * ZERO browser/DOM imports.
 */

import { CellValue } from '../../model/Cell.js';
import { IDataframe } from '../../model/IDataframe.js';
import { BaseCommand } from '../Command.js';

export class InsertColCommand extends BaseCommand {
  readonly index: number;
  readonly colData?: CellValue[];

  constructor(index: number, colData?: CellValue[], description?: string, timestamp?: number) {
    super('INSERT_COL', description, timestamp);
    this.index = index;
    this.colData = colData ? [...colData] : undefined;
  }

  execute(dataframe: IDataframe): void {
    dataframe.insertCol(this.index, this.colData);
  }

  undo(dataframe: IDataframe): void {
    dataframe.deleteCol(this.index);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { index: this.index, colData: this.colData }
    };
  }
}

export class DeleteColCommand extends BaseCommand {
  readonly index: number;
  private _colData: CellValue[];
  private _didDelete: boolean = false;

  constructor(index: number, colData?: CellValue[], description?: string, timestamp?: number) {
    super('DELETE_COL', description, timestamp);
    this.index = index;
    this._colData = colData ? [...colData] : [];
  }

  get colData(): readonly CellValue[] {
    return this._colData;
  }

  execute(dataframe: IDataframe): void {
    if (this._colData.length === 0) {
      this._colData = dataframe.getCol(this.index);
    }
    const deleted = dataframe.deleteCol(this.index);
    this._didDelete = Array.isArray(deleted) && deleted.length > 0;
  }

  undo(dataframe: IDataframe): void {
    if (!this._didDelete) return;
    dataframe.insertCol(this.index, this._colData);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: { index: this.index, colData: this._colData, didDelete: this._didDelete }
    };
  }
}

export class ShiftColCommand extends BaseCommand {
  readonly index: number;
  readonly direction: 'left' | 'right';
  private _didAppendBoundary: boolean = false;

  constructor(index: number, direction: 'left' | 'right' = 'right', description?: string, timestamp?: number) {
    super('SHIFT_COL', description, timestamp);
    this.index = index;
    this.direction = direction;
  }

  execute(dataframe: IDataframe): void {
    if (this.direction === 'right' && this.index + 1 === dataframe.width) {
      this._didAppendBoundary = true;
    } else {
      this._didAppendBoundary = false;
    }
    dataframe.shiftCol(this.index, this.direction);
  }

  undo(dataframe: IDataframe): void {
    if (this._didAppendBoundary) {
      dataframe.deleteCol(this.index);
    } else {
      const reverseDir = this.direction === 'right' ? 'left' : 'right';
      const targetIdx = this.direction === 'right' ? this.index + 1 : this.index - 1;
      dataframe.shiftCol(targetIdx, reverseDir);
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

export class PushColCommand extends BaseCommand {
  readonly colData?: CellValue[];

  constructor(colData?: CellValue[], description?: string, timestamp?: number) {
    super('PUSH_COL', description, timestamp);
    this.colData = colData ? [...colData] : undefined;
  }

  execute(dataframe: IDataframe): void {
    dataframe.pushCol(this.colData);
  }

  undo(dataframe: IDataframe): void {
    dataframe.deleteCol(dataframe.width - 1);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: {}
    };
  }
}
