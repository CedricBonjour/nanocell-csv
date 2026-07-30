import { dom } from './dom.js';
import { StateManager } from './StateManager.js';

const getDom = () => StateManager.getState('dom') || dom || (typeof document !== 'undefined' && document.getElementById('dialog') ? { dialog: document.getElementById('dialog') } : null);

class Msg extends HTMLElement {
  constructor(txt = "Empty message", opt = {}) {
    super();
    this.txt = txt;
    this.opt = typeof opt === 'number' ? { t: opt } : (opt || {});

    this.content = document.createElement("div");
    this.content.className = "ui-msg-text";
    this.content.innerHTML = txt;

    this.ok = document.createElement("button");
    this.ok.className = "ui-msg-btn ui-msg-ok";
    this.ok.innerHTML = this.opt.okText || "OK";

    this.cancel = document.createElement("button");
    this.cancel.className = "ui-msg-btn ui-msg-cancel";
    this.cancel.innerHTML = this.opt.cancelText || "Cancel";

    this.ok.onclick = () => {
      if (this.opt.cbt) this.opt.cbt();
      this.dismiss();
    };

    this.cancel.onclick = () => {
      if (this.opt.cbf) this.opt.cbf();
      this.dismiss();
    };

    this.ok.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB" || k === "ARROWLEFT" || k === "ARROWRIGHT") {
        if (this.opt.id === 3 && this.cancel.parentNode) {
          e.preventDefault();
          this.cancel.focus();
        }
      } else if (k === "ESCAPE") {
        e.preventDefault();
        this.cancel.click();
      }
    });

    this.cancel.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === "TAB" || k === "ARROWLEFT" || k === "ARROWRIGHT") {
        if (this.ok.parentNode) {
          e.preventDefault();
          this.ok.focus();
        }
      } else if (k === "ESCAPE") {
        e.preventDefault();
        this.cancel.click();
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

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ui-toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`;
    closeBtn.onclick = () => {
      if (this.opt.cbf) this.opt.cbf();
      this.dismiss();
    };

    this.appendChild(bodyDiv);
    this.appendChild(closeBtn);

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

  getIconSvg(type) {
    switch (type) {
      case 'success':
        return `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`;
      case 'warning':
        return `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8.22 1.754a1 1 0 00-1.44 0L.43 10.89A1 1 0 001.15 12.5h13.7a1 1 0 00.72-1.61L8.22 1.754zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm0 6a1 1 0 100-2 1 1 0 000 2z"/></svg>`;
      case 'error':
        return `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>`;
      default: // info
        return `<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-2a1 1 0 112 0 1 1 0 01-2 0zM7 7.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5z"/></svg>`;
    }
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


