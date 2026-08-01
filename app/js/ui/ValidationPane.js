import { StateManager } from '../StateManager.js';

/**
 * Custom Element `<ui-validation-pane>` for virtualized rendering of proposed cell validation edits,
 * batch approval workflow, and single-step undo/redo Dataframe transaction integration.
 */
class ValidationPane extends HTMLElement {
  constructor() {
    super();
    this.sheet = null;
    this.items = [];
    this.selectedId = null;
    this.flatItems = [];
    this.offsets = new Float64Array(0);
    this.totalHeight = 0;
    this.ITEM_HEIGHT = 44;
    this._initialized = false;
    this._onScrollBound = this.onScroll.bind(this);
    this._lastTxTimestamp = 0;
  }

  connectedCallback() {
    this.init();
    StateManager.setState('validationPane', this);
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
        <span id="validation-count-badge" style="display: none;">0</span>
        <div class="validation-pane-action-bar">
          <button class="btn-ok validation-btn validation-action-btn accept-all-btn g" id="validation-accept-all-btn" title="Accept all proposed edits">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
            <span>Accept All</span>
          </button>
          <button class="btn-ko validation-btn validation-action-btn reject-all-btn g" id="validation-reject-all-btn" title="Reject all proposed edits">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
            <span>Reject All</span>
          </button>
        </div>
      </div>
      <div class="validation-pane-content scroll" id="validation-list-container">
        <div class="validation-virtual-spacer" id="validation-virtual-spacer" style="position: relative; width: 100%;">
          <div class="validation-virtual-content" id="validation-virtual-content" style="position: absolute; top: 0; left: 0; right: 0; will-change: transform;"></div>
        </div>
        <div class="validation-empty-state" id="validation-empty-state">No validation issues found.</div>
      </div>
    `;

    this.listContainer = this.querySelector('#validation-list-container');
    this.virtualSpacer = this.querySelector('#validation-virtual-spacer');
    this.virtualContent = this.querySelector('#validation-virtual-content');
    this.emptyState = this.querySelector('#validation-empty-state');
    this.countBadge = this.querySelector('#validation-count-badge');
    this.closeBtn = this.querySelector('#validation-close-btn');
    this.acceptAllBtn = this.querySelector('#validation-accept-all-btn');
    this.rejectAllBtn = this.querySelector('#validation-reject-all-btn');

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.acceptAllBtn) {
      this.acceptAllBtn.addEventListener('click', () => this.acceptAll());
    }
    if (this.rejectAllBtn) {
      this.rejectAllBtn.addEventListener('click', () => this.rejectAll());
    }
    if (this.listContainer) {
      this.listContainer.addEventListener('scroll', this._onScrollBound, { passive: true });
    }

    if (this.virtualContent) {
      this.virtualContent.addEventListener('click', (e) => {
        const btn = e.target.closest('.validation-btn');
        if (btn) {
          e.stopPropagation();
          if (btn.classList.contains('item-accept-btn')) {
            const card = btn.closest('.validation-item');
            if (card) {
              const item = (this.items || []).find(i => i.id === card.getAttribute('data-id'));
              if (item) this.acceptItem(item);
            }
          } else if (btn.classList.contains('item-reject-btn')) {
            const card = btn.closest('.validation-item');
            if (card) {
              const item = (this.items || []).find(i => i.id === card.getAttribute('data-id'));
              if (item) this.rejectItem(item);
            }
          }
          return;
        }

        const card = e.target.closest('.validation-item');
        if (card) {
          const item = (this.items || []).find(i => i.id === card.getAttribute('data-id'));
          if (item) this.handleItemClick(item);
        }
      });
    }
  }

  /**
   * Binds target Sheet instance to validation pane.
   * @param {import('../Sheet.js').Sheet} sheet
   */
  bindSheet(sheet) {
    this.sheet = sheet;
  }

  /**
   * Gets active sheet instance from bound property or StateManager.
   */
  getSheet() {
    if (!this.sheet) {
      this.sheet = StateManager.getState('sheet');
    }
    return this.sheet;
  }

  /**
   * Loads proposed validation edit items into pane.
   * @param {Array<Object>} items
   */
  loadItems(items = []) {
    this.init();
    this.items = items;
    for (const item of this.items) {
      if (!item.status) item.status = 'pending';
    }
    this.refresh();
  }

  /**
   * Retrieves array of currently pending validation items.
   * @returns {Array<Object>}
   */
  getPendingItems() {
    return (this.items || []).filter(item => item.status === 'pending' || !item.status);
  }

  /**
   * Shows validation pane with slide-in transition.
   */
  show() {
    this.init();
    this.style.display = 'flex';
    this.classList.add('open');
    StateManager.setState('validationPaneOpen', true);
  }

  /**
   * Closes validation pane.
   */
  close() {
    this.init();
    this.classList.remove('open');
    this.style.display = 'none';
    StateManager.setState('validationPaneOpen', false);
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
   * Mutates dataframe via sheet.df.edit(), removes item from pending list, refreshes list and sheet UI.
   * @param {Object} item
   */
  acceptItem(item) {
    if (!item) return;
    const target = (this.items || []).find(i => i.id === item.id) || item;
    const s = this.getSheet();
    if (s && s.df) {
      s.df.edit(target.x, target.y, target.newValue);
    }
    target.status = 'accepted';
    item.status = 'accepted';
    this.notifySheetUpdate();
    this.refresh();
  }

  /**
   * Rejects an individual edit proposal item.
   * Removes item from pending list without mutating dataframe, refreshes list.
   * @param {Object} item
   */
  rejectItem(item) {
    if (!item) return;
    const target = (this.items || []).find(i => i.id === item.id) || item;
    target.status = 'rejected';
    item.status = 'rejected';
    this.refresh();
  }

  /**
   * Accepts all pending items in a category for API compatibility.
   * @param {string} catKey
   */
  acceptCategory(catKey) {
    const categoryPending = this.getPendingItems().filter(item => (item.category || 'OTHER') === catKey);
    if (categoryPending.length === 0) return;

    const s = this.getSheet();
    if (s && s.df) {
      const changes = categoryPending.map(item => ({
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

    categoryPending.forEach(item => { item.status = 'accepted'; });
    this.notifySheetUpdate();
    this.refresh();
  }

  /**
   * Rejects all pending items in a category for API compatibility.
   * @param {string} catKey
   */
  rejectCategory(catKey) {
    const categoryPending = this.getPendingItems().filter(item => (item.category || 'OTHER') === catKey);
    categoryPending.forEach(item => { item.status = 'rejected'; });
    this.refresh();
  }

  /**
   * Stub for category toggle compatibility.
   */
  toggleCategory() {}

  /**
   * Accepts all pending validation items across all categories in a single RANGE_EDIT transaction payload.
   */
  acceptAll() {
    const pendingItems = this.getPendingItems();
    if (pendingItems.length === 0) return;

    const s = this.getSheet();
    if (s && s.df) {
      const changes = pendingItems.map(item => ({
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

    pendingItems.forEach(item => { item.status = 'accepted'; });
    this.notifySheetUpdate();
    this.refresh();
  }

  /**
   * Rejects all pending validation items across all categories without dataframe mutation.
   */
  rejectAll() {
    const pendingItems = this.getPendingItems();
    pendingItems.forEach(item => { item.status = 'rejected'; });
    this.refresh();
  }

  /**
   * Re-calculates flatItems, virtual layout offsets and updates UI.
   * Automatically invokes close() when pendingItems.length === 0.
   */
  refresh() {
    this._lastRenderStart = -1;
    this._lastRenderEnd = -1;
    this.init();
    if (!this.listContainer || !this.countBadge) return;

    const pendingItems = this.getPendingItems();
    this.countBadge.textContent = pendingItems.length;

    if (pendingItems.length === 0) {
      if (this.virtualSpacer) this.virtualSpacer.style.display = 'none';
      if (this.emptyState) this.emptyState.style.display = 'block';
      if (this.virtualContent) this.virtualContent.innerHTML = '';
      this.close();
      return;
    }

    if (this.emptyState) this.emptyState.style.display = 'none';
    if (this.virtualSpacer) this.virtualSpacer.style.display = 'block';

    this.flatItems = pendingItems.map(item => ({ type: 'item', data: item, key: item.category || 'OTHER' }));

    const len = this.flatItems.length;
    this.offsets = new Float64Array(len + 1);
    let top = 0;
    for (let i = 0; i < len; i++) {
      this.offsets[i] = top;
      top += this.ITEM_HEIGHT;
    }
    this.offsets[len] = top;
    this.totalHeight = top;

    if (this.virtualSpacer) {
      this.virtualSpacer.style.height = `${this.totalHeight}px`;
    }

    this.renderVirtualWindow();
  }

  /**
   * Scroll event listener callback.
   */
  onScroll() {
    this.renderVirtualWindow();
  }

  /**
   * Renders DOM nodes corresponding to the current visible scroll viewport window.
   */
  renderVirtualWindow() {
    if (!this.virtualContent || !this.flatItems) return;

    const scrollTop = this.listContainer ? this.listContainer.scrollTop : 0;
    const containerHeight = (this.listContainer && this.listContainer.clientHeight > 0)
      ? this.listContainer.clientHeight
      : 600;

    const total = this.flatItems.length;
    if (total === 0) {
      this.virtualContent.innerHTML = '';
      this.virtualContent.style.transform = 'translateY(0px)';
      return;
    }

    // Binary search for startIndex
    let startIndex = 0;
    let low = 0;
    let high = total - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.offsets[mid + 1] <= scrollTop) {
        startIndex = mid + 1;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Find endIndex
    let endIndex = startIndex;
    const viewportBottom = scrollTop + containerHeight;
    while (endIndex < total && this.offsets[endIndex] < viewportBottom) {
      endIndex++;
    }

    // Apply buffer
    const BUFFER = 5;
    const renderStart = Math.max(0, startIndex - BUFFER);
    const renderEnd = Math.min(total, endIndex + BUFFER);

    const startTop = this.offsets[renderStart] || 0;
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
              <button class="btn-ok validation-btn item-accept-btn" title="Accept edit" aria-label="Accept edit">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>
              </button>
              <button class="btn-ko validation-btn item-reject-btn" title="Reject edit" aria-label="Reject edit">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
              </button>
            </div>
          </div>
        `;
      }
    }

    this.virtualContent.innerHTML = html;
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
    if (val === undefined || val === null) return '<em>empty</em>';
    if (val === '') return '<em>empty</em>';
    const escaped = this.escapeHtml(val);
    return escaped.replace(/\n/g, '\\n');
  }

  escapeHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
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
