/**
 * @file app/js/Popup.js
 * Sheet-relative top-right #popup-stack manager and shared Popup card base class
 * for <ui-finder>, <ui-filter>, and <ui-msg> notifications.
 */

import { BaseElement, setOpen, isOpen, cycleFocus } from './utils.js';

export function getPopupStack() {
  const doc = globalThis.document;
  if (!doc) return null;
  let stack = doc.getElementById?.('popup-stack');
  if (!stack && doc.createElement) {
    stack = doc.createElement('div');
    stack.id = 'popup-stack';
    (doc.getElementById?.('main-container') || doc.body)?.appendChild?.(stack);
  }
  return stack;
}

export class Popup extends BaseElement {
  constructor() {
    super();
    this._lastFocused = null;
    this.classList?.add('floating-panel');
    this.addEventListener?.('focusin', (event) => {
      if (event.target && this.contains?.(event.target)) {
        this._lastFocused = event.target;
      }
    });
    this.addEventListener?.('mousedown', (event) => {
      const target = event.target;
      if (!target?.closest?.('input, select, textarea, button, a, ui-glyph, ui-num, ui-list, ui-bool, [tabindex]')) {
        event.preventDefault();
        if (!this.contains?.(globalThis.document?.activeElement)) {
          (this._lastFocused || this.getFocusableElements?.()?.[0])?.focus?.();
        }
      }
    });
    this.addEventListener?.('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close?.();
      } else if (event.key === 'Tab') {
        const focusables = this.getFocusableElements?.();
        if (focusables?.length > 0) {
          event.stopPropagation();
          cycleFocus(event, focusables, this._lastFocused);
        }
      }
    });
  }

  get isOpen() { return isOpen(this); }

  mountToStack() {
    const stack = getPopupStack();
    if (stack && !stack.contains?.(this) && this.parentNode !== stack) {
      stack.appendChild(this);
    }
    return stack;
  }

  show() {
    this.mountToStack();
    setOpen(this, true);
    return this;
  }

  close() {
    setOpen(this, false);
    return this;
  }
}
