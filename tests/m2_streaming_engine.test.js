import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../app/js/StateManager.js';
import { Dataframe } from '../app/js/Dataframe.js';
import { Sheet } from '../app/js/Sheet.js';
import { Setting, stg } from '../app/js/Setting.js';
import { build_dom, dom } from '../app/js/dom.js';
import { CsvHandle } from '../app/js/CsvHandle.js';
import { csv_parse, separatorDetection, loadcsv } from '../app/js/csv_worker.js';

describe('Milestone 2 (R2) — Streaming File Loading Engine Test Suite', () => {
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
    StateManager.clear();

    if (dom.content) {
      if (!dom.content.scrollerY) {
        const sy = document.createElement('div');
        sy.className = 'scrollerY';
        dom.content.appendChild(sy);
        dom.content.scrollerY = sy;
      }
      if (!dom.content.scrollerX) {
        const sx = document.createElement('div');
        sx.className = 'scrollerX';
        dom.content.appendChild(sx);
        dom.content.scrollerX = sx;
      }
    }
  });

  afterEach(() => {
    StateManager.clear();
  });

  test('Dataframe.appendRows dynamically expands rows and maintains rectangular grid bounds', () => {
    const df = new Dataframe([
      ['A', 'B'],
      ['1', '2']
    ]);
    expect(df.height).toBe(2);
    expect(df.width).toBe(2);

    df.appendRows([['3', '4'], ['5', '6']]);
    expect(df.height).toBe(4);
    expect(df.width).toBe(2);
    expect(df.get(0, 2)).toBe('3');
    expect(df.get(1, 3)).toBe('6');

    df.appendRows([['7', '8', '9']]);
    expect(df.height).toBe(5);
    expect(df.width).toBe(3);
    expect(df.get(2, 0)).toBe('');
    expect(df.get(2, 4)).toBe('9');
  });

  test('CsvHandle.read emits file:load:start event with file metadata', () => {
    const csvHandle = new CsvHandle();
    let startEventReceived = null;

    StateManager.on('file:load:start', (data) => {
      startEventReceived = data;
    });

    const mockFile = { name: 'test_stream_start.csv', size: 2048 };
    const pipeSpy = vi.spyOn(csvHandle, 'pipe').mockImplementation(() => {});

    csvHandle.read(mockFile);

    expect(startEventReceived).not.toBeNull();
    expect(startEventReceived.filename).toBe('test_stream_start.csv');
    expect(startEventReceived.totalBytes).toBe(2048);
    expect(startEventReceived.viewOnly).toBe(false);
    expect(pipeSpy).toHaveBeenCalled();
  });

  test('CsvHandle instantiates Dataframe & Sheet immediately on isFirstChunk: true', () => {
    const csvHandle = new CsvHandle();
    let firstChunkEvent = null;

    StateManager.on('file:chunk:first', (data) => {
      firstChunkEvent = data;
    });

    csvHandle.file = { name: 'instant_render.csv', size: 100000 };

    csvHandle.file_chunk_loaded({
      cmd: 'chunk_loaded',
      status: 0.1,
      chunk: Array.from({ length: 100 }, (_, i) => [`R${i}C0`, `R${i}C1`]),
      chunk_id: 1,
      isFirstChunk: true,
      isComplete: false,
      viewOnly: false
    });

    expect(csvHandle.isFirstChunkLoaded).toBe(true);
    expect(firstChunkEvent).not.toBeNull();
    expect(firstChunkEvent.sheet).toBeDefined();

    const activeSheet = StateManager.getState('sheet');
    expect(activeSheet).toBeDefined();
    expect(activeSheet.df.height).toBe(100);
    expect(activeSheet.df.get(0, 0)).toBe('R0C0');
  });

  test('CsvHandle progressively appends subsequent background chunks and fires file:chunk:progress', () => {
    const csvHandle = new CsvHandle();
    let progressEvents = [];
    let completeEvent = null;

    StateManager.on('file:chunk:progress', (data) => {
      progressEvents.push(data);
    });

    StateManager.on('file:load:complete', (data) => {
      completeEvent = data;
    });

    csvHandle.file = { name: 'progressive.csv', size: 50000 };

    csvHandle.file_chunk_loaded({
      cmd: 'chunk_loaded',
      status: 0.2,
      chunk: Array.from({ length: 50 }, (_, i) => [`R${i}C0`, `R${i}C1`]),
      chunk_id: 1,
      isFirstChunk: true,
      isComplete: false,
      viewOnly: false
    });

    const activeSheet = StateManager.getState('sheet');
    expect(activeSheet.df.height).toBe(50);

    csvHandle.file_chunk_loaded({
      cmd: 'chunk_loaded',
      status: 0.6,
      chunk: Array.from({ length: 200 }, (_, i) => [`R${i + 50}C0`, `R${i + 50}C1`]),
      chunk_id: 2,
      isFirstChunk: false,
      isComplete: false
    });

    expect(activeSheet.df.height).toBe(250);
    expect(progressEvents.length).toBe(1);
    expect(progressEvents[0].chunkIndex).toBe(2);
    expect(progressEvents[0].rowsAdded).toBe(200);
    expect(progressEvents[0].totalRows).toBe(250);

    csvHandle.file_chunk_loaded({
      cmd: 'chunk_loaded',
      status: 1.0,
      chunk: Array.from({ length: 250 }, (_, i) => [`R${i + 250}C0`, `R${i + 250}C1`]),
      chunk_id: 3,
      isFirstChunk: false,
      isComplete: true
    });

    expect(activeSheet.df.height).toBe(500);
    expect(completeEvent).not.toBeNull();
    expect(completeEvent.totalRows).toBe(500);
    expect(completeEvent.totalCols).toBe(2);
  });

  test('loadcsv parses multiline quoted fields correctly without corrupting boundaries', async () => {
    let emittedMessages = [];
    const messageHandler = (e) => {
      if (e.data && e.data.cmd === 'chunk_loaded') {
        emittedMessages.push(e.data);
      }
    };
    window.addEventListener('message', messageHandler);

    const multilineCsv = 'id,description,status\n1,"Line 1\nLine 2\nLine 3",Active\n2,"Normal",Pending\n';
    const mockFile = new File([multilineCsv], 'multiline.csv', { type: 'text/csv' });

    loadcsv({ file: mockFile, viewOnly: false });

    for (let i = 0; i < 20 && emittedMessages.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    window.removeEventListener('message', messageHandler);

    expect(emittedMessages.length).toBeGreaterThan(0);
    const firstMsg = emittedMessages[0];
    expect(firstMsg.cmd).toBe('chunk_loaded');

    const matrix = firstMsg.chunk;
    expect(matrix.length).toBe(3);
    expect(matrix[0]).toEqual(['id', 'description', 'status']);
    expect(matrix[1]).toEqual(['1', 'Line 1\nLine 2\nLine 3', 'Active']);
    expect(matrix[2]).toEqual(['2', 'Normal', 'Pending']);
  });

  test('loadcsv parses classic Mac CR-only line endings correctly', async () => {
    let emittedMessages = [];
    const messageHandler = (e) => {
      if (e.data && e.data.cmd === 'chunk_loaded') {
        emittedMessages.push(e.data);
      }
    };
    window.addEventListener('message', messageHandler);

    const crCsv = 'A,B\r1,2\r3,4\r';
    const mockFile = new File([crCsv], 'cr.csv', { type: 'text/csv' });

    loadcsv({ file: mockFile, viewOnly: false });

    for (let i = 0; i < 20 && emittedMessages.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    window.removeEventListener('message', messageHandler);

    expect(emittedMessages.length).toBeGreaterThan(0);
    const matrix = emittedMessages[0].chunk;
    expect(matrix.length).toBe(3);
    expect(matrix[0]).toEqual(['A', 'B']);
    expect(matrix[1]).toEqual(['1', '2']);
    expect(matrix[2]).toEqual(['3', '4']);
  });

  test('loadcsv preserves multi-byte UTF-8 characters across chunks', async () => {
    let emittedMessages = [];
    const messageHandler = (e) => {
      if (e.data && e.data.cmd === 'chunk_loaded') {
        emittedMessages.push(e.data);
      }
    };
    window.addEventListener('message', messageHandler);

    const unicodeCsv = 'id,word,symbol\n1,Café,☕\n2,Naïve,🎉\n';
    const mockFile = new File([unicodeCsv], 'utf8.csv', { type: 'text/csv' });

    loadcsv({ file: mockFile, viewOnly: false });

    for (let i = 0; i < 20 && emittedMessages.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    window.removeEventListener('message', messageHandler);

    expect(emittedMessages.length).toBeGreaterThan(0);
    const matrix = emittedMessages[0].chunk;
    expect(matrix.length).toBe(3);
    expect(matrix[1][1]).toBe('Café');
    expect(matrix[1][2]).toBe('☕');
    expect(matrix[2][1]).toBe('Naïve');
    expect(matrix[2][2]).toBe('🎉');
  });
});
