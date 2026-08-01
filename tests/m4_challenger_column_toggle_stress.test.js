import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 4 Challenger 1 — Equal-Width & Double-Click Expand Toggle Stress Suite', () => {
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

  // Helper to dispatch dblclick event on target element
  function doubleClick(element) {
    const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }

  // --------------------------------------------------------------------------
  // 1. Default Equal-Width Column Rendering
  // --------------------------------------------------------------------------
  describe('1. Default Equal-Width Column Rendering', () => {
    test('1.1 Uniform width rendering across small, medium, and large matrix sizes', () => {
      // Small matrix: 5x5
      const smallData = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => `S_${r}_${c}`));
      df = new Dataframe(smallData);
      sheet = new Sheet(df);
      sheet.reload();

      let expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }

      // Medium matrix: 20x100
      const medData = Array.from({ length: 20 }, (_, r) => Array.from({ length: 100 }, (_, c) => `M_${r}_${c}`));
      df = new Dataframe(medData);
      sheet = new Sheet(df);
      sheet.reload();

      expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }

      // Large matrix: 1000x500
      const largeData = Array.from({ length: 100 }, (_, r) => Array.from({ length: 500 }, (_, c) => `L_${r}_${c}`));
      df = new Dataframe(largeData);
      sheet = new Sheet(df);
      sheet.reload();

      expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }
    });

    test('1.2 Equal-width rendering is preserved across virtual scroll offsets (baseX)', () => {
      const data = Array.from({ length: 50 }, (_, r) => Array.from({ length: 500 }, (_, c) => `C_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      const scrollOffsets = [0, 10, 50, 250, 480];
      const expectedWidth = `${100.0 / sheet.nViewCols}%`;

      scrollOffsets.forEach(bx => {
        sheet.baseX = bx;
        sheet.refresh();

        for (let x = 0; x < sheet.nViewCols; x++) {
          sheet.loadTopHeader(x);
          expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
        }
      });
    });

    test('1.3 Dynamic recalculation of equal-width percentages when nViewCols changes', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 50 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);

      const testColCounts = [5, 10, 20, 40];

      testColCounts.forEach(colCount => {
        sheet.nViewCols = colCount;
        sheet.reload();

        const expectedWidth = `${100.0 / colCount}%`;
        for (let x = 0; x < colCount; x++) {
          sheet.loadTopHeader(x);
          expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
        }
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. Double-Click Header Expand & Restore Toggle
  // --------------------------------------------------------------------------
  describe('2. Double-Click Header Expand & Restore Toggle', () => {
    test('2.1 Double-clicking column header toggles expandedCol to matrix index and sets 100%/0% widths', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      expect(sheet.expandedCol).toBeNull();

      // Double-click column header at viewport offset tx = 2 (cell index 3)
      const targetHeader = sheet.rows[0].cells[3]; // tx = 2
      doubleClick(targetHeader);

      expect(sheet.expandedCol).toBe(2);

      // Verify header widths
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        const cellStyle = sheet.rows[0].cells[x + 1].style.width;
        if (x === 2) {
          expect(cellStyle).toBe('100%');
        } else {
          expect(cellStyle).toBe('0%');
        }
      }
    });

    test('2.2 Double-clicking expanded column header again restores null state and equal widths', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      const targetHeader = sheet.rows[0].cells[3]; // tx = 2

      // First double-click: expand
      doubleClick(targetHeader);
      expect(sheet.expandedCol).toBe(2);

      // Second double-click: restore
      doubleClick(targetHeader);
      expect(sheet.expandedCol).toBeNull();

      const expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }
    });

    test('2.3 Double-clicking at non-zero baseX calculates matrix column index (baseX + tx) correctly', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 50 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.baseX = 15;
      sheet.reload();

      // Viewport tx = 3 corresponds to matrix index 15 + 3 = 18
      const targetHeader = sheet.rows[0].cells[4]; // tx = 3
      doubleClick(targetHeader);

      expect(sheet.expandedCol).toBe(18);

      // Viewport index 3 (matrix col 18) should be 100%, others 0%
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        const cellStyle = sheet.rows[0].cells[x + 1].style.width;
        if (x === 3) {
          expect(cellStyle).toBe('100%');
        } else {
          expect(cellStyle).toBe('0%');
        }
      }

      // Second double click restores
      doubleClick(targetHeader);
      expect(sheet.expandedCol).toBeNull();
    });

    test('2.4 Double-clicking child elements (span.noclick) inside tColHeader correctly toggles expandedCol', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      const headerCell = sheet.rows[0].cells[2]; // tx = 1
      const innerSpan = headerCell.querySelector('span.noclick');
      expect(innerSpan).not.toBeNull();

      // Double-click on inner span
      doubleClick(innerSpan);
      expect(sheet.expandedCol).toBe(1);
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);
      expect(headerCell.style.width).toBe('100%');

      // Double-click inner span again to restore
      doubleClick(innerSpan);
      expect(sheet.expandedCol).toBeNull();
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);
      expect(headerCell.style.width).toBe(`${100.0 / sheet.nViewCols}%`);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Switching Expanded Column
  // --------------------------------------------------------------------------
  describe('3. Switching Expanded Column', () => {
    test('3.1 Double-clicking a different header updates expandedCol to the new column index', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      const headerCol1 = sheet.rows[0].cells[2]; // tx = 1
      const headerCol4 = sheet.rows[0].cells[5]; // tx = 4

      // Expand column 1
      doubleClick(headerCol1);
      expect(sheet.expandedCol).toBe(1);
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);
      expect(headerCol1.style.width).toBe('100%');

      // Expand column 4 directly without collapsing col 1 first
      doubleClick(headerCol4);
      expect(sheet.expandedCol).toBe(4);

      // Verify col 4 is 100% and col 1 is now 0%
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        const cellStyle = sheet.rows[0].cells[x + 1].style.width;
        if (x === 4) {
          expect(cellStyle).toBe('100%');
        } else {
          expect(cellStyle).toBe('0%');
        }
      }
    });

    test('3.2 Switching expanded column across virtual scroll operations', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 100 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.baseX = 0;
      sheet.reload();

      // Expand matrix col 3 at baseX = 0
      doubleClick(sheet.rows[0].cells[4]); // tx = 3 -> matrix col 3
      expect(sheet.expandedCol).toBe(3);

      // Scroll to baseX = 20
      sheet.baseX = 20;
      sheet.refresh();

      // Matrix col 3 is now off-screen. Expand matrix col 22 (viewport tx = 2, cell 3)
      doubleClick(sheet.rows[0].cells[3]); // tx = 2 -> matrix col 20 + 2 = 22
      expect(sheet.expandedCol).toBe(22);

      // Scroll back to baseX = 0
      sheet.baseX = 0;
      sheet.refresh();

      // Col 22 is off-screen. Double click matrix col 3 (tx = 3) to expand col 3 again
      doubleClick(sheet.rows[0].cells[4]); // tx = 3 -> matrix col 3
      expect(sheet.expandedCol).toBe(3);

      // Double click col 3 to restore
      doubleClick(sheet.rows[0].cells[4]);
      expect(sheet.expandedCol).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rapid Double-Clicking & Edge Cases
  // --------------------------------------------------------------------------
  describe('4. Rapid Double-Clicking & Edge Cases', () => {
    test('4.1 Rapid alternating double-clicks stress test (100 iterations)', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      const h0 = sheet.rows[0].cells[1]; // tx = 0
      const h1 = sheet.rows[0].cells[2]; // tx = 1

      for (let i = 0; i < 50; i++) {
        // Toggle h0: expand -> restore
        doubleClick(h0);
        expect(sheet.expandedCol).toBe(0);
        doubleClick(h0);
        expect(sheet.expandedCol).toBeNull();

        // Switch h0 -> h1
        doubleClick(h0);
        expect(sheet.expandedCol).toBe(0);
        doubleClick(h1);
        expect(sheet.expandedCol).toBe(1);
        doubleClick(h1);
        expect(sheet.expandedCol).toBeNull();
      }

      // Final check: equal width restored cleanly
      const expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }
    });

    test('4.2 Edge Case: Dataframe with 0 columns', () => {
      df = new Dataframe([]);
      sheet = new Sheet(df);
      sheet.reload();

      expect(sheet.df.width).toBe(0);

      // Should load top headers without throwing NaN or breaking
      expect(() => {
        for (let x = 0; x < sheet.nViewCols; x++) {
          sheet.loadTopHeader(x);
        }
      }).not.toThrow();

      // Double-click on header cell in 0-column table
      if (sheet.rows[0] && sheet.rows[0].cells[1]) {
        expect(() => doubleClick(sheet.rows[0].cells[1])).not.toThrow();
      }
    });

    test('4.3 Edge Case: Dataframe with 1 column', () => {
      df = new Dataframe([['Header1'], ['Data1']]);
      sheet = new Sheet(df);
      sheet.nViewCols = 1;
      sheet.reload();

      expect(sheet.df.width).toBe(1);

      const h0 = sheet.rows[0].cells[1]; // tx = 0

      sheet.loadTopHeader(0);
      expect(h0.style.width).toBe('100%');

      // Double-click to expand (100%)
      doubleClick(h0);
      expect(sheet.expandedCol).toBe(0);
      sheet.loadTopHeader(0);
      expect(h0.style.width).toBe('100%');

      // Double-click to restore (100% since nViewCols = 1)
      doubleClick(h0);
      expect(sheet.expandedCol).toBeNull();
      sheet.loadTopHeader(0);
      expect(h0.style.width).toBe('100%');
    });

    test('4.4 Edge Case: Large column count (10,000 columns)', () => {
      const data = Array.from({ length: 5 }, () => Array.from({ length: 10000 }, (_, c) => `col_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);

      expect(sheet.df.width).toBe(10000);

      sheet.baseX = 9990;
      sheet.reload();

      const targetHeader = sheet.rows[0].cells[6]; // tx = 5 -> matrix col 9995
      doubleClick(targetHeader);

      expect(sheet.expandedCol).toBe(9995);
      for (let x = 0; x < sheet.nViewCols; x++) sheet.loadTopHeader(x);
      expect(targetHeader.style.width).toBe('100%');

      // Scroll far away to baseX = 0
      sheet.baseX = 0;
      sheet.refresh();

      // All visible headers at baseX = 0 should be 0% since expandedCol is 9995
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe('0%');
      }

      // Scroll back to baseX = 9990
      sheet.baseX = 9990;
      sheet.refresh();

      // Double-click matrix col 9995 again to restore equal width
      doubleClick(sheet.rows[0].cells[6]);
      expect(sheet.expandedCol).toBeNull();

      const expectedWidth = `${100.0 / sheet.nViewCols}%`;
      for (let x = 0; x < sheet.nViewCols; x++) {
        sheet.loadTopHeader(x);
        expect(sheet.rows[0].cells[x + 1].style.width).toBe(expectedWidth);
      }
    });

    test('4.5 Non-column header double-clicks do NOT alter sheet.expandedCol', () => {
      const data = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => `val_${r}_${c}`));
      df = new Dataframe(data);
      sheet = new Sheet(df);
      sheet.reload();

      expect(sheet.expandedCol).toBeNull();

      // Double click row header (tx = -1, ty = 2)
      const rowHeader = sheet.rows[3].cells[0]; // ty = 2, tx = -1
      doubleClick(rowHeader);
      expect(sheet.expandedCol).toBeNull();

      // Double click corner header (tx = -1, ty = -1)
      const cornerHeader = sheet.rows[0].cells[0]; // ty = -1, tx = -1
      doubleClick(cornerHeader);
      expect(sheet.expandedCol).toBeNull();
    });
  });
});
