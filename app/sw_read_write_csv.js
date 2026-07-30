const CHUNK_SIZE = 500 * 1000; // = 500ko
const n_chars_for_separator_detection = 500;


function separatorDetection(txt) {
  if (txt.length > n_chars_for_separator_detection) txt = txt.substring(0, n_chars_for_separator_detection)
  let d = [',', '\t', ';', ':', '|']
  let n = [0, 0, 0, 0, 0]
  for (let i = 0; i < txt.length; i++) {
    for (let j = 0; j < d.length; j++) {
      if (txt[i] == d[j]) n[j]++;
    }
  }
  return d[n.indexOf(Math.max(...n))]
}

function csv_parse(s, d = ",") {
  const rows = [];
  const lr = '\n'
  let v = [];     //value characters;
  const q = '"';    //quote
  let f = false;  //force
  const len = s.length;
  let c, j;
  for (let i = 0; i < len; i++) {
    c = s[i];
    if (c === ' ') continue;
    if (c === d) { v.push(""); continue }
    if (c === q) { f = true; i++ }
    j = i;
    if (f) while (j < len && s[j] !== q || s[j] === q && s[j + 1] === q) {
      if (s[j] === q && s[j + 1] === q) j++;
      j++;
    } else {
      while (j < len && s[j] !== d && s[j] !== lr) j++;
      while (j > i && (s[j - 1] === ' ' ||  s[j - 1] === '\r' )  ) j--;
    }
    v.push(s.substring(i, j).replace(/""/g, '"'));
    if (f) j++;
    i = j;
    while (i < len && s[i] !== d && s[i] !== lr) i++;
    f = false;
    if (s[i] === lr || i === len) {
      rows.push(v);
      v = []
    }
  }
  if (s[len-1]=== '\n') rows.push([[""]])
  if (v.length >0) rows.push(v);
  return rows;
}


function csv_parse1(txt, d = ",") {
  return txt.split(/[;\r]?\n/).map(s => {
    const r = [];     //result;
    const q = '"';    //quote
    let f = false;  //force
    const len = s.length;
    let c, j;
    for (let i = 0; i < len; i++) {
      c = s[i];
      if (c === ' ') continue;
      if (c === d) { r.push(""); continue }
      if (c === q) { f = true; i++ }
      j = i;
      if (f) while (j < len && s[j] !== q || s[j] === q && s[j + 1] === q) {
        if (s[j] === q && s[j + 1] === q) j++;
        j++;
      } else {
        while (j < len && s[j] !== d) j++;
        while (j > i && s[j - 1] === ' ') j--;
      }
      r.push(s.substring(i, j).replace(/""/g, '"'));
      if (f) j++;
      i = j;
      while (i < len && s[i] !== d) i++;
      f = false;
    } return r;
  })
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
  console.log("sw loading : ", file ? file.name : "unknown", "size:", fileSize);

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
  let totalRowsEmitted = 0;
  let prepend = "";

  let firstChunkEmitted = false;
  const FIRST_CHUNK_TARGET = 100;
  let pendingRows = [];

  function seek() {
    if (offset >= fileSize && iteration > 0 && pendingRows.length === 0) return;
    let nextSize = Math.min(CHUNK_SIZE, fileSize - offset);
    let chunkBlob = file.slice(offset, offset + nextSize);
    offset += nextSize;
    let reader = new FileReader();
    reader.onloadend = e => {
      let rawText = e.target.result || "";
      let textToParse = prepend + rawText;

      if (iteration === 0) {
        sep = separatorDetection(rawText);
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
          } else if (c === '\n') {
            if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
            currentRow.push(currentCell);
            currentCell = "";
            parsedRows.push(currentRow);
            currentRow = [];
            i += 1;
            lastSafeIndex = i;
          } else if (c === '\r' && i + 1 < len && textToParse[i + 1] === '\n') {
            currentRow.push(currentCell);
            currentCell = "";
            parsedRows.push(currentRow);
            currentRow = [];
            i += 2;
            lastSafeIndex = i;
          } else {
            currentCell += c;
            i += 1;
          }
        }
      }

      let isFileReadComplete = (offset >= fileSize);

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

      if (offset < fileSize) {
        seek();
      }
    };
    reader.readAsText(chunkBlob, "utf-8");
  }

  seek();
}

function load_csv_view_only(data) {
  let file = data.file;
  console.log("reading chunk size : ", CHUNK_SIZE);
  console.log("sw loading view only : ", file ? file.name : "unknown");
  let fileSize = file ? file.size : 0;
  let sep = ';';
  let reader = new FileReader();
  let iteration = 0;
  let vo_n_chunks = data.n_chunks || 1;
  let vo_n_rows = data.n_rows || 100;
  let lastIteration = vo_n_chunks;
  reader.onloadend = e => {
    let result = e.target.result;
    let status = iteration / vo_n_chunks;
    if (iteration == 1) sep = separatorDetection(result);
    let matrix = csv_parse(result, sep);
    if (iteration == 1) matrix = matrix.slice(0, vo_n_rows);
    else if (iteration == lastIteration) matrix = matrix.slice(- vo_n_rows);
    else matrix = matrix.slice(1, vo_n_rows + 2);
    if (iteration != 1) {
      matrix[0] = [];
      for (let i = 0; i < matrix[1].length; i++) matrix[0].push("! [...] !");
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
    if (iteration < lastIteration) seek();
  };

  function seek() {
    iteration++;
    let offset = (iteration - 1) * (fileSize / vo_n_chunks);
    if (iteration == lastIteration) reader.readAsText(file.slice(file.size - CHUNK_SIZE, file.size), "utf-8");
    else reader.readAsText(file.slice(offset, offset + CHUNK_SIZE), "utf-8");
  }

  seek();
}

addEventListener("message", e => {
  switch (e.data.cmd) {
    case "read": loadcsv(e.data.data)
  }
})

export { csv_parse, csv_parse1, separatorDetection, loadcsv };


