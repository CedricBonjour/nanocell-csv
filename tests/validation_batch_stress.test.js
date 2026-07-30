import { describe, test, expect, beforeEach } from 'vitest';
import '../app/js/ui/ValidationPane.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom } from '../app/js/dom.js';
import { ValidationPane } from '../app/js/ui/ValidationPane.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Empirical Stress Test — Validation Batch Approval, RANGE_EDIT & Undo/Redo Integrity', () => {
  let df;
  let sheet;
  let pane;

  beforeEach(() => {
    document.body.innerHTML = `
      <header id="header"></header>
      <div id="content" class="flexMain">
        <div id="main-container">
          <ui-sheet id="sheet"></ui-sheet>
        </div>
      </div>
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
    build_dom();

    pane = document.createElement('ui-validation-pane');
    pane.id = 'validation-pane';
    document.getElementById('content').appendChild(pane);

    // Initial 5x5 dataset
    df = new Dataframe([
      ['Col0', 'Col1', 'Col2', 'Col3', 'Col4'],
      [' val_0_1 ', '100,5', 'bad"q1', ' 999 ', 'dup_a'],
      [' val_0_2 ', '200,75', 'bad"q2', ' 888 ', 'dup_a'],
      [' val_0_3 ', '300,25', 'bad"q3', ' 777 ', 'dup_b'],
      [' val_0_4 ', '400,0', 'bad"q4', ' 666 ', 'dup_b']
    ]);
    sheet = new Sheet(df);
    StateManager.setState('sheet', sheet);
    pane.bindSheet(sheet);
  });

  describe('1. Individual, Category, and Global Batch Accept/Reject Operations', () => {
    test('Individual accept/reject accurately mutates targeted cells and tracks pending item states', () => {
      const items = [
        { id: 'i1', x: 0, y: 1, header: 'Col0', oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'WHITESPACE_TRIMMING', categoryName: 'Whitespace', status: 'pending' },
        { id: 'i2', x: 1, y: 1, header: 'Col1', oldValue: '100,5', newValue: '100.5', category: 'DATA_TYPE_COERCION', categoryName: 'Coercion', status: 'pending' },
        { id: 'i3', x: 2, y: 1, header: 'Col2', oldValue: 'bad"q1', newValue: "bad'q1", category: 'CONSTRAINT_RANGE_VIOLATION', categoryName: 'Constraint', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.show();
      expect(pane.getPendingItems().length).toBe(3);

      // Accept first item
      pane.acceptItem(items[0]);
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(items[0].status).toBe('accepted');
      expect(pane.getPendingItems().length).toBe(2);

      // Reject second item
      pane.rejectItem(items[1]);
      expect(df.get(1, 1)).toBe('100,5'); // original unchanged
      expect(items[1].status).toBe('rejected');
      expect(pane.getPendingItems().length).toBe(1);

      // Verify remaining pending item
      expect(pane.getPendingItems()[0].id).toBe('i3');
    });

    test('Item batch accept/reject processes items and updates dataframe state', () => {
      const items = [
        { id: 'c1', x: 0, y: 1, header: 'Col0', oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'WHITESPACE_TRIMMING', categoryName: 'Whitespace', status: 'pending' },
        { id: 'c2', x: 0, y: 2, header: 'Col0', oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'WHITESPACE_TRIMMING', categoryName: 'Whitespace', status: 'pending' },
        { id: 'c3', x: 1, y: 1, header: 'Col1', oldValue: '100,5', newValue: '100.5', category: 'DATA_TYPE_COERCION', categoryName: 'Coercion', status: 'pending' },
        { id: 'c4', x: 1, y: 2, header: 'Col1', oldValue: '200,75', newValue: '200.75', category: 'DATA_TYPE_COERCION', categoryName: 'Coercion', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.show();

      // Accept first item
      pane.acceptItem(items[0]);
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(pane.getPendingItems().length).toBe(3);

      // Reject second item
      pane.rejectItem(items[1]);
      expect(df.get(0, 2)).toBe(' val_0_2 '); // Unedited
      expect(pane.getPendingItems().length).toBe(2);
    });

    test('Global batch accept/reject operates across all pending categories simultaneously', () => {
      const items = [
        { id: 'g1', x: 0, y: 1, header: 'Col0', oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'WHITESPACE_TRIMMING', categoryName: 'Whitespace', status: 'pending' },
        { id: 'g2', x: 1, y: 1, header: 'Col1', oldValue: '100,5', newValue: '100.5', category: 'DATA_TYPE_COERCION', categoryName: 'Coercion', status: 'pending' },
        { id: 'g3', x: 2, y: 1, header: 'Col2', oldValue: 'bad"q1', newValue: "bad'q1", category: 'CONSTRAINT_RANGE_VIOLATION', categoryName: 'Constraint', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.show();

      pane.acceptAll();
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');
      expect(df.get(2, 1)).toBe("bad'q1");
      expect(pane.getPendingItems().length).toBe(0);
      expect(pane.style.display).toBe('none');

      // Test global reject on fresh set
      const items2 = [
        { id: 'gr1', x: 0, y: 2, header: 'Col0', oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'WHITESPACE_TRIMMING', categoryName: 'Whitespace', status: 'pending' },
        { id: 'gr2', x: 1, y: 2, header: 'Col1', oldValue: '200,75', newValue: '200.75', category: 'DATA_TYPE_COERCION', categoryName: 'Coercion', status: 'pending' }
      ];
      pane.loadItems(items2);
      pane.show();
      expect(pane.style.display).toBe('flex');

      pane.rejectAll();
      expect(df.get(0, 2)).toBe(' val_0_2 '); // Unchanged
      expect(df.get(1, 2)).toBe('200,75'); // Unchanged
      expect(pane.getPendingItems().length).toBe(0);
      expect(pane.style.display).toBe('none');
    });

    test('Gracefully handles items with missing or undefined category (defaults to OTHER)', () => {
      const items = [
        { id: 'uncat1', x: 3, y: 1, header: 'Col3', oldValue: ' 999 ', newValue: '999', status: 'pending' },
        { id: 'uncat2', x: 3, y: 2, header: 'Col3', oldValue: ' 888 ', newValue: '888', category: null, status: 'pending' }
      ];

      pane.loadItems(items);
      expect(pane.flatItems[0].key).toBe('OTHER');

      pane.acceptCategory('OTHER');
      expect(df.get(3, 1)).toBe('999');
      expect(df.get(3, 2)).toBe('888');
      expect(pane.getPendingItems().length).toBe(0);
    });

    test('Gracefully handles empty calls to acceptCategory, rejectCategory, acceptAll, and rejectAll', () => {
      pane.loadItems([]);
      expect(() => pane.acceptCategory('NON_EXISTENT')).not.toThrow();
      expect(() => pane.rejectCategory('NON_EXISTENT')).not.toThrow();
      expect(() => pane.acceptAll()).not.toThrow();
      expect(() => pane.rejectAll()).not.toThrow();
    });

    test('Stress test with 500 items across 5 categories in batch accept and reject operations', () => {
      const catKeys = ['WHITESPACE', 'COERCION', 'CONSTRAINT', 'DUPLICATE', 'CUSTOM'];
      const stressItems = [];
      for (let i = 0; i < 500; i++) {
        const cat = catKeys[i % 5];
        stressItems.push({
          id: `stress_${i}`,
          x: i % 5,
          y: Math.floor(i / 5) + 1,
          header: `Col${i % 5}`,
          oldValue: `old_${i}`,
          newValue: `new_${i}`,
          category: cat,
          categoryName: cat,
          status: 'pending'
        });
      }

      pane.loadItems(stressItems);
      expect(pane.getPendingItems().length).toBe(500);

      // Accept category WHITESPACE (100 items)
      pane.acceptCategory('WHITESPACE');
      expect(pane.getPendingItems().length).toBe(400);

      // Check transaction created in df undoStack
      const lastCmd = df.undoStack[df.undoStack.length - 1];
      expect(lastCmd.type).toBe('RANGE_EDIT');
      expect(lastCmd.payload.changes.length).toBe(100);

      // Reject category COERCION (100 items)
      pane.rejectCategory('COERCION');
      expect(pane.getPendingItems().length).toBe(300);

      // Accept All remaining (300 items)
      pane.acceptAll();
      expect(pane.getPendingItems().length).toBe(0);
      expect(pane.style.display).toBe('none');
    });
  });

  describe('2. Single-step Undo (df.undo()) and Redo (df.redo()) across Complex Multi-Category Mutations', () => {
    test('Category accept creates single RANGE_EDIT command and undos atomically in one df.undo() step', () => {
      const items = [
        { id: 'u1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'WHITESPACE', status: 'pending' },
        { id: 'u2', x: 0, y: 2, oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'WHITESPACE', status: 'pending' },
        { id: 'u3', x: 0, y: 3, oldValue: ' val_0_3 ', newValue: 'val_0_3', category: 'WHITESPACE', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.acceptCategory('WHITESPACE');

      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(0, 2)).toBe('val_0_2');
      expect(df.get(0, 3)).toBe('val_0_3');

      // Undo batch operation in single step
      df.undo();

      expect(df.get(0, 1)).toBe(' val_0_1 ');
      expect(df.get(0, 2)).toBe(' val_0_2 ');
      expect(df.get(0, 3)).toBe(' val_0_3 ');

      // Redo batch operation in single step
      df.redo();

      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(0, 2)).toBe('val_0_2');
      expect(df.get(0, 3)).toBe('val_0_3');
    });

    test('Global accept creates single RANGE_EDIT command spanning all categories and undos atomically in one df.undo() step', () => {
      const items = [
        { id: 'gu1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT_A', status: 'pending' },
        { id: 'gu2', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT_B', status: 'pending' },
        { id: 'gu3', x: 2, y: 1, oldValue: 'bad"q1', newValue: "bad'q1", category: 'CAT_C', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.acceptAll();

      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');
      expect(df.get(2, 1)).toBe("bad'q1");

      // Verify single atomic RANGE_EDIT transaction
      const rangeCmd = df.undoStack[df.undoStack.length - 1];
      expect(rangeCmd.type).toBe('RANGE_EDIT');
      expect(rangeCmd.payload.changes.length).toBe(3);

      df.undo();

      expect(df.get(0, 1)).toBe(' val_0_1 ');
      expect(df.get(1, 1)).toBe('100,5');
      expect(df.get(2, 1)).toBe('bad"q1');

      df.redo();

      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');
      expect(df.get(2, 1)).toBe("bad'q1");
    });

    test('Multi-step undo/redo stack unwinding across time-spaced category & global batch operations', () => {
      const itemsCat1 = [
        { id: 'm1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT_1', status: 'pending' },
        { id: 'm2', x: 0, y: 2, oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'CAT_1', status: 'pending' }
      ];
      const itemsCat2 = [
        { id: 'm3', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT_2', status: 'pending' },
        { id: 'm4', x: 1, y: 2, oldValue: '200,75', newValue: '200.75', category: 'CAT_2', status: 'pending' }
      ];
      const itemsCat3 = [
        { id: 'm5', x: 2, y: 1, oldValue: 'bad"q1', newValue: "bad'q1", category: 'CAT_3', status: 'pending' }
      ];

      pane.loadItems([...itemsCat1, ...itemsCat2, ...itemsCat3]);

      // Step 1: Accept Cat 1 at t0
      pane.acceptCategory('CAT_1');
      df.undoStack[df.undoStack.length - 1].timestamp = 1000;

      // Step 2: Accept Cat 2 at t0 + 200ms (> MS_DELTA)
      pane.acceptCategory('CAT_2');
      df.undoStack[df.undoStack.length - 1].timestamp = 1200;

      // Step 3: Accept Cat 3 via acceptAll at t0 + 400ms (> MS_DELTA)
      pane.acceptAll();
      df.undoStack[df.undoStack.length - 1].timestamp = 1400;

      // State after all 3 batch actions
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');
      expect(df.get(2, 1)).toBe("bad'q1");

      // Undo Step 3 (acceptAll / Cat 3)
      df.undo();
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');
      expect(df.get(2, 1)).toBe('bad"q1'); // reverted

      // Undo Step 2 (Cat 2)
      df.undo();
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100,5'); // reverted
      expect(df.get(2, 1)).toBe('bad"q1');

      // Undo Step 1 (Cat 1)
      df.undo();
      expect(df.get(0, 1)).toBe(' val_0_1 '); // reverted
      expect(df.get(1, 1)).toBe('100,5');
      expect(df.get(2, 1)).toBe('bad"q1');

      // Redo Step 1
      df.redo();
      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100,5');

      // Redo Step 2
      df.redo();
      expect(df.get(1, 1)).toBe('100.5');

      // Redo Step 3
      df.redo();
      expect(df.get(2, 1)).toBe("bad'q1");
    });

    test('Dataframe MS_DELTA time-window grouping for rapid back-to-back batch actions (< 100ms)', () => {
      const itemsCat1 = [
        { id: 'r1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT_1', status: 'pending' }
      ];
      const itemsCat2 = [
        { id: 'r2', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT_2', status: 'pending' }
      ];

      pane.loadItems([...itemsCat1, ...itemsCat2]);

      // Execute 2 actions with identical/close timestamps (< 100ms)
      pane.acceptCategory('CAT_1');
      df.undoStack[df.undoStack.length - 1].timestamp = 5000;

      pane.acceptCategory('CAT_2');
      df.undoStack[df.undoStack.length - 1].timestamp = 5020; // 20ms delta < MS_DELTA (100ms)

      expect(df.get(0, 1)).toBe('val_0_1');
      expect(df.get(1, 1)).toBe('100.5');

      // Single undo() reverts BOTH actions due to MS_DELTA grouping
      df.undo();
      expect(df.get(0, 1)).toBe(' val_0_1 ');
      expect(df.get(1, 1)).toBe('100,5');
    });

    test('Rejections do not pollute undoStack: df.undo() bypasses rejections and targets previous accept command', () => {
      const items = [
        { id: 'rej_u1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT_A', status: 'pending' },
        { id: 'rej_u2', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT_B', status: 'pending' }
      ];

      pane.loadItems(items);

      // Step 1: Accept CAT_A
      pane.acceptCategory('CAT_A');
      expect(df.undoStack.length).toBe(1);

      // Step 2: Reject CAT_B
      pane.rejectCategory('CAT_B');
      expect(df.undoStack.length).toBe(1); // Stack count un-changed by rejection

      // Executing df.undo() should undo Step 1 (CAT_A)
      df.undo();
      expect(df.get(0, 1)).toBe(' val_0_1 ');
      expect(df.get(1, 1)).toBe('100,5'); // Reject remains unmutated
    });

    test('New mutation after undo truncates redoStack', () => {
      const items = [
        { id: 'trunc1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT_A', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.acceptCategory('CAT_A');
      expect(df.get(0, 1)).toBe('val_0_1');

      df.undo();
      expect(df.get(0, 1)).toBe(' val_0_1 ');
      expect(df.redoStack.length).toBe(1);

      // Perform a new edit on df directly
      df.edit(4, 4, 'manual_edit');
      expect(df.redoStack.length).toBe(0); // Redo stack truncated

      // Calling redo() should do nothing
      df.redo();
      expect(df.get(0, 1)).toBe(' val_0_1 ');
    });

    test('RANGE_EDIT handling of matrix bounds auto-expansion during redo', () => {
      // Create a batch edit proposal targeting coordinates outside current matrix dimensions
      const items = [
        { id: 'expand1', x: 10, y: 10, oldValue: '', newValue: 'expanded_val', category: 'OUT_OF_BOUNDS', status: 'pending' }
      ];

      pane.loadItems(items);
      pane.acceptAll();

      expect(df.width).toBeGreaterThanOrEqual(11);
      expect(df.height).toBeGreaterThanOrEqual(11);
      expect(df.get(10, 10)).toBe('expanded_val');

      df.undo();
      expect(df.get(10, 10)).toBe('');

      df.redo();
      expect(df.get(10, 10)).toBe('expanded_val');
    });
  });

  describe('3. Auto-close Behavior when Pending Items Reach 0', () => {
    test('Auto-close triggers on last individual item accepted', () => {
      const item = { id: 'ac1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT', status: 'pending' };
      pane.loadItems([item]);
      pane.show();
      expect(pane.style.display).toBe('flex');
      expect(StateManager.getState('validationPaneOpen')).toBe(true);

      pane.acceptItem(item);

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Auto-close triggers on last individual item rejected', () => {
      const item = { id: 'ac2', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT', status: 'pending' };
      pane.loadItems([item]);
      pane.show();

      pane.rejectItem(item);

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Auto-close triggers on last category accepted', () => {
      const items = [
        { id: 'ac3', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT1', status: 'pending' },
        { id: 'ac4', x: 0, y: 2, oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'CAT1', status: 'pending' }
      ];
      pane.loadItems(items);
      pane.show();

      pane.acceptCategory('CAT1');

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Auto-close triggers on last category rejected', () => {
      const items = [
        { id: 'ac5', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT1', status: 'pending' },
        { id: 'ac6', x: 0, y: 2, oldValue: ' val_0_2 ', newValue: 'val_0_2', category: 'CAT1', status: 'pending' }
      ];
      pane.loadItems(items);
      pane.show();

      pane.rejectCategory('CAT1');

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Auto-close triggers on acceptAll()', () => {
      const items = [
        { id: 'ac7', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT1', status: 'pending' },
        { id: 'ac8', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT2', status: 'pending' }
      ];
      pane.loadItems(items);
      pane.show();

      pane.acceptAll();

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Auto-close triggers on rejectAll()', () => {
      const items = [
        { id: 'ac9', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT1', status: 'pending' },
        { id: 'ac10', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT2', status: 'pending' }
      ];
      pane.loadItems(items);
      pane.show();

      pane.rejectAll();

      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('Re-loading items after auto-close allows re-opening pane cleanly', () => {
      const item1 = { id: 're1', x: 0, y: 1, oldValue: ' val_0_1 ', newValue: 'val_0_1', category: 'CAT1', status: 'pending' };
      pane.loadItems([item1]);
      pane.show();
      pane.acceptItem(item1);

      expect(pane.style.display).toBe('none');

      // Re-load new items
      const item2 = { id: 're2', x: 1, y: 1, oldValue: '100,5', newValue: '100.5', category: 'CAT2', status: 'pending' };
      pane.loadItems([item2]);
      pane.show();

      expect(pane.style.display).toBe('flex');
      expect(pane.classList.contains('open')).toBe(true);
      expect(pane.getPendingItems().length).toBe(1);
    });
  });
});
