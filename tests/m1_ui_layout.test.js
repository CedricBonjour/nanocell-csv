import { describe, test, expect, beforeEach } from 'vitest';
import '../app/js/CMenu.js'; // Ensure custom element is registered before build_dom
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { getTargetType, TargetType } from '../app/js/mouse.js';
import { CMenu } from '../app/js/CMenu.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 1 — UI & Layout Fixes (Requirement R1)', () => {
  let df;
  let sheet;
  let cmenu;

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
      ['H1', 'H2'],
      ['Val1', 'Val2']
    ]);
    sheet = new Sheet(df);
    StateManager.setState('sheet', sheet);
  });

  describe('Context Menu & Target Element Resolution', () => {
    test('getTargetType resolves cell when e.target is a child div inside a data td', () => {
      const dataTd = sheet.rows[1].cells[1]; // tx: 0, ty: 0
      const childDiv = document.createElement('div');
      childDiv.innerText = 'Inside Div';
      dataTd.appendChild(childDiv);

      const mockEvent = { target: childDiv };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.cell);
    });

    test('getTargetType resolves colH when e.target is a child span inside a col header', () => {
      const colHeaderTd = sheet.rows[0].cells[1]; // tx: 0, ty: -1
      const childSpan = document.createElement('span');
      childSpan.innerText = 'Header Span';
      colHeaderTd.appendChild(childSpan);

      const mockEvent = { target: childSpan };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.colH);
    });

    test('getTargetType resolves rowH when e.target is a child span inside a row header', () => {
      const rowHeaderTd = sheet.rows[1].cells[0]; // tx: -1, ty: 0
      const childSpan = document.createElement('span');
      childSpan.innerText = 'Row Span';
      rowHeaderTd.appendChild(childSpan);

      const mockEvent = { target: childSpan };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.rowH);
    });

    test('getTargetType resolves allH when e.target is inside top-left corner header cell', () => {
      const cornerTd = sheet.rows[0].cells[0]; // tx: -1, ty: -1
      const childSpan = document.createElement('span');
      childSpan.innerText = 'Corner';
      cornerTd.appendChild(childSpan);

      const mockEvent = { target: childSpan };
      const targetType = getTargetType(mockEvent);
      expect(targetType).toBe(TargetType.allH);
    });

    test('CMenu.pop resolves coordinates x, y correctly when right-clicking child div inside cell', () => {
      const dataTd = sheet.rows[1].cells[1]; // tx: 0, ty: 0
      const childDiv = document.createElement('div');
      childDiv.innerText = 'Test Cell Text';
      dataTd.appendChild(childDiv);

      const mockEvent = {
        target: childDiv,
        clientX: 150,
        clientY: 200,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(dataTd.tx);
      expect(cmenu.y).toBe(dataTd.ty);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toBe('cell');
    });

    test('CMenu.pop resolves column header text and selection when clicking header child span', () => {
      const colHeaderTd = sheet.rows[0].cells[1]; // tx: 0, ty: -1
      const childSpan = document.createElement('span');
      childSpan.innerText = 'Col Header Text';
      colHeaderTd.appendChild(childSpan);

      const mockEvent = {
        target: childSpan,
        clientX: 100,
        clientY: 50,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.x).toBe(colHeaderTd.tx);
      expect(cmenu.y).toBe(colHeaderTd.ty);
      expect(cmenu.style.display).toBe('block');
      expect(cmenu.firstBlock.innerText).toContain('col : ');
    });

    test('CMenu.pop handles selection class on cell correctly when target is child element', () => {
      const dataTd = sheet.rows[1].cells[1];
      dataTd.classList.add('slct');
      const childSpan = document.createElement('span');
      dataTd.appendChild(childSpan);

      const mockEvent = {
        target: childSpan,
        clientX: 120,
        clientY: 180,
        preventDefault: () => {}
      };

      cmenu.pop(mockEvent);

      expect(cmenu.firstBlock.innerText).toBe('selection');
      expect(cmenu.style.display).toBe('block');
    });

    test('mousedown event updates sheet selection when clicking on child element', () => {
      const dataTd = sheet.rows[1].cells[1]; // tx: 0, ty: 0
      const childDiv = document.createElement('div');
      dataTd.appendChild(childDiv);

      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 100,
        clientY: 100
      });
      Object.defineProperty(mousedownEvent, 'target', { value: childDiv, enumerable: true });

      document.dispatchEvent(mousedownEvent);

      expect(sheet.x).toBe(dataTd.tx + sheet.baseX);
      expect(sheet.y).toBe(dataTd.ty + sheet.baseY);
    });
  });
});
