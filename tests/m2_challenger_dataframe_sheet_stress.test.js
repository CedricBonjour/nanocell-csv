import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Dataframe } from '../core/model/Dataframe.js';
import { Sheet } from '../app/js/sheet/Sheet.js';
import { Setting, stg } from '../app/js/ui/settings/Setting.js';
import { build_dom, dom } from '../app/js/ui/AppLayout.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 2 Challenger — Adversarial Empirical Stress Test Suite for Dataframe.js & Sheet.js', () => {
  let df;
  let sheet;

  beforeEach(() => {
    document.body.innerHTML = `
      <link rel="stylesheet" href="css/palettes/light.css" id="palette">
      <link rel="stylesheet" href="css/themes/light.css" id="theme">
      <header id="header"></header>
      <div id="content" class="flexMain"></div>
      <footer>
        <section id="dialog" class="scroll"></section>
        <section id="footer">
          <section id="footerLeft">Left</section>
          <section id="footerCenter" class="flexMain">Center</section>
          <section id="footerRight">Right</section>
          <img id="lock" src="icn/edit.svg" alt="editing file">
        </section>
      </footer>
    `;
    Setting.init();
    stg.autoRound = false;
    build_dom();

    if (dom.content) {
      if (!dom.content.scrollerY) {
        const sy = document.createElement('div');
        sy.className = 'scrollerY';
        dom.content.appendChild(sy);
        dom.content.scrollerY = sy;
      }
      if (!dom.content.scrollerX) {
        const sx = document.createElement('div');
        sx.className = 'scrollerX';
        dom.content.appendChild(sx);
        dom.content.scrollerX = sx;
      }
    }

    df = new Dataframe([
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['A3', 'B3', 'C3']
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // AREA 1: Rapid Edits within 100ms Confirming MS_DELTA Grouping Loop Behavior
  // ==========================================================================
  describe('Area 1: Rapid edits within 100ms confirming MS_DELTA grouping loop behavior', () => {
    test('Dataframe.MS_DELTA constant is immutable and strictly 100', () => {
      expect(Dataframe.MS_DELTA).toBe(100);
      expect(() => {
        Dataframe.MS_DELTA = 200;
      }).toThrow();
      expect(Dataframe.MS_DELTA).toBe(100);
    });

    test('Consecutive edits under 100ms (< MS_DELTA) are grouped and undone in a single undo() call', () => {
      const now = 100000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // 5 rapid edits spaced by 30ms (< 100ms each)
      df.edit(0, 0, 'EDIT_1');
      vi.setSystemTime(now + 30);
      df.edit(0, 1, 'EDIT_2');
      vi.setSystemTime(now + 60);
      df.edit(0, 2, 'EDIT_3');
      vi.setSystemTime(now + 90);
      df.edit(1, 0, 'EDIT_4');
      vi.setSystemTime(now + 120);
      df.edit(1, 1, 'EDIT_5');

      expect(df.undoStack.length).toBe(5);
      expect(df.get(0, 0)).toBe('EDIT_1');
      expect(df.get(1, 1)).toBe('EDIT_5');

      // A single undo() should unroll all 5 because each adjacent step delta is 30ms < MS_DELTA
      df.undo();

      expect(df.undoStack.length).toBe(0);
      expect(df.redoStack.length).toBe(5);
      expect(df.get(0, 0)).toBe('A1');
      expect(df.get(0, 1)).toBe('A2');
      expect(df.get(0, 2)).toBe('A3');
      expect(df.get(1, 0)).toBe('B1');
      expect(df.get(1, 1)).toBe('B2');
    });

    test('Grouped edits undone together are re-applied together in a single redo() call', () => {
      const now = 200000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      df.edit(0, 0, 'VAL_A');
      vi.setSystemTime(now + 25);
      df.edit(1, 0, 'VAL_B');
      vi.setSystemTime(now + 50);
      df.edit(2, 0, 'VAL_C');

      expect(df.undoStack.length).toBe(3);
      df.undo(); // Undoes all 3
      expect(df.undoStack.length).toBe(0);
      expect(df.redoStack.length).toBe(3);
      expect(df.get(0, 0)).toBe('A1');

      // A single redo() should re-apply all 3
      df.redo();
      expect(df.undoStack.length).toBe(3);
      expect(df.redoStack.length).toBe(0);
      expect(df.get(0, 0)).toBe('VAL_A');
      expect(df.get(1, 0)).toBe('VAL_B');
      expect(df.get(2, 0)).toBe('VAL_C');
    });

    test('Edits separated by >= MS_DELTA (100ms) terminate the grouping loop', () => {
      const now = 300000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Edit 1 at t=0
      df.edit(0, 0, 'SEPARATE_1');

      // Edit 2 at t=100 (delta = 100ms, not < 100ms)
      vi.setSystemTime(now + 100);
      df.edit(0, 1, 'SEPARATE_2');

      // Edit 3 at t=250 (delta = 150ms > 100ms)
      vi.setSystemTime(now + 250);
      df.edit(0, 2, 'SEPARATE_3');

      expect(df.undoStack.length).toBe(3);

      // First undo: should only undo Edit 3
      df.undo();
      expect(df.get(0, 2)).toBe('A3');
      expect(df.get(0, 1)).toBe('SEPARATE_2');
      expect(df.get(0, 0)).toBe('SEPARATE_1');
      expect(df.undoStack.length).toBe(2);
      expect(df.redoStack.length).toBe(1);

      // Second undo: should only undo Edit 2 (since delta between Edit 2 and Edit 1 was 100ms >= 100)
      df.undo();
      expect(df.get(0, 1)).toBe('A2');
      expect(df.get(0, 0)).toBe('SEPARATE_1');
      expect(df.undoStack.length).toBe(1);
      expect(df.redoStack.length).toBe(2);

      // Third undo: should undo Edit 1
      df.undo();
      expect(df.get(0, 0)).toBe('A1');
      expect(df.undoStack.length).toBe(0);
      expect(df.redoStack.length).toBe(3);

      // Redo 1: restores Edit 1
      df.redo();
      expect(df.get(0, 0)).toBe('SEPARATE_1');
      expect(df.get(0, 1)).toBe('A2');
      expect(df.undoStack.length).toBe(1);

      // Redo 2: restores Edit 2
      df.redo();
      expect(df.get(0, 1)).toBe('SEPARATE_2');
      expect(df.get(0, 2)).toBe('A3');
      expect(df.undoStack.length).toBe(2);

      // Redo 3: restores Edit 3
      df.redo();
      expect(df.get(0, 2)).toBe('SEPARATE_3');
      expect(df.undoStack.length).toBe(3);
      expect(df.redoStack.length).toBe(0);
    });

    test('Stress: 100 rapid burst edits at 10ms intervals group into single undo/redo transaction', () => {
      const now = 400000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Pre-dimension a 10x10 matrix to ensure all 100 operations are pure cell edits
      const grid10x10 = Array.from({ length: 10 }, () => Array(10).fill('INIT'));
      const testDf = new Dataframe(grid10x10);

      // Build 100 rapid cell edits across existing cells
      for (let i = 0; i < 100; i++) {
        vi.setSystemTime(now + (i * 10));
        testDf.edit(i % 10, Math.floor(i / 10), `BURST_${i}`);
      }
      expect(testDf.undoStack.length).toBe(100);

      // Single undo should drain all 100
      testDf.undo();
      expect(testDf.undoStack.length).toBe(0);
      expect(testDf.redoStack.length).toBe(100);
      expect(testDf.get(0, 0)).toBe('INIT');
      expect(testDf.get(9, 9)).toBe('INIT');

      // Single redo should re-apply all 100
      testDf.redo();
      expect(testDf.undoStack.length).toBe(100);
      expect(testDf.redoStack.length).toBe(0);
      expect(testDf.get(0, 0)).toBe('BURST_0');
      expect(testDf.get(9, 9)).toBe('BURST_99');
    });

    test('Stress: Compound burst with matrix expansion groups edits and structural expansions', () => {
      const now = 450000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Starts 1x1, expands dynamically through edits
      const expDf = new Dataframe([['START']]);
      for (let i = 1; i <= 20; i++) {
        vi.setSystemTime(now + (i * 10));
        expDf.edit(i, i, `DIAG_${i}`);
      }

      // Matrix expanded to 21x21
      expect(expDf.width).toBe(21);
      expect(expDf.height).toBe(21);
      const totalCmds = expDf.undoStack.length;
      expect(totalCmds).toBeGreaterThan(20); // Includes pushCol and pushRow commands

      // Single undo should unroll all edits and restore initial dimensions
      expDf.undo();
      expect(expDf.undoStack.length).toBe(0);
      expect(expDf.redoStack.length).toBe(totalCmds);
      expect(expDf.get(0, 0)).toBe('START');
      expect(expDf.width).toBe(1);
      expect(expDf.height).toBe(1);

      // Single redo should re-expand matrix to 21x21 and reapply values
      expDf.redo();
      expect(expDf.undoStack.length).toBe(totalCmds);
      expect(expDf.width).toBe(21);
      expect(expDf.height).toBe(21);
      expect(expDf.get(20, 20)).toBe('DIAG_20');
    });

    test('Multi-burst partition: 3 distinct bursts separated by >100ms pause undo as 3 discrete steps', () => {
      const now = 500000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Burst 1: 5 edits (t = 0 to 40)
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(now + (i * 10));
        df.edit(0, 0, `B1_${i}`);
      }

      // Pause 200ms -> Burst 2: 5 edits (t = 240 to 280)
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(now + 240 + (i * 10));
        df.edit(1, 0, `B2_${i}`);
      }

      // Pause 200ms -> Burst 3: 5 edits (t = 480 to 520)
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(now + 480 + (i * 10));
        df.edit(2, 0, `B3_${i}`);
      }

      expect(df.undoStack.length).toBe(15);

      // Undo 1: Reverts Burst 3
      df.undo();
      expect(df.undoStack.length).toBe(10);
      expect(df.get(2, 0)).toBe('C1');
      expect(df.get(1, 0)).toBe('B2_4');
      expect(df.get(0, 0)).toBe('B1_4');

      // Undo 2: Reverts Burst 2
      df.undo();
      expect(df.undoStack.length).toBe(5);
      expect(df.get(1, 0)).toBe('B1');
      expect(df.get(0, 0)).toBe('B1_4');

      // Undo 3: Reverts Burst 1
      df.undo();
      expect(df.undoStack.length).toBe(0);
      expect(df.get(0, 0)).toBe('A1');

      // Redo 1: Re-applies Burst 1
      df.redo();
      expect(df.undoStack.length).toBe(5);
      expect(df.get(0, 0)).toBe('B1_4');

      // Redo 2: Re-applies Burst 2
      df.redo();
      expect(df.undoStack.length).toBe(10);
      expect(df.get(1, 0)).toBe('B2_4');

      // Redo 3: Re-applies Burst 3
      df.redo();
      expect(df.undoStack.length).toBe(15);
      expect(df.get(2, 0)).toBe('B3_4');
    });

    test('Simultaneous edits at exactly same timestamp (delta = 0) group properly', () => {
      const now = 600000;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      df.edit(0, 0, 'ZERO_1');
      df.edit(0, 1, 'ZERO_2');
      df.edit(0, 2, 'ZERO_3');

      expect(df.undoStack.length).toBe(3);
      df.undo();
      expect(df.undoStack.length).toBe(0);
      expect(df.redoStack.length).toBe(3);
      expect(df.get(0, 0)).toBe('A1');

      df.redo();
      expect(df.undoStack.length).toBe(3);
      expect(df.get(0, 0)).toBe('ZERO_1');
    });
  });

  // ==========================================================================
  // AREA 2: JSON.stringify(df.undoStack) and df.redoStack Serialization Fidelity
  // ==========================================================================
  describe('Area 2: JSON.stringify(df.undoStack) and df.redoStack serialization fidelity', () => {
    test('Every core matrix command type serializes and round-trips through JSON without loss', () => {
      // 1. EDIT_CELL
      df.edit(1, 1, 'EDITED_VAL');
      // 2. INSERT_ROW
      df.insertRow(1);
      // 3. DELETE_ROW
      df.deleteRow(2);
      // 4. INSERT_COL
      df.insertCol(1);
      // 5. DELETE_COL
      df.deleteCol(2);
      // 6. PUSH_ROW
      df.pushRow();
      // 7. PUSH_COL
      df.pushCol();
      // 8. SHIFT_ROW
      df.shiftRow(0);
      // 9. SHIFT_COL
      df.shiftCol(0);
      // 10. ORDER_ROWS
      df.order([1, 0, 2, 3]);

      expect(df.undoStack.length).toBe(10);

      // Serialize undoStack
      let serializedUndo;
      expect(() => {
        serializedUndo = JSON.stringify(df.undoStack);
      }).not.toThrow();

      expect(typeof serializedUndo).toBe('string');
      expect(serializedUndo).toContain('EDIT_CELL');
      expect(serializedUndo).toContain('INSERT_ROW');
      expect(serializedUndo).toContain('DELETE_ROW');
      expect(serializedUndo).toContain('INSERT_COL');
      expect(serializedUndo).toContain('DELETE_COL');
      expect(serializedUndo).toContain('PUSH_ROW');
      expect(serializedUndo).toContain('PUSH_COL');
      expect(serializedUndo).toContain('SHIFT_ROW');
      expect(serializedUndo).toContain('SHIFT_COL');
      expect(serializedUndo).toContain('ORDER_ROWS');

      // Parse back and compare deep structure
      const parsedUndo = JSON.parse(serializedUndo);
      expect(parsedUndo.length).toBe(10);
      for (const cmd of parsedUndo) {
        expect(cmd).toHaveProperty('type');
        expect(cmd).toHaveProperty('timestamp');
        expect(cmd).toHaveProperty('payload');
        expect(typeof cmd.type).toBe('string');
        expect(typeof cmd.timestamp).toBe('number');
        expect(typeof cmd.payload).toBe('object');
      }

      // Undo 5 commands to populate redoStack
      df.undo();
      expect(df.redoStack.length).toBeGreaterThan(0);

      let serializedRedo;
      expect(() => {
        serializedRedo = JSON.stringify(df.redoStack);
      }).not.toThrow();

      const parsedRedo = JSON.parse(serializedRedo);
      expect(parsedRedo.length).toBe(df.redoStack.length);
    });

    test('Replay fidelity: Replaying deserialized commands on fresh Dataframe produces identical state', () => {
      const initial = [
        ['10', '20', '30'],
        ['40', '50', '60'],
        ['70', '80', '90']
      ];
      const sourceDf = new Dataframe(initial);

      // Perform a sequence of deterministic mutations
      sourceDf.edit(0, 0, '999');
      sourceDf.pushRow();
      sourceDf.edit(0, 3, 'NEW_ROW_CELL');
      sourceDf.pushCol();
      sourceDf.edit(3, 0, 'NEW_COL_CELL');
      sourceDf.deleteRow(1);

      const targetData = JSON.parse(JSON.stringify(sourceDf.data));

      // Serialize and deserialize the command stack
      const serialized = JSON.stringify(sourceDf.undoStack);
      const deserializedCommands = JSON.parse(serialized);

      // Replay onto clean clone
      const replayDf = new Dataframe(initial);
      for (const cmd of deserializedCommands) {
        replayDf.executeCommand(cmd, false);
      }

      expect(replayDf.data).toEqual(targetData);

      // Revert in reverse order
      for (let i = deserializedCommands.length - 1; i >= 0; i--) {
        replayDf.executeCommand(deserializedCommands[i], true);
      }
      expect(replayDf.data).toEqual(initial);
    });

    test('RANGE_EDIT command payload serializes correctly and handles complex characters', () => {
      const complexChanges = [
        { x: 0, y: 0, oldValue: 'A1', newValue: 'Line1\nLine2\r\nLine3' },
        { x: 1, y: 0, oldValue: 'B1', newValue: '{"nested":"json","escaped":"\\\"quotes\\\""}' },
        { x: 2, y: 0, oldValue: 'C1', newValue: '🚀 Non-ASCII: 日本語, Español, Ümlaut' }
      ];

      df.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes: complexChanges }
      });

      const serialized = JSON.stringify(df.undoStack);
      const parsed = JSON.parse(serialized);

      expect(parsed[parsed.length - 1].type).toBe('RANGE_EDIT');
      expect(parsed[parsed.length - 1].payload.changes).toEqual(complexChanges);

      // Undo reverts changes properly
      df.undo();
      expect(df.get(0, 0)).toBe('A1');
      expect(df.get(1, 0)).toBe('B1');
      expect(df.get(2, 0)).toBe('C1');
    });

    test('Custom callback commands degrade gracefully in JSON serialization without throwing', () => {
      let customRedoRan = false;
      let customUndoRan = false;

      df.create(() => { customRedoRan = true; }, () => { customUndoRan = true; });

      expect(df.undoStack.length).toBe(1);
      expect(df.undoStack[0].type).toBe('CUSTOM');

      // JSON.stringify drops function properties without throwing
      let json;
      expect(() => {
        json = JSON.stringify(df.undoStack);
      }).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed[0].type).toBe('CUSTOM');
      expect(parsed[0]._redo).toBeUndefined();
      expect(parsed[0]._undo).toBeUndefined();
    });
  });

  // ==========================================================================
  // AREA 3: Dynamic stg.autoRound Toggling During Live Editing
  // ==========================================================================
  describe('Area 3: Dynamic stg.autoRound toggling during live editing', () => {
    test('autoRound=false leaves float numbers and formulas unrounded', () => {
      stg.autoRound = false;
      df.edit(0, 0, '3.1415926535');
      df.edit(1, 0, '=2.7182818284');
      df.edit(2, 0, '100.99999');

      expect(df.get(0, 0)).toBe('3.1415926535');
      expect(df.get(1, 0)).toBe('=2.7182818284');
      expect(df.get(2, 0)).toBe('100.99999');
    });

    test('Toggling autoRound=true dynamically rounds subsequent edits while preserving prior cells', () => {
      stg.autoRound = false;
      df.edit(0, 0, '3.1415926535');
      expect(df.get(0, 0)).toBe('3.1415926535');

      // Dynamically toggle on
      stg.autoRound = true;
      df.edit(0, 1, '3.1415926535');
      df.edit(0, 2, '=12.3456');

      // Cell 0,0 remains unrounded
      expect(df.get(0, 0)).toBe('3.1415926535');
      // Cell 0,1 is rounded to 2 decimals
      expect(df.get(0, 1)).toBe('3.14');
      // Formula cell 0,2 has formula result rounded
      expect(df.get(0, 2)).toBe('=12.35');
    });

    test('Toggling autoRound back to false immediately stops rounding on live edits', () => {
      stg.autoRound = true;
      df.edit(1, 1, '45.6789');
      expect(df.get(1, 1)).toBe('45.68');

      // Dynamically toggle off
      stg.autoRound = false;
      df.edit(1, 2, '45.6789');
      expect(df.get(1, 2)).toBe('45.6789');
    });

    test('Rapid alternating toggling stress test across 50 edits', () => {
      for (let i = 0; i < 50; i++) {
        stg.autoRound = (i % 2 === 0);
        df.edit(i % 3, Math.floor(i / 3), '99.98765');
        const val = df.get(i % 3, Math.floor(i / 3));
        if (i % 2 === 0) {
          expect(val).toBe('99.99');
        } else {
          expect(val).toBe('99.98765');
        }
      }
    });

    test('autoRound ignores non-numeric strings, empty strings, and text formulas', () => {
      stg.autoRound = true;

      df.edit(0, 0, 'Hello World');
      expect(df.get(0, 0)).toBe('Hello World');

      df.edit(0, 1, '');
      expect(df.get(0, 1)).toBe('');

      df.edit(0, 2, '=CONCAT("A","B")');
      expect(df.get(0, 2)).toBe('=CONCAT("A","B")');

      df.edit(1, 0, '12px');
      expect(df.get(1, 0)).toBe('12px');
    });

    test('Undo and redo maintain recorded autoRound values regardless of current stg.autoRound state', () => {
      // Edit with autoRound=true
      stg.autoRound = true;
      df.edit(0, 0, '88.8888');
      expect(df.get(0, 0)).toBe('88.89');

      // Toggle off before undo/redo
      stg.autoRound = false;

      df.undo();
      expect(df.get(0, 0)).toBe('A1');

      df.redo();
      // Even though autoRound is currently false, redo must restore the recorded rounded value
      expect(df.get(0, 0)).toBe('88.89');
    });
  });

  // ==========================================================================
  // AREA 4: <ui-sheet> Custom Element Instantiation and Method Projection
  // ==========================================================================
  describe('Area 4: <ui-sheet> custom element instantiation and method projection', () => {
    test('<ui-sheet> custom element is registered and constructible via new Sheet() and customElements.get', () => {
      const SheetCtor = customElements.get('ui-sheet');
      expect(SheetCtor).toBe(Sheet);

      // Direct class instantiation
      const sheetInst = new Sheet(df);
      expect(sheetInst).toBeInstanceOf(Sheet);
      expect(sheetInst).toBeInstanceOf(HTMLElement);
      expect(sheetInst.id).toBe('sheet');
      expect(sheetInst.classList.contains('sheet')).toBe(true);
      expect(sheetInst.df).toBe(df);
      expect(sheetInst.finder).toBeDefined();
      expect(sheetInst.view).toBeDefined();
      expect(sheetInst.controller).toBeDefined();

      // Instantiation via constructor registered in customElements
      const registeredInst = new SheetCtor(df);
      expect(registeredInst).toBeInstanceOf(Sheet);
      expect(registeredInst).toBeInstanceOf(HTMLElement);
      expect(registeredInst.id).toBe('sheet');

      // document.createElement prototype resolution
      const customEl = document.createElement('ui-sheet');
      expect(customEl).toBeInstanceOf(Sheet);
      expect(customEl).toBeInstanceOf(HTMLElement);
      expect(customEl.tagName.toLowerCase()).toBe('ui-sheet');
    });

    test('Sheet constructor binds StateManager state keys', () => {
      const testDf = new Dataframe([['S1', 'S2'], ['S3', 'S4']]);
      const s = new Sheet(testDf);

      expect(StateManager.getState('sheet')).toBe(s);
      expect(StateManager.getState('activeSheet')).toBe(s);
      expect(StateManager.getState('dataframe')).toBe(testDf);
      expect(StateManager.getState('activeDataframe')).toBe(testDf);
    });

    test('Coordinate getters and setters correctly project between Sheet and Controller', () => {
      sheet = new Sheet(df);

      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(0);
      expect(sheet.baseX).toBe(0);
      expect(sheet.baseY).toBe(0);

      sheet.x = 2;
      sheet.y = 1;
      expect(sheet.x).toBe(2);
      expect(sheet.y).toBe(1);

      sheet.baseX = 1;
      sheet.baseY = 2;
      expect(sheet.baseX).toBe(1);
      expect(sheet.baseY).toBe(2);
    });

    test('Table and Rows properties project accurately to SheetView DOM representation', () => {
      sheet = new Sheet(df);
      sheet.reload();

      expect(sheet.table).toBeDefined();
      expect(sheet.table.tagName.toLowerCase()).toBe('table');
      expect(sheet.rows.length).toBeGreaterThan(0);
      expect(sheet.width).toBe(sheet.rows[0].cells.length - 1);
      expect(sheet.height).toBe(sheet.rows.length - 1);
    });

    test('Core controller action methods project and mutate underlying Dataframe', () => {
      sheet = new Sheet(df);

      // focus_cell
      sheet.focus_cell(1, 1);
      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(1);

      // rangeEdit
      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 1, y: 1 };
      sheet.rangeEdit('PROJECTION_TEST');
      expect(df.get(0, 0)).toBe('PROJECTION_TEST');
      expect(df.get(1, 1)).toBe('PROJECTION_TEST');

      // rangeOrdered
      const range = sheet.rangeOrdered();
      expect(range.xmin).toBe(0);
      expect(range.xmax).toBe(1);
      expect(range.ymin).toBe(0);
      expect(range.ymax).toBe(1);

      // rangeArray
      const arr = sheet.rangeArray();
      expect(arr.length).toBe(2);
      expect(arr[0].length).toBe(2);

      // slctAll
      sheet.slctAll();
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(0);
      expect(sheet.rangeEnd).toEqual({ x: df.width - 1, y: df.height - 1 });

      // slctCol & slctRow
      sheet.slctCol(0, 1);
      expect(sheet.x).toBe(0);
      expect(sheet.rangeEnd.x).toBe(1);

      sheet.slctRow(1, 2);
      expect(sheet.y).toBe(1);
      expect(sheet.rangeEnd.y).toBe(2);

      // slctClear removes .slct class from elements in DOM
      sheet.rows[1].cells[1].classList.add('slct');
      sheet.slctClear();
      expect(sheet.getElementsByClassName('slct').length).toBe(0);

      // Setting x without slctRange clears rangeEnd
      sheet.slctRange = false;
      sheet.x = 0;
      expect(sheet.rangeEnd).toBeUndefined();
    });

    test('Sorting and row operations project cleanly to controller', () => {
      const sortDf = new Dataframe([
        ['Name', 'Score'],
        ['Alice', '80'],
        ['Bob', '95'],
        ['Charlie', '70']
      ]);
      const sortSheet = new Sheet(sortDf);

      // Sort Ascending on Score (col 1)
      stg.sort_header = true;
      stg.sort_num_first = true;
      sortSheet.sort(1, true);
      expect(sortDf.get(1, 1)).toBe('70');
      expect(sortDf.get(1, 2)).toBe('80');
      expect(sortDf.get(1, 3)).toBe('95');

      // Sort Descending on Score
      sortSheet.sort(1, false);
      expect(sortDf.get(1, 1)).toBe('95');
      expect(sortDf.get(1, 3)).toBe('70');
    });

    test('Validation methods project to controller and return expected repair structures', () => {
      const vDf = new Dataframe([
        ['Header 1!', 'Header 1!'],
        ['12,34', 'Say "Hello"']
      ]);
      const vSheet = new Sheet(vDf);

      stg.dv_comma_num = true;
      stg.dv_quotes = true;

      const headerFixes = vSheet.validate_headers();
      expect(Array.isArray(headerFixes)).toBe(true);
      expect(headerFixes.length).toBeGreaterThan(0);

      const dataFixes = vSheet.validate_data();
      expect(Array.isArray(dataFixes)).toBe(true);
      expect(dataFixes.length).toBeGreaterThan(0);
    });

    test('View methods (reload, refresh, scrollbarRefresh, footerUpdate, viewRangeRender) project without errors', () => {
      sheet = new Sheet(df);
      sheet.rangeEnd = { x: 1, y: 1 };
      expect(() => sheet.reload()).not.toThrow();
      expect(() => sheet.refresh()).not.toThrow();
      expect(() => sheet.scrollbarRefresh()).not.toThrow();
      expect(() => sheet.footerUpdate()).not.toThrow();
      expect(() => sheet.viewRangeRender()).not.toThrow();
    });

    test('Multiple <ui-sheet> instantiations clean up prior DOM instances in container', () => {
      const container = dom.content;
      expect(container).toBeDefined();

      const sheet1 = new Sheet(df);
      expect(container.contains(sheet1)).toBe(true);

      const sheet2 = new Sheet(new Dataframe([['NEW']]));
      expect(container.contains(sheet2)).toBe(true);
      // Older sheet1 was replaced
      expect(container.contains(sheet1)).toBe(false);
    });
  });
});
