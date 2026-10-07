/**
 * @file core/validation/DataValidator.ts
 * Tabular data validator: whitespace trimming, decimal coercion, character normalization.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';
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
  static validate(dataframe: IDataframe, options: DataValidatorOptions = {}): ValidationProposal[] {
    const opts = {
      trimWhitespace: true,
      coerceCommaDecimals: true,
      replaceCommaWithHyphen: false,
      replaceNewlineWithPipe: true,
      replaceDoubleQuotes: true,
      toLowerCase: false,
      ...options
    };

    const proposals: ValidationProposal[] = [];
    let idCounter = 0;

    for (let y = 0; y < dataframe.height; y++) {
      for (let x = 0; x < dataframe.width; x++) {
        const raw = dataframe.get(x, y);
        if (raw === undefined || raw === null) continue;
        let cellText = String(raw);
        if (cellText.length === 0) continue;

        const headerName = dataframe.get(x, 0) || `col_${x + 1}`;

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

        if (cellText.length === 0 || !isNaN(Number(cellText))) continue;

        // 2. Data Type Coercion: European comma to dot for floating-point numbers
        if (opts.coerceCommaDecimals && cellText.includes(',')) {
          const candidateNumber = cellText.replace(',', '.');
          if (!isNaN(Number(candidateNumber))) {
            proposals.push({
              id: `val_num_${x}_${y}_${idCounter++}`,
              x,
              y,
              header: headerName,
              oldValue: String(raw),
              newValue: candidateNumber,
              category: 'DATA_TYPE_COERCION',
              categoryName: 'Data Type Coercion',
              message: 'Converted comma decimal separator to dot',
              status: 'pending'
            });
            continue;
          }
        }

        // 3. Constraint / Range Violations
        let mutatedText = cellText;
        if (opts.replaceCommaWithHyphen) mutatedText = mutatedText.replaceAll(',', '-');
        if (opts.replaceNewlineWithPipe) mutatedText = mutatedText.replaceAll('\n', '|');
        if (opts.replaceDoubleQuotes) mutatedText = mutatedText.replaceAll('"', '\'');
        if (opts.toLowerCase) mutatedText = mutatedText.toLowerCase();

        if (mutatedText !== cellText) {
          proposals.push({
            id: `val_crv_${x}_${y}_${idCounter++}`,
            x,
            y,
            header: headerName,
            oldValue: String(raw),
            newValue: mutatedText,
            category: 'CONSTRAINT_RANGE_VIOLATION',
            categoryName: 'Constraint/Range Violations',
            message: 'Sanitized invalid characters in text field',
            status: 'pending'
          });
        }
      }
    }

    return proposals;
  }
}
