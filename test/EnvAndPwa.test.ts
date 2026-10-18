import assert from 'node:assert';
import {
  PWA_INSTALLED_KEY,
  detectEnvironment,
  getNewIssueUrl,
  createPwaManager
} from '../app/js/state.js';

function createMockEnvContext(options: {
  standalone?: boolean;
  storedInstalled?: boolean;
  relatedApps?: any[] | (() => Promise<any[]>);
  envOverrides?: Record<string, any>;
} = {}) {
  const listeners = new Map<string, Set<Function>>();
  const mqlListeners = new Set<Function>();
  let isStandalone = Boolean(options.standalone);
  const store = new Map<string, string>();
  if (options.storedInstalled) {
    store.set(PWA_INSTALLED_KEY, 'true');
  }

  const mockStorage = {
    getItem(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
    removeItem(k: string) {
      store.delete(k);
    }
  };

  const mockWindow: any = {
    addEventListener(type: string, fn: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(type: string, event: any = {}) {
      for (const fn of listeners.get(type) || []) {
        fn(event);
      }
    },
    matchMedia(query: string) {
      return {
        media: query,
        get matches() {
          return isStandalone;
        },
        addEventListener(type: string, fn: Function) {
          if (type === 'change') mqlListeners.add(fn);
        },
        removeEventListener(type: string, fn: Function) {
          if (type === 'change') mqlListeners.delete(fn);
        }
      };
    },
    setStandalone(val: boolean) {
      isStandalone = val;
      for (const fn of mqlListeners) {
        fn({ matches: val });
      }
    }
  };

  const mockNavigator: any = {
    userAgent:
      options.envOverrides?.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: options.envOverrides?.platform ?? 'Win32',
    maxTouchPoints: options.envOverrides?.maxTouchPoints ?? 0
  };

  if (options.relatedApps !== undefined) {
    mockNavigator.getInstalledRelatedApps =
      typeof options.relatedApps === 'function'
        ? options.relatedApps
        : async () => options.relatedApps;
  }

  const env = detectEnvironment({
    window: mockWindow,
    navigator: mockNavigator,
    ...options.envOverrides
  });

  const manager = createPwaManager({
    window: mockWindow,
    navigator: mockNavigator,
    storage: mockStorage,
    env
  });

  return { manager, mockWindow, mockStorage, env };
}

export async function runEnvAndPwaTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(err);
    }
  }

  console.log('\n--- Running Environment & PWA State Manager Test Suite ---');

  await test('Detects Windows 10/11 + Chrome and capabilities accurately', () => {
    const res = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      platform: 'Win32',
      window: { showOpenFilePicker() {}, showSaveFilePicker() {} }
    });
    assert.strictEqual(res.os, 'windows');
    assert.strictEqual(res.osLabel, 'Windows 10/11');
    assert.strictEqual(res.browser, 'chrome');
    assert.strictEqual(res.browserName, 'Chrome');
    assert.strictEqual(res.browserVersion, '126.0.0.0');
    assert.strictEqual(res.isDesktop, true);
    assert.strictEqual(res.isMobile, false);
    assert.strictEqual(res.isMac, false);
    assert.strictEqual(res.isChromium, true);
    assert.strictEqual(res.supportsFileSystemAccess, true);
    assert.strictEqual(res.supportsPwaInstall, true);
  });

  await test('Detects Android before Linux (fixes Android misclassified as Linux)', () => {
    const res = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
      platform: 'Linux armv81'
    });
    assert.strictEqual(res.os, 'android');
    assert.strictEqual(res.osLabel, 'Android');
    assert.strictEqual(res.isMobile, true);
    assert.strictEqual(res.isDesktop, false);
    assert.strictEqual(res.supportsPwaInstall, false);
  });

  await test('Detects Opera before Chrome (fixes Opera misclassified as Chrome)', () => {
    const res = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
      platform: 'Win32'
    });
    assert.strictEqual(res.browser, 'opera');
    assert.strictEqual(res.browserName, 'Opera');
    assert.strictEqual(res.browserVersion, '111.0.0.0');
    assert.strictEqual(res.isChromium, true);
    assert.strictEqual(res.supportsPwaInstall, true);
  });

  await test('Detects iPadOS desktop-class Safari (Macintosh + maxTouchPoints > 1) as iOS Mobile', () => {
    const res = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5
    });
    assert.strictEqual(res.os, 'ios');
    assert.strictEqual(res.isMobile, true);
    assert.strictEqual(res.isDesktop, false);
    assert.strictEqual(res.isMac, true);
    assert.strictEqual(res.browser, 'safari');
    assert.strictEqual(res.supportsPwaInstall, false);
  });

  await test('Detects macOS Safari and Firefox on Linux as unsupported for PWA install', () => {
    const macSafari = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0
    });
    assert.strictEqual(macSafari.os, 'macos');
    assert.strictEqual(macSafari.isMac, true);
    assert.strictEqual(macSafari.isDesktop, true);
    assert.strictEqual(macSafari.browser, 'safari');
    assert.strictEqual(macSafari.browserVersion, '17.5');
    assert.strictEqual(macSafari.isChromium, false);
    assert.strictEqual(macSafari.supportsPwaInstall, false);

    const linuxFirefox = detectEnvironment({
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
      platform: 'Linux x86_64'
    });
    assert.strictEqual(linuxFirefox.os, 'linux');
    assert.strictEqual(linuxFirefox.browser, 'firefox');
    assert.strictEqual(linuxFirefox.isChromium, false);
    assert.strictEqual(linuxFirefox.supportsPwaInstall, false);
  });

  await test('Detects Chrome on iOS (CriOS) as non-Chromium mobile', () => {
    const crios = detectEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
      platform: 'iPhone'
    });
    assert.strictEqual(crios.os, 'ios');
    assert.strictEqual(crios.browser, 'chrome');
    assert.strictEqual(crios.isMobile, true);
    assert.strictEqual(crios.isChromium, false);
    assert.strictEqual(crios.supportsPwaInstall, false);
  });

  await test('Detects Chromium brand from userAgentData.brands (e.g. Brave / Edge)', () => {
    const brave = detectEnvironment({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
      userAgentData: {
        platform: 'Windows',
        mobile: false,
        brands: [
          { brand: 'Not/A)Brand', version: '8' },
          { brand: 'Chromium', version: '126' },
          { brand: 'Brave', version: '126' }
        ]
      }
    });
    assert.strictEqual(brave.browserName, 'Brave');
    assert.strictEqual(brave.isChromium, true);
    assert.strictEqual(brave.supportsPwaInstall, true);
  });

  await test('Builds prefilled GitHub new issue URL with environment details', () => {
    const envObj = detectEnvironment({
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/125.0.0.0',
      platform: 'Linux x86_64'
    });
    assert.strictEqual(envObj.os, 'chromeos');
    const url = getNewIssueUrl('v1.2.3-test', envObj);
    assert.ok(url.startsWith('https://github.com/CedricBonjour/nanocell-csv/issues/new?body='));
    const decoded = decodeURIComponent(url.split('body=')[1]);
    assert.ok(decoded.includes('v1.2.3-test'));
    assert.ok(decoded.includes('Chrome 125.0.0.0 (ChromeOS)'));
  });

  await test('PWA State: Initial synchronous states across environments', () => {
    const standaloneCtx = createMockEnvContext({ standalone: true });
    assert.strictEqual(standaloneCtx.manager.getState().status, 'standalone');
    assert.strictEqual(standaloneCtx.manager.getState().canInstall, false);
    assert.strictEqual(standaloneCtx.mockStorage.getItem(PWA_INSTALLED_KEY), 'true');

    const installedCtx = createMockEnvContext({ storedInstalled: true });
    assert.strictEqual(installedCtx.manager.getState().status, 'installed');
    assert.strictEqual(installedCtx.manager.getState().canInstall, false);

    const desktopChromeCtx = createMockEnvContext();
    assert.strictEqual(desktopChromeCtx.manager.getState().status, 'installable-manual');
    assert.strictEqual(desktopChromeCtx.manager.getState().canInstall, true);
    assert.strictEqual(desktopChromeCtx.manager.getState().hasPrompt, false);

    const mobileCtx = createMockEnvContext({
      envOverrides: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv81'
      }
    });
    assert.strictEqual(mobileCtx.manager.getState().status, 'unsupported-mobile');
    assert.strictEqual(mobileCtx.manager.getState().canInstall, false);

    const firefoxCtx = createMockEnvContext({
      envOverrides: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
        platform: 'Win32'
      }
    });
    assert.strictEqual(firefoxCtx.manager.getState().status, 'unsupported-browser');
    assert.strictEqual(firefoxCtx.manager.getState().canInstall, false);
  });

  await test('Race Condition #1: Stale localStorage is cleared when beforeinstallprompt fires', () => {
    const { manager, mockWindow, mockStorage } = createMockEnvContext({ storedInstalled: true });
    const observed: string[] = [];
    manager.subscribe((state: any) => observed.push(state.status));

    // Initially 'installed' from localStorage
    assert.strictEqual(observed[0], 'installed');

    // Browser fires beforeinstallprompt because user had uninstalled the app
    let prevented = false;
    mockWindow.dispatchEvent('beforeinstallprompt', {
      preventDefault() {
        prevented = true;
      },
      prompt: async () => ({ outcome: 'accepted' })
    });

    assert.strictEqual(prevented, true);
    assert.strictEqual(mockStorage.getItem(PWA_INSTALLED_KEY), null);
    assert.strictEqual(manager.getState().status, 'installable-prompt');
    assert.strictEqual(manager.getState().canInstall, true);
    assert.strictEqual(manager.getState().hasPrompt, true);
    assert.deepStrictEqual(observed, ['installed', 'installable-prompt']);
  });

  await test('Race Condition #2: getInstalledRelatedApps() returning [] does NOT wipe localStorage', async () => {
    const { manager, mockStorage } = createMockEnvContext({
      storedInstalled: true,
      relatedApps: []
    });

    await manager.checkRelatedApps();
    assert.strictEqual(mockStorage.getItem(PWA_INSTALLED_KEY), 'true');
    assert.strictEqual(manager.getState().status, 'installed');
  });

  await test('Race Condition #3: beforeinstallprompt authoritative state wins over in-flight getInstalledRelatedApps()', async () => {
    let resolveRelated!: (apps: any[]) => void;
    const relatedPromise = new Promise<any[]>((r) => {
      resolveRelated = r;
    });

    const { manager, mockWindow } = createMockEnvContext({
      relatedApps: () => relatedPromise
    });

    // beforeinstallprompt arrives first, proving app is NOT installed
    mockWindow.dispatchEvent('beforeinstallprompt', {
      preventDefault() {},
      prompt: async () => ({ outcome: 'dismissed' })
    });
    assert.strictEqual(manager.getState().status, 'installable-prompt');

    // Stale getInstalledRelatedApps resolves afterwards
    resolveRelated([{ platform: 'webapp', url: '/manifest.webmanifest' }]);
    await relatedPromise;
    await new Promise((r) => setTimeout(r, 0));

    // Authoritative 'not-installed' from beforeinstallprompt must not be overwritten
    assert.strictEqual(manager.getState().status, 'installable-prompt');
  });

  await test('Prompt Lifecycle: Dismissed prompt is consumed once and does not throw on second click', async () => {
    const { manager, mockWindow } = createMockEnvContext();
    let promptCalls = 0;

    mockWindow.dispatchEvent('beforeinstallprompt', {
      preventDefault() {},
      async prompt() {
        promptCalls++;
        if (promptCalls > 1) {
          throw new Error('InvalidStateError: The prompt() method may only be called once');
        }
        return { outcome: 'dismissed' };
      }
    });

    assert.strictEqual(manager.getState().status, 'installable-prompt');

    const firstOutcome = await manager.promptInstall();
    assert.strictEqual(firstOutcome, 'dismissed');
    assert.strictEqual(promptCalls, 1);
    assert.strictEqual(manager.getState().status, 'installable-manual');
    assert.strictEqual(manager.getState().hasPrompt, false);
    assert.strictEqual(manager.getState().canInstall, true);

    // Second click must fall back cleanly to 'manual' without calling consumed promptEvent.prompt()
    const secondOutcome = await manager.promptInstall();
    assert.strictEqual(secondOutcome, 'manual');
    assert.strictEqual(promptCalls, 1);
  });

  await test('Prompt Lifecycle: Accepted prompt marks app as installed and persists to storage', async () => {
    const { manager, mockWindow, mockStorage } = createMockEnvContext();

    mockWindow.dispatchEvent('beforeinstallprompt', {
      preventDefault() {},
      async prompt() {
        return { outcome: 'accepted' };
      }
    });

    const outcome = await manager.promptInstall();
    assert.strictEqual(outcome, 'accepted');
    assert.strictEqual(manager.getState().status, 'installed');
    assert.strictEqual(manager.getState().isInstalled, true);
    assert.strictEqual(manager.getState().canInstall, false);
    assert.strictEqual(mockStorage.getItem(PWA_INSTALLED_KEY), 'true');

    // Subsequent promptInstall call returns 'already-installed'
    assert.strictEqual(await manager.promptInstall(), 'already-installed');
  });

  await test('Cross-tab storage event and display-mode standalone media query sync live', () => {
    const { manager, mockWindow } = createMockEnvContext();
    const statuses: string[] = [];
    manager.subscribe((s: any) => statuses.push(s.status));

    assert.strictEqual(manager.getState().status, 'installable-manual');

    // Another tab installs the app and writes localStorage
    mockWindow.dispatchEvent('storage', {
      key: PWA_INSTALLED_KEY,
      newValue: 'true'
    });
    assert.strictEqual(manager.getState().status, 'installed');

    // Another tab clears the flag
    mockWindow.dispatchEvent('storage', {
      key: PWA_INSTALLED_KEY,
      newValue: null
    });
    assert.strictEqual(manager.getState().status, 'installable-manual');

    // Window transitions into standalone display mode
    mockWindow.setStandalone(true);
    assert.strictEqual(manager.getState().status, 'standalone');

    assert.deepStrictEqual(statuses, [
      'installable-manual',
      'installed',
      'installable-manual',
      'standalone'
    ]);
  });

  return { passed, failed };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runEnvAndPwaTests().then((result) => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
