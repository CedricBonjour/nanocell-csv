/**
 * @file app/js/SheetOverlays.js
 * Floating top-right sheet toolbars: Find & Replace (<ui-finder>) and Column Filter (<ui-filter>).
 */

import { getSheet, getCsvHandle } from './state.js';
import { defineEl, clamp } from './utils.js';
import './Glyph.js';
import { NumInput } from './Control.js';
import { Popup } from './Popup.js';
import { Notification } from './Notification.js';

class FloatingToolbar extends Popup {
  constructor(sheet) {
    super();
    this.sheet = sheet;
  }

  get activeSheet() { return this.sheet || getSheet(); }
  get matchCase() { return Boolean(this.caseBtn?.active); }

  getColIndex() {
    const df = this.activeSheet?.df;
    const colVal = Number(this.colInput?.value);
    return clamp((isNaN(colVal) ? 1 : colVal) - 1, 0, (df?.width || 1) - 1);
  }

  updateColTitle() {
    const df = this.activeSheet?.df;
    if (!this.colTitle) return;
    if (!df) { this.colTitle.textContent = ''; return; }
    const colIndex = this.getColIndex();
    const title = df.get(colIndex, 0)?.trim() || `Column ${colIndex + 1}`;
    this.colTitle.textContent = title;
    this.colTitle.setAttribute('title', `Column ${colIndex + 1}: ${title}`);
  }

  syncColBounds(resetToActiveCol = false) {
    if (!this.colInput) return false;
    const activeSheet = this.activeSheet;
    const maxCols = Math.max(1, activeSheet?.df?.width || 1);
    const prevVal = Number(this.colInput.value) || 1;
    this.colInput.min = 1;
    this.colInput.max = maxCols;
    const targetCol = resetToActiveCol ? (activeSheet?.x ?? 0) + 1 : prevVal;
    const nextVal = clamp(targetCol, 1, maxCols);
    this.colInput.value = nextVal;
    this.updateColTitle();
    return nextVal !== prevVal;
  }

  bindColInputSync(onClampedChange) {
    if (!this.colInput) return;
    const syncNow = (commitEdit = false) => {
      if (commitEdit && this.activeSheet?.isEditing) this.activeSheet.commitEdit?.();
      const clamped = this.syncColBounds(false);
      if (clamped) onClampedChange?.();
    };
    this.addEventListener?.('mouseenter', () => syncNow(false));
    this.colInput.addEventListener?.('mouseenter', () => syncNow(false));
    this.colInput.addEventListener?.('focusin', () => syncNow(true));
    this.colInput.addEventListener?.('pointerdown', () => syncNow(true), true);
    this.colInput.addEventListener?.('mousedown', () => syncNow(true), true);
    this.colInput.addEventListener?.('keydown', () => syncNow(true), true);
  }
}

export class FinderDialog extends FloatingToolbar {
  constructor(sheet) {
    super(sheet);
    this.matches = [];
    this.query = '';
    this.lastQuery = '';
    this.currentIndex = 0;
    this.isAdvanced = false;
    this.colEnabled = false;

    this.innerHTML = `
      <div class="finder-row">
        <ui-glyph icon="arrow_right" class="finder-toggle-btn" title="Toggle Replace (Ctrl+Shift+F)"></ui-glyph>
        <ui-input class="find-box" placeholder="Find" label="Find term" badge="No match"></ui-input>
        <div class="btn-group">
          <ui-glyph icon="match_case" class="case-btn" title="Match Case (Alt+C)" toggle></ui-glyph>
          <ui-glyph icon="arrow_up" class="prev-btn" title="Previous Match (Shift+Enter)"></ui-glyph>
          <ui-glyph icon="arrow_down" class="next-btn" title="Next Match (Enter)"></ui-glyph>
          <ui-glyph icon="off" class="close-btn" variant="close" title="Close (Escape)"></ui-glyph>
        </div>
      </div>
      <div class="finder-row replace-row hidden">
        <div class="glyph-spacer"></div>
        <ui-input class="replace-box" placeholder="Replace" label="Replace term"></ui-input>
        <div class="btn-group">
          <ui-glyph icon="find_replace" class="replace-all-btn" variant="accept" title="Replace All (Alt+A)"></ui-glyph>
        </div>
      </div>
      <div class="finder-row col-row col-disabled hidden">
        <div class="glyph-spacer"></div>
        <ui-glyph icon="checkbox_off" class="col-toggle-btn" title="Search in column only"></ui-glyph>
        <span class="filter-col-title truncate" title="Selected column header"></span>
      </div>
    `;

    this.findBox = this.querySelector('.find-box');
    this.replaceBox = this.querySelector('.replace-box');
    this.findInput = this.findBox.inputEl;
    this.replaceInput = this.replaceBox.inputEl;
    this.matchBadge = this.findBox.badgeEl;
    this.caseBtn = this.querySelector('.case-btn');
    this.toggleBtn = this.querySelector('.finder-toggle-btn');
    this.prevBtn = this.querySelector('.prev-btn');
    this.nextBtn = this.querySelector('.next-btn');
    this.closeBtn = this.querySelector('.close-btn');
    this.replaceRow = this.querySelector('.replace-row');
    this.replaceBtn = this.querySelector('.replace-all-btn');
    this.colRow = this.querySelector('.col-row');
    this.colToggleBtn = this.querySelector('.col-toggle-btn');
    this.colTitle = this.querySelector('.filter-col-title');

    this.colInput = new NumInput(1, 1, 999, 'linear', 'sm');
    this.colInput.setAttribute('aria-label', 'Column number');
    this.colInput.setAttribute('title', 'Column number');
    this.colRow.insertBefore(this.colInput, this.colToggleBtn);

    this.caseBtn.onToggle = () => this.find(true);
    this.findInput.addEventListener('input', () => this.find());
    this.matchBadge.addEventListener('click', () => this.findNext());
    this.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? this.findPrev() : this.findNext(); }
    });
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.replaceAll(); }
    });
    const toggleCol = () => {
      if (this.activeSheet?.isEditing) this.activeSheet.commitEdit?.();
      this.syncColBounds(false);
      this.setColEnabled(!this.colEnabled, true);
    };
    this.colToggleBtn.onClick = toggleCol;
    this.colTitle.addEventListener('click', toggleCol);
    this.bindColInputSync(() => {
      if (this.isAdvanced && this.colEnabled && this.query) this.find(true);
    });
    this.colInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? this.findPrev() : this.findNext(); }
    });
    this.colInput.addEventListener('change', () => {
      this.syncColBounds(false);
      if (!this.colEnabled) this.setColEnabled(true, false);
      this.find(true);
    });
    this.toggleBtn.onClick = () => this.toggleReplaceRow();
    this.prevBtn.onClick = () => this.findPrev();
    this.nextBtn.onClick = () => this.findNext();
    this.closeBtn.onClick = () => this.close();
    this.replaceBtn.onClick = () => this.replaceAll();
  }

  getFocusableElements() {
    const list = [this.toggleBtn, this.findInput, this.caseBtn, this.prevBtn, this.nextBtn, this.closeBtn];
    if (this.replaceRow && !this.replaceRow.classList.contains('hidden')) list.push(this.replaceInput, this.replaceBtn);
    if (this.colRow && !this.colRow.classList.contains('hidden')) list.push(this.colInput, this.colToggleBtn);
    return list.filter(el => el && !el.disabled && !el.hidden && !el.classList.contains('hidden'));
  }

  setColEnabled(enabled, recompute = true) {
    this.colEnabled = Boolean(enabled);
    if (this.colToggleBtn) {
      this.colToggleBtn.icon = this.colEnabled ? 'checkbox_on' : 'checkbox_off';
      this.colToggleBtn.classList.toggle('checked', this.colEnabled);
      this.colToggleBtn.setAttribute('aria-checked', String(this.colEnabled));
    }
    this.colRow?.classList.toggle('col-disabled', !this.colEnabled);
    if (recompute) this.find(true);
  }

  getSearchQuery() {
    const df = this.activeSheet?.df;
    const colIndex = this.getColIndex();
    const scopeRange = (this.isAdvanced && this.colEnabled && df && df.height > 0 && df.width > 0)
      ? { xmin: colIndex, xmax: colIndex, ymin: 0, ymax: df.height - 1 }
      : undefined;
    return {
      term: this.query,
      caseSensitive: this.matchCase,
      ...(scopeRange ? { scopeRange } : {}),
    };
  }

  toggleReplaceRow(show = this.replaceRow.classList.contains('hidden')) {
    const wasAdvanced = this.isAdvanced;
    this.replaceRow.classList.toggle('hidden', !show);
    this.colRow?.classList.toggle('hidden', !show);
    this.toggleBtn.expanded = show;
    this.isAdvanced = Boolean(show);
    if (show && !wasAdvanced) {
      this.syncColBounds(!this.colEnabled);
    }
    if (!show) {
      const activeEl = globalThis.document?.activeElement;
      if (
        activeEl === this.replaceInput ||
        activeEl === this.replaceBtn ||
        activeEl === this.colToggleBtn ||
        activeEl === this.colInput ||
        this.colInput?.contains?.(activeEl)
      ) {
        this.findInput.focus();
      }
    }
    if (wasAdvanced !== this.isAdvanced && this.colEnabled && this.query) {
      this.find(true);
    }
  }

  _syncMatchView() {
    this.findBox.badge = this.matches.length === 0 ? 'No match' : `${this.currentIndex + 1} / ${this.matches.length}`;
    if (this.matches.length > 0) {
      const m = this.matches[this.currentIndex];
      this.activeSheet?.focusCell(m.x, m.y);
    }
  }

  find(forceRecompute = false) {
    const activeSheet = this.activeSheet;
    this.query = this.findInput.value;

    if (!this.query) {
      this.lastQuery = '';
      this.matches = [];
      this.currentIndex = 0;
    } else if (this.lastQuery === this.query && !forceRecompute) {
      if (this.matches.length > 0) this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    } else {
      this.lastQuery = this.query;
      this.currentIndex = 0;
      this.matches = activeSheet?.df ? activeSheet.df.find(this.getSearchQuery()) : [];
    }
    this._syncMatchView();
  }

  findNext() { this.find(this.query !== this.findInput.value || this.matches.length === 0); }

  findPrev() {
    if (this.query !== this.findInput.value || this.matches.length === 0) return this.find(true);
    this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
    this._syncMatchView();
  }

  replaceAll() {
    const activeSheet = this.activeSheet;
    if (!this.query || !activeSheet?.df) return;
    activeSheet.df.replaceAll(this.getSearchQuery(), this.replaceInput.value);
    activeSheet.refresh();
    activeSheet.refreshSelection(true);
    this.find(true);
  }

  open(prefill = '', isAdvanced = false) {
    if (!this.isOpen) {
      this.setColEnabled(false, false);
      this.syncColBounds(true);
    } else {
      this.syncColBounds(!this.colEnabled);
    }
    this.toggleReplaceRow(isAdvanced);
    if (prefill) this.findInput.value = prefill;
    this.show();
    this.findInput.focus();
    if (prefill) this.find(true);
  }
}

export class FilterDialog extends FloatingToolbar {
  constructor(sheet) {
    super(sheet);
    this._previousLock = null;

    this.innerHTML = `
      <div class="finder-row">
        <ui-input class="filter-box" placeholder="Filter column..." label="Filter text"></ui-input>
      </div>
      <div class="finder-row filter-bottom-row">
        <span class="filter-col-title truncate" title="Selected column header"></span>
        <div class="btn-group">
          <ui-glyph icon="match_case" class="case-btn" title="Match Case" toggle></ui-glyph>
          <ui-glyph icon="on" class="apply-btn" variant="accept" title="Apply Filter (Enter)"></ui-glyph>
          <ui-glyph icon="off" class="close-btn" variant="close" title="Close (Escape)"></ui-glyph>
        </div>
      </div>
    `;

    this.colInput = new NumInput(1, 1, 999, 'linear', 'sm');
    this.colInput.setAttribute('aria-label', 'Column number');
    this.colInput.setAttribute('title', 'Column number');
    this.firstElementChild.prepend(this.colInput);

    this.colTitle = this.querySelector('.filter-col-title');
    this.filterBox = this.querySelector('.filter-box');
    this.filterInput = this.filterBox.inputEl;
    this.countBadge = this.filterBox.badgeEl;
    this.caseBtn = this.querySelector('.case-btn');
    this.applyBtn = this.querySelector('.apply-btn');
    this.closeBtn = this.querySelector('.close-btn');

    this.caseBtn.onToggle = () => { if (this.filterInput.value) this.applyFilter(); };
    this.applyBtn.onClick = () => this.applyFilter();
    this.closeBtn.onClick = () => this.close();

    const handleEnter = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.applyFilter(); }
    };

    this.filterInput.addEventListener('keydown', handleEnter);
    this.filterInput.addEventListener('input', () => {
      if (!this.filterInput.value) {
        if (this.activeSheet?.filterRows !== null) this.applyFilter();
        else this.filterBox.badge = '';
      }
    });
    this.colInput.addEventListener('keydown', handleEnter);
    this.bindColInputSync(() => {
      if (this.filterInput.value) this.applyFilter();
    });
    this.colInput.addEventListener('change', () => {
      this.syncColBounds(false);
      if (this.filterInput.value) this.applyFilter();
    });
  }

  getFocusableElements() {
    return [this.colInput, this.filterInput, this.caseBtn, this.applyBtn, this.closeBtn]
      .filter(el => el && !el.disabled && !el.hidden);
  }

  open(colIndex) {
    if (getCsvHandle()?.viewOnly) {
      return Notification.warning('Filter is not available in Fast Preview mode.', 'Filter');
    }
    const activeSheet = this.activeSheet;
    if (!activeSheet?.df) return;

    this._previousLock ??= Boolean(activeSheet.df.lock);
    activeSheet.df.lock = true;
    if (activeSheet.isEditing) activeSheet.commitEdit?.();
    activeSheet.updateFooter?.();

    const maxCols = Math.max(1, activeSheet.df.width);
    this.colInput.min = 1;
    this.colInput.max = maxCols;
    const targetCol = (colIndex != null && colIndex >= 0) ? colIndex + 1 : activeSheet.x + 1;
    this.colInput.value = clamp(targetCol, 1, maxCols);
    this.updateColTitle();

    this.show();
    if (activeSheet.filterRows === null) this.filterBox.badge = '';
    this.filterInput.focus();
    this.filterInput.select();
  }

  close() {
    super.close();
    const activeSheet = this.activeSheet;
    if (activeSheet) {
      activeSheet.clearFilter();
      if (activeSheet.df) activeSheet.df.lock = this._previousLock ?? false;
      this._previousLock = null;
      activeSheet.refresh?.();
      activeSheet.refreshSelection?.(true);
    }
    this.filterBox.badge = '';
  }

  applyFilter() {
    const activeSheet = this.activeSheet;
    if (!activeSheet?.df) return;
    this.updateColTitle();
    activeSheet.setFilter(this.getColIndex(), this.filterInput.value, this.matchCase);
    if (activeSheet.filterRows === null) {
      this.filterBox.badge = '';
    } else {
      const totalDataRows = activeSheet.df.height - (activeSheet.fixTop ? 1 : 0);
      this.filterBox.badge = `${activeSheet.filterRows.length} / ${Math.max(1, totalDataRows)}`;
    }
  }
}

defineEl('ui-finder', FinderDialog);
defineEl('ui-filter', FilterDialog);
