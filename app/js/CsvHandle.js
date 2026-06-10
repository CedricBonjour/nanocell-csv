import { cmd } from './cmd.js';
import { Dataframe } from './Dataframe.js';
import { sheet, setSheet } from './main.js';
import { Msg } from './Msg.js';
import { stg } from './Setting.js';
import { Sheet } from './Sheet.js';

import { round } from './utils/misc.js';
import SwWorker from '../sw_read_write_csv.js?worker';


class CsvHandle {
  constructor() {
    this.handle = null;
    this.file = null;
    this.file_chunks = null;
    this.viewOnly = false;
    this.sw = typeof Worker !== 'undefined' ? new SwWorker() : null;
    if (this.sw) {
      this.sw.addEventListener("message", e => {
        let d = e.data
        switch (d.cmd) {
          case "chunk_loaded": this.file_chunk_loaded(d)
        }
      })
    }
  }

  async launchFile(handle) {
    this.handle = handle;
    this.file = await handle.getFile();
    document.title = this.file.name;
    console.log("Loading : ", this.file.name)
    this.read(this.file)
  }

  file_chunk_loaded(d) {
    document.getElementById("footerCenter").innerHTML = Math.round(d.status * 100) + "%"
    if (d.chunk != null) this.file_chunks.push(d.chunk)
    if (d.status >= 1 && d.chunk != null) this.readSuccess();
  }

  readSuccess() {
    let matrix = this.file_chunks.flat(1);
    let s = new Sheet(new Dataframe(matrix));
    setSheet(s);
    s.df.isSaved = true;
    s.df.lock = this.viewOnly;
    if(stg.trim) s.df.trimAll();
    s.fixTop = stg.set_headers;
    if(stg.fit_col_width) s.fitWidth();
  }

  read(file) {
    this.file = file;
    this.file_chunks = [];
    let mbSize = file.size / 1000000
    this.viewOnly = mbSize > Number(stg.editMaxFileSize);
    // console.log(file)
    if(file.size ==0){
      this.file_chunks = [[[]]]
      this.readSuccess()
    }else{
      this.pipe("read", { file: file, viewOnly: this.viewOnly, n_chunks: stg.vo_n_chunks, n_rows: stg.vo_n_rows })
    }
  }

  pipe(cmd, data) { this.sw.postMessage({ cmd: cmd, data: data }) }

  async open() {
    try {

      let [fileHandle] = await window.showOpenFilePicker(CsvHandle.pickerOptions);
      const newWindow = window.open('./home.html', "_blank", 'width=800,height=600'); // 'newWindow.html' should be the page that will handle the file
      const channel = new MessageChannel();
      newWindow.onload = () => {
        newWindow.postMessage({ fileHandle }, '*', [channel.port2]);
      };
    } catch (err) {
      if (err.name === 'AbortError') return;
      else console.error('An unexpected error occurred:', err);

    }
  }

  reloadFile(force = false) {
    if (this.handle === null) return Msg.quick("No file to reload from.")
    if (!sheet.df.isSaved && !force) {
      Msg.choice("Changes will be lost ? ", () => { this.launchFile(this.handle) })
    }else{
      this.launchFile(this.handle);
    }
  }

  new() { window.open('./home.html', "_blank", 'width=600,height=400') }

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
  async save() {
    if (this.viewOnly) return;
    if (this.handle === null) this.saveAs();
    else {
      const writableStream = await this.handle.createWritable();
      try {
        let csvContent = CsvHandle.from2D(sheet.df.data)
        await writableStream.write(csvContent);
        await writableStream.close();
        sheet.df.isSaved = true;
        sheet.refresh();
        this.file = await this.handle.getFile();
        document.title = this.file.name;
      } catch (err) {
        Msg.confirm(err);
      }
    }
  }

  static from2D(matrix) {
    let isStrict = stg.save_strict;
    let fw = stg.save_fixed_width_size;
    let sep = stg.delimiter;
    let spaces = " ".repeat(fw)
    if (sep == "TAB") sep = '\t';
    var newMat = [];
    for (var row of matrix) {
      var newRow = [];
      for (var cell of row) {
        var data = String(cell);
        var quote = false;
        for (var i = 0; i < data.length; i++) {
          if (data[i] === "," || data[i] === "\n") quote = true;
          if (data[i] === '"') { quote = true; data = data.slice(0, i) + '"' + data.slice(i); i++ }
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
