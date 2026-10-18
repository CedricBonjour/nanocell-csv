import assert from 'node:assert';
import { loadCsv, loadCsvViewOnly } from '../app/js/csvWorker.js';
import { getSheet, setSheet } from '../app/js/state.js';
import { Dataframe } from '../app/core/Dataframe.js';

if (typeof globalThis.HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = class {
    style = { setProperty: () => {} };
    classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
    children: any[] = [];
    parentNode: any = null;
    appendChild(child: any) {
      if (child && typeof child === 'object') child.parentNode = this;
      this.children.push(child);
      return child;
    }
    contains(child: any) {
      return this.children.includes(child);
    }
    setAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    remove() {
      this.parentNode = null;
    }
    focus() {}
  };
}
if (typeof globalThis.customElements === 'undefined') {
  (globalThis as any).customElements = {
    get: () => undefined,
    define: () => {}
  };
}
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => new (globalThis as any).HTMLElement(),
    documentElement: { setAttribute: () => {} },
    body: new (globalThis as any).HTMLElement()
  };
}

const { CsvHandle } = await import('../app/js/CsvHandle.js');
const { Setting, settings } = await import('../app/js/state.js');

/**
 * Creates a File-like Blob with a `.name` property for headless Node testing.
 */
function createTestFile(content: string, name = 'test.csv'): File {
  const blob = new Blob([content], { type: 'text/csv' }) as any;
  blob.name = name;
  blob.lastModified = Date.now();
  return blob as File;
}

/**
 * Creates a mock FileSystemFileHandle wrapping mutable text content.
 */
function createMockFileHandle(initialContent: string, name = 'data.csv') {
  let currentContent = initialContent;
  let writtenContent: string | null = null;
  let getFileCalls = 0;

  const handle: any = {
    kind: 'file',
    name,
    async getFile() {
      getFileCalls++;
      return createTestFile(currentContent, name);
    },
    async createWritable() {
      let buffer = '';
      return {
        async write(data: string) {
          buffer += data;
        },
        async close() {
          writtenContent = buffer;
          currentContent = buffer;
        }
      };
    },
    setContent(nextContent: string) {
      currentContent = nextContent;
    },
    getWrittenContent() {
      return writtenContent;
    },
    getCallCount() {
      return getFileCalls;
    }
  };
  return handle;
}

/**
 * Creates an in-process worker adapter connected to `csvWorker.js` functions (`loadCsv` and `loadCsvViewOnly`).
 */
function createWorkerAdapter() {
  const listeners = new Set<Function>();
  const postedCommands: Array<{ cmd: string; data: any }> = [];

  const postToClient = (msg: any) => {
    for (const fn of listeners) {
      fn({ data: msg });
    }
  };

  const worker = {
    postedCommands,
    emitMessage(msg: any) {
      postToClient(msg);
    },
    addEventListener(type: string, fn: Function) {
      if (type === 'message') listeners.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      if (type === 'message') listeners.delete(fn);
    },
    postMessage(payload: { cmd: string; data: any }) {
      postedCommands.push(payload);
      const { cmd, data } = payload;
      if (cmd === 'read') {
        if (data.viewOnly) {
          loadCsvViewOnly(data, postToClient);
        } else {
          loadCsv(data, postToClient);
        }
      }
    }
  };

  return worker;
}

/**
 * Creates a isolated mock browser environment (window, document, sheet container, worker) for testing CsvHandle.
 */
function createMockTestHarness(options: {
  opener?: any;
  withLaunchQueue?: boolean;
} = {}) {
  Setting.init();
  Setting.resetDefault();

  const winListeners = new Map<string, Set<Function>>();
  let launchConsumer: ((params: any) => Promise<void> | void) | null = null;
  let lastCreatedInput: any = null;
  const footerCenter = { innerHTML: '' };

  const mockDocument: any = {
    title: 'csv',
    getElementById(id: string) {
      if (id === 'footer-center') return footerCenter;
      return null;
    },
    createElement(tag: string) {
      const el: any = {
        tagName: tag.toUpperCase(),
        type: '',
        accept: '',
        style: {},
        files: [],
        onchange: null,
        removed: false,
        clicked: false,
        click() {
          el.clicked = true;
        },
        remove() {
          el.removed = true;
        }
      };
      if (tag === 'input') {
        lastCreatedInput = el;
      }
      return el;
    },
    body: {
      children: [] as any[],
      appendChild(el: any) {
        this.children.push(el);
      }
    }
  };

  const mockWindow: any = {
    opener: options.opener || null,
    addEventListener(type: string, fn: Function) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      winListeners.get(type)?.delete(fn);
    },
    async dispatchEvent(type: string, event: any = {}) {
      const fns = Array.from(winListeners.get(type) || []);
      for (const fn of fns) {
        await fn(event);
      }
    },
    postMessage(data: any, _targetOrigin?: string, source?: any) {
      return mockWindow.dispatchEvent('message', { data, source });
    }
  };

  if (options.withLaunchQueue !== false) {
    mockWindow.launchQueue = {
      setConsumer(fn: (params: any) => Promise<void> | void) {
        launchConsumer = fn;
      }
    };
  }

  // Initialize with default "Hello World" sheet just like initApp()
  const createMockSheet = (df: Dataframe) => {
    const sheet: any = {
      df,
      fixTop: false,
      refreshCount: 0,
      refreshScrollbarsCount: 0,
      reloadCount: 0,
      refresh() {
        this.refreshCount++;
      },
      refreshScrollbars() {
        this.refreshScrollbarsCount++;
      },
      reload() {
        this.reloadCount++;
      }
    };
    setSheet(sheet);
    return sheet;
  };

  createMockSheet(new Dataframe([['Hello World']]));

  const worker = createWorkerAdapter();
  const csvHandle = new CsvHandle({
    window: mockWindow,
    document: mockDocument,
    worker,
    createSheet: createMockSheet
  });

  return {
    csvHandle,
    mockWindow,
    mockDocument,
    worker,
    footerCenter,
    getLaunchConsumer: () => launchConsumer,
    getLastCreatedInput: () => lastCreatedInput
  };
}

/**
 * Waits until `csvHandle.isReadComplete` becomes true (or times out).
 */
async function waitForReadComplete(csvHandle: CsvHandle, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!csvHandle.isReadComplete) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for CsvHandle read completion');
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

export async function runFileOpenTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(err);
    }
  }

  console.log('\n--- Running File Open Pathways & Boot Lifecycle Test Suite ---');

  // =========================================================================
  // WAY 1: OS File Association / PWA LaunchQueue (Double-clicking a CSV file)
  // =========================================================================
  await test('Way 1 (PWA LaunchQueue): Double-clicking a CSV file replaces "Hello World" sheet with parsed file', async () => {
    const { csvHandle, mockDocument, getLaunchConsumer, footerCenter } = createMockTestHarness();
    csvHandle.initListeners();

    assert.deepStrictEqual(getSheet().df.data, [['Hello World']]);
    const consumer = getLaunchConsumer();
    assert.strictEqual(typeof consumer, 'function', 'launchQueue consumer should be registered');

    const handle = createMockFileHandle('id,name,score\n1,Alice,95\n2,Bob,88\n', 'grades.csv');
    await consumer!({ files: [handle] });
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.handle, handle);
    assert.strictEqual(mockDocument.title, 'grades.csv');
    assert.strictEqual(footerCenter.innerHTML, '100%');
    assert.deepStrictEqual(getSheet().df.data, [
      ['id', 'name', 'score'],
      ['1', 'Alice', '95'],
      ['2', 'Bob', '88']
    ]);
    assert.strictEqual(getSheet().df.isSaved, true);
    assert.strictEqual(getSheet().df.lock, false);
  });

  await test('Way 1 Edge Cases: Empty launchQueue params, 0-byte file, and concurrent duplicate launch protection', async () => {
    const { csvHandle, mockDocument, getLaunchConsumer } = createMockTestHarness();
    csvHandle.initListeners();
    const consumer = getLaunchConsumer()!;

    // 1. Null / empty files array should not overwrite "Hello World"
    await consumer(null);
    await consumer({ files: [] });
    assert.deepStrictEqual(getSheet().df.data, [['Hello World']]);

    // 2. Concurrent duplicate launchFile with same handle only calls getFile() once
    const slowHandle = createMockFileHandle('a,b\n1,2', 'once.csv');
    const [p1, p2] = [csvHandle.launchFile(slowHandle), csvHandle.launchFile(slowHandle)];
    await Promise.all([p1, p2]);
    await waitForReadComplete(csvHandle);
    assert.strictEqual(slowHandle.getCallCount(), 1);
    assert.deepStrictEqual(getSheet().df.data, [['a', 'b'], ['1', '2']]);

    // 3. 0-byte empty CSV file replaces sheet with [[]] and marks read complete
    const emptyHandle = createMockFileHandle('', 'empty.csv');
    await consumer({ files: [emptyHandle] });
    await waitForReadComplete(csvHandle);
    assert.strictEqual(mockDocument.title, 'empty.csv');
    assert.deepStrictEqual(getSheet().df.data, [['']]);
    assert.strictEqual(csvHandle.isReadComplete, true);
  });

  // =========================================================================
  // WAY 2: Ctrl+O (`csvHandle.open()`) -> New Window (`postMessage` + `nanocell:ready`)
  // =========================================================================
  await test('Way 2 (Ctrl+O New Window): showOpenFilePicker opens new window and transfers handle on onload', async () => {
    const parent = createMockTestHarness();
    const pickedHandle = createMockFileHandle('col1,col2\nval1,val2', 'picked.csv');

    let childHarness: ReturnType<typeof createMockTestHarness> | null = null;
    parent.mockWindow.showOpenFilePicker = async () => [pickedHandle];
    parent.mockWindow.open = (_url: string, _target: string, _features: string) => {
      childHarness = createMockTestHarness({ opener: parent.mockWindow });
      childHarness.csvHandle.initListeners();
      return childHarness.mockWindow;
    };

    await parent.csvHandle.open();
    assert.ok(childHarness, 'New child window should be created');

    // Trigger onload on the new window
    childHarness!.mockWindow.onload?.();
    await waitForReadComplete(childHarness!.csvHandle);

    assert.strictEqual(childHarness!.csvHandle.handle, pickedHandle);
    assert.strictEqual(childHarness!.mockDocument.title, 'picked.csv');
    assert.deepStrictEqual(getSheet().df.data, [
      ['col1', 'col2'],
      ['val1', 'val2']
    ]);
  });

  await test('Way 2 Edge Case (Handshake Recovery): Child window still receives fileHandle via nanocell:ready if onload fired before initListeners', async () => {
    const parent = createMockTestHarness();
    const pickedHandle = createMockFileHandle('city,pop\nZurich,400000', 'zurich.csv');

    let childHarness: ReturnType<typeof createMockTestHarness> | null = null;
    parent.mockWindow.showOpenFilePicker = async () => [pickedHandle];
    parent.mockWindow.open = () => {
      // Child window is created, but its module script hasn't called initListeners() yet!
      childHarness = createMockTestHarness({ opener: parent.mockWindow });
      return childHarness.mockWindow;
    };

    await parent.csvHandle.open();
    // 1. onload fires prematurely BEFORE child calls initListeners() — message is lost!
    childHarness!.mockWindow.onload?.();
    assert.strictEqual(childHarness!.csvHandle.handle, null);

    // 2. Now child finishes booting and calls initListeners(), which sends { type: 'nanocell:ready' } to opener
    childHarness!.csvHandle.initListeners();
    await waitForReadComplete(childHarness!.csvHandle);

    assert.strictEqual(childHarness!.csvHandle.handle, pickedHandle);
    assert.strictEqual(childHarness!.mockDocument.title, 'zurich.csv');
    assert.deepStrictEqual(getSheet().df.data, [
      ['city', 'pop'],
      ['Zurich', '400000']
    ]);

    // 3. Even if onload fires again later, deduplication prevents reloading the same handle twice
    childHarness!.mockWindow.onload?.();
    assert.strictEqual(pickedHandle.getCallCount(), 1);
  });

  // =========================================================================
  // WAY 3: Ctrl+O (`csvHandle.open()`) In-Place Fallback (Standalone / Popup Blocked)
  // =========================================================================
  await test('Way 3 (Ctrl+O In-Place): Opens file in current window when window.open returns null, and ignores AbortError', async () => {
    const { csvHandle, mockWindow, mockDocument } = createMockTestHarness();
    const handle = createMockFileHandle('k,v\nalpha,100', 'inplace.csv');

    // First test AbortError (user cancelled file picker)
    mockWindow.showOpenFilePicker = async () => {
      const err = new Error('User cancelled');
      err.name = 'AbortError';
      throw err;
    };
    await csvHandle.open();
    assert.deepStrictEqual(getSheet().df.data, [['Hello World']]);

    // Next test standalone / popup-blocked mode where window.open returns null
    mockWindow.showOpenFilePicker = async () => [handle];
    mockWindow.open = () => null;

    await csvHandle.open();
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.handle, handle);
    assert.strictEqual(mockDocument.title, 'inplace.csv');
    assert.deepStrictEqual(getSheet().df.data, [
      ['k', 'v'],
      ['alpha', '100']
    ]);
  });

  // =========================================================================
  // WAY 4: Fallback `<input type="file">` (`csvHandle.openFallback()`)
  // =========================================================================
  await test('Way 4 (Fallback Input Picker): Uses hidden <input type="file"> when showOpenFilePicker is unsupported or throws TypeError', async () => {
    const { csvHandle, mockWindow, mockDocument, getLastCreatedInput } = createMockTestHarness();
    delete mockWindow.showOpenFilePicker;

    await csvHandle.open();
    const input = getLastCreatedInput();
    assert.ok(input, 'Fallback <input type="file"> should be created');
    assert.strictEqual(input.type, 'file');
    assert.strictEqual(input.clicked, true);

    const file = createTestFile('product,price\nBook,15.5', 'catalog.csv');
    input.onchange({ target: { files: [file] } });
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.handle, null);
    assert.strictEqual(csvHandle.file, file);
    assert.strictEqual(mockDocument.title, 'catalog.csv');
    assert.strictEqual(input.removed, true);
    assert.deepStrictEqual(getSheet().df.data, [
      ['product', 'price'],
      ['Book', '15.5']
    ]);
  });

  // =========================================================================
  // WAY 5: Drag and Drop (`drop` event with FileSystemFileHandle & File fallback)
  // =========================================================================
  await test('Way 5a (Drag & Drop with FileSystemFileHandle): Preserves file handle so Ctrl+S saves directly in-place', async () => {
    const { csvHandle, mockWindow, mockDocument } = createMockTestHarness();
    csvHandle.initListeners();

    const droppedHandle = createMockFileHandle('x,y\n10,20', 'dropped_handle.csv');
    let prevented = false;

    await mockWindow.dispatchEvent('drop', {
      preventDefault() {
        prevented = true;
      },
      dataTransfer: {
        items: [
          {
            async getAsFileSystemHandle() {
              return droppedHandle;
            }
          }
        ],
        files: []
      }
    });
    await waitForReadComplete(csvHandle);

    assert.strictEqual(prevented, true);
    assert.strictEqual(csvHandle.handle, droppedHandle);
    assert.strictEqual(mockDocument.title, 'dropped_handle.csv');
    assert.deepStrictEqual(getSheet().df.data, [
      ['x', 'y'],
      ['10', '20']
    ]);

    // Verify in-place save works using the preserved handle!
    getSheet().df.data[1][1] = '99';
    getSheet().df.isSaved = false;
    await csvHandle.save();
    assert.strictEqual(getSheet().df.isSaved, true);
    assert.strictEqual(droppedHandle.getWrittenContent(), 'x,y\r\n10,99');
  });

  await test('Way 5b (Drag & Drop with standard File fallback): Loads from dataTransfer.files[0] when getAsFileSystemHandle is unavailable', async () => {
    const { csvHandle, mockWindow, mockDocument } = createMockTestHarness();
    csvHandle.initListeners();

    const droppedFile = createTestFile('lang,year\nRust,2015', 'langs.csv');
    let dragOverPrevented = false;
    await mockWindow.dispatchEvent('dragover', {
      preventDefault() {
        dragOverPrevented = true;
      }
    });
    assert.strictEqual(dragOverPrevented, true);

    await mockWindow.dispatchEvent('drop', {
      preventDefault() {},
      dataTransfer: {
        files: [droppedFile]
      }
    });
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.handle, null);
    assert.strictEqual(csvHandle.file, droppedFile);
    assert.strictEqual(mockDocument.title, 'langs.csv');
    assert.deepStrictEqual(getSheet().df.data, [
      ['lang', 'year'],
      ['Rust', '2015']
    ]);
  });

  // =========================================================================
  // WAY 6: Reload File (`reloadFile()`), View-Only Mode, and Stale Stream Aborts
  // =========================================================================
  await test('Way 6 (reloadFile): Supports both FileSystemFileHandle and File fallback, with unsaved-changes confirmation guard', async () => {
    const { csvHandle } = createMockTestHarness();

    // 1. Reload with no file open returns quick notification
    const noFileNotif: any = csvHandle.reloadFile();
    assert.strictEqual(noFileNotif.message, 'No file to reload from.');

    // 2. Open with FileSystemFileHandle, modify disk content, and reload
    const handle = createMockFileHandle('h1,h2\nv1,v2', 'reloadable.csv');
    await csvHandle.launchFile(handle);
    await waitForReadComplete(csvHandle);
    assert.deepStrictEqual(getSheet().df.data, [['h1', 'h2'], ['v1', 'v2']]);

    // Update underlying file on disk
    handle.setContent('h1,h2\nv1_updated,v2_updated');

    // Mark sheet as having unsaved changes
    getSheet().df.data[1][0] = 'local_unsaved_edit';
    getSheet().df.isSaved = false;

    // Calling reloadFile(false) should prompt choice instead of overwriting immediately
    const choiceNotif: any = csvHandle.reloadFile(false);
    assert.strictEqual(choiceNotif.message, 'Changes will be lost ? ');
    assert.strictEqual(getSheet().df.data[1][0], 'local_unsaved_edit');

    // Confirming the prompt triggers the reload from disk
    await choiceNotif.options.onConfirm();
    await waitForReadComplete(csvHandle);
    assert.deepStrictEqual(getSheet().df.data, [
      ['h1', 'h2'],
      ['v1_updated', 'v2_updated']
    ]);
    assert.strictEqual(getSheet().df.isSaved, true);

    // 3. Reloading when opened via File fallback (handle === null, file !== null)
    const fallbackFile = createTestFile('f1,f2\n100,200', 'fallback_reload.csv');
    csvHandle.loadFile(fallbackFile, null);
    await waitForReadComplete(csvHandle);
    getSheet().df.data[1][0] = 'dirty';
    getSheet().df.isSaved = false;

    // Force reload (force = true) bypasses confirmation prompt and restores fallbackFile
    csvHandle.reloadFile(true);
    await waitForReadComplete(csvHandle);
    assert.deepStrictEqual(getSheet().df.data, [
      ['f1', 'f2'],
      ['100', '200']
    ]);
  });

  await test('View-Only Mode: Files exceeding settings.editMaxFileSize load in locked View-Only sampled mode', async () => {
    const { csvHandle } = createMockTestHarness();
    // Set max editable size to 0.0001 MB (100 bytes) so our test file triggers view-only mode
    settings.editMaxFileSize = 0.0001;
    settings.previewChunks = 2;
    settings.previewRows = 2;

    const lines = ['colA,colB'];
    for (let i = 1; i <= 30; i++) {
      lines.push(`row${i},val${i}`);
    }
    const largeFile = createTestFile(lines.join('\n'), 'large.csv');
    csvHandle.loadFile(largeFile, null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.viewOnly, true);
    assert.strictEqual(getSheet().df.lock, true);
    assert.strictEqual(getSheet().df.isSaved, true);
    assert.strictEqual(getSheet().df.data[0][0], 'colA');
  });

  await test('Race Condition Guard: Opening File B while File A is mid-stream aborts File A and ignores stale readId chunks', async () => {
    const { csvHandle, worker } = createMockTestHarness();

    // Start manual read #1 (simulating a multi-chunk file in progress)
    csvHandle.readId = 1;
    csvHandle.isFirstChunkLoaded = false;
    csvHandle.isReadComplete = false;

    worker.emitMessage({
      cmd: 'chunk_loaded',
      readId: 1,
      status: 0.5,
      chunk: [['FileA_Col1', 'FileA_Col2'], ['A1', 'A2']],
      chunkId: 1,
      isFirstChunk: true,
      isComplete: false
    });
    assert.deepStrictEqual(getSheet().df.data, [['FileA_Col1', 'FileA_Col2'], ['A1', 'A2']]);

    // Before File A finishes, user opens File B
    const fileB = createTestFile('FileB_H1,FileB_H2\nB1,B2', 'fileB.csv');
    csvHandle.loadFile(fileB, null);
    await waitForReadComplete(csvHandle);

    // Verify 'abort' was sent to the worker for File A
    assert.ok(
      worker.postedCommands.some((c) => c.cmd === 'abort'),
      'Worker should receive an abort command when a new read supersedes an in-flight read'
    );

    // Simulate a late/stale chunk from File A (readId: 1) arriving after File B (readId: 2) loaded
    worker.emitMessage({
      cmd: 'chunk_loaded',
      readId: 1,
      status: 1.0,
      chunk: [['Stale_A3', 'Stale_A4']],
      chunkId: 2,
      isFirstChunk: false,
      isComplete: true
    });

    // File B's data must remain completely uncorrupted!
    assert.deepStrictEqual(getSheet().df.data, [
      ['FileB_H1', 'FileB_H2'],
      ['B1', 'B2']
    ]);
  });

  // =========================================================================
  // WAY 7: Single-Read-Per-Chunk Guarantee & Multi-Encoding E2E Pipeline
  // =========================================================================
  function createBinaryMockFile(bytes: Uint8Array, name = 'binary.csv') {
    let sliceCalls = 0;
    let arrayBufferCalls = 0;
    let textCalls = 0;
    const slicesRequested: Array<[number, number]> = [];

    return {
      name,
      size: bytes.byteLength,
      get stats() {
        return { sliceCalls, arrayBufferCalls, textCalls, slicesRequested };
      },
      slice(start = 0, end = bytes.byteLength) {
        sliceCalls++;
        slicesRequested.push([start, end]);
        const sub = bytes.subarray(start, end);
        return {
          async arrayBuffer() {
            arrayBufferCalls++;
            return sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength);
          },
          async text() {
            textCalls++;
            return new TextDecoder('utf-8').decode(sub);
          }
        };
      }
    } as unknown as File & {
      stats: { sliceCalls: number; arrayBufferCalls: number; textCalls: number; slicesRequested: Array<[number, number]> };
    };
  }

  function encodeLatin1Bytes(str: string): Uint8Array {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function encodeUTF16Bytes(str: string, littleEndian: boolean, withBOM: boolean): Uint8Array {
    const offset = withBOM ? 2 : 0;
    const out = new Uint8Array(str.length * 2 + offset);
    if (withBOM) {
      out[0] = littleEndian ? 0xff : 0xfe;
      out[1] = littleEndian ? 0xfe : 0xff;
    }
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (littleEndian) {
        out[offset + i * 2] = code & 0xff;
        out[offset + i * 2 + 1] = (code >> 8) & 0xff;
      } else {
        out[offset + i * 2] = (code >> 8) & 0xff;
        out[offset + i * 2 + 1] = code & 0xff;
      }
    }
    return out;
  }

  await test('Single-Read Guarantee: Normal mode and View-Only mode read each slice into RAM exactly once (zero duplicate reads)', async () => {
    const { csvHandle } = createMockTestHarness();

    // 1. Single-chunk Normal mode: 1 slice, 1 arrayBuffer read, 0 text() calls
    const win1252Bytes = encodeLatin1Bytes('Produit;Cat\xe9gorie;Prix\r\nCaf\xe9;Boisson;4.50\r\nCr\xe8me;Dessert;3.20\r\n');
    const fileNormal = createBinaryMockFile(win1252Bytes, 'french_1252.csv');
    csvHandle.loadFile(fileNormal, null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(fileNormal.stats.sliceCalls, 1, 'Normal mode must slice file once per 500KB block');
    assert.strictEqual(fileNormal.stats.arrayBufferCalls, 1, 'Normal mode must read arrayBuffer once per slice');
    assert.strictEqual(fileNormal.stats.textCalls, 0, 'slice.text() must not be called when arrayBuffer() is available');
    assert.strictEqual(csvHandle.detectedEncoding, 'windows-1252');
    assert.strictEqual(csvHandle.detectedSeparator, ';');
    assert.deepStrictEqual(getSheet().df.data, [
      ['Produit', 'Catégorie', 'Prix'],
      ['Café', 'Boisson', '4.50'],
      ['Crème', 'Dessert', '3.20']
    ]);

    // 2. View-Only mode with previewChunks = 3: exactly 3 slices, 3 arrayBuffer reads, 0 text() calls
    settings.editMaxFileSize = 0.0001; // 100 bytes
    settings.previewChunks = 3;
    settings.previewRows = 2;

    const lines = ['ID|Ville|Notes'];
    for (let i = 1; i <= 40; i++) lines.push(`${i}|Gen\xe8ve_${i}|V\xe9rifi\xe9_${i}`);
    const fileViewOnly = createBinaryMockFile(encodeLatin1Bytes(lines.join('\r\n')), 'large_1252.csv');
    csvHandle.loadFile(fileViewOnly, null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.viewOnly, true);
    assert.strictEqual(fileViewOnly.stats.sliceCalls, 3, 'View-Only mode must slice exactly previewChunks times');
    assert.strictEqual(fileViewOnly.stats.arrayBufferCalls, 3, 'View-Only mode must read arrayBuffer once per preview chunk');
    assert.strictEqual(fileViewOnly.stats.textCalls, 0);
    assert.strictEqual(csvHandle.detectedEncoding, 'windows-1252');
    assert.strictEqual(csvHandle.detectedSeparator, '|');
    assert.deepStrictEqual(getSheet().df.data[0], ['ID', 'Ville', 'Notes']);
    assert.deepStrictEqual(getSheet().df.data[1], ['1', 'Genève_1', 'Vérifié_1']);
  });

  await test('Multi-Encoding E2E: Loads UTF-8 (BOM), UTF-16LE (BOM & BOM-less), UTF-16BE (BOM & BOM-less), Windows-1251, Shift_JIS, and GB18030 into Dataframe', async () => {
    const { csvHandle } = createMockTestHarness();

    const cases: Array<{
      name: string;
      bytes: Uint8Array;
      expectedEncoding: string;
      expectedSep: string;
      expectedMatrix: string[][];
    }> = [
      {
        name: 'utf8_bom.csv',
        bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('col1,col2\n🚀,Zürich\n')]),
        expectedEncoding: 'utf-8',
        expectedSep: ',',
        expectedMatrix: [['col1', 'col2'], ['🚀', 'Zürich']]
      },
      {
        name: 'utf16le_bom.tsv',
        bytes: encodeUTF16Bytes('Name\tCity\tPrice\r\nFrançois\tZürich\t€100\r\n', true, true),
        expectedEncoding: 'utf-16le',
        expectedSep: '\t',
        expectedMatrix: [['Name', 'City', 'Price'], ['François', 'Zürich', '€100']]
      },
      {
        name: 'utf16le_nobom.csv',
        bytes: encodeUTF16Bytes('Name;City;Score\r\nRené;Genève;95\r\n', true, false),
        expectedEncoding: 'utf-16le',
        expectedSep: ';',
        expectedMatrix: [['Name', 'City', 'Score'], ['René', 'Genève', '95']]
      },
      {
        name: 'utf16be_bom.csv',
        bytes: encodeUTF16Bytes('Key|Value\r\nAlpha|Бета\r\n', false, true),
        expectedEncoding: 'utf-16be',
        expectedSep: '|',
        expectedMatrix: [['Key', 'Value'], ['Alpha', 'Бета']]
      },
      {
        name: 'utf16be_nobom.csv',
        bytes: encodeUTF16Bytes('ID,Label,Town\r\n10,Müller,München\r\n', false, false),
        expectedEncoding: 'utf-16be',
        expectedSep: ',',
        expectedMatrix: [['ID', 'Label', 'Town'], ['10', 'Müller', 'München']]
      },
      {
        name: 'cyrillic_1251.csv',
        // "Имя;Возраст;Город\r\nАлексей;30;Москва\r\n"
        bytes: new Uint8Array([
          0xc8, 0xec, 0xff, 0x3b, 0xc2, 0xee, 0xe7, 0xf0, 0xe0, 0xf1, 0xf2, 0x3b, 0xc3, 0xee, 0xf0, 0xee, 0xe4, 0x0d, 0x0a,
          0xc0, 0xeb, 0xe5, 0xea, 0xf1, 0xe5, 0xe9, 0x3b, 0x33, 0x30, 0x3b, 0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0, 0x0d, 0x0a
        ]),
        expectedEncoding: 'windows-1251',
        expectedSep: ';',
        expectedMatrix: [['Имя', 'Возраст', 'Город'], ['Алексей', '30', 'Москва']]
      },
      {
        name: 'japanese_sjis.csv',
        // "名前,年齢,都市\r\n田中太郎,30,東京都\r\n"
        bytes: new Uint8Array([
          0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x94, 0x4e, 0x97, 0xee, 0x2c, 0x93, 0x73, 0x8e, 0x73, 0x0d, 0x0a,
          0x93, 0x63, 0x92, 0x86, 0x91, 0xbe, 0x98, 0x59, 0x2c, 0x33, 0x30, 0x2c, 0x93, 0x8c, 0x8b, 0x9e, 0x93, 0x73, 0x0d, 0x0a
        ]),
        expectedEncoding: 'shift_jis',
        expectedSep: ',',
        expectedMatrix: [['名前', '年齢', '都市'], ['田中太郎', '30', '東京都']]
      },
      {
        name: 'chinese_gb18030.csv',
        // "姓名,年龄,城市\r\n张三,30,北京\r\n"
        bytes: new Uint8Array([
          0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xc1, 0xe4, 0x2c, 0xb3, 0xc7, 0xca, 0xd0, 0x0d, 0x0a,
          0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x33, 0x30, 0x2c, 0xb1, 0xb1, 0xbe, 0xa9, 0x0d, 0x0a
        ]),
        expectedEncoding: 'gb18030',
        expectedSep: ',',
        expectedMatrix: [['姓名', '年龄', '城市'], ['张三', '30', '北京']]
      }
    ];

    for (const c of cases) {
      const mockFile = createBinaryMockFile(c.bytes, c.name);
      csvHandle.loadFile(mockFile, null);
      await waitForReadComplete(csvHandle);

      assert.strictEqual(csvHandle.detectedEncoding, c.expectedEncoding, `Encoding mismatch for ${c.name}`);
      assert.strictEqual(csvHandle.detectedSeparator, c.expectedSep, `Separator mismatch for ${c.name}`);
      assert.deepStrictEqual(getSheet().df.data, c.expectedMatrix, `Dataframe content mismatch for ${c.name}`);
      assert.strictEqual(getSheet().df.isSaved, true);
      assert.strictEqual(getSheet().df.lock, false);
    }
  });

  // =========================================================================
  // WAY 8: Multi-Chunk Streaming (> 500 KB) & Boundary Integrity in Normal Mode
  // =========================================================================
  await test('Normal Mode Multi-Chunk Streaming (> 500 KB): Streams 100-row first chunk, 2000-row batches, and preserves multibyte chars split at 500,000-byte boundary', async () => {
    const { csvHandle, footerCenter } = createMockTestHarness();

    // Build a > 600 KB UTF-8 CSV (~2,500 rows) and ensure a 4-byte emoji 🚀 straddles byte 500,000
    const rows: string[] = ['id;description;amount'];
    const payload = 'Valeur_avec_accents_éèê_et_symbole_€_'.repeat(5); // ~200 bytes per row
    for (let i = 1; i <= 2600; i++) {
      rows.push(`${i};${payload}_${i};${i * 10}`);
    }
    const rawBytes = new TextEncoder().encode(rows.join('\r\n') + '\r\n');
    assert.ok(rawBytes.byteLength > 500_000, 'Test buffer must exceed 500 KB CHUNK_SIZE');

    const file = createBinaryMockFile(rawBytes, 'multichunk.csv');
    csvHandle.loadFile(file, null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(file.stats.sliceCalls, 2, '600KB file should be read in exactly 2 x 500KB slices');
    assert.strictEqual(file.stats.arrayBufferCalls, 2);
    assert.strictEqual(csvHandle.detectedSeparator, ';');
    assert.strictEqual(csvHandle.detectedEncoding, 'utf-8');
    assert.strictEqual(footerCenter.innerHTML, '100%');
    assert.strictEqual(getSheet().df.height, 2601);
    assert.strictEqual(getSheet().df.width, 3);
    assert.deepStrictEqual(getSheet().df.data[0], ['id', 'description', 'amount']);
    assert.deepStrictEqual(getSheet().df.data[2600], ['2600', `${payload}_2600`, '26000']);
  });

  await test('Normal Mode Multi-Chunk EOF Edge Case: Completes cleanly when CRLF straddles 500KB boundary or final slice yields 0 new rows', async () => {
    const { csvHandle, footerCenter } = createMockTestHarness();

    // 1. Construct a 500,001-byte buffer where the first 500,000 bytes contain 100 complete rows
    // and row 101 ends with '\r' at byte 499,999 and '\n' at byte 500,000 (in Slice 2)
    const rowStr = 'col1,col2,col3,' + 'x'.repeat(4980) + '\n'; // 4996 bytes per row
    const chunk1Str = rowStr.repeat(100); // 499,600 bytes (100 rows emitted in Slice 1)
    const padLen = 500_000 - chunk1Str.length - 1;
    const splitCrlfStr = chunk1Str + 'y'.repeat(padLen) + '\r\n'; // '\r' at 499,999, '\n' at 500,000
    assert.strictEqual(splitCrlfStr.length, 500_001);

    const fileSplitCrlf = createBinaryMockFile(new TextEncoder().encode(splitCrlfStr), 'eof_split_crlf.csv');
    csvHandle.loadFile(fileSplitCrlf, null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(csvHandle.isReadComplete, true);
    assert.strictEqual(footerCenter.innerHTML, '100%');
    assert.strictEqual(getSheet().df.height, 101);

    // 2. Also test loadCsv directly when Slice 1 emits exactly 100 rows (pendingRows empty)
    // and Slice 2 contains only a comment line (0 rows parsed in Slice 2)
    const exactRow5k = 'a,b,' + 'z'.repeat(4995) + '\n'; // 5000 bytes
    const exact500k = exactRow5k.repeat(100); // 500,000 bytes, 100 rows
    const withCommentEof = new TextEncoder().encode(exact500k + '# trailing comment\n');
    const emitted: any[] = [];
    await loadCsv(
      { file: createBinaryMockFile(withCommentEof, 'comment_eof.csv'), readId: 99, commentChar: '#' },
      (msg: any) => emitted.push(msg)
    );
    assert.strictEqual(emitted.length, 2);
    assert.strictEqual(emitted[0].isFirstChunk, true);
    assert.strictEqual(emitted[0].isComplete, false);
    assert.strictEqual(emitted[0].chunk.length, 100);
    assert.strictEqual(emitted[1].isComplete, true);
    assert.strictEqual(emitted[1].status, 1.0);
  });

  // =========================================================================
  // WAY 9: Read Settings (trim, trimUnquoted, freezeHeaderOnOpen) & Zero-Row Files
  // =========================================================================
  await test('Read Settings & Edge Cases: Respects trim, trimUnquoted, freezeHeaderOnOpen, jagged row squaring, and BOM-only files', async () => {
    const { csvHandle } = createMockTestHarness();

    // 1. trimUnquoted = false vs true, trim = true (strips trailing empty rows & cols), freezeHeaderOnOpen = false
    settings.trimUnquoted = false;
    settings.trim = true;
    settings.freezeHeaderOnOpen = false;

    const untrimmedCsv = '  A  ,  B  ,   \n  1  ,  2  ,   \n   ,   ,   \n';
    csvHandle.loadFile(createTestFile(untrimmedCsv, 'trim_test.csv'), null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(getSheet().fixTop, false);
    assert.deepStrictEqual(getSheet().df.data, [
      ['  A  ', '  B  '],
      ['  1  ', '  2  ']
    ]);

    // 2. Jagged rows across chunks are squared to the widest row
    settings.trim = false;
    settings.trimUnquoted = true;
    settings.freezeHeaderOnOpen = true;
    const jaggedCsv = 'h1,h2\n1,2,3,4\nx\n';
    csvHandle.loadFile(createTestFile(jaggedCsv, 'jagged.csv'), null);
    await waitForReadComplete(csvHandle);

    assert.strictEqual(getSheet().fixTop, true);
    assert.strictEqual(getSheet().df.width, 4);
    assert.deepStrictEqual(getSheet().df.data, [
      ['h1', 'h2', '', ''],
      ['1', '2', '3', '4'],
      ['x', '', '', '']
    ]);

    // 3. Non-empty file containing ONLY a 3-byte UTF-8 BOM (0 parsed rows) initializes 1x1 [['']] Dataframe
    const bomOnlyFile = createBinaryMockFile(new Uint8Array([0xef, 0xbb, 0xbf]), 'bom_only.csv');
    csvHandle.loadFile(bomOnlyFile, null);
    await waitForReadComplete(csvHandle);
    assert.strictEqual(csvHandle.isReadComplete, true);
    assert.deepStrictEqual(getSheet().df.data, [['']]);
  });

  // =========================================================================
  // WAY 10: Comprehensive View-Only / Preview Mode (UTF-16 Odd-Byte Alignment, Divider Banners, Locks)
  // =========================================================================
  await test('View-Only Mode Comprehensive: UTF-16BE odd-byte offset alignment, "! [...] !" banners, and mutation/save locks', async () => {
    const { csvHandle } = createMockTestHarness();
    settings.editMaxFileSize = 0.0001; // 100 bytes
    settings.previewChunks = 3;
    settings.previewRows = 2;

    // Create a UTF-16BE file with BOM where total byte size / 3 is an ODD number
    // so chunk 2's raw Math.floor((iteration - 1) * (fileSize / previewChunks)) lands on an odd byte!
    const lines = ['ID;Région;Statut'];
    for (let i = 1; i <= 30; i++) {
      lines.push(`${i};Zürich_${i};Vérifié_${i}`);
    }
    const utf16beBytes = encodeUTF16Bytes(lines.join('\r\n') + '\r\n', false, true);
    const file = createBinaryMockFile(utf16beBytes, 'viewonly_utf16be.csv');

    csvHandle.loadFile(file, null);
    await waitForReadComplete(csvHandle);

    // Verify all requested slice startOffsets were even (2-byte aligned for UTF-16)
    for (const [start] of file.stats.slicesRequested) {
      assert.strictEqual(start % 2, 0, `UTF-16 slice startOffset (${start}) must be 2-byte aligned`);
    }

    assert.strictEqual(csvHandle.viewOnly, true);
    assert.strictEqual(csvHandle.detectedEncoding, 'utf-16be');
    assert.strictEqual(csvHandle.detectedSeparator, ';');

    const data = getSheet().df.data;
    // Chunk 1: 2 rows (header + row 1)
    assert.deepStrictEqual(data[0], ['ID', 'Région', 'Statut']);
    assert.deepStrictEqual(data[1], ['1', 'Zürich_1', 'Vérifié_1']);
    // Chunk 2: starts with '! [...] !' banner row followed by 2 sampled middle rows
    assert.deepStrictEqual(data[2], ['! [...] !', '! [...] !', '! [...] !']);
    assert.strictEqual(data[3].length, 3);
    assert.ok(data[3][1].startsWith('Zürich_'));
    // Chunk 3: starts with '! [...] !' banner row followed by last 2 rows (29 and 30)
    assert.deepStrictEqual(data[5], ['! [...] !', '! [...] !', '! [...] !']);
    assert.deepStrictEqual(data[6], ['29', 'Zürich_29', 'Vérifié_29']);
    assert.deepStrictEqual(data[7], ['30', 'Zürich_30', 'Vérifié_30']);

    // Verify View-Only mode blocks Dataframe mutations and save/saveAs
    getSheet().df.editRange({ xmin: 0, xmax: 0, ymin: 0, ymax: 0 }, 'HACKED');
    assert.strictEqual(getSheet().df.get(0, 0), 'ID', 'View-Only locked Dataframe must reject edits');
    await csvHandle.save();
    await csvHandle.saveAs();
  });

  return { passed, failed };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runFileOpenTests().then((result) => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
