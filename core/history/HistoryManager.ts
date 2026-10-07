/**
 * @file core/history/HistoryManager.ts
 * Concrete IHistoryManager implementation managing undo/redo stacks,
 * explicit atomic transactions, and save point markers.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';
import { ICommand } from './Command.js';
import { CompositeCommand, ITransaction } from './Transaction.js';
import { IHistoryManager } from './IHistoryManager.js';

export class HistoryManager implements IHistoryManager {
  private _undoStack: ICommand[] = [];
  private _redoStack: ICommand[] = [];
  private _transactionStack: CompositeCommand[] = [];
  private _savePointIndex: number = 0;

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  get undoCount(): number {
    return this._undoStack.length;
  }

  get redoCount(): number {
    return this._redoStack.length;
  }

  get undoStack(): readonly ICommand[] {
    return this._undoStack;
  }

  get redoStack(): readonly ICommand[] {
    return this._redoStack;
  }

  get isDirty(): boolean {
    return this._undoStack.length !== this._savePointIndex;
  }

  get isInTransaction(): boolean {
    return this._transactionStack.length > 0;
  }

  get activeTransaction(): ITransaction | null {
    return this._transactionStack.length > 0
      ? this._transactionStack[this._transactionStack.length - 1]
      : null;
  }

  execute(command: ICommand, dataframe: IDataframe): void {
    // 1. Execute mutation against model
    command.execute(dataframe);

    // 2. If inside transaction, add to active transaction
    if (this._transactionStack.length > 0) {
      this._transactionStack[this._transactionStack.length - 1].add(command);
      return;
    }

    // 3. Attempt command coalescing with prior top of stack
    const prev = this._undoStack[this._undoStack.length - 1];
    if (prev && command.canMerge?.(prev) && command.merge) {
      const merged = command.merge(prev);
      this._undoStack[this._undoStack.length - 1] = merged;
    } else {
      this._undoStack.push(command);
    }

    // 4. Invalidate redo stack and update save point reachability
    this._redoStack = [];
    if (this._savePointIndex > this._undoStack.length - 1) {
      this._savePointIndex = -1; // Save point truncated; can never return
    }
  }

  undo(dataframe: IDataframe): boolean {
    if (this._undoStack.length === 0) {
      return false;
    }
    const command = this._undoStack.pop()!;
    command.undo(dataframe);
    this._redoStack.push(command);
    return true;
  }

  redo(dataframe: IDataframe): boolean {
    if (this._redoStack.length === 0) {
      return false;
    }
    const command = this._redoStack.pop()!;
    command.execute(dataframe);
    this._undoStack.push(command);
    return true;
  }

  beginTransaction(description?: string): ITransaction {
    const tx = new CompositeCommand(description);
    this._transactionStack.push(tx);
    return tx;
  }

  commitTransaction(): void {
    if (this._transactionStack.length === 0) {
      throw new Error('commitTransaction() called without active transaction.');
    }
    const committed = this._transactionStack.pop()!;
    if (this._transactionStack.length > 0) {
      // Nested transaction: add to parent transaction
      this._transactionStack[this._transactionStack.length - 1].add(committed);
    } else {
      // Top-level commit: push to undo stack if non-empty
      if (committed.commands.length > 0) {
        this._undoStack.push(committed);
        this._redoStack = [];
        if (this._savePointIndex > this._undoStack.length - 1) {
          this._savePointIndex = -1;
        }
      }
    }
  }

  rollbackTransaction(dataframe: IDataframe): void {
    if (this._transactionStack.length === 0) {
      return;
    }
    const rollingBack = this._transactionStack.pop()!;
    rollingBack.undo(dataframe);
  }

  runTransaction<T>(dataframe: IDataframe, description: string, fn: () => T): T {
    this.beginTransaction(description);
    try {
      const result = fn();
      this.commitTransaction();
      return result;
    } catch (err) {
      this.rollbackTransaction(dataframe);
      throw err;
    }
  }

  setSavePoint(): void {
    this._savePointIndex = this._undoStack.length;
  }

  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this._transactionStack = [];
    this._savePointIndex = 0;
  }
}
