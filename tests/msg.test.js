import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Msg } from '../app/js/Msg.js';
import { build_dom, dom } from '../app/js/dom.js';

describe('Msg Modern UI & Toast System Test Suite', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header id="header"></header>
      <div id="content"></div>
      <footer>
        <section id="dialog"></section>
      </footer>
    `;
    build_dom();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Msg.quick creates a floating toast notification that auto-dismisses', () => {
    Msg.quick('Quick notification message');

    const container = document.getElementById('ui-toast-container');
    expect(container).not.toBeNull();
    expect(container.children.length).toBe(1);

    const toast = container.querySelector('.ui-toast-card');
    expect(toast).not.toBeNull();
    expect(toast.innerHTML).toContain('Quick notification message');

    // Fast-forward auto-dismiss timer
    vi.advanceTimersByTime(2000);
    expect(container.children.length).toBe(0);
  });

  test('Msg.confirm creates a floating toast card with OK button', () => {
    let confirmed = false;
    Msg.confirm('Confirm this action', () => { confirmed = true; });

    const container = document.getElementById('ui-toast-container');
    expect(container).not.toBeNull();
    expect(container.children.length).toBeGreaterThan(0);

    const toastElem = container.querySelector('.ui-toast-card');
    expect(toastElem).not.toBeNull();
    expect(toastElem.innerHTML).toContain('Confirm this action');

    const okBtn = toastElem.querySelector('.ui-msg-ok');
    expect(okBtn).not.toBeNull();
    okBtn.click();

    expect(confirmed).toBe(true);
  });

  test('Msg.choice creates a floating toast card with OK and Cancel buttons', () => {
    let result = null;
    const msgInstance = Msg.choice(
      'Are you sure you want to proceed?',
      () => { result = 'OK'; },
      () => { result = 'CANCEL'; }
    );

    const container = document.getElementById('ui-toast-container');
    expect(container).not.toBeNull();
    const toastElem = container.querySelector('.ui-toast-card');
    expect(toastElem).not.toBeNull();
    expect(toastElem.querySelector('.ui-msg-ok')).not.toBeNull();
    expect(toastElem.querySelector('.ui-msg-cancel')).not.toBeNull();

    // Click Cancel
    msgInstance.cancel.click();
    expect(result).toBe('CANCEL');
  });

  test('Keyboard navigation: Escape triggers cancel callback and dismisses choice dialog', () => {
    let choiceMade = null;
    const msgInstance = Msg.choice(
      'Save changes before closing?',
      () => { choiceMade = true; },
      () => { choiceMade = false; }
    );

    document.body.appendChild(msgInstance);
    msgInstance.connectedCallback();

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    msgInstance.cancel.dispatchEvent(escapeEvent);

    expect(choiceMade).toBe(false);
  });
});
