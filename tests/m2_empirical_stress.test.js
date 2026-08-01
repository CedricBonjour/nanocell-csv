import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 2 Empirical Stress & Edge Case Test Suite', () => {
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
    build_dom();

    // Mock scroller elements in dom.content if missing
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
  });

  // --------------------------------------------------------------------------
  // STRESS 1: High Data Volume & Rapid Viewport Scrolling
  // --------------------------------------------------------------------------
  describe('High Volume & Rapid Viewport Scrolling Stress', () => {
    test('Handles 10,000 rows x 100 columns dataframe creation and rapid scrolling', () => {
      const rows = [];
      const numRows = 10000;
      const numCols = 100;
      for (let r = 0; r < numRows; r++) {
        const row = [];
        for (let c = 0; c < numCols; c++) {
          row.push(`R${r}C${c}`);
        }
        rows.push(row);
      }
      df = new Dataframe(rows);
      sheet = new Sheet(df);

      expect(sheet.df.height).toBe(10000);
      expect(sheet.df.width).toBe(100);

      // Simulate 500 rapid scroll events (vertical & horizontal)
      for (let i = 0; i < 250; i++) {
        sheet.scroll({ deltaX: 0, deltaY: 160, ctrlKey: false, altKey: false, preventDefault: () => {} });
      }
      expect(sheet.baseY).toBe(2500);

      for (let i = 0; i < 250; i++) {
        sheet.scroll({ deltaX: 160, deltaY: 0, ctrlKey: false, altKey: false, preventDefault: () => {} });
      }
      expect(sheet.baseX).toBe(2500 < df.width ? 2500 : df.width - 1); // setBaseX clamps to df.width - 1 = 99
      expect(sheet.baseX).toBe(99);

      // Scroll far backwards (-3200 deltaY / 16 coef = -200)
      sheet.scroll({ deltaX: -3200, deltaY: -3200, ctrlKey: false, altKey: false, preventDefault: () => {} });
      expect(sheet.baseX).toBe(0);
      expect(sheet.baseY).toBe(2300); // 2500 - 200 = 2300

      // Reset to (0,0)
      sheet.baseX = 0;
      sheet.baseY = 0;
      expect(sheet.baseX).toBe(0);
      expect(sheet.baseY).toBe(0);

      // Verify DOM cell rendering correctness at current viewport
      sheet.loadCell(sheet.rows[1].cells[1], 0, 0);
      const cell00 = sheet.rows[1].cells[1];
      expect(cell00.textContent).toBe('R0C0');
    });

    test('Scrollbar refresh does not crash or produce invalid styles on huge data', () => {
      const data = Array.from({ length: 5000 }, (_, r) => Array.from({ length: 50 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);

      sheet.baseY = 2500;
      sheet.baseX = 25;
      sheet.scrollbarRefresh();

      expect(dom.content.scrollerY.style.display).toBe('block');
      expect(dom.content.scrollerX.style.display).toBe('block');
      expect(dom.content.scrollerY.style.top).not.toContain('NaN');
      expect(dom.content.scrollerX.style.left).not.toContain('NaN');
    });
  });

  // --------------------------------------------------------------------------
  // STRESS 2: Viewport Recalculation under Resize & Zoom
  // --------------------------------------------------------------------------
  describe('Viewport Recalculation & Resize Stress', () => {
    test('Dynamic nViewCols and nViewRows resizing rebuilds grid cleanly', () => {
      df = new Dataframe(Array.from({ length: 50 }, (_, r) => Array.from({ length: 20 }, (_, c) => `cell_${r}_${c}`)));
      sheet = new Sheet(df);

      // Default view rows/cols
      const initialRows = sheet.rows.length;
      const initialCols = sheet.rows[0].cells.length;

      // Simulate viewport zoom out (increasing visible rows/cols via Ctrl+Wheel)
      sheet.scroll({ deltaX: 0, deltaY: 100, ctrlKey: true, shiftKey: false, preventDefault: () => {} });
      expect(sheet.nViewCols).toBe(stg.cols + 1);

      sheet.scroll({ deltaX: 0, deltaY: 100, ctrlKey: true, shiftKey: true, preventDefault: () => {} });
      expect(sheet.nViewRows).toBe(stg.rows + 1);

      sheet.reload();
      expect(sheet.rows.length).toBe(stg.rows + 2); // nViewRows + 1 header row
      expect(sheet.rows[0].cells.length).toBe(stg.cols + 2); // nViewCols + 1 header col
    });

    test('equal-width rendering and expandedCol double-click toggle under stress', () => {
      df = new Dataframe([
        ['Short', 'VeryVeryVeryLongColumnHeaderNameHere', 'Med'],
        ['1', '2', '3']
      ]);
      sheet = new Sheet(df);
      sheet.reload();
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);

      // Equal width verification
      const expectedWidth = `${100.0 / sheet.nViewCols}%`;
      expect(sheet.rows[0].cells[1].style.width).toBe(expectedWidth);
      expect(sheet.rows[0].cells[2].style.width).toBe(expectedWidth);
      expect(sheet.expandedCol).toBeNull();

      // Double-click column 1 header under stress
      const colHeader1 = sheet.rows[0].cells[2]; // tx: 1
      const dblclickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
      Object.defineProperty(dblclickEvent, 'target', { value: colHeader1, enumerable: true });
      sheet.dispatchEvent(dblclickEvent);
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);

      expect(sheet.expandedCol).toBe(1);
      expect(colHeader1.style.width).toBe('100%');
      expect(sheet.rows[0].cells[1].style.width).toBe('0%');

      // Double-click column 1 header again to restore equal width
      sheet.dispatchEvent(dblclickEvent);
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);
      expect(sheet.expandedCol).toBeNull();
      expect(colHeader1.style.width).toBe(expectedWidth);
    });

    test('cellInView and bestInputCell accurately calculate visibility during viewport shift', () => {
      df = new Dataframe(Array.from({ length: 100 }, (_, r) => Array.from({ length: 20 }, (_, c) => `val_${r}_${c}`)));
      sheet = new Sheet(df);

      sheet.baseX = 10;
      sheet.baseY = 20;

      expect(sheet.cellInView(10, 20)).toBe(true);
      expect(sheet.cellInView(9, 20)).toBe(false);
      expect(sheet.cellInView(10, 19)).toBe(false);

      sheet.x = 10;
      sheet.y = 20;
      expect(sheet.bestInputCell()).toBeDefined();

      sheet.x = 0;
      sheet.y = 0;
      expect(sheet.bestInputCell()).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // STRESS 3: Cell Editing & Input Stress
  // --------------------------------------------------------------------------
  describe('Cell Editing & XSS Prevention Stress', () => {
    test('Rapid cell inline editing updates dataframe and dispatches StateManager events', () => {
      df = new Dataframe([
        ['A', 'B'],
        ['C', 'D']
      ]);
      sheet = new Sheet(df);

      let editEventFired = false;
      let dfEventFired = false;

      StateManager.on('cell:edited', (data) => {
        if (data.x === 0 && data.y === 1 && data.value === 'NEW_C') editEventFired = true;
      });

      StateManager.on('dataframe:changed', (data) => {
        if (data.action === 'editCell' && data.value === 'NEW_C') dfEventFired = true;
      });

      sheet.x = 0;
      sheet.y = 1;
      sheet.input();
      expect(sheet.inputing).toBe(true);
      expect(sheet.inputField.value).toBe('C');

      sheet.inputField.value = 'NEW_C';
      sheet.inputBlur();

      expect(sheet.inputing).toBe(false);
      expect(df.get(0, 1)).toBe('NEW_C');
      expect(editEventFired).toBe(true);
      expect(dfEventFired).toBe(true);
    });

    test('Escape key cancels input without modifying dataframe state', () => {
      df = new Dataframe([['ORIGINAL']]);
      sheet = new Sheet(df);

      sheet.x = 0;
      sheet.y = 0;
      sheet.input();
      sheet.inputField.value = 'MODIFIED_BUT_CANCELLED';
      sheet.escape = true;
      sheet.inputBlur();

      expect(df.get(0, 0)).toBe('ORIGINAL');
    });

    test('HTML special characters, tags, linebreaks, and URLs are safely escaped in DOM view', () => {
      df = new Dataframe([
        ['<script>alert("xss")</script>', 'Line1\nLine2', 'https://example.com', '123.45', '!ERROR_CODE']
      ]);
      sheet = new Sheet(df);
      sheet.loadCell(sheet.rows[1].cells[1], 0, 0);
      sheet.loadCell(sheet.rows[1].cells[2], 1, 0);
      sheet.loadCell(sheet.rows[1].cells[3], 2, 0);
      sheet.loadCell(sheet.rows[1].cells[4], 3, 0);
      sheet.loadCell(sheet.rows[1].cells[5], 4, 0);

      // View loadCell safely escapes HTML entities
      const cell0 = sheet.rows[1].cells[1];
      const div0 = cell0.querySelector('div');
      expect(div0.innerHTML).toContain('&lt;script&gt;');
      expect(div0.innerHTML).not.toContain('<script>');

      const cell1 = sheet.rows[1].cells[2];
      const div1 = cell1.querySelector('div');
      expect(div1.innerHTML).toContain('Line1<br>Line2');

      const cell2 = sheet.rows[1].cells[3];
      const div2 = cell2.querySelector('div');
      expect(div2.classList.contains('url')).toBe(true);

      const cell3 = sheet.rows[1].cells[4];
      const div3 = cell3.querySelector('div');
      expect(div3.classList.contains('num')).toBe(true);

      const cell4 = sheet.rows[1].cells[5];
      const div4 = cell4.querySelector('div');
      expect(div4.classList.contains('error')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // STRESS 4: Range Selection & Bounding Box Stress
  // --------------------------------------------------------------------------
  describe('Range Selection & Bounding Box Stress', () => {
    test('Reverse range selections correctly normalize min and max boundaries', () => {
      df = new Dataframe(Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => `${r}_${c}`)));
      sheet = new Sheet(df);

      sheet.x = 40;
      sheet.y = 30;
      sheet.rangeEnd = { x: 5, y: 10 };

      const r = sheet.rangeOrdered();
      expect(r.xmin).toBe(5);
      expect(r.xmax).toBe(40);
      expect(r.ymin).toBe(10);
      expect(r.ymax).toBe(30);

      // rangeArray extract
      const arr = sheet.rangeArray();
      expect(arr.length).toBe(21); // 30 - 10 + 1
      expect(arr[0].length).toBe(36); // 40 - 5 + 1
      expect(arr[0][0]).toBe('10_5');
      expect(arr[20][35]).toBe('30_40');
    });

    test('Bulk rangeEdit sets values across large selected bounding box', () => {
      df = new Dataframe(Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => `0`)));
      sheet = new Sheet(df);

      sheet.x = 10;
      sheet.y = 10;
      sheet.rangeEnd = { x: 29, y: 29 };
      sheet.rangeEdit('BULK_VAL');

      expect(df.get(10, 10)).toBe('BULK_VAL');
      expect(df.get(29, 29)).toBe('BULK_VAL');
      expect(df.get(9, 9)).toBe('0');
      expect(df.get(30, 30)).toBe('0');
    });

    test('slctAll, slctCol, slctRow clamp to full grid limits', () => {
      df = new Dataframe(Array.from({ length: 100 }, (_, r) => Array.from({ length: 25 }, (_, c) => `val`)));
      sheet = new Sheet(df);

      sheet.slctAll();
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(0);
      expect(sheet.rangeEnd).toEqual({ x: 24, y: 99 });

      sheet.slctCol(5, 10);
      expect(sheet.x).toBe(5);
      expect(sheet.y).toBe(0);
      expect(sheet.rangeEnd).toEqual({ x: 10, y: 99 });

      sheet.slctRow(12, 15);
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(12);
      expect(sheet.rangeEnd).toEqual({ x: 24, y: 15 });
    });
  });

  // --------------------------------------------------------------------------
  // STRESS 5: Row & Column Mutations & High-Volume Operations
  // --------------------------------------------------------------------------
  describe('Row/Column Mutations & High-Volume Sorting/Shifting Stress', () => {
    test('Row & Column insertions and deletions maintain grid consistency', () => {
      df = new Dataframe(Array.from({ length: 100 }, (_, r) => Array.from({ length: 20 }, (_, c) => `R${r}C${c}`)));
      sheet = new Sheet(df);

      // Insert Row at y=5
      sheet.y = 5;
      sheet.insert(0); // Insert row at sheet.y
      expect(df.height).toBe(101);

      // Insert Column at x=2
      sheet.x = 2;
      sheet.insert(1); // Insert col at sheet.x + 1
      expect(df.width).toBe(21);

      // Range delete rows
      sheet.y = 10;
      sheet.rangeEnd = { x: 20, y: 14 }; // 5 rows selected (10 to 14)
      sheet.deleteRows();
      expect(df.height).toBe(96);

      // Range delete cols
      sheet.x = 2;
      sheet.rangeEnd = { x: 5, y: 95 }; // 4 cols selected (2 to 5)
      sheet.deleteCols();
      expect(df.width).toBe(17);
    });

    test('Shifting rows and columns updates dataframe and selection range', () => {
      df = new Dataframe([
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9']
      ]);
      sheet = new Sheet(df);

      sheet.x = 1;
      sheet.y = 1;
      sheet.shift(2); // Shift row down (direction 2)

      expect(df.get(1, 1)).toBe('8');
      expect(df.get(1, 2)).toBe('5');
    });

    test('Sorting numeric and string data with 1,000 rows performs accurately', () => {
      const data = [['Header']];
      // Push unsorted values
      for (let i = 1000; i >= 1; i--) {
        data.push([String(i)]);
      }
      df = new Dataframe(data);
      sheet = new Sheet(df);

      stg.sort_header = true;
      stg.sort_num_first = true;

      // Sort Ascending
      sheet.sort(0, true);
      expect(df.get(0, 1)).toBe('1');
      expect(df.get(0, 500)).toBe('500');
      expect(df.get(0, 1000)).toBe('1000');

      // Sort Descending
      sheet.sort(0, false);
      expect(df.get(0, 1)).toBe('1000');
      expect(df.get(0, 1000)).toBe('1');
    });

    test('validate_data and validate_headers on large datasets execute without error', () => {
      const data = [['Header 1!', 'Header#2', 'Header 1!']];
      for (let i = 0; i < 500; i++) {
        data.push(['12,34', 'SAY "HELLO"', 'Line1\nLine2']);
      }
      df = new Dataframe(data);
      sheet = new Sheet(df);

      stg.dv_comma_num = true;
      stg.dv_quotes = true;
      stg.dv_lr = true;

      const headerItems = sheet.validate_headers();
      expect(headerItems.find(i => i.x === 0).newValue).toBe('header_1_');
      expect(headerItems.find(i => i.x === 1).newValue).toBe('header_2');
      expect(headerItems.find(i => i.x === 2).newValue).toBe('header_1__c3');

      const dataItems = sheet.validate_data();
      expect(dataItems.find(i => i.x === 0 && i.y === 1).newValue).toBe('12.34');
      expect(dataItems.find(i => i.x === 1 && i.y === 1).newValue).toBe("SAY 'HELLO'");
      expect(dataItems.find(i => i.x === 2 && i.y === 1).newValue).toBe('Line1|Line2');
    });

    test('expand auto-fills linear series across range', () => {
      df = new Dataframe(Array.from({ length: 10 }, () => Array.from({ length: 5 }, () => '')));
      df.edit(0, 0, '10');
      df.edit(0, 1, '20');

      sheet = new Sheet(df);
      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 0, y: 4 };

      sheet.expand();

      expect(df.get(0, 0)).toBe('10');
      expect(df.get(0, 1)).toBe('20');
      expect(df.get(0, 2)).toBe('30');
      expect(df.get(0, 3)).toBe('40');
      expect(df.get(0, 4)).toBe('50');
    });

    test('rangeTranspose swaps subgrid dimensions in dataframe', () => {
      df = new Dataframe([
        ['A1', 'B1', 'C1'],
        ['A2', 'B2', 'C2'],
        ['', '', '']
      ]);
      sheet = new Sheet(df);

      sheet.x = 0;
      sheet.y = 0;
      sheet.rangeEnd = { x: 2, y: 1 };

      sheet.rangeTranspose();

      expect(df.get(0, 0)).toBe('A1');
      expect(df.get(1, 0)).toBe('A2');
      expect(df.get(0, 1)).toBe('B1');
      expect(df.get(1, 1)).toBe('B2');
      expect(df.get(0, 2)).toBe('C1');
      expect(df.get(1, 2)).toBe('C2');
    });
  });
});
