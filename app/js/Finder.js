import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { Table } from './ui/input/Table.js';
import { BoolInput } from './ui/input/BoolInput.js';


class Finder extends HTMLElement {
  constructor(sheet) {
    super();
    this.sheet = sheet;
    this.found = [];
    this.search = "";
    this.lastSearch = "";
    this.idx = 0;
    this.advanced = false;

    // Backward-compatible caseSensitive property wrapper
    const self = this;
    this._caseSensitiveVal = false;
    this._caseSensitiveOnChange = null;
    this.caseSensitive = {
      get value() {
        return self._caseSensitiveVal;
      },
      set value(v) {
        const bool = Boolean(v);
        self._caseSensitiveVal = bool;
        if (self.caseBtn) {
          self.caseBtn.setAttribute('aria-pressed', bool ? 'true' : 'false');
          if (bool) self.caseBtn.classList.add('active');
          else self.caseBtn.classList.remove('active');
        }
        if (self.caseInfo) {
          self.caseInfo.innerHTML = bool ? "A &ne; a" : "A = a";
        }
        if (typeof this._onchange === 'function') {
          const e = new Event('change');
          Object.defineProperty(e, 'target', { writable: false, value: this });
          this._onchange(e);
        }
      },
      get onchange() {
        return this._onchange;
      },
      set onchange(fn) {
        this._onchange = fn;
      }
    };

    // Construct Widget UI DOM
    this.widget = document.createElement('div');
    this.widget.className = 'finder-widget floating-panel';
    this.widget.innerHTML = `
      <div class="finder-row find-row">
        <button class="finder-toggle-btn" title="Toggle Replace (Ctrl+Shift+F)" aria-label="Toggle Replace">
          <svg class="finder-icon caret-icon" viewBox="0 0 16 16" width="12" height="12">
            <path fill="currentColor" d="M6 4l4 4-4 4V4z"/>
          </svg>
        </button>

        <div class="finder-input-wrapper">
          <input type="text" class="finder-input find-input" placeholder="Find" aria-label="Find term" />
          <span class="finder-count-badge">No match</span>
        </div>

        <div class="finder-btn-group">
          <button class="finder-action-icon-btn case-btn" title="Match Case (Alt+C)" aria-pressed="false">Aa</button>
          <button class="finder-action-icon-btn prev-btn" title="Previous Match (Shift+Enter)" aria-label="Previous Match">
            <svg class="finder-icon" viewBox="0 0 16 16" width="14" height="14">
              <path fill="currentColor" d="M8 4.5l-5 5h10l-5-5z"/>
            </svg>
          </button>
          <button class="finder-action-icon-btn next-btn" title="Next Match (Enter)" aria-label="Next Match">
            <svg class="finder-icon" viewBox="0 0 16 16" width="14" height="14">
              <path fill="currentColor" d="M8 11.5l5-5H3l5 5z"/>
            </svg>
          </button>
          <button class="finder-action-icon-btn close-btn" title="Close (Escape)" aria-label="Close">
            <svg class="finder-icon" viewBox="0 0 16 16" width="14" height="14">
              <path fill="currentColor" d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="finder-row replace-row hidden">
        <div class="finder-input-wrapper">
          <input type="text" class="finder-input replace-input" placeholder="Replace" aria-label="Replace term" />
        </div>
        <div class="finder-btn-group">
          <button class="finder-btn replace-single-btn" title="Replace (Enter in replace input)">Replace</button>
          <button class="finder-btn replace-all-btn" title="Replace All (Alt+A)">Replace All</button>
        </div>
      </div>
    `;

    // Query control references
    this.findIn = this.widget.querySelector('.find-input');
    this.replaceIn = this.widget.querySelector('.replace-input');
    this.foundInfo = this.widget.querySelector('.finder-count-badge');
    this.caseBtn = this.widget.querySelector('.case-btn');
    this.toggleBtn = this.widget.querySelector('.finder-toggle-btn');
    this.prevBtn = this.widget.querySelector('.prev-btn');
    this.nextBtn = this.widget.querySelector('.next-btn');
    this.closeBtn = this.widget.querySelector('.close-btn');
    this.replaceRow = this.widget.querySelector('.replace-row');
    this.replaceSingleBtn = this.widget.querySelector('.replace-single-btn');
    this.replaceBtn = this.widget.querySelector('.replace-all-btn');

    this.caseInfo = document.createElement('span');
    this.caseInfo.innerHTML = "A = a";

    // Legacy table references for backwards compatibility
    this.table = new Table();
    this.listTable = new Table();
    this.listTable.style.maxHeight = "20em";
    this.listTable.classList.add("scroll");
    this.listTable.style.margin = "1em";
    this.listTable.style.display = "none";

    this.appendChild(this.widget);
    this.appendChild(this.listTable);

    // Event Bindings
    this.findIn.addEventListener('input', () => { this.find(); });
    this.foundInfo.addEventListener('click', () => { this.findNext(); });

    this.findIn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.findPrev();
        } else {
          this.findNext();
        }
      } else if (e.key === 'Tab') {
        if (!this.replaceRow.classList.contains('hidden')) {
          e.preventDefault();
          this.replaceIn.focus();
        }
      }
    });

    this.replaceIn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.altKey || e.ctrlKey) {
          this.replaceAll();
        } else {
          this.replace();
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.findIn.focus();
      }
    });

    this.toggleBtn.addEventListener('click', () => { this.toggleReplaceRow(); });
    this.caseBtn.addEventListener('click', () => { this.toggleMatchCase(); });
    this.prevBtn.addEventListener('click', () => { this.findPrev(); });
    this.nextBtn.addEventListener('click', () => { this.findNext(); });
    this.closeBtn.addEventListener('click', () => { this.close(); });
    this.replaceSingleBtn.addEventListener('click', () => { this.replace(); });
    this.replaceBtn.addEventListener('click', () => { this.replaceAll(); });
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
  }

  toggleReplaceRow(show) {
    if (show === undefined) {
      show = this.replaceRow.classList.contains('hidden');
    }
    if (show) {
      this.replaceRow.classList.remove('hidden');
      this.toggleBtn.classList.add('expanded');
      this.advanced = true;
    } else {
      this.replaceRow.classList.add('hidden');
      this.toggleBtn.classList.remove('expanded');
      this.advanced = false;
    }
  }

  toggleMatchCase() {
    this.caseSensitive.value = !this.caseSensitive.value;
    this.find(true);
  }

  find(force = false) {
    const activeSheet = this.sheet || StateManager.getState('sheet');
    this.listTable.style.display = "none";
    this.search = this.findIn.value;

    if (this.search.length < 1) {
      this.lastSearch = this.search;
      this.found = [];
      this.idx = 0;
    } else if (this.lastSearch === this.search && !force) {
      if (this.found.length > 0) {
        this.idx = (this.idx + 1) % this.found.length;
      }
    } else {
      this.lastSearch = this.search;
      this.idx = 0;
      this.found = [];
      const safeSearch = (typeof this.search === 'string') ? this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      this.exp = new RegExp(safeSearch, this.caseSensitive.value ? 'g' : 'gi');

      const yStart = 0;
      const xStart = 0;
      const yEnd = activeSheet ? activeSheet.df.height - 1 : 0;
      const xEnd = activeSheet ? activeSheet.df.width - 1 : 0;

      if (activeSheet) {
        for (let y = yStart; y <= yEnd; y++) {
          for (let x = xStart; x <= xEnd; x++) {
            const v = activeSheet.df.get(x, y);
            this.exp.lastIndex = 0;
            if (this.exp.test(v)) {
              this.found.push({ x: x, y: y, v: v });
            }
          }
        }
      }
    }

    const info = (this.found.length === 0) ? "No match" : (this.idx + 1) + ' / ' + this.found.length;
    this.foundInfo.innerHTML = info;

    if (this.found.length > 0 && activeSheet) {
      activeSheet.x = this.found[this.idx].x;
      activeSheet.y = this.found[this.idx].y;
      activeSheet.slctRefresh();
    }
  }

  findNext() {
    if (this.search !== this.findIn.value || this.found.length === 0) {
      this.find(true);
    } else {
      this.find(false);
    }
  }

  findPrev() {
    const activeSheet = this.sheet || StateManager.getState('sheet');
    if (this.search !== this.findIn.value || this.found.length === 0) {
      this.find(true);
      return;
    }
    if (this.found.length > 0) {
      this.idx = (this.idx - 1 + this.found.length) % this.found.length;
      const info = (this.idx + 1) + ' / ' + this.found.length;
      this.foundInfo.innerHTML = info;
      if (activeSheet) {
        activeSheet.x = this.found[this.idx].x;
        activeSheet.y = this.found[this.idx].y;
        activeSheet.slctRefresh();
      }
    }
  }

  replace() {
    if (this.search.length < 1 || this.found.length === 0) return;
    const activeSheet = this.sheet || StateManager.getState('sheet');
    if (!activeSheet) return;

    if (this.idx >= 0 && this.idx < this.found.length) {
      const e = this.found[this.idx];
      if (!this.exp) {
        const safeSearch = (typeof this.search === 'string') ? this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
        this.exp = new RegExp(safeSearch, this.caseSensitive.value ? 'g' : 'gi');
      }
      this.exp.lastIndex = 0;
      activeSheet.df.edit(e.x, e.y, e.v.replace(this.exp, this.replaceIn.value));
      activeSheet.refresh();
      activeSheet.slctRefresh(true);
      this.find(true);
    }
  }

  replaceAll() {
    if (this.search.length < 1) return;
    const activeSheet = this.sheet || StateManager.getState('sheet');
    if (!activeSheet) return;

    if (!this.exp) {
      const safeSearch = (typeof this.search === 'string') ? this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      this.exp = new RegExp(safeSearch, this.caseSensitive.value ? 'g' : 'gi');
    }

    for (const e of this.found) {
      this.exp.lastIndex = 0;
      activeSheet.df.edit(e.x, e.y, e.v.replace(this.exp, this.replaceIn.value));
    }
    activeSheet.refresh();
    activeSheet.slctRefresh(true);
    this.find(true);
  }

  showTable() {
    let i = 0;
    this.listTable.style.display = "block";
    while (this.listTable.rows.length > 0) this.listTable.rows[0].remove();
    for (const e of this.found) {
      i++;
      if (i > 500) return;
      this.listTable.br();
      this.listTable.push(e.x + 1);
      this.listTable.push(e.y + 1);
      const safeSearch = (typeof this.search === 'string') ? this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      const exp = this.exp || new RegExp(safeSearch, this.caseSensitive.value ? 'g' : 'gi');
      this.listTable.push(e.v.replace(exp, "<b>" + this.search + "</b>"));
    }
  }

  findMenu(prefill = "", adv = false) {
    this.listTable.style.display = "none";
    this.toggleReplaceRow(adv);
    if (prefill.length > 0) {
      this.findIn.value = prefill;
    }
    this.show();
    this.findIn.focus();
    if (prefill.length > 0) {
      this.find(true);
    }
  }

  show() {
    if (!this.parentNode) {
      document.body.appendChild(this);
    }
    this.classList.add('visible');
    this.style.display = 'block';
  }

  close() {
    this.classList.remove('visible');
    this.style.display = 'none';
    if (dom?.dialog && dom.dialog.contains(this)) {
      dom.dialog.clear();
    }
  }
}

if (!customElements.get('ui-finder')) {
  customElements.define('ui-finder', Finder);
}

export { Finder };
