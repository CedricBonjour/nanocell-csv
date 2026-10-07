/**
 * @file core/history/Transaction.ts
 * Atomic composite command grouping multiple mutations into a single undo/redo unit.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';
import { BaseCommand, ICommand } from './Command.js';

export interface ITransaction extends ICommand {
  readonly commands: readonly ICommand[];
  add(command: ICommand): void;
}

export class CompositeCommand extends BaseCommand implements ITransaction {
  private _commands: ICommand[] = [];

  constructor(description?: string, timestamp?: number) {
    super('COMPOSITE', description, timestamp);
  }

  get commands(): readonly ICommand[] {
    return this._commands;
  }

  /**
   * Appends an executed command to this composite transaction.
   */
  add(command: ICommand): void {
    this._commands.push(command);
  }

  /**
   * Executes all constituent commands in forward order: [0 .. n-1].
   */
  execute(dataframe: IDataframe): void {
    for (let i = 0; i < this._commands.length; i++) {
      this._commands[i].execute(dataframe);
    }
  }

  /**
   * Reverts all constituent commands in reverse order: [n-1 .. 0].
   */
  undo(dataframe: IDataframe): void {
    for (let i = this._commands.length - 1; i >= 0; i--) {
      this._commands[i].undo(dataframe);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      commands: this._commands.map(cmd => cmd.toJSON())
    };
  }
}

/**
 * Transaction alias for CompositeCommand.
 */
export class Transaction extends CompositeCommand {
  constructor(description?: string, timestamp?: number) {
    super(description, timestamp);
  }
}
