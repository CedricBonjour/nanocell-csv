import { cmd } from './CommandRegistry.js';
import { dom } from '../ui/AppLayout.js';
import { DialogManager } from '../ui/DialogManager.js';
import { getSheet } from '../appContext.js';
import { stg } from '../ui/settings/Setting.js';
import { CsvParser } from '../../../core/csv/CsvParser.js';
import { CsvSerializer } from '../../../core/csv/CsvSerializer.js';
import { SeparatorDetector } from '../../../core/csv/SeparatorDetector.js';

let activeKeyDownHandler = null;
let activeKeyUpHandler = null;
let activeCopyHandler = null;
let activeCutHandler = null;
let activePasteHandler = null;

function getShortcutKey(key, ctrl, shift, alt) {
  return `${ctrl ? 1 : 0}:${shift ? 1 : 0}:${alt ? 1 : 0}:${String(key).toUpperCase()}`;
}

let shortcutMap = null;
function getShortcutMap() {
  if (!shortcutMap) {
    shortcutMap = new Map();
    for (const c of Object.values(cmd)) {
      if (!c.k || typeof c.run !== 'function') continue;
      const keyUpper = String(c.k).toUpperCase();
      const ctrl = Boolean(c.ctrl);
      const shift = Boolean(c.shift);
      const alt = Boolean(c.alt);
      shortcutMap.set(getShortcutKey(keyUpper, ctrl, shift, alt), c);
      if (c.k !== keyUpper) {
        shortcutMap.set(getShortcutKey(c.k, ctrl, shift, alt), c);
      }
    }
    if (cmd.delete) {
      shortcutMap.set(getShortcutKey('DELETE', false, false, false), cmd.delete);
    }
    if (cmd.redo) {
      shortcutMap.set(getShortcutKey('Y', true, false, false), cmd.redo);
    }
    if (cmd.shortcuts) {
      shortcutMap.set(getShortcutKey('K', true, false, false), cmd.shortcuts);
    }
  }
  return shortcutMap;
}

export function buildKeys() {
  shortcutMap = null;
  if (typeof document !== 'undefined') {
    if (activeKeyDownHandler) document.removeEventListener('keydown', activeKeyDownHandler);
    if (activeKeyUpHandler) document.removeEventListener('keyup', activeKeyUpHandler);
    if (activeCopyHandler) document.removeEventListener('copy', activeCopyHandler);
    if (activeCutHandler) document.removeEventListener('cut', activeCutHandler);
    if (activePasteHandler) document.removeEventListener('paste', activePasteHandler);
  }

  // Prevent browser default actions for registered app shortcuts
  const prevent_dflt_list = [
    'H', 'N', 'T', 'F', 'O', 'P', 'M', 'S', 'R', 'G', 'K',
    'A', 'B', 'D', 'E', 'L', 'Z', 'Y', 'Q', ';', 'BACKSPACE'
  ];

  const onKeyDown = function (e) {
    let k = e.key.toUpperCase();
    const ctrlDown = e.metaKey || e.ctrlKey;
    let alt = e.altKey;
    const shift = e.shiftKey;
    const meta = e.metaKey;
    const activeSheet = getSheet();

    // Determine current active interaction context
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isCellInput = Boolean(activeSheet && activeSheet.inputing && activeEl === activeSheet.inputField);
    const inCommandPalette = Boolean(
      (activeEl && typeof activeEl.closest === 'function' && activeEl.closest('ui-command-palette')) ||
      (dom?.palette && Boolean(dom.palette.isOpen)) ||
      (typeof document !== 'undefined' && Boolean(document.querySelector('ui-command-palette')?.isOpen))
    );
    const inDialog = Boolean(DialogManager.isBusy);
    const inFinder = Boolean(activeEl && typeof activeEl.closest === 'function' && activeEl.closest('ui-finder'));
    const inFilter = Boolean(activeEl && typeof activeEl.closest === 'function' && activeEl.closest('ui-filter'));
    const validationPane = dom?.validationPane || (typeof document !== 'undefined' ? (document.getElementById('validation-pane') || document.querySelector('ui-validation-pane')) : null);
    const inValidationPane = Boolean(validationPane && validationPane.isOpen);
    const isOtherInput = Boolean(
      activeEl &&
      (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable) &&
      !isCellInput
    );

    // Prevent default for registered Ctrl commands on the page
    if (ctrlDown && (prevent_dflt_list.includes(k) || prevent_dflt_list.includes(e.key))) {
      // Don't prevent Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z inside other inputs
      if (!(isOtherInput || isCellInput) || (k !== 'C' && k !== 'V' && k !== 'X' && k !== 'A' && k !== 'Z')) {
        e.preventDefault();
      }
    }

    // Context 1: Command Palette handling
    if (inCommandPalette) {
      if (k === "ESCAPE") {
        const palette = document.getElementById('palette') || document.querySelector('ui-command-palette');
        if (palette && typeof palette.close === 'function') palette.close();
        return;
      }
      return;
    }

    // Open/Toggle Command Palette (Ctrl+P or Ctrl+K)
    if (ctrlDown && (k === "P" || k === "K") && !shift && !alt) {
      e.preventDefault();
      if (cmd.shortcuts?.run) {
        cmd.shortcuts.run();
      } else {
        const palette = document.getElementById('palette') || document.querySelector('ui-command-palette');
        if (palette && typeof palette.toggle === 'function') palette.toggle();
      }
      return;
    }

    // Context 2: Modal Dialog handling
    if (inDialog) {
      if (k === "ESCAPE") {
        e.preventDefault();
        DialogManager.close();
        return;
      }
      return;
    }

    // Context 3: Floating Finder handling
    if (inFinder) {
      if (k === "ESCAPE") {
        e.preventDefault();
        const finderEl = activeEl.closest('ui-finder');
        if (finderEl && typeof finderEl.close === 'function') finderEl.close();
        return;
      }
      // Allow Ctrl+F or Ctrl+Shift+F to refocus/toggle find while in finder
      if (ctrlDown && k === "F") {
        e.preventDefault();
        if (activeSheet) activeSheet.find(shift);
        return;
      }
      return;
    }

    // Context 3.2: Floating Filter handling
    if (inFilter) {
      if (k === "ESCAPE" || (ctrlDown && k === "Q")) {
        e.preventDefault();
        const filterEl = activeEl.closest('ui-filter');
        if (filterEl && typeof filterEl.close === 'function') filterEl.close();
        return;
      }
      return;
    }

    // Context 3.5: Validation Pane handling (Escape closes at root or goes back in selection)
    if (inValidationPane) {
      if (k === "ESCAPE" && !isCellInput) {
        e.preventDefault();
        if (typeof validationPane.handleEscape === 'function') {
          validationPane.handleEscape();
        } else if (typeof validationPane.handleBack === 'function') {
          validationPane.handleBack();
        }
        return;
      }
    }

    // Context 4: Other form inputs (e.g. Validation pane, standalone inputs)
    if (isOtherInput) {
      return;
    }

    // Context 5: Active inline cell editing
    if (isCellInput) {
      // Allow global shortcuts like Save, Open, or Filter to commit cell and execute
      if (ctrlDown && (k === "S" || k === "O" || k === "Q")) {
        e.preventDefault();
        if (k === "S") (shift ? cmd.saveAs.run() : cmd.save.run());
        if (k === "O") cmd.open.run();
        if (k === "Q") cmd.filter.run();
        return;
      }
      // Native input cursor and text editing handled directly by inputField
      return;
    }

    // =========================================================================
    // Context 6: Normal Sheet Grid Mode
    // =========================================================================
    const isArrowKey = k === "ARROWUP" || k === "ARROWDOWN" || k === "ARROWLEFT" || k === "ARROWRIGHT";
    const isBoundaryKey = isArrowKey || k === "HOME" || k === "END" || k === "PAGEUP" || k === "PAGEDOWN";

    if (activeSheet) {
      // Range selection is ONLY active when Shift is held during navigation (Arrow, Home, End, PageUp, PageDown)
      // Non-navigation keys and Ctrl+Shift shortcuts (e.g. Ctrl+Shift+D) must NOT enable range selection.
      activeSheet.slctRange = shift && !alt && !meta && isBoundaryKey;
    }

    if (alt && k === "TAB") return;
    if (ctrlDown && (k === "C" || k === "V")) return;
    if (k === "TAB") e.preventDefault();
    if (e.code === "Space") k = "SPACE";

    // Paging navigation
    if (k === "PAGEUP" && activeSheet) {
      e.preventDefault();
      const pageSize = stg?.rows || 10;
      activeSheet.y = Math.max(0, activeSheet.y - pageSize);
      activeSheet.slctRefresh();
      return;
    }
    if (k === "PAGEDOWN" && activeSheet) {
      e.preventDefault();
      const pageSize = stg?.rows || 10;
      activeSheet.y = Math.min(activeSheet.rowCount - 1, activeSheet.y + pageSize);
      activeSheet.slctRefresh();
      return;
    }

    // Home / End navigation
    if (k === "HOME" && activeSheet) {
      e.preventDefault();
      if (ctrlDown) {
        activeSheet.x = 0;
        activeSheet.y = 0;
      } else {
        activeSheet.x = 0;
      }
      activeSheet.slctRefresh();
      return;
    }
    if (k === "END" && ctrlDown && activeSheet) {
      e.preventDefault();
      const maxX = Math.max(0, activeSheet.df.width - 1);
      const maxY = Math.max(0, activeSheet.rowCount - 1);
      activeSheet.x = maxX;
      activeSheet.y = maxY;
      activeSheet.slctRefresh();
      return;
    }

    // F2: Enter cell editing mode
    if (k === "F2" && activeSheet) {
      e.preventDefault();
      if (activeSheet.df?.lock) return;
      activeSheet.input();
      return;
    }

    // Ctrl + Arrow navigation (jump to grid boundaries, with or without range selection)
    if (ctrlDown && activeSheet) {
      const maxX = Math.max(0, activeSheet.df.width - 1);
      const maxY = Math.max(0, activeSheet.rowCount - 1);
      switch (k) {
        case "ARROWUP": e.preventDefault(); activeSheet.y = 0; activeSheet.slctRefresh(); return;
        case "ARROWRIGHT": e.preventDefault(); activeSheet.x = maxX; activeSheet.slctRefresh(); return;
        case "ARROWDOWN": e.preventDefault(); activeSheet.y = maxY; activeSheet.slctRefresh(); return;
        case "ARROWLEFT": e.preventDefault(); activeSheet.x = 0; activeSheet.slctRefresh(); return;
      }
    }

    // Command registry execution via O(1) shortcut map
    const map = getShortcutMap();
    const matchedCmd = map.get(getShortcutKey(k, ctrlDown, shift, alt)) ||
                       map.get(getShortcutKey(e.key, ctrlDown, shift, alt));
    if (matchedCmd) {
      matchedCmd.run();
      return e.preventDefault();
    }

    // Printable single character typed on grid -> enters edit mode
    if (e.key.length === 1 && !ctrlDown && !e.metaKey && !alt && activeSheet) {
      if (activeSheet.df?.lock) return;
      e.preventDefault();
      return activeSheet.input(e.key);
    }

    // Grid arrow and cell navigation
    if (activeSheet) {
      switch (k) {
        case "ARROWUP": e.preventDefault(); activeSheet.y--; activeSheet.slctRefresh(); return;
        case "ARROWDOWN": e.preventDefault(); activeSheet.y++; activeSheet.slctRefresh(); return;
        case "ARROWLEFT": e.preventDefault(); activeSheet.x--; activeSheet.slctRefresh(); return;
        case "ARROWRIGHT": e.preventDefault(); activeSheet.x++; activeSheet.slctRefresh(); return;
        case "TAB":
          e.preventDefault();
          activeSheet.slctRange = false;
          activeSheet.rangeEnd = undefined;
          if (shift) activeSheet.x--;
          else activeSheet.x++;
          activeSheet.slctRefresh();
          return;
        case "ENTER":
          e.preventDefault();
          if (activeSheet.df?.lock) return;
          activeSheet.input();
          return;
        case "BACKSPACE":
        case "DELETE":
          e.preventDefault();
          if (activeSheet.df?.lock) return;
          activeSheet.rangeEdit('');
          activeSheet.refresh();
          return;
      }
    }
  };

  const onKeyUp = function (e) {
    const k = e.key.toUpperCase();
    const activeSheet = getSheet();
    if (!activeSheet) return;
    switch (k) {
      case "CONTROL":
      case "SHIFT":
        if (!e.shiftKey) {
          activeSheet.slctRange = false;
        }
        return;
    }
  };

  activeKeyDownHandler = onKeyDown;
  activeKeyUpHandler = onKeyUp;

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  activeCopyHandler = function (e) {
    const activeEl = document.activeElement;
    const inputting = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet) return;
    e.preventDefault();
    const serializer = new CsvSerializer({ delimiter: '\t' });
    const clip = serializer.serialize(activeSheet.rangeArray());
    e.clipboardData?.setData('text/plain', clip);
  };

  activeCutHandler = function (e) {
    const activeEl = document.activeElement;
    const inputting = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet || activeSheet.df?.lock) return;
    e.preventDefault();
    const serializer = new CsvSerializer({ delimiter: '\t' });
    const clip = serializer.serialize(activeSheet.rangeArray());
    e.clipboardData?.setData('text/plain', clip);
    activeSheet.rangeEdit('');
    activeSheet.refresh();
  };

  activePasteHandler = function (e) {
    const activeEl = document.activeElement;
    const inputting = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet || activeSheet.df?.lock) return;
    e.preventDefault();
    const rawText = e.clipboardData?.getData('text');
    if (!rawText) return;

    const delimiter = rawText.includes('\t') ? '\t' : SeparatorDetector.detect(rawText);
    const trimUnquotedWhitespace = Boolean(stg?.trim_unquoted);
    const parser = new CsvParser({ delimiter, trimUnquotedWhitespace });
    const matrix = parser.parse(rawText);
    if (matrix && matrix.length > 0) {
      activeSheet.paste(matrix);
      activeSheet.refresh();
    }
  };

  document.addEventListener('copy', activeCopyHandler);
  document.addEventListener('cut', activeCutHandler);
  document.addEventListener('paste', activePasteHandler);
};
