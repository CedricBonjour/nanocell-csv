import { getSheet, getCsvHandle, Setting, pwa, formatShortcut } from './state.js';
import { AboutDialog, SettingDialog, DialogManager } from './Dialogs.js';
import { triggerAppInstall } from './Notification.js';
import { dom, startCoordEdit } from './AppLayout.js';
import { ValidationPane, MacroPane } from './ValidationPane.js';
import { VALIDATION_RULES } from '../core/DataValidator.js';
import { BaseElement, defineEl, setOpen, isOpen, cycleFocus, escapeHtml, fuzzyScore, getShortcutKey, isInputElement } from './utils.js';

export class CommandPalette extends BaseElement {
  static _defaultCommands = null;

  static setDefaultCommands(commandMap) {
    CommandPalette._defaultCommands = commandMap;
    const existing = globalThis.document?.getElementById?.('palette') || globalThis.document?.querySelector?.('ui-command-palette');
    if (existing) existing.commands = commandMap;
  }

  constructor() {
    super();
    this.commands = CommandPalette._defaultCommands || null;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    this._initialized = false;
  }

  connectedCallback() {
    this.init();
    this.commands ||= CommandPalette._defaultCommands;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');
    this.innerHTML = `
      <div class="cmd-palette-backdrop"></div>
      <div class="cmd-palette-modal floating-panel">
        <div class="cmd-palette-header">
          <input type="text" class="cmd-palette-input" placeholder="Type a command or search..." autofocus />
          <ui-glyph icon="off" variant="close" class="cmd-palette-close" title="Close (Esc)"></ui-glyph>
        </div>
        <ul class="cmd-palette-list" role="listbox"></ul>
        <div class="cmd-palette-footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
          <span><kbd>&crarr;</kbd> Select</span>
          <span><kbd>Esc</kbd> Dismiss</span>
        </div>
      </div>
    `;
    setOpen(this, false);

    this.backdropEl = this.querySelector('.cmd-palette-backdrop');
    this.inputEl = this.querySelector('input');
    this.listEl = this.querySelector('.cmd-palette-list');
    this.closeBtn = this.querySelector('.cmd-palette-close');

    this.backdropEl?.addEventListener('click', () => this.close());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.inputEl?.addEventListener('input', () => this.filterCommands());
    this.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  get isOpen() { return isOpen(this); }

  getCommands() {
    const canInstall = pwa.getState().canInstall;
    const commandMap = this.commands || CommandPalette._defaultCommands || {};
    return Object.entries(commandMap)
      .filter(([id, cmd]) => cmd && typeof cmd.run === 'function' && (id !== 'installApp' || canInstall))
      .map(([id, cmd]) => ({
        id,
        label: cmd.label || id,
        description: cmd.description || cmd.label || id,
        shortcut: formatShortcut(cmd),
        run: cmd.run
      }));
  }

  filterCommands() {
    this.commands ||= CommandPalette._defaultCommands;
    const query = (this.inputEl?.value || '').trim();
    const allCommands = this.getCommands();

    this.filteredCommands = !query ? allCommands : allCommands
      .map(command => ({
        command,
        score: Math.max(fuzzyScore(query, command.description), fuzzyScore(query, command.label || '') * 0.95, fuzzyScore(query, command.id) * 0.9)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.command);
    this.selectedIndex = 0;
    this.renderList();
  }

  setSelectedIndex(index, scrollIntoView = true) {
    if (index < 0 || index >= this.filteredCommands.length) return;
    if (this.listEl?.children.length > 0) {
      const prevEl = this.listEl.children[this.selectedIndex];
      if (prevEl) {
        prevEl.classList.remove('selected');
        prevEl.setAttribute('aria-selected', 'false');
      }
      this.selectedIndex = index;
      const currentEl = this.listEl.children[this.selectedIndex];
      if (currentEl) {
        currentEl.classList.add('selected');
        currentEl.setAttribute('aria-selected', 'true');
        if (scrollIntoView) {
          try { currentEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch {}
        }
      }
    } else {
      this.selectedIndex = index;
    }
  }

  renderList() {
    if (!this.listEl) return;
    if (this.filteredCommands.length === 0) {
      this.listEl.innerHTML = '<li class="cmd-palette-empty">No matching commands</li>';
      return;
    }

    this.listEl.innerHTML = '';
    this.filteredCommands.forEach((cmd, idx) => {
      const li = document.createElement('li');
      const isSelected = idx === this.selectedIndex;
      li.className = `cmd-palette-item ${isSelected ? 'selected' : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(isSelected));
      li.setAttribute('data-index', idx);
      li.innerHTML = `
        <span class="cmd-palette-item-label">${escapeHtml(cmd.description)}</span>
        ${cmd.shortcut ? `<span class="cmd-palette-item-shortcut">${escapeHtml(cmd.shortcut)}</span>` : ''}
      `;
      li.addEventListener('mouseenter', () => this.setSelectedIndex(idx, false));
      li.addEventListener('click', () => this.executeIndex(idx));
      this.listEl.appendChild(li);
    });

    try { this.listEl.children[this.selectedIndex]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch {}
  }

  handleKeyDown(event) {
    if (event.defaultPrevented) return;
    const len = this.filteredCommands.length;
    if (event.key === 'Tab') {
      event.stopPropagation();
      cycleFocus(event, [this.inputEl, this.closeBtn].filter(Boolean));
    } else if (event.key === 'ArrowDown' && len > 0) {
      event.preventDefault();
      this.setSelectedIndex((this.selectedIndex + 1) % len, true);
    } else if (event.key === 'ArrowUp' && len > 0) {
      event.preventDefault();
      this.setSelectedIndex((this.selectedIndex - 1 + len) % len, true);
    } else if (event.key === 'Enter' && globalThis.document?.activeElement !== this.closeBtn) {
      event.preventDefault();
      this.executeIndex(this.selectedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  executeIndex(index) {
    const item = this.filteredCommands[index];
    if (typeof item?.run === 'function') {
      this.close();
      item.run();
    }
  }

  open() {
    this.init();
    this.commands ||= CommandPalette._defaultCommands;
    setOpen(this, true);
    if (this.inputEl) this.inputEl.value = '';
    this.filterCommands();
    setTimeout(() => this.inputEl?.focus(), 10);
  }

  close() {
    setOpen(this, false);
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  static toggle(commandMap = null) {
    const doc = globalThis.document;
    let palette = doc?.getElementById?.('palette') || doc?.querySelector?.('ui-command-palette');
    if (!palette && doc) {
      palette = doc.createElement('ui-command-palette');
      palette.id = 'palette';
      doc.body.appendChild(palette);
    }
    if (palette) {
      palette.commands = commandMap || CommandPalette._defaultCommands || palette.commands;
      palette.toggle?.();
    }
    return palette;
  }
}

export class ContextMenu extends BaseElement {
  constructor() {
    super();
    this.table = document.createElement('table');
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'cmenu-header';
    this.targetCol = null;

    this.items = [
      { id: 'filter', label: 'Filter', symbol: '', run: () => commands.filter?.run(this.targetCol) },
      { id: 'sortAsc', label: 'Sort', symbol: 'A<br>Z', run: (e) => commands.sortAscending?.run(e) },
      { id: 'sortDesc', label: 'Sort', symbol: 'Z<br>A', run: (e) => commands.sortDescending?.run(e) },
      { id: 'roundInt', label: 'Round', symbol: 'N', run: (e) => commands.integer?.run(e) },
      { id: 'roundDec', label: 'Round', symbol: '$', run: (e) => commands.decimal?.run(e) },
      { id: 'insertCol', label: 'Insert', symbol: '&verbar;', run: (e) => commands.insertLeft?.run(e) },
      { id: 'insertRow', label: 'Insert', symbol: '&horbar;', run: (e) => commands.insertUp?.run(e) },
      { id: 'deleteCol', label: 'Delete', symbol: '&verbar;', run: (e) => commands.deleteCol?.run(e) },
      { id: 'deleteRow', label: 'Delete', symbol: '&horbar;', run: (e) => commands.deleteRow?.run(e) },
    ];

    this.addEventListener('mouseout', (e) => {
      if (!this.contains(e.relatedTarget)) this.hide();
    });
  }

  hide() { setOpen(this, false); }

  ensureInitialized() {
    if (this._menuInitialized) return;
    this._menuInitialized = true;
    this.table.innerHTML = '';
    for (const item of this.items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><div>${item.label}</div></td>${item.symbol ? `<td><div class="cmenu-opt">${item.symbol}</div></td>` : ''}`;
      tr.addEventListener('click', (e) => { this.hide(); item.run(e); });
      this.table.appendChild(tr);
    }
    if (!this.headerEl.parentNode) this.append(this.headerEl, this.table);
  }

  connectedCallback() {
    this.hide();
    this.ensureInitialized();
  }

  showItems(visibleIds) {
    for (let i = 0; i < this.items.length; i++) {
      this.table.rows[i].classList.toggle('hidden', !visibleIds.includes(this.items[i].id));
    }
  }

  openAt(event) {
    this.ensureInitialized();
    const sheet = getSheet();
    const targetCell = event.target.closest?.('td, th');
    if (!sheet || !targetCell || !sheet.contains(targetCell) || (targetCell.colOffset < 0 && targetCell.rowOffset < 0)) return;

    this.colOffset = targetCell.colOffset;
    this.rowOffset = targetCell.rowOffset;

    const menuWidth = 140, menuHeight = 220;
    const winW = globalThis.window?.innerWidth || Infinity;
    const winH = globalThis.window?.innerHeight || Infinity;
    this.style.left = `${event.clientX + menuWidth > winW ? Math.max(0, event.clientX - menuWidth) : event.clientX - 2}px`;
    this.style.top = `${event.clientY + menuHeight > winH ? Math.max(0, event.clientY - menuHeight) : event.clientY - 2}px`;

    if (this.rowOffset < 0) {
      this.targetCol = this.colOffset + sheet.baseX;
      sheet.selectCol(this.targetCol);
      this.headerEl.innerText = `col : ${targetCell.innerText}`;
      this.showItems(['filter', 'sortAsc', 'sortDesc', 'roundInt', 'roundDec', 'insertCol', 'deleteCol']);
    } else if (this.colOffset < 0) {
      this.targetCol = null;
      sheet.selectRow(this.rowOffset + sheet.baseY);
      this.headerEl.innerText = `row : ${targetCell.innerText}`;
      this.showItems(['roundInt', 'roundDec', 'insertRow', 'deleteRow']);
    } else if (targetCell.classList.contains('selected')) {
      this.targetCol = null;
      this.headerEl.innerText = 'selection';
      this.showItems(['roundInt', 'roundDec', 'deleteCol', 'deleteRow']);
    } else {
      this.targetCol = targetCell.colOffset + sheet.baseX;
      sheet.x = targetCell.colOffset + sheet.baseX;
      sheet.y = targetCell.rowOffset + sheet.baseY;
      sheet.refreshSelection();
      this.headerEl.innerText = 'cell';
      this.showItems(['roundInt', 'roundDec', 'insertCol', 'insertRow', 'deleteCol', 'deleteRow']);
    }

    setOpen(this, true);
  }
}

defineEl('ui-command-palette', CommandPalette);
defineEl('ui-cmenu', ContextMenu);

const commands = {
  about: { label: 'About', key: 'H', ctrl: true, run: () => AboutDialog.show(), description: 'About' },
  installApp: { label: 'Install Desktop App', run: () => triggerAppInstall(), description: 'Install NanoCell as standalone desktop app' },
  new: { label: 'New Sheet', key: 'N', ctrl: true, run: () => getCsvHandle()?.new(), description: 'New sheet' },
  deleteRow: { label: 'Delete Row', key: 'BACKSPACE', ctrl: true, run: () => getSheet()?.deleteRows(), description: 'Delete Row' },
  deleteCol: { label: 'Delete Col', key: 'BACKSPACE', ctrl: true, shift: true, run: () => getSheet()?.deleteCols(), description: 'Delete Col' },
  delete: { label: 'Delete Selection', key: 'BACKSPACE', run: () => getSheet()?.deleteSelection(), description: 'Delete Selection' },
  settings: { label: 'Settings', key: ',', ctrl: true, run: () => SettingDialog.show(), description: 'Display Settings' },
  shortcuts: { label: 'Command Palette', key: 'P', ctrl: true, run: () => CommandPalette.toggle(commands), description: 'Command Palette' },
  selectAll: { label: 'Select All', key: 'A', ctrl: true, run: () => getSheet()?.selectAll(), description: 'Select All' },
  transpose: { label: 'Transpose', key: 'T', ctrl: true, shift: true, run: () => getSheet()?.transposeSelection(), description: 'Transpose rows and columns (selection or whole sheet)' },
  trim: { label: 'Trim Empty Rows/Cols', key: 'T', ctrl: true, alt: true, run: () => getSheet()?.trim(), description: 'Trim : remove all empty rows/cols' },
  integer: { label: 'Round to Integer', key: 'I', ctrl: true, run: () => getSheet()?.round(true), description: 'Round selection to integer' },
  decimal: { label: 'Round to Decimal', key: '$', ctrl: true, run: () => getSheet()?.round(false), description: 'Round selection to decimal' },
  fixTop: { label: 'Freeze Header Row', icon: 'fix_top', key: 'B', ctrl: true, run: () => getSheet()?.toggleFixTop(), description: 'Freeze Header Row' },
  undo: { label: 'Undo', key: 'Z', ctrl: true, run: () => getSheet()?.undo(), description: 'Undo' },
  redo: { label: 'Redo', key: 'Z', ctrl: true, shift: true, run: () => getSheet()?.redo(), description: 'Redo' },
  date: { label: "Insert Today's Date", key: ';', ctrl: true, run: () => getSheet()?.insertDate(), description: "Insert today's date" },
  filter: { label: 'Filter Column', key: 'Q', ctrl: true, run: (col) => getSheet()?.openFilter(col), description: 'Filter sheet rows by column value' },
  find: { label: 'Find & Match', key: 'F', ctrl: true, run: () => getSheet()?.find(false), description: 'Quick find / match' },
  findAdvanced: { label: 'Advanced Find / Replace', key: 'F', ctrl: true, shift: true, run: () => getSheet()?.find(true), description: 'Advanced find / replace' },
  toggleActionBar: { label: 'Toggle Menu Bar', key: 'M', ctrl: true, run: () => Setting.toggleActionBar(), description: 'Toggle action bar display' },
  open: { label: 'Open File', key: 'O', ctrl: true, run: () => getCsvHandle()?.open(), description: 'Open a CSV file from the file finder' },
  save: { label: 'Save', key: 'S', ctrl: true, run: () => getCsvHandle()?.save(), description: 'Save' },
  saveAs: { label: 'Save As', key: 'S', ctrl: true, shift: true, run: () => getCsvHandle()?.saveAs(), description: 'Save As' },
  reloadFile: { label: 'Reload File', icon: 'reload_file', key: 'R', ctrl: true, run: () => getCsvHandle()?.reloadFile(), description: 'Reload file from last save' },
  expand: { label: 'Expand Row', key: 'E', ctrl: true, run: () => getSheet()?.expand(), description: 'Expand first row to selection' },
  validateData: { label: 'Validate Data: Open Pane', icon: 'validate_data', key: 'P', ctrl: true, shift: true, run: () => ValidationPane.toggle(), description: 'Open data validation pane with all validation rules' },
  macros: { label: 'Macros: Open Pane', icon: 'macro', key: 'M', ctrl: true, shift: true, run: () => MacroPane.toggle(), description: 'Open macros pane to run or edit validation macros' },
  nextOccurrence: { label: 'Next Occurrence', key: 'D', ctrl: true, run: () => getSheet()?.goToOccurrence(true), description: 'Go to next occurrence of cell value' },
  prevOccurrence: { label: 'Previous Occurrence', key: 'D', ctrl: true, shift: true, run: () => getSheet()?.goToOccurrence(false), description: 'Go to previous occurrence of cell value' },
  goToCoordinate: { label: 'Go to Coordinate', key: 'G', ctrl: true, run: () => startCoordEdit(), description: 'Go to coordinate' },
  sortAscending: { label: 'Sort Ascending', icon: 'sort', key: 'L', ctrl: true, run: () => { const s = getSheet(); s?.sort(s.x, true); }, description: 'Sort rows based on active column (ascending order)' },
  sortDescending: { label: 'Sort Descending', icon: 'sort_reverse', key: 'L', ctrl: true, shift: true, run: () => { const s = getSheet(); s?.sort(s.x, false); }, description: 'Sort rows based on active column (descending order)' },
  shiftUp: { label: 'Shift Row Up', key: 'ARROWUP', alt: true, run: () => getSheet()?.shift(0), description: 'Shift row up' },
  shiftDown: { label: 'Shift Row Down', key: 'ARROWDOWN', alt: true, run: () => getSheet()?.shift(2), description: 'Shift row down' },
  shiftRight: { label: 'Shift Col Right', key: 'ARROWRIGHT', alt: true, run: () => getSheet()?.shift(1), description: 'Shift col right' },
  shiftLeft: { label: 'Shift Col Left', key: 'ARROWLEFT', alt: true, run: () => getSheet()?.shift(3), description: 'Shift col left' },
  insertUp: { label: 'Insert Row Above', key: 'ARROWUP', shift: true, alt: true, run: () => getSheet()?.insert(0), description: 'Insert row above' },
  insertDown: { label: 'Insert Row Below', key: 'ARROWDOWN', shift: true, alt: true, run: () => getSheet()?.insert(2), description: 'Insert row below' },
  insertRight: { label: 'Insert Col Right', key: 'ARROWRIGHT', shift: true, alt: true, run: () => getSheet()?.insert(1), description: 'Insert col right' },
  insertLeft: { label: 'Insert Col Left', key: 'ARROWLEFT', shift: true, alt: true, run: () => getSheet()?.insert(3), description: 'Insert col left' },
  exportJson: { label: 'Export as JSON', run: () => getCsvHandle()?.exportJson(), description: 'Export current sheet as JSON file' },
  exportTsv: { label: 'Export as TSV', run: () => getCsvHandle()?.exportTsv(), description: 'Export current sheet as Tab-Separated Values (TSV) file' },
  exportMarkdown: { label: 'Export as Markdown', run: () => getCsvHandle()?.exportMarkdown(), description: 'Export current sheet as GitHub Flavored Markdown table' },
  copyMarkdown: { label: 'Copy as Markdown', run: () => getCsvHandle()?.copyMarkdown(), description: 'Copy active selection as Markdown table to clipboard' },
  copyJson: { label: 'Copy as JSON', run: () => getCsvHandle()?.copyJson(), description: 'Copy active selection as JSON to clipboard' },
};

for (const r of VALIDATION_RULES) {
  commands[r.cmdId] = {
    get label() { return r.cmdLabel; },
    key: r.key,
    ctrl: r.ctrl,
    shift: r.shift,
    run: () => ValidationPane.run(r.id),
    get description() { return r.description; }
  };
}

CommandPalette.setDefaultCommands(commands);

let activeHandlers = null;
let shortcutMap = null;

function getShortcutMap() {
  if (!shortcutMap) {
    shortcutMap = new Map();
    for (const cmd of Object.values(commands)) {
      if (!cmd.key || typeof cmd.run !== 'function') continue;
      shortcutMap.set(getShortcutKey(cmd.key, Boolean(cmd.ctrl), Boolean(cmd.shift), Boolean(cmd.alt)), cmd);
    }
    if (commands.delete) shortcutMap.set(getShortcutKey('DELETE', false, false, false), commands.delete);
    if (commands.redo) shortcutMap.set(getShortcutKey('Y', true, false, false), commands.redo);
    if (commands.shortcuts) shortcutMap.set(getShortcutKey('K', true, false, false), commands.shortcuts);
  }
  return shortcutMap;
}

const PREVENT_DEFAULT_KEYS = new Set([
  'Y', 'K', ...Object.values(commands).filter(c => c.ctrl && c.key).map(c => String(c.key).toUpperCase())
]);

export function buildKeys() {
  shortcutMap = null;
  const doc = globalThis.document;
  if (!doc) return;

  if (activeHandlers) {
    for (const [evt, fn] of Object.entries(activeHandlers)) doc.removeEventListener(evt, fn);
  }

  const getClipboardSheet = (requireUnlocked = false) => {
    if (isInputElement(doc.activeElement)) return null;
    const sheet = getSheet();
    return (!sheet || (requireUnlocked && sheet.df?.lock)) ? null : sheet;
  };

  activeHandlers = {
    keydown: (event) => {
      let key = event.key.toUpperCase();
      const ctrlDown = event.metaKey || event.ctrlKey;
      const alt = event.altKey, shift = event.shiftKey;
      const activeSheet = getSheet();
      const activeEl = doc.activeElement;
      const isCellInput = Boolean(activeSheet?.isEditing && activeEl === activeSheet.inputField);
      const isOtherInput = isInputElement(activeEl) && !isCellInput;

      if (ctrlDown && PREVENT_DEFAULT_KEYS.has(key)) {
        if (!(isOtherInput || isCellInput) || (key !== 'C' && key !== 'V' && key !== 'X' && key !== 'A' && key !== 'Z')) {
          event.preventDefault();
        }
      }

      const palette = dom?.palette || doc.getElementById('palette') || doc.querySelector('ui-command-palette');
      if (activeEl?.closest?.('ui-command-palette') || palette?.isOpen) {
        if (key === 'ESCAPE') { event.preventDefault(); palette?.close?.(); }
        else if (key === 'TAB') palette?.handleKeyDown?.(event);
        return;
      }

      if (ctrlDown && (key === 'P' || key === 'K') && !shift && !alt) {
        event.preventDefault();
        return commands.shortcuts?.run ? commands.shortcuts.run() : palette?.toggle?.();
      }

      if (DialogManager.isBusy) {
        if (key === 'ESCAPE') { event.preventDefault(); DialogManager.close(); }
        else if (key === 'TAB') DialogManager.handleKeyDown(event);
        return;
      }

      if (activeEl?.closest?.('ui-finder')) {
        if (key === 'ESCAPE') { event.preventDefault(); activeEl.closest('ui-finder')?.close?.(); }
        else if (ctrlDown && key === 'F') { event.preventDefault(); activeSheet?.find(shift); }
        return;
      }

      if (activeEl?.closest?.('ui-filter')) {
        if (key === 'ESCAPE' || (ctrlDown && key === 'Q')) { event.preventDefault(); activeEl.closest('ui-filter')?.close?.(); }
        return;
      }

      if (activeEl?.closest?.('ui-msg')) return;

      const validationPane = dom?.validationPane || ValidationPane.getInstance();
      if (validationPane?.isOpen && key === 'ESCAPE' && !isCellInput) {
        event.preventDefault();
        validationPane.handleBack?.();
        return;
      }

      const macroPane = dom?.macroPane || MacroPane.getInstance();
      if (macroPane?.isOpen && key === 'ESCAPE' && !isCellInput) {
        event.preventDefault();
        macroPane.handleBack?.();
        return;
      }

      if (isOtherInput) return;

      if (isCellInput) {
        if (ctrlDown && (key === 'S' || key === 'O' || key === 'Q')) {
          event.preventDefault();
          if (key === 'S') (shift ? commands.saveAs : commands.save).run();
          else if (key === 'O') commands.open.run();
          else if (key === 'Q') commands.filter.run();
        }
        return;
      }

      const isBoundaryKey = key.startsWith('ARROW') || key === 'HOME' || key === 'END' || key === 'PAGEUP' || key === 'PAGEDOWN';
      if (activeSheet) activeSheet.isSelectingRange = shift && !alt && !event.metaKey && isBoundaryKey;

      if ((alt && key === 'TAB') || (ctrlDown && (key === 'C' || key === 'V'))) return;
      if (key === 'TAB') event.preventDefault();
      if (event.code === 'Space') key = 'SPACE';

      const matchedCmd = getShortcutMap().get(getShortcutKey(key, ctrlDown, shift, alt));
      if (matchedCmd) {
        matchedCmd.run();
        return event.preventDefault();
      }

      activeSheet?.handleKeyDown(event, key, ctrlDown, shift, alt);
    },

    keyup: (event) => {
      const key = event.key.toUpperCase();
      const activeSheet = getSheet();
      if (activeSheet && (key === 'CONTROL' || key === 'SHIFT') && !event.shiftKey) {
        activeSheet.isSelectingRange = false;
      }
    },

    copy: (event) => {
      const sheet = getClipboardSheet(false);
      if (sheet) { event.preventDefault(); event.clipboardData?.setData('text/plain', sheet.copySelection()); }
    },

    cut: (event) => {
      const sheet = getClipboardSheet(true);
      if (sheet) { event.preventDefault(); event.clipboardData?.setData('text/plain', sheet.cutSelection()); }
    },

    paste: (event) => {
      const sheet = getClipboardSheet(true);
      if (sheet) {
        event.preventDefault();
        const rawText = event.clipboardData?.getData('text');
        if (rawText) sheet.pasteText(rawText);
      }
    }
  };

  for (const [evt, fn] of Object.entries(activeHandlers)) doc.addEventListener(evt, fn);
}

export { commands };
