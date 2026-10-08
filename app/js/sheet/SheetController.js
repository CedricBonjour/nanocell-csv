/**
 * Controller Component for `<ui-sheet>` Web Component.
 * Coordinates user interaction events, selection helpers, mutation handlers, and validation workflows.
 * @module SheetController
 */
import { StateManager } from '../StateManager.js';
import { stg } from '../ui/settings/Setting.js';
import { Notification as Msg } from '../ui/Notification.js';
import { LBT, TargetType } from '../interaction/MouseRouter.js';
import { HeaderValidator } from '../../../core/validation/HeaderValidator.js';
import { DataValidator } from '../../../core/validation/DataValidator.js';
import { DateValidator } from '../../../core/validation/DateValidator.js';
import { formatDate } from '../../../core/utils/date.js';
import { SheetSelection } from './SheetSelection.js';
import { SheetMutations } from './SheetMutations.js';

/**
 * Manages input events, grid navigation, and delegates operations on the active Sheet.
 */
export class SheetController {
  /**
   * Instantiates a SheetController attached to a parent Sheet element and SheetView.
   * @param {import('./Sheet.js').Sheet} sheet - Target Sheet web component instance.
   * @param {import('./SheetView.js').SheetView} view - Sheet view rendering engine instance.
   */
  constructor(sheet, view) {
    this.sheet = sheet;
    this.view = view;
    this.selection = new SheetSelection(sheet, view);
    this.mutations = new SheetMutations(sheet, view, this.selection);

    this.bindEvents();
  }

  /**
   * Binds mouse, keyboard, and double-click event listeners to the sheet table and input field.
   */
  bindEvents() {
    this.sheet.addEventListener("mousewheel", (e) => this.scroll(e), { passive: false });
    this.sheet.inputField.addEventListener("focusout", () => { this.inputBlur(); });
    this.sheet.inputField.addEventListener("keydown", (e) => {
      const k = e.key.toUpperCase();
      if (k === "ENTER" && e.shiftKey) {
        this.sheet.inputField.value = this.sheet.inputField.value + '\u25BE';
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === ";" || k === "T")) {
        e.preventDefault();
        e.stopPropagation();
        const todayStr = formatDate(new Date(), 'yyyy-mm-dd');
        const input = this.sheet.inputField;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        input.value = input.value.substring(0, start) + todayStr + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + todayStr.length;
        return;
      }

      switch (k) {
        case "ENTER":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "TAB":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          if (e.shiftKey) this.sheet.x--;
          else this.sheet.x++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWUP":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y--;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ARROWDOWN":
          e.stopPropagation();
          e.preventDefault();
          this.sheet.inputField.blur();
          this.sheet.y++;
          this.slctRefresh();
          this.view.refresh();
          break;
        case "ESCAPE":
          this.sheet.escape = true;
          this.sheet.inputField.blur();
          break;
      }
    });

    this.sheet.addEventListener("mouseover", (e) => {
      const td = e.target.closest("td");
      if (!td) return;
      const tx = td.tx;
      const ty = td.ty;
      if (tx === undefined || ty === undefined) return;

      if (LBT === TargetType.cell) {
        this.sheet.rangeEnd = { x: tx + this.sheet.baseX, y: ty + this.sheet.baseY };
        this.slctRefresh(false);
      }
      if (LBT === TargetType.colH && tx >= 0) {
        this.slctCol(this.sheet.x, tx + this.sheet.baseX);
      }
      if (LBT === TargetType.rowH && ty >= 0) {
        this.slctRow(this.sheet.y, ty + this.sheet.baseY);
      }
    });

    this.sheet.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td");
      if (!td) return;
      const tx = td.tx;
      const ty = td.ty;
      if (tx === undefined || ty === undefined) return;

      if (tx >= 0 && ty >= 0) this.input();
      if (ty < 0 && tx >= 0) {
        const colIdx = this.sheet.baseX + tx;
        if (this.sheet.expandedCol === colIdx) {
          this.sheet.expandedCol = null;
        } else {
          this.sheet.expandedCol = colIdx;
        }
        this.sheet.refresh();
      }
    });
  }

  // --- Selection & Viewport Delegation ---
  setBaseX(n) { this.selection.setBaseX(n); }
  setBaseY(n) { this.selection.setBaseY(n); }
  setX(n) { this.selection.setX(n); }
  setY(n) { this.selection.setY(n); }
  focus_cell(x, y) { this.selection.focus_cell(x, y); }
  getSlctFirstValue() { return this.selection.getSlctFirstValue(); }
  rangeOrdered() { return this.selection.rangeOrdered(); }
  slctAll() { this.selection.slctAll(); }
  slctCol(n, m) { this.selection.slctCol(n, m); }
  slctRow(n, m) { this.selection.slctRow(n, m); }
  rangeArray() { return this.selection.rangeArray(); }
  cellInView(x, y) { return this.selection.cellInView(x, y); }
  isInViewRange(x, y) { return this.selection.isInViewRange(x, y); }
  bestInputCell() { return this.selection.bestInputCell(); }
  slctFocus() { this.selection.slctFocus(); }
  slctClear() { this.selection.slctClear(); }
  slctRefresh(focus) { this.selection.slctRefresh(focus); }
  scroll(e) { this.selection.scroll(e); }

  // --- Mutation & Editing Delegation ---
  input(txt) { this.mutations.input(txt); }
  inputBlur() { this.mutations.inputBlur(); }
  rangeEdit(value) { return this.mutations.rangeEdit(value); }
  allApply(cb) { this.mutations.allApply(cb); }
  rangeApply(cb) { this.mutations.rangeApply(cb); }
  deleteRows() { this.mutations.deleteRows(); }
  deleteCols() { this.mutations.deleteCols(); }
  shift(direction) { this.mutations.shift(direction); }
  insert(direction) { this.mutations.insert(direction); }
  expand() { this.mutations.expand(); }
  rangeTranspose() { this.mutations.rangeTranspose(); }
  round(integer) { this.mutations.round(integer); }
  paste(mat) { this.mutations.paste(mat); }
  sort(n, ascending) { this.mutations.sort(n, ascending); }
  go_to_next() { this.mutations.go_to_next(); }

  // --- Validation Workflow Coordination ---
  /**
   * Retrieves validation pane component and displays validation edit proposals.
   * @param {Array<Object>} items 
   */
  openValidationPaneWithItems(items = []) {
    let pane = StateManager.getState('validationPane');
    if (!pane && typeof document !== 'undefined') {
      pane = document.getElementById('validation-pane') || document.querySelector('ui-validation-pane');
    }
    if (pane) {
      if (typeof pane.bindSheet === 'function') pane.bindSheet(this.sheet);
      if (typeof pane.loadItems === 'function') pane.loadItems(items);
      if (typeof pane.show === 'function') pane.show();
    }
  }

  /**
   * Performs read-only scan over header row to propose standard SQL column naming fixes.
   * @returns {Array<Object>} List of proposed header edit objects.
   */
  validate_headers() {
    const rawItems = HeaderValidator.validate(this.sheet.df);
    const items = rawItems.map(item => ({
      ...item,
      category: 'DUPLICATE_FIX',
      categoryName: 'Duplicate Fixes'
    }));

    this.openValidationPaneWithItems(items);
    return items;
  }

  /**
   * Performs read-only scan over dataframe matrix to propose CSV compliance edits based on active settings.
   * @returns {Array<Object>} List of proposed edit objects.
   */
  validate_data() {
    const items = DataValidator.validate(this.sheet.df, {
      trimWhitespace: true,
      coerceCommaDecimals: Boolean(stg.dv_comma_num),
      replaceCommaWithHyphen: Boolean(stg.dv_comma_txt),
      replaceNewlineWithPipe: Boolean(stg.dv_lr),
      replaceDoubleQuotes: Boolean(stg.dv_quotes),
      toLowerCase: Boolean(stg.dv_lower)
    });

    this.openValidationPaneWithItems(items);
    return items;
  }

  /**
   * Validates and standardizes date cells in the sheet to 'YYYY-mm-dd'.
   * @returns {Array<Object>} List of executed change objects with metadata.
   */
  validate_date_format() {
    if (this.sheet.inputing) this.inputBlur();
    if (this.sheet?.df?.lock) {
      Msg.warning("Sheet is locked (view-only mode).", "Date Validation");
      const res = [];
      res.success = false;
      res.reason = 'locked';
      return res;
    }

    const { proposals, success, detectedFormat, reason } = DateValidator.validate(this.sheet.df);

    if (reason === 'no_dates') {
      Msg.info("No matching date cells found in the file.", "Date Validation");
      const res = [];
      res.success = false;
      res.reason = 'no_dates';
      return res;
    }

    if (reason === 'coexistence') {
      Msg.warning("Both 'dd-mm-YYYY' and 'mm-dd-YYYY' formats coexist in the file.", "Date Validation");
    } else if (reason === 'ambiguous') {
      Msg.warning("Cannot determine date format with certainty: no date has a digit over 12.", "Date Validation");
    }

    const changes = proposals.map(p => ({
      x: p.x,
      y: p.y,
      oldValue: p.oldValue,
      newValue: p.newValue
    }));

    if (changes.length > 0) {
      this.sheet.df.create({
        type: 'RANGE_EDIT',
        timestamp: Date.now(),
        payload: { changes }
      });
      this.sheet.refresh();
      StateManager.emit('dataframe:changed', { action: 'dateValidate', changes });
      if (!reason) {
        Msg.success(`Converted ${changes.length} date${changes.length === 1 ? '' : 's'} to YYYY-mm-dd${detectedFormat ? ` (${detectedFormat})` : ''}.`, "Date Validation");
      }
    } else if (!reason) {
      Msg.info("All matching dates are already in YYYY-mm-dd format.", "Date Validation");
    }

    const result = changes;
    result.success = success;
    if (reason) result.reason = reason;
    if (detectedFormat) result.detectedFormat = detectedFormat;
    result.count = changes.length;
    return result;
  }

  validate_dates() {
    return this.validate_date_format();
  }
}
