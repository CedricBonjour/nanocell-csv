import { StateManager } from '../StateManager.js';
import { Scroller } from './controls/Scroller.js';
import { setIcon } from '../utils/icons.js';
import { DialogManager } from './DialogManager.js';

let dom = undefined;

/**
 * Manages the application shell layout, top-level DOM element references,
 * sub-component mounting, and dialog host registration.
 */
export class AppLayout {
  /**
   * Initializes the application layout, resolves shell elements, and mounts scrollers.
   * @returns {Object} Cached layout DOM elements map.
   */
  static init() {
    const dialogEl = typeof document !== 'undefined' ? document.getElementById("dialog") : null;
    DialogManager.init(dialogEl);

    dom = {
      palette: typeof document !== 'undefined' ? document.getElementById("palette") : null,
      theme: typeof document !== 'undefined' ? document.getElementById("theme") : null,
      header: typeof document !== 'undefined' ? document.getElementById("header") : null,
      body: typeof document !== 'undefined' ? (document.getElementById("body") || document.body) : null,
      content: typeof document !== 'undefined' ? document.getElementById("content") : null,
      mainContainer: typeof document !== 'undefined' ? document.getElementById("main-container") : null,
      validationPane: typeof document !== 'undefined' ? document.getElementById("validation-pane") : null,
      dialog: dialogEl,
      footer: typeof document !== 'undefined' ? document.getElementById("footer") : null,
      cmenu: typeof document !== 'undefined' ? document.createElement("ui-cmenu") : null,
      footerDiv: {
        left: typeof document !== 'undefined' ? document.getElementById("footerLeft") : null,
        center: typeof document !== 'undefined' ? document.getElementById("footerCenter") : null,
        right: typeof document !== 'undefined' ? document.getElementById("footerRight") : null,
        lock: typeof document !== 'undefined' ? document.getElementById("lock") : null,
      },
    };

    if (dom.dialog) {
      dom.dialog.push = (e, fullscreen = false, closeButton = true) => DialogManager.push(e, fullscreen, closeButton);
      dom.dialog.clear = () => DialogManager.clear();
      Object.defineProperty(dom.dialog, 'isBusy', {
        get: () => DialogManager.isBusy,
        configurable: true
      });
      Object.defineProperty(dom.dialog, 'isLarge', {
        get: () => DialogManager.isLarge,
        configurable: true
      });
    }

    const lockEl = dom.footerDiv.lock;
    if (lockEl) {
      let currentSrc = lockEl.getAttribute("src") || lockEl.getAttribute("data-src") || "edit";
      Object.defineProperty(lockEl, 'src', {
        get() { return currentSrc; },
        set(v) {
          currentSrc = v;
          setIcon(lockEl, v);
          if (lockEl.tagName === "IMG") lockEl.setAttribute("src", v);
        },
        configurable: true
      });
      setIcon(lockEl, currentSrc);
    }

    StateManager.setState('dom', dom);

    if (dom.content) {
      dom.content.scrollerY = new Scroller();
      dom.content.scrollerX = new Scroller(false);
    }
    if (dom.body && dom.cmenu) {
      dom.body.appendChild(dom.cmenu);
    }

    return dom;
  }

  /**
   * Retrieves the current layout DOM references.
   * @returns {Object|undefined}
   */
  static get elements() {
    return dom;
  }
}

/** Backwards-compatible alias for AppLayout.init() */
export const build_dom = () => AppLayout.init();

export { dom, DialogManager };
