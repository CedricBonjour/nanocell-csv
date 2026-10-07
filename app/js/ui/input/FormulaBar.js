/**
 * FormulaBar - Coordinate display and formula input synchronization component.
 * Bridges cell coordinates (A1 reference and x:y) and text inputs with StateManager and Sheet.
 * @module FormulaBar
 */
import { StateManager } from '../../StateManager.js';

/**
 * Converts zero-indexed column and row coordinates to A1 notation.
 * @param {number} x - Column index (0-indexed).
 * @param {number} y - Row index (0-indexed).
 * @returns {string} Cell reference in A1 notation (e.g., A1, B2, AA10).
 */
function toA1(x, y) {
  let colStr = '';
  let col = x;
  while (col >= 0) {
    colStr = String.fromCharCode((col % 26) + 65) + colStr;
    col = Math.floor(col / 26) - 1;
  }
  return `${colStr}${y + 1}`;
}

class FormulaBar extends HTMLElement {
  constructor() {
    super();
    this.sheet = null;
    this.coordEl = document.createElement('span');
    this.coordEl.className = 'formula-coord';
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'formula-input';
  }

  connectedCallback() {
    this.appendChild(this.coordEl);
    this.appendChild(this.inputEl);
    this.bindEvents();
  }

  bindSheet(sheet) {
    this.sheet = sheet;
    this.sync();
  }

  bindEvents() {
    StateManager.on('state:activeCell', () => this.sync());
    StateManager.on('cell:edited', () => this.sync());

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const s = this.sheet || StateManager.getState('sheet');
        if (s && s.df) {
          s.df.edit(s.x, s.y, this.inputEl.value);
          s.refresh();
        }
      }
    });
  }

  sync() {
    const s = this.sheet || StateManager.getState('sheet');
    if (!s || !s.df) return;
    this.coordEl.textContent = `${toA1(s.x, s.y)} (${s.x + 1}:${s.y + 1})`;
    this.inputEl.value = s.df.get(s.x, s.y) || '';
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ui-formula-bar')) {
  customElements.define('ui-formula-bar', FormulaBar);
}

export { FormulaBar, toA1 };
