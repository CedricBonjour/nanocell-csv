/**
 * Standalone Pure Node.js Tier 5 Adversarial Stress Verification Script
 *
 * Usage: node tests/verify_m6_adversarial.mjs
 * Exit code 0: SUCCESS (All empirical stress tests passed within budgets)
 * Exit code 1: FAILURE (Assertion failed or budget exceeded)
 */

import { strict as assert } from 'assert';
import { performance } from 'perf_hooks';

export async function runVerifyM6Adversarial() {
  console.log('============================================================');
  console.log('Nanocell-CSV: Tier 5 Adversarial Empirical Stress Harness');
  console.log('============================================================\n');

  // Load modules via headless Vite SSR loader
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const core = await server.ssrLoadModule('./core/index.ts');
  const Dataframe = core.Dataframe;
  const HistoryManager = core.HistoryManager;
  const EditCellCommand = core.EditCellCommand;
  const CsvParser = core.CsvParser;
  const CsvSerializer = core.CsvSerializer;
  const SeparatorDetector = core.SeparatorDetector;

  // Single source of truth: Dataframe directly from core
  const AppDataframe = Dataframe;

  const csvWorkerModule = await server.ssrLoadModule('./app/js/csv_worker.js');
  const csv_parse = csvWorkerModule.csv_parse;

  await server.close();

  // -------------------------------------------------------------------------
  // 1. Tabular Matrix & Geometry Stress
  // -------------------------------------------------------------------------
  console.log('--- 1. STRESS TESTING TABULAR MATRIX & GEOMETRY ---');

  // 1.1 Extreme aspect ratio: 10,000 rows x 1 column
  {
    const t0 = performance.now();
    const rows10k = Array.from({ length: 10000 }, (_, i) => [`r_${i}`]);
    const df = new Dataframe(rows10k);
    const createTime = performance.now() - t0;

    assert.equal(df.height, 10000, 'Height must be 10000');
    assert.equal(df.width, 1, 'Width must be 1');
    assert.equal(df.get(0, 0), 'r_0');
    assert.equal(df.get(0, 9999), 'r_9999');
    assert.equal(df.get(0, 10000), '', 'Out of bounds height must return empty string');
    assert.equal(df.get(1, 0), '', 'Out of bounds width must return empty string');
    assert.equal(df.get(-1, 0), '', 'Negative coordinate must return empty string');

    // Structural mutations
    df.insertRow(5000, ['r_mid_inserted']);
    assert.equal(df.height, 10001);
    assert.equal(df.get(0, 5000), 'r_mid_inserted');
    assert.equal(df.get(0, 5001), 'r_5000');

    const deleted = df.deleteRow(5000);
    assert.deepEqual(deleted, ['r_mid_inserted']);
    assert.equal(df.height, 10000);
    assert.equal(df.get(0, 5000), 'r_5000');

    df.pushCol(['c2']);
    assert.equal(df.width, 2);
    df.deleteCol(1);
    assert.equal(df.width, 1);

    console.log(`   ✓ 10,000 x 1 aspect ratio verified (created & mutated in ${createTime.toFixed(2)}ms)`);
  }

  // 1.2 Extreme aspect ratio: 1 row x 10,000 columns
  {
    const t0 = performance.now();
    const cols10k = [Array.from({ length: 10000 }, (_, i) => `c_${i}`)];
    const df = new Dataframe(cols10k);
    const createTime = performance.now() - t0;

    assert.equal(df.height, 1, 'Height must be 1');
    assert.equal(df.width, 10000, 'Width must be 10000');
    assert.equal(df.get(0, 0), 'c_0');
    assert.equal(df.get(9999, 0), 'c_9999');
    assert.equal(df.get(10000, 0), '', 'Out of bounds width must return empty string');
    assert.equal(df.get(0, 1), '', 'Out of bounds height must return empty string');
    assert.equal(df.get(0, -1), '', 'Negative coordinate must return empty string');

    // Structural mutations
    df.insertCol(5000, ['c_mid_inserted']);
    assert.equal(df.width, 10001);
    assert.equal(df.get(5000, 0), 'c_mid_inserted');
    assert.equal(df.get(5001, 0), 'c_5000');

    const deleted = df.deleteCol(5000);
    assert.deepEqual(deleted, ['c_mid_inserted']);
    assert.equal(df.width, 10000);
    assert.equal(df.get(5000, 0), 'c_5000');

    df.pushRow(['r2']);
    assert.equal(df.height, 2);
    df.deleteRow(1);
    assert.equal(df.height, 1);

    console.log(`   ✓ 1 x 10,000 aspect ratio verified (created & mutated in ${createTime.toFixed(2)}ms)`);
  }

  // 1.3 Out-of-bounds operations at boundary coordinates (0, -1, max+1)
  {
    const df = new Dataframe([['A', 'B'], ['C', 'D']]);

    // Boundary 0
    df.insertRow(0, ['X0', 'Y0']);
    assert.equal(df.height, 3);
    assert.deepEqual(df.getRow(0), ['X0', 'Y0']);
    df.deleteRow(0);
    assert.equal(df.height, 2);
    assert.deepEqual(df.getRow(0), ['A', 'B']);

    df.insertCol(0, ['C0_0', 'C0_1']);
    assert.equal(df.width, 3);
    assert.equal(df.get(0, 0), 'C0_0');
    df.deleteCol(0);
    assert.equal(df.width, 2);
    assert.equal(df.get(0, 0), 'A');

    // Negative boundary (-1)
    df.insertRow(-1, ['ERR', 'ERR']);
    assert.equal(df.height, 2, 'Negative insertRow must be rejected');
    assert.deepEqual(df.deleteRow(-1), [], 'Negative deleteRow must return empty');
    assert.equal(df.height, 2);

    df.insertCol(-1, ['ERR', 'ERR']);
    assert.equal(df.width, 2, 'Negative insertCol must be rejected');
    assert.deepEqual(df.deleteCol(-1), [], 'Negative deleteCol must return empty');
    assert.equal(df.width, 2);

    assert.equal(df.get(-1, -1), '', 'Negative get must return empty string');
    assert.equal(df.set(-1, -1, 'X'), false, 'Negative set must return false');

    // Facade AppDataframe negative boundary checks
    const facadeBoundaryDf = new AppDataframe([['A', 'B'], ['C', 'D']]);
    facadeBoundaryDf.insertRow(-1);
    assert.equal(facadeBoundaryDf.height, 2, 'Negative insertRow on AppDataframe must be rejected');
    facadeBoundaryDf.insertCol(-1);
    assert.equal(facadeBoundaryDf.width, 2, 'Negative insertCol on AppDataframe must be rejected');

    // Max + 1 boundary
    df.insertRow(df.height + 1);
    assert.equal(df.height, 2, 'Max+1 insertRow must be rejected');
    assert.deepEqual(df.deleteRow(df.height), [], 'Max deleteRow must return empty');
    assert.equal(df.height, 2);

    df.insertCol(df.width + 1);
    assert.equal(df.width, 2, 'Max+1 insertCol must be rejected');
    assert.deepEqual(df.deleteCol(df.width), [], 'Max deleteCol must return empty');
    assert.equal(df.width, 2);

    // Minimum 1x1 boundary constraint
    const single = new Dataframe([['SOLO']]);
    assert.deepEqual(single.deleteRow(0), [], 'Cannot delete row on 1x1');
    assert.deepEqual(single.deleteCol(0), [], 'Cannot delete col on 1x1');
    assert.equal(single.height, 1);
    assert.equal(single.width, 1);
    assert.equal(single.get(0, 0), 'SOLO');

    console.log('   ✓ Out-of-bounds boundary operations (0, -1, max+1, 1x1 floor) verified');
  }

  // 1.4 Ragged rows and sparse tabular datasets
  {
    const ragged = [
      ['R1'],
      ['R2_0', 'R2_1', 'R2_2'],
      ['R3_0', 'R3_1'],
      ['R4_0', 'R4_1', 'R4_2', 'R4_3', 'R4_4'],
      []
    ];
    const df = new Dataframe(ragged);
    assert.equal(df.height, 5);
    assert.equal(df.width, 5);
    for (let y = 0; y < df.height; y++) {
      assert.equal(df.getRow(y).length, 5, `Row ${y} must have width 5`);
    }
    assert.equal(df.get(4, 0), '');
    assert.equal(df.get(4, 3), 'R4_4');

    // Sparse matrix capacity expansion
    const sparse = new Dataframe([['ORIG']]);
    sparse.set(30, 30, 'SPARSE_CELL');
    assert.equal(sparse.width, 31);
    assert.equal(sparse.height, 31);
    assert.equal(sparse.get(30, 30), 'SPARSE_CELL');
    assert.equal(sparse.get(0, 0), 'ORIG');
    assert.equal(sparse.get(15, 15), '');

    // trimAll
    const toTrim = new Dataframe([
      ['KEEP', '', ''],
      ['', '', '']
    ]);
    toTrim.trimAll();
    assert.equal(toTrim.width, 1);
    assert.equal(toTrim.height, 1);
    assert.equal(toTrim.get(0, 0), 'KEEP');

    console.log('   ✓ Ragged rows, rectangular invariant, and sparse expansion verified\n');
  }

  // -------------------------------------------------------------------------
  // 2. Transaction Manager & History Stress
  // -------------------------------------------------------------------------
  console.log('--- 2. STRESS TESTING TRANSACTION MANAGER & HISTORY ---');

  // 2.1 Deep undo/redo thrashing (500 rapid interleaved operations with Oracle)
  {
    const history = new HistoryManager();
    const model = new Dataframe([
      ['0', '0', '0'],
      ['0', '0', '0'],
      ['0', '0', '0']
    ]);

    const oracleGrid = [
      ['0', '0', '0'],
      ['0', '0', '0'],
      ['0', '0', '0']
    ];
    const oracleUndoStack = [];
    const oracleRedoStack = [];

    let seed = 42;
    function nextRandom() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    const t0 = performance.now();
    for (let step = 0; step < 500; step++) {
      const actionType = nextRandom();

      if (actionType < 0.6 || (oracleUndoStack.length === 0 && oracleRedoStack.length === 0)) {
        // Edit (60%)
        const x = Math.floor(nextRandom() * 3);
        const y = Math.floor(nextRandom() * 3);
        const oldVal = oracleGrid[y][x];
        const newVal = `val_${step}`;

        // Ensure non-coalescing timestamps (> 500ms apart)
        const cmd = new EditCellCommand(x, y, oldVal, newVal, `step ${step}`, step * 1000);
        history.execute(cmd, model);

        oracleGrid[y][x] = newVal;
        oracleUndoStack.push({ x, y, oldVal, newVal });
        oracleRedoStack.length = 0; // Invalidate redo stack
      } else if (actionType < 0.8) {
        // Undo (20%)
        if (oracleUndoStack.length > 0) {
          const popped = oracleUndoStack.pop();
          oracleGrid[popped.y][popped.x] = popped.oldVal;
          oracleRedoStack.push(popped);

          const ok = history.undo(model);
          assert.equal(ok, true, 'Undo must succeed');
        }
      } else {
        // Redo (20%)
        if (oracleRedoStack.length > 0) {
          const popped = oracleRedoStack.pop();
          oracleGrid[popped.y][popped.x] = popped.newVal;
          oracleUndoStack.push(popped);

          const ok = history.redo(model);
          assert.equal(ok, true, 'Redo must succeed');
        }
      }

      // Assert model strictly matches oracle at every step
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          assert.equal(
            model.get(x, y),
            oracleGrid[y][x],
            `Step ${step}: mismatch at (${x}, ${y})`
          );
        }
      }
      assert.equal(history.undoCount, oracleUndoStack.length);
      assert.equal(history.redoCount, oracleRedoStack.length);
    }
    const thrashDuration = performance.now() - t0;

    // Full unroll of undo stack to initial state
    while (oracleUndoStack.length > 0) {
      const popped = oracleUndoStack.pop();
      oracleGrid[popped.y][popped.x] = popped.oldVal;
      oracleRedoStack.push(popped);
      history.undo(model);
    }
    assert.equal(history.undoCount, 0);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        assert.equal(model.get(x, y), '0', `Initial unroll mismatch at (${x}, ${y})`);
      }
    }

    // Full re-roll of redo stack to final state
    while (oracleRedoStack.length > 0) {
      const popped = oracleRedoStack.pop();
      oracleGrid[popped.y][popped.x] = popped.newVal;
      oracleUndoStack.push(popped);
      history.redo(model);
    }
    assert.equal(history.redoCount, 0);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        assert.equal(model.get(x, y), oracleGrid[y][x], `Final re-roll mismatch at (${x}, ${y})`);
      }
    }

    console.log(`   ✓ 500 rapid interleaved operations + full rollback/rollforward verified in ${thrashDuration.toFixed(2)}ms`);
  }

  // 2.2 Redo stack eviction verification
  {
    const history = new HistoryManager();
    const model = new Dataframe([['BASE']]);

    ['A', 'B', 'C', 'D', 'E'].forEach((v, i) => {
      const oldV = i === 0 ? 'BASE' : ['A', 'B', 'C', 'D'][i - 1];
      history.execute(new EditCellCommand(0, 0, oldV, v, `edit ${v}`, i * 1000), model);
    });

    assert.equal(model.get(0, 0), 'E');
    assert.equal(history.undoCount, 5);
    assert.equal(history.redoCount, 0);

    // Undo 3 steps back to B
    history.undo(model); // reverts to D
    history.undo(model); // reverts to C
    history.undo(model); // reverts to B

    assert.equal(model.get(0, 0), 'B');
    assert.equal(history.undoCount, 2);
    assert.equal(history.redoCount, 3);
    assert.equal(history.canRedo, true);

    // Apply mid-history branch edit
    history.execute(new EditCellCommand(0, 0, 'B', 'BRANCH_Z', 'branch edit', 50000), model);

    assert.equal(model.get(0, 0), 'BRANCH_Z');
    assert.equal(history.undoCount, 3);
    assert.equal(history.redoCount, 0, 'Redo stack MUST be completely cleared');
    assert.equal(history.canRedo, false);
    assert.equal(history.redo(model), false, 'Redo must return false on evicted stack');

    // Undo reverts back to B
    history.undo(model);
    assert.equal(model.get(0, 0), 'B');

    // Dataframe redo stack eviction verification
    const facadeDf = new AppDataframe([['INIT']]);
    facadeDf.create({ type: 'EDIT_CELL', timestamp: 1000, payload: { x: 0, y: 0, oldValue: 'INIT', newValue: 'F1' } });
    facadeDf.create({ type: 'EDIT_CELL', timestamp: 1200, payload: { x: 0, y: 0, oldValue: 'F1', newValue: 'F2' } });
    facadeDf.create({ type: 'EDIT_CELL', timestamp: 1400, payload: { x: 0, y: 0, oldValue: 'F2', newValue: 'F3' } });
    assert.equal(facadeDf.undoStack.length, 3);

    facadeDf.undo();
    assert.equal(facadeDf.get(0, 0), 'F2');
    assert.equal(facadeDf.redoStack.length, 1);

    facadeDf.edit(0, 0, 'F_BRANCH');
    assert.equal(facadeDf.redoStack.length, 0, 'Facade redoStack must be evicted');
    assert.equal(facadeDf.get(0, 0), 'F_BRANCH');

    console.log('   ✓ Redo stack eviction upon mid-history mutation verified');
  }

  // 2.3 MS_DELTA (100ms) command grouping under simulated keystroke bursts
  {
    const df = new AppDataframe([['']]);

    // High-frequency burst: 6 simulated typing events with delta 25ms (< 100ms)
    const burstWords = ['T', 'Te', 'Tes', 'Test', 'Testi', 'Testing'];
    const t0 = 10000;
    burstWords.forEach((word, idx) => {
      df.create({
        type: 'EDIT_CELL',
        timestamp: t0 + idx * 25,
        payload: { x: 0, y: 0, oldValue: idx === 0 ? '' : burstWords[idx - 1], newValue: word }
      });
    });

    assert.equal(df.get(0, 0), 'Testing');
    assert.equal(df.undoStack.length, 6);

    // Single undo unrolls all 6 edits in one go
    df.undo();
    assert.equal(df.get(0, 0), '', 'Single undo must revert entire burst');
    assert.equal(df.undoStack.length, 0);
    assert.equal(df.redoStack.length, 6);

    // Single redo re-applies all 6 edits in forward order
    df.redo();
    assert.equal(df.get(0, 0), 'Testing', 'Single redo must reapply entire burst');
    assert.equal(df.undoStack.length, 6);
    assert.equal(df.redoStack.length, 0);

    // Distinct clusters separated by 250ms (> 100ms)
    df.undoStack.length = 0;
    df.redoStack.length = 0;
    df.data[0][0] = '';

    // Cluster 1
    ['A', 'AB', 'ABC'].forEach((w, i) => {
      df.create({
        type: 'EDIT_CELL',
        timestamp: 20000 + i * 20,
        payload: { x: 0, y: 0, oldValue: i === 0 ? '' : ['A', 'AB'][i - 1], newValue: w }
      });
    });

    // Cluster 2 (after 250ms gap)
    ['ABC ', 'ABC 1', 'ABC 12'].forEach((w, i) => {
      df.create({
        type: 'EDIT_CELL',
        timestamp: 20300 + i * 20,
        payload: { x: 0, y: 0, oldValue: i === 0 ? 'ABC' : ['ABC ', 'ABC 1'][i - 1], newValue: w }
      });
    });

    assert.equal(df.get(0, 0), 'ABC 12');
    assert.equal(df.undoStack.length, 6);

    // Undo Cluster 2
    df.undo();
    assert.equal(df.get(0, 0), 'ABC', 'First undo reverts Cluster 2');
    assert.equal(df.undoStack.length, 3);
    assert.equal(df.redoStack.length, 3);

    // Undo Cluster 1
    df.undo();
    assert.equal(df.get(0, 0), '', 'Second undo reverts Cluster 1');
    assert.equal(df.undoStack.length, 0);
    assert.equal(df.redoStack.length, 6);

    // Redo Cluster 1
    df.redo();
    assert.equal(df.get(0, 0), 'ABC', 'First redo re-applies Cluster 1');
    assert.equal(df.undoStack.length, 3);

    // Redo Cluster 2
    df.redo();
    assert.equal(df.get(0, 0), 'ABC 12', 'Second redo re-applies Cluster 2');
    assert.equal(df.undoStack.length, 6);
    assert.equal(df.redoStack.length, 0);

    console.log('   ✓ MS_DELTA (100ms) command grouping and cluster segmentation verified\n');
  }

  // -------------------------------------------------------------------------
  // 3. Streaming CSV & Delimiter Detection Stress
  // -------------------------------------------------------------------------
  console.log('--- 3. STRESS TESTING STREAMING CSV & DELIMITER DETECTION ---');

  // 3.1 RFC 4180 parsing with extreme inputs
  {
    const parser = new CsvParser();

    // Multi-byte UTF-8, French/Japanese, Quotes inside quotes
    const extremeCsv = [
      'ID,Lang,Greeting,Punctuation',
      '1,Français,"Bonjour, ça va ?","«été», «œuf»"',
      '2,日本語,"「こんにちは、世界！」","東京 (100%)"',
      '3,Emojis,"🚀 Rocket, 🎉 Party","🔥 ✨"',
      '4,Quotes,"He said: ""Nested """"triple"""" quote!""","Normal"'
    ].join('\n');

    const parsed = parser.parseAll(extremeCsv);
    assert.equal(parsed.length, 5);
    assert.equal(parsed[1][1], 'Français');
    assert.equal(parsed[1][2], 'Bonjour, ça va ?');
    assert.equal(parsed[2][1], '日本語');
    assert.equal(parsed[2][2], '「こんにちは、世界！」');
    assert.equal(parsed[3][2], '🚀 Rocket, 🎉 Party');
    assert.equal(parsed[4][2], 'He said: "Nested ""triple"" quote!"');

    // Empty trailing cells (with and without newline)
    const trailingNL = 'A,B,C,D\n1,2,,\n3,4,5,6\n';
    const parsedNL = parser.parseAll(trailingNL);
    assert.equal(parsedNL.length, 3);
    assert.deepEqual(parsedNL[1], ['1', '2', '', '']);

    const trailingNoNL = 'A,B,C,D\nX,Y,,';
    const parsedNoNL = parser.parseAll(trailingNoNL);
    assert.equal(parsedNoNL.length, 2);
    assert.deepEqual(parsedNoNL[1], ['X', 'Y', '', '']);

    // Mixed CRLF and LF line endings
    const mixed = 'c1,c2\r\nv1,v2\nv3,v4\rv5,v6\r\n';
    const parsedMixed = parser.parseAll(mixed);
    assert.equal(parsedMixed.length, 4);
    assert.deepEqual(parsedMixed[1], ['v1', 'v2']);
    assert.deepEqual(parsedMixed[2], ['v3', 'v4']);
    assert.deepEqual(parsedMixed[3], ['v5', 'v6']);

    // Uint8Array chunk streaming splitting UTF-8 bytes
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode('Name,City\n"Chloé","Paris 🇫🇷"');
    parser.reset();

    // Split in the middle of UTF-8 multi-byte sequence
    const c1 = rawBytes.slice(0, 15);
    const c2 = rawBytes.slice(15);
    const p1 = parser.parseChunk(c1, false);
    const p2 = parser.parseChunk(c2, true);
    const pAll = [...p1, ...p2];

    assert.equal(pAll.length, 2);
    assert.equal(pAll[1][0], 'Chloé');
    assert.equal(pAll[1][1], 'Paris 🇫🇷');

    console.log('   ✓ RFC 4180 parsing with extreme inputs (UTF-8, Japanese, French, quotes, trailing cells, mixed CRLF/LF) verified');
  }

  // 3.2 Delimiter auto-detection stress
  {
    assert.equal(SeparatorDetector.detect('a;b;c\n"1,2";"3,4";"5,6"'), ';');
    assert.equal(SeparatorDetector.detect('a\tb\tc\n"1;2"\t"3;4"\t"5;6"'), '\t');
    assert.equal(SeparatorDetector.detect('a|b|c\n1|2|3'), '|');
    assert.equal(SeparatorDetector.detect('a:b:c\n1:2:3'), ':');
    assert.equal(SeparatorDetector.detect(''), ',');
    assert.equal(SeparatorDetector.detect(null), ',');
    assert.equal(SeparatorDetector.detect('single_col\nanother_row'), ',');

    console.log('   ✓ Delimiter auto-detection across rare/masked separators verified');
  }

  // 3.3 High-throughput parsing performance budget: 1,000 rows x 10 cols < 100ms
  {
    const header = 'c0,c1,c2,c3,c4,c5,c6,c7,c8,c9';
    const lines = [header];
    for (let i = 0; i < 1000; i++) {
      lines.push(
        `r_${i}_0,r_${i}_1,"quoted_${i}_2, extra",r_${i}_3,r_${i}_4,` +
        `r_${i}_5,"nested ""${i}"" quote",r_${i}_7,r_${i}_8,r_${i}_9`
      );
    }
    const largeCsv = lines.join('\n');

    // 1. CsvParser.parseAll
    const parser = new CsvParser();
    const t0 = performance.now();
    const parsed = parser.parseAll(largeCsv);
    const durationParser = performance.now() - t0;

    assert.equal(parsed.length, 1001, 'Must parse exactly 1001 rows');
    assert.equal(parsed[0].length, 10, 'Must parse exactly 10 columns');
    assert.equal(parsed[500][2], 'quoted_499_2, extra');
    assert.equal(parsed[500][6], 'nested "499" quote');
    assert.ok(
      durationParser < 100,
      `Core parser duration (${durationParser.toFixed(2)}ms) must be strictly < 100ms`
    );

    // 2. Facade csv_parse
    const t1 = performance.now();
    const parsedFacade = csv_parse(largeCsv, ',');
    const durationFacade = performance.now() - t1;

    assert.equal(parsedFacade.length, 1001);
    assert.ok(
      durationFacade < 100,
      `Facade parser duration (${durationFacade.toFixed(2)}ms) must be strictly < 100ms`
    );

    // 3. CsvSerializer roundtrip
    const serializer = new CsvSerializer();
    const t2 = performance.now();
    const serialized = serializer.serialize(parsed);
    const durationSerial = performance.now() - t2;

    assert.ok(serialized.length > 0);
    assert.ok(
      durationSerial < 100,
      `Serializer duration (${durationSerial.toFixed(2)}ms) must be strictly < 100ms`
    );

    console.log(`   ✓ High-throughput 1,000 rows x 10 cols parsed in ${durationParser.toFixed(2)}ms (Facade: ${durationFacade.toFixed(2)}ms, Serializer: ${durationSerial.toFixed(2)}ms, ALL < 100ms budget)\n`);
  }

  console.log('============================================================');
  console.log('ALL TIER 5 ADVERSARIAL STRESS TESTS PASSED (100% EMPIRICAL OK)');
  console.log('============================================================');
  return true;
}

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
  runVerifyM6Adversarial().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
}
