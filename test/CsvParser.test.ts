import assert from 'node:assert';
import { CsvParser } from '../core/csv/CsvParser.js';

export function runCsvParserTests(): { passed: number; failed: number } {
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

  console.log('\n--- Running CsvParser Test Suite ---');

  // =========================================================================
  // 1. RFC 4180 Rule 1: Record Delimiters (CRLF, LF, CR, Mixed)
  // =========================================================================
  test('RFC 4180 Rule 1: Standard CRLF record line breaks', () => {
    const parser = new CsvParser();
    const res = parser.parse('aaa,bbb,ccc\r\nzzz,yyy,xxx\r\n');
    assert.deepStrictEqual(res, [
      ['aaa', 'bbb', 'ccc'],
      ['zzz', 'yyy', 'xxx']
    ]);
  });

  test('RFC 4180 Rule 1: Unix LF record line breaks', () => {
    const parser = new CsvParser();
    const res = parser.parse('aaa,bbb,ccc\nzzz,yyy,xxx\n');
    assert.deepStrictEqual(res, [
      ['aaa', 'bbb', 'ccc'],
      ['zzz', 'yyy', 'xxx']
    ]);
  });

  test('RFC 4180 Rule 1: Legacy Mac CR record line breaks', () => {
    const parser = new CsvParser();
    const res = parser.parse('aaa,bbb,ccc\rzzz,yyy,xxx\r');
    assert.deepStrictEqual(res, [
      ['aaa', 'bbb', 'ccc'],
      ['zzz', 'yyy', 'xxx']
    ]);
  });

  test('RFC 4180 Rule 1: Mixed line breaks in same file', () => {
    const parser = new CsvParser();
    const res = parser.parse('r1c1,r1c2\r\nr2c1,r2c2\nr3c1,r3c2\rr4c1,r4c2');
    assert.deepStrictEqual(res, [
      ['r1c1', 'r1c2'],
      ['r2c1', 'r2c2'],
      ['r3c1', 'r3c2'],
      ['r4c1', 'r4c2']
    ]);
  });

  // =========================================================================
  // 2. RFC 4180 Rule 2: Optional Ending Line Break at EOF
  // =========================================================================
  test('RFC 4180 Rule 2: File ending with CRLF does not create ghost row', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b\r\nc,d\r\n');
    assert.deepStrictEqual(res, [
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  test('RFC 4180 Rule 2: File ending with LF does not create ghost row', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b\nc,d\n');
    assert.deepStrictEqual(res, [
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  test('RFC 4180 Rule 2: File without trailing line break at EOF', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b\r\nc,d');
    assert.deepStrictEqual(res, [
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  test('RFC 4180 Rule 2: Single-line file without trailing line break', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b,c');
    assert.deepStrictEqual(res, [['a', 'b', 'c']]);
  });

  test('RFC 4180 Rule 2: Single-line file with trailing line break', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b,c\r\n');
    assert.deepStrictEqual(res, [['a', 'b', 'c']]);
  });

  // =========================================================================
  // 3. RFC 4180 Rule 4: Field Delimiter & Whitespace Rules
  // =========================================================================
  test('RFC 4180 Rule 4: Spaces are part of field by default (NO automatic trimming)', () => {
    const parser = new CsvParser();
    const res = parser.parse('  val1  , val2 ,val3 ');
    assert.deepStrictEqual(res, [['  val1  ', ' val2 ', 'val3 ']]);
  });

  test('RFC 4180 Rule 4: Empty fields between commas', () => {
    const parser = new CsvParser();
    const res = parser.parse('1,,3\r\n,,');
    assert.deepStrictEqual(res, [
      ['1', '', '3'],
      ['', '', '']
    ]);
  });

  test('RFC 4180 Rule 4: Trailing empty field before newline', () => {
    const parser = new CsvParser();
    const res = parser.parse('a,b,\r\nc,d,\r\n');
    assert.deepStrictEqual(res, [
      ['a', 'b', ''],
      ['c', 'd', '']
    ]);
  });

  test('RFC 4180 Rule 4: Empty string input returns empty array', () => {
    const parser = new CsvParser();
    const res = parser.parse('');
    assert.deepStrictEqual(res, []);
  });

  // =========================================================================
  // 4. RFC 4180 Rules 5 & 6: Quoted Fields & Special Characters
  // =========================================================================
  test('RFC 4180 Rule 5: Standard quoted fields', () => {
    const parser = new CsvParser();
    const res = parser.parse('"hello","world"\r\n"123","456"');
    assert.deepStrictEqual(res, [
      ['hello', 'world'],
      ['123', '456']
    ]);
  });

  test('RFC 4180 Rule 5: Empty quoted fields', () => {
    const parser = new CsvParser();
    const res = parser.parse('"","","test"\r\n""');
    assert.deepStrictEqual(res, [
      ['', '', 'test'],
      ['']
    ]);
  });

  test('RFC 4180 Rule 6: Delimiters inside quotes are preserved as cell data', () => {
    const parser = new CsvParser();
    const res = parser.parse('1,"Smith, John",active\r\n2,"Doe, Jane, Jr.",pending');
    assert.deepStrictEqual(res, [
      ['1', 'Smith, John', 'active'],
      ['2', 'Doe, Jane, Jr.', 'pending']
    ]);
  });

  test('RFC 4180 Rule 6: Multiline record with CRLF inside quotes', () => {
    const parser = new CsvParser();
    const res = parser.parse('1,"line 1\r\nline 2",done\r\n2,simple,next');
    assert.deepStrictEqual(res, [
      ['1', 'line 1\r\nline 2', 'done'],
      ['2', 'simple', 'next']
    ]);
  });

  test('RFC 4180 Rule 6: Multiline record with LF inside quotes', () => {
    const parser = new CsvParser();
    const res = parser.parse('1,"line 1\nline 2\nline 3",done');
    assert.deepStrictEqual(res, [
      ['1', 'line 1\nline 2\nline 3', 'done']
    ]);
  });

  test('RFC 4180 Rule 6: Semicolons, tabs, and pipes preserved inside quotes', () => {
    const parser = new CsvParser();
    const res = parser.parse('1,"a;b;c","x\ty\tz","p|q|r"');
    assert.deepStrictEqual(res, [
      ['1', 'a;b;c', 'x\ty\tz', 'p|q|r']
    ]);
  });

  // =========================================================================
  // 5. RFC 4180 Rule 7: Escaped Double-Quotes ("")
  // =========================================================================
  test('RFC 4180 Rule 7: Double double-quote "" escapes to a single quote', () => {
    const parser = new CsvParser();
    const res = parser.parse('"aaa","b""bb","ccc"');
    assert.deepStrictEqual(res, [['aaa', 'b"bb', 'ccc']]);
  });

  test('RFC 4180 Rule 7: Escaped quote as the entire field ("""")', () => {
    const parser = new CsvParser();
    const res = parser.parse('""""');
    assert.deepStrictEqual(res, [['"']]);
  });

  test('RFC 4180 Rule 7: Escaped quote at start, middle, and end of field', () => {
    const parser = new CsvParser();
    const res = parser.parse('"""start""","""middle""","""end"""');
    assert.deepStrictEqual(res, [['"start"', '"middle"', '"end"']]);
  });

  test('RFC 4180 Rule 7: Consecutive escaped quotes ("""" and """""")', () => {
    const parser = new CsvParser();
    const res = parser.parse('"""","""""""');
    assert.deepStrictEqual(res, [['"', '"""']]);
  });

  // =========================================================================
  // 6. Text Patterns & Special Characters
  // =========================================================================
  test('Text Patterns: Accented characters, umlauts, cedillas', () => {
    const parser = new CsvParser();
    const res = parser.parse('café,naïve,français,München,año\r\n"crème brûlée",curaçao');
    assert.deepStrictEqual(res, [
      ['café', 'naïve', 'français', 'München', 'año'],
      ['crème brûlée', 'curaçao']
    ]);
  });

  test('Text Patterns: Emojis and surrogate pairs', () => {
    const parser = new CsvParser();
    const res = parser.parse('🚀,📊,"🌍 World",🎉\r\n"Line with 😀 emoji",100');
    assert.deepStrictEqual(res, [
      ['🚀', '📊', '🌍 World', '🎉'],
      ['Line with 😀 emoji', '100']
    ]);
  });

  test('Text Patterns: CJK characters (Chinese, Japanese, Korean)', () => {
    const parser = new CsvParser();
    const res = parser.parse('東京,北京,서울\r\n"日本語, テキスト","中文, 文本"');
    assert.deepStrictEqual(res, [
      ['東京', '北京', '서울'],
      ['日本語, テキスト', '中文, 文本']
    ]);
  });

  test('Text Patterns: Currency symbols ($ opens inline math edge case)', () => {
    const parser = new CsvParser();
    const res = parser.parse('$100,€50,£30,¥1000\r\n"$50,000","$100.00"');
    assert.deepStrictEqual(res, [
      ['$100', '€50', '£30', '¥1000'],
      ['$50,000', '$100.00']
    ]);
  });

  test('Text Patterns: Leading UTF-8 Byte Order Mark (\\uFEFF) stripped', () => {
    const parser = new CsvParser();
    const res = parser.parse('\uFEFFid,name,val\r\n1,Alice,100');
    assert.deepStrictEqual(res, [
      ['id', 'name', 'val'],
      ['1', 'Alice', '100']
    ]);
  });

  // =========================================================================
  // 7. Dialect Settings: trimUnquotedWhitespace
  // =========================================================================
  test('Dialect Setting: trimUnquotedWhitespace strips spaces in unquoted fields', () => {
    const parser = new CsvParser({ trimUnquotedWhitespace: true });
    const res = parser.parse('   val1   ,   val2   ,   val3   \r\n   1   ,   2   ,   3   ');
    assert.deepStrictEqual(res, [
      ['val1', 'val2', 'val3'],
      ['1', '2', '3']
    ]);
  });

  test('Dialect Setting: trimUnquotedWhitespace preserves intentional spaces inside quotes', () => {
    const parser = new CsvParser({ trimUnquotedWhitespace: true });
    const res = parser.parse('  "  keep inside  "  ,  " untouched "  ');
    assert.deepStrictEqual(res, [
      ['  keep inside  ', ' untouched ']
    ]);
  });

  test('Dialect Setting: trimUnquotedWhitespace ignores spaces outside closing quotes', () => {
    const parser = new CsvParser({ trimUnquotedWhitespace: true });
    const res = parser.parse('  "quoted"   ,   "another"   ');
    assert.deepStrictEqual(res, [
      ['quoted', 'another']
    ]);
  });

  // =========================================================================
  // 8. Dialect Settings: commentChar
  // =========================================================================
  test('Dialect Setting: commentChar skips # metadata headers and trailing lines', () => {
    const parser = new CsvParser({ commentChar: '#' });
    const input = '# Header metadata\n# Version 2.0\ncol1,col2\n1,2\n# Intermediary note\n3,4\n# Trailing footer';
    const res = parser.parse(input);
    assert.deepStrictEqual(res, [
      ['col1', 'col2'],
      ['1', '2'],
      ['3', '4']
    ]);
  });

  test('Dialect Setting: commentChar skips // C-style comments', () => {
    const parser = new CsvParser({ commentChar: '//' });
    const input = '// Config file\na,b\n1,2\n// End';
    const res = parser.parse(input);
    assert.deepStrictEqual(res, [
      ['a', 'b'],
      ['1', '2']
    ]);
  });

  test('Dialect Setting: commentChar skips indented comments', () => {
    const parser = new CsvParser({ commentChar: '#' });
    const input = '   # Indented comment\nx,y\n\t# Tab indented\n10,20';
    const res = parser.parse(input);
    assert.deepStrictEqual(res, [
      ['x', 'y'],
      ['10', '20']
    ]);
  });

  test('Dialect Setting: commentChar preserves # inside quoted values', () => {
    const parser = new CsvParser({ commentChar: '#' });
    const input = '"# This is not a comment line",val2\n1,2';
    const res = parser.parse(input);
    assert.deepStrictEqual(res, [
      ['# This is not a comment line', 'val2'],
      ['1', '2']
    ]);
  });

  test('Dialect Setting: commentChar preserves # in non-first columns', () => {
    const parser = new CsvParser({ commentChar: '#' });
    const input = 'id,tag,note\n1,#hashtag,#another';
    const res = parser.parse(input);
    assert.deepStrictEqual(res, [
      ['id', 'tag', 'note'],
      ['1', '#hashtag', '#another']
    ]);
  });

  // =========================================================================
  // 9. Dialect Settings: escapeChar (\\ vs "")
  // =========================================================================
  test('Dialect Setting: escapeChar \\ decodes \\" inside quotes', () => {
    const parser = new CsvParser({ escapeChar: '\\' });
    const res = parser.parse('1,"He said \\"Hello\\" to me",done');
    assert.deepStrictEqual(res, [
      ['1', 'He said "Hello" to me', 'done']
    ]);
  });

  test('Dialect Setting: escapeChar \\ decodes \\\\ inside quotes', () => {
    const parser = new CsvParser({ escapeChar: '\\' });
    const res = parser.parse('1,"C:\\\\Users\\\\admin\\\\file.txt",ok');
    assert.deepStrictEqual(res, [
      ['1', 'C:\\Users\\admin\\file.txt', 'ok']
    ]);
  });

  test('Dialect Setting: escapeChar \\ decodes \\, in unquoted fields without splitting', () => {
    const parser = new CsvParser({ escapeChar: '\\' });
    const res = parser.parse('1,unquoted\\,comma\\,here,active');
    assert.deepStrictEqual(res, [
      ['1', 'unquoted,comma,here', 'active']
    ]);
  });

  test('Dialect Setting: escapeChar \\ decodes \\n and \\t escapes', () => {
    const parser = new CsvParser({ escapeChar: '\\' });
    const res = parser.parse('1,"line1\\nline2","col1\\tcol2"');
    assert.deepStrictEqual(res, [
      ['1', 'line1\nline2', 'col1\tcol2']
    ]);
  });

  test('Dialect Setting: RFC 4180 standard escapeChar """ preserves literal backslashes', () => {
    const parser = new CsvParser({ escapeChar: '"' });
    const res = parser.parse('1,"C:\\Users\\admin",active\r\n2,"He said ""Hello""",active');
    assert.deepStrictEqual(res, [
      ['1', 'C:\\Users\\admin', 'active'],
      ['2', 'He said "Hello"', 'active']
    ]);
  });

  // =========================================================================
  // 10. Dialect Settings: Custom Delimiters (Semicolon, Tab, Pipe)
  // =========================================================================
  test('Dialect Setting: Semicolon delimiter (;)', () => {
    const parser = new CsvParser({ delimiter: ';' });
    const res = parser.parse('a;b;c\r\n1;2;3');
    assert.deepStrictEqual(res, [
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ]);
  });

  test('Dialect Setting: Tab delimiter (\\t / TAB)', () => {
    const parser = new CsvParser({ delimiter: 'TAB' });
    const res = parser.parse('col1\tcol2\tcol3\nval1\tval2\tval3');
    assert.deepStrictEqual(res, [
      ['col1', 'col2', 'col3'],
      ['val1', 'val2', 'val3']
    ]);
  });

  test('Dialect Setting: Pipe delimiter (|)', () => {
    const parser = new CsvParser({ delimiter: '|' });
    const res = parser.parse('id|name|status\n101|Product A|In Stock');
    assert.deepStrictEqual(res, [
      ['id', 'name', 'status'],
      ['101', 'Product A', 'In Stock']
    ]);
  });

  // =========================================================================
  // 11. Streaming Chunk Boundaries (parseChunk)
  // =========================================================================
  test('Streaming Chunks: Split across multiline quoted field', () => {
    const parser = new CsvParser();
    const c1 = '1,"This is a long multiline';
    const c2 = ' field that was split across chunks",active\r\n2,simple,row\r\n';
    const r1 = parser.parseChunk(c1, false);
    const r2 = parser.parseChunk(c2, true);
    const res = [...r1, ...r2];
    assert.deepStrictEqual(res, [
      ['1', 'This is a long multiline field that was split across chunks', 'active'],
      ['2', 'simple', 'row']
    ]);
  });

  test('Streaming Chunks: Split across escaped quote ("")', () => {
    const parser = new CsvParser();
    const c1 = '1,"He said "';
    const c2 = '"Hello"" to everyone",active\r\n';
    const r1 = parser.parseChunk(c1, false);
    const r2 = parser.parseChunk(c2, true);
    const res = [...r1, ...r2];
    assert.deepStrictEqual(res, [
      ['1', 'He said "Hello" to everyone', 'active']
    ]);
  });

  test('Streaming Chunks: Split across CRLF (\\r | \\n)', () => {
    const parser = new CsvParser();
    const c1 = 'a,b,c\r';
    const c2 = '\nx,y,z\r\n';
    const r1 = parser.parseChunk(c1, false);
    const r2 = parser.parseChunk(c2, true);
    const res = [...r1, ...r2];
    assert.deepStrictEqual(res, [
      ['a', 'b', 'c'],
      ['x', 'y', 'z']
    ]);
  });

  test('Streaming Chunks: Split across comment line', () => {
    const parser = new CsvParser({ commentChar: '#' });
    const c1 = '# Incomplete comment that starts here and co';
    const c2 = 'ntinues into next chunk\ncol1,col2\n1,2\n';
    const r1 = parser.parseChunk(c1, false);
    const r2 = parser.parseChunk(c2, true);
    const res = [...r1, ...r2];
    assert.deepStrictEqual(res, [
      ['col1', 'col2'],
      ['1', '2']
    ]);
  });

  test('Streaming Chunks: Binary Uint8Array chunks with UTF-8 characters', () => {
    const parser = new CsvParser();
    const encoder = new TextEncoder();
    const c1 = encoder.encode('1,"café et cr');
    const c2 = encoder.encode('oissant",10\n2,simple,20\n');
    const r1 = parser.parseChunk(c1, false);
    const r2 = parser.parseChunk(c2, true);
    const res = [...r1, ...r2];
    assert.deepStrictEqual(res, [
      ['1', 'café et croissant', '10'],
      ['2', 'simple', '20']
    ]);
  });

  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const result = runCsvParserTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
