/**
 * @file test/Dataframe.test.ts
 * Tests for Dataframe streaming row ingestion, lock state handling, and view-only support.
 */
import { Dataframe } from '../core/model/Dataframe.js';

interface TestResult {
  passed: number;
  failed: number;
}

export function runDataframeTests(): TestResult {
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

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  function assertEqual(actual: any, expected: any, msg: string) {
    if (actual !== expected) {
      throw new Error(`${msg} - Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
    }
  }

  console.log('\n--- Dataframe Tests: Streaming, Locking & View-Only ---');

  test('appendRows appends rows when unlocked and marks dirty', () => {
    const df = new Dataframe([['A', 'B'], ['1', '2']]);
    assertEqual(df.height, 2, 'Initial height');
    assertEqual(df.isSaved, true, 'Initial isSaved');

    df.appendRows([['3', '4'], ['5', '6']]);
    assertEqual(df.height, 4, 'Height after append');
    assertEqual(df.get(0, 2), '3', 'Cell (0,2)');
    assertEqual(df.get(1, 3), '6', 'Cell (1,3)');
    assertEqual(df.isSaved, false, 'Should be marked dirty when unlocked');
  });

  test('appendRows rejects rows when locked if bypassLock is false', () => {
    const df = new Dataframe([['A', 'B'], ['1', '2']]);
    df.lock = true;
    assertEqual(df.lock, true, 'Dataframe is locked');

    df.appendRows([['3', '4']]);
    assertEqual(df.height, 2, 'Height must not change when locked');
    assertEqual(df.isSaved, true, 'isSaved remains unchanged');
  });

  test('appendRows succeeds when locked if bypassLock is true (preview streaming)', () => {
    const df = new Dataframe([['A', 'B'], ['1', '2']]);
    df.lock = true;

    // Streaming chunk 2 arrives in viewOnly mode
    df.appendRows([['! [...] !', '! [...] !'], ['3', '4']], true);
    assertEqual(df.height, 4, 'Height should expand with bypassLock=true');
    assertEqual(df.get(0, 2), '! [...] !', 'Ellipsis divider appended');
    assertEqual(df.get(0, 3), '3', 'Row value appended');
    assertEqual(df.lock, true, 'Dataframe remains locked');
    assertEqual(df.isSaved, true, 'Dataframe remains saved when locked');
  });

  test('edit and schema mutations are rejected when locked', () => {
    const df = new Dataframe([['A', 'B'], ['1', '2']]);
    df.lock = true;

    df.edit(0, 1, 'MODIFIED');
    assertEqual(df.get(0, 1), '1', 'Edit must be rejected');

    df.deleteRow(1);
    assertEqual(df.height, 2, 'deleteRow must be rejected');

    df.insertRow(1);
    assertEqual(df.height, 2, 'insertRow must be rejected');

    df.deleteCol(0);
    assertEqual(df.width, 2, 'deleteCol must be rejected');

    df.insertCol(0);
    assertEqual(df.width, 2, 'insertCol must be rejected');
  });

  return { passed, failed };
}

if (process.argv[1]?.includes('Dataframe.test')) {
  const res = runDataframeTests();
  process.exit(res.failed > 0 ? 1 : 0);
}
