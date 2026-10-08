import { setIcon } from '../utils/icons.js';
import { StateManager } from '../StateManager.js';

/**
 * Manages the modal dialog overlay lifecycle, accessible focus trap,
 * and dialog styling/dismissal.
 */
export class DialogManager {
  /** @type {HTMLElement|null} */
  static container = null;

  /**
   * Initializes the DialogManager bound to a container element.
   * @param {HTMLElement} [container] - Target container element (defaults to #dialog).
   */
  static init(container) {
    this.container = container || (typeof document !== 'undefined' ? document.getElementById("dialog") : null);
    if (!this.container) return;

    if (!this.container._dialogManagerBound) {
      this.container._dialogManagerBound = true;
      this.container.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }
  }

  /**
   * Opens a modal dialog with specified content.
   * @param {HTMLElement} element - Content element to display.
   * @param {Object} [options={}] - Display options.
   * @param {boolean} [options.fullscreen=false] - Whether to use large/fullscreen styling.
   * @param {boolean} [options.closeButton=true] - Whether to show the close button.
   */
  static open(element, { fullscreen = false, closeButton = true } = {}) {
    if (!this.container && typeof document !== 'undefined') {
      this.init();
    }
    if (!this.container) return;

    this.close();

    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const s = StateManager.getState('sheet');
    if (s?.finder && typeof s.finder.close === 'function') {
      s.finder.close();
    }
    if (typeof document !== 'undefined') {
      const finders = document.querySelectorAll('ui-finder, .finder-widget');
      for (const f of finders) {
        const target = (typeof f.close === 'function') ? f : f.parentElement;
        if (target && typeof target.close === 'function') {
          target.close();
        }
      }
    }

    if (fullscreen) {
      this.container.classList.add("dialog_large");
    } else {
      this.container.classList.add("dialog_small");
    }
    this.container.classList.add("scroll");
    this.container.appendChild(element);

    if (closeButton) {
      const btn = document.createElement("span");
      btn.className = "icon";
      setIcon(btn, 'off');
      btn.setAttribute("title", "Close (Esc)");
      btn.setAttribute("aria-label", "Close");
      btn.setAttribute("id", "closeDialog");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.addEventListener("click", () => this.close());
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.close();
        }
      });
      this.container.appendChild(btn);
    }
  }

  /**
   * Closes the active dialog, removes child elements, and updates sheet scrollbars.
   */
  static close() {
    if (!this.container) return;
    while (this.container.children.length > 0) {
      this.container.children[0].remove();
    }
    this.container.className = '';
    const s = StateManager.getState('sheet');
    if (s && typeof s.scrollbarRefresh === 'function') {
      s.scrollbarRefresh();
    }
  }

  /**
   * Backwards-compatible alias for open().
   * @param {HTMLElement} element 
   * @param {boolean} [fullscreen=false] 
   * @param {boolean} [closeButton=true] 
   */
  static push(element, fullscreen = false, closeButton = true) {
    return this.open(element, { fullscreen, closeButton });
  }

  /**
   * Backwards-compatible alias for close().
   */
  static clear() {
    return this.close();
  }

  /**
   * Returns true if a dialog is currently open.
   * @returns {boolean}
   */
  static get isBusy() {
    return Boolean(this.container && this.container.children.length > 0);
  }

  /**
   * Returns true if the dialog is in large/fullscreen mode.
   * @returns {boolean}
   */
  static get isLarge() {
    return Boolean(this.container && this.container.classList.contains("dialog_large"));
  }

  /**
   * Handles keyboard navigation within the modal to cycle focus among interactive controls.
   * @param {KeyboardEvent} e - Keydown event.
   */
  static handleKeyDown(e) {
    if (e.defaultPrevented || e.key !== 'Tab' || !this.container) return;
    const selector = '.ui-list, .ui-num, .ui-bool-toggle, ui-bool, button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), #closeDialog, [tabindex="0"]';
    const all = Array.from(this.container.querySelectorAll(selector));
    const focusable = all.filter(el => {
      if (el.disabled) return false;
      if (el.style.display === 'none') return false;
      if (el.closest && el.closest('.hidden')) return false;
      return true;
    }).filter((el, _, arr) => !arr.some(parent => parent !== el && parent.contains(el)));

    if (focusable.length === 0) return;

    e.preventDefault();
    const active = document.activeElement;
    const currentIndex = focusable.indexOf(active);
    let nextIndex;
    if (e.shiftKey) {
      nextIndex = (currentIndex <= 0) ? focusable.length - 1 : currentIndex - 1;
    } else {
      nextIndex = (currentIndex === -1 || currentIndex >= focusable.length - 1) ? 0 : currentIndex + 1;
    }
    focusable[nextIndex].focus();
  }
}
