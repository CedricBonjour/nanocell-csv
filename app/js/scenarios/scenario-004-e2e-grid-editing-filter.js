/**
 * @file app/js/scenarios/scenario-004-e2e-grid-editing-filter.js
 * E2E Scenario 004: Grid Editing, Find/Replace & Filtering
 */

export const scenario004 = {
  id: '004',
  alias: 'e2e-grid-editing-filter',
  category: 'e2e',
  title: 'E2E Grid Editing, Find/Replace & Filtering',
  description: 'End-to-end test of series expansion, inline editing, column shifting, Find & Replace, live filtering, and empty row/col trimming.',
  csv: [
    'seq,hub,region,load,',
    '10,Hub A,US-East,85,',
    '20,Hub B,EU-West,92,',
    ',Hub C,US-East,78,',
    ',Hub D,AP-South,88,',
    ',Hub E,US-East,95,',
    ',,,,',
  ].join('\n'),
  steps: [
    { type: 'selectRange', xmin: 0, ymin: 1, xmax: 0, ymax: 5, caption: 'Select series range in Col 1 (10, 20, ...)', wait: 600 },
    { type: 'cmd', cmdId: 'expand', caption: 'Expand numeric series 10..50 (Ctrl+E)', wait: 700 },
    { type: 'editCell', x: 1, y: 2, value: 'Euro Central', caption: 'Inline edit cell (2, 3) to "Euro Central"', wait: 700 },
    { type: 'selectCell', x: 2, y: 1, caption: 'Select region column', wait: 500 },
    { type: 'cmd', cmdId: 'shiftRight', caption: 'Shift column right (Alt+Right)', wait: 600 },
    { type: 'cmd', cmdId: 'shiftLeft', caption: 'Shift column back left (Alt+Left)', wait: 600 },
    { type: 'findReplace', term: 'US-East', replacement: 'NA-East', caption: 'Find "US-East" and Replace All with "NA-East"', wait: 800 },
    { type: 'filter', col: 2, query: 'NA-East', caption: 'Filter Col 3 by "NA-East" (3 matching rows)', wait: 900 },
    {
      type: 'assert',
      caption: 'Verify active filter row count and lock state',
      check: (_df, sheet) => {
        if (!sheet?.filterRows || sheet.filterRows.length !== 3) {
          throw new Error(`Expected 3 filtered rows, got ${sheet?.filterRows?.length}`);
        }
        if (!sheet.df.lock) throw new Error('Expected sheet to be locked while filter is active');
      },
    },
    { type: 'clearFilter', caption: 'Close filter and unlock sheet', wait: 600 },
    { type: 'cmd', cmdId: 'trim', caption: 'Trim empty trailing rows and columns (Ctrl+Alt+T)', wait: 700 },
    {
      type: 'assert',
      caption: 'Verify series expansion, edit, replacement, and trimmed dimensions',
      check: (df) => {
        if (df.width !== 4 || df.height !== 6) throw new Error(`Expected 4x6 after trim, got ${df.width}x${df.height}`);
        if (df.get(0, 5) !== '50') throw new Error(`Expected series end 50, got ${df.get(0, 5)}`);
        if (df.get(1, 2) !== 'Euro Central') throw new Error(`Expected "Euro Central", got ${df.get(1, 2)}`);
        if (df.get(2, 1) !== 'NA-East') throw new Error(`Expected "NA-East", got ${df.get(2, 1)}`);
      },
    },
  ],
};
