/**
 * View Component for `<ui-sheet>` Web Component.
 * Handles DOM rendering, virtualized cell loading, header updates, and scrollbar calculations.
 * @module SheetView
 */
import { dom } from '../dom.js';
import { StateManager } from '../StateManager.js';
import { Setting, stg } from '../Setting.js';
import { isValidUrl } from '../utils/misc.js';
import '../utils/DateExt.js';

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
    StateManager.emit('sheet:updated', { width: this.sheet.width, height: this.sheet.height });
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
        } else if (x > 0 && y > 0) {
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
    StateManager.emit('sheet:updated', { width: this.sheet.width, height: this.sheet.height });
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : (cb) => cb());
    raf(() => {
      for (let x = 0; x < this.sheet.width; x++) this.loadTopHeader(x);
      for (let y = 0; y < this.sheet.height; y++) {
        const by = this.sheet.baseY + y;
        this.loadLeftHeader(y);
        for (let x = 0; x < this.sheet.width; x++) this.loadCell(this.rows[y + 1].cells[x + 1], this.sheet.baseX + x, by);
      }
      let cell = this.sheet.bestInputCell();
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
    
    div.className = ""; // Reset classes for virtualization reuse
    const d = this.sheet.df.get(x, y);
    if (d.length < 1) {
      div.innerHTML = "";
      return;
    }
    
    let txt = d.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    if (txt[0] === '!') div.classList.add("error");
    if (txt !== '' && !isNaN(txt)) div.classList.add("num");
    if (txt !== '' && Date.isDate(txt)) div.classList.add("date");
    if (isValidUrl(txt)) div.classList.add("url");
    if (stg.purple && txt !== '' && (txt.includes(',') || txt.includes('"') || txt.includes('\n'))) div.classList.add("noComply");
    
    txt = txt.replaceAll('\n', '<br>');
    div.innerHTML = txt;
  }

  /**
   * Loads content and width styling for top column header cell at index x.
   * @param {number} x - Viewport-relative column index.
   */
  loadTopHeader(x) {
    if (!this.rows[0] || !this.rows[0].cells[x + 1]) return;
    if (this.sheet.fixTop && this.sheet.df.get(this.sheet.baseX + x, 0).length > 0)
      this.rows[0].cells[x + 1].firstChild.innerHTML = this.sheet.df.get(this.sheet.baseX + x, 0);
    else this.rows[0].cells[x + 1].firstChild.innerHTML = this.sheet.baseX + x + 1;

    const matrixX = this.sheet.baseX + x;
    if (this.sheet.expandedCol !== null && this.sheet.expandedCol !== undefined) {
      if (matrixX === this.sheet.expandedCol) {
        this.rows[0].cells[x + 1].style.width = "100%";
      } else {
        this.rows[0].cells[x + 1].style.width = "0%";
      }
    } else {
      this.rows[0].cells[x + 1].style.width = String(100.0 / this.sheet.nViewCols) + "%";
    }
  }

  /**
   * Loads content for left row header cell at index y.
   * @param {number} y - Viewport-relative row index.
   */
  loadLeftHeader(y) {
    if (!this.rows[y + 1] || !this.rows[y + 1].cells[0]) return;
    this.rows[y + 1].cells[0].innerHTML = "<div>" + (this.sheet.baseY + y + 1) + "</div>";
  }

  /**
   * Applies `slct` selection styling class across table cells in active selection range.
   */
  viewRangeRender() {
    let xStart = Math.min(this.sheet.x, this.sheet.rangeEnd.x) - this.sheet.baseX;
    let yStart = Math.min(this.sheet.y, this.sheet.rangeEnd.y) - this.sheet.baseY;
    let xEnd = Math.max(this.sheet.x, this.sheet.rangeEnd.x) - this.sheet.baseX;
    let yEnd = Math.max(this.sheet.y, this.sheet.rangeEnd.y) - this.sheet.baseY;
    if (xStart < 0) xStart = 0;
    if (yStart < 0) yStart = 0;
    if (xEnd >= this.sheet.width) xEnd = this.sheet.width - 1;
    if (yEnd >= this.sheet.height) yEnd = this.sheet.height - 1;
    for (let x = xStart; x <= xEnd; x++)
      for (let y = yStart; y <= yEnd; y++)
        if (this.rows[y + 1] && this.rows[y + 1].cells[x + 1])
          this.rows[y + 1].cells[x + 1].classList.add("slct");
    this.footerUpdate();
  }

  /**
   * Updates status text in application footer elements (selection info, matrix size, active cell content, save status).
   */
  footerUpdate() {
    const f = dom.footerDiv;
    if (!f || !f.left) return;
    if (this.sheet.rangeEnd) {
      const deltaX = Math.abs((this.sheet.rangeEnd.x) - (this.sheet.x)) + 1;
      const deltaY = Math.abs((this.sheet.rangeEnd.y) - (this.sheet.y)) + 1;
      f.left.innerHTML = (this.sheet.x + 1) + ":" + (this.sheet.y + 1) + " to " + (this.sheet.rangeEnd.x + 1) + ":" + (this.sheet.rangeEnd.y + 1) + " (" + deltaX + "x" + deltaY + ")";
    }
    else f.left.innerHTML = (this.sheet.x + 1) + ":" + (this.sheet.y + 1);
    f.right.innerHTML = this.sheet.df.width + ":" + this.sheet.df.height;
    f.center.innerHTML = this.sheet.df.get(this.sheet.x, this.sheet.y).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>').replaceAll(' ', '<span style="color:var(--dots)">&bull;</span>');
    if (f.lock) f.lock.src = (this.sheet.df.isSaved) ? "icn/lock.svg" : "icn/edit.svg";
  }

  /**
   * Recalculates position and dimensions of custom UI scrollbars based on matrix bounds and viewport scroll origins.
   */
  scrollbarRefresh() {
    let dfh = this.sheet.df.height;
    let dfw = this.sheet.df.width;
    let visible_minY = this.sheet.nViewRows / 2;
    let visible_minX = this.sheet.nViewCols - 2;
    let dsy = dom.content?.scrollerY;
    let dsx = dom.content?.scrollerX;
    if (!dsy || !dsx) return;
    dsy.style.display = (dfh < visible_minY) ? "none" : "block";
    dsx.style.display = (dfw < visible_minX) ? "none" : "block";
    if (dfh >= visible_minY) {
      if (dfh < 100) dsy.style.height = "50vh";
      else if (dfh < 1000) dsy.style.height = "20vh";
      else dsy.style.height = "10vh";
      let top = this.rows[1] ? (this.rows[1].getBoundingClientRect().top - this.sheet.getBoundingClientRect().top) : 0;
      let bot = this.sheet.getBoundingClientRect().height;
      let theight = bot - top - dsy.offsetHeight;
      dsy.style.top = String(top + Math.round(theight * this.sheet.baseY / (this.sheet.df.height - 1))) + "px";
    }
    if (dfw >= visible_minX) {
      if (dfw < 30) dsx.style.width = "50vw";
      else if (dfw < 100) dsx.style.width = "20vw";
      else dsx.style.width = "10vw";
      let left = (this.rows[0] && this.rows[0].cells[1]) ? this.rows[0].cells[1].getBoundingClientRect().left : 0;
      let right = this.sheet.getBoundingClientRect().right;
      let twidth = right - left - dsx.offsetWidth;
      dsx.style.left = String(left + Math.round(twidth * this.sheet.baseX / (this.sheet.df.width - 1))) + "px";
    }
  }

}

