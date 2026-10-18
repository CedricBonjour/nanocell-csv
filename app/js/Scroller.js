/**
 * @file app/js/Scroller.js
 * Virtualized spreadsheet scrollbar component (<ui-scroller>):
 * encapsulates vertical/horizontal track geometry, proportional thumb sizing,
 * position updates, and pointer drag-scrolling.
 */

import { BaseElement, defineEl, clamp } from './utils.js';
import { getSheet } from './state.js';

export function getScrollBoundsY(sheet) {
  if (!sheet?.rows?.[1]) return null;
  const rect = sheet.getBoundingClientRect?.();
  if (!rect) return null;
  const offset = sheet.rows[1].getBoundingClientRect().top;
  return { offset, topOffset: offset - rect.top, trackHeight: Math.max(1, rect.bottom - offset) };
}

export function getScrollBoundsX(sheet) {
  if (!sheet?.rows?.[0]?.cells?.[0]) return null;
  const rect = sheet.getBoundingClientRect?.();
  if (!rect) return null;
  const leftCell = sheet.rows[0].cells[1] || sheet.rows[0].cells[0];
  const offset = sheet.rows[0].cells[0].getBoundingClientRect().left;
  const leftOffset = leftCell.getBoundingClientRect().left;
  return { offset, leftOffset, trackWidth: Math.max(1, rect.right - offset), barTrackWidth: rect.right - leftOffset };
}

export class Scroller extends BaseElement {
  constructor(vertical = true) {
    super();
    this.vertical = Boolean(vertical);
    this._cachedBounds = null;
    this.classList?.add(this.vertical ? 'vertical' : 'horizontal');
  }

  getBounds(sheet) {
    return this.vertical ? getScrollBoundsY(sheet) : getScrollBoundsX(sheet);
  }

  startDrag(sheet) {
    this._cachedBounds = this.getBounds(sheet);
  }

  endDrag() {
    this._cachedBounds = null;
  }

  dragTo(event, sheet) {
    if (!sheet) return;
    const bounds = (this._cachedBounds ||= this.getBounds(sheet));
    if (!bounds) return;

    if (this.vertical) {
      const ratio = clamp((event.clientY - bounds.offset) / bounds.trackHeight, 0, 1);
      sheet.baseY = Math.floor(sheet.rowCount * ratio);
    } else {
      const ratio = clamp((event.clientX - bounds.offset) / bounds.trackWidth, 0, 1);
      sheet.baseX = Math.floor(sheet.df.width * ratio);
    }
    sheet.refreshSelection(false);
  }

  refresh(sheet) {
    if (!sheet) return;
    if (this.vertical) {
      const rowCount = sheet.rowCount;
      const showY = rowCount >= sheet.viewRows / 2;
      this.classList?.toggle('hidden', !showY);
      if (!showY) return;

      const totalY = Math.max(rowCount - 1, sheet.baseY, 1);
      this.setAttribute?.('data-size', totalY < 100 ? 'lg' : (totalY < 1000 ? 'md' : 'sm'));
      const boundsY = getScrollBoundsY(sheet);
      const topOffset = boundsY ? boundsY.topOffset : 0;
      const trackHeight = (boundsY ? boundsY.trackHeight : 0) - (this.offsetHeight || 0);
      this.style.top = `${topOffset + Math.round((trackHeight * sheet.baseY) / totalY)}px`;
    } else {
      const colCount = sheet.df.width;
      const showX = colCount >= sheet.viewCols - 2;
      this.classList?.toggle('hidden', !showX);
      if (!showX) return;

      const totalX = Math.max(colCount - 1, sheet.baseX, 1);
      this.setAttribute?.('data-size', totalX < 30 ? 'lg' : (totalX < 100 ? 'md' : 'sm'));
      const boundsX = getScrollBoundsX(sheet);
      const leftOffset = boundsX ? boundsX.leftOffset : 0;
      const trackWidth = (boundsX ? boundsX.barTrackWidth : 0) - (this.offsetWidth || 0);
      this.style.left = `${leftOffset + Math.round((trackWidth * sheet.baseX) / totalX)}px`;
    }
  }
}

export function refreshScrollbars(sheet = getSheet(), contentEl = globalThis.document?.getElementById?.('content')) {
  contentEl?.scrollerY?.refresh?.(sheet);
  contentEl?.scrollerX?.refresh?.(sheet);
}

defineEl('ui-scroller', Scroller);
