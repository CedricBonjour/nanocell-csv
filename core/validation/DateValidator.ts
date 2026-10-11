/**
 * @file core/validation/DateValidator.ts
 * Pure date normalization and consistency validator.
 * ZERO browser/DOM imports.
 */

import { Dataframe } from '../model/Dataframe.js';
import { isValidCalendarDate, parseDateCandidate, parseYearFirstDate } from '../utils/date.js';
import { ValidationProposal } from './ValidationRule.js';

export interface DateValidationResult {
  readonly proposals: ValidationProposal[];
  readonly success: boolean;
  readonly detectedFormat?: string;
  readonly reason?: 'locked' | 'no_dates' | 'coexistence' | 'ambiguous';
}

export class DateValidator {
  static validate(dataframe: Dataframe): DateValidationResult {
    const yearFirstCandidates: { x: number; y: number; year: number; month: number; day: number; raw: string }[] = [];
    const yearLastCandidates: { x: number; y: number; p1: number; p2: number; year: number; raw: string }[] = [];
    let dayFirstCount = 0;
    let monthFirstCount = 0;

    const rows = dataframe.data;
    const height = Math.min(dataframe.height, rows.length);
    const width = dataframe.width;

    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (!row) continue;
      const rowLen = Math.min(width, row.length);
      for (let x = 0; x < rowLen; x++) {
        const val = row[x];
        if (!val) continue;

        const yf = parseYearFirstDate(val);
        if (yf) {
          yearFirstCandidates.push({ x, y, ...yf });
          continue;
        }

        const yl = parseDateCandidate(val);
        if (yl) {
          if (yl.p1 > 12) dayFirstCount++;
          else if (yl.p2 > 12) monthFirstCount++;
          yearLastCandidates.push({ x, y, ...yl });
        }
      }
    }

    if (yearFirstCandidates.length === 0 && yearLastCandidates.length === 0) {
      return { proposals: [], success: false, reason: 'no_dates' };
    }

    const proposals: ValidationProposal[] = [];
    let idCounter = 0;
    const firstRow = rows[0];
    const getHeader = (x: number) => (firstRow && firstRow[x]) || `col_${x + 1}`;

    // 1. Year-first dates: systematically normalize to YYYY-mm-dd
    for (const c of yearFirstCandidates) {
      const formatted = `${String(c.year).padStart(4, '0')}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
      const currentVal = c.raw;
      if (currentVal !== formatted) {
        proposals.push({
          id: `val_date_yf_${c.x}_${c.y}_${idCounter++}`,
          x: c.x,
          y: c.y,
          header: getHeader(c.x),
          oldValue: currentVal,
          newValue: formatted,
          category: 'DATE_FORMAT_MISMATCH',
          categoryName: 'Date Format Normalization',
          message: `Standardized date to YYYY-mm-dd format`,
          status: 'pending'
        });
      }
    }

    // 2. Year-last dates format certainty evaluation
    let detectedFormat: string | undefined;
    let yearLastIssue: 'coexistence' | 'ambiguous' | undefined;

    if (yearLastCandidates.length > 0) {
      if (dayFirstCount > 0 && monthFirstCount > 0) {
        yearLastIssue = 'coexistence';
      } else if (dayFirstCount === 0 && monthFirstCount === 0) {
        yearLastIssue = 'ambiguous';
      } else {
        detectedFormat = dayFirstCount > 0 ? 'dd-mm-YYYY' : 'mm-dd-YYYY';
        for (const c of yearLastCandidates) {
          const day = detectedFormat === 'dd-mm-YYYY' ? c.p1 : c.p2;
          const month = detectedFormat === 'dd-mm-YYYY' ? c.p2 : c.p1;
          const formatted = `${String(c.year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const currentVal = c.raw;
          if (currentVal !== formatted) {
            proposals.push({
              id: `val_date_yl_${c.x}_${c.y}_${idCounter++}`,
              x: c.x,
              y: c.y,
              header: getHeader(c.x),
              oldValue: currentVal,
              newValue: formatted,
              category: 'DATE_FORMAT_MISMATCH',
              categoryName: 'Date Format Normalization',
              message: `Converted from ${detectedFormat} to YYYY-mm-dd`,
              status: 'pending'
            });
          }
        }
      }
    }

    return {
      proposals,
      success: yearLastIssue === undefined || yearFirstCandidates.length > 0,
      detectedFormat,
      reason: yearLastIssue
    };
  }
}
