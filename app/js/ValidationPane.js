/**
 * @file app/js/ValidationPane.js
 * Three-tier validation drawer (<ui-validation-pane>) and macro manager (<ui-macro-pane>)
 * built on a shared SideDrawerPane base class.
 */

import { getSheet, getCsvHandle, settings } from './state.js';
import { BaseElement, defineEl, setOpen, isOpen, escapeHtml, clamp } from './utils.js';
import './Glyph.js';
import { Notification } from './Notification.js';
import {
  DataValidator,
  VALIDATION_RULES,
  VALIDATION_RULE_MAP,
  DEFAULT_MACROS,
  NON_VISUAL_ONLY_RE,
} from '../core/DataValidator.js';

const ITEM_HEIGHT = 44;

export function getOrderedValidationRules() {
  const pinnedSet = new Set(Array.isArray(settings.pinnedValidations) ? settings.pinnedValidations : []);
  const orderedRules = [
    ...VALIDATION_RULES.filter(r => pinnedSet.has(r.id)),
    ...VALIDATION_RULES.filter(r => !pinnedSet.has(r.id)),
  ];
  return { orderedRules, pinnedSet };
}

export function renderRuleCardsHtml() {
  const { orderedRules, pinnedSet } = getOrderedValidationRules();
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

function isSheetLocked(sheet, contextTitle) {
  if (!sheet?.df) return true;
  if (sheet.df.lock || getCsvHandle()?.viewOnly) {
    Notification.warning(
      sheet.filterRows ? 'File is locked while a filter is active.' : 'File is in View-Only mode. Edits are disabled.',
      contextTitle
    );
    return true;
  }
  return false;
}

export function syncSheetAfterEdit(sheet = getSheet()) {
  if (!sheet?.df) return;
  const maxCol = Math.max(0, sheet.df.width - 1);
  const maxRow = Math.max(0, (sheet.filterRows ? sheet.filterRows.length : sheet.df.height) - 1);
  sheet.x = clamp(sheet.x, 0, maxCol);
  sheet.y = clamp(sheet.y, 0, maxRow);
  if (sheet.rangeEnd) {
    sheet.rangeEnd.x = clamp(sheet.rangeEnd.x, 0, maxCol);
    sheet.rangeEnd.y = clamp(sheet.rangeEnd.y, 0, maxRow);
  }
  sheet.refresh?.();
  sheet.refreshSelection?.(true);
  sheet.refreshScrollbars?.();
  sheet.updateFooter?.();
}

class SideDrawerPane extends BaseElement {
  constructor() {
    super();
    this._initialized = false;
  }

  connectedCallback() { this.init(); }

  get isOpen() { return isOpen(this); }

  bindHeaderEvents() {
    this.backBtn?.addEventListener('click', () => this.handleBack());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.addEventListener?.('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.handleBack();
      }
    });
  }

  updateHeader({ title, showBack = false, badgeCount = null, showBadge = false }) {
    this.backBtn?.classList.toggle('hidden', !showBack);
    if (this.titleEl && title !== undefined) this.titleEl.textContent = title;
    this.updateBadge(badgeCount, showBadge);
  }

  updateBadge(count, visible) {
    if (!this.countBadge) return;
    if (visible && count !== null && count !== undefined) {
      this.countBadge.textContent = count;
    }
    this.countBadge.classList.toggle('hidden', !visible);
  }

  handleEscape() {
    if (!this.isOpen) return false;
    this.handleBack();
    return true;
  }

  show(peerPane) {
    this.init();
    peerPane?.close?.();
    setOpen(this, true);
    getSheet()?.refreshScrollbars?.();
  }

  close() {
    this.init();
    const wasOpen = this.isOpen;
    setOpen(this, false);
    if (wasOpen) getSheet()?.refreshScrollbars?.();
  }
}

export class ValidationPane extends SideDrawerPane {
  static getInstance() {
    return globalThis.document?.getElementById?.('validation-pane') || globalThis.document?.querySelector?.('ui-validation-pane') || null;
  }

  static toggle() {
    ValidationPane.getInstance()?.toggle?.();
  }

  static run(ruleId) {
    const pane = ValidationPane.getInstance();
    if (pane) {
      pane.show?.();
      pane.runRule?.(ruleId);
    }
  }

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

    this.setAttribute?.('role', 'region');
    this.setAttribute?.('aria-label', 'Validation Results');

    this.innerHTML = `
      <div class="validation-pane-header">
        <div class="validation-header-left">
          <ui-glyph icon="arrow_left" class="validation-btn back-btn" id="validation-back-btn" title="Back"></ui-glyph>
          <span class="validation-pane-title truncate" id="validation-title">Data Validation</span>
          <span class="validation-badge hidden" id="validation-count-badge">0</span>
        </div>
        <div class="btn-group">
          <ui-glyph icon="done_all" variant="accept" class="validation-btn" id="validation-accept-all-btn" title="Accept all proposed edits"></ui-glyph>
          <ui-glyph icon="off" variant="close" class="validation-btn" id="validation-close-btn" title="Close validation pane"></ui-glyph>
        </div>
      </div>
      <div class="validation-pane-content scroll" id="validation-content">
        <div class="validation-rules-view" id="validation-rules-view"></div>
        <div class="validation-columns-view hidden" id="validation-columns-view"></div>
        <div class="validation-detail-view hidden" id="validation-detail-view">
          <div class="validation-virtual-spacer" id="validation-virtual-spacer">
            <div class="validation-virtual-content" id="validation-virtual-content"></div>
          </div>
        </div>
      </div>
    `;

    this.contentContainer = this.querySelector?.('#validation-content');
    this.titleEl = this.querySelector?.('#validation-title');
    this.countBadge = this.querySelector?.('#validation-count-badge');
    this.backBtn = this.querySelector?.('#validation-back-btn');
    this.acceptAllBtn = this.querySelector?.('#validation-accept-all-btn');
    this.closeBtn = this.querySelector?.('#validation-close-btn');
    this.rulesView = this.querySelector?.('#validation-rules-view');
    this.columnsView = this.querySelector?.('#validation-columns-view');
    this.detailView = this.querySelector?.('#validation-detail-view');
    this.virtualSpacer = this.querySelector?.('#validation-virtual-spacer');
    this.virtualContent = this.querySelector?.('#validation-virtual-content');

    this.bindHeaderEvents();
    this.acceptAllBtn?.addEventListener('click', () => this.resolveScope(true));
    this.contentContainer?.addEventListener('scroll', () => {
      if (this.view === 'detail') this.renderVirtualWindow();
    }, { passive: true });

    this.rulesView?.addEventListener('click', (e) => {
      const ruleId = e.target.closest('.validation-rule-card')?.dataset.ruleId;
      if (ruleId) this.runRule(ruleId);
    });

    this.columnsView?.addEventListener('click', (e) => {
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

    this.virtualContent?.addEventListener('click', (e) => {
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
        sheet?.selectRange?.(0, item.dupOfY, Math.max(0, (sheet.df?.width || 1) - 1), item.dupOfY, true);
        return;
      }

      this.handleItemClick(item, card);
    });

    this.showRules();
  }

  getColHeader(colIndex) {
    return getSheet()?.df?.get(colIndex, 0) || `col_${colIndex + 1}`;
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

  show() {
    super.show(MacroPane.getInstance());
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
    if (!sheet?.df) {
      this.reset();
      return;
    }
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
    if (!sheet?.df) return;
    if (isSheetLocked(sheet, 'Validation')) return;

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

  setView(mode, title, count = 0, scopeLabel = '') {
    this.view = mode;
    const isRoot = mode === 'rules';
    const showBulk = !isRoot && count > 0;
    this.updateHeader({ title, showBack: !isRoot, badgeCount: count, showBadge: showBulk });
    if (this.acceptAllBtn) {
      this.acceptAllBtn.classList.toggle('hidden', !showBulk);
      if (scopeLabel) this.acceptAllBtn.label = `Accept all ${scopeLabel}`;
    }
    this.rulesView?.classList.toggle('hidden', mode !== 'rules');
    this.columnsView?.classList.toggle('hidden', mode !== 'columns');
    this.detailView?.classList.toggle('hidden', mode !== 'detail');
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
    if (!this.rulesView) return;
    this.rulesView.innerHTML = renderRuleCardsHtml();
  }

  showColumns() {
    this.init();
    this.currentCol = this.selectedItem = null;
    const pending = this.getPendingItems();
    this.setView('columns', this.currentRule ? this.currentRule.label : 'Columns', pending.length, 'across all columns');
    this.renderColumns();
  }

  renderColumns() {
    if (!this.columnsView) return;
    const groups = this.getColumnGroups();
    let totalPending = 0;
    for (const g of groups) totalPending += g.items.length;
    const hasPending = totalPending > 0;
    this.updateBadge(totalPending, hasPending);
    this.acceptAllBtn?.classList.toggle('hidden', !hasPending);

    if (groups.length === 0) {
      this.columnsView.innerHTML = `<div class="validation-empty">${escapeHtml(this.emptyMessage || 'No transformations left.')}</div>`;
      return;
    }

    this.columnsView.innerHTML = groups.map(g => this._colCardHtml(g.x, g.header, g.items.length)).join('');
  }

  showDetail(colIndex = null) {
    this.init();
    this.currentCol = colIndex;
    const inCol = this.getPendingItems(colIndex);
    const title = colIndex === null
      ? (this.currentRule ? this.currentRule.label : 'Validation')
      : `Col ${colIndex + 1}: ${this.getColHeader(colIndex)}`;
    const scopeLabel = colIndex === null
      ? (this.currentRule?.id === 'duplicate_rows' ? 'duplicate rows' : 'corrections across sheet')
      : `corrections in Col ${colIndex + 1}`;
    this.setView('detail', title, inCol.length, scopeLabel);
    this.renderDetail();
  }

  renderDetail() {
    if (!this.detailView) return;
    this.colItems = this.getPendingItems(this.currentCol);
    const hasPending = this.colItems.length > 0;
    this.updateBadge(this.colItems.length, hasPending);
    this.acceptAllBtn?.classList.toggle('hidden', !hasPending);

    if (!hasPending) {
      if (this.virtualSpacer) this.virtualSpacer.style.height = 'auto';
      if (this.virtualContent) {
        this.virtualContent.style.transform = 'translateY(0px)';
        this.virtualContent.innerHTML = `<div class="validation-empty">${escapeHtml(this.emptyMessage || 'No transformations left.')}</div>`;
      }
      return;
    }

    if (this.virtualSpacer) this.virtualSpacer.style.height = `${this.colItems.length * ITEM_HEIGHT}px`;
    this._lastRenderStart = this._lastRenderEnd = -1;
    this.renderVirtualWindow();
  }

  resolveItems(itemsList, accept) {
    if (!itemsList?.length) return;
    if (accept) {
      const sheet = getSheet();
      if (sheet?.df) {
        if (isSheetLocked(sheet, 'Validation')) return;
        DataValidator.applyProposals(sheet.df, this.currentRule?.id || '', itemsList, this.items, this._currencyColMap);
        syncSheetAfterEdit(sheet);
      }
      for (const item of itemsList) item.status = 'accepted';
    } else {
      for (const item of itemsList) item.status = 'rejected';
    }

    if (this.view === 'detail') this.renderDetail();
    else if (this.view === 'columns') this.renderColumns();
  }

  renderVirtualWindow() {
    if (!this.virtualContent) return;
    const total = this.colItems.length;
    if (total === 0) {
      this.virtualContent.innerHTML = '';
      this.virtualContent.style.transform = 'translateY(0px)';
      return;
    }

    const scrollTop = this.contentContainer ? this.contentContainer.scrollTop : 0;
    const containerHeight = this.contentContainer?.clientHeight || 600;
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
    if (this.virtualContent) {
      for (const card of this.virtualContent.querySelectorAll('.validation-item')) {
        card.classList.toggle('selected', card === cardEl);
      }
    }
    const sheet = getSheet();
    if (item.isRowDeletion) {
      sheet?.selectRange?.(0, item.y, Math.max(0, (sheet.df?.width || 1) - 1), item.y, true);
    } else {
      sheet?.focusCell?.(item.x, item.y);
    }
  }

  formatValue(value) {
    if (!value) return '<em>empty</em>';
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
  static getInstance() {
    return globalThis.document?.getElementById?.('macro-pane') || globalThis.document?.querySelector?.('ui-macro-pane') || null;
  }

  static toggle() {
    MacroPane.getInstance()?.toggle?.();
  }

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

    this.setAttribute?.('role', 'region');
    this.setAttribute?.('aria-label', 'Validation Macros');

    this.innerHTML = `
      <div class="validation-pane-header">
        <div class="validation-header-left">
          <ui-glyph icon="arrow_left" class="validation-btn back-btn hidden" id="macro-back-btn" title="Back"></ui-glyph>
          <span class="validation-pane-title truncate" id="macro-title">Macros</span>
          <span class="validation-badge hidden" id="macro-count-badge">0</span>
        </div>
        <div class="btn-group">
          <ui-glyph icon="add" class="validation-btn" id="macro-add-btn" title="New macro"></ui-glyph>
          <ui-glyph icon="macro" class="validation-btn hidden" id="macro-header-run-btn" title="Run macro"></ui-glyph>
          <ui-glyph icon="bin" variant="reject" class="validation-btn hidden" id="macro-header-del-btn" title="Delete macro"></ui-glyph>
          <ui-glyph icon="off" variant="close" class="validation-btn" id="macro-close-btn" title="Close macros pane"></ui-glyph>
        </div>
      </div>
      <div class="validation-pane-content scroll" id="macro-content">
        <div class="validation-rules-view" id="macro-list-view"></div>
        <div class="macro-edit-view hidden" id="macro-edit-view">
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
            <button type="button" class="macro-add-step-btn" id="macro-add-step-btn">
              <ui-glyph icon="add" variant="static" size="xs"></ui-glyph>
              <span>Add Step</span>
            </button>
          </div>
          <div class="validation-columns-view macro-steps-list" id="macro-steps-list"></div>
        </div>
        <div class="validation-rules-view hidden" id="macro-pick-view"></div>
      </div>
    `;

    this.backBtn = this.querySelector?.('#macro-back-btn');
    this.titleEl = this.querySelector?.('#macro-title');
    this.countBadge = this.querySelector?.('#macro-count-badge');
    this.addBtn = this.querySelector?.('#macro-add-btn');
    this.headerRunBtn = this.querySelector?.('#macro-header-run-btn');
    this.headerDelBtn = this.querySelector?.('#macro-header-del-btn');
    this.closeBtn = this.querySelector?.('#macro-close-btn');
    this.listView = this.querySelector?.('#macro-list-view');
    this.editView = this.querySelector?.('#macro-edit-view');
    this.pickView = this.querySelector?.('#macro-pick-view');
    this.titleInput = this.querySelector?.('#macro-title-input');
    this.descInput = this.querySelector?.('#macro-desc-input');
    this.addStepBtn = this.querySelector?.('#macro-add-step-btn');
    this.stepsList = this.querySelector?.('#macro-steps-list');

    this.bindHeaderEvents();
    this.addBtn?.addEventListener('click', () => this.createMacro());
    this.headerRunBtn?.addEventListener('click', () => {
      if (this.editingIdx !== null) this.runMacro(this.editingIdx);
    });
    this.headerDelBtn?.addEventListener('click', () => {
      if (this.editingIdx !== null) this.deleteMacro(this.editingIdx);
    });
    this.addStepBtn?.addEventListener('click', () => this.showPick());

    const syncMetaInputs = () => {
      if (this.editingIdx === null) return;
      const macros = [...this.getMacros()];
      const current = macros[this.editingIdx];
      if (!current) return;
      macros[this.editingIdx] = {
        ...current,
        title: this.titleInput?.value ?? current.title,
        description: this.descInput?.value ?? current.description,
      };
      this.saveMacros(macros);
    };

    this.titleInput?.addEventListener('input', syncMetaInputs);
    this.descInput?.addEventListener('input', syncMetaInputs);

    this.listView?.addEventListener('click', (e) => {
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

    this.stepsList?.addEventListener('click', (e) => {
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
      if (!this.stepsList) return;
      for (const el of this.stepsList.querySelectorAll('.macro-step-card')) {
        el.classList.remove('dragging', 'drag-over', 'drag-over-above');
      }
    };

    const computeDropTarget = (card, clientY) => {
      if (!card || this._dragIdx === null || Number.isNaN(this._dragIdx)) return null;
      const hoveredIdx = parseInt(card.dataset.stepIdx, 10);
      if (Number.isNaN(hoveredIdx) || hoveredIdx === this._dragIdx) return null;
      const rect = card.getBoundingClientRect?.();
      const isTopEdge = hoveredIdx === 0 && this._dragIdx > 0 && (
        this._dragIdx === 1 || Boolean(rect && clientY < rect.top + rect.height / 2)
      );
      const toIdx = isTopEdge ? 0 : (this._dragIdx < hoveredIdx ? hoveredIdx : hoveredIdx + 1);
      if (toIdx === this._dragIdx) return null;
      return { card, toIdx, isTopEdge };
    };

    this.stepsList?.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.macro-step-card');
      if (!card) return;
      this._dragIdx = parseInt(card.dataset.stepIdx, 10);
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(this._dragIdx)); } catch {}
      }
    });

    this.stepsList?.addEventListener('dragover', (e) => {
      const card = e.target.closest('.macro-step-card');
      if (!card || this._dragIdx === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const target = computeDropTarget(card, e.clientY);

      for (const el of this.stepsList.querySelectorAll('.macro-step-card')) {
        const isTarget = Boolean(target && el === target.card);
        el.classList.toggle('drag-over', isTarget && !target.isTopEdge);
        el.classList.toggle('drag-over-above', isTarget && target.isTopEdge);
      }
    });

    this.stepsList?.addEventListener('dragleave', (e) => {
      if (!this.stepsList.contains(e.relatedTarget)) {
        for (const el of this.stepsList.querySelectorAll('.macro-step-card')) {
          el.classList.remove('drag-over', 'drag-over-above');
        }
      }
    });

    this.stepsList?.addEventListener('drop', (e) => {
      e.preventDefault();
      const card = e.target.closest('.macro-step-card');
      const fromIdx = this._dragIdx;
      const isAboveClass = Boolean(card?.classList.contains('drag-over-above'));
      const target = computeDropTarget(card, e.clientY);
      this._dragIdx = null;
      clearDragClasses();
      if (!card || fromIdx === null || Number.isNaN(fromIdx)) return;
      const toIdx = isAboveClass ? 0 : target?.toIdx;
      if (toIdx !== undefined && fromIdx !== toIdx) {
        this.moveStep(fromIdx, toIdx);
      }
    });

    this.stepsList?.addEventListener('dragend', () => {
      this._dragIdx = null;
      clearDragClasses();
    });

    this.pickView?.addEventListener('click', (e) => {
      const ruleId = e.target.closest('.validation-rule-card')?.dataset.ruleId;
      if (ruleId) this.addStep(ruleId);
    });

    this.showList();
  }

  show() {
    super.show(ValidationPane.getInstance());
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
    this.addBtn?.classList.toggle('hidden', !isList);
    this.headerRunBtn?.classList.toggle('hidden', !isEdit);
    this.headerDelBtn?.classList.toggle('hidden', !isEdit);
    this.listView?.classList.toggle('hidden', !isList);
    this.editView?.classList.toggle('hidden', !isEdit);
    this.pickView?.classList.toggle('hidden', mode !== 'pick');
  }

  showList() {
    this.init();
    this.editingIdx = null;
    this.setView('list', 'Macros');
    if (!this.listView) return;

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
      this.titleInput?.focus?.();
      this.titleInput?.select?.();
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
    if (this.titleInput) this.titleInput.value = macro.title || '';
    if (this.descInput) this.descInput.value = macro.description || '';
    this.renderEditSteps();
  }

  renderEditSteps() {
    if (!this.stepsList || this.editingIdx === null) return;
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
    if (this.pickView) {
      this.pickView.innerHTML = renderRuleCardsHtml();
    }
  }

  addStep(ruleId) {
    if (this.editingIdx === null) return;
    const macros = [...this.getMacros()];
    const current = macros[this.editingIdx];
    if (!current) return;
    const steps = Array.isArray(current.steps) ? [...current.steps, ruleId] : [ruleId];
    macros[this.editingIdx] = { ...current, steps };
    this.saveMacros(macros);
    this.showEdit(this.editingIdx);
  }

  removeStep(stepIdx) {
    if (this.editingIdx === null) return;
    const macros = [...this.getMacros()];
    const current = macros[this.editingIdx];
    if (!current || !Array.isArray(current.steps)) return;
    const steps = [...current.steps];
    if (stepIdx < 0 || stepIdx >= steps.length) return;
    steps.splice(stepIdx, 1);
    macros[this.editingIdx] = { ...current, steps };
    this.saveMacros(macros);
    this.renderEditSteps();
  }

  moveStep(fromIdx, toIdx) {
    if (this.editingIdx === null) return;
    const macros = [...this.getMacros()];
    const current = macros[this.editingIdx];
    if (!current || !Array.isArray(current.steps)) return;
    const steps = [...current.steps];
    if (fromIdx < 0 || fromIdx >= steps.length || toIdx < 0 || toIdx >= steps.length || fromIdx === toIdx) return;
    const [moved] = steps.splice(fromIdx, 1);
    steps.splice(toIdx, 0, moved);
    macros[this.editingIdx] = { ...current, steps };
    this.saveMacros(macros);
    this.renderEditSteps();
  }

  runMacro(idx) {
    const sheet = getSheet();
    if (!sheet?.df) return;
    if (isSheetLocked(sheet, 'Macros')) return;

    const macros = this.getMacros();
    const macro = macros[idx];
    if (!macro) return;
    const steps = Array.isArray(macro.steps) ? macro.steps : [];
    if (steps.length === 0) {
      return Notification.info(`Macro "${macro.title || 'Untitled'}" has no validation steps.`, 'Macros');
    }

    const { totalChanges } = DataValidator.executeMacro(sheet.df, steps);
    syncSheetAfterEdit(sheet);
    ValidationPane.getInstance()?.reset?.();

    const title = macro.title || 'Macro';
    if (totalChanges > 0) {
      Notification.quick(`${title}: applied ${totalChanges} change${totalChanges === 1 ? '' : 's'}`);
    } else {
      Notification.quick(`${title}: no changes needed`);
    }
    return totalChanges;
  }
}

defineEl('ui-validation-pane', ValidationPane);
defineEl('ui-macro-pane', MacroPane);

