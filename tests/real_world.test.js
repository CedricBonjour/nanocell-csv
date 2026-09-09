import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { csv_parse, separatorDetection } from '../app/js/csv_worker.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { CsvHandle } from '../app/js/CsvHandle.js';
import { Finder } from '../app/js/Finder.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom } from '../app/js/dom.js';
import { setSheet } from '../app/js/main.js';

describe('Real-World Application Scenarios & Fixture Integration', () => {
  const fixturesDir = path.resolve(__dirname, 'csv_files');

  beforeEach(() => {
    document.body.innerHTML = `
      <link rel="stylesheet" href="css/palettes/light.css" id="palette">
      <link rel="stylesheet" href="css/themes/light.css" id="theme">
      <header id="header"></header>
      <div id="content" class="flexMain"></div>
      <footer>
        <section id="dialog" class="scroll"></section>
        <section id="footer">
          <section id="footerLeft">Left</section>
          <section id="footerCenter" class="flexMain">Center</section>
          <section id="footerRight">Right</section>
          <img id="lock" src="icn/edit.svg" alt="editing file">
        </section>
      </footer>
    `;
    Setting.init();
    build_dom();
  });

  test('Workflow 1: Load demo_parser.csv fixture -> Edit -> Undo -> Search -> Export', () => {
    const filePath = path.join(fixturesDir, 'demo_parser.csv');
    const rawCsv = fs.readFileSync(filePath, 'utf-8');
    expect(rawCsv.length).toBeGreaterThan(0);

    const sep = separatorDetection(rawCsv);
    expect(sep).toBe(',');

    const matrix = csv_parse(rawCsv, sep);
    expect(matrix.length).toBeGreaterThan(3);

    const df = new Dataframe(matrix);
    const sheet = new Sheet(df);
    setSheet(sheet);

    // 1. Edit cell
    const originalVal = df.get(0, 0);
    df.edit(0, 0, 'MODIFIED_HEADER');
    expect(df.get(0, 0)).toBe('MODIFIED_HEADER');

    // 2. Undo edit
    df.undo();
    expect(df.get(0, 0)).toBe(originalVal);

    // 3. Search value
    const finder = new Finder(sheet);
    finder.findIn.value = 'A2';
    finder.find();
    expect(finder.found.length).toBeGreaterThan(0);

    // 4. Export CSV
    const exportedCsv = CsvHandle.from2D(df.data);
    expect(exportedCsv).toContain('A1,B1,C1');
  });

  test('Workflow 2: Load demo_color_types.csv -> Validate Data -> Sort -> Export', () => {
    const filePath = path.join(fixturesDir, 'demo_color_types.csv');
    const rawCsv = fs.readFileSync(filePath, 'utf-8');
    const matrix = csv_parse(rawCsv, ',');
    const df = new Dataframe(matrix);
    const sheet = new Sheet(df);

    // Validate data (convert comma decimal numbers)
    stg.dv_comma_num = true;
    sheet.validate_data();

    // Sort by column 1
    sheet.sort(1, true);

    const exported = CsvHandle.from2D(df.data);
    expect(exported).toBeDefined();
    expect(df.height).toBeGreaterThan(5);
  });

  test('Workflow 3: Load demo_pipeline_config.csv -> Trim Margins -> Search & Replace -> Export', () => {
    const filePath = path.join(fixturesDir, 'demo_pipeline_config.csv');
    const rawCsv = fs.readFileSync(filePath, 'utf-8');
    const matrix = csv_parse(rawCsv, ',');
    const df = new Dataframe(matrix);
    const sheet = new Sheet(df);
    setSheet(sheet);

    // Trim trailing empty rows/columns
    const initialRowCount = matrix.length;
    df.trimAll();
    expect(df.height).toBeLessThan(initialRowCount);

    // Validate headers
    sheet.validate_headers();
    expect(df.get(0, 0)).toBe('pipe_id');

    // Search and Replace client name
    const finder = new Finder(sheet);
    finder.findIn.value = 'Bank of utopia';
    finder.replaceIn.value = 'Utopia Bank';
    finder.find();
    expect(finder.found.length).toBe(4);

    finder.replaceAll();
    expect(df.get(1, 1)).toBe('Utopia Bank');

    const exported = CsvHandle.from2D(df.data);
    expect(exported).toContain('Utopia Bank');
  });

  test('Workflow 4: Load demo_r100.csv -> High volume sorting, row insertions, and query navigation', () => {
    const filePath = path.join(fixturesDir, 'demo_r100.csv');
    const rawCsv = fs.readFileSync(filePath, 'utf-8');
    const matrix = csv_parse(rawCsv, ',');
    const df = new Dataframe(matrix);
    const sheet = new Sheet(df);
    setSheet(sheet);

    expect(df.height).toBeGreaterThanOrEqual(95);

    // Find Alexander in dataset
    const finder = new Finder(sheet);
    finder.findIn.value = 'Alexander';
    finder.find();
    expect(finder.found.length).toBeGreaterThan(0);
    expect(sheet.y).toBe(1);

    // Insert new record row at position 1
    df.insertRow(1);
    df.edit(0, 1, 'Aaron');
    df.edit(1, 1, '+123456789');
    df.edit(2, 1, '25');

    expect(df.get(0, 1)).toBe('Aaron');
    expect(df.get(0, 2)).toBe('Alexander');

    // Export verify
    const exported = CsvHandle.from2D(df.data);
    expect(exported).toContain('Aaron,+123456789,25');
  });

  test('Workflow 5: Full E2E Lifecycle (Load -> Multi-Edit -> Range-Edit -> Search-Replace -> Undo/Redo -> Export)', () => {
    const filePath = path.join(fixturesDir, 'demo_parser.csv');
    const rawCsv = fs.readFileSync(filePath, 'utf-8');
    const matrix = csv_parse(rawCsv, ',');
    const df = new Dataframe(matrix);
    const sheet = new Sheet(df);
    setSheet(sheet);

    // Multi range edit
    sheet.x = 0;
    sheet.y = 1;
    sheet.rangeEnd = { x: 1, y: 2 };
    sheet.rangeEdit('OVERWRITTEN');

    expect(df.get(0, 1)).toBe('OVERWRITTEN');
    expect(df.get(1, 2)).toBe('OVERWRITTEN');

    // Undo range edit
    df.undo();
    expect(df.get(0, 1)).not.toBe('OVERWRITTEN');

    // Export final state
    const finalCsv = CsvHandle.from2D(df.data);
    expect(finalCsv.length).toBeGreaterThan(0);
  });
});
