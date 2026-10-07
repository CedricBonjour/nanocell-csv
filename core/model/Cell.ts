/**
 * @file core/model/Cell.ts
 * Pure cell coordinates, value types, classification, and formatting utilities.
 * ZERO browser/DOM imports.
 */

export interface CellCoordinate {
  readonly x: number; // 0-indexed column index
  readonly y: number; // 0-indexed row index
}

export type CellValue = string | number;

export type CellType = 'empty' | 'text' | 'number' | 'date' | 'formula' | 'url';

export interface FormatOptions {
  autoRound?: boolean;
  decimalPlaces?: number;
}

/**
 * Creates an immutable CellCoordinate object.
 */
export function createCoordinate(x: number, y: number): CellCoordinate {
  return Object.freeze({ x: Math.trunc(x), y: Math.trunc(y) });
}

/**
 * Converts coordinates to a string key representation for Maps and Sets ("x:y").
 */
export function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

/**
 * Parses a coordinate key string back into CellCoordinate.
 */
export function parseCellKey(key: string): CellCoordinate {
  const parts = key.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid cell key format: "${key}"`);
  }
  return {
    x: parseInt(parts[0], 10),
    y: parseInt(parts[1], 10)
  };
}

/**
 * Checks if a value is effectively empty (empty string, null, undefined).
 */
export function isEmptyValue(val: unknown): boolean {
  return val === '' || val === null || val === undefined;
}

/**
 * Checks if a value represents a formula string (starts with '=' and has length > 1).
 */
export function isFormula(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return val.startsWith('=') && val.trim().length > 1;
}

/**
 * Checks if a value is a finite number or a valid numeric string.
 */
export function isNumeric(val: unknown): boolean {
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return false;
  return !Number.isNaN(Number(trimmed));
}

/**
 * Checks if a value is an HTTP/HTTPS/FTP URL string.
 */
export function isUrl(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(val.trim());
}

/**
 * Simple ISO / common calendar date string detector.
 */
export function isDateString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  // Matches YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, YYYY.MM.DD
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(trimmed);
}

/**
 * Classifies cell value into semantic type.
 */
export function detectCellType(val: CellValue): CellType {
  if (isEmptyValue(val)) return 'empty';
  if (typeof val === 'number') return 'number';
  if (isFormula(val)) return 'formula';
  if (isNumeric(val)) return 'number';
  if (isDateString(val)) return 'date';
  if (isUrl(val)) return 'url';
  return 'text';
}

/**
 * Normalizes raw input to a standardized string representation.
 */
export function normalizeCellValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

/**
 * Pure numeric rounding without external dependencies.
 * If val is a formula string like "=12.345678", rounds the terminal numeric token to 2 decimal places.
 */
export function roundNumericString(str: string, decimals: number = 2): string {
  if (!isNumeric(str)) return str;
  let num = Number(str);
  if (!Number.isFinite(num)) return str;
  const factor = 10 ** decimals;
  num *= factor;
  num = Math.round(num + Number.EPSILON);
  num /= factor;
  num += 0.001;
  num = Math.round(num * 1000) / 1000;
  return String(num).slice(0, -1);
}

/**
 * Formats a cell value according to spreadsheet formatting options.
 * Accurately implements the autoRound rule expected by legacy tests.
 */
export function formatCellValue(val: CellValue, options?: FormatOptions): string {
  let str = normalizeCellValue(val);
  if (options?.autoRound) {
    if (str.startsWith('=')) {
      const parts = str.split('=');
      const last = parts[parts.length - 1];
      if (isNumeric(last)) {
        parts[parts.length - 1] = roundNumericString(last, options.decimalPlaces ?? 2);
        str = parts.join('=');
      }
    } else if (isNumeric(str)) {
      str = roundNumericString(str, options.decimalPlaces ?? 2);
    }
  }
  return str;
}
