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

    if (chunk instanceof Uint8Array || ArrayBuffer.isView(chunk)) {
      if (!this.textDecoder) {
        this.textDecoder = new TextDecoder('utf-8', { fatal: false });
      }
      textChunk = this.textDecoder.decode(chunk, { stream: !isLastChunk });
    } else {
      textChunk = typeof chunk === 'string' ? chunk : '';
    }

    let textToProcess = this.buffer + textChunk;
    if (this.buffer === '' && textToProcess.charCodeAt(0) === 0xFEFF) {
      textToProcess = textToProcess.slice(1);
    }
    const len = textToProcess.length;
    const sep = this.dialect.delimiter;
    const quote = this.dialect.quoteChar;
    const escapeChar = this.dialect.escapeChar ?? DEFAULT_CSV_DIALECT.escapeChar ?? '"';
    const isBackslashEscape = escapeChar === '\\';
    const commentChar = this.dialect.commentChar ?? '';
    let parsedRows: string[][] = [];

    const trimUnquoted = this.dialect.trimUnquotedWhitespace ?? false;
    let i = 0;
    let inQuotes = false;
    let cellWasQuoted = false;
    let quoteClosed = false;
    let currentCell = '';
    let currentRow: string[] = [];
    let lastSafeIndex = 0;
    let segmentStart = 0;

    while (i < len) {
      const c = textToProcess[i];

      // Comment line skipping (only at the start of a record outside quotes)
      if (commentChar && !inQuotes && currentRow.length === 0 && currentCell === '') {
        let checkIdx = i;
        while (checkIdx < len && (textToProcess[checkIdx] === ' ' || textToProcess[checkIdx] === '\t')) {
          checkIdx++;
        }
        if (checkIdx < len && textToProcess.startsWith(commentChar, checkIdx)) {
          i = checkIdx;
          while (i < len && textToProcess[i] !== '\n' && textToProcess[i] !== '\r') {
            i++;
          }
          if (i < len) {
            if (textToProcess[i] === '\r' && i + 1 < len && textToProcess[i + 1] === '\n') {
              i += 2;
            } else {
              i += 1;
            }
            lastSafeIndex = i;
            segmentStart = i;
          } else {
            if (!isLastChunk) {
              break;
            }
            lastSafeIndex = i;
            segmentStart = i;
          }
          continue;
        }
      }

      if (inQuotes) {
        if (isBackslashEscape && c === '\\') {
          if (i + 1 < len) {
            const next = textToProcess[i + 1];
            if (i > segmentStart) {
              currentCell += textToProcess.slice(segmentStart, i);
            }
            if (next === quote) {
              currentCell += quote;
            } else if (next === '\\') {
              currentCell += '\\';
            } else if (next === 'n') {
              currentCell += '\n';
            } else if (next === 'r') {
              currentCell += '\r';
            } else if (next === 't') {
              currentCell += '\t';
            } else {
              currentCell += next;
            }
            i += 2;
            segmentStart = i;
          } else if (isLastChunk) {
            i += 1;
          } else {
            break;
          }
        } else if (c === quote) {
          if (i > segmentStart) {
            currentCell += textToProcess.slice(segmentStart, i);
          }
          if (i + 1 < len) {
            if (textToProcess[i + 1] === quote) {
              // Escaped double-quote: "" -> "
              currentCell += quote;
              i += 2;
              segmentStart = i;
            } else {
              // Closing quote
              inQuotes = false;
              cellWasQuoted = true;
              quoteClosed = true;
              i += 1;
              segmentStart = i;
            }
          } else if (isLastChunk) {
            // Closing quote at end of file
            inQuotes = false;
            cellWasQuoted = true;
            quoteClosed = true;
            i += 1;
            segmentStart = i;
          } else {
            // Quote at boundary; wait for next chunk
            break;
          }
        } else {
          i += 1;
        }
      } else {
        if (isBackslashEscape && c === '\\') {
          if (i + 1 < len) {
            const next = textToProcess[i + 1];
            if (next === sep || next === quote || next === '\\' || next === 'n' || next === 'r' || next === 't') {
              if (i > segmentStart) {
                currentCell += textToProcess.slice(segmentStart, i);
              }
              if (next === 'n') currentCell += '\n';
              else if (next === 'r') currentCell += '\r';
              else if (next === 't') currentCell += '\t';
              else currentCell += next;
              i += 2;
              segmentStart = i;
            } else {
              i += 1;
            }
          } else if (isLastChunk) {
            i += 1;
          } else {
            break;
          }
        } else if (c === quote) {
          if (i > segmentStart) {
            currentCell += textToProcess.slice(segmentStart, i);
          }
          // Discard leading whitespace outside opening quote if trimming
          if (trimUnquoted && currentCell.trim() === '') {
            currentCell = '';
          }
          inQuotes = true;
          cellWasQuoted = true;
          quoteClosed = false;
          i += 1;
          segmentStart = i;
        } else if (quoteClosed && trimUnquoted && (c === ' ' || c === '\t')) {
          // Ignore trailing whitespace outside closing quote
          i += 1;
          segmentStart = i;
        } else if (c === sep) {
          if (i > segmentStart) {
            currentCell += textToProcess.slice(segmentStart, i);
          }
          let finalCell = (!cellWasQuoted && trimUnquoted) ? currentCell.trim() : currentCell;
          currentRow.push(finalCell);
          currentCell = '';
          cellWasQuoted = false;
          quoteClosed = false;
          i += 1;
          segmentStart = i;
        } else if (c === '\n' || c === '\r') {
          // Check for split \r\n across chunk boundary
          if (c === '\r' && i + 1 >= len && !isLastChunk) {
            break;
          }

          if (i > segmentStart) {
            currentCell += textToProcess.slice(segmentStart, i);
          }

          // Strip trailing carriage return if field wasn't quoted
          if (currentCell.endsWith('\r')) {
            currentCell = currentCell.slice(0, -1);
          }

          let finalCell = (!cellWasQuoted && trimUnquoted) ? currentCell.trim() : currentCell;

          currentRow.push(finalCell);
          currentCell = '';
          cellWasQuoted = false;
          quoteClosed = false;
          parsedRows.push(currentRow);
          currentRow = [];

          if (c === '\r' && i + 1 < len && textToProcess[i + 1] === '\n') {
            i += 2;
          } else {
            i += 1;
          }
          lastSafeIndex = i;
          segmentStart = i;
        } else {
          i += 1;
        }
      }
    }

    if (i > segmentStart) {
      currentCell += textToProcess.slice(segmentStart, i);
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
      if (cellWasQuoted || currentCell.length > 0 || currentRow.length > 0) {
        if (currentCell.endsWith('\r')) {
          currentCell = currentCell.slice(0, -1);
        }
        let finalCell = (!cellWasQuoted && trimUnquoted) ? currentCell.trim() : currentCell;
        currentRow.push(finalCell);
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
