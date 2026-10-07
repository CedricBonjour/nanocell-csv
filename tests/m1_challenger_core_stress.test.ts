/**
 * @vitest-environment node
 *
 * M1 CHALLENGER EMPIRICAL ADVERSARIAL STRESS TEST SUITE
 *
 * Target Modules:
 * - core/csv/ (CsvParser.ts, CsvSerializer.ts)
 * - core/search/ (SearchEngine.ts)
 * - core/validation/ (ValidationEngine.ts, HeaderValidator.ts, DataValidator.ts, DateValidator.ts)
 * - core/events/ (EventBus.ts)
 *
 * Adversarial Testing Scope:
 * 1. CsvParser & CsvSerializer:
 *    - Malformed RFC 4180 inputs, unclosed quotes, unescaped quotes, mid-field quotes
 *    - Multiline records, embedded newlines (\r\n, \n, \r), mixed line breaks
 *    - Chunk boundary stress (1-byte chunk fragmentation, binary Uint8Array multi-byte UTF-8)
 *    - High-volume data streaming & roundtrip fidelity
 *    - Strict mode validation & fixed-width formatting
 * 2. SearchEngine:
 *    - Regex injection, invalid regex compilation fallback, literal escaping
 *    - Special character queries (Unicode, emojis, HTML/script tags, whitespace)
 *    - Boundary coordinates (0x0, 1x1, negative/out-of-bound coords, inverted ranges)
 *    - Cycle navigation (findNext/findPrevious circular wrap, goToNextMatching)
 *    - Multi-match atomic replace transactions & single-step undo
 * 3. ValidationEngine:
 *    - High-volume validation scalability (10,000 cells) & custom regex rule execution
 *    - Header deduplication, SQL identifier compliance, suffix collision scenarios
 *    - Calendar date edge cases (leap years 2024/2000 vs 1900/2023, 30/31-day month boundaries, ambiguous/coexisting formats)
 *    - Batch operations (createAcceptAllTransaction, acceptAll, rejectAll, acceptCategory, rejectCategory) & single-step undo
 * 4. EventBus:
 *    - High-frequency event dispatch (50,000 emits)
 *    - Listener exception isolation (faulty listener does not break subsequent listeners)
 *    - Concurrent modification (self-unsubscribing listener during emit, dynamic additions)
 *    - once() lifecycle, listenerCount, clear(), custom topic signature
 * 5. Headless Pure Node.js Runtime Verification:
 *    - Zero ReferenceError for browser/DOM globals (window, document, HTMLElement, localStorage)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Core Subsystem Imports
import { Dataframe } from '../core/model/Dataframe.js';
import { HistoryManager } from '../core/history/HistoryManager.js';
import { CsvParser } from '../core/csv/CsvParser.js';
import { CsvSerializer } from '../core/csv/CsvSerializer.js';
import { SearchEngine } from '../core/search/SearchEngine.js';
import { ValidationEngine } from '../core/validation/ValidationEngine.js';
import { HeaderValidator } from '../core/validation/HeaderValidator.js';
import { DataValidator } from '../core/validation/DataValidator.js';
import { DateValidator } from '../core/validation/DateValidator.js';
import { isValidCalendarDate, parseDateCandidate, parseYearFirstDate } from '../core/utils/date.js';
import { EventBus } from '../core/events/EventBus.js';
import type { CoreEventMap } from '../core/events/CoreEventMap.js';

describe('M1 Challenger Adversarial Stress Test Suite', () => {

  // ==========================================================================
  // 1. Pure Node.js Headless Environment & DOM Isolation Audit
  // ==========================================================================
  describe('1. Pure Node.js Headless Global Isolation Audit', () => {
    it('verifies zero browser/DOM globals exist in the execution environment', () => {
      expect(typeof (globalThis as any).window).toBe('undefined');
      expect(typeof (globalThis as any).document).toBe('undefined');
      expect(typeof (globalThis as any).HTMLElement).toBe('undefined');
      expect(typeof (globalThis as any).HTMLTableElement).toBe('undefined');
      expect(typeof (globalThis as any).localStorage).toBe('undefined');
      expect(typeof (globalThis as any).customElements).toBe('undefined');
    });

    it('verifies all 4 target modules instantiate and run without ReferenceError', () => {
      expect(() => new CsvParser()).not.toThrow();
      expect(() => new CsvSerializer()).not.toThrow();
      expect(() => new SearchEngine()).not.toThrow();
      expect(() => new ValidationEngine()).not.toThrow();
      expect(() => new EventBus()).not.toThrow();
    });
  });

  // ==========================================================================
  // 2. CsvParser & CsvSerializer Adversarial Stress Testing
  // ==========================================================================
  describe('2. CsvParser & CsvSerializer Adversarial Stress Testing', () => {
    let parser: CsvParser;
    let serializer: CsvSerializer;

    beforeEach(() => {
      parser = new CsvParser();
      serializer = new CsvSerializer();
    });

    it('adversarially handles malformed RFC 4180 inputs without infinite loops or crashes', () => {
      // Unclosed quote at EOF
      const unclosed = parser.parse('col1,"unclosed text at end of file');
      expect(unclosed).toEqual([['col1', 'unclosed text at end of file']]);

      // Unescaped quote inside unquoted field
      const unescapedMid = parser.parse('col1,hello "world" test,col3');
      expect(unescapedMid.length).toBe(1);
      expect(unescapedMid[0].length).toBeGreaterThanOrEqual(2);

      // Consecutive quotes
      const quotesOnly = parser.parse('""""');
      expect(quotesOnly.length).toBe(1);
      expect(quotesOnly[0][0]).toBe('"');

      // Escaped quote in middle of quoted field
      const escapedMid = parser.parse('col1,"She said ""Hello"" to him",col3');
      expect(escapedMid).toEqual([['col1', 'She said "Hello" to him', 'col3']]);

      // Mixed empty lines and trailing delimiters
      const emptyCells = parser.parse('a,b,c\n,,,\n1,2,3\n');
      expect(emptyCells).toEqual([
        ['a', 'b', 'c'],
        ['', '', '', ''],
        ['1', '2', '3']
      ]);
    });

    it('correctly handles classic Mac CR-only and mixed CRLF/LF/CR line breaks', () => {
      const crOnly = parser.parse('row1col1,row1col2\rrow2col1,row2col2\rrow3col1,row3col2');
      expect(crOnly).toEqual([
        ['row1col1', 'row1col2'],
        ['row2col1', 'row2col2'],
        ['row3col1', 'row3col2']
      ]);

      const mixed = parser.parse('a,b\r\nc,d\ne,f\rg,h');
      expect(mixed).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
        ['g', 'h']
      ]);
    });

    it('parses multiline records containing embedded newlines and delimiters', () => {
      const multiline = 'header1,header2\n"line1\r\nline2\nline3\rline4","val, with, commas"\n"simple","end"';
      const result = parser.parse(multiline);

      expect(result).toEqual([
        ['header1', 'header2'],
        ['line1\r\nline2\nline3\rline4', 'val, with, commas'],
        ['simple', 'end']
      ]);
    });

    it('robustly parses extreme 1-byte chunk streams without corruption', () => {
      const fullText = 'id,name,notes\n1,"Alice, Jr.","Line1\nLine2"\n2,"Bob","Simple note"\n';
      const singleByteParser = new CsvParser();
      const rows: string[][] = [];

      for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];
        const isLast = (i === fullText.length - 1);
        const parsed = singleByteParser.parseChunk(char, isLast);
        if (parsed.length > 0) {
          rows.push(...parsed);
        }
      }

      const expected = parser.parse(fullText);
      expect(rows).toEqual(expected);
    });

    it('handles binary Uint8Array streams with multi-byte UTF-8 split across chunk boundaries', () => {
      // Test string with 4-byte emoji (🚀: F0 9F 9a 80) and 2-byte accented char (é: C3 A9)
      const input = 'icon,label\n"🚀","Café"\n';
      const encoder = new TextEncoder();
      const bytes = encoder.encode(input);

      // Split right in the middle of the 4-byte emoji:
      // Find index of F0
      const emojiIndex = bytes.indexOf(0xF0);
      expect(emojiIndex).toBeGreaterThan(0);

      // Chunk 1 cuts the emoji after 2 bytes
      const chunk1 = bytes.slice(0, emojiIndex + 2);
      const chunk2 = bytes.slice(emojiIndex + 2);

      const binParser = new CsvParser();
      const res1 = binParser.parseChunk(chunk1, false);
      const res2 = binParser.parseChunk(chunk2, true);

      const all = [...res1, ...res2];
      expect(all).toEqual([
        ['icon', 'label'],
        ['🚀', 'Café']
      ]);
    });

    it('demonstrates high-volume parsing and serialization throughput and budget adherence', () => {
      // 5,000 rows x 5 columns
      const rowCount = 5000;
      const testMatrix: string[][] = [];
      testMatrix.push(['ID', 'Name', 'Notes', 'Amount', 'Status']);

      for (let r = 1; r <= rowCount; r++) {
        testMatrix.push([
          String(r),
          `User ${r}`,
          r % 3 === 0 ? `"Quoted, ${r}"` : `Plain ${r}`,
          (r * 1.5).toFixed(2),
          r % 2 === 0 ? 'Active' : 'Pending'
        ]);
      }

      // Serialize benchmark
      const t0 = performance.now();
      const serialized = serializer.serialize(testMatrix);
      const serializeDuration = performance.now() - t0;

      // Parse benchmark
      const t1 = performance.now();
      const parsed = parser.parse(serialized);
      const parseDuration = performance.now() - t1;

      expect(parsed.length).toBe(rowCount + 1);
      expect(parsed[0]).toEqual(['ID', 'Name', 'Notes', 'Amount', 'Status']);
      expect(parsed[rowCount][0]).toBe(String(rowCount));

      // Performance assertion: 5,000 rows parse in < 500ms
      expect(parseDuration).toBeLessThan(500);
      expect(serializeDuration).toBeLessThan(500);
    });

    it('guarantees 100% roundtrip fidelity across all special characters and delimiters', () => {
      const complexMatrix = [
        ['Col1', 'Col2', 'Col3', 'Col4', 'Col5'],
        ['Simple', 'Has, Comma', 'Has "Quotes"', 'Has\nNewline', 'Has\r\nCRLF'],
        ['=SUM(A1:B2)', 'https://example.com?a=1&b=2', '🚀 Emoji', 'Tab\tSeparated', 'Special: ; | " \' \\ /'],
        ['123.45', '   Leading and trailing spaces   ', '', 'null', 'undefined']
      ];

      for (const delimiter of [',', ';', '\t', '|']) {
        const s = new CsvSerializer({ delimiter });
        const p = new CsvParser({ delimiter });

        const serialized = s.serialize(complexMatrix);
        const deserialized = p.parse(serialized);

        expect(deserialized).toEqual(complexMatrix);
      }
    });

    it('enforces strict mode and fixed-width dialect options in CsvSerializer', () => {
      // Strict mode throws on cell requiring quotes
      expect(() => {
        serializer.serialize([['Clean'], ['Needs, Quote']], { isStrict: true });
      }).toThrow(/Strict csv format not respected/);

      // Strict mode passes on clean cells
      expect(() => {
        serializer.serialize([['Clean'], ['AlsoClean']], { isStrict: true });
      }).not.toThrow();

      // Quote always forces quotes on every cell
      const quoteAlways = serializer.serialize([['A', 'B'], ['1', '2']], { quoteAlways: true });
      expect(quoteAlways).toBe('"A","B"\n"1","2"');

      // Fixed width pads cells with leading spaces
      const fixedWidth = serializer.serialize([['A', 'BB'], ['CCC', 'D']], { fixedWidth: 5 });
      expect(fixedWidth).toBe('    A,   BB\n  CCC,    D');
    });
  });

  // ==========================================================================
  // 3. SearchEngine Adversarial Stress Testing
  // ==========================================================================
  describe('3. SearchEngine Adversarial Stress Testing', () => {
    let df: Dataframe;
    let search: SearchEngine;

    beforeEach(() => {
      df = new Dataframe([
        ['Header1', 'Header2', 'Header3'],
        ['Alpha 100', 'Beta [special]', 'Gamma $50'],
        ['Delta', 'Alpha 200', 'Epsilon'],
        ['Alpha 100', 'Zeta', 'Eta']
      ]);
      search = new SearchEngine();
    });

    it('handles regex injection and malformed regex gracefully without throwing', () => {
      // Invalid regex syntax
      const malformedQueries = [
        '[unclosed bracket',
        '(unclosed parenthesis',
        '*invalid star start',
        '+invalid plus start',
        '?invalid question start',
        '\\',
        '(?<invalid group'
      ];

      for (const term of malformedQueries) {
        expect(() => {
          const results = search.find(df, {
            term,
            caseSensitive: false,
            useRegex: true,
            matchWholeCell: false
          });
          expect(Array.isArray(results)).toBe(true);
        }).not.toThrow();
      }
    });

    it('properly escapes special regex characters when useRegex is false', () => {
      // 'Beta [special]' has literal square brackets
      const literalResults = search.find(df, {
        term: '[special]',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false
      });

      expect(literalResults.length).toBe(1);
      expect(literalResults[0].x).toBe(1);
      expect(literalResults[0].y).toBe(1);

      // '$50' has dollar sign
      const dollarResults = search.find(df, {
        term: '$50',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false
      });
      expect(dollarResults.length).toBe(1);
      expect(dollarResults[0].x).toBe(2);
      expect(dollarResults[0].y).toBe(1);
    });

    it('handles empty query term and whole-cell matching accurately', () => {
      // Empty query term returns empty matches
      expect(search.find(df, { term: '', caseSensitive: false, useRegex: false, matchWholeCell: false })).toEqual([]);

      // Whole cell matching
      const partialMatches = search.find(df, { term: 'Alpha', caseSensitive: false, useRegex: false, matchWholeCell: false });
      expect(partialMatches.length).toBe(3); // Alpha 100, Alpha 200, Alpha 100

      const wholeCellMatches = search.find(df, { term: 'Alpha', caseSensitive: false, useRegex: false, matchWholeCell: true });
      expect(wholeCellMatches.length).toBe(0); // None are exactly 'Alpha'

      const deltaWholeMatch = search.find(df, { term: 'Delta', caseSensitive: false, useRegex: false, matchWholeCell: true });
      expect(deltaWholeMatch.length).toBe(1);
      expect(deltaWholeMatch[0].x).toBe(0);
      expect(deltaWholeMatch[0].y).toBe(2);
    });

    it('respects scopeRange boundary clipping and handles inverted ranges safely', () => {
      // Scoped search only in row 1
      const scoped = search.find(df, {
        term: 'Alpha',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false,
        scopeRange: { xmin: 0, xmax: 2, ymin: 1, ymax: 1 }
      });
      expect(scoped.length).toBe(1);
      expect(scoped[0].y).toBe(1);

      // Inverted range (ymin > ymax)
      const inverted = search.find(df, {
        term: 'Alpha',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false,
        scopeRange: { xmin: 2, xmax: 0, ymin: 3, ymax: 1 }
      });
      expect(inverted).toEqual([]);
    });

    it('navigates circular search cycles (findNext & findPrevious) across all matches', () => {
      const query = { term: 'Alpha', caseSensitive: false, useRegex: false, matchWholeCell: false };
      // Matches are at: (0, 1), (1, 2), (0, 3)

      // Starting at (0, 0): findNext should land on (0, 1)
      const m1 = search.findNext(df, query, { x: 0, y: 0 });
      expect(m1).toEqual(expect.objectContaining({ x: 0, y: 1 }));

      // From (0, 1): findNext should land on (1, 2)
      const m2 = search.findNext(df, query, { x: 0, y: 1 });
      expect(m2).toEqual(expect.objectContaining({ x: 1, y: 2 }));

      // From (1, 2): findNext should land on (0, 3)
      const m3 = search.findNext(df, query, { x: 1, y: 2 });
      expect(m3).toEqual(expect.objectContaining({ x: 0, y: 3 }));

      // From (0, 3): findNext should circularly wrap back to (0, 1)
      const mWrap = search.findNext(df, query, { x: 0, y: 3 });
      expect(mWrap).toEqual(expect.objectContaining({ x: 0, y: 1 }));

      // Reverse cycle: from (0, 1) findPrevious should wrap to (0, 3)
      const pWrap = search.findPrevious(df, query, { x: 0, y: 1 });
      expect(pWrap).toEqual(expect.objectContaining({ x: 0, y: 3 }));

      // From (0, 3) findPrevious should land on (1, 2)
      const p2 = search.findPrevious(df, query, { x: 0, y: 3 });
      expect(p2).toEqual(expect.objectContaining({ x: 1, y: 2 }));

      // Boundary coords: out of bounds coordinates
      const outOfBoundsNext = search.findNext(df, query, { x: 999, y: 999 });
      expect(outOfBoundsNext).toEqual(expect.objectContaining({ x: 0, y: 1 }));
    });

    it('navigates grid matches via goToNextMatching', () => {
      // Cell (0, 1) has 'Alpha 100', cell (0, 3) has 'Alpha 100'
      const nextMatching = search.goToNextMatching(df, { x: 0, y: 1 });
      expect(nextMatching).toEqual({ x: 0, y: 3 });

      // Cell (0, 3) wraps back to (0, 1)
      const wrapMatching = search.goToNextMatching(df, { x: 0, y: 3 });
      expect(wrapMatching).toEqual({ x: 0, y: 1 });

      // Unique cell returns null
      const uniqueMatching = search.goToNextMatching(df, { x: 0, y: 2 }); // 'Delta'
      expect(uniqueMatching).toBeNull();
    });

    it('creates multi-match atomic replace transactions and preserves undo fidelity', () => {
      // Replace all occurrences of 'Alpha' with 'Omega'
      const tx = search.createReplaceTransaction(df, {
        term: 'Alpha',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false
      }, 'Omega');

      expect(tx.commands.length).toBe(3);

      // Execute replace transaction
      tx.execute(df);
      expect(df.get(0, 1)).toBe('Omega 100');
      expect(df.get(1, 2)).toBe('Omega 200');
      expect(df.get(0, 3)).toBe('Omega 100');

      // Undo restores original values
      tx.undo(df);
      expect(df.get(0, 1)).toBe('Alpha 100');
      expect(df.get(1, 2)).toBe('Alpha 200');
      expect(df.get(0, 3)).toBe('Alpha 100');
    });
  });

  // ==========================================================================
  // 4. ValidationEngine Adversarial Stress Testing
  // ==========================================================================
  describe('4. ValidationEngine Adversarial Stress Testing', () => {
    let validator: ValidationEngine;

    beforeEach(() => {
      validator = new ValidationEngine();
    });

    it('performs header deduplication, SQL identifier sanitization, and collision resolution', () => {
      const headerDf = new Dataframe([
        ['ID', 'id', 'User Name', 'Select * From', 'col_c2', 'col', 'col', '', '!@#$%']
      ]);

      const proposals = validator.validateHeaders(headerDf);
      expect(proposals.length).toBeGreaterThan(0);

      // Apply proposals to verify result
      const tx = validator.createAcceptAllTransaction(proposals);
      tx.execute(headerDf);

      // All headers must be lowercase, alphanumeric/underscore, and non-empty
      const finalHeaders = Array.from({ length: headerDf.width }, (_, x) => headerDf.get(x, 0));
      for (const h of finalHeaders) {
        expect(h.length).toBeGreaterThan(0);
        expect(/^[a-z0-9_]+$/.test(h)).toBe(true);
      }

      // Check duplicate resolution
      const uniqueHeaders = new Set(finalHeaders);
      expect(uniqueHeaders.size).toBe(finalHeaders.length);
    });

    it('rigorously tests calendar date parsing across leap years and boundary dates', () => {
      // Leap year truth tests
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true);  // 2024 is leap
      expect(isValidCalendarDate(2020, 2, 29)).toBe(true);  // 2020 is leap
      expect(isValidCalendarDate(2000, 2, 29)).toBe(true);  // 2000 is 400-yr leap
      expect(isValidCalendarDate(1900, 2, 29)).toBe(false); // 1900 is 100-yr non-leap
      expect(isValidCalendarDate(2023, 2, 29)).toBe(false); // 2023 is non-leap

      // Month day limit tests
      expect(isValidCalendarDate(2024, 4, 30)).toBe(true);
      expect(isValidCalendarDate(2024, 4, 31)).toBe(false); // April has 30 days
      expect(isValidCalendarDate(2024, 6, 31)).toBe(false); // June has 30 days
      expect(isValidCalendarDate(2024, 9, 31)).toBe(false); // September has 30 days
      expect(isValidCalendarDate(2024, 11, 31)).toBe(false); // November has 30 days
      expect(isValidCalendarDate(2024, 1, 31)).toBe(true);  // January has 31 days

      // Year-first candidate parsing
      const yf1 = parseYearFirstDate('2023-05-15');
      expect(yf1).toEqual({ year: 2023, month: 5, day: 15, raw: '2023-05-15' });

      const yfInvalid = parseYearFirstDate('2023-02-29'); // Non-leap
      expect(yfInvalid).toBeNull();

      // Year-last candidate parsing
      const yl1 = parseDateCandidate('25/12/2023'); // Day first
      expect(yl1).toEqual({ p1: 25, p2: 12, year: 2023, raw: '25/12/2023' });

      const yl2 = parseDateCandidate('05/28/2023'); // Month first
      expect(yl2).toEqual({ p1: 5, p2: 28, year: 2023, raw: '05/28/2023' });

      const ylImpossible = parseDateCandidate('32/15/2023');
      expect(ylImpossible).toBeNull();
    });

    it('evaluates date format certainty, detecting ambiguous and coexisting formats', () => {
      // Coexisting formats (day-first and month-first in same dataframe)
      const coexistingDf = new Dataframe([
        ['Date1', 'Date2'],
        ['25/12/2023', '05/28/2023'] // 25 > 12 (day-first), 28 > 12 (month-first)
      ]);
      const coexistingResult = validator.validateDates(coexistingDf);
      expect(coexistingResult.reason).toBe('coexistence');

      // Ambiguous dates (both parts <= 12)
      const ambiguousDf = new Dataframe([
        ['Date'],
        ['05/06/2023'] // Could be May 6 or June 5
      ]);
      const ambiguousResult = validator.validateDates(ambiguousDf);
      expect(ambiguousResult.reason).toBe('ambiguous');

      // Unambiguous year-first date normalization
      const unambiguousDf = new Dataframe([
        ['Date'],
        ['2023/5/9'] // Year first, single digit month and day
      ]);
      const unambiguousResult = validator.validateDates(unambiguousDf);
      expect(unambiguousResult.proposals.length).toBe(1);
      expect(unambiguousResult.proposals[0].newValue).toBe('2023-05-09');
    });

    it('stress tests high-volume data validation across 10,000 cells within performance budget', () => {
      const rows = 2000;
      const cols = 5;
      const data: string[][] = [];
      data.push(['Col1', 'Col2', 'Col3', 'Col4', 'Col5']);

      for (let r = 1; r <= rows; r++) {
        data.push([
          `  User ${r}  `,       // Whitespace
          `${r},50`,              // Comma decimal
          `Value\nwith\nnewlines`, // Newlines
          `Has "quotes"`,         // Double quotes
          `Normal ${r}`
        ]);
      }

      const df = new Dataframe(data);
      const t0 = performance.now();
      const proposals = validator.validateData(df);
      const duration = performance.now() - t0;

      expect(proposals.length).toBeGreaterThan(5000);
      // High volume validation of 10,000 cells completes in < 250ms
      expect(duration).toBeLessThan(250);

      // Verify batch acceptAll operation
      const t1 = performance.now();
      const tx = validator.acceptAll(proposals, df);
      const acceptDuration = performance.now() - t1;

      expect(tx).toBeDefined();
      expect(acceptDuration).toBeLessThan(100);

      // Verify all proposals have 'accepted' status
      expect(proposals.every(p => p.status === 'accepted')).toBe(true);

      // Verify single atomic undo restores original dataframe
      tx.undo(df);
      expect(df.get(0, 1)).toBe('  User 1  ');
      expect(df.get(1, 1)).toBe('1,50');
    });

    it('verifies category-specific batch operations (acceptCategory and rejectCategory)', () => {
      const df = new Dataframe([
        ['Num', 'Text'],
        ['10,5', '  spaced  '],
        ['20,5', '  more  ']
      ]);

      const proposals = validator.validateData(df);
      expect(proposals.length).toBe(4);

      // Accept only WHITESPACE_TRIMMING
      validator.acceptCategory('WHITESPACE_TRIMMING', proposals, df);

      expect(df.get(1, 1)).toBe('spaced');
      expect(df.get(0, 1)).toBe('10,5'); // Decimal comma untouched

      const wsProposals = proposals.filter(p => p.category === 'WHITESPACE_TRIMMING');
      expect(wsProposals.every(p => p.status === 'accepted')).toBe(true);

      // Reject DATA_TYPE_COERCION
      validator.rejectCategory('DATA_TYPE_COERCION', proposals);
      const dtcProposals = proposals.filter(p => p.category === 'DATA_TYPE_COERCION');
      expect(dtcProposals.every(p => p.status === 'rejected')).toBe(true);
    });
  });

  // ==========================================================================
  // 5. EventBus Adversarial Stress Testing
  // ==========================================================================
  describe('5. EventBus Adversarial Stress Testing', () => {
    let bus: EventBus<CoreEventMap>;

    beforeEach(() => {
      bus = new EventBus<CoreEventMap>();
    });

    it('dispatches 50,000 high-frequency events within strict time budget', () => {
      let count = 0;
      bus.on('domain:cell:changed', () => {
        count++;
      });

      const t0 = performance.now();
      for (let i = 0; i < 50000; i++) {
        bus.emit('domain:cell:changed', { x: 0, y: i, oldValue: 'a', newValue: 'b' });
      }
      const duration = performance.now() - t0;

      expect(count).toBe(50000);
      // 50,000 emits must complete in < 250ms
      expect(duration).toBeLessThan(250);
    });

    it('isolates listener errors so faulty handlers do not prevent subsequent listeners from executing', () => {
      const errorHandlerSpy = vi.fn();
      const resilientBus = new EventBus<CoreEventMap>(errorHandlerSpy);

      let listener2Executed = false;
      let listener3Executed = false;

      // Listener 1 throws
      resilientBus.on('cell:changed', () => {
        throw new Error('Fatal listener failure');
      });

      // Listener 2 succeeds
      resilientBus.on('cell:changed', () => {
        listener2Executed = true;
      });

      // Listener 3 succeeds
      resilientBus.on('cell:changed', () => {
        listener3Executed = true;
      });

      // Emit event
      resilientBus.emit('cell:changed', { x: 1, y: 1, oldValue: '0', newValue: '1' });

      // Assert error was isolated and captured
      expect(errorHandlerSpy).toHaveBeenCalledTimes(1);
      expect(errorHandlerSpy.mock.calls[0][0].message).toBe('Fatal listener failure');
      expect(errorHandlerSpy.mock.calls[0][1]).toBe('cell:changed');

      // Subsequent listeners executed normally
      expect(listener2Executed).toBe(true);
      expect(listener3Executed).toBe(true);
    });

    it('handles concurrent listener modification (self-unsubscribing) safely during emit', () => {
      let callCountA = 0;
      let callCountB = 0;
      let callCountC = 0;

      let unsubB: (() => void) | null = null;

      bus.on('domain:cell:changed', () => {
        callCountA++;
      });

      unsubB = bus.on('domain:cell:changed', () => {
        callCountB++;
        // Self-unsubscribe inside callback
        if (unsubB) unsubB();
      });

      bus.on('domain:cell:changed', () => {
        callCountC++;
      });

      // Emit 1
      bus.emit('domain:cell:changed', { x: 0, y: 0, oldValue: '', newValue: '' });
      expect(callCountA).toBe(1);
      expect(callCountB).toBe(1);
      expect(callCountC).toBe(1);

      // Emit 2 (Listener B should not be called)
      bus.emit('domain:cell:changed', { x: 0, y: 0, oldValue: '', newValue: '' });
      expect(callCountA).toBe(2);
      expect(callCountB).toBe(1); // Still 1!
      expect(callCountC).toBe(2);
    });

    it('supports once() lifecycle, listenerCount, and clear()', () => {
      let onceCallCount = 0;
      bus.once('matrix:resized', () => {
        onceCallCount++;
      });

      expect(bus.hasListeners('matrix:resized')).toBe(true);
      expect(bus.listenerCount('matrix:resized')).toBe(1);

      bus.emit('matrix:resized', { width: 10, height: 20 });
      bus.emit('matrix:resized', { width: 15, height: 25 });

      expect(onceCallCount).toBe(1);
      expect(bus.hasListeners('matrix:resized')).toBe(false);
      expect(bus.listenerCount('matrix:resized')).toBe(0);

      // Register multiple and clear
      bus.on('matrix:resized', () => {});
      bus.on('matrix:resized', () => {});
      expect(bus.listenerCount('matrix:resized')).toBe(2);

      bus.clear('matrix:resized');
      expect(bus.listenerCount('matrix:resized')).toBe(0);
    });
  });

  // ==========================================================================
  // 6. Deep Adversarial Torture & Boundary Stress
  // ==========================================================================
  describe('6. Deep Adversarial Torture & Boundary Stress', () => {
    it('SearchEngine: executes zero-length regex patterns without infinite loops', () => {
      const search = new SearchEngine();
      const df = new Dataframe([
        ['cat', 'dog'],
        ['catalog', 'dogmatic']
      ]);

      // Zero-length regex queries that could trigger infinite while-loop if lastIndex not advanced
      const zeroLengthQueries = ['^', '$', '\\b', 'a*', '(?=dog)'];

      for (const term of zeroLengthQueries) {
        expect(() => {
          const matches = search.find(df, {
            term,
            caseSensitive: false,
            useRegex: true,
            matchWholeCell: false
          });
          expect(Array.isArray(matches)).toBe(true);
        }).not.toThrow();
      }
    });

    it('SearchEngine: handles empty or 0x0 dataframes safely', () => {
      const search = new SearchEngine();
      const emptyDf = new Dataframe([]);

      const matches = search.find(emptyDf, {
        term: 'anything',
        caseSensitive: false,
        useRegex: false,
        matchWholeCell: false
      });
      expect(matches).toEqual([]);

      const next = search.findNext(emptyDf, { term: 'anything', caseSensitive: false, useRegex: false, matchWholeCell: false }, { x: 0, y: 0 });
      expect(next).toBeNull();

      const nextMatching = search.goToNextMatching(emptyDf, { x: 0, y: 0 });
      expect(nextMatching).toBeNull();
    });

    it('CsvSerializer: handles null, undefined, and non-primitive cell types without throwing', () => {
      const serializer = new CsvSerializer();
      const weirdMatrix = [
        [null as any, undefined as any, 0 as any, false as any],
        [123.45 as any, '' as any, NaN as any, Infinity as any]
      ];

      const csv = serializer.serialize(weirdMatrix);
      expect(typeof csv).toBe('string');
      const parser = new CsvParser();
      const reparsed = parser.parse(csv);
      expect(reparsed.length).toBe(2);
      expect(reparsed[0][0]).toBe(''); // null serialized to ''
      expect(reparsed[0][1]).toBe(''); // undefined serialized to ''
      expect(reparsed[0][2]).toBe('0');
      expect(reparsed[0][3]).toBe('false');
    });

    it('ValidationEngine: registers and applies custom regex rules across full dataframe', () => {
      const engine = new ValidationEngine();
      engine.registerCustomRegexRule({
        id: 'mask_ssn',
        name: 'SSN Masking',
        pattern: '\\d{3}-\\d{2}-\\d{4}',
        replacement: 'XXX-XX-XXXX',
        message: 'Masked sensitive SSN'
      });

      const df = new Dataframe([
        ['Name', 'SSN'],
        ['Alice', '123-45-6789'],
        ['Bob', '987-65-4321'],
        ['Charlie', 'No SSN']
      ]);

      const proposals = engine.validateData(df);
      const ssnProposals = proposals.filter(p => p.categoryName === 'SSN Masking');
      expect(ssnProposals.length).toBe(2);
      expect(ssnProposals[0].newValue).toBe('XXX-XX-XXXX');
      expect(ssnProposals[1].newValue).toBe('XXX-XX-XXXX');

      // Accept proposals and verify mutation
      engine.acceptAll(proposals, df);
      expect(df.get(1, 1)).toBe('XXX-XX-XXXX');
      expect(df.get(1, 2)).toBe('XXX-XX-XXXX');
      expect(df.get(1, 3)).toBe('No SSN');
    });

    it('EventBus: supports 100,000 rapid event emissions with multiple subscribers', () => {
      const bus = new EventBus<CoreEventMap>();
      let counterA = 0;
      let counterB = 0;

      bus.on('domain:document:saved', () => { counterA++; });
      bus.on('domain:document:saved', () => { counterB++; });

      const t0 = performance.now();
      for (let i = 0; i < 100000; i++) {
        bus.emit('domain:document:saved', { timestamp: i });
      }
      const duration = performance.now() - t0;

      expect(counterA).toBe(100000);
      expect(counterB).toBe(100000);
      // 100k dual-subscriber emissions in < 400ms
      expect(duration).toBeLessThan(400);
    });
  });


});
