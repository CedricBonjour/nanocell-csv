/**
 * File I/O handler for CSV datasets in NanoCell CSV.
 * Manages loading, streaming parsing via Web Worker, saving, and exporting 2D data matrices.
 * @module CsvHandle
 */
import { Dataframe } from '../../../core/model/Dataframe.js';
import { getSheet } from '../appContext.js';
import { Notification } from '../ui/Notification.js';
import { Sheet } from '../sheet/Sheet.js';
import { stg } from '../ui/settings/Setting.js';
import { CsvSerializer } from '../../../core/csv/CsvSerializer.js';
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

      s.df.isSaved = true;
      s.df.lock = this.viewOnly;
      s.fixTop = stg.set_headers;

      if (d.status >= 1 || d.isComplete) {
        this.readSuccess(s, d);
      }
      return;
    }

    // Subsequent background chunks
    let s = getSheet();
    if (s && s.df && d.chunk != null && d.chunk.length > 0) {
      s.df.appendRows(d.chunk, true);
      if (this.viewOnly) {
        s.df.isSaved = true;
      }
      if (typeof s.scrollbarRefresh === 'function') {
        s.scrollbarRefresh();
      }
      if (typeof s.refresh === 'function') {
        s.refresh();
      }
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
      s = getSheet();
    }
    if (s) {
      if (stg.trim && !this.viewOnly) s.df.trimAll();
      s.fixTop = stg.set_headers;
      s.df.isSaved = true;
      s.df.lock = this.viewOnly;
      if (typeof s.scrollbarRefresh === 'function') {
        s.scrollbarRefresh();
      }
      if (typeof s.refresh === 'function') {
        s.refresh();
      }
    }
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
      const commentChar = (stg.comment_char && stg.comment_char !== 'None') ? stg.comment_char : '';
      const escapeChar = (stg.open_escape_char === '\\' || (stg.open_escape_char !== '""' && stg.escape_char === '\\')) ? '\\' : '"';
      this.pipe("read", {
        file: file,
        viewOnly: this.viewOnly,
        n_chunks: stg.vo_n_chunks,
        n_rows: stg.vo_n_rows,
        trimUnquoted: Boolean(stg.trim_unquoted),
        commentChar: commentChar,
        escapeChar: escapeChar
      });
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
   * Uses the native File System Access API.
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
      console.error('An unexpected error occurred:', err);
    }
  }

  /**
   * Reloads the active file, optionally prompting if unsaved changes exist.
   * @param {boolean} [force=false] - If true, reloads without prompting even if unsaved changes exist.
   */
  reloadFile(force = false) {
    if (this.handle === null) return Notification.quick("No file to reload from.");
    const sheet = getSheet();
    if (sheet && !sheet.df.isSaved && !force) {
      Notification.choice("Changes will be lost ? ", () => { this.launchFile(this.handle); });
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
      console.error('An unexpected error occurred:', err);
    }
  }

  /**
   * Saves the current sheet's Dataframe back to the file handle using CSV formatting.
   * @returns {Promise<void>}
   */
  async save() {
    if (this.viewOnly) return;
    if (this.handle === null) {
      this.saveAs();
      return;
    }
    try {
      const writableStream = await this.handle.createWritable();
      const sheet = getSheet();
      if (!sheet) return;
      let csvContent = CsvHandle.from2D(sheet.df.data);
      if (stg.save_bom) {
        csvContent = '\uFEFF' + csvContent;
      }
      await writableStream.write(csvContent);
      await writableStream.close();
      sheet.df.isSaved = true;
      sheet.refresh();
      this.file = await this.handle.getFile();
      document.title = this.file.name;
    } catch (err) {
      console.error("Error saving file:", err);
      Notification.confirm(err);
    }
  }

  /**
   * Exports a Blob by triggering a browser download via anchor element.
   * @param {Blob} [blob] - Custom Blob to download (defaults to current sheet as CSV).
   * @param {string} [filename] - Custom filename (defaults to current file name or 'export.csv').
   */
  exportDownload(blob, filename) {
    const sheet = getSheet();
    if (!sheet) return;
    try {
      if (!blob) {
        let csvContent = CsvHandle.from2D(sheet.df.data);
        if (stg.save_bom) {
          csvContent = '\uFEFF' + csvContent;
        }
        blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      }
      if (!filename) {
        filename = (this.file && this.file.name) ? this.file.name : 'export.csv';
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 100);
      sheet.df.isSaved = true;
      sheet.refresh();
      Notification.quick("File saved as " + filename);
    } catch (err) {
      console.error("Error downloading file:", err);
      Notification.confirm(err);
    }
  }

  /**
   * Exports the active sheet as a JSON file.
   * @param {boolean} [pretty=true] - Whether to format JSON with 2-space indentation.
   */
  exportJson(pretty = true) {
    const sheet = getSheet();
    if (!sheet?.df) return Notification.quick("No active data to export.");
    const serializer = new CsvSerializer();
    const jsonStr = serializer.serializeJson(sheet.df.data, {
      pretty,
      hasHeader: Boolean(stg.set_headers)
    });
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const baseName = (this.file?.name ? this.file.name.replace(/\.[^.]+$/, '') : 'export');
    this.exportDownload(blob, `${baseName}.json`);
  }

  /**
   * Exports the active sheet as a Tab-Separated Values (TSV) file.
   */
  exportTsv() {
    const sheet = getSheet();
    if (!sheet?.df) return Notification.quick("No active data to export.");
    const serializer = new CsvSerializer({ delimiter: '\t' });
    const tsvStr = serializer.serialize(sheet.df.data);
    const blob = new Blob([tsvStr], { type: 'text/tab-separated-values;charset=utf-8' });
    const baseName = (this.file?.name ? this.file.name.replace(/\.[^.]+$/, '') : 'export');
    this.exportDownload(blob, `${baseName}.tsv`);
  }

  /**
   * Exports the active sheet as a GitHub Flavored Markdown table file.
   */
  exportMarkdown() {
    const sheet = getSheet();
    if (!sheet?.df) return Notification.quick("No active data to export.");
    const serializer = new CsvSerializer();
    const mdStr = serializer.serializeMarkdown(sheet.df.data, {
      hasHeader: Boolean(stg.set_headers)
    });
    const blob = new Blob([mdStr], { type: 'text/markdown;charset=utf-8' });
    const baseName = (this.file?.name ? this.file.name.replace(/\.[^.]+$/, '') : 'export');
    this.exportDownload(blob, `${baseName}.md`);
  }

  /**
   * Copies the active selection as a GitHub Flavored Markdown table to clipboard.
   * @returns {Promise<void>}
   */
  async copyMarkdown() {
    const sheet = getSheet();
    if (!sheet) return;
    const serializer = new CsvSerializer();
    const md = serializer.serializeMarkdown(sheet.rangeArray(), { hasHeader: Boolean(stg.set_headers) });
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
      Notification.quick("Copied selection as Markdown table");
    }
  }

  /**
   * Copies the active selection as JSON to clipboard.
   * @returns {Promise<void>}
   */
  async copyJson() {
    const sheet = getSheet();
    if (!sheet) return;
    const serializer = new CsvSerializer();
    const json = serializer.serializeJson(sheet.rangeArray(), { pretty: true, hasHeader: Boolean(stg.set_headers) });
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      Notification.quick("Copied selection as JSON to clipboard");
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
    if (sep === "TAB") sep = '\t';
    let lineTerminator = (stg.line_terminator === "LF" || stg.line_terminator === "\n") ? '\n' : '\r\n';
    let quoteAlways = Boolean(stg.quote_always);
    let escapeChar = (stg.escape_char === '\\') ? '\\' : '"';
    const serializer = new CsvSerializer({
      delimiter: sep,
      isStrict: isStrict,
      fixedWidth: fw,
      lineTerminator: lineTerminator,
      quoteAlways: quoteAlways,
      escapeChar: escapeChar
    });
    return serializer.serialize(matrix);
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
