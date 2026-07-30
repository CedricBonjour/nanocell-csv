import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';

describe('UI Sheet Component & Custom Element <ui-sheet>', () => {
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

    df = new Dataframe([
      ['Header1', 'Header2', 'Header3'],
      ['Alpha', '10', '2024-01-01'],
      ['Beta', '20', '2024-01-02'],
      ['Gamma', '30', '2024-01-03']
    ]);
    sheet = new Sheet(df);
  });

  // Tier 1: Feature Coverage
  test('Sheet initializes as autonomous custom element and mounts in dom.content', () => {
    expect(sheet).toBeInstanceOf(Sheet);
    expect(sheet).toBeInstanceOf(HTMLElement);
    expect(customElements.get('ui-sheet')).toBe(Sheet);
    expect(sheet.classList.contains('sheet')).toBe(true);
    expect(dom.content.querySelector('.sheet')).toBe(sheet);
  });

  test('Sheet decomposes into view and controller modules', () => {
    expect(sheet.view).toBeDefined();
    expect(sheet.controller).toBeDefined();
    expect(sheet.view.table).toBeDefined();
    expect(sheet.rows).toBe(sheet.view.rows);
  });

  test('Sheet reload generates table structure with header and data rows', () => {
    expect(sheet.rows.length).toBeGreaterThan(1);
    expect(sheet.rows[0].cells.length).toBeGreaterThan(1);
  });

  test('validate_headers normalizes column headers to lowercase and underscores', () => {
    sheet.validate_headers();
    expect(df.get(0, 0)).toBe('header1');
    expect(df.get(1, 0)).toBe('header2');
    expect(df.get(2, 0)).toBe('header3');
  });

  test('sort reorders rows ascending and descending', () => {
    // Ascending sort on column 1 (numeric values)
    sheet.sort(1, true);
    expect(df.get(1, 1)).toBe('10');
    expect(df.get(1, 3)).toBe('30');

    // Descending sort on column 1
    sheet.sort(1, false);
    expect(df.get(1, 1)).toBe('30');
    expect(df.get(1, 3)).toBe('10');
  });

  test('input and inputBlur trigger inline cell value editing', () => {
    sheet.x = 0;
    sheet.y = 1;
    sheet.input('Delta');
    expect(sheet.inputing).toBe(true);
    expect(sheet.inputField.value).toBe('Delta');

    sheet.inputField.value = 'Epsilon';
    sheet.inputBlur();
    expect(sheet.inputing).toBe(false);
    expect(df.get(0, 1)).toBe('Epsilon');
  });

  // Tier 2: Boundary & Corner Cases
  test('deleteRows removes all selected rows in range ordered box', () => {
    sheet.y = 1;
    sheet.rangeEnd = { x: 2, y: 2 };
    sheet.deleteRows();

    expect(df.height).toBe(2);
    expect(df.get(0, 1)).toBe('Gamma');
  });

  test('deleteCols removes all selected columns in range ordered box', () => {
    sheet.x = 0;
    sheet.rangeEnd = { x: 1, y: 3 };
    sheet.deleteCols();

    expect(df.width).toBe(1);
    expect(df.get(0, 0)).toBe('Header3');
  });

  test('validate_data transforms comma numbers and quotes based on settings', () => {
    stg.dv_comma_num = true;
    stg.dv_quotes = true;
    df.edit(0, 1, '12,34');
    df.edit(0, 2, 'Say "hello"');

    sheet.validate_data();
    expect(df.get(0, 1)).toBe('12.34');
    expect(df.get(0, 2)).toBe("Say 'hello'");
  });

  test('fitWidth calculates proportional column widths based on content length', () => {
    sheet.fitWidth();
    expect(sheet.colWidthList.length).toBeGreaterThan(0);
    expect(sheet.colWidthList[0].width).toContain('%');
  });

  test('round rounds floating point numeric values in active selection', () => {
    df.edit(1, 1, '12.3456');
    sheet.x = 1;
    sheet.y = 1;
    sheet.round(true);
    expect(df.get(1, 1)).toBe('12');
  });

  test('allApply executes callback for every cell in dataframe', () => {
    let count = 0;
    sheet.allApply((x, y) => {
      count++;
    });
    expect(count).toBe(12);
  });

  // Tier 3: Cross-Feature Combinations
  test('footerUpdate refreshes footer info string with active selection details', () => {
    sheet.x = 1;
    sheet.y = 2;
    sheet.footerUpdate();
    expect(dom.footerDiv.left.innerHTML).toBe('2:3');
    expect(dom.footerDiv.right.innerHTML).toBe('3:4');
  });

  test('getSlctFirstValue returns top-left selection cell content', () => {
    sheet.x = 2;
    sheet.y = 1;
    expect(sheet.getSlctFirstValue()).toBe('2024-01-01');
  });
});
