/**
 * Standalone Pure Node.js Headless Verification Script
 *
 * Usage: node tests/verify_headless.mjs
 * Exit code 0: SUCCESS (All headless constraints satisfied)
 * Exit code 1: FAILURE (DOM globals leaked or ReferenceError thrown)
 */

import { strict as assert } from 'assert';

export async function runVerifyHeadless() {
  console.log('------------------------------------------------------------');
  console.log('Nanocell-CSV: Headless Core Node.js Verification Probe');
  console.log('------------------------------------------------------------');

  // 1. Audit DOM Isolation
  console.log('1. Checking DOM / Browser Global Isolation...');
  assert.equal(typeof globalThis.window, 'undefined', 'window must be undefined');
  assert.equal(typeof globalThis.document, 'undefined', 'document must be undefined');
  assert.equal(typeof globalThis.HTMLElement, 'undefined', 'HTMLElement must be undefined');
  assert.equal(typeof globalThis.customElements, 'undefined', 'customElements must be undefined');
  console.log('   ✓ Pure Node.js runtime confirmed: 0 DOM globals present.');

  // 2. Import Core Subsystems
  console.log('2. Dynamically Importing Core Subsystems...');
  let Dataframe, HistoryManager, EditCellCommand, CsvParser, CsvSerializer, SearchEngine, ValidationEngine, EventBus;

  try {
    const core = await import('../core/index.js').catch(() => import('../core/index.ts'));
    Dataframe = core.Dataframe;
    HistoryManager = core.HistoryManager;
    EditCellCommand = core.EditCellCommand;
    CsvParser = core.CsvParser;
    CsvSerializer = core.CsvSerializer;
    SearchEngine = core.SearchEngine;
    ValidationEngine = core.ValidationEngine;
    EventBus = core.EventBus;
  } catch {
    // If direct Node TS import is unavailable, use headless Vite SSR loader
    const { createServer } = await import('vite');
    const server = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'silent',
    });
    const core = await server.ssrLoadModule('./core/index.ts');
    Dataframe = core.Dataframe;
    HistoryManager = core.HistoryManager;
    EditCellCommand = core.EditCellCommand;
    CsvParser = core.CsvParser;
    CsvSerializer = core.CsvSerializer;
    SearchEngine = core.SearchEngine;
    ValidationEngine = core.ValidationEngine;
    EventBus = core.EventBus;
    await server.close();
  }

  assert.ok(Dataframe, 'Dataframe must be exported');
  assert.ok(HistoryManager, 'HistoryManager must be exported');
  assert.ok(EditCellCommand, 'EditCellCommand must be exported');
  assert.ok(CsvParser, 'CsvParser must be exported');
  assert.ok(CsvSerializer, 'CsvSerializer must be exported');
  assert.ok(SearchEngine, 'SearchEngine must be exported');
  assert.ok(ValidationEngine, 'ValidationEngine must be exported');
  assert.ok(EventBus, 'EventBus must be exported');
  console.log('   ✓ All core modules imported without ReferenceError.');

  // 3. Operational Smoke Tests
  console.log('3. Running Core Subsystem Operations...');

  // A. Dataframe
  const df = new Dataframe([['A', 'B'], ['1', '2']]);
  assert.equal(df.width, 2);
  assert.equal(df.height, 2);
  df.set(0, 0, 'ALPHA');
  assert.equal(df.get(0, 0), 'ALPHA');
  console.log('   ✓ Dataframe operations passed.');

  // B. HistoryManager & Atomic Transactions
  const history = new HistoryManager();
  history.beginTransaction('Composite batch');
  history.execute(new EditCellCommand(0, 0, 'ALPHA', 'BETA'), df);
  history.execute(new EditCellCommand(1, 1, '2', '200'), df);
  history.commitTransaction();

  assert.equal(history.undoCount, 1, 'Transaction must produce exactly 1 undo step');
  assert.equal(df.get(0, 0), 'BETA');
  assert.equal(df.get(1, 1), '200');

  // Undo composite step
  history.undo(df);
  assert.equal(df.get(0, 0), 'ALPHA', 'Undo must restore initial cell 0,0');
  assert.equal(df.get(1, 1), '2', 'Undo must restore initial cell 1,1');

  // Redo composite step
  history.redo(df);
  assert.equal(df.get(0, 0), 'BETA', 'Redo must reapply cell 0,0');
  assert.equal(df.get(1, 1), '200', 'Redo must reapply cell 1,1');

  // Rollback test
  history.beginTransaction('Failed batch');
  history.execute(new EditCellCommand(0, 0, 'BETA', 'BAD'), df);
  history.rollbackTransaction(df);
  assert.equal(df.get(0, 0), 'BETA', 'Rollback must discard partial mutation');
  assert.equal(history.undoCount, 1, 'Undo count must not include rolled back transaction');
  console.log('   ✓ HistoryManager explicit transactions (commit & rollback) passed.');

  // C. CSV Parser & Serializer
  const parser = new CsvParser();
  const serializer = new CsvSerializer();
  const parsed = parser.parse('col1,"col,2"\nval1,val2');
  assert.deepEqual(parsed, [['col1', 'col,2'], ['val1', 'val2']]);
  const serialized = serializer.serialize(parsed);
  assert.ok(serialized.includes('"col,2"'));
  console.log('   ✓ CSV Parser and Serializer passed.');

  // D. Search Engine
  const search = new SearchEngine();
  const matches = search.find(df, { term: '200', caseSensitive: false, useRegex: false, matchWholeCell: true });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].x, 1);
  assert.equal(matches[0].y, 1);
  console.log('   ✓ SearchEngine passed.');

  // E. Validation Engine
  const valEngine = new ValidationEngine();
  const proposals = valEngine.validateHeaders(df);
  assert.ok(Array.isArray(proposals));
  console.log('   ✓ ValidationEngine passed.');

  // F. EventBus
  const bus = new EventBus();
  let dispatched = false;
  bus.on('test:event', () => { dispatched = true; });
  bus.emit('test:event', {});
  assert.equal(dispatched, true);
  console.log('   ✓ EventBus passed.');

  console.log('------------------------------------------------------------');
  console.log('ALL HEADLESS VERIFICATION CHECKS PASSED CLEANLY (100% OK)');
  console.log('------------------------------------------------------------');
  return true;
}

// Auto-run only if executed directly via Node CLI (node tests/verify_headless.mjs)
import { fileURLToPath } from 'url';
import { resolve } from 'path';

let isMainScript = false;
try {
  if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
    const entryPath = resolve(process.argv[1]);
    const modulePath = fileURLToPath(import.meta.url);
    isMainScript = entryPath.toLowerCase() === modulePath.toLowerCase();
  }
} catch {
  isMainScript = false;
}

if (isMainScript) {
  runVerifyHeadless().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
}
