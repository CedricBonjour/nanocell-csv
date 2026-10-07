/**
 * @file core/csv/CsvParser.ts
 * Streaming RFC 4180 CSV parser.
 * Supports strings and Uint8Array binary buffers, quoted multiline records, and CRLF / LF / CR.
 * ZERO browser/DOM imports.
 */

import { CsvDialect, DEFAULT_CSV_DIALECT } from './CsvTypes.js';
import { SeparatorDetector } from './SeparatorDetector.js';

export class CsvParser {
  private dialect: CsvDialect;
  private buffer: string = '';
  private textDecoder: TextDecoder | null = null;
  constructor(dialect?: Partial<CsvDialect>) {
    this.dialect = { ...DEFAULT_CSV_DIALECT, ...dialect };
    if (this.dialect.delimiter === 'TAB') {
      this.dialect = { ...this.dialect, delimiter: '\t' };
    }
  }

  detectSeparator(sample: string): string {
    const sep = SeparatorDetector.detect(sample);
    this.dialect = { ...this.dialect, delimiter: sep };
    return sep;
  }

  setDelimiter(delimiter: string): void {
    const sep = delimiter === 'TAB' ? '\t' : delimiter;
    this.dialect = { ...this.dialect, delimiter: sep };
  }

  getDelimiter(): string {
    return this.dialect.delimiter;
  }

  reset(): void {
    this.buffer = '';
    this.textDecoder = null;
  }

  /**
   * Parses a progressive chunk of string or binary data.
   * @param chunk String content or Uint8Array binary bytes.
   * @param isLastChunk Whether this chunk concludes the input stream.
   * @returns Array of fully finalized records parsed in this chunk.
   */
  parseChunk(chunk: string | Uint8Array, isLastChunk: boolean): string[][] {
    let textChunk = '';

    if (chunk instanceof Uint8Array) {
      if (!this.textDecoder) {
        this.textDecoder = new TextDecoder('utf-8', { fatal: false });
      }
      textChunk = this.textDecoder.decode(chunk, { stream: !isLastChunk });
    } else {
      textChunk = chunk || '';
    }

    const textToProcess = this.buffer + textChunk;
    const len = textToProcess.length;
    const sep = this.dialect.delimiter;
    const quote = this.dialect.quoteChar;
    let parsedRows: string[][] = [];

    let i = 0;
    let inQuotes = false;
    let currentCell = '';
    let currentRow: string[] = [];
    let lastSafeIndex = 0;

    while (i < len) {
      const c = textToProcess[i];

      if (inQuotes) {
        if (c === quote) {
          if (i + 1 < len) {
            if (textToProcess[i + 1] === quote) {
              // Escaped double-quote: "" -> "
              currentCell += quote;
              i += 2;
            } else {
              // Closing quote
              inQuotes = false;
              i += 1;
            }
          } else {
            // Quote at boundary; wait for next chunk
            break;
          }
        } else {
          currentCell += c;
          i += 1;
        }
      } else {
        if (c === quote) {
          inQuotes = true;
          i += 1;
        } else if (c === sep) {
          currentRow.push(currentCell);
          currentCell = '';
          i += 1;
        } else if (c === '\n' || c === '\r') {
          // Check for split \r\n across chunk boundary
          if (c === '\r' && i + 1 >= len && !isLastChunk) {
            break;
          }

          // Strip trailing carriage return if field wasn't quoted
          if (currentCell.endsWith('\r')) {
            currentCell = currentCell.slice(0, -1);
          }

          currentRow.push(currentCell);
          currentCell = '';
          parsedRows.push(currentRow);
          currentRow = [];

          if (c === '\r' && i + 1 < len && textToProcess[i + 1] === '\n') {
            i += 2;
          } else {
            i += 1;
          }
          lastSafeIndex = i;
        } else {
          currentCell += c;
          i += 1;
        }
      }
    }

    if (!isLastChunk) {
      if (lastSafeIndex > 0) {
        this.buffer = textToProcess.slice(lastSafeIndex);
      } else {
        this.buffer = textToProcess;
        parsedRows = [];
      }
    } else {
      // Finalize trailing EOF content
      if (currentCell.length > 0 || currentRow.length > 0) {
        if (currentCell.endsWith('\r')) {
          currentCell = currentCell.slice(0, -1);
        }
        currentRow.push(currentCell);
        parsedRows.push(currentRow);
      }
      this.reset();
    }

    return parsedRows;
  }

  /**
   * Parses entire string or byte sequence into a complete 2D matrix.
   */
  parseAll(input: string | Uint8Array, dialect?: Partial<CsvDialect>): string[][] {
    if (dialect) {
      const targetDelimiter = dialect.delimiter === 'TAB' ? '\t' : (dialect.delimiter ?? this.dialect.delimiter);
      this.dialect = {
        ...this.dialect,
        ...dialect,
        delimiter: targetDelimiter
      };
    }
    this.reset();
    return this.parseChunk(input, true);
  }

  /**
   * Alias for parseAll for convenience.
   */
  parse(content: string, dialect?: Partial<CsvDialect>): string[][] {
    return this.parseAll(content, dialect);
  }
}
