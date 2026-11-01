/**
 * @file app/js/AppLayout.js
 * Application shell chrome: header action bar, footer status bar & coordinate jumper,
 * command palette (<ui-command-palette>) and context menu (<ui-cmenu>).
 * AppLayout.init() fills the shared `dom` registry (state.js).
 */

import { defineEl, cycleFocus, bindOverlayKeys, escapeHtml, fuzzyScore, formatCellHtml } from './utils.js';
import { Glyph } from './Glyph.js';
import { dom, getSheet, getCsvHandle, pwa, formatShortcut } from './state.js';
import { DialogManager } from './Dialogs.js';
import { triggerAppInstall } from './Notification.js';

let isEditingCoords = false;

export class AppLayout {
  static init(commands) {
    const byId = (id) => document.getElementById(id);
    Object.assign(dom, {
      header: byId('header'),
      body: document.body,
      content: byId('content'),
      mainContainer: byId('main-container'),
      popupStack: byId('popup-stack'),
      validationPane: byId('validation-pane'),
      macroPane: byId('macro-pane'),
      fileInfoPane: byId('file-info-pane'),
      dialog: byId('dialog'),
      palette: byId('palette'),
      contextMenu: document.createElement('ui-cmenu'),
      footer: {
        left: byId('footer-left'),
        center: byId('footer-center'),
        right: byId('footer-right'),
        lock: byId('lock'),
      },
    });

    DialogManager.init(dom.dialog);
    dom.palette.commands = commands;
    dom.contextMenu.commands = commands;
    dom.body.appendChild(dom.contextMenu);
    initFooterEvents();
    buildMenu(commands);
  }
}

function initFooterEvents() {
  const { left, lock } = dom.footer;
  left.title = 'Click to jump to cell';
  left.addEventListener('click', (e) => {
    if (!e.target.closest('.coord-editor')) startCoordEdit();
  });
  lock.addEventListener('click', () => getSheet()?.warnIfLocked('View-Only Mode'));
}

export function startCoordEdit(sheet = getSheet()) {
  const footer = dom.footer;
  if (!sheet || isEditingCoords) return;
  isEditingCoords = true;

  const currentCol = sheet.x + 1;
  const currentRow = sheet.y + 1;

  footer.left.classList.add('editing');
  footer.left.innerHTML = `
    <span class="coord-editor">
      <input type="number" class="coord-input coord-col" min="1" value="${currentCol}" aria-label="Column" title="Column" />
      <span class="coord-sep">:</span>
      <input type="number" class="coord-input coord-row" min="1" value="${currentRow}" aria-label="Row" title="Row" />
      <ui-glyph icon="arrow_right" class="coord-go-btn" title="Go to cell (Enter)"></ui-glyph>
    </span>
  `;

  const inputCol = footer.left.querySelector('.coord-col');
  const inputRow = footer.left.querySelector('.coord-row');
  const goBtn = footer.left.querySelector('.coord-go-btn');
  const container = footer.left.querySelector('.coord-editor');

  let committed = false;
  const finish = (apply) => {
    if (committed) return;
    committed = true;
    isEditingCoords = false;
    footer.left.classList.remove('editing');
    if (apply) {
      const col = Math.max(1, parseInt(inputCol.value, 10) || currentCol);
      const row = Math.max(1, parseInt(inputRow.value, 10) || currentRow);
      sheet.focusCell(col - 1, row - 1);
      sheet.refresh();
    }
    updateFooter(sheet);
  };

  const focusables = [inputCol, inputRow, goBtn];
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.stopPropagation();
      cycleFocus(e, focusables);
      document.activeElement.select();
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(e.key === 'Enter');
    }
  });

  goBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); finish(true); });
  container.addEventListener('click', (e) => e.stopPropagation());
  container.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!committed && !container.contains(document.activeElement)) finish(true);
    }, 100);
  });

  inputCol.focus();
  inputCol.select();
}

export function updateFooter(sheet = getSheet()) {
  const footer = dom.footer;
  if (!sheet || !footer || isEditingCoords) return;

  const actualY = sheet.getRowIndex(sheet.y);
  const startYDisplay = actualY >= 0 ? actualY + 1 : sheet.y + 1;

  if (sheet.rangeEnd) {
    const deltaX = Math.abs(sheet.rangeEnd.x - sheet.x) + 1;
    const actualRangeY = sheet.getRowIndex(sheet.rangeEnd.y);
    const endYDisplay = actualRangeY >= 0 ? actualRangeY + 1 : sheet.rangeEnd.y + 1;
    const deltaY = Math.abs(endYDisplay - startYDisplay) + 1;
    footer.left.innerHTML = `${sheet.x + 1}:${startYDisplay} to ${sheet.rangeEnd.x + 1}:${endYDisplay} (${deltaX}x${deltaY})`;
  } else {
    footer.left.innerHTML = `${sheet.x + 1}:${startYDisplay}`;
  }

  footer.right.innerHTML = sheet.filterRows
    ? `${sheet.df.width}:${sheet.filterRows.length} (${sheet.df.height})`
    : `${sheet.df.width}:${sheet.df.height}`;

  const cellValue = (actualY >= 0 && actualY < sheet.df.height) ? sheet.df.get(sheet.x, actualY) : '';
  footer.center.innerHTML = formatCellHtml(cellValue, true);

  const lockReason = sheet.lockReason;
  const isLocked = lockReason !== null;
  const hasFileHandle = Boolean(getCsvHandle()?.handle);

  let lockIcon = 'edit_square';
  let lockTitle = hasFileHandle ? 'Unsaved changes relative to disk' : 'New file edit';
  if (isLocked) {
    lockIcon = 'lock';
    lockTitle = lockReason === 'filter' ? 'Locked (filter active)' : 'Locked (view-only mode)';
  } else if (hasFileHandle && sheet.df.isSaved) {
    lockIcon = 'save_disk';
    lockTitle = 'File saved (no edits ongoing)';
  }

  footer.lock.icon = lockIcon;
  footer.lock.label = lockTitle;
  footer.lock.variant = isLocked ? 'warning' : 'status';
  dom.fileInfoPane?.refresh?.();
}

function buildMenu(commands) {
  const menuItems = [
    'new', 'open', 'save', 'reloadFile', 'fileInfo', 'undo', 'redo', '',
    'fixTop', 'sortAscending', 'sortDescending', 'transpose', 'trim', 'date', 'integer', 'decimal', 'validateData', 'macros',
    'filter', 'find', '', 'about', 'settings', 'shortcuts'
  ];

  for (const itemId of menuItems) {
    if (!itemId) {
      const spacer = document.createElement('div');
      spacer.className = 'grow';
      dom.header.appendChild(spacer);
      continue;
    }
    const command = commands[itemId];
    const shortcut = formatShortcut(command);
    const label = command.label || command.description || itemId;
    dom.header.appendChild(new Glyph(command.icon || itemId, {
      title: shortcut ? `${label} (${shortcut})` : label,
      onClick: () => command.run(),
    }));
  }

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.id = 'menu-install-btn';
  installBtn.className = 'menu-install-btn';
  installBtn.title = 'Install Desktop App';
  installBtn.setAttribute('aria-label', 'Install Desktop App');
  installBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>Install</span>
  `;
  installBtn.addEventListener('click', () => triggerAppInstall());
  pwa.subscribe((state) => installBtn.classList.toggle('hidden', !state.canInstall));
  dom.header.appendChild(installBtn);
}

// --- Command Palette (<ui-command-palette>) ---

export class CommandPalette extends HTMLElement {
  constructor() {
    super();
    this.commands = {};
    this.selectedIndex = 0;
    this.filteredCommands = [];
  }

  connectedCallback() {
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
    this.classList.toggle('open', false);

    this.inputEl = this.querySelector('input');
    this.listEl = this.querySelector('.cmd-palette-list');
    this.closeBtn = this.querySelector('.cmd-palette-close');

    this.querySelector('.cmd-palette-backdrop').addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());
    this.inputEl.addEventListener('input', () => this.filterCommands());
    this.handleOverlayKey = bindOverlayKeys(this, {
      onEscape: () => this.close(),
      getFocusables: () => [this.inputEl, this.closeBtn],
      resumeFocus: false,
    });
    this.addEventListener('keydown', (e) => this.handleListKeys(e));
  }

  get isOpen() { return this.classList.contains('open'); }

  getCommands() {
    const canInstall = pwa.getState().canInstall;
    return Object.entries(this.commands)
      .filter(([id]) => id !== 'installApp' || canInstall)
      .map(([id, cmd]) => ({
        id,
        label: cmd.label || id,
        description: cmd.description || cmd.label || id,
        shortcut: formatShortcut(cmd),
        run: cmd.run
      }));
  }

  filterCommands() {
    const query = this.inputEl.value.trim();
    const allCommands = this.getCommands();

    this.filteredCommands = !query ? allCommands : allCommands
      .map(command => ({
        command,
        score: Math.max(fuzzyScore(query, command.description), fuzzyScore(query, command.label) * 0.95, fuzzyScore(query, command.id) * 0.9)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.command);
    this.selectedIndex = 0;
    this.renderList();
  }

  setSelectedIndex(index, scrollIntoView = true) {
    if (index < 0 || index >= this.filteredCommands.length) return;
    const prevEl = this.listEl.children[this.selectedIndex];
    if (prevEl) {
      prevEl.classList.remove('selected');
      prevEl.setAttribute('aria-selected', 'false');
    }
    this.selectedIndex = index;
    const currentEl = this.listEl.children[index];
    if (currentEl) {
      currentEl.classList.add('selected');
      currentEl.setAttribute('aria-selected', 'true');
      if (scrollIntoView) currentEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  renderList() {
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

    this.listEl.children[this.selectedIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  handleListKeys(event) {
    if (event.defaultPrevented) return;
    const len = this.filteredCommands.length;
    if (event.key === 'ArrowDown' && len > 0) {
      event.preventDefault();
      this.setSelectedIndex((this.selectedIndex + 1) % len, true);
    } else if (event.key === 'ArrowUp' && len > 0) {
      event.preventDefault();
      this.setSelectedIndex((this.selectedIndex - 1 + len) % len, true);
    } else if (event.key === 'Enter' && document.activeElement !== this.closeBtn) {
      event.preventDefault();
      this.executeIndex(this.selectedIndex);
    }
  }

  executeIndex(index) {
    const item = this.filteredCommands[index];
    if (!item) return;
    this.close();
    item.run();
  }

  open() {
    this.classList.toggle('open', true);
    this.inputEl.value = '';
    this.filterCommands();
    setTimeout(() => this.inputEl.focus(), 10);
  }

  close() {
    this.classList.toggle('open', false);
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }
}

// --- Context Menu (<ui-cmenu>) ---

export class ContextMenu extends HTMLElement {
  constructor() {
    super();
    this.commands = {};
    this.table = document.createElement('table');
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'cmenu-header';
    this.targetCol = null;

    // [menu item id, label, symbol, command id]
    this.items = [
      ['filter', 'Filter', '', 'filter'],
      ['sortAsc', 'Sort', 'A<br>Z', 'sortAscending'],
      ['sortDesc', 'Sort', 'Z<br>A', 'sortDescending'],
      ['roundInt', 'Round', 'N', 'integer'],
      ['roundDec', 'Round', '$', 'decimal'],
      ['insertCol', 'Insert', '&verbar;', 'insertLeft'],
      ['insertRow', 'Insert', '&horbar;', 'insertUp'],
      ['deleteCol', 'Delete', '&verbar;', 'deleteCol'],
      ['deleteRow', 'Delete', '&horbar;', 'deleteRow'],
    ].map(([id, label, symbol, commandId]) => ({ id, label, symbol, commandId }));

    for (const item of this.items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><div>${item.label}</div></td>${item.symbol ? `<td><div class="cmenu-opt">${item.symbol}</div></td>` : ''}`;
      tr.addEventListener('click', () => {
        this.hide();
        this.commands[item.commandId].run(item.id === 'filter' ? this.targetCol : undefined);
      });
      this.table.appendChild(tr);
    }

    this.addEventListener('mouseout', (e) => {
      if (!this.contains(e.relatedTarget)) this.hide();
    });
  }

  connectedCallback() {
    if (!this.headerEl.parentNode) this.append(this.headerEl, this.table);
    this.hide();
  }

  hide() { this.classList.toggle('open', false); }

  showItems(visibleIds) {
    this.items.forEach((item, i) => this.table.rows[i].classList.toggle('hidden', !visibleIds.includes(item.id)));
  }

  openAt(event) {
    const sheet = getSheet();
    const targetCell = event.target.closest('td, th');
    if (!sheet || !targetCell || !sheet.contains(targetCell) || (targetCell.colOffset < 0 && targetCell.rowOffset < 0)) return;

    const { colOffset, rowOffset } = targetCell;
    const menuWidth = 140, menuHeight = 220;
    this.style.left = `${event.clientX + menuWidth > window.innerWidth ? Math.max(0, event.clientX - menuWidth) : event.clientX - 2}px`;
    this.style.top = `${event.clientY + menuHeight > window.innerHeight ? Math.max(0, event.clientY - menuHeight) : event.clientY - 2}px`;

    if (rowOffset < 0) {
      this.targetCol = colOffset + sheet.baseX;
      sheet.selectCol(this.targetCol);
      this.headerEl.innerText = `col : ${targetCell.innerText}`;
      this.showItems(['filter', 'sortAsc', 'sortDesc', 'roundInt', 'roundDec', 'insertCol', 'deleteCol']);
    } else if (colOffset < 0) {
      this.targetCol = null;
      sheet.selectRow(rowOffset + sheet.baseY);
      this.headerEl.innerText = `row : ${targetCell.innerText}`;
      this.showItems(['roundInt', 'roundDec', 'insertRow', 'deleteRow']);
    } else if (targetCell.classList.contains('selected')) {
      this.targetCol = null;
      this.headerEl.innerText = 'selection';
      this.showItems(['roundInt', 'roundDec', 'deleteCol', 'deleteRow']);
    } else {
      this.targetCol = colOffset + sheet.baseX;
      sheet.x = colOffset + sheet.baseX;
      sheet.y = rowOffset + sheet.baseY;
      sheet.refreshSelection();
      this.headerEl.innerText = 'cell';
      this.showItems(['roundInt', 'roundDec', 'insertCol', 'insertRow', 'deleteCol', 'deleteRow']);
    }

    this.classList.toggle('open', true);
  }
}

defineEl('ui-command-palette', CommandPalette);
defineEl('ui-cmenu', ContextMenu);
