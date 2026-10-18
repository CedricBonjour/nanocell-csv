/**
 * @file app/core/DataValidator.ts
 * Unified tabular data, header, calendar date, and currency column validator with declarative rule registry.
 * ZERO browser/DOM imports.
 */

import { Dataframe, isNumeric, isIsoDate, isUrl, roundNumericString } from './Dataframe.js';

export interface ValidationProposal {
  x: number;
  y: number;
  readonly oldValue: string;
  readonly newValue: string;
  readonly iso3?: string;
  readonly isRowDeletion?: boolean;
  dupOfY?: number;
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface ValidationRunResult {
  readonly proposals: ValidationProposal[];
  readonly reason?: 'coexistence' | 'ambiguous' | 'no_dates';
}

export interface CurrencyValidationResult {
  readonly changedCount: number;
  readonly formattedCount: number;
  readonly currencyCount: number;
  readonly insertedCol: boolean;
}

export interface ValidationRule {
  readonly id: string;
  readonly cmdId: string;
  readonly label: string;
  readonly cmdLabel: string;
  readonly description: string;
  readonly icon: string;
  readonly skipColumns?: boolean;
  readonly key?: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly transform?: (val: string) => string;
}

export const COMMA_REPLACEMENTS = ['-', ';', '|', '/', '_', ':'] as const;

const COMMA_REPLACEMENT_META: Record<string, { name: string; desc: string }> = {
  '-': { name: 'Dash', desc: 'hyphens (-)' },
  ';': { name: 'Semicolon', desc: 'semicolons (;)' },
  '|': { name: 'Pipe', desc: 'pipe character (|)' },
  '/': { name: 'Slash', desc: 'slashes (/)' },
  '_': { name: 'Underscore', desc: 'underscores (_)' },
  ':': { name: 'Colon', desc: 'colons (:)' },
};

let commaReplacement = '-';

export function getCommaReplacement(): string {
  return commaReplacement;
}

export function setCommaReplacement(char: string): void {
  commaReplacement = char || '-';
}

const TEXT_COMMA_RE = /([^\S\r\n]*),([^\S\r\n]*)/g;

export function replaceTextCommas(val: string, rep: string = commaReplacement): string {
  if (!val || isNumeric(val) || !val.includes(',')) return val;
  return val.replace(TEXT_COMMA_RE, (match, before: string, after: string, offset: number, str: string) => {
    if (before.length > 0 || after.length > 0) {
      const hasPrev = offset > 0 && str[offset - 1] !== '\n' && str[offset - 1] !== '\r';
      const nextIdx = offset + match.length;
      const hasNext = nextIdx < str.length && str[nextIdx] !== '\n' && str[nextIdx] !== '\r';
      return `${hasPrev ? ' ' : ''}${rep}${hasNext ? ' ' : ''}`;
    }
    return rep;
  });
}

export const VALIDATION_RULES: readonly ValidationRule[] = [
  { id: 'headers', cmdId: 'validateHeaders', label: 'Headers & SQL Compliance', cmdLabel: 'Validate: Headers & SQL Compliance', description: 'Sanitize column headers for SQL identifier standards and duplicates', icon: 'validate_headers', skipColumns: true, key: 'H', ctrl: true, shift: true },
  { id: 'dates', cmdId: 'validateDates', label: 'Format Dates', cmdLabel: 'Validate: Format Dates', description: 'Standardize date formats across columns to YYYY-mm-dd', icon: 'date_checker' },
  { id: 'currency', cmdId: 'validateCurrency', label: 'Format Currency Values', cmdLabel: 'Validate: Format Currency Values', description: 'Extract currency symbols/ISO codes to a new column and format numbers', icon: 'decimal' },
  { id: 'comma_decimals', cmdId: 'validateCommaDecimals', label: 'Format Numbers', cmdLabel: 'Validate: Format Numbers', description: 'Normalize locale thousand separators, decimal commas, and accounting negatives', icon: '123', transform: val => formatNumberCell(val) },
  { id: 'booleans', cmdId: 'validateBooleans', label: 'Format Booleans', cmdLabel: 'Validate: Format Booleans', description: 'Standardize boolean values (Yes/No, Y/N, True/False, 1/0, On/Off) to true/false', icon: 'true' },
  { id: 'null_literals', cmdId: 'validateNulls', label: 'Standardize Null Values', cmdLabel: 'Validate: Standardize Null Values', description: 'Clear placeholder tokens (NULL, N/A, #N/A, NaN, None, undefined) to empty cells', icon: 'remove', transform: val => normalizeNullLiteral(val) },
  { id: 'clean_empty', cmdId: 'validateCleanEmpty', label: 'Clean Empty Cells', cmdLabel: 'Validate: Clean Empty Cells', description: 'Clear cells containing only non-visual characters (spaces, line returns, tabs, zero-width spaces) to empty', icon: 'remove', transform: val => cleanEmptyCell(val) },
  { id: 'duplicate_rows', cmdId: 'validateDuplicates', label: 'Remove Duplicate Rows', cmdLabel: 'Validate: Remove Duplicate Rows', description: 'Detect and remove exact duplicate rows across the sheet', icon: 'dup_rows', skipColumns: true },
  { id: 'trim_whitespace', cmdId: 'validateWhitespace', label: 'Trim Whitespace', cmdLabel: 'Validate: Trim Whitespace', description: 'Remove edge whitespace, non-breaking spaces, and multiple internal spaces', icon: 'trim', transform: val => cleanWhitespace(val) },
  { id: 'strip_accents', cmdId: 'validateAccents', label: 'Strip Accents / Diacritics', cmdLabel: 'Validate: Strip Accents / Diacritics', description: 'Replace accented and diacritic characters with ASCII equivalents', icon: 'replace', transform: val => stripAccents(val) },
  { id: 'line_returns', cmdId: 'validateLineReturns', label: 'Replace Line Returns by Pipe', cmdLabel: 'Validate: Replace Line Returns by Pipe', description: 'Replace embedded newline line breaks with pipe character (|)', icon: 'replace', transform: val => (!isNumeric(val) && val.includes('\n')) ? val.replaceAll('\n', '|') : val },
  { id: 'double_quotes', cmdId: 'validateQuotes', label: 'Replace Double Quotes by Single', cmdLabel: 'Validate: Replace Double Quotes by Single', description: 'Replace double quotation marks (") with single quotes (\')', icon: 'replace', transform: val => (!isNumeric(val) && val.includes('"')) ? val.replaceAll('"', "'") : val },
  {
    id: 'text_commas',
    cmdId: 'validateTextCommas',
    get label() {
      const meta = COMMA_REPLACEMENT_META[commaReplacement];
      return `Replace Text Commas by ${meta ? meta.name : `'${commaReplacement}'`}`;
    },
    get cmdLabel() {
      return `Validate: ${this.label}`;
    },
    get description() {
      const meta = COMMA_REPLACEMENT_META[commaReplacement];
      return `Replace commas inside text cells with ${meta ? meta.desc : `'${commaReplacement}'`}`;
    },
    icon: 'replace',
    transform: val => replaceTextCommas(val),
  },
  { id: 'lowercase', cmdId: 'validateLowercase', label: 'Force Lowercase', cmdLabel: 'Validate: Force Lowercase', description: 'Convert all text cells to lowercase', icon: 'match_case', transform: val => (!isNumeric(val) && !isIsoDate(val) && !isUrl(val)) ? val.toLowerCase() : val },
  { id: 'uppercase', cmdId: 'validateUppercase', label: 'Force Uppercase', cmdLabel: 'Validate: Force Uppercase', description: 'Convert all text cells to UPPERCASE', icon: 'match_case', transform: val => (!isNumeric(val) && !isIsoDate(val) && !isUrl(val)) ? val.toUpperCase() : val },
  { id: 'titlecase', cmdId: 'validateTitleCase', label: 'Format Title Case', cmdLabel: 'Validate: Format Title Case', description: 'Capitalize the first letter of each word in text cells', icon: 'match_case', transform: val => toTitleCase(val) },
];

export const VALIDATION_RULE_MAP: ReadonlyMap<string, ValidationRule> = new Map(
  VALIDATION_RULES.map(r => [r.id, r])
);

export interface MacroDefinition {
  id: string;
  title: string;
  description: string;
  steps: string[];
}

export const DEFAULT_MACROS: readonly MacroDefinition[] = [
  {
    id: 'clean_import',
    title: 'Clean Imported CSV',
    description: 'Clean invisible empty cells, trim whitespace, standardize null tokens, and remove duplicate rows',
    steps: ['clean_empty', 'trim_whitespace', 'null_literals', 'duplicate_rows'],
  },
  {
    id: 'sql_ready',
    title: 'SQL & Database Ready',
    description: 'Sanitize SQL headers, standardize nulls, format dates, numbers, and booleans',
    steps: ['headers', 'clean_empty', 'null_literals', 'dates', 'comma_decimals', 'booleans'],
  },
  {
    id: 'strict_csv',
    title: 'Strict RFC-4180 Safe Text',
    description: 'Trim whitespace and replace embedded line returns, double quotes, and text commas',
    steps: ['trim_whitespace', 'line_returns', 'double_quotes', 'text_commas'],
  },
  {
    id: 'financial_clean',
    title: 'Normalize Financial Table',
    description: 'Clean empty cells, trim whitespace, standardize nulls, extract currencies, and format numbers',
    steps: ['clean_empty', 'trim_whitespace', 'null_literals', 'currency', 'comma_decimals'],
  },
];

// --- High-Performance Currency Token Registry & Compiled Matchers ---

const SYMBOL_ENTRIES: readonly [string, string][] = [
  ['CLP$', 'CLP'], ['COL$', 'COP'], ['Can$', 'CAD'], ['Mex$', 'MXN'], ['SFr.', 'CHF'],
  ['CA$', 'CAD'], ['AU$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['NT$', 'TWD'],
  ['MX$', 'MXN'], ['US$', 'USD'], ['AR$', 'ARS'], ['CN¥', 'CNY'], ['JP¥', 'JPY'],
  ['Fr.', 'CHF'], ['Rs.', 'INR'], ['kr.', 'SEK'],
  ['C$', 'CAD'], ['A$', 'AUD'], ['S$', 'SGD'], ['R$', 'BRL'],
  ['zł', 'PLN'], ['Kč', 'CZK'],
  ['$', 'USD'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['￥', 'JPY'],
  ['₹', 'INR'], ['₩', 'KRW'], ['₽', 'RUB'], ['₺', 'TRY'], ['₪', 'ILS'],
  ['฿', 'THB'], ['₱', 'PHP'], ['₫', 'VND'], ['₴', 'UAH'], ['元', 'CNY'],
];

const ALPHA_ENTRIES: readonly [string, string][] = [
  ['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['JPY', 'JPY'], ['CHF', 'CHF'],
  ['CAD', 'CAD'], ['AUD', 'AUD'], ['CNY', 'CNY'], ['RMB', 'CNY'], ['HKD', 'HKD'],
  ['SGD', 'SGD'], ['NZD', 'NZD'], ['INR', 'INR'], ['KRW', 'KRW'], ['BRL', 'BRL'],
  ['MXN', 'MXN'], ['RUB', 'RUB'], ['TRY', 'TRY'], ['ZAR', 'ZAR'], ['SEK', 'SEK'],
  ['NOK', 'NOK'], ['DKK', 'DKK'], ['PLN', 'PLN'], ['THB', 'THB'], ['ILS', 'ILS'],
  ['AED', 'AED'], ['SAR', 'SAR'], ['TWD', 'TWD'], ['MYR', 'MYR'], ['IDR', 'IDR'],
  ['PHP', 'PHP'], ['VND', 'VND'], ['UAH', 'UAH'], ['CZK', 'CZK'], ['HUF', 'HUF'],
  ['CLP', 'CLP'], ['COP', 'COP'], ['ARS', 'ARS'],
  ['SFr', 'CHF'], ['Fr', 'CHF'], ['Rs', 'INR'], ['kr', 'SEK'],
  ['RM', 'MYR'], ['Rp', 'IDR'], ['Ft', 'HUF'],
];

const CURRENCY_LOOKUP = new Map<string, string>();
for (const [tok, iso] of SYMBOL_ENTRIES) CURRENCY_LOOKUP.set(tok.toLowerCase(), iso);
for (const [tok, iso] of ALPHA_ENTRIES) CURRENCY_LOOKUP.set(tok.toLowerCase(), iso);

const GENERIC_SYMBOLS = new Set(['$', '¥', '￥']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SYMBOL_ALT = SYMBOL_ENTRIES.map(([k]) => escapeRe(k)).join('|');
const ALPHA_ALT = ALPHA_ENTRIES.map(([k]) => escapeRe(k)).join('|');

// Lookbehind-free anchored prefix/suffix regexes for V8 fast-path execution
const PREFIX_SYMBOL_RE = new RegExp(`^([+-]?\\s*)(${SYMBOL_ALT})\\s*`, 'i');
const PREFIX_ALPHA_RE = new RegExp(`^([+-]?\\s*)(${ALPHA_ALT})(?![a-zA-Z])\\s*`, 'i');
const SUFFIX_SYMBOL_RE = new RegExp(`\\s*(${SYMBOL_ALT})(\\s*[+-]?)$`, 'i');
const SUFFIX_ALPHA_RE = new RegExp(`(^|[^a-zA-Z])(${ALPHA_ALT})(\\s*[+-]?)$`, 'i');
const HAS_DIGIT_RE = /\d/;
const STRIP_CHARS_RE = /[\s'`\u2019\u2018]+/g;
const SWISS_DASH_RE = /[.,][-–—]+$/;
const US_THOUSANDS_DEC_RE = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})\.\d+$/;
const EU_THOUSANDS_DEC_RE = /^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/;
const US_THOUSANDS_INT_RE = /^[+-]?\d{1,3}(?:,\d{3})+$/;
const US_THOUSANDS_COMMA_DEC_RE = /^[+-]?\d{1,3}(?:,\d{3})+,\d{1,2}$/;
const EU_THOUSANDS_INT_RE = /^[+-]?\d{1,3}(?:\.\d{3})+$/;

export interface CurrencyExtractResult {
  readonly iso3: string | null;
  readonly remaining: string;
}

export function extractCurrency(rawVal: unknown): CurrencyExtractResult {
  if (rawVal == null) return { iso3: null, remaining: '' };
  const trimmed = String(rawVal).trim();
  if (!trimmed) return { iso3: null, remaining: '' };

  const c0 = trimmed.charCodeAt(0);
  const cLast = trimmed.charCodeAt(trimmed.length - 1);

  // Fast O(1) ASCII digit boundary guard: if both first and last chars are '0'..'9', no prefix/suffix currency exists
  if (c0 >= 48 && c0 <= 57 && cLast >= 48 && cLast <= 57) {
    return { iso3: null, remaining: trimmed };
  }

  // Must contain at least one digit to have a numeric amount
  if (!HAS_DIGIT_RE.test(trimmed)) {
    return { iso3: null, remaining: trimmed };
  }

  let s = trimmed;

  // Unwrap accounting negative parentheses e.g. "($1,234.56)" or "(100 CHF)"
  if (c0 === 40 && cLast === 41) {
    s = '-' + s.slice(1, -1).trim();
  } else if ((c0 === 45 || c0 === 43) && s.slice(1).trimStart().startsWith('(') && cLast === 41) {
    const inner = s.slice(1).trimStart().slice(1, -1).trim();
    s = (c0 === 45 ? '-' : '+') + inner;
  }

  let iso3: string | null = null;
  let matchedGeneric = false;

  const recordToken = (rawTok: string) => {
    const lower = rawTok.toLowerCase();
    const mapped = CURRENCY_LOOKUP.get(lower);
    if (!mapped) return;
    const isGeneric = GENERIC_SYMBOLS.has(rawTok);
    if (!iso3 || (matchedGeneric && !isGeneric)) {
      iso3 = mapped;
      matchedGeneric = isGeneric;
    }
  };

  // 1. Prefix extraction (up to 2 passes to handle combined "CAD $50" or "USD $100")
  if (!(c0 >= 48 && c0 <= 57)) {
    for (let pass = 0; pass < 2 && s.length > 0; pass++) {
      const symMatch = s.match(PREFIX_SYMBOL_RE);
      if (symMatch) {
        recordToken(symMatch[2]);
        s = (symMatch[1] ? symMatch[1].trim() : '') + s.slice(symMatch[0].length);
        s = s.trim();
        continue;
      }
      const alphaMatch = s.match(PREFIX_ALPHA_RE);
      if (alphaMatch) {
        recordToken(alphaMatch[2]);
        s = (alphaMatch[1] ? alphaMatch[1].trim() : '') + s.slice(alphaMatch[0].length);
        s = s.trim();
        continue;
      }
      break;
    }
  }

  // 2. Suffix extraction (up to 2 passes to handle "100 € EUR" or "$100 USD")
  if (s.length > 0) {
    const endCh = s.charCodeAt(s.length - 1);
    if (!(endCh >= 48 && endCh <= 57)) {
      for (let pass = 0; pass < 2 && s.length > 0; pass++) {
        const symMatch = s.match(SUFFIX_SYMBOL_RE);
        if (symMatch) {
          recordToken(symMatch[1]);
          const trailSign = symMatch[2] ? symMatch[2].trim() : '';
          s = s.slice(0, s.length - symMatch[0].length).trim() + trailSign;
          continue;
        }
        const alphaMatch = s.match(SUFFIX_ALPHA_RE);
        if (alphaMatch) {
          recordToken(alphaMatch[2]);
          const prefixChar = alphaMatch[1] || '';
          const trailSign = alphaMatch[3] ? alphaMatch[3].trim() : '';
          const cutStart = s.length - alphaMatch[0].length + prefixChar.length;
          s = s.slice(0, cutStart).trim() + trailSign;
          continue;
        }
        break;
      }
    }
  }

  // Only valid if the remaining string after currency extraction is a recognizable number
  if (iso3 !== null && normalizeNumberString(s) === null) {
    return { iso3: null, remaining: trimmed };
  }

  return { iso3, remaining: s };
}

export function normalizeNumberString(rawText: string): string | null {
  if (!rawText) return null;
  let s = rawText.replace(STRIP_CHARS_RE, '');
  const len = s.length;
  if (len === 0) return null;

  // Handle accounting parentheses if currency was outside e.g. "(45,00) €" -> "(45,00)"
  const c0 = s.charCodeAt(0);
  const cLast = s.charCodeAt(len - 1);
  if (c0 === 40 && cLast === 41 && len > 2) {
    s = '-' + s.slice(1, -1);
  } else if ((c0 === 45 || c0 === 43) && s.charCodeAt(1) === 40 && cLast === 41 && len > 3) {
    s = s[0] + s.slice(2, -1);
  }

  // Check for Swiss dash cents (.- / ,- / .– / .—) vs trailing minus sign (123.45-)
  const endCode = s.charCodeAt(s.length - 1);
  if (endCode === 45 || endCode === 43 || endCode === 8211 || endCode === 8212) {
    const prevCode = s.length > 1 ? s.charCodeAt(s.length - 2) : 0;
    if (prevCode === 46 || prevCode === 44 || endCode === 8211 || endCode === 8212) {
      s = s.replace(SWISS_DASH_RE, '.00');
    } else if ((endCode === 45 || endCode === 43) && s.length > 1) {
      const firstCode = s.charCodeAt(0);
      if (firstCode !== 45 && firstCode !== 43) {
        s = (endCode === 45 ? '-' : '+') + s.slice(0, -1);
      }
    }
  }

  // Disambiguate comma and dot separators
  const firstComma = s.indexOf(',');
  const firstDot = s.indexOf('.');

  if (firstComma !== -1 && firstDot !== -1) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastDot > lastComma) {
      if (firstDot === lastDot && US_THOUSANDS_DEC_RE.test(s)) {
        s = s.replaceAll(',', '');
      } else {
        return null;
      }
    } else {
      if (firstComma === lastComma && EU_THOUSANDS_DEC_RE.test(s)) {
        s = s.replaceAll('.', '').replace(',', '.');
      } else {
        return null;
      }
    }
  } else if (firstComma !== -1) {
    const lastComma = s.lastIndexOf(',');
    if (firstComma === lastComma) {
      const afterLen = s.length - lastComma - 1;
      if (afterLen === 1 || afterLen === 2) {
        s = s.replace(',', '.');
      } else if (afterLen === 3 && US_THOUSANDS_INT_RE.test(s)) {
        s = s.replace(',', '');
      } else {
        return null;
      }
    } else if (US_THOUSANDS_INT_RE.test(s)) {
      s = s.replaceAll(',', '');
    } else if (US_THOUSANDS_COMMA_DEC_RE.test(s)) {
      s = s.slice(0, lastComma).replaceAll(',', '') + '.' + s.slice(lastComma + 1);
    } else {
      return null;
    }
  } else if (firstDot !== -1) {
    if (firstDot !== s.lastIndexOf('.')) {
      if (EU_THOUSANDS_INT_RE.test(s)) {
        s = s.replaceAll('.', '');
      } else {
        return null;
      }
    }
  }

  if (s.length === 0) return null;

  // Guard against hex/binary/octal literals (0x, 0b, 0o)
  if (s.length > 2) {
    const leadZero = s.charCodeAt(0) === 48 ? 1 : ((s.charCodeAt(0) === 45 || s.charCodeAt(0) === 43) && s.charCodeAt(1) === 48 ? 2 : 0);
    if (leadZero > 0) {
      const p = s.charCodeAt(leadZero) | 32;
      if (p === 120 || p === 98 || p === 111) return null; // 'x', 'b', 'o'
    }
  }

  return isNumeric(s) ? s : null;
}

export function parseCurrencyNumber(rawText: string): string | null {
  const s = normalizeNumberString(rawText);
  return s !== null ? roundNumericString(s, 2) : null;
}

export function formatNumberCell(val: string): string {
  const trimmed = val.trim();
  if (!trimmed || (isNumeric(trimmed) && !/[\s',`+()\u2019\u2018-]$/.test(trimmed) && !/[\s',`\u2019\u2018]/.test(trimmed))) {
    return val;
  }
  return normalizeNumberString(trimmed) ?? val;
}

const NON_ASCII_RE = /[^\u0000-\u007f]/;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const LATIN_LIGATURE_RE = /[ßẞæÆœŒøØłŁđĐðÐþÞ]/g;
const LATIN_LIGATURE_MAP: Record<string, string> = {
  'ß': 'ss', 'ẞ': 'SS', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
  'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH',
};

export function stripAccents(val: string): string {
  if (!val || !NON_ASCII_RE.test(val)) return val;
  return val
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .replace(LATIN_LIGATURE_RE, ch => LATIN_LIGATURE_MAP[ch] || ch);
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const H_SPACE_RUN_RE = /[^\S\r\n]+/g;
const LINE_EDGE_SPACE_RE = /^ | $/gm;

export function cleanWhitespace(val: string): string {
  if (!val) return val;
  return val
    .replace(ZERO_WIDTH_RE, '')
    .replace(H_SPACE_RUN_RE, ' ')
    .replace(LINE_EDGE_SPACE_RE, '')
    .trim();
}

const NULL_TOKENS = new Set([
  'null', 'n/a', '#n/a', '#na', 'nan', '-nan', 'none', 'nil',
  'undefined', '<na>', 'n.a.', 'not available', '#value!', '#ref!', '#div/0!', '#name?'
]);

export function normalizeNullLiteral(val: string): string {
  if (!val) return val;
  const trimmed = val.trim();
  return trimmed && NULL_TOKENS.has(trimmed.toLowerCase()) ? '' : val;
}

export const NON_VISUAL_ONLY_RE = /^[\s\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]+$/;

export function cleanEmptyCell(val: string): string {
  return val && NON_VISUAL_ONLY_RE.test(val) ? '' : val;
}

const TITLE_WORD_START_RE = /(?:^|[\s\-_/(['"])\p{L}/gu;

export function toTitleCase(val: string): string {
  if (!val || isNumeric(val) || isIsoDate(val) || isUrl(val)) return val;
  return val.toLowerCase().replace(TITLE_WORD_START_RE, m => m.toUpperCase());
}

const BOOL_MAP = new Map<string, 'true' | 'false'>([
  ['true', 'true'], ['yes', 'true'], ['y', 'true'], ['t', 'true'], ['1', 'true'],
  ['on', 'true'], ['vrai', 'true'], ['oui', 'true'],
  ['false', 'false'], ['no', 'false'], ['n', 'false'], ['f', 'false'], ['0', 'false'],
  ['off', 'false'], ['faux', 'false'], ['non', 'false'],
]);
const WORD_BOOL_TOKENS = new Set(['true', 'false', 'yes', 'no', 'vrai', 'faux', 'oui', 'non']);
const ALPHA_BOOL_TOKENS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f', 'on', 'off', 'vrai', 'faux', 'oui', 'non']);

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return false;
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function parseDateCandidate(rawVal: unknown): { p1: number; p2: number; year: number; raw: string } | null {
  if (rawVal == null) return null;
  const raw = String(rawVal).trim();
  const m = raw.match(/^(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{4})$/);
  if (!m) return null;

  const p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10), year = parseInt(m[3], 10);
  if (p1 < 1 || p1 > 31 || p2 < 1 || p2 > 31 || year < 1 || (p1 > 12 && p2 > 12)) return null;
  if ((p1 > 12 && !isValidCalendarDate(year, p2, p1)) || (p2 > 12 && !isValidCalendarDate(year, p1, p2))) return null;
  return { p1, p2, year, raw };
}

export function parseYearFirstDate(rawVal: unknown): { year: number; month: number; day: number; raw: string } | null {
  if (rawVal == null) return null;
  const raw = String(rawVal).trim();
  const m = raw.match(/^(\d{4})[^0-9a-zA-Z]+(\d{1,2})[^0-9a-zA-Z]+(\d{1,2})$/);
  if (!m) return null;

  const year = parseInt(m[1], 10), month = parseInt(m[2], 10), day = parseInt(m[3], 10);
  return isValidCalendarDate(year, month, day) ? { year, month, day, raw } : null;
}

const fmtIsoDate = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export class DataValidator {
  private static forEachCell(dataframe: Dataframe, fn: (val: string, x: number, y: number) => void): void {
    const rows = dataframe.data;
    const height = Math.min(dataframe.height, rows.length);
    const width = dataframe.width;
    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (!row) continue;
      const rowLen = Math.min(width, row.length);
      for (let x = 0; x < rowLen; x++) {
        const raw = row[x];
        if (raw) fn(String(raw), x, y);
      }
    }
  }

  static runRule(dataframe: Dataframe, ruleId: string): ValidationRunResult {
    if (ruleId === 'headers') return { proposals: this.validateHeaders(dataframe) };
    if (ruleId === 'dates') return this.validateDates(dataframe);
    if (ruleId === 'currency') return { proposals: this.validateCurrency(dataframe) };
    if (ruleId === 'booleans') return { proposals: this.validateBooleans(dataframe) };
    if (ruleId === 'duplicate_rows') return { proposals: this.validateDuplicateRows(dataframe) };
    const rule = VALIDATION_RULE_MAP.get(ruleId);
    return { proposals: rule?.transform ? this.scanCells(dataframe, rule.transform) : [] };
  }

  static applyProposals(
    dataframe: Dataframe,
    ruleId: string,
    itemsList: ValidationProposal[],
    allItems: ValidationProposal[] = itemsList,
    currencyColMap: Map<number, number> = new Map()
  ): void {
    if (dataframe.lock || !itemsList?.length) return;
    if (ruleId === 'currency') {
      this.applyCurrencyProposals(dataframe, itemsList, allItems, currencyColMap);
    } else if (ruleId === 'duplicate_rows') {
      this.applyDuplicateRowProposals(dataframe, itemsList, allItems);
    } else {
      dataframe.applyChanges(itemsList.map(({ x, y, oldValue, newValue }) => ({ x, y, oldValue, newValue })));
    }
  }

  static executeMacro(dataframe: Dataframe, stepIds: readonly string[]): { totalChanges: number; stepsApplied: number } {
    if (dataframe.lock || !stepIds?.length) return { totalChanges: 0, stepsApplied: 0 };
    let totalChanges = 0;
    let stepsApplied = 0;

    dataframe.runTransaction('Macro', () => {
      for (const ruleId of stepIds) {
        const { proposals } = this.runRule(dataframe, ruleId);
        if (proposals && proposals.length > 0) {
          this.applyProposals(dataframe, ruleId, proposals, proposals, new Map());
          totalChanges += proposals.length;
          stepsApplied++;
        }
      }
    });

    return { totalChanges, stepsApplied };
  }

  static validateBooleans(dataframe: Dataframe): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    const rows = dataframe.data;
    const height = Math.min(dataframe.height, rows.length);
    const width = dataframe.width;
    const startY = height > 1 ? 1 : 0;

    for (let x = 0; x < width; x++) {
      let nonEmpty = 0;
      let boolCount = 0;
      let alphaBoolCount = 0;

      for (let y = startY; y < height; y++) {
        const raw = rows[y]?.[x];
        if (!raw) continue;
        const lower = String(raw).trim().toLowerCase();
        if (!lower) continue;
        nonEmpty++;
        if (BOOL_MAP.has(lower)) {
          boolCount++;
          if (ALPHA_BOOL_TOKENS.has(lower)) alphaBoolCount++;
        }
      }

      const isBoolCol = nonEmpty > 0 && boolCount === nonEmpty && (alphaBoolCount > 0 || nonEmpty >= 2);

      for (let y = 0; y < height; y++) {
        const raw = rows[y]?.[x];
        if (!raw) continue;
        const str = String(raw);
        const lower = str.trim().toLowerCase();
        if (!lower) continue;

        const mapped = BOOL_MAP.get(lower);
        if (!mapped || mapped === str) continue;

        if ((y === 0 && height > 1 ? WORD_BOOL_TOKENS.has(lower) : isBoolCol) || WORD_BOOL_TOKENS.has(lower)) {
          proposals.push({ x, y, oldValue: str, newValue: mapped, status: 'pending' });
        }
      }
    }

    return proposals;
  }

  static validateDuplicateRows(dataframe: Dataframe): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    const rows = dataframe.data;
    const height = Math.min(dataframe.height, rows.length);
    const width = dataframe.width;
    const seen = new Map<string, number>();

    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (!row) continue;
      let hasContent = false;
      let key = '';
      for (let x = 0; x < width; x++) {
        const v = String(row[x] ?? '');
        if (!hasContent && v.trim() !== '') hasContent = true;
        key = x === 0 ? v : `${key}\x1f${v}`;
      }
      if (!hasContent) continue;

      const firstY = seen.get(key);
      if (firstY !== undefined) {
        proposals.push({
          x: 0,
          y,
          oldValue: `Row ${y + 1}`,
          newValue: `Row ${firstY + 1}`,
          dupOfY: firstY,
          isRowDeletion: true,
          status: 'pending'
        });
      } else {
        seen.set(key, y);
      }
    }

    return proposals;
  }

  static applyDuplicateRowProposals(
    dataframe: Dataframe,
    items: ValidationProposal[],
    allItems: ValidationProposal[] = []
  ): void {
    if (dataframe.lock || !items?.length) return;
    const rows = dataframe.data;
    let uniqueYs = Array.from(new Set(items.map(it => it.y)))
      .filter(y => y >= 0 && y < dataframe.height)
      .sort((a, b) => a - b);

    if (uniqueYs.length >= dataframe.height) {
      uniqueYs = uniqueYs.slice(1);
    }
    if (uniqueYs.length === 0) return;

    const countLessThan = (target: number): number => {
      let lo = 0;
      let hi = uniqueYs.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (uniqueYs[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const snapshots = uniqueYs.map(y => ({ y, row: [...(rows[y] || [])] }));
    const savedCoords = allItems.map(it => ({
      item: it,
      oldY: it.y,
      oldDupOfY: it.dupOfY,
      newY: it.y - countLessThan(it.y),
      newDupOfY: it.dupOfY !== undefined ? it.dupOfY - countLessThan(it.dupOfY!) : undefined,
    }));

    const deletedSet = uniqueYs.length > 1 ? new Set(uniqueYs) : null;

    const doFn = () => {
      if (deletedSet) {
        let writeIdx = 0;
        for (let readIdx = 0; readIdx < rows.length; readIdx++) {
          if (!deletedSet.has(readIdx)) {
            rows[writeIdx++] = rows[readIdx];
          }
        }
        rows.length = writeIdx;
      } else {
        rows.splice(snapshots[0].y, 1);
      }
      for (const c of savedCoords) {
        c.item.y = c.newY;
        if (c.newDupOfY !== undefined) c.item.dupOfY = c.newDupOfY;
      }
    };

    const undoFn = () => {
      if (snapshots.length > 1) {
        const oldLen = rows.length;
        const newLen = oldLen + snapshots.length;
        let readIdx = oldLen - 1;
        let snapIdx = snapshots.length - 1;
        rows.length = newLen;
        for (let writeIdx = newLen - 1; writeIdx >= 0; writeIdx--) {
          if (snapIdx >= 0 && snapshots[snapIdx].y === writeIdx) {
            rows[writeIdx] = [...snapshots[snapIdx--].row];
          } else {
            rows[writeIdx] = rows[readIdx--];
          }
        }
      } else {
        rows.splice(snapshots[0].y, 0, [...snapshots[0].row]);
      }
      for (const c of savedCoords) {
        c.item.y = c.oldY;
        if (c.oldDupOfY !== undefined) c.item.dupOfY = c.oldDupOfY;
      }
    };

    dataframe.record(doFn, undoFn);
  }

  static validateCurrency(dataframe: Dataframe): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    this.forEachCell(dataframe, (raw, x, y) => {
      const { iso3, remaining } = extractCurrency(raw);
      const formattedNum = parseCurrencyNumber(remaining);
      if (formattedNum !== null && (formattedNum !== raw || iso3)) {
        proposals.push({ x, y, oldValue: raw, newValue: formattedNum, iso3: iso3 || undefined, status: 'pending' });
      }
    });
    return proposals;
  }

  static applyCurrencyProposals(
    dataframe: Dataframe,
    items: ValidationProposal[],
    allItems: ValidationProposal[] = [],
    colMap: Map<number, number> = new Map()
  ): void {
    if (dataframe.lock || !items?.length) return;

    const byCol = new Map<number, ValidationProposal[]>();
    for (const item of items) {
      let list = byCol.get(item.x);
      if (!list) {
        list = [];
        byCol.set(item.x, list);
      }
      list.push(item);
    }

    const sortedCols = Array.from(byCol.keys()).sort((a, b) => b - a);
    const height = dataframe.height;
    const rows = dataframe.data;

    interface ColOp {
      x: number;
      insertCol: boolean;
      isoColIdx: number;
      isoCol: string[];
      cellEdits: { y: number; oldVal: string; newVal: string; oldIso?: string; newIso?: string }[];
    }

    const ops: ColOp[] = [];

    for (const x of sortedCols) {
      const colItems = byCol.get(x)!;
      const hasCurrency = colItems.some(it => Boolean(it.iso3));
      const existingIsoCol = colMap.get(x);
      const insertCol = hasCurrency && existingIsoCol === undefined;
      const isoColIdx = existingIsoCol ?? (x + 1);
      const isoCol = insertCol ? new Array<string>(height).fill('') : [];
      let row0IsDataCurrency = false;
      let row0NewVal: string | undefined;

      const cellEdits: ColOp['cellEdits'] = [];
      for (const item of colItems) {
        const y = item.y;
        const oldVal = rows[y]?.[x] ?? item.oldValue;
        const newVal = item.newValue;
        if (y === 0) row0NewVal = newVal;

        const newIso = item.iso3;
        if (newIso && y === 0) row0IsDataCurrency = true;

        if (insertCol && newIso) {
          isoCol[y] = newIso;
        }

        const oldIso = !insertCol && existingIsoCol !== undefined && newIso !== undefined
          ? (rows[y]?.[existingIsoCol] ?? '')
          : undefined;

        cellEdits.push({ y, oldVal, newVal, oldIso, newIso: !insertCol ? newIso : undefined });
      }

      if (insertCol && !row0IsDataCurrency && !isoCol[0]) {
        const headerBase = (row0NewVal ?? rows[0]?.[x] ?? '').trim();
        isoCol[0] = headerBase ? `${headerBase}_currency` : 'currency';
      }

      ops.push({ x, insertCol, isoColIdx, isoCol, cellEdits });
    }

    const shiftRefs = (col: number, delta: number) => {
      for (const item of allItems) {
        if (item.x > col) item.x += delta;
      }
      const nextEntries: [number, number][] = [];
      for (const [k, v] of colMap.entries()) {
        if (delta < 0 && k === col) continue;
        nextEntries.push([k > col ? k + delta : k, v > col ? v + delta : v]);
      }
      if (delta > 0) nextEntries.push([col, col + 1]);
      colMap.clear();
      for (const [k, v] of nextEntries) colMap.set(k, v);
    };

    const doFn = () => {
      for (const op of ops) {
        for (const edit of op.cellEdits) {
          if (rows[edit.y]) rows[edit.y][op.x] = edit.newVal;
          if (!op.insertCol && edit.newIso !== undefined && rows[edit.y]) {
            rows[edit.y][op.isoColIdx] = edit.newIso;
          }
        }
        if (op.insertCol) {
          for (let y = 0; y < height; y++) {
            rows[y]?.splice(op.x + 1, 0, op.isoCol[y]);
          }
          shiftRefs(op.x, 1);
        }
      }
    };

    const undoFn = () => {
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        if (op.insertCol) {
          for (let y = 0; y < height; y++) {
            rows[y]?.splice(op.x + 1, 1);
          }
          shiftRefs(op.x, -1);
        }
        for (const edit of op.cellEdits) {
          if (rows[edit.y]) rows[edit.y][op.x] = edit.oldVal;
          if (!op.insertCol && edit.oldIso !== undefined && rows[edit.y]) {
            rows[edit.y][op.isoColIdx] = edit.oldIso;
          }
        }
      }
    };

    dataframe.record(doFn, undoFn);
  }

  static validateCurrencyColumn(dataframe: Dataframe, colIndex: number): CurrencyValidationResult {
    if (dataframe.lock || colIndex < 0 || colIndex >= dataframe.width || dataframe.height === 0) {
      return { changedCount: 0, formattedCount: 0, currencyCount: 0, insertedCol: false };
    }

    const rows = dataframe.data;
    const height = dataframe.height;
    const swapCol = new Array<string>(height);
    const isoCol = new Array<string>(height);

    let changedCount = 0;
    let formattedCount = 0;
    let currencyCount = 0;
    let row0IsDataCurrency = false;

    for (let y = 0; y < height; y++) {
      const raw = rows[y]?.[colIndex] ?? '';
      if (!raw) {
        swapCol[y] = '';
        isoCol[y] = '';
        continue;
      }

      const { iso3, remaining } = extractCurrency(raw);
      const formattedNum = parseCurrencyNumber(remaining);

      if (formattedNum !== null) {
        swapCol[y] = formattedNum;
        formattedCount++;
        if (iso3) {
          isoCol[y] = iso3;
          currencyCount++;
          if (y === 0) row0IsDataCurrency = true;
        } else {
          isoCol[y] = '';
        }
      } else {
        swapCol[y] = raw;
        isoCol[y] = '';
      }

      if (swapCol[y] !== raw) changedCount++;
    }

    const insertedCol = currencyCount > 0;
    if (!insertedCol && changedCount === 0) {
      return { changedCount: 0, formattedCount: 0, currencyCount: 0, insertedCol: false };
    }

    if (insertedCol && !row0IsDataCurrency && !isoCol[0]) {
      const headerBase = swapCol[0].trim();
      isoCol[0] = headerBase ? `${headerBase}_currency` : 'currency';
    }

    let applied = false;
    const toggle = () => {
      const insertNow = !applied;
      applied = insertNow;
      for (let y = 0; y < height; y++) {
        const row = rows[y];
        const tmp = row[colIndex];
        row[colIndex] = swapCol[y];
        swapCol[y] = tmp;
        if (insertedCol) {
          if (insertNow) row.splice(colIndex + 1, 0, isoCol[y]);
          else row.splice(colIndex + 1, 1);
        }
      }
    };

    dataframe.record(toggle, toggle);
    return { changedCount, formattedCount, currencyCount, insertedCol };
  }

  static scanCells(dataframe: Dataframe, transform: (val: string) => string): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    this.forEachCell(dataframe, (oldValue, x, y) => {
      const newValue = transform(oldValue);
      if (newValue !== oldValue) proposals.push({ x, y, oldValue, newValue, status: 'pending' });
    });
    return proposals;
  }

  static validateHeaders(dataframe: Dataframe): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    const seen = new Set<string>();

    for (let x = 0; x < dataframe.width; x++) {
      const oldValue = dataframe.get(x, 0);
      let base = stripAccents(oldValue)
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!base) base = `col_${x + 1}`;
      else if (base.charCodeAt(0) >= 48 && base.charCodeAt(0) <= 57) base = `_${base}`;

      let candidate = base;
      let suffix = 1;
      while (seen.has(candidate)) candidate = `${base}_c${x + suffix++}`;
      seen.add(candidate);
      if (candidate !== oldValue) proposals.push({ x, y: 0, oldValue, newValue: candidate, status: 'pending' });
    }
    return proposals;
  }

  static validateDates(dataframe: Dataframe): ValidationRunResult {
    const yfList: { x: number; y: number; year: number; month: number; day: number; raw: string }[] = [];
    const ylList: { x: number; y: number; p1: number; p2: number; year: number; raw: string }[] = [];
    let dayFirst = 0, monthFirst = 0;

    this.forEachCell(dataframe, (val, x, y) => {
      const yf = parseYearFirstDate(val);
      if (yf) {
        yfList.push({ x, y, ...yf });
        return;
      }
      const yl = parseDateCandidate(val);
      if (yl) {
        if (yl.p1 > 12) dayFirst++;
        else if (yl.p2 > 12) monthFirst++;
        ylList.push({ x, y, ...yl });
      }
    });

    if (yfList.length === 0 && ylList.length === 0) return { proposals: [], reason: 'no_dates' };

    const proposals: ValidationProposal[] = [];
    for (const c of yfList) {
      const newValue = fmtIsoDate(c.year, c.month, c.day);
      if (c.raw !== newValue) proposals.push({ x: c.x, y: c.y, oldValue: c.raw, newValue, status: 'pending' });
    }

    let reason: 'coexistence' | 'ambiguous' | undefined;
    if (ylList.length > 0) {
      if (dayFirst > 0 && monthFirst > 0) {
        reason = 'coexistence';
      } else if (dayFirst === 0 && monthFirst === 0) {
        reason = 'ambiguous';
      } else {
        const isDayFirst = dayFirst > 0;
        for (const c of ylList) {
          const newValue = fmtIsoDate(c.year, isDayFirst ? c.p2 : c.p1, isDayFirst ? c.p1 : c.p2);
          if (c.raw !== newValue) proposals.push({ x: c.x, y: c.y, oldValue: c.raw, newValue, status: 'pending' });
        }
      }
    }

    return { proposals, reason };
  }
}
