/**
 * @file core/history/commands/EditCellCommand.ts
 * Single-cell value edit command with previous value capture and coalescing.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../../model/IDataframe.js';
import { BaseCommand, ICommand } from '../Command.js';

export class EditCellCommand extends BaseCommand {
  readonly x: number;
  readonly y: number;
  readonly oldValue: string;
  readonly newValue: string;

  constructor(
    x: number,
    y: number,
    oldValue: string,
    newValue: string,
    description?: string,
    timestamp?: number
  ) {
    super('EDIT_CELL', description, timestamp);
    this.x = x;
    this.y = y;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  execute(dataframe: IDataframe): void {
    dataframe.set(this.x, this.y, this.newValue);
  }

  undo(dataframe: IDataframe): void {
    dataframe.set(this.x, this.y, this.oldValue);
  }

  canMerge(previous: ICommand): boolean {
    if (previous instanceof EditCellCommand) {
      return (
        previous.x === this.x &&
        previous.y === this.y &&
        Math.abs(this.timestamp - previous.timestamp) < 500
      );
    }
    return false;
  }

  merge(previous: ICommand): ICommand {
    const prev = previous as EditCellCommand;
    return new EditCellCommand(
      this.x,
      this.y,
      prev.oldValue,
      this.newValue,
      this.description ?? prev.description,
      prev.timestamp
    );
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      timestamp: this.timestamp,
      payload: {
        x: this.x,
        y: this.y,
        oldValue: this.oldValue,
        newValue: this.newValue
      }
    };
  }
}
