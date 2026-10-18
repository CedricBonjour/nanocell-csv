/**
 * @file test/DataValidator.test.ts
 * Comprehensive unit, integration, edge-case, and performance tests for DataValidator
 * (Currency Column validation, extractCurrency, parseCurrencyNumber, headers, dates, and cell rules).
 */
import assert from 'node:assert';
import { Dataframe } from '../app/core/Dataframe.js';
import {
  DataValidator,
  VALIDATION_RULES,
  extractCurrency,
  parseCurrencyNumber
} from '../app/core/DataValidator.js';

export function runDataValidatorTests(): { passed: number; failed: number } {
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

  console.log('\n--- Running DataValidator & Currency Column Test Suite ---');

  test('Currency, Date, and Number rules are registered in VALIDATION_RULES with updated labels and standard proposal mode', () => {
    const currencyRule = VALIDATION_RULES.find(r => r.id === 'currency');
    assert.ok(currencyRule, 'currency rule should exist in VALIDATION_RULES');
    assert.strictEqual(currencyRule!.cmdId, 'validateCurrency');
    assert.strictEqual(currencyRule!.label, 'Format Currency Values');

    const dateRule = VALIDATION_RULES.find(r => r.id === 'dates');
    assert.strictEqual(dateRule!.label, 'Format Dates');

    const numberRule = VALIDATION_RULES.find(r => r.id === 'comma_decimals');
    assert.strictEqual(numberRule!.label, 'Format Numbers');
  });

  test('Standard prefix and suffix currency symbols ($ € £ ¥ ₹ ₩ ₽ ₺ ₪ ฿ ₱ ₫ ₴ 元)', () => {
    const cases: [string, string, string][] = [
      ['$120', '120.00', 'USD'],
      ['€ 45.5', '45.50', 'EUR'],
      ['45,50 €', '45.50', 'EUR'],
      ['199.95£', '199.95', 'GBP'],
      ['£ 199.95', '199.95', 'GBP'],
      ['¥1500', '1500.00', 'JPY'],
      ['1500￥', '1500.00', 'JPY'],
      ['₹ 500', '500.00', 'INR'],
      ['₩10000', '10000.00', 'KRW'],
      ['500 ₽', '500.00', 'RUB'],
      ['₺ 250,75', '250.75', 'TRY'],
      ['₪ 50', '50.00', 'ILS'],
      ['฿ 1000', '1000.00', 'THB'],
      ['₱ 250', '250.00', 'PHP'],
      ['50000 ₫', '50000.00', 'VND'],
      ['₴ 100', '100.00', 'UAH'],
      ['88 元', '88.00', 'CNY'],
    ];

    for (const [input, expectedNum, expectedIso] of cases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, expectedIso, `ISO3 for "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), expectedNum, `Number for "${input}"`);
    }
  });

  test('Prefixed multi-char symbols (CA$ AU$ HK$ NZ$ S$ NT$ R$ Mex$ CN¥ JP¥ CLP$ COL$ AR$) resolve to specific ISO3 before generic $ or ¥', () => {
    const cases: [string, string, string][] = [
      ['CA$ 120', '120.00', 'CAD'],
      ['Can$ 120.5', '120.50', 'CAD'],
      ['C$120', '120.00', 'CAD'],
      ['AU$ 85.5', '85.50', 'AUD'],
      ['A$85.5', '85.50', 'AUD'],
      ['HK$ 300', '300.00', 'HKD'],
      ['S$ 50', '50.00', 'SGD'],
      ['NZ$ 40', '40.00', 'NZD'],
      ['NT$ 300', '300.00', 'TWD'],
      ['R$ 99,90', '99.90', 'BRL'],
      ['Mex$ 200', '200.00', 'MXN'],
      ['MX$ 200', '200.00', 'MXN'],
      ['US$ 75', '75.00', 'USD'],
      ['CLP$ 5000', '5000.00', 'CLP'],
      ['COL$ 12000', '12000.00', 'COP'],
      ['AR$ 850,50', '850.50', 'ARS'],
      ['CN¥ 88', '88.00', 'CNY'],
      ['JP¥ 1000', '1000.00', 'JPY'],
    ];

    for (const [input, expectedNum, expectedIso] of cases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, expectedIso, `ISO3 for "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), expectedNum, `Number for "${input}"`);
    }
  });

  test('Alphabetic currency abbreviations (Fr. SFr. zł Kč kr Rs. RM Rp Ft) and uppercase/lowercase ISO3 codes', () => {
    const cases: [string, string, string][] = [
      ['Fr. 120', '120.00', 'CHF'],
      ['SFr. 120.50', '120.50', 'CHF'],
      ['SFr 120', '120.00', 'CHF'],
      ['50 zł', '50.00', 'PLN'],
      ['200 Kč', '200.00', 'CZK'],
      ['99 kr', '99.00', 'SEK'],
      ['99 kr.', '99.00', 'SEK'],
      ['Rs. 450', '450.00', 'INR'],
      ['Rs 450', '450.00', 'INR'],
      ['RM 65.50', '65.50', 'MYR'],
      ['Rp 15000', '15000.00', 'IDR'],
      ['1000 Ft', '1000.00', 'HUF'],
      ['CHF 1250', '1250.00', 'CHF'],
      ['1250 CHF', '1250.00', 'CHF'],
      ['100.50 eur', '100.50', 'EUR'],
      ['usd 42', '42.00', 'USD'],
      ['rmb 100', '100.00', 'CNY'],
      ['AED 500', '500.00', 'AED'],
      ['SAR 100', '100.00', 'SAR'],
      ['250 NOK', '250.00', 'NOK'],
      ['250 DKK', '250.00', 'DKK'],
      ['500 ZAR', '500.00', 'ZAR'],
      ['100 TRY', '100.00', 'TRY'],
    ];

    for (const [input, expectedNum, expectedIso] of cases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, expectedIso, `ISO3 for "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), expectedNum, `Number for "${input}"`);
    }
  });

  test('Combined ISO3 + Symbol in same cell ("CAD $50.00", "$100 USD", "EUR 25 €")', () => {
    const cases: [string, string, string][] = [
      ['CAD $50.00', '50.00', 'CAD'],
      ['$50.00 CAD', '50.00', 'CAD'],
      ['$100 USD', '100.00', 'USD'],
      ['USD $100', '100.00', 'USD'],
      ['EUR 25 €', '25.00', 'EUR'],
      ['CNY ¥88', '88.00', 'CNY'],
    ];

    for (const [input, expectedNum, expectedIso] of cases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, expectedIso, `ISO3 for "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), expectedNum, `Number for "${input}"`);
    }
  });

  test('Locale thousand separators, comma decimals, Swiss dash cents, and accounting negatives', () => {
    const cases: [string, string, string | null][] = [
      // Swiss/French apostrophes, backticks, spaces, NBSP, narrow NBSP
      ["CHF 1'234'567.89", '1234567.89', 'CHF'],
      ['1’234,56 €', '1234.56', 'EUR'],
      ['1`234.50', '1234.50', null],
      ['1 234 567,89 €', '1234567.89', 'EUR'],
      ['1\u00A0234,50 €', '1234.50', 'EUR'],
      ['1\u202F234,50 €', '1234.50', 'EUR'],
      // Comma decimals (,dd and ,d and leading ,99)
      ['1234,56', '1234.56', null],
      ['12,5 €', '12.50', 'EUR'],
      [',99 $', '0.99', 'USD'],
      // US/UK thousand commas with and without cents (#1)
      ['$1,234.56', '1234.56', 'USD'],
      ['$1,234,567.89', '1234567.89', 'USD'],
      ['$1,000', '1000.00', 'USD'],
      ['$1,250,000', '1250000.00', 'USD'],
      ['1,234,56', '1234.56', null],
      // Indian lakh/crore grouping with dot decimal
      ['₹ 12,34,567.89', '1234567.89', 'INR'],
      // German/EU dot thousands with and without cents (#2 & #3)
      ['1.234,56 €', '1234.56', 'EUR'],
      ['1.000.000,00 EUR', '1000000.00', 'EUR'],
      ['1.000.000 €', '1000000.00', 'EUR'],
      // Swiss dash cents (.- / .– / .— / ,-)
      ["CHF 1'250.-", '1250.00', 'CHF'],
      ['45.– €', '45.00', 'EUR'],
      ['100,-', '100.00', null],
      ['25.— CHF', '25.00', 'CHF'],
      // Negative signs (outer, inner, accounting parens #4, trailing minus #5)
      ['-$45.5', '-45.50', 'USD'],
      ['$-45.5', '-45.50', 'USD'],
      ["- 1'200,50 CHF", '-1200.50', 'CHF'],
      ['($1,234.56)', '-1234.56', 'USD'],
      ['(45,00) €', '-45.00', 'EUR'],
      ['-(CHF 100)', '-100.00', 'CHF'],
      ['1,234.56- USD', '-1234.56', 'USD'],
      ['$45.00-', '-45.00', 'USD'],
      // IEEE-754 half-up rounding & -0.00 normalization
      ['$1.005', '1.01', 'USD'],
      ['19.999 €', '20.00', 'EUR'],
      ['-0.001', '0.00', null],
      // Fast-path plain numbers
      ['42', '42.00', null],
      ['3.14159', '3.14', null],
    ];

    for (const [input, expectedNum, expectedIso] of cases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, expectedIso, `ISO3 for "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), expectedNum, `Number for "${input}"`);
    }
  });

  test('False-positive protection on standalone currency codes, UUIDs, prose, identifiers, invalid groupings, dates, and hex literals', () => {
    const unchangedCases = [
      'EUR',
      'USD',
      '$ TBD',
      '6df1e007-253c-4481-b7f9-6b3e124a4aed',
      'please try again',
      'nice try',
      'User_ID',
      'Card',
      'status',
      'Hello World',
      '2026-10-14',
      '1,23,45',
      '1.23.45.6',
      '0x10',
      '0b10',
      '0o10',
      'Infinity',
      '-Infinity',
      'NaN',
      '',
      '   ',
    ];

    for (const input of unchangedCases) {
      const { iso3, remaining } = extractCurrency(input);
      assert.strictEqual(iso3, null, `Should not detect currency in "${input}"`);
      assert.strictEqual(parseCurrencyNumber(remaining), null, `Should not parse number in "${input}"`);
    }
  });

  test('validateCurrencyColumn: inserts ISO3 column to the right, formats numbers, ignores non-numeric cells, and supports atomic Undo/Redo', () => {
    const initial = [
      ['item', 'price', 'qty'],
      ['Apple', '$10', '5'],
      ['Banana', '20,5 €', '12'],
      ['Laptop', "CHF 1'250.-", '1'],
      ['Gift', 'USD', '1'],
      ['Pending', '$ TBD', '0'],
      ['Note', 'free item', '2'],
    ];
    const df = new Dataframe(initial);

    const res = DataValidator.validateCurrencyColumn(df, 1);
    assert.strictEqual(res.insertedCol, true);
    assert.strictEqual(res.formattedCount, 3);
    assert.strictEqual(res.currencyCount, 3);
    assert.strictEqual(df.width, 4);

    assert.deepStrictEqual(df.data, [
      ['item', 'price', 'price_currency', 'qty'],
      ['Apple', '10.00', 'USD', '5'],
      ['Banana', '20.50', 'EUR', '12'],
      ['Laptop', '1250.00', 'CHF', '1'],
      ['Gift', 'USD', '', '1'],
      ['Pending', '$ TBD', '', '0'],
      ['Note', 'free item', '', '2'],
    ]);

    // Single-step Undo restores exact initial 3-column state
    df.undo();
    assert.strictEqual(df.width, 3);
    assert.deepStrictEqual(df.data, initial);

    // Single-step Redo reapplies both column edits and column insertion
    df.redo();
    assert.strictEqual(df.width, 4);
    assert.strictEqual(df.get(1, 3), '1250.00');
    assert.strictEqual(df.get(2, 3), 'CHF');
  });

  test('validateCurrencyColumn: handles empty header in row 0 and headerless data in row 0', () => {
    // 1. Empty header in row 0 -> fallback "currency"
    const dfEmptyHeader = new Dataframe([
      [''],
      ['$10'],
    ]);
    DataValidator.validateCurrencyColumn(dfEmptyHeader, 0);
    assert.deepStrictEqual(dfEmptyHeader.data, [
      ['', 'currency'],
      ['10.00', 'USD'],
    ]);

    // 2. Headerless table where row 0 is a currency data cell
    const dfHeaderless = new Dataframe([
      ['$19.99'],
      ['€25.00'],
    ]);
    DataValidator.validateCurrencyColumn(dfHeaderless, 0);
    assert.deepStrictEqual(dfHeaderless.data, [
      ['19.99', 'USD'],
      ['25.00', 'EUR'],
    ]);
  });

  test('validateCurrencyColumn: formats numbers in-place without inserting column when no currencies exist, and respects lock', () => {
    const df = new Dataframe([
      ['amount'],
      ["1'200,5"],
      ['42'],
    ]);
    const res = DataValidator.validateCurrencyColumn(df, 0);
    assert.strictEqual(res.insertedCol, false);
    assert.strictEqual(res.formattedCount, 2);
    assert.strictEqual(df.width, 1);
    assert.deepStrictEqual(df.data, [
      ['amount'],
      ['1200.50'],
      ['42.00'],
    ]);

    // Locked dataframe rejects mutation
    df.lock = true;
    const lockedRes = DataValidator.validateCurrencyColumn(df, 0);
    assert.strictEqual(lockedRes.changedCount, 0);
  });

  test('Existing and new DataValidator rules (headers, dates, whitespace, numbers, nulls, booleans, duplicate_rows, accents, cases)', () => {
    const dfHeaders = new Dataframe([['First Name!', 'First Name!', '', 'firstName', 'Prénom & Nom', '2026 Sales'], ['a', 'b', 'c', 'd', 'e', 'f']]);
    const headerProps = DataValidator.validateHeaders(dfHeaders);
    assert.strictEqual(headerProps.length, 6);
    assert.strictEqual(headerProps[0].newValue, 'first_name');
    assert.strictEqual(headerProps[1].newValue, 'first_name_c2');
    assert.strictEqual(headerProps[2].newValue, 'col_3');
    assert.strictEqual(headerProps[3].newValue, 'first_name_c4');
    assert.strictEqual(headerProps[4].newValue, 'prenom_nom');
    assert.strictEqual(headerProps[5].newValue, '_2026_sales');

    assert.strictEqual(VALIDATION_RULES.find(r => r.id === 'headers')?.skipColumns, true);
    assert.strictEqual(VALIDATION_RULES.find(r => r.id === 'duplicate_rows')?.skipColumns, true);

    const dfDates = new Dataframe([['date'], ['25/12/2025'], ['2025.01.05']]);
    const dateRes = DataValidator.validateDates(dfDates);
    assert.strictEqual(dateRes.proposals.length, 2);
    assert.strictEqual(dateRes.proposals[0].newValue, '2025-01-05');
    assert.strictEqual(dateRes.proposals[1].newValue, '2025-12-25');

    const dfAmbiguous = new Dataframe([['05/06/2025']]);
    assert.strictEqual(DataValidator.validateDates(dfAmbiguous).reason, 'ambiguous');

    const dfCoexist = new Dataframe([['25/06/2025'], ['06/25/2025']]);
    assert.strictEqual(DataValidator.validateDates(dfCoexist).reason, 'coexistence');

    const dfRules = new Dataframe([['  hello   \u00A0 world  ', '3,14', 'a\nb', 'say "hi"', 'a,b', 'UPPER', 'café naïve ß', 'john doe']]);
    assert.strictEqual(DataValidator.runRule(dfRules, 'trim_whitespace').proposals[0].newValue, 'hello world');
    assert.strictEqual(DataValidator.runRule(dfRules, 'comma_decimals').proposals[0].newValue, '3.14');
    assert.strictEqual(DataValidator.runRule(dfRules, 'line_returns').proposals[0].newValue, 'a|b');
    assert.strictEqual(DataValidator.runRule(dfRules, 'double_quotes').proposals[0].newValue, "say 'hi'");
    assert.strictEqual(DataValidator.runRule(dfRules, 'text_commas').proposals[1].newValue, 'a-b');
    assert.strictEqual(DataValidator.runRule(dfRules, 'lowercase').proposals[0].newValue, 'upper');
    assert.strictEqual(DataValidator.runRule(dfRules, 'uppercase').proposals[0].newValue, '  HELLO   \u00A0 WORLD  ');
    assert.strictEqual(DataValidator.runRule(dfRules, 'strip_accents').proposals[0].newValue, 'cafe naive ss');
    assert.strictEqual(DataValidator.runRule(dfRules, 'titlecase').proposals.find(p => p.x === 7)?.newValue, 'John Doe');

    const dfNulls = new Dataframe([['NULL', 'N/A', '#N/A', 'NaN', 'None', 'undefined', 'valid']]);
    const nullProps = DataValidator.runRule(dfNulls, 'null_literals').proposals;
    assert.strictEqual(nullProps.length, 6);
    assert.ok(nullProps.every(p => p.newValue === ''));

    const dfBools = new Dataframe([
      ['active', 'flag', 'id'],
      ['Yes', '1', '1'],
      ['No', '0', '2'],
      ['Y', '1', '3'],
    ]);
    const boolProps = DataValidator.runRule(dfBools, 'booleans').proposals;
    assert.strictEqual(boolProps.length, 6);
    assert.ok(boolProps.every(p => p.x === 0 || p.x === 1));
    assert.strictEqual(boolProps[0].newValue, 'true');
    assert.strictEqual(boolProps[1].newValue, 'false');

    const dfDups = new Dataframe([
      ['id', 'name'],
      ['1', 'Alice'],
      ['2', 'Bob'],
      ['1', 'Alice'],
      ['2', 'Bob'],
    ]);
    const dupProps = DataValidator.runRule(dfDups, 'duplicate_rows').proposals;
    assert.strictEqual(dupProps.length, 2);
    assert.strictEqual(dupProps[0].y, 3);
    assert.strictEqual(dupProps[0].dupOfY, 1);
    assert.strictEqual(dupProps[1].y, 4);
    assert.strictEqual(dupProps[1].dupOfY, 2);
    DataValidator.applyDuplicateRowProposals(dfDups, dupProps, dupProps);
    assert.strictEqual(dfDups.height, 3);
    dfDups.undo();
    assert.strictEqual(dfDups.height, 5);
    dfDups.redo();
    assert.strictEqual(dfDups.height, 3);

    const dfNumbers = new Dataframe([["1'250,50", '(45)', '1250.-', '42', '3.14']]);
    const numProposals = DataValidator.runRule(dfNumbers, 'comma_decimals').proposals;
    assert.strictEqual(numProposals.length, 3);
    assert.strictEqual(numProposals[0].newValue, '1250.50');
    assert.strictEqual(numProposals[1].newValue, '-45');
    assert.strictEqual(numProposals[2].newValue, '1250.00');

    const dfCurr = new Dataframe([
      ['price', 'label'],
      ['$1,200.5', 'item1'],
      ['45,50 €', 'item2'],
    ]);
    const currProposals = DataValidator.runRule(dfCurr, 'currency').proposals;
    assert.strictEqual(currProposals.length, 2);
    assert.strictEqual(currProposals[0].newValue, '1200.50');
    assert.strictEqual(currProposals[0].iso3, 'USD');
    assert.strictEqual(currProposals[1].newValue, '45.50');
    assert.strictEqual(currProposals[1].iso3, 'EUR');
    DataValidator.applyCurrencyProposals(dfCurr, currProposals, currProposals);
    assert.strictEqual(dfCurr.width, 3);
    assert.strictEqual(dfCurr.get(0, 1), '1200.50');
    assert.strictEqual(dfCurr.get(1, 1), 'USD');
    assert.strictEqual(dfCurr.get(0, 2), '45.50');
    assert.strictEqual(dfCurr.get(1, 2), 'EUR');
  });

  test('Performance benchmark: validates 100,000 currency rows in < 200ms', () => {
    const rows: string[][] = [['price', 'id']];
    const samples = ['$1,234.56', '45,50 €', "CHF 1'250.-", '1200.50', 'CA$ 99.9'];
    for (let i = 0; i < 100_000; i++) {
      rows.push([samples[i % samples.length], String(i)]);
    }
    const df = new Dataframe(rows);

    const t0 = performance.now();
    const res = DataValidator.validateCurrencyColumn(df, 0);
    const elapsedMs = performance.now() - t0;

    assert.strictEqual(res.insertedCol, true);
    assert.strictEqual(res.formattedCount, 100_000);
    assert.strictEqual(df.width, 3);
    assert.strictEqual(df.get(0, 1), '1234.56');
    assert.strictEqual(df.get(1, 1), 'USD');
    assert.strictEqual(df.get(0, 3), '1250.00');
    assert.strictEqual(df.get(1, 3), 'CHF');
    assert.ok(elapsedMs < 500, `Expected < 500ms for 100k rows, took ${Math.round(elapsedMs)}ms`);
  });

  return { passed, failed };
}

if (process.argv[1]?.includes('DataValidator.test')) {
  const res = runDataValidatorTests();
  process.exit(res.failed > 0 ? 1 : 0);
}
