import { describe, test, expect, beforeEach } from 'vitest';
import '../app/js/ui/ValidationPane.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { ValidationPane } from '../app/js/ui/ValidationPane.js';
import { StateManager } from '../app/js/StateManager.js';

describe('Milestone 1 — Validation Pane & Cell Focus Navigation Test Suite', () => {
  let df;
  let sheet;
  let pane;

  beforeEach(() => {
    document.body.innerHTML = `
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
    Setting.init();
    build_dom();

    pane = document.createElement('ui-validation-pane');
    pane.id = 'validation-pane';
    document.getElementById('content').appendChild(pane);

    df = new Dataframe([
      ['Header 1', 'Header 1', 'Header!@#'],
      [' 12,34 ', 'Say "hello"', 'Line1\nLine2']
    ]);
    sheet = new Sheet(df);
    StateManager.setState('sheet', sheet);

    pane.bindSheet(sheet);
  });

  describe('ValidationPane Custom Element API', () => {
    test('ValidationPane is registered as a custom element', () => {
      expect(customElements.get('ui-validation-pane')).toBeDefined();
      expect(pane instanceof HTMLElement).toBe(true);
    });

    test('bindSheet binds sheet instance to pane', () => {
      pane.bindSheet(sheet);
      expect(pane.sheet).toBe(sheet);
      expect(pane.getSheet()).toBe(sheet);
    });

    test('loadItems loads proposed edit items and updates badge count', () => {
      const mockItems = [
        {
          id: 'item1',
          x: 0,
          y: 1,
          header: 'Header 1',
          oldValue: ' 12,34 ',
          newValue: '12.34',
          category: 'WHITESPACE_TRIMMING',
          categoryName: 'Whitespace/Trimming',
          status: 'pending'
        }
      ];

      pane.loadItems(mockItems);
      expect(pane.items.length).toBe(1);
      const badge = pane.querySelector('#validation-count-badge');
      expect(badge.textContent).toBe('1');
    });

    test('show() sets display flex and opens pane', () => {
      pane.show();
      expect(pane.style.display).toBe('flex');
      expect(pane.classList.contains('open')).toBe(true);
      expect(StateManager.getState('validationPaneOpen')).toBe(true);
    });

    test('close() sets display none and closes pane', () => {
      pane.show();
      pane.close();
      expect(pane.style.display).toBe('none');
      expect(pane.classList.contains('open')).toBe(false);
      expect(StateManager.getState('validationPaneOpen')).toBe(false);
    });

    test('handleItemClick focuses grid cell and selects card', () => {
      const item = {
        id: 'item1',
        x: 1,
        y: 1,
        header: 'Header 1',
        oldValue: 'Say "hello"',
        newValue: "Say 'hello'",
        category: 'CONSTRAINT_RANGE_VIOLATION',
        categoryName: 'Constraint/Range Violations',
        status: 'pending'
      };

      pane.loadItems([item]);
      pane.handleItemClick(item);

      expect(sheet.x).toBe(1);
      expect(sheet.y).toBe(1);
      expect(pane.selectedId).toBe('item1');
    });
  });

  describe('Sheet focus_cell API', () => {
    test('focus_cell sets x, y and triggers selection refresh', () => {
      sheet.focus_cell(2, 1);
      expect(sheet.x).toBe(2);
      expect(sheet.y).toBe(1);
    });
  });

  describe('Read-Only Validation Scanner & Edit Proposal Generation', () => {
    test('validate_headers produces proposed edit items for duplicate and non-alphanumeric headers', () => {
      const items = sheet.validate_headers();

      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('x');
      expect(items[0]).toHaveProperty('y', 0);
      expect(items[0]).toHaveProperty('category', 'DUPLICATE_FIX');
      expect(items[0]).toHaveProperty('categoryName', 'Duplicate Fixes');
      expect(items[0]).toHaveProperty('status', 'pending');

      // The second 'Header 1' should have newValue 'header_1_c2'
      const dupItem = items.find(i => i.x === 1);
      expect(dupItem).toBeDefined();
      expect(dupItem.newValue).toBe('header_1_c2');

      // Dataframe should remain unedited (read-only scan)
      expect(df.get(1, 0)).toBe('Header 1');
    });

    test('validate_data produces proposed edit items for whitespace, numeric coercion, and constraint violations', () => {
      stg.dv_comma_num = true;
      stg.dv_quotes = true;
      stg.dv_lr = true;

      const items = sheet.validate_data();

      expect(items.length).toBeGreaterThan(0);

      const whitespaceItem = items.find(i => i.category === 'WHITESPACE_TRIMMING');
      expect(whitespaceItem).toBeDefined();
      expect(whitespaceItem.oldValue).toBe(' 12,34 ');
      expect(whitespaceItem.newValue).toBe('12,34');

      const numericItem = items.find(i => i.category === 'DATA_TYPE_COERCION');
      expect(numericItem).toBeDefined();
      expect(numericItem.newValue).toBe('12.34');

      const quoteItem = items.find(i => i.oldValue === 'Say "hello"');
      expect(quoteItem).toBeDefined();
      expect(quoteItem.newValue).toBe("Say 'hello'");
      expect(quoteItem.category).toBe('CONSTRAINT_RANGE_VIOLATION');

      // Dataframe should remain unedited (read-only scan)
      expect(df.get(0, 1)).toBe(' 12,34 ');
      expect(df.get(1, 1)).toBe('Say "hello"');
    });
  });

  describe('ValidationPane Button & Icon Standardization', () => {
    test('Accept All and Reject All buttons follow the standard icon button system without raw inlined SVGs or text', () => {
      pane.init();
      const acceptAll = pane.querySelector('#validation-accept-all-btn');
      const rejectAll = pane.querySelector('#validation-reject-all-btn');

      expect(acceptAll).toBeDefined();
      expect(rejectAll).toBeDefined();

      // Must follow standard icon button class
      expect(acceptAll.classList.contains('icon')).toBe(true);
      expect(rejectAll.classList.contains('icon')).toBe(true);

      // Must not use raw inline SVGs
      expect(acceptAll.querySelector('svg')).toBeNull();
      expect(rejectAll.querySelector('svg')).toBeNull();

      // Must be icon-only buttons with accessibility labels and --icon-url
      expect(acceptAll.textContent.trim()).toBe('');
      expect(rejectAll.textContent.trim()).toBe('');
      expect(acceptAll.getAttribute('title')).toBe('Accept all proposed edits');
      expect(rejectAll.getAttribute('title')).toBe('Reject all proposed edits');
      expect(acceptAll.style.getPropertyValue('--icon-url')).toContain('url(');
      expect(rejectAll.style.getPropertyValue('--icon-url')).toContain('url(');
    });

    test('Item accept and reject buttons follow standard icon class with --icon-url and no raw inlined SVGs', () => {
      const item = {
        id: 'icon_test_1',
        x: 0,
        y: 1,
        header: 'Header 1',
        oldValue: ' 12,34 ',
        newValue: '12,34',
        category: 'WHITESPACE_TRIMMING',
        categoryName: 'Whitespace/Trimming',
        status: 'pending'
      };

      pane.loadItems([item]);
      pane.show();

      const acceptBtn = pane.querySelector('.item-accept-btn');
      const rejectBtn = pane.querySelector('.item-reject-btn');

      expect(acceptBtn).toBeDefined();
      expect(rejectBtn).toBeDefined();

      // Must use standard .icon and item classes
      expect(acceptBtn.classList.contains('icon')).toBe(true);
      expect(rejectBtn.classList.contains('icon')).toBe(true);
      expect(acceptBtn.classList.contains('item-accept-btn')).toBe(true);
      expect(rejectBtn.classList.contains('item-reject-btn')).toBe(true);

      // Must not contain raw inline SVGs
      expect(acceptBtn.querySelector('svg')).toBeNull();
      expect(rejectBtn.querySelector('svg')).toBeNull();

      // Must identify icon via data-icon
      expect(acceptBtn.getAttribute('data-icon')).toBe('on');
      expect(rejectBtn.getAttribute('data-icon')).toBe('off');
    });
  });
});

