/**
 * @file app/js/Control.js
 * Centralized interactive form controls:
 * - <ui-bool> (BoolInput): Accessible switch toggle
 * - <ui-list> (ListInput): Option carousel stepper
 * - <ui-num>  (NumInput):  Numeric stepper (linear or pow2, supports size="sm")
 * - <ui-input> (BadgeInput): Text input with optional inline right-aligned status/count badge
 */

import { defineEl, getNextPow2, getPrevPow2, formatThousands, emitChange, clamp } from './utils.js';
import { Glyph } from './Glyph.js';

export class BoolInput extends HTMLElement {
  constructor(initialValue = false) {
    super();
    this._value = Boolean(initialValue);
    this.setAttribute('tabindex', '0');
    this.setAttribute('role', 'switch');
    this.innerHTML = '<div class="toggle-track"><div class="toggle-thumb"></div></div>';
    this.render();

    this.addEventListener('click', () => { this.focus(); this.setValueInternal(!this._value, true); });
    this.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === ' ' || k === 'ENTER' || k === 'ARROWLEFT' || k === 'ARROWRIGHT') {
        e.preventDefault();
        this.setValueInternal(!this._value, true);
      }
    });
  }

  render() {
    this.setAttribute('aria-checked', String(this._value));
    this.classList.toggle('checked', this._value);
  }

  get value() { return this._value; }
  set value(val) { this.setValueInternal(val, false); }

  setValueInternal(val, isUserAction = false) {
    this._value = Boolean(val);
    this.render();
    emitChange(this, isUserAction);
  }
}

class StepperInput extends HTMLElement {
  initStepper(leftIcon, leftLabel, rightIcon, rightLabel, size, onPrev, onNext) {
    if (size) this.setAttribute('size', size);
    this.setAttribute('tabindex', '0');
    this.leftBtn = new Glyph(leftIcon, { title: leftLabel, tabIndex: -1, size });
    this.centerEl = document.createElement('span');
    this.centerEl.className = 'truncate';
    this.rightBtn = new Glyph(rightIcon, { title: rightLabel, tabIndex: -1, size });
    this.append(this.leftBtn, this.centerEl, this.rightBtn);
    this.leftBtn.addEventListener('click', (e) => { e.stopPropagation(); this.focus(); onPrev(); });
    this.rightBtn.addEventListener('click', (e) => { e.stopPropagation(); this.focus(); onNext(); });
    this.addEventListener('keydown', (e) => {
      const k = e.key.toUpperCase();
      if (k === 'ARROWLEFT' || k === 'ARROWDOWN') { e.preventDefault(); onPrev(); }
      else if (k === 'ARROWRIGHT' || k === 'ARROWUP') { e.preventDefault(); onNext(); }
    });
  }
}

export class ListInput extends StepperInput {
  constructor(optionsList = [], size) {
    super();
    this.options = optionsList.map(String);
    this.selectedIndex = 0;
    this.setAttribute('role', 'listbox');
    this.initStepper(
      'arrow_left', 'Previous option', 'arrow_right', 'Next option', size,
      () => this.setSelectedIndex(this.selectedIndex - 1, true),
      () => this.setSelectedIndex(this.selectedIndex + 1, true)
    );
    this.setSelectedIndex(0, false);
  }

  get value() { return this.options[this.selectedIndex]; }
  set value(val) {
    const idx = this.options.indexOf(String(val));
    if (idx !== -1) this.setSelectedIndex(idx, false);
  }

  setSelectedIndex(index, isUserAction = false) {
    const length = this.options.length;
    if (length === 0) return;
    this.selectedIndex = ((index % length) + length) % length;
    if (this.centerEl) this.centerEl.textContent = this.options[this.selectedIndex] ?? '';
    emitChange(this, isUserAction);
  }
}

export class NumInput extends StepperInput {
  constructor(initialValue = 0, min = 0, max = 999, stepMode = 'linear', size) {
    super();
    this._value = Number(initialValue);
    this._min = Number(min);
    this._max = Number(max);
    this.stepMode = stepMode;
    this.initStepper('remove', 'Decrease', 'add', 'Increase', size, () => this.step(-1), () => this.step(1));
    if (this.centerEl) this.centerEl.textContent = formatThousands(this._value);
    this.updateButtonStates();
  }

  updateButtonStates() {
    if (this.leftBtn) this.leftBtn.disabled = this._value <= this.min;
    if (this.rightBtn) this.rightBtn.disabled = this._value >= this.max;
  }

  step(dir = 1) {
    const next = this.stepMode === 'pow2'
      ? (dir > 0 ? getNextPow2(this._value) : getPrevPow2(this._value))
      : this._value + dir;
    this.setValueInternal(next, true);
  }

  get min() { return this._min ?? 0; }
  set min(val) { this._min = Number(val); this.updateButtonStates(); }
  get max() { return this._max ?? 999; }
  set max(val) { this._max = Number(val); this.updateButtonStates(); }
  get value() { return this._value; }
  set value(val) { this.setValueInternal(val, false); }

  setValueInternal(val, isUserAction = false) {
    if (typeof val === 'string') val = val.replace(/\s+/g, '');
    this._value = clamp(Number(val), this.min, this.max);
    if (this.centerEl) this.centerEl.textContent = formatThousands(this._value);
    this.updateButtonStates();
    emitChange(this, isUserAction);
  }
}

class BadgeInput extends HTMLElement {
  constructor() {
    super();
    this.classList.add('ctrl-box');

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'ctrl-input';

    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'ctrl-badge';

    this.append(this.inputEl, this.badgeEl);
  }

  connectedCallback() {
    const placeholder = this.getAttribute('placeholder') ?? '';
    const label = this.getAttribute('label') ?? placeholder;
    const badgeAttr = this.getAttribute('badge');
    if (placeholder) this.inputEl.placeholder = placeholder;
    if (label) this.inputEl.setAttribute('aria-label', label);
    if (badgeAttr != null) this.badge = badgeAttr;
  }

  get value() { return this.inputEl.value; }
  set value(val) { this.inputEl.value = val ?? ''; }

  get badge() { return this.badgeEl.textContent; }
  set badge(text) {
    const str = String(text ?? '');
    this.badgeEl.textContent = str;
    this.inputEl.classList.toggle('has-badge', str.length > 0);
  }

  focus() { this.inputEl.focus(); }
  select() { this.inputEl.select(); }
}

export class TagInput extends HTMLElement {
  constructor(optionsList = [], initialValue = []) {
    super();
    this.options = optionsList.map(opt =>
      typeof opt === 'object' && opt !== null
        ? { value: String(opt.value ?? opt.id ?? ''), get label() { return String(opt.label ?? opt.value ?? ''); } }
        : { value: String(opt), label: String(opt) }
    );
    this._selected = new Set(Array.isArray(initialValue) ? initialValue.map(String) : []);
    this.activeIndex = 0;

    this.setAttribute('tabindex', '0');
    this.setAttribute('role', 'listbox');
    this.setAttribute('aria-multiselectable', 'true');

    this.tagEls = this.options.map((opt, idx) => {
      const tag = document.createElement('span');
      tag.className = 'ui-tag';
      tag.setAttribute('role', 'option');
      tag.dataset.idx = String(idx);
      tag.textContent = opt.label;
      this.appendChild(tag);
      return tag;
    });
    this.render();

    this.addEventListener('click', (e) => {
      const tag = e.target.closest('.ui-tag');
      if (!tag) return;
      e.stopPropagation();
      this.activeIndex = parseInt(tag.dataset.idx, 10);
      this.focus();
      this.toggleTag(this.options[this.activeIndex].value, true);
    });

    this.addEventListener('keydown', (e) => {
      const len = this.options.length;
      if (len === 0) return;
      const k = e.key.toUpperCase();
      if (k === 'ARROWRIGHT' || k === 'ARROWDOWN' || k === 'ARROWLEFT' || k === 'ARROWUP') {
        e.preventDefault();
        e.stopPropagation();
        const delta = (k === 'ARROWRIGHT' || k === 'ARROWDOWN') ? 1 : -1;
        this.activeIndex = ((this.activeIndex + delta) % len + len) % len;
        this.render();
        this.tagEls[this.activeIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else if (k === 'ENTER' || k === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const activeOpt = this.options[this.activeIndex];
        if (activeOpt) this.toggleTag(activeOpt.value, true);
      }
    });
  }

  toggleTag(val, isUserAction = false) {
    const key = String(val);
    if (this._selected.has(key)) this._selected.delete(key);
    else this._selected.add(key);
    this.render();
    emitChange(this, isUserAction);
  }

  render() {
    this.tagEls.forEach((tag, idx) => {
      const opt = this.options[idx];
      const isSelected = Boolean(opt && this._selected.has(opt.value));
      if (opt && tag.textContent !== opt.label) tag.textContent = opt.label;
      tag.classList.toggle('selected', isSelected);
      tag.classList.toggle('focused', idx === this.activeIndex);
      tag.setAttribute('aria-selected', String(isSelected));
    });
  }

  get value() {
    return this.options.filter(o => this._selected.has(o.value)).map(o => o.value);
  }

  set value(val) {
    this._selected = new Set(Array.isArray(val) ? val.map(String) : []);
    this.render();
  }
}

defineEl('ui-bool', BoolInput);
defineEl('ui-list', ListInput);
defineEl('ui-num', NumInput);
defineEl('ui-input', BadgeInput);
defineEl('ui-tags', TagInput);

