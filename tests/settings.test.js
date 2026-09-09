import { describe, test, expect, beforeEach } from 'vitest';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { BoolInput } from '../app/js/ui/input/BoolInput.js';
import { ListInput } from '../app/js/ui/input/ListInput.js';
import { NumInput } from '../app/js/ui/input/NumInput.js';
import { About } from '../app/js/About.js';
import { cmd } from '../app/js/cmd.js';

describe('Settings Management & Input Components Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <header id="header"></header>
      <div id="content"></div>
      <footer>
        <section id="dialog"></section>
      </footer>
    `;
    build_dom();
    Setting.init();
  });

  test('Setting.show() leaves stg and localStorage completely untouched', () => {
    stg.purple = true;
    stg.theme = 'night';
    const initialStorageLength = localStorage.length;
    const initialStoragePurple = localStorage.getItem('purple');

    Setting.show();

    expect(stg.purple).toBe(true);
    expect(stg.theme).toBe('night');
    expect(localStorage.length).toBe(initialStorageLength);
    expect(localStorage.getItem('purple')).toBe(initialStoragePurple);
    expect(localStorage.getItem('save_strict')).toBeNull();
  });

  test('Clearing localStorage and calling Setting.init() restores all defined defaults', () => {
    stg.theme = 'dark';
    stg.font = 22;
    stg.purple = false;

    localStorage.clear();
    Setting.init();

    expect(stg.theme).toBe('light');
    expect(stg.font).toBe(13);
    expect(stg.purple).toBe(true);
    expect(stg.rows).toBe(25);
    expect(stg.cols).toBe(7);
    expect(stg.save_strict).toBe(false);
  });

  test('Modifying settings via stg persists to localStorage', () => {
    stg.font = 18;
    expect(stg.font).toBe(18);
    expect(localStorage.getItem('font')).toBe('18');

    stg.save_strict = true;
    expect(stg.save_strict).toBe(true);
    expect(localStorage.getItem('save_strict')).toBe('true');
  });

  test('Setting.set(key, val) updates stg property and persists to localStorage', () => {
    Setting.set('theme', 'dark');
    expect(stg.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    Setting.set('rows', 40);
    expect(stg.rows).toBe(40);
    expect(localStorage.getItem('rows')).toBe('40');
  });

  test('BoolInput programmatic property setters do not fire change events', () => {
    const input = new BoolInput(false);
    let fired = false;
    input.onchange = () => { fired = true; };

    input.value = true;
    expect(input.value).toBe(true);
    expect(fired).toBe(false);

    input.value = false;
    expect(input.value).toBe(false);
    expect(fired).toBe(false);
  });

  test('BoolInput user click and keydown events toggle value and fire change events', () => {
    const input = new BoolInput(false);
    document.body.appendChild(input);
    input.connectedCallback();
    let firedCount = 0;
    input.onchange = () => { firedCount++; };

    // User click
    input.click();
    expect(input.value).toBe(true);
    expect(firedCount).toBe(1);

    // User keydown (Enter)
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input.dispatchEvent(enterEvent);
    expect(input.value).toBe(false);
    expect(firedCount).toBe(2);

    // User keydown (Space)
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    input.dispatchEvent(spaceEvent);
    expect(input.value).toBe(true);
    expect(firedCount).toBe(3);
  });

  test('ListInput and NumInput programmatic setters do not fire change events, while interactions do', () => {
    const listInput = new ListInput(['light', 'dark']);
    document.body.appendChild(listInput);
    listInput.connectedCallback();
    let listFired = false;
    listInput.onchange = () => { listFired = true; };

    listInput.value = 'dark';
    expect(listInput.value).toBe('dark');
    expect(listFired).toBe(false);

    listInput.next(true); // User interaction
    expect(listInput.value).toBe('light');
    expect(listFired).toBe(true);

    const numInput = new NumInput(10, 0, 100);
    document.body.appendChild(numInput);
    numInput.connectedCallback();
    let numFired = false;
    numInput.onchange = () => { numFired = true; };

    numInput.value = 20;
    expect(numInput.value).toBe(20);
    expect(numFired).toBe(false);

    numInput.right.click(); // User interaction
    expect(numInput.value).toBe(21);
    expect(numFired).toBe(true);
  });

  test('About.show() and cmd.about.run() populates dom.dialog with ui-about element', () => {
    const dialog = dom.dialog;
    expect(dialog.children.length).toBe(0);

    const el = About.show();
    if (!el._initialized && typeof el.connectedCallback === 'function') {
      el.connectedCallback();
    }

    expect(dialog.children.length).toBeGreaterThan(0);
    const aboutElem = dialog.querySelector('ui-about');
    expect(aboutElem).not.toBeNull();
    expect(aboutElem.querySelector('h1').innerHTML).toBe('Nanocell CSV Editor');

    dialog.clear();
    expect(dialog.children.length).toBe(0);

    cmd.about.run();
    expect(dialog.children.length).toBeGreaterThan(0);
    expect(dialog.querySelector('ui-about')).not.toBeNull();
  });

  test('cmd.settings.run() invokes Setting.show() without ReferenceError', () => {
    dom.dialog.clear();
    expect(dom.dialog.children.length).toBe(0);
    expect(() => cmd.settings.run()).not.toThrow();
    expect(dom.dialog.children.length).toBeGreaterThan(0);
    expect(dom.dialog.querySelector('.stg-container')).not.toBeNull();
  });

  test('ListInput and NumInput stepper buttons use standard icons and proper accessibility labels', () => {
    const listInput = new ListInput(['alpha', 'beta', 'gamma']);
    document.body.appendChild(listInput);
    listInput.connectedCallback();

    expect(listInput.left.classList.contains('icon')).toBe(true);
    expect(listInput.right.classList.contains('icon')).toBe(true);
    expect(listInput.left.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(listInput.right.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(listInput.left.style.getPropertyValue('--icon-url')).not.toBe(listInput.right.style.getPropertyValue('--icon-url'));
    expect(listInput.left.getAttribute('aria-label')).toBe('Previous');
    expect(listInput.right.getAttribute('aria-label')).toBe('Next');

    const numInput = new NumInput(5, 1, 10);
    document.body.appendChild(numInput);
    numInput.connectedCallback();

    expect(numInput.left.classList.contains('icon')).toBe(true);
    expect(numInput.right.classList.contains('icon')).toBe(true);
    expect(numInput.left.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(numInput.right.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    expect(numInput.left.style.getPropertyValue('--icon-url')).not.toBe(numInput.right.style.getPropertyValue('--icon-url'));
    expect(numInput.left.getAttribute('aria-label')).toBe('Decrease');
    expect(numInput.right.getAttribute('aria-label')).toBe('Increase');
  });

  test('NumInput stepper disables decrement at minimum and disables increment at maximum', () => {
    const numInput = new NumInput(2, 2, 4);
    document.body.appendChild(numInput);
    numInput.connectedCallback();

    // At min (2), left should be disabled
    expect(numInput.left.disabled).toBe(true);
    expect(numInput.right.disabled).toBe(false);

    // Increase to 3
    numInput.right.click();
    expect(numInput.value).toBe(3);
    expect(numInput.left.disabled).toBe(false);
    expect(numInput.right.disabled).toBe(false);

    // Increase to max (4)
    numInput.right.click();
    expect(numInput.value).toBe(4);
    expect(numInput.left.disabled).toBe(false);
    expect(numInput.right.disabled).toBe(true);
  });

  test('About pane footer centers the bug report button and website url', () => {
    const el = About.show();
    if (!el._initialized && typeof el.connectedCallback === 'function') {
      el.connectedCallback();
    }
    const aboutFooter = el.querySelector('div[style*="bottom"]');
    expect(aboutFooter).not.toBeNull();
    expect(aboutFooter.style.alignItems).toBe('center');
    expect(aboutFooter.style.textAlign).toBe('center');

    const bugLink = aboutFooter.querySelector('a[href*="issues"]');
    expect(bugLink).not.toBeNull();
    expect(bugLink.style.display).toBe('flex');
    expect(bugLink.style.justifyContent).toBe('center');

    const homeLink = aboutFooter.querySelector('a[href*="nanocell-csv.com"]');
    expect(homeLink).not.toBeNull();
    expect(homeLink.style.textAlign).toBe('center');
  });

  test('Stepper buttons have tabindex="-1" to enable single-tab keyboard navigation across setting items', () => {
    const numInput = new NumInput(10, 0, 20);
    const listInput = new ListInput(['a', 'b', 'c']);
    const boolInput = new BoolInput(false);

    document.body.appendChild(numInput);
    document.body.appendChild(listInput);
    document.body.appendChild(boolInput);

    numInput.connectedCallback();
    listInput.connectedCallback();
    boolInput.connectedCallback();

    expect(numInput.getAttribute('tabindex')).toBe('0');
    expect(numInput.left.getAttribute('tabindex')).toBe('-1');
    expect(numInput.right.getAttribute('tabindex')).toBe('-1');

    expect(String(listInput.getAttribute('tabindex'))).toBe('0');
    expect(listInput.left.getAttribute('tabindex')).toBe('-1');
    expect(listInput.right.getAttribute('tabindex')).toBe('-1');

    expect(boolInput.getAttribute('tabindex')).toBe('0');
  });

  test('ArrowUp and ArrowDown keys do not affect NumInput, ListInput, or BoolInput values', () => {
    const numInput = new NumInput(15, 0, 30);
    const listInput = new ListInput(['first', 'second', 'third']);
    const boolInput = new BoolInput(false);

    document.body.appendChild(numInput);
    document.body.appendChild(listInput);
    document.body.appendChild(boolInput);

    numInput.connectedCallback();
    listInput.connectedCallback();
    boolInput.connectedCallback();

    // NumInput: Up and Down must not change value
    numInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(numInput.value).toBe(15);
    numInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(numInput.value).toBe(15);

    // NumInput: Left and Right behave as expected
    numInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(numInput.value).toBe(16);
    numInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(numInput.value).toBe(15);

    // ListInput: Up and Down must not change value
    listInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(listInput.value).toBe('first');
    listInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(listInput.value).toBe('first');

    // ListInput: Left and Right behave as expected
    listInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(listInput.value).toBe('second');
    listInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(listInput.value).toBe('first');

    // BoolInput: Up and Down must not change value
    boolInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(boolInput.value).toBe(false);
    boolInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(boolInput.value).toBe(false);

    // BoolInput: Left and Right toggle value as expected
    boolInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(boolInput.value).toBe(true);
    boolInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(boolInput.value).toBe(false);
  });

  test('Setting row adds active class on focusin and removes on focusout, and clicking row focuses control', () => {
    const settingDef = { key: 'font', dflt: 13, name: 'Font Size', min: 7, max: 24 };
    const row = Setting.buildRow(settingDef);
    document.body.appendChild(row);

    const input = row.querySelector('.ui-num');
    expect(input).not.toBeNull();
    expect(row.classList.contains('active')).toBe(false);

    // Focusin triggers active visual class
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(row.classList.contains('active')).toBe(true);

    // Focusout triggers removal of active class
    const outsideEl = document.createElement('div');
    document.body.appendChild(outsideEl);
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideEl }));
    expect(row.classList.contains('active')).toBe(false);

    // Clicking row focuses the input control
    let focusCalled = false;
    input.focus = () => { focusCalled = true; };
    const label = row.querySelector('.setting-name');
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(focusCalled).toBe(true);
  });
});

