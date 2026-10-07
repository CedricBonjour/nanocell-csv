/**
 * @file core/csv/ICsvEngine.ts
 * Interface contracts for CSV parser and serializer engines.
 * ZERO browser/DOM imports.
 */

import { CellValue } from '../model/Cell.js';
import { CsvDialect } from './CsvTypes.js';

export interface ICsvParser {
  detectSeparator(sample: string): string;
  setDelimiter(delimiter: string): void;
  getDelimiter(): string;
  parse(content: string, dialect?: Partial<CsvDialect>): string[][];
  parseChunk(chunk: string | Uint8Array, isLastChunk: boolean): string[][];
  parseAll(input: string | Uint8Array, dialect?: Partial<CsvDialect>): string[][];
  reset(): void;
}

export interface ICsvSerializer {
  serialize(matrix: readonly (readonly CellValue[])[], dialect?: Partial<CsvDialect>): string;
}
