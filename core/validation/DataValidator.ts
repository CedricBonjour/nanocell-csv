/**
 * @file core/validation/DataValidator.ts
 * Tabular data validator: whitespace trimming, decimal coercion, character normalization.
 * ZERO browser/DOM imports.
 */

import { Dataframe } from '../model/Dataframe.js';
import { ValidationProposal } from './ValidationRule.js';

export interface DataValidatorOptions {
  trimWhitespace?: boolean;
  coerceCommaDecimals?: boolean;
  replaceCommaWithHyphen?: boolean;
  replaceNewlineWithPipe?: boolean;
  replaceDoubleQuotes?: boolean;
  toLowerCase?: boolean;
}

export class DataValidator {
  static validate(dataframe: Dataframe, options: DataValidatorOptions = {}): ValidationProposal[] {
    const isExplicit = Object.keys(options).length > 0;
    const opts = {
      trimWhitespace: options.trimWhitespace ?? !isExplicit,
      coerceCommaDecimals: options.coerceCommaDecimals ?? !isExplicit,
      replaceCommaWithHyphen: Boolean(options.replaceCommaWithHyphen),
      replaceNewlineWithPipe: options.replaceNewlineWithPipe ?? !isExplicit,
      replaceDoubleQuotes: options.replaceDoubleQuotes ?? !isExplicit,
      toLowerCase: Boolean(options.toLowerCase),
    };

    const proposals: ValidationProposal[] = [];
    let idCounter = 0;

    const rows = dataframe.data;
    const height = Math.min(dataframe.height, rows.length);
    const width = dataframe.width;

    const headers = new Array<string>(width);
    const firstRow = rows[0];
    for (let x = 0; x < width; x++) {
      headers[x] = (firstRow && firstRow[x]) || `col_${x + 1}`;
    }

    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (!row) continue;
      const rowLen = Math.min(width, row.length);
      for (let x = 0; x < rowLen; x++) {
        const raw = row[x];
        if (raw === undefined || raw === null) continue;
        let cellText = String(raw);
        if (cellText.length === 0) continue;

        const headerName = headers[x];

        // 1. Whitespace Trimming
        if (opts.trimWhitespace && cellText !== cellText.trim()) {
          const trimmed = cellText.trim();
          proposals.push({
            id: `val_ws_${x}_${y}_${idCounter++}`,
            x,
            y,
            header: headerName,
            oldValue: cellText,
            newValue: trimmed,
            category: 'WHITESPACE_TRIMMING',
            categoryName: 'Whitespace/Trimming',
            message: 'Removed leading and trailing whitespace',
            status: 'pending'
          });
          cellText = trimmed;
        }

        if (cellText.length === 0) continue;

        // 2. Data Type Coercion: European comma to dot for floating-point numbers
        if (opts.coerceCommaDecimals && cellText.includes(',') && !Number.isFinite(Number(cellText))) {
          const candidateNumber = cellText.replace(',', '.');
          if (Number.isFinite(Number(candidateNumber))) {
            proposals.push({
              id: `val_num_${x}_${y}_${idCounter++}`,
              x,
              y,
              header: headerName,
              oldValue: cellText,
              newValue: candidateNumber,
              category: 'COMMA_DECIMAL_CONVERSION',
              categoryName: 'Decimal Comma -> Dot',
              message: 'Converted comma decimal separator to dot',
              status: 'pending'
            });
            continue;
          }
        }

        // If it's already a valid number, skip character sanitization rules
        if (Number.isFinite(Number(cellText))) continue;

        // 3. Discrete Character Sanitization Rules
        if (opts.replaceNewlineWithPipe && cellText.includes('\n')) {
          const mutated = cellText.replaceAll('\n', '|');
          proposals.push({
            id: `val_nl_${x}_${y}_${idCounter++}`,
            x,
            y,
            header: headerName,
            oldValue: cellText,
            newValue: mutated,
            category: 'CONSTRAINT_RANGE_VIOLATION',
            categoryName: 'Line Returns -> Pipe',
            message: 'Replaced line returns with pipe (|)',
            status: 'pending'
          });
          cellText = mutated;
        }

        if (opts.replaceDoubleQuotes && cellText.includes('"')) {
          const mutated = cellText.replaceAll('"', '\'');
          proposals.push({
            id: `val_q_${x}_${y}_${idCounter++}`,
            x,
            y,
            header: headerName,
            oldValue: cellText,
            newValue: mutated,
            category: 'CONSTRAINT_RANGE_VIOLATION',
            categoryName: 'Double Quotes -> Single',
            message: 'Replaced double quotes with single quotes',
            status: 'pending'
          });
          cellText = mutated;
        }

        if (opts.replaceCommaWithHyphen && cellText.includes(',')) {
          const mutated = cellText.replaceAll(',', '-');
          proposals.push({
            id: `val_cm_${x}_${y}_${idCounter++}`,
            x,
            y,
            header: headerName,
            oldValue: cellText,
            newValue: mutated,
            category: 'CONSTRAINT_RANGE_VIOLATION',
            categoryName: 'Text Commas -> Dash',
            message: 'Replaced commas with dash in text field',
            status: 'pending'
          });
          cellText = mutated;
        }

        if (opts.toLowerCase) {
          const mutated = cellText.toLowerCase();
          if (mutated !== cellText) {
            proposals.push({
              id: `val_lc_${x}_${y}_${idCounter++}`,
              x,
              y,
              header: headerName,
              oldValue: cellText,
              newValue: mutated,
              category: 'CUSTOM_RULE_VIOLATION',
              categoryName: 'Force Lowercase',
              message: 'Converted text to lowercase',
              status: 'pending'
            });
            cellText = mutated;
          }
        }
      }
    }

    return proposals;
  }
}
