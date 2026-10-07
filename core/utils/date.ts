/**
 * @file core/utils/date.ts
 * Pure calendar date validation and parsing utilities.
 * ZERO browser/DOM imports.
 */

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return false;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return false;
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function parseDateCandidate(rawVal: unknown): { p1: number; p2: number; year: number; raw: string } | null {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{4})$/);
  if (!m) return null;

  const p1 = parseInt(m[1], 10);
  const p2 = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);

  if (p1 < 1 || p1 > 31 || p2 < 1 || p2 > 31 || year < 1) return null;
  if (p1 > 12 && p2 > 12) return null;

  if (p1 > 12 && !isValidCalendarDate(year, p2, p1)) return null;
  if (p2 > 12 && !isValidCalendarDate(year, p1, p2)) return null;

  return { p1, p2, year, raw: s };
}

export function parseYearFirstDate(rawVal: unknown): { year: number; month: number; day: number; raw: string } | null {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})$/);
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!isValidCalendarDate(year, month, day)) return null;

  return { year, month, day, raw: s };
}

export function formatDate(date: Date, format: string = 'yyyy-mm-dd'): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const d1 = String(date.getDate());

  let result = format;
  result = result.replace(/yyyy/g, yyyy);
  result = result.replace(/YY/g, yy);
  result = result.replace(/mm/g, mm);
  result = result.replace(/dd/g, dd);
  result = result.replace(/d1/g, d1);
  return result;
}
