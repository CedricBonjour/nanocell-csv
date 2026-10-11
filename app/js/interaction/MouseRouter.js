import { cmd } from './CommandRegistry.js';
import { dom } from '../ui/AppLayout.js';
import { getSheet } from '../appContext.js';

let LBT = undefined;
let RBT = undefined;
let mouseX = 0;
let mouseY = 0;
let scrollIntervalId = null;
let cachedScrollY = null;
let cachedScrollX = null;

const TargetType = Object.freeze({
  na: undefined,
  cell: 0,
  rowH: 1,
  colH: 2,
  allH: 3,
  scrollBarX: 4,
  scrollBarY: 5,
});

document.addEventListener('contextmenu', (event) => {
  if (!event.ctrlKey) {
    event.preventDefault();
    dom.cmenu.pop(event);
  }
});

document.addEventListener("mouseup", e => {
  if (e.buttons < 1) {
    LBT = undefined;
    RBT = undefined;
    cachedScrollY = null;
    cachedScrollX = null;
    if (scrollIntervalId !== null) {
      clearInterval(scrollIntervalId);
      scrollIntervalId = null;
    }
  }
});

let getTargetType = function (e) {
  const cell = e.target.closest ? (e.target.closest("td") || e.target.closest("th")) : null;
  const sheet = getSheet();
  if (cell && sheet && (cell.parentNode.parentNode === sheet || cell.parentNode.parentNode === sheet.table || sheet.contains(cell))) {
    if (cell.tx < 0 && cell.ty < 0) return TargetType.allH;
    if (cell.tx < 0) return TargetType.rowH;
    if (cell.ty < 0) return TargetType.colH;
    return TargetType.cell;
  }
  let t = e.target;
  if (t === dom.content?.scrollerY) return TargetType.scrollBarY;
  if (t === dom.content?.scrollerX) return TargetType.scrollBarX;
  return TargetType.na;
};

function getScrollBoundsY(sheet) {
  if (!sheet.rows[1]) return null;
  const offset = sheet.rows[1].getBoundingClientRect().top;
  const theight = sheet.getBoundingClientRect().bottom - offset;
  return { offset, theight: theight > 0 ? theight : 1 };
}

function getScrollBoundsX(sheet) {
  if (!sheet.rows[0]?.cells[0]) return null;
  const offset = sheet.rows[0].cells[0].getBoundingClientRect().left;
  const tWidth = sheet.getBoundingClientRect().right - offset;
  return { offset, tWidth: tWidth > 0 ? tWidth : 1 };
}

document.addEventListener("mousedown", e => {
  if (e.button === 0) LBT = getTargetType(e);
  if (e.button === 2) RBT = getTargetType(e);
  const isSelectable = Boolean(e.target.closest && e.target.closest('ui-about'));
  if (e.target.tagName != "INPUT" && e.target.tagName != "BUTTON" && !isSelectable) e.preventDefault(); // prevents text selection
  const sheet = getSheet();
  if (sheet) {
    if (LBT === TargetType.scrollBarY) cachedScrollY = getScrollBoundsY(sheet);
    if (LBT === TargetType.scrollBarX) cachedScrollX = getScrollBoundsX(sheet);
    const cell = e.target.closest ? (e.target.closest("td") || e.target.closest("th")) : null;
    if (cell) {
      if (LBT == TargetType.cell) {
        if (e.shiftKey) {
          sheet.slctRange = true;
        } else {
          sheet.slctRange = false;
          sheet.rangeEnd = undefined;
        }
        sheet.x = cell.tx + sheet.baseX;
        sheet.y = cell.ty + sheet.baseY;
        if (e.ctrlKey && cell.firstElementChild && cell.firstElementChild.classList.contains("url")) window.open(cell.innerText, "_blank");
        sheet.slctRefresh();
        check_for_outofbound_scroll();
      }
      if (LBT == TargetType.allH) cmd.slctAll?.run();
      if (LBT == TargetType.colH) {
        if (e.shiftKey && sheet.x !== undefined) {
          sheet.slctCol(sheet.x, cell.tx + sheet.baseX);
        } else {
          sheet.slctCol(cell.tx + sheet.baseX);
        }
        check_for_outofbound_scroll();
      }
      if (LBT == TargetType.rowH) {
        if (e.shiftKey && sheet.y !== undefined) {
          sheet.slctRow(sheet.y, cell.ty + sheet.baseY);
        } else {
          sheet.slctRow(cell.ty + sheet.baseY);
        }
        check_for_outofbound_scroll();
      }
    }
  }
  if (e.target.tagName != "INPUT" && document.activeElement.tagName == "INPUT") document.activeElement.blur();
});

document.addEventListener("mousemove", e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (e.buttons < 1) {
    LBT = undefined;
    RBT = undefined;
    cachedScrollY = null;
    cachedScrollX = null;
  }
  const sheet = getSheet();
  if (sheet) {
    if (LBT === TargetType.scrollBarY) {
      if (!cachedScrollY) cachedScrollY = getScrollBoundsY(sheet);
      if (cachedScrollY) {
        let r = (e.clientY - cachedScrollY.offset) / cachedScrollY.theight;
        if (r < 0) r = 0;
        if (r > 1) r = 1;
        sheet.baseY = Math.floor(sheet.rowCount * r);
        sheet.slctRefresh(false);
      }
    }
    if (LBT === TargetType.scrollBarX) {
      if (!cachedScrollX) cachedScrollX = getScrollBoundsX(sheet);
      if (cachedScrollX) {
        let r = (e.clientX - cachedScrollX.offset) / cachedScrollX.tWidth;
        if (r < 0) r = 0;
        if (r > 1) r = 1;
        sheet.baseX = Math.floor(sheet.df.width * r);
        sheet.slctRefresh(false);
      }
    }
  }
});

function check_for_outofbound_scroll() {
  if (scrollIntervalId !== null) clearInterval(scrollIntervalId);
  scrollIntervalId = setInterval(() => {
    if (LBT === undefined) {
      clearInterval(scrollIntervalId);
      scrollIntervalId = null;
      return;
    } else {
      const sheet = getSheet();
      if (!sheet) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
        return;
      }
      let change = false;
      let rect = sheet.getBoundingClientRect();
      if (mouseY <= rect.top) {
        if (sheet.rangeEnd) sheet.rangeEnd.y = sheet.baseY;
        sheet.baseY--;
        change = true;
      }
      if (mouseX >= rect.right - 5) {
        if (sheet.rangeEnd) sheet.rangeEnd.x = sheet.baseX + sheet.width - 1;
        sheet.baseX++;
        change = true;
      }
      if (mouseY >= rect.bottom) {
        if (sheet.rangeEnd) sheet.rangeEnd.y = sheet.baseY + sheet.height - 1;
        sheet.baseY++;
        change = true;
      }
      if (mouseX <= rect.left + 5) {
        if (sheet.rangeEnd) sheet.rangeEnd.x = sheet.baseX;
        sheet.baseX--;
        change = true;
      }
      if (change) sheet.slctRefresh(false);
    }
  }, 100);
}

export { LBT, RBT, mouseX, mouseY, TargetType, getTargetType, check_for_outofbound_scroll };
