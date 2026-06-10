import { buildCommands, buildMenu } from './cmd.js';
import { CsvHandle } from './CsvHandle.js';
import { Dataframe } from './Dataframe.js';
import { build_dom } from './dom.js';
import { buildKeys } from './key.js';
import { Setting } from './Setting.js';
import { Sheet } from './Sheet.js';
import './ui/input/TCell.js';
import './ui/input/BoolInput.js';
import './ui/input/ListInput.js';
import './ui/input/NumInput.js';
import './ui/input/Scroller.js';
import './ui/input/Table.js';
import './About.js';
import './CMenu.js';
import './Finder.js';
import './Msg.js';
import './Shortcuts.js';

import { registerSW } from 'virtual:pwa-register';

window.addEventListener('beforeunload', function (e) { if (!sheet.df.isSaved) e.preventDefault() });

let sampleData = [
  ["Hello World", ""]
  //   , "a", "a",  "a_éC", "dsiuh IUZASH", "siudch", "a", "", "b"],
  // ["Hello World", "", "a", "a",  "a_éC", "dsiuh IUZASH", "siudch", "a", "", "b"],
  // ["Hello World", "" , "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],

  // [ "Numbers", "Text","Not csv compliant", "Date", "Important"] ,
  // [ "3.14159", "null","not csv, compliant", "2024-11-29", "!cheers!"] ,
  // [ "1", "true", "1,2"] ,
  // [ "+1", "false", "not \"csv\" compliant"] ,
  // [ "", "1e"] ,
  // [ "0", "e2"] ,
  // [ "+0", "inf"] ,
  // [ "-0", "+inf"] ,
  // [ "1e2", "undefined"] ,
  // [ "Infinity", "NA"] ,
  // [ "+Infinity", "na"] ,
  // [ "0x765A", "NaN"] ,
  // [ "", "-"] ,
  // [ "", "--"] ,
  // [ "", "- -"] ,
  // [ "", "=2"] ,

]

// console.log (navigator.userAgent)
let isOSX = navigator.userAgent.includes('Macintosh')

// localStorage.clear();
let is_installed = window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : false;
let sheet = undefined;
let overview = undefined;
let csvHandle = new CsvHandle()

let launchFileOnInitDone = function () {
  window.launchQueue?.setConsumer(async (params) => {
    console.log(params)
    const [handle] = params.files;
    if (handle) csvHandle.launchFile(handle)
  });

  window.addEventListener('message', (event) => {
    // console.log(event)
    if (event.data && event.data.fileHandle) csvHandle.launchFile(event.data.fileHandle)
  });
}

let nanocell_cleanStart = function () {
  Setting.log()
  Setting.init();
  build_dom()
  buildCommands();
  buildMenu();
  buildKeys();
  sheet = new Sheet(new Dataframe(sampleData));
  Setting.runAll();
  launchFileOnInitDone();
}

window.addEventListener('DOMContentLoaded', () => {
  nanocell_cleanStart();
});
registerSW({ immediate: true });

export function setSheet(s) { sheet = s; }
export function getSheet() { return sheet; }
export { sampleData, isOSX, is_installed, sheet, overview, csvHandle, launchFileOnInitDone, nanocell_cleanStart };
