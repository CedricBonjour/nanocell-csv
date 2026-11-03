/**
 * @file app/js/AppLayout.js
 * Application shell chrome: header action bar, footer status bar & coordinate jumper,
 * command palette (<ui-command-palette>) and context menu (<ui-cmenu>).
 * AppLayout.init() fills the shared `dom` registry (state.js).
 */

import { defineEl, cycleFocus, bindOverlayKeys, escapeHtml, fuzzyScore, formatCellHtml, clamp } from './utils.js';
import { Glyph } from './Glyph.js';
import { dom, getSheet, getCsvHandle, pwa, formatShortcut, settings } from './state.js';
import { QUOTED_EMPTY_CELL } from '../core/Dataframe.js';
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
  lock.addEventListener('click', () => getSheet()?.unlock());
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
  footer.center.innerHTML = cellValue === QUOTED_EMPTY_CELL
    ? (settings.preserveQuotedEmpty ? '<span class="empty-string-badge">empty string</span>' : '')
    : formatCellHtml(cellValue, true);

  const lockReason = sheet.lockReason;
  const isLocked = lockReason !== null;
  const hasFileHandle = Boolean(getCsvHandle()?.handle);

  let lockIcon = 'edit_square';
  let lockTitle = hasFileHandle ? 'Unsaved changes relative to disk' : 'New file edit';
  if (isLocked) {
    lockIcon = 'lock';
    lockTitle = lockReason === 'filter'
      ? 'Locked (filter active)'
      : (lockReason === 'read-only' ? 'Locked (read-only mode — click to unlock)' : 'Locked (view-only mode)');
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
    'fixTop', ' ', 'sortAscending', 'sortDescending', ' ', 'transpose', 'trim', 'date', ' ', 'integer', 'decimal', ' ', 'validateData', 'macros', ' ',
    'filter', 'find', '', 'about', 'settings', 'shortcuts'
  ];

  let section = 0;
  for (const itemId of menuItems) {
    if (!itemId || itemId === ' ') {
      const spacer = document.createElement('div');
      const isGrow = !itemId;
      spacer.className = isGrow ? 'grow' : 'glyph-spacer';
      if (section === 1) spacer.classList.add('header-mid');
      if (isGrow) section++;
      dom.header.appendChild(spacer);
      continue;
    }
    const command = commands[itemId];
    const shortcut = formatShortcut(command);
    const label = command.label || command.description || itemId;
    dom.header.appendChild(new Glyph(command.icon || itemId, {
      cls: section === 1 ? 'header-mid' : '',
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
      .filter(([id]) => (id !== 'installApp' || canInstall) && (id !== 'emptyString' || settings.preserveQuotedEmpty))
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

const CMENU_ROW_DEFS = [
  {
    id: 'copy',
    label: 'Copy',
    actions: [
      { id: 'copyTsv', icon: 'tsv_file', title: 'Copy as TSV (Ctrl+C)', commandId: 'copyTsv' },
      { id: 'copyHtml', icon: 'table', title: 'Copy as HTML', commandId: 'copyHtml' },
      { id: 'copyMd', icon: 'md_file', title: 'Copy as Markdown', commandId: 'copyMarkdown' },
      { id: 'copyCsv', icon: 'csv_file', title: 'Copy as CSV', commandId: 'copyCsv' },
    ],
  },
  {
    id: 'trim',
    label: 'Trim',
    actions: [
      { id: 'trim', icon: 'trim', title: 'Trim Empty Rows/Cols (Ctrl+Alt+T)', commandId: 'trim' },
    ],
  },
  {
    id: 'toggleActionBar',
    label: 'Display action bar',
    actions: [
      { id: 'toggleActionBar', icon: 'menu', title: 'Toggle Action Bar (Ctrl+M)', commandId: 'toggleActionBar' },
    ],
  },
  {
    id: 'transpose',
    label: 'Transpose',
    actions: [
      { id: 'transpose', icon: 'transpose', title: 'Transpose Sheet (Ctrl+Shift+T)', commandId: 'transpose' },
    ],
  },
  {
    id: 'fixTop',
    label: 'Freeze header row',
    actions: [
      { id: 'fixTop', icon: 'fix_top', title: 'Freeze Header Row (Ctrl+B)', commandId: 'fixTop' },
    ],
  },
  {
    id: 'filter',
    label: 'Filter',
    actions: [
      { id: 'filter', icon: 'filter', title: 'Filter Column (Ctrl+Q)', commandId: 'filter', passCol: true },
    ],
  },
  {
    id: 'sort',
    label: 'Sort',
    actions: [
      { id: 'sortAsc', icon: 'sort', title: 'Sort Ascending (Ctrl+L)', commandId: 'sortAscending', passCol: true },
      { id: 'sortDesc', icon: 'sort_reverse', title: 'Sort Descending (Ctrl+Shift+L)', commandId: 'sortDescending', passCol: true },
    ],
  },
  {
    id: 'round',
    label: 'Round',
    actions: [
      { id: 'roundInt', icon: 'integer', title: 'Round to Integer (Ctrl+I)', commandId: 'integer' },
      { id: 'roundDec', icon: 'decimal', title: 'Round to Decimal (Ctrl+$)', commandId: 'decimal' },
    ],
  },
  {
    id: 'expand',
    label: 'Expand',
    actions: [
      { id: 'expand', icon: 'insert', title: 'Expand Series (Ctrl+E)', commandId: 'expand' },
    ],
  },
  {
    id: 'emptyStr',
    label: 'Empty string',
    actions: [
      { id: 'emptyStr', icon: 'empty_string', title: 'Set to Empty String ("")', commandId: 'emptyString' },
    ],
  },
  {
    id: 'clear',
    label: 'Clear',
    actions: [
      { id: 'clear', icon: 'clear', title: 'Clear Selection (Backspace)', commandId: 'delete' },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    structural: true,
    actions: [
      { id: 'insertUp', icon: 'arrow_up', title: 'Insert Row Above (Shift+Alt+Up)', commandId: 'insertUp' },
      { id: 'insertDown', icon: 'arrow_down', title: 'Insert Row Below (Shift+Alt+Down)', commandId: 'insertDown' },
      { id: 'insertLeft', icon: 'arrow_left', title: 'Insert Col Left (Shift+Alt+Left)', commandId: 'insertLeft' },
      { id: 'insertRight', icon: 'arrow_right', title: 'Insert Col Right (Shift+Alt+Right)', commandId: 'insertRight' },
    ],
  },
  {
    id: 'shift',
    label: 'Shift',
    structural: true,
    actions: [
      { id: 'shiftUp', icon: 'arrow_up', title: 'Shift Row Up (Alt+Up)', commandId: 'shiftUp' },
      { id: 'shiftDown', icon: 'arrow_down', title: 'Shift Row Down (Alt+Down)', commandId: 'shiftDown' },
      { id: 'shiftLeft', icon: 'arrow_left', title: 'Shift Col Left (Alt+Left)', commandId: 'shiftLeft' },
      { id: 'shiftRight', icon: 'arrow_right', title: 'Shift Col Right (Alt+Right)', commandId: 'shiftRight' },
    ],
  },
  {
    id: 'delete',
    label: 'Delete',
    structural: true,
    actions: [
      { id: 'deleteRow', icon: 'row', title: 'Delete Row (Ctrl+Backspace)', commandId: 'deleteRow' },
      { id: 'deleteCol', icon: 'col', title: 'Delete Col (Ctrl+Shift+Backspace)', commandId: 'deleteCol' },
    ],
  },
];

export class ContextMenu extends HTMLElement {
  constructor() {
    super();
    this.commands = {};
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'cmenu-header';
    this.listEl = document.createElement('div');
    this.listEl.className = 'cmenu-list';
    this.targetCol = null;
    this.rows = [];
    this.actionMap = new Map();

    for (const def of CMENU_ROW_DEFS) {
      const rowEl = document.createElement('div');
      rowEl.className = 'cmenu-row';
      rowEl.dataset.rowId = def.id;

      const labelEl = document.createElement('span');
      labelEl.className = 'cmenu-label';
      labelEl.textContent = def.label;

      const actionsEl = document.createElement('div');
      actionsEl.className = 'cmenu-actions';

      const actionEntries = def.actions.map((action) => {
        const glyph = new Glyph(action.icon, {
          size: 'sm',
          cls: 'cmenu-glyph',
          title: action.title,
          onClick: (e) => {
            e.stopPropagation();
            this.runAction(action);
          },
        });
        actionsEl.appendChild(glyph);
        const entry = { ...action, glyph, visible: false };
        this.actionMap.set(action.id, entry);
        return entry;
      });

      const rowEntry = { ...def, rowEl, actions: actionEntries, activeSingleAction: null };
      rowEl.addEventListener('click', () => {
        if (rowEntry.activeSingleAction) {
          this.runAction(rowEntry.activeSingleAction);
        }
      });

      rowEl.append(labelEl, actionsEl);
      this.listEl.appendChild(rowEl);
      this.rows.push(rowEntry);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', () => this.hide());
      window.addEventListener('resize', () => this.hide());
    }
  }

  get isOpen() { return this.classList.contains('open'); }

  connectedCallback() {
    if (!this.headerEl.parentNode) this.append(this.headerEl, this.listEl);
    this.hide();
  }

  hide() { this.classList.toggle('open', false); }

  runAction(action) {
    this.hide();
    const cmd = this.commands[action.commandId];
    if (cmd) cmd.run(action.passCol ? this.targetCol : undefined);
  }

  showItems(visibleActionIds) {
    const visibleSet = new Set(visibleActionIds);
    let hasNonStructural = false;
    let firstStructuralShown = false;

    for (const row of this.rows) {
      const visibleActions = [];
      for (const action of row.actions) {
        const show = visibleSet.has(action.id);
        action.visible = show;
        action.glyph.classList.toggle('hidden', !show);
        if (show) visibleActions.push(action);
      }

      const rowVisible = visibleActions.length > 0;
      row.rowEl.classList.toggle('hidden', !rowVisible);
      row.activeSingleAction = visibleActions.length === 1 ? visibleActions[0] : null;
      row.rowEl.classList.toggle('single-action', visibleActions.length === 1);

      const showDivider = rowVisible && Boolean(row.structural) && hasNonStructural && !firstStructuralShown;
      row.rowEl.classList.toggle('cmenu-divider', showDivider);

      if (rowVisible) {
        if (row.structural) firstStructuralShown = true;
        else hasNonStructural = true;
      }
    }
  }

  openAt(event) {
    const sheet = getSheet();
    const targetCell = event.target.closest('td, th');
    if (!sheet || !targetCell || !sheet.contains(targetCell)) return;

    const { colOffset, rowOffset } = targetCell;
    const isCorner = colOffset < 0 && rowOffset < 0;
    const isColHeader = rowOffset < 0 && colOffset >= 0;
    const isRowHeader = colOffset < 0 && rowOffset >= 0;
    const isCell = colOffset >= 0 && rowOffset >= 0;

    const prevRange = sheet.getOrderedRange();
    const maxCol = Math.max(0, sheet.df.width - 1);
    const maxRow = Math.max(0, sheet.rowCount - 1);

    if (isCorner) {
      this.targetCol = null;
      const isAllSelected = prevRange.xmin === 0 && prevRange.xmax >= maxCol && prevRange.ymin === 0 && prevRange.ymax >= maxRow;
      if (!isAllSelected) sheet.selectAll();
      this.headerEl.innerText = 'sheet';
    } else if (isColHeader) {
      const col = colOffset + sheet.baseX;
      if (sheet.df.lock && col >= sheet.df.width) return;
      this.targetCol = col;
      const isColFullySelected = prevRange.ymin === 0 && prevRange.ymax >= maxRow && col >= prevRange.xmin && col <= prevRange.xmax;
      if (!isColFullySelected) sheet.selectCol(col);
      const curRange = sheet.getOrderedRange();
      this.headerEl.innerText = curRange.xmax > curRange.xmin
        ? `cols : ${curRange.xmin + 1}-${curRange.xmax + 1}`
        : `col : ${targetCell.innerText}`;
    } else if (isRowHeader) {
      const row = rowOffset + sheet.baseY;
      if (sheet.df.lock && row >= sheet.rowCount) return;
      this.targetCol = null;
      const isRowFullySelected = prevRange.xmin === 0 && prevRange.xmax >= maxCol && row >= prevRange.ymin && row <= prevRange.ymax;
      if (!isRowFullySelected) sheet.selectRow(row);
      const curRange = sheet.getOrderedRange();
      this.headerEl.innerText = curRange.ymax > curRange.ymin
        ? `rows : ${sheet.getRowIndex(curRange.ymin) + 1}-${sheet.getRowIndex(curRange.ymax) + 1}`
        : `row : ${targetCell.innerText}`;
    } else {
      const col = colOffset + sheet.baseX;
      const row = rowOffset + sheet.baseY;
      if (sheet.df.lock && (col >= sheet.df.width || row >= sheet.rowCount)) return;
      const inSelection = col >= prevRange.xmin && col <= prevRange.xmax && row >= prevRange.ymin && row <= prevRange.ymax;
      if (!inSelection) sheet.selectRange(col, row);
      const curRange = sheet.getOrderedRange();
      const isMulti = curRange.xmax > curRange.xmin || curRange.ymax > curRange.ymin;
      this.targetCol = col;
      this.headerEl.innerText = isMulti ? 'selection' : 'cell';
    }

    const r = sheet.getOrderedRange();
    const locked = Boolean(sheet.df.lock);
    const colSpan = r.xmax - r.xmin + 1;
    const rowSpan = r.ymax - r.ymin + 1;
    const isMultiCell = colSpan > 1 || rowSpan > 1;

    let hasContent = false;
    let hasNonEmptyString = false;
    let hasRoundable = false;
    let hasNonQuotedEmpty = false;
    let inspected = 0;
    const maxInspect = 2000;
    const yLimit = Math.min(r.ymax, Math.max(0, sheet.rowCount - 1));
    const xLimit = Math.min(r.xmax, Math.max(0, sheet.df.width - 1));

    if (r.xmax >= sheet.df.width || r.ymax >= sheet.rowCount) {
      hasNonQuotedEmpty = true;
    }

    outer: for (let y = r.ymin; y <= yLimit; y++) {
      const actualY = sheet.getRowIndex(y);
      if (actualY < 0 || actualY >= sheet.df.height) {
        hasNonQuotedEmpty = true;
        continue;
      }
      for (let x = r.xmin; x <= xLimit; x++) {
        const val = sheet.df.get(x, actualY);
        if (val !== QUOTED_EMPTY_CELL) hasNonQuotedEmpty = true;
        if (val !== '') {
          hasContent = true;
          if (val !== QUOTED_EMPTY_CELL) {
            hasNonEmptyString = true;
            const trimmed = val.trim();
            if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
              hasRoundable = true;
            }
          }
        }
        if (++inspected >= maxInspect) {
          hasContent = hasNonEmptyString = hasRoundable = hasNonQuotedEmpty = true;
          break outer;
        }
      }
    }

    const visibleActions = [];

    if (hasContent) {
      visibleActions.push('copyTsv', 'copyHtml', 'copyMd', 'copyCsv');
    }

    if (isCorner) {
      if (!locked) visibleActions.push('trim');
      visibleActions.push('toggleActionBar');
      if (!locked) visibleActions.push('transpose');
      visibleActions.push('fixTop');
      const actionBarEntry = this.actionMap.get('toggleActionBar');
      if (actionBarEntry) actionBarEntry.glyph.icon = settings.actionBar !== false ? 'checkbox_on' : 'checkbox_off';
    }

    if (sheet.df.height > 1 && this.targetCol !== null && this.targetCol < sheet.df.width) {
      if (isColHeader || (isCell && colSpan === 1)) {
        visibleActions.push('filter');
      }
      if (!locked && isColHeader) {
        visibleActions.push('sortAsc', 'sortDesc');
      }
    }

    if (!locked) {
      if (hasRoundable) {
        visibleActions.push('roundInt', 'roundDec');
      }
      if (!isCorner && isMultiCell && hasNonEmptyString) {
        visibleActions.push('expand');
      }
      if (settings.preserveQuotedEmpty && hasNonQuotedEmpty) {
        visibleActions.push('emptyStr');
      }
      if (hasContent) {
        visibleActions.push('clear');
      }

      if (isRowHeader && r.ymin < sheet.df.height) {
        visibleActions.push('insertUp', 'insertDown');
        if (r.ymax < sheet.df.height) {
          if (r.ymin > 0) visibleActions.push('shiftUp');
          if (r.ymax < sheet.df.height - 1) visibleActions.push('shiftDown');
        }
      } else if (isColHeader && r.xmin < sheet.df.width) {
        visibleActions.push('insertLeft', 'insertRight');
        if (r.xmax < sheet.df.width) {
          if (r.xmin > 0) visibleActions.push('shiftLeft');
          if (r.xmax < sheet.df.width - 1) visibleActions.push('shiftRight');
        }
      }

      const canDeleteRow = r.ymin < sheet.df.height && sheet.df.height > 1 && rowSpan < sheet.df.height;
      const canDeleteCol = r.xmin < sheet.df.width && sheet.df.width > 1 && colSpan < sheet.df.width;

      if ((isRowHeader || isCell) && canDeleteRow) {
        visibleActions.push('deleteRow');
      }
      if ((isColHeader || isCell) && canDeleteCol) {
        visibleActions.push('deleteCol');
      }
    }

    if (visibleActions.length === 0) {
      this.hide();
      return;
    }

    this.showItems(visibleActions);
    this.classList.toggle('open', true);

    const menuWidth = this.offsetWidth || 180;
    const menuHeight = this.offsetHeight || 220;
    const maxLeft = Math.max(4, (window.innerWidth || 800) - menuWidth - 4);
    const maxTop = Math.max(4, (window.innerHeight || 600) - menuHeight - 4);
    this.style.left = `${clamp(event.clientX - 2, 4, maxLeft)}px`;
    this.style.top = `${clamp(event.clientY - 2, 4, maxTop)}px`;
  }
}

defineEl('ui-command-palette', CommandPalette);
defineEl('ui-cmenu', ContextMenu);
