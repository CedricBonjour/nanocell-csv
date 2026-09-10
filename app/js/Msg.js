import { setIcon } from './icons.js';

class Msg extends HTMLElement {
  constructor(txt = "Empty message", opt = {}) {
    super();
    this.txt = txt;
    this.opt = typeof opt === 'number' ? { t: opt } : (opt || {});

    this.content = document.createElement("div");
    this.content.className = "ui-msg-text";
    this.content.innerHTML = txt;

    this.ok = document.createElement("button");
    this.ok.className = "icon ui-msg-btn ui-msg-ok";
    this.ok.type = "button";
    this.ok.setAttribute("title", this.opt.okText || "OK");
    this.ok.setAttribute("aria-label", this.opt.okText || "OK");
    setIcon(this.ok, 'on');

    this.cancel = document.createElement("button");
    this.cancel.className = "icon ui-msg-btn ui-msg-cancel";
    this.cancel.type = "button";
    this.cancel.setAttribute("title", this.opt.cancelText || "Cancel");
    this.cancel.setAttribute("aria-label", this.opt.cancelText || "Cancel");
    setIcon(this.cancel, 'off');

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'icon ui-toast-close-btn';
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('title', 'Close notification');
    this.closeBtn.setAttribute('aria-label', 'Close notification');
    setIcon(this.closeBtn, 'off');

    this.ok.onclick = () => {
      if (this.opt.cbt) this.opt.cbt();
      this.dismiss();
    };

    this.cancel.onclick = () => {
      if (this.opt.cbf) this.opt.cbf();
      this.dismiss();
    };

    this.closeBtn.onclick = () => {
      if (this.opt.cbf) this.opt.cbf();
      this.dismiss();
    };

    const getFocusableButtons = () => {
      const btns = [];
      if (this.cancel && this.cancel.parentNode) btns.push(this.cancel);
      if (this.ok && this.ok.parentNode) btns.push(this.ok);
      if (this.closeBtn && this.closeBtn.parentNode) btns.push(this.closeBtn);
      return btns;
    };

    const cycleFocus = (e, currentBtn) => {
      const focusable = getFocusableButtons();
      if (focusable.length <= 1) return;
      e.preventDefault();
      const idx = focusable.indexOf(currentBtn);
      let nextIdx;
      if (e.shiftKey) {
        nextIdx = (idx <= 0) ? focusable.length - 1 : idx - 1;
      } else {
        nextIdx = (idx === -1 || idx >= focusable.length - 1) ? 0 : idx + 1;
      }
      focusable[nextIdx].focus();
    };

    this.ok.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB") {
        cycleFocus(e, this.ok);
      } else if (k === "ARROWLEFT" || k === "ARROWRIGHT") {
        if (this.opt.id === 3 && this.cancel.parentNode) {
          e.preventDefault();
          this.cancel.focus();
        }
      } else if (k === "ESCAPE") {
        e.preventDefault();
        if (this.cancel.parentNode) {
          this.cancel.click();
        } else {
          this.dismiss();
        }
      }
    });

    this.cancel.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB") {
        cycleFocus(e, this.cancel);
      } else if (k === "ARROWLEFT" || k === "ARROWRIGHT") {
        if (this.ok.parentNode) {
          e.preventDefault();
          this.ok.focus();
        }
      } else if (k === "ESCAPE") {
        e.preventDefault();
        this.cancel.click();
      }
    });

    this.closeBtn.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB") {
        cycleFocus(e, this.closeBtn);
      } else if (k === "ESCAPE") {
        e.preventDefault();
        this.closeBtn.click();
      }
    });
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.renderToast();
  }

  show() {
    let container = document.getElementById('ui-toast-container');
    if (!container && typeof document !== 'undefined') {
      container = document.createElement('div');
      container.id = 'ui-toast-container';
      container.className = 'ui-toast-container';
      document.body.appendChild(container);
    }
    if (container && !container.contains(this)) {
      container.appendChild(this);
    }

    if (!this._initialized) {
      this.connectedCallback();
    }
    return this;
  }

  renderToast() {
    this.className = "ui-toast-card";
    const type = this.opt.type || (this.opt.id === 3 ? 'warning' : (this.opt.id === 2 ? 'info' : 'info'));
    this.classList.add(`ui-toast-${type}`);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'ui-toast-body';
    if (this.opt.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'ui-toast-title';
      titleEl.innerText = this.opt.title;
      bodyDiv.appendChild(titleEl);
    }
    bodyDiv.appendChild(this.content);

    const hasButtons = this.opt.id === 3 || (this.opt.id === 2 && !this.opt.t) || (!this.opt.t && (this.opt.cbt || this.opt.cbf));
    if (hasButtons) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'ui-toast-actions';
      if (this.opt.id === 3) {
        actionsDiv.appendChild(this.cancel);
      }
      actionsDiv.appendChild(this.ok);
      bodyDiv.appendChild(actionsDiv);
    }

    this.appendChild(bodyDiv);
    this.appendChild(this.closeBtn);

    if (this.opt.t) {
      const timeout = Number(this.opt.t) || 2000;
      const progress = document.createElement('div');
      progress.className = 'ui-toast-progress';
      progress.style.animationDuration = `${timeout}ms`;
      this.appendChild(progress);

      this.timer = setTimeout(() => {
        this.dismiss();
      }, timeout);
    }

    if (hasButtons) {
      setTimeout(() => {
        if (this.opt.id === 3 && this.opt.defaultFocus === 'cancel') {
          this.cancel.focus();
        } else {
          this.ok.focus();
        }
      }, 10);
    }
  }

  dismiss() {
    if (this.timer) clearTimeout(this.timer);
    this.classList.add('ui-msg-closing');
    setTimeout(() => {
      if (this.parentNode) {
        this.remove();
      }
    }, 150);
  }

  static quick(txt) { const m = new Msg(txt, { id: 0, t: 1500, type: 'info' }); return m.show(); }
  static long(txt) { const m = new Msg(txt, { id: 1, t: 3500, type: 'info' }); return m.show(); }
  static confirm(txt, cb) { const m = new Msg(txt, { id: 2, cbt: cb, type: 'info' }); return m.show(); }
  static choice(txt, cbTrue, cbFalse) { const m = new Msg(txt, { id: 3, cbt: cbTrue, cbf: cbFalse, type: 'warning' }); return m.show(); }

  static info(txt, title = 'Information') { const m = new Msg(txt, { t: 3000, type: 'info', title }); return m.show(); }
  static success(txt, title = 'Success') { const m = new Msg(txt, { t: 3000, type: 'success', title }); return m.show(); }
  static warning(txt, title = 'Warning') { const m = new Msg(txt, { t: 4000, type: 'warning', title }); return m.show(); }
  static error(txt, title = 'Error') { const m = new Msg(txt, { id: 2, type: 'error', title }); return m.show(); }
}

if (!customElements.get('ui-msg')) {
  customElements.define('ui-msg', Msg);
}

export { Msg };
