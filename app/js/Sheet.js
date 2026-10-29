/**
 * @file app/js/Sheet.js
 * Unified <ui-sheet> spreadsheet web component: virtualized table DOM rendering,
 * viewport & range selection, inline cell editing, clipboard operations, and mouse/key routing.
 */

import { Dataframe, orderRange, isUrl, isIsoDate } from '../core/Dataframe.js';
import { CsvParser, CsvSerializer, SeparatorDetector } from '../core/Csv.js';
import { getSheet, setSheet, Setting, settings } from './state.js';
import { BaseElement, defineEl, formatCellHtml, getTodayIsoDate } from './utils.js';
import { dom, updateFooter } from './AppLayout.js';
import { Scroller, refreshScrollbars } from './Scroller.js';
import { FinderDialog, FilterDialog } from './SheetOverlays.js';
import { Notification } from './Notification.js';

let dragTarget = null;
let mouseX = 0, mouseY = 0;
let scrollIntervalId = null;
let globalMouseBound = false;

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
      if (sheet.rangeEnd) sheet.rangeEnd.x = sheet.baseX + sheet.width - 1;
      sheet.baseX++;
      changed = true;
    }
    if (mouseY >= rect.bottom) {
      if (sheet.rangeEnd) sheet.rangeEnd.y = sheet.baseY + sheet.height - 1;
      sheet.baseY++;
      changed = true;
    }
    if (mouseX <= rect.left + 5) {
      if (sheet.rangeEnd) sheet.rangeEnd.x = sheet.baseX;
      sheet.baseX--;
      changed = true;
    }
    if (changed) sheet.refreshSelection(false);
  }, 100);
}

function bindGlobalMouse() {
  if (globalMouseBound || typeof document === 'undefined') return;
  globalMouseBound = true;

  document.addEventListener('contextmenu', (event) => {
    if (!event.ctrlKey && dom?.contextMenu) {
      event.preventDefault();
      dom.contextMenu.openAt(event);
    }
  });

  document.addEventListener('mouseup', (event) => {
    if (event.buttons < 1) {
      if (dragTarget instanceof Scroller) dragTarget.endDrag();
      dragTarget = null;
      if (scrollIntervalId !== null) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
      }
    }
  });

  document.addEventListener('mousedown', (event) => {
    const tag = event.target?.tagName;
    const sheet = getSheet();
    const isSheetInteraction = Boolean(sheet?.contains?.(event.target) || event.target instanceof Scroller);
    if (
      tag !== 'INPUT' && tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'UI-GLYPH' &&
      isSheetInteraction
    ) {
      event.preventDefault();
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur?.();
      }
    }
    if (event.button !== 0 || !sheet) return;

    if (event.target instanceof Scroller) {
      dragTarget = event.target;
      dragTarget.startDrag(sheet);
      return;
    }

    const cell = event.target.closest?.('td, th');
    if (!cell || !sheet.contains(cell)) {
      dragTarget = null;
      return;
    }

    if (cell.colOffset < 0 && cell.rowOffset < 0) {
      dragTarget = 'cornerHeader';
      sheet.selectAll();
    } else if (cell.rowOffset < 0) {
      dragTarget = 'colHeader';
      const col = cell.colOffset + sheet.baseX;
      sheet.selectCol(event.shiftKey ? sheet.x : col, col);
      startOutOfBoundsScroll();
    } else if (cell.colOffset < 0) {
      dragTarget = 'rowHeader';
      const row = cell.rowOffset + sheet.baseY;
      sheet.selectRow(event.shiftKey ? sheet.y : row, row);
      startOutOfBoundsScroll();
    } else {
      dragTarget = 'cell';
      sheet.isSelectingRange = Boolean(event.shiftKey);
      if (!event.shiftKey) sheet.rangeEnd = undefined;
      sheet.x = cell.colOffset + sheet.baseX;
      sheet.y = cell.rowOffset + sheet.baseY;
      if (event.ctrlKey && cell.firstElementChild?.classList.contains('url')) {
        window.open(cell.innerText, '_blank');
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

export class Sheet extends BaseElement {
  static _finder = null;
  static _filter = null;

  constructor(df = new Dataframe()) {
    super();
    bindGlobalMouse();
    this.df = df;
    setSheet(this);

    this.table = typeof document !== 'undefined' ? document.createElement?.('table') : null;
    const hasDom = Boolean(this.table?.rows);

    this.finder = hasDom ? (Sheet._finder ||= new FinderDialog(this)) : null;
    if (this.finder) this.finder.sheet = this;
    this.filter = hasDom ? (Sheet._filter ||= new FilterDialog(this)) : null;
    if (this.filter) this.filter.sheet = this;

    this.filterRows = null;
    this._preFilterLock = undefined;
    this.inputField = hasDom ? document.createElement('input') : null;
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

    if (!hasDom) return;

    this.id = 'sheet';
    this.classList.add('sheet');
    this.appendChild(this.table);

    this.bindEvents();

    const container = dom?.mainContainer || globalThis.document?.getElementById?.('main-container');
    if (container) {
      container.querySelectorAll('ui-sheet, #sheet').forEach(el => {
        if (el !== this) { el.disconnectedCallback?.(); el.remove(); }
      });
      if (this.parentNode !== container) container.appendChild(this);
      if (dom?.content?.scrollerY) container.appendChild(dom.content.scrollerY);
      if (dom?.content?.scrollerX) container.appendChild(dom.content.scrollerX);
    } else if (dom?.content) {
      dom.content.innerHTML = '';
      dom.content.appendChild(this);
      if (dom.content.scrollerY) dom.content.appendChild(dom.content.scrollerY);
      if (dom.content.scrollerX) dom.content.appendChild(dom.content.scrollerX);
    }

    dom?.validationPane?.reset?.();
    this.reload();
  }

  get rows() { return this.table?.rows; }
  get width() { return this.rows?.[0] ? this.rows[0].cells.length - 1 : this.viewCols; }
  get height() { return this.rows ? this.rows.length - 1 : this.viewRows; }
  get rowCount() { return this.filterRows ? this.filterRows.length : this.df.height; }

  get x() { return this._x; }
  set x(col) {
    if (this.isEditing) this.commitEdit();
    if (!this.isSelectingRange) this.rangeEnd = undefined;
    else if (!this.rangeEnd) this.rangeEnd = { x: this._x, y: this._y };
    this._x = Math.max(0, col);
  }

  get y() { return this._y; }
  set y(row) {
    if (this.isEditing) this.commitEdit();
    if (!this.isSelectingRange) this.rangeEnd = undefined;
    else if (!this.rangeEnd) this.rangeEnd = { x: this._x, y: this._y };
    this._y = Math.max(0, row);
  }

  get baseX() { return this._baseX; }
  set baseX(col) {
    const next = Math.max(0, col);
    if (next !== this._baseX) { this._baseX = next; this.refresh(); }
  }

  get baseY() { return this._baseY; }
  set baseY(row) {
    const next = Math.max(0, row);
    if (next !== this._baseY) { this._baseY = next; this.refresh(); }
  }

  // --- Virtualized Table Rendering ---

  reload() {
    if (!this.rows) return;
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
    if (!this.rows || typeof requestAnimationFrame !== 'function') return;
    if (this._refreshRafId) cancelAnimationFrame(this._refreshRafId);
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
      if (this.finder?.isOpen) this.finder.syncColBounds?.(false);
      if (this.filter?.isOpen) this.filter.syncColBounds?.(false);
      updateFooter(this);
    });
  }

  refreshScrollbars() { refreshScrollbars(this); }
  updateFooter() { updateFooter(this); }

  renderCell(cellEl, x, y) {
    const contentDiv = cellEl?.firstChild;
    if (!contentDiv) return;
    const value = (y >= 0 && y < this.df.height) ? this.df.get(x, y) : '';
    if (!value) {
      contentDiv.className = '';
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
    const headerText = this.fixTop ? this.df.get(colIndex, 0) : '';
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
        this.rangeEnd = { x: td.colOffset + this.baseX, y: td.rowOffset + this.baseY };
        this.refreshSelection(false);
      } else if (dragTarget === 'colHeader' && td.colOffset >= 0) {
        this.selectCol(this.x, td.colOffset + this.baseX);
      } else if (dragTarget === 'rowHeader' && td.rowOffset >= 0) {
        this.selectRow(this.y, td.rowOffset + this.baseY);
      }
    });

    this.addEventListener('dblclick', (event) => {
      const td = event.target.closest('td');
      if (!td || td.colOffset === undefined || td.rowOffset === undefined) return;
      if (td.colOffset >= 0 && td.rowOffset >= 0) {
        if (!this.df?.lock) this.startEdit();
      } else if (td.rowOffset < 0 && td.colOffset >= 0) {
        const colIdx = this.baseX + td.colOffset;
        this.expandedCol = this.expandedCol === colIdx ? null : colIdx;
        this.refresh();
      }
    });
  }

  handleKeyDown(event, key, ctrlDown, shift, alt) {
    const pageSize = settings?.rows || 10;
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
      if (!this.df?.lock) this.startEdit();
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
      if (!this.df?.lock) {
        event.preventDefault();
        this.startEdit(event.key);
      }
      return true;
    }
    return false;
  }

  getRowIndex(viewY) {
    if (!this.filterRows) return viewY;
    return (viewY >= 0 && viewY < this.filterRows.length) ? this.filterRows[viewY] : -1;
  }

  setFilter(colIndex, text, matchCase = false) {
    if (!text) return this.clearFilter();
    if (this.filterRows === null) this._preFilterLock = Boolean(this.df.lock);
    this.df.lock = true;
    this.filterRows = this.df.filterColumn(colIndex, text, matchCase, Boolean(this.fixTop));
    this.baseY = 0;
    this.y = 0;
    this.refresh();
    this.refreshSelection(true);
  }

  clearFilter() {
    if (this.filterRows !== null) {
      this.filterRows = null;
      if (this.df && this._preFilterLock !== undefined) {
        this.df.lock = this._preFilterLock;
        this._preFilterLock = undefined;
      }
      this.refresh();
      this.refreshSelection(false);
    }
  }

  openFilter(colIndex) { this.filter?.open(colIndex); }

  // --- Selection & Viewport ---

  getOrderedRange() {
    const end = this.rangeEnd || this;
    return orderRange({ xmin: this.x, xmax: end.x, ymin: this.y, ymax: end.y });
  }

  getSelectedMatrix() { return this.df.slice(this.getOrderedRange()); }

  selectRange(x, y, endX, endY, scrollIntoView = false) {
    this.isSelectingRange = false;
    this.x = x;
    this.y = y;
    this.rangeEnd = (endX !== undefined && endY !== undefined && (endX !== x || endY !== y))
      ? { x: endX, y: endY }
      : undefined;
    this.refreshSelection(scrollIntoView);
  }

  focusCell(x, y) { this.selectRange(x, y, undefined, undefined, true); }
  selectAll() { this.selectRange(0, 0, this.df.width - 1, this.df.height - 1, false); }
  selectCol(startCol, endCol = startCol) { this.selectRange(startCol, 0, endCol, Math.max(0, this.df.height - 1), false); }
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
    if (!this.rows || typeof requestAnimationFrame !== 'function') return;
    if (this._selectionRafId) cancelAnimationFrame(this._selectionRafId);
    this._selectionRafId = requestAnimationFrame(() => {
      this._selectionRafId = null;
      this.clearSelectionHighlight();
      if (scrollIntoView) this.scrollToSelection();
      refreshScrollbars(this);

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
    if (event.ctrlKey) {
      event.preventDefault();
      const minRows = Setting.getDef?.('rows')?.min ?? 10;
      const minCols = Setting.getDef?.('cols')?.min ?? 3;
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
    if (this.df?.lock) return;
    const cell = this.getActiveCellElement();
    if (!cell) return;
    const actualY = this.getRowIndex(this.y);
    this.isEditing = true;
    this.inputField.value = initialText || (actualY >= 0 ? this.df.get(this.x, actualY).replaceAll('\n', '\u25BE') : '');
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
      if (this.finder?.isOpen) this.finder.syncColBounds?.(false);
      if (this.filter?.isOpen) this.filter.syncColBounds?.(false);
    }
    this.cancelEditOnBlur = false;
    this.inputField.remove();
  }

  getCopyMatrix() {
    const range = this.getOrderedRange();
    let matrix = this.getSelectedMatrix();
    const includeHeaders = Boolean(settings?.copyIncludeHeaders);
    if (includeHeaders && range.ymin > 0 && this.df?.height > 0) {
      const headerRow = this.df.slice({ xmin: range.xmin, xmax: range.xmax, ymin: 0, ymax: 0 })[0];
      if (headerRow) matrix = [headerRow, ...matrix];
    }
    const hasHeader = includeHeaders || (range.ymin === 0 && Boolean(this.fixTop || settings?.freezeHeaderOnOpen));
    return { matrix, hasHeader };
  }

  copySelectionData() {
    const { matrix, hasHeader } = this.getCopyMatrix();
    const serializer = new CsvSerializer({ delimiter: '\t' });
    const text = serializer.serialize(matrix);
    const cellCount = matrix.length * (matrix[0]?.length || 0);
    const html = (settings?.copyPasteHtml !== false && cellCount > 1)
      ? serializer.serializeHtml(matrix, { hasHeader })
      : '';
    return { text, html };
  }

  cutSelectionData() {
    if (this.df?.lock) return { text: '', html: '' };
    const data = this.copySelectionData();
    this.deleteSelection();
    return data;
  }

  pasteClipboard(rawText, rawHtml) {
    if (this.df?.lock) return;
    if (settings?.copyPasteHtml !== false && rawHtml) {
      const htmlMatrix = CsvParser.parseHtmlTable(rawHtml, { trimWhitespace: Boolean(settings?.trimUnquoted) });
      if (htmlMatrix?.length > 0) {
        this.paste(htmlMatrix);
        return;
      }
    }
    if (rawText) this.pasteText(rawText);
  }

  copySelection() {
    return this.copySelectionData().text;
  }

  cutSelection() {
    if (this.df?.lock) return '';
    const text = this.copySelection();
    this.deleteSelection();
    return text;
  }

  pasteText(rawText) {
    if (!rawText || this.df?.lock) return;
    const delimiter = rawText.includes('\t') ? '\t' : SeparatorDetector.detect(rawText);
    const matrix = new CsvParser({ delimiter, trimUnquotedWhitespace: Boolean(settings?.trimUnquoted) }).parse(rawText);
    if (matrix?.length > 0) this.paste(matrix);
  }

  insertDate() {
    const todayStr = getTodayIsoDate();
    if (this.isEditing && this.inputField) {
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

  undo() { this.df.undo(); this.refresh(); dom?.validationPane?.syncWithSheet?.(); }
  redo() { this.df.redo(); this.refresh(); dom?.validationPane?.syncWithSheet?.(); }
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
    if (direction === 0) { this.df.insertRow(this.y); this.y++; }
    else if (direction === 1) { this.df.insertCol(this.x + 1); }
    else if (direction === 2) { this.df.insertRow(this.y + 1); }
    else if (direction === 3) { this.df.insertCol(this.x); this.x++; }
    this.refresh();
    this.refreshSelection();
  }

  transposeSelection() {
    if (this.df.lock) return;
    if (!this.rangeEnd) {
      this.df.transpose();
      this.focusCell(
        Math.min(this.y, Math.max(0, this.df.width - 1)),
        Math.min(this.x, Math.max(0, this.df.height - 1))
      );
      refreshScrollbars(this);
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
    this.finder?.open(this.df.get(this.x, this.getRowIndex(this.y)), isAdvanced);
    if (!isAdvanced) refreshScrollbars(this);
  }

  goToOccurrence(forward = true) {
    if (!this.df || this.df.width === 0 || this.df.height === 0) return;
    const next = this.df.goToMatching({ x: this.x, y: this.y }, forward ? 1 : -1);
    if (!next) Notification.quick('No match');
    else this.focusCell(next.x, next.y);
  }

  disconnectedCallback() {
    if (this._refreshRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._refreshRafId);
      this._refreshRafId = null;
    }
    if (this._selectionRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._selectionRafId);
      this._selectionRafId = null;
    }
  }
}

defineEl('ui-sheet', Sheet);
