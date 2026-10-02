import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Sheet } from '../app/js/Sheet.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Setting } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { StateManager } from '../app/js/StateManager.js';
import { cmd, buildMenu } from '../app/js/cmd.js';
import { Msg } from '../app/js/Msg.js';
import { parseDateCandidate, parseYearFirstDate, isValidCalendarDate } from '../app/js/utils/DateExt.js';


describe('Date Format Validation & Normalization Feature', () => {
  let df;
  let sheet;

  beforeEach(() => {
    document.body.innerHTML = `
      <header id="header"></header>
      <div id="content" class="flexMain">
        <div id="main-container">
          <ui-sheet id="sheet"></ui-sheet>
        </div>
      </div>
      <footer>
        <section id="footer">
          <section id="footerLeft">Left</section>
          <section id="footerCenter" class="flexMain">Center</section>
          <section id="footerRight">Right</section>
          <span id="lock" class="icon" role="img" aria-label="editing file" data-src="edit"></span>
        </section>
      </footer>
      <section id="dialog" class="scroll"></section>
    `;
    Setting.init();
    build_dom();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Date Parsing and Separator Independence', () => {
    test('isValidCalendarDate correctly validates calendar dates including leap years', () => {
      expect(isValidCalendarDate(2026, 1, 31)).toBe(true);
      expect(isValidCalendarDate(2026, 4, 30)).toBe(true);
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // April only has 30 days
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true); // 2024 is leap year
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false); // 2026 not leap year
      expect(isValidCalendarDate(2026, 13, 1)).toBe(false); // Invalid month
      expect(isValidCalendarDate(2026, 0, 1)).toBe(false); // Invalid month
    });

    test('parseDateCandidate matches standard hyphens, pipes, slashes, dots and spaces', () => {
      expect(parseDateCandidate('01-01-2026')).toEqual({ p1: 1, p2: 1, year: 2026, raw: '01-01-2026' });
      expect(parseDateCandidate('1|1|2026')).toEqual({ p1: 1, p2: 1, year: 2026, raw: '1|1|2026' });
      expect(parseDateCandidate('25/12/2026')).toEqual({ p1: 25, p2: 12, year: 2026, raw: '25/12/2026' });
      expect(parseDateCandidate('12.25.2026')).toEqual({ p1: 12, p2: 25, year: 2026, raw: '12.25.2026' });
      expect(parseDateCandidate('5 10 2026')).toEqual({ p1: 5, p2: 10, year: 2026, raw: '5 10 2026' });
      expect(parseDateCandidate(' 15_08_2026 ')).toEqual({ p1: 15, p2: 8, year: 2026, raw: '15_08_2026' });
    });

    test('parseDateCandidate rejects non-date strings, 2-digit years, and already YYYY-mm-dd dates', () => {
      expect(parseDateCandidate('2026-01-01')).toBeNull(); // Already target format (starts with 4-digit year)
      expect(parseDateCandidate('01-01-26')).toBeNull(); // 2-digit year
      expect(parseDateCandidate('hello world')).toBeNull();
      expect(parseDateCandidate('12345')).toBeNull();
      expect(parseDateCandidate('3.14159')).toBeNull();
      expect(parseDateCandidate('15-15-2026')).toBeNull(); // Both > 12 (invalid month)
      expect(parseDateCandidate('31-02-2026')).toBeNull(); // Feb 31 invalid date
    });

    test('parseYearFirstDate matches YYYY-m-d across separators and validates calendar bounds', () => {
      expect(parseYearFirstDate('2003-2-2')).toEqual({ year: 2003, month: 2, day: 2, raw: '2003-2-2' });
      expect(parseYearFirstDate('2003/02/02')).toEqual({ year: 2003, month: 2, day: 2, raw: '2003/02/02' });
      expect(parseYearFirstDate('2003.5.9')).toEqual({ year: 2003, month: 5, day: 9, raw: '2003.5.9' });
      expect(parseYearFirstDate('2003|12|31')).toEqual({ year: 2003, month: 12, day: 31, raw: '2003|12|31' });
      expect(parseYearFirstDate('2003-15-02')).toBeNull(); // Month 15 invalid
      expect(parseYearFirstDate('2003-02-30')).toBeNull(); // Feb 30 invalid
      expect(parseYearFirstDate('01-01-2026')).toBeNull(); // Year is last, not first
    });
  });


  describe('Source Format Identification & Certainty Logic', () => {
    test('Identifies dd-mm-YYYY with certainty when digits > 12 are in first position', () => {
      df = new Dataframe([
        ['Date Col', 'Other'],
        ['25-01-2026', 'val1'], // 25 > 12 -> dd-mm-YYYY
        ['01-02-2026', 'val2'], // ambiguous alone
        ['1|1|2026', 'val3']     // ambiguous alone
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const msgSpy = vi.spyOn(Msg, 'success');
      const res = sheet.validate_date_format();

      expect(res.success).toBe(true);
      expect(res.detectedFormat).toBe('dd-mm-YYYY');
      expect(df.get(0, 1)).toBe('2026-01-25');
      expect(df.get(0, 2)).toBe('2026-02-01');
      expect(df.get(0, 3)).toBe('2026-01-01');
      expect(msgSpy).toHaveBeenCalled();
    });

    test('Identifies mm-dd-YYYY with certainty when digits > 12 are in second position', () => {
      df = new Dataframe([
        ['Header1', 'Header2'],
        ['01/25/2026', 'A'], // 25 > 12 -> mm-dd-YYYY
        ['01/02/2026', 'B'], // ambiguous alone: month 1, day 2
        ['12|31|2026', 'C']  // 31 > 12 -> mm-dd-YYYY
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const msgSpy = vi.spyOn(Msg, 'success');
      const res = sheet.validate_date_format();

      expect(res.success).toBe(true);
      expect(res.detectedFormat).toBe('mm-dd-YYYY');
      expect(df.get(0, 1)).toBe('2026-01-25');
      expect(df.get(0, 2)).toBe('2026-01-02');
      expect(df.get(0, 3)).toBe('2026-12-31');
      expect(msgSpy).toHaveBeenCalled();
    });

    test('Alerts user via Msg.js when both dd-mm-YYYY and mm-dd-YYYY coexist in the file', () => {
      df = new Dataframe([
        ['ColA', 'ColB'],
        ['25-01-2026', 'some text'], // dd-mm-YYYY
        ['01-25-2026', 'more text']  // mm-dd-YYYY
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const warningSpy = vi.spyOn(Msg, 'warning');
      const res = sheet.validate_date_format();

      expect(res.success).toBe(false);
      expect(res.reason).toBe('coexistence');
      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('coexist'),
        expect.any(String)
      );

      // Verify no cells were modified
      expect(df.get(0, 1)).toBe('25-01-2026');
      expect(df.get(0, 2)).toBe('01-25-2026');
    });

    test('Alerts user via Msg.js when no date has a digit over 12 to differentiate format', () => {
      df = new Dataframe([
        ['Dates'],
        ['01-02-2026'],
        ['05-08-2026'],
        ['11-12-2026']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const warningSpy = vi.spyOn(Msg, 'warning');
      const res = sheet.validate_date_format();

      expect(res.success).toBe(false);
      expect(res.reason).toBe('ambiguous');
      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('no date has a digit over 12'),
        expect.any(String)
      );

      // Verify no cells were modified
      expect(df.get(0, 1)).toBe('01-02-2026');
      expect(df.get(0, 2)).toBe('05-08-2026');
      expect(df.get(0, 3)).toBe('11-12-2026');
    });

    test('Alerts user via Msg.js when no candidate date cells exist in the file', () => {
      df = new Dataframe([
        ['Name', 'Age'],
        ['Alice', '30'],
        ['Bob', '25']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const infoSpy = vi.spyOn(Msg, 'info');
      const res = sheet.validate_date_format();

      expect(res.success).toBe(false);
      expect(res.reason).toBe('no_dates');
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('No matching date cells found'),
        expect.any(String)
      );
    });

    test('User Scenario: Transforms 2003-2-2 to 2003-02-02 alongside 2-2/2002 and 13-02-2003', () => {
      df = new Dataframe([
        ['Dates'],
        ['2003-2-2'],
        ['2-2/2002'],
        ['13-02-2003']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const res = sheet.validate_date_format();

      expect(res.success).toBe(true);
      expect(res.detectedFormat).toBe('dd-mm-YYYY');
      expect(df.get(0, 1)).toBe('2003-02-02');
      expect(df.get(0, 2)).toBe('2002-02-02');
      expect(df.get(0, 3)).toBe('2003-02-13');
    });

    test('Systematically normalizes YYYY-m-d dates even when year-last formats coexist', () => {
      df = new Dataframe([
        ['Dates'],
        ['2003-2-2'],
        ['25-01-2002'], // dd-mm-YYYY
        ['01-25-2003']  // mm-dd-YYYY
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const warningSpy = vi.spyOn(Msg, 'warning');
      const res = sheet.validate_date_format();

      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('coexist'),
        expect.any(String)
      );

      // 2003-2-2 is systematically normalized to 2003-02-02
      expect(df.get(0, 1)).toBe('2003-02-02');
      // Conflicting year-last dates are NOT modified
      expect(df.get(0, 2)).toBe('25-01-2002');
      expect(df.get(0, 3)).toBe('01-25-2003');
    });

    test('Systematically normalizes YYYY-m-d dates even when year-last formats are ambiguous', () => {
      df = new Dataframe([
        ['Dates'],
        ['2003-2-2'],
        ['01-02-2002'], // ambiguous
        ['05-08-2003']  // ambiguous
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const warningSpy = vi.spyOn(Msg, 'warning');
      sheet.validate_date_format();

      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('no date has a digit over 12'),
        expect.any(String)
      );

      // 2003-2-2 is systematically normalized to 2003-02-02
      expect(df.get(0, 1)).toBe('2003-02-02');
      // Ambiguous year-last dates are NOT modified
      expect(df.get(0, 2)).toBe('01-02-2002');
      expect(df.get(0, 3)).toBe('05-08-2003');
    });

    test('Normalizes standalone YYYY-m-d dates when no year-last dates exist', () => {
      df = new Dataframe([
        ['Dates'],
        ['1999-1-5'],
        ['2025/3/4']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      const res = sheet.validate_date_format();

      expect(res.success).toBe(true);
      expect(df.get(0, 1)).toBe('1999-01-05');
      expect(df.get(0, 2)).toBe('2025-03-04');
    });

  });

  describe('Menu Bar Icon & Command Registry Integration', () => {
    test('date_checker icon is rendered next to date icon in the header menu bar', () => {
      buildMenu();
      const icons = Array.from(dom.header.querySelectorAll('.icon'));

      const dateInsertIndex = icons.findIndex(el => el.getAttribute('data-icon') === 'date');
      const dateCheckerIndex = icons.findIndex(el => el.getAttribute('data-icon') === 'date_checker');

      expect(dateInsertIndex).toBeGreaterThan(-1);
      expect(dateCheckerIndex).toBeGreaterThan(-1);
      // Immediately adjacent
      expect(dateCheckerIndex).toBe(dateInsertIndex + 1);

      const checkerIcon = icons[dateCheckerIndex];
      expect(checkerIcon.getAttribute('title')).toContain('Validate Date Format');
      expect(checkerIcon.getAttribute('role')).toBe('button');
      expect(checkerIcon.style.getPropertyValue('--icon-url')).toContain('data:image/svg+xml');
    });

    test('Clicking date_checker menu icon triggers validate_date_format on active sheet', () => {
      df = new Dataframe([
        ['Val'],
        ['25-10-2026'],
        ['01-01-2026']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      buildMenu();
      const icons = Array.from(dom.header.querySelectorAll('.icon'));
      const checkerIcon = icons.find(el => el.getAttribute('data-icon') === 'date_checker');

      checkerIcon.click();

      expect(df.get(0, 1)).toBe('2026-10-25');
      expect(df.get(0, 2)).toBe('2026-01-01');
    });

    test('cmd.date_checker.run executes date validation via StateManager active sheet', () => {
      df = new Dataframe([
        ['Val'],
        ['10/25/2026'],
        ['02/03/2026']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      cmd.date_checker.run();

      expect(df.get(0, 1)).toBe('2026-10-25');
      expect(df.get(0, 2)).toBe('2026-02-03');
    });
  });

  describe('Undo/Redo & Transaction Scalability', () => {
    test('Validating dates executes atomic RANGE_EDIT transaction with single-step undo and redo', () => {
      df = new Dataframe([
        ['Dates'],
        ['15-05-2026'],
        ['01-01-2026'],
        ['2|3|2026']
      ]);
      sheet = new Sheet(df);
      StateManager.setState('sheet', sheet);

      sheet.validate_date_format();

      expect(df.get(0, 1)).toBe('2026-05-15');
      expect(df.get(0, 2)).toBe('2026-01-01');
      expect(df.get(0, 3)).toBe('2026-03-02');

      const lastCmd = df.undoStack[df.undoStack.length - 1];
      expect(lastCmd.type).toBe('RANGE_EDIT');

      // 1-step undo
      df.undo();
      expect(df.get(0, 1)).toBe('15-05-2026');
      expect(df.get(0, 2)).toBe('01-01-2026');
      expect(df.get(0, 3)).toBe('2|3|2026');

      // 1-step redo
      df.redo();
      expect(df.get(0, 1)).toBe('2026-05-15');
      expect(df.get(0, 2)).toBe('2026-01-01');
      expect(df.get(0, 3)).toBe('2026-03-02');
    });
  });
});
