const CHUNK_SIZE = 500 * 1000; // = 500ko
const n_chars_for_separator_detection = 500;

let currentAbort = false;

function separatorDetection(txt) {
  if (!txt || typeof txt !== 'string') return ',';
  if (txt.length > n_chars_for_separator_detection) {
    txt = txt.substring(0, n_chars_for_separator_detection);
  }
  const d = [',', '\t', ';', ':', '|'];
  const n = [0, 0, 0, 0, 0];
  let inQuotes = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '"') {
      if (inQuotes && i + 1 < txt.length && txt[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      for (let j = 0; j < d.length; j++) {
        if (c === d[j]) n[j]++;
      }
    }
  }
  const maxCount = Math.max(...n);
  if (maxCount === 0) return ',';
  return d[n.indexOf(maxCount)];
}

function csv_parse(s, d = ",") {
  if (!s || s.length === 0) return [];
  const rows = [];
  const lr = '\n';
  let v = [];
  const q = '"';
  let f = false;
  const len = s.length;
  let c, j;
  for (let i = 0; i < len; i++) {
    c = s[i];
    if (c === ' ') continue;
    if (c === d) {
      v.push("");
      continue;
    }
    if (c === q) {
      f = true;
      i++;
    }
    j = i;
    if (f) {
      while (j < len && (s[j] !== q || (s[j] === q && s[j + 1] === q))) {
        if (s[j] === q && s[j + 1] === q) j++;
        j++;
      }
    } else {
      while (j < len && s[j] !== d && s[j] !== lr) j++;
      while (j > i && (s[j - 1] === ' ' || s[j - 1] === '\r')) j--;
    }
    v.push(s.substring(i, j).replace(/""/g, '"'));
    if (f) j++;
    i = j;
    while (i < len && s[i] !== d && s[i] !== lr) i++;
    f = false;
    if (s[i] === lr || i === len) {
      rows.push(v);
      v = [];
    }
  }
  if (v.length > 0) rows.push(v);
  return rows;
}

function postWorkerMessage(msg) {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    try {
      self.postMessage(msg);
      return;
    } catch (e) {
      try {
        self.postMessage(msg, '*');
        return;
      } catch (e2) {
        console.debug("Worker message post fallback failed (self):", e2);
      }
    }
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.postMessage === 'function') {
    try {
      globalThis.postMessage(msg);
      return;
    } catch (e) {
      try {
        globalThis.postMessage(msg, '*');
        return;
      } catch (e2) {
        console.debug("Worker message post fallback failed (globalThis):", e2);
      }
    }
  }
}

function loadcsv(data) {
  if (data.viewOnly) return load_csv_view_only(data);
  let file = data.file;
  let fileSize = file ? file.size : 0;
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
  let sep = ';';
  let sepDetected = false;
  let totalRowsEmitted = 0;
  let prepend = "";

  let firstChunkEmitted = false;
  const FIRST_CHUNK_TARGET = 100;
  let pendingRows = [];

  const textDecoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder("utf-8", { fatal: false }) : null;

  function seek() {
    if (currentAbort) return;
    if (offset >= fileSize && iteration > 0 && pendingRows.length === 0) return;
    let nextSize = Math.min(CHUNK_SIZE, fileSize - offset);
    let chunkBlob = file.slice(offset, offset + nextSize);
    offset += nextSize;
    let isFileReadComplete = (offset >= fileSize);

    let reader = new FileReader();
    reader.onloadend = e => {
      if (currentAbort) return;
      let rawText = "";
      if (textDecoder && e.target.result instanceof ArrayBuffer) {
        rawText = textDecoder.decode(e.target.result, { stream: !isFileReadComplete });
      } else {
        rawText = e.target.result || "";
      }
      let textToParse = prepend + rawText;

      if (!sepDetected && rawText.length > 0) {
        sep = separatorDetection(rawText);
        sepDetected = true;
      }

      let len = textToParse.length;
      let i = 0;
      let inQuotes = false;
      let currentCell = "";
      let currentRow = [];
      let parsedRows = [];
      let lastSafeIndex = 0;

      while (i < len) {
        let c = textToParse[i];
        if (inQuotes) {
          if (c === '"') {
            if (i + 1 < len) {
              if (textToParse[i + 1] === '"') {
                currentCell += '"';
                i += 2;
              } else {
                inQuotes = false;
                i += 1;
              }
            } else {
              break;
            }
          } else {
            currentCell += c;
            i += 1;
          }
        } else {
          if (c === '"') {
            inQuotes = true;
            i += 1;
          } else if (c === sep) {
            currentRow.push(currentCell);
            currentCell = "";
            i += 1;
          } else if (c === '\n' || c === '\r') {
            if (c === '\r' && i + 1 >= len && !isFileReadComplete) {
              break;
            }
            if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
            currentRow.push(currentCell);
            currentCell = "";
            parsedRows.push(currentRow);
            currentRow = [];
            if (c === '\r' && i + 1 < len && textToParse[i + 1] === '\n') {
              i += 2;
            } else {
              i += 1;
            }
            lastSafeIndex = i;
          } else {
            currentCell += c;
            i += 1;
          }
        }
      }

      if (!isFileReadComplete) {
        if (lastSafeIndex > 0) {
          prepend = textToParse.slice(lastSafeIndex);
        } else {
          prepend = textToParse;
          parsedRows = [];
        }
      } else {
        if (currentRow.length > 0 || currentCell.length > 0) {
          if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
          currentRow.push(currentCell);
          parsedRows.push(currentRow);
        }
        prepend = "";
      }

      for (const r of parsedRows) {
        pendingRows.push(r);
      }

      let currentStatus = Math.min(1.0, offset / fileSize);

      if (!firstChunkEmitted) {
        if (pendingRows.length >= FIRST_CHUNK_TARGET || isFileReadComplete) {
          let firstChunkRows = pendingRows;
          if (pendingRows.length > FIRST_CHUNK_TARGET && !isFileReadComplete) {
            firstChunkRows = pendingRows.slice(0, FIRST_CHUNK_TARGET);
            pendingRows = pendingRows.slice(FIRST_CHUNK_TARGET);
          } else {
            pendingRows = [];
          }

          iteration++;
          totalRowsEmitted += firstChunkRows.length;
          firstChunkEmitted = true;
          let isComplete = isFileReadComplete && pendingRows.length === 0;

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

      while (firstChunkEmitted && (pendingRows.length >= 2000 || (isFileReadComplete && pendingRows.length > 0))) {
        let chunkSize = isFileReadComplete ? pendingRows.length : 2000;
        let chunkRows = pendingRows.slice(0, chunkSize);
        pendingRows = pendingRows.slice(chunkSize);

        iteration++;
        totalRowsEmitted += chunkRows.length;
        let isComplete = isFileReadComplete && pendingRows.length === 0;

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

      if (offset < fileSize && !currentAbort) {
        seek();
      }
    };

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
  let sep = ';';
  let reader = new FileReader();
  let iteration = 0;
  let vo_n_chunks = data.n_chunks || 1;
  let vo_n_rows = data.n_rows || 100;
  let lastIteration = vo_n_chunks;

  reader.onloadend = e => {
    if (currentAbort) return;
    let result = e.target.result || "";
    let status = iteration / vo_n_chunks;
    if (iteration === 1) sep = separatorDetection(result);
    let matrix = csv_parse(result, sep);
    if (iteration === 1) {
      matrix = matrix.slice(0, vo_n_rows);
    } else if (iteration === lastIteration) {
      matrix = matrix.slice(-vo_n_rows);
    } else {
      matrix = matrix.slice(1, vo_n_rows + 2);
    }

    if (iteration !== 1) {
      const colCount = (matrix.length > 1 && matrix[1]) ? matrix[1].length : ((matrix.length > 0 && matrix[0]) ? matrix[0].length : 1);
      const ellipsisRow = [];
      for (let i = 0; i < colCount; i++) ellipsisRow.push("! [...] !");
      matrix[0] = ellipsisRow;
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

addEventListener("message", e => {
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

export { csv_parse, separatorDetection, loadcsv, load_csv_view_only };
