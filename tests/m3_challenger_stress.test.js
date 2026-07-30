import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import fs from 'fs';
import path from 'path';

function stripJsCommentsAndStrings(code) {
  let result = '';
  let i = 0;
  const len = code.length;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < len) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += '\n';
      } else {
        result += ' ';
      }
      i++;
    } else if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        result += '  ';
        i += 2;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (inSingle) {
      if (ch === '\\') {
        result += '  ';
        i += 2;
      } else if (ch === '\'') {
        inSingle = false;
        result += ' ';
        i++;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (inDouble) {
      if (ch === '\\') {
        result += '  ';
        i += 2;
      } else if (ch === '"') {
        inDouble = false;
        result += ' ';
        i++;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (inTemplate) {
      if (ch === '\\') {
        result += '  ';
        i += 2;
      } else if (ch === '`') {
        inTemplate = false;
        result += ' ';
        i++;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i++;
      }
    } else {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        result += '  ';
        i += 2;
      } else if (ch === '/' && next === '*') {
        inBlockComment = true;
        result += '  ';
        i += 2;
      } else if (ch === '\'') {
        inSingle = true;
        result += ' ';
        i++;
      } else if (ch === '"') {
        inDouble = true;
        result += ' ';
        i++;
      } else if (ch === '`') {
        inTemplate = true;
        result += ' ';
        i++;
      } else {
        result += ch;
        i++;
      }
    }
  }
  return result;
}

describe('Milestone 3 Empirical Stress Tests & Static Analysis', () => {

  describe('1. Command Serialization Stress Test', () => {
    let df;
    const initialGrid = [
      ['A1', 'B1', 'C1', 'D1'],
      ['A2', 'B2', 'C2', 'D2'],
      ['A3', 'B3', 'C3', 'D3'],
      ['A4', 'B4', 'C4', 'D4']
    ];

    beforeEach(() => {
      df = new Dataframe(initialGrid.map(row => [...row]));
    });

    test('Complex sequence of commands serializes to JSON and restores initial/final states via undo/redo', () => {
      let mockTime = 1000000;
      vi.useFakeTimers();
      vi.setSystemTime(mockTime);

      const advanceTime = () => {
        mockTime += 200; // > Dataframe.MS_DELTA (100ms) to treat each command as distinct undo step
        vi.setSystemTime(mockTime);
      };

      const initialSnapshot = JSON.stringify(df.data);

      advanceTime();
      df.edit(0, 0, 'MOD_A1');

      advanceTime();
      df.edit(3, 3, 'MOD_D4');

      advanceTime();
      df.insertRow(2);

      advanceTime();
      df.edit(0, 2, 'NEW_ROW_CELL');

      advanceTime();
      df.insertCol(1);

      advanceTime();
      df.edit(1, 0, 'NEW_COL_CELL');

      advanceTime();
      df.deleteRow(0);

      advanceTime();
      df.deleteCol(2);

      advanceTime();
      df.shiftRow(1);

      advanceTime();
      df.shiftCol(0);

      advanceTime();
      df.pushRow();

      advanceTime();
      df.pushCol();

      advanceTime();
      df.order([df.height - 1, ...Array.from({ length: df.height - 1 }, (_, i) => i)]);

      advanceTime();
      df.create({
        type: 'RANGE_EDIT',
        timestamp: mockTime,
        payload: {
          changes: [
            { x: 0, y: 0, oldValue: df.get(0, 0), newValue: 'RANGE_1' },
            { x: 1, y: 1, oldValue: df.get(1, 1), newValue: 'RANGE_2' }
          ]
        }
      });

      const finalSnapshot = JSON.stringify(df.data);
      expect(df.undoStack.length).toBeGreaterThan(10);

      // Serialize undoStack to JSON and deserialize
      const jsonString = JSON.stringify(df.undoStack);
      const restoredUndoStack = JSON.parse(jsonString);

      // Reconstruct dataframe and assign deserialized stack
      const restoredDf = new Dataframe(JSON.parse(finalSnapshot));
      restoredDf.undoStack = restoredUndoStack;
      restoredDf.redoStack = [];

      // Step-by-step undo test: execute undo until undoStack is empty
      let undoCount = 0;
      while (restoredDf.undoStack.length > 0) {
        restoredDf.undo();
        mockTime -= 200;
        vi.setSystemTime(mockTime);
        undoCount++;
      }

      expect(undoCount).toBeGreaterThan(10);
      expect(JSON.stringify(restoredDf.data)).toBe(initialSnapshot);

      // Step-by-step redo test: execute redo until redoStack is empty
      let redoCount = 0;
      while (restoredDf.redoStack.length > 0) {
        restoredDf.redo();
        mockTime += 200;
        vi.setSystemTime(mockTime);
        redoCount++;
      }

      expect(redoCount).toBe(undoCount);
      expect(JSON.stringify(restoredDf.data)).toBe(finalSnapshot);

      vi.useRealTimers();
    });

    test('Dataframe executeCommand direct execution with JSON deserialized commands', () => {
      // Create a Sequence of commands matching valid grid dimensions (4x4)
      const commands = [
        { type: 'EDIT_CELL', timestamp: 1, payload: { x: 0, y: 0, oldValue: 'A1', newValue: 'TEST_EDIT' } },
        { type: 'INSERT_ROW', timestamp: 2, payload: { index: 1 } },
        { type: 'DELETE_ROW', timestamp: 3, payload: { index: 1, rowData: ['', '', '', ''] } },
        { type: 'INSERT_COL', timestamp: 4, payload: { index: 0 } },
        { type: 'DELETE_COL', timestamp: 5, payload: { index: 0, colData: ['', 'A2', 'A3', 'A4'] } },
        { type: 'SHIFT_ROW', timestamp: 6, payload: { index: 0 } },
        { type: 'SHIFT_COL', timestamp: 7, payload: { index: 0 } },
        { type: 'ORDER_ROWS', timestamp: 8, payload: { newOrder: [3, 2, 1, 0], oldOrder: [3, 2, 1, 0] } }
      ];

      // Roundtrip through JSON
      const serialized = JSON.parse(JSON.stringify(commands));
      const testDf = new Dataframe(initialGrid.map(row => [...row]));
      const origData = JSON.stringify(testDf.data);

      // Execute forward
      for (const cmd of serialized) {
        testDf.executeCommand(cmd, false);
      }
      const forwardData = JSON.stringify(testDf.data);
      expect(forwardData).not.toBe(origData);

      // Execute revert in reverse order
      for (let i = serialized.length - 1; i >= 0; i--) {
        testDf.executeCommand(serialized[i], true);
      }
      expect(JSON.stringify(testDf.data)).toBe(origData);
    });
  });

  describe('2. Static AST / Regex Scan for `var` Keyword', () => {
    function getJsFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getJsFiles(fullPath));
        } else if (file.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    test('Zero `var` keyword variable declarations in app/js/', () => {
      const appJsDir = path.resolve(__dirname, '../app/js');
      const files = getJsFiles(appJsDir);
      const varViolations = [];
      const varRegex = /\bvar\b/;

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const stripped = stripJsCommentsAndStrings(content);
        const lines = stripped.split('\n');

        lines.forEach((line, idx) => {
          if (varRegex.test(line)) {
            const relPath = path.relative(appJsDir, filePath);
            varViolations.push(`${relPath}:${idx + 1}: ${fs.readFileSync(filePath, 'utf-8').split('\n')[idx].trim()}`);
          }
        });
      }

      expect(varViolations, `Found 'var' variable declarations:\n${varViolations.join('\n')}`).toEqual([]);
    });
  });

  describe('3. Static Scan for Empty Catch Blocks', () => {
    function getJsFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getJsFiles(fullPath));
        } else if (file.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    test('Zero empty catch blocks in app/js/', () => {
      const appJsDir = path.resolve(__dirname, '../app/js');
      const files = getJsFiles(appJsDir);
      const emptyCatchViolations = [];

      const catchRegex = /catch\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g;

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = catchRegex.exec(content)) !== null) {
          const catchBody = match[2];
          const strippedBody = catchBody
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*/g, '')
            .trim();

          if (strippedBody.length === 0) {
            const relPath = path.relative(appJsDir, filePath);
            const lineNum = content.substring(0, match.index).split('\n').length;
            emptyCatchViolations.push(`${relPath}:${lineNum}`);
          }
        }
      }

      expect(emptyCatchViolations, `Found empty catch blocks:\n${emptyCatchViolations.join('\n')}`).toEqual([]);
    });
  });
});
