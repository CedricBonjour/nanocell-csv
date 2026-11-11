import { Dataframe } from '../core/Dataframe.js';
import { getSheet, setCsvHandle, Setting, env, cleanupLegacyServiceWorkers } from './state.js';
import { AppLayout } from './AppLayout.js';
import { commands, buildKeys } from './Commands.js';
import { Sheet } from './Sheet.js';
import { CsvHandle } from './CsvHandle.js';
import { Notification, showBrowserCompatibilityNotice } from './Notification.js';
import './Dialogs.js';
import './SheetOverlays.js';
import './ValidationPane.js';
import { registerSW } from 'virtual:pwa-register';

const hasUnsavedChanges = () => !getSheet().df.isSaved;

window.addEventListener('beforeunload', (event) => {
  if (hasUnsavedChanges()) event.preventDefault();
});

function initApp() {
  const csvHandle = new CsvHandle({ createSheet: (df) => new Sheet(df) });
  setCsvHandle(csvHandle);
  Setting.init();
  AppLayout.init(commands);
  Setting.runAll();
  buildKeys();
  new Sheet(new Dataframe());
  csvHandle.initListeners();
  if (!env.supportsFileSystemAccess) {
    showBrowserCompatibilityNotice();
  }
}

// Module scripts run after the document is parsed, so the DOM is ready here.
initApp();

function promptServiceWorkerUpdate() {
  const hasUnsaved = hasUnsavedChanges();
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
      if (hasUnsavedChanges()) {
        Notification.warning('Please save your changes before reloading.', 'Unsaved Changes');
        return;
      }
      updateSW(true);
    }
  }).show();
}

cleanupLegacyServiceWorkers();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: promptServiceWorkerUpdate,
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
