/**
 * @file core/search/SearchEngine.ts
 * Pure headless search & replace algorithm executing over 2D Dataframe matrices.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate } from '../model/index.js';
import { Dataframe } from '../model/Dataframe.js';
import { SearchQuery, SearchMatch } from './SearchResult.js';

export interface IReplaceTransaction {
  description: string;
  commands: { x: number; y: number; oldValue: string; newValue: string; execute?: (df: Dataframe) => void; undo?: (df: Dataframe) => void }[];
  execute(dataframe: Dataframe): void;
  undo(dataframe: Dataframe): void;
}

export class SearchEngine {
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

  find(dataframe: Dataframe, query: SearchQuery): SearchMatch[] {
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

  private matchAtCell(dataframe: Dataframe, x: number, y: number, regex: RegExp): SearchMatch | null {
    const val = dataframe.get(x, y);
    if (typeof val !== 'string') return null;
    regex.lastIndex = 0;
    const matchResult = regex.exec(val);
    if (matchResult !== null) {
      return {
        x,
        y,
        value: val,
        startIndex: matchResult.index,
        length: matchResult[0].length,
        matchText: matchResult[0]
      };
    }
    return null;
  }

  findNext(dataframe: Dataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null {
    const regex = this.buildRegex(query);
    if (!regex) return null;

    const yStart = query.scopeRange ? query.scopeRange.ymin : 0;
    const yEnd = query.scopeRange ? query.scopeRange.ymax : dataframe.height - 1;
    const xStart = query.scopeRange ? query.scopeRange.xmin : 0;
    const xEnd = query.scopeRange ? query.scopeRange.xmax : dataframe.width - 1;

    // 1. Scan from strictly after currentCoord to end of scope in row-major order
    if (currentCoord.y >= yStart && currentCoord.y <= yEnd) {
      const nextX = Math.max(xStart, currentCoord.x + 1);
      for (let x = nextX; x <= xEnd; x++) {
        const m = this.matchAtCell(dataframe, x, currentCoord.y, regex);
        if (m) return m;
      }
    }

    const nextY = Math.max(yStart, currentCoord.y + 1);
    for (let y = nextY; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const m = this.matchAtCell(dataframe, x, y, regex);
        if (m) return m;
      }
    }

    // 2. Wrap around from start of scope up to and including currentCoord
    const wrapYEnd = Math.min(yEnd, currentCoord.y - 1);
    for (let y = yStart; y <= wrapYEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const m = this.matchAtCell(dataframe, x, y, regex);
        if (m) return m;
      }
    }

    if (currentCoord.y >= yStart && currentCoord.y <= yEnd) {
      const wrapXEnd = Math.min(xEnd, currentCoord.x);
      for (let x = xStart; x <= wrapXEnd; x++) {
        const m = this.matchAtCell(dataframe, x, currentCoord.y, regex);
        if (m) return m;
      }
    }

    return null;
  }

  findPrevious(dataframe: Dataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null {
    const regex = this.buildRegex(query);
    if (!regex) return null;

    const yStart = query.scopeRange ? query.scopeRange.ymin : 0;
    const yEnd = query.scopeRange ? query.scopeRange.ymax : dataframe.height - 1;
    const xStart = query.scopeRange ? query.scopeRange.xmin : 0;
    const xEnd = query.scopeRange ? query.scopeRange.xmax : dataframe.width - 1;

    // 1. Scan backward from strictly before currentCoord in row-major order
    if (currentCoord.y >= yStart && currentCoord.y <= yEnd) {
      const prevX = Math.min(xEnd, currentCoord.x - 1);
      for (let x = prevX; x >= xStart; x--) {
        const m = this.matchAtCell(dataframe, x, currentCoord.y, regex);
        if (m) return m;
      }
    }

    const prevY = Math.min(yEnd, currentCoord.y - 1);
    for (let y = prevY; y >= yStart; y--) {
      for (let x = xEnd; x >= xStart; x--) {
        const m = this.matchAtCell(dataframe, x, y, regex);
        if (m) return m;
      }
    }

    // 2. Wrap around from end of scope down to currentCoord
    const wrapYStart = Math.max(yStart, currentCoord.y + 1);
    for (let y = yEnd; y >= wrapYStart; y--) {
      for (let x = xEnd; x >= xStart; x--) {
        const m = this.matchAtCell(dataframe, x, y, regex);
        if (m) return m;
      }
    }

    if (currentCoord.y >= yStart && currentCoord.y <= yEnd) {
      const wrapXStart = Math.max(xStart, currentCoord.x);
      for (let x = xEnd; x >= wrapXStart; x--) {
        const m = this.matchAtCell(dataframe, x, currentCoord.y, regex);
        if (m) return m;
      }
    }

    return null;
  }

  goToNextMatching(dataframe: Dataframe, currentCoord: CellCoordinate): CellCoordinate | null {
    const rawRows = dataframe.data;
    const targetVal = dataframe.get(currentCoord.x, currentCoord.y);
    const width = dataframe.width;
    const height = dataframe.height;
    const totalCells = width * height;
    if (totalCells <= 1) return null;

    let x = currentCoord.x;
    let y = currentCoord.y;

    for (let step = 0; step < totalCells; step++) {
      x = (x + 1) % width;
      if (x === 0) y = (y + 1) % height;

      if (x === currentCoord.x && y === currentCoord.y) {
        return null; // Wrapped back without finding other match
      }

      if ((rawRows[y]?.[x] ?? '') === targetVal) {
        return { x, y };
      }
    }

    return null;
  }

  goToPreviousMatching(dataframe: Dataframe, currentCoord: CellCoordinate): CellCoordinate | null {
    const rawRows = dataframe.data;
    const targetVal = dataframe.get(currentCoord.x, currentCoord.y);
    const width = dataframe.width;
    const height = dataframe.height;
    const totalCells = width * height;
    if (totalCells <= 1) return null;

    let x = currentCoord.x;
    let y = currentCoord.y;

    for (let step = 0; step < totalCells; step++) {
      if (x === 0) {
        x = width - 1;
        y = (y - 1 + height) % height;
      } else {
        x--;
      }

      if (x === currentCoord.x && y === currentCoord.y) {
        return null; // Wrapped back without finding other match
      }

      if ((rawRows[y]?.[x] ?? '') === targetVal) {
        return { x, y };
      }
    }

    return null;
  }

  createReplaceTransaction(dataframe: Dataframe, query: SearchQuery, replacement: string): IReplaceTransaction {
    const matches = this.find(dataframe, query);
    const regex = this.buildRegex(query);
    const changes: { x: number; y: number; oldValue: string; newValue: string }[] = [];

    if (regex && matches.length > 0) {
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
          changes.push({ x, y, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    return {
      description: `Replace all occurrences of '${query.term}' with '${replacement}'`,
      commands: changes.map(c => ({
        type: 'EDIT_CELL',
        x: c.x,
        y: c.y,
        oldValue: c.oldValue,
        newValue: c.newValue,
        execute: (df: Dataframe) => df.set(c.x, c.y, c.newValue),
        undo: (df: Dataframe) => df.set(c.x, c.y, c.oldValue)
      })),
      execute(df: Dataframe) {
        for (const c of changes) {
          df.edit(c.x, c.y, c.newValue);
        }
      },
      undo(df: Dataframe) {
        for (const c of changes) {
          df.edit(c.x, c.y, c.oldValue);
        }
      }
    };
  }

  replaceAll(dataframe: Dataframe, query: SearchQuery, replacement: string): number {
    const tx = this.createReplaceTransaction(dataframe, query, replacement);
    if (tx.commands.length === 0) return 0;

    dataframe.runTransaction(tx.description, () => {
      tx.execute(dataframe);
    });
    return tx.commands.length;
  }

  formatHighlight(value: string, match: SearchMatch): { before: string; matchText: string; after: string } {
    const before = value.substring(0, match.startIndex);
    const matchText = value.substring(match.startIndex, match.startIndex + match.length);
    const after = value.substring(match.startIndex + match.length);
    return { before, matchText, after };
  }
}
