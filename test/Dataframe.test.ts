/**
 * @file test/Dataframe.test.ts
 * Tests for Dataframe streaming row ingestion, lock state handling, and view-only support.
 */
import { Dataframe } from '../app/core/Dataframe.js';

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

    df.editRange(0, 0, 1, 1, 'MODIFIED');
    assertEqual(df.get(0, 1), '1', 'Edit must be rejected');

    df.deleteRows(1, 1);
    assertEqual(df.height, 2, 'deleteRows must be rejected');

    df.insertRow(1);
    assertEqual(df.height, 2, 'insertRow must be rejected');

    df.deleteCols(0, 0);
    assertEqual(df.width, 2, 'deleteCols must be rejected');

    df.insertCol(0);
    assertEqual(df.width, 2, 'insertCol must be rejected');
  });

  console.log('\n--- Dataframe Tests: Date Series Expansion (Ctrl+E / fillSeries) ---');

  function expandVertical(seeds: string[], totalLen: number): string[] {
    const rows = Array.from({ length: totalLen }, (_, i) => [seeds[i] ?? '']);
    const df = new Dataframe(rows);
    df.fillSeries({ xmin: 0, xmax: 0, ymin: 0, ymax: totalLen - 1 });
    return Array.from({ length: totalLen }, (_, i) => df.get(0, i));
  }

  function assertSeries(actual: string[], expected: string[], msg: string) {
    assertEqual(JSON.stringify(actual), JSON.stringify(expected), msg);
  }

  test('Single seed: daily progression across standard month and year boundaries', () => {
    assertSeries(
      expandVertical(['2026-04-29'], 4),
      ['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02'],
      '30-day April to May rollover'
    );
    assertSeries(
      expandVertical(['2026-12-30'], 4),
      ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'],
      'Year-end rollover'
    );
  });

  test('Single seed: daily progression across leap, non-leap, century, and 400-year Februaries', () => {
    assertSeries(
      expandVertical(['2026-02-27'], 4),
      ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'],
      'Non-leap year 2026 skips Feb 29'
    );
    assertSeries(
      expandVertical(['2024-02-27'], 4),
      ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01'],
      'Leap year 2024 includes Feb 29'
    );
    assertSeries(
      expandVertical(['1900-02-27'], 4),
      ['1900-02-27', '1900-02-28', '1900-03-01', '1900-03-02'],
      'Century non-leap year 1900 skips Feb 29'
    );
    assertSeries(
      expandVertical(['2100-02-27'], 4),
      ['2100-02-27', '2100-02-28', '2100-03-01', '2100-03-02'],
      'Century non-leap year 2100 skips Feb 29'
    );
    assertSeries(
      expandVertical(['2000-02-27'], 4),
      ['2000-02-27', '2000-02-28', '2000-02-29', '2000-03-01'],
      'Quadricentennial leap year 2000 includes Feb 29'
    );
    assertSeries(
      expandVertical(['2400-02-27'], 4),
      ['2400-02-27', '2400-02-28', '2400-02-29', '2400-03-01'],
      'Quadricentennial leap year 2400 includes Feb 29'
    );
    assertSeries(
      expandVertical(['0004-02-28'], 3),
      ['0004-02-28', '0004-02-29', '0004-03-01'],
      'Early 4-digit year 0004 (< 0100) preserves true year without 1900 offset'
    );
  });

  test('Same day-of-month: monthly 1st stays on the 01st across 28, 30, and 31-day months', () => {
    assertSeries(
      expandVertical(['2026-10-01', '2026-11-01'], 9),
      [
        '2026-10-01',
        '2026-11-01',
        '2026-12-01',
        '2027-01-01',
        '2027-02-01',
        '2027-03-01',
        '2027-04-01',
        '2027-05-01',
        '2027-06-01',
      ],
      'Monthly 1st progression never drifts to 02/05/06'
    );
  });

  test('Same day-of-month: bi-monthly, quarterly, yearly, and reverse monthly', () => {
    assertSeries(
      expandVertical(['2026-01-15', '2026-03-15'], 5),
      ['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15', '2026-09-15'],
      'Bi-monthly on the 15th'
    );
    assertSeries(
      expandVertical(['2026-01-10', '2026-04-10'], 5),
      ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10', '2027-01-10'],
      'Quarterly on the 10th'
    );
    assertSeries(
      expandVertical(['2026-06-15', '2027-06-15'], 4),
      ['2026-06-15', '2027-06-15', '2028-06-15', '2029-06-15'],
      'Yearly on June 15th'
    );
    assertSeries(
      expandVertical(['2026-03-01', '2026-02-01'], 5),
      ['2026-03-01', '2026-02-01', '2026-01-01', '2025-12-01', '2025-11-01'],
      'Reverse monthly on the 1st across year boundary'
    );
  });

  test('End-of-Month (EOM) & End-of-Quarter (EOQ) across leap and non-leap years', () => {
    assertSeries(
      expandVertical(['2026-01-31', '2026-02-28'], 6),
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'],
      'Monthly EOM in non-leap year 2026'
    );
    assertSeries(
      expandVertical(['2024-01-31', '2024-02-29'], 6),
      ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30'],
      'Monthly EOM in leap year 2024'
    );
    assertSeries(
      expandVertical(['2026-04-30', '2026-05-31'], 5),
      ['2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31'],
      'Monthly EOM starting from 30-day April'
    );
    assertSeries(
      expandVertical(['2026-07-31', '2026-08-31'], 8),
      [
        '2026-07-31',
        '2026-08-31',
        '2026-09-30',
        '2026-10-31',
        '2026-11-30',
        '2026-12-31',
        '2027-01-31',
        '2027-02-28',
      ],
      'Monthly EOM starting on consecutive 31-day months (Jul/Aug)'
    );
    assertSeries(
      expandVertical(['2026-03-31', '2026-06-30'], 6),
      ['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31', '2027-03-31', '2027-06-30'],
      'End-of-Quarter (EOQ) progression'
    );
    assertSeries(
      expandVertical(['2024-04-30', '2024-03-31'], 6),
      ['2024-04-30', '2024-03-31', '2024-02-29', '2024-01-31', '2023-12-31', '2023-11-30'],
      'Reverse monthly EOM across leap February and year boundary'
    );
  });

  test('Leap-year February EOM and quadrennial leap-day progressions', () => {
    assertSeries(
      expandVertical(['2024-02-29', '2025-02-28'], 6),
      ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29', '2029-02-28'],
      'Yearly February EOM snaps back to Feb 29 on leap years'
    );
    assertSeries(
      expandVertical(['2092-02-29', '2096-02-29'], 5),
      ['2092-02-29', '2096-02-29', '2100-02-28', '2104-02-29', '2108-02-29'],
      'Quadrennial Feb 29 clamps to Feb 28 in century non-leap year 2100 and recovers in 2104'
    );
  });

  test('Short-month clamping and recovery for 29th and 30th of the month', () => {
    assertSeries(
      expandVertical(['2026-01-30', '2026-02-28'], 5),
      ['2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30'],
      '30th of month clamped in non-leap Feb recovers to 30th in March'
    );
    assertSeries(
      expandVertical(['2024-01-30', '2024-02-29'], 5),
      ['2024-01-30', '2024-02-29', '2024-03-30', '2024-04-30', '2024-05-30'],
      '30th of month clamped in leap Feb (29) recovers to 30th in March'
    );
    assertSeries(
      expandVertical(['2026-02-28', '2026-03-30'], 5),
      ['2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30', '2026-06-30'],
      'First seed clamped in Feb (28) followed by 30th in March continues on 30th'
    );
    const twentyNinthAcrossYears = expandVertical(['2026-01-29', '2026-02-28'], 27);
    assertEqual(twentyNinthAcrossYears[2], '2026-03-29', 'Recovers to 29th in March 2026');
    assertEqual(twentyNinthAcrossYears[13], '2027-02-28', 'Clamps to 28th in non-leap Feb 2027');
    assertEqual(twentyNinthAcrossYears[25], '2028-02-29', 'Hits 29th in leap Feb 2028');
    assertEqual(twentyNinthAcrossYears[26], '2028-03-29', 'Continues on 29th in March 2028');
  });

  test('Fixed day-interval progressions (weekly, bi-weekly, reverse daily)', () => {
    assertSeries(
      expandVertical(['2024-02-19', '2024-02-26'], 5),
      ['2024-02-19', '2024-02-26', '2024-03-04', '2024-03-11', '2024-03-18'],
      'Weekly (+7 days) across leap February'
    );
    assertSeries(
      expandVertical(['2026-01-31', '2026-02-14'], 5),
      ['2026-01-31', '2026-02-14', '2026-02-28', '2026-03-14', '2026-03-28'],
      'Bi-weekly (+14 days) starting on Jan 31 is not misclassified as monthly'
    );
    assertSeries(
      expandVertical(['2024-03-02', '2024-03-01'], 5),
      ['2024-03-02', '2024-03-01', '2024-02-29', '2024-02-28', '2024-02-27'],
      'Reverse daily across leap February'
    );
    assertSeries(
      expandVertical(['2026-03-02', '2026-03-01'], 5),
      ['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27', '2026-02-26'],
      'Reverse daily across non-leap February'
    );
  });

  test('Invalid calendar dates are not expanded as dates (treated as plain text)', () => {
    assertSeries(
      expandVertical(['2026-02-29'], 3),
      ['2026-02-29', '2026-02-29', '2026-02-29'],
      'Feb 29 on non-leap year 2026 repeats literally'
    );
    assertSeries(
      expandVertical(['2100-02-29'], 3),
      ['2100-02-29', '2100-02-29', '2100-02-29'],
      'Feb 29 on century non-leap year 2100 repeats literally'
    );
    assertSeries(
      expandVertical(['2026-04-31'], 3),
      ['2026-04-31', '2026-04-31', '2026-04-31'],
      'April 31 repeats literally'
    );
    assertSeries(
      expandVertical(['2026-13-01'], 3),
      ['2026-13-01', '2026-13-01', '2026-13-01'],
      'Month 13 repeats literally'
    );
  });

  test('Horizontal date expansion, multi-column expansion, and undo/redo', () => {
    const dfRow = new Dataframe([['2024-01-31', '2024-02-29', '', '']]);
    dfRow.fillSeries({ xmin: 0, xmax: 3, ymin: 0, ymax: 0 });
    assertSeries(
      [dfRow.get(0, 0), dfRow.get(1, 0), dfRow.get(2, 0), dfRow.get(3, 0)],
      ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30'],
      'Horizontal EOM expansion across leap Feb'
    );

    const dfMulti = new Dataframe([
      ['2026-10-01', '2026-01-31'],
      ['2026-11-01', '2026-02-28'],
      ['', ''],
      ['', ''],
    ]);
    dfMulti.fillSeries({ xmin: 0, xmax: 1, ymin: 0, ymax: 3 });
    assertSeries(
      [dfMulti.get(0, 2), dfMulti.get(0, 3)],
      ['2026-12-01', '2027-01-01'],
      'Multi-column Col 0 (monthly 1st)'
    );
    assertSeries(
      [dfMulti.get(1, 2), dfMulti.get(1, 3)],
      ['2026-03-31', '2026-04-30'],
      'Multi-column Col 1 (monthly EOM)'
    );

    dfMulti.undo();
    assertEqual(dfMulti.get(0, 2), '', 'Undo clears expanded cell (0,2)');
    assertEqual(dfMulti.get(1, 3), '', 'Undo clears expanded cell (1,3)');
    dfMulti.redo();
    assertEqual(dfMulti.get(0, 2), '2026-12-01', 'Redo restores expanded cell (0,2)');
    assertEqual(dfMulti.get(1, 3), '2026-04-30', 'Redo restores expanded cell (1,3)');
  });

  return { passed, failed };
}

if (process.argv.some(arg => arg.includes('Dataframe.test'))) {
  const res = runDataframeTests();
  process.exit(res.failed > 0 ? 1 : 0);
}

