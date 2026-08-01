import { Dataframe } from './Dataframe.js';
import { dom } from './dom.js';
import { Finder } from './Finder.js';
import { StateManager } from './StateManager.js';
import { stg } from './Setting.js';
import { SheetView } from './sheet/SheetView.js';
import { SheetController } from './sheet/SheetController.js';
import './utils/DateExt.js';

class Sheet extends HTMLElement {
  constructor(df = new Dataframe()) {
    super();
    this.df = df;
    StateManager.setState('sheet', this);
    StateManager.setState('activeSheet', this);
    StateManager.setState('dataframe', this.df);
    StateManager.setState('activeDataframe', this.df);

    this.finder = new Finder(this);
    this.inputField = document.createElement("input");
    this.inputing = false;
    this.nViewCols = stg.cols;
    this.nViewRows = stg.rows;
    this.escape = false;
    this.fixTop = false;
    this.slctRange = false;
    this.rangeEnd = undefined;
    this.expandedCol = null;
    this.xx = 0;
    this.yy = 0;
    this.bx = 0;
    this.by = 0;

    this.id = 'sheet';
    this.classList.add('sheet');

    this.view = new SheetView(this);
    this.controller = new SheetController(this, this.view);

    const container = dom?.mainContainer || document.getElementById("main-container");
    if (container) {
      container.querySelectorAll('ui-sheet, #sheet').forEach(el => {
        if (el !== this) el.remove();
      });
      if (this.parentNode !== container) {
        container.appendChild(this);
      }
      if (dom?.content?.scrollerY) container.appendChild(dom.content.scrollerY);
      if (dom?.content?.scrollerX) container.appendChild(dom.content.scrollerX);
    } else if (dom?.content) {
      dom.content.innerHTML = "";
      dom.content.appendChild(this);
      if (dom.content.scrollerY) dom.content.appendChild(dom.content.scrollerY);
      if (dom.content.scrollerX) dom.content.appendChild(dom.content.scrollerX);
    }

    this.reload();
  }

  get table() { return this.view.table; }
  get rows() { return this.view.rows; }

  get x() { return this.xx; }
  get y() { return this.yy; }
  get width() { return this.rows[0] ? this.rows[0].cells.length - 1 : 0; }
  get height() { return this.rows.length - 1; }
  get baseX() { return this.bx; }
  get baseY() { return this.by; }

  set baseX(n) { this.controller.setBaseX(n); }
  set baseY(n) { this.controller.setBaseY(n); }
  set x(n) { this.controller.setX(n); }
  set y(n) { this.controller.setY(n); }

  focus_cell(x, y) { return this.controller.focus_cell(x, y); }
  getSlctFirstValue() { return this.controller.getSlctFirstValue(); }
  deleteRows() { return this.controller.deleteRows(); }
  deleteCols() { return this.controller.deleteCols(); }
  sort(n, ascending) { return this.controller.sort(n, ascending); }
  validate_headers() { return this.controller.validate_headers(); }
  go_to_next() { return this.controller.go_to_next(); }
  validate_data() { return this.controller.validate_data(); }
  rangeOrdered() { return this.controller.rangeOrdered(); }
  expand() { return this.controller.expand(); }
  slctAll() { return this.controller.slctAll(); }
  shift(direction) { return this.controller.shift(direction); }
  insert(direction) { return this.controller.insert(direction); }
  input(txt) { return this.controller.input(txt); }
  bestInputCell() { return this.controller.bestInputCell(); }
  cellInView(x, y) { return this.controller.cellInView(x, y); }
  inputBlur() { return this.controller.inputBlur(); }

  footerUpdate() { return this.view.footerUpdate(); }
  scrollbarRefresh() { return this.view.scrollbarRefresh(); }

  slctCol(n, m) { return this.controller.slctCol(n, m); }
  slctRow(n, m) { return this.controller.slctRow(n, m); }
  rangeArray() { return this.controller.rangeArray(); }
  rangeEdit(value) { return this.controller.rangeEdit(value); }
  allApply(cb) { return this.controller.allApply(cb); }
  rangeApply(cb) { return this.controller.rangeApply(cb); }
  rangeTranspose() { return this.controller.rangeTranspose(); }
  round(integer) { return this.controller.round(integer); }
  paste(mat) { return this.controller.paste(mat); }
  scroll(e) { return this.controller.scroll(e); }
  loadCell(c, x, y) { return this.view.loadCell(c, x, y); }
  loadTopHeader(x) { return this.view.loadTopHeader(x); }
  loadLeftHeader(y) { return this.view.loadLeftHeader(y); }
  viewRangeRender() { return this.view.viewRangeRender(); }
  isInViewRange(x, y) { return this.controller.isInViewRange(x, y); }
  slctFocus() { return this.controller.slctFocus(); }
  slctClear() { return this.controller.slctClear(); }
  slctRefresh(focus) { return this.controller.slctRefresh(focus); }
  refresh() { return this.view.refresh(); }
  reload() { return this.view.reload(); }
}

if (!customElements.get('ui-sheet')) {
  customElements.define('ui-sheet', Sheet);
}

export { Sheet };
