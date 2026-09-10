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
    expect(okBtn.classList.contains('icon')).toBe(true);
    expect(okBtn.querySelector('svg')).toBeNull();
    expect(okBtn.style.getPropertyValue('--icon-url')).toContain('url(');
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

    const okBtn = toastElem.querySelector('.ui-msg-ok');
    const cancelBtn = toastElem.querySelector('.ui-msg-cancel');
    const closeBtn = toastElem.querySelector('.ui-toast-close-btn');

    expect(okBtn).not.toBeNull();
    expect(cancelBtn).not.toBeNull();
    expect(closeBtn).not.toBeNull();

    // Standard icon button verification
    expect(okBtn.classList.contains('icon')).toBe(true);
    expect(okBtn.querySelector('svg')).toBeNull();
    expect(okBtn.style.getPropertyValue('--icon-url')).toContain('url(');

    expect(cancelBtn.classList.contains('icon')).toBe(true);
    expect(cancelBtn.querySelector('svg')).toBeNull();
    expect(cancelBtn.style.getPropertyValue('--icon-url')).toContain('url(');

    expect(closeBtn.classList.contains('icon')).toBe(true);
    expect(closeBtn.querySelector('svg')).toBeNull();
    expect(closeBtn.style.getPropertyValue('--icon-url')).toContain('url(');

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

  test('Keyboard Tab navigation loops across buttons in choice message dialog', () => {
    const msgInstance = Msg.choice(
      'Confirm changes?',
      () => {},
      () => {}
    );
    document.body.appendChild(msgInstance);
    msgInstance.connectedCallback();

    const pressTab = (onEl, shift = false) => {
      onEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true
      }));
    };

    // Starts on cancel (or ok)
    msgInstance.cancel.focus();
    expect(document.activeElement).toBe(msgInstance.cancel);

    pressTab(msgInstance.cancel); // cancel -> ok
    expect(document.activeElement).toBe(msgInstance.ok);

    pressTab(msgInstance.ok); // ok -> closeBtn
    expect(document.activeElement).toBe(msgInstance.closeBtn);

    pressTab(msgInstance.closeBtn); // closeBtn -> wraps to cancel
    expect(document.activeElement).toBe(msgInstance.cancel);

    // Shift+Tab wraps back to closeBtn
    pressTab(msgInstance.cancel, true);
    expect(document.activeElement).toBe(msgInstance.closeBtn);

    // Shift+Tab from closeBtn moves to ok
    pressTab(msgInstance.closeBtn, true);
    expect(document.activeElement).toBe(msgInstance.ok);
  });
});
