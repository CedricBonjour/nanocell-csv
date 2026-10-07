/**
 * @file core/history/commands/CustomCommand.ts
 * Adapter for legacy callback-based commands (_redo, _undo).
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../../model/IDataframe.js';
import { BaseCommand } from '../Command.js';

export class CustomCommand extends BaseCommand {
  readonly _redo: (df?: IDataframe) => void;
  readonly _undo: (df?: IDataframe) => void;

  constructor(
    redoFn: (df?: IDataframe) => void,
    undoFn: (df?: IDataframe) => void,
    description?: string,
    timestamp?: number
  ) {
    super('CUSTOM', description, timestamp);
    this._redo = redoFn;
    this._undo = undoFn;
  }

  execute(dataframe: IDataframe): void {
    this._redo(dataframe);
  }

  undo(dataframe: IDataframe): void {
    this._undo(dataframe);
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: {}
    };
  }
}
