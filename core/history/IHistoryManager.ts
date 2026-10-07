/**
 * @file core/history/IHistoryManager.ts
 * Interface contract for history and transaction management.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';
import { ICommand } from './Command.js';
import { ITransaction } from './Transaction.js';

export interface IHistoryManager {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isDirty: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
  readonly undoStack: readonly ICommand[];
  readonly redoStack: readonly ICommand[];
  readonly isInTransaction: boolean;
  readonly activeTransaction: ITransaction | null;

  /**
   * Executes a command against the dataframe and records it in history.
   * If an active transaction is open, the command is batched into the transaction.
   */
  execute(command: ICommand, dataframe: IDataframe): void;

  /**
   * Reverts the last command or transaction.
   */
  undo(dataframe: IDataframe): boolean;

  /**
   * Re-applies the last reverted command or transaction.
   */
  redo(dataframe: IDataframe): boolean;

  /**
   * Begins an explicit atomic transaction.
   */
  beginTransaction(description?: string): ITransaction;

  /**
   * Commits the active atomic transaction, pushing it onto the undo stack.
   */
  commitTransaction(): void;

  /**
   * Cancels the active transaction, reverting any already executed mutations.
   */
  rollbackTransaction(dataframe: IDataframe): void;

  /**
   * Executes a callback within a managed transaction boundary, auto-rolling back on error.
   */
  runTransaction<T>(dataframe: IDataframe, description: string, fn: () => T): T;

  /**
   * Marks current undo stack depth as the clean save point.
   */
  setSavePoint(): void;

  /**
   * Clears undo and redo stacks.
   */
  clear(): void;
}
