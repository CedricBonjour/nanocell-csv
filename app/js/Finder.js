import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { Table } from './ui/input/Table.js';
import { BoolInput } from './ui/input/BoolInput.js';
import { setIcon, iconMap } from './icons.js';


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
        <button class="finder-toggle-btn icon" type="button" title="Toggle Replace (Ctrl+Shift+F)" aria-label="Toggle Replace"></button>

        <div class="finder-input-wrapper">
          <input type="text" class="finder-input find-input" placeholder="Find" aria-label="Find term" />
          <span class="finder-count-badge">No match</span>
        </div>

        <div class="finder-btn-group">
          <button class="finder-action-icon-btn case-btn icon" type="button" title="Match Case (Alt+C)" aria-label="Match Case" aria-pressed="false"></button>
          <button class="finder-action-icon-btn prev-btn icon" type="button" title="Previous Match (Shift+Enter)" aria-label="Previous Match"></button>
          <button class="finder-action-icon-btn next-btn icon" type="button" title="Next Match (Enter)" aria-label="Next Match"></button>
          <button class="finder-action-icon-btn close-btn icon" type="button" title="Close (Escape)" aria-label="Close"></button>
        </div>
      </div>

      <div class="finder-row replace-row hidden">
        <div class="finder-row-spacer"></div>
        <div class="finder-input-wrapper">
          <input type="text" class="finder-input replace-input" placeholder="Replace" aria-label="Replace term" />
        </div>
        <div class="finder-btn-group">
          <button class="finder-action-icon-btn replace-all-btn icon" type="button" title="Replace All (Alt+A)" aria-label="Replace All"></button>
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
    this.replaceBtn = this.widget.querySelector('.replace-all-btn');

    // Apply icon system
    setIcon(this.toggleBtn, 'arrow_right');
    setIcon(this.caseBtn, 'match_case');
    setIcon(this.prevBtn, 'arrow_up');
    setIcon(this.nextBtn, 'arrow_down');
    setIcon(this.closeBtn, 'off');
    setIcon(this.replaceBtn, 'find_replace');

    this.caseInfo = document.createElement('span');
    this.caseInfo.innerHTML = "A = a";

    // Legacy table references for backwards compatibility
    this.table = new Table();
    this.listTable = new Table();
    this.listTable.classList.add("finder-list-table", "scroll");
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
      }
    });

    this.replaceIn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.replaceAll();
      }
    });

    // Tab navigation looping across all focusable pane controls based on replace visibility
    this.widget.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        const focusable = this.getFocusableElements();
        if (focusable.length === 0) return;

        e.preventDefault();
        const active = document.activeElement;
        const currentIndex = focusable.indexOf(active);
        let nextIndex;
        if (e.shiftKey) {
          nextIndex = (currentIndex <= 0) ? focusable.length - 1 : currentIndex - 1;
        } else {
          nextIndex = (currentIndex === -1 || currentIndex >= focusable.length - 1) ? 0 : currentIndex + 1;
        }
        focusable[nextIndex].focus();
      }
    });

    this.toggleBtn.addEventListener('click', () => { this.toggleReplaceRow(); });
    this.caseBtn.addEventListener('click', () => { this.toggleMatchCase(); });
    this.prevBtn.addEventListener('click', () => { this.findPrev(); });
    this.nextBtn.addEventListener('click', () => { this.findNext(); });
    this.closeBtn.addEventListener('click', () => { this.close(); });
    this.replaceBtn.addEventListener('click', () => { this.replaceAll(); });
  }

  getFocusableElements() {
    const list = [
      this.toggleBtn,
      this.findIn,
      this.caseBtn,
      this.prevBtn,
      this.nextBtn,
      this.closeBtn
    ];
    if (this.replaceRow && !this.replaceRow.classList.contains('hidden')) {
      list.push(this.replaceIn, this.replaceBtn);
    }
    return list.filter(el => el && !el.disabled && el.style.display !== 'none');
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
      if (document.activeElement === this.replaceIn || document.activeElement === this.replaceBtn) {
        this.findIn.focus();
      }
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
