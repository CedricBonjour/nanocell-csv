/**
 * @file core/csv/CsvTypes.ts
 * CSV dialect configuration and parse result types.
 * ZERO browser/DOM imports.
 */

export interface CsvDialect {
  readonly delimiter: string;
  readonly quoteChar: string;
  readonly escapeChar: string;
  readonly lineTerminator: '\r\n' | '\n' | '\r';
  readonly hasHeaders: boolean;
  readonly isStrict: boolean;
  readonly fixedWidth?: number;
  readonly trimUnquotedWhitespace?: boolean;
  readonly quoteAlways?: boolean;
  readonly commentChar?: string;
}

export const DEFAULT_CSV_DIALECT: CsvDialect = {
  delimiter: ',',
  quoteChar: '"',
  escapeChar: '"',
  lineTerminator: '\r\n',
  hasHeaders: false,
  isStrict: false,
  fixedWidth: 0,
  trimUnquotedWhitespace: false,
  quoteAlways: false,
  commentChar: ''
};
