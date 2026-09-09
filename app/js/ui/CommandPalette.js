import { cmd } from '../cmd.js';
import { StateManager } from '../StateManager.js';
import { setIcon } from '../icons.js';

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
  constructor() {
    super();
    this.selectedIndex = 0;
    this.filteredCommands = [];
  }

  connectedCallback() {
    this.init();
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');

    this.innerHTML = `
      <div class="cmd_palette_backdrop palette-backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: var(--modal-backdrop, rgba(0,0,0,0.5)); z-index: 9999;"></div>
      <div class="cmd_palette_modal palette-container" style="position: fixed; top: 15%; left: 50%; transform: translateX(-50%); width: 500px; max-width: 90vw; background-color: var(--modal-bg, #ffffff); color: var(--txt, #333333); border: 1px solid var(--table-borders, #ccc); border-radius: 8px; box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.3)); z-index: 10000; font-family: var(--font-family-ui, sans-serif); overflow: hidden; display: flex; flex-direction: column;">
        <div class="cmd_palette_header" style="display: flex; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--table-borders, #ccc);">
          <input type="text" class="cmd_palette_input palette-input" placeholder="Type a command or search..." style="flex: 1; border: none; background: transparent; color: inherit; font-size: 14px; font-family: var(--font-family-ui, sans-serif); outline: none; margin: 0; padding: 4px 8px; box-sizing: border-box;" autofocus />
          <span class="cmd_palette_close icon" role="button" title="Close (Esc)" aria-label="Close" style="cursor: pointer;"></span>
        </div>
        <ul class="cmd_palette_list command-list" role="listbox" style="max-height: 320px; overflow-y: auto; margin: 0; padding: 4px 0; list-style: none;"></ul>
        <div class="cmd_palette_footer" style="display: flex; justify-content: space-around; padding: 8px 16px; border-top: 1px solid var(--table-borders, #ccc); font-size: 11px; color: var(--grey, #666); background-color: var(--fh-bg, #f5f5f5);">
          <span><kbd style="font-family: var(--font-family-mono, monospace); background: var(--btn-bg, #eee); border: 1px solid var(--btn-border, #ccc); border-radius: 3px; padding: 1px 4px;">&uarr;</kbd><kbd style="font-family: var(--font-family-mono, monospace); background: var(--btn-bg, #eee); border: 1px solid var(--btn-border, #ccc); border-radius: 3px; padding: 1px 4px;">&darr;</kbd> Navigate</span>
          <span><kbd style="font-family: var(--font-family-mono, monospace); background: var(--btn-bg, #eee); border: 1px solid var(--btn-border, #ccc); border-radius: 3px; padding: 1px 4px;">&crarr;</kbd> Select</span>
          <span><kbd style="font-family: var(--font-family-mono, monospace); background: var(--btn-bg, #eee); border: 1px solid var(--btn-border, #ccc); border-radius: 3px; padding: 1px 4px;">Esc</kbd> Dismiss</span>
        </div>
      </div>
    `;

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

  getAttribute(name) {
    this.init();
    return super.getAttribute(name);
  }

  connectedCallback() {
    this.init();
  }

  getCommands() {
    const commandMap = StateManager.getState('cmd') || cmd;
    return Object.entries(commandMap).map(([id, c]) => ({
      id,
      label: c.label || id,
      description: c.description || c.label || id,
      key: c.k ? `${c.ctrl ? 'Ctrl+' : ''}${c.shift ? 'Shift+' : ''}${c.alt ? 'Alt+' : ''}${c.k}` : '',
      run: c.run
    }));
  }

  filterCommands() {
    this.init();
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
    this.filteredCommands.forEach((cmdItem, idx) => {
      const li = document.createElement('li');
      li.className = `cmd_palette_item command-item ${idx === this.selectedIndex ? 'selected' : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === this.selectedIndex ? 'true' : 'false');
      li.setAttribute('data-index', idx);
      li.innerHTML = `
        <span class="cmd_palette_item_label">${cmdItem.description}</span>
        ${cmdItem.key ? `<span class="cmd_palette_item_shortcut command-key">${cmdItem.key}</span>` : ''}
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
    this.style.display = 'block';
    if (this.inputEl) {
      this.inputEl.value = '';
    }
    this.filterCommands();
    if (this.inputEl) {
      setTimeout(() => this.inputEl.focus(), 10);
    }
    StateManager.setState('commandPaletteOpen', true);
  }

  close() {
    this.init();
    this.style.display = 'none';
    StateManager.setState('commandPaletteOpen', false);
  }

  toggle() {
    this.init();
    if (this.style.display === 'none' || !this.style.display) {
      this.open();
    } else {
      this.close();
    }
  }
}

if (!customElements.get('ui-command-palette')) {
  customElements.define('ui-command-palette', CommandPalette);
}

export { CommandPalette };

