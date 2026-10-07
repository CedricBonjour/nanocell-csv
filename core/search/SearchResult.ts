/**
 * @file core/search/SearchResult.ts
 * Search query parameters and match descriptors.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate, CellRange } from '../model/index.js';

export interface SearchQuery {
  readonly term: string;
  readonly caseSensitive: boolean;
  readonly useRegex: boolean;
  readonly matchWholeCell: boolean;
  readonly scopeRange?: CellRange;
}

export interface SearchMatch {
  readonly x: number;
  readonly y: number;
  readonly value: string;
  readonly startIndex: number;
  readonly length: number;
  readonly matchText: string;
}
