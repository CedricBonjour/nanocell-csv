/**
 * Unified Environment (OS, Browser, Capabilities) and PWA Install State Manager.
 * Single source of truth for both web landing page and application shell.
 * Zero external or DOM WebComponent dependencies for headless testability.
 * @module utils/misc
 */

export const PWA_INSTALLED_KEY = 'nanocell_pwa_installed';

/**
 * Pure environment detector for OS, Browser, and platform capabilities.
 * @param {Object} [overrides={}] - Optional environment overrides for testing.
 * @returns {Object} Normalized environment descriptor.
 */
export function detectEnvironment(overrides = {}) {
  const win = overrides.window !== undefined ? overrides.window : (typeof window !== 'undefined' ? window : null);
  const nav = overrides.navigator !== undefined ? overrides.navigator : (typeof navigator !== 'undefined' ? navigator : null);
  const ua = typeof overrides.userAgent === 'string' ? overrides.userAgent : (nav?.userAgent || '');
  const uaData = overrides.userAgentData !== undefined ? overrides.userAgentData : nav?.userAgentData;
  const rawPlatform = typeof overrides.platform === 'string' ? overrides.platform : (uaData?.platform || nav?.platform || '');
  const touchPoints = typeof overrides.maxTouchPoints === 'number' ? overrides.maxTouchPoints : (nav?.maxTouchPoints || 0);

  // 1. OS Detection (Android before Linux; iPadOS desktop-class Safari before macOS)
  let os = 'unknown';
  let osLabel = '';

  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    /iPhone|iPad|iPod/i.test(rawPlatform) ||
    ((/Mac/i.test(rawPlatform) || /Macintosh/i.test(ua)) && touchPoints > 1)
  ) {
    os = 'ios';
    osLabel = 'iOS';
  } else if (/Android/i.test(ua) || /Android/i.test(rawPlatform)) {
    os = 'android';
    osLabel = 'Android';
  } else if (/CrOS/i.test(ua) || /Chrome OS|CrOS/i.test(rawPlatform)) {
    os = 'chromeos';
    osLabel = 'ChromeOS';
  } else if (/Win/i.test(rawPlatform) || /Windows/i.test(ua)) {
    os = 'windows';
    osLabel = /Windows NT 10\.0/i.test(ua) ? 'Windows 10/11' : 'Windows';
  } else if (/Mac/i.test(rawPlatform) || /Macintosh|Mac OS X/i.test(ua)) {
    os = 'macos';
    osLabel = 'macOS';
  } else if (/Linux/i.test(rawPlatform) || /Linux/i.test(ua)) {
    os = 'linux';
    osLabel = 'Linux';
  } else if (rawPlatform) {
    osLabel = rawPlatform;
  }

  const isMobile =
    os === 'ios' ||
    os === 'android' ||
    Boolean(uaData?.mobile) ||
    /BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const isDesktop = !isMobile;
  const isMac = os === 'macos' || os === 'ios';

  // 2. Browser Detection (Firefox, Edge, and Opera tested before generic Chrome/Safari)
  let browser = 'unknown';
  let browserName = 'Unknown Browser';
  let browserVersion = '';
  let isChromium = false;

  const ffMatch = ua.match(/(?:Firefox|FxiOS)\/([0-9.]+)/i);
  const edgeMatch = ua.match(/Edg(?:e|A|iOS)?\/([0-9.]+)/i);
  const operaMatch = ua.match(/(?:OPR|Opera)\/([0-9.]+)/i);
  const criosMatch = ua.match(/CriOS\/([0-9.]+)/i);
  const chromeMatch = ua.match(/(?:Chrome|Chromium)\/([0-9.]+)/i);

  if (ffMatch) {
    browser = 'firefox';
    browserName = 'Firefox';
    browserVersion = ffMatch[1];
    isChromium = false;
  } else if (edgeMatch) {
    browser = 'edge';
    browserName = 'Microsoft Edge';
    browserVersion = edgeMatch[1];
    isChromium = !/EdgiOS/i.test(ua) && os !== 'ios';
  } else if (operaMatch) {
    browser = 'opera';
    browserName = 'Opera';
    browserVersion = operaMatch[1];
    isChromium = os !== 'ios';
  } else if (criosMatch) {
    browser = 'chrome';
    browserName = 'Chrome';
    browserVersion = criosMatch[1];
    isChromium = false;
  } else if (uaData && Array.isArray(uaData.brands)) {
    const validBrands = uaData.brands.filter(b => b && b.brand && !/Not.*Brand/i.test(b.brand));
    if (validBrands.length > 0) {
      const preferred =
        validBrands.find(b => /Edge|Opera|Brave|Vivaldi|Chrome/i.test(b.brand)) ||
        validBrands[0];
      const bName = preferred.brand;
      browserVersion = preferred.version || (chromeMatch ? chromeMatch[1] : '');
      isChromium = os !== 'ios';
      if (/Edge/i.test(bName)) {
        browser = 'edge';
        browserName = 'Microsoft Edge';
      } else if (/Opera/i.test(bName)) {
        browser = 'opera';
        browserName = 'Opera';
      } else if (/Brave/i.test(bName)) {
        browser = 'chrome';
        browserName = 'Brave';
      } else if (/Vivaldi/i.test(bName)) {
        browser = 'chrome';
        browserName = 'Vivaldi';
      } else {
        browser = 'chrome';
        browserName = bName === 'Google Chrome' ? 'Chrome' : bName;
      }
    }
  }

  if (browser === 'unknown') {
    if (chromeMatch) {
      browser = 'chrome';
      browserName = /Chromium\//i.test(ua) && !/Chrome\//i.test(ua) ? 'Chromium' : 'Chrome';
      browserVersion = chromeMatch[1];
      isChromium = os !== 'ios';
    } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR|Android/i.test(ua)) {
      const verMatch = ua.match(/Version\/([0-9.]+)/i) || ua.match(/Safari\/([0-9.]+)/i);
      browser = 'safari';
      browserName = 'Safari';
      browserVersion = verMatch ? verMatch[1] : '';
      isChromium = false;
    }
  }

  const browserInfo =
    browser !== 'unknown'
      ? `${browserName}${browserVersion ? ` ${browserVersion}` : ''}${osLabel ? ` (${osLabel})` : ''}`.trim()
      : (ua || 'Unknown');

  // 3. Platform Capabilities
  const supportsFileSystemAccess = Boolean(
    win &&
    typeof win.showOpenFilePicker === 'function' &&
    typeof win.showSaveFilePicker === 'function'
  );
  const supportsPwaInstall = Boolean(isDesktop && isChromium);

  return {
    os,
    osLabel,
    browser,
    browserName,
    browserVersion,
    browserInfo,
    userAgent: ua,
    isMobile,
    isDesktop,
    isMac,
    isChromium,
    supportsFileSystemAccess,
    supportsPwaInstall
  };
}

/** Singleton environment descriptor for the active runtime. */
export const env = detectEnvironment();

/**
 * Builds a GitHub "New Issue" URL prefilled with app version and browser environment.
 * @param {string} [appVersion]
 * @param {Object} [customEnv=env]
 * @returns {string}
 */
export function getNewIssueUrl(appVersion, customEnv = env) {
  const version = appVersion || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.1-dev');
  const body = `### Environment
- **App Version:** \`${version}\`
- **Browser / OS:** ${customEnv.browserInfo}
- **User Agent:** \`${customEnv.userAgent}\`

---

### Description
<!-- Please describe the issue or unexpected behavior below -->
`;

  return `https://github.com/CedricBonjour/nanocell-csv/issues/new?body=${encodeURIComponent(body)}`;
}

/**
 * Creates a deterministic, reactive PWA install state manager.
 * @param {Object} [options={}]
 * @returns {Object} PWA state manager instance.
 */
export function createPwaManager(options = {}) {
  const win = options.window !== undefined ? options.window : (typeof window !== 'undefined' ? window : null);
  const nav = options.navigator !== undefined ? options.navigator : (typeof navigator !== 'undefined' ? navigator : null);
  let storage = options.storage;
  if (storage === undefined) {
    try {
      storage = win && win.localStorage ? win.localStorage : null;
    } catch {
      storage = null;
    }
  }
  const currentEnv = options.env || detectEnvironment({ window: win, navigator: nav });

  function readStorageInstalled() {
    try {
      return storage?.getItem(PWA_INSTALLED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function writeStorageInstalled(installed) {
    try {
      if (!storage) return;
      if (installed) {
        storage.setItem(PWA_INSTALLED_KEY, 'true');
      } else {
        storage.removeItem(PWA_INSTALLED_KEY);
      }
    } catch {}
  }

  function checkStandalone() {
    try {
      return Boolean(
        (win && typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) ||
        nav?.standalone === true
      );
    } catch {
      return false;
    }
  }

  let isStandalone = checkStandalone();
  let storageInstalled = readStorageInstalled();
  let deferredPrompt = null;
  /** @type {'unknown' | 'installed' | 'not-installed'} */
  let authoritativeState = isStandalone ? 'installed' : 'unknown';

  if (isStandalone && !storageInstalled) {
    storageInstalled = true;
    writeStorageInstalled(true);
  }

  const subscribers = new Set();

  function getState() {
    const isInstalled =
      isStandalone ||
      authoritativeState === 'installed' ||
      (authoritativeState === 'unknown' && storageInstalled);

    let status;
    if (isStandalone) {
      status = 'standalone';
    } else if (isInstalled) {
      status = 'installed';
    } else if (currentEnv.isMobile) {
      status = 'unsupported-mobile';
    } else if (!currentEnv.supportsPwaInstall) {
      status = 'unsupported-browser';
    } else if (deferredPrompt !== null) {
      status = 'installable-prompt';
    } else {
      status = 'installable-manual';
    }

    const canInstall = status === 'installable-prompt' || status === 'installable-manual';

    return {
      status,
      isStandalone,
      isInstalled,
      canInstall,
      hasPrompt: status === 'installable-prompt',
      env: currentEnv
    };
  }

  let prevSnapshot = getState();

  function notify() {
    const next = getState();
    if (
      next.status === prevSnapshot.status &&
      next.isStandalone === prevSnapshot.isStandalone &&
      next.isInstalled === prevSnapshot.isInstalled &&
      next.canInstall === prevSnapshot.canInstall &&
      next.hasPrompt === prevSnapshot.hasPrompt
    ) {
      return;
    }
    prevSnapshot = next;
    for (const listener of subscribers) {
      try {
        listener(next);
      } catch (err) {
        console.error('PWA subscriber error:', err);
      }
    }
  }

  const onBeforeInstallPrompt = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    deferredPrompt = e;
    authoritativeState = 'not-installed';
    storageInstalled = false;
    writeStorageInstalled(false);
    notify();
  };

  const onAppInstalled = () => {
    deferredPrompt = null;
    authoritativeState = 'installed';
    storageInstalled = true;
    writeStorageInstalled(true);
    notify();
  };

  const onStorage = (e) => {
    if (e && e.key !== null && e.key !== undefined && e.key !== PWA_INSTALLED_KEY) return;
    const nextVal = (e && e.key === PWA_INSTALLED_KEY) ? e.newValue === 'true' : readStorageInstalled();
    storageInstalled = nextVal;
    if (nextVal) {
      authoritativeState = 'installed';
      deferredPrompt = null;
    } else if (!isStandalone && deferredPrompt === null) {
      authoritativeState = 'not-installed';
    }
    notify();
  };

  const onDisplayModeChange = (e) => {
    isStandalone = Boolean((e && e.matches) || checkStandalone());
    if (isStandalone) {
      authoritativeState = 'installed';
      storageInstalled = true;
      writeStorageInstalled(true);
    }
    notify();
  };

  let mql = null;
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    win.addEventListener('appinstalled', onAppInstalled);
    win.addEventListener('storage', onStorage);
    if (typeof win.matchMedia === 'function') {
      try {
        mql = win.matchMedia('(display-mode: standalone)');
        if (mql && typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', onDisplayModeChange);
        }
      } catch {}
    }
  }

  async function checkRelatedApps() {
    if (isStandalone || typeof nav?.getInstalledRelatedApps !== 'function') {
      return getState();
    }
    try {
      const apps = await nav.getInstalledRelatedApps();
      // Only positive matches are authoritative; empty arrays on desktop do NOT mean uninstalled.
      if (Array.isArray(apps) && apps.length > 0 && authoritativeState !== 'not-installed') {
        authoritativeState = 'installed';
        storageInstalled = true;
        writeStorageInstalled(true);
        notify();
      }
    } catch {}
    return getState();
  }

  // Trigger initial non-destructive check
  checkRelatedApps();

  /**
   * Subscribes to PWA state changes. Invokes listener immediately with current state by default.
   * @param {Function} listener
   * @param {Object} [opts={ immediate: true }]
   * @returns {Function} Unsubscribe callback.
   */
  function subscribe(listener, opts = { immediate: true }) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    if (opts?.immediate !== false) {
      listener(getState());
    }
    return () => {
      subscribers.delete(listener);
    };
  }

  /**
   * Triggers the installation flow and returns the outcome.
   * @returns {Promise<'accepted' | 'dismissed' | 'already-installed' | 'manual' | 'unsupported'>}
   */
  async function promptInstall() {
    const current = getState();
    if (current.isStandalone || current.isInstalled) {
      return 'already-installed';
    }
    if (!current.canInstall) {
      return 'unsupported';
    }
    if (!deferredPrompt) {
      return 'manual';
    }

    // Consume prompt immediately to prevent InvalidStateError on repeated calls
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    notify();

    try {
      const promptRes = typeof promptEvent.prompt === 'function' ? await promptEvent.prompt() : null;
      let outcome = promptRes && typeof promptRes.outcome === 'string' ? promptRes.outcome : null;
      if (!outcome && promptEvent.userChoice) {
        const choice = await promptEvent.userChoice;
        outcome = choice?.outcome || null;
      }
      if (outcome === 'accepted') {
        authoritativeState = 'installed';
        storageInstalled = true;
        writeStorageInstalled(true);
        notify();
        return 'accepted';
      }
    } catch {}

    notify();
    return 'dismissed';
  }

  function destroy() {
    subscribers.clear();
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      win.removeEventListener('appinstalled', onAppInstalled);
      win.removeEventListener('storage', onStorage);
    }
    if (mql && typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', onDisplayModeChange);
    }
  }

  return {
    getState,
    subscribe,
    promptInstall,
    checkRelatedApps,
    destroy
  };
}

/** Singleton PWA state manager for the active runtime. */
export const pwa = createPwaManager({ env });
