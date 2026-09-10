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

  test('Finder pane buttons use the unified icon system without inline SVG elements', () => {
    expect(finder.toggleBtn.classList.contains('icon')).toBe(true);
    expect(finder.caseBtn.classList.contains('icon')).toBe(true);
    expect(finder.prevBtn.classList.contains('icon')).toBe(true);
    expect(finder.nextBtn.classList.contains('icon')).toBe(true);
    expect(finder.closeBtn.classList.contains('icon')).toBe(true);

    // No inline <svg> inside the buttons
    expect(finder.toggleBtn.querySelector('svg')).toBeNull();
    expect(finder.caseBtn.querySelector('svg')).toBeNull();
    expect(finder.prevBtn.querySelector('svg')).toBeNull();
    expect(finder.nextBtn.querySelector('svg')).toBeNull();
    expect(finder.closeBtn.querySelector('svg')).toBeNull();

    // Verify --icon-url CSS property is configured on icon buttons
    expect(finder.toggleBtn.style.getPropertyValue('--icon-url')).toContain('url(');
    expect(finder.caseBtn.style.getPropertyValue('--icon-url')).toContain('url(');
    expect(finder.prevBtn.style.getPropertyValue('--icon-url')).toContain('url(');
    expect(finder.nextBtn.style.getPropertyValue('--icon-url')).toContain('url(');
    expect(finder.closeBtn.style.getPropertyValue('--icon-url')).toContain('url(');

    // Verify replace buttons retain their text labels
    expect(finder.replaceSingleBtn.innerText).toBe('Replace');
    expect(finder.replaceBtn.innerText).toBe('Replace All');
  });

  test('Finder Find and Replace rows have vertically aligned input starts and consistent structure', () => {
    const findRow = finder.widget.querySelector('.find-row');
    const replaceRow = finder.widget.querySelector('.replace-row');

    // Both rows must exist
    expect(findRow).not.toBeNull();
    expect(replaceRow).not.toBeNull();

    // Left column: toggle button in find-row, spacer in replace-row
    const leftFind = findRow.firstElementChild;
    const leftReplace = replaceRow.firstElementChild;
    expect(leftFind.classList.contains('finder-toggle-btn')).toBe(true);
    expect(leftReplace.classList.contains('finder-row-spacer')).toBe(true);

    // Center column: both have .finder-input-wrapper containing a .finder-input
    const centerFind = findRow.querySelector('.finder-input-wrapper');
    const centerReplace = replaceRow.querySelector('.finder-input-wrapper');
    expect(centerFind).not.toBeNull();
    expect(centerReplace).not.toBeNull();
    expect(centerFind.querySelector('input')).toBe(finder.findIn);
    expect(centerReplace.querySelector('input')).toBe(finder.replaceIn);
    expect(finder.findIn.classList.contains('finder-input')).toBe(true);
    expect(finder.replaceIn.classList.contains('finder-input')).toBe(true);

    // Right column: both have .finder-btn-group
    const rightFind = findRow.querySelector('.finder-btn-group');
    const rightReplace = replaceRow.querySelector('.finder-btn-group');
    expect(rightFind).not.toBeNull();
    expect(rightReplace).not.toBeNull();
  });
});

