/**
 * @file app/js/ValidationPane.js
 * Three-tier validation drawer (<ui-validation-pane>), macro manager (<ui-macro-pane>),
 * and file info drawer (<ui-file-info-pane>) built on a shared SideDrawerPane base class.
 */

import { dom, getSheet, getCsvHandle, settings } from './state.js';
import { defineEl, bindOverlayKeys, getFocusableElements, escapeHtml, clamp } from './utils.js';
import './Glyph.js';
import { BoolInput, ListInput, NumInput } from './Control.js';
import { Notification } from './Notification.js';
import {
  ENCODING_OPTIONS,
  DELIMITER_OPTIONS,
  EOL_OPTIONS,
  formatDelimiterOption,
  formatLineTerminatorOption,
  formatEncodingLabel,
  supportsBom,
} from '../core/Csv.js';
import {
  DataValidator,
  VALIDATION_RULES,
  VALIDATION_RULE_MAP,
  DEFAULT_MACROS,
  NON_VISUAL_ONLY_RE,
} from '../core/DataValidator.js';
import { QUOTED_EMPTY_CELL, displayCellValue } from '../core/Dataframe.js';

const ITEM_HEIGHT = 44;

function renderRuleCardsHtml() {
  const pinnedSet = new Set(Array.isArray(settings.pinnedValidations) ? settings.pinnedValidations : []);
  const orderedRules = [
    ...VALIDATION_RULES.filter(r => pinnedSet.has(r.id)),
    ...VALIDATION_RULES.filter(r => !pinnedSet.has(r.id)),
  ];
  return orderedRules.map(rule => `
    <div class="validation-rule-card${pinnedSet.has(rule.id) ? ' pinned' : ''}" data-rule-id="${rule.id}">
      <ui-glyph icon="${rule.icon}" variant="static"></ui-glyph>
      <div class="validation-rule-body">
        <div class="validation-rule-title truncate">${escapeHtml(rule.label)}</div>
        <div class="validation-rule-desc">${escapeHtml(rule.description)}</div>
      </div>
      <ui-glyph icon="arrow_right" variant="static" size="xs" class="glyph-dim"></ui-glyph>
    </div>
  `).join('');
}

class SideDrawerPane extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
  }

  connectedCallback() { this.init(); }

  get isOpen() { return this.classList.contains('open'); }

  renderShell(ariaLabel, actionsHtml, bodyHtml) {
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', ariaLabel);
    this.innerHTML = `
      <div class="validation-pane-header">
        <div class="validation-header-left">
          <ui-glyph icon="arrow_left" class="validation-btn back-btn hidden" title="Back"></ui-glyph>
          <span class="validation-pane-title truncate"></span>
          <span class="validation-badge hidden">0</span>
        </div>
        <div class="btn-group">
          ${actionsHtml}
          <ui-glyph icon="off" variant="close" class="validation-btn close-btn" title="Close"></ui-glyph>
        </div>
      </div>
      <div class="validation-pane-content scroll">${bodyHtml}</div>
    `;
    this.contentContainer = this.querySelector('.validation-pane-content');
    this.titleEl = this.querySelector('.validation-pane-title');
    this.countBadge = this.querySelector('.validation-badge');
    this.backBtn = this.querySelector('.back-btn');
    this.closeBtn = this.querySelector('.close-btn');
    this.backBtn.addEventListener('click', () => this.handleBack());
    this.closeBtn.addEventListener('click', () => this.close());
    // Drawers trap Escape (step back) and Tab (cycle visible controls) while focused, leaving global shortcuts intact.
    bindOverlayKeys(this, {
      onEscape: () => this.handleBack(),
      getFocusables: () => this.getFocusableElements(),
    });
    this.addEventListener('focusin', (event) => {
      if (event.target === this.getFocusableElements()[0]) {
        this.contentContainer.scrollTop = 0;
      }
    });
    this.addEventListener('mousedown', (event) => {
      if (event.target.closest('.file-info-value')) return;
      if (!event.target.closest('input, select, textarea, button, a, ui-glyph, ui-num, ui-list, ui-bool, ui-tags, [tabindex]')) {
        event.preventDefault();
        if (!this.contains(document.activeElement)) {
          const resume = this.lastFocused && !this.lastFocused.disabled && !this.lastFocused.hidden && !this.lastFocused.closest('.hidden')
            ? this.lastFocused
            : this.getFocusableElements()[0];
          resume?.focus();
        }
      }
    });
  }

  getFocusableElements() {
    return getFocusableElements(this);
  }

  updateHeader({ title, showBack = false, badgeCount = null, showBadge = false }) {
    this.backBtn.classList.toggle('hidden', !showBack);
    if (this.titleEl && title !== undefined) this.titleEl.textContent = title;
    this.updateBadge(badgeCount, showBadge);
  }

  updateBadge(count, visible) {
    if (visible && count !== null && count !== undefined) {
      this.countBadge.textContent = count;
    }
    this.countBadge.classList.toggle('hidden', !visible);
  }

  show() {
    this.init();
    for (const pane of [dom.validationPane, dom.macroPane, dom.fileInfoPane]) {
      if (pane && pane !== this) pane.close();
    }
    this.classList.add('open');
  }

  close() {
    this.init();
    this.classList.remove('open');
  }

  handleBack() {
    this.close();
  }
}

export class ValidationPane extends SideDrawerPane {

  constructor() {
    super();
    this.items = [];
    this.colItems = [];
    this.currentRule = null;
    this.currentCol = null;
    this.view = 'rules';
    this.selectedItem = null;
    this.emptyMessage = '';
    this._currencyColMap = new Map();
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.renderShell(
      'Validation Results',
      `<ui-glyph icon="done_all" variant="accept" class="validation-btn accept-all-btn" title="Accept all proposed edits"></ui-glyph>`,
      `
        <div class="validation-rules-view"></div>
        <div class="validation-columns-view hidden"></div>
        <div class="validation-detail-view hidden">
          <div class="validation-virtual-spacer">
            <div class="validation-virtual-content"></div>
          </div>
        </div>
      `
    );

    this.acceptAllBtn = this.querySelector('.accept-all-btn');
    this.rulesView = this.querySelector('.validation-rules-view');
    this.columnsView = this.querySelector('.validation-columns-view');
    this.detailView = this.querySelector('.validation-detail-view');
    this.virtualSpacer = this.querySelector('.validation-virtual-spacer');
    this.virtualContent = this.querySelector('.validation-virtual-content');

    this.acceptAllBtn.addEventListener('click', () => this.resolveScope(true));
    this.contentContainer.addEventListener('scroll', () => {
      if (this.view === 'detail') this.renderVirtualWindow();
    }, { passive: true });

    this.rulesView.addEventListener('click', (e) => {
      const ruleId = e.target.closest('.validation-rule-card')?.dataset.ruleId;
      if (ruleId) this.runRule(ruleId);
    });

    this.columnsView.addEventListener('click', (e) => {
      const btn = e.target.closest('.validation-btn');
      if (btn) {
        e.stopPropagation();
        const col = parseInt(btn.dataset.col, 10);
        if (!Number.isNaN(col)) {
          if (btn.classList.contains('col-inspect-btn')) this.showDetail(col);
          else this.resolveItems(this.getPendingItems(col), btn.variant === 'accept');
        }
        return;
      }
      const card = e.target.closest('.validation-col-card');
      if (card) {
        const col = parseInt(card.dataset.col, 10);
        if (!Number.isNaN(col)) this.showDetail(col);
      }
    });

    this.virtualContent.addEventListener('click', (e) => {
      const card = e.target.closest('.validation-item');
      const item = card ? this.colItems[parseInt(card.dataset.idx, 10)] : null;
      if (!item) return;

      const btn = e.target.closest('.validation-btn');
      if (btn) {
        e.stopPropagation();
        this.resolveItems([item], btn.variant === 'accept');
        return;
      }

      if (e.target.closest('.dup-origin-link') && item.dupOfY !== undefined) {
        e.stopPropagation();
        const sheet = getSheet();
        sheet.selectRange(0, item.dupOfY, Math.max(0, sheet.df.width - 1), item.dupOfY, true);
        return;
      }

      this.handleItemClick(item, card);
    });

    this.showRules();
  }

  getColHeader(colIndex) {
    return displayCellValue(getSheet().df.get(colIndex, 0)) || `col_${colIndex + 1}`;
  }

  getPendingItems(colIndex = null) {
    return this.items.filter(item =>
      (item.status === 'pending' || !item.status) && (colIndex === null || item.x === colIndex)
    );
  }

  getColumnGroups() {
    const groupsMap = new Map();
    for (const item of this.getPendingItems()) {
      let group = groupsMap.get(item.x);
      if (!group) {
        group = { x: item.x, header: this.getColHeader(item.x), items: [] };
        groupsMap.set(item.x, group);
      }
      group.items.push(item);
    }
    return Array.from(groupsMap.values()).sort((a, b) => a.x - b.x);
  }

  toggle() {
    if (this.isOpen) {
      if (this.view === 'rules') this.close();
      else this.showRules();
    } else {
      this.show();
      this.showRules();
    }
  }

  reset() {
    this.items = [];
    this.colItems = [];
    this.currentRule = null;
    this.currentCol = null;
    this.selectedItem = null;
    this.emptyMessage = '';
    this._currencyColMap.clear();
    if (this._initialized) this.showRules();
  }

  syncWithSheet() {
    if (!this._initialized) return;
    if (!this.isOpen || this.view === 'rules' || !this.currentRule) {
      this.reset();
      return;
    }
    const sheet = getSheet();
    const prevCol = this.currentCol;
    const prevView = this.view;
    const { proposals } = DataValidator.runRule(sheet.df, this.currentRule.id);
    this.items = proposals || [];
    this._currencyColMap.clear();
    if (prevView === 'detail' && (this.currentRule.skipColumns || (prevCol !== null && prevCol < sheet.df.width))) {
      this.showDetail(this.currentRule.skipColumns ? null : prevCol);
    } else {
      this.showColumns();
    }
  }

  runRule(ruleId) {
    this.init();
    const sheet = getSheet();
    if (sheet.warnIfLocked('Validation')) return;

    const rule = VALIDATION_RULE_MAP.get(ruleId);
    if (!rule) return;

    const { proposals, reason } = DataValidator.runRule(sheet.df, ruleId);
    if (reason === 'coexistence') {
      this.emptyMessage = "Both 'dd-mm-YYYY' and 'mm-dd-YYYY' formats coexist in the file.";
    } else if (reason === 'ambiguous') {
      this.emptyMessage = 'Cannot determine date format with certainty: no date has a digit over 12.';
    } else if (ruleId === 'duplicate_rows') {
      this.emptyMessage = 'No duplicate rows left.';
    } else {
      this.emptyMessage = 'No transformations left.';
    }

    this.currentRule = rule;
    this.items = proposals || [];
    this._currencyColMap.clear();
    this.show();
    if (rule.skipColumns) this.showDetail(null);
    else this.showColumns();
  }

  _colCardHtml(col, header, count) {
    return `
      <div class="validation-col-card" data-col="${col}">
        <div class="validation-col-info">
          <span class="validation-col-label truncate">Col ${col + 1}: ${escapeHtml(header)}</span>
          <span class="validation-col-count">${count}</span>
        </div>
        <div class="btn-group">
          <ui-glyph icon="on" variant="accept" class="validation-btn col-accept-btn" title="Accept column ${col + 1}" data-col="${col}"></ui-glyph>
          <ui-glyph icon="off" variant="reject" class="validation-btn" title="Reject column ${col + 1}" data-col="${col}"></ui-glyph>
          <ui-glyph icon="arrow_right" class="validation-btn col-inspect-btn" title="Inspect individual corrections" data-col="${col}"></ui-glyph>
        </div>
      </div>
    `;
  }

  handleBack() {
    if (this.view === 'detail' && !this.currentRule?.skipColumns) this.showColumns();
    else if (this.view === 'detail' || this.view === 'columns') this.showRules();
    else this.close();
  }

  resolveScope(accept = true) {
    if (this.view === 'columns' || (this.view === 'detail' && this.currentCol === null)) {
      this.resolveItems(this.getPendingItems(), accept);
    } else if (this.view === 'detail' && this.currentCol !== null) {
      this.resolveItems(this.getPendingItems(this.currentCol), accept);
    }
  }

  setView(mode, title, scopeLabel = '') {
    this.view = mode;
    const isRoot = mode === 'rules';
    this.updateHeader({ title, showBack: !isRoot, badgeCount: 0, showBadge: false });
    this.acceptAllBtn.classList.add('hidden');
    if (scopeLabel) this.acceptAllBtn.label = `Accept all ${scopeLabel}`;
    this.rulesView.classList.toggle('hidden', mode !== 'rules');
    this.columnsView.classList.toggle('hidden', mode !== 'columns');
    this.detailView.classList.toggle('hidden', mode !== 'detail');
  }

  syncPendingCount(count) {
    const hasPending = count > 0;
    this.updateBadge(count, hasPending);
    this.acceptAllBtn.classList.toggle('hidden', !hasPending);
  }

  refreshRules() {
    if (!this._initialized) return;
    if (!this.isOpen) {
      this.reset();
      return;
    }
    if (this.view === 'rules') this.showRules();
    else if (this.currentRule?.id === 'text_commas') this.runRule('text_commas');
  }

  showRules() {
    this.init();
    this.currentRule = this.currentCol = this.selectedItem = null;
    this.setView('rules', 'Validation');
    this.rulesView.innerHTML = renderRuleCardsHtml();
  }

  showColumns() {
    this.init();
    this.currentCol = this.selectedItem = null;
    this.setView('columns', this.currentRule ? this.currentRule.label : 'Columns', 'across all columns');
    this.renderColumns();
  }

  renderColumns() {
    const groups = this.getColumnGroups();
    const totalPending = groups.reduce((sum, g) => sum + g.items.length, 0);
    this.syncPendingCount(totalPending);

    if (groups.length === 0) {
      this.columnsView.innerHTML = `<div class="validation-empty">${escapeHtml(this.emptyMessage || 'No transformations left.')}</div>`;
      return;
    }

    this.columnsView.innerHTML = groups.map(g => this._colCardHtml(g.x, g.header, g.items.length)).join('');
  }

  showDetail(colIndex = null) {
    this.init();
    this.currentCol = colIndex;
    const title = colIndex === null
      ? (this.currentRule ? this.currentRule.label : 'Validation')
      : `Col ${colIndex + 1}: ${this.getColHeader(colIndex)}`;
    const scopeLabel = colIndex === null
      ? (this.currentRule?.id === 'duplicate_rows' ? 'duplicate rows' : 'corrections across sheet')
      : `corrections in Col ${colIndex + 1}`;
    this.setView('detail', title, scopeLabel);
    this.renderDetail();
  }

  renderDetail() {
    this.colItems = this.getPendingItems(this.currentCol);
    const hasPending = this.colItems.length > 0;
    this.syncPendingCount(this.colItems.length);

    if (!hasPending) {
      this.virtualSpacer.style.height = 'auto';
      this.virtualContent.style.transform = 'translateY(0px)';
      this.virtualContent.innerHTML = `<div class="validation-empty">${escapeHtml(this.emptyMessage || 'No transformations left.')}</div>`;
      return;
    }

    this.virtualSpacer.style.height = `${this.colItems.length * ITEM_HEIGHT}px`;
    this._lastRenderStart = this._lastRenderEnd = -1;
    this.renderVirtualWindow();
  }

  resolveItems(itemsList, accept) {
    if (!itemsList?.length) return;
    if (accept) {
      const sheet = getSheet();
      if (sheet.warnIfLocked('Validation')) return;
      DataValidator.applyProposals(sheet.df, this.currentRule.id, itemsList, this.items, this._currencyColMap);
      sheet.clampSelection();
      for (const item of itemsList) item.status = 'accepted';
    } else {
      for (const item of itemsList) item.status = 'rejected';
    }

    if (this.view === 'detail') this.renderDetail();
    else if (this.view === 'columns') this.renderColumns();
  }

  renderVirtualWindow() {
    const total = this.colItems.length;
    if (total === 0) {
      this.virtualContent.innerHTML = '';
      this.virtualContent.style.transform = 'translateY(0px)';
      return;
    }

    const scrollTop = this.contentContainer ? this.contentContainer.scrollTop : 0;
    const containerHeight = this.contentContainer.clientHeight || 600;
    const startIndex = clamp(Math.floor(scrollTop / ITEM_HEIGHT), 0, total - 1);
    const endIndex = Math.min(total, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT));
    const renderStart = Math.max(0, startIndex - 5);
    const renderEnd = Math.min(total, endIndex + 5);

    this.virtualContent.style.transform = `translateY(${renderStart * ITEM_HEIGHT}px)`;
    if (this._lastRenderStart === renderStart && this._lastRenderEnd === renderEnd && this._lastSelected === this.selectedItem) return;
    this._lastRenderStart = renderStart;
    this._lastRenderEnd = renderEnd;
    this._lastSelected = this.selectedItem;

    let html = '';
    for (let i = renderStart; i < renderEnd; i++) {
      const item = this.colItems[i];
      if (item.isRowDeletion) {
        const originRow = (item.dupOfY ?? 0) + 1;
        html += `
          <div class="validation-item ${this.selectedItem === item ? 'selected' : ''}" data-idx="${i}">
            <div class="validation-item-diff">
              <span class="diff-old">Row ${item.y + 1}</span>
              <span class="validation-iso-tag dup-origin-link" title="Go to Row ${originRow}">dup of row ${originRow}</span>
            </div>
            <div class="btn-group">
              <ui-glyph icon="bin" variant="accept" class="validation-btn" title="Remove duplicate row"></ui-glyph>
              <ui-glyph icon="off" variant="reject" class="validation-btn" title="Keep row"></ui-glyph>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="validation-item ${this.selectedItem === item ? 'selected' : ''}" data-idx="${i}">
            <div class="validation-item-diff">
              ${this.currentCol === null ? `<span class="validation-iso-tag">Col ${item.x + 1}</span>` : ''}
              <span class="diff-old truncate" title="${escapeHtml(item.oldValue)}">${this.formatValue(item.oldValue)}</span>
              <span class="diff-arrow">&rarr;</span>
              <span class="diff-new truncate" title="${escapeHtml(item.newValue)}">${this.formatValue(item.newValue)}</span>
              ${item.iso3 ? `<span class="validation-iso-tag">${escapeHtml(item.iso3)}</span>` : ''}
            </div>
            <div class="btn-group">
              <ui-glyph icon="on" variant="accept" class="validation-btn" title="Accept edit"></ui-glyph>
              <ui-glyph icon="off" variant="reject" class="validation-btn" title="Reject edit"></ui-glyph>
            </div>
          </div>
        `;
      }
    }
    this.virtualContent.innerHTML = html;
  }

  handleItemClick(item, cardEl) {
    this.selectedItem = item;
    for (const card of this.virtualContent.querySelectorAll('.validation-item')) {
      card.classList.toggle('selected', card === cardEl);
    }
    const sheet = getSheet();
    if (item.isRowDeletion) {
      sheet.selectRange(0, item.y, Math.max(0, sheet.df.width - 1), item.y, true);
    } else {
      sheet.focusCell(item.x, item.y);
    }
  }

  formatValue(value) {
    if (!value) return '<em>empty</em>';
    if (value === QUOTED_EMPTY_CELL && settings.preserveQuotedEmpty) {
      return '<span class="empty-string-badge">empty string</span>';
    }
    if (NON_VISUAL_ONLY_RE.test(value)) {
      const visible = value
        .replaceAll('\r', '\\r')
        .replaceAll('\n', '\\n')
        .replaceAll('\t', '\\t')
        .replaceAll('\u00A0', '\\u00A0')
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u00AD\u0000-\u001F\u007F-\u009F]/g, c => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
        .replaceAll(' ', '␣');
      return escapeHtml(visible);
    }
    return escapeHtml(value).replaceAll('\n', '\\n');
  }
}

export class MacroPane extends SideDrawerPane {

  constructor() {
    super();
    this.view = 'list';
    this.editingIdx = null;
    this._dragIdx = null;
    this._savingInternal = false;
  }

  getMacros() {
    if (!Array.isArray(settings.macros)) {
      return DEFAULT_MACROS.map(m => ({ ...m, steps: [...m.steps] }));
    }
    return settings.macros;
  }

  saveMacros(macros) {
    this._savingInternal = true;
    settings.macros = macros.map(m => ({
      id: String(m.id || `macro_${Date.now()}`),
      title: String(m.title ?? ''),
      description: String(m.description ?? ''),
      steps: Array.isArray(m.steps) ? m.steps.map(String) : [],
    }));
    this._savingInternal = false;
  }

  refreshFromSettings() {
    if (!this._initialized || this._savingInternal) return;
    if (this.view === 'list') this.showList();
    else if (this.view === 'edit' && this.editingIdx !== null) {
      const macros = this.getMacros();
      if (this.editingIdx >= 0 && this.editingIdx < macros.length) this.renderEditSteps();
      else this.showList();
    } else if (this.view === 'pick') {
      this.showPick();
    }
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.renderShell(
      'Validation Macros',
      `
        <ui-glyph icon="add" class="validation-btn macro-add-btn" title="New macro"></ui-glyph>
        <ui-glyph icon="macro" class="validation-btn macro-header-run-btn hidden" title="Run macro"></ui-glyph>
        <ui-glyph icon="bin" variant="reject" class="validation-btn macro-header-del-btn hidden" title="Delete macro"></ui-glyph>
      `,
      `
        <div class="validation-rules-view" id="macro-list-view"></div>
        <div class="macro-edit-view hidden">
          <div class="macro-field">
            <label class="macro-label" for="macro-title-input">Title</label>
            <input type="text" id="macro-title-input" class="macro-input" placeholder="Macro title" />
          </div>
          <div class="macro-field">
            <label class="macro-label" for="macro-desc-input">Description</label>
            <textarea id="macro-desc-input" class="macro-input macro-textarea" rows="2" placeholder="Macro description"></textarea>
          </div>
          <div class="macro-steps-header">
            <span class="macro-label">Validation Steps</span>
            <button type="button" class="macro-add-step-btn">
              <ui-glyph icon="add" variant="static" size="xs"></ui-glyph>
              <span>Add Step</span>
            </button>
          </div>
          <div class="validation-columns-view macro-steps-list"></div>
        </div>
        <div class="validation-rules-view hidden" id="macro-pick-view"></div>
      `
    );

    this.addBtn = this.querySelector('.macro-add-btn');
    this.headerRunBtn = this.querySelector('.macro-header-run-btn');
    this.headerDelBtn = this.querySelector('.macro-header-del-btn');
    this.listView = this.querySelector('#macro-list-view');
    this.editView = this.querySelector('.macro-edit-view');
    this.pickView = this.querySelector('#macro-pick-view');
    this.titleInput = this.querySelector('#macro-title-input');
    this.descInput = this.querySelector('#macro-desc-input');
    this.addStepBtn = this.querySelector('.macro-add-step-btn');
    this.stepsList = this.querySelector('.macro-steps-list');

    this.addBtn.addEventListener('click', () => this.createMacro());
    this.headerRunBtn.addEventListener('click', () => {
      if (this.editingIdx !== null) this.runMacro(this.editingIdx);
    });
    this.headerDelBtn.addEventListener('click', () => {
      if (this.editingIdx !== null) this.deleteMacro(this.editingIdx);
    });
    this.addStepBtn.addEventListener('click', () => this.showPick());

    const syncMetaInputs = () => this.updateCurrentMacro(current => ({
      ...current,
      title: this.titleInput.value ?? current.title,
      description: this.descInput.value ?? current.description,
    }));

    this.titleInput.addEventListener('input', syncMetaInputs);
    this.descInput.addEventListener('input', syncMetaInputs);

    this.listView.addEventListener('click', (e) => {
      const runBtn = e.target.closest('.macro-run-btn');
      if (runBtn) {
        e.stopPropagation();
        const idx = parseInt(runBtn.dataset.macroIdx, 10);
        if (!Number.isNaN(idx)) this.runMacro(idx);
        return;
      }
      const card = e.target.closest('.macro-card');
      if (card) {
        const idx = parseInt(card.dataset.macroIdx, 10);
        if (!Number.isNaN(idx)) this.showEdit(idx);
      }
    });

    this.stepsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.validation-btn');
      if (!btn || btn.disabled) return;
      e.stopPropagation();
      const stepIdx = parseInt(btn.dataset.stepIdx, 10);
      if (Number.isNaN(stepIdx)) return;
      if (btn.classList.contains('step-up-btn')) this.moveStep(stepIdx, stepIdx - 1);
      else if (btn.classList.contains('step-down-btn')) this.moveStep(stepIdx, stepIdx + 1);
      else if (btn.classList.contains('step-del-btn')) this.removeStep(stepIdx);
    });

    const clearDragClasses = () => {
      for (const el of this.stepsList.querySelectorAll('.macro-step-card')) {
        el.classList.remove('dragging', 'drag-over', 'drag-over-above');
      }
    };

    const getDropTarget = (card, clientY) => {
      const hoveredIdx = card ? parseInt(card.dataset.stepIdx, 10) : NaN;
      if (Number.isNaN(hoveredIdx) || this._dragIdx === null || hoveredIdx === this._dragIdx) return null;
      const rect = card.getBoundingClientRect();
      const isTop = hoveredIdx === 0 && this._dragIdx > 0 && (this._dragIdx === 1 || clientY < rect.top + rect.height / 2);
      const toIdx = isTop ? 0 : (this._dragIdx < hoveredIdx ? hoveredIdx : hoveredIdx + 1);
      return toIdx !== this._dragIdx ? { card, toIdx, isTop } : null;
    };

    this.stepsList.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.macro-step-card');
      if (!card) return;
      this._dragIdx = parseInt(card.dataset.stepIdx, 10);
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(this._dragIdx)); } catch {}
      }
    });

    this.stepsList.addEventListener('dragover', (e) => {
      const card = e.target.closest('.macro-step-card');
      if (!card || this._dragIdx === null) return;
      e.preventDefault();
      const target = getDropTarget(card, e.clientY);
      for (const el of this.stepsList.querySelectorAll('.macro-step-card')) {
        const match = Boolean(target && el === target.card);
        el.classList.toggle('drag-over', match && !target.isTop);
        el.classList.toggle('drag-over-above', match && target.isTop);
      }
    });

    this.stepsList.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = getDropTarget(e.target.closest('.macro-step-card'), e.clientY);
      const fromIdx = this._dragIdx;
      this._dragIdx = null;
      clearDragClasses();
      if (target && fromIdx !== null) this.moveStep(fromIdx, target.toIdx);
    });

    this.stepsList.addEventListener('dragend', () => {
      this._dragIdx = null;
      clearDragClasses();
    });

    this.pickView.addEventListener('click', (e) => {
      const ruleId = e.target.closest('.validation-rule-card')?.dataset.ruleId;
      if (ruleId) this.addStep(ruleId);
    });

    this.showList();
  }

  toggle() {
    if (this.isOpen) {
      if (this.view === 'list') this.close();
      else this.showList();
    } else {
      this.show();
      this.showList();
    }
  }

  handleBack() {
    if (this.view === 'pick') this.showEdit(this.editingIdx);
    else if (this.view === 'edit') this.showList();
    else this.close();
  }

  setView(mode, title, badgeCount = null) {
    this.view = mode;
    const isList = mode === 'list';
    const isEdit = mode === 'edit';
    const showBadge = badgeCount !== null && badgeCount >= 0;
    this.updateHeader({ title, showBack: !isList, badgeCount, showBadge });
    this.addBtn.classList.toggle('hidden', !isList);
    this.headerRunBtn.classList.toggle('hidden', !isEdit);
    this.headerDelBtn.classList.toggle('hidden', !isEdit);
    this.listView.classList.toggle('hidden', !isList);
    this.editView.classList.toggle('hidden', !isEdit);
    this.pickView.classList.toggle('hidden', mode !== 'pick');
  }

  showList() {
    this.init();
    this.editingIdx = null;
    this.setView('list', 'Macros');

    const macros = this.getMacros();
    if (macros.length === 0) {
      this.listView.innerHTML = `<div class="validation-empty">No macros configured. Click + to create one.</div>`;
      return;
    }

    this.listView.innerHTML = macros.map((macro, idx) => `
      <div class="validation-rule-card macro-card" data-macro-idx="${idx}">
        <ui-glyph icon="macro" class="validation-btn macro-run-btn" title="Run macro" data-macro-idx="${idx}"></ui-glyph>
        <div class="validation-rule-body">
          <div class="macro-title-row">
            <span class="validation-rule-title truncate">${escapeHtml(macro.title || 'Untitled Macro')}</span>
            <span class="validation-col-count">${Array.isArray(macro.steps) ? macro.steps.length : 0}</span>
          </div>
          <div class="validation-rule-desc">${escapeHtml(macro.description || '')}</div>
        </div>
      </div>
    `).join('');
  }

  createMacro() {
    const macros = [...this.getMacros()];
    const newMacro = {
      id: `macro_${Date.now()}`,
      title: 'New Macro',
      description: 'Custom validation macro',
      steps: [],
    };
    macros.push(newMacro);
    this.saveMacros(macros);
    this.showEdit(macros.length - 1);
    setTimeout(() => {
      this.titleInput.focus();
      this.titleInput.select();
    }, 0);
  }

  deleteMacro(idx) {
    const macros = [...this.getMacros()];
    if (idx < 0 || idx >= macros.length) return;
    macros.splice(idx, 1);
    this.saveMacros(macros);
    this.showList();
  }

  showEdit(idx) {
    this.init();
    const macros = this.getMacros();
    if (idx === null || idx < 0 || idx >= macros.length) return this.showList();
    this.editingIdx = idx;
    const macro = macros[idx];
    this.setView('edit', 'Edit Macro', Array.isArray(macro.steps) ? macro.steps.length : 0);
    this.titleInput.value = macro.title || '';
    this.descInput.value = macro.description || '';
    this.renderEditSteps();
  }

  renderEditSteps() {
    if (this.editingIdx === null) return;
    const macros = this.getMacros();
    const macro = macros[this.editingIdx];
    if (!macro) return;
    const steps = Array.isArray(macro.steps) ? macro.steps : [];
    this.updateBadge(steps.length, true);

    if (steps.length === 0) {
      this.stepsList.innerHTML = `<div class="validation-empty">No steps yet. Click "Add Step" to add a validation rule.</div>`;
      return;
    }

    this.stepsList.innerHTML = steps.map((stepId, stepIdx) => {
      const rule = VALIDATION_RULE_MAP.get(stepId);
      const label = rule ? rule.label : stepId;
      const icon = rule ? rule.icon : 'replace';
      return `
        <div class="validation-col-card macro-step-card" draggable="true" data-step-idx="${stepIdx}">
          <div class="validation-col-info">
            <span class="validation-col-count">${stepIdx + 1}</span>
            <ui-glyph icon="${icon}" variant="static" size="sm"></ui-glyph>
            <span class="validation-rule-title truncate">${escapeHtml(label)}</span>
          </div>
          <div class="btn-group">
            <ui-glyph icon="arrow_up" size="sm" class="validation-btn step-up-btn" title="Move step up" data-step-idx="${stepIdx}" ${stepIdx === 0 ? 'disabled' : ''}></ui-glyph>
            <ui-glyph icon="arrow_down" size="sm" class="validation-btn step-down-btn" title="Move step down" data-step-idx="${stepIdx}" ${stepIdx === steps.length - 1 ? 'disabled' : ''}></ui-glyph>
            <ui-glyph icon="bin" size="sm" variant="reject" class="validation-btn step-del-btn" title="Remove step" data-step-idx="${stepIdx}"></ui-glyph>
          </div>
        </div>
      `;
    }).join('');
  }

  showPick() {
    this.init();
    if (this.editingIdx === null) return this.showList();
    this.setView('pick', 'Add Validation Step');
    this.pickView.innerHTML = renderRuleCardsHtml();
  }

  updateCurrentMacro(mutator) {
    if (this.editingIdx === null) return false;
    const macros = [...this.getMacros()];
    const current = macros[this.editingIdx];
    if (!current) return false;
    const updated = mutator(current);
    if (!updated) return false;
    macros[this.editingIdx] = updated;
    this.saveMacros(macros);
    return true;
  }

  addStep(ruleId) {
    if (this.updateCurrentMacro(m => ({ ...m, steps: Array.isArray(m.steps) ? [...m.steps, ruleId] : [ruleId] }))) {
      this.showEdit(this.editingIdx);
    }
  }

  removeStep(stepIdx) {
    if (this.updateCurrentMacro(m => {
      if (!Array.isArray(m.steps) || stepIdx < 0 || stepIdx >= m.steps.length) return null;
      const steps = [...m.steps];
      steps.splice(stepIdx, 1);
      return { ...m, steps };
    })) {
      this.renderEditSteps();
    }
  }

  moveStep(fromIdx, toIdx) {
    if (this.updateCurrentMacro(m => {
      if (!Array.isArray(m.steps) || fromIdx < 0 || fromIdx >= m.steps.length || toIdx < 0 || toIdx >= m.steps.length || fromIdx === toIdx) return null;
      const steps = [...m.steps];
      const [moved] = steps.splice(fromIdx, 1);
      steps.splice(toIdx, 0, moved);
      return { ...m, steps };
    })) {
      this.renderEditSteps();
    }
  }

  runMacro(idx) {
    const sheet = getSheet();
    if (sheet.warnIfLocked('Macros')) return;

    const macros = this.getMacros();
    const macro = macros[idx];
    if (!macro) return;
    const steps = Array.isArray(macro.steps) ? macro.steps : [];
    if (steps.length === 0) {
      return Notification.info(`Macro "${macro.title || 'Untitled'}" has no validation steps.`, 'Macros');
    }

    const { totalChanges } = DataValidator.executeMacro(sheet.df, steps);
    sheet.clampSelection();
    dom.validationPane.reset();

    const title = macro.title || 'Macro';
    if (totalChanges > 0) {
      Notification.quick(`${title}: applied ${totalChanges} change${totalChanges === 1 ? '' : 's'}`);
    } else {
      Notification.quick(`${title}: no changes needed`);
    }
    return totalChanges;
  }
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let unitIdx = 0;
  while (val >= 1024 && unitIdx < units.length - 1) {
    val /= 1024;
    unitIdx++;
  }
  return `${val.toFixed(2)} ${units[unitIdx]} (${bytes.toLocaleString('en-US')} B)`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDelimiterDisplay(sep) {
  if (!sep) return ', (Comma)';
  const names = {
    ',': ', (Comma)',
    ';': '; (Semicolon)',
    '\t': 'TAB (\\t)',
    TAB: 'TAB (\\t)',
    '|': '| (Pipe)',
  };
  return names[sep] || `'${sep}'`;
}

function buildToggleableInfoRow(labelText, controlEl, isEditableFn) {
  const row = document.createElement('div');
  row.className = 'file-info-row';

  const label = document.createElement('span');
  label.className = 'file-info-label';
  label.textContent = labelText;

  const valueEl = document.createElement('span');
  valueEl.className = 'file-info-value mono';

  controlEl.classList.add('hidden');
  row.append(label, valueEl, controlEl);

  row.addEventListener('focusin', () => {
    if (isEditableFn()) row.classList.add('active');
  });
  row.addEventListener('focusout', (e) => {
    if (!row.contains(e.relatedTarget)) row.classList.remove('active');
  });
  row.addEventListener('click', (e) => {
    if (isEditableFn() && !controlEl.disabled && controlEl.focus && !controlEl.contains(e.target)) {
      controlEl.focus();
    }
  });

  return { row, valueEl, controlEl };
}

export class FileInfoPane extends SideDrawerPane {
  constructor() {
    super();
    this._editingSettings = false;
    this._settingRows = [];
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.renderShell(
      'File Info',
      '',
      `<div class="file-info-view"></div>`
    );

    this.infoView = this.querySelector('.file-info-view');
    this.updateHeader({ title: 'File Info', showBack: false, showBadge: false });
    this._buildDom();
  }

  _buildDom() {
    this.infoView.innerHTML = `
      <div class="file-info-section">
        <div class="file-info-section-header">
          <span class="macro-label">Metadata</span>
        </div>
        <div class="file-info-card">
          <div class="file-info-row">
            <span class="file-info-label">File Name</span>
            <span class="file-info-value mono" data-field="name"></span>
          </div>
          <div class="file-info-row">
            <span class="file-info-label">File Size</span>
            <span class="file-info-value mono" data-field="size"></span>
          </div>
          <div class="file-info-row">
            <span class="file-info-label">Dimensions</span>
            <span class="file-info-value mono" data-field="dims"></span>
          </div>
          <div class="file-info-row">
            <span class="file-info-label">Last Modified</span>
            <span class="file-info-value mono" data-field="modified"></span>
          </div>
        </div>
      </div>
      <div class="file-info-section">
        <div class="file-info-section-header">
          <span class="macro-label">Read &amp; Write Settings</span>
          <ui-glyph icon="edit" size="xs" toggle class="file-info-edit-btn" title="Edit Read &amp; Write Settings"></ui-glyph>
        </div>
        <div class="file-info-card file-info-controls-card"></div>
        <div class="file-info-note hidden"></div>
      </div>
      <div class="file-info-actions hidden">
        <button type="button" class="file-info-btn" data-action="reparse" title="Reload and re-parse file using current Encoding and Delimiter">
          <ui-glyph icon="reload_file" variant="static" size="xs"></ui-glyph>
          <span>Reload</span>
        </button>
        <div class="file-info-btn-row">
          <button type="button" class="file-info-btn" data-action="set-defaults" title="Set Read &amp; Write Settings to global defaults (does not save)">
            <ui-glyph icon="reset_settings" variant="static" size="xs"></ui-glyph>
            <span>Set defaults</span>
          </button>
          <button type="button" class="file-info-btn" data-action="save">
            <ui-glyph icon="save" variant="static" size="xs"></ui-glyph>
            <span>Save</span>
          </button>
        </div>
      </div>
    `;

    this.nameEl = this.infoView.querySelector('[data-field="name"]');
    this.sizeEl = this.infoView.querySelector('[data-field="size"]');
    this.dimsEl = this.infoView.querySelector('[data-field="dims"]');
    this.modifiedEl = this.infoView.querySelector('[data-field="modified"]');
    this.editBtn = this.infoView.querySelector('.file-info-edit-btn');
    this.noteEl = this.infoView.querySelector('.file-info-note');
    this.actionsEl = this.infoView.querySelector('.file-info-actions');
    this.reparseBtn = this.infoView.querySelector('[data-action="reparse"]');
    this.setDefaultsBtn = this.infoView.querySelector('[data-action="set-defaults"]');
    this.saveBtn = this.infoView.querySelector('[data-action="save"]');

    const controlsCard = this.infoView.querySelector('.file-info-controls-card');
    const isEditable = () => Boolean(this._editingSettings);

    this.encodingInput = new ListInput([...ENCODING_OPTIONS]);
    this.delimiterInput = new ListInput([...DELIMITER_OPTIONS]);
    this.eolInput = new ListInput([...EOL_OPTIONS]);
    this.bomInput = new BoolInput(false);
    this.fixedWidthInput = new NumInput(0, 0, 100);
    this.strictInput = new BoolInput(false);

    this.encodingRow = buildToggleableInfoRow('Encoding', this.encodingInput, isEditable);
    this.delimiterRow = buildToggleableInfoRow('Delimiter', this.delimiterInput, isEditable);
    this.eolRow = buildToggleableInfoRow('Line Ending (EOL)', this.eolInput, isEditable);
    this.bomRow = buildToggleableInfoRow('Byte Order Mark (BOM)', this.bomInput, isEditable);
    this.fixedWidthRow = buildToggleableInfoRow('Min Column Size', this.fixedWidthInput, isEditable);
    this.strictRow = buildToggleableInfoRow('Save-Strict', this.strictInput, isEditable);

    this._settingRows = [
      this.encodingRow,
      this.delimiterRow,
      this.eolRow,
      this.bomRow,
      this.fixedWidthRow,
      this.strictRow,
    ];

    controlsCard.append(...this._settingRows.map(r => r.row));

    this.editBtn.onToggle = (active) => {
      this._editingSettings = Boolean(active);
      this._syncEditMode();
    };

    this.encodingInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ encoding: this.encodingInput.value });
    });
    this.delimiterInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ delimiter: this.delimiterInput.value });
    });
    this.eolInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ lineTerminator: this.eolInput.value });
    });
    this.bomInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ hasBom: this.bomInput.value });
    });
    this.fixedWidthInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ fixedWidth: this.fixedWidthInput.value });
    });
    this.strictInput.addEventListener('change', () => {
      getCsvHandle()?.updateDialect({ isStrict: this.strictInput.value });
    });

    this.reparseBtn.addEventListener('click', () => {
      getCsvHandle()?.reparse();
    });
    this.setDefaultsBtn.addEventListener('click', () => {
      getCsvHandle()?.resetDialectToDefaults();
    });
    this.saveBtn.addEventListener('click', () => {
      getCsvHandle()?.save({ ignoreForceDefault: true });
    });

    this._syncEditMode();
  }

  _syncEditMode() {
    const editing = Boolean(this._editingSettings);
    if (this.editBtn && this.editBtn.active !== editing) {
      this.editBtn.active = editing;
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focusWasInControl = !editing && active && this._settingRows.some(
      r => r.controlEl === active || r.controlEl.contains(active)
    );
    for (const entry of this._settingRows) {
      entry.row.classList.toggle('interactive', editing);
      if (!editing) entry.row.classList.remove('active');
      entry.valueEl.classList.toggle('hidden', editing);
      entry.controlEl.classList.toggle('hidden', !editing);
    }
    if (focusWasInControl) this.editBtn?.focus();
  }

  close() {
    super.close();
    if (this._initialized && this._editingSettings) {
      this._editingSettings = false;
      this._syncEditMode();
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      document.activeElement?.blur?.();
      this.show();
      this.renderInfo();
      setTimeout(() => {
        if (this.saveBtn && !this.saveBtn.disabled && !this.actionsEl.classList.contains('hidden')) {
          this.saveBtn.focus();
        }
      }, 0);
    }
  }

  refresh() {
    if (this._initialized && this.isOpen) {
      this.renderInfo();
    }
  }

  renderInfo() {
    this.init();
    this.updateHeader({ title: 'File Info', showBack: false, showBadge: false });
    const csvHandle = getCsvHandle();
    const sheet = getSheet();
    const file = csvHandle?.file || null;
    const handle = csvHandle?.handle || null;
    const hasFile = Boolean(file || handle);
    const viewOnly = Boolean(csvHandle?.viewOnly);

    const fileName = file?.name || handle?.name || 'Untitled (unsaved)';
    const fileSize = file && typeof file.size === 'number' ? formatBytes(file.size) : '—';
    const dims = sheet?.df ? `${sheet.df.width} × ${sheet.df.height}` : '—';
    const lastModified = formatTimestamp(file?.lastModified);

    const setField = (el, val) => {
      const str = String(val);
      if (el.textContent !== str) {
        el.textContent = str;
        el.title = str;
      }
    };
    setField(this.nameEl, fileName);
    setField(this.sizeEl, fileSize);
    setField(this.dimsEl, dims);
    setField(this.modifiedEl, lastModified);

    const dialect = csvHandle?.getEditableDialect?.() || {
      encoding: 'utf-8',
      delimiter: ',',
      lineTerminator: '\r\n',
      hasBom: false,
      fixedWidth: 0,
      isStrict: false,
    };

    const eolOpt = formatLineTerminatorOption(dialect.lineTerminator);
    const desiredEolList = eolOpt === 'CR' ? [...EOL_OPTIONS, 'CR'] : [...EOL_OPTIONS];
    if (this.eolInput.options.length !== desiredEolList.length) {
      this.eolInput.setOptions(desiredEolList);
    }

    const bomSupported = supportsBom(dialect.encoding);
    const bomValue = bomSupported && Boolean(dialect.hasBom);
    const fixedWidthVal = Number(dialect.fixedWidth) || 0;
    const strictVal = Boolean(dialect.isStrict);

    // Update static read-only spans
    setField(this.encodingRow.valueEl, formatEncodingLabel(dialect.encoding));
    setField(this.delimiterRow.valueEl, formatDelimiterDisplay(dialect.delimiter));
    setField(this.eolRow.valueEl, eolOpt);
    setField(this.bomRow.valueEl, bomSupported ? (bomValue ? 'On' : 'Off') : '—');
    setField(this.fixedWidthRow.valueEl, String(fixedWidthVal));
    setField(this.strictRow.valueEl, strictVal ? 'On' : 'Off');

    // Update interactive controls
    this.encodingInput.value = dialect.encoding;
    this.delimiterInput.value = formatDelimiterOption(dialect.delimiter);
    this.eolInput.value = eolOpt;
    this.bomInput.disabled = !bomSupported;
    this.bomInput.value = bomValue;
    this.bomRow.row.title = bomSupported ? '' : 'BOM is only supported for UTF-8 and UTF-16 encodings';
    this.fixedWidthInput.value = fixedWidthVal;
    this.strictInput.value = strictVal;

    const forceDefault = Boolean(settings.forceDefaultSave);
    this.noteEl.textContent = forceDefault
      ? '"Always force save with defaults" is enabled in Settings (applies to Ctrl+S).'
      : '';
    this.noteEl.classList.toggle('hidden', !forceDefault);

    this.actionsEl.classList.toggle('hidden', !hasFile);
    if (hasFile) {
      this.saveBtn.disabled = viewOnly;
      this.saveBtn.title = viewOnly
        ? 'Saving is disabled in View-Only mode'
        : 'Save file using current Read & Write Settings';
    }
  }
}

defineEl('ui-validation-pane', ValidationPane);
defineEl('ui-macro-pane', MacroPane);
defineEl('ui-file-info-pane', FileInfoPane);

