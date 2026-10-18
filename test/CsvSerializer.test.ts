import assert from 'node:assert';
import { CsvSerializer } from '../app/core/Csv.js';

export function runCsvSerializerTests(): { passed: number; failed: number } {
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

  console.log('\n--- Running CsvSerializer Test Suite ---');

  // =========================================================================
  // 1. RFC 4180 Rule 1: Default CRLF Line Endings
  // =========================================================================
  test('RFC 4180 Rule 1: Serializes rows with CRLF (\\r\\n) by default', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['a', 'b', 'c'],
      ['x', 'y', 'z']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'a,b,c\r\nx,y,z');
  });

  // =========================================================================
  // 2. RFC 4180 Rules 5 & 6: Selective Minimal Quoting
  // =========================================================================
  test('RFC 4180 Rule 5: Plain alphanumeric values and spaces remain unquoted', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['id', 'full name', 'score'],
      ['101', 'Alice Johnson', '95.5']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'id,full name,score\r\n101,Alice Johnson,95.5');
  });

  test('RFC 4180 Rule 6: Quotes fields containing comma delimiters', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['Smith, John', 'active'],
      ['Doe, Jane', 'pending']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '"Smith, John",active\r\n"Doe, Jane",pending');
  });

  test('RFC 4180 Rule 6: Quotes fields containing CRLF and LF line returns', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['line 1\r\nline 2', 'simple'],
      ['line A\nline B', 'simple 2']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '"line 1\r\nline 2",simple\r\n"line A\nline B",simple 2');
  });

  test('RFC 4180 Rule 5 & 6: Empty strings and nulls remain unquoted commas', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['a', '', 'c'],
      ['', null as any, 'z']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'a,,c\r\n,,z');
  });

  // =========================================================================
  // 3. RFC 4180 Rule 7: Double-Quote Escaping ("")
  // =========================================================================
  test('RFC 4180 Rule 7: Quotes fields containing quotes and escapes them as ""', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['He said "Hello"', 'val'],
      ['Single " quote', '10']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '"He said ""Hello""",val\r\n"Single "" quote",10');
  });

  test('RFC 4180 Rule 7: Cell consisting solely of a double quote', () => {
    const serializer = new CsvSerializer();
    const data = [['"']];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '""""');
  });

  // =========================================================================
  // 4. Dialect Settings: quoteAlways
  // =========================================================================
  test('Dialect Setting: quoteAlways quotes all fields including numbers and empty cells', () => {
    const serializer = new CsvSerializer({ quoteAlways: true });
    const data = [
      ['name', 'age', 'note'],
      ['Alice', '30', '']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '"name","age","note"\r\n"Alice","30",""');
  });

  // =========================================================================
  // 5. Dialect Settings: lineTerminator
  // =========================================================================
  test('Dialect Setting: lineTerminator "\\n" serializes Unix LF endings', () => {
    const serializer = new CsvSerializer({ lineTerminator: '\n' });
    const data = [
      ['1', '2'],
      ['3', '4']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '1,2\n3,4');
  });

  // =========================================================================
  // 6. Dialect Settings: escapeChar (\\ vs "")
  // =========================================================================
  test('Dialect Setting: escapeChar \\ escapes quotes as \\" and backslashes as \\\\', () => {
    const serializer = new CsvSerializer({ escapeChar: '\\' });
    const data = [
      ['He said "Hello"', 'normal'],
      ['C:\\Users\\admin', 'path']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '"He said \\"Hello\\"",normal\r\nC:\\\\Users\\\\admin,path');
  });

  // =========================================================================
  // 7. Dialect Settings: Delimiters (Semicolon, Tab, Pipe)
  // =========================================================================
  test('Dialect Setting: Semicolon delimiter (;)', () => {
    const serializer = new CsvSerializer({ delimiter: ';' });
    const data = [
      ['a', 'b;c', 'd'],
      ['1', '2', '3']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'a;"b;c";d\r\n1;2;3');
  });

  test('Dialect Setting: Tab delimiter (TAB / \\t)', () => {
    const serializer = new CsvSerializer({ delimiter: 'TAB' });
    const data = [
      ['col1', 'col2'],
      ['val1', 'val2']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'col1\tcol2\r\nval1\tval2');
  });

  test('Dialect Setting: Pipe delimiter (|)', () => {
    const serializer = new CsvSerializer({ delimiter: '|' });
    const data = [
      ['a', 'b|c'],
      ['1', '2']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, 'a|"b|c"\r\n1|2');
  });

  // =========================================================================
  // 8. Dialect Settings: fixedWidth and isStrict
  // =========================================================================
  test('Dialect Setting: fixedWidth pads fields with leading spaces', () => {
    const serializer = new CsvSerializer({ fixedWidth: 5 });
    const data = [
      ['1', '22'],
      ['333', '4444']
    ];
    const res = serializer.serialize(data);
    assert.strictEqual(res, '    1,   22\r\n  333, 4444');
  });

  test('Dialect Setting: isStrict throws error if special chars require quoting', () => {
    const serializer = new CsvSerializer({ isStrict: true });
    assert.throws(() => {
      serializer.serialize([['comma,here']]);
    }, /Strict csv format not respected/);

    assert.throws(() => {
      serializer.serialize([['quote"here']]);
    }, /Strict csv format not respected/);
  });

  // =========================================================================
  // 9. Format Serialization: JSON Export (serializeJson)
  // =========================================================================
  test('JSON Export: serializeJson with headers produces array of objects', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['id', 'name', 'score'],
      ['1', 'Alice', '95'],
      ['2', 'Bob', '88']
    ];
    const res = serializer.serializeJson(data, { hasHeader: true, pretty: false });
    const parsed = JSON.parse(res);
    assert.deepStrictEqual(parsed, [
      { id: '1', name: 'Alice', score: '95' },
      { id: '2', name: 'Bob', score: '88' }
    ]);
  });

  test('JSON Export: serializeJson without headers produces array of arrays', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['1', 'Alice'],
      ['2', 'Bob']
    ];
    const res = serializer.serializeJson(data, { hasHeader: false, pretty: false });
    const parsed = JSON.parse(res);
    assert.deepStrictEqual(parsed, [
      ['1', 'Alice'],
      ['2', 'Bob']
    ]);
  });

  test('JSON Export: deduplicates identical header names', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['tag', 'tag', 'tag'],
      ['val1', 'val2', 'val3']
    ];
    const res = serializer.serializeJson(data, { hasHeader: true, pretty: false });
    const parsed = JSON.parse(res);
    assert.deepStrictEqual(parsed, [
      { tag: 'val1', tag_2: 'val2', tag_3: 'val3' }
    ]);
  });

  // =========================================================================
  // 10. Format Serialization: Markdown & TSV Export
  // =========================================================================
  test('Markdown Export: serializeMarkdown creates GFM table', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['Name', 'Role'],
      ['Alice', 'Admin'],
      ['Bob', 'Editor']
    ];
    const md = serializer.serializeMarkdown(data);
    assert.ok(md.includes('| Name | Role |'));
    assert.ok(md.includes('| --- | --- |'));
    assert.ok(md.includes('| Alice | Admin |'));
    assert.ok(md.includes('| Bob | Editor |'));
  });

  test('Markdown Export: escapes pipe character (|) and converts newlines to <br>', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['col1', 'col2'],
      ['val|with|pipes', 'multiline\ntext']
    ];
    const md = serializer.serializeMarkdown(data);
    assert.ok(md.includes('val\\|with\\|pipes'));
    assert.ok(md.includes('multiline<br>text'));
  });

  test('TSV Export: serializeTsv shortcut serializes with tabs', () => {
    const serializer = new CsvSerializer();
    const data = [
      ['a', 'b'],
      ['c', 'd']
    ];
    const tsv = serializer.serializeTsv(data);
    assert.strictEqual(tsv, 'a\tb\r\nc\td');
  });

  return { passed, failed };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const result = runCsvSerializerTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
