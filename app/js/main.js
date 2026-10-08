import { StateManager } from './StateManager.js';
import './ui/ContextMenu.js';
import { buildCommands } from './interaction/CommandRegistry.js';
import { buildMenu } from './ui/MenuBar.js';
import { CsvHandle } from './io/CsvHandle.js';
import { Dataframe } from '../../core/model/Dataframe.js';
import { build_dom } from './utils/dom.js';
import { buildKeys } from './interaction/KeyboardRouter.js';
import { Setting } from './ui/settings/Setting.js';
import { Sheet } from './sheet/Sheet.js';
import './ui/controls/BoolInput.js';
import './ui/controls/ListInput.js';
import './ui/controls/NumInput.js';
import './ui/controls/Scroller.js';
import './ui/controls/Table.js';
import './ui/CommandPalette.js';
import './ui/ValidationPane.js';
import './ui/AboutDialog.js';
import './ui/FinderDialog.js';
import { Notification as Msg } from './ui/Notification.js';
import './interaction/MouseRouter.js';

import { registerSW } from 'virtual:pwa-register';

window.addEventListener('beforeunload', function (e) {
  const currentSheet = getSheet();
  if (currentSheet?.df && !currentSheet.df.isSaved) e.preventDefault();
});

let sampleData = [
  ["Hello World", ""]
];

let sheet = undefined;
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
export function handleSWUpdatePrompt(updateSWFn = updateSW) {
  const currentSheet = getSheet();
  const hasUnsaved = currentSheet?.df && !currentSheet.df.isSaved;
  const message = hasUnsaved
    ? "A new update is available. You have unsaved changes. Please save your file before updating."
    : "A new update is available. Reload to update?";

  return new Msg(message, {
    id: 3,
    type: hasUnsaved ? 'warning' : 'info',
    title: 'Update Available',
    okText: 'Reload',
    cancelText: 'Later',
    defaultFocus: hasUnsaved ? 'cancel' : 'ok',
    cbt: () => {
      const sheetNow = getSheet();
      if (sheetNow?.df && !sheetNow.df.isSaved) {
        Msg.warning("Please save your changes before reloading.", "Unsaved Changes");
        return;
      }
      if (typeof updateSWFn === 'function') {
        updateSWFn(true);
      }
    }
  }).show();
}

export const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    handleSWUpdatePrompt(updateSW);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 60 * 1000);
      window.addEventListener('focus', () => registration.update());
    }
  }
});

export function setSheet(s) {
  sheet = s;
  StateManager.setActiveSheet(s);
}

export function getSheet() {
  return StateManager.getState('sheet') || sheet;
}

export { sampleData, sheet, csvHandle, launchFileOnInitDone, nanocell_cleanStart };

