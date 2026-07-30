/**
 * Command Registry and Global Action Handlers for NanoCell CSV.
 * Defines standard keyboard shortcuts and actions for file operations, editing, formatting, and UI options.
 * @module cmd
 */
import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { Setting, stg } from './Setting.js';
import { round } from './utils/misc.js';
import { About } from './About.js';

/**
 * Helper to get the active Sheet instance from StateManager.
 * @returns {import('./Sheet.js').Sheet|undefined} The active Sheet instance.
 */
const getSheet = () => StateManager.getState('sheet');

/**
 * Helper to get the active CsvHandle instance from StateManager.
 * @returns {import('./CsvHandle.js').CsvHandle|undefined} The active CsvHandle instance.
 */
const getCsvHandle = () => StateManager.getState('csvHandle');

/**
 * Command descriptor object definition.
 * @typedef {Object} CommandDefinition
 * @property {string} k - Key identifier.
 * @property {boolean} [ctrl] - Indicates if Ctrl/Cmd modifier is required.
 * @property {boolean} [shift] - Indicates if Shift modifier is required.
 * @property {boolean} [alt] - Indicates if Alt modifier is required.
 * @property {Function} [run] - Execution callback handler.
 * @property {string} description - Human-readable command description.
 */

/**
 * Dictionary of registered application commands.
 * @type {Record<string, CommandDefinition>}
 */
const cmd = {
  about: { k: "H", ctrl: true, run() { About.show() }, description: "About" },
  new: { k: "N", ctrl: true, run() { getCsvHandle()?.new() }, description: "New sheet" },
  deleteRow: { k: "BACKSPACE", ctrl: true, run() { getSheet()?.deleteRows() }, description: "Delete Row" },
  deleteCol: { k: "BACKSPACE", ctrl: true, shift: true, run() { getSheet()?.deleteCols() }, description: "Delete Col" },
  delete: { k: "BACKSPACE", run() { const s = getSheet(); if (s) { s.rangeEdit(''); s.refresh(); } }, description: "Delete Selection" },
  delete2: { k: "DELETE", run() { const s = getSheet(); if (s) { s.rangeEdit(''); s.refresh(); } }, description: "Delete Selection" },
  settings: { k: "G", ctrl: true, run() { Setting.show() }, description: "Display Settings" },
  shortcuts: { k: "K", ctrl: true, run() { cmd.commandPalette.run(); }, description: "Command Palette" },
  slctAll: { k: "A", ctrl: true, run() { getSheet()?.slctAll() }, description: "Select All" },
  transpose: { k: "T", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.rangeTranspose(); s.refresh(); } }, description: "Transpose Selection" },
  trim: { k: "T", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.df.trimAll(); s.refresh(); } }, description: "Trim : remove all empty rows/cols" },
  integer: { k: "I", ctrl: true, run() { const s = getSheet(); if (s) { s.round(true); s.refresh(); } }, description: "Round selection to integer" },
  decimal: { k: "$", ctrl: true, run() { const s = getSheet(); if (s) { s.round(false); s.refresh(); } }, description: "Round selection to decimal" },
  fixTop: { k: "B", ctrl: true, run() { const s = getSheet(); if (s) { s.fixTop = !s.fixTop; s.refresh(); } }, description: "Fix Header Top" },
  fixLeft: { k: "B", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.fixLeft = !s.fixLeft; s.refresh(); } }, description: "Fix Header Left" },
  fit_width: { k: "W", ctrl: true, run() { const s = getSheet(); if (s) { s.fitWidth(); s.refresh(); } }, description: "Fit Column Width" },
  undo: { k: "Z", ctrl: true, run() { const s = getSheet(); if (s) { s.df.undo(); s.refresh(); } }, description: "Undo" },
  redo: { k: "Z", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.df.redo(); s.refresh(); } }, description: "Redo" },
  redo2: { k: "Y", ctrl: true, run() { const s = getSheet(); if (s) { s.df.redo(); s.refresh(); } }, description: "Redo" },
  date: { k: "T", ctrl: true, run() { const s = getSheet(); if (s) { s.rangeEdit((new Date()).getFormated("yyyy-mm-dd")); s.refresh(); } }, description: "Insert today's date" },
  find: { k: "F", ctrl: true, run() { const s = getSheet(); if (s) { s.finder.findMenu(s.getSlctFirstValue(), false); s.scrollbarRefresh(); } }, description: "Quick find / match" },
  findAdvanced: { k: "F", ctrl: true, shift: true, run() { const s = getSheet(); if (s) s.finder.findMenu(s.getSlctFirstValue(), true); }, description: "Advanced find / replace (work in progress)" },
  menubar: { k: "M", ctrl: true, run() { stg.actionBar = !stg.actionBar }, description: "Toggle action bar display" },
  open: { k: "O", ctrl: true, run() { getCsvHandle()?.open() }, description: "Open a CSV file from the file finder" },
  save: { k: "S", ctrl: true, run() { getCsvHandle()?.save() }, description: "Save" },
  saveAs: { k: "S", ctrl: true, shift: true, run() { getCsvHandle()?.saveAs() }, description: "Save As" },
  reloadFile: { k: "R", ctrl: true, run() { getCsvHandle()?.reloadFile() }, description: "Reload file from last save" },
  expand: { k: "E", ctrl: true, run() { getSheet()?.expand() }, description: "Expand first row to selection" },
  commandPalette: { k: "P", ctrl: true, run() { let palette = document.querySelector('ui-command-palette'); if (!palette && typeof document !== 'undefined') { palette = document.createElement('ui-command-palette'); document.body.appendChild(palette); } if (palette && typeof palette.toggle === 'function') palette.toggle(); }, description: "Command Palette" },
  validate_data: { k: "P", ctrl: true, shift: true, run() { getSheet()?.validate_data() }, description: "Validate and format data to respect csv standards" },
  validate_headers: { k: "H", ctrl: true, shift: true, run() { getSheet()?.validate_headers() }, description: "Validate and format header to respect SQL standards" },
  next_occurance: { k: "D", ctrl: true, run() { getSheet()?.go_to_next() }, description: "Go to next occurence of cell value" },
  sort: { k: "L", ctrl: true, run() { const s = getSheet(); if (s) s.sort(s.x, true); }, description: "Sort rows based on active column (ascending order)" },
  sort_reverse: { k: "L", ctrl: true, shift: true, run() { const s = getSheet(); if (s) s.sort(s.x, false); }, description: "Sort rows based on active column (descending order)" },

  shiftUp: { k: "ARROWUP", alt: true, run(dir) { getSheet()?.shift(0) }, description: "Shift row up" },
  shiftDown: { k: "ARROWDOWN", alt: true, run(dir) { getSheet()?.shift(2) }, description: "Shift row down" },
  shiftRight: { k: "ARROWRIGHT", alt: true, run(dir) { getSheet()?.shift(1) }, description: "Shift col right" },
  shiftLeft: { k: "ARROWLEFT", alt: true, run(dir) { getSheet()?.shift(3) }, description: "Shift col left" },

  insertUp: { k: "ARROWUP", alt: true, shift: true, run(dir) { getSheet()?.insert(0) }, description: "Insert row above" },
  insertDown: { k: "ARROWDOWN", alt: true, shift: true, run(dir) { getSheet()?.insert(2) }, description: "Insert row below" },
  insertRight: { k: "ARROWRIGHT", alt: true, shift: true, run(dir) { getSheet()?.insert(1) }, description: "Insert col right" },
  insertLeft: { k: "ARROWLEFT", alt: true, shift: true, run(dir) { getSheet()?.insert(3) }, description: "Insert col left" },

  scrollLeft: { k: "scroll ARROWUP ", alt: true, description: "Scroll left" },
  scrollRight: { k: "scroll ARROWDOWN ", alt: true, description: "Scroll right" },
};

StateManager.setState('cmd', cmd);

/**
 * Normalizes modifier flags (ctrl, shift, alt) for all registered commands in `cmd`
 * and updates StateManager.
 */
function buildCommands() {
  StateManager.setState('cmd', cmd);
  for (const c of Object.values(cmd)) {
    if (!c.ctrl) c.ctrl = false;
    if (!c.shift) c.shift = false;
    if (!c.alt) c.alt = false;
  }
}

/**
 * Populates the application header with action buttons and icons corresponding to commands.
 */
function buildMenu() {
  const menuItems = [
    "new", "open", "save", "reloadFile", "",
    "undo", "redo", "fixLeft", "fixTop", "fit_width", "sort", "sort_reverse", "transpose", "trim", "date", "integer", "decimal", "validate_headers", "validate_data",
    "", "find", "about", "settings", "shortcuts"];
  function buildMenuItem(item) {
    if (item === "") return dom.header.appendChild(document.createElement("hr"));
    const img = document.createElement("img");
    img.src = "icn/menu/" + item + ".svg";
    img.setAttribute("title", item);
    img.addEventListener("click", function () { cmd[item].run() });
    dom.header.appendChild(img);
  }
  for (const m of menuItems) buildMenuItem(m);
}

export { cmd, buildCommands, buildMenu };

