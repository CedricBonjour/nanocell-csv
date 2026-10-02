Date.prototype.monthList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
Date.prototype.week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
Date.prototype.parser = {
  day: ["day", "Day", "DAY"],
  date: ["d1", "dd"],
  month: ["mm", "MMM", "Mmm", "mmm", "month", "Month", "MONTH", "month"],
  year: ["YY", "yyyy"],
  epoch: ["UNIX", "epoch"],
};

Date.prototype.addDays = function (n) { this.setDate(this.getDate() + n); return this; };

Date.prototype.build = function (txt, f) {
  for (const e of this.parser.epoch) if (f === e) { this.setTime(txt); return this; }
  const match = txt.match(/\d+/g);
  if (match === null) return undefined;
  const nums = match.map(Number);
  if (nums.length > 3 || nums.length < 2) return undefined;

  let y = 0, m = 0, d = 0;
  let yp = -1, mp = -1, dp = -1;
  let fullYear = true;
  for (let i = 0; i < this.monthList.length; i++) if (new RegExp(this.monthList[i].substring(0, 3), 'i').test(txt)) m = i + 1;
  if (m < 1 && nums.length != 3) return undefined;
  if (m > 0 && nums.length != 2) return undefined;

  for (const month of this.parser.month) mp = Math.max(mp, f.search(month));
  for (const date of this.parser.date) dp = Math.max(dp, f.search(date));
  for (const year of this.parser.year) {
    const n = f.search(year);
    if (n > -1 && year == "YY") fullYear = false;
    yp = Math.max(yp, n);
  }
  if (m < 1) {
    if (mp < yp && mp < dp) m = nums.shift();
    else if (mp > yp && mp > dp) m = nums.pop();
    else { m = nums[1]; nums.splice(1, 1); }
  }

  d = (dp < yp) ? nums.shift() : nums.pop();
  y = nums[0];
  if (!fullYear) y = Math.floor(new Date().getFullYear() / 100) * 100 + y;
  if (d < 1 || m < 1 || y < 1) return undefined;
  this.setMonth(m - 1);
  this.setDate(d);
  this.setFullYear(y);
  if (this.getFormated(f) === txt) return this;
  return undefined;
};

Date.prototype.getFormated = function (f) {
  const largen = function (n, d) { n = String(n); while (n.length < d) n = "0" + n; return n };
  const suffix = function (n) {
    if (n % 10 === 1 && n !== 11) return n + "st";
    if (n % 10 === 2 && n !== 12) return n + "nd";
    if (n % 10 === 3 && n !== 13) return n + "rd";
    return n + 'th';
  };
  if (isNaN(this.getTime())) return undefined;
  f = f.replace("epoch", this.getTime());
  f = f.replace("UNIX", this.getTime());

  f = f.replace("MONTH", this.monthList[this.getMonth()].toUpperCase());
  f = f.replace("Month", this.monthList[this.getMonth()]);
  f = f.replace("month", this.monthList[this.getMonth()].toLowerCase());

  f = f.replace("MMM", this.monthList[this.getMonth()].substring(0, 3).toUpperCase());
  f = f.replace("Mmm", this.monthList[this.getMonth()].substring(0, 3));
  f = f.replace("mmm", this.monthList[this.getMonth()].substring(0, 3).toLowerCase());
  f = f.replace("mm", largen(this.getMonth() + 1, 2));

  f = f.replace("yyyy", largen(this.getFullYear(), 4));
  f = f.replace("YY", largen(this.getFullYear() % 100, 2));

  f = f.replace("DAY", this.week[this.getDay()].toUpperCase());
  f = f.replace("day", this.week[this.getDay()].toLowerCase());

  f = f.replace("Day", this.week[this.getDay()]);
  f = f.replace("dd", largen(this.getDate(), 2));
  f = f.replace("dth", suffix(this.getDate()));
  f = f.replace("d1", this.getDate());
  return f;
};

Date.prototype.isValidFormat = function (f) {
  const d = new Date(1999, 1, 1);
  const n = new Date(2222, 2, 2).build(d.getFormated(f), f);
  return Boolean(n && d.getTime() === n.getTime());
};

Date.isDate = function (t) {
  const regex = /^\d{4}-[01]\d-[0123]\d$/;
  return regex.test(t);
};

/**
 * Validates whether year, month (1-12), and day form a valid calendar date.
 * @param {number} year - 4-digit year.
 * @param {number} month - 1-indexed month (1-12).
 * @param {number} day - 1-indexed day of month (1-31).
 * @returns {boolean} True if the date is a valid calendar date.
 */
export function isValidCalendarDate(year, month, day) {
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return false;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return false;
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

/**
 * Parses a candidate cell value matching 'dd-mm-YYYY' or 'mm-dd-YYYY' across arbitrary separators.
 * Returns object { p1, p2, year, raw } or null if not matching.
 * @param {string|number} rawVal - Cell raw value.
 * @returns {{ p1: number, p2: number, year: number, raw: string } | null}
 */
export function parseDateCandidate(rawVal) {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim();
  if (!s) return null;

  // Must match: 1-2 digits, non-alphanumeric separator(s), 1-2 digits, non-alphanumeric separator(s), 4 digits
  const m = s.match(/^(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{4})$/);
  if (!m) return null;

  const p1 = parseInt(m[1], 10);
  const p2 = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);

  if (p1 < 1 || p1 > 31 || p2 < 1 || p2 > 31 || year < 1) return null;

  // At least one must be <= 12 to be a valid month
  if (p1 > 12 && p2 > 12) return null;

  // If p1 > 12, p1 must be day and p2 must be month
  if (p1 > 12 && !isValidCalendarDate(year, p2, p1)) return null;

  // If p2 > 12, p2 must be day and p1 must be month
  if (p2 > 12 && !isValidCalendarDate(year, p1, p2)) return null;

  return { p1, p2, year, raw: s };
}

/**
 * Parses a candidate cell value matching 'YYYY-mm-dd' or 'YYYY-m-d' across arbitrary separators.
 * Returns object { year, month, day, raw } or null if not matching.
 * @param {string|number} rawVal - Cell raw value.
 * @returns {{ year: number, month: number, day: number, raw: string } | null}
 */
export function parseYearFirstDate(rawVal) {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim();
  if (!s) return null;

  // Must match: 4 digits (year), non-alphanumeric separator(s), 1-2 digits (month), non-alphanumeric separator(s), 1-2 digits (day)
  const m = s.match(/^(\d{4})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})$/);
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!isValidCalendarDate(year, month, day)) return null;

  return { year, month, day, raw: s };
}


