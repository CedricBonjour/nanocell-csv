import { defineEl, cycleFocus } from './utils.js';
import { Glyph } from './Glyph.js';
import { Popup } from './Popup.js';
import { env, pwa } from './state.js';

export class Notification extends Popup {
  constructor(message, options = {}) {
    super();
    this.message = message;
    this.options = options;
    this.hasButtons =
      options.mode === 'choice' ||
      (options.mode === 'confirm' && !options.duration) ||
      (!options.duration && Boolean(options.onConfirm || options.onCancel));

    if (typeof document === 'undefined') return;

    this.content = document.createElement('div');
    this.content.className = 'ui-msg-text';
    if (typeof HTMLElement !== 'undefined' && message instanceof HTMLElement) this.content.appendChild(message);
    else if (options.allowHtml && typeof message === 'string') this.content.innerHTML = message;
    else this.content.innerText = message ?? '';

    this.closeBtn = new Glyph('off', {
      variant: 'close',
      title: this.hasButtons ? (options.cancelText || 'Cancel') : 'Dismiss notification',
      onClick: () => (this.hasButtons ? this.resolve(false) : this.dismiss()),
    });
    if (this.hasButtons) {
      this.okBtn = new Glyph('on', {
        variant: 'accept',
        title: options.okText || 'Confirm',
        onClick: () => this.resolve(true),
      });
    }

    this.keyHandler = (e) => {
      if (!this.isConnected || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        this.close();
      } else if (e.key === 'Enter' && this.hasButtons && document.activeElement !== this.closeBtn) {
        e.preventDefault(); e.stopPropagation();
        this.resolve(true);
      } else if (e.key === 'Tab' && this.hasButtons) {
        cycleFocus(e, this.getFocusableElements(), this._lastFocused);
      }
    };
  }

  getFocusableElements() {
    return (this.hasButtons ? [this.closeBtn, this.okBtn] : [this.closeBtn]).filter(Boolean);
  }

  close() {
    return this.hasButtons ? this.resolve(false) : this.dismiss();
  }

  connectedCallback() {
    if (this._initialized || typeof document === 'undefined') return;
    this._initialized = true;
    const isChoice = this.options.mode === 'choice';
    this.setAttribute('role', isChoice ? 'alertdialog' : 'status');
    this.setAttribute('aria-live', 'polite');

    const type = this.options.type || (isChoice ? 'warning' : 'info');
    this.className = `ui-toast-card floating-panel ui-toast-${type}`;

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'ui-toast-body';
    if (this.options.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'ui-toast-title';
      titleEl.innerText = this.options.title;
      bodyDiv.appendChild(titleEl);
    }
    bodyDiv.appendChild(this.content);
    this.appendChild(bodyDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ui-toast-actions';
    actionsDiv.appendChild(this.closeBtn);
    if (this.hasButtons) {
      actionsDiv.appendChild(this.okBtn);
      setTimeout(() => (this.options.defaultFocus === 'cancel' ? this.closeBtn : this.okBtn).focus(), 10);
    }
    this.appendChild(actionsDiv);

    if (this.options.duration) {
      const duration = Number(this.options.duration) || 2000;
      const progress = document.createElement('div');
      progress.className = 'ui-toast-progress';
      progress.style.setProperty('--toast-duration', `${duration}ms`);
      this.appendChild(progress);
      this.timer = setTimeout(() => this.dismiss(), duration);
    }

    document.addEventListener('keydown', this.keyHandler);
  }

  disconnectedCallback() {
    if (typeof document !== 'undefined') document.removeEventListener('keydown', this.keyHandler);
    if (this.timer) clearTimeout(this.timer);
  }

  show() {
    this.mountToStack();
    if (!this._initialized) this.connectedCallback();
    return this;
  }

  dismiss() {
    if (this._closing) return;
    this._closing = true;
    this.remove?.();
  }

  resolve(confirmed) {
    if (this._resolved) return;
    this._resolved = true;
    if (confirmed) this.options.onConfirm?.();
    else this.options.onCancel?.();
    this.dismiss();
  }

  static quick(message, duration = 2000, type = 'info', title = '') {
    return new Notification(message, { mode: 'toast', duration, type, title }).show();
  }
  static info(message, title = 'Info', duration = 2500) { return Notification.quick(message, duration, 'info', title); }
  static success(message, title = 'Success', duration = 2500) { return Notification.quick(message, duration, 'success', title); }
  static warning(message, title = 'Warning', duration = 3500) { return Notification.quick(message, duration, 'warning', title); }
  static error(message, title = 'Error', duration = 4500) { return Notification.quick(message, duration, 'error', title); }
  static confirm(message, onConfirm) {
    return new Notification(message, { mode: 'confirm', duration: 3500, onConfirm, type: 'info' }).show();
  }
  static choice(message, onConfirm, onCancel) {
    return new Notification(message, { mode: 'choice', onConfirm, onCancel, type: 'warning', title: 'Confirm Action' }).show();
  }
}

defineEl('ui-msg', Notification);

export async function triggerAppInstall() {
  const state = pwa.getState();
  if (state.isStandalone || state.isInstalled) {
    return Notification.info('NanoCell is already installed as a desktop app.', 'App Installed', 3500);
  }
  if (!state.canInstall) {
    return Notification.warning('Desktop app installation requires a desktop Chromium browser (Chrome, Edge, or Brave).', 'Not Supported on This Browser', 5000);
  }
  const outcome = await pwa.promptInstall();
  if (outcome === 'accepted') return Notification.success('NanoCell Desktop App installed!', 'App Installed', 3500);
  if (outcome === 'manual') {
    return Notification.info('To install NanoCell: click the Install icon in your browser address bar (or Browser Menu -> Save and share -> Install page as app).', 'Install Desktop App', 6000);
  }
  return null;
}

let compatibilityNoticeShown = false;

export function showBrowserCompatibilityNotice() {
  if (compatibilityNoticeShown || env.supportsFileSystemAccess) return;
  compatibilityNoticeShown = true;
  const text = env.isMobile
    ? `Direct file saving and desktop app installation are not available on ${env.osLabel || 'mobile devices'}. You can still open, edit, and download CSV files normally.`
    : `Your browser (${env.browserName}) does not support direct in-place file saving or PWA installation. You can still open and download CSV files, or use Chrome, Edge, or Brave for full desktop integration.`;
  return Notification.info(text, 'Limited Browser Capabilities', 0);
}
