import { StateManager } from './StateManager.js';
import './CMenu.js';
import { buildCommands, buildMenu } from './cmd.js';
import { CsvHandle } from './CsvHandle.js';
import { Dataframe } from './Dataframe.js';
import { build_dom } from './dom.js';
import { buildKeys } from './key.js';
import { Setting } from './Setting.js';
import { Sheet } from './Sheet.js';
import './ui/input/BoolInput.js';
import './ui/input/ListInput.js';
import './ui/input/NumInput.js';
import './ui/input/Scroller.js';
import './ui/input/Table.js';
import './ui/CommandPalette.js';
import './About.js';
import './Finder.js';
import './Msg.js';
import './Shortcuts.js';

import { registerSW } from 'virtual:pwa-register';

window.addEventListener('beforeunload', function (e) {
  const currentSheet = getSheet();
  if (currentSheet?.df && !currentSheet.df.isSaved) e.preventDefault();
});

let sampleData = [
  ["Hello World", ""]
];

let isOSX = navigator.userAgent.includes('Macintosh');
let is_installed = window.matchMedia ? window.matchMedia('(display-mode: standalone)').matches : false;
let sheet = undefined;
let overview = undefined;
let csvHandle = new CsvHandle();
StateManager.setState('csvHandle', csvHandle);

let launchFileOnInitDone = function () {
  window.launchQueue?.setConsumer(async (params) => {
    console.log(params);
    const [handle] = params.files;
    if (handle) csvHandle.launchFile(handle);
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.fileHandle) csvHandle.launchFile(event.data.fileHandle);
  });
};

let nanocell_cleanStart = function () {
  csvHandle = new CsvHandle();
  StateManager.setState('csvHandle', csvHandle);
  Setting.log();
  Setting.init();
  build_dom();
  buildCommands();
  buildMenu();
  buildKeys();
  const newSheet = new Sheet(new Dataframe(sampleData));
  setSheet(newSheet);
  Setting.runAll();
  launchFileOnInitDone();
};

window.addEventListener('DOMContentLoaded', () => {
  nanocell_cleanStart();
});
registerSW({ immediate: true });

export function setSheet(s) {
  sheet = s;
  StateManager.setState('sheet', s);
  StateManager.setState('activeSheet', s);
  if (s) {
    StateManager.setState('dataframe', s.df);
    StateManager.setState('activeDataframe', s.df);
  }
}

export function getSheet() {
  return StateManager.getState('sheet') || sheet;
}

export { sampleData, isOSX, is_installed, sheet, overview, csvHandle, launchFileOnInitDone, nanocell_cleanStart };

