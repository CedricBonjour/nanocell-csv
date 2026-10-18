/**
 * @file app/core/Csv.ts
 * Streaming RFC 4180 CSV parser, delimiter auto-detector, and multi-format serializer
 * (CSV, TSV, JSON, Markdown) with selective quoting, strict mode, and fixed-width padding.
 * ZERO browser/DOM imports.
 */

import { CellValue, normalizeCellValue } from './Dataframe.js';

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
  readonly encoding?: string;
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

function resolveDialect(base: CsvDialect, override?: Partial<CsvDialect>): CsvDialect {
  if (!override) return base;
  const merged = { ...base, ...override };
  return merged.delimiter === 'TAB' ? { ...merged, delimiter: '\t' } : merged;
}

const unescapeChar = (ch: string) =>
  ch === 'n' ? '\n' : ch === 'r' ? '\r' : ch === 't' ? '\t' : ch;

export class EncodingDetector {
  private static readonly SAMPLE_BYTE_LIMIT = 8192;

  static detectBOM(bytes: Uint8Array): string | null {
    if (!bytes || bytes.length < 2) return null;
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'utf-8';
    }
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'utf-16le';
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'utf-16be';
    }
    return null;
  }

  static detect(input: Uint8Array | ArrayBuffer | ArrayBufferView | null | undefined): string {
    if (!input) return 'utf-8';
    const bytes = input instanceof Uint8Array
      ? input
      : (ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : (input instanceof ArrayBuffer ? new Uint8Array(input) : null));
    if (!bytes || bytes.length === 0) return 'utf-8';

    const bom = EncodingDetector.detectBOM(bytes);
    if (bom) return bom;

    const len = Math.min(bytes.length, EncodingDetector.SAMPLE_BYTE_LIMIT);
    const isTruncatedSample = bytes.length > len;

    // 1. BOM-less UTF-16LE / UTF-16BE detection via null-byte stride on 16-bit pairs
    const pairs = len >> 1;
    if (pairs >= 2) {
      let evenNulls = 0;
      let oddNulls = 0;
      for (let i = 0, limit = pairs << 1; i < limit; i += 2) {
        if (bytes[i] === 0x00) evenNulls++;
        if (bytes[i + 1] === 0x00) oddNulls++;
      }
      if (oddNulls > pairs * 0.3 && evenNulls <= pairs * 0.05) return 'utf-16le';
      if (evenNulls > pairs * 0.3 && oddNulls <= pairs * 0.05) return 'utf-16be';
    }

    // 2. Single-pass UTF-8 sequence validation
    let highBytes = 0;
    let utf8Invalid = 0;
    for (let i = 0; i < len;) {
      const b0 = bytes[i];
      if (b0 < 0x80) {
        i++;
        continue;
      }
      highBytes++;
      if (b0 >= 0xC2 && b0 <= 0xDF) {
        if (i + 1 >= len) {
          if (!isTruncatedSample) utf8Invalid++;
          break;
        }
        if ((bytes[i + 1] & 0xC0) === 0x80) {
          highBytes++;
          i += 2;
        } else {
          utf8Invalid++;
          i++;
        }
      } else if (b0 >= 0xE0 && b0 <= 0xEF) {
        if (i + 2 >= len) {
          if (!isTruncatedSample) {
            utf8Invalid++;
          } else if (i + 1 < len) {
            const b1 = bytes[i + 1];
            if ((b1 & 0xC0) !== 0x80 || (b0 === 0xE0 && b1 < 0xA0) || (b0 === 0xED && b1 > 0x9F)) {
              utf8Invalid++;
            }
          }
          break;
        }
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        if (
          (b1 & 0xC0) === 0x80 &&
          (b2 & 0xC0) === 0x80 &&
          !(b0 === 0xE0 && b1 < 0xA0) &&
          !(b0 === 0xED && b1 > 0x9F)
        ) {
          highBytes += 2;
          i += 3;
        } else {
          utf8Invalid++;
          i++;
        }
      } else if (b0 >= 0xF0 && b0 <= 0xF4) {
        if (i + 3 >= len) {
          if (!isTruncatedSample) {
            utf8Invalid++;
          } else if (i + 1 < len) {
            const b1 = bytes[i + 1];
            if ((b1 & 0xC0) !== 0x80 || (b0 === 0xF0 && b1 < 0x90) || (b0 === 0xF4 && b1 > 0x8F)) {
              utf8Invalid++;
            } else if (i + 2 < len && (bytes[i + 2] & 0xC0) !== 0x80) {
              utf8Invalid++;
            }
          }
          break;
        }
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        const b3 = bytes[i + 3];
        if (
          (b1 & 0xC0) === 0x80 &&
          (b2 & 0xC0) === 0x80 &&
          (b3 & 0xC0) === 0x80 &&
          !(b0 === 0xF0 && b1 < 0x90) &&
          !(b0 === 0xF4 && b1 > 0x8F)
        ) {
          highBytes += 3;
          i += 4;
        } else {
          utf8Invalid++;
          i++;
        }
      } else {
        utf8Invalid++;
        i++;
      }
    }

    if (highBytes === 0 || utf8Invalid === 0) return 'utf-8';

    // 3. Non-UTF-8 Heuristic Classification (Shift-JIS, GB18030/GBK, Windows-1251, Windows-1252)
    let sjisPairs = 0;
    let sjisLowLeadPairs = 0;
    let sjisHighTrailPairs = 0;
    let win1252SmartPunctPairs = 0;
    let sjisInvalid = 0;
    for (let i = 0; i < len;) {
      const b0 = bytes[i];
      if (b0 < 0x80) {
        i++;
      } else if ((b0 >= 0x81 && b0 <= 0x9F) || (b0 >= 0xE0 && b0 <= 0xEF)) {
        if (i + 1 >= len) {
          if (!isTruncatedSample) sjisInvalid++;
          break;
        }
        const b1 = bytes[i + 1];
        if ((b1 >= 0x40 && b1 <= 0x7E) || (b1 >= 0x80 && b1 <= 0xFC)) {
          sjisPairs++;
          if (b0 >= 0x81 && b0 <= 0x9F) sjisLowLeadPairs++;
          if (b1 >= 0x80) sjisHighTrailPairs++;
          if (b0 >= 0x91 && b0 <= 0x97 && b1 >= 0x40 && b1 <= 0x7E) win1252SmartPunctPairs++;
          i += 2;
        } else {
          sjisInvalid++;
          i++;
        }
      } else if (b0 >= 0xA1 && b0 <= 0xDF) {
        i++;
      } else {
        sjisInvalid++;
        i++;
      }
    }

    let gbkPairs = 0;
    let gb2312CorePairs = 0;
    let gbkInvalid = 0;
    for (let i = 0; i < len;) {
      const b0 = bytes[i];
      if (b0 < 0x80) {
        i++;
      } else if (b0 >= 0x81 && b0 <= 0xFE) {
        if (i + 1 >= len) {
          if (!isTruncatedSample) gbkInvalid++;
          break;
        }
        const b1 = bytes[i + 1];
        if ((b1 >= 0x40 && b1 <= 0x7E) || (b1 >= 0x80 && b1 <= 0xFE)) {
          gbkPairs++;
          if (b0 >= 0xA1 && b0 <= 0xD7 && b1 >= 0xA1 && b1 <= 0xFE) gb2312CorePairs++;
          i += 2;
        } else {
          gbkInvalid++;
          i++;
        }
      } else {
        gbkInvalid++;
        i++;
      }
    }

    const isCyrillicUpper = (b: number) => (b >= 0xC0 && b <= 0xDF) || b === 0xA8;
    const isCyrillicLower = (b: number) => (b >= 0xE0 && b <= 0xFF) || b === 0xB8;
    const isCyrillicLetter = (b: number) => isCyrillicUpper(b) || isCyrillicLower(b);

    let cyrillicBytes = 0;
    let cyrillicLowerBytes = 0;
    let cyrillicWordRuns = 0;
    for (let i = 0; i < len;) {
      if (!isCyrillicLetter(bytes[i])) {
        i++;
        continue;
      }
      let runEnd = i;
      let allLowerAfterFirst = true;
      let allUpper = isCyrillicUpper(bytes[i]);
      while (runEnd < len && isCyrillicLetter(bytes[runEnd])) {
        const b = bytes[runEnd];
        cyrillicBytes++;
        if (isCyrillicLower(b)) cyrillicLowerBytes++;
        if (runEnd > i && !isCyrillicLower(b)) allLowerAfterFirst = false;
        if (!isCyrillicUpper(b)) allUpper = false;
        runEnd++;
      }
      const runLen = runEnd - i;
      if (runLen >= 3 && (allLowerAfterFirst || allUpper)) {
        cyrillicWordRuns++;
      }
      i = runEnd;
    }

    if (
      sjisInvalid === 0 &&
      sjisLowLeadPairs > 0 &&
      (sjisHighTrailPairs > 0 || (sjisPairs >= 2 && win1252SmartPunctPairs === 0)) &&
      sjisPairs * 2 >= highBytes * 0.5
    ) {
      return 'shift_jis';
    }
    if (
      cyrillicWordRuns > 0 &&
      cyrillicBytes >= highBytes * 0.75 &&
      (gbkInvalid > 0 || gb2312CorePairs === 0 || cyrillicLowerBytes >= cyrillicBytes * 0.5)
    ) {
      return 'windows-1251';
    }
    if (gbkInvalid === 0 && gb2312CorePairs > 0 && gbkPairs > 0) {
      return 'gb18030';
    }

    return 'windows-1252';
  }
}

export class SeparatorDetector {
  private static readonly CANDIDATES = [',', '\t', ';', '|'];
  private static readonly SAMPLE_LIMIT = 2000;

  static detect(sample: string, candidates: readonly string[] = SeparatorDetector.CANDIDATES): string {
    if (!sample || typeof sample !== 'string') return ',';
    const text = sample.length > SeparatorDetector.SAMPLE_LIMIT ? sample.slice(0, SeparatorDetector.SAMPLE_LIMIT) : sample;
    const counts = new Array<number>(candidates.length).fill(0);
    let inQuotes = false;

    for (let i = 0, len = text.length; i < len; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && i + 1 < len && text[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (!inQuotes) {
        const idx = candidates.indexOf(char);
        if (idx !== -1) counts[idx]++;
      }
    }

    let maxCount = 0, dominantIndex = 0;
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] > maxCount) {
        maxCount = counts[j];
        dominantIndex = j;
      }
    }
    return maxCount > 0 ? candidates[dominantIndex] : ',';
  }
}

export class CsvParser {
  private dialect: CsvDialect;
  private buffer = '';
  private textDecoder: TextDecoder | null = null;

  constructor(dialect?: Partial<CsvDialect>) {
    this.dialect = resolveDialect(DEFAULT_CSV_DIALECT, dialect);
  }

  reset(): void {
    this.buffer = '';
    this.textDecoder = null;
  }

  parseChunk(chunk: string | Uint8Array, isLastChunk: boolean): string[][] {
    let textChunk = '';
    if (chunk instanceof Uint8Array || ArrayBuffer.isView(chunk)) {
      const bytes = chunk instanceof Uint8Array
        ? chunk
        : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (!this.textDecoder) {
        const encoding = this.dialect.encoding || EncodingDetector.detect(bytes);
        this.textDecoder = new TextDecoder(encoding, { fatal: false });
      }
      textChunk = this.textDecoder.decode(bytes, { stream: !isLastChunk });
    } else if (typeof chunk === 'string') {
      textChunk = chunk;
    }

    let text = this.buffer + textChunk;
    if (this.buffer === '' && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const len = text.length;
    const { delimiter: sep, quoteChar: quote, commentChar = '', trimUnquotedWhitespace: trimUnquoted = false } = this.dialect;
    const isBackslashEscape = (this.dialect.escapeChar ?? '"') === '\\';

    let parsedRows: string[][] = [];
    let i = 0, inQuotes = false, cellWasQuoted = false, quoteClosed = false;
    let currentCell = '', currentRow: string[] = [];
    let lastSafeIndex = 0, segmentStart = 0;

    const flushCell = (stripCr = false) => {
      if (i > segmentStart) currentCell += text.slice(segmentStart, i);
      if (stripCr && currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
      currentRow.push((!cellWasQuoted && trimUnquoted) ? currentCell.trim() : currentCell);
      currentCell = '';
      cellWasQuoted = quoteClosed = false;
    };

    while (i < len) {
      const c = text[i];

      if (commentChar && !inQuotes && currentRow.length === 0 && currentCell === '') {
        let checkIdx = i;
        while (checkIdx < len && (text[checkIdx] === ' ' || text[checkIdx] === '\t')) checkIdx++;
        if (checkIdx < len && text.startsWith(commentChar, checkIdx)) {
          i = checkIdx;
          while (i < len && text[i] !== '\n' && text[i] !== '\r') i++;
          if (i < len) {
            i += (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') ? 2 : 1;
            lastSafeIndex = segmentStart = i;
          } else {
            if (!isLastChunk) break;
            lastSafeIndex = segmentStart = i;
          }
          continue;
        }
      }

      if (inQuotes) {
        if (isBackslashEscape && c === '\\') {
          if (i + 1 < len) {
            if (i > segmentStart) currentCell += text.slice(segmentStart, i);
            currentCell += unescapeChar(text[i + 1]);
            segmentStart = i += 2;
          } else if (isLastChunk) i++;
          else break;
        } else if (c === quote) {
          if (i > segmentStart) currentCell += text.slice(segmentStart, i);
          if (i + 1 < len && text[i + 1] === quote) {
            currentCell += quote;
            segmentStart = i += 2;
          } else if (i + 1 < len || isLastChunk) {
            inQuotes = false;
            cellWasQuoted = quoteClosed = true;
            segmentStart = ++i;
          } else {
            break;
          }
        } else {
          i++;
        }
      } else if (isBackslashEscape && c === '\\') {
        if (i + 1 < len) {
          const next = text[i + 1];
          if (next === sep || next === quote || next === '\\' || next === 'n' || next === 'r' || next === 't') {
            if (i > segmentStart) currentCell += text.slice(segmentStart, i);
            currentCell += unescapeChar(next);
            segmentStart = i += 2;
          } else i++;
        } else if (isLastChunk) i++;
        else break;
      } else if (c === quote) {
        if (i > segmentStart) currentCell += text.slice(segmentStart, i);
        if (trimUnquoted && currentCell.trim() === '') currentCell = '';
        inQuotes = cellWasQuoted = true;
        quoteClosed = false;
        segmentStart = ++i;
      } else if (quoteClosed && trimUnquoted && (c === ' ' || c === '\t')) {
        segmentStart = ++i;
      } else if (c === sep) {
        flushCell(false);
        segmentStart = ++i;
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && i + 1 >= len && !isLastChunk) break;
        flushCell(true);
        parsedRows.push(currentRow);
        currentRow = [];
        i += (c === '\r' && i + 1 < len && text[i + 1] === '\n') ? 2 : 1;
        lastSafeIndex = segmentStart = i;
      } else {
        i++;
      }
    }

    if (i > segmentStart) currentCell += text.slice(segmentStart, i);

    if (!isLastChunk) {
      if (lastSafeIndex > 0) this.buffer = text.slice(lastSafeIndex);
      else {
        this.buffer = text;
        parsedRows = [];
      }
    } else {
      if (cellWasQuoted || currentCell.length > 0 || currentRow.length > 0) {
        segmentStart = i;
        flushCell(true);
        parsedRows.push(currentRow);
      }
      this.reset();
    }

    return parsedRows;
  }

  parse(input: string | Uint8Array, dialect?: Partial<CsvDialect>): string[][] {
    this.dialect = resolveDialect(this.dialect, dialect);
    this.reset();
    return this.parseChunk(input, true);
  }
}

export class CsvSerializer {
  private dialect: CsvDialect;

  constructor(dialect?: Partial<CsvDialect>) {
    this.dialect = resolveDialect(DEFAULT_CSV_DIALECT, dialect);
  }

  serialize(matrix: readonly (readonly CellValue[])[], dialect?: Partial<CsvDialect>): string {
    const opts = resolveDialect(this.dialect, dialect);
    const sep = opts.delimiter;
    const fw = opts.fixedWidth ?? 0;
    const spaces = fw > 0 ? ' '.repeat(fw) : '';
    const isStrict = opts.isStrict;
    const lineTerm = opts.lineTerminator ?? '\r\n';
    const isBackslash = (opts.escapeChar ?? '"') === '\\';

    return matrix.map(row => row.map(val => {
      let cellStr = normalizeCellValue(val);
      let requiresQuote = opts.quoteAlways ?? false;

      if (isBackslash && cellStr.includes('\\')) cellStr = cellStr.replaceAll('\\', '\\\\');
      if (cellStr.includes('"')) {
        requiresQuote = true;
        cellStr = cellStr.replaceAll('"', isBackslash ? '\\"' : '""');
      }
      if (!requiresQuote && (cellStr.includes(sep) || cellStr.includes('\n') || cellStr.includes('\r'))) {
        requiresQuote = true;
      }
      if (requiresQuote && isStrict) {
        throw new Error('Strict csv format not respected: save aborted');
      }
      if (requiresQuote) cellStr = `"${cellStr}"`;
      if (fw > cellStr.length) cellStr = (spaces + cellStr).slice(-fw);
      return cellStr;
    }).join(sep)).join(lineTerm);
  }

  serializeJson(matrix: readonly (readonly CellValue[])[], options?: { hasHeader?: boolean; pretty?: boolean }): string {
    if (!matrix || matrix.length === 0) return options?.pretty !== false ? '[]\n' : '[]';
    const hasHeader = options?.hasHeader ?? (matrix.length > 1);
    const indent = options?.pretty !== false ? 2 : undefined;

    if (!hasHeader || matrix.length <= 1) {
      return JSON.stringify(matrix.map(row => row.map(normalizeCellValue)), null, indent);
    }

    const seenHeaders = new Map<string, number>();
    const headers = matrix[0].map((h, colIdx) => {
      const key = normalizeCellValue(h).trim() || `col_${colIdx + 1}`;
      const count = seenHeaders.get(key) ?? 0;
      seenHeaders.set(key, count + 1);
      return count > 0 ? `${key}_${count + 1}` : key;
    });

    const records = matrix.slice(1).map(row => {
      const record: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) record[headers[c]] = normalizeCellValue(row[c]);
      return record;
    });

    return JSON.stringify(records, null, indent);
  }

  serializeMarkdown(matrix: readonly (readonly CellValue[])[], options?: { hasHeader?: boolean }): string {
    if (!matrix || matrix.length === 0 || matrix[0].length === 0) return '';
    const hasHeader = options?.hasHeader ?? true;
    const colCount = Math.max(0, ...matrix.map(r => r.length));
    if (colCount === 0) return '';

    const formatCell = (val: CellValue) =>
      normalizeCellValue(val).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

    const headerRow = hasHeader ? matrix[0] : null;
    const headerCells = Array.from({ length: colCount }, (_, c) => {
      const raw = headerRow ? normalizeCellValue(headerRow[c]).trim() : '';
      return ` ${raw ? formatCell(headerRow![c]) : `col_${c + 1}`} `;
    });

    const lines = [
      `|${headerCells.join('|')}|`,
      `|${new Array(colCount).fill(' --- ').join('|')}|`
    ];

    for (let r = headerRow ? 1 : 0; r < matrix.length; r++) {
      const row = matrix[r];
      lines.push(`|${Array.from({ length: colCount }, (_, c) => ` ${formatCell(row[c])} `).join('|')}|`);
    }
    return lines.join('\n');
  }

  serializeTsv(matrix: readonly (readonly CellValue[])[], dialect?: Partial<CsvDialect>): string {
    return this.serialize(matrix, { ...dialect, delimiter: '\t' });
  }
}
