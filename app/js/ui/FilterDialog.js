/**
 * Floating Filter Dialog component (<ui-filter>).
 * Allows filtering rows by column value with match-case option and lock enforcement.
 * Styled in alignment with FinderDialog floating panel.
 * @module FilterDialog
 */
import { DialogManager } from './DialogManager.js';
import { getSheet, getCsvHandle } from '../appContext.js';
import { setIcon } from '../utils/icons.js';
import { Notification } from './Notification.js';
import { NumInput } from './controls/NumInput.js';

class FilterDialog extends HTMLElement {
  constructor(sheet) {
    super();
    this.sheet = sheet;
    this._previousLock = null;

    const self = this;
    this._caseSensitiveVal = false;
    this.caseSensitive = {
      get value() { return self._caseSensitiveVal; },
      set value(v) {
        const bool = Boolean(v);
        self._caseSensitiveVal = bool;
        if (self.caseBtn) {
          self.caseBtn.setAttribute('aria-pressed', bool ? 'true' : 'false');
          self.caseBtn.classList.toggle('active', bool);
        }
      }
    };

    // Construct Widget UI DOM (Row 1: 2 inputs; Row 2: title on left, buttons on right)
    this.widget = document.createElement('div');
    this.widget.className = 'finder-widget filter-widget floating-panel';
    this.widget.innerHTML = `
      <div class="finder-row filter-row filter-top-row">
        <div class="filter-col-container"></div>
        <div class="finder-input-wrapper">
          <input type="text" class="finder-input filter-input" placeholder="Filter column..." aria-label="Filter text" />
          <span class="finder-count-badge"></span>
        </div>
      </div>

      <div class="finder-row filter-row filter-bottom-row">
        <span class="filter-col-title" title="Selected column header"></span>
        <div class="finder-btn-group">
          <button class="finder-action-icon-btn case-btn icon" type="button" title="Match Case" aria-label="Match Case" aria-pressed="false"></button>
          <button class="finder-action-icon-btn apply-btn icon" type="button" title="Apply Filter (Enter)" aria-label="Apply Filter"></button>
          <button class="finder-action-icon-btn close-btn icon" type="button" title="Close (Escape)" aria-label="Close"></button>
        </div>
      </div>
    `;

    // Initialize NumInput for column selection
    this.colInput = new NumInput(1, 1, 999, 'linear');
    this.colInput.setAttribute('aria-label', 'Column number');
    this.colInput.setAttribute('title', 'Column number');
    if (typeof this.colInput.connectedCallback === 'function' && !this.colInput._initialized) {
      this.colInput.connectedCallback();
    }
    this.widget.querySelector('.filter-col-container').appendChild(this.colInput);

    // References
    this.colTitle = this.widget.querySelector('.filter-col-title');
    this.filterInput = this.widget.querySelector('.filter-input');
    this.countBadge = this.widget.querySelector('.finder-count-badge');
    this.caseBtn = this.widget.querySelector('.case-btn');
    this.applyBtn = this.widget.querySelector('.apply-btn');
    this.closeBtn = this.widget.querySelector('.close-btn');

    // Icons
    setIcon(this.caseBtn, 'match_case');
    setIcon(this.applyBtn, 'on');
    setIcon(this.closeBtn, 'off');

    this.appendChild(this.widget);

    // Bind event listeners
    this.applyBtn.addEventListener('click', () => { this.applyFilter(); });
    this.closeBtn.addEventListener('click', () => { this.close(); });
    this.caseBtn.addEventListener('click', () => {
      this.caseSensitive.value = !this.caseSensitive.value;
      if (this.filterInput.value.length > 0) {
        this.applyFilter();
      }
    });

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.applyFilter();
      }
    };

    this.filterInput.addEventListener('keydown', handleKeydown);
    this.filterInput.addEventListener('input', () => {
      if (this.filterInput.value.length === 0) {
        if (this.activeSheet && this.activeSheet.filterRows !== null) {
          this.applyFilter();
        } else {
          this.countBadge.textContent = '';
        }
      }
    });
    this.colInput.addEventListener('keydown', handleKeydown);
    this.colInput.addEventListener('change', () => {
      this.updateColTitle();
      if (this.filterInput.value.length > 0) {
        this.applyFilter();
      }
    });

    // Tab trap
    this.widget.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.stopPropagation();
        DialogManager.cycleFocus(e, this.getFocusableElements());
      }
    });
  }

  getFocusableElements() {
    const list = [
      this.colInput,
      this.filterInput,
      this.caseBtn,
      this.applyBtn,
      this.closeBtn
    ];
    return list.filter(el => el && !el.disabled && !el.hidden && el.style.display !== 'none');
  }

  get activeSheet() {
    return this.sheet || getSheet();
  }

  get isOpen() {
    return this.classList.contains('open') || this.hasAttribute('open');
  }

  updateColTitle() {
    const activeSheet = this.activeSheet;
    if (!activeSheet || !activeSheet.df) {
      if (this.colTitle) this.colTitle.textContent = '';
      return;
    }
    const colVal = Number(this.colInput.value);
    const colIndex = Math.max(0, Math.min((isNaN(colVal) ? 1 : colVal) - 1, activeSheet.df.width - 1));
    const headerVal = activeSheet.df.get(colIndex, 0);
    const title = (headerVal && headerVal.trim().length > 0) ? headerVal.trim() : `Column ${colIndex + 1}`;
    if (this.colTitle) {
      this.colTitle.textContent = title;
      this.colTitle.setAttribute('title', `Column ${colIndex + 1}: ${title}`);
    }
  }

  open(colIndex) {
    const csv = getCsvHandle();
    if (csv && csv.viewOnly) {
      Notification.warning("Filter is not available in Fast Preview mode.", "Filter");
      return;
    }

    const activeSheet = this.activeSheet;
    if (!activeSheet || !activeSheet.df) return;

    // Immediately lock sheet edits
    if (this._previousLock === null || this._previousLock === undefined) {
      this._previousLock = Boolean(activeSheet.df.lock);
    }
    activeSheet.df.lock = true;
    if (activeSheet.inputing && activeSheet.controller) {
      activeSheet.controller.inputBlur();
    }
    if (activeSheet.view) {
      activeSheet.view.footerUpdate();
    }

    // Set default column index (1-based for user display)
    const maxCols = Math.max(1, activeSheet.df.width);
    this.colInput.min = 1;
    this.colInput.max = maxCols;
    const targetCol = (colIndex !== undefined && colIndex !== null && colIndex >= 0)
      ? (colIndex + 1)
      : (activeSheet.x + 1);
    this.colInput.value = Math.max(1, Math.min(targetCol, maxCols));
    this.updateColTitle();

    if (!this.parentNode) {
      document.body.appendChild(this);
    }

    this.classList.add('visible', 'open');
    this.setAttribute('open', '');
    this.removeAttribute('hidden');
    this.style.display = 'block';

    if (!activeSheet || activeSheet.filterRows === null) {
      this.countBadge.textContent = '';
    }

    this.filterInput.focus();
    this.filterInput.select();
  }

  close() {
    this.classList.remove('visible', 'open');
    this.removeAttribute('open');
    this.setAttribute('hidden', '');
    this.style.display = 'none';

    const activeSheet = this.activeSheet;
    if (activeSheet) {
      activeSheet.clearFilter();
      if (activeSheet.df) {
        activeSheet.df.lock = this._previousLock ?? false;
      }
      this._previousLock = null;
      if (activeSheet.view) {
        activeSheet.view.footerUpdate();
        activeSheet.view.refresh();
      }
      if (typeof activeSheet.slctRefresh === 'function') {
        activeSheet.slctRefresh(true);
      }
    }

    this.countBadge.textContent = '';
  }

  applyFilter() {
    const activeSheet = this.activeSheet;
    if (!activeSheet || !activeSheet.df) return;

    this.updateColTitle();
    const colVal = Number(this.colInput.value);
    const colIndex = Math.max(0, Math.min((isNaN(colVal) ? 1 : colVal) - 1, activeSheet.df.width - 1));
    const query = this.filterInput.value;
    const matchCase = Boolean(this.caseSensitive.value);

    activeSheet.setFilter(colIndex, query, matchCase);

    if (activeSheet.filterRows === null) {
      this.countBadge.textContent = '';
    } else {
      const totalDataRows = activeSheet.df.height - (activeSheet.fixTop ? 1 : 0);
      this.countBadge.textContent = `${activeSheet.filterRows.length} / ${Math.max(1, totalDataRows)}`;
    }
  }
}

if (!customElements.get('ui-filter')) {
  customElements.define('ui-filter', FilterDialog);
}

export { FilterDialog };
