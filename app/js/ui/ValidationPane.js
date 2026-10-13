import { getSheet } from '../appContext.js';
import { setIcon } from '../utils/icons.js';
import { Notification } from './Notification.js';
import { HeaderValidator } from '../../../core/validation/HeaderValidator.js';
import { DateValidator } from '../../../core/validation/DateValidator.js';
import { DataValidator } from '../../../core/validation/DataValidator.js';

/**
 * Metadata and catalog of discrete validation rules.
 */
export const VALIDATION_RULES = [
  {
    id: 'headers',
    label: 'Headers & SQL Compliance',
    description: 'Sanitize column headers for SQL identifier standards and duplicates',
    icon: 'validate_headers',
  },
  {
    id: 'dates',
    label: 'Date Formats (YYYY-MM-DD)',
    description: 'Standardize date formats across columns to YYYY-mm-dd',
    icon: 'date_checker',
  },
  {
    id: 'trim_whitespace',
    label: 'Trim Whitespace',
    description: 'Remove leading and trailing whitespace from cell text',
    icon: 'trim',
  },
  {
    id: 'comma_decimals',
    label: 'Decimal Comma -> Dot',
    description: 'Convert comma decimals (3,14) to dot notation in numeric fields',
    icon: 'decimal',
  },
  {
    id: 'line_returns',
    label: 'Line Returns -> Pipe',
    description: 'Replace embedded newline line breaks with pipe character (|)',
    icon: 'replace',
  },
  {
    id: 'double_quotes',
    label: 'Double Quotes -> Single',
    description: 'Replace double quotation marks (") with single quotes (\')',
    icon: 'replace',
  },
  {
    id: 'text_commas',
    label: 'Text Commas -> Dash',
    description: 'Replace commas inside text cells with hyphens (-)',
    icon: 'replace',
  },
  {
    id: 'lowercase',
    label: 'Force Lowercase',
    description: 'Convert all text cells to lowercase',
    icon: 'match_case',
  },
];

/**
 * Custom Element `<ui-validation-pane>` for 3-tier validation:
 * - Tier 1: Rule Selector (overview of validation types)
 * - Tier 2: Column Overview (columns impacted by active rule)
 * - Tier 3: Column Detail (individual cell diffs and mutations)
 */
class ValidationPane extends HTMLElement {
  constructor() {
    super();
    this.sheet = null;
    this.items = [];
    this.itemsMap = new Map();
    this.currentRule = null;
    this.currentCol = null;
    this.view = 'rules'; // 'rules' | 'columns' | 'detail'
    this.selectedId = null;
    this.flatItems = [];
    this.totalHeight = 0;
    this.ITEM_HEIGHT = 44;
    this._initialized = false;
    this._onScrollBound = this.onScroll.bind(this);
    this._lastTxTimestamp = 0;
  }

  connectedCallback() {
    this.init();
  }

  get isOpen() {
    return this.classList.contains('open') && this.style.display !== 'none';
  }

  init() {
    if (!this.ITEM_HEIGHT) this.ITEM_HEIGHT = 44;
    if (this._lastTxTimestamp === undefined) this._lastTxTimestamp = 0;
    if (!this.flatItems) this.flatItems = [];
    if (!this.items) this.items = [];
    if (this._initialized) return;
    this._initialized = true;

    this.classList.add('ui-validation-pane');
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Validation Results');

    this.innerHTML = `
      <div class="validation-pane-header">
        <div class="validation-header-left">
          <button class="icon validation-btn back-btn" id="validation-back-btn" type="button" title="Back" aria-label="Back" data-icon="arrow_left"></button>
          <span class="validation-pane-title" id="validation-title">Data Validation</span>
          <span class="validation-badge" id="validation-count-badge">0</span>
        </div>
        <div class="validation-pane-action-bar">
          <button class="icon validation-btn accept-all-btn" id="validation-accept-all-btn" type="button" title="Accept all proposed edits" aria-label="Accept all proposed edits" data-icon="done_all"></button>
          <button class="icon validation-btn reject-all-btn" id="validation-reject-all-btn" type="button" title="Reject all proposed edits" aria-label="Reject all proposed edits" data-icon="exit"></button>
          <button class="icon validation-btn close-btn" id="validation-close-btn" type="button" title="Close validation pane" aria-label="Close validation pane" data-icon="off"></button>
        </div>
      </div>
      <div class="validation-pane-content scroll" id="validation-content">
        <div class="validation-rules-view" id="validation-rules-view"></div>
        <div class="validation-columns-view" id="validation-columns-view"></div>
        <div class="validation-detail-view" id="validation-detail-view">
          <div class="validation-virtual-spacer" id="validation-virtual-spacer">
            <div class="validation-virtual-content" id="validation-virtual-content"></div>
          </div>
          <div class="validation-empty-state" id="validation-empty-state">No validation issues found.</div>
        </div>
      </div>
    `;

    this.contentContainer = this.querySelector('#validation-content');
    this.titleEl = this.querySelector('#validation-title');
    this.countBadge = this.querySelector('#validation-count-badge');
    this.backBtn = this.querySelector('#validation-back-btn');
    this.acceptAllBtn = this.querySelector('#validation-accept-all-btn');
    this.rejectAllBtn = this.querySelector('#validation-reject-all-btn');
    this.closeBtn = this.querySelector('#validation-close-btn');

    this.rulesView = this.querySelector('#validation-rules-view');
    this.columnsView = this.querySelector('#validation-columns-view');
    this.detailView = this.querySelector('#validation-detail-view');
    this.virtualSpacer = this.querySelector('#validation-virtual-spacer');
    this.virtualContent = this.querySelector('#validation-virtual-content');
    this.emptyState = this.querySelector('#validation-empty-state');

    this.applyIcons(this);

    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.handleBack());
    }
    if (this.acceptAllBtn) {
      this.acceptAllBtn.addEventListener('click', () => this.handleAcceptAll());
    }
    if (this.rejectAllBtn) {
      this.rejectAllBtn.addEventListener('click', () => this.handleRejectAll());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.contentContainer) {
      this.contentContainer.addEventListener('scroll', this._onScrollBound, { passive: true });
    }

    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.handleEscape();
      }
    });

    // Rules view delegation
    if (this.rulesView) {
      this.rulesView.addEventListener('click', (e) => {
        const card = e.target.closest('.validation-rule-card');
        if (card) {
          const ruleId = card.getAttribute('data-rule-id');
          if (ruleId) this.runRule(ruleId);
        }
      });
    }

    // Columns view delegation
    if (this.columnsView) {
      this.columnsView.addEventListener('click', (e) => {
        const btn = e.target.closest('.validation-btn');
        if (btn) {
          e.stopPropagation();
          const colStr = btn.getAttribute('data-col');
          const col = colStr !== null ? parseInt(colStr, 10) : null;
          if (col !== null) {
            if (btn.classList.contains('col-accept-btn')) this.acceptColumn(col);
            else if (btn.classList.contains('col-reject-btn')) this.rejectColumn(col);
            else if (btn.classList.contains('col-inspect-btn')) this.showDetail(col);
          }
          return;
        }
        const card = e.target.closest('.validation-col-card');
        if (card) {
          const colStr = card.getAttribute('data-col');
          if (colStr !== null) this.showDetail(parseInt(colStr, 10));
        }
      });
    }

    // Virtual detail view delegation
    if (this.virtualContent) {
      this.virtualContent.addEventListener('click', (e) => {
        const btn = e.target.closest('.validation-btn');
        if (btn) {
          e.stopPropagation();
          const card = btn.closest('.validation-item');
          if (card) {
            const cardId = card.getAttribute('data-id');
            const item = (this.itemsMap ? this.itemsMap.get(cardId) : null) || (this.items || []).find(i => i.id === cardId);
            if (item) {
              if (btn.classList.contains('item-accept-btn')) this.acceptItem(item);
              else if (btn.classList.contains('item-reject-btn')) this.rejectItem(item);
            }
          }
          return;
        }

        const card = e.target.closest('.validation-item');
        if (card) {
          const cardId = card.getAttribute('data-id');
          const item = (this.itemsMap ? this.itemsMap.get(cardId) : null) || (this.items || []).find(i => i.id === cardId);
          if (item) this.handleItemClick(item);
        }
      });
    }

    this.showRules();
  }

  /**
   * Applies icon masks using setIcon helper.
   * @param {Element} container 
   */
  applyIcons(container = this) {
    if (!container) return;
    const elements = container.querySelectorAll('[data-icon]');
    for (const el of elements) {
      const name = el.getAttribute('data-icon');
      if (name) setIcon(el, name);
    }
  }

  /**
   * Binds target Sheet instance to validation pane.
   * @param {import('../sheet/Sheet.js').Sheet} sheet
   */
  bindSheet(sheet) {
    this.sheet = sheet;
  }

  /**
   * Gets active sheet instance from bound property or appContext.
   */
  getSheet() {
    return this.sheet || getSheet();
  }

  /**
   * Loads proposed validation edit items into pane.
   * @param {Array<Object>} items
   */
  loadItems(items = []) {
    this.init();
    this.items = items;
    this.itemsMap = new Map();
    const s = this.getSheet();
    for (const item of this.items) {
      if (!item.status) item.status = 'pending';
      if (!item.header) {
        item.header = (s?.df ? s.df.get(item.x, 0) : null) || `col_${item.x + 1}`;
      }
      if (item.id) this.itemsMap.set(item.id, item);
    }
  }

  /**
   * Retrieves array of currently pending validation items.
   * @returns {Array<Object>}
   */
  getPendingItems() {
    return (this.items || []).filter(item => item.status === 'pending' || !item.status);
  }

  /**
   * Retrieves pending items belonging to a specific column index.
   * @param {number} colIndex 
   * @returns {Array<Object>}
   */
  getColumnPendingItems(colIndex) {
    return (this.items || []).filter(item => item.x === colIndex && (item.status === 'pending' || !item.status));
  }

  /**
   * Computes column groups sorted by column index for columns with pending issues.
   * @returns {Array<{ x: number, header: string, items: Array<Object> }>}
   */
  getColumnGroups() {
    const pending = this.getPendingItems();
    const groupsMap = new Map();
    const s = this.getSheet();

    for (const item of pending) {
      if (!groupsMap.has(item.x)) {
        const headerTitle = item.header || (s?.df ? s.df.get(item.x, 0) : null) || `col_${item.x + 1}`;
        groupsMap.set(item.x, {
          x: item.x,
          header: headerTitle,
          items: []
        });
      }
      groupsMap.get(item.x).items.push(item);
    }

    return Array.from(groupsMap.values()).sort((a, b) => a.x - b.x);
  }

  /**
   * Shows validation pane with slide-in transition.
   */
  show() {
    this.init();
    this.classList.add('open');
    this.setAttribute('open', '');
    this.removeAttribute('hidden');
    this.style.display = 'flex';
  }

  /**
   * Opens validation pane directly to the rule selector.
   */
  openRules() {
    this.show();
    this.showRules();
  }

  /**
   * Toggles visibility of validation pane.
   */
  toggle() {
    if (this.isOpen) {
      if (this.view === 'rules') {
        this.close();
      } else {
        this.showRules();
      }
    } else {
      this.openRules();
    }
  }

  /**
   * Closes validation pane.
   */
  close() {
    this.init();
    this.classList.remove('open');
    this.removeAttribute('open');
    this.setAttribute('hidden', '');
    this.style.display = 'none';
  }

  /**
   * Runs validation for a specific rule ID.
   * @param {string} ruleId 
   */
  runRule(ruleId) {
    this.init();
    const s = this.getSheet();
    if (!s || !s.df) return;

    if (s.df.lock) {
      Notification.warning("File is in View-Only mode. Edits are disabled.", "Validation");
      return;
    }

    const rule = VALIDATION_RULES.find(r => r.id === ruleId);
    if (!rule) return;

    let items = [];
    if (ruleId === 'headers') {
      items = HeaderValidator.validate(s.df);
    } else if (ruleId === 'dates') {
      const res = DateValidator.validate(s.df);
      items = res.proposals || [];
      if (res.reason === 'coexistence') {
        Notification.warning("Both 'dd-mm-YYYY' and 'mm-dd-YYYY' formats coexist in the file.", "Date Validation");
      } else if (res.reason === 'ambiguous') {
        Notification.warning("Cannot determine date format with certainty: no date has a digit over 12.", "Date Validation");
      }
    } else if (ruleId === 'trim_whitespace') {
      items = DataValidator.validate(s.df, { trimWhitespace: true });
    } else if (ruleId === 'comma_decimals') {
      items = DataValidator.validate(s.df, { coerceCommaDecimals: true });
    } else if (ruleId === 'line_returns') {
      items = DataValidator.validate(s.df, { replaceNewlineWithPipe: true });
    } else if (ruleId === 'double_quotes') {
      items = DataValidator.validate(s.df, { replaceDoubleQuotes: true });
    } else if (ruleId === 'text_commas') {
      items = DataValidator.validate(s.df, { replaceCommaWithHyphen: true });
    } else if (ruleId === 'lowercase') {
      items = DataValidator.validate(s.df, { toLowerCase: true });
    }

    if (!items || items.length === 0) {
      Notification.success(`No issues found for ${rule.label}.`, "Validation");
      if (this.view !== 'rules') {
        this.showRules();
      }
      return;
    }

    this.currentRule = rule;
    this.loadItems(items);
    this.show();
    this.showColumns();
  }

  /**
   * Handles Escape key: goes back when in selection (detail -> columns -> rules), or closes at root.
   */
  handleEscape() {
    this.handleBack();
  }

  /**
   * Navigates back one tier in the validation hierarchy.
   */
  handleBack() {
    if (this.view === 'detail') {
      this.showColumns();
    } else if (this.view === 'columns') {
      this.showRules();
    } else {
      this.close();
    }
  }

  /**
   * Accepts all pending edits in current context.
   */
  handleAcceptAll() {
    if (this.view === 'columns') {
      const pending = this.getPendingItems();
      if (pending.length === 0) return;
      this.applyBatchEdit(pending);
      Notification.success("All corrections applied.", "Validation");
      this.showRules();
    } else if (this.view === 'detail' && this.currentCol !== null) {
      this.acceptColumn(this.currentCol);
    }
  }

  /**
   * Rejects all pending edits in current context.
   */
  handleRejectAll() {
    if (this.view === 'columns') {
      this.rejectAll();
      this.showRules();
    } else if (this.view === 'detail' && this.currentCol !== null) {
      this.rejectColumn(this.currentCol);
    }
  }

  /**
   * Tier 1: Displays validation rule selector.
   */
  showRules() {
    this.init();
    this.view = 'rules';
    this.currentRule = null;
    this.currentCol = null;
    this.selectedId = null;

    if (this.backBtn) this.backBtn.style.display = 'none';
    if (this.titleEl) this.titleEl.textContent = 'Validation';
    if (this.countBadge) this.countBadge.style.display = 'none';
    if (this.acceptAllBtn) this.acceptAllBtn.style.display = 'none';
    if (this.rejectAllBtn) this.rejectAllBtn.style.display = 'none';
    if (this.closeBtn) this.closeBtn.style.display = 'inline-flex';

    if (this.rulesView) {
      this.rulesView.style.display = 'flex';
      this.renderRules();
    }
    if (this.columnsView) this.columnsView.style.display = 'none';
    if (this.detailView) this.detailView.style.display = 'none';
  }

  renderRules() {
    if (!this.rulesView) return;
    let html = '';
    for (const rule of VALIDATION_RULES) {
      html += `
        <div class="validation-rule-card" data-rule-id="${rule.id}">
          <button class="icon validation-rule-icon" type="button" tabindex="-1" aria-hidden="true" data-icon="${rule.icon}"></button>
          <div class="validation-rule-body">
            <div class="validation-rule-title">${this.escapeHtml(rule.label)}</div>
            <div class="validation-rule-desc">${this.escapeHtml(rule.description)}</div>
          </div>
          <button class="icon validation-rule-nav" type="button" tabindex="-1" aria-hidden="true" data-icon="arrow_right"></button>
        </div>
      `;
    }
    this.rulesView.innerHTML = html;
    this.applyIcons(this.rulesView);
  }

  /**
   * Tier 2: Displays column overview for the active rule.
   */
  showColumns() {
    this.init();
    this.view = 'columns';
    this.currentCol = null;
    this.selectedId = null;

    const pending = this.getPendingItems();
    if (pending.length === 0) {
      this.showRules();
      return;
    }

    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    if (this.titleEl) this.titleEl.textContent = this.currentRule ? this.currentRule.label : 'Columns';
    if (this.countBadge) {
      this.countBadge.textContent = pending.length;
      this.countBadge.style.display = 'inline-block';
    }
    if (this.acceptAllBtn) {
      this.acceptAllBtn.style.display = 'inline-flex';
      this.acceptAllBtn.setAttribute('title', 'Accept all corrections across all columns');
      this.acceptAllBtn.setAttribute('aria-label', 'Accept all corrections across all columns');
    }
    if (this.rejectAllBtn) {
      this.rejectAllBtn.style.display = 'inline-flex';
      this.rejectAllBtn.setAttribute('title', 'Reject all corrections across all columns');
      this.rejectAllBtn.setAttribute('aria-label', 'Reject all corrections across all columns');
    }
    if (this.closeBtn) this.closeBtn.style.display = 'inline-flex';

    if (this.rulesView) this.rulesView.style.display = 'none';
    if (this.columnsView) {
      this.columnsView.style.display = 'flex';
      this.renderColumns();
    }
    if (this.detailView) this.detailView.style.display = 'none';
  }

  renderColumns() {
    if (!this.columnsView) return;
    const groups = this.getColumnGroups();
    if (groups.length === 0) {
      this.showRules();
      return;
    }

    if (this.countBadge) {
      this.countBadge.textContent = this.getPendingItems().length;
    }

    let html = '';
    for (const group of groups) {
      html += `
        <div class="validation-col-card" data-col="${group.x}">
          <div class="validation-col-info">
            <span class="validation-col-label">Col ${group.x + 1}: ${this.escapeHtml(group.header)}</span>
            <span class="validation-col-count">${group.items.length}</span>
          </div>
          <div class="validation-col-actions">
            <button class="icon validation-btn col-accept-btn" type="button" title="Accept column ${group.x + 1}" aria-label="Accept column ${group.x + 1}" data-icon="on" data-col="${group.x}"></button>
            <button class="icon validation-btn col-reject-btn" type="button" title="Reject column ${group.x + 1}" aria-label="Reject column ${group.x + 1}" data-icon="off" data-col="${group.x}"></button>
            <button class="icon validation-btn col-inspect-btn" type="button" title="Inspect individual corrections" aria-label="Inspect individual corrections" data-icon="arrow_right" data-col="${group.x}"></button>
          </div>
        </div>
      `;
    }
    this.columnsView.innerHTML = html;
    this.applyIcons(this.columnsView);
  }

  /**
   * Tier 3: Displays individual cell corrections for a specific column.
   * @param {number} colIndex 
   */
  showDetail(colIndex) {
    this.init();
    this.view = 'detail';
    this.currentCol = colIndex;

    const inCol = this.getColumnPendingItems(colIndex);
    if (inCol.length === 0) {
      this.showColumns();
      return;
    }

    const headerTitle = inCol[0]?.header || (this.getSheet()?.df ? this.getSheet().df.get(colIndex, 0) : null) || `col_${colIndex + 1}`;

    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    if (this.titleEl) this.titleEl.textContent = `Col ${colIndex + 1}: ${headerTitle}`;
    if (this.countBadge) {
      this.countBadge.textContent = inCol.length;
      this.countBadge.style.display = 'inline-block';
    }
    if (this.acceptAllBtn) {
      this.acceptAllBtn.style.display = 'inline-flex';
      this.acceptAllBtn.setAttribute('title', `Accept all corrections in Col ${colIndex + 1}`);
      this.acceptAllBtn.setAttribute('aria-label', `Accept all corrections in Col ${colIndex + 1}`);
    }
    if (this.rejectAllBtn) {
      this.rejectAllBtn.style.display = 'inline-flex';
      this.rejectAllBtn.setAttribute('title', `Reject all corrections in Col ${colIndex + 1}`);
      this.rejectAllBtn.setAttribute('aria-label', `Reject all corrections in Col ${colIndex + 1}`);
    }
    if (this.closeBtn) this.closeBtn.style.display = 'inline-flex';

    if (this.rulesView) this.rulesView.style.display = 'none';
    if (this.columnsView) this.columnsView.style.display = 'none';
    if (this.detailView) {
      this.detailView.style.display = 'block';
      this.renderDetail();
    }
  }

  renderDetail() {
    if (!this.detailView) return;
    const inCol = this.getColumnPendingItems(this.currentCol);
    if (inCol.length === 0) {
      this.showColumns();
      return;
    }

    if (this.countBadge) {
      this.countBadge.textContent = inCol.length;
    }

    this.flatItems = inCol.map(item => ({ type: 'item', data: item }));
    const itemH = this.ITEM_HEIGHT || 44;
    this.totalHeight = this.flatItems.length * itemH;

    if (this.virtualSpacer) {
      this.virtualSpacer.style.height = `${this.totalHeight}px`;
    }

    this._lastRenderStart = -1;
    this._lastRenderEnd = -1;
    this.renderVirtualWindow();
  }

  /**
   * Accepts all pending items in a specific column in a single RANGE_EDIT transaction.
   * @param {number} colIndex 
   */
  acceptColumn(colIndex) {
    const items = this.getColumnPendingItems(colIndex);
    if (items.length === 0) return;
    this.applyBatchEdit(items);
    this.afterColumnMutation();
  }

  /**
   * Rejects all pending items in a specific column without dataframe mutation.
   * @param {number} colIndex 
   */
  rejectColumn(colIndex) {
    const items = this.getColumnPendingItems(colIndex);
    items.forEach(item => { item.status = 'rejected'; });
    this.afterColumnMutation();
  }

  afterColumnMutation() {
    const remainingTotal = this.getPendingItems().length;
    if (remainingTotal === 0) {
      Notification.success("All corrections resolved.", "Validation");
      this.showRules();
      return;
    }

    if (this.view === 'detail') {
      const inCol = this.getColumnPendingItems(this.currentCol).length;
      if (inCol === 0) {
        this.showColumns();
      } else {
        this.renderDetail();
      }
    } else if (this.view === 'columns') {
      this.renderColumns();
    }
  }

  /**
   * Triggers active sheet UI re-render and selection refresh following edit mutations.
   */
  notifySheetUpdate() {
    const s = this.getSheet();
    if (!s) return;
    if (typeof s.reload === 'function') {
      s.reload();
    } else if (s.view && typeof s.view.render === 'function') {
      s.view.render();
    }
    if (typeof s.slctRefresh === 'function') {
      s.slctRefresh(true);
    }
  }

  /**
   * Accepts an individual edit proposal item.
   * Mutates dataframe via sheet.df.edit(), marks item accepted, updates view.
   * @param {Object} item
   */
  acceptItem(item) {
    if (!item) return;
    const target = (item.id && this.itemsMap ? this.itemsMap.get(item.id) : null) || (this.items || []).find(i => i.id === item.id) || item;
    const s = this.getSheet();
    if (s && s.df) {
      if (s.df.lock) {
        Notification.warning("File is in View-Only mode. Edits are disabled.", "Validation");
        return;
      }
      s.df.edit(target.x, target.y, target.newValue);
    }
    target.status = 'accepted';
    item.status = 'accepted';
    this.notifySheetUpdate();
    this.afterItemMutation();
  }

  /**
   * Rejects an individual edit proposal item without mutating dataframe.
   * @param {Object} item
   */
  rejectItem(item) {
    if (!item) return;
    const target = (item.id && this.itemsMap ? this.itemsMap.get(item.id) : null) || (this.items || []).find(i => i.id === item.id) || item;
    target.status = 'rejected';
    item.status = 'rejected';
    this.afterItemMutation();
  }

  afterItemMutation() {
    const remainingTotal = this.getPendingItems().length;
    if (remainingTotal === 0) {
      Notification.success("All corrections resolved.", "Validation");
      this.showRules();
      return;
    }

    if (this.view === 'detail') {
      const inCol = this.getColumnPendingItems(this.currentCol).length;
      if (inCol === 0) {
        this.showColumns();
      } else {
        this.renderDetail();
      }
    } else if (this.view === 'columns') {
      this.renderColumns();
    }
  }

  /**
   * Applies a batch of validation proposals in a single RANGE_EDIT transaction.
   * @param {Array<Object>} itemsList
   */
  applyBatchEdit(itemsList) {
    if (!itemsList || itemsList.length === 0) return;
    const s = this.getSheet();
    if (s?.df) {
      if (s.df.lock) {
        Notification.warning("File is in View-Only mode. Edits are disabled.", "Validation");
        return;
      }
      const changes = itemsList.map(item => ({
        x: item.x,
        y: item.y,
        oldValue: item.oldValue,
        newValue: item.newValue
      }));
      const now = Date.now();
      const txTimestamp = Math.max(now, (this._lastTxTimestamp || 0) + 105);
      this._lastTxTimestamp = txTimestamp;
      s.df.create({
        type: 'RANGE_EDIT',
        timestamp: txTimestamp,
        payload: { changes }
      });
    }

    itemsList.forEach(item => { item.status = 'accepted'; });
    this.notifySheetUpdate();
  }

  /**
   * Accepts all pending validation items across all columns in a single RANGE_EDIT transaction payload.
   */
  acceptAll() {
    this.applyBatchEdit(this.getPendingItems());
    this.afterColumnMutation();
  }

  /**
   * Rejects all pending validation items across all categories without dataframe mutation.
   */
  rejectAll() {
    this.getPendingItems().forEach(item => { item.status = 'rejected'; });
    this.afterColumnMutation();
  }

  /**
   * Backward-compatible refresh method.
   */
  refresh() {
    if (this.view === 'detail') {
      this.renderDetail();
    } else if (this.view === 'columns') {
      this.renderColumns();
    } else {
      this.renderRules();
    }
  }

  /**
   * Scroll event listener callback.
   */
  onScroll() {
    if (this.view === 'detail') {
      this.renderVirtualWindow();
    }
  }

  /**
   * Renders DOM nodes corresponding to current visible scroll viewport window for Tier 3.
   */
  renderVirtualWindow() {
    if (!this.virtualContent || !this.flatItems) return;

    const scrollTop = this.contentContainer ? this.contentContainer.scrollTop : 0;
    const containerHeight = (this.contentContainer && this.contentContainer.clientHeight > 0)
      ? this.contentContainer.clientHeight
      : 600;

    const total = this.flatItems.length;
    if (total === 0) {
      this.virtualContent.innerHTML = '';
      this.virtualContent.style.transform = 'translateY(0px)';
      return;
    }

    const itemH = this.ITEM_HEIGHT || 44;
    const startIndex = Math.max(0, Math.min(total - 1, Math.floor(scrollTop / itemH)));
    const endIndex = Math.min(total, Math.ceil((scrollTop + containerHeight) / itemH));

    const BUFFER = 5;
    const renderStart = Math.max(0, startIndex - BUFFER);
    const renderEnd = Math.min(total, endIndex + BUFFER);

    const startTop = renderStart * itemH;
    this.virtualContent.style.transform = `translateY(${startTop}px)`;

    if (this._lastRenderStart === renderStart && this._lastRenderEnd === renderEnd && this._lastSelectedId === this.selectedId) {
      return;
    }
    this._lastRenderStart = renderStart;
    this._lastRenderEnd = renderEnd;
    this._lastSelectedId = this.selectedId;

    let html = '';
    for (let i = renderStart; i < renderEnd; i++) {
      const flat = this.flatItems[i];
      if (flat.type === 'item') {
        const item = flat.data;
        html += `
          <div class="validation-item ${this.selectedId === item.id ? 'selected' : ''}" data-id="${this.escapeHtml(item.id)}">
            <div class="validation-item-diff">
              <span class="diff-old" title="${this.escapeHtml(item.oldValue)}">${this.formatVal(item.oldValue)}</span>
              <span class="diff-arrow">&rarr;</span>
              <span class="diff-new" title="${this.escapeHtml(item.newValue)}">${this.formatVal(item.newValue)}</span>
            </div>
            <div class="validation-item-actions">
              <button class="icon validation-btn item-accept-btn" type="button" title="Accept edit" aria-label="Accept edit" data-icon="on"></button>
              <button class="icon validation-btn item-reject-btn" type="button" title="Reject edit" aria-label="Reject edit" data-icon="off"></button>
            </div>
          </div>
        `;
      }
    }

    this.virtualContent.innerHTML = html;
    this.applyIcons(this.virtualContent);
  }

  /**
   * Handles selection of a validation item card.
   * Highlights card and focuses corresponding grid cell.
   * @param {Object} item
   */
  handleItemClick(item) {
    this.selectedId = item.id;

    if (this.virtualContent) {
      const cards = this.virtualContent.querySelectorAll('.validation-item');
      cards.forEach(c => {
        if (c.getAttribute('data-id') === item.id) {
          c.classList.add('selected');
        } else {
          c.classList.remove('selected');
        }
      });
    }

    const s = this.getSheet();
    if (s) {
      if (typeof s.focus_cell === 'function') {
        s.focus_cell(item.x, item.y);
      } else {
        s.x = item.x;
        s.y = item.y;
        if (typeof s.slctRefresh === 'function') {
          s.slctRefresh(true);
        }
      }
    }
  }

  formatVal(val) {
    if (val === undefined || val === null || val === '') return '<em>empty</em>';
    const escaped = this.escapeHtml(val);
    return escaped.includes('\n') ? escaped.replace(/\n/g, '\\n') : escaped;
  }

  escapeHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
    if (!str.includes('&') && !str.includes('<') && !str.includes('>') && !str.includes('"') && !str.includes("'")) {
      return str;
    }
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

if (!customElements.get('ui-validation-pane')) {
  customElements.define('ui-validation-pane', ValidationPane);
}

export { ValidationPane };
