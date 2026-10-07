/**
 * @file core/validation/ValidationRule.ts
 * Validation rule definitions and proposal data models.
 * ZERO browser/DOM imports.
 */

import { CellCoordinate } from '../model/index.js';

export type ValidationCategory =
  | 'DUPLICATE_HEADER'
  | 'INVALID_SQL_IDENTIFIER'
  | 'WHITESPACE_TRIMMING'
  | 'DATA_TYPE_COERCION'
  | 'CONSTRAINT_RANGE_VIOLATION'
  | 'DATE_FORMAT_MISMATCH'
  | 'COMMA_DECIMAL_CONVERSION'
  | 'CUSTOM_RULE_VIOLATION';

export interface ValidationProposal {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly header: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly category: ValidationCategory;
  readonly categoryName: string;
  readonly message: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ValidationContext {
  readonly width: number;
  readonly height: number;
  readonly headerNames: readonly string[];
}

export interface IValidationRule {
  readonly id: string;
  readonly category: ValidationCategory;
  readonly categoryName: string;
  readonly appliesTo: 'header' | 'data' | 'all';
  validate(value: string, coord: CellCoordinate, context: ValidationContext): ValidationProposal | null;
}
