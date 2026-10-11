/**
 * General helper utilities for Nanocell CSV application.
 * @module utils/misc
 */
import { roundNumericString, isUrl } from '../../../core/model/Cell.js';
import { isIsoDate } from '../../../core/utils/date.js';

export const signOf = value => (value >= 0 ? 1 : -1);
export const isAlphanumeric = char => /^[a-zA-Z0-9_]$/.test(char);
export const rndStr = (n = 2) => {
  let r = '';
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < n; i++) r += abc.charAt(Math.floor(Math.random() * abc.length));
  return r;
};

/** Canonical URL validator re-exported from core/model/Cell.js */
export const isValidUrl = isUrl;

/** Canonical ISO date validator re-exported from core/utils/date.js */
export { isIsoDate };


/**
 * Rounds numeric values to an integer or to two decimal places.
 * @param {number|string} n - Input value.
 * @param {boolean} [integer=true] - True for integer rounding, false for 2 decimal places.
 * @returns {number|string}
 */
export function round(n, integer = true) {
  if (isNaN(n) || n === '') return n;
  if (integer) return Math.round(Number(n));
  return roundNumericString(String(n), 2);
}

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
