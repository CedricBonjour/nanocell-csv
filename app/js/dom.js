import { StateManager } from './StateManager.js';
import { Scroller } from './ui/input/Scroller.js';
import { setIcon } from './icons.js';

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

  dom.dialog.clear = function (e) {
    while (this.children.length > 0) this.children[0].remove();
    dom.dialog.className = '';
    const s = StateManager.getState('sheet');
    if (s) s.scrollbarRefresh();
  };

  dom.dialog.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.key !== 'Tab') return;
    const selector = '.ui-list, .ui-num, .ui-bool-toggle, ui-bool, button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), #closeDialog, [tabindex="0"]';
    const all = Array.from(dom.dialog.querySelectorAll(selector));
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
  });

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
      setIcon(btn, 'off');
      btn.setAttribute("title", "Close (Esc)");
      btn.setAttribute("aria-label", "Close");
      btn.setAttribute("id", "closeDialog");
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.addEventListener("click", function () { dom.dialog.clear() });
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dom.dialog.clear();
        }
      });
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
