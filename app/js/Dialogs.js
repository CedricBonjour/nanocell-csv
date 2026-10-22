/**
 * @file app/js/Dialogs.js
 * Modal dialog manager (#dialog), Settings dialog, and About dialog (<ui-about>).
 */

import { getSheet, getCsvHandle, Setting, settings, pwa, getNewIssueUrl } from './state.js';
import { BaseElement, defineEl, cycleFocus, copyToClipboard } from './utils.js';
import { Glyph } from './Glyph.js';
import { BoolInput, ListInput, NumInput, TagInput } from './Control.js';
import { Notification } from './Notification.js';

export class DialogManager {
  static container = null;
  static _lastFocused = null;

  static init(container) {
    this.container = container || globalThis.document?.getElementById?.('dialog') || null;
    if (!this.container || this.container._dialogManagerBound) return;
    this.container._dialogManagerBound = true;
    this.container.addEventListener('keydown', (event) => this.handleKeyDown(event));
    this.container.addEventListener('focusin', (event) => {
      if (event.target && this.container?.contains?.(event.target)) {
        this._lastFocused = event.target;
      }
    });
  }

  static open(element, { closeButton = true, autoFocus = true } = {}) {
    if (!this.container) this.init();
    if (!this.container) return;

    this.close();
    globalThis.document?.activeElement?.blur?.();
    getSheet()?.finder?.close?.();

    this.container.classList.add('dialog-large', 'scroll');
    this.container.appendChild(element);

    if (closeButton) {
      this.container.appendChild(new Glyph('off', {
        id: 'close-dialog',
        variant: 'close',
        title: 'Close (Esc)',
        onClick: () => this.close(),
      }));
    }

    const firstFocusable = autoFocus ? this.getFocusableElements()[0] : null;
    if (firstFocusable?.focus) {
      this._lastFocused = firstFocusable;
      setTimeout(() => { try { firstFocusable.focus(); } catch {} }, 0);
    }
  }

  static close() {
    if (!this.container) return;
    this._lastFocused = null;
    this.container.innerHTML = '';
    this.container.className = '';
    getSheet()?.refreshScrollbars?.();
  }

  static get isBusy() { return Boolean(this.container?.children.length > 0); }

  static getFocusableElements() {
    if (!this.container) return [];
    const selector = 'ui-list, ui-num, ui-bool, ui-tags, a[href]:not([tabindex="-1"]), button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), [tabindex="0"]';
    return Array.from(this.container.querySelectorAll(selector))
      .filter(el => !el.disabled && !el.hidden && !el.closest?.('.hidden'))
      .filter((el, _, arr) => !arr.some(p => p !== el && p.contains(el)));
  }

  static handleKeyDown(event) {
    if (event.defaultPrevented || event.key !== 'Tab' || !this.container) return;
    const focusables = this.getFocusableElements();
    cycleFocus(event, focusables, this._lastFocused);
    if (focusables.length > 0 && globalThis.document?.activeElement === focusables[0]) {
      this.container.scrollTop = 0;
    }
  }
}

export class SettingDialog {
  static buildRow(setting) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('span');
    label.className = 'setting-label';
    label.textContent = setting.name;
    row.appendChild(label);

    let input;
    if (setting.tags) input = new TagInput(setting.tags, settings[setting.key]);
    else if (setting.list) input = new ListInput(setting.list);
    else if (typeof setting.defaultValue === 'number') input = new NumInput(settings[setting.key] ?? setting.defaultValue, setting.min ?? 0, setting.max ?? Infinity, setting.stepMode);
    else if (typeof setting.defaultValue === 'boolean') input = new BoolInput(settings[setting.key]);

    const isInteractive = Boolean(input);
    if (isInteractive) {
      input.value = settings[setting.key];
      input.onchange = (e) => { settings[setting.key] = e.target.value; };
      row.addEventListener('focusin', () => row.classList.add('active'));
      row.addEventListener('focusout', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('active'); });
      row.addEventListener('click', (e) => { if (input.focus && !input.contains(e.target)) input.focus(); });
    } else {
      input = document.createElement('span');
      input.textContent = settings[setting.key];
    }

    row.appendChild(input);
    return row;
  }

  static show() {
    const content = document.createElement('div');
    content.className = 'stg-container';
    content.innerHTML = `
      <div class="stg-header"><h1>Settings</h1></div>
      <div class="stg-body"></div>
      <div class="stg-footer">
        <ui-glyph icon="reset_settings" class="btn-reset-settings" title="Reset to default settings"></ui-glyph>
      </div>
    `;

    const body = content.querySelector('.stg-body');
    content.querySelector('.btn-reset-settings').onclick = () => {
      Setting.resetDefault();
      SettingDialog.show();
    };

    let currentSection = null;
    for (const def of Setting.list) {
      if (def.hidden) continue;
      if (def.title) {
        currentSection = document.createElement('div');
        currentSection.className = 'settings-section';
        currentSection.innerHTML = `<h3 class="settings-section-header">${def.title}</h3>`;
        body.appendChild(currentSection);
      } else if (currentSection) {
        currentSection.appendChild(SettingDialog.buildRow(def));
      }
    }

    DialogManager.open(content);
  }
}

// --- About Dialog (<ui-about>) ---

const RESET_WARNINGS = [
  'Reset all settings to defaults',
  'Delete all custom macros',
  'Clear cached files and offline data',
];

export class AboutDialog extends BaseElement {
  constructor() {
    super();
    this.version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.1-dev';
    this.isStandalone = pwa.getState().isStandalone;
    this.renderMain();
  }

  renderMain() {
    this.innerHTML = `
      <img src="/logo.svg" class="about-logo" alt="Logo" />
      <h1>Nanocell CSV Editor</h1>
      <div class="about-version-container">
        <h3>${this.version}</h3>
        ${this.isStandalone ? '<span class="about-mode-badge">(Desktop App)</span>' : ''}
      </div>
      <div class="about-footer">
        <div class="about-footer-glyphs">
          <ui-glyph icon="copy" class="about-copy-btn" title="Copy version"></ui-glyph>
          <a href="${getNewIssueUrl(this.version)}" target="_blank" title="Bug Report">
            <ui-glyph icon="bug" title="Bug Report" tabindex="-1"></ui-glyph>
          </a>
          <ui-glyph icon="reload_file" class="about-reset-btn" title="Clear cache & reload latest version"></ui-glyph>
        </div>
        <a href="https://nanocell-csv.com/" target="_blank">https://nanocell-csv.com/</a>
      </div>
    `;

    const copyBtn = this.querySelector('.about-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const textToCopy = `Nanocell CSV Editor-${this.version}`;
        await copyToClipboard(textToCopy);
        copyBtn.flash('on', 1500);
        Notification.quick(`Copied: ${textToCopy}`);
      };
    }

    const resetBtn = this.querySelector('.about-reset-btn');
    if (resetBtn) {
      resetBtn.onclick = () => this.handleResetRequest(resetBtn);
    }
  }

  async checkResetPreconditions() {
    const sheet = getSheet();
    const csvHandle = getCsvHandle();
    const isEditingDoc = Boolean(
      sheet?.isEditing ||
      (sheet?.df && !sheet.df.isSaved) ||
      (csvHandle && csvHandle.readId > 0 && !csvHandle.isReadComplete)
    );
    if (isEditingDoc) {
      return {
        ok: false,
        title: 'Document Being Edited',
        message: 'A document is currently being edited with unsaved changes. Please save your work before resetting and reloading the application.',
      };
    }

    const nav = globalThis.navigator;
    if (nav && nav.onLine === false) {
      return {
        ok: false,
        title: 'No Internet Connection',
        message: 'You are currently offline. Please connect to the internet before clearing cached files and reloading the application.',
      };
    }

    if (typeof globalThis.fetch === 'function') {
      const origin = globalThis.location?.origin && globalThis.location.origin !== 'null'
        ? globalThis.location.origin
        : 'https://nanocell-csv.com';
      const pingUrl = `${origin}/?_ping=${Date.now()}`;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
      try {
        let res = await globalThis.fetch(pingUrl, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller?.signal,
        });
        if (res.status === 405) {
          res = await globalThis.fetch(pingUrl, {
            method: 'GET',
            cache: 'no-store',
            signal: controller?.signal,
          });
        }
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) {
          return {
            ok: false,
            title: 'Site Unreachable',
            message: `The server responded with status ${res.status}. Cannot clear cached files while the site is unavailable.`,
          };
        }
      } catch {
        if (timeoutId) clearTimeout(timeoutId);
        return {
          ok: false,
          title: 'Site Unreachable',
          message: 'Unable to reach the server. Please verify your internet connection and ensure the site is online before resetting.',
        };
      }
    }

    return { ok: true };
  }

  async handleResetRequest(btnEl) {
    if (btnEl) btnEl.disabled = true;
    const check = await this.checkResetPreconditions();
    if (btnEl) btnEl.disabled = false;

    if (!check.ok) {
      Notification.warning(check.message, check.title);
      this.renderError(check.title, check.message);
      return;
    }

    this.renderConfirm();
  }

  renderError(title, message) {
    this.innerHTML = `
      <div class="about-reset-panel">
        <h2 class="about-reset-title">${title}</h2>
        <p class="about-reset-warning">${message}</p>
        <div class="about-reset-actions">
          <ui-glyph icon="off" variant="reject" class="about-reset-cancel" title="Back"></ui-glyph>
        </div>
      </div>
    `;
    const cancelBtn = this.querySelector('.about-reset-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = () => this.renderMain();
      setTimeout(() => { try { cancelBtn.focus(); } catch {} }, 0);
    }
  }

  renderConfirm() {
    const checked = new Array(RESET_WARNINGS.length).fill(false);

    this.innerHTML = `
      <div class="about-reset-panel">
        <h2 class="about-reset-title">Reset & Reload App</h2>
        <p class="about-reset-warning">
          Clear all local data and caches to reload the latest version. Please confirm:
        </p>
        <div class="about-reset-checklist">
          ${RESET_WARNINGS.map((text, idx) => `
            <div class="about-check-row" data-check-idx="${idx}">
              <ui-glyph icon="checkbox_off" class="about-check-glyph" title="Acknowledge"></ui-glyph>
              <span class="about-check-label">${text}</span>
            </div>
          `).join('')}
        </div>
        <div class="about-reset-actions">
          <ui-glyph icon="off" variant="reject" class="about-reset-cancel" title="Cancel"></ui-glyph>
          <ui-glyph icon="on" variant="accept" class="about-reset-confirm" title="Confirm reset & reload" disabled></ui-glyph>
        </div>
      </div>
    `;

    const checklistEl = this.querySelector('.about-reset-checklist');
    const cancelBtn = this.querySelector('.about-reset-cancel');
    const confirmBtn = this.querySelector('.about-reset-confirm');

    checklistEl?.addEventListener('click', (e) => {
      const row = e.target.closest('.about-check-row');
      if (!row) return;
      const idx = parseInt(row.dataset.checkIdx, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= checked.length) return;
      checked[idx] = !checked[idx];
      row.classList.toggle('checked', checked[idx]);
      const glyph = row.querySelector('.about-check-glyph');
      if (glyph) glyph.icon = checked[idx] ? 'checkbox_on' : 'checkbox_off';
      if (confirmBtn) confirmBtn.disabled = !checked.every(Boolean);
    });

    if (cancelBtn) {
      cancelBtn.onclick = () => this.renderMain();
    }

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (!checked.every(Boolean)) return;
        this.executeHardReset(confirmBtn, cancelBtn);
      };
    }

    const firstGlyph = checklistEl?.querySelector('.about-check-glyph');
    if (firstGlyph) {
      setTimeout(() => { try { firstGlyph.focus(); } catch {} }, 0);
    }
  }

  async executeHardReset(confirmBtn, cancelBtn) {
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const check = await this.checkResetPreconditions();
    if (!check.ok) {
      Notification.warning(check.message, check.title);
      this.renderError(check.title, check.message);
      return;
    }

    try { globalThis.localStorage?.clear?.(); } catch {}
    try { globalThis.sessionStorage?.clear?.(); } catch {}

    if (typeof globalThis.navigator?.serviceWorker?.getRegistrations === 'function') {
      try {
        const registrations = await globalThis.navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map(reg => reg.unregister()));
      } catch {}
    }

    if (typeof globalThis.caches?.keys === 'function') {
      try {
        const keys = await globalThis.caches.keys();
        await Promise.allSettled(keys.map(key => globalThis.caches.delete(key)));
      } catch {}
    }

    if (typeof globalThis.indexedDB?.databases === 'function') {
      try {
        const dbs = await globalThis.indexedDB.databases();
        await Promise.allSettled(
          (dbs || []).map(db => db?.name ? new Promise(resolve => {
            const req = globalThis.indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }) : Promise.resolve())
        );
      } catch {}
    }

    const sheet = getSheet();
    if (sheet?.df) sheet.df.isSaved = true;

    try {
      await globalThis.fetch?.(globalThis.location?.href || '/', { cache: 'reload' });
    } catch {}

    globalThis.location?.reload?.();
  }

  static show() {
    const element = new AboutDialog();
    DialogManager.open(element, { autoFocus: false });
    return element;
  }
}

defineEl('ui-about', AboutDialog);
