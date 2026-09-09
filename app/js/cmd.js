/**
 * Command Registry and Global Action Handlers for NanoCell CSV.
 * Defines standard keyboard shortcuts and actions for file operations, editing, formatting, and UI options.
 * @module cmd
 */
import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { Setting, stg } from './Setting.js';
import { round, resolveIconUrl } from './utils/misc.js';
import { About } from './About.js';
import './utils/DateExt.js';

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
  about: { label: "About", k: "H", ctrl: true, run() { About.show() }, description: "About" },
  new: { label: "New Sheet", k: "N", ctrl: true, run() { getCsvHandle()?.new() }, description: "New sheet" },
  deleteRow: { label: "Delete Row", k: "BACKSPACE", ctrl: true, run() { getSheet()?.deleteRows() }, description: "Delete Row" },
  deleteCol: { label: "Delete Col", k: "BACKSPACE", ctrl: true, shift: true, run() { getSheet()?.deleteCols() }, description: "Delete Col" },
  delete: { label: "Delete Selection", k: "BACKSPACE", run() { const s = getSheet(); if (s) { s.rangeEdit(''); s.refresh(); } }, description: "Delete Selection" },
  delete2: { label: "Delete Selection", k: "DELETE", run() { const s = getSheet(); if (s) { s.rangeEdit(''); s.refresh(); } }, description: "Delete Selection" },
  settings: { label: "Settings", k: "G", ctrl: true, run() { Setting.show() }, description: "Display Settings" },
  shortcuts: { label: "Command Palette", k: "K", ctrl: true, run() { cmd.commandPalette.run(); }, description: "Command Palette" },
  slctAll: { label: "Select All", k: "A", ctrl: true, run() { getSheet()?.slctAll() }, description: "Select All" },
  transpose: { label: "Transpose Selection", k: "T", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.rangeTranspose(); s.refresh(); } }, description: "Transpose Selection" },
  trim: { label: "Trim Empty Rows/Cols", k: "T", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.df.trimAll(); s.refresh(); } }, description: "Trim : remove all empty rows/cols" },
  integer: { label: "Round to Integer", k: "I", ctrl: true, run() { const s = getSheet(); if (s) { s.round(true); s.refresh(); } }, description: "Round selection to integer" },
  decimal: { label: "Round to Decimal", k: "$", ctrl: true, run() { const s = getSheet(); if (s) { s.round(false); s.refresh(); } }, description: "Round selection to decimal" },
  fixTop: { label: "Freeze Header Row", k: "B", ctrl: true, run() { const s = getSheet(); if (s) { s.fixTop = !s.fixTop; s.refresh(); } }, description: "Fix Header Top" },
  undo: { label: "Undo", k: "Z", ctrl: true, run() { const s = getSheet(); if (s) { s.df.undo(); s.refresh(); } }, description: "Undo" },
  redo: { label: "Redo", k: "Z", ctrl: true, shift: true, run() { const s = getSheet(); if (s) { s.df.redo(); s.refresh(); } }, description: "Redo" },
  redo2: { label: "Redo", k: "Y", ctrl: true, run() { const s = getSheet(); if (s) { s.df.redo(); s.refresh(); } }, description: "Redo" },
  date: {
    label: "Insert Today's Date",
    k: ";",
    ctrl: true,
    run() {
      const s = getSheet();
      if (s) {
        const todayStr = (new Date()).getFormated ? (new Date()).getFormated("yyyy-mm-dd") : new Date().toISOString().slice(0, 10);
        if (s.inputing && s.inputField) {
          const input = s.inputField;
          const start = input.selectionStart || 0;
          const end = input.selectionEnd || 0;
          input.value = input.value.substring(0, start) + todayStr + input.value.substring(end);
          input.selectionStart = input.selectionEnd = start + todayStr.length;
        } else {
          s.rangeEdit(todayStr);
          s.refresh();
        }
      }
    },
    description: "Insert today's date"
  },
  find: { label: "Find & Match", k: "F", ctrl: true, run() { const s = getSheet(); if (s) { s.finder.findMenu(s.getSlctFirstValue(), false); s.scrollbarRefresh(); } }, description: "Quick find / match" },
  findAdvanced: { label: "Advanced Find / Replace", k: "F", ctrl: true, shift: true, run() { const s = getSheet(); if (s) s.finder.findMenu(s.getSlctFirstValue(), true); }, description: "Advanced find / replace (work in progress)" },
  menubar: { label: "Toggle Menu Bar", k: "M", ctrl: true, run() { stg.actionBar = (stg.actionBar !== false) ? false : true; }, description: "Toggle action bar display" },
  open: { label: "Open File", k: "O", ctrl: true, run() { getCsvHandle()?.open() }, description: "Open a CSV file from the file finder" },
  save: { label: "Save", k: "S", ctrl: true, run() { getCsvHandle()?.save() }, description: "Save" },
  saveAs: { label: "Save As", k: "S", ctrl: true, shift: true, run() { getCsvHandle()?.saveAs() }, description: "Save As" },
  reloadFile: { label: "Reload File", k: "R", ctrl: true, run() { getCsvHandle()?.reloadFile() }, description: "Reload file from last save" },
  expand: { label: "Expand Row", k: "E", ctrl: true, run() { getSheet()?.expand() }, description: "Expand first row to selection" },
  commandPalette: { label: "Command Palette", k: "P", ctrl: true, run() { let palette = document.querySelector('ui-command-palette'); if (!palette && typeof document !== 'undefined') { palette = document.createElement('ui-command-palette'); document.body.appendChild(palette); } if (palette && typeof palette.toggle === 'function') palette.toggle(); }, description: "Command Palette" },
  validate_data: { label: "Validate Data (CSV)", k: "P", ctrl: true, shift: true, run() { getSheet()?.validate_data() }, description: "Validate and format data to respect csv standards" },
  validate_headers: { label: "Validate Headers (SQL)", k: "H", ctrl: true, shift: true, run() { getSheet()?.validate_headers() }, description: "Validate and format header to respect SQL standards" },
  next_occurance: { label: "Next Occurrence", k: "D", ctrl: true, run() { getSheet()?.go_to_next() }, description: "Go to next occurence of cell value" },
  sort: { label: "Sort Ascending", k: "L", ctrl: true, run() { const s = getSheet(); if (s) s.sort(s.x, true); }, description: "Sort rows based on active column (ascending order)" },
  sort_reverse: { label: "Sort Descending", k: "L", ctrl: true, shift: true, run() { const s = getSheet(); if (s) s.sort(s.x, false); }, description: "Sort rows based on active column (descending order)" },

  shiftUp: { label: "Shift Row Up", k: "ARROWUP", alt: true, run(dir) { getSheet()?.shift(0) }, description: "Shift row up" },
  shiftDown: { label: "Shift Row Down", k: "ARROWDOWN", alt: true, run(dir) { getSheet()?.shift(2) }, description: "Shift row down" },
  shiftRight: { label: "Shift Col Right", k: "ARROWRIGHT", alt: true, run(dir) { getSheet()?.shift(1) }, description: "Shift col right" },
  shiftLeft: { label: "Shift Col Left", k: "ARROWLEFT", alt: true, run(dir) { getSheet()?.shift(3) }, description: "Shift col left" },

  insertUp: { label: "Insert Row Above", k: "ARROWUP", alt: true, shift: true, run(dir) { getSheet()?.insert(0) }, description: "Insert row above" },
  insertDown: { label: "Insert Row Below", k: "ARROWDOWN", alt: true, shift: true, run(dir) { getSheet()?.insert(2) }, description: "Insert row below" },
  insertRight: { label: "Insert Col Right", k: "ARROWRIGHT", alt: true, shift: true, run(dir) { getSheet()?.insert(1) }, description: "Insert col right" },
  insertLeft: { label: "Insert Col Left", k: "ARROWLEFT", alt: true, shift: true, run(dir) { getSheet()?.insert(3) }, description: "Insert col left" },

  scrollLeft: { label: "Scroll Left", k: "scroll ARROWUP ", alt: true, description: "Scroll left" },
  scrollRight: { label: "Scroll Right", k: "scroll ARROWDOWN ", alt: true, description: "Scroll right" },
};

StateManager.setState('cmd', cmd);

/**
 * Formats a user-facing label combining description/label and keyboard shortcut.
 * e.g., "Freeze Header Row (Ctrl+B)" or "Freeze Header Row (⌘B)"
 * @param {CommandDefinition} c - Command definition object.
 * @param {string} [fallbackKey] - Fallback identifier if command is missing.
 * @returns {string} Formatted tooltip string.
 */
function getCommandTooltip(c, fallbackKey = '') {
  if (!c) return fallbackKey;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const mod = isMac ? '⌘' : 'Ctrl+';
  const shift = isMac ? '⇧' : 'Shift+';
  const alt = isMac ? '⌥' : 'Alt+';

  let shortcut = '';
  if (c.k) {
    shortcut = `${c.ctrl ? mod : ''}${c.alt ? alt : ''}${c.shift ? shift : ''}${c.k}`;
  }

  const name = c.label || c.description || fallbackKey;
  return shortcut ? `${name} (${shortcut})` : name;
}

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
    "undo", "redo", "fixTop", "sort", "sort_reverse", "transpose", "trim", "date", "integer", "decimal", "validate_headers", "validate_data",
    "", "find", "about", "settings", "shortcuts"];
  function buildMenuItem(item) {
    if (item === "") return dom.header.appendChild(document.createElement("hr"));
    const c = cmd[item];
    const tooltip = getCommandTooltip(c, item);
    const icon = document.createElement("span");
    icon.className = "icon";
    const iconUrl = resolveIconUrl(`icn/menu/${item}.svg`);
    icon.style.setProperty("--icon-url", `url("${iconUrl}")`);
    icon.setAttribute("title", tooltip);
    icon.setAttribute("aria-label", tooltip);
    icon.setAttribute("role", "button");
    icon.addEventListener("click", function () { cmd[item].run() });
    dom.header.appendChild(icon);
  }
  for (const m of menuItems) buildMenuItem(m);
}

export { cmd, buildCommands, buildMenu, getCommandTooltip };

