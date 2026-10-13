const CHUNK_SIZE = 500 * 1000; // = 500ko

let currentAbort = false;

import { CsvParser } from '../../../core/csv/CsvParser.js';
import { SeparatorDetector } from '../../../core/csv/SeparatorDetector.js';

function csv_parse(s, d = ",", trimUnquoted = false, commentChar = '', escapeChar = '"') {
  if (!s || s.length === 0) return [];
  const parser = new CsvParser({
    delimiter: d,
    trimUnquotedWhitespace: trimUnquoted,
    commentChar: commentChar,
    escapeChar: escapeChar
  });
  return parser.parseChunk(s, true);
}

function postWorkerMessage(msg) {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage(msg);
  } else if (typeof globalThis !== 'undefined' && typeof globalThis.postMessage === 'function') {
    globalThis.postMessage(msg);
  }
}

function loadcsv(data) {
  if (data.viewOnly) return load_csv_view_only(data);
  let file = data.file;
  let fileSize = file ? file.size : 0;
  const trimUnquoted = Boolean(data.trimUnquoted);
  const commentChar = data.commentChar || '';
  const escapeChar = data.escapeChar || '"';
  console.log("worker loading : ", file ? file.name : "unknown", "size:", fileSize);

  if (!file || fileSize === 0) {
    postWorkerMessage({
      cmd: "chunk_loaded",
      status: 1.0,
      chunk: [[]],
      chunk_id: 1,
      isFirstChunk: true,
      isComplete: true,
      viewOnly: false,
      sep: ',',
      rowCount: 0
    });
    return;
  }

  let offset = 0;
  let iteration = 0;
  let sep = ',';
  let sepDetected = false;
  let totalRowsEmitted = 0;
  let firstChunkEmitted = false;
  const FIRST_CHUNK_TARGET = 100;
  let pendingRows = [];
  let pendingOffset = 0;
  let parser = null;

  const textDecoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder("utf-8", { fatal: false }) : null;
  const reader = new FileReader();

  reader.onloadend = e => {
    if (currentAbort) return;
    const isFileReadComplete = (offset >= fileSize);
    let rawText = "";
    if (textDecoder && e.target.result instanceof ArrayBuffer) {
      rawText = textDecoder.decode(e.target.result, { stream: !isFileReadComplete });
    } else {
      rawText = e.target.result || "";
    }

    if (!sepDetected && rawText.length > 0) {
      sep = SeparatorDetector.detect(rawText);
      sepDetected = true;
      parser = new CsvParser({ delimiter: sep, trimUnquotedWhitespace: trimUnquoted, commentChar: commentChar, escapeChar: escapeChar });
    } else if (!parser) {
      parser = new CsvParser({ delimiter: sep, trimUnquotedWhitespace: trimUnquoted, commentChar: commentChar, escapeChar: escapeChar });
    }

    const parsedRows = parser.parseChunk(rawText, isFileReadComplete);
    for (let r = 0; r < parsedRows.length; r++) {
      pendingRows.push(parsedRows[r]);
    }

    let currentStatus = Math.min(1.0, offset / fileSize);

    if (!firstChunkEmitted) {
      const available = pendingRows.length - pendingOffset;
      if (available >= FIRST_CHUNK_TARGET || isFileReadComplete) {
        const chunkSize = (!isFileReadComplete && available > FIRST_CHUNK_TARGET) ? FIRST_CHUNK_TARGET : available;
        const firstChunkRows = pendingRows.slice(pendingOffset, pendingOffset + chunkSize);
        pendingOffset += chunkSize;

        iteration++;
        totalRowsEmitted += firstChunkRows.length;
        firstChunkEmitted = true;
        const isComplete = isFileReadComplete && pendingOffset >= pendingRows.length;

        postWorkerMessage({
          cmd: "chunk_loaded",
          status: isComplete ? 1.0 : currentStatus,
          chunk: firstChunkRows,
          chunk_id: iteration,
          isFirstChunk: true,
          isComplete: isComplete,
          viewOnly: false,
          sep: sep,
          rowCount: totalRowsEmitted
        });
      }
    }

    while (firstChunkEmitted && (pendingRows.length - pendingOffset >= 2000 || (isFileReadComplete && pendingRows.length > pendingOffset))) {
      const remaining = pendingRows.length - pendingOffset;
      const chunkSize = isFileReadComplete ? remaining : 2000;
      const chunkRows = pendingRows.slice(pendingOffset, pendingOffset + chunkSize);
      pendingOffset += chunkSize;

      iteration++;
      totalRowsEmitted += chunkRows.length;
      const isComplete = isFileReadComplete && pendingOffset >= pendingRows.length;

      postWorkerMessage({
        cmd: "chunk_loaded",
        status: isComplete ? 1.0 : currentStatus,
        chunk: chunkRows,
        chunk_id: iteration,
        isFirstChunk: false,
        isComplete: isComplete,
        viewOnly: false,
        sep: sep,
        rowCount: totalRowsEmitted
      });
    }

    if (pendingOffset >= pendingRows.length) {
      pendingRows = [];
      pendingOffset = 0;
    } else if (pendingOffset > 10000) {
      pendingRows = pendingRows.slice(pendingOffset);
      pendingOffset = 0;
    }

    if (offset < fileSize && !currentAbort) {
      seek();
    }
  };

  function seek() {
    if (currentAbort) return;
    if (offset >= fileSize && iteration > 0 && pendingRows.length === 0) return;
    let nextSize = Math.min(CHUNK_SIZE, fileSize - offset);
    let chunkBlob = file.slice(offset, offset + nextSize);
    offset += nextSize;

    if (textDecoder) {
      reader.readAsArrayBuffer(chunkBlob);
    } else {
      reader.readAsText(chunkBlob, "utf-8");
    }
  }

  seek();
}

function load_csv_view_only(data) {
  let file = data.file;
  console.log("reading chunk size : ", CHUNK_SIZE);
  console.log("worker loading view only : ", file ? file.name : "unknown");
  let fileSize = file ? file.size : 0;
  let sep = ',';
  let reader = new FileReader();
  let iteration = 0;
  let vo_n_chunks = data.n_chunks || 1;
  let vo_n_rows = data.n_rows || 100;
  let lastIteration = vo_n_chunks;
  const trimUnquoted = Boolean(data.trimUnquoted);
  const commentChar = data.commentChar || '';
  const escapeChar = data.escapeChar || '"';

  reader.onloadend = e => {
    if (currentAbort) return;
    let result = e.target.result || "";
    let status = iteration / vo_n_chunks;
    if (iteration === 1) {
      sep = SeparatorDetector.detect(result);
    } else {
      const firstNl = result.indexOf('\n');
      if (firstNl !== -1 && firstNl < result.length - 1) {
        result = result.slice(firstNl + 1);
      }
    }
    let matrix = csv_parse(result, sep, trimUnquoted, commentChar, escapeChar);
    if (iteration === 1) {
      matrix = matrix.slice(0, vo_n_rows);
    } else if (iteration === lastIteration) {
      matrix = matrix.slice(-vo_n_rows);
    } else {
      matrix = matrix.slice(1, vo_n_rows + 1);
    }

    if (iteration !== 1) {
      const colCount = (matrix.length > 0 && matrix[0]) ? matrix[0].length : 1;
      const ellipsisRow = [];
      for (let i = 0; i < colCount; i++) ellipsisRow.push("! [...] !");
      matrix.unshift(ellipsisRow);
    }

    postWorkerMessage({
      cmd: "chunk_loaded",
      status: status,
      chunk: matrix,
      chunk_id: iteration,
      isFirstChunk: iteration === 1,
      isComplete: iteration === lastIteration,
      viewOnly: true,
      sep: sep,
      rowCount: 0
    });
    if (iteration < lastIteration && !currentAbort) seek();
  };

  function seek() {
    if (currentAbort) return;
    iteration++;
    let offset = (iteration - 1) * (fileSize / vo_n_chunks);
    if (iteration === lastIteration) {
      let startOffset = Math.max(0, fileSize - CHUNK_SIZE);
      reader.readAsText(file.slice(startOffset, fileSize), "utf-8");
    } else {
      reader.readAsText(file.slice(offset, Math.min(fileSize, offset + CHUNK_SIZE)), "utf-8");
    }
  }

  seek();
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener("message", e => {
    if (!e.data) return;
    switch (e.data.cmd) {
      case "read":
        currentAbort = false;
        loadcsv(e.data.data);
        break;
      case "abort":
      case "cancel":
        currentAbort = true;
        break;
    }
  });
}

export { csv_parse, loadcsv, load_csv_view_only };
