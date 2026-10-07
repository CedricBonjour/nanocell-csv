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
}

export const DEFAULT_CSV_DIALECT: CsvDialect = {
  delimiter: ',',
  quoteChar: '"',
  escapeChar: '"',
  lineTerminator: '\n',
  hasHeaders: false,
  isStrict: false,
  fixedWidth: 0,
  trimUnquotedWhitespace: false,
  quoteAlways: false
};

export interface ParseResult {
  readonly rows: string[][];
  readonly isComplete: boolean;
  readonly rowCount: number;
}
