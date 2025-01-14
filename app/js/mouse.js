
let LBT = undefined;
let RBT = undefined;
let mouseX = 0;
let mouseY = 0;

let mouseXstart = 0;
let mouseYstart = 0;
let mouseTargetStart = 0;

const TargetType = Object.freeze({
  na: undefined,
  cell: 0,
  rowH: 1,
  colH: 2,
  allH: 3,
  scrollBarX: 4,
  scrollBarY: 5,
  headerHandle: 6,
});

document.addEventListener('dblclick', (e) => {
  if (getTargetType(e) == TargetType.allH) {
    sheet.colWidthList = [];
    sheet.refresh();
  }
});

document.addEventListener('contextmenu', (event) => {
  if (!event.ctrlKey) {
    event.preventDefault();
    dom.cmenu.pop(event);
  }
});

document.addEventListener("mouseup", e => {
  if (LBT == TargetType.headerHandle) {
    var th = mouseTargetStart.parentNode;
    var w = th.style.width;
    sheet.colWidthList.push({ idx: th.tx + sheet.baseX, width: w })
  }
  document.onmousemove = undefined;
  if (e.buttons < 1) {
    LBT = undefined;
    RBT = undefined;
  }
});

let getTargetType = function (e) {
  let t = e.target
  if (t.tagName == "TD" && t.parentNode.parentNode === sheet) {
    if (t.tx < 0 && t.ty < 0) return TargetType.allH;
    if (t.tx < 0) return TargetType.rowH;
    if (t.ty < 0) return TargetType.colH;
    return TargetType.cell
  }
  if (t === dom.content.scrollerY) return TargetType.scrollBarY;
  if (t === dom.content.scrollerX) return TargetType.scrollBarX;
  if (t.classList.contains("headerHandle")) return TargetType.headerHandle;
  return TargetType.na
}

document.addEventListener("mousedown", e => {
  mouseXstart = e.clientX;
  mouseYstart = e.clientY;
  mouseTargetStart = e.target;
  if (e.button === 0) LBT = getTargetType(e);
  if (e.button === 2) RBT = getTargetType(e);
  if (e.target.tagName != "INPUT" && e.target.tagName != "BUTTON") e.preventDefault(); // prevents text selection
  if (LBT == TargetType.cell) {
    sheet.x = e.target.tx + sheet.baseX;
    sheet.y = e.target.ty + sheet.baseY;
    if (e.ctrlKey && e.target.firstElementChild.classList.contains("url")) window.open(e.target.innerText, "_blank");
    sheet.slctRefresh();
    check_for_outofbound_scroll();
  }
  if (LBT == TargetType.allH) cmd.slctAll.run();
  if (LBT == TargetType.colH) sheet.slctCol(e.target.tx + sheet.baseX);
  if (LBT == TargetType.rowH) sheet.slctRow(e.target.ty + sheet.baseY);
  if (e.target.tagName != "INPUT" && document.activeElement.tagName == "INPUT") document.activeElement.blur();

});

document.addEventListener("mousemove", e => {
  {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (e.buttons < 1) {
      LBT = undefined;
      RBT = undefined;
    }
    if (LBT === TargetType.scrollBarY) {
      let offset = sheet.rows[1].getBoundingClientRect().top;
      let theight = sheet.getBoundingClientRect().bottom - offset;
      let r = (e.clientY - offset) / theight;
      if (r < 0) r = 0;
      if (r > 1) r = 1;
      sheet.baseY = Math.floor(sheet.df.height * r);
      sheet.slctRefresh(false);
    }
    if (LBT === TargetType.scrollBarX) {
      let offset = sheet.rows[0].cells[0].getBoundingClientRect().left;
      let tWidth = sheet.getBoundingClientRect().right - offset;
      let r = (e.clientX - offset) / tWidth;
      if (r < 0) r = 0;
      if (r > 1) r = 1;
      sheet.baseX = Math.floor(sheet.df.width * r);
      sheet.slctRefresh(false);
    }
    if (LBT == TargetType.headerHandle) {
      var th = mouseTargetStart.parentNode;
      var startX = th.getBoundingClientRect().left;
      var newWidth = 100 * (mouseX - startX) / th.parentNode.offsetWidth;
      if (newWidth < 0) newWidth = 0;
      th.style.width = `${newWidth}%`;
    }

  }
});

function check_for_outofbound_scroll() {
  let intervalId = setInterval(() => {
    if (LBT === undefined) return clearInterval(intervalId);
    else {
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
