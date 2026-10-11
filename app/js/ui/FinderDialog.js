import { dom } from './AppLayout.js';
import { DialogManager } from './DialogManager.js';
import { getSheet } from '../appContext.js';
import { setIcon } from '../utils/icons.js';
import { SearchEngine } from '../../../core/search/SearchEngine.js';

class FinderDialog extends HTMLElement {
  constructor(sheet) {
    super();
    this.sheet = sheet;
    this.found = [];
    this.search = "";
    this.lastSearch = "";
    this.idx = 0;
    this.advanced = false;

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
        if (self.caseInfo) {
          self.caseInfo.innerHTML = bool ? "A &ne; a" : "A = a";
        }
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

    this.appendChild(this.widget);

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
    return list.filter(el => el && !el.disabled && !el.hidden && !el.classList.contains('hidden') && el.style.display !== 'none');
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

  get activeSheet() {
    return this.sheet || getSheet();
  }

  toggleMatchCase() {
    this.caseSensitive.value = !this.caseSensitive.value;
    this.find(true);
  }

  find(force = false) {
    const activeSheet = this.activeSheet;
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

      if (activeSheet && activeSheet.df) {
        const engine = new SearchEngine();
        const matches = engine.find(activeSheet.df, {
          term: this.search,
          caseSensitive: Boolean(this.caseSensitive.value)
        });
        const seen = new Set();
        for (const m of matches) {
          const key = `${m.x}:${m.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            this.found.push({ x: m.x, y: m.y, v: m.value });
          }
        }
      }
    }

    const info = (this.found.length === 0) ? "No match" : (this.idx + 1) + ' / ' + this.found.length;
    this.foundInfo.innerHTML = info;

    if (this.found.length > 0 && activeSheet) {
      activeSheet.focus_cell(this.found[this.idx].x, this.found[this.idx].y);
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
    const activeSheet = this.activeSheet;
    if (this.search !== this.findIn.value || this.found.length === 0) {
      this.find(true);
      return;
    }
    if (this.found.length > 0) {
      this.idx = (this.idx - 1 + this.found.length) % this.found.length;
      const info = (this.idx + 1) + ' / ' + this.found.length;
      this.foundInfo.innerHTML = info;
      if (activeSheet) {
        activeSheet.focus_cell(this.found[this.idx].x, this.found[this.idx].y);
      }
    }
  }

  replace() {
    if (this.search.length < 1 || this.found.length === 0) return;
    const activeSheet = this.activeSheet;
    if (!activeSheet?.df) return;

    if (this.idx >= 0 && this.idx < this.found.length) {
      const e = this.found[this.idx];
      const safeSearch = (typeof this.search === 'string') ? this.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      const regex = new RegExp(safeSearch, this.caseSensitive.value ? 'g' : 'gi');
      const currentVal = activeSheet.df.get(e.x, e.y);
      activeSheet.df.edit(e.x, e.y, currentVal.replace(regex, this.replaceIn.value));
      activeSheet.refresh();
      activeSheet.slctRefresh(true);
      this.find(true);
    }
  }

  replaceAll() {
    if (this.search.length < 1) return;
    const activeSheet = this.activeSheet;
    if (!activeSheet?.df) return;

    const engine = new SearchEngine();
    engine.replaceAll(activeSheet.df, {
      term: this.search,
      caseSensitive: Boolean(this.caseSensitive.value),
      useRegex: false,
      matchWholeCell: false
    }, this.replaceIn.value);

    activeSheet.refresh();
    activeSheet.slctRefresh(true);
    this.find(true);
  }

  findMenu(prefill = "", adv = false) {
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
    this.classList.add('visible', 'open');
    this.setAttribute('open', '');
    this.removeAttribute('hidden');
    this.style.display = 'block';
  }

  close() {
    this.classList.remove('visible', 'open');
    this.removeAttribute('open');
    this.setAttribute('hidden', '');
    this.style.display = 'none';
    if (dom?.dialog && dom.dialog.contains(this)) {
      DialogManager.close();
    }
  }
}

if (!customElements.get('ui-finder')) {
  customElements.define('ui-finder', FinderDialog);
}

export { FinderDialog };
