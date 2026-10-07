/**
 * @file core/history/commands/RangeEditCommand.ts
 * Multi-cell batch modification with composite delta array.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../../model/IDataframe.js';
import { BaseCommand } from '../Command.js';

export interface CellChange {
  readonly x: number;
  readonly y: number;
  readonly oldValue: string;
  readonly newValue: string;
}

export class RangeEditCommand extends BaseCommand {
  readonly changes: readonly CellChange[];

  constructor(
    changes: readonly CellChange[],
    description?: string,
    timestamp?: number
  ) {
    super('RANGE_EDIT', description, timestamp);
    this.changes = changes;
  }

  execute(dataframe: IDataframe): void {
    for (let i = 0; i < this.changes.length; i++) {
      const edit = this.changes[i];
      dataframe.set(edit.x, edit.y, edit.newValue);
    }
  }

  undo(dataframe: IDataframe): void {
    // Reverse application order during undo
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const edit = this.changes[i];
      dataframe.set(edit.x, edit.y, edit.oldValue);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: {
        changes: this.changes.map(c => ({ ...c }))
      }
    };
  }
}
