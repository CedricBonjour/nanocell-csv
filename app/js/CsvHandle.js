import { Dataframe } from '../core/Dataframe.js';
import { CsvSerializer } from '../core/Csv.js';
import { getSheet, settings } from './state.js';
import { downloadBlob, copyToClipboard } from './utils.js';
import { Notification, showBrowserCompatibilityNotice } from './Notification.js';
import CsvWorker from './csvWorker.js?worker';

export class CsvHandle {
  static pickerOptions = {
    types: [{ description: 'csv (Comma Separated Value) ', accept: { 'text/csv': ['.csv', '.tsv'] } }]
  };

  constructor(options = {}) {
    this.win = options.window !== undefined ? options.window : (globalThis.window ?? null);
    this.doc = options.document !== undefined ? options.document : (globalThis.document ?? null);
    this.createSheet = options.createSheet;
    this.handle = null;
    this.file = null;
    this.isFirstChunkLoaded = false;
    this.isReadComplete = false;
    this.viewOnly = false;
    this.detectedEncoding = 'utf-8';
    this.detectedSeparator = ',';
    this.readId = 0;
    this._launchingHandle = null;
    this._receivedMessageHandle = null;
    this.worker = options.worker !== undefined ? options.worker : (typeof Worker !== 'undefined' ? new CsvWorker() : null);
    this.worker?.addEventListener('message', (event) => {
      if (event?.data?.cmd === 'chunk_loaded') this.onChunkLoaded(event.data);
    });
  }

  confirmIfUnsaved(action, force = false) {
    const sheet = getSheet();
    if (sheet?.isEditing) sheet.commitEdit();
    return (sheet && !sheet.df.isSaved && !force)
      ? Notification.choice('Changes will be lost ? ', action)
      : action();
  }

  loadFile(file, handle = null, force = false) {
    if (!file) return;
    return this.confirmIfUnsaved(() => {
      this.handle = handle;
      this.file = file;
      if (this.doc) this.doc.title = file.name || 'csv';
      this.read(file);
    }, force);
  }

  async launchFile(handle, force = false) {
    if (!handle || typeof handle.getFile !== 'function' || this._launchingHandle === handle) return;
    return this.confirmIfUnsaved(async () => {
      if (this._launchingHandle === handle) return;
      this._launchingHandle = handle;
      try {
        this.loadFile(await handle.getFile(), handle, true);
      } finally {
        this._launchingHandle = null;
      }
    }, force);
  }

  async loadSample(sampleName) {
    if (!sampleName || !/^[a-zA-Z0-9._-]+\.(csv|tsv)$/i.test(sampleName)) return;
    try {
      const res = await globalThis.fetch(`/csv-files/${encodeURIComponent(sampleName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], sampleName, { type: 'text/csv', lastModified: Date.now() });
      this.loadFile(file, null, true);
    } catch (err) {
      console.error('Failed to load sample CSV:', err);
      Notification.error(`Could not load sample file "${sampleName}".`);
    }
  }

  initListeners(win = this.win) {
    if (!win) return;

    if ('launchQueue' in win && typeof win.launchQueue?.setConsumer === 'function') {
      try {
        win.launchQueue.setConsumer(async (params) => {
          const handle = params?.files?.[0];
          if (handle) await this.launchFile(handle);
        });
      } catch (err) {
        console.warn('LaunchQueue setup failed:', err);
      }
    }

    if (typeof win.addEventListener === 'function') {
      win.addEventListener('message', (event) => {
        const fileHandle = event?.data?.fileHandle;
        if (fileHandle && fileHandle !== this._receivedMessageHandle) {
          this._receivedMessageHandle = fileHandle;
          this.launchFile(fileHandle);
        }
      });

      const preventDefault = (event) => event.preventDefault();
      for (const evt of ['dragover', 'dragenter', 'dragleave']) win.addEventListener(evt, preventDefault);

      win.addEventListener('drop', async (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files?.[0];
        const item = event.dataTransfer?.items?.[0];
        if (typeof item?.getAsFileSystemHandle === 'function') {
          try {
            const handle = await item.getAsFileSystemHandle();
            if (handle && (handle.kind === 'file' || typeof handle.getFile === 'function')) {
              return await this.launchFile(handle);
            }
          } catch {}
        }
        if (file) this.loadFile(file, null);
      });
    }

    if (win.location?.search) {
      const sample = new URLSearchParams(win.location.search).get('sample');
      if (sample) this.loadSample(sample);
    }

    try { win.opener?.postMessage?.({ type: 'nanocell:ready' }, '*'); } catch {}
  }

  onChunkLoaded(data) {
    if (data.readId !== undefined && data.readId !== this.readId) return;
    const footerCenter = this.doc?.getElementById?.('footer-center');
    if (footerCenter) footerCenter.innerHTML = `${Math.round(data.status * 100)}%`;

    const isFirst = data.isFirstChunk || (!this.isFirstChunkLoaded && data.chunk != null);
    const isComplete = data.status >= 1 || Boolean(data.isComplete);
    let sheet;

    if (isFirst) {
      this.isFirstChunkLoaded = true;
      if (data.encoding) this.detectedEncoding = data.encoding;
      if (data.sep) this.detectedSeparator = data.sep;
      const initialRows = data.chunk?.length > 0 ? data.chunk : [['']];
      const df = new Dataframe(initialRows);
      df.lock = this.viewOnly;
      sheet = this.createSheet(df);
      if (!this.viewOnly && settings.readOnlyOnOpen) {
        sheet.readOnly = true;
        sheet.df.lock = true;
      }
      if (!isComplete) {
        sheet.df.isSaved = true;
        sheet.fixTop = settings.freezeHeaderOnOpen;
      }
    } else {
      sheet = getSheet();
      if (sheet?.df && data.chunk?.length > 0) {
        sheet.df.appendRows(data.chunk, true);
        if (!isComplete) {
          sheet.df.isSaved = true;
          sheet.refreshScrollbars();
          sheet.refresh();
        }
      }
    }

    if (isComplete) {
      this.isReadComplete = true;
      if (sheet) this.onReadComplete(sheet);
    }
  }

  onReadComplete(sheet = getSheet()) {
    if (!sheet) return;
    if (settings.trim && !this.viewOnly) sheet.df.trimAll();
    sheet.fixTop = settings.freezeHeaderOnOpen;
    sheet.df.isSaved = true;
    sheet.refreshScrollbars();
    sheet.refresh();
  }

  read(file) {
    if (this.worker && this.readId > 0 && !this.isReadComplete) {
      this.postToWorker('abort', {});
    }
    const currentReadId = ++this.readId;
    this.file = file;
    this.isFirstChunkLoaded = false;
    this.isReadComplete = false;
    this.detectedEncoding = 'utf-8';
    this.detectedSeparator = ',';
    this.viewOnly = (file?.size ? file.size / 1000000 : 0) > Number(settings.editMaxFileSize);

    if (!file || file.size == 0) {
      this.onChunkLoaded({
        cmd: 'chunk_loaded', readId: currentReadId, status: 1.0, chunk: [[]],
        chunkId: 1, isFirstChunk: true, isComplete: true, viewOnly: this.viewOnly,
        sep: ',', encoding: 'utf-8'
      });
    } else {
      this.postToWorker('read', {
        readId: currentReadId, file, viewOnly: this.viewOnly,
        previewChunks: settings.previewChunks, previewRows: settings.previewRows,
        trimUnquoted: Boolean(settings.trimUnquoted),
        preserveQuotedEmpty: Boolean(settings.preserveQuotedEmpty)
      });
    }
  }

  postToWorker(cmd, data) {
    this.worker?.postMessage({ cmd, data });
  }

  openFallback() {
    const doc = this.doc;
    if (typeof doc?.createElement !== 'function') return;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
    input.hidden = true;
    input.onchange = (event) => {
      const file = event.target?.files?.[0];
      if (file) this.loadFile(file, null);
      input.remove?.();
    };
    doc.body?.appendChild(input);
    input.click?.();
  }

  async _withPicker(method, onPicked, onFallback) {
    const win = this.win;
    if (typeof win?.[method] !== 'function') {
      showBrowserCompatibilityNotice();
      return onFallback();
    }
    let picked;
    try {
      picked = await win[method](CsvHandle.pickerOptions);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      showBrowserCompatibilityNotice();
      return onFallback();
    }
    try {
      return await onPicked(picked);
    } catch (err) {
      console.error('An unexpected error occurred:', err);
      Notification.error(err?.message || 'An unexpected file operation error occurred.');
    }
  }

  async open() {
    return this._withPicker(
      'showOpenFilePicker',
      ([fileHandle]) => this.launchFile(fileHandle),
      () => this.openFallback()
    );
  }

  reloadFile(force = false) {
    if (this.handle === null && this.file === null) {
      return Notification.quick('No file to reload from.');
    }
    return this.confirmIfUnsaved(
      () => this.handle !== null ? this.launchFile(this.handle, true) : this.loadFile(this.file, null, true),
      force
    );
  }

  new() {
    this.win?.open?.('./home.html', '_blank', 'width=600,height=400');
  }

  async saveAs() {
    if (this.viewOnly) return;
    return this._withPicker('showSaveFilePicker', async (handle) => {
      this.handle = handle;
      await this.save();
    }, () => this.exportDownload());
  }

  async save() {
    if (this.viewOnly) return;
    if (this.handle === null) return await this.saveAs();
    if (typeof this.handle?.createWritable !== 'function') {
      showBrowserCompatibilityNotice();
      return this.exportDownload();
    }
    try {
      const sheet = getSheet();
      if (!sheet) return;
      const writableStream = await this.handle.createWritable();
      await writableStream.write(CsvHandle.serializeMatrix(sheet.df.data));
      await writableStream.close();
      this.detectedEncoding = 'utf-8';
      this.detectedSeparator = settings.delimiter || ',';
      this.file = await this.handle.getFile();
      if (this.doc) this.doc.title = this.file.name;
      sheet.df.isSaved = true;
      sheet.refresh();
    } catch (err) {
      console.error('Error saving file:', err);
      Notification.confirm(err);
    }
  }

  exportDownload(blob, filename) {
    const sheet = getSheet();
    const doc = this.doc;
    if (!sheet || !doc) return;
    try {
      blob ||= new Blob([CsvHandle.serializeMatrix(sheet.df.data)], { type: 'text/csv;charset=utf-8;' });
      filename ||= this.file?.name || 'export.csv';
      downloadBlob(blob, filename, doc);
      sheet.df.isSaved = true;
      sheet.refresh();
      Notification.quick(`File saved as ${filename}`);
    } catch (err) {
      console.error('Error downloading file:', err);
      Notification.confirm(err);
    }
  }

  static formatData(format, rows, pretty = true, hasHeader = Boolean(settings.freezeHeaderOnOpen)) {
    if (format === 'csv') return CsvHandle.serializeMatrix(rows);
    const preserveQuotedEmpty = Boolean(settings.preserveQuotedEmpty);
    const s = new CsvSerializer(format === 'tsv' ? { delimiter: '\t', preserveQuotedEmpty } : { preserveQuotedEmpty });
    if (format === 'json') return s.serializeJson(rows, { pretty, hasHeader });
    if (format === 'md') return s.serializeMarkdown(rows, { hasHeader });
    if (format === 'html') return s.serializeHtml(rows, { hasHeader });
    return s.serialize(rows);
  }

  _exportAs(extension, mimeType, format, pretty = true) {
    const sheet = getSheet();
    if (!sheet?.df) return Notification.quick('No active data to export.');
    const content = CsvHandle.formatData(format, sheet.df.data, pretty);
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const baseName = this.file?.name ? this.file.name.replace(/\.[^.]+$/, '') : 'export';
    this.exportDownload(blob, `${baseName}.${extension}`);
  }

  exportJson(pretty = true) { this._exportAs('json', 'application/json', 'json', pretty); }
  exportTsv() { this._exportAs('tsv', 'text/tab-separated-values', 'tsv'); }
  exportMarkdown() { this._exportAs('md', 'text/markdown', 'md'); }

  async _copyFormatted(message, format) {
    const sheet = getSheet();
    if (!sheet) return;
    const { matrix, hasHeader } = sheet.getCopyMatrix();
    const text = CsvHandle.formatData(format, matrix, true, hasHeader);
    const html = format === 'html' ? text : '';
    if (await copyToClipboard(text, html)) {
      Notification.quick(message);
    } else if (globalThis.navigator?.clipboard?.writeText) {
      Notification.quick('Clipboard copy not permitted by browser');
    }
  }

  async copyTsv() { return this._copyFormatted('Copied selection as TSV', 'tsv'); }
  async copyCsv() { return this._copyFormatted('Copied selection as CSV', 'csv'); }
  async copyHtml() { return this._copyFormatted('Copied selection as HTML table', 'html'); }
  async copyMarkdown() { return this._copyFormatted('Copied selection as Markdown table', 'md'); }
  async copyJson() { return this._copyFormatted('Copied selection as JSON to clipboard', 'json'); }

  static serializeMatrix(matrix) {
    return new CsvSerializer({
      delimiter: settings.delimiter,
      isStrict: settings.strictSave,
      fixedWidth: settings.fixedWidthSize,
      preserveQuotedEmpty: Boolean(settings.preserveQuotedEmpty)
    }).serialize(matrix);
  }
}
