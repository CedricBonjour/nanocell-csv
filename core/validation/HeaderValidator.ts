/**
 * @file core/validation/HeaderValidator.ts
 * Validates row 0 header names for SQL column compliance and duplicates.
 * ZERO browser/DOM imports.
 */

import { Dataframe } from '../model/Dataframe.js';
import { ValidationProposal } from './ValidationRule.js';

export class HeaderValidator {
  static validate(dataframe: Dataframe): ValidationProposal[] {
    const proposals: ValidationProposal[] = [];
    const seenHeaders = new Set<string>();
    let idCounter = 0;

    for (let x = 0; x < dataframe.width; x++) {
      const originalHeader = dataframe.get(x, 0);
      let sanitized = originalHeader;

      if (sanitized === undefined || sanitized === null || sanitized === '') {
        sanitized = `col_${x + 1}`;
      }

      sanitized = String(sanitized).toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');

      let isDuplicate = false;
      let candidate = sanitized;
      let suffixCounter = 1;
      while (seenHeaders.has(candidate)) {
        isDuplicate = true;
        candidate = `${sanitized}_c${x + suffixCounter}`;
        suffixCounter++;
      }
      sanitized = candidate;
      seenHeaders.add(sanitized);

      if (sanitized !== originalHeader) {
        proposals.push({
          id: `val_hdr_${x}_${idCounter++}`,
          x,
          y: 0,
          header: originalHeader || `col_${x + 1}`,
          oldValue: originalHeader ?? '',
          newValue: sanitized,
          category: isDuplicate ? 'DUPLICATE_HEADER' : 'INVALID_SQL_IDENTIFIER',
          categoryName: isDuplicate ? 'Duplicate Fixes' : 'SQL Compliance',
          message: isDuplicate
            ? `Duplicate header resolved by appending suffix: '${sanitized}'`
            : `Header converted to valid unique SQL identifier: '${sanitized}'`,
          status: 'pending'
        });
      }
    }

    return proposals;
  }
}
