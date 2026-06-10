import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { isOSX, getSheet } from './main.js';



let buildKeys = function () {
  let prevent_dflt_list = ['H', 'N', 'T', 'F', 'O'];// { H: history pop up, N: new window, T: new tab} 
  document.onkeydown = function (e) {
    var k = e.key.toUpperCase();
    // console.log(e)
    var ctrlDown = e.metaKey || e.ctrlKey;
    var alt = e.altKey;
    var shift = e.shiftKey;
    var meta = e.metaKey;
    var inputting = document.activeElement.tagName == "INPUT";
    getSheet().slctRange = shift;
    if (ctrlDown && (prevent_dflt_list.includes(k))) { e.preventDefault(); } // prevent : 
    if (dom.dialog.isBusy && k === "ESCAPE") return dom.dialog.clear();
    if (dom.dialog.isLarge) return;
    if (isOSX && k === "S" && meta && shift) return cmd.saveAs.run();
    if (isOSX && k === "S" && meta) return cmd.save.run();
    if (alt && k == "TAB") return; // enable switching window 
    if (ctrlDown && (k === "C" || k === "V")) return; // enables copy paste events
    if (k === "TAB") { e.preventDefault(); } // prevent : all tab events;
    if (inputting && !(ctrlDown && (k === "F" || k === 'S' || k === 'O'))) return; // letting finder and save through
    if (e.code === "Space") k = "SPACE";
    if (k === "PAGEUP") { k = "ARROWUP"; alt = true }
    if (k === "PAGEDOWN") { k = "ARROWDOWN"; alt = true }

    if (ctrlDown) {
      switch (k) {
        case "ARROWUP": getSheet().y = 0; getSheet().slctRefresh(); return;
        case "ARROWRIGHT": getSheet().x = getSheet().df.width - 1; getSheet().slctRefresh(); return
        case "ARROWDOWN": getSheet().y = getSheet().df.height - 1; getSheet().slctRefresh(); return;
        case "ARROWLEFT": getSheet().x = 0; getSheet().slctRefresh(); return;
      }
    }

    // any char without control keys will start inputing
    if (e.key.length === 1 && !ctrlDown && !e.metaKey) { e.preventDefault(); return getSheet().input(e.key); }

    // prevents the default from any cmd combo
    for (var c of Object.values(cmd))
      if (k === c.k && c.ctrl === ctrlDown && c.shift === shift && c.alt === alt) { c.run(); return e.preventDefault() }


    switch (k) {
      case "ARROWUP": getSheet().y--; getSheet().slctRefresh(); return;
      case "ARROWDOWN": getSheet().y++; getSheet().slctRefresh(); return;
      case "ARROWLEFT": getSheet().x--; getSheet().slctRefresh(); return;
      case "ARROWRIGHT": getSheet().x++; getSheet().slctRefresh(); return;
      case "TAB": getSheet().x++; getSheet().slctRefresh(); return;
      case "ENTER": getSheet().input(); return;
      case "BACKSPACE": getSheet().delete(); return;
    }
  }

  document.onkeyup = function (e) {
    var k = e.key.toUpperCase();
    switch (k) {
      case "CONTROL": if (e.shiftKey) getSheet().slctRange = true; return;
      case "SHIFT": getSheet().slctRange = false; return;
    }
  }

  document.addEventListener('copy', function (e) {
    var inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    e.preventDefault();
    var clip = getSheet().rangeArray().map(r => r.join('\t')).join('\n');
    e.clipboardData.setData('text/plain', clip);
  });

  document.addEventListener('cut', function (e) {
    var inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    e.preventDefault();
    var clip = getSheet().rangeArray().map(r => r.join('\t')).join('\n');
    e.clipboardData.setData('text/plain', clip);
    getSheet().rangeEdit('');
    getSheet().refresh();
  });

  document.addEventListener('paste', function (e) {
    var inputting = document.activeElement.tagName == "INPUT";
    if (inputting) return;
    e.preventDefault();
    getSheet().paste((e.clipboardData).getData('text').split('\n').map(r => r.split(/[\t,]+/)));
    getSheet().refresh();
  });

}


export { buildKeys };
