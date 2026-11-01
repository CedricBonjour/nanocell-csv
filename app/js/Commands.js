/**
 * @file app/js/Commands.js
 * Command registry (labels, shortcuts, actions) plus document-level keyboard and clipboard routing.
 * whileEditing commands keep working while the cell editor has focus.
 */

import { getSheet, getCsvHandle, Setting, dom } from './state.js';
import { AboutDialog, SettingDialog, DialogManager } from './Dialogs.js';
import { Notification, triggerAppInstall } from './Notification.js';
import { startCoordEdit } from './AppLayout.js';
import { VALIDATION_RULES } from '../core/DataValidator.js';
import { getShortcutKey, isInputElement } from './utils.js';

const commands = {
  about: { label: 'About', key: 'H', ctrl: true, run: () => AboutDialog.show(), description: 'About' },
  installApp: { label: 'Install Desktop App', run: () => triggerAppInstall(), description: 'Install NanoCell as standalone desktop app' },
  new: { label: 'New Sheet', key: 'N', ctrl: true, run: () => getCsvHandle().new(), description: 'New sheet' },
  deleteRow: { label: 'Delete Row', key: 'BACKSPACE', ctrl: true, run: () => getSheet().deleteRows(), description: 'Delete Row' },
  deleteCol: { label: 'Delete Col', key: 'BACKSPACE', ctrl: true, shift: true, run: () => getSheet().deleteCols(), description: 'Delete Col' },
  delete: { label: 'Delete Selection', key: 'BACKSPACE', run: () => getSheet().deleteSelection(), description: 'Delete Selection' },
  settings: { label: 'Settings', key: ',', ctrl: true, run: () => SettingDialog.show(), description: 'Display Settings' },
  shortcuts: { label: 'Command Palette', key: 'P', ctrl: true, run: () => dom.palette.toggle(), description: 'Command Palette' },
  selectAll: { label: 'Select All', key: 'A', ctrl: true, run: () => getSheet().selectAll(), description: 'Select All' },
  transpose: { label: 'Transpose', key: 'T', ctrl: true, shift: true, run: () => getSheet().transposeSelection(), description: 'Transpose rows and columns (selection or whole sheet)' },
  trim: { label: 'Trim Empty Rows/Cols', key: 'T', ctrl: true, alt: true, run: () => getSheet().trim(), description: 'Trim : remove all empty rows/cols' },
  integer: { label: 'Round to Integer', key: 'I', ctrl: true, run: () => getSheet().round(true), description: 'Round selection to integer' },
  decimal: { label: 'Round to Decimal', key: '$', ctrl: true, run: () => getSheet().round(false), description: 'Round selection to decimal' },
  fixTop: { label: 'Freeze Header Row', icon: 'fix_top', key: 'B', ctrl: true, run: () => getSheet().toggleFixTop(), description: 'Freeze Header Row' },
  undo: { label: 'Undo', key: 'Z', ctrl: true, run: () => getSheet().undo(), description: 'Undo' },
  redo: { label: 'Redo', key: 'Z', ctrl: true, shift: true, run: () => getSheet().redo(), description: 'Redo' },
  date: { label: "Insert Today's Date", key: ';', ctrl: true, run: () => getSheet().insertDate(), description: "Insert today's date" },
  filter: { label: 'Filter Column', key: 'Q', ctrl: true, whileEditing: true, run: (col) => getSheet().openFilter(col), description: 'Filter sheet rows by column value' },
  find: { label: 'Find & Match', key: 'F', ctrl: true, run: () => getSheet().find(false), description: 'Quick find / match' },
  findAdvanced: { label: 'Advanced Find / Replace', key: 'F', ctrl: true, shift: true, run: () => getSheet().find(true), description: 'Advanced find / replace' },
  toggleActionBar: { label: 'Toggle Menu Bar', key: 'M', ctrl: true, run: () => Setting.toggleActionBar(), description: 'Toggle action bar display' },
  open: { label: 'Open File', key: 'O', ctrl: true, whileEditing: true, run: () => getCsvHandle().open(), description: 'Open a CSV file from the file finder' },
  save: { label: 'Save', key: 'S', ctrl: true, whileEditing: true, run: () => getCsvHandle().save(), description: 'Save' },
  saveAs: { label: 'Save As', key: 'S', ctrl: true, shift: true, whileEditing: true, run: () => getCsvHandle().saveAs(), description: 'Save As' },
  reloadFile: { label: 'Reload File', icon: 'reload_file', key: 'R', ctrl: true, whileEditing: true, run: () => getCsvHandle().reloadFile(), description: 'Reload file from last save' },
  fileInfo: { label: 'File Info', icon: 'info', run: () => dom.fileInfoPane.toggle(), description: 'Show file details, encoding, separator, and sheet dimensions' },
  expand: { label: 'Expand Row', key: 'E', ctrl: true, run: () => getSheet().expand(), description: 'Expand first row to selection' },
  validateData: { label: 'Validate Data: Open Pane', icon: 'validate_data', key: 'P', ctrl: true, shift: true, run: () => dom.validationPane.toggle(), description: 'Open data validation pane with all validation rules' },
  macros: { label: 'Macros: Open Pane', icon: 'macro', key: 'M', ctrl: true, shift: true, run: () => dom.macroPane.toggle(), description: 'Open macros pane to run or edit validation macros' },
  nextOccurrence: { label: 'Next Occurrence', key: 'D', ctrl: true, run: () => getSheet().goToOccurrence(true), description: 'Go to next occurrence of cell value' },
  prevOccurrence: { label: 'Previous Occurrence', key: 'D', ctrl: true, shift: true, run: () => getSheet().goToOccurrence(false), description: 'Go to previous occurrence of cell value' },
  goToCoordinate: { label: 'Go to Coordinate', key: 'G', ctrl: true, run: () => startCoordEdit(), description: 'Go to coordinate' },
  sortAscending: { label: 'Sort Ascending', icon: 'sort', key: 'L', ctrl: true, run: () => { const s = getSheet(); s.sort(s.x, true); }, description: 'Sort rows based on active column (ascending order)' },
  sortDescending: { label: 'Sort Descending', icon: 'sort_reverse', key: 'L', ctrl: true, shift: true, run: () => { const s = getSheet(); s.sort(s.x, false); }, description: 'Sort rows based on active column (descending order)' },
  shiftUp: { label: 'Shift Row Up', key: 'ARROWUP', alt: true, run: () => getSheet().shift(0), description: 'Shift row up' },
  shiftDown: { label: 'Shift Row Down', key: 'ARROWDOWN', alt: true, run: () => getSheet().shift(2), description: 'Shift row down' },
  shiftRight: { label: 'Shift Col Right', key: 'ARROWRIGHT', alt: true, run: () => getSheet().shift(1), description: 'Shift col right' },
  shiftLeft: { label: 'Shift Col Left', key: 'ARROWLEFT', alt: true, run: () => getSheet().shift(3), description: 'Shift col left' },
  insertUp: { label: 'Insert Row Above', key: 'ARROWUP', shift: true, alt: true, run: () => getSheet().insert(0), description: 'Insert row above' },
  insertDown: { label: 'Insert Row Below', key: 'ARROWDOWN', shift: true, alt: true, run: () => getSheet().insert(2), description: 'Insert row below' },
  insertRight: { label: 'Insert Col Right', key: 'ARROWRIGHT', shift: true, alt: true, run: () => getSheet().insert(1), description: 'Insert col right' },
  insertLeft: { label: 'Insert Col Left', key: 'ARROWLEFT', shift: true, alt: true, run: () => getSheet().insert(3), description: 'Insert col left' },
  exportJson: { label: 'Export as JSON', run: () => getCsvHandle().exportJson(), description: 'Export current sheet as JSON file' },
  exportTsv: { label: 'Export as TSV', run: () => getCsvHandle().exportTsv(), description: 'Export current sheet as Tab-Separated Values (TSV) file' },
  exportMarkdown: { label: 'Export as Markdown', run: () => getCsvHandle().exportMarkdown(), description: 'Export current sheet as GitHub Flavored Markdown table' },
  copyMarkdown: { label: 'Copy as Markdown', run: () => getCsvHandle().copyMarkdown(), description: 'Copy active selection as Markdown table to clipboard' },
  copyJson: { label: 'Copy as JSON', run: () => getCsvHandle().copyJson(), description: 'Copy active selection as JSON to clipboard' },
};

for (const r of VALIDATION_RULES) {
  commands[r.cmdId] = {
    get label() { return `Validate: ${r.label}`; },
    key: r.key,
    ctrl: r.ctrl,
    shift: r.shift,
    run: () => { dom.validationPane.show(); dom.validationPane.runRule(r.id); },
    get description() { return r.description; }
  };
}

// --- Document-level keyboard & clipboard routing ---
//
// Keyboard model: the focused component handles its own keys first and stops propagation
// (cell editor: Enter/Tab/arrows/Escape; overlays via bindOverlayKeys: Escape/Tab; finder/filter:
// their Ctrl+F / Ctrl+Q). This router only sees what is left and applies app-wide policy.

const shortcutMap = new Map();
for (const cmd of Object.values(commands)) {
  if (cmd.key) shortcutMap.set(getShortcutKey(cmd.key, Boolean(cmd.ctrl), Boolean(cmd.shift), Boolean(cmd.alt)), cmd);
}
shortcutMap.set(getShortcutKey('DELETE', false, false, false), commands.delete);
shortcutMap.set(getShortcutKey('Y', true, false, false), commands.redo);
shortcutMap.set(getShortcutKey('K', true, false, false), commands.shortcuts);

// Ctrl+<key> combos the browser would otherwise hijack (print, save, find...).
const PREVENT_DEFAULT_KEYS = new Set([
  'Y', 'K', ...Object.values(commands).filter(c => c.ctrl && c.key).map(c => String(c.key).toUpperCase())
]);
// ...except native text editing while typing in an input.
const NATIVE_EDIT_KEYS = new Set(['C', 'V', 'X', 'A', 'Z', 'BACKSPACE']);
const NAVIGATION_KEYS = new Set(['HOME', 'END', 'PAGEUP', 'PAGEDOWN']);

function onKeyDown(event) {
  let key = event.key.toUpperCase();
  const ctrlDown = event.metaKey || event.ctrlKey;
  const { altKey: alt, shiftKey: shift } = event;
  const sheet = getSheet();
  const activeEl = document.activeElement;
  const inInput = isInputElement(activeEl);
  const inCellEditor = sheet.isEditing && activeEl === sheet.inputField;

  if (ctrlDown && PREVENT_DEFAULT_KEYS.has(key) && !(inInput && NATIVE_EDIT_KEYS.has(key))) event.preventDefault();

  // Modal overlays own the keyboard; forward Escape/Tab to them when focus drifted outside.
  if (dom.palette.isOpen) return dom.palette.handleOverlayKey(event);
  if (ctrlDown && (key === 'P' || key === 'K') && !shift && !alt) {
    event.preventDefault();
    return commands.shortcuts.run();
  }
  if (DialogManager.isBusy) return DialogManager.handleOverlayKey(event);

  // A focused popup (finder, filter, notification) handles its own keys.
  if (activeEl?.closest('[data-owns-keyboard]')) return;

  // Unclaimed Escape steps back in the open drawer, otherwise dismisses notifications.
  if (key === 'ESCAPE') {
    const drawer = [dom.validationPane, dom.macroPane, dom.fileInfoPane].find(pane => pane?.isOpen);
    if (drawer) {
      event.preventDefault();
      drawer.handleBack();
    } else {
      Notification.closeAll();
    }
    return;
  }

  if (inCellEditor) {
    const command = shortcutMap.get(getShortcutKey(key, ctrlDown, shift, alt));
    if (command?.whileEditing) {
      event.preventDefault();
      command.run();
    }
    return;
  }
  if (inInput) return;

  sheet.isSelectingRange = shift && !alt && !event.metaKey && (key.startsWith('ARROW') || NAVIGATION_KEYS.has(key));

  if ((alt && key === 'TAB') || (ctrlDown && (key === 'C' || key === 'V'))) return;
  if (key === 'TAB') event.preventDefault();
  if (event.code === 'Space') key = 'SPACE';

  const command = shortcutMap.get(getShortcutKey(key, ctrlDown, shift, alt));
  if (command) {
    event.preventDefault();
    command.run();
    return;
  }

  sheet.handleKeyDown(event, key, ctrlDown, shift, alt);
}

function onKeyUp(event) {
  const key = event.key.toUpperCase();
  if ((key === 'CONTROL' || key === 'SHIFT') && !event.shiftKey) getSheet().isSelectingRange = false;
}

function getClipboardSheet(requireUnlocked) {
  if (isInputElement(document.activeElement)) return null;
  const sheet = getSheet();
  return (requireUnlocked && sheet.df.lock) ? null : sheet;
}

function writeClipboard(event, { text, html }) {
  event.preventDefault();
  event.clipboardData.setData('text/plain', text);
  if (html) event.clipboardData.setData('text/html', html);
}

export function buildKeys() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('copy', (event) => {
    const sheet = getClipboardSheet(false);
    if (sheet) writeClipboard(event, sheet.copySelectionData());
  });
  document.addEventListener('cut', (event) => {
    const sheet = getClipboardSheet(true);
    if (sheet) writeClipboard(event, sheet.cutSelectionData());
  });
  document.addEventListener('paste', (event) => {
    const sheet = getClipboardSheet(true);
    if (!sheet) return;
    event.preventDefault();
    const rawText = event.clipboardData.getData('text/plain') || event.clipboardData.getData('text');
    sheet.pasteClipboard(rawText, event.clipboardData.getData('text/html'));
  });
}

export { commands };
