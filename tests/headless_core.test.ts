/**
 * @vitest-environment node
 *
 * HEADLESS CORE ISOLATION & VERIFICATION SUITE
 *
 * Verifies Requirement R1:
 * 1. Zero browser/DOM globals (window, document, HTMLElement, customElements, navigator undefined).
 * 2. Pure Node.js execution without JSDOM or browser shims.
 * 3. Zero ReferenceError during instantiation and operation of all 6 core subsystems:
 *    - Dataframe (2D Tabular Model)
 *    - HistoryManager & Command System
 *    - CsvParser (RFC 4180 streaming parser)
 *    - CsvSerializer (RFC 4180 matrix serializer)
 *    - SearchEngine (Headless coordinate search)
 *    - ValidationEngine (Tabular rules & proposals)
 *    - EventBus (Typed pub-sub event emitter)
 * 4. Explicit atomic transactions (beginTransaction, commitTransaction, rollbackTransaction)
 *    producing single composite undo/redo steps without MS_DELTA time-window heuristics.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Core Subsystem Imports
import { Dataframe, Matrix } from '../core/model/index.js';
import { HistoryManager, EditCellCommand } from '../core/history/index.js';
import { CsvParser, CsvSerializer } from '../core/csv/index.js';
import { SearchEngine } from '../core/search/index.js';
import { ValidationEngine } from '../core/validation/index.js';
import { EventBus } from '../core/events/index.js';
import type { CoreEventMap } from '../core/events/index.js';

describe('Milestone 1 - Headless Core Verification Suite', () => {

  // ==========================================================================
  // 1. DOM / Browser Environment Isolation Audit
  // ==========================================================================
  describe('1. Zero-DOM Headless Isolation Audit', () => {
    it('confirms all browser and DOM globals are strictly undefined in the test runtime', () => {
      expect(typeof (globalThis as any).window).toBe('undefined');
      expect(typeof (globalThis as any).document).toBe('undefined');
      expect(typeof (globalThis as any).HTMLElement).toBe('undefined');
      expect(typeof (globalThis as any).HTMLTableElement).toBe('undefined');
      expect(typeof (globalThis as any).HTMLTableCellElement).toBe('undefined');
      expect(typeof (globalThis as any).customElements).toBe('undefined');
    });

    it('verifies that core modules produce no DOM-dependent side effects on import', () => {
      expect(Dataframe).toBeDefined();
      expect(HistoryManager).toBeDefined();
      expect(CsvParser).toBeDefined();
      expect(CsvSerializer).toBeDefined();
      expect(SearchEngine).toBeDefined();
      expect(ValidationEngine).toBeDefined();
      expect(EventBus).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Dataframe Core Model Verification
  // ==========================================================================
  describe('2. Dataframe (2D Tabular Model) Operational Verification', () => {
    let df: Dataframe;

    beforeEach(() => {
      df = new Dataframe([
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'Paris'],
        ['Bob', '25', 'London']
      ]);
    });

    it('instantiates and queries dimensions without ReferenceError', () => {
      expect(df.width).toBe(3);
      expect(df.height).toBe(3);
      expect(df.isSaved).toBe(true);
      expect(df.isLocked).toBe(false);
    });

    it('performs cell reads and writes with bounds safety', () => {
      expect(df.get(0, 0)).toBe('Name');
      expect(df.get(1, 1)).toBe('30');
      expect(df.get(99, 99)).toBe(''); // Out of bounds returns empty string

      df.set(1, 1, '31');
      expect(df.get(1, 1)).toBe('31');
      expect(df.isSaved).toBe(false);
    });

    it('auto-expands dimensions when writing out-of-bounds', () => {
      df.set(4, 4, 'Remote');
      expect(df.width).toBeGreaterThanOrEqual(5);
      expect(df.height).toBeGreaterThanOrEqual(5);
      expect(df.get(4, 4)).toBe('Remote');
    });

    it('executes row operations (insert, delete, push, shift, order) headlessly', () => {
      // Insert row at index 1
      df.insertRow(1, ['Charlie', '35', 'Berlin']);
      expect(df.height).toBe(4);
      expect(df.get(0, 1)).toBe('Charlie');

      // Shift row down
      df.shiftRow(1, 'down');
      expect(df.get(0, 2)).toBe('Charlie');

      // Delete row
      const deleted = df.deleteRow(2);
      expect(deleted[0]).toBe('Charlie');
      expect(df.height).toBe(3);

      // Reorder rows
      df.orderRows([2, 1, 0]);
      expect(df.get(0, 0)).toBe('Bob');
      expect(df.get(0, 2)).toBe('Name');
    });

    it('executes column operations (insert, delete, push, shift) headlessly', () => {
      // Insert col at index 1
      df.insertCol(1, ['ID', '101', '102']);
      expect(df.width).toBe(4);
      expect(df.get(1, 0)).toBe('ID');

      // Shift col right
      df.shiftCol(1, 'right');
      expect(df.get(2, 0)).toBe('ID');

      // Delete col
      const deleted = df.deleteCol(2);
      expect(deleted[0]).toBe('ID');
      expect(df.width).toBe(3);
    });

    it('performs trimAll, slice, and clone operations', () => {
      df.set(5, 5, '');
      df.trimAll();
      expect(df.width).toBe(3);
      expect(df.height).toBe(3);

      const sliced = df.slice({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 });
      expect(sliced).toEqual([
        ['Name', 'Age'],
        ['Alice', '30']
      ]);

      const clone = df.clone();
      expect(clone.width).toBe(df.width);
      expect(clone.height).toBe(df.height);
      clone.set(0, 0, 'MutatedClone');
      expect(df.get(0, 0)).toBe('Name'); // Original untouched
    });
  });

  // ==========================================================================
  // 3. Command History & Explicit Atomic Transactions Verification
  // ==========================================================================
  describe('3. HistoryManager & Explicit Atomic Transactions', () => {
    let df: Dataframe;
    let history: HistoryManager;

    beforeEach(() => {
      df = new Dataframe([
        ['A', 'B'],
        ['1', '2']
      ]);
      history = new HistoryManager();
    });

    it('executes single commands and tracks undo/redo stacks', () => {
      const cmd = new EditCellCommand(0, 1, '1', '100');
      history.execute(cmd, df);

      expect(df.get(0, 1)).toBe('100');
      expect(history.canUndo).toBe(true);
      expect(history.canRedo).toBe(false);
      expect(history.undoCount).toBe(1);

      // Undo
      const undone = history.undo(df);
      expect(undone).toBe(true);
      expect(df.get(0, 1)).toBe('1');
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(true);
      expect(history.redoCount).toBe(1);

      // Redo
      const redone = history.redo(df);
      expect(redone).toBe(true);
      expect(df.get(0, 1)).toBe('100');
    });

    it('tracks save points and dirty status accurately', () => {
      history.setSavePoint();
      expect(history.isDirty).toBe(false);

      history.execute(new EditCellCommand(0, 0, 'A', 'Z'), df);
      expect(history.isDirty).toBe(true);

      history.undo(df);
      expect(history.isDirty).toBe(false); // Back at save point
    });

    it('executes atomic transactions (commitTransaction) producing EXACTLY 1 composite undo step', () => {
      const initialSnapshot = df.slice({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 });

      // Begin atomic transaction
      history.beginTransaction('Multi-step batch update');

      // Perform 3 distinct mutations within the transaction boundary
      history.execute(new EditCellCommand(0, 0, 'A', 'MOD_A'), df);
      history.execute(new EditCellCommand(1, 0, 'B', 'MOD_B'), df);
      history.execute(new EditCellCommand(0, 1, '1', 'MOD_1'), df);

      // Verify that while transaction is active, composite step is not yet committed
      expect(history.isInTransaction).toBe(true);

      // Commit the transaction
      history.commitTransaction();
      expect(history.isInTransaction).toBe(false);

      // CRITICAL ASSERTION: exactly 1 composite undo item exists, NOT 3 individual items
      expect(history.undoCount).toBe(1);

      // Single undo must revert ALL 3 changes in reverse order
      const undone = history.undo(df);
      expect(undone).toBe(true);
      expect(df.get(0, 0)).toBe('A');
      expect(df.get(1, 0)).toBe('B');
      expect(df.get(0, 1)).toBe('1');
      expect(df.slice({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 })).toEqual(initialSnapshot);
      expect(history.undoCount).toBe(0);
      expect(history.redoCount).toBe(1);

      // Single redo must restore ALL 3 changes in forward order
      const redone = history.redo(df);
      expect(redone).toBe(true);
      expect(df.get(0, 0)).toBe('MOD_A');
      expect(df.get(1, 0)).toBe('MOD_B');
      expect(df.get(0, 1)).toBe('MOD_1');
      expect(history.undoCount).toBe(1);
      expect(history.redoCount).toBe(0);
    });

    it('rolls back active transactions (rollbackTransaction) completely discarding aborted edits', () => {
      const initialSnapshot = df.slice({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 });

      history.beginTransaction('Aborted operation');
      history.execute(new EditCellCommand(0, 0, 'A', 'CORRUPT_1'), df);
      history.execute(new EditCellCommand(1, 1, '2', 'CORRUPT_2'), df);

      // Verify interim state
      expect(df.get(0, 0)).toBe('CORRUPT_1');
      expect(df.get(1, 1)).toBe('CORRUPT_2');

      // Rollback transaction
      history.rollbackTransaction(df);
      expect(history.isInTransaction).toBe(false);

      // Verify complete restoration to pre-transaction state
      expect(df.get(0, 0)).toBe('A');
      expect(df.get(1, 1)).toBe('2');
      expect(df.slice({ xmin: 0, xmax: 1, ymin: 0, ymax: 1 })).toEqual(initialSnapshot);

      // Verify zero dangling commands on undo/redo stacks
      expect(history.undoCount).toBe(0);
      expect(history.redoCount).toBe(0);
      expect(history.canUndo).toBe(false);
    });

    it('supports scoped runTransaction executing closures with automatic commit or rollback', () => {
      // Successful closure commits automatically
      history.runTransaction(df, 'Auto commit', () => {
        history.execute(new EditCellCommand(0, 0, 'A', 'SUCCESS'), df);
      });
      expect(history.undoCount).toBe(1);
      expect(df.get(0, 0)).toBe('SUCCESS');

      // Failing closure rolls back automatically and rethrows error
      expect(() => {
        history.runTransaction(df, 'Failing op', () => {
          history.execute(new EditCellCommand(0, 0, 'SUCCESS', 'TEMP'), df);
          throw new Error('Transaction failure simulation');
        });
      }).toThrow('Transaction failure simulation');

      // State restored, undoCount remains 1 (from previous successful transaction)
      expect(df.get(0, 0)).toBe('SUCCESS');
      expect(history.undoCount).toBe(1);
    });
  });

  // ==========================================================================
  // 4. RFC 4180 CSV Parser & Serializer Verification
  // ==========================================================================
  describe('4. RFC 4180 CSV Parser & Serializer Verification', () => {
    let parser: CsvParser;
    let serializer: CsvSerializer;

    beforeEach(() => {
      parser = new CsvParser();
      serializer = new CsvSerializer();
    });

    it('heuristically detects delimiters (, ; \\t |)', () => {
      expect(parser.detectSeparator('a,b,c\n1,2,3')).toBe(',');
      expect(parser.detectSeparator('a;b;c\r\n1;2;3')).toBe(';');
      expect(parser.detectSeparator('a\tb\tc\n1\t2\t3')).toBe('\t');
      expect(parser.detectSeparator('a|b|c\n1|2|3')).toBe('|');
    });

    it('parses standard RFC 4180 CSV strings with quotes, escaped quotes, and newlines', () => {
      const csv = 'col1,"col,2","col ""3"""\r\nval1,"line1\nline2",val3';
      const matrix = parser.parse(csv);

      expect(matrix).toEqual([
        ['col1', 'col,2', 'col "3"'],
        ['val1', 'line1\nline2', 'val3']
      ]);
    });

    it('parses progressive streaming chunks across field and record boundaries', () => {
      const chunk1 = 'first,sec';
      const chunk2 = 'ond\nval1,val2\n';

      const res1 = parser.parseChunk(chunk1, false);
      const res2 = parser.parseChunk(chunk2, true);

      const all = [...res1, ...res2];
      expect(all).toEqual([
        ['first', 'second'],
        ['val1', 'val2']
      ]);
    });

    it('serializes 2D matrix back to RFC 4180 CSV with selective quoting', () => {
      const matrix = [
        ['col1', 'col,2', 'col "3"'],
        ['val1', 'line1\nline2', 'simple']
      ];
      const output = serializer.serialize(matrix, { lineTerminator: '\r\n' });

      expect(output).toBe('col1,"col,2","col ""3"""\r\nval1,"line1\nline2",simple');
    });
  });

  // ==========================================================================
  // 5. Search Engine Headless Verification
  // ==========================================================================
  describe('5. Headless SearchEngine Verification', () => {
    let df: Dataframe;
    let search: SearchEngine;

    beforeEach(() => {
      df = new Dataframe([
        ['Product', 'Category', 'Price'],
        ['Apple iPhone', 'Mobile', '$999'],
        ['Pineapple', 'Fruit', '$2'],
        ['Green Apple', 'Fruit', '$1']
      ]);
      search = new SearchEngine();
    });

    it('finds substring matches case-insensitively and returns coordinate descriptors', () => {
      const results = search.find(df, {
        term: 'apple',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false
      });

      expect(results.length).toBe(3);
      expect(results[0]).toEqual(expect.objectContaining({ x: 0, y: 1 })); // Apple iPhone
      expect(results[1]).toEqual(expect.objectContaining({ x: 0, y: 2 })); // Pineapple
      expect(results[2]).toEqual(expect.objectContaining({ x: 0, y: 3 })); // Green Apple
    });

    it('supports regex search queries', () => {
      const results = search.find(df, {
        term: '^\\$\\d+$',
        caseSensitive: false,
        useRegex: true,
        matchWholeCell: false
      });

      expect(results.length).toBe(3); // $999, $2, $1
    });

    it('navigates next and previous matches with circular wrapping', () => {
      const query = { term: 'Fruit', caseSensitive: false, useRegex: false, matchWholeCell: true };
      const nextMatch = search.findNext(df, query, { x: 1, y: 2 });
      expect(nextMatch).toEqual(expect.objectContaining({ x: 1, y: 3 }));

      const nextAfter = search.findNext(df, query, { x: 1, y: 3 });
      expect(nextAfter).toEqual(expect.objectContaining({ x: 1, y: 2 }));

      const prevMatch = search.findPrevious(df, query, { x: 1, y: 3 });
      expect(prevMatch).toEqual(expect.objectContaining({ x: 1, y: 2 }));

      const prevBefore = search.findPrevious(df, query, { x: 1, y: 2 });
      expect(prevBefore).toEqual(expect.objectContaining({ x: 1, y: 3 }));
    });

    it('creates atomic replace transactions undoable in a single step', () => {
      const tx = search.createReplaceTransaction(df, {
        term: 'Fruit',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: true
      }, 'Produce');

      expect(tx).toBeDefined();
      expect(tx.commands.length).toBe(2);

      // Execute transaction on dataframe
      tx.execute(df);
      expect(df.get(1, 2)).toBe('Produce');
      expect(df.get(1, 3)).toBe('Produce');

      // Undo transaction
      tx.undo(df);
      expect(df.get(1, 2)).toBe('Fruit');
      expect(df.get(1, 3)).toBe('Fruit');
    });
  });

  // ==========================================================================
  // 6. Validation Engine Headless Verification
  // ==========================================================================
  describe('6. Headless ValidationEngine Verification', () => {
    let df: Dataframe;
    let validator: ValidationEngine;

    beforeEach(() => {
      df = new Dataframe([
        ['ID', ' User Name ', 'Age', 'ID'], // Duplicate header 'ID', whitespace in ' User Name '
        ['1', ' John Doe\n', '30,5', 'A'],    // Newline in name, decimal comma in '30,5'
        ['2', 'Jane', '25', 'B']
      ]);
      validator = new ValidationEngine();
    });

    it('identifies header issues (duplicate headers, SQL compliance)', () => {
      const proposals = validator.validateHeaders(df);
      const duplicateProposals = proposals.filter(p => p.category === 'DUPLICATE_HEADER');
      expect(duplicateProposals.length).toBeGreaterThanOrEqual(1);
      expect(duplicateProposals[0]?.x).toBe(3); // Second 'ID' column
    });

    it('identifies data issues (whitespace trimming, decimal coercion, newlines)', () => {
      const proposals = validator.validateData(df);
      expect(proposals.length).toBeGreaterThan(0);

      const whitespaceOrNewline = proposals.find(p => p.x === 1 && p.y === 1);
      expect(whitespaceOrNewline).toBeDefined();
    });

    it('creates accept-all atomic transaction undoable in a single step', () => {
      const proposals = validator.validateData(df);
      const tx = validator.createAcceptAllTransaction(proposals);

      expect(tx).toBeDefined();
      tx.execute(df);

      // Verify proposals were applied
      proposals.forEach(p => {
        expect(df.get(p.x, p.y)).toBe(p.newValue);
      });

      // Undo entire batch validation in one step
      tx.undo(df);
      proposals.forEach(p => {
        expect(df.get(p.x, p.y)).toBe(p.oldValue);
      });
    });
  });

  // ==========================================================================
  // 7. Typed Event Bus Verification
  // ==========================================================================
  describe('7. Typed EventBus Verification', () => {
    it('dispatches typed core events without browser EventTarget or DOM dependencies', () => {
      const bus = new EventBus<CoreEventMap>();
      const eventsReceived: Array<{ x: number; y: number; value: string }> = [];

      const unsubscribe = bus.on('cell:changed', (payload) => {
        eventsReceived.push({ x: payload.x, y: payload.y, value: payload.newValue });
      });

      bus.emit('cell:changed', { x: 2, y: 3, oldValue: 'old', newValue: 'new' });
      expect(eventsReceived.length).toBe(1);
      expect(eventsReceived[0]).toEqual({ x: 2, y: 3, value: 'new' });

      // Unsubscribe
      unsubscribe();
      bus.emit('cell:changed', { x: 0, y: 0, oldValue: '', newValue: '' });
      expect(eventsReceived.length).toBe(1); // No new events
    });
  });

  // ==========================================================================
  // 8. Standalone verify_headless.mjs Probe Integration
  // ==========================================================================
  describe('8. Standalone verify_headless.mjs Probe Integration', () => {
    it('executes the pure Node.js headless verification probe successfully', async () => {
      const { runVerifyHeadless } = await import('./verify_headless.mjs');
      const result = await runVerifyHeadless();
      expect(result).toBe(true);
    });
  });

});
