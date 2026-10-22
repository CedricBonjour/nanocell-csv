import assert from 'node:assert';
import { CsvParser, CsvSerializer } from '../app/core/Csv.js';

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

  test('Streaming Chunks: Binary Uint8Array split mid-codepoint across 2-byte, 3-byte, and 4-byte UTF-8 sequences', () => {
    const parser = new CsvParser({ encoding: 'utf-8' });
    const fullBytes = new TextEncoder().encode('id,label\n1,café_€_🚀_end\n2,ok\n');
    // Find the byte index of 🚀 (F0 9F 9A 80) and split right in the middle of the 4-byte emoji
    const emojiStart = fullBytes.indexOf(0xf0);
    assert.ok(emojiStart > 0);
    const c1 = fullBytes.subarray(0, emojiStart + 2); // F0 9F
    const c2 = fullBytes.subarray(emojiStart + 2);    // 9A 80 ...
    const res = [...parser.parseChunk(c1, false), ...parser.parseChunk(c2, true)];
    assert.deepStrictEqual(res, [
      ['id', 'label'],
      ['1', 'café_€_🚀_end'],
      ['2', 'ok']
    ]);
  });

  test('Streaming Chunks: Binary UTF-16LE and UTF-16BE split on an odd byte boundary mid-character', () => {
    const str = 'col1,col2\r\nZürich,Genève\r\n';
    // UTF-16LE with BOM
    const leBytes = new Uint8Array(str.length * 2 + 2);
    leBytes[0] = 0xff;
    leBytes[1] = 0xfe;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      leBytes[2 + i * 2] = code & 0xff;
      leBytes[2 + i * 2 + 1] = (code >> 8) & 0xff;
    }

    // Split on an odd byte offset (15) right in the middle of a 2-byte UTF-16 code unit
    const parserLe = new CsvParser();
    const resLe = [
      ...parserLe.parseChunk(leBytes.subarray(0, 15), false),
      ...parserLe.parseChunk(leBytes.subarray(15), true)
    ];
    assert.deepStrictEqual(resLe, [
      ['col1', 'col2'],
      ['Zürich', 'Genève']
    ]);
  });

  test('Binary Parsing: Auto-detects Windows-1252, Windows-1251, Shift_JIS, and GB18030 Uint8Array inputs', () => {
    // 1. Windows-1252
    const win1252 = new Uint8Array([
      0x4e, 0x6f, 0x6d, 0x3b, 0x56, 0x69, 0x6c, 0x6c, 0x65, 0x0a, // Nom;Ville\n
      0x52, 0x65, 0x6e, 0xe9, 0x3b, 0x47, 0x65, 0x6e, 0xe8, 0x76, 0x65 // René;Genève
    ]);
    const parser = new CsvParser({ delimiter: ';' });
    assert.deepStrictEqual(parser.parse(win1252), [
      ['Nom', 'Ville'],
      ['René', 'Genève']
    ]);

    // 2. Windows-1251 ("Имя;Город\nАнна;Москва") after reset via parse()
    const win1251 = new Uint8Array([
      0xc8, 0xec, 0xff, 0x3b, 0xc3, 0xee, 0xf0, 0xee, 0xe4, 0x0a,
      0xc0, 0xed, 0xed, 0xe0, 0x3b, 0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0
    ]);
    assert.deepStrictEqual(parser.parse(win1251), [
      ['Имя', 'Город'],
      ['Анна', 'Москва']
    ]);
  });

  // =========================================================================
  // 12. Clipboard TSV Copy-Paste & Quoted Delimiter Regression Tests
  // =========================================================================
  test('Regression: TSV copy-paste with escaped quotes and trimUnquotedWhitespace=true preserves all columns', () => {
    const pastedTsv = [
      'Anna\t"Linear ""Pro"""\t086078291\t07030\t2026-04-02\thttps://linear.app\t-1787.09',
      'Anthony\tSupabase\t+16175550143\t02115\t2026-04-10\thttps://supabase.io\t15945.67'
    ].join('\r\n');

    const parser = new CsvParser({ delimiter: '\t', trimUnquotedWhitespace: true });
    const parsed = parser.parse(pastedTsv);

    assert.deepStrictEqual(parsed, [
      ['Anna', 'Linear "Pro"', '086078291', '07030', '2026-04-02', 'https://linear.app', '-1787.09'],
      ['Anthony', 'Supabase', '+16175550143', '02115', '2026-04-10', 'https://supabase.io', '15945.67']
    ]);

    // Verify full round-trip back through CsvSerializer({ delimiter: '\t' })
    const reserialized = new CsvSerializer({ delimiter: '\t' }).serialize(parsed);
    assert.strictEqual(reserialized, pastedTsv);
  });

  test('Regression: Tab delimiter with trimUnquotedWhitespace=true handles quoted fields at start, middle, and end', () => {
    const parser = new CsvParser({ delimiter: '\t', trimUnquotedWhitespace: true });
    const input = '  "First ""Col"""  \t  middle  \t  "Smith, John"  \t  "Last ""Col"""  \r\n""\tval2\t""\tval4';
    assert.deepStrictEqual(parser.parse(input), [
      ['First "Col"', 'middle', 'Smith, John', 'Last "Col"'],
      ['', 'val2', '', 'val4']
    ]);
  });

  test('Regression: Unquoted text after closing quote is preserved and not swallowed on subsequent spaces/tabs', () => {
    const csvParser = new CsvParser({ delimiter: ',', trimUnquotedWhitespace: true });
    assert.deepStrictEqual(csvParser.parse('"Linear ""Pro""" - Edition  ,  next_col'), [
      ['Linear "Pro" - Edition', 'next_col']
    ]);

    const tsvParser = new CsvParser({ delimiter: '\t', trimUnquotedWhitespace: true });
    assert.deepStrictEqual(tsvParser.parse('"Linear ""Pro""" - Edition  \t  next_col'), [
      ['Linear "Pro" - Edition', 'next_col']
    ]);
  });

  test('Regression: commentChar only matches at start of line and never skips tab delimiter in TSV', () => {
    const csvParser = new CsvParser({ delimiter: ',', commentChar: '#' });
    assert.deepStrictEqual(csvParser.parse('item_1 # not a comment,100\n# real comment\nitem_2,200'), [
      ['item_1 # not a comment', '100'],
      ['item_2', '200']
    ]);

    const tsvParser = new CsvParser({ delimiter: '\t', commentChar: '#' });
    assert.deepStrictEqual(tsvParser.parse('\t#not_a_comment\n1\t2'), [
      ['', '#not_a_comment'],
      ['1', '2']
    ]);
  });

  // =========================================================================
  // 13. Clipboard HTML Table Parsing (CsvParser.parseHtmlTable)
  // =========================================================================
  test('HTML Paste: Returns null for non-table inputs (empty, plain text, VS Code syntax divs, code blocks)', () => {
    assert.strictEqual(CsvParser.parseHtmlTable(''), null);
    assert.strictEqual(CsvParser.parseHtmlTable('a,b,c\n1,2,3'), null);
    assert.strictEqual(CsvParser.parseHtmlTable('<div style="color:#d4d4d4"><span>Anna\tSupabase</span></div>'), null);
    assert.strictEqual(CsvParser.parseHtmlTable('<pre><code>id,name\n1,Alice</code></pre>'), null);
    assert.strictEqual(CsvParser.parseHtmlTable('<table></table>'), null);
  });

  test('HTML Paste: Parses standard table with <thead>, <tbody>, <tfoot>, <th>, and <td>', () => {
    const html = `
      <table>
        <thead>
          <tr><th>Name</th><th>Company</th><th>Balance</th></tr>
        </thead>
        <tbody>
          <tr><td>Anna</td><td>Linear "Pro"</td><td>-1787.09</td></tr>
          <tr><td>Anthony</td><td>Supabase, Inc.</td><td>15945.67</td></tr>
        </tbody>
        <tfoot>
          <tr><td>Total</td><td>2 Companies</td><td>14158.58</td></tr>
        </tfoot>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      ['Name', 'Company', 'Balance'],
      ['Anna', 'Linear "Pro"', '-1787.09'],
      ['Anthony', 'Supabase, Inc.', '15945.67'],
      ['Total', '2 Companies', '14158.58']
    ]);
  });

  test('HTML Paste: Strips Excel/Windows clipboard wrappers (<head>, <style>, <script>, <colgroup>, <caption>, comments)', () => {
    const excelHtml = `
      <html>
      <head>
        <meta http-equiv=Content-Type content="text/html; charset=utf-8">
        <style>
          <!--table {mso-displayed-decimal-separator:"\\.";}
          td {mso-number-format:"\\@";}-->
        </style>
        <script>console.log("ignore me");</script>
      </head>
      <body>
        <!--StartFragment-->
        <table border=0 cellpadding=0 cellspacing=0 width=256>
          <caption>Customer Export</caption>
          <colgroup><col width=128><col width=128></colgroup>
          <tr height=20>
            <td height=20 class=xl65>02138</td>
            <td class=xl65>+41791234567</td>
            <td class=xl65>84E02</td>
          </tr>
        </table>
        <!--EndFragment-->
      </body>
      </html>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(excelHtml), [
      ['02138', '+41791234567', '84E02']
    ]);
  });

  test('HTML Paste: Handles implicit HTML5 / Excel unclosed <tr>, <td>, and <th> tags', () => {
    const unclosedHtml = '<table><tr><th>Col A<th>Col B<tr><td>Val 1<td>Val 2<tr><td>Val 3<td>Val 4</table>';
    assert.deepStrictEqual(CsvParser.parseHtmlTable(unclosedHtml), [
      ['Col A', 'Col B'],
      ['Val 1', 'Val 2'],
      ['Val 3', 'Val 4']
    ]);
  });

  test('HTML Paste: Converts <br>, <br/>, <br style="...">, and block tags (<p>, <div>, <li>) inside cells to newlines', () => {
    const html = `
      <table>
        <tr>
          <td>Line 1<br>Line 2<br/>Line 3<br style="mso-data-placement:same-cell;">Line 4</td>
          <td><p>Para A</p><p>Para B</p></td>
          <td><div>Block 1</div><div>Block 2</div></td>
          <td><ul><li>Item 1</li><li>Item 2</li></ul></td>
        </tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      [
        'Line 1\nLine 2\nLine 3\nLine 4',
        'Para A\nPara B',
        'Block 1\nBlock 2',
        'Item 1\nItem 2'
      ]
    ]);
  });

  test('HTML Paste: Decodes named, decimal, and hexadecimal HTML entities accurately', () => {
    const html = `
      <table>
        <tr>
          <td>&lt;tag&gt; &amp; &quot;quotes&quot; &apos;single&#39;</td>
          <td>100&nbsp;&euro; &#8364; &mdash; &#x2014; &copy; &reg;</td>
          <td>&#65;&#x42;&#67; &#x1F680;</td>
        </tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      [
        '<tag> & "quotes" \'single\'',
        '100 € € — — © ®',
        'ABC 🚀'
      ]
    ]);
  });

  test('HTML Paste: Expands colspan attributes (double-quoted, single-quoted, and unquoted)', () => {
    const html = `
      <table>
        <tr><th colspan="3">Full Banner</th></tr>
        <tr><td colspan='2'>Left Two</td><td>Right One</td></tr>
        <tr><td>A</td><td colspan=2>B &amp; C</td></tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      ['Full Banner', '', ''],
      ['Left Two', '', 'Right One'],
      ['A', 'B & C', '']
    ]);
  });

  test('HTML Paste: Expands rowspan and combined rowspan + colspan across multiple rows', () => {
    const html = `
      <table>
        <tr>
          <th rowspan="2">Region</th>
          <th colspan="2">Revenue</th>
          <th rowspan="3">Notes</th>
        </tr>
        <tr>
          <th>Q1</th>
          <th>Q2</th>
        </tr>
        <tr>
          <td>EMEA</td>
          <td>1200</td>
          <td>1500</td>
        </tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      ['Region', 'Revenue', '', 'Notes'],
      ['', 'Q1', 'Q2', ''],
      ['EMEA', '1200', '1500', '']
    ]);
  });

  test('HTML Paste: Strips nested inline formatting tags and keeps nested <table> inside its parent cell', () => {
    const html = `
      <table>
        <tr>
          <td><a href="https://linear.app"><strong>https://linear.app</strong></a></td>
          <td>Outer <table><tr><td>Inner 1</td><td>Inner 2</td></tr></table> Cell</td>
        </tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html), [
      ['https://linear.app', 'Outer Inner 1Inner 2 Cell']
    ]);
  });

  test('HTML Paste: Respects trimWhitespace option (true vs false)', () => {
    const html = '<table><tr><td>   padded value   </td><td>normal</td></tr></table>';
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html, { trimWhitespace: true }), [
      ['padded value', 'normal']
    ]);
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html, { trimWhitespace: false }), [
      ['   padded value   ', 'normal']
    ]);
  });

  test('HTML Paste: Round-trip through CsvSerializer.serializeHtml -> CsvParser.parseHtmlTable is 100% lossless', () => {
    const original = [
      ['name', 'company', 'phone', 'zip_code', 'notes'],
      ['Anna', 'Linear "Pro"', '086078291', '07030', 'Line 1\nLine 2 & <special>'],
      ['Anthony', 'Supabase, Inc.', '+16175550143', '02115', '84E02']
    ];
    const serializer = new CsvSerializer();
    const htmlWithHeader = serializer.serializeHtml(original, { hasHeader: true });
    const htmlWithoutHeader = serializer.serializeHtml(original, { hasHeader: false });

    assert.deepStrictEqual(CsvParser.parseHtmlTable(htmlWithHeader), original);
    assert.deepStrictEqual(CsvParser.parseHtmlTable(htmlWithoutHeader), original);
  });

  test('HTML Paste: Preserves empty cells (<td></td>, whitespace, &nbsp;) at start, middle, and end of row', () => {
    const html = `
      <table>
        <tr><td></td><td>middle</td><td>&nbsp;</td><td>   </td></tr>
        <tr><td>1</td><td></td><td>3</td><td></td></tr>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(html, { trimWhitespace: true }), [
      ['', 'middle', '', ''],
      ['1', '', '3', '']
    ]);
    assert.deepStrictEqual(CsvParser.parseHtmlTable('<table><tr><td>&nbsp;</td></tr></table>', { trimWhitespace: false }), [
      [' ']
    ]);
  });

  test('HTML Paste: Handles attributes containing ">" inside quotes (e.g. Google Sheets data-* or formula attributes)', () => {
    const gsheetsHtml = `
      <google-sheets-html-origin>
      <table xmlns="http://www.w3.org/1999/xhtml">
        <tbody>
          <tr style="height: 21px;">
            <td data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;a > b&quot;}" title="x > y">a &gt; b</td>
            <td data-sheets-formula="=IF(A1>0, &quot;pos&quot;, &quot;neg&quot;)"><span data-hint="1 > 0">pos</span></td>
          </tr>
        </tbody>
      </table>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(gsheetsHtml), [
      ['a > b', 'pos']
    ]);
  });

  test('HTML Paste: Uppercase legacy HTML tags (<TABLE>, <TR>, <TH>, <TD>, <BR>) and multiple tables (stops after first table)', () => {
    const legacyHtml = `
      <TABLE BORDER=1>
        <TR><TH>ID</TH><TH>LABEL</TH></TR>
        <TR><TD>001</TD><TD>Line A<BR>Line B</TD></TR>
      </TABLE>
      <TABLE>
        <TR><TD>Second Table Should Be Ignored</TD></TR>
      </TABLE>
    `;
    assert.deepStrictEqual(CsvParser.parseHtmlTable(legacyHtml), [
      ['ID', 'LABEL'],
      ['001', 'Line A\nLine B']
    ]);
  });

  return { passed, failed };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const result = runCsvParserTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
