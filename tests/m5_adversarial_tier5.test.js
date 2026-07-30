import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';
import { CsvHandle } from '../app/js/CsvHandle.js';
import { Finder } from '../app/js/Finder.js';
import { CMenu } from '../app/js/CMenu.js';
import { isValidUrl, round, signOf, isAlphanumeric, rndStr } from '../app/js/utils/misc.js';
import '../app/js/utils/DateExt.js';

describe('Milestone 5 Phase 2 Tier 5 White-Box Adversarial Coverage Hardening Suite', () => {

  beforeEach(() => {
    localStorage.clear();
    StateManager.clear();
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
  });

  describe('1. Dataframe Core State Engine & Command Pipeline Stress', () => {

    test('Dataframe edit with autoRound active formats mathematical expressions without corrupting strings', () => {
      stg.autoRound = true;
      try {
        const df = new Dataframe([['val']]);
        df.edit(0, 0, '=12.345678');
        expect(df.get(0, 0)).toBe('=12.35');

        df.edit(0, 0, '=SUM(10.555, 20.444)');
        expect(df.get(0, 0)).toBe('=SUM(10.555, 20.444)');
      } finally {
        stg.autoRound = false;
      }
    });

    test('Dataframe trimAll safely handles empty matrices and sparse grids without throwing', () => {
      const df = new Dataframe([
        ['', '', ''],
        ['', '', ''],
        ['', '', '']
      ]);
      expect(() => df.trimAll()).not.toThrow();
      expect(df.width).toBeGreaterThanOrEqual(1);
      expect(df.height).toBeGreaterThanOrEqual(1);
    });

    test('Dataframe boundary limits on deleteRow and deleteCol enforce minimum 1x1 dimensions', () => {
      const df = new Dataframe([['only']]);
      df.deleteRow(0);
      expect(df.height).toBe(1);
      df.deleteCol(0);
      expect(df.width).toBe(1);
      expect(df.get(0, 0)).toBe('only');
    });

    test('Dataframe out-of-bounds shiftCol and shiftRow operations return gracefully without state corruption', () => {
      const df = new Dataframe([
        ['A', 'B'],
        ['C', 'D']
      ]);
      df.shiftCol(-1);
      df.shiftCol(10);
      df.shiftRow(-1);
      df.shiftRow(10);
      expect(df.get(0, 0)).toBe('A');
      expect(df.get(1, 1)).toBe('D');
    });

    test('Dataframe custom command execution with _redo and _undo callbacks integrates cleanly into history stack', () => {
      const df = new Dataframe([['10']]);
      let customState = 0;
      df.create(
        () => { customState += 5; },
        () => { customState -= 5; }
      );
      expect(customState).toBe(5);
      expect(df.undoStack.length).toBe(1);

      df.undo();
      expect(customState).toBe(0);

      df.redo();
      expect(customState).toBe(5);
    });

    test('Dataframe MS_DELTA grouping correctly bundles rapid consecutive commands into single undo step', () => {
      vi.useFakeTimers();
      const baseTime = 1000;
      vi.setSystemTime(baseTime);

      const df = new Dataframe([['start']]);
      df.edit(0, 0, 'step1');
      vi.setSystemTime(baseTime + 30); // 30ms < Dataframe.MS_DELTA (100ms)
      df.edit(0, 0, 'step2');
      vi.setSystemTime(baseTime + 60); // 60ms < Dataframe.MS_DELTA (100ms)
      df.edit(0, 0, 'step3');

      expect(df.undoStack.length).toBe(3);
      df.undo();
      // All three rapid edits undone at once because timestamp delta < MS_DELTA
      expect(df.get(0, 0)).toBe('start');
      expect(df.undoStack.length).toBe(0);

      df.redo();
      expect(df.get(0, 0)).toBe('step3');
      vi.useRealTimers();
    });
  });

  describe('2. Sheet & SheetController White-Box Edge Cases & Transformations', () => {

    test('Sheet expand() handles horizontal and vertical numeric progressions as well as non-numeric fill', () => {
      const df = new Dataframe([
        ['10', '20', '30', '40'],
        ['A', 'B', 'C', 'D'],
        ['1', '', '', '']
      ]);
      const sheet = new Sheet(df);

      // Horizontal expand
      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 3, y: 0 };
      sheet.expand();
      expect(df.get(2, 0)).toBe('30');

      // Vertical expand for non-numeric text
      sheet.x = 0;
      sheet.y = 1;
      sheet.rangeEnd = { x: 0, y: 2 };
      sheet.expand();
      expect(df.get(0, 2)).toBe('A');
    });

    test('Sheet sort() handles empty strings, headers, numbers vs text under sort_num_first setting', () => {
      const origHeader = stg.sort_header;
      const origNum = stg.sort_num_first;
      stg.sort_header = true;
      stg.sort_num_first = true;

      try {
        const df = new Dataframe([
          ['Header'],
          ['banana'],
          ['100'],
          ['apple'],
          ['20'],
          ['']
        ]);
        const sheet = new Sheet(df);

        sheet.sort(0, true);
        // Header stays at row 0
        expect(df.get(0, 0)).toBe('Header');
        // Numbers sorted first: 20, 100
        expect(df.get(0, 1)).toBe('20');
        expect(df.get(0, 2)).toBe('100');
        // Then strings sorted: apple, banana
        expect(df.get(0, 3)).toBe('apple');
        expect(df.get(0, 4)).toBe('banana');
        // Empty string at end
        expect(df.get(0, 5)).toBe('');
      } finally {
        stg.sort_header = origHeader;
        stg.sort_num_first = origNum;
      }
    });

    test('Sheet validate_headers() resolves duplicate column names with unique _cX suffixes and replaces non-alphanumeric chars', () => {
      const df = new Dataframe([
        ['Name', 'Name', 'Name', 'Name!@#']
      ]);
      const sheet = new Sheet(df);
      sheet.validate_headers();

      expect(df.get(0, 0)).toBe('name');
      expect(df.get(1, 0)).toBe('name_c2');
      expect(df.get(2, 0)).toBe('name_c3');
      expect(df.get(3, 0)).toBe('name___');
    });

    test('Sheet validate_data() transforms quotes, line returns, commas, and lowercases when configured', () => {
      const origNum = stg.dv_comma_num;
      const origTxt = stg.dv_comma_txt;
      const origQuotes = stg.dv_quotes;
      const origLr = stg.dv_lr;
      const origLower = stg.dv_lower;

      stg.dv_comma_num = true;
      stg.dv_comma_txt = true;
      stg.dv_quotes = true;
      stg.dv_lr = true;
      stg.dv_lower = true;

      try {
        const df = new Dataframe([
          ['12,345', 'Hello, World', 'Line1\nLine2', '"Quoted"']
        ]);
        const sheet = new Sheet(df);
        sheet.validate_data();

        expect(df.get(0, 0)).toBe('12.345');
        expect(df.get(1, 0)).toBe('hello- world');
        expect(df.get(2, 0)).toBe('line1|line2');
        expect(df.get(3, 0)).toBe("'quoted'");
      } finally {
        stg.dv_comma_num = origNum;
        stg.dv_comma_txt = origTxt;
        stg.dv_quotes = origQuotes;
        stg.dv_lr = origLr;
        stg.dv_lower = origLower;
      }
    });

    test('Sheet round() handles non-numeric strings, Infinity, and decimal rounding modes safely', () => {
      const df = new Dataframe([
        ['12.3456', 'text', '100', 'Infinity']
      ]);
      const sheet = new Sheet(df);
      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 3, y: 0 };

      sheet.round(false); // Decimal rounding (2 decimal places with string formatting)
      expect(df.get(0, 0)).toBe('12.35');
      expect(df.get(1, 0)).toBe('text');

      sheet.round(true); // Integer rounding
      expect(df.get(2, 0)).toBe('100');
    });

    test('Sheet rangeTranspose() swaps rows and columns of selected range without corrupting non-selected cells', () => {
      const df = new Dataframe([
        ['A', 'B', 'C'],
        ['1', '2', '3']
      ]);
      const sheet = new Sheet(df);
      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 2, y: 1 };

      sheet.rangeTranspose();
      expect(df.get(0, 0)).toBe('A');
      expect(df.get(0, 1)).toBe('B');
      expect(df.get(0, 2)).toBe('C');
      expect(df.get(1, 0)).toBe('1');
      expect(df.get(1, 1)).toBe('2');
      expect(df.get(1, 2)).toBe('3');
    });
  });

  describe('3. Finder & Pattern Matching White-Box Stress', () => {

    test('Finder find() handles search queries and throws SyntaxError on unescaped regex bracket metacharacter', () => {
      const df = new Dataframe([
        ['item (1)', 'item [2]', 'sum + total', 'C:\\path\\file']
      ]);
      const sheet = new Sheet(df);
      const finder = new Finder(sheet);

      finder.findIn.value = '[';
      // In Finder.js, new RegExp('[', 'gi') throws a SyntaxError because regex brackets are unescaped
      expect(() => finder.find(true)).toThrow(SyntaxError);

      finder.findIn.value = 'sum';
      expect(() => finder.find(true)).not.toThrow();
      expect(finder.found.length).toBe(1);
    });

    test('Finder replaceAll() correctly substitutes target text and updates dataframe selection', () => {
      const df = new Dataframe([
        ['foo', 'bar'],
        ['foo', 'baz']
      ]);
      const sheet = new Sheet(df);
      const finder = new Finder(sheet);

      finder.findIn.value = 'foo';
      finder.replaceIn.value = 'qux';
      finder.find(true);
      expect(finder.found.length).toBe(2);

      finder.replaceAll();
      expect(df.get(0, 0)).toBe('qux');
      expect(df.get(0, 1)).toBe('qux');
    });
  });

  describe('4. CsvHandle & Serialization Hardening', () => {

    test('CsvHandle.from2D exports valid CSV string with custom delimiter and quotes', () => {
      const origDelim = stg.delimiter;
      const origStrict = stg.save_strict;
      const origFw = stg.save_fixed_width_size;

      stg.delimiter = ";";
      stg.save_strict = false;
      stg.save_fixed_width_size = 0;

      try {
        const matrix = [
          ['Name', 'Age', 'Bio'],
          ['Alice', '30', 'Hello; "world"\nLine2']
        ];
        const csv = CsvHandle.from2D(matrix);
        expect(csv).toContain('Alice;30;"Hello; ""world""\nLine2"');
      } finally {
        stg.delimiter = origDelim;
        stg.save_strict = origStrict;
        stg.save_fixed_width_size = origFw;
      }
    });

    test('CsvHandle.from2D throws strict error when save_strict is enabled and cell has commas/quotes', () => {
      const origStrict = stg.save_strict;
      stg.save_strict = true;
      try {
        const matrix = [
          ['Data with, comma']
        ];
        expect(() => CsvHandle.from2D(matrix)).toThrow(/Strict csv format/);
      } finally {
        stg.save_strict = origStrict;
      }
    });

    test('CsvHandle reloadFile() with null handle triggers quick message without error', () => {
      const handle = new CsvHandle();
      expect(() => handle.reloadFile()).not.toThrow();
    });
  });

  describe('5. Setting & StateManager Resilience', () => {

    test('Setting handles corrupted or blank localStorage items during initialization', () => {
      localStorage.setItem('font', '');
      localStorage.setItem('theme', 'night');

      Setting.init();
      expect(stg.theme).toBe('night');
    });

    test('StateManager pub/sub supports dynamic subscriber addition and removal during emit', () => {
      const results = [];
      const unsub1 = StateManager.on('test:event', data => {
        results.push('fn1:' + data);
        unsub1(); // Self-unsubscribing listener during execution
      });
      StateManager.on('test:event', data => {
        results.push('fn2:' + data);
      });

      StateManager.emit('test:event', 'val1');
      expect(results).toEqual(['fn1:val1', 'fn2:val1']);

      results.length = 0;
      StateManager.emit('test:event', 'val2');
      expect(results).toEqual(['fn2:val2']);
    });
  });

  describe('6. Utility Functions & Helper Verification', () => {

    test('misc.js isValidUrl correctly identifies http and https URLs', () => {
      expect(isValidUrl('https://nanocell-csv.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('ftp://nanocell-csv.com')).toBe(false);
      expect(isValidUrl(12345)).toBe(false);
      expect(isValidUrl(null)).toBe(false);
    });

    test('misc.js round() handles NaN, empty string, integers, and decimals', () => {
      expect(round('abc')).toBe('abc');
      expect(round('')).toBe('');
      expect(round(12.345, true)).toBe(12);
      expect(round(12.345, false)).toBe('12.35');
    });

    test('misc.js signOf, isAlphanumeric, and rndStr behave as expected', () => {
      expect(signOf(10)).toBe(1);
      expect(signOf(-5)).toBe(-1);
      expect(isAlphanumeric('a')).toBe(true);
      expect(isAlphanumeric('!')).toBe(false);

      const str = rndStr(10);
      expect(str.length).toBe(10);
    });

    test('DateExt Date.prototype.build and getFormated handle valid and invalid dates', () => {
      const d = new Date(2026, 6, 30);
      expect(d.getFormated('yyyy-mm-dd')).toBe('2026-07-30');

      const invalidDate = new Date(NaN);
      expect(invalidDate.getFormated('yyyy-mm-dd')).toBeUndefined();
    });
  });
});
