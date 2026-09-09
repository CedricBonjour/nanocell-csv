import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { StateManager } from './StateManager.js';
import { stg } from './Setting.js';

const getSheet = () => StateManager.getState('sheet');
const isOSX = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh');

let buildKeys = function () {
  // Prevent browser default actions for registered app shortcuts
  const prevent_dflt_list = [
    'H', 'N', 'T', 'F', 'O', 'P', 'M', 'S', 'R', 'G', 'K',
    'A', 'B', 'D', 'E', 'L', 'Z', 'Y', ';', 'BACKSPACE'
  ];

  document.onkeydown = function (e) {
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
      StateManager.getState('commandPaletteOpen') ||
      (typeof document !== 'undefined' && document.querySelector('ui-command-palette')?.style.display === 'block')
    );
    const inDialog = Boolean(dom?.dialog?.isBusy);
    const inFinder = Boolean(activeEl && typeof activeEl.closest === 'function' && activeEl.closest('ui-finder'));
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
        const palette = document.querySelector('ui-command-palette');
        if (palette && typeof palette.close === 'function') palette.close();
        return;
      }
      return;
    }

    // Open/Toggle Command Palette (Ctrl+P or Ctrl+K)
    if (ctrlDown && (k === "P" || k === "K") && !shift && !alt) {
      e.preventDefault();
      let palette = document.querySelector('ui-command-palette');
      if (!palette && typeof document !== 'undefined') {
        palette = document.createElement('ui-command-palette');
        document.body.appendChild(palette);
      }
      if (palette && typeof palette.toggle === 'function') palette.toggle();
      return;
    }

    // Context 2: Modal Dialog handling
    if (inDialog) {
      if (k === "ESCAPE") {
        e.preventDefault();
        return dom.dialog.clear();
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
        if (activeSheet?.finder) activeSheet.finder.findMenu(activeSheet.getSlctFirstValue(), shift);
        return;
      }
      return;
    }

    // Context 4: Other form inputs (e.g. Validation pane, standalone inputs)
    if (isOtherInput) {
      return;
    }

    // Context 5: Active inline cell editing
    if (isCellInput) {
      // Direct date insertion into the active cell editor (Ctrl+; or fallback Ctrl+T)
      if (ctrlDown && (e.key === ";" || k === ";" || k === "T") && !shift && !alt) {
        e.preventDefault();
        cmd.date.run();
        return;
      }
      // Allow global shortcuts like Save or Open to commit cell and execute
      if (ctrlDown && (k === "S" || k === "O")) {
        e.preventDefault();
        if (k === "S") (shift ? cmd.saveAs.run() : cmd.save.run());
        if (k === "O") cmd.open.run();
        return;
      }
      // Native input cursor and text editing handled directly by inputField
      return;
    }

    // =========================================================================
    // Context 6: Normal Sheet Grid Mode
    // =========================================================================
    if (activeSheet) activeSheet.slctRange = shift;

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
      activeSheet.y = Math.min(activeSheet.df.height - 1, activeSheet.y + pageSize);
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
      activeSheet.x = activeSheet.df.width - 1;
      activeSheet.y = activeSheet.df.height - 1;
      activeSheet.slctRefresh();
      return;
    }

    // F2: Enter cell editing mode
    if (k === "F2" && activeSheet) {
      e.preventDefault();
      activeSheet.input();
      return;
    }

    // Ctrl + Arrow navigation (jump to grid boundaries)
    if (ctrlDown && activeSheet) {
      switch (k) {
        case "ARROWUP": e.preventDefault(); activeSheet.y = 0; activeSheet.slctRefresh(); return;
        case "ARROWRIGHT": e.preventDefault(); activeSheet.x = activeSheet.df.width - 1; activeSheet.slctRefresh(); return;
        case "ARROWDOWN": e.preventDefault(); activeSheet.y = activeSheet.df.height - 1; activeSheet.slctRefresh(); return;
        case "ARROWLEFT": e.preventDefault(); activeSheet.x = 0; activeSheet.slctRefresh(); return;
      }
    }

    // Date shortcut explicit handler (Ctrl+; or fallback Ctrl+T)
    if (ctrlDown && (e.key === ";" || k === ";" || k === "T") && !shift && !alt) {
      e.preventDefault();
      cmd.date.run();
      return;
    }

    // Command registry execution
    for (const c of Object.values(cmd)) {
      if ((k === c.k || e.key === c.k) &&
          Boolean(c.ctrl) === Boolean(ctrlDown) &&
          Boolean(c.shift) === Boolean(shift) &&
          Boolean(c.alt) === Boolean(alt)) {
        c.run();
        return e.preventDefault();
      }
    }

    // Printable single character typed on grid -> enters edit mode
    if (e.key.length === 1 && !ctrlDown && !e.metaKey && !alt && activeSheet) {
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
          if (shift) activeSheet.x--;
          else activeSheet.x++;
          activeSheet.slctRefresh();
          return;
        case "ENTER": e.preventDefault(); activeSheet.input(); return;
        case "BACKSPACE":
        case "DELETE":
          e.preventDefault();
          activeSheet.rangeEdit('');
          activeSheet.refresh();
          return;
      }
    }
  };

  document.onkeyup = function (e) {
    const k = e.key.toUpperCase();
    const activeSheet = getSheet();
    if (!activeSheet) return;
    switch (k) {
      case "CONTROL": if (e.shiftKey) activeSheet.slctRange = true; return;
      case "SHIFT": activeSheet.slctRange = false; return;
    }
  };

  document.addEventListener('copy', function (e) {
    const inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet) return;
    e.preventDefault();
    const clip = activeSheet.rangeArray().map(r => r.join('\t')).join('\n');
    e.clipboardData.setData('text/plain', clip);
  });

  document.addEventListener('cut', function (e) {
    const inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet) return;
    e.preventDefault();
    const clip = activeSheet.rangeArray().map(r => r.join('\t')).join('\n');
    e.clipboardData.setData('text/plain', clip);
    activeSheet.rangeEdit('');
    activeSheet.refresh();
  });

  document.addEventListener('paste', function (e) {
    const inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    const activeSheet = getSheet();
    if (!activeSheet) return;
    e.preventDefault();
    activeSheet.paste((e.clipboardData).getData('text').split('\n').map(r => r.split(/[\t,]+/)));
    activeSheet.refresh();
  });
};

export { buildKeys };
