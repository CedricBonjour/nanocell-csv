import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { stg } from '../app/js/Setting.js';

describe('Dataframe Core Operations', () => {
  let df;

  beforeEach(() => {
    stg.autoRound = false;
    df = new Dataframe([
      ['A1', 'B1', 'C1'],
      ['A2', 'B2', 'C2'],
      ['A3', 'B3', 'C3']
    ]);
  });

  // Tier 1: Feature Coverage
  test('get retrieves correct values and handles out-of-bounds', () => {
    expect(df.get(0, 0)).toBe('A1');
    expect(df.get(2, 2)).toBe('C3');
    expect(df.get(3, 0)).toBe('');
    expect(df.get(-1, 0)).toBe('');
    expect(df.get(0, 10)).toBe('');
  });

  test('edit updates cell value and adjusts matrix dimensions if needed', () => {
    df.edit(1, 1, 'UPDATED');
    expect(df.get(1, 1)).toBe('UPDATED');
    expect(df.isSaved).toBe(false);

    // Auto expand width/height
    df.edit(4, 0, 'EXPANDED_COL');
    expect(df.width).toBe(5);
    expect(df.get(4, 0)).toBe('EXPANDED_COL');
  });

  test('insertRow and insertCol add empty rows and columns at specified indices', () => {
    df.insertRow(1);
    expect(df.height).toBe(4);
    expect(df.get(0, 1)).toBe('');
    expect(df.get(0, 2)).toBe('A2');

    df.insertCol(1);
    expect(df.width).toBe(4);
    expect(df.get(1, 0)).toBe('');
    expect(df.get(2, 0)).toBe('B1');
  });

  test('pushRow and pushCol append empty row and empty column at matrix boundaries', () => {
    df.pushRow();
    expect(df.height).toBe(4);
    expect(df.get(0, 3)).toBe('');

    df.pushCol();
    expect(df.width).toBe(4);
    expect(df.get(3, 0)).toBe('');
  });

  test('deleteRow and deleteCol remove rows and columns', () => {
    df.deleteRow(0);
    expect(df.height).toBe(2);
    expect(df.get(0, 0)).toBe('A2');

    df.deleteCol(0);
    expect(df.width).toBe(2);
    expect(df.get(0, 0)).toBe('B2');
  });

  test('shiftRow and shiftCol swap adjacent rows and columns', () => {
    df.shiftRow(0);
    expect(df.get(0, 0)).toBe('A2');
    expect(df.get(0, 1)).toBe('A1');

    df.shiftCol(0);
    expect(df.get(0, 0)).toBe('B2');
    expect(df.get(1, 0)).toBe('A2');
  });

  // Tier 2: Boundary & Corner Cases
  test('shiftRow and shiftCol ignore out-of-bound or max index shift calls', () => {
    df.shiftRow(-1);
    expect(df.get(0, 0)).toBe('A1');

    df.shiftRow(5);
    expect(df.get(0, 0)).toBe('A1');

    df.shiftCol(-1);
    expect(df.get(0, 0)).toBe('A1');

    df.shiftCol(5);
    expect(df.get(0, 0)).toBe('A1');
  });

  test('square pads all rows to maximum width', () => {
    const unalignedDf = new Dataframe([
      ['A1'],
      ['A2', 'B2', 'C2', 'D2'],
      ['A3', 'B3']
    ]);
    expect(unalignedDf.width).toBe(4);
    expect(unalignedDf.get(1, 0)).toBe('');
    expect(unalignedDf.get(3, 0)).toBe('');
  });

  test('trimAll removes completely empty rows and columns from margins', () => {
    const paddedDf = new Dataframe([
      ['A1', 'B1', ''],
      ['A2', 'B2', ''],
      ['', '', '']
    ]);
    paddedDf.trimAll();
    expect(paddedDf.height).toBe(2);
    expect(paddedDf.width).toBe(2);
    expect(paddedDf.get(0, 0)).toBe('A1');
    expect(paddedDf.get(1, 1)).toBe('B2');
  });

  test('deleteRow and deleteCol do not delete below minimum dimension of 1', () => {
    const singleCellDf = new Dataframe([['ONLY']]);
    singleCellDf.deleteRow(0);
    expect(singleCellDf.height).toBe(1);
    singleCellDf.deleteCol(0);
    expect(singleCellDf.width).toBe(1);
  });

  test('locked dataframe prevents edit and trim operations', () => {
    df.lock = true;
    df.edit(0, 0, 'LOCKED_VALUE');
    expect(df.get(0, 0)).toBe('A1');
    df.trimAll();
    expect(df.height).toBe(3);
  });

  test('getAll iterates through every single cell in dataframe', () => {
    const visited = [];
    df.getAll((val, x, y) => {
      visited.push({ val, x, y });
    });
    expect(visited.length).toBe(9);
    expect(visited[0]).toEqual({ val: 'A1', x: 0, y: 0 });
    expect(visited[8]).toEqual({ val: 'C3', x: 2, y: 2 });
  });

  // Tier 3: Cross-Feature Combinations
  test('order reorders rows according to new index array', () => {
    df.order([2, 0, 1]);
    expect(df.get(0, 0)).toBe('A3');
    expect(df.get(0, 1)).toBe('A1');
    expect(df.get(0, 2)).toBe('A2');
  });

  test('editing cell with autoRound rounds numeric formulas', () => {
    stg.autoRound = true;
    df.edit(0, 0, '=3.14159265');
    expect(df.get(0, 0)).toContain('3.14');
  });
});
