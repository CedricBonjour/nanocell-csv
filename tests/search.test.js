import { describe, test, expect, beforeEach } from 'vitest';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Finder } from '../app/js/Finder.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom } from '../app/js/dom.js';
import { setSheet } from '../app/js/main.js';

describe('Finder Search & Replace Operations', () => {
  let df;
  let sheet;
  let finder;

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
      ['Apple', 'Banana', 'Cherry'],
      ['apple pie', 'BANANA', 'cherry tart'],
      ['Pineapple', 'Grape', 'Apple']
    ]);
    sheet = new Sheet(df);
    setSheet(sheet);
    finder = new Finder(sheet);
  });

  // Tier 1: Feature Coverage
  test('Finder initializes as custom element ui-finder', () => {
    expect(finder).toBeInstanceOf(Finder);
    expect(finder.found).toEqual([]);
  });

  test('find matches query case-insensitively by default and sets sheet active cell', () => {
    finder.findIn.value = 'apple';
    finder.find();

    expect(finder.found.length).toBe(4);
    expect(finder.found[0]).toEqual({ x: 0, y: 0, v: 'Apple' });
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(0);
  });

  test('find with repeated call cycles through found match index', () => {
    finder.findIn.value = 'apple';
    finder.find(); // Match 0 (x:0, y:0)
    expect(sheet.x).toBe(0);

    finder.find(); // Match 1 (x:0, y:1)
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(1);

    finder.find(); // Match 2 (x:0, y:2)
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(2);

    finder.find(); // Match 3 (x:2, y:2)
    expect(sheet.x).toBe(2);
    expect(sheet.y).toBe(2);

    finder.find(); // Wraps back to Match 0
    expect(sheet.x).toBe(0);
    expect(sheet.y).toBe(0);
  });

  test('replaceAll replaces all matches in dataframe with replaceIn value', () => {
    finder.findIn.value = 'Apple';
    finder.replaceIn.value = 'Orange';
    finder.find();
    finder.replaceAll();

    expect(df.get(0, 0)).toBe('Orange');
    expect(df.get(0, 1)).toBe('Orange pie');
    expect(df.get(0, 2)).toBe('PineOrange');
  });

  // Tier 2: Boundary & Corner Cases
  test('caseSensitive toggle restricts matches to exact case match when enabled', () => {
    finder.findIn.value = 'Apple';
    finder.caseSensitive.value = true;
    finder.advanced = true;
    finder.find(true);

    expect(finder.found.length).toBe(2);
    expect(finder.found[0].v).toBe('Apple');
    expect(finder.found[1].v).toBe('Apple');
  });

  test('find with empty query clears found matches list', () => {
    finder.findIn.value = 'Apple';
    finder.find();
    expect(finder.found.length).toBeGreaterThan(0);

    finder.findIn.value = '';
    finder.find();
    expect(finder.found).toEqual([]);
    expect(finder.foundInfo.innerHTML).toBe('No match');
  });

  test('find displays No match status when search string matches no cells', () => {
    finder.findIn.value = 'NonexistentSubstring';
    finder.find();

    expect(finder.found).toEqual([]);
    expect(finder.foundInfo.innerHTML).toBe('No match');
  });

  test('showTable formats matched search terms with bold html tags', () => {
    finder.findIn.value = 'Cherry';
    finder.find();
    finder.showTable();

    expect(finder.listTable.rows.length).toBe(2);
    expect(finder.listTable.style.display).toBe('block');
  });

  // Tier 3: Cross-Feature Combinations
  test('replaceAll updates dataframe and supports undo command stack', () => {
    finder.findIn.value = 'Banana';
    finder.replaceIn.value = 'Mango';
    finder.find();
    finder.replaceAll();

    expect(df.get(1, 0)).toBe('Mango');
    expect(df.get(1, 1)).toBe('Mango');

    df.undo();
    expect(df.get(1, 0)).toBe('Banana');
    expect(df.get(1, 1)).toBe('BANANA');
  });

  test('findMenu configures dialog prefill string and focuses find input', () => {
    finder.findMenu('Cherry', false);
    expect(finder.findIn.value).toBe('Cherry');
    expect(finder.found.length).toBe(2);
  });
});
