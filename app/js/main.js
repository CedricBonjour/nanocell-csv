import { getSheet, setCsvHandle, getCsvHandle } from './appContext.js';
import './ui/ContextMenu.js';
import { buildMenu } from './ui/MenuBar.js';
import { CsvHandle } from './io/CsvHandle.js';
import { Dataframe } from '../../core/model/Dataframe.js';
import { AppLayout } from './ui/AppLayout.js';
import { buildKeys } from './interaction/KeyboardRouter.js';
import { Setting } from './ui/settings/Setting.js';
import { Sheet } from './sheet/Sheet.js';
import './ui/CommandPalette.js';
import './ui/ValidationPane.js';
import './ui/AboutDialog.js';
import './ui/FinderDialog.js';
import { Notification } from './ui/Notification.js';
import './interaction/MouseRouter.js';
import { registerSW } from 'virtual:pwa-register';


//on window/tab close, prompts the user for confirmation if currentSheet is not saved
window.addEventListener('beforeunload', function (e) {
  const currentSheet = getSheet();
  if (currentSheet?.df && !currentSheet.df.isSaved) e.preventDefault();
});


let launchFileOnInitDone = function () {
  window.launchQueue?.setConsumer(async (params) => {
    const [handle] = params.files;
    if (handle) getCsvHandle()?.launchFile(handle);
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.fileHandle) getCsvHandle()?.launchFile(event.data.fileHandle);
  });
};

let nanocell_cleanStart = function () {
  setCsvHandle(new CsvHandle());
  Setting.init();
  AppLayout.init();
  buildMenu();
  buildKeys();
  new Sheet(new Dataframe([["Hello World"]]));
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

  return new Notification(message, {
    id: 3,
    type: hasUnsaved ? 'warning' : 'info',
    title: 'Update Available',
    okText: 'Reload',
    cancelText: 'Later',
    defaultFocus: hasUnsaved ? 'cancel' : 'ok',
    cbt: () => {
      const sheetNow = getSheet();
      if (sheetNow?.df && !sheetNow.df.isSaved) {
        Notification.warning("Please save your changes before reloading.", "Unsaved Changes");
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
