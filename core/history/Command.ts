/**
 * @file core/history/Command.ts
 * Base contract for executable and reversible mutations against IDataframe.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';

export interface ICommand {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly description?: string;

  /**
   * Applies the forward mutation against the dataframe.
   */
  execute(dataframe: IDataframe): void;

  /**
   * Applies the reverse mutation against the dataframe.
   */
  undo(dataframe: IDataframe): void;

  /**
   * Checks if this command can coalesce with an adjacent prior command.
   */
  canMerge?(previous: ICommand): boolean;

  /**
   * Produces a merged command coalescing this and previous command.
   */
  merge?(previous: ICommand): ICommand;

  /**
   * Serializes command into a JSON-serializable descriptor.
   */
  toJSON(): Record<string, unknown>;
}

let commandCounter = 0;

/**
 * Abstract base class providing common ID, timestamp, and serialization logic.
 */
export abstract class BaseCommand implements ICommand {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly description?: string;

  constructor(type: string, description?: string, timestamp: number = Date.now()) {
    this.id = `cmd_${timestamp}_${++commandCounter}`;
    this.type = type;
    this.description = description;
    this.timestamp = timestamp;
  }

  abstract execute(dataframe: IDataframe): void;
  abstract undo(dataframe: IDataframe): void;

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      description: this.description
    };
  }
}
