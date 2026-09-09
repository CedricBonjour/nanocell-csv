import { describe, test, expect, beforeEach } from 'vitest';
import { csv_parse, separatorDetection, load_csv_view_only } from '../app/js/csv_worker.js';
import { CsvHandle } from '../app/js/CsvHandle.js';
import { stg } from '../app/js/Setting.js';

describe('CSV Parser & Serializer Core Operations', () => {
  beforeEach(() => {
    stg.delimiter = ',';
    stg.save_strict = false;
    stg.save_fixed_width_size = 0;
  });

  // Tier 1: Feature Coverage
  test('csv_parse parses standard comma-separated values into 2D matrix', () => {
    const raw = 'Name,Age,City\nAlice,30,Paris\nBob,25,London';
    const result = csv_parse(raw, ',');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(['Name', 'Age', 'City']);
    expect(result[1]).toEqual(['Alice', '30', 'Paris']);
    expect(result[2]).toEqual(['Bob', '25', 'London']);
  });

  test('csv_parse handles quoted fields containing commas', () => {
    const raw = 'id,data\n1,"Hello, World!"\n2,"Comma, inside, quotes"';
    const result = csv_parse(raw, ',');
    expect(result[1]).toEqual(['1', 'Hello, World!']);
    expect(result[2]).toEqual(['2', 'Comma, inside, quotes']);
  });

  test('csv_parse unescapes double double-quotes inside fields', () => {
    const raw = 'id,quote\n1,"She said ""Hello"" to me"';
    const result = csv_parse(raw, ',');
    expect(result[1][1]).toBe('She said "Hello" to me');
  });

  test('separatorDetection accurately identifies dominant delimiter', () => {
    expect(separatorDetection('a,b,c\n1,2,3')).toBe(',');
    expect(separatorDetection('a;b;c\n1;2;3')).toBe(';');
    expect(separatorDetection('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(separatorDetection('a|b|c\n1|2|3')).toBe('|');
  });

  test('CsvHandle.from2D serializes 2D matrix into CSV string', () => {
    const matrix = [
      ['Name', 'Role'],
      ['Alice', 'Engineer'],
      ['Bob', 'Designer']
    ];
    const csv = CsvHandle.from2D(matrix);
    expect(csv).toBe('Name,Role\nAlice,Engineer\nBob,Designer');
  });

  // Tier 2: Boundary & Corner Cases
  test('csv_parse handles empty string and single cell input', () => {
    const singleCell = csv_parse('SingleCell', ',');
    expect(singleCell).toHaveLength(1);
    expect(singleCell[0]).toEqual(['SingleCell']);

    const empty = csv_parse('', ',');
    expect(empty).toEqual([]);
  });

  test('csv_parse supports non-comma custom delimiters', () => {
    const semicolonRaw = 'col1;col2;col3\nval1;val2;val3';
    const result = csv_parse(semicolonRaw, ';');
    expect(result[0]).toEqual(['col1', 'col2', 'col3']);
    expect(result[1]).toEqual(['val1', 'val2', 'val3']);
  });

  test('CsvHandle.from2D quotes cells containing commas, quotes, or newlines', () => {
    const matrix = [
      ['Item', 'Description'],
      ['Widget', 'Has a , comma'],
      ['Gadget', 'Has "quotes" inside'],
      ['Thing', 'Has\nnewline']
    ];
    const csv = CsvHandle.from2D(matrix);
    expect(csv).toContain('"Has a , comma"');
    expect(csv).toContain('"Has ""quotes"" inside"');
    expect(csv).toContain('"Has\nnewline"');
  });

  test('CsvHandle.from2D supports TAB delimiter configuration', () => {
    stg.delimiter = 'TAB';
    const matrix = [
      ['A', 'B'],
      ['1', '2']
    ];
    const tsv = CsvHandle.from2D(matrix);
    expect(tsv).toBe('A\tB\n1\t2');
  });

  test('CsvHandle.from2D throws error in strict mode when cell requires quoting', () => {
    stg.save_strict = true;
    const matrix = [['Clean'], ['Needs, Quote']];
    expect(() => {
      CsvHandle.from2D(matrix);
    }).toThrow(/Strict csv format not respected/);
  });

  test('CsvHandle.from2D pads cells to fixed width size when configured', () => {
    stg.save_fixed_width_size = 10;
    const matrix = [['Short']];
    const output = CsvHandle.from2D(matrix);
    expect(output.length).toBe(10);
    expect(output).toBe('     Short');
  });

  // Tier 3: Cross-Feature Combinations
  test('Round-trip parse -> stringify -> parse preserves matrix contents', () => {
    const original = [
      ['Header1', 'Header2', 'Header3'],
      ['Row1Col1', 'Row1, "Col2"', 'Row1\nCol3'],
      ['Row2Col1', '100.5', '2025-01-01']
    ];

    const stringified = CsvHandle.from2D(original);
    const parsed = csv_parse(stringified, ',');

    expect(parsed[0]).toEqual(original[0]);
    expect(parsed[1][0]).toEqual(original[1][0]);
    expect(parsed[1][1]).toEqual(original[1][1]);
    expect(parsed[2]).toEqual(original[2]);
  });

  test('separatorDetection ignores delimiters inside quoted fields', () => {
    const textWithQuotedDelimiters = '"Item: 1, with commas; and colons";"Data A";"Data B"\n"Item: 2, more commas";"Data C";"Data D"';
    expect(separatorDetection(textWithQuotedDelimiters)).toBe(';');
  });

  test('csv_parse does not append nested array [[""]] when string ends with newline', () => {
    const raw = 'col1,col2\nval1,val2\n';
    const res = csv_parse(raw, ',');
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual(['col1', 'col2']);
    expect(res[1]).toEqual(['val1', 'val2']);
  });

  test('load_csv_view_only handles short or single-row files without crashing on matrix[1]', async () => {
    const mockFile = new File(['HeaderOnly'], 'single.csv', { type: 'text/csv' });
    let emitted = [];
    const handler = (e) => {
      if (e.data && e.data.cmd === 'chunk_loaded') emitted.push(e.data);
    };
    window.addEventListener('message', handler);

    load_csv_view_only({ file: mockFile, n_chunks: 2, n_rows: 5 });

    for (let i = 0; i < 10 && emitted.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    window.removeEventListener('message', handler);

    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted[0].chunk).toBeDefined();
  });
});
