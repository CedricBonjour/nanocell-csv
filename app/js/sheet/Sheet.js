import { Dataframe } from '../../../core/model/Dataframe.js';
import { dom } from '../ui/AppLayout.js';
import { FinderDialog } from '../ui/FinderDialog.js';
import { FilterDialog } from '../ui/FilterDialog.js';
import { setSheet } from '../appContext.js';
import { stg } from '../ui/settings/Setting.js';
import { SheetView } from './SheetView.js';
import { SheetController } from './SheetController.js';

class Sheet extends HTMLElement {
  constructor(df = new Dataframe()) {
    super();
    this.df = df;
    if (this.df && typeof stg !== 'undefined' && stg.autoRound !== undefined) {
      this.df.autoRound = Boolean(stg.autoRound);
    }
    setSheet(this);

    this.finder = new FinderDialog(this);
    this.filter = new FilterDialog(this);
    this.filterRows = null;
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
    this.selection = this.controller.selection;

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
  get rowCount() { return this.filterRows ? this.filterRows.length : this.df.height; }
  get baseX() { return this.bx; }
  get baseY() { return this.by; }

  set baseX(n) { this.selection.setBaseX(n); }
  set baseY(n) { this.selection.setBaseY(n); }
  set x(n) { this.selection.setX(n); }
  set y(n) { this.selection.setY(n); }

  getRowIndex(viewY) {
    if (!this.filterRows) return viewY;
    if (viewY < 0 || viewY >= this.filterRows.length) return -1;
    return this.filterRows[viewY];
  }

  setFilter(colIndex, text, matchCase = false) {
    if (!text || text.length === 0) {
      this.clearFilter();
      return;
    }
    const skipHeader = Boolean(this.fixTop);
    this.filterRows = this.df.filterColumn(colIndex, text, matchCase, skipHeader);
    this.baseY = 0;
    this.y = 0;
    this.view.refresh();
    this.slctRefresh(true);
  }

  clearFilter() {
    const hadFilter = this.filterRows !== null;
    this.filterRows = null;
    if (hadFilter) {
      this.view.refresh();
      this.slctRefresh(false);
    }
  }

  openFilter(colIndex = undefined) {
    if (this.filter) {
      this.filter.open(colIndex);
    }
  }

  // Selection & Navigation Direct Facade
  focus_cell(x, y) { return this.selection.focus_cell(x, y); }
  slctAll() { return this.selection.slctAll(); }
  slctCol(n, m) { return this.selection.slctCol(n, m); }
  slctRow(n, m) { return this.selection.slctRow(n, m); }
  rangeArray() { return this.selection.rangeArray(); }
  slctRefresh(focus) { return this.selection.slctRefresh(focus); }

  // Action & Mutation Facade
  deleteRows() { return this.controller.deleteRows(); }
  deleteCols() { return this.controller.deleteCols(); }
  deleteSelection() { return this.controller.deleteSelection(); }
  trim() { return this.controller.trim(); }
  sortAscending() { return this.controller.sortAscending(); }
  sortDescending() { return this.controller.sortDescending(); }
  undo() { return this.controller.undo(); }
  redo() { return this.controller.redo(); }
  toggleFixTop() { return this.controller.toggleFixTop(); }

  find(advanced = false) {
    this.finder.findMenu(this.selection.getSlctFirstValue(), advanced);
    if (!advanced) this.view.scrollbarRefresh();
  }
  go_to_next() { return this.controller.go_to_next(); }
  go_to_prev() { return this.controller.go_to_prev(); }
  expand() { return this.controller.expand(); }
  shift(direction) { return this.controller.shift(direction); }
  insert(direction) { return this.controller.insert(direction); }
  input(txt) { return this.controller.input(txt); }
  insertDate() { return this.controller.insertDate(); }
  rangeEdit(value) { return this.controller.rangeEdit(value); }
  rangeTranspose() { return this.controller.rangeTranspose(); }
  round(integer) { return this.controller.round(integer); }
  paste(mat) { return this.controller.paste(mat); }

  // Validation Workflows
  open_validation_pane() { return this.controller.open_validation_pane(); }
  validate_rule(ruleId) { return this.controller.validate_rule(ruleId); }

  // View & Render Delegations
  scrollbarRefresh() { return this.view.scrollbarRefresh(); }
  startCoordEdit() { return this.view.startCoordEdit(); }
  refresh() { return this.view.refresh(); }
  reload() { return this.view.reload(); }
}

if (!customElements.get('ui-sheet')) {
  customElements.define('ui-sheet', Sheet);
}

export { Sheet };
