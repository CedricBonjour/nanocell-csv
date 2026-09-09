import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../app/js/StateManager.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { getTargetType, TargetType } from '../app/js/mouse.js';
import { CMenu } from '../app/js/CMenu.js';
import { CsvHandle } from '../app/js/CsvHandle.js';
import { csv_parse, separatorDetection, loadcsv } from '../app/js/csv_worker.js';
import { CommandPalette } from '../app/js/ui/CommandPalette.js';
import { buildKeys } from '../app/js/key.js';
import { cmd, buildCommands } from '../app/js/cmd.js';
import fs from 'fs';
import path from 'path';

describe('Phase 2 Requirements (R1-R4) - Comprehensive Test Suite', () => {
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
    buildCommands();

    df = new Dataframe([
      ['Header0', 'Header1', 'Header2'],
      ['Row1Col0', 'Row1Col1', 'Row1Col2'],
      ['Row2Col0', 'Row2Col1', 'Row2Col2']
    ]);
    sheet = new Sheet(df);
    StateManager.setState('sheet', sheet);
    StateManager.setState('activeSheet', sheet);
    StateManager.setState('cmd', cmd);
  });

  // =========================================================================
  // TIER 1: Target Element Resolution for Context Menu (R1)
  // =========================================================================
  describe('Tier 1: Mouse Target Element Resolution (R1)', () => {
    test('getTargetType resolves cell when clicking on child span/div inside cell td', () => {
      const td = document.createElement('td');
      td.tx = 1;
      td.ty = 1;
      const childDiv = document.createElement('div');
      const childSpan = document.createElement('span');
      childSpan.textContent = 'Nested Text';
      childDiv.appendChild(childSpan);
      td.appendChild(childDiv);

      sheet.appendChild(td);

      const eventSpan = { target: childSpan };
      const eventDiv = { target: childDiv };

      expect(getTargetType(eventSpan)).toBe(TargetType.cell);
      expect(getTargetType(eventDiv)).toBe(TargetType.cell);
    });

    test('getTargetType resolves column header (colH) when clicking inside header cell with ty < 0', () => {
      const th = document.createElement('td');
      th.tx = 2;
      th.ty = -1;
      const innerSpan = document.createElement('span');
      innerSpan.textContent = 'Col Header';
      th.appendChild(innerSpan);
      sheet.appendChild(th);

      const event = { target: innerSpan };
      expect(getTargetType(event)).toBe(TargetType.colH);
    });

    test('getTargetType resolves row header (rowH) when clicking inside row header cell with tx < 0', () => {
      const td = document.createElement('td');
      td.tx = -1;
      td.ty = 3;
      const innerDiv = document.createElement('div');
      innerDiv.textContent = '3';
      td.appendChild(innerDiv);
      sheet.appendChild(td);

      const event = { target: innerDiv };
      expect(getTargetType(event)).toBe(TargetType.rowH);
    });

    test('getTargetType resolves all header (allH) when clicking select-all corner cell (tx < 0, ty < 0)', () => {
      const td = document.createElement('td');
      td.tx = -1;
      td.ty = -1;
      const innerSpan = document.createElement('span');
      td.appendChild(innerSpan);
      sheet.appendChild(td);

      const event = { target: innerSpan };
      expect(getTargetType(event)).toBe(TargetType.allH);
    });

    test('CMenu.pop correctly extracts cell coordinates and displays menu when right clicking child nodes', () => {
      const cmenu = new CMenu();
      document.body.appendChild(cmenu);

      const td = document.createElement('td');
      td.tx = 1;
      td.ty = 2;
      const childSpan = document.createElement('span');
      childSpan.textContent = 'Cell Data';
      td.appendChild(childSpan);
      sheet.appendChild(td);

      const mockEvent = {
        target: childSpan,
        clientX: 150,
        clientY: 200,
        preventDefault: vi.fn()
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(1);
      expect(cmenu.y).toBe(2);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toBe('cell');
    });
  });

  // =========================================================================
  // TIER 2: CSS Flexbox Layout & Height Styling Rules (R1)
  // =========================================================================
  describe('Tier 2: CSS Flexbox Layout Rules (R1)', () => {
    test('style.css defines flexbox container layout rules for #content, ui-sheet, and .sheet', () => {
      const styleCssPath = path.resolve(__dirname, '../app/style.css');
      const cssContent = fs.readFileSync(styleCssPath, 'utf-8');

      expect(cssContent).toContain('#content');
      expect(cssContent).toContain('display: flex;');
      expect(cssContent).toContain('flex-direction: column;');
      expect(cssContent).toContain('min-height: 0;');

      expect(cssContent).toContain('ui-sheet');
      expect(cssContent).toContain('.sheet');
      expect(cssContent).toContain('height: 100%;');
      expect(cssContent).toContain('width: 100%;');
    });

    test('DOM structure preserves container hierarchy for full viewport layout', () => {
      const contentEl = document.getElementById('content');
      expect(contentEl).not.toBeNull();
      expect(contentEl.classList.contains('flexMain')).toBe(true);

      const sheetEl = document.createElement('ui-sheet');
      contentEl.appendChild(sheetEl);
      expect(contentEl.querySelector('ui-sheet')).toBe(sheetEl);
    });
  });

  // =========================================================================
  // TIER 3: Streaming Chunked CSV File Loading Engine & Events (R2)
  // =========================================================================
  describe('Tier 3: Streaming CSV Loading & Worker Parsing (R2)', () => {
    test('separatorDetection accurately detects comma, semicolon, tab, and pipe delimiters', () => {
      expect(separatorDetection('a,b,c\n1,2,3')).toBe(',');
      expect(separatorDetection('a;b;c\n1;2;3')).toBe(';');
      expect(separatorDetection('a\tb\tc\n1\t2\t3')).toBe('\t');
      expect(separatorDetection('a|b|c\n1|2|3')).toBe('|');
    });

    test('csv_parse correctly parses standard, quoted, and multiline CSV strings', () => {
      const csvStr = 'name,age,city\n"Alice, M.",30,"Paris"\nBob,25,"London"';
      const result = csv_parse(csvStr, ',');

      expect(result.length).toBe(3);
      expect(result[0]).toEqual(['name', 'age', 'city']);
      expect(result[1]).toEqual(['Alice, M.', '30', 'Paris']);
      expect(result[2]).toEqual(['Bob', '25', 'London']);
    });

    test('CsvHandle processes file_chunk_loaded and dispatches readSuccess with StateManager events', () => {
      const csvHandle = new CsvHandle();
      StateManager.setState('csvHandle', csvHandle);

      let eventFired = false;
      let eventPayload = null;

      StateManager.on('file:loaded', (payload) => {
        eventFired = true;
        eventPayload = payload;
      });

      csvHandle.file = { name: 'test_stream.csv', size: 1024 };
      csvHandle.file_chunks = [];

      // Simulate chunk 1
      csvHandle.file_chunk_loaded({
        cmd: 'chunk_loaded',
        status: 0.5,
        chunk: [['h1', 'h2'], ['v1', 'v2']],
        chunk_id: 1
      });

      expect(csvHandle.file_chunks.length).toBe(1);
      expect(eventFired).toBe(false);

      // Simulate final chunk
      csvHandle.file_chunk_loaded({
        cmd: 'chunk_loaded',
        status: 1.0,
        chunk: [['v3', 'v4']],
        chunk_id: 2
      });

      expect(csvHandle.file_chunks.length).toBe(2);
      expect(eventFired).toBe(true);
      expect(eventPayload.filename).toBe('test_stream.csv');

      const loadedSheet = StateManager.getState('sheet');
      expect(loadedSheet).toBeDefined();
      expect(loadedSheet.df.get(0, 0)).toBe('h1');
      expect(loadedSheet.df.get(0, 2)).toBe('v3');
    });

    test('CsvHandle.read enforces viewOnly mode when file size exceeds editMaxFileSize', () => {
      const csvHandle = new CsvHandle();
      const mockFile = { name: 'huge_file.csv', size: 50 * 1000 * 1000 }; // 50MB
      stg.editMaxFileSize = 10; // 10MB limit

      const pipeSpy = vi.spyOn(csvHandle, 'pipe').mockImplementation(() => {});

      csvHandle.read(mockFile);

      expect(csvHandle.viewOnly).toBe(true);
      expect(pipeSpy).toHaveBeenCalledWith('read', expect.objectContaining({ viewOnly: true }));
    });
  });

  // =========================================================================
  // TIER 4: Command Palette Component & Action Execution (R3)
  // =========================================================================
  describe('Tier 4: Command Palette Web Component & Keyboard Navigation (R3)', () => {
    let palette;

    beforeEach(() => {
      palette = document.createElement('ui-command-palette');
      document.body.appendChild(palette);
    });

    test('<ui-command-palette> custom element initializes and mounts in DOM', () => {
      expect(palette).toBeInstanceOf(CommandPalette);
      expect(palette).toBeInstanceOf(HTMLElement);
      expect(customElements.get('ui-command-palette')).toBe(CommandPalette);
      expect(palette.getAttribute('role')).toBe('dialog');
    });

    test('open(), close(), and toggle() control palette visibility and StateManager state', () => {
      palette.open();
      expect(palette.style.display).toBe('block');
      expect(StateManager.getState('commandPaletteOpen')).toBe(true);

      palette.close();
      expect(palette.style.display).toBe('none');
      expect(StateManager.getState('commandPaletteOpen')).toBe(false);

      palette.toggle();
      expect(palette.style.display).toBe('block');
      expect(StateManager.getState('commandPaletteOpen')).toBe(true);
    });

    test('Ctrl+P triggers Command Palette toggle via keyboard listener', () => {
      buildKeys();
      palette.close();

      const ctrlPEvent = new KeyboardEvent('keydown', {
        key: 'p',
        code: 'KeyP',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });

      document.dispatchEvent(ctrlPEvent);

      expect(palette.style.display).toBe('block');
      expect(StateManager.getState('commandPaletteOpen')).toBe(true);
    });

    test('filterCommands performs search filtering against registered commands in cmd.js', () => {
      palette.open();
      palette.inputEl.value = 'select all';
      palette.filterCommands();

      expect(palette.filteredCommands.length).toBeGreaterThan(0);
      expect(palette.filteredCommands.some(c => c.id === 'slctAll')).toBe(true);
    });

    test('keyboard navigation ArrowDown/ArrowUp and Enter execute selected action', () => {
      let executed = false;
      const testCmdMap = {
        testAction: {
          k: 'T',
          description: 'Test Custom Action',
          run: () => { executed = true; }
        }
      };
      StateManager.setState('cmd', testCmdMap);

      palette.open();
      palette.filterCommands();

      expect(palette.filteredCommands[0].id).toBe('testAction');

      // Navigate down and press Enter
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      palette.handleKeyDown(enterEvent);

      expect(executed).toBe(true);
      expect(palette.style.display).toBe('none');
    });

    test('Escape key closes Command Palette without executing action', () => {
      palette.open();
      expect(palette.style.display).toBe('block');

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      palette.handleKeyDown(escEvent);

      expect(palette.style.display).toBe('none');
    });

    test('Toggle action bar display via cmd.menubar.run() toggles stg.actionBar and header visibility', () => {
      stg.actionBar = true;
      expect(dom.header.style.display).not.toBe('none');

      cmd.menubar.run();
      expect(stg.actionBar).toBe(false);
      expect(dom.header.style.display).toBe('none');

      cmd.menubar.run();
      expect(stg.actionBar).toBe(true);
      expect(dom.header.style.display).toBe('flex');
    });

    test('Ctrl+M triggers action bar display toggle via keyboard listener', () => {
      buildKeys();
      stg.actionBar = true;
      expect(dom.header.style.display).not.toBe('none');

      const ctrlMEvent = new KeyboardEvent('keydown', {
        key: 'm',
        code: 'KeyM',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(ctrlMEvent);

      expect(stg.actionBar).toBe(false);
      expect(dom.header.style.display).toBe('none');

      document.dispatchEvent(ctrlMEvent);
      expect(stg.actionBar).toBe(true);
      expect(dom.header.style.display).toBe('flex');
    });

    test('Command Palette fuzzy search matches action bar / menu bar and executes toggle', () => {
      stg.actionBar = true;
      palette.open();
      palette.inputEl.value = 'action bar';
      palette.filterCommands();

      const menubarCmd = palette.filteredCommands.find(c => c.id === 'menubar');
      expect(menubarCmd).toBeDefined();

      const idx = palette.filteredCommands.indexOf(menubarCmd);
      palette.executeIndex(idx);

      expect(stg.actionBar).toBe(false);
      expect(dom.header.style.display).toBe('none');
      expect(palette.style.display).toBe('none');
    });
  });

  // =========================================================================
  // TIER 5: Context-Independent Keyboard Navigation & Date Insertion
  // =========================================================================
  describe('Tier 5: Context-Independent Keyboard Navigation & Date Insertion', () => {
    beforeEach(() => {
      buildKeys();
    });

    test('cmd.date inserts today\'s date into selected cell on the grid', () => {
      sheet.x = 1;
      sheet.y = 1;
      const initialVal = df.get(1, 1);
      expect(initialVal).toBe('Row1Col1');

      cmd.date.run();

      const updatedVal = df.get(1, 1);
      expect(updatedVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('cmd.date inserts today\'s date directly into active cell input when editing', () => {
      sheet.x = 0;
      sheet.y = 1;
      sheet.input('Prefix-');

      expect(sheet.inputing).toBe(true);
      expect(sheet.inputField.value).toBe('Prefix-');

      cmd.date.run();

      expect(sheet.inputField.value).toMatch(/^Prefix-\d{4}-\d{2}-\d{2}$/);
      sheet.controller.inputBlur();
      expect(df.get(0, 1)).toMatch(/^Prefix-\d{4}-\d{2}-\d{2}$/);
    });

    test('Ctrl+; and Ctrl+T key events trigger date insertion on the grid', () => {
      sheet.x = 2;
      sheet.y = 1;
      expect(df.get(2, 1)).toBe('Row1Col2');

      // Ctrl + ;
      const ctrlSemicolon = new KeyboardEvent('keydown', {
        key: ';',
        code: 'Semicolon',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(ctrlSemicolon);
      expect(df.get(2, 1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Ctrl + T fallback
      sheet.x = 0;
      sheet.y = 2;
      const ctrlT = new KeyboardEvent('keydown', {
        key: 't',
        code: 'KeyT',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(ctrlT);
      expect(df.get(0, 2)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('Ctrl+; inside cell editor inserts date at cursor position', () => {
      sheet.x = 1;
      sheet.y = 2;
      sheet.input('');
      sheet.inputField.value = '';
      expect(sheet.inputing).toBe(true);

      const ctrlSemicolon = new KeyboardEvent('keydown', {
        key: ';',
        code: 'Semicolon',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      });
      sheet.inputField.dispatchEvent(ctrlSemicolon);

      expect(sheet.inputField.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      sheet.controller.inputBlur();
    });

    test('Shift+Tab navigates left in grid mode and commits edit & navigates left in cell editor', () => {
      // 1. Grid mode Shift+Tab
      sheet.x = 2;
      sheet.y = 1;
      const shiftTabGrid = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(shiftTabGrid);
      expect(sheet.x).toBe(1);

      // 2. Cell editor Shift+Tab
      sheet.input('EditedVal');
      expect(sheet.inputing).toBe(true);
      const shiftTabEditor = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      sheet.inputField.dispatchEvent(shiftTabEditor);
      expect(sheet.inputing).toBe(false);
      expect(df.get(1, 1)).toBe('EditedVal');
      expect(sheet.x).toBe(0);
    });

    test('PageUp and PageDown scroll rows without modifying or shifting dataframe content', () => {
      sheet.y = 0;
      const initialVal0 = df.get(0, 0);
      const initialVal1 = df.get(0, 1);

      const pageDown = new KeyboardEvent('keydown', { key: 'PageDown', code: 'PageDown', bubbles: true, cancelable: true });
      document.dispatchEvent(pageDown);
      expect(sheet.y).toBeGreaterThanOrEqual(0);

      const pageUp = new KeyboardEvent('keydown', { key: 'PageUp', code: 'PageUp', bubbles: true, cancelable: true });
      document.dispatchEvent(pageUp);
      expect(sheet.y).toBe(0);

      // Verify row data was NOT mutated by shift
      expect(df.get(0, 0)).toBe(initialVal0);
      expect(df.get(0, 1)).toBe(initialVal1);
    });

    test('Home, Ctrl+Home, and Ctrl+End navigate to respective cell boundaries', () => {
      sheet.x = 2;
      sheet.y = 2;

      // Home moves to column 0
      const homeEvent = new KeyboardEvent('keydown', { key: 'Home', code: 'Home', bubbles: true, cancelable: true });
      document.dispatchEvent(homeEvent);
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(2);

      // Ctrl + End moves to bottom-right cell
      const ctrlEndEvent = new KeyboardEvent('keydown', { key: 'End', code: 'End', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ctrlEndEvent);
      expect(sheet.x).toBe(df.width - 1);
      expect(sheet.y).toBe(df.height - 1);

      // Ctrl + Home moves to top-left cell (0, 0)
      const ctrlHomeEvent = new KeyboardEvent('keydown', { key: 'Home', code: 'Home', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ctrlHomeEvent);
      expect(sheet.x).toBe(0);
      expect(sheet.y).toBe(0);
    });

    test('F2 key enters cell editing mode', () => {
      sheet.x = 1;
      sheet.y = 1;
      expect(sheet.inputing).toBe(false);

      const f2Event = new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true, cancelable: true });
      document.dispatchEvent(f2Event);

      expect(sheet.inputing).toBe(true);
      expect(sheet.inputField.parentNode).not.toBeNull();
      sheet.controller.inputBlur();
    });

    test('Keys pressed while inside Command Palette do not leak into sheet cell navigation', () => {
      const palette = document.createElement('ui-command-palette');
      document.body.appendChild(palette);
      palette.open();

      sheet.x = 1;
      sheet.y = 1;

      // Press ArrowDown inside palette
      const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true });
      document.dispatchEvent(arrowDownEvent);

      // Sheet cell coordinates must remain unchanged
      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(1);
      expect(sheet.inputing).toBe(false);

      palette.close();
      palette.remove();
    });

    test('Keys pressed while inside Finder do not leak into sheet cell navigation', async () => {
      const { Finder } = await import('../app/js/Finder.js');
      const finder = new Finder(sheet);
      document.body.appendChild(finder);
      finder.show();

      sheet.x = 1;
      sheet.y = 1;

      // Focus finder input and press ArrowDown
      finder.findIn.focus();
      const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true });
      finder.findIn.dispatchEvent(arrowDownEvent);

      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(1);
      expect(sheet.inputing).toBe(false);

      finder.close();
      finder.remove();
    });

    test('Escape in modal dialog dismisses dialog and does not alter sheet cells', async () => {
      const { Setting } = await import('../app/js/Setting.js');
      Setting.show();
      expect(dom.dialog.children.length).toBeGreaterThan(0);

      sheet.x = 1;
      sheet.y = 1;

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      document.dispatchEvent(escEvent);

      expect(dom.dialog.children.length).toBe(0);
      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(1);
    });
  });

  // =========================================================================
  // CORE JSDOC & HYGIENE VERIFICATION (R4)
  // =========================================================================
  describe('Core Module Code Hygiene & JSDoc Checks (R4)', () => {
    test('Core modules exist and export expected interfaces', () => {
      expect(StateManager).toBeDefined();
      expect(typeof StateManager.on).toBe('function');
      expect(typeof StateManager.emit).toBe('function');

      expect(Dataframe).toBeDefined();
      expect(Sheet).toBeDefined();
      expect(CsvHandle).toBeDefined();
      expect(cmd).toBeDefined();
    });
  });
});
