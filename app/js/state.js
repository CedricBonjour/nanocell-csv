/**
 * @file app/js/state.js
 * Unified application runtime context, persistent settings store (Setting / settings),
 * declarative environment detection, and PWA install state manager.
 */

import { VALIDATION_RULES, COMMA_REPLACEMENTS, DEFAULT_MACROS, setCommaReplacement } from '../core/DataValidator.js';

let activeSheet = null;
let activeCsvHandle = null;

export function getSheet() { return activeSheet; }
export function setSheet(sheet) { activeSheet = sheet; }
export function getCsvHandle() { return activeCsvHandle; }
export function setCsvHandle(handle) { activeCsvHandle = handle; }

// --- Persistent Settings Store ---

const settings = {};
if (typeof globalThis !== 'undefined') globalThis.settings = settings;

function cloneArrayValue(arr) {
  return arr.map(item =>
    item && typeof item === 'object'
      ? { ...item, ...(Array.isArray(item.steps) ? { steps: [...item.steps] } : {}) }
      : item
  );
}

function coerceSettingValue(val, defaultVal) {
  if (Array.isArray(defaultVal)) {
    const isObjectArray = defaultVal.length > 0 && typeof defaultVal[0] === 'object' && defaultVal[0] !== null;
    if (Array.isArray(val)) {
      return isObjectArray ? cloneArrayValue(val) : val.map(String);
    }
    if (typeof val === 'string' && val.trim()) {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          return isObjectArray ? cloneArrayValue(parsed) : parsed.map(String);
        }
      } catch {}
      if (!isObjectArray) return val.split(',').map(s => s.trim()).filter(Boolean);
    }
    return cloneArrayValue(defaultVal);
  }
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof defaultVal === 'number') return !isNaN(val) ? Number(val) : defaultVal;
  if (typeof defaultVal === 'boolean') return val === true || val === 'true';
  return val;
}

export class Setting {
  constructor(def) {
    let stored = null;
    try { stored = globalThis.localStorage?.getItem(def.key) ?? null; } catch {}

    this.key = def.key;
    this.onChange = def.onChange;
    this.value = stored !== null ? coerceSettingValue(stored, def.defaultValue) : (Array.isArray(def.defaultValue) ? cloneArrayValue(def.defaultValue) : def.defaultValue);

    Object.defineProperty(settings, this.key, {
      get: () => this.value,
      set: (value) => {
        this.value = coerceSettingValue(value, def.defaultValue);
        try {
          const serialized = Array.isArray(this.value) ? JSON.stringify(this.value) : this.value;
          globalThis.localStorage?.setItem(def.key, serialized);
        } catch {}
        this.onChange?.(this.value);
      },
      configurable: true
    });
  }

  static toggleActionBar() { settings.actionBar = settings.actionBar === false; }

  static init() {
    for (const def of Setting.list) {
      if (!def.title) new Setting(def);
    }
    setCommaReplacement(settings.commaReplacement);
    Setting.setTheme();
  }

  static setTheme(themeName) {
    const activeTheme = themeName || settings.theme || 'nord';
    const doc = globalThis.document;
    if (doc) {
      doc.documentElement?.setAttribute('data-theme', activeTheme);
      doc.body?.setAttribute('data-theme', activeTheme);
    }
  }

  static runAll() {
    for (const def of Setting.list) {
      if (def.key && typeof def.onChange === 'function') def.onChange(settings[def.key]);
    }
  }

  static resetDefault() {
    for (const def of Setting.list) {
      if (def.key) {
        settings[def.key] = Array.isArray(def.defaultValue) ? cloneArrayValue(def.defaultValue) : def.defaultValue;
      }
    }
  }
}

Setting.list = [
  { title: 'Appearance' },
  { key: 'theme', defaultValue: 'nord', name: 'Theme', list: ['nord', 'light', 'slate', 'dark', 'solarized', 'night', 'dracula'], onChange: Setting.setTheme },
  { key: 'font', defaultValue: 13, name: 'Font Size', min: 7, max: 24, onChange: (fontSize) => {
    globalThis.document?.body?.style?.setProperty('--app-font-size', `${fontSize}px`);
  } },
  { key: 'rows', defaultValue: 25, name: 'Rows', min: 10, max: 60, onChange: () => getSheet()?.reload?.() },
  { key: 'cols', defaultValue: 7, name: 'Cols', min: 3, max: 30, onChange: () => getSheet()?.reload?.() },
  { key: 'actionBar', defaultValue: true, name: 'Action Bar', onChange: (isVisible) => {
    const header = globalThis.document?.getElementById?.('header') || globalThis.document?.querySelector?.('header');
    header?.classList?.toggle('hidden', !isVisible);
    getSheet()?.refreshScrollbars?.();
  } },
  { key: 'highlightNonCompliant', defaultValue: true, name: 'Warning color on line return, comma and double quote values', onChange: () => getSheet()?.reload?.() },

  { title: 'Csv Save' },
  { key: 'encoding', defaultValue: 'utf-8', name: 'Encoding' },
  { key: 'delimiter', defaultValue: ',', name: 'Delimiter', list: [',', ';', 'TAB', '|'] },
  { key: 'fixedWidthSize', defaultValue: 0, name: 'Minimum column size', min: 0, max: 100 },
  { key: 'strictSave', defaultValue: false, name: 'Save-Strict (error on comma  or double quotes)' },

  { title: 'Csv Open' },
  { key: 'freezeHeaderOnOpen', defaultValue: true, name: 'Set headers' },
  { key: 'trim', defaultValue: false, name: 'Remove empty rows and columns' },
  { key: 'trimUnquoted', defaultValue: true, name: 'Trim unquoted whitespace' },

  { title: 'Csv View Only' },
  { key: 'editMaxFileSize', defaultValue: 10, name: 'Max editable file size (Mo)', min: 1, max: Infinity, stepMode: 'pow2' },
  { key: 'previewChunks', defaultValue: 8, name: 'Number of chunks loaded', min: 8, stepMode: 'pow2' },
  { key: 'previewRows', defaultValue: 8, name: 'Number of rows per chunk loaded', min: 8, stepMode: 'pow2' },

  { title: 'Sort' },
  { key: 'sortIgnoreHeader', defaultValue: true, name: 'Ignore 1st row (header row)' },
  { key: 'sortNumbersFirst', defaultValue: false, name: 'Numbers are sorted before text' },

  { title: 'Data Validation' },
  { key: 'commaReplacement', defaultValue: '-', name: 'Text comma replacement character', list: [...COMMA_REPLACEMENTS], onChange: (val) => {
    setCommaReplacement(val);
    globalThis.document?.querySelectorAll?.('ui-tags')?.forEach?.(el => el.render?.());
    const pane = globalThis.document?.getElementById?.('validation-pane') || globalThis.document?.querySelector?.('ui-validation-pane');
    pane?.refreshRules?.();
    const macroPane = globalThis.document?.getElementById?.('macro-pane') || globalThis.document?.querySelector?.('ui-macro-pane');
    macroPane?.refreshFromSettings?.();
  } },
  { key: 'pinnedValidations', defaultValue: [], name: 'Pinned validation rules', tags: VALIDATION_RULES.map(r => ({ value: r.id, get label() { return r.label; } })), onChange: () => {
    const pane = globalThis.document?.getElementById?.('validation-pane') || globalThis.document?.querySelector?.('ui-validation-pane');
    pane?.refreshRules?.();
    const macroPane = globalThis.document?.getElementById?.('macro-pane') || globalThis.document?.querySelector?.('ui-macro-pane');
    macroPane?.refreshFromSettings?.();
  } },
  { key: 'macros', defaultValue: DEFAULT_MACROS, hidden: true, onChange: () => {
    const macroPane = globalThis.document?.getElementById?.('macro-pane') || globalThis.document?.querySelector?.('ui-macro-pane');
    macroPane?.refreshFromSettings?.();
  } },
];

Setting.map = new Map(Setting.list.filter(def => def.key).map(def => [def.key, def]));
Setting.getDef = (key) => Setting.map.get(key);

export { settings };

// --- Declarative Environment Detection & PWA State Manager ---

export const PWA_INSTALLED_KEY = 'nanocell_pwa_installed';

const OS_MATCHERS = [
  ['ios', () => 'iOS', (ua, p, tp) => /iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod/i.test(p) || ((/Mac/i.test(p) || /Macintosh/i.test(ua)) && tp > 1)],
  ['android', () => 'Android', (ua, p) => /Android/i.test(ua) || /Android/i.test(p)],
  ['chromeos', () => 'ChromeOS', (ua, p) => /CrOS/i.test(ua) || /Chrome OS|CrOS/i.test(p)],
  ['windows', (ua) => /Windows NT 10\.0/i.test(ua) ? 'Windows 10/11' : 'Windows', (ua, p) => /Win/i.test(p) || /Windows/i.test(ua)],
  ['macos', () => 'macOS', (ua, p) => /Mac/i.test(p) || /Macintosh|Mac OS X/i.test(ua)],
  ['linux', () => 'Linux', (ua, p) => /Linux/i.test(p) || /Linux/i.test(ua)],
];

const BROWSER_MATCHERS = [
  [/(?:Firefox|FxiOS)\/([0-9.]+)/i, 'firefox', 'Firefox', () => false],
  [/Edg(?:e|A|iOS)?\/([0-9.]+)/i, 'edge', 'Microsoft Edge', (ua, os) => !/EdgiOS/i.test(ua) && os !== 'ios'],
  [/(?:OPR|Opera)\/([0-9.]+)/i, 'opera', 'Opera', (_ua, os) => os !== 'ios'],
  [/CriOS\/([0-9.]+)/i, 'chrome', 'Chrome', () => false],
];

const BRAND_MAP = [
  [/Edge/i, 'edge', 'Microsoft Edge'],
  [/Opera/i, 'opera', 'Opera'],
  [/Brave/i, 'chrome', 'Brave'],
  [/Vivaldi/i, 'chrome', 'Vivaldi'],
];

export function detectEnvironment(overrides = {}) {
  const win = overrides.window !== undefined ? overrides.window : (globalThis.window ?? null);
  const nav = overrides.navigator !== undefined ? overrides.navigator : (globalThis.navigator ?? null);
  const ua = typeof overrides.userAgent === 'string' ? overrides.userAgent : (nav?.userAgent || '');
  const uaData = overrides.userAgentData !== undefined ? overrides.userAgentData : nav?.userAgentData;
  const rawPlatform = typeof overrides.platform === 'string' ? overrides.platform : (uaData?.platform || nav?.platform || '');
  const touchPoints = typeof overrides.maxTouchPoints === 'number' ? overrides.maxTouchPoints : (nav?.maxTouchPoints || 0);

  const osEntry = OS_MATCHERS.find(([, , match]) => match(ua, rawPlatform, touchPoints));
  const os = osEntry ? osEntry[0] : 'unknown';
  const osLabel = osEntry ? osEntry[1](ua) : rawPlatform;

  const isMobile = os === 'ios' || os === 'android' || Boolean(uaData?.mobile) || /BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const isDesktop = !isMobile;
  const isMac = os === 'macos' || os === 'ios';

  let browser = 'unknown', browserName = 'Unknown Browser', browserVersion = '', isChromium = false;
  const chromeMatch = ua.match(/(?:Chrome|Chromium)\/([0-9.]+)/i);

  for (const [regex, id, name, chromiumFn] of BROWSER_MATCHERS) {
    const m = ua.match(regex);
    if (m) {
      browser = id; browserName = name; browserVersion = m[1]; isChromium = chromiumFn(ua, os);
      break;
    }
  }

  if (browser === 'unknown' && Array.isArray(uaData?.brands)) {
    const valid = uaData.brands.filter(b => b?.brand && !/Not.*Brand/i.test(b.brand));
    if (valid.length > 0) {
      const pref = valid.find(b => /Edge|Opera|Brave|Vivaldi|Chrome/i.test(b.brand)) || valid[0];
      const brandEntry = BRAND_MAP.find(([rx]) => rx.test(pref.brand));
      browser = brandEntry ? brandEntry[1] : 'chrome';
      browserName = brandEntry ? brandEntry[2] : (pref.brand === 'Google Chrome' ? 'Chrome' : pref.brand);
      browserVersion = pref.version || (chromeMatch ? chromeMatch[1] : '');
      isChromium = os !== 'ios';
    }
  }

  if (browser === 'unknown') {
    if (chromeMatch) {
      browser = 'chrome';
      browserName = /Chromium\//i.test(ua) && !/Chrome\//i.test(ua) ? 'Chromium' : 'Chrome';
      browserVersion = chromeMatch[1];
      isChromium = os !== 'ios';
    } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR|Android/i.test(ua)) {
      const verMatch = ua.match(/(?:Version|Safari)\/([0-9.]+)/i);
      browser = 'safari'; browserName = 'Safari'; browserVersion = verMatch ? verMatch[1] : '';
    }
  }

  const browserInfo = browser !== 'unknown'
    ? `${browserName}${browserVersion ? ` ${browserVersion}` : ''}${osLabel ? ` (${osLabel})` : ''}`.trim()
    : (ua || 'Unknown');

  const supportsFileSystemAccess = Boolean(win && typeof win.showOpenFilePicker === 'function' && typeof win.showSaveFilePicker === 'function');
  const supportsPwaInstall = Boolean(isDesktop && isChromium);

  return {
    os, osLabel, browser, browserName, browserVersion, browserInfo,
    userAgent: ua, isMobile, isDesktop, isMac, isChromium,
    supportsFileSystemAccess, supportsPwaInstall
  };
}

export const env = detectEnvironment();

export function formatShortcut(command) {
  if (!command?.key) return '';
  const [mod, shift, alt] = env.isMac ? ['⌘', '⇧', '⌥'] : ['Ctrl+', 'Shift+', 'Alt+'];
  return `${command.ctrl ? mod : ''}${command.alt ? alt : ''}${command.shift ? shift : ''}${command.key}`;
}

export function getNewIssueUrl(appVersion, customEnv = env) {
  const version = appVersion || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.1-dev');
  const body = `### Environment\n- **App Version:** \`${version}\`\n- **Browser / OS:** ${customEnv.browserInfo}\n- **User Agent:** \`${customEnv.userAgent}\`\n\n---\n\n### Description\n<!-- Please describe the issue or unexpected behavior below -->\n`;
  return `https://github.com/CedricBonjour/nanocell-csv/issues/new?body=${encodeURIComponent(body)}`;
}

export function createPwaManager(options = {}) {
  const win = options.window !== undefined ? options.window : (globalThis.window ?? null);
  const nav = options.navigator !== undefined ? options.navigator : (globalThis.navigator ?? null);
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = win?.localStorage || null; } catch { storage = null; }
  }
  const currentEnv = options.env || detectEnvironment({ window: win, navigator: nav });

  const readInstalled = () => { try { return storage?.getItem(PWA_INSTALLED_KEY) === 'true'; } catch { return false; } };
  const writeInstalled = (val) => {
    try {
      if (storage) val ? storage.setItem(PWA_INSTALLED_KEY, 'true') : storage.removeItem(PWA_INSTALLED_KEY);
    } catch {}
  };
  const checkStandalone = () => {
    try { return Boolean(win?.matchMedia?.('(display-mode: standalone)').matches || nav?.standalone === true); }
    catch { return false; }
  };

  let isStandalone = checkStandalone();
  let storageInstalled = readInstalled();
  let deferredPrompt = null;
  let authoritativeState = isStandalone ? 'installed' : 'unknown';

  if (isStandalone && !storageInstalled) {
    storageInstalled = true;
    writeInstalled(true);
  }

  const subscribers = new Set();

  function getState() {
    const isInstalled = isStandalone || authoritativeState === 'installed' || (authoritativeState === 'unknown' && storageInstalled);
    const status = isStandalone ? 'standalone'
      : isInstalled ? 'installed'
      : currentEnv.isMobile ? 'unsupported-mobile'
      : !currentEnv.supportsPwaInstall ? 'unsupported-browser'
      : deferredPrompt !== null ? 'installable-prompt' : 'installable-manual';
    const canInstall = status === 'installable-prompt' || status === 'installable-manual';
    return { status, isStandalone, isInstalled, canInstall, hasPrompt: status === 'installable-prompt', env: currentEnv };
  }

  let prev = getState();
  function notify() {
    const next = getState();
    if (next.status === prev.status && next.isStandalone === prev.isStandalone && next.isInstalled === prev.isInstalled && next.canInstall === prev.canInstall && next.hasPrompt === prev.hasPrompt) return;
    prev = next;
    for (const fn of subscribers) {
      try { fn(next); } catch (err) { console.error('PWA subscriber error:', err); }
    }
  }

  function setInstallState(installed, prompt = null) {
    deferredPrompt = prompt;
    authoritativeState = installed ? 'installed' : 'not-installed';
    storageInstalled = installed;
    writeInstalled(installed);
    notify();
  }

  const onBeforeInstallPrompt = (event) => {
    event?.preventDefault?.();
    setInstallState(false, event);
  };
  const onAppInstalled = () => setInstallState(true, null);
  const onStorage = (event) => {
    if (event?.key != null && event.key !== PWA_INSTALLED_KEY) return;
    const nextVal = event?.key === PWA_INSTALLED_KEY ? event.newValue === 'true' : readInstalled();
    storageInstalled = nextVal;
    if (nextVal) { authoritativeState = 'installed'; deferredPrompt = null; }
    else if (!isStandalone && deferredPrompt === null) authoritativeState = 'not-installed';
    notify();
  };
  const onDisplayModeChange = (event) => {
    isStandalone = Boolean(event?.matches || checkStandalone());
    if (isStandalone) setInstallState(true, deferredPrompt);
    else notify();
  };

  let mql = null;
  if (typeof win?.addEventListener === 'function') {
    win.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    win.addEventListener('appinstalled', onAppInstalled);
    win.addEventListener('storage', onStorage);
    try {
      mql = win.matchMedia?.('(display-mode: standalone)');
      mql?.addEventListener?.('change', onDisplayModeChange);
    } catch {}
  }

  async function checkRelatedApps() {
    if (isStandalone || typeof nav?.getInstalledRelatedApps !== 'function') return getState();
    try {
      const apps = await nav.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0 && authoritativeState !== 'not-installed') {
        setInstallState(true, deferredPrompt);
      }
    } catch {}
    return getState();
  }

  checkRelatedApps();

  function subscribe(listener, opts = { immediate: true }) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    if (opts?.immediate !== false) listener(getState());
    return () => subscribers.delete(listener);
  }

  async function promptInstall() {
    const current = getState();
    if (current.isStandalone || current.isInstalled) return 'already-installed';
    if (!current.canInstall) return 'unsupported';
    if (!deferredPrompt) return 'manual';

    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    notify();

    try {
      const res = typeof promptEvent.prompt === 'function' ? await promptEvent.prompt() : null;
      const outcome = typeof res?.outcome === 'string' ? res.outcome : (await promptEvent.userChoice)?.outcome;
      if (outcome === 'accepted') {
        setInstallState(true, null);
        return 'accepted';
      }
    } catch {}

    notify();
    return 'dismissed';
  }

  function destroy() {
    subscribers.clear();
    if (typeof win?.removeEventListener === 'function') {
      win.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      win.removeEventListener('appinstalled', onAppInstalled);
      win.removeEventListener('storage', onStorage);
    }
    mql?.removeEventListener?.('change', onDisplayModeChange);
  }

  return { getState, subscribe, promptInstall, checkRelatedApps, destroy };
}

export const pwa = createPwaManager({ env });
