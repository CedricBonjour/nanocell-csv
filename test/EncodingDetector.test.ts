import assert from 'node:assert';
import { EncodingDetector } from '../app/core/Csv.js';

function encodeLatin1(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function encodeUTF16LE(str: string, withBOM = false): Uint8Array {
  const offset = withBOM ? 2 : 0;
  const out = new Uint8Array(str.length * 2 + offset);
  if (withBOM) {
    out[0] = 0xff;
    out[1] = 0xfe;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[offset + i * 2] = code & 0xff;
    out[offset + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

function encodeUTF16BE(str: string, withBOM = false): Uint8Array {
  const offset = withBOM ? 2 : 0;
  const out = new Uint8Array(str.length * 2 + offset);
  if (withBOM) {
    out[0] = 0xfe;
    out[1] = 0xff;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[offset + i * 2] = (code >> 8) & 0xff;
    out[offset + i * 2 + 1] = code & 0xff;
  }
  return out;
}

export function runEncodingDetectorTests(): { passed: number; failed: number } {
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

  console.log('\n--- Running EncodingDetector Test Suite ---');

  // =========================================================================
  // 1. BOM Detection & Input Type Handling
  // =========================================================================
  test('Detects UTF-8 BOM (EF BB BF) on standard and BOM-only buffers', () => {
    const withData = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62]);
    assert.strictEqual(EncodingDetector.detectBOM(withData), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(withData), 'utf-8');

    const bomOnly = new Uint8Array([0xef, 0xbb, 0xbf]);
    assert.strictEqual(EncodingDetector.detectBOM(bomOnly), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(bomOnly), 'utf-8');
  });

  test('Detects UTF-16LE BOM (FF FE) on standard and BOM-only buffers', () => {
    const withData = encodeUTF16LE('id,name\r\n1,Alice', true);
    assert.strictEqual(EncodingDetector.detectBOM(withData), 'utf-16le');
    assert.strictEqual(EncodingDetector.detect(withData), 'utf-16le');

    const bomOnly = new Uint8Array([0xff, 0xfe]);
    assert.strictEqual(EncodingDetector.detectBOM(bomOnly), 'utf-16le');
    assert.strictEqual(EncodingDetector.detect(bomOnly), 'utf-16le');
  });

  test('Detects UTF-16BE BOM (FE FF) on standard and BOM-only buffers', () => {
    const withData = encodeUTF16BE('id,name\r\n1,Alice', true);
    assert.strictEqual(EncodingDetector.detectBOM(withData), 'utf-16be');
    assert.strictEqual(EncodingDetector.detect(withData), 'utf-16be');

    const bomOnly = new Uint8Array([0xfe, 0xff]);
    assert.strictEqual(EncodingDetector.detectBOM(bomOnly), 'utf-16be');
    assert.strictEqual(EncodingDetector.detect(bomOnly), 'utf-16be');
  });

  test('Incomplete BOM prefixes return null from detectBOM', () => {
    assert.strictEqual(EncodingDetector.detectBOM(new Uint8Array([])), null);
    assert.strictEqual(EncodingDetector.detectBOM(new Uint8Array([0xef])), null);
    assert.strictEqual(EncodingDetector.detectBOM(new Uint8Array([0xef, 0xbb])), null);
    assert.strictEqual(EncodingDetector.detectBOM(new Uint8Array([0xff])), null);
    assert.strictEqual(EncodingDetector.detectBOM(new Uint8Array([0xfe])), null);
  });

  test('Handles null, undefined, empty buffers, ArrayBuffer, DataView, and subarray views', () => {
    assert.strictEqual(EncodingDetector.detect(null), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(undefined), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(new Uint8Array(0)), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(new ArrayBuffer(0)), 'utf-8');

    // Raw ArrayBuffer
    const utf16leBuf = encodeUTF16LE('a,b\n1,2', true).buffer;
    assert.strictEqual(EncodingDetector.detect(utf16leBuf), 'utf-16le');

    // Subarray and DataView with non-zero byteOffset
    const padded = new Uint8Array(20);
    const inner = encodeUTF16BE('x;y\n1;2', true);
    padded.set(inner, 4);
    assert.strictEqual(EncodingDetector.detect(padded.subarray(4, 4 + inner.length)), 'utf-16be');
    assert.strictEqual(EncodingDetector.detect(new DataView(padded.buffer, 4, inner.length)), 'utf-16be');
  });

  // =========================================================================
  // 2. BOM-less UTF-16LE & UTF-16BE Detection
  // =========================================================================
  test('Detects BOM-less UTF-16LE from null-byte stride on 16-bit pairs', () => {
    const bytes = encodeUTF16LE('Name;Age;City\r\nAlice;30;Zürich\r\nBob;25;Genève\r\n', false);
    assert.strictEqual(EncodingDetector.detectBOM(bytes), null);
    assert.strictEqual(EncodingDetector.detect(bytes), 'utf-16le');
  });

  test('Detects BOM-less UTF-16BE from null-byte stride on 16-bit pairs', () => {
    const bytes = encodeUTF16BE('Name;Age;City\r\nAlice;30;Zürich\r\nBob;25;Genève\r\n', false);
    assert.strictEqual(EncodingDetector.detectBOM(bytes), null);
    assert.strictEqual(EncodingDetector.detect(bytes), 'utf-16be');
  });

  test('Detects minimal 2-character (4-byte) BOM-less UTF-16LE and UTF-16BE', () => {
    assert.strictEqual(EncodingDetector.detect(encodeUTF16LE('a\n', false)), 'utf-16le');
    assert.strictEqual(EncodingDetector.detect(encodeUTF16BE('a\n', false)), 'utf-16be');
  });

  // =========================================================================
  // 3. UTF-8 Validation & Sample Truncation Boundaries (8192 bytes)
  // =========================================================================
  test('Detects pure 7-bit ASCII and 1-byte input as utf-8', () => {
    const ascii = new TextEncoder().encode('id,name,score\n1,Alice,95\n2,Bob,88\n');
    assert.strictEqual(EncodingDetector.detect(ascii), 'utf-8');
    assert.strictEqual(EncodingDetector.detect(new Uint8Array([0x61])), 'utf-8');
  });

  test('Detects valid 2-byte, 3-byte, and 4-byte UTF-8 sequences (Latin, Cyrillic, CJK, Emojis)', () => {
    const utf8 = new TextEncoder().encode(
      'Nom,Ville,Привет,日本語,Emoji\nFrançois,Zürich,Москва,東京,🚀📊🌍\n'
    );
    assert.strictEqual(EncodingDetector.detect(utf8), 'utf-8');
  });

  test('Sample boundary safety: 2-byte, 3-byte, and 4-byte UTF-8 sequences split across byte 8192 remain utf-8', () => {
    // 1. 2-byte sequence (é = C3 A9) starting at index 8191
    const buf2 = new Uint8Array(8196).fill(0x61);
    buf2[8191] = 0xc3;
    buf2[8192] = 0xa9;
    assert.strictEqual(EncodingDetector.detect(buf2), 'utf-8');

    // 2. 3-byte sequence (€ = E2 82 AC) starting at index 8190 and 8191
    for (const pos of [8190, 8191]) {
      const buf3 = new Uint8Array(8196).fill(0x61);
      buf3[pos] = 0xe2;
      buf3[pos + 1] = 0x82;
      buf3[pos + 2] = 0xac;
      assert.strictEqual(EncodingDetector.detect(buf3), 'utf-8');
    }

    // 3. 4-byte sequence (🚀 = F0 9F 9A 80) starting at index 8189, 8190, and 8191
    for (const pos of [8189, 8190, 8191]) {
      const buf4 = new Uint8Array(8198).fill(0x61);
      buf4[pos] = 0xf0;
      buf4[pos + 1] = 0x9f;
      buf4[pos + 2] = 0x9a;
      buf4[pos + 3] = 0x80;
      assert.strictEqual(EncodingDetector.detect(buf4), 'utf-8');
    }
  });

  test('Rejects invalid UTF-8 sequences (overlong, lone continuation, surrogates, > U+10FFFF)', () => {
    // Lone continuation byte (0x80 = Euro in Windows-1252)
    assert.strictEqual(EncodingDetector.detect(new Uint8Array([0x80, 0x31, 0x30, 0x30])), 'windows-1252');

    // Overlong 2-byte (0xC0 0xAF)
    assert.notStrictEqual(EncodingDetector.detect(new Uint8Array([0xc0, 0xaf, 0x0a])), 'utf-8');

    // Overlong 3-byte (0xE0 0x80 0xAF)
    assert.notStrictEqual(EncodingDetector.detect(new Uint8Array([0xe0, 0x80, 0xaf, 0x0a])), 'utf-8');

    // UTF-16 surrogate in UTF-8 (0xED 0xA0 0x80 = U+D800)
    assert.notStrictEqual(EncodingDetector.detect(new Uint8Array([0xed, 0xa0, 0x80, 0x0a])), 'utf-8');

    // Out-of-range 4-byte (0xF4 0x90 0x80 0x80 > U+10FFFF)
    assert.notStrictEqual(EncodingDetector.detect(new Uint8Array([0xf4, 0x90, 0x80, 0x80, 0x0a])), 'utf-8');
  });

  // =========================================================================
  // 4. Legacy Single-Byte & Double-Byte Heuristics
  // =========================================================================
  test('Detects Windows-1252 / ISO-8859-1 Western European text and smart punctuation', () => {
    // Accented French & German CSV
    const frenchGerman = encodeLatin1(
      'Nom;Pr\xe9nom;R\xe9f\xe9rence;Ville\r\nFran\xe7ois;Ren\xe9;R\xe9f-01;Gen\xe8ve\r\nM\xfcller;J\xfcrgen;R\xe9f-02;Z\xfcrich\r\n'
    );
    assert.strictEqual(EncodingDetector.detect(frenchGerman), 'windows-1252');

    // English CSV with Windows-1252 smart apostrophes (0x92), smart quotes (0x93/0x94), en/em-dashes (0x96/0x97), and Euro (0x80)
    const smartPunct = new Uint8Array([
      0x69, 0x64, 0x2c, 0x6e, 0x6f, 0x74, 0x65, 0x2c, 0x70, 0x72, 0x69, 0x63, 0x65, 0x0d, 0x0a, // id,note,price\r\n
      0x31, 0x2c, 0x64, 0x6f, 0x6e, 0x92, 0x74, 0x20, 0x77, 0x6f, 0x72, 0x72, 0x79, 0x2c, 0x80, 0x35, 0x30, 0x0d, 0x0a // 1,don’t worry,€50\r\n
    ]);
    assert.strictEqual(EncodingDetector.detect(smartPunct), 'windows-1252');

    // Only smart apostrophes followed by ASCII 't' (0x92 0x74) without Euro sign
    const apostrophesOnly = new Uint8Array([
      0x64, 0x6f, 0x6e, 0x92, 0x74, 0x2c, 0x77, 0x6f, 0x6e, 0x92, 0x74, 0x2c, 0x63, 0x61, 0x6e, 0x92, 0x74, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(apostrophesOnly), 'windows-1252');
  });

  test('Detects Windows-1251 (Cyrillic) on mixed, even-length, and ALL-CAPS Russian CSVs', () => {
    // 1. Standard Russian CSV ("Имя;Возраст;Город\r\nАлексей;30;Москва\r\nОльга;25;Санкт-Петербург\r\n")
    const win1251Standard = new Uint8Array([
      0xc8, 0xec, 0xff, 0x3b, 0xc2, 0xee, 0xe7, 0xf0, 0xe0, 0xf1, 0xf2, 0x3b, 0xc3, 0xee, 0xf0, 0xee, 0xe4, 0x0d, 0x0a,
      0xc0, 0xeb, 0xe5, 0xea, 0xf1, 0xe5, 0xe9, 0x3b, 0x33, 0x30, 0x3b, 0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0, 0x0d, 0x0a,
      0xce, 0xeb, 0xfc, 0xe3, 0xe0, 0x3b, 0x32, 0x35, 0x3b, 0xd1, 0xe0, 0xed, 0xea, 0xf2, 0x2d, 0xcf, 0xe5, 0xf2, 0xe5, 0xf0, 0xe1, 0xf3, 0xf0, 0xe3, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(win1251Standard), 'windows-1251');

    // 2. Even-length Cyrillic words ("Цена,Анна\r\n100,Иван\r\n200,Олег\r\n") - must NOT false-positive as gb18030
    const win1251EvenWords = new Uint8Array([
      0xd6, 0xe5, 0xed, 0xe0, 0x2c, 0xc0, 0xed, 0xed, 0xe0, 0x0d, 0x0a,
      0x31, 0x30, 0x30, 0x2c, 0xc8, 0xe2, 0xe0, 0xed, 0x0d, 0x0a,
      0x32, 0x30, 0x30, 0x2c, 0xce, 0xeb, 0xe5, 0xe3, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(win1251EvenWords), 'windows-1251');

    // 3. ALL-CAPS Cyrillic ("ИМЯ,ГОРОД\r\nАННА,МОСКВА\r\n")
    const win1251AllCaps = new Uint8Array([
      0xc8, 0xcc, 0xdf, 0x2c, 0xc3, 0xce, 0xd0, 0xce, 0xc4, 0x0d, 0x0a,
      0xc0, 0xcd, 0xcd, 0xc0, 0x2c, 0xcc, 0xce, 0xd1, 0xca, 0xc2, 0xc0, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(win1251AllCaps), 'windows-1251');
  });

  test('Detects Shift_JIS (Japanese Kanji, Hiragana, Katakana)', () => {
    // "名前,年齢,都市\r\n田中太郎,30,東京都\r\n佐藤花子,25,大阪府\r\n"
    const sjisBytes = new Uint8Array([
      0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x94, 0x4e, 0x97, 0xee, 0x2c, 0x93, 0x73, 0x8e, 0x73, 0x0d, 0x0a,
      0x93, 0x63, 0x92, 0x86, 0x91, 0xbe, 0x98, 0x59, 0x2c, 0x33, 0x30, 0x2c, 0x93, 0x8c, 0x8b, 0x9e, 0x93, 0x73, 0x0d, 0x0a,
      0x8d, 0xb2, 0x93, 0xa1, 0x89, 0xd4, 0x8e, 0x71, 0x2c, 0x32, 0x35, 0x2c, 0x91, 0xe5, 0x8d, 0xe3, 0x95, 0x7b, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(sjisBytes), 'shift_jis');
    const decoded = new TextDecoder('shift_jis').decode(sjisBytes);
    assert.ok(decoded.includes('田中太郎,30,東京都'));
  });

  test('Detects GB18030 / GBK (Simplified Chinese)', () => {
    // "姓名,年龄,城市\r\n张三,30,北京\r\n李四,25,上海\r\n"
    const gbBytes = new Uint8Array([
      0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4, 0x2c, 0xb3, 0xc7, 0xca, 0xd0, 0x0d, 0x0a,
      0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x33, 0x30, 0x2c, 0xb1, 0xb1, 0xbe, 0xa9, 0x0d, 0x0a,
      0xc0, 0xee, 0xcb, 0xc4, 0x2c, 0x32, 0x35, 0x2c, 0xc9, 0xcf, 0xba, 0xa3, 0x0d, 0x0a
    ]);
    assert.strictEqual(EncodingDetector.detect(gbBytes), 'gb18030');
    const decoded = new TextDecoder('gb18030').decode(gbBytes);
    assert.ok(decoded.includes('姓名,年龄,城市'));
    assert.ok(decoded.includes('张三,30,北京'));
  });

  return { passed, failed };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const result = runEncodingDetectorTests();
  process.exit(result.failed > 0 ? 1 : 0);
}
