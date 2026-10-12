import { setIcon } from '../utils/icons.js';

/**
 * Weighted fuzzy scoring function for search matching.
 * Calculates relevance score for query against target text.
 * @param {string} query - Search query
 * @param {string} text - Target text (description or command ID)
 * @returns {number} Match score (0 means no match)
 */
function fuzzyScore(query, text) {
  if (!query) return 1;
  if (!text) return 0;

  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();

  if (!q) return 1;

  // 1. Exact Match
  if (t === q) return 1000;

  // 2. Prefix Match
  if (t.startsWith(q)) return 800 - (t.length - q.length);

  // 3. Word Boundary Prefix Match (e.g., "so" matches "Sort rows")
  const words = t.split(/[\s_\-/]+/);
  for (const word of words) {
    if (word.startsWith(q)) return 600 - (t.length - q.length);
  }

  // 4. Substring Match
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) return 400 - subIdx;

  // 5. Subsequence Fuzzy Match
  let qIdx = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIdx = -10;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score += 10;
      if (i === prevMatchIdx + 1) {
        consecutive++;
        score += consecutive * 5;
      } else {
        consecutive = 0;
      }
      prevMatchIdx = i;
      qIdx++;
    }
  }

  return qIdx === q.length ? score : 0;
}

class CommandPalette extends HTMLElement {
  static _defaultCommands = null;

  /**
   * Sets static default command registry for all CommandPalette instances.
   * @param {Object} commands 
   */
  static setDefaultCommands(commands) {
    CommandPalette._defaultCommands = commands;
    const existing = typeof document !== 'undefined'
      ? (document.getElementById('palette') || document.querySelector('ui-command-palette'))
      : null;
    if (existing) {
      existing.commands = commands;
    }
  }

  constructor() {
    super();
    this.commands = CommandPalette._defaultCommands || null;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    this.style.display = 'none';
    this._initialized = false;
  }

  connectedCallback() {
    this.init();
    if (!this.commands && CommandPalette._defaultCommands) {
      this.commands = CommandPalette._defaultCommands;
    }
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');

    this.innerHTML = `
      <div class="cmd_palette_backdrop palette-backdrop"></div>
      <div class="cmd_palette_modal palette-container">
        <div class="cmd_palette_header">
          <input type="text" class="cmd_palette_input palette-input" placeholder="Type a command or search..." autofocus />
          <span class="cmd_palette_close icon" role="button" title="Close (Esc)" aria-label="Close"></span>
        </div>
        <ul class="cmd_palette_list command-list" role="listbox"></ul>
        <div class="cmd_palette_footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
          <span><kbd>&crarr;</kbd> Select</span>
          <span><kbd>Esc</kbd> Dismiss</span>
        </div>
      </div>
    `;

    this.classList.remove('open');
    this.removeAttribute('open');
    this.style.display = 'none';

    this.backdropEl = this.querySelector('.cmd_palette_backdrop');
    this.inputEl = this.querySelector('input');
    this.listEl = this.querySelector('.cmd_palette_list');
    this.closeBtn = this.querySelector('.cmd_palette_close');

    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => this.close());
    }
    if (this.closeBtn) {
      setIcon(this.closeBtn, 'off');
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.inputEl) {
      this.inputEl.addEventListener('input', () => this.filterCommands());
      this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }
  }

  get isOpen() {
    return Boolean(this.classList.contains('open') || this.hasAttribute('open') || this.style.display === 'block');
  }

  getCommands() {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const mod = isMac ? '⌘' : 'Ctrl+';
    const shiftMod = isMac ? '⇧' : 'Shift+';
    const altMod = isMac ? '⌥' : 'Alt+';
    const commandMap = this.commands || CommandPalette._defaultCommands || {};
    return Object.entries(commandMap)
      .filter(([id, c]) => c && typeof c.run === 'function')
      .map(([id, c]) => ({
        id,
        label: c.label || id,
        description: c.description || c.label || id,
        key: c.k ? `${c.ctrl ? mod : ''}${c.alt ? altMod : ''}${c.shift ? shiftMod : ''}${c.k}` : '',
        run: c.run
      }));
  }

  filterCommands() {
    this.init();
    if (!this.commands && CommandPalette._defaultCommands) {
      this.commands = CommandPalette._defaultCommands;
    }
    const query = (this.inputEl ? this.inputEl.value : '').trim();
    const all = this.getCommands();
    if (!query) {
      this.filteredCommands = all;
    } else {
      const scored = all.map(c => {
        const descScore = fuzzyScore(query, c.description);
        const labelScore = fuzzyScore(query, c.label || '') * 0.95;
        const idScore = fuzzyScore(query, c.id) * 0.9;
        return {
          cmd: c,
          score: Math.max(descScore, labelScore, idScore)
        };
      }).filter(item => item.score > 0);

      scored.sort((a, b) => b.score - a.score);
      this.filteredCommands = scored.map(item => item.cmd);
    }
    this.selectedIndex = 0;
    this.renderList();
  }

  setSelectedIndex(idx, scrollIntoView = true) {
    if (idx < 0 || idx >= this.filteredCommands.length) return;
    if (this.listEl && this.listEl.children.length > 0) {
      const prev = this.listEl.children[this.selectedIndex];
      if (prev) {
        prev.classList.remove('selected');
        prev.setAttribute('aria-selected', 'false');
      }
      this.selectedIndex = idx;
      const current = this.listEl.children[this.selectedIndex];
      if (current) {
        current.classList.add('selected');
        current.setAttribute('aria-selected', 'true');
        if (scrollIntoView) {
          try {
            if (typeof current.scrollIntoView === 'function') {
              current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
          } catch (e) {
            console.debug?.(e);
          }
        }
      }
    } else {
      this.selectedIndex = idx;
    }
  }

  renderList() {
    this.init();
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (this.filteredCommands.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'cmd_palette_empty';
      emptyLi.textContent = 'No matching commands';
      this.listEl.appendChild(emptyLi);
      return;
    }

    this.filteredCommands.forEach((cmdItem, idx) => {
      const li = document.createElement('li');
      li.className = `cmd_palette_item command-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === this.selectedIndex ? 'true' : 'false');
      li.setAttribute('data-index', idx);
      li.innerHTML = `
        <span class="cmd_palette_item_label">${this.escapeHtml(cmdItem.description)}</span>
        ${cmdItem.key ? `<span class="cmd_palette_item_shortcut command-key">${this.escapeHtml(cmdItem.key)}</span>` : ''}
      `;
      li.addEventListener('mouseenter', () => this.setSelectedIndex(idx, false));
      li.addEventListener('click', () => this.executeIndex(idx));
      this.listEl.appendChild(li);
    });

    const selectedItem = this.listEl.children[this.selectedIndex];
    if (selectedItem) {
      try {
        if (typeof selectedItem.scrollIntoView === 'function') {
          selectedItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      } catch (e) {
        console.debug?.(e);
      }
    }
  }

  handleKeyDown(e) {
    this.init();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.filteredCommands.length > 0) {
        const nextIdx = (this.selectedIndex + 1) % this.filteredCommands.length;
        this.setSelectedIndex(nextIdx, true);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.filteredCommands.length > 0) {
        const prevIdx = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
        this.setSelectedIndex(prevIdx, true);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.executeIndex(this.selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  executeIndex(idx) {
    const item = this.filteredCommands[idx];
    if (item && typeof item.run === 'function') {
      this.close();
      item.run();
    }
  }

  open() {
    this.init();
    if (!this.commands && CommandPalette._defaultCommands) {
      this.commands = CommandPalette._defaultCommands;
    }
    this.classList.add('open');
    this.setAttribute('open', '');
    this.style.display = 'block';
    if (this.inputEl) {
      this.inputEl.value = '';
    }
    this.filterCommands();
    if (this.inputEl) {
      setTimeout(() => this.inputEl.focus(), 10);
    }
  }

  close() {
    this.init();
    this.classList.remove('open');
    this.removeAttribute('open');
    this.style.display = 'none';
  }

  toggle() {
    this.init();
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
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

  /**
   * Toggles the global singleton command palette dialog.
   * Creates and appends element to document body if absent.
   * @param {Object} [commands] - Command registry dictionary to populate palette with.
   * @returns {CommandPalette} The command palette element instance.
   */
  static toggle(commands = null) {
    let palette = (typeof document !== 'undefined')
      ? (document.getElementById('palette') || document.querySelector('ui-command-palette'))
      : null;
    if (!palette && typeof document !== 'undefined') {
      palette = document.createElement('ui-command-palette');
      palette.id = 'palette';
      document.body.appendChild(palette);
    }
    const cmds = commands || CommandPalette._defaultCommands;
    if (cmds && palette) {
      palette.commands = cmds;
    }
    if (palette && typeof palette.toggle === 'function') {
      palette.toggle();
    }
    return palette;
  }
}

if (!customElements.get('ui-command-palette')) {
  customElements.define('ui-command-palette', CommandPalette);
}

export { CommandPalette };
