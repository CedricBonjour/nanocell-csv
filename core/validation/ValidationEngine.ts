/**
 * @file core/validation/ValidationEngine.ts
 * Validation engine coordinating rule execution, proposal creation, and atomic batch transactions.
 * ZERO browser/DOM imports.
 */

import { IDataframe } from '../model/IDataframe.js';
import { ITransaction, Transaction } from '../history/Transaction.js';
import { EditCellCommand } from '../history/commands/EditCellCommand.js';
import { RangeEditCommand } from '../history/commands/RangeEditCommand.js';
import { ValidationCategory, ValidationProposal, IValidationRule } from './ValidationRule.js';
import { HeaderValidator } from './HeaderValidator.js';
import { DataValidator, DataValidatorOptions } from './DataValidator.js';
import { DateValidator, DateValidationResult } from './DateValidator.js';

export interface CustomRegexRuleConfig {
  readonly id: string;
  readonly name: string;
  readonly pattern: RegExp | string;
  readonly replacement: string;
  readonly category?: ValidationCategory;
  readonly message?: string;
}

export class ValidationEngine {
  private customRules: Map<string, IValidationRule> = new Map();

  registerRule(rule: IValidationRule): void {
    this.customRules.set(rule.id, rule);
  }

  registerCustomRegexRule(config: CustomRegexRuleConfig): void {
    const reg = typeof config.pattern === 'string' ? new RegExp(config.pattern, 'g') : config.pattern;
    const rule: IValidationRule = {
      id: config.id,
      category: config.category ?? 'CUSTOM_RULE_VIOLATION',
      categoryName: config.name,
      appliesTo: 'data',
      validate: (value, coord, ctx) => {
        reg.lastIndex = 0;
        if (reg.test(value)) {
          reg.lastIndex = 0;
          const newVal = value.replace(reg, config.replacement);
          return {
            id: `val_custom_${config.id}_${coord.x}_${coord.y}`,
            x: coord.x,
            y: coord.y,
            header: ctx.headerNames[coord.x] || `col_${coord.x + 1}`,
            oldValue: value,
            newValue: newVal,
            category: config.category ?? 'CUSTOM_RULE_VIOLATION',
            categoryName: config.name,
            message: config.message ?? `Applied custom rule ${config.name}`,
            status: 'pending'
          };
        }
        return null;
      }
    };
    this.registerRule(rule);
  }

  validateHeaders(dataframe: IDataframe): ValidationProposal[] {
    return HeaderValidator.validate(dataframe);
  }

  validateData(dataframe: IDataframe, options?: DataValidatorOptions): ValidationProposal[] {
    const proposals = DataValidator.validate(dataframe, options);

    // Apply custom rules if registered
    if (this.customRules.size > 0) {
      const headerNames = Array.from({ length: dataframe.width }, (_, x) => dataframe.get(x, 0));
      const ctx = { width: dataframe.width, height: dataframe.height, headerNames };

      for (let y = 0; y < dataframe.height; y++) {
        for (let x = 0; x < dataframe.width; x++) {
          const val = dataframe.get(x, y);
          for (const rule of this.customRules.values()) {
            if (rule.appliesTo === 'data' || rule.appliesTo === 'all') {
              const prop = rule.validate(val, { x, y }, ctx);
              if (prop) proposals.push(prop);
            }
          }
        }
      }
    }

    return proposals;
  }

  validateDates(dataframe: IDataframe): DateValidationResult {
    return DateValidator.validate(dataframe);
  }

  // ==========================================================================
  // Batch Actions & Single-Step Atomic Transaction Coordination
  // ==========================================================================

  createAcceptAllTransaction(proposals: ValidationProposal[]): ITransaction {
    const pending = proposals.filter(p => p.status === 'pending');
    const tx = new Transaction(`Accept all validation proposals (${pending.length} changes)`);

    const changes = pending.map(p => ({
      x: p.x,
      y: p.y,
      oldValue: p.oldValue,
      newValue: p.newValue
    }));

    if (changes.length > 0) {
      tx.add(new RangeEditCommand(changes));
    }

    return tx;
  }

  acceptAll(proposals: ValidationProposal[], dataframe?: IDataframe): ITransaction {
    const tx = this.createAcceptAllTransaction(proposals);
    if (dataframe) {
      tx.execute(dataframe);
    }
    for (const p of proposals) {
      if (p.status === 'pending') {
        p.status = 'accepted';
      }
    }
    return tx;
  }

  rejectAll(proposals: ValidationProposal[]): void {
    for (const p of proposals) {
      if (p.status === 'pending') {
        p.status = 'rejected';
      }
    }
  }

  acceptCategory(category: ValidationCategory, proposals: ValidationProposal[], dataframe?: IDataframe): ITransaction {
    const pending = proposals.filter(p => p.status === 'pending' && p.category === category);
    const tx = new Transaction(`Accept validation category '${category}' (${pending.length} changes)`);

    const changes = pending.map(p => ({
      x: p.x,
      y: p.y,
      oldValue: p.oldValue,
      newValue: p.newValue
    }));

    if (changes.length > 0) {
      tx.add(new RangeEditCommand(changes));
      if (dataframe) {
        tx.execute(dataframe);
      }
    }

    for (const p of pending) {
      p.status = 'accepted';
    }

    return tx;
  }

  rejectCategory(category: ValidationCategory, proposals: ValidationProposal[]): void {
    for (const p of proposals) {
      if (p.status === 'pending' && p.category === category) {
        p.status = 'rejected';
      }
    }
  }

  acceptProposal(proposal: ValidationProposal, dataframe: IDataframe): EditCellCommand {
    const cmd = new EditCellCommand(proposal.x, proposal.y, proposal.oldValue, proposal.newValue);
    cmd.execute(dataframe);
    proposal.status = 'accepted';
    return cmd;
  }

  rejectProposal(proposal: ValidationProposal): void {
    proposal.status = 'rejected';
  }
}
