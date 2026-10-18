/**
 * @file app/js/Glyph.js
 * Centralized, self-styled SVG mask icon & icon-button component (<ui-glyph> / Glyph).
 */

import { BaseElement, defineEl } from './utils.js';

let iconModules = {};
try {
  iconModules = import.meta.glob('../icons/*.svg', { eager: true, import: 'default' });
} catch {}

export const glyphMap = new Map();
for (const [path, url] of Object.entries(iconModules)) {
  const filename = path.replace(/^\.\.\/icons\//, '');
  glyphMap.set(filename, url);
  glyphMap.set(filename.replace(/\.svg$/, ''), url);
}

export function getGlyphUrl(name) {
  if (!name) return '';
  return glyphMap.get(name) || glyphMap.get(name.replace(/\.svg$/, '')) || name;
}

export class Glyph extends BaseElement {
  static get observedAttributes() {
    return ['icon', 'variant', 'size', 'title', 'disabled', 'active', 'expanded'];
  }

  constructor(iconName = '', options = {}) {
    super();
    this._flashTimer = null;

    if (options.id) this.id = options.id;
    if (options.cls) {
      for (const c of String(options.cls).split(/\s+/)) {
        if (c) this.classList?.add(c);
      }
    }
    if (iconName) this.icon = iconName;
    if (options.variant) this.variant = options.variant;
    if (options.size) this.size = options.size;
    if (options.title || options.label) this.label = options.title || options.label;
    if (options.toggle) {
      this.setAttribute?.('toggle', '');
      this.active = Boolean(options.active);
    } else if (options.active != null) {
      this.active = Boolean(options.active);
    }
    if (options.expanded != null) this.expanded = Boolean(options.expanded);
    if (options.disabled != null) this.disabled = Boolean(options.disabled);
    if (options.tabIndex != null) {
      this._explicitTabIndex = String(options.tabIndex);
      this.setAttribute?.('tabindex', this._explicitTabIndex);
    }
    if (typeof options.onClick === 'function') this.onClick = options.onClick;
    if (typeof options.onToggle === 'function') this.onToggle = options.onToggle;
    this._syncAccessibilityRole();
    this._bindEvents();
  }

  connectedCallback() {
    const initialIcon = this.getAttribute?.('icon') || this._icon;
    if (initialIcon) this._applyIcon(initialIcon);

    const titleAttr = this.getAttribute?.('title');
    if (titleAttr && !this.getAttribute?.('aria-label')) {
      this.setAttribute?.('aria-label', titleAttr);
    }

    if (this.isToggle && !this.hasAttribute?.('aria-pressed')) {
      this.setAttribute?.('aria-pressed', String(this.active));
    }

    this._syncAccessibilityRole();
    this._bindEvents();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'icon' && newVal) {
      this._applyIcon(newVal);
    } else if (name === 'variant' || name === 'disabled') {
      this._syncAccessibilityRole();
    } else if (name === 'title' && newVal && this.getAttribute?.('aria-label') !== newVal) {
      this.setAttribute?.('aria-label', newVal);
    }
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    this.addEventListener?.('click', (e) => {
      if (this.disabled || this.variant === 'static') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.isToggle) {
        this.active = !this.active;
        this.onToggle?.(this.active, e);
      }
      this.onClick?.(e);
    });

    this.addEventListener?.('keydown', (e) => {
      if (this.disabled || this.variant === 'static' || this.variant === 'status') return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.click?.();
      }
    });
  }

  _syncAccessibilityRole() {
    const v = this.variant;
    if (v === 'static') {
      this.setAttribute?.('aria-hidden', 'true');
      this.removeAttribute?.('tabindex');
    } else if (v === 'status') {
      this.setAttribute?.('role', 'img');
      this.removeAttribute?.('tabindex');
    } else if (this.disabled) {
      if (!this.hasAttribute?.('role')) this.setAttribute?.('role', 'button');
      this.setAttribute?.('aria-disabled', 'true');
      if (this.getAttribute?.('tabindex') === '0') this.removeAttribute?.('tabindex');
    } else {
      this.removeAttribute?.('aria-disabled');
      if (!this.hasAttribute?.('role')) this.setAttribute?.('role', 'button');
      if (!this.hasAttribute?.('tabindex')) {
        this.setAttribute?.('tabindex', this._explicitTabIndex ?? '0');
      }
    }
  }

  _applyIcon(name) {
    this._icon = name;
    const url = getGlyphUrl(name);
    if (url && this.style?.setProperty) {
      this.style.setProperty('--glyph-url', `url("${url}")`);
    }
    if (this.getAttribute?.('icon') !== name) {
      this.setAttribute?.('icon', name);
    }
  }

  get icon() { return this._icon || this.getAttribute?.('icon') || ''; }
  set icon(name) { if (name) this._applyIcon(name); }

  get variant() { return this.getAttribute?.('variant') || 'default'; }
  set variant(v) {
    const val = v || 'default';
    if (val === 'default') this.removeAttribute?.('variant');
    else this.setAttribute?.('variant', val);
    this._syncAccessibilityRole();
  }

  get size() { return this.getAttribute?.('size') || 'md'; }
  set size(s) {
    const val = s || 'md';
    if (val === 'md') this.removeAttribute?.('size');
    else this.setAttribute?.('size', val);
  }

  get label() { return this.getAttribute?.('title') || this.getAttribute?.('aria-label') || ''; }
  set label(text) {
    const str = String(text ?? '');
    this.title = str;
    this.setAttribute?.('title', str);
    this.setAttribute?.('aria-label', str);
  }

  get isToggle() { return Boolean(this.hasAttribute?.('toggle')); }
  set isToggle(val) {
    if (val) this.setAttribute?.('toggle', '');
    else this.removeAttribute?.('toggle');
  }

  get active() {
    return Boolean(this.hasAttribute?.('active') || this.getAttribute?.('aria-pressed') === 'true');
  }
  set active(val) {
    const isActive = Boolean(val);
    if (isActive) this.setAttribute?.('active', '');
    else this.removeAttribute?.('active');
    if (this.isToggle || this.hasAttribute?.('aria-pressed')) {
      this.setAttribute?.('aria-pressed', String(isActive));
    }
  }

  get expanded() { return Boolean(this.hasAttribute?.('expanded')); }
  set expanded(val) {
    if (val) this.setAttribute?.('expanded', '');
    else this.removeAttribute?.('expanded');
  }

  get disabled() { return Boolean(this.hasAttribute?.('disabled')); }
  set disabled(val) {
    if (val) this.setAttribute?.('disabled', '');
    else this.removeAttribute?.('disabled');
    this._syncAccessibilityRole();
  }

  flash(tempIcon, durationMs = 1500) {
    if (this._flashTimer) clearTimeout(this._flashTimer);
    const restoreIcon = this._restoreIcon || this.icon;
    this._restoreIcon = restoreIcon;
    this.icon = tempIcon;
    this._flashTimer = setTimeout(() => {
      this.icon = restoreIcon;
      this._restoreIcon = null;
      this._flashTimer = null;
    }, durationMs);
  }
}

defineEl('ui-glyph', Glyph);
