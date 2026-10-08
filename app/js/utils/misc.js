/**
 * General helper utilities for Nanocell CSV application.
 * @module utils/misc
 */

/**
 * Returns the sign of a numeric value (1 for positive or zero, -1 for negative).
 * @param {number} value
 * @returns {number}
 */
export function signOf(value) {
  return value >= 0 ? 1 : -1;
}

/**
 * Tests whether a character is alphanumeric or underscore.
 * @param {string} char
 * @returns {boolean}
 */
export function isAlphanumeric(char) {
  return /^[a-zA-Z0-9_]$/.test(char);
}

/**
 * Generates a pseudo-random alphanumeric string of length n.
 * @param {number} [n=2]
 * @returns {string}
 */
export function rndStr(n = 2) {
  let r = '';
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const len = abc.length;
  for (let i = 0; i < n; i++) r += abc.charAt(Math.floor(Math.random() * len));
  return r;
}

/**
 * Checks whether a string is an HTTP or HTTPS URL.
 * @param {*} txt
 * @returns {boolean}
 */
export function isValidUrl(txt) {
  if (typeof txt !== 'string') return false;
  const url = txt.toLowerCase();
  return url.startsWith('https://') || url.startsWith('http://');
}

/**
 * Checks whether a string conforms to strict ISO date format (YYYY-MM-DD).
 * @param {*} txt
 * @returns {boolean}
 */
export function isIsoDate(txt) {
  if (typeof txt !== 'string' || txt.length !== 10) return false;
  return /^\d{4}-[01]\d-[0123]\d$/.test(txt);
}

/**
 * Rounds numeric values to an integer or to two decimal places.
 * @param {number|string} n - Input value.
 * @param {boolean} [integer=true] - True for integer rounding, false for 2 decimal places.
 * @returns {number|string}
 */
export function round(n, integer = true) {
  if (isNaN(n) || n === '') return n;
  let num = Number(n);
  if (!integer) num *= 100;
  num = Math.round(num + Number.EPSILON);
  if (!integer) {
    num /= 100;
    num += 0.001;
    num = Math.round(num * 1000) / 1000;
    return String(num).slice(0, -1);
  }
  return num;
}
