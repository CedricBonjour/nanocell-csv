import { describe, test, expect, beforeEach } from 'vitest';
import '../app/js/CMenu.js'; // Ensure custom element is registered before build_dom
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { getTargetType, TargetType } from '../app/js/mouse.js';
import { CMenu } from '../app/js/CMenu.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 1 — Deep DOM Stress & Target Element Resolution', () => {
  let df;
  let sheet;
  let cmenu;

  /**
   * Helper to create a deeply nested DOM hierarchy inside a container element.
   */
  function createDeeplyNestedElement(container, depth = 5) {
    const tags = ['div', 'span', 'b', 'i', 'u', 'em', 'strong', 'code', 'section', 'article'];
    let current = container;
    for (let i = 0; i < depth; i++) {
      const tag = tags[i % tags.length];
      const child = document.createElement(tag);
      child.setAttribute('data-depth', String(i + 1));
      current.appendChild(child);
      current = child;
    }
    return current; // Return the innermost leaf element
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <header id="header"></header>
      <div id="content" class="flexMain">
        <ui-sheet id="sheet"></ui-sheet>
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
    Setting.init();
    build_dom();

    cmenu = new CMenu();
    dom.cmenu = cmenu;
    document.body.appendChild(cmenu);

    df = new Dataframe([
      ['Header1', 'Header2', 'Header3'],
      ['Row1Col1', 'Row1Col2', 'Row1Col3'],
      ['Row2Col1', 'Row2Col2', 'Row2Col3'],
      ['Row3Col1', 'Row3Col2', 'Row3Col3']
    ]);
    sheet = new Sheet(df);
    StateManager.setState('sheet', sheet);
  });

  describe('1. Target Element Resolution with 5+ Levels Deep DOM Nesting', () => {
    test('getTargetType resolves cell for 5, 10, 20, 50, and 100 level deep nested nodes in data td', () => {
      const dataTd = sheet.rows[1].cells[1]; // tx: 0, ty: 0
      const depths = [5, 10, 20, 50, 100];

      for (const depth of depths) {
        dataTd.innerHTML = '';
        const leaf = createDeeplyNestedElement(dataTd, depth);
        const mockEvent = { target: leaf };
        const targetType = getTargetType(mockEvent);
        expect(targetType).toBe(TargetType.cell);
      }
    });

    test('getTargetType resolves colH for 5+ level deep nested nodes in column header', () => {
      const colHeaderTd = sheet.rows[0].cells[1]; // tx: 0, ty: -1
      const leaf = createDeeplyNestedElement(colHeaderTd, 7);
      const mockEvent = { target: leaf };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.colH);
    });

    test('getTargetType resolves rowH for 5+ level deep nested nodes in row header', () => {
      const rowHeaderTd = sheet.rows[1].cells[0]; // tx: -1, ty: 0
      const leaf = createDeeplyNestedElement(rowHeaderTd, 8);
      const mockEvent = { target: leaf };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.rowH);
    });

    test('getTargetType resolves allH for 5+ level deep nested nodes in corner cell', () => {
      const cornerTd = sheet.rows[0].cells[0]; // tx: -1, ty: -1
      const leaf = createDeeplyNestedElement(cornerTd, 6);
      const mockEvent = { target: leaf };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.allH);
    });
  });

  describe('2. Context Menu Popups and Coordinate Retrieval under Stress', () => {
    test('CMenu.pop resolves tx/ty coordinates when target is 10 levels deep inside data cell', () => {
      const dataTd = sheet.rows[2].cells[2]; // tx: 1, ty: 1
      const leaf = createDeeplyNestedElement(dataTd, 10);
      leaf.textContent = 'Nested Content';

      const mockEvent = {
        target: leaf,
        clientX: 250,
        clientY: 300,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(1);
      expect(cmenu.y).toBe(1);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toBe('cell');
    });

    test('CMenu.pop updates sheet coordinates with baseX/baseY offset when clicking deeply nested node', () => {
      // Create a larger dataframe to accommodate baseX=5, baseY=10
      const largeDf = new Dataframe(
        Array.from({ length: 20 }, (_, r) => Array.from({ length: 10 }, (_, c) => `R${r}C${c}`))
      );
      const largeSheet = new Sheet(largeDf);
      StateManager.setState('sheet', largeSheet);

      largeSheet.baseX = 5;
      largeSheet.baseY = 10;
      const dataTd = largeSheet.rows[1].cells[2]; // tx: 1, ty: 0
      const leaf = createDeeplyNestedElement(dataTd, 6);

      const mockEvent = {
        target: leaf,
        clientX: 180,
        clientY: 220,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(largeSheet.x).toBe(1 + 5); // tx + baseX
      expect(largeSheet.y).toBe(0 + 10); // ty + baseY
      expect(cmenu.x).toBe(1);
      expect(cmenu.y).toBe(0);
    });

    test('Rapid sequential CMenu.pop calls across 100 deeply nested elements across cells', () => {
      for (let r = 1; r <= 3; r++) {
        for (let c = 1; c <= 3; c++) {
          const cellTd = sheet.rows[r].cells[c];
          const leaf = createDeeplyNestedElement(cellTd, 5 + (r * c));
          const mockEvent = {
            target: leaf,
            clientX: 50 * c,
            clientY: 50 * r,
            preventDefault: () => {}
          };
          cmenu.pop(mockEvent);
          expect(cmenu.x).toBe(cellTd.tx);
          expect(cmenu.y).toBe(cellTd.ty);
          expect(cmenu.style.display).toBe('block');
        }
      }
    });

    test('CMenu.pop on 5+ deep node in col header resolves column selection and header text', () => {
      const colHeaderTd = sheet.rows[0].cells[2]; // tx: 1, ty: -1
      const leaf = createDeeplyNestedElement(colHeaderTd, 6);
      leaf.innerText = 'Deep Header';

      const mockEvent = {
        target: leaf,
        clientX: 200,
        clientY: 30,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(1);
      expect(cmenu.y).toBe(-1);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toContain('col : ');
    });

    test('CMenu.pop on 5+ deep node in row header resolves row selection and header text', () => {
      const rowHeaderTd = sheet.rows[2].cells[0]; // tx: -1, ty: 1
      const leaf = createDeeplyNestedElement(rowHeaderTd, 6);
      leaf.innerText = '2';

      const mockEvent = {
        target: leaf,
        clientX: 30,
        clientY: 150,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(-1);
      expect(cmenu.y).toBe(1);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toContain('row : ');
    });
  });

  describe('3. Event Dispatch & Interaction Stress on Deeply Nested Nodes', () => {
    test('mousedown on 10-level deep node updates sheet selection', () => {
      const dataTd = sheet.rows[2].cells[1]; // tx: 0, ty: 1
      const leaf = createDeeplyNestedElement(dataTd, 10);

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 120,
        clientY: 140
      });
      Object.defineProperty(mousedownEvent, 'target', { value: leaf, enumerable: true });

      document.dispatchEvent(mousedownEvent);

      expect(sheet.x).toBe(dataTd.tx + sheet.baseX);
      expect(sheet.y).toBe(dataTd.ty + sheet.baseY);
    });

    test('SheetController mouseover & dblclick event delegation on 5+ deep nodes', () => {
      const dataTd = sheet.rows[1].cells[1]; // tx: 0, ty: 0
      const leaf = createDeeplyNestedElement(dataTd, 6);

      // Trigger mouseover on leaf
      const mouseoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true });
      Object.defineProperty(mouseoverEvent, 'target', { value: leaf, enumerable: true });
      sheet.dispatchEvent(mouseoverEvent);

      // Trigger dblclick on col header leaf
      const colHeaderTd = sheet.rows[0].cells[1];
      const colLeaf = createDeeplyNestedElement(colHeaderTd, 8);
      const dblclickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
      Object.defineProperty(dblclickEvent, 'target', { value: colLeaf, enumerable: true });
      sheet.dispatchEvent(dblclickEvent);

      expect(colHeaderTd.style.width).toBe('auto');
    });
  });

  describe('4. Edge Cases & Robustness Boundaries', () => {
    test('SVG element inside deeply nested cell', () => {
      const dataTd = sheet.rows[1].cells[1];
      const leaf = createDeeplyNestedElement(dataTd, 5);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      leaf.appendChild(svg);

      const mockEvent = { target: path, clientX: 100, clientY: 100, preventDefault: () => {} };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.cell);
    });

    test('Disconnected DOM node target does not throw exception', () => {
      const detachedDiv = document.createElement('div');
      const mockEvent = { target: detachedDiv, clientX: 50, clientY: 50, preventDefault: () => {} };
      expect(() => getTargetType(mockEvent)).not.toThrow();
      expect(getTargetType(mockEvent)).toBe(TargetType.na);
    });

    test('Text node target inside deeply nested DOM structure', () => {
      const dataTd = sheet.rows[1].cells[1];
      const leaf = createDeeplyNestedElement(dataTd, 5);
      const textNode = document.createTextNode('Text inside leaf');
      leaf.appendChild(textNode);

      const mockEvent = { target: textNode, clientX: 100, clientY: 100, preventDefault: () => {} };
      // In JS DOM, textNode.closest may or may not exist depending on environment.
      // e.target.closest check handles non-element targets safely.
      expect(() => getTargetType(mockEvent)).not.toThrow();
    });
  });
});
