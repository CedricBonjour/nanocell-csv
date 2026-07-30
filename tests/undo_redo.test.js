import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom } from '../app/js/dom.js';

describe('Undo / Redo Command Stack Operations', () => {
  let df;

  beforeEach(() => {
    df = new Dataframe([
      ['R0C0', 'R0C1'],
      ['R1C0', 'R1C1']
    ]);
  });

  // Tier 1: Feature Coverage
  test('Single cell edit pushes action to undoStack and undo reverts change', () => {
    df.edit(0, 0, 'NEW_VAL');
    expect(df.get(0, 0)).toBe('NEW_VAL');
    expect(df.undoStack.length).toBe(1);

    df.undo();
    expect(df.get(0, 0)).toBe('R0C0');
    expect(df.redoStack.length).toBe(1);
  });

  test('redo reapplies undone command payload', () => {
    df.edit(0, 0, 'NEW_VAL');
    df.undo();
    expect(df.get(0, 0)).toBe('R0C0');

    df.redo();
    expect(df.get(0, 0)).toBe('NEW_VAL');
    expect(df.undoStack.length).toBe(1);
  });

  test('insertRow undo and redo maintain table dimensions and stack integrity', () => {
    df.insertRow(1);
    expect(df.height).toBe(3);

    df.undo();
    expect(df.height).toBe(2);

    df.redo();
    expect(df.height).toBe(3);
  });

  test('insertCol undo and redo maintain table dimensions', () => {
    df.insertCol(1);
    expect(df.width).toBe(3);

    df.undo();
    expect(df.width).toBe(2);

    df.redo();
    expect(df.width).toBe(3);
  });

  test('deleteRow undo restores original row data', () => {
    df.deleteRow(0);
    expect(df.height).toBe(1);
    expect(df.get(0, 0)).toBe('R1C0');

    df.undo();
    expect(df.height).toBe(2);
  });

  test('deleteCol undo restores original column data', () => {
    df.deleteCol(0);
    expect(df.width).toBe(1);
    expect(df.get(0, 0)).toBe('R0C1');

    df.undo();
    expect(df.width).toBe(2);
  });

  // Tier 2: Boundary & Corner Cases
  test('New edit clears redoStack when performed after undo', () => {
    df.edit(0, 0, 'EDIT_1');
    df.undo();
    expect(df.redoStack.length).toBe(1);

    df.edit(0, 0, 'EDIT_2');
    expect(df.redoStack.length).toBe(0);
  });

  test('Calling undo on empty stack does not throw or alter dataframe', () => {
    expect(() => {
      df.undo();
    }).not.toThrow();
    expect(df.get(0, 0)).toBe('R0C0');
  });

  test('Calling redo on empty stack does not throw or alter dataframe', () => {
    expect(() => {
      df.redo();
    }).not.toThrow();
    expect(df.get(0, 0)).toBe('R0C0');
  });

  test('Batch undo groups rapid actions within MS_DELTA threshold', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    df.create(() => { df.data[0][0] = 'BATCH_1'; }, () => { df.data[0][0] = 'R0C0'; });
    vi.setSystemTime(now + 10);
    df.create(() => { df.data[0][1] = 'BATCH_2'; }, () => { df.data[0][1] = 'R0C1'; });

    expect(df.undoStack.length).toBe(2);
    df.undo(); // Should undo both because timestamp delta (10ms) < MS_DELTA (100ms)
    expect(df.get(0, 0)).toBe('R0C0');
    expect(df.get(1, 0)).toBe('R0C1');

    vi.useRealTimers();
  });

  // Tier 3: Cross-Feature Combinations
  test('Sheet range edit undo reverts multiple cell modifications across sheet', () => {
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
    build_dom();

    const sheet = new Sheet(df);
    sheet.x = 0;
    sheet.y = 0;
    sheet.rangeEnd = { x: 1, y: 1 };

    // Range edit performs individual cell edits
    sheet.rangeEdit('MULTI');
    expect(df.get(0, 0)).toBe('MULTI');
    expect(df.get(1, 1)).toBe('MULTI');

    df.undo();
    expect(df.get(0, 0)).toBe('R0C0');
    expect(df.get(1, 1)).toBe('R1C1');
  });

  test('Undo and Redo stack state is fully JSON serializable', () => {
    df.edit(0, 0, 'VAL1');
    df.insertRow(1);
    df.insertCol(1);
    df.deleteRow(0);

    expect(() => {
      const json = JSON.stringify(df.undoStack);
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(4);
      expect(parsed[0].type).toBe('EDIT_CELL');
      expect(parsed[0].payload).toBeDefined();
    }).not.toThrow();

    df.undo();
    expect(() => {
      const json = JSON.stringify(df.redoStack);
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    }).not.toThrow();
  });

  test('executeCommand directly handles forward and revert operations for serializable commands', () => {
    const command = {
      type: 'EDIT_CELL',
      timestamp: Date.now(),
      payload: { x: 0, y: 0, oldValue: 'R0C0', newValue: 'DIRECT_EXEC' }
    };

    df.executeCommand(command, false);
    expect(df.get(0, 0)).toBe('DIRECT_EXEC');

    df.executeCommand(command, true);
    expect(df.get(0, 0)).toBe('R0C0');
  });
});
