/**
 * File I/O handler for CSV datasets in NanoCell CSV.
 * Manages loading, streaming parsing via Web Worker, saving, and exporting 2D data matrices.
 * @module CsvHandle
 */
import { Dataframe } from './Dataframe.js';
import { StateManager } from './StateManager.js';
import { Msg } from './Msg.js';
import { stg } from './Setting.js';
import { Sheet } from './Sheet.js';

import CsvWorker from './csv_worker.js?worker';

/**
 * Handles CSV file lifecycle operations including opening, worker-based streaming, saving, and CSV serialization.
 */
class CsvHandle {
  /**
   * Instantiates a new CsvHandle and sets up the Web Worker event listener if available.
   */
  constructor() {
    this.handle = null;
    this.file = null;
    this.file_chunks = [];
    this.isFirstChunkLoaded = false;
    this.viewOnly = false;
    this.worker = typeof Worker !== 'undefined' ? new CsvWorker() : null;
    if (this.worker) {
      this.worker.addEventListener("message", e => {
        let d = e.data;
        switch (d.cmd) {
          case "chunk_loaded": this.file_chunk_loaded(d);
        }
      });
    }
  }

  /**
   * Initializes file loading from a FileSystemFileHandle.
   * @param {FileSystemFileHandle} handle - The file handle to load.
   * @returns {Promise<void>}
   */
  async launchFile(handle) {
    this.handle = handle;
    this.file = await handle.getFile();
    document.title = this.file.name;
    console.log("Loading : ", this.file.name);
    this.read(this.file);
  }

  /**
   * Handles chunk loaded event messages from the worker.
   * Progressively builds the dataset and triggers sheet initialization.
   * @param {Object} d - Worker event payload.
   */
  file_chunk_loaded(d) {
    const fc = document.getElementById("footerCenter");
    const percent = Math.round(d.status * 100);
    if (fc) fc.innerHTML = percent + "%";

    if (d.chunk != null) {
      this.file_chunks.push(d.chunk);
    }

    const isFirst = d.isFirstChunk || (!this.isFirstChunkLoaded && d.chunk != null);

    if (isFirst) {
      this.isFirstChunkLoaded = true;
      let matrix = d.chunk || [[]];
      let df = new Dataframe(matrix);
      let s = new Sheet(df);

      StateManager.setState('sheet', s);
      StateManager.setState('activeSheet', s);
      StateManager.setState('dataframe', s.df);
      StateManager.setState('activeDataframe', s.df);
      StateManager.setState('fileStatus', { handle: this.handle, file: this.file, viewOnly: this.viewOnly, isStreaming: d.status < 1 });
      StateManager.setState('fileLoadingState', d.status >= 1 ? 'complete' : 'streaming');

      s.df.isSaved = true;
      s.df.lock = this.viewOnly;
      s.fixTop = stg.set_headers;

      StateManager.emit('file:chunk:first', {
        filename: this.file ? this.file.name : '',
        handle: this.handle,
        dataframe: s.df,
        sheet: s,
        viewOnly: this.viewOnly
      });

      if (d.status >= 1 || d.isComplete) {
        this.readSuccess(s, d);
      }
      return;
    }

    // Subsequent background chunks
    let s = StateManager.getState('sheet');
    if (s && s.df && d.chunk != null && d.chunk.length > 0) {
      s.df.appendRows(d.chunk);
      if (typeof s.scrollbarRefresh === 'function') {
        s.scrollbarRefresh();
      }
      StateManager.emit('file:chunk:progress', {
        chunkIndex: d.chunk_id,
        rowsAdded: d.chunk.length,
        totalRows: s.df.height,
        percent: percent,
        status: d.status
      });
    }

    if (d.status >= 1 || d.isComplete) {
      if (s) {
        this.readSuccess(s, d);
      }
    }
  }

  /**
   * Finalizes file loading state and triggers completion events.
   * @param {import('./Sheet.js').Sheet} [s] - The sheet instance.
   * @param {Object} [d] - Final chunk event data.
   */
  readSuccess(s, d) {
    if (!s) {
      s = StateManager.getState('sheet');
    }
    if (s) {
      if (stg.trim) s.df.trimAll();
      s.fixTop = stg.set_headers;
      s.df.isSaved = true;
    }
    StateManager.setState('fileLoadingState', 'complete');
    StateManager.emit('file:load:complete', {
      filename: this.file ? this.file.name : '',
      handle: this.handle,
      totalRows: s ? s.df.height : 0,
      totalCols: s ? s.df.width : 0,
      viewOnly: this.viewOnly
    });
    StateManager.emit('file:loaded', {
      filename: this.file ? this.file.name : '',
      handle: this.handle
    });
  }

  /**
   * Initiates file reading by delegating parsing options to the Web Worker.
   * @param {File} file - File object to read.
   */
  read(file) {
    this.file = file;
    this.file_chunks = [];
    this.isFirstChunkLoaded = false;
    let mbSize = (file && file.size) ? file.size / 1000000 : 0;
    this.viewOnly = mbSize > Number(stg.editMaxFileSize);

    StateManager.setState('fileLoadingState', 'loading');
    StateManager.emit('file:load:start', {
      filename: file ? file.name : '',
      handle: this.handle,
      totalBytes: file ? file.size : 0,
      viewOnly: this.viewOnly
    });

    if (!file || file.size == 0) {
      this.file_chunks = [[[]]];
      this.file_chunk_loaded({
        cmd: "chunk_loaded",
        status: 1.0,
        chunk: [[]],
        chunk_id: 1,
        isFirstChunk: true,
        isComplete: true,
        viewOnly: this.viewOnly
      });
    } else {
      this.pipe("read", { file: file, viewOnly: this.viewOnly, n_chunks: stg.vo_n_chunks, n_rows: stg.vo_n_rows });
    }
  }

  /**
   * Sends a command payload to the underlying Web Worker.
   * @param {string} cmd - Command identifier for worker.
   * @param {Object} data - Command payload data.
   */
  pipe(cmd, data) { if (this.worker) this.worker.postMessage({ cmd: cmd, data: data }); }

  /**
   * Prompts the user with a file picker to open a new CSV file in a new window.
   * @returns {Promise<void>}
   */
  async open() {
    try {
      let [fileHandle] = await window.showOpenFilePicker(CsvHandle.pickerOptions);
      const newWindow = window.open('./home.html', "_blank", 'width=800,height=600');
      const channel = new MessageChannel();
      newWindow.onload = () => {
        newWindow.postMessage({ fileHandle }, '*', [channel.port2]);
      };
    } catch (err) {
      if (err.name === 'AbortError') return;
      else console.error('An unexpected error occurred:', err);
    }
  }

  /**
   * Reloads the active file, optionally prompting if unsaved changes exist.
   * @param {boolean} [force=false] - If true, reloads without prompting even if unsaved changes exist.
   */
  reloadFile(force = false) {
    if (this.handle === null) return Msg.quick("No file to reload from.");
    const sheet = StateManager.getState('sheet');
    if (sheet && !sheet.df.isSaved && !force) {
      Msg.choice("Changes will be lost ? ", () => { this.launchFile(this.handle); });
    } else {
      this.launchFile(this.handle);
    }
  }

  /**
   * Opens a blank NanoCell window.
   */
  new() { window.open('./home.html', "_blank", 'width=600,height=400'); }

  /**
   * Triggers the native save file picker dialog to save the current dataset under a new file path.
   * @returns {Promise<void>}
   */
  async saveAs() {
    if (this.viewOnly) return;
    try {
      this.handle = await window.showSaveFilePicker(CsvHandle.pickerOptions);
      this.save();
    } catch (err) {
      if (err.name === 'AbortError') return;
      else console.error('An unexpected error occurred:', err);
    }
  }

  /**
   * Saves the current sheet's Dataframe back to the file handle using CSV formatting.
   * @returns {Promise<void>}
   */
  async save() {
    if (this.viewOnly) return;
    if (this.handle === null) this.saveAs();
    else {
      const writableStream = await this.handle.createWritable();
      try {
        const sheet = StateManager.getState('sheet');
        if (!sheet) return;
        let csvContent = CsvHandle.from2D(sheet.df.data);
        await writableStream.write(csvContent);
        await writableStream.close();
        sheet.df.isSaved = true;
        sheet.refresh();
        this.file = await this.handle.getFile();
        document.title = this.file.name;
        StateManager.emit('file:loaded', { filename: this.file ? this.file.name : '', handle: this.handle });
      } catch (err) {
        console.error("Error saving file:", err);
        Msg.confirm(err);
      }
    }
  }

  /**
   * Serializes a 2D string matrix into a formatted CSV text string based on current settings.
   * @param {Array<Array<string|number>>} matrix - 2D matrix of cell values.
   * @returns {string} Formatted CSV text.
   * @throws {string} Error message if strict CSV requirements are violated.
   */
  static from2D(matrix) {
    let isStrict = stg.save_strict;
    let fw = stg.save_fixed_width_size;
    let sep = stg.delimiter;
    let spaces = " ".repeat(fw);
    if (sep == "TAB") sep = '\t';
    const newMat = [];
    for (const row of matrix) {
      const newRow = [];
      for (const cell of row) {
        let data = String(cell);
        let quote = false;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === "," || data[i] === "\n") quote = true;
          if (data[i] === '"') { quote = true; data = data.slice(0, i) + '"' + data.slice(i); i++; }
        }
        if (quote && isStrict) throw "Strict csv format not respected <br><br> save aborted";
        if (quote) data = '"' + data + '"';
        if (fw > data.length) data = (spaces + data).slice(-fw);
        newRow.push(data);
      }
      newMat.push(newRow.join(sep));
    }
    return newMat.join('\n');
  }
}

/**
 * File picker options configuration for opening/saving CSV files via File System Access API.
 * @type {Object}
 */
Object.defineProperty(CsvHandle, 'pickerOptions', {
  value: {
    types: [
      {
        description: "csv (Comma Separated Value) ",
        accept: { "text/csv": [".csv", ".tsv"] }
      },
    ]
  }
});

export { CsvHandle };
