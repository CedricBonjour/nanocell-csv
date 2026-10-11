/**
 * Command Registry and Global Action Handlers for NanoCell CSV.
 * Defines standard keyboard shortcuts and actions for file operations, editing, formatting, and UI options.
 * @module CommandRegistry
 */
import { getSheet, getCsvHandle } from '../appContext.js';
import { Setting } from '../ui/settings/Setting.js';
import { SettingDialog } from '../ui/settings/SettingDialog.js';
import { AboutDialog } from '../ui/AboutDialog.js';
import { CommandPalette } from '../ui/CommandPalette.js';

/**
 * Command descriptor object definition.
 * @typedef {Object} CommandDefinition
 * @property {string} [k] - Key identifier.
 * @property {boolean} ctrl - Indicates if Ctrl/Cmd modifier is required.
 * @property {boolean} shift - Indicates if Shift modifier is required.
 * @property {boolean} alt - Indicates if Alt modifier is required.
 * @property {Function} [run] - Execution callback handler.
 * @property {string} description - Human-readable command description.
 */

/**
 * Dictionary of registered application commands.
 * @type {Record<string, CommandDefinition>}
 */
const cmd = {
  about: { label: "About", k: "H", ctrl: true, shift: false, alt: false, run() { AboutDialog.show(); }, description: "About" },
  new: { label: "New Sheet", k: "N", ctrl: true, shift: false, alt: false, run() { getCsvHandle()?.new(); }, description: "New sheet" },
  deleteRow: { label: "Delete Row", k: "BACKSPACE", ctrl: true, shift: false, alt: false, run() { getSheet()?.deleteRows(); }, description: "Delete Row" },
  deleteCol: { label: "Delete Col", k: "BACKSPACE", ctrl: true, shift: true, alt: false, run() { getSheet()?.deleteCols(); }, description: "Delete Col" },
  delete: { label: "Delete Selection", k: "BACKSPACE", ctrl: false, shift: false, alt: false, run() { getSheet()?.deleteSelection(); }, description: "Delete Selection" },
  settings: { label: "Settings", k: "G", ctrl: true, shift: false, alt: false, run() { SettingDialog.show(); }, description: "Display Settings" },
  shortcuts: { label: "Command Palette", k: "K", ctrl: true, shift: false, alt: false, run() { cmd.commandPalette.run(); }, description: "Command Palette" },
  slctAll: { label: "Select All", k: "A", ctrl: true, shift: false, alt: false, run() { getSheet()?.slctAll(); }, description: "Select All" },
  transpose: { label: "Transpose", k: "T", ctrl: true, shift: true, alt: false, run() { getSheet()?.rangeTranspose(); }, description: "Transpose rows and columns (selection or whole sheet)" },
  trim: { label: "Trim Empty Rows/Cols", k: "T", ctrl: true, shift: false, alt: true, run() { getSheet()?.trim(); }, description: "Trim : remove all empty rows/cols" },
  integer: { label: "Round to Integer", k: "I", ctrl: true, shift: false, alt: false, run() { getSheet()?.round(true); }, description: "Round selection to integer" },
  decimal: { label: "Round to Decimal", k: "$", ctrl: true, shift: false, alt: false, run() { getSheet()?.round(false); }, description: "Round selection to decimal" },
  fixTop: { label: "Freeze Header Row", k: "B", ctrl: true, shift: false, alt: false, run() { getSheet()?.toggleFixTop(); }, description: "Freeze Header Row" },
  undo: { label: "Undo", k: "Z", ctrl: true, shift: false, alt: false, run() { getSheet()?.undo(); }, description: "Undo" },
  redo: { label: "Redo", k: "Z", ctrl: true, shift: true, alt: false, run() { getSheet()?.redo(); }, description: "Redo" },
  date: { label: "Insert Today's Date", k: ";", ctrl: true, shift: false, alt: false, run() { getSheet()?.insertDate(); }, description: "Insert today's date" },
  date_checker: { label: "Validate Date Format", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_dates(); }, description: "Validate and standardize date formats to YYYY-mm-dd" },
  validate_dates: { label: "Validate: Date Formats (YYYY-MM-DD)", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_dates(); }, description: "Standardize date formats across columns to YYYY-mm-dd" },
  validate_whitespace: { label: "Validate: Trim Whitespace", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('trim_whitespace'); }, description: "Remove leading and trailing whitespace from cell text" },
  validate_comma_num: { label: "Validate: Decimal Comma -> Dot", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('comma_decimals'); }, description: "Convert comma decimals (3,14) to dot notation in numeric fields" },
  validate_line_returns: { label: "Validate: Line Returns -> Pipe", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('line_returns'); }, description: "Replace embedded newline line breaks with pipe character (|)" },
  validate_quotes: { label: "Validate: Double Quotes -> Single", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('double_quotes'); }, description: "Replace double quotation marks (\") with single quotes (')" },
  validate_comma_text: { label: "Validate: Text Commas -> Dash", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('text_commas'); }, description: "Replace commas inside text cells with hyphens (-)" },
  validate_lower: { label: "Validate: Force Lowercase", ctrl: false, shift: false, alt: false, run() { getSheet()?.validate_rule('lowercase'); }, description: "Convert all text cells to lowercase" },
  filter: { label: "Filter Column", k: "Q", ctrl: true, shift: false, alt: false, run(col) { getSheet()?.openFilter(col); }, description: "Filter sheet rows by column value" },
  find: { label: "Find & Match", k: "F", ctrl: true, shift: false, alt: false, run() { getSheet()?.find(false); }, description: "Quick find / match" },
  findAdvanced: { label: "Advanced Find / Replace", k: "F", ctrl: true, shift: true, alt: false, run() { getSheet()?.find(true); }, description: "Advanced find / replace (work in progress)" },
  menubar: { label: "Toggle Menu Bar", k: "M", ctrl: true, shift: false, alt: false, run() { Setting.toggleActionBar(); }, description: "Toggle action bar display" },
  open: { label: "Open File", k: "O", ctrl: true, shift: false, alt: false, run() { getCsvHandle()?.open(); }, description: "Open a CSV file from the file finder" },
  save: { label: "Save", k: "S", ctrl: true, shift: false, alt: false, run() { getCsvHandle()?.save(); }, description: "Save" },
  saveAs: { label: "Save As", k: "S", ctrl: true, shift: true, alt: false, run() { getCsvHandle()?.saveAs(); }, description: "Save As" },
  reloadFile: { label: "Reload File", k: "R", ctrl: true, shift: false, alt: false, run() { getCsvHandle()?.reloadFile(); }, description: "Reload file from last save" },
  expand: { label: "Expand Row", k: "E", ctrl: true, shift: false, alt: false, run() { getSheet()?.expand(); }, description: "Expand first row to selection" },
  commandPalette: { label: "Command Palette", k: "P", ctrl: true, shift: false, alt: false, run() { CommandPalette.toggle(cmd); }, description: "Command Palette" },
  validate_data: { label: "Validate Data: Open Pane", k: "P", ctrl: true, shift: true, alt: false, run() { getSheet()?.open_validation_pane(); }, description: "Open data validation pane with all validation rules" },
  validate_headers: { label: "Validate: Headers & SQL Compliance", k: "H", ctrl: true, shift: true, alt: false, run() { getSheet()?.validate_headers(); }, description: "Validate and sanitize column headers for SQL identifier standards and duplicates" },
  next_occurance: { label: "Next Occurrence", k: "D", ctrl: true, shift: false, alt: false, run() { getSheet()?.go_to_next(); }, description: "Go to next occurence of cell value" },
  prev_occurance: { label: "Previous Occurrence", k: "D", ctrl: true, shift: true, alt: false, run() { getSheet()?.go_to_prev(); }, description: "Go to previous occurence of cell value" },
  goToCoordinate: { label: "Go to Coordinate", ctrl: false, shift: false, alt: false, run() { getSheet()?.startCoordEdit(); }, description: "Go to coordinate" },
  sort: { label: "Sort Ascending", k: "L", ctrl: true, shift: false, alt: false, run() { getSheet()?.sortAscending(); }, description: "Sort rows based on active column (ascending order)" },
  sort_reverse: { label: "Sort Descending", k: "L", ctrl: true, shift: true, alt: false, run() { getSheet()?.sortDescending(); }, description: "Sort rows based on active column (descending order)" },

  shiftUp: { label: "Shift Row Up", k: "ARROWUP", ctrl: false, shift: false, alt: true, run() { getSheet()?.shift(0); }, description: "Shift row up" },
  shiftDown: { label: "Shift Row Down", k: "ARROWDOWN", ctrl: false, shift: false, alt: true, run() { getSheet()?.shift(2); }, description: "Shift row down" },
  shiftRight: { label: "Shift Col Right", k: "ARROWRIGHT", ctrl: false, shift: false, alt: true, run() { getSheet()?.shift(1); }, description: "Shift col right" },
  shiftLeft: { label: "Shift Col Left", k: "ARROWLEFT", ctrl: false, shift: false, alt: true, run() { getSheet()?.shift(3); }, description: "Shift col left" },

  insertUp: { label: "Insert Row Above", k: "ARROWUP", ctrl: false, shift: true, alt: true, run() { getSheet()?.insert(0); }, description: "Insert row above" },
  insertDown: { label: "Insert Row Below", k: "ARROWDOWN", ctrl: false, shift: true, alt: true, run() { getSheet()?.insert(2); }, description: "Insert row below" },
  insertRight: { label: "Insert Col Right", k: "ARROWRIGHT", ctrl: false, shift: true, alt: true, run() { getSheet()?.insert(1); }, description: "Insert col right" },
  insertLeft: { label: "Insert Col Left", k: "ARROWLEFT", ctrl: false, shift: true, alt: true, run() { getSheet()?.insert(3); }, description: "Insert col left" },

  scrollLeft: { label: "Scroll Left", k: "scroll ARROWUP ", ctrl: false, shift: false, alt: true, description: "Scroll left" },
  scrollRight: { label: "Scroll Right", k: "scroll ARROWDOWN ", ctrl: false, shift: false, alt: true, description: "Scroll right" },

  exportJson: {
    label: "Export as JSON",
    ctrl: false,
    shift: false,
    alt: false,
    run() { getCsvHandle()?.exportJson(); },
    description: "Export current sheet as JSON file"
  },
  exportTsv: {
    label: "Export as TSV",
    ctrl: false,
    shift: false,
    alt: false,
    run() { getCsvHandle()?.exportTsv(); },
    description: "Export current sheet as Tab-Separated Values (TSV) file"
  },
  exportMarkdown: {
    label: "Export as Markdown",
    ctrl: false,
    shift: false,
    alt: false,
    run() { getCsvHandle()?.exportMarkdown(); },
    description: "Export current sheet as GitHub Flavored Markdown table"
  },
  copyMarkdown: {
    label: "Copy as Markdown",
    ctrl: false,
    shift: false,
    alt: false,
    run() { getCsvHandle()?.copyMarkdown(); },
    description: "Copy active selection as Markdown table to clipboard"
  },
  copyJson: {
    label: "Copy as JSON",
    ctrl: false,
    shift: false,
    alt: false,
    run() { getCsvHandle()?.copyJson(); },
    description: "Copy active selection as JSON to clipboard"
  },
};

// Register default commands for command palette
CommandPalette.setDefaultCommands(cmd);

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



export { cmd, getCommandTooltip };
