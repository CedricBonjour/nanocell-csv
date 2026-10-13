/**
 * View Component for `<ui-sheet>` Web Component.
 * Handles DOM rendering, virtualized cell loading, header updates, and scrollbar calculations.
 * @module SheetView
 */
import { dom } from '../ui/AppLayout.js';
import { getSheet, getCsvHandle } from '../appContext.js';
import { stg } from '../ui/settings/Setting.js';
import { isUrl } from '../../../core/model/Cell.js';
import { isIsoDate } from '../../../core/utils/date.js';
import { Notification } from '../ui/Notification.js';
import { setIcon } from '../utils/icons.js';
import { createRange } from '../../../core/model/Range.js';


/**
 * Manages table DOM element generation, viewport cell rendering, and UI updates for Sheet.
 */
export class SheetView {
  /**
   * Instantiates a SheetView attached to a parent Sheet element.
   * @param {import('../Sheet.js').Sheet} sheet - Target Sheet web component instance.
   */
  constructor(sheet) {
    this.sheet = sheet;
    /** @type {HTMLTableElement} Table DOM element. */
    this.table = document.createElement("table");
    this.sheet.appendChild(this.table);
    this._isEditingCoords = false;
    this.initFooterLeft();
    this.initFooterLock();
  }

  /**
   * Gets HTMLCollection of table row elements.
   * @type {HTMLCollectionOf<HTMLTableRowElement>}
   */
  get rows() {
    return this.table.rows;
  }

  /**
   * Re-builds table DOM structure from scratch according to view row/column dimensions.
   */
  reload() {
    while (this.table.rows[0]) this.table.rows[0].remove();
    for (let y = 0; y < this.sheet.nViewRows + 1; y++) {
      const tr = document.createElement("tr");
      this.table.appendChild(tr);
      for (let x = 0; x < this.sheet.nViewCols + 1; x++) {
        let cell = document.createElement("td");
        cell.tx = x - 1;
        cell.ty = y - 1;
        
        const isHeader = (x === 0 || y === 0);
        if (isHeader) cell.classList.add("tHeader");
        if (y === 0) cell.classList.add("tColHeader");
        if (x === 0) cell.classList.add("tRowHeader");
        
        if (y === 0 && x > 0) {
          const hdrTxt = document.createElement("span");
          hdrTxt.classList.add("noclick");
          cell.append(hdrTxt);
        } else if (y > 0) {
          const div = document.createElement("div");
          cell.appendChild(div);
        }
        tr.appendChild(cell);
      }
    }
    this.refresh();
    this.sheet.slctRefresh(false);
  }

  /**
   * Refreshes visible table headers and grid cell content on animation frame.
   */
  refresh() {
    if (this._refreshRafId) {
      cancelAnimationFrame(this._refreshRafId);
      this._refreshRafId = null;
    }
    this._refreshRafId = requestAnimationFrame(() => {
      this._refreshRafId = null;
      for (let x = 0; x < this.sheet.width; x++) this.loadTopHeader(x);
      for (let y = 0; y < this.sheet.height; y++) {
        const by = this.sheet.baseY + y;
        const actualY = this.sheet.getRowIndex(by);
        this.loadLeftHeader(y, actualY);
        for (let x = 0; x < this.sheet.width; x++) this.loadCell(this.rows[y + 1].cells[x + 1], this.sheet.baseX + x, actualY);
      }
      let cell = this.sheet.selection?.bestInputCell();
      if (this.sheet.inputing && cell && this.sheet.inputField.parentNode !== cell) {
        cell.appendChild(this.sheet.inputField);
      }
      this.footerUpdate();
    });
  }

  /**
   * Loads cell content and applies type/error styling classes to cell container div.
   * @param {HTMLTableCellElement} c - Target table cell element.
   * @param {number} x - Column matrix coordinate.
   * @param {number} y - Row matrix coordinate.
   */
  loadCell(c, x, y) {
    if (!c) return;
    const div = c.firstChild;
    if (!div) return;
    
    if (y < 0 || y >= this.sheet.df.height) {
      div.className = "";
      div.textContent = "";
      return;
    }

    const d = this.sheet.df.get(x, y);
    if (d.length < 1) {
      div.className = "";
      div.textContent = "";
      return;
    }
    
    let cls = "";
    if (d[0] === '!') cls += " error";
    if (!isNaN(d)) cls += " num";
    if (isIsoDate(d)) cls += " date";
    if (isUrl(d)) cls += " url";
    if (stg.purple && (d.includes(',') || d.includes('"') || d.includes('\n'))) cls += " noComply";
    
    div.className = cls.charCodeAt(0) === 32 ? cls.slice(1) : cls;
    
    if (!d.includes('&') && !d.includes('<') && !d.includes('\n')) {
      div.textContent = d;
    } else {
      div.innerHTML = d.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>');
    }
  }

  /**
   * Loads content and width styling for top column header cell at index x.
   * @param {number} x - Viewport-relative column index.
   */
  loadTopHeader(x) {
    if (!this.rows[0] || !this.rows[0].cells[x + 1]) return;
    const cell = this.rows[0].cells[x + 1];
    if (this.sheet.fixTop && this.sheet.df.get(this.sheet.baseX + x, 0).length > 0)
      cell.firstChild.textContent = this.sheet.df.get(this.sheet.baseX + x, 0);
    else cell.firstChild.textContent = this.sheet.baseX + x + 1;

    const matrixX = this.sheet.baseX + x;
    if (this.sheet.expandedCol !== null && this.sheet.expandedCol !== undefined) {
      if (matrixX === this.sheet.expandedCol) {
        cell.classList.add('col-expanded');
        cell.classList.remove('col-collapsed');
        cell.style.width = "100%";
      } else {
        cell.classList.add('col-collapsed');
        cell.classList.remove('col-expanded');
        cell.style.width = "0%";
      }
    } else {
      cell.classList.remove('col-expanded', 'col-collapsed');
      const nCols = this.sheet?.nViewCols || 10;
      cell.style.width = (100.0 / nCols) + "%";
    }
  }

  /**
   * Recalculates and applies column width percentages across header row cells.
   * @returns {string} The computed column width percentage string.
   */
  calcColSizes() {
    const nCols = this.sheet?.nViewCols || 10;
    const widthStr = (100.0 / nCols) + '%';
    if (this.rows && this.rows[0]) {
      const colCount = Math.max(this.sheet?.width || 0, this.rows[0].cells.length - 1);
      for (let x = 0; x < colCount; x++) {
        this.loadTopHeader(x);
      }
    }
    return widthStr;
  }

  /**
   * Loads content for left row header cell at index y.
   * @param {number} y - Viewport-relative row index.
   * @param {number} [actualY] - Actual mapped matrix row index.
   */
  loadLeftHeader(y, actualY = undefined) {
    const row = this.rows[y + 1];
    if (!row || !row.cells[0]) return;
    const div = row.cells[0].firstChild;
    let label = "";
    if (actualY !== undefined) {
      label = actualY >= 0 ? String(actualY + 1) : "";
    } else {
      label = String(this.sheet.baseY + y + 1);
    }
    if (div) {
      div.textContent = label;
    } else {
      row.cells[0].textContent = label;
    }
  }

  /**
   * Applies `slct` selection styling class across table cells in active selection range.
   */
  viewRangeRender() {
    if (!this.sheet.rangeEnd) return;
    const r = this.sheet.selection ? this.sheet.selection.rangeOrdered() : createRange(this.sheet.x, this.sheet.y, this.sheet.rangeEnd.x, this.sheet.rangeEnd.y);
    const xStart = Math.max(0, r.xmin - this.sheet.baseX);

    const xEnd = Math.min(this.sheet.width - 1, r.xmax - this.sheet.baseX);
    const yStart = Math.max(0, r.ymin - this.sheet.baseY);
    const yEnd = Math.min(this.sheet.height - 1, r.ymax - this.sheet.baseY);

    if (xStart <= xEnd && yStart <= yEnd) {
      for (let x = xStart; x <= xEnd; x++) {
        for (let y = yStart; y <= yEnd; y++) {
          const cell = this.rows[y + 1]?.cells[x + 1];
          if (cell) {
            cell.classList.add("slct");
            if (this.sheet.selection?._selectedCells) {
              this.sheet.selection._selectedCells.push(cell);
            }
          }
        }
      }
    }
    this.footerUpdate();
  }

  /**
   * Initializes click listener on footerLeft to enable coordinate editing.
   */
  initFooterLeft() {
    const el = dom?.footerDiv?.left;
    if (!el || el._coordClickBound) return;
    el._coordClickBound = true;
    el.title = 'Click to jump to cell';
    el.addEventListener('click', (e) => {
      if (e.target.closest('.coord-editor')) return;
      const activeSheet = getSheet();
      if (activeSheet?.view) {
        activeSheet.view.startCoordEdit();
      }
    });
  }

  /**
   * Replaces footerLeft text with 2 editable coordinate input fields to jump to cell.
   */
  startCoordEdit() {
    const f = dom?.footerDiv;
    if (!f || !f.left || this._isEditingCoords) return;
    this._isEditingCoords = true;

    const currentX = this.sheet.x + 1;
    const currentY = this.sheet.y + 1;

    f.left.classList.add('editing');
    f.left.innerHTML = `
      <span class="coord-editor">
        <input type="number" class="coord-input coord-col finder-input" min="1" value="${currentX}" aria-label="Column" title="Column" />
        <span class="coord-sep">:</span>
        <input type="number" class="coord-input coord-row finder-input" min="1" value="${currentY}" aria-label="Row" title="Row" />
        <button class="icon coord-go-btn" type="button" title="Go to cell (Enter)" aria-label="Go to cell"></button>
      </span>
    `;

    const inputCol = f.left.querySelector('.coord-col');
    const inputRow = f.left.querySelector('.coord-row');
    const goBtn = f.left.querySelector('.coord-go-btn');
    const container = f.left.querySelector('.coord-editor');

    if (goBtn) {
      setIcon(goBtn, 'arrow_right');
    }

    let committed = false;

    const commit = () => {
      if (committed) return;
      committed = true;
      this._isEditingCoords = false;
      f.left.classList.remove('editing');

      let col = parseInt(inputCol.value, 10);
      let row = parseInt(inputRow.value, 10);

      if (isNaN(col)) col = currentX;
      if (isNaN(row)) row = currentY;

      col = Math.max(1, col);
      row = Math.max(1, row);

      const targetX = col - 1;
      const targetY = row - 1;

      this.sheet.rangeEnd = undefined;
      this.sheet.slctRange = false;
      this.sheet.x = targetX;
      this.sheet.y = targetY;
      this.sheet.selection.slctFocus();
      this.refresh();
      this.sheet.selection.slctRefresh(false);
      this.footerUpdate();
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      this._isEditingCoords = false;
      f.left.classList.remove('editing');
      this.footerUpdate();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };

    inputCol.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          if (goBtn) goBtn.focus();
          else { inputRow.focus(); inputRow.select(); }
        } else {
          inputRow.focus();
          inputRow.select();
        }
      } else {
        handleKeyDown(e);
      }
    });

    inputRow.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          inputCol.focus();
          inputCol.select();
        } else {
          if (goBtn) goBtn.focus();
          else { inputCol.focus(); inputCol.select(); }
        }
      } else {
        handleKeyDown(e);
      }
    });

    if (goBtn) {
      goBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        commit();
      });
      goBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            inputRow.focus();
            inputRow.select();
          } else {
            inputCol.focus();
            inputCol.select();
          }
        } else {
          handleKeyDown(e);
        }
      });
    }

    container.addEventListener('click', (e) => e.stopPropagation());

    const handleFocusOut = () => {
      setTimeout(() => {
        if (!committed && container && !container.contains(document.activeElement)) {
          commit();
        }
      }, 100);
    };

    inputCol.addEventListener('focusout', handleFocusOut);
    inputRow.addEventListener('focusout', handleFocusOut);
    if (goBtn) {
      goBtn.addEventListener('focusout', handleFocusOut);
    }

    inputCol.focus();
    inputCol.select();
  }

  /**
   * Initializes click feedback on the footer lock / edit status icon.
   */
  initFooterLock() {
    const f = dom?.footerDiv;
    if (!f || !f.lock || f.lock._hasLockListener) return;
    f.lock._hasLockListener = true;

    f.lock.addEventListener('click', () => {
      const csv = getCsvHandle();
      const isLocked = Boolean(this.sheet?.df?.lock || (csv && csv.viewOnly));
      if (!isLocked) return;

      const title = this.sheet?.filterRows
        ? "File is locked while a filter is active."
        : "File is in View-Only mode. Edits are disabled.";
      Notification.warning(title, "View-Only Mode");
    });
  }

  /**
   * Updates status text in application footer elements (selection info, matrix size, active cell content, save status).
   */
  footerUpdate() {
    const f = dom?.footerDiv;
    if (!f || !f.left) return;
    this.initFooterLeft();
    if (this._isEditingCoords) return;
    const actualY = this.sheet.getRowIndex(this.sheet.y);
    if (this.sheet.rangeEnd) {
      const deltaX = Math.abs((this.sheet.rangeEnd.x) - (this.sheet.x)) + 1;
      const actualRangeY = this.sheet.getRowIndex(this.sheet.rangeEnd.y);
      const startYDisplay = actualY >= 0 ? actualY + 1 : this.sheet.y + 1;
      const endYDisplay = actualRangeY >= 0 ? actualRangeY + 1 : this.sheet.rangeEnd.y + 1;
      const deltaY = Math.abs(endYDisplay - startYDisplay) + 1;
      f.left.innerHTML = (this.sheet.x + 1) + ":" + startYDisplay + " to " + (this.sheet.rangeEnd.x + 1) + ":" + endYDisplay + " (" + deltaX + "x" + deltaY + ")";
    }
    else {
      const yDisplay = actualY >= 0 ? actualY + 1 : this.sheet.y + 1;
      f.left.innerHTML = (this.sheet.x + 1) + ":" + yDisplay;
    }

    if (this.sheet.filterRows) {
      f.right.innerHTML = this.sheet.df.width + ":" + this.sheet.filterRows.length + " (" + this.sheet.df.height + ")";
    } else {
      f.right.innerHTML = this.sheet.df.width + ":" + this.sheet.df.height;
    }

    const cellVal = (actualY >= 0 && actualY < this.sheet.df.height) ? this.sheet.df.get(this.sheet.x, actualY) : '';
    f.center.innerHTML = cellVal.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>').replaceAll(' ', '<span class="cell-space-dot">&bull;</span>');
    if (f.lock) {
      this.initFooterLock();
      const csv = getCsvHandle();
      const isLocked = Boolean(this.sheet.df?.lock || (csv && csv.viewOnly));
      const hasFileHandle = Boolean(csv && csv.handle);
      const isSaved = Boolean(this.sheet.df?.isSaved);

      let lockIcon = "edit_square";
      let lockTitle = "New file edit";

      if (isLocked) {
        lockIcon = "lock";
        lockTitle = this.sheet.filterRows ? "Locked (filter active)" : "Locked (view-only mode)";
      } else if (hasFileHandle && isSaved) {
        lockIcon = "save_disk";
        lockTitle = "File saved (no edits ongoing)";
      } else {
        lockIcon = "edit_square";
        lockTitle = hasFileHandle ? "Unsaved changes relative to disk" : "New file edit";
      }

      setIcon(f.lock, lockIcon);
      f.lock.setAttribute("title", lockTitle);
      f.lock.setAttribute("aria-label", lockTitle);
      f.lock.classList.toggle('warning', isLocked);
    }
  }

  /**
   * Recalculates position and dimensions of custom UI scrollbars based on matrix bounds and viewport scroll origins.
   */
  scrollbarRefresh() {
    let dfh = this.sheet.rowCount;
    let dfw = this.sheet.df.width;
    let visible_minY = this.sheet.nViewRows / 2;
    let visible_minX = this.sheet.nViewCols - 2;
    let dsy = dom?.content?.scrollerY;
    let dsx = dom?.content?.scrollerX;
    if (!dsy || !dsx) return;
    const showY = dfh >= visible_minY;
    const showX = dfw >= visible_minX;

    dsy.classList.toggle('hidden', !showY);
    dsy.style.display = showY ? "block" : "none";
    dsx.classList.toggle('hidden', !showX);
    dsx.style.display = showX ? "block" : "none";

    const totalY = Math.max(dfh - 1, this.sheet.baseY, 1);
    const totalX = Math.max(dfw - 1, this.sheet.baseX, 1);
    const sheetRect = (showY || showX) && this.sheet.getBoundingClientRect ? this.sheet.getBoundingClientRect() : null;

    if (showY) {
      const sizeY = (totalY < 100) ? "lg" : (totalY < 1000 ? "md" : "sm");
      dsy.setAttribute('data-size', sizeY);
      if (totalY < 100) dsy.style.height = "50vh";
      else if (totalY < 1000) dsy.style.height = "20vh";
      else dsy.style.height = "10vh";
      let top = (this.rows[1] && sheetRect) ? (this.rows[1].getBoundingClientRect().top - sheetRect.top) : 0;
      let bot = sheetRect ? sheetRect.height : 0;
      let theight = bot - top - dsy.offsetHeight;
      dsy.style.top = String(top + Math.round(theight * this.sheet.baseY / totalY)) + "px";
    }
    if (showX) {
      const sizeX = (totalX < 30) ? "lg" : (totalX < 100 ? "md" : "sm");
      dsx.setAttribute('data-size', sizeX);
      if (totalX < 30) dsx.style.width = "50vw";
      else if (totalX < 100) dsx.style.width = "20vw";
      else dsx.style.width = "10vw";
      let left = (this.rows[0] && this.rows[0].cells[1]) ? this.rows[0].cells[1].getBoundingClientRect().left : 0;
      let right = sheetRect ? sheetRect.right : 0;
      let twidth = right - left - dsx.offsetWidth;
      dsx.style.left = String(left + Math.round(twidth * this.sheet.baseX / totalX)) + "px";
    }
  }

}

