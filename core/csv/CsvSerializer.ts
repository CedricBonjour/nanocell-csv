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
    const lineTerm = opts.lineTerminator ?? DEFAULT_CSV_DIALECT.lineTerminator ?? '\r\n';

    const outputRows: string[] = [];

    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      const outputRow: string[] = [];

      for (let c = 0; c < row.length; c++) {
        let cellStr = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
        let requiresQuote = opts.quoteAlways ?? false;
        const escapeChar = opts.escapeChar ?? DEFAULT_CSV_DIALECT.escapeChar ?? '"';

        if (escapeChar === '\\') {
          if (cellStr.includes('\\')) {
            cellStr = cellStr.replaceAll('\\', '\\\\');
          }
          if (cellStr.includes('"')) {
            requiresQuote = true;
            cellStr = cellStr.replaceAll('"', '\\"');
          }
        } else {
          const hasQuote = cellStr.includes('"');
          if (hasQuote) {
            requiresQuote = true;
            cellStr = cellStr.replaceAll('"', '""');
          }
        }

        if (!requiresQuote && (cellStr.includes(sep) || cellStr.includes('\n') || cellStr.includes('\r'))) {
          requiresQuote = true;
        }

        if (requiresQuote && isStrict) {
          throw new Error('Strict csv format not respected: save aborted');
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

  /**
   * Serializes a 2D matrix into a JSON string formatted as array of objects (if hasHeader) or array of arrays.
   */
  serializeJson(matrix: readonly (readonly CellValue[])[], options?: { hasHeader?: boolean; pretty?: boolean }): string {
    if (!matrix || matrix.length === 0) return options?.pretty !== false ? '[]\n' : '[]';

    const hasHeader = options?.hasHeader ?? (matrix.length > 1);
    const pretty = options?.pretty !== false;
    const indent = pretty ? 2 : undefined;

    if (!hasHeader || matrix.length <= 1) {
      const rawRows = matrix.map(row => row.map(v => (v !== undefined && v !== null ? String(v) : '')));
      return JSON.stringify(rawRows, null, indent);
    }

    const rawHeaders = matrix[0];
    const seenHeaders = new Map<string, number>();
    const headers = rawHeaders.map((h, colIdx) => {
      let key = h !== undefined && h !== null && String(h).trim() !== '' ? String(h).trim() : `col_${colIdx + 1}`;
      const count = seenHeaders.get(key) ?? 0;
      seenHeaders.set(key, count + 1);
      if (count > 0) {
        key = `${key}_${count + 1}`;
      }
      return key;
    });

    const records: Record<string, string>[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      const record: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        const val = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
        record[headers[c]] = val;
      }
      records.push(record);
    }

    return JSON.stringify(records, null, indent);
  }

  /**
   * Serializes a 2D matrix into a GitHub Flavored Markdown table.
   */
  serializeMarkdown(matrix: readonly (readonly CellValue[])[], options?: { hasHeader?: boolean }): string {
    if (!matrix || matrix.length === 0 || matrix[0].length === 0) return '';

    const hasHeader = options?.hasHeader ?? true;
    let colCount = 0;
    for (let r = 0; r < matrix.length; r++) {
      if (matrix[r].length > colCount) {
        colCount = matrix[r].length;
      }
    }
    if (colCount === 0) return '';

    const formatCell = (val: CellValue): string => {
      if (val === undefined || val === null) return '';
      return String(val)
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>');
    };

    const lines: string[] = [];
    const headerRow = (hasHeader && matrix.length > 0) ? matrix[0] : null;
    const headerCells: string[] = [];

    for (let c = 0; c < colCount; c++) {
      const val = headerRow ? headerRow[c] : undefined;
      const h = val !== undefined && val !== null && String(val).trim() !== ''
        ? formatCell(val)
        : `col_${c + 1}`;
      headerCells.push(` ${h} `);
    }
    lines.push(`|${headerCells.join('|')}|`);
    lines.push(`|${new Array(colCount).fill(' --- ').join('|')}|`);

    const startRow = headerRow ? 1 : 0;
    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r];
      const rowCells: string[] = [];
      for (let c = 0; c < colCount; c++) {
        rowCells.push(` ${formatCell(row[c])} `);
      }
      lines.push(`|${rowCells.join('|')}|`);
    }

    return lines.join('\n');
  }

  /**
   * Shortcut for serializing matrix as Tab-Separated Values (TSV).
   */
  serializeTsv(matrix: readonly (readonly CellValue[])[]): string {
    return this.serialize(matrix, { delimiter: '\t' });
  }
}
