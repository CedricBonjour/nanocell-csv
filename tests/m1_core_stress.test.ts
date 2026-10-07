/**
 * @vitest-environment node
 *
 * ADVERSARIAL STRESS TEST & EMPIRICAL CHALLENGE SUITE FOR CORE/MODEL & CORE/HISTORY
 *
 * Systematic investigation of:
 * 1. Deep nested transactions & rollbacks (up to 50 levels deep, partial rollbacks, error aborts).
 * 2. Large matrix scalability (10k, 50k, 100k cells), measuring latency & heap memory.
 * 3. Mixed mutation fuzzing & invariant verification:
 *    - Rectangular shape invariant: rawRows.every(r => r.length === width)
 *    - Minimum dimension invariant: matrix >= 1x1
 *    - Undo/redo symmetry across single and compound operations
 *    - Dirty flag tracking & save point reachability
 * 4. Extreme & abnormal inputs:
 *    - Negative coordinates, NaN, Infinity / unbounded expansion
 *    - Empty matrices ([] and [[]])
 *    - Null, undefined, object, symbol, large payloads
 *    - Lock enforcement on all mutation paths
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { Dataframe, Matrix, CellCoordinate, CellRange, createRange } from '../core/model/index.js';
import {
  HistoryManager,
  EditCellCommand,
  RangeEditCommand,
  InsertRowCommand,
  DeleteRowCommand,
  ShiftRowCommand,
  PushRowCommand,
  OrderRowsCommand,
  InsertColCommand,
  DeleteColCommand,
  ShiftColCommand,
  PushColCommand,
  CustomCommand,
  CompositeCommand
} from '../core/history/index.js';

describe('Empirical Adversarial Stress Suite: core/model & core/history', () => {

  // ==========================================================================
  // 1. DEEP NESTED TRANSACTIONS & ROLLBACKS
  // ==========================================================================
  describe('1. Deep Nested Transactions and Rollbacks', () => {
    let df: Dataframe;
    let history: HistoryManager;

    beforeEach(() => {
      df = new Dataframe([
        ['A0', 'B0', 'C0'],
        ['A1', 'B1', 'C1'],
        ['A2', 'B2', 'C2']
      ]);
      history = new HistoryManager();
    });

    it('handles 50-level deep nested transactions, committing to a single composite undo unit', () => {
      const DEPTH = 50;

      // Begin 50 nested transactions
      for (let i = 0; i < DEPTH; i++) {
        history.beginTransaction(`Tx_Level_${i}`);
        history.execute(new EditCellCommand(0, 0, df.get(0, 0), `val_${i}`), df);
      }

      expect(df.get(0, 0)).toBe(`val_${DEPTH - 1}`);
      expect(history.isInTransaction).toBe(true);

      // Commit all 50 levels in reverse
      for (let i = 0; i < DEPTH; i++) {
        history.commitTransaction();
      }

      expect(history.isInTransaction).toBe(false);
      // All 50 levels collapsed into 1 top-level undo item
      expect(history.undoCount).toBe(1);

      // Single undo must restore original A0
      expect(history.undo(df)).toBe(true);
      expect(df.get(0, 0)).toBe('A0');
      expect(history.undoCount).toBe(0);
      expect(history.redoCount).toBe(1);

      // Single redo must restore val_49
      expect(history.redo(df)).toBe(true);
      expect(df.get(0, 0)).toBe(`val_${DEPTH - 1}`);
    });

    it('correctly handles partial rollback: inner tx rollback discards inner edits while preserving outer tx edits', () => {
      history.beginTransaction('Outer');
      history.execute(new EditCellCommand(0, 0, 'A0', 'OUTER_MOD_0'), df);

      // Nested level 1
      history.beginTransaction('Inner_1');
      history.execute(new EditCellCommand(1, 1, 'B1', 'INNER1_MOD'), df);
      history.commitTransaction(); // committed into Outer

      // Nested level 2 - aborted
      history.beginTransaction('Inner_2');
      history.execute(new EditCellCommand(2, 2, 'C2', 'INNER2_MOD'), df);
      expect(df.get(2, 2)).toBe('INNER2_MOD');
      history.rollbackTransaction(df); // rolled back!

      // Inner 2 rolled back
      expect(df.get(2, 2)).toBe('C2');
      // Inner 1 and Outer still intact
      expect(df.get(0, 0)).toBe('OUTER_MOD_0');
      expect(df.get(1, 1)).toBe('INNER1_MOD');

      // Commit Outer
      history.commitTransaction();
      expect(history.undoCount).toBe(1);

      // Undo Outer reverts both Outer and Inner_1
      history.undo(df);
      expect(df.get(0, 0)).toBe('A0');
      expect(df.get(1, 1)).toBe('B1');
      expect(df.get(2, 2)).toBe('C2');
    });

    it('handles nested runTransaction exception handling: intermediate error rolls back affected scope and rethrows', () => {
      expect(() => {
        history.runTransaction(df, 'Level 1', () => {
          history.execute(new EditCellCommand(0, 0, 'A0', 'L1_MOD'), df);

          history.runTransaction(df, 'Level 2', () => {
            history.execute(new EditCellCommand(1, 0, 'B0', 'L2_MOD'), df);

            history.runTransaction(df, 'Level 3 Failing', () => {
              history.execute(new EditCellCommand(2, 0, 'C0', 'L3_MOD'), df);
              throw new Error('Simulated crash in Level 3');
            });
          });
        });
      }).toThrow('Simulated crash in Level 3');

      // Because the error bubbled up through Level 3, 2, and 1, all levels should be rolled back!
      expect(df.get(0, 0)).toBe('A0');
      expect(df.get(1, 0)).toBe('B0');
      expect(df.get(2, 0)).toBe('C0');
      expect(history.isInTransaction).toBe(false);
      expect(history.undoCount).toBe(0);
    });

    it('ignores rollbackTransaction when no transaction is active without throwing', () => {
      expect(() => history.rollbackTransaction(df)).not.toThrow();
    });

    it('throws when commitTransaction is called with no active transaction', () => {
      expect(() => history.commitTransaction()).toThrow('commitTransaction() called without active transaction.');
    });

    it('commits empty transaction without polluting undoStack', () => {
      history.beginTransaction('Empty transaction');
      history.commitTransaction();
      expect(history.undoCount).toBe(0);
      expect(history.isDirty).toBe(false);
    });

    it('VULNERABILITY: undo/redo allowed during active transaction without guard', () => {
      history.execute(new EditCellCommand(0, 0, 'A0', 'COMMITTED'), df);
      history.beginTransaction('Active Transaction');
      history.execute(new EditCellCommand(1, 1, 'B1', 'IN_PROGRESS'), df);

      expect(history.isInTransaction).toBe(true);
      // HistoryManager allows undo() even while in transaction, mutating the underlying dataframe
      const undone = history.undo(df);
      expect(undone).toBe(true);
      // Undid COMMITTED back to A0 while active transaction was open
      expect(df.get(0, 0)).toBe('A0');
      expect(history.isInTransaction).toBe(true); // Transaction still dangling
      history.rollbackTransaction(df);
      expect(df.get(1, 1)).toBe('B1'); // In-progress reverted
    });
  });

  // ==========================================================================
  // 2. LARGE MATRIX SCALABILITY & PERFORMANCE BENCHMARKS
  // ==========================================================================
  describe('2. Large Matrix Scalability & Performance Benchmarks', () => {
    it('constructs and queries 10,000 cell matrix (1,000 rows x 10 cols) under 50ms', () => {
      const rows: string[][] = [];
      for (let r = 0; r < 1000; r++) {
        const row: string[] = [];
        for (let c = 0; c < 10; c++) {
          row.push(`r${r}c${c}`);
        }
        rows.push(row);
      }

      const t0 = performance.now();
      const df = new Dataframe(rows);
      const constructTime = performance.now() - t0;

      expect(df.width).toBe(10);
      expect(df.height).toBe(1000);
      expect(constructTime).toBeLessThan(50); // Target < 50ms

      const t1 = performance.now();
      expect(df.get(9, 999)).toBe('r999c9');
      expect(df.get(5, 500)).toBe('r500c5');
      const queryTime = performance.now() - t1;
      expect(queryTime).toBeLessThan(5);
    });

    it('handles 50,000 cells (5,000 rows x 10 cols) batch cell edits under 100ms', () => {
      const rows: string[][] = [];
      for (let r = 0; r < 5000; r++) {
        rows.push(new Array(10).fill('initial'));
      }
      const df = new Dataframe(rows);

      const t0 = performance.now();
      for (let r = 0; r < 5000; r++) {
        df.set(0, r, `mod_${r}`);
      }
      const editTime = performance.now() - t0;

      expect(df.get(0, 4999)).toBe('mod_4999');
      expect(editTime).toBeLessThan(100); // 5000 mutations < 100ms
    });

    it('measures bounds auto-expansion (ensureCapacity) behavior and memory impact', () => {
      const df = new Dataframe([['A']]);
      const initialMem = process.memoryUsage().heapUsed;

      const t0 = performance.now();
      // Expanding height to 1000
      df.set(0, 1000, 'BottomCell');
      const expandHeightTime = performance.now() - t0;

      expect(df.height).toBe(1001);
      expect(df.width).toBe(1);
      expect(df.get(0, 1000)).toBe('BottomCell');
      expect(expandHeightTime).toBeLessThan(50);

      // Expanding width to 100 on 1001 rows
      const t1 = performance.now();
      df.set(100, 0, 'RightCell');
      const expandWidthTime = performance.now() - t1;

      expect(df.width).toBe(101);
      expect(df.height).toBe(1001);
      expect(df.get(100, 0)).toBe('RightCell');
      expect(expandWidthTime).toBeLessThan(100);

      const endMem = process.memoryUsage().heapUsed;
      const memDeltaMB = (endMem - initialMem) / (1024 * 1024);
      expect(memDeltaMB).toBeLessThan(50);
    });

    it('measures batch RangeEditCommand across 10,000 cells with undo and redo latency', () => {
      const rows: string[][] = [];
      for (let r = 0; r < 1000; r++) {
        rows.push(new Array(10).fill('old'));
      }
      const df = new Dataframe(rows);
      const history = new HistoryManager();

      const changes = [];
      for (let r = 0; r < 1000; r++) {
        for (let c = 0; c < 10; c++) {
          changes.push({ x: c, y: r, oldValue: 'old', newValue: 'new' });
        }
      }
      const cmd = new RangeEditCommand(changes);

      const t0 = performance.now();
      history.execute(cmd, df);
      const execTime = performance.now() - t0;

      expect(df.get(0, 0)).toBe('new');
      expect(df.get(9, 999)).toBe('new');
      expect(execTime).toBeLessThan(100);

      const t1 = performance.now();
      history.undo(df);
      const undoTime = performance.now() - t1;

      expect(df.get(0, 0)).toBe('old');
      expect(df.get(9, 999)).toBe('old');
      expect(undoTime).toBeLessThan(100);

      const t2 = performance.now();
      history.redo(df);
      const redoTime = performance.now() - t2;

      expect(df.get(0, 0)).toBe('new');
      expect(df.get(9, 999)).toBe('new');
      expect(redoTime).toBeLessThan(100);
    });
  });

  // ==========================================================================
  // 3. RAPID SEQUENCES OF MIXED MUTATIONS & INVARIANTS
  // ==========================================================================
  describe('3. Mixed Mutation Fuzzing & Invariant Verification', () => {
    let df: Dataframe;
    let history: HistoryManager;

    beforeEach(() => {
      df = new Dataframe([
        ['R0C0', 'R0C1', 'R0C2'],
        ['R1C0', 'R1C1', 'R1C2'],
        ['R2C0', 'R2C1', 'R2C2']
      ]);
      history = new HistoryManager();
    });

    it('preserves rectangular shape invariant: all rows have identical length === width', () => {
      const checkRectangular = () => {
        const w = df.width;
        expect(w).toBeGreaterThanOrEqual(1);
        expect(df.height).toBeGreaterThanOrEqual(1);
        const raw = df.data;
        expect(raw.length).toBe(df.height);
        for (let r = 0; r < raw.length; r++) {
          expect(raw[r].length).toBe(w);
        }
      };

      checkRectangular();

      // Mixed sequence of 100 mutations
      for (let i = 0; i < 100; i++) {
        switch (i % 8) {
          case 0:
            df.set(i % 5, (i * 2) % 7, `v_${i}`);
            break;
          case 1:
            df.insertRow(df.height > 1 ? (i % df.height) : 0);
            break;
          case 2:
            if (df.height > 2) df.deleteRow(0);
            break;
          case 3:
            df.pushRow(['P1', 'P2']);
            break;
          case 4:
            df.insertCol(df.width > 1 ? (i % df.width) : 0);
            break;
          case 5:
            if (df.width > 2) df.deleteCol(0);
            break;
          case 6:
            df.pushCol(['C1', 'C2']);
            break;
          case 7:
            if (df.height > 2) df.shiftRow(0, 'down');
            break;
        }
        checkRectangular();
      }
    });

    it('enforces minimum 1x1 dimension invariant: cannot delete below 1 row or 1 col', () => {
      const tinyDf = new Dataframe([['A']]);
      expect(tinyDf.width).toBe(1);
      expect(tinyDf.height).toBe(1);

      tinyDf.deleteRow(0);
      expect(tinyDf.height).toBe(1);

      tinyDf.deleteCol(0);
      expect(tinyDf.width).toBe(1);

      // Multiple rapid delete attempts
      for (let i = 0; i < 20; i++) {
        tinyDf.deleteRow(0);
        tinyDf.deleteCol(0);
      }
      expect(tinyDf.width).toBe(1);
      expect(tinyDf.height).toBe(1);
      expect(tinyDf.get(0, 0)).toBe('A');
    });

    it('tests undo/redo stack symmetry with EditCellCommand coalescing (500ms window)', () => {
      const now = Date.now();
      const cmd1 = new EditCellCommand(0, 0, 'R0C0', 'Edit1', 'First', now);
      const cmd2 = new EditCellCommand(0, 0, 'Edit1', 'Edit2', 'Second', now + 100); // < 500ms -> should coalesce
      const cmd3 = new EditCellCommand(0, 0, 'Edit2', 'Edit3', 'Third', now + 1000); // > 500ms -> separate

      history.execute(cmd1, df);
      expect(history.undoCount).toBe(1);

      history.execute(cmd2, df);
      expect(history.undoCount).toBe(1); // Merged with cmd1!

      history.execute(cmd3, df);
      expect(history.undoCount).toBe(2); // Separate command

      expect(df.get(0, 0)).toBe('Edit3');

      // Undo cmd3
      history.undo(df);
      expect(df.get(0, 0)).toBe('Edit2');
      expect(history.undoCount).toBe(1);

      // Undo merged cmd1+cmd2
      history.undo(df);
      expect(df.get(0, 0)).toBe('R0C0'); // Successfully restored to original value!
      expect(history.undoCount).toBe(0);

      // Redo merged cmd1+cmd2
      history.redo(df);
      expect(df.get(0, 0)).toBe('Edit2');

      // Redo cmd3
      history.redo(df);
      expect(df.get(0, 0)).toBe('Edit3');
    });

    it('tests orderRows permutation symmetry: execute followed by undo perfectly restores rows', () => {
      const initialSnapshot = df.slice({ xmin: 0, xmax: 2, ymin: 0, ymax: 2 });
      const orderCmd = new OrderRowsCommand([2, 0, 1]); // Row 2 becomes 0, Row 0 becomes 1, Row 1 becomes 2

      history.execute(orderCmd, df);
      expect(df.get(0, 0)).toBe('R2C0');
      expect(df.get(0, 1)).toBe('R0C0');
      expect(df.get(0, 2)).toBe('R1C0');

      history.undo(df);
      expect(df.slice({ xmin: 0, xmax: 2, ymin: 0, ymax: 2 })).toEqual(initialSnapshot);

      history.redo(df);
      expect(df.get(0, 0)).toBe('R2C0');
    });

    it('FINDING 10 (RESOLVED): Non-permutation in orderRows does not corrupt matrix with undefined rows', () => {
      const corruptDf = new Dataframe([['R0'], ['R1'], ['R2']]);
      // Non-permutation order with duplicate index 0
      const orderCmd = new OrderRowsCommand([0, 0, 0]);
      orderCmd.execute(corruptDf);

      // Now undo using the safe computed oldOrder
      orderCmd.undo(corruptDf);

      // RESOLVED: Matrix.orderRows validates indices, preventing undefined row references
      expect(() => corruptDf.get(0, 1)).not.toThrow();
      expect(typeof corruptDf.get(0, 1)).toBe('string');
    });

    it('FINDING 1 (RESOLVED): Boundary ShiftRowCommand preserves inverse symmetry on undo', () => {
      const initialHeight = df.height; // 3
      const lastRowIdx = df.height - 1; // 2

      const shiftCmd = new ShiftRowCommand(lastRowIdx, 'down');
      history.execute(shiftCmd, df);
      expect(df.height).toBe(initialHeight + 1); // 4

      // Undo
      history.undo(df);
      // RESOLVED: Symmetrical undo removes appended boundary row and restores initialHeight
      expect(df.height).toBe(initialHeight);
    });

    it('FINDING 2 (RESOLVED): Boundary ShiftColCommand preserves inverse symmetry on undo', () => {
      const initialWidth = df.width; // 3
      const lastColIdx = df.width - 1; // 2

      const shiftCmd = new ShiftColCommand(lastColIdx, 'right');
      history.execute(shiftCmd, df);
      expect(df.width).toBe(initialWidth + 1); // 4

      // Undo
      history.undo(df);
      // RESOLVED: Symmetrical undo removes appended boundary column and restores initialWidth
      expect(df.width).toBe(initialWidth);
    });

    it('FINDING 3 (RESOLVED): DeleteRowCommand on 1x1 matrix is a no-op on undo', () => {
      const singleDf = new Dataframe([['ONLY_ROW']]);
      const deleteCmd = new DeleteRowCommand(0);

      history.execute(deleteCmd, singleDf);
      expect(singleDf.height).toBe(1); // deleteRow was a no-op because height < 2

      history.undo(singleDf);
      // RESOLVED: Undoing a no-op delete does not expand dimensions, keeping height 1
      expect(singleDf.height).toBe(1);
    });

    it('FINDING 4 (RESOLVED): DeleteColCommand on 1x1 matrix is a no-op on undo', () => {
      const singleDf = new Dataframe([['ONLY_COL']]);
      const deleteCmd = new DeleteColCommand(0);

      history.execute(deleteCmd, singleDf);
      expect(singleDf.width).toBe(1); // deleteCol was a no-op because width < 2

      history.undo(singleDf);
      // RESOLVED: Undoing a no-op delete does not expand dimensions, keeping width 1
      expect(singleDf.width).toBe(1);
    });
  });

  // ==========================================================================
  // 4. EXTREME & ABNORMAL INPUTS
  // ==========================================================================
  describe('4. Extreme and Abnormal Inputs', () => {
    let df: Dataframe;

    beforeEach(() => {
      df = new Dataframe([
        ['A', 'B'],
        ['C', 'D']
      ]);
    });

    it('handles negative coordinates gracefully without throwing or mutating', () => {
      expect(df.get(-1, 0)).toBe('');
      expect(df.get(0, -1)).toBe('');
      expect(df.get(-99, -99)).toBe('');

      // set with negative coords should be a no-op
      df.set(-1, 0, 'NEG');
      df.set(0, -1, 'NEG');
      expect(df.width).toBe(2);
      expect(df.height).toBe(2);
      expect(df.isSaved).toBe(true); // Should NOT mark dirty on negative coord

      // Row/Col operations with negative indices
      df.insertRow(-1);
      expect(df.height).toBe(2);

      expect(df.deleteRow(-1)).toEqual([]);
      expect(df.height).toBe(2);

      df.shiftRow(-1, 'down');
      expect(df.get(0, 0)).toBe('A');

      df.insertCol(-1);
      expect(df.width).toBe(2);

      expect(df.deleteCol(-1)).toEqual([]);
      expect(df.width).toBe(2);

      df.shiftCol(-1, 'right');
      expect(df.get(0, 0)).toBe('A');
    });

    it('FINDING 5 (RESOLVED): NaN coordinates do not mark dataframe dirty or corrupt state', () => {
      expect(df.isSaved).toBe(true);
      const res = df.set(NaN, 0, 'NAN_VAL');
      // RESOLVED: Dataframe.set() rejects NaN coordinates without marking dirty
      expect(res).toBe(false);
      expect(df.isSaved).toBe(true);
      expect(df.get(0, 0)).toBe('A');
    });

    it('FINDING 6 (RESOLVED): Infinity coordinates are safely guarded against unbounded loop / OOM', () => {
      expect(df.set(0, Infinity, 'INF_VAL')).toBe(false);
      expect(df.set(Infinity, 0, 'INF_VAL')).toBe(false);
      expect(df.set(-Infinity, 0, 'INF_VAL')).toBe(false);
      expect(df.width).toBe(2);
      expect(df.height).toBe(2);
      expect(df.isSaved).toBe(true);
    });

    it('handles abnormal cell values: null, undefined, 0, false, objects, symbols, huge strings', () => {
      df.set(0, 0, null as any);
      expect(df.get(0, 0)).toBe('');

      df.set(0, 0, undefined as any);
      expect(df.get(0, 0)).toBe('');

      df.set(0, 0, 0);
      expect(df.get(0, 0)).toBe('0');

      df.set(0, 0, false as any);
      expect(df.get(0, 0)).toBe('false');

      const hugeStr = 'X'.repeat(100_000);
      df.set(0, 0, hugeStr);
      expect(df.get(0, 0)).toBe(hugeStr);
      expect(df.get(0, 0).length).toBe(100_000);
    });

    it('handles empty matrix initializations ([] and [[]]) maintaining minimal structure', () => {
      const empty1 = new Dataframe([]);
      expect(empty1.width).toBe(0);
      expect(empty1.height).toBe(0);
      expect(empty1.get(0, 0)).toBe('');

      const empty2 = new Dataframe([[]]);
      expect(empty2.width).toBe(1);
      expect(empty2.height).toBe(1);
      expect(empty2.get(0, 0)).toBe('');

      const empty3 = new Dataframe([[], [], []]);
      expect(empty3.width).toBe(1);
      expect(empty3.height).toBe(3);
    });

    it('handles trimAll on empty and whitespace-filled dataframes without collapsing below 1x1', () => {
      const emptyDf = new Dataframe([['', ''], ['', '']]);
      emptyDf.trimAll();
      expect(emptyDf.width).toBe(1);
      expect(emptyDf.height).toBe(1);
      expect(emptyDf.get(0, 0)).toBe('');
    });

    it('FINDING 7 (RESOLVED): trimAll updates isSaved/markDirty flag when dimensions change', () => {
      const trimDf = new Dataframe([['A', ''], ['', '']]);
      trimDf.markSaved();
      expect(trimDf.isSaved).toBe(true);

      trimDf.trimAll();
      expect(trimDf.width).toBe(1);
      expect(trimDf.height).toBe(1);
      // RESOLVED: Matrix was modified (shrunk from 2x2 to 1x1), isSaved is now false
      expect(trimDf.isSaved).toBe(false);
    });

    it('FINDING 8 (RESOLVED): Dataframe.data setter respects isLocked guard and marks dirty when unlocked', () => {
      df.isLocked = true;
      // Mutating data while locked
      df.data = [['OVERWRITTEN', 'WHILE_LOCKED']];
      // RESOLVED: Data mutation rejected while locked
      expect(df.get(0, 0)).toBe('A');
      expect(df.isSaved).toBe(true);

      // Unlocked mutation marks dirty
      df.isLocked = false;
      df.data = [['NEW_VAL']];
      expect(df.get(0, 0)).toBe('NEW_VAL');
      expect(df.isSaved).toBe(false);
    });

    it('enforces isLocked across standard mutation methods', () => {
      df.isLocked = true;
      expect(df.lock).toBe(true);

      df.set(0, 0, 'MUTATED');
      expect(df.get(0, 0)).toBe('A');

      df.insertRow(0, ['X', 'Y']);
      expect(df.height).toBe(2);

      df.deleteRow(0);
      expect(df.height).toBe(2);

      df.pushRow(['X', 'Y']);
      expect(df.height).toBe(2);

      df.shiftRow(0, 'down');
      expect(df.get(0, 0)).toBe('A');

      df.orderRows([1, 0]);
      expect(df.get(0, 0)).toBe('A');

      df.insertCol(0, ['X', 'Y']);
      expect(df.width).toBe(2);

      df.deleteCol(0);
      expect(df.width).toBe(2);

      df.pushCol(['X', 'Y']);
      expect(df.width).toBe(2);

      df.shiftCol(0, 'right');
      expect(df.get(0, 0)).toBe('A');

      df.appendRows([['X', 'Y']]);
      expect(df.height).toBe(2);

      expect(df.isSaved).toBe(true);
    });
  });

  // ==========================================================================
  // 5. DIRTY FLAG TRACKING & SAVE POINT REACHABILITY
  // ==========================================================================
  describe('5. Dirty Flag Tracking and Save Point Reachability', () => {
    let df: Dataframe;
    let history: HistoryManager;

    beforeEach(() => {
      df = new Dataframe([['A']]);
      history = new HistoryManager();
    });

    it('tracks isDirty across edits, undos, and save points for independent mutations', () => {
      const multiDf = new Dataframe([['A', 'B']]);
      expect(history.isDirty).toBe(false);

      history.execute(new EditCellCommand(0, 0, 'A', 'MOD_A'), multiDf);
      expect(history.isDirty).toBe(true);

      history.setSavePoint();
      expect(history.isDirty).toBe(false);

      // Mutating cell (1, 0) - distinct cell so does not coalesce
      history.execute(new EditCellCommand(1, 0, 'B', 'MOD_B'), multiDf);
      expect(history.isDirty).toBe(true);

      history.undo(multiDf);
      expect(history.isDirty).toBe(false); // Exactly at save point

      history.redo(multiDf);
      expect(history.isDirty).toBe(true); // Past save point
    });

    it('FINDING 9: Coalescing edit across a save point boundary invalidates savePointIndex to -1', () => {
      expect(history.isDirty).toBe(false);

      // Command 1 on cell (0, 0)
      history.execute(new EditCellCommand(0, 0, 'A', 'B'), df);
      history.setSavePoint(); // savePointIndex = 1
      expect(history.isDirty).toBe(false);

      // Command 2 on SAME cell within 500ms -> coalesces with Command 1
      history.execute(new EditCellCommand(0, 0, 'B', 'C'), df);
      // Because command coalesced, undoStack.length remained 1, and savePointIndex was invalidated to -1!
      expect(history.isDirty).toBe(true);

      history.undo(df);
      // Because Command 1 and 2 merged into one, undo reverts to 'A', not 'B'
      expect(df.get(0, 0)).toBe('A');
      expect(history.isDirty).toBe(true); // Permanent dirty because save state 'B' was erased
    });

    it('permanently marks isDirty when history diverges after undo past save point', () => {
      // 1. Initial
      history.execute(new EditCellCommand(0, 0, 'A', 'B'), df);
      history.execute(new EditCellCommand(0, 0, 'B', 'C'), df);
      history.setSavePoint(); // Save point index = 2
      expect(history.isDirty).toBe(false);

      // 2. Undo to index 1
      history.undo(df);
      expect(history.isDirty).toBe(true);

      // 3. Execute NEW command: diverges history branch, discarding old save point
      history.execute(new EditCellCommand(0, 0, 'B', 'D'), df);
      // History count is now 2, but this state is D, NOT C!
      // In HistoryManager, savePointIndex is invalidated to -1!
      expect(history.isDirty).toBe(true);
    });

    it('clear() resets history and dirty status', () => {
      history.execute(new EditCellCommand(0, 0, 'A', 'B'), df);
      history.clear();
      expect(history.undoCount).toBe(0);
      expect(history.redoCount).toBe(0);
      expect(history.isDirty).toBe(false);
      expect(history.isInTransaction).toBe(false);
    });
  });

  // ==========================================================================
  // 6. CHALLENGER ITERATION 2 DEEP ADVERSARIAL VERIFICATION OF ALL 5 CHALLENGES
  // ==========================================================================
  describe('6. Challenger Iteration 2 Deep Adversarial Verification of All 5 Challenges', () => {

    // --- CHALLENGE 1: Matrix.ensureCapacity & Dataframe.set non-finite & Infinity coordinates ---
    describe('Challenge 1: Non-finite and Infinity Coordinates Safety', () => {
      it('Dataframe.set rejects Infinity, -Infinity, NaN in x or y, returning false and leaving isSaved true', () => {
        const df = new Dataframe([['A', 'B'], ['C', 'D']]);
        df.markSaved();
        expect(df.isSaved).toBe(true);

        // Infinite / NaN coordinates
        expect(df.set(0, Infinity, 'X')).toBe(false);
        expect(df.set(Infinity, 0, 'X')).toBe(false);
        expect(df.set(0, -Infinity, 'X')).toBe(false);
        expect(df.set(-Infinity, 0, 'X')).toBe(false);
        expect(df.set(0, NaN, 'X')).toBe(false);
        expect(df.set(NaN, 0, 'X')).toBe(false);
        expect(df.set(NaN, NaN, 'X')).toBe(false);
        expect(df.set(Infinity, Infinity, 'X')).toBe(false);
        expect(df.set(-1, -1, 'X')).toBe(false);

        // Grid must remain completely unmutated and clean
        expect(df.isSaved).toBe(true);
        expect(df.width).toBe(2);
        expect(df.height).toBe(2);
        expect(df.get(0, 0)).toBe('A');
      });

      it('Matrix.ensureCapacity safely no-ops on non-finite coordinates without looping or growing', () => {
        const mat = new Matrix<string>([['A', 'B'], ['C', 'D']], '');
        expect(mat.width).toBe(2);
        expect(mat.height).toBe(2);

        mat.ensureCapacity(Infinity, 0);
        mat.ensureCapacity(0, Infinity);
        mat.ensureCapacity(Infinity, Infinity);
        mat.ensureCapacity(-Infinity, 0);
        mat.ensureCapacity(0, -Infinity);
        mat.ensureCapacity(NaN, 0);
        mat.ensureCapacity(0, NaN);
        mat.ensureCapacity(-10, 5);
        mat.ensureCapacity(5, -10);

        expect(mat.width).toBe(2);
        expect(mat.height).toBe(2);
      });
    });

    // --- CHALLENGE 2: ShiftRowCommand & ShiftColCommand boundary undo symmetry ---
    describe('Challenge 2: ShiftRowCommand & ShiftColCommand Boundary Undo Symmetry', () => {
      it('verifies ShiftRowCommand boundary down shift undo/redo dimensional symmetry on 3x3 matrix', () => {
        const df = new Dataframe([['R0'], ['R1'], ['R2']]);
        const history = new HistoryManager();
        const cmd = new ShiftRowCommand(2, 'down');

        // Execute: shifts bottom row down, inserting empty row at index 2
        history.execute(cmd, df);
        expect(df.height).toBe(4);
        expect(df.get(0, 2)).toBe('');
        expect(df.get(0, 3)).toBe('R2');

        // Undo: removes inserted boundary row, restoring height 3
        history.undo(df);
        expect(df.height).toBe(3);
        expect(df.get(0, 0)).toBe('R0');
        expect(df.get(0, 1)).toBe('R1');
        expect(df.get(0, 2)).toBe('R2');

        // Redo: expands to 4 again
        history.redo(df);
        expect(df.height).toBe(4);
        expect(df.get(0, 3)).toBe('R2');

        // Undo again: restores to 3
        history.undo(df);
        expect(df.height).toBe(3);
        expect(df.get(0, 2)).toBe('R2');
      });

      it('verifies ShiftRowCommand boundary down shift on minimal 1x1 matrix undo/redo symmetry', () => {
        const df = new Dataframe([['ONLY']]);
        const history = new HistoryManager();

        history.execute(new ShiftRowCommand(0, 'down'), df);
        expect(df.height).toBe(2);
        expect(df.get(0, 1)).toBe('ONLY');

        history.undo(df);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('ONLY');

        history.redo(df);
        expect(df.height).toBe(2);
        history.undo(df);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('ONLY');
      });

      it('verifies multiple consecutive boundary row shifts and undos restore exact dimensions and contents', () => {
        const df = new Dataframe([['R0'], ['R1']]);
        const history = new HistoryManager();

        history.execute(new ShiftRowCommand(1, 'down'), df); // expands to 3
        expect(df.height).toBe(3);
        history.execute(new ShiftRowCommand(2, 'down'), df); // expands to 4
        expect(df.height).toBe(4);

        history.undo(df);
        expect(df.height).toBe(3);
        history.undo(df);
        expect(df.height).toBe(2);
        expect(df.get(0, 0)).toBe('R0');
        expect(df.get(0, 1)).toBe('R1');
      });

      it('verifies ShiftColCommand boundary right shift undo/redo dimensional symmetry on 3x3 matrix', () => {
        const df = new Dataframe([['C0', 'C1', 'C2']]);
        const history = new HistoryManager();
        const cmd = new ShiftColCommand(2, 'right');

        history.execute(cmd, df);
        expect(df.width).toBe(4);
        expect(df.get(2, 0)).toBe('');
        expect(df.get(3, 0)).toBe('C2');

        history.undo(df);
        expect(df.width).toBe(3);
        expect(df.get(0, 0)).toBe('C0');
        expect(df.get(1, 0)).toBe('C1');
        expect(df.get(2, 0)).toBe('C2');

        history.redo(df);
        expect(df.width).toBe(4);
        expect(df.get(3, 0)).toBe('C2');

        history.undo(df);
        expect(df.width).toBe(3);
        expect(df.get(2, 0)).toBe('C2');
      });

      it('verifies ShiftColCommand boundary right shift on minimal 1x1 matrix undo/redo symmetry', () => {
        const df = new Dataframe([['ONLY']]);
        const history = new HistoryManager();

        history.execute(new ShiftColCommand(0, 'right'), df);
        expect(df.width).toBe(2);
        expect(df.get(1, 0)).toBe('ONLY');

        history.undo(df);
        expect(df.width).toBe(1);
        expect(df.get(0, 0)).toBe('ONLY');

        history.redo(df);
        expect(df.width).toBe(2);
        history.undo(df);
        expect(df.width).toBe(1);
        expect(df.get(0, 0)).toBe('ONLY');
      });

      it('verifies multiple consecutive boundary column shifts and undos restore exact dimensions and contents', () => {
        const df = new Dataframe([['C0', 'C1']]);
        const history = new HistoryManager();

        history.execute(new ShiftColCommand(1, 'right'), df); // expands to 3
        expect(df.width).toBe(3);
        history.execute(new ShiftColCommand(2, 'right'), df); // expands to 4
        expect(df.width).toBe(4);

        history.undo(df);
        expect(df.width).toBe(3);
        history.undo(df);
        expect(df.width).toBe(2);
        expect(df.get(0, 0)).toBe('C0');
        expect(df.get(1, 0)).toBe('C1');
      });

      it('verifies non-boundary row and col shifts (middle and top/left boundaries) retain geometry', () => {
        const df = new Dataframe([['R0'], ['R1'], ['R2'], ['R3']]);
        const history = new HistoryManager();

        // Middle row shift down swaps rows without expanding height
        history.execute(new ShiftRowCommand(1, 'down'), df);
        expect(df.height).toBe(4);
        expect(df.get(0, 1)).toBe('R2');
        expect(df.get(0, 2)).toBe('R1');

        history.undo(df);
        expect(df.height).toBe(4);
        expect(df.get(0, 1)).toBe('R1');
        expect(df.get(0, 2)).toBe('R2');

        // Boundary 'up' at row 0 is a safe no-op
        history.execute(new ShiftRowCommand(0, 'up'), df);
        expect(df.height).toBe(4);
        history.undo(df);
        expect(df.height).toBe(4);

        // Boundary 'left' at col 0 is a safe no-op
        const dfCol = new Dataframe([['C0', 'C1', 'C2']]);
        const colHistory = new HistoryManager();
        colHistory.execute(new ShiftColCommand(0, 'left'), dfCol);
        expect(dfCol.width).toBe(3);
        colHistory.undo(dfCol);
        expect(dfCol.width).toBe(3);
      });
    });

    // --- CHALLENGE 3: DeleteRowCommand & DeleteColCommand on 1x1 matrix ---
    describe('Challenge 3: DeleteRowCommand & DeleteColCommand 1x1 Matrix Non-Expansion Invariant', () => {
      it('verifies DeleteRowCommand on 1x1 matrix leaves table at 1x1 across execute, undo, and redo', () => {
        const df = new Dataframe([['SOLO']]);
        const history = new HistoryManager();

        history.execute(new DeleteRowCommand(0), df);
        expect(df.height).toBe(1);
        expect(df.width).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');

        history.undo(df);
        expect(df.height).toBe(1);
        expect(df.width).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');

        history.redo(df);
        expect(df.height).toBe(1);
        history.undo(df);
        expect(df.height).toBe(1);
      });

      it('verifies DeleteColCommand on 1x1 matrix leaves table at 1x1 across execute, undo, and redo', () => {
        const df = new Dataframe([['SOLO']]);
        const history = new HistoryManager();

        history.execute(new DeleteColCommand(0), df);
        expect(df.width).toBe(1);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');

        history.undo(df);
        expect(df.width).toBe(1);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');

        history.redo(df);
        expect(df.width).toBe(1);
        history.undo(df);
        expect(df.width).toBe(1);
      });

      it('verifies out-of-bounds DeleteRowCommand and DeleteColCommand do not trigger phantom insertions on undo', () => {
        const df = new Dataframe([['A', 'B'], ['C', 'D']]);
        const history = new HistoryManager();

        history.execute(new DeleteRowCommand(-1), df);
        expect(df.height).toBe(2);
        history.undo(df);
        expect(df.height).toBe(2);

        history.execute(new DeleteRowCommand(99), df);
        expect(df.height).toBe(2);
        history.undo(df);
        expect(df.height).toBe(2);

        history.execute(new DeleteColCommand(-1), df);
        expect(df.width).toBe(2);
        history.undo(df);
        expect(df.width).toBe(2);

        history.execute(new DeleteColCommand(99), df);
        expect(df.width).toBe(2);
        history.undo(df);
        expect(df.width).toBe(2);
      });

      it('verifies DeleteRowCommand and DeleteColCommand in atomic transactions on 1x1 matrix do not expand on rollback or undo', () => {
        const df = new Dataframe([['SOLO']]);
        const history = new HistoryManager();

        history.runTransaction(df, 'DeleteAttempt', () => {
          history.execute(new DeleteRowCommand(0), df);
          history.execute(new DeleteColCommand(0), df);
        });

        expect(df.width).toBe(1);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');

        history.undo(df);
        expect(df.width).toBe(1);
        expect(df.height).toBe(1);
        expect(df.get(0, 0)).toBe('SOLO');
      });
    });

    // --- CHALLENGE 4: OrderRowsCommand & Matrix.orderRows non-permutation and OOB handling ---
    describe('Challenge 4: OrderRowsCommand & Matrix.orderRows Malformed Permutation Safety', () => {
      it('Matrix.orderRows safely rejects non-permutation arrays, preserving row integrity and avoiding undefined', () => {
        const mat = new Matrix<string>([['R0'], ['R1'], ['R2']], '');

        // Out-of-bounds index
        mat.orderRows([0, 1, 99]);
        expect(mat.getRow(0)).toEqual(['R0']);
        expect(mat.getRow(1)).toEqual(['R1']);
        expect(mat.getRow(2)).toEqual(['R2']);

        // Negative index
        mat.orderRows([-1, 0, 1]);
        expect(mat.getRow(0)).toEqual(['R0']);

        // Float index
        mat.orderRows([0, 1.5, 2]);
        expect(mat.getRow(0)).toEqual(['R0']);

        // NaN / Infinity
        mat.orderRows([0, NaN, 2]);
        expect(mat.getRow(0)).toEqual(['R0']);
        mat.orderRows([0, Infinity, 2]);
        expect(mat.getRow(0)).toEqual(['R0']);

        // Length mismatch
        mat.orderRows([0, 1]);
        expect(mat.getRow(0)).toEqual(['R0']);
        mat.orderRows([0, 1, 2, 3]);
        expect(mat.getRow(0)).toEqual(['R0']);

        // Non-array
        mat.orderRows(null as any);
        expect(mat.getRow(0)).toEqual(['R0']);
      });

      it('OrderRowsCommand constructor creates valid identity fallback on malformed permutations', () => {
        const cmdDup = new OrderRowsCommand([0, 0, 0]);
        expect(cmdDup.oldOrder).toEqual([0, 1, 2]);

        const cmdOob = new OrderRowsCommand([0, 1, 99]);
        expect(cmdOob.oldOrder).toEqual([0, 1, 2]);

        const cmdNeg = new OrderRowsCommand([-1, 0, 1]);
        expect(cmdNeg.oldOrder).toEqual([0, 1, 2]);
      });

      it('OrderRowsCommand execution and undo on invalid permutations leaves Dataframe undamaged', () => {
        const df = new Dataframe([['R0'], ['R1'], ['R2']]);
        const history = new HistoryManager();

        const cmdDup = new OrderRowsCommand([0, 0, 0]);
        history.execute(cmdDup, df);
        history.undo(df);

        // Never throws and all rows are valid strings
        expect(() => df.get(0, 0)).not.toThrow();
        expect(() => df.get(0, 1)).not.toThrow();
        expect(() => df.get(0, 2)).not.toThrow();
        expect(typeof df.get(0, 1)).toBe('string');

        // Valid permutation roundtrip
        const cmdValid = new OrderRowsCommand([2, 0, 1]);
        history.execute(cmdValid, df);
        expect(df.get(0, 0)).toBe('R0'); // since row 2 was previously R0 after duplicate execution
        history.undo(df);
        expect(typeof df.get(0, 0)).toBe('string');
      });
    });

    // --- CHALLENGE 5: Dataframe.data setter & trimAll() lock & dirty flag integrity ---
    describe('Challenge 5: Dataframe.data Setter & trimAll() Lock & Dirty Invariants', () => {
      it('Dataframe.data setter strictly obeys isLocked, preventing mutation and maintaining isSaved', () => {
        const df = new Dataframe([['A', 'B'], ['C', 'D']]);
        df.markSaved();
        expect(df.isSaved).toBe(true);

        // Locked: mutation rejected, isSaved stays true
        df.isLocked = true;
        df.data = [['X', 'Y', 'Z']];
        expect(df.get(0, 0)).toBe('A');
        expect(df.width).toBe(2);
        expect(df.height).toBe(2);
        expect(df.isSaved).toBe(true);

        // Unlocked: mutation accepted, squared, marks dirty
        df.isLocked = false;
        df.data = [['X', 'Y', 'Z'], ['W']];
        expect(df.width).toBe(3);
        expect(df.height).toBe(2);
        expect(df.get(0, 0)).toBe('X');
        expect(df.get(1, 1)).toBe(''); // squared
        expect(df.isSaved).toBe(false);
      });

      it('trimAll() strictly obeys isLocked, preventing dimension changes and maintaining isSaved', () => {
        const df = new Dataframe([['A', '', ''], ['', '', '']]);
        df.markSaved();
        expect(df.isSaved).toBe(true);

        // Locked: trimAll rejected
        df.isLocked = true;
        df.trimAll();
        expect(df.width).toBe(3);
        expect(df.height).toBe(2);
        expect(df.isSaved).toBe(true);

        // Unlocked: trimAll changes dimensions (3x2 -> 1x1), marks dirty
        df.isLocked = false;
        df.trimAll();
        expect(df.width).toBe(1);
        expect(df.height).toBe(1);
        expect(df.isSaved).toBe(false);
      });

      it('trimAll() preserves isSaved when dimensions are unchanged', () => {
        const denseDf = new Dataframe([['A', 'B'], ['C', 'D']]);
        denseDf.markSaved();
        expect(denseDf.isSaved).toBe(true);

        denseDf.trimAll();
        expect(denseDf.width).toBe(2);
        expect(denseDf.height).toBe(2);
        expect(denseDf.isSaved).toBe(true); // preserved because no dimension changed
      });

      it('trimAll() preserves 1x1 minimum dimension constraint on all-empty dataframes and marks dirty', () => {
        const emptyDf = new Dataframe([['', '', ''], ['', '', '']]);
        emptyDf.markSaved();
        expect(emptyDf.isSaved).toBe(true);

        emptyDf.trimAll();
        expect(emptyDf.width).toBe(1);
        expect(emptyDf.height).toBe(1);
        expect(emptyDf.isSaved).toBe(false); // marked dirty because dimensions shrank from 3x2 to 1x1
      });
    });
  });

});

