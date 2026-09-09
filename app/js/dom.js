import { StateManager } from './StateManager.js';
import { Scroller } from './ui/input/Scroller.js';
import { resolveIconUrl } from './utils/misc.js';

let dom = undefined;

let build_dom = function () {
  dom = {
    palette: document.getElementById("palette"),
    theme: document.getElementById("theme"),
    header: document.getElementById("header"),
    body: document.getElementById("body") || document.body,
    content: document.getElementById("content"),
    mainContainer: document.getElementById("main-container"),
    validationPane: document.getElementById("validation-pane"),
    dialog: document.getElementById("dialog"),
    footer: document.getElementById("footer"),
    cmenu: document.createElement("ui-cmenu"),
    footerDiv: {
      left: document.getElementById("footerLeft"),
      center: document.getElementById("footerCenter"),
      right: document.getElementById("footerRight"),
      lock: document.getElementById("lock"),
    },
  };
  const lockEl = dom.footerDiv.lock;
  if (lockEl) {
    let currentSrc = lockEl.getAttribute("src") || lockEl.getAttribute("data-src") || "icn/edit.svg";
    Object.defineProperty(lockEl, 'src', {
      get() { return currentSrc; },
      set(v) {
        currentSrc = v;
        lockEl.style.setProperty("--icon-url", `url("${resolveIconUrl(v)}")`);
        if (lockEl.tagName === "IMG") lockEl.setAttribute("src", v);
      },
      configurable: true
    });
    lockEl.style.setProperty("--icon-url", `url("${resolveIconUrl(currentSrc)}")`);
  }
  StateManager.setState('dom', dom);

  dom.dialog.clear = function (e) {
    while (this.children.length > 0) this.children[0].remove();
    dom.dialog.className = '';
    const s = StateManager.getState('sheet');
    if (s) s.scrollbarRefresh();
  };

  dom.dialog.push = function (e, fullscreen = false, closeButton = true) {
    this.clear();
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
    if (fullscreen) dom.dialog.classList.add("dialog_large");
    else dom.dialog.classList.add("dialog_small");
    dom.dialog.classList.add("scroll");
    dom.dialog.appendChild(e);

    if (closeButton) {
      const btn = document.createElement("span");
      btn.className = "icon";
      btn.style.setProperty("--icon-url", `url("${resolveIconUrl('icn/off.svg')}")`);
      btn.style.position = (fullscreen) ? "fixed" : "absolute";
      btn.setAttribute("title", "Close (Esc)");
      btn.setAttribute("aria-label", "Close");
      btn.setAttribute("id", "closeDialog");
      btn.setAttribute("role", "button");
      btn.addEventListener("click", function () { dom.dialog.clear() });
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "auto";
      if (!fullscreen) {
        btn.style.marginTop = ".5em";
      }
      dom.dialog.appendChild(btn);
    }
  };
  Object.defineProperty(dom.dialog, 'isBusy', { get: function () { return dom.dialog.children.length > 0 }, configurable: true });
  Object.defineProperty(dom.dialog, 'isLarge', { get: function () { return dom.dialog.classList.contains("dialog_large") }, configurable: true });

  dom.content.scrollerY = new Scroller();
  dom.content.scrollerX = new Scroller(false);
  dom.body.appendChild(dom.cmenu);
  return dom;
};

export { dom, build_dom };
