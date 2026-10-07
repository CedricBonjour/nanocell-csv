import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../app/js/StateManager.js';
import { Setting, stg } from '../app/js/Setting.js';
import { Finder } from '../app/js/Finder.js';
import { Table } from '../app/js/ui/input/Table.js';
import { Dataframe } from '../core/model/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { build_dom, dom } from '../app/js/dom.js';
import { ValidationPane } from '../app/js/ui/ValidationPane.js';

describe('Milestone 2 Challenger 2 — Adversarial Empirical Stress & Robustness Suite', () => {

  beforeEach(() => {
    localStorage.clear();
    StateManager.clear();
    document.body.innerHTML = `
      <link rel="stylesheet" href="css/palettes/light.css" id="palette">
      <link rel="stylesheet" href="css/themes/light.css" id="theme">
      <header id="header"></header>
      <div id="content" class="flexMain">
        <div id="main-container">
          <ui-sheet id="sheet"></ui-sheet>
        </div>
      </div>
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

  // ==========================================================================
  // AREA 1: StateManager Dual-Role Pub/Sub & state:* Automatic Emissions
  // ==========================================================================
  describe('Area 1: StateManager Dual-Role Pub/Sub and state:* Automatic Event Emissions', () => {

    test('1.1 Automatic state:* event emitted with key, value, and oldValue on setState', () => {
      const emissions = [];
      const unsub = StateManager.on('state:userRole', (payload) => {
        emissions.push(payload);
      });

      // Initial set (oldValue is undefined)
      StateManager.setState('userRole', 'admin');
      expect(StateManager.getState('userRole')).toBe('admin');
      expect(emissions.length).toBe(1);
      expect(emissions[0]).toEqual({
        key: 'userRole',
        value: 'admin',
        oldValue: undefined
      });

      // Subsequent update (oldValue is 'admin')
      StateManager.setState('userRole', 'viewer');
      expect(StateManager.getState('userRole')).toBe('viewer');
      expect(emissions.length).toBe(2);
      expect(emissions[1]).toEqual({
        key: 'userRole',
        value: 'viewer',
        oldValue: 'admin'
      });

      unsub();
      // After unsubscribing, further setState calls do not invoke callback
      StateManager.setState('userRole', 'editor');
      expect(emissions.length).toBe(2);
      expect(StateManager.getState('userRole')).toBe('editor');
    });

    test('1.2 Instance-level dual-role pub/sub and state store isolation', () => {
      const mgr = new StateManager();
      const events = [];

      mgr.on('state:count', (data) => events.push(data));
      mgr.setState('count', 1);
      mgr.setState('count', 2);

      expect(mgr.getState('count')).toBe(2);
      expect(events).toEqual([
        { key: 'count', value: 1, oldValue: undefined },
        { key: 'count', value: 2, oldValue: 1 }
      ]);

      // Ensure instance state is isolated from static defaultInstance
      expect(StateManager.getState('count')).toBeUndefined();
    });

    test('1.3 Pub/Sub non-state events do not contaminate state store', () => {
      let received = null;
      StateManager.on('custom:action', (data) => {
        received = data;
      });

      StateManager.emit('custom:action', { actionId: 42, type: 'REFRESH' });
      expect(received).toEqual({ actionId: 42, type: 'REFRESH' });
      expect(StateManager.getState('custom:action')).toBeUndefined();
    });

    test('1.4 Re-entrant subscriber unsubscription during high-volume emit does not corrupt listener iteration', () => {
      const callLog = [];
      let unsubSelf;

      unsubSelf = StateManager.on('burst:event', (payload) => {
        callLog.push(`self_${payload}`);
        unsubSelf(); // Self-unsubscribe on first invocation
      });

      StateManager.on('burst:event', (payload) => {
        callLog.push(`stable_${payload}`);
      });

      StateManager.emit('burst:event', 1);
      StateManager.emit('burst:event', 2);
      StateManager.emit('burst:event', 3);

      expect(callLog).toEqual(['self_1', 'stable_1', 'stable_2', 'stable_3']);
    });

    test('1.5 High-frequency stress: 20,000 rapid state mutations across 50 keys maintain exact state and emissions', () => {
      const KEY_COUNT = 50;
      const ITERATIONS = 400; // 50 * 400 = 20,000 updates
      let totalEmissions = 0;

      for (let k = 0; k < KEY_COUNT; k++) {
        StateManager.on(`state:key_${k}`, () => {
          totalEmissions++;
        });
      }

      const t0 = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        for (let k = 0; k < KEY_COUNT; k++) {
          StateManager.setState(`key_${k}`, i);
        }
      }
      const duration = performance.now() - t0;

      expect(totalEmissions).toBe(KEY_COUNT * ITERATIONS);
      for (let k = 0; k < KEY_COUNT; k++) {
        expect(StateManager.getState(`key_${k}`)).toBe(ITERATIONS - 1);
      }
      // Performance check: 20k emissions should be well within reasonable budget (< 500ms)
      expect(duration).toBeLessThan(500);
    });

    test('1.6 clear() resets both state store and event listeners completely', () => {
      let callCount = 0;
      StateManager.on('state:dummy', () => callCount++);
      StateManager.setState('dummy', 123);
      expect(callCount).toBe(1);
      expect(StateManager.getState('dummy')).toBe(123);

      StateManager.clear();
      expect(StateManager.getState('dummy')).toBeUndefined();

      StateManager.emit('state:dummy', 456);
      expect(callCount).toBe(1); // Listener was purged
    });
  });

  // ==========================================================================
  // AREA 2: Setting stg Proxy Theme and Palette Stylesheet Link Href Swapping
  // ==========================================================================
  describe('Area 2: Setting stg Proxy Theme and Palette Stylesheet Link Href Swapping', () => {

    test('2.1 Theme changes through stg proxy synchronously swap theme and palette link hrefs', () => {
      const themes = ['light', 'dark', 'solarized', 'night', 'nord', 'dracula'];

      for (const t of themes) {
        let themeChangedEmitted = false;
        const unsub = StateManager.on('theme:changed', (data) => {
          if (data.theme === t) themeChangedEmitted = true;
        });

        // Mutate through reactive proxy
        stg.theme = t;

        // Verify DOM link href swapping
        expect(dom.theme.getAttribute('href')).toBe(`css/themes/${t}.css`);
        expect(dom.palette.getAttribute('href')).toBe(`css/palettes/${t}.css`);

        // Verify DOM body data-theme attribute
        expect(document.body.getAttribute('data-theme')).toBe(t);
        expect(document.documentElement.getAttribute('data-theme')).toBe(t);

        // Verify localStorage persistence
        expect(localStorage.getItem('theme')).toBe(t);

        // Verify StateManager state and event emission
        expect(StateManager.getState('theme')).toBe(t);
        expect(themeChangedEmitted).toBe(true);

        unsub();
      }
    });

    test('2.2 Rapid cycling of themes (120 transitions) maintains strict DOM link href and storage consistency', () => {
      const themes = ['nord', 'night', 'solarized', 'dracula', 'light', 'dark'];
      const CYCLES = 20; // 20 * 6 = 120 transitions

      const t0 = performance.now();
      for (let c = 0; c < CYCLES; c++) {
        for (const t of themes) {
          stg.theme = t;
          expect(dom.theme.getAttribute('href')).toBe(`css/themes/${t}.css`);
          expect(dom.palette.getAttribute('href')).toBe(`css/palettes/${t}.css`);
        }
      }
      const duration = performance.now() - t0;

      expect(stg.theme).toBe('dark');
      expect(dom.theme.getAttribute('href')).toBe('css/themes/dark.css');
      expect(dom.palette.getAttribute('href')).toBe('css/palettes/dark.css');
      expect(duration).toBeLessThan(250);
    });

    test('2.3 Setting.setTheme() fallback behavior when theme is empty or invalid', () => {
      stg.theme = '';
      Setting.setTheme();
      // Should fall back to 'light'
      expect(dom.theme.getAttribute('href')).toBe('css/themes/light.css');
      expect(dom.palette.getAttribute('href')).toBe('css/palettes/light.css');
      expect(document.body.getAttribute('data-theme')).toBe('light');
    });

    test('2.4 Other stg properties persist to localStorage and trigger respective callbacks', () => {
      stg.font = 18;
      expect(localStorage.getItem('font')).toBe('18');
      expect(dom.body.style.fontSize).toBe('18px');

      stg.save_strict = true;
      expect(localStorage.getItem('save_strict')).toBe('true');
      expect(stg.save_strict).toBe(true);

      stg.delimiter = ';';
      expect(localStorage.getItem('delimiter')).toBe(';');
      expect(stg.delimiter).toBe(';');
    });
  });

  // ==========================================================================
  // AREA 3: XSS Attack Payloads in Finder.js showTable() and ui/input/Table.js
  // ==========================================================================
  describe('Area 3: XSS Attack Payloads in Finder.js showTable() and ui/input/Table.js', () => {
    let df;
    let sheet;
    let finder;

    const XSS_PAYLOADS = [
      { name: 'Standard script tag', payload: '<script>alert("XSS")</script>' },
      { name: 'Image onerror handler', payload: '<img src=x onerror=alert("pwned")>' },
      { name: 'SVG onload handler', payload: '<svg onload=alert(1)>' },
      { name: 'Breakout script injection', payload: '"><script>alert(document.cookie)</script>' },
      { name: 'Iframe javascript URI', payload: '<iframe src="javascript:alert(1)"></iframe>' },
      { name: 'Body onload injection', payload: '<body onload=alert(1)>' },
      { name: 'Autofocus input handler', payload: '<input autofocus onfocus=alert(1)>' },
      { name: 'Link javascript URI', payload: '<a href="javascript:alert(1)">Click Me</a>' },
      { name: 'Broken nested script tags', payload: '<<SCRIPT>alert("nested");//<</SCRIPT>' },
      { name: 'EventHandler on div', payload: '<div onmouseover="alert(1)">Hover Me</div>' }
    ];

    beforeEach(() => {
      const rows = XSS_PAYLOADS.map((item, idx) => [`Row_${idx}`, item.payload, `Safe_${idx}`]);
      df = new Dataframe(rows);
      sheet = new Sheet(df);
      finder = new Finder(sheet);
    });

    test('3.1 Finder.showTable() completely neutralizes XSS payloads in cell values', () => {
      // Search for 'alert' which matches inside all malicious payloads
      finder.findIn.value = 'alert';
      finder.find(true);
      expect(finder.found.length).toBeGreaterThan(0);

      // Execute showTable() to populate listTable
      finder.showTable();

      expect(finder.listTable.rows.length).toBe(finder.found.length);
      expect(finder.listTable.style.display).toBe('block');

      // Assert that NO executable or malicious DOM elements exist in the generated table
      const executableSelectors = [
        'script',
        'img[onerror]',
        'svg[onload]',
        'iframe',
        'input[onfocus]',
        'div[onmouseover]',
        'a[href^="javascript:"]'
      ];

      for (const sel of executableSelectors) {
        const foundNodes = finder.listTable.querySelectorAll(sel);
        expect(foundNodes.length).toBe(0);
      }

      // Assert that legitimate search highlighting <b> tags ARE rendered safely
      const boldTags = finder.listTable.querySelectorAll('b');
      expect(boldTags.length).toBeGreaterThanOrEqual(finder.found.length);
      boldTags.forEach(b => {
        expect(b.textContent).toBe('alert');
      });
    });

    test('3.2 Finder.showTable() neutralizes XSS payloads when the search term itself contains attack payloads', () => {
      const maliciousSearch = '<img src=x onerror=alert("term")>';
      df.edit(0, 0, maliciousSearch);

      finder.findIn.value = maliciousSearch;
      finder.find(true);
      expect(finder.found.length).toBe(1);

      finder.showTable();

      // No image elements rendered in listTable
      expect(finder.listTable.querySelectorAll('img').length).toBe(0);

      // Content safely rendered with bold tags around escaped search term
      const boldTags = finder.listTable.querySelectorAll('b');
      expect(boldTags.length).toBe(1);
      expect(boldTags[0].textContent).toBe(maliciousSearch);
    });

    test('3.3 ui/input/Table.js behavior when receiving raw string vs Node instances', () => {
      const table = new Table();

      // Pushing safe text node
      const span = document.createElement('span');
      span.textContent = 'Safe Node Text';
      table.push(span);

      expect(table.rows.length).toBe(1);
      expect(table.table.querySelector('span')).not.toBeNull();
      expect(table.table.querySelector('span').textContent).toBe('Safe Node Text');

      // Pushing numbers / booleans
      table.push(12345);
      table.push(true);

      const cells = table.rows[0].querySelectorAll('td');
      expect(cells.length).toBe(3);
      expect(cells[1].textContent).toBe('12345');
      expect(cells[2].textContent).toBe('true');
    });

    test('3.4 Adversarial Audit: ui/input/Table.js raw string push versus Finder pre-sanitization boundary', () => {
      // NOTE: Table.js line 29 executes `td.innerHTML = String(item)`.
      // Finder.js line 333 explicitly pre-sanitizes strings via `escapeHtml()` BEFORE calling Table.push().
      // Here we empirically test both scenarios:

      // Scenario A: Caller does NOT pre-sanitize and pushes raw HTML to Table
      const rawTable = new Table();
      rawTable.push('<img src=x onerror=alert(1)>');
      const unescapedImg = rawTable.table.querySelector('img');
      // Table.js safely treats raw string as text node, neutralizing XSS without innerHTML
      expect(unescapedImg).toBeNull();
      expect(rawTable.table.textContent).toBe('<img src=x onerror=alert(1)>');

      // Scenario B: Caller (Finder.js) pre-sanitizes with escapeHtml
      const sanitizedTable = new Table();
      const escapeHtml = (str) => String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      sanitizedTable.push(escapeHtml('<img src=x onerror=alert(1)>'));
      const escapedImg = sanitizedTable.table.querySelector('img');
      expect(escapedImg).toBeNull();
      expect(sanitizedTable.table.textContent).toBe('<img src=x onerror=alert(1)>');
    });
  });

  // ==========================================================================
  // AREA 4: ValidationPane Batch Operations (acceptAll, rejectAll) at Volume
  // ==========================================================================
  describe('Area 4: ValidationPane Batch Operations (acceptAll, rejectAll) at Volume', () => {
    let df;
    let sheet;
    let pane;

    function createMockEdits(count) {
      const items = new Array(count);
      for (let i = 0; i < count; i++) {
        items[i] = {
          id: `val_${i}`,
          x: i % 20,
          y: Math.floor(i / 20),
          header: `Col_${i % 20}`,
          oldValue: `old_${i}`,
          newValue: `new_${i}`,
          category: (i % 3 === 0) ? 'TRIM' : (i % 3 === 1) ? 'FORMAT' : 'TYPE',
          status: 'pending'
        };
      }
      return items;
    }

    beforeEach(() => {
      pane = document.createElement('ui-validation-pane');
      document.getElementById('content').appendChild(pane);

      // Create large dataframe: 2500 rows x 20 cols = 50,000 cells
      const rows = Array.from({ length: 2500 }, (_, r) =>
        Array.from({ length: 20 }, (_, c) => `old_${r * 20 + c}`)
      );
      df = new Dataframe(rows);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);
      pane.bindSheet(sheet);
    });

    test('4.1 acceptAll() on 10,000 items commits single atomic RANGE_EDIT transaction and updates Dataframe', () => {
      const items = createMockEdits(10000);
      pane.loadItems(items);

      expect(pane.getPendingItems().length).toBe(10000);

      let capturedTx = null;
      const origCreate = df.create.bind(df);
      df.create = (cmd) => {
        capturedTx = cmd;
        origCreate(cmd);
      };

      const t0 = performance.now();
      pane.acceptAll();
      const duration = performance.now() - t0;

      // Verify single atomic RANGE_EDIT transaction created
      expect(capturedTx).not.toBeNull();
      expect(capturedTx.type).toBe('RANGE_EDIT');
      expect(capturedTx.payload.changes.length).toBe(10000);

      // Verify pending items cleared and status updated
      expect(pane.getPendingItems().length).toBe(0);
      expect(items.every(i => i.status === 'accepted')).toBe(true);

      // Verify Dataframe cell values updated
      expect(df.get(0, 0)).toBe('new_0');
      expect(df.get(19, 499)).toBe('new_9999');

      // Verify execution time scalability (< 100ms)
      expect(duration).toBeLessThan(100);
      console.log(`[CHALLENGER PERF] acceptAll() on 10,000 items: ${duration.toFixed(2)}ms`);
    });

    test('4.2 Dataframe undo reverses all 10,000 changes in a single undo step', () => {
      const items = createMockEdits(10000);
      pane.loadItems(items);
      pane.acceptAll();

      expect(df.get(0, 0)).toBe('new_0');

      // Revert via Dataframe undo
      df.undo();
      expect(df.redoStack.length).toBe(1);

      // Cells restored to original values
      expect(df.get(0, 0)).toBe('old_0');
      expect(df.get(19, 499)).toBe('old_9999');
    });

    test('4.3 rejectAll() on 10,000 items clears pane in < 50ms without mutating Dataframe', () => {
      const items = createMockEdits(10000);
      pane.loadItems(items);

      let dfMutated = false;
      df.create = () => { dfMutated = true; };
      df.edit = () => { dfMutated = true; };

      const t0 = performance.now();
      pane.rejectAll();
      const duration = performance.now() - t0;

      // Zero dataframe mutations
      expect(dfMutated).toBe(false);

      // Status transitioned to rejected
      expect(pane.getPendingItems().length).toBe(0);
      expect(items.every(i => i.status === 'rejected')).toBe(true);

      // Verify pane closed
      expect(pane.style.display).toBe('none');

      // Performance: very fast (< 50ms)
      expect(duration).toBeLessThan(50);
      console.log(`[CHALLENGER PERF] rejectAll() on 10,000 items: ${duration.toFixed(2)}ms`);
    });

    test('4.4 High volume stress: acceptAll() and rejectAll() at 25,000 items', () => {
      const itemsAccept = createMockEdits(25000);
      pane.loadItems(itemsAccept);

      const t0 = performance.now();
      pane.acceptAll();
      const acceptDur = performance.now() - t0;
      expect(pane.getPendingItems().length).toBe(0);
      expect(acceptDur).toBeLessThan(250);

      // Re-load 25,000 items and test rejectAll()
      const itemsReject = createMockEdits(25000);
      pane.loadItems(itemsReject);

      const t1 = performance.now();
      pane.rejectAll();
      const rejectDur = performance.now() - t1;
      expect(pane.getPendingItems().length).toBe(0);
      expect(rejectDur).toBeLessThan(100);

      console.log(`[CHALLENGER PERF] 25,000 items acceptAll: ${acceptDur.toFixed(2)}ms, rejectAll: ${rejectDur.toFixed(2)}ms`);
    });

    test('4.5 Edge Cases: acceptAll() and rejectAll() on empty or already-settled items', () => {
      pane.loadItems([]);
      expect(() => pane.acceptAll()).not.toThrow();
      expect(() => pane.rejectAll()).not.toThrow();

      // Double acceptAll
      const items = createMockEdits(5);
      pane.loadItems(items);
      pane.acceptAll();
      expect(pane.getPendingItems().length).toBe(0);
      expect(() => pane.acceptAll()).not.toThrow();
    });
  });

  // ==========================================================================
  // AREA 5: Validation Performance Budget Verification (< 100ms)
  // ==========================================================================
  describe('Area 5: Validation Performance Budget Verification (< 100ms)', () => {
    let pane;

    beforeEach(() => {
      pane = document.createElement('ui-validation-pane');
      document.getElementById('content').appendChild(pane);
    });

    test('5.1 10,000 items load time strictly complies with < 100ms budget', () => {
      const items = new Array(10000);
      for (let i = 0; i < 10000; i++) {
        items[i] = {
          id: `item_${i}`,
          x: i % 20,
          y: Math.floor(i / 20),
          oldValue: `val_${i}`,
          newValue: `fixed_${i}`,
          category: 'CLEANUP',
          status: 'pending'
        };
      }

      const t0 = performance.now();
      pane.loadItems(items);
      const loadTime = performance.now() - t0;

      console.log(`[CHALLENGER PERF BUDGET] 10,000 items load time: ${loadTime.toFixed(2)}ms`);
      // Target budget is < 100ms. In CI/test environment allow 100ms strict threshold check
      expect(loadTime).toBeLessThan(100);
    });

    test('5.2 1,000 binary search offset lookups execute in < 50ms', () => {
      const items = new Array(10000);
      for (let i = 0; i < 10000; i++) {
        items[i] = {
          id: `item_${i}`,
          x: i % 20,
          y: Math.floor(i / 20),
          oldValue: `val_${i}`,
          newValue: `fixed_${i}`,
          status: 'pending'
        };
      }
      pane.loadItems(items);

      const totalHeight = pane.totalHeight;
      const total = pane.flatItems.length;
      const scrollPositions = Array.from({ length: 1000 }, () => Math.random() * totalHeight);

      const t0 = performance.now();
      for (let k = 0; k < 1000; k++) {
        const scrollTop = scrollPositions[k];
        let startIndex = 0;
        let low = 0;
        let high = total - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (pane.offsets[mid + 1] <= scrollTop) {
            startIndex = mid + 1;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
      }
      const lookupDuration = performance.now() - t0;

      console.log(`[CHALLENGER PERF BUDGET] 1,000 binary search lookups: ${lookupDuration.toFixed(2)}ms`);
      expect(lookupDuration).toBeLessThan(50);
    });
  });
});
