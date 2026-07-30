import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom } from '../app/js/dom.js';

describe('Selection & Navigation Operations', () => {
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
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['9', '10', '11', '12'],
      ['13', '14', '15', '16']
    ]);
    sheet = new Sheet(df);
  });

  // Tier 1: Feature Coverage
  test('Active cell coordinates x and y get and set correctly', () => {
    sheet.x = 2;
    sheet.y = 3;
    expect(sheet.x).toBe(2);
    expect(sheet.y).toBe(3);
    expect(sheet.getSlctFirstValue()).toBe('15');
  });

  test('rangeOrdered returns normalized bounding box for selection range', () => {
    sheet.x = 2;
    sheet.y = 3;
    sheet.rangeEnd = { x: 0, y: 1 };
    const r = sheet.rangeOrdered();

    expect(r.xmin).toBe(0);
    expect(r.xmax).toBe(2);
    expect(r.ymin).toBe(1);
    expect(r.ymax).toBe(3);
  });

  test('slctCol selects full height of specified column', () => {
    sheet.slctCol(1);
    expect(sheet.x).toBe(1);
    expect(sheet.y).toBe(0);
    expect(sheet.rangeEnd).toEqual({ x: 1, y: 3 });
  });

  test('slctRow selects full width of specified row', () => {
    sheet.slctRow(2);
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(2);
    expect(sheet.rangeEnd).toEqual({ x: 3, y: 2 });
  });

  test('slctAll selects full grid bounds', () => {
    sheet.slctAll();
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(0);
    expect(sheet.rangeEnd).toEqual({ x: 3, y: 3 });
  });

  // Tier 2: Boundary & Corner Cases
  test('Active cursor coordinates x and y clamp negative numbers to zero', () => {
    sheet.x = -5;
    sheet.y = -10;
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(0);
  });

  test('Viewport baseX and baseY clamp coordinates to valid dataframe range', () => {
    sheet.baseX = -5;
    expect(sheet.baseX).toBe(0);

    sheet.baseX = 100;
    expect(sheet.baseX).toBe(3);

    sheet.baseY = -1;
    expect(sheet.baseY).toBe(0);

    sheet.baseY = 200;
    expect(sheet.baseY).toBe(3);
  });

  test('rangeArray extracts 2D array of values within active range', () => {
    sheet.x = 0;
    sheet.y = 0;
    sheet.rangeEnd = { x: 1, y: 1 };
    const mat = sheet.rangeArray();

    expect(mat).toHaveLength(2);
    expect(mat[0]).toEqual(['1', '2']);
    expect(mat[1]).toEqual(['5', '6']);
  });

  test('rangeEdit sets value across all cells in range', () => {
    sheet.x = 1;
    sheet.y = 1;
    sheet.rangeEnd = { x: 2, y: 2 };
    sheet.rangeEdit('FILL');

    expect(df.get(1, 1)).toBe('FILL');
    expect(df.get(2, 2)).toBe('FILL');
    expect(df.get(0, 0)).toBe('1');
  });

  test('expand populates series progression across range', () => {
    df.edit(0, 0, '10');
    df.edit(0, 1, '20');
    sheet.x = 0;
    sheet.y = 0;
    sheet.rangeEnd = { x: 0, y: 3 };
    sheet.expand();

    expect(df.get(0, 2)).toBe('30');
    expect(df.get(0, 3)).toBe('40');
  });

  // Tier 3: Cross-Feature Combinations
  test('rangeTranspose swaps rows and columns in selected area', () => {
    sheet.x = 0;
    sheet.y = 0;
    sheet.rangeEnd = { x: 1, y: 2 };
    sheet.rangeTranspose();

    expect(df.get(0, 0)).toBe('1');
    expect(df.get(1, 0)).toBe('5');
    expect(df.get(2, 0)).toBe('9');
  });
});
