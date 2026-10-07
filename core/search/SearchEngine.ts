/**
 * @file core/search/SearchEngine.ts
 * Pure headless search & replace algorithm executing over 2D IDataframe matrices.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate } from '../model/index.js';
import { IDataframe } from '../model/IDataframe.js';
import { ITransaction, Transaction } from '../history/Transaction.js';
import { EditCellCommand } from '../history/commands/EditCellCommand.js';
import { SearchQuery, SearchMatch } from './SearchResult.js';
import { ISearchEngine } from './ISearchEngine.js';

export class SearchEngine implements ISearchEngine {
  private buildRegex(query: SearchQuery): RegExp | null {
    if (!query.term || query.term.length === 0) return null;

    let pattern = query.term;
    if (!query.useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (query.matchWholeCell) {
      pattern = `^(?:${pattern})$`;
    }

    const flags = query.caseSensitive ? 'g' : 'gi';
    try {
      return new RegExp(pattern, flags);
    } catch {
      // If regex compilation fails, fall back to literal escaped regex
      const safeLiteral = query.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(query.matchWholeCell ? `^(?:${safeLiteral})$` : safeLiteral, flags);
    }
  }

  find(dataframe: IDataframe, query: SearchQuery): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const regex = this.buildRegex(query);
    if (!regex) return matches;

    const yStart = query.scopeRange ? query.scopeRange.ymin : 0;
    const yEnd = query.scopeRange ? query.scopeRange.ymax : dataframe.height - 1;
    const xStart = query.scopeRange ? query.scopeRange.xmin : 0;
    const xEnd = query.scopeRange ? query.scopeRange.xmax : dataframe.width - 1;

    // Row-major iteration matching test suite index progression
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const val = dataframe.get(x, y);
        if (typeof val !== 'string') continue;

        regex.lastIndex = 0;
        let matchResult: RegExpExecArray | null;

        while ((matchResult = regex.exec(val)) !== null) {
          matches.push({
            x,
            y,
            value: val,
            startIndex: matchResult.index,
            length: matchResult[0].length,
            matchText: matchResult[0]
          });

          // Prevent zero-length regex infinite loop
          if (matchResult[0].length === 0) {
            regex.lastIndex++;
          }
          if (!regex.global) break;
        }
      }
    }

    return matches;
  }

  findNext(dataframe: IDataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null {
    const matches = this.find(dataframe, query);
    if (matches.length === 0) return null;

    // Locate first match that strictly succeeds currentCoord in reading order
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.y > currentCoord.y || (m.y === currentCoord.y && m.x > currentCoord.x)) {
        return m;
      }
    }

    // Circular wrap to first match
    return matches[0];
  }

  findPrevious(dataframe: IDataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null {
    const matches = this.find(dataframe, query);
    if (matches.length === 0) return null;

    // Locate match that precedes currentCoord
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (m.y < currentCoord.y || (m.y === currentCoord.y && m.x < currentCoord.x)) {
        return m;
      }
    }

    // Circular wrap to last match
    return matches[matches.length - 1];
  }

  goToNextMatching(dataframe: IDataframe, currentCoord: CellCoordinate): CellCoordinate | null {
    const targetVal = dataframe.get(currentCoord.x, currentCoord.y);
    const totalCells = dataframe.width * dataframe.height;
    if (totalCells <= 1) return null;

    let x = currentCoord.x;
    let y = currentCoord.y;

    for (let step = 0; step < totalCells; step++) {
      x = (x + 1) % dataframe.width;
      if (x === 0) y = (y + 1) % dataframe.height;

      if (x === currentCoord.x && y === currentCoord.y) {
        return null; // Wrapped back without finding other match
      }

      if (dataframe.get(x, y) === targetVal) {
        return { x, y };
      }
    }

    return null;
  }

  createReplaceTransaction(dataframe: IDataframe, query: SearchQuery, replacement: string): ITransaction {
    const matches = this.find(dataframe, query);
    const tx = new Transaction(`Replace all occurrences of '${query.term}' with '${replacement}'`);
    const regex = this.buildRegex(query);
    if (!regex || matches.length === 0) return tx;

    // Deduplicate cell coordinates to prevent multiple commands on same cell
    const modifiedCells = new Map<string, { x: number; y: number }>();
    for (const m of matches) {
      const key = `${m.x}:${m.y}`;
      if (!modifiedCells.has(key)) {
        modifiedCells.set(key, { x: m.x, y: m.y });
      }
    }

    for (const { x, y } of modifiedCells.values()) {
      const oldVal = dataframe.get(x, y);
      regex.lastIndex = 0;
      const newVal = oldVal.replace(regex, replacement);
      if (newVal !== oldVal) {
        tx.add(new EditCellCommand(x, y, oldVal, newVal));
      }
    }

    return tx;
  }

  formatHighlight(value: string, match: SearchMatch): { before: string; matchText: string; after: string } {
    const before = value.substring(0, match.startIndex);
    const matchText = value.substring(match.startIndex, match.startIndex + match.length);
    const after = value.substring(match.startIndex + match.length);
    return { before, matchText, after };
  }
}
