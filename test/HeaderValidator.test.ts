/**
 * @file test/HeaderValidator.test.ts
 * Tests for header sanitization (SQL identifiers, braces, empty fallback).
 */
import { Dataframe } from '../core/model/Dataframe.js';
import { HeaderValidator } from '../core/validation/HeaderValidator.js';

interface TestResult {
  passed: number;
  failed: number;
}

export function runHeaderValidatorTests(): TestResult {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message || err}`);
    }
  }

  function assertEqual(actual: any, expected: any, msg: string) {
    if (actual !== expected) {
      throw new Error(`${msg} - Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
    }
  }

  console.log('\n--- HeaderValidator Tests: Sanitization ---');

  test('{basename} trims outer underscores to basename', () => {
    const df = new Dataframe([['{basename}'], ['1']]);
    const proposals = HeaderValidator.validate(df);
    assertEqual(proposals.length, 1, 'Should propose one change');
    assertEqual(proposals[0].newValue, 'basename', 'Braces should not become outer underscores');
  });

  test('{} falls back to col_N when sanitization empties the name', () => {
    const df = new Dataframe([['{}'], ['1']]);
    const proposals = HeaderValidator.validate(df);
    assertEqual(proposals.length, 1, 'Should propose one change');
    assertEqual(proposals[0].newValue, 'col_1', 'Empty sanitized name should fall back to col_1');
  });

  test('already-valid header produces no proposal', () => {
    const df = new Dataframe([['name'], ['1']]);
    const proposals = HeaderValidator.validate(df);
    assertEqual(proposals.length, 0, 'Valid header needs no change');
  });

  return { passed, failed };
}
