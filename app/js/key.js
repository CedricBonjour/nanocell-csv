import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { StateManager } from './StateManager.js';

const getSheet = () => StateManager.getState('sheet');
const isOSX = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh');

let buildKeys = function () {
  const prevent_dflt_list = ['H', 'N', 'T', 'F', 'O', 'P'];
  document.onkeydown = function (e) {
    let k = e.key.toUpperCase();
    const ctrlDown = e.metaKey || e.ctrlKey;
    let alt = e.altKey;
    const shift = e.shiftKey;
    const meta = e.metaKey;
    const inputting = document.activeElement.tagName == "INPUT";
    const activeSheet = getSheet();
    if (activeSheet) activeSheet.slctRange = shift;
    if (ctrlDown && (prevent_dflt_list.includes(k))) { e.preventDefault(); }
    if (ctrlDown && k === "P" && !shift && !alt) {
      let palette = document.querySelector('ui-command-palette');
      if (!palette && typeof document !== 'undefined') {
        palette = document.createElement('ui-command-palette');
        document.body.appendChild(palette);
      }
      if (palette && typeof palette.toggle === 'function') palette.toggle();
      return;
    }
    if (dom.dialog.isBusy && k === "ESCAPE") return dom.dialog.clear();
    if (dom.dialog.isLarge) return;
    if (isOSX && k === "S" && meta && shift) return cmd.saveAs.run();
    if (isOSX && k === "S" && meta) return cmd.save.run();
    if (alt && k == "TAB") return;
    if (ctrlDown && (k === "C" || k === "V")) return;
    if (k === "TAB") { e.preventDefault(); }
    if (inputting && !(ctrlDown && (k === "F" || k === 'S' || k === 'O'))) return;
    if (e.code === "Space") k = "SPACE";
    if (k === "PAGEUP") { k = "ARROWUP"; alt = true; }
    if (k === "PAGEDOWN") { k = "ARROWDOWN"; alt = true; }

    if (ctrlDown && activeSheet) {
      switch (k) {
        case "ARROWUP": activeSheet.y = 0; activeSheet.slctRefresh(); return;
        case "ARROWRIGHT": activeSheet.x = activeSheet.df.width - 1; activeSheet.slctRefresh(); return;
        case "ARROWDOWN": activeSheet.y = activeSheet.df.height - 1; activeSheet.slctRefresh(); return;
        case "ARROWLEFT": activeSheet.x = 0; activeSheet.slctRefresh(); return;
      }
    }

    if (e.key.length === 1 && !ctrlDown && !e.metaKey && activeSheet) { e.preventDefault(); return activeSheet.input(e.key); }

    for (const c of Object.values(cmd))
      if (k === c.k && c.ctrl === ctrlDown && c.shift === shift && c.alt === alt) { c.run(); return e.preventDefault(); }

    if (activeSheet) {
      switch (k) {
        case "ARROWUP": activeSheet.y--; activeSheet.slctRefresh(); return;
        case "ARROWDOWN": activeSheet.y++; activeSheet.slctRefresh(); return;
        case "ARROWLEFT": activeSheet.x--; activeSheet.slctRefresh(); return;
        case "ARROWRIGHT": activeSheet.x++; activeSheet.slctRefresh(); return;
        case "TAB": activeSheet.x++; activeSheet.slctRefresh(); return;
        case "ENTER": activeSheet.input(); return;
        case "BACKSPACE": activeSheet.delete(); return;
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
