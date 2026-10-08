/**
 * Legacy Date compatibility extensions and formatting utilities.
 * Pure algorithms are maintained in core/utils/date.ts.
 * @module utils/DateExt
 */
import {
  isValidCalendarDate,
  parseDateCandidate,
  parseYearFirstDate
} from '../../../core/utils/date.js';

const monthList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekList = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Formats a Date object according to a format template string.
 * Maintained for backward compatibility with existing test suites.
 * @param {string} f - Format template (e.g. 'yyyy-mm-dd').
 * @returns {string|undefined}
 */
Date.prototype.getFormated = function (f) {
  if (isNaN(this.getTime())) return undefined;
  const pad = (n, len) => String(n).padStart(len, '0');
  const suffix = (n) => {
    if (n % 10 === 1 && n !== 11) return n + 'st';
    if (n % 10 === 2 && n !== 12) return n + 'nd';
    if (n % 10 === 3 && n !== 13) return n + 'rd';
    return n + 'th';
  };

  let res = f;
  res = res.replace(/epoch|UNIX/g, String(this.getTime()));
  res = res.replace(/MONTH/g, monthList[this.getMonth()].toUpperCase());
  res = res.replace(/Month/g, monthList[this.getMonth()]);
  res = res.replace(/month/g, monthList[this.getMonth()].toLowerCase());

  res = res.replace(/MMM/g, monthList[this.getMonth()].substring(0, 3).toUpperCase());
  res = res.replace(/Mmm/g, monthList[this.getMonth()].substring(0, 3));
  res = res.replace(/mmm/g, monthList[this.getMonth()].substring(0, 3).toLowerCase());
  res = res.replace(/mm/g, pad(this.getMonth() + 1, 2));

  res = res.replace(/yyyy/g, pad(this.getFullYear(), 4));
  res = res.replace(/YY/g, pad(this.getFullYear() % 100, 2));

  res = res.replace(/DAY/g, weekList[this.getDay()].toUpperCase());
  res = res.replace(/day/g, weekList[this.getDay()].toLowerCase());
  res = res.replace(/Day/g, weekList[this.getDay()]);

  res = res.replace(/dd/g, pad(this.getDate(), 2));
  res = res.replace(/dth/g, suffix(this.getDate()));
  res = res.replace(/d1/g, String(this.getDate()));
  return res;
};

/**
 * Validates whether string is an ISO format date (YYYY-MM-DD).
 * @param {string} t
 * @returns {boolean}
 */
Date.isDate = function (t) {
  return typeof t === 'string' && /^\d{4}-[01]\d-[0123]\d$/.test(t);
};

export {
  isValidCalendarDate,
  parseDateCandidate,
  parseYearFirstDate
};
