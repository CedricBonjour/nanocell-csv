/**
 * @file app/js/Sheet.js
 * Unified <ui-sheet> spreadsheet web component: virtualized table DOM rendering,
 * viewport & range selection, inline cell editing, clipboard operations, and mouse/key routing.
 */

import { Dataframe, orderRange, isUrl, isIsoDate, QUOTED_EMPTY_CELL, displayCellValue } from '../core/Dataframe.js';
import { CsvParser, CsvSerializer, SeparatorDetector } from '../core/Csv.js';
import { dom, getSheet, setSheet, Setting, settings } from './state.js';
import { defineEl, formatCellHtml, getTodayIsoDate, clamp, isInputElement } from './utils.js';
import { updateFooter } from './AppLayout.js';
import { FinderDialog, FilterDialog } from './SheetOverlays.js';
import { Notification } from './Notification.js';

class Scroller extends HTMLElement {
  constructor(vertical = true) {
    super();
    this.vertical = Boolean(vertical);
    this._cachedBounds = null;
    this.classList.add(this.vertical ? 'vertical' : 'horizontal');
  }

  getBounds(sheet) {
    const rect = sheet.getBoundingClientRect();
    if (this.vertical) {
      if (!sheet.rows[1]) return null;
      const offset = sheet.rows[1].getBoundingClientRect().top;
      return { offset, start: offset - rect.top, dragSpan: Math.max(1, rect.bottom - offset), barSpan: rect.bottom - offset };
    }
    if (!sheet.rows[0]?.cells[0]) return null;
    const offset = sheet.rows[0].cells[0].getBoundingClientRect().left;
    const start = (sheet.rows[0].cells[1] || sheet.rows[0].cells[0]).getBoundingClientRect().left;
    return { offset, start, dragSpan: Math.max(1, rect.right - offset), barSpan: rect.right - start };
  }

  startDrag(sheet) { this._cachedBounds = this.getBounds(sheet); }
  endDrag() { this._cachedBounds = null; }

  dragTo(event, sheet) {
    if (!sheet) return;
    const bounds = (this._cachedBounds ||= this.getBounds(sheet));
    if (!bounds) return;
    const pos = this.vertical ? event.clientY : event.clientX;
    const ratio = clamp((pos - bounds.offset) / bounds.dragSpan, 0, 1);
    if (this.vertical) {
      const maxScroll = sheet.df.lock ? sheet.maxBaseY : sheet.rowCount;
      sheet.baseY = Math.floor(maxScroll * ratio);
    } else {
      sheet.baseX = Math.floor((sheet.df.lock ? sheet.maxBaseX : sheet.df.width) * ratio);
    }
    sheet.refreshSelection(false);
  }

  refresh(sheet) {
    if (!sheet) return;
    const isY = this.vertical;
    const count = isY ? sheet.rowCount : sheet.df.width;
    const visible = isY
      ? (sheet.df.lock ? sheet.maxBaseY > 0 : count >= sheet.viewRows / 2)
      : (sheet.df.lock ? sheet.maxBaseX > 0 : count >= sheet.viewCols - 2);
    this.classList.toggle('hidden', !visible);
    if (!visible) return;

    const base = isY ? sheet.baseY : sheet.baseX;
    const maxScroll = sheet.df.lock ? (isY ? sheet.maxBaseY : sheet.maxBaseX) : count - 1;
    const total = Math.max(maxScroll, base, 1);
    const [lg, md] = isY ? [100, 1000] : [30, 100];
    this.setAttribute('data-size', total < lg ? 'lg' : (total < md ? 'md' : 'sm'));

    const bounds = this.getBounds(sheet);
    const start = bounds ? bounds.start : 0;
    const thumbSize = (isY ? this.offsetHeight : this.offsetWidth) || 0;
    const track = (bounds ? bounds.barSpan : 0) - thumbSize;
    this.style[isY ? 'top' : 'left'] = `${start + Math.round((track * base) / total)}px`;
  }
}

defineEl('ui-scroller', Scroller);

let dragTarget = null;
let isCtrlDrag = false;
let didDrag = false;
let mousedownCell = null;
let dragBaseRange = null;
let mouseX = 0, mouseY = 0;
let scrollIntervalId = null;
let globalMouseBound = false;

const LOCK_MESSAGES = {
  'view-only': 'File is in View-Only mode. Edits are disabled.',
  'read-only': 'File is in Read-Only mode. Click the lock icon to unlock.',
  filter: 'File is locked while a filter is active.',
};

function startOutOfBoundsScroll() {
  if (scrollIntervalId !== null) clearInterval(scrollIntervalId);
  scrollIntervalId = setInterval(() => {
    const sheet = getSheet();
    if (!dragTarget || !sheet) {
      clearInterval(scrollIntervalId);
      scrollIntervalId = null;
      return;
    }
    let changed = false;
    const rect = sheet.getBoundingClientRect();
    if (mouseY <= rect.top) {
      if (sheet.rangeEnd) sheet.rangeEnd.y = sheet.baseY;
      sheet.baseY--;
      changed = true;
    }
    if (mouseX >= rect.right - 5) {
      if (sheet.rangeEnd) sheet.rangeEnd.x = Math.min(sheet.baseX + sheet.width - 1, sheet.maxCol);
      sheet.baseX++;
      changed = true;
    }
    if (mouseY >= rect.bottom) {
      if (sheet.rangeEnd) {
        const maxRow = sheet.maxRow;
        sheet.rangeEnd.y = Math.min(sheet.baseY + sheet.height - 1, maxRow);
      }
      sheet.baseY++;
      changed = true;
    }
    if (mouseX <= rect.left + 5) {
      if (sheet.rangeEnd) sheet.rangeEnd.x = sheet.baseX;
      sheet.baseX--;
      changed = true;
    }
    if (changed) {
      didDrag = true;
      sheet.refreshSelection(false);
    }
  }, 100);
}

function bindGlobalMouse() {
  if (globalMouseBound) return;
  globalMouseBound = true;

  document.addEventListener('contextmenu', (event) => {
    if (!event.ctrlKey && !isInputElement(event.target)) {
      event.preventDefault();
      dom.contextMenu.openAt(event);
    }
  });

  document.addEventListener('mouseup', (event) => {
    if (event.buttons < 1) {
      const sheet = getSheet();
      if (dragTarget instanceof Scroller) dragTarget.endDrag();
      else if (dragTarget && sheet) {
        const ctrlHeld = isCtrlDrag || event.ctrlKey || event.metaKey;
        if (didDrag && ctrlHeld && sheet.rangeEnd) {
          sheet.expand();
        } else if (!didDrag && ctrlHeld && mousedownCell) {
          sheet.selectRange(
            mousedownCell.colOffset + sheet.baseX,
            mousedownCell.rowOffset + sheet.baseY
          );
          if (mousedownCell.firstElementChild?.classList.contains('url')) {
            window.open(mousedownCell.innerText, '_blank');
          }
        }
      }
      dragTarget = null;
      isCtrlDrag = false;
      didDrag = false;
      mousedownCell = null;
      dragBaseRange = null;
      if (scrollIntervalId !== null) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
      }
    }
  });

  document.addEventListener('mousedown', (event) => {
    if (dom.contextMenu?.isOpen && !dom.contextMenu.contains(event.target)) {
      dom.contextMenu.hide();
    }
    const tag = event.target.tagName;
    const sheet = getSheet();
    const isSheetInteraction = sheet.contains(event.target) || event.target instanceof Scroller;
    if (
      tag !== 'INPUT' && tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'UI-GLYPH' &&
      isSheetInteraction
    ) {
      event.preventDefault();
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
    if (event.button !== 0) return;

    if (event.target instanceof Scroller) {
      dragTarget = event.target;
      dragTarget.startDrag(sheet);
      return;
    }

    const cell = event.target.closest('td, th');
    if (!cell || !sheet.contains(cell)) {
      dragTarget = null;
      return;
    }

    isCtrlDrag = Boolean(event.ctrlKey || event.metaKey);
    didDrag = false;
    mousedownCell = null;
    dragBaseRange = null;

    if (cell.colOffset < 0 && cell.rowOffset < 0) {
      dragTarget = 'cornerHeader';
      sheet.selectAll();
    } else if (cell.rowOffset < 0) {
      const col = cell.colOffset + sheet.baseX;
      if (sheet.df.lock && col >= sheet.df.width) return;
      dragTarget = 'colHeader';
      sheet.selectCol(event.shiftKey ? sheet.x : col, col);
      startOutOfBoundsScroll();
    } else if (cell.colOffset < 0) {
      const row = cell.rowOffset + sheet.baseY;
      if (sheet.df.lock && (cell.colOffset >= 0 && col >= sheet.df.width || row >= sheet.rowCount)) return;
      dragTarget = 'rowHeader';
      sheet.selectRow(event.shiftKey ? sheet.y : row, row);
      startOutOfBoundsScroll();
    } else {
      const col = cell.colOffset + sheet.baseX;
      const row = cell.rowOffset + sheet.baseY;
      if (sheet.df.lock && (cell.colOffset >= 0 && col >= sheet.df.width || row >= sheet.rowCount)) return;
      dragTarget = 'cell';
      mousedownCell = cell;
      const existing = (isCtrlDrag && sheet.rangeEnd) ? sheet.getOrderedRange() : null;
      if (existing && col >= existing.xmin && col <= existing.xmax && row >= existing.ymin && row <= existing.ymax) {
        dragBaseRange = existing;
        sheet._x = existing.xmin;
        sheet._y = existing.ymin;
        sheet.rangeEnd = { x: existing.xmax, y: existing.ymax };
      } else {
        sheet.isSelectingRange = Boolean(event.shiftKey);
        if (!event.shiftKey) sheet.rangeEnd = undefined;
        sheet.x = col;
        sheet.y = row;
      }
      sheet.refreshSelection();
      startOutOfBoundsScroll();
    }
  });

  document.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    if (event.buttons < 1) {
      if (dragTarget instanceof Scroller) dragTarget.endDrag();
      dragTarget = null;
      return;
    }
    if (dragTarget instanceof Scroller) {
      dragTarget.dragTo(event, getSheet());
    }
  });
}

export class Sheet extends HTMLElement {
  static _finder = null;
  static _filter = null;
  static _scrollerY = null;
  static _scrollerX = null;

  constructor(df = new Dataframe()) {
    super();
    bindGlobalMouse();
    // The filter dialog is shared across sheets: close it on the outgoing sheet before taking over.
    if (Sheet._filter?.isOpen) Sheet._filter.close();
    this.df = df;
    // A dataframe handed over locked (large-file preview) stays read-only for the sheet's lifetime.
    this.viewOnly = df.lock;
    this.readOnly = false;
    setSheet(this);

    this.table = document.createElement('table');
    this.finder = (Sheet._finder ||= new FinderDialog(this));
    this.finder.sheet = this;
    this.filter = (Sheet._filter ||= new FilterDialog(this));
    this.filter.sheet = this;
    this.scrollerY = (Sheet._scrollerY ||= new Scroller(true));
    this.scrollerX = (Sheet._scrollerX ||= new Scroller(false));

    this.filterRows = null;
    this.inputField = document.createElement('input');
    this.isEditing = false;
    this.viewCols = settings.cols;
    this.viewRows = settings.rows;
    this.cancelEditOnBlur = false;
    this.fixTop = false;
    this.isSelectingRange = false;
    this.rangeEnd = undefined;
    this.expandedCol = null;
    this._x = 0;
    this._y = 0;
    this._baseX = 0;
    this._baseY = 0;
    this._selectedCells = [];

    this.id = 'sheet';
    this.classList.add('sheet');
    this.appendChild(this.table);

    this.bindEvents();

    const container = dom.mainContainer;
    container.querySelectorAll('ui-sheet').forEach(el => el.remove());
    container.append(this, this.scrollerY, this.scrollerX);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.refreshScrollbars());
      this._resizeObserver.observe(this);
    }

    dom.validationPane.reset();
    this.reload();
  }

  get rows() { return this.table.rows; }
  get width() { return this.rows[0] ? this.rows[0].cells.length - 1 : this.viewCols; }
  get height() { return this.rows.length - 1; }
  get rowCount() { return this.filterRows ? this.filterRows.length : this.df.height; }
  get maxCol() { return this.df.lock ? Math.max(0, this.df.width - 1) : Infinity; }
  get maxRow() { return this.df.lock ? Math.max(0, this.rowCount - 1) : Infinity; }
  get maxBaseX() { return this.df.lock ? Math.max(0, this.df.width - this.width) : Infinity; }
  get maxBaseY() { return this.df.lock ? Math.max(0, this.rowCount - this.height) : Infinity; }

  get x() { return this._x; }
  set x(col) {
    if (this.isEditing) this.commitEdit();
    if (!this.isSelectingRange) this.rangeEnd = undefined;
    else if (!this.rangeEnd) this.rangeEnd = { x: this._x, y: this._y };
    this._x = clamp(col, 0, this.maxCol);
  }

  get y() { return this._y; }
  set y(row) {
    if (this.isEditing) this.commitEdit();
    if (!this.isSelectingRange) this.rangeEnd = undefined;
    else if (!this.rangeEnd) this.rangeEnd = { x: this._x, y: this._y };
    const max = this.maxRow;
    this._y = clamp(row, 0, max);
  }

  get baseX() { return this._baseX; }
  set baseX(col) {
    const next = clamp(col, 0, this.maxBaseX);
    if (next !== this._baseX) { this._baseX = next; this.refresh(); }
  }

  get baseY() { return this._baseY; }
  set baseY(row) {
    const next = clamp(row, 0, this.maxBaseY);
    if (next !== this._baseY) { this._baseY = next; this.refresh(); }
  }

  // --- Virtualized Table Rendering ---

  reload() {
    while (this.table.rows[0]) this.table.rows[0].remove();
    for (let y = 0; y < this.viewRows + 1; y++) {
      const tr = document.createElement('tr');
      this.table.appendChild(tr);
      for (let x = 0; x < this.viewCols + 1; x++) {
        const cell = document.createElement('td');
        cell.colOffset = x - 1;
        cell.rowOffset = y - 1;

        if (x === 0 || y === 0) cell.classList.add('cell-header');
        if (y === 0) cell.classList.add('col-header');
        if (x === 0) cell.classList.add('row-header');
        if (y > 0 && x > 0) cell.appendChild(document.createElement('div'));
        tr.appendChild(cell);
      }
    }
    this.refresh();
    this.refreshSelection(false);
  }

  refresh() {
    cancelAnimationFrame(this._refreshRafId);
    this._refreshRafId = requestAnimationFrame(() => {
      this._refreshRafId = null;
      for (let x = 0; x < this.width; x++) this.renderColHeader(x);
      for (let y = 0; y < this.height; y++) {
        const actualY = this.getRowIndex(this.baseY + y);
        this.renderRowHeader(y, actualY);
        for (let x = 0; x < this.width; x++) {
          this.renderCell(this.rows[y + 1].cells[x + 1], this.baseX + x, actualY);
        }
      }
      const activeCell = this.getActiveCellElement();
      if (this.isEditing && activeCell && this.inputField.parentNode !== activeCell) {
        activeCell.appendChild(this.inputField);
      }
      this.syncToolbarColumns();
      this.refreshScrollbars();
      updateFooter(this);
    });
  }

  /** Keep the open find/filter toolbars' column pickers within the current sheet width. */
  syncToolbarColumns() {
    if (this.finder.isOpen) this.finder.syncColBounds(false);
    if (this.filter.isOpen) this.filter.syncColBounds(false);
  }

  refreshScrollbars() {
    this.scrollerY.refresh(this);
    this.scrollerX.refresh(this);
  }
  updateFooter() { updateFooter(this); }

  renderCell(cellEl, x, y) {
    const contentDiv = cellEl?.firstChild;
    if (!contentDiv) return;
    const value = (y >= 0 && y < this.df.height) ? this.df.get(x, y) : '';
    if (!value || value === QUOTED_EMPTY_CELL) {
      contentDiv.className = (value === QUOTED_EMPTY_CELL && settings.preserveQuotedEmpty) ? 'empty-string' : '';
      contentDiv.textContent = '';
      return;
    }

    let cls = '';
    if (value[0] === '!') cls += ' error';
    if (!isNaN(value)) cls += ' num';
    if (isIsoDate(value)) cls += ' date';
    if (isUrl(value)) cls += ' url';
    if (settings.highlightNonCompliant && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
      cls += ' non-compliant';
    }

    contentDiv.className = cls.trimStart();
    if (!value.includes('&') && !value.includes('<') && !value.includes('\n')) {
      contentDiv.textContent = value;
    } else {
      contentDiv.innerHTML = formatCellHtml(value);
    }
  }

  renderColHeader(viewX) {
    const cell = this.rows[0]?.cells[viewX + 1];
    if (!cell) return;
    const colIndex = this.baseX + viewX;
    if (this.df.lock && colIndex >= this.df.width) {
      cell.textContent = '';
      cell.classList.remove('col-expanded', 'col-collapsed');
      return;
    }
    const headerText = this.fixTop ? displayCellValue(this.df.get(colIndex, 0)) : '';
    cell.textContent = headerText.length > 0 ? headerText : colIndex + 1;

    const isExpanded = this.expandedCol != null && colIndex === this.expandedCol;
    const isCollapsed = this.expandedCol != null && colIndex !== this.expandedCol;
    cell.classList.toggle('col-expanded', isExpanded);
    cell.classList.toggle('col-collapsed', isCollapsed);
  }

  renderRowHeader(viewY, actualY) {
    const cell = this.rows[viewY + 1]?.cells[0];
    if (!cell) return;
    cell.textContent = actualY !== undefined ? (actualY >= 0 ? String(actualY + 1) : '') : String(this.baseY + viewY + 1);
  }

  // --- Events & Filtering ---

  bindEvents() {
    this.addEventListener('wheel', (event) => this.scroll(event), { passive: false });
    this.inputField.addEventListener('focusout', () => this.commitEdit());
    this.inputField.addEventListener('keydown', (event) => {
      const key = event.key.toUpperCase();
      if (key === 'ENTER' && event.shiftKey) {
        this.inputField.value += '\u25BE';
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ';') {
        event.preventDefault();
        event.stopPropagation();
        this.insertDate();
        return;
      }
      if (key === 'ESCAPE') {
        event.stopPropagation();
        this.cancelEditOnBlur = true;
        this.inputField.blur();
        return;
      }
      if (key === 'ENTER' || key === 'TAB' || key === 'ARROWUP' || key === 'ARROWDOWN') {
        event.stopPropagation();
        event.preventDefault();
        this.inputField.blur();
        if (key === 'TAB') this.x += event.shiftKey ? -1 : 1;
        else if (key === 'ARROWUP') this.y--;
        else this.y++;
        this.refreshSelection();
        this.refresh();
      }
    });

    this.addEventListener('mouseover', (event) => {
      if (!dragTarget) return;
      const td = event.target.closest('td');
      if (!td || td.colOffset === undefined || td.rowOffset === undefined) return;

      if (dragTarget === 'cell') {
        const endX = Math.min(td.colOffset + this.baseX, this.maxCol);
        const rawEndY = td.rowOffset + this.baseY;
        const endY = Math.min(rawEndY, this.maxRow);
        if (td !== mousedownCell) didDrag = true;
        if (dragBaseRange) {
          this.rangeEnd = {
            x: endX < dragBaseRange.xmin ? endX : Math.max(endX, dragBaseRange.xmax),
            y: endY < dragBaseRange.ymin ? endY : Math.max(endY, dragBaseRange.ymax),
          };
        } else {
          this.rangeEnd = { x: endX, y: endY };
        }
        this.refreshSelection(false);
      } else if (dragTarget === 'colHeader' && td.colOffset >= 0) {
        didDrag = true;
        this.selectCol(this.x, Math.min(td.colOffset + this.baseX, this.maxCol));
      } else if (dragTarget === 'rowHeader' && td.rowOffset >= 0) {
        const endY = this.filterRows
          ? Math.min(td.rowOffset + this.baseY, Math.max(0, this.filterRows.length - 1))
          : td.rowOffset + this.baseY;
        didDrag = true;
        this.selectRow(this.y, endY);
      }
    });

    this.addEventListener('dblclick', (event) => {
      const td = event.target.closest('td');
      if (!td || td.colOffset === undefined || td.rowOffset === undefined) return;
      if (td.colOffset >= 0 && td.rowOffset >= 0) {
        if (!this.df.lock) this.startEdit();
      } else if (td.rowOffset < 0 && td.colOffset >= 0) {
        const colIdx = this.baseX + td.colOffset;
        if (this.df.lock && colIdx >= this.df.width) return;
        this.expandedCol = this.expandedCol === colIdx ? null : colIdx;
        this.refresh();
      }
    });
  }

  handleKeyDown(event, key, ctrlDown, shift, alt) {
    const pageSize = settings.rows;
    const maxX = Math.max(0, this.df.width - 1);
    const maxY = Math.max(0, this.rowCount - 1);

    if (key === 'PAGEUP' || key === 'PAGEDOWN') {
      event.preventDefault();
      this.y = key === 'PAGEUP' ? Math.max(0, this.y - pageSize) : Math.min(maxY, this.y + pageSize);
      this.refreshSelection();
      return true;
    }
    if (key === 'HOME') {
      event.preventDefault();
      this.x = 0;
      if (ctrlDown) this.y = 0;
      this.refreshSelection();
      return true;
    }
    if (key === 'END' && ctrlDown) {
      event.preventDefault();
      this.x = maxX;
      this.y = maxY;
      this.refreshSelection();
      return true;
    }
    if (key === 'F2' || key === 'ENTER') {
      event.preventDefault();
      if (!this.df.lock) this.startEdit();
      return true;
    }
    if (key === 'TAB') {
      event.preventDefault();
      this.isSelectingRange = false;
      this.rangeEnd = undefined;
      this.x += shift ? -1 : 1;
      this.refreshSelection();
      return true;
    }
    if (key === 'ARROWUP' || key === 'ARROWDOWN' || key === 'ARROWLEFT' || key === 'ARROWRIGHT') {
      event.preventDefault();
      if (ctrlDown) {
        if (key === 'ARROWUP') this.y = 0;
        else if (key === 'ARROWDOWN') this.y = maxY;
        else if (key === 'ARROWLEFT') this.x = 0;
        else this.x = maxX;
      } else {
        if (key === 'ARROWUP') this.y--;
        else if (key === 'ARROWDOWN') this.y++;
        else if (key === 'ARROWLEFT') this.x--;
        else this.x++;
      }
      this.refreshSelection();
      return true;
    }
    if (event.key.length === 1 && !ctrlDown && !event.metaKey && !alt) {
      if (!this.df.lock) {
        event.preventDefault();
        this.startEdit(event.key);
      }
      return true;
    }
    return false;
  }

  getRowIndex(viewY) {
    if (!this.filterRows) return (this.df.lock && viewY >= this.df.height) ? -1 : viewY;
    return (viewY >= 0 && viewY < this.filterRows.length) ? this.filterRows[viewY] : -1;
  }

  // --- Read-only state: single owner of df.lock ---

  get lockReason() {
    if (this.viewOnly) return 'view-only';
    if (this.filterRows !== null || this.filter.isOpen) return 'filter';
    if (this.readOnly) return 'read-only';
    return null;
  }

  syncLock() {
    const wasLocked = Boolean(this.df.lock);
    const isLocked = this.lockReason !== null;
    this.df.lock = isLocked;
    if (isLocked && !wasLocked) {
      this._baseX = Math.min(this._baseX, this.maxBaseX);
      this._baseY = Math.min(this._baseY, this.maxBaseY);
      this.clampSelection();
    } else if (wasLocked !== isLocked) {
      this.refresh();
    }
  }

  warnIfLocked(title) {
    const reason = this.lockReason;
    if (reason) Notification.warning(LOCK_MESSAGES[reason], title);
    return reason !== null;
  }

  unlock() {
    if (this.lockReason === 'read-only') {
      this.readOnly = false;
      this.syncLock();
      this.updateFooter();
      return true;
    }
    this.warnIfLocked('Locked');
    return false;
  }

  setFilter(colIndex, text, matchCase = false) {
    if (!text) return this.clearFilter();
    this.filterRows = this.df.filterColumn(colIndex, text, matchCase, Boolean(this.fixTop));
    this.syncLock();
    this.baseY = 0;
    this.y = 0;
    this.refresh();
    this.refreshSelection(true);
  }

  clearFilter() {
    if (this.filterRows !== null) {
      this.filterRows = null;
      this.syncLock();
      this.refresh();
      this.refreshSelection(false);
    }
  }

  openFilter(colIndex) { this.filter.open(colIndex); }

  // --- Selection & Viewport ---

  getOrderedRange() {
    const end = this.rangeEnd || this;
    return orderRange({ xmin: this.x, xmax: end.x, ymin: this.y, ymax: end.y });
  }

  getSelectedMatrix() {
    const range = this.getOrderedRange();
    if (!this.filterRows) return this.df.slice(range);
    const rows = [];
    for (let y = range.ymin; y <= range.ymax; y++) {
      const actualY = this.getRowIndex(y);
      if (actualY < 0) continue;
      const row = [];
      for (let x = range.xmin; x <= range.xmax; x++) row.push(this.df.get(x, actualY));
      rows.push(row);
    }
    return rows;
  }

  selectRange(x, y, endX, endY, scrollIntoView = false) {
    this.isSelectingRange = false;
    this.x = x;
    this.y = y;
    const clampedEndX = endX !== undefined ? clamp(endX, 0, this.maxCol) : undefined;
    const clampedEndY = endY !== undefined ? clamp(endY, 0, this.maxRow) : undefined;
    this.rangeEnd = (clampedEndX !== undefined && clampedEndY !== undefined && (clampedEndX !== this.x || clampedEndY !== this.y))
      ? { x: clampedEndX, y: clampedEndY }
      : undefined;
    this.refreshSelection(scrollIntoView);
  }

  focusCell(x, y) { this.selectRange(x, y, undefined, undefined, true); }
  selectAll() { this.selectRange(0, 0, this.df.width - 1, Math.max(0, this.rowCount - 1), false); }
  selectCol(startCol, endCol = startCol) { this.selectRange(startCol, 0, endCol, Math.max(0, this.rowCount - 1), false); }
  selectRow(startRow, endRow = startRow) { this.selectRange(0, startRow, Math.max(0, this.df.width - 1), endRow, false); }

  isCellInView(x, y) {
    return x >= this.baseX && y >= this.baseY && x < this.baseX + this.width && y < this.baseY + this.height;
  }

  getActiveCellElement() {
    if (this.isCellInView(this.x, this.y)) {
      return this.rows[this.y - this.baseY + 1]?.cells[this.x - this.baseX + 1];
    }
    if (this.rangeEnd) {
      const range = this.getOrderedRange();
      const vxEnd = this.baseX + this.width, vyEnd = this.baseY + this.height;
      const rx = (this.baseX < range.xmin && vxEnd > range.xmin) ? range.xmin : (this.baseX > range.xmin && this.baseX <= range.xmax ? this.baseX : undefined);
      const ry = (this.baseY < range.ymin && vyEnd > range.ymin) ? range.ymin : (this.baseY > range.ymin && this.baseY <= range.ymax ? this.baseY : undefined);
      if (rx !== undefined && ry !== undefined) {
        return this.rows[ry - this.baseY + 1]?.cells[rx - this.baseX + 1];
      }
    }
    return undefined;
  }

  scrollToSelection() {
    if (this.x < this.baseX) this.baseX = this.x;
    else if (this.x >= this.baseX + this.width) this.baseX = this.x - this.width + 1;

    if (this.y < this.baseY) this.baseY = this.y;
    else if (this.y >= this.baseY + this.height) this.baseY = this.y - this.height + 1;
  }

  clearSelectionHighlight() {
    if (this._selectedCells.length > 0) {
      for (const cell of this._selectedCells) cell.classList.remove('selected');
      this._selectedCells.length = 0;
    } else {
      for (const cell of this.querySelectorAll('.selected')) cell.classList.remove('selected');
    }
  }

  refreshSelection(scrollIntoView = true) {
    if (scrollIntoView) this.scrollToSelection();
    cancelAnimationFrame(this._selectionRafId);
    this._selectionRafId = requestAnimationFrame(() => {
      this._selectionRafId = null;
      this.clearSelectionHighlight();
      if (scrollIntoView) this.scrollToSelection();
      this.refreshScrollbars();

      const range = this.getOrderedRange();
      const xStart = Math.max(0, range.xmin - this.baseX);
      const xEnd = Math.min(this.width - 1, range.xmax - this.baseX);
      const yStart = Math.max(0, range.ymin - this.baseY);
      const yEnd = Math.min(this.height - 1, range.ymax - this.baseY);

      for (let x = xStart; x <= xEnd; x++) {
        const colHeader = this.rows[0]?.cells[x + 1];
        if (colHeader) {
          colHeader.classList.add('selected');
          this._selectedCells.push(colHeader);
        }
        for (let y = yStart; y <= yEnd; y++) {
          const cell = this.rows[y + 1]?.cells[x + 1];
          if (cell) {
            cell.classList.add('selected');
            this._selectedCells.push(cell);
          }
        }
      }
      for (let y = yStart; y <= yEnd; y++) {
        const rowHeader = this.rows[y + 1]?.cells[0];
        if (rowHeader) {
          rowHeader.classList.add('selected');
          this._selectedCells.push(rowHeader);
        }
      }
      updateFooter(this);
    });
  }

  scroll(event) {
    dom.contextMenu?.hide();
    if (event.ctrlKey) {
      event.preventDefault();
      const minRows = Setting.getDef('rows').min;
      const minCols = Setting.getDef('cols').min;
      if (event.shiftKey) {
        if (event.deltaY > 0) this.viewRows++;
        else if (event.deltaY < 0 && this.viewRows > minRows) this.viewRows--;
      } else {
        if (event.deltaY > 0) this.viewCols++;
        else if (event.deltaY < 0 && this.viewCols > minCols) this.viewCols--;
      }
      this.reload();
      return;
    }
    const calcStep = (d) => d > 0 ? Math.floor(d / 16) : Math.ceil(d / 16);
    if (event.altKey) {
      this.baseX += calcStep(event.deltaY);
    } else {
      this.baseX += calcStep(event.deltaX);
      this.baseY += calcStep(event.deltaY);
    }
    this.refresh();
    this.refreshSelection(false);
  }

  // --- Inline Cell Editing, Clipboard & Mutations ---

  startEdit(initialText) {
    if (this.df.lock) return;
    const cell = this.getActiveCellElement();
    if (!cell) return;
    const actualY = this.getRowIndex(this.y);
    this.isEditing = true;
    this.inputField.value = initialText || (actualY >= 0 ? displayCellValue(this.df.get(this.x, actualY)).replaceAll('\n', '\u25BE') : '');
    cell.appendChild(this.inputField);
    this.inputField.focus();
  }

  commitEdit() {
    if (!this.isEditing) return;
    this.isEditing = false;
    const value = this.inputField.value.replaceAll('\u25BE', '\n');
    if (!this.cancelEditOnBlur) {
      this.editSelection(value);
      if (!this.rangeEnd) this.renderCell(this.inputField.parentNode, this.x, this.getRowIndex(this.y));
      else this.refresh();
      this.syncToolbarColumns();
    }
    this.cancelEditOnBlur = false;
    this.inputField.remove();
  }

  getCopyMatrix() {
    const range = this.getOrderedRange();
    const firstActualY = this.getRowIndex(range.ymin);
    let matrix = this.getSelectedMatrix();
    const includeHeaders = Boolean(settings.copyIncludeHeaders);
    if (includeHeaders && firstActualY > 0 && this.df.height > 0) {
      const headerRow = this.df.slice({ xmin: range.xmin, xmax: range.xmax, ymin: 0, ymax: 0 })[0];
      if (headerRow) matrix = [headerRow, ...matrix];
    }
    const hasHeader = (includeHeaders && matrix.length > 0) || (firstActualY === 0 && Boolean(this.fixTop || settings.freezeHeaderOnOpen));
    return { matrix, hasHeader };
  }

  copySelectionData() {
    const { matrix, hasHeader } = this.getCopyMatrix();
    const serializer = new CsvSerializer({ delimiter: '\t', preserveQuotedEmpty: Boolean(settings.preserveQuotedEmpty) });
    const text = serializer.serialize(matrix);
    const cellCount = matrix.length * (matrix[0]?.length || 0);
    const html = (Boolean(settings.copyPasteHtml) && cellCount > 1)
      ? serializer.serializeHtml(matrix, { hasHeader })
      : '';
    return { text, html };
  }

  cutSelectionData() {
    if (this.df.lock) return { text: '', html: '' };
    const data = this.copySelectionData();
    this.deleteSelection();
    return data;
  }

  pasteClipboard(rawText, rawHtml) {
    if (this.df.lock) return;
    if (settings.copyPasteHtml && rawHtml) {
      const htmlMatrix = CsvParser.parseHtmlTable(rawHtml, {
        trimWhitespace: Boolean(settings.trimUnquoted),
        preserveQuotedEmpty: Boolean(settings.preserveQuotedEmpty),
      });
      if (htmlMatrix?.length > 0) {
        this.paste(htmlMatrix);
        return;
      }
    }
    if (rawText) this.pasteText(rawText);
  }

  pasteText(rawText) {
    if (!rawText || this.df.lock) return;
    const delimiter = rawText.includes('\t') ? '\t' : SeparatorDetector.detect(rawText);
    const matrix = new CsvParser({
      delimiter,
      trimUnquotedWhitespace: Boolean(settings.trimUnquoted),
      preserveQuotedEmpty: Boolean(settings.preserveQuotedEmpty),
    }).parse(rawText);
    if (matrix.length > 0) this.paste(matrix);
  }

  insertDate() {
    const todayStr = getTodayIsoDate();
    if (this.isEditing) {
      const start = this.inputField.selectionStart || 0;
      const end = this.inputField.selectionEnd || 0;
      this.inputField.value = this.inputField.value.slice(0, start) + todayStr + this.inputField.value.slice(end);
      this.inputField.selectionStart = this.inputField.selectionEnd = start + todayStr.length;
    } else {
      this.editSelection(todayStr);
      this.refresh();
    }
  }

  editSelection(value) { this.df.editRange(this.getOrderedRange(), value); }
  deleteSelection() { this.editSelection(''); this.refresh(); }
  setEmptyString() { this.editSelection(QUOTED_EMPTY_CELL); this.refresh(); }

  _deleteAxis(isRow) {
    const r = this.getOrderedRange();
    if (isRow) {
      this.df.deleteRows(r.ymin, r.ymax - r.ymin + 1);
      this._y = r.ymin;
      if (this.rangeEnd) this.rangeEnd = this.rangeEnd.x === this.x ? undefined : { x: this.rangeEnd.x, y: r.ymin };
    } else {
      this.df.deleteCols(r.xmin, r.xmax - r.xmin + 1);
      this._x = r.xmin;
      if (this.rangeEnd) this.rangeEnd = this.rangeEnd.y === this.y ? undefined : { x: r.xmin, y: this.rangeEnd.y };
    }
    this.refresh();
    this.refreshSelection(false);
  }

  deleteRows() { this._deleteAxis(true); }
  deleteCols() { this._deleteAxis(false); }

  undo() { this.df.undo(); this.refresh(); dom.validationPane.syncWithSheet(); }
  redo() { this.df.redo(); this.refresh(); dom.validationPane.syncWithSheet(); }
  toggleFixTop() { this.fixTop = !this.fixTop; this.refresh(); }
  trim() { this.df.trimAll(); this.refresh(); }

  expand() {
    if (this.rangeEnd) {
      this.df.fillSeries(this.getOrderedRange());
      this.refresh();
    }
  }

  shift(direction) {
    const range = this.getOrderedRange();
    const rows = range.ymax - range.ymin + 1, cols = range.xmax - range.xmin + 1;
    let dx = 0, dy = 0, moved = false;

    if (direction === 0 && this.df.shiftRows(range.ymin, rows, 'up')) { dy = -1; moved = true; }
    else if (direction === 1 && this.df.shiftCols(range.xmin, cols, 'right')) { dx = 1; moved = true; }
    else if (direction === 2 && this.df.shiftRows(range.ymin, rows, 'down')) { dy = 1; moved = true; }
    else if (direction === 3 && this.df.shiftCols(range.xmin, cols, 'left')) { dx = -1; moved = true; }

    if (moved) {
      const end = this.rangeEnd ? { x: this.rangeEnd.x + dx, y: this.rangeEnd.y + dy } : undefined;
      this._x = Math.max(0, this._x + dx);
      this._y = Math.max(0, this._y + dy);
      this.rangeEnd = end;
    }
    this.refresh();
    this.refreshSelection();
  }

  insert(direction) {
    const range = this.getOrderedRange();
    if (direction === 0) { this.df.insertRow(range.ymin); this._y++; if (this.rangeEnd) this.rangeEnd.y++; }
    else if (direction === 1) { this.df.insertCol(range.xmax + 1); }
    else if (direction === 2) { this.df.insertRow(range.ymax + 1); }
    else if (direction === 3) { this.df.insertCol(range.xmin); this._x++; if (this.rangeEnd) this.rangeEnd.x++; }
    this.refresh();
    this.refreshSelection();
  }

  transposeSelection() {
    if (this.df.lock) return;
    const r = this.getOrderedRange();
    const isWholeSheet = !this.rangeEnd || (r.xmin === 0 && r.ymin === 0 && r.xmax >= this.df.width - 1 && r.ymax >= this.df.height - 1);
    if (isWholeSheet) {
      this.df.transpose();
      this.focusCell(
        Math.min(this.y, Math.max(0, this.df.width - 1)),
        Math.min(this.x, Math.max(0, this.df.height - 1))
      );
      this.refresh();
      return;
    }
    const range = this.getOrderedRange();
    this.df.transpose(range);
    this.rangeEnd = { x: range.xmin + (range.ymax - range.ymin), y: range.ymin + (range.xmax - range.xmin) };
    this.refresh();
  }

  round(integer = true) {
    this.df.roundRange(this.getOrderedRange(), integer);
    this.refresh();
  }

  paste(matrix) {
    const range = this.getOrderedRange();
    this.df.pasteMatrix(range.xmin, range.ymin, matrix);
    this.refresh();
  }

  sort(colIndex = this.x, ascending = true) {
    this.df.sort(colIndex, {
      ascending,
      hasHeader: Boolean(this.fixTop || settings.sortIgnoreHeader),
      numbersFirst: Boolean(settings.sortNumbersFirst)
    });
    this.refresh();
  }

  find(isAdvanced = false) {
    this.finder.open(displayCellValue(this.df.get(this.x, this.getRowIndex(this.y))), isAdvanced);
  }

  clampSelection() {
    const maxCol = Math.max(0, this.df.width - 1);
    const maxRow = Math.max(0, this.rowCount - 1);
    this.x = clamp(this.x, 0, maxCol);
    this.y = clamp(this.y, 0, maxRow);
    if (this.rangeEnd) {
      this.rangeEnd.x = clamp(this.rangeEnd.x, 0, maxCol);
      this.rangeEnd.y = clamp(this.rangeEnd.y, 0, maxRow);
    }
    this.refresh();
    this.refreshSelection(true);
  }

  goToOccurrence(forward = true) {
    if (!this.df || this.df.width === 0 || this.df.height === 0) return;
    const next = this.df.goToMatching({ x: this.x, y: this.y }, forward ? 1 : -1);
    if (!next) Notification.quick('No match');
    else this.focusCell(next.x, next.y);
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    cancelAnimationFrame(this._refreshRafId);
    cancelAnimationFrame(this._selectionRafId);
    this._refreshRafId = this._selectionRafId = null;
  }
}

defineEl('ui-sheet', Sheet);
