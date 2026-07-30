import { describe, test, expect, beforeEach } from 'vitest';
import { Setting, stg } from '../app/js/Setting.js';
import { Finder } from '../app/js/Finder.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { build_dom } from '../app/js/dom.js';
import { setSheet } from '../app/js/main.js';

describe('Challenger M1/M3 Comprehensive Empirical Stress Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
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
    build_dom();
    Setting.init();
  });

  describe('1. Settings State Integrity & Defaults Handling', () => {
    test('Repeated Setting.show() calls (100x) leave stg state and localStorage completely untouched', () => {
      stg.theme = 'night';
      stg.font = 18;
      stg.purple = false;
      stg.save_strict = true;
      localStorage.setItem('theme', 'night');
      localStorage.setItem('font', '18');
      localStorage.setItem('purple', 'false');
      localStorage.setItem('save_strict', 'true');

      const initialStorageLength = localStorage.length;
      const initialStgState = { ...stg };

      for (let i = 0; i < 100; i++) {
        Setting.show();
      }

      expect(localStorage.length).toBe(initialStorageLength);
      expect(localStorage.getItem('theme')).toBe('night');
      expect(localStorage.getItem('font')).toBe('18');
      expect(localStorage.getItem('purple')).toBe('false');
      expect(localStorage.getItem('save_strict')).toBe('true');

      for (const key in initialStgState) {
        expect(stg[key]).toBe(initialStgState[key]);
      }
    });

    test('localStorage clear followed by Setting.init() restores every single s.dflt default in Setting.list', () => {
      stg.theme = 'dark';
      stg.font = 24;
      stg.rows = 50;
      stg.cols = 20;
      stg.purple = false;
      stg.save_strict = true;
      stg.fit_col_width = true;

      localStorage.clear();
      Setting.init();

      for (const s of Setting.list) {
        if (s.key) {
          if (s.key === 'theme' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            expect(stg[s.key]).toBe('night');
          } else {
            expect(stg[s.key]).toBe(s.dflt);
          }
        }
      }
    });
  });

  describe('2. Finder Search Behavior, Case Sensitivity & Boundary Navigation', () => {
    let df;
    let sheet;
    let finder;

    beforeEach(() => {
      df = new Dataframe([
        ['Alpha (v1)', 'Beta [v2]', 'Gamma {v3}'],
        ['delta+1', 'epsilon*2', 'zeta?3'],
        ['price $100', 'ratio 1.50', 'path C:\\\\data'],
        ['Apple', 'apple', 'APPLE']
      ]);
      sheet = new Sheet(df);
      setSheet(sheet);
      finder = new Finder(sheet);
    });

    test('Case sensitivity toggling dynamically updates matches, badge count, and button UI state', () => {
      finder.findIn.value = 'Apple';
      
      // Case insensitive (default)
      finder.caseSensitive.value = false;
      finder.find(true);
      expect(finder.found.length).toBe(3);
      expect(finder.caseBtn.getAttribute('aria-pressed')).toBe('false');
      expect(finder.foundInfo.innerHTML).toBe('1 / 3');

      // Toggle to case sensitive
      finder.toggleMatchCase();
      expect(finder.caseSensitive.value).toBe(true);
      expect(finder.found.length).toBe(1);
      expect(finder.found[0].v).toBe('Apple');
      expect(finder.caseBtn.getAttribute('aria-pressed')).toBe('true');
      expect(finder.caseBtn.classList.contains('active')).toBe(true);
      expect(finder.foundInfo.innerHTML).toBe('1 / 1');

      // Toggle back to case insensitive
      finder.toggleMatchCase();
      expect(finder.caseSensitive.value).toBe(false);
      expect(finder.found.length).toBe(3);
      expect(finder.caseBtn.getAttribute('aria-pressed')).toBe('false');
      expect(finder.caseBtn.classList.contains('active')).toBe(false);
      expect(finder.foundInfo.innerHTML).toBe('1 / 3');
    });

    test('Boundary navigation handles empty, 0-match, 1-match, and multi-match circular cycling', () => {
      // Empty query
      finder.findIn.value = '';
      finder.find();
      expect(finder.found).toEqual([]);
      expect(finder.foundInfo.innerHTML).toBe('No match');
      expect(finder.idx).toBe(0);

      // 0 match query
      finder.findIn.value = 'NON_EXISTENT_STRING_999';
      finder.find();
      expect(finder.found).toEqual([]);
      expect(finder.foundInfo.innerHTML).toBe('No match');

      // 1 match query (case sensitive 'APPLE')
      finder.findIn.value = 'APPLE';
      finder.caseSensitive.value = true;
      finder.find(true);
      expect(finder.found.length).toBe(1);
      expect(finder.foundInfo.innerHTML).toBe('1 / 1');
      finder.findNext();
      expect(finder.foundInfo.innerHTML).toBe('1 / 1');
      finder.findPrev();
      expect(finder.foundInfo.innerHTML).toBe('1 / 1');

      // Multi match query (3 matches for 'apple' case-insensitive)
      finder.findIn.value = 'apple';
      finder.caseSensitive.value = false;
      finder.find(true);
      expect(finder.found.length).toBe(3);
      expect(finder.idx).toBe(0);
      expect(finder.foundInfo.innerHTML).toBe('1 / 3');
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(3);

      // Forward navigation
      finder.findNext(); // idx = 1
      expect(finder.idx).toBe(1);
      expect(finder.foundInfo.innerHTML).toBe('2 / 3');
      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(3);

      finder.findNext(); // idx = 2
      expect(finder.idx).toBe(2);
      expect(finder.foundInfo.innerHTML).toBe('3 / 3');
      expect(sheet.x).toBe(2);
      expect(sheet.y).toBe(3);

      // Forward wrap around
      finder.findNext(); // idx = 0
      expect(finder.idx).toBe(0);
      expect(finder.foundInfo.innerHTML).toBe('1 / 3');
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(3);

      // Backward wrap around
      finder.findPrev(); // idx = 2
      expect(finder.idx).toBe(2);
      expect(finder.foundInfo.innerHTML).toBe('3 / 3');
      expect(sheet.x).toBe(2);
      expect(sheet.y).toBe(3);

      finder.findPrev(); // idx = 1
      expect(finder.idx).toBe(1);
      expect(finder.foundInfo.innerHTML).toBe('2 / 3');
      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(3);
    });

    test('Finder handles special regex characters without throwing SyntaxError exceptions', () => {
      const specialChars = ['(', '[', '{', '\\', '*', '+', '?', '.', '$', '^', '|'];
      
      for (const str of specialChars) {
        finder.findIn.value = str;
        expect(() => finder.find()).not.toThrow();
      }
    });

    test('Finder treats search strings as literal strings, correctly matching special characters', () => {
      // Searching for literal '.' matches only cell containing '.' ('ratio 1.50')
      finder.findIn.value = '.';
      finder.find();
      expect(finder.found.length).toBe(1);
      expect(finder.found[0].v).toBe('ratio 1.50');

      // Searching for literal 'Alpha (v1)' matches 'Alpha (v1)'
      finder.findIn.value = 'Alpha (v1)';
      finder.find();
      expect(finder.found.length).toBe(1);
      expect(finder.found[0].v).toBe('Alpha (v1)');

      // Searching for literal 'Beta [v2]' matches 'Beta [v2]'
      finder.findIn.value = 'Beta [v2]';
      finder.find();
      expect(finder.found.length).toBe(1);
      expect(finder.found[0].v).toBe('Beta [v2]');

      // Searching for literal 'path C:\\data' matches 'path C:\\data'
      finder.findIn.value = 'path C:\\\\data';
      finder.find();
      expect(finder.found.length).toBe(1);
      expect(finder.found[0].v).toBe('path C:\\\\data');
    });

    test('Finder replace and replaceAll boundary behavior under special character searches', () => {
      finder.findIn.value = 'delta+1';
      finder.replaceIn.value = 'delta+99';
      finder.find();
      expect(finder.found.length).toBe(1);
      finder.replace();
      expect(df.get(0, 1)).toBe('delta+99');

      finder.findIn.value = 'Beta [v2]';
      finder.replaceIn.value = 'Beta [v3]';
      finder.find();
      expect(finder.found.length).toBe(1);
      finder.replaceAll();
      expect(df.get(1, 0)).toBe('Beta [v3]');
    });
  });
});
