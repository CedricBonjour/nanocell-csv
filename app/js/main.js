import { Dataframe } from '../core/Dataframe.js';
import { getSheet, setCsvHandle, Setting, env } from './state.js';
import { AppLayout, buildMenu } from './AppLayout.js';
import { commands, buildKeys } from './Commands.js';
import { Sheet } from './Sheet.js';
import { CsvHandle } from './CsvHandle.js';
import { Notification, showBrowserCompatibilityNotice } from './Notification.js';
import './Dialogs.js';
import './SheetOverlays.js';
import './ValidationPane.js';
import { registerSW } from 'virtual:pwa-register';

window.addEventListener('beforeunload', (event) => {
  const currentSheet = getSheet();
  if (currentSheet?.df && !currentSheet.df.isSaved) event.preventDefault();
});

export function initApp() {
  const csvHandle = new CsvHandle();
  setCsvHandle(csvHandle);
  Setting.init();
  AppLayout.init();
  Setting.runAll();
  buildMenu(commands);
  buildKeys();
  new Sheet(new Dataframe([['Hello World']]));
  csvHandle.initListeners();
  if (!env.supportsFileSystemAccess) {
    showBrowserCompatibilityNotice();
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => initApp(), { once: true });
  } else {
    initApp();
  }
}

export function handleSWUpdatePrompt(updateSWFn = updateSW) {
  const currentSheet = getSheet();
  const hasUnsaved = currentSheet?.df && !currentSheet.df.isSaved;
  const message = hasUnsaved
    ? 'A new update is available. You have unsaved changes. Please save your file before updating.'
    : 'A new update is available. Reload to update?';

  return new Notification(message, {
    mode: 'choice',
    type: hasUnsaved ? 'warning' : 'info',
    title: 'Update Available',
    okText: 'Reload',
    cancelText: 'Later',
    defaultFocus: hasUnsaved ? 'cancel' : 'ok',
    onConfirm: () => {
      const sheetNow = getSheet();
      if (sheetNow?.df && !sheetNow.df.isSaved) {
        Notification.warning('Please save your changes before reloading.', 'Unsaved Changes');
        return;
      }
      if (typeof updateSWFn === 'function') updateSWFn(true);
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
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 60 * 1000);
      window.addEventListener('focus', () => registration.update());
    }
  }
});
