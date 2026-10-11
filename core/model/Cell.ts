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

export interface FormatOptions {
  autoRound?: boolean;
  decimalPlaces?: number;
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
 * Checks if a value is an HTTP or HTTPS URL string.
 * Fast-path prefix check to eliminate regex evaluation on critical render paths.
 */
export function isUrl(val: unknown): boolean {
  if (typeof val !== 'string' || val.length < 8) return false;
  const lower = val.toLowerCase();
  return lower.startsWith('https://') || lower.startsWith('http://');
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
  const num = Number(str);
  if (!Number.isFinite(num)) return str;
  const rounded = Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
  return rounded.toFixed(decimals);
}

/**
 * Formats a cell value according to spreadsheet formatting options.
 */
export function formatCellValue(val: CellValue, options?: FormatOptions): string {
  let str = normalizeCellValue(val);
  if (options?.autoRound && isNumeric(str)) {
    str = roundNumericString(str, options.decimalPlaces ?? 2);
  }
  return str;
}

