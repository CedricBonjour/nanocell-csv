import assert from 'node:assert';
import { SeparatorDetector } from '../core/csv/SeparatorDetector.js';

export function runSeparatorDetectorTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(err);
    }
  }

  console.log('\n--- Running SeparatorDetector Test Suite ---');

  test('Detects standard comma delimiter (,)', () => {
    const input = 'id,name,email,score\n1,Alice,alice@example.com,95\n2,Bob,bob@example.com,88';
    assert.strictEqual(SeparatorDetector.detect(input), ',');
  });

  test('Detects semicolon delimiter (;)', () => {
    const input = 'id;name;country;active\n1;Jean;France;true\n2;Hans;Germany;false';
    assert.strictEqual(SeparatorDetector.detect(input), ';');
  });

  test('Detects tab delimiter (\\t)', () => {
    const input = 'col1\tcol2\tcol3\nval1\tval2\tval3\n10\t20\t30';
    assert.strictEqual(SeparatorDetector.detect(input), '\t');
  });

  test('Detects pipe delimiter (|)', () => {
    const input = 'id|title|author|year\n101|Book A|Author A|2020\n102|Book B|Author B|2021';
    assert.strictEqual(SeparatorDetector.detect(input), '|');
  });

  test('Quoted semicolons inside cells do NOT mislead comma detection', () => {
    // Semicolons are inside quotes, comma is outside
    const input = 'id,tags,status\n1,"tag1;tag2;tag3;tag4",active\n2,"tagA;tagB;tagC",pending';
    assert.strictEqual(SeparatorDetector.detect(input), ',');
  });

  test('Quoted commas inside cells do NOT mislead semicolon detection', () => {
    // Commas are inside quotes, semicolon is outside
    const input = 'id;description;active\n1;"Item, with, multiple, commas";true\n2;"Another, item, here";false';
    assert.strictEqual(SeparatorDetector.detect(input), ';');
  });

  test('Quoted commas inside cells do NOT mislead tab detection', () => {
    const input = 'name\taddress\tcity\nAlice\t"123 Main St, Apt 4, Building B"\tNew York';
    assert.strictEqual(SeparatorDetector.detect(input), '\t');
  });

  test('Escaped double quotes ("") inside quotes do not break quote tracking', () => {
    const input = 'id,text,val\n1,"He said ""hello;world;test"" to me",100\n2,"Another ""quoted;text""",200';
    assert.strictEqual(SeparatorDetector.detect(input), ',');
  });

  test('Colon (:) is NOT detected as delimiter (timestamps and URLs preserved)', () => {
    const input = 'timestamp,url,action\n10:30:00,https://example.com,login\n11:45:15,https://api.test.org,fetch';
    assert.strictEqual(SeparatorDetector.detect(input), ',');
  });

  test('Empty string falls back to comma (,)', () => {
    assert.strictEqual(SeparatorDetector.detect(''), ',');
  });

  test('Whitespace-only string falls back to comma (,)', () => {
    assert.strictEqual(SeparatorDetector.detect('   \n  \t  \n  '), '\t'); // \t has 1 count, valid
    assert.strictEqual(SeparatorDetector.detect('   \n  \n  '), ','); // No candidate chars, fallback comma
  });

  test('Single column data with no candidate separators falls back to comma (,)', () => {
    const input = 'header\nvalue1\nvalue2\nvalue3';
    assert.strictEqual(SeparatorDetector.detect(input), ',');
  });

  test('Sample limit: handles input exceeding 2000 characters cleanly', () => {
    const row = 'colA,colB,colC\n';
    const longInput = row.repeat(300); // ~4500 chars
    assert.strictEqual(SeparatorDetector.detect(longInput), ',');
  });

  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const result = runSeparatorDetectorTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
