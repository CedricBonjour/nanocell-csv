/**
 * @file core/csv/CsvSerializer.ts
 * RFC 4180 compliant CSV serializer with selective quoting, strict mode validation,
 * and configurable fixed-width padding.
 * ZERO browser/DOM imports.
 */

import { CellValue } from '../model/Cell.js';
import { CsvDialect, DEFAULT_CSV_DIALECT } from './CsvTypes.js';

export class CsvSerializer {
  private dialect: CsvDialect;

  constructor(dialect?: Partial<CsvDialect>) {
    this.dialect = { ...DEFAULT_CSV_DIALECT, ...dialect };
    if (this.dialect.delimiter === 'TAB') {
      this.dialect = { ...this.dialect, delimiter: '\t' };
    }
  }

  serialize(matrix: readonly (readonly CellValue[])[], dialect?: Partial<CsvDialect>): string {
    const opts = dialect ? { ...this.dialect, ...dialect } : this.dialect;
    let sep = opts.delimiter;
    if (sep === 'TAB') sep = '\t';
    const fw = opts.fixedWidth ?? 0;
    const spaces = fw > 0 ? ' '.repeat(fw) : '';
    const isStrict = opts.isStrict;
    const lineTerm = opts.lineTerminator ?? '\n';

    const outputRows: string[] = [];

    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      const outputRow: string[] = [];

      for (let c = 0; c < row.length; c++) {
        let cellStr = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
        let requiresQuote = opts.quoteAlways ?? false;

        // Determine if quoting is mandatory
        for (let i = 0; i < cellStr.length; i++) {
          const char = cellStr[i];
          if (char === sep || char === '\n' || char === '\r') {
            requiresQuote = true;
          }
          if (char === '"') {
            requiresQuote = true;
            // Escape double quotes: " -> ""
            cellStr = cellStr.slice(0, i) + '"' + cellStr.slice(i);
            i++; // Skip inserted quote
          }
        }

        if (requiresQuote && isStrict) {
          throw new Error('Strict csv format not respected <br><br> save aborted');
        }

        if (requiresQuote) {
          cellStr = '"' + cellStr + '"';
        }

        if (fw > 0 && fw > cellStr.length) {
          cellStr = (spaces + cellStr).slice(-fw);
        }

        outputRow.push(cellStr);
      }

      outputRows.push(outputRow.join(sep));
    }

    return outputRows.join(lineTerm);
  }
}
