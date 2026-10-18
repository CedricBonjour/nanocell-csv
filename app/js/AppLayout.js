/**
 * @file app/js/AppLayout.js
 * Application shell chrome: Header action bar, Footer status bar & coordinate jumper,
 * and shared DOM references.
 */

import { cycleFocus, formatCellHtml } from './utils.js';
import { Glyph } from './Glyph.js';
import { Scroller } from './Scroller.js';
import { getSheet, getCsvHandle, pwa, formatShortcut } from './state.js';
import { DialogManager } from './Dialogs.js';
import { Notification, triggerAppInstall } from './Notification.js';

let dom = undefined;
let isEditingCoords = false;

export class AppLayout {
  static init() {
    const getById = (id) => globalThis.document?.getElementById?.(id) || null;
    const dialogEl = getById('dialog');
    DialogManager.init(dialogEl);
    isEditingCoords = false;

    dom = {
      palette: getById('palette') || globalThis.document?.querySelector?.('ui-command-palette') || null,
      header: getById('header'),
      body: getById('body') || globalThis.document?.body || null,
      content: getById('content'),
      mainContainer: getById('main-container'),
      popupStack: getById('popup-stack'),
      validationPane: getById('validation-pane'),
      macroPane: getById('macro-pane'),
      dialog: dialogEl,
      footer: getById('footer'),
      contextMenu: globalThis.document?.createElement?.('ui-cmenu') || null,
      footerElements: {
        left: getById('footer-left'),
        center: getById('footer-center'),
        right: getById('footer-right'),
        lock: getById('lock'),
      },
    };

    if (dom.content) {
      dom.content.scrollerY = new Scroller(true);
      dom.content.scrollerX = new Scroller(false);
    }
    if (dom.body && dom.contextMenu) dom.body.appendChild(dom.contextMenu);
    initFooterEvents();
    return dom;
  }
}

function initFooterEvents() {
  const leftEl = dom?.footerElements?.left;
  if (leftEl && !leftEl._coordClickBound) {
    leftEl._coordClickBound = true;
    leftEl.title = 'Click to jump to cell';
    leftEl.addEventListener('click', (e) => {
      if (!e.target.closest('.coord-editor')) startCoordEdit();
    });
  }

  const lockEl = dom?.footerElements?.lock;
  if (lockEl && !lockEl._hasLockListener) {
    lockEl._hasLockListener = true;
    lockEl.addEventListener('click', () => {
      const sheet = getSheet();
      const csvHandle = getCsvHandle();
      if (!sheet?.df?.lock && !csvHandle?.viewOnly) return;
      Notification.warning(
        sheet?.filterRows ? 'File is locked while a filter is active.' : 'File is in View-Only mode. Edits are disabled.',
        'View-Only Mode'
      );
    });
  }
}

export function startCoordEdit(sheet = getSheet()) {
  const footer = dom?.footerElements;
  if (!sheet || !footer?.left || isEditingCoords) return;
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

  const focusables = [inputCol, inputRow, goBtn].filter(Boolean);
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.stopPropagation();
      cycleFocus(e, focusables);
      globalThis.document?.activeElement?.select?.();
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(e.key === 'Enter');
    }
  });

  goBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); finish(true); });
  container.addEventListener('click', (e) => e.stopPropagation());
  container.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!committed && !container.contains(globalThis.document?.activeElement)) finish(true);
    }, 100);
  });

  inputCol.focus();
  inputCol.select();
}

export function updateFooter(sheet = getSheet()) {
  const footer = dom?.footerElements;
  if (!sheet || !footer?.left) return;
  initFooterEvents();
  if (isEditingCoords) return;

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

  if (footer.lock) {
    const csvHandle = getCsvHandle();
    const isLocked = Boolean(sheet.df?.lock || csvHandle?.viewOnly);
    const hasFileHandle = Boolean(csvHandle?.handle);
    const isSaved = Boolean(sheet.df?.isSaved);

    let lockIcon = 'edit_square';
    let lockTitle = hasFileHandle ? 'Unsaved changes relative to disk' : 'New file edit';
    if (isLocked) {
      lockIcon = 'lock';
      lockTitle = sheet.filterRows ? 'Locked (filter active)' : 'Locked (view-only mode)';
    } else if (hasFileHandle && isSaved) {
      lockIcon = 'save_disk';
      lockTitle = 'File saved (no edits ongoing)';
    }

    footer.lock.icon = lockIcon;
    footer.lock.label = lockTitle;
    footer.lock.variant = isLocked ? 'warning' : 'status';
  }
}

export function buildMenu(commands) {
  if (!dom?.header || !commands) return;
  const menuItems = [
    'new', 'open', 'save', 'reloadFile', 'undo', 'redo', '',
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
    const iconName = command?.icon || itemId;
    const shortcut = formatShortcut(command);
    const label = command?.label || command?.description || itemId;
    const tooltip = shortcut ? `${label} (${shortcut})` : label;

    dom.header.appendChild(new Glyph(iconName, {
      title: tooltip,
      onClick: () => command?.run?.(),
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

export { dom };
