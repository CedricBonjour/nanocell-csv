/**
 * General helper utilities for Nanocell CSV application.
 * @module utils/misc
 */
import { isUrl } from '../../../core/model/Cell.js';
import { isIsoDate } from '../../../core/utils/date.js';
import { Notification } from '../ui/Notification.js';

/** Canonical URL validator re-exported from core/model/Cell.js */
export const isValidUrl = isUrl;

/** Canonical ISO date validator re-exported from core/utils/date.js */
export { isIsoDate };

/**
 * Detects browser model, version, and operating system.
 * @returns {string}
 */
export function getBrowserInfo() {
  if (typeof navigator === 'undefined') return 'Unknown';

  if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
    const brands = navigator.userAgentData.brands
      .filter(b => !b.brand.includes('Not') && !b.brand.includes('Brand'))
      .map(b => `${b.brand} ${b.version}`)
      .join(', ');
    const platform = navigator.userAgentData.platform || '';
    if (brands) {
      return `${brands}${platform ? ` (${platform})` : ''}`;
    }
  }

  const ua = navigator.userAgent || '';
  let browser = 'Unknown Browser';
  let version = '';

  if (/Edg\/([0-9.]+)/.test(ua)) {
    browser = 'Microsoft Edge';
    version = RegExp.$1;
  } else if (/Chrome\/([0-9.]+)/.test(ua)) {
    browser = 'Chrome';
    version = RegExp.$1;
  } else if (/Firefox\/([0-9.]+)/.test(ua)) {
    browser = 'Firefox';
    version = RegExp.$1;
  } else if (/Safari\/([0-9.]+)/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari';
    version = RegExp.$1;
  } else if (/OPR\/([0-9.]+)/.test(ua)) {
    browser = 'Opera';
    version = RegExp.$1;
  }

  let os = '';
  if (/Windows NT 10.0/.test(ua)) os = 'Windows 10/11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';

  return `${browser} ${version}${os ? ` (${os})` : ''}`.trim() || ua;
}

/**
 * Builds a GitHub "New Issue" URL prefilled with app version and browser environment.
 * @param {string} [appVersion]
 * @returns {string}
 */
export function getNewIssueUrl(appVersion) {
  const version = appVersion || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.0.1-dev');
  const browser = getBrowserInfo();
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const body = `### Environment
- **App Version:** \`${version}\`
- **Browser / OS:** ${browser}
- **User Agent:** \`${ua}\`

---

### Description
<!-- Please describe the issue or unexpected behavior below -->
`;

  return `https://github.com/CedricBonjour/nanocell-csv/issues/new?body=${encodeURIComponent(body)}`;
}

/**
 * Checks whether the browser supports the File System Access API.
 * @returns {boolean}
 */
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function';
}

let activeCompatToast = null;

/**
 * Displays a persistent confirmation notification explaining File System Access API support.
 */
export function showBrowserCompatibilityNotice() {
  if (typeof document === 'undefined') return;
  if (activeCompatToast && activeCompatToast.parentNode) return;

  const messageHtml = `
    <div>
      Direct in-place file saving requires the modern <strong>File System Access API</strong>, which is not supported in this browser.
      <div style="margin-top: 6px;">NanoCell is running in <strong>compatibility mode</strong>:</div>
      <ul style="margin: 4px 0 6px 18px; padding: 0; line-height: 1.4;">
        <li><strong>Open:</strong> File picker upload and drag-and-drop are supported.</li>
        <li><strong>Save:</strong> Files are saved by downloading them to your device.</li>
      </ul>
      <div style="font-size: 0.9em; opacity: 0.85; margin-top: 6px;">
        Direct in-place file editing is supported in Chrome, Edge, Brave, and Opera.
      </div>
    </div>
  `;

  activeCompatToast = new Notification(messageHtml, {
    id: 2,
    type: 'info',
    title: 'Browser Compatibility Notice'
  });
  activeCompatToast.show();
}

export const PWA_INSTALLED_KEY = 'nanocell_pwa_installed';

let deferredInstallPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    try {
      localStorage.removeItem(PWA_INSTALLED_KEY);
    } catch (err) {}
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    markAppAsInstalled();
    Notification.quick("NanoCell installed successfully!");
  });
}

/**
 * Marks the application as installed in persistent local storage.
 */
export function markAppAsInstalled() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    }
  } catch (e) {}
}

/**
 * Checks whether the application is running in standalone mode (PWA installed).
 * @returns {boolean}
 */
export function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Synchronously checks whether the application is installed (via standalone mode or persistent flag).
 * @returns {boolean}
 */
export function isAppInstalledSync() {
  if (isStandaloneMode()) {
    markAppAsInstalled();
    return true;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(PWA_INSTALLED_KEY) === 'true';
    }
  } catch (e) {}
  return false;
}

/**
 * Asynchronously checks whether the application is installed on the user's operating system,
 * querying navigator.getInstalledRelatedApps() if available.
 * @returns {Promise<boolean>}
 */
export async function isAppInstalled() {
  if (isStandaloneMode()) {
    markAppAsInstalled();
    return true;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.getInstalledRelatedApps === 'function') {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0) {
        markAppAsInstalled();
        return true;
      } else if (Array.isArray(apps) && apps.length === 0) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(PWA_INSTALLED_KEY);
          }
        } catch (e) {}
        return false;
      }
    } catch (err) {
      console.debug('getInstalledRelatedApps check failed:', err);
    }
  }

  return isAppInstalledSync();
}

/**
 * Triggers the browser PWA install prompt or displays installation instructions.
 */
export async function triggerInstallPrompt() {
  if (isAppInstalledSync()) {
    Notification.quick("NanoCell is already installed.");
    return;
  }
  if (!deferredInstallPrompt) {
    Notification.confirm("To install NanoCell, click the install icon in your browser address bar or browser menu.");
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    deferredInstallPrompt = null;
    markAppAsInstalled();
  }
}


