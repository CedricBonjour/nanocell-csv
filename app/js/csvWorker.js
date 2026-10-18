import { CsvParser, SeparatorDetector, EncodingDetector } from '../core/Csv.js';

const CHUNK_SIZE = 500 * 1000;
const FIRST_CHUNK_TARGET = 100;
const STREAM_BATCH_ROWS = 2000;
let currentAbort = false;

function postWorkerMessage(message) {
  (typeof self !== 'undefined' ? self : globalThis).postMessage?.(message);
}

async function readSliceBytes(slice) {
  if (typeof slice?.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  if (typeof slice?.text === 'function') {
    return new TextEncoder().encode(await slice.text());
  }
  return new Uint8Array(0);
}

async function loadCsv(data, postFn = postWorkerMessage) {
  if (data.viewOnly) return loadCsvViewOnly(data, postFn);
  const { file, readId, trimUnquoted, commentChar = '', escapeChar = '"' } = data;
  const fileSize = file?.size || 0;

  if (!file || fileSize === 0) {
    postFn({
      cmd: 'chunk_loaded', readId, status: 1.0, chunk: [[]], chunkId: 1,
      isFirstChunk: true, isComplete: true, viewOnly: false, sep: ',', encoding: 'utf-8', rowCount: 0
    });
    return;
  }

  let offset = 0, iteration = 0, sep = ',', sepDetected = false;
  let encoding = 'utf-8', decoder = null;
  let totalRowsEmitted = 0, firstChunkEmitted = false, completionEmitted = false;
  let pendingRows = [], pendingOffset = 0, parser = null;

  const emitChunk = (rows, isFirst, isComplete, currentStatus) => {
    iteration++;
    totalRowsEmitted += rows.length;
    if (isComplete) completionEmitted = true;
    postFn({
      cmd: 'chunk_loaded', readId, status: isComplete ? 1.0 : currentStatus,
      chunk: rows, chunkId: iteration, isFirstChunk: isFirst,
      isComplete, viewOnly: false, sep, encoding, rowCount: totalRowsEmitted
    });
  };

  while (offset < fileSize && !currentAbort) {
    const nextSize = Math.min(CHUNK_SIZE, fileSize - offset);
    const slice = file.slice(offset, offset + nextSize);
    offset += nextSize;
    const isFileReadComplete = offset >= fileSize;

    const bytes = await readSliceBytes(slice);
    if (currentAbort) return;
    if (!decoder && bytes.length > 0) {
      encoding = EncodingDetector.detect(bytes);
      decoder = new TextDecoder(encoding, { fatal: false });
    }
    const rawText = (decoder || new TextDecoder('utf-8', { fatal: false })).decode(bytes, { stream: !isFileReadComplete });

    if (!sepDetected && rawText.length > 0) {
      sep = SeparatorDetector.detect(rawText);
      sepDetected = true;
      if (parser) parser = new CsvParser({ delimiter: sep, trimUnquotedWhitespace: Boolean(trimUnquoted), commentChar, escapeChar, encoding });
    }
    parser ||= new CsvParser({ delimiter: sep, trimUnquotedWhitespace: Boolean(trimUnquoted), commentChar, escapeChar, encoding });

    const parsedRows = parser.parseChunk(rawText, isFileReadComplete);
    for (let r = 0; r < parsedRows.length; r++) pendingRows.push(parsedRows[r]);

    const currentStatus = Math.min(1.0, offset / fileSize);

    if (!firstChunkEmitted) {
      const available = pendingRows.length - pendingOffset;
      if (available >= FIRST_CHUNK_TARGET || isFileReadComplete) {
        const chunkSize = (!isFileReadComplete && available > FIRST_CHUNK_TARGET) ? FIRST_CHUNK_TARGET : available;
        const firstChunkRows = pendingRows.slice(pendingOffset, pendingOffset + chunkSize);
        pendingOffset += chunkSize;
        firstChunkEmitted = true;
        const outRows = (firstChunkRows.length === 0 && isFileReadComplete) ? [[]] : firstChunkRows;
        emitChunk(outRows, true, isFileReadComplete && pendingOffset >= pendingRows.length, currentStatus);
      }
    }

    while (firstChunkEmitted && (pendingRows.length - pendingOffset >= STREAM_BATCH_ROWS || (isFileReadComplete && pendingRows.length > pendingOffset))) {
      const remaining = pendingRows.length - pendingOffset;
      const chunkSize = isFileReadComplete ? remaining : STREAM_BATCH_ROWS;
      const chunkRows = pendingRows.slice(pendingOffset, pendingOffset + chunkSize);
      pendingOffset += chunkSize;
      emitChunk(chunkRows, false, isFileReadComplete && pendingOffset >= pendingRows.length, currentStatus);
    }

    if (isFileReadComplete && !completionEmitted) {
      emitChunk([], !firstChunkEmitted, true, 1.0);
      firstChunkEmitted = true;
    }

    if (pendingOffset >= pendingRows.length) {
      pendingRows = [];
      pendingOffset = 0;
    } else if (pendingOffset > 10000) {
      pendingRows = pendingRows.slice(pendingOffset);
      pendingOffset = 0;
    }
  }
}

async function loadCsvViewOnly(data, postFn = postWorkerMessage) {
  const { file, readId, previewChunks = 1, previewRows = 100, trimUnquoted, commentChar = '', escapeChar = '"' } = data;
  const fileSize = file?.size || 0;
  let sep = ',', encoding = 'utf-8';

  if (!file || fileSize === 0) {
    postFn({
      cmd: 'chunk_loaded', readId, status: 1.0, chunk: [[]], chunkId: 1,
      isFirstChunk: true, isComplete: true, viewOnly: true, sep, encoding, rowCount: 0
    });
    return;
  }

  const totalChunks = Math.max(1, Math.floor(Number(previewChunks) || 1));
  const rowsPerChunk = Math.max(1, Math.floor(Number(previewRows) || 100));

  for (let iteration = 1; iteration <= totalChunks && !currentAbort; iteration++) {
    let startOffset = iteration === 1
      ? 0
      : (iteration === totalChunks
        ? Math.max(0, fileSize - CHUNK_SIZE)
        : Math.floor((iteration - 1) * (fileSize / totalChunks)));

    if (iteration > 1 && (encoding === 'utf-16le' || encoding === 'utf-16be')) {
      startOffset -= startOffset % 2;
    }

    const endOffset = iteration === totalChunks ? fileSize : Math.min(fileSize, startOffset + CHUNK_SIZE);
    const slice = file.slice(startOffset, endOffset);
    const bytes = await readSliceBytes(slice);
    if (currentAbort) return;

    if (iteration === 1 && bytes.length > 0) {
      encoding = EncodingDetector.detect(bytes);
    }
    let result = new TextDecoder(encoding, { fatal: false }).decode(bytes);

    if (iteration === 1) {
      sep = SeparatorDetector.detect(result);
    } else if (startOffset > 0) {
      const lfIdx = result.indexOf('\n');
      const crIdx = result.indexOf('\r');
      let cutIdx = -1;
      if (lfIdx !== -1 && crIdx !== -1) {
        cutIdx = crIdx + 1 === lfIdx ? lfIdx : Math.min(lfIdx, crIdx);
      } else {
        cutIdx = lfIdx !== -1 ? lfIdx : crIdx;
      }
      if (cutIdx !== -1 && cutIdx < result.length - 1) result = result.slice(cutIdx + 1);
    }

    let matrix = result
      ? new CsvParser({ delimiter: sep, trimUnquotedWhitespace: Boolean(trimUnquoted), commentChar, escapeChar, encoding }).parseChunk(result, true)
      : [];
    matrix = iteration === 1
      ? matrix.slice(0, rowsPerChunk)
      : (iteration === totalChunks ? matrix.slice(-rowsPerChunk) : matrix.slice(1, rowsPerChunk + 1));

    if (iteration === 1 && matrix.length === 0) {
      matrix = [[]];
    } else if (iteration !== 1) {
      matrix.unshift(new Array(matrix[0]?.length || 1).fill('! [...] !'));
    }

    postFn({
      cmd: 'chunk_loaded', readId, status: iteration / totalChunks,
      chunk: matrix, chunkId: iteration, isFirstChunk: iteration === 1,
      isComplete: iteration === totalChunks, viewOnly: true, sep, encoding, rowCount: 0
    });
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event) => {
    const cmd = event.data?.cmd;
    if (cmd === 'read') {
      currentAbort = false;
      loadCsv(event.data.data);
    } else if (cmd === 'abort' || cmd === 'cancel') {
      currentAbort = true;
    }
  });
}

export { loadCsv, loadCsvViewOnly };
export default class CsvWorkerFallback {}
