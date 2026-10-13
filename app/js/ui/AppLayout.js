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
      palette: typeof document !== 'undefined' ? (document.getElementById("palette") || document.querySelector('ui-command-palette')) : null,
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

    if (dom.footerDiv.lock) {
      setIcon(dom.footerDiv.lock, "edit_square");
    }

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


export { dom };
