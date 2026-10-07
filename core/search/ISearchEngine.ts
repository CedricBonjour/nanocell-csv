/**
 * @file core/search/ISearchEngine.ts
 * Interface contract for headless tabular search and replace engine.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate } from '../model/index.js';
import { IDataframe } from '../model/IDataframe.js';
import { ITransaction } from '../history/Transaction.js';
import { SearchQuery, SearchMatch } from './SearchResult.js';

export interface ISearchEngine {
  find(dataframe: IDataframe, query: SearchQuery): SearchMatch[];
  findNext(dataframe: IDataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null;
  findPrevious(dataframe: IDataframe, query: SearchQuery, currentCoord: CellCoordinate): SearchMatch | null;
  goToNextMatching?(dataframe: IDataframe, currentCoord: CellCoordinate): CellCoordinate | null;
  createReplaceTransaction(dataframe: IDataframe, query: SearchQuery, replacement: string): ITransaction;
  formatHighlight?(value: string, match: SearchMatch): { before: string; matchText: string; after: string };
}
