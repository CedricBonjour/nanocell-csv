import { stg } from './Setting.js';
import { round } from './utils/misc.js';

class Dataframe {
  constructor(d = [[""]]) {
    this.lock = false;
    this.isSaved = true;
    this.data = d;
    this.undoStack = [];
    this.redoStack = [];
    this.square();
    // this.solver = new Solver(this); 
  }

  get(x, y) { return (y >= this.height || x >= this.width || y < 0 || x < 0) ? '' : String(this.data[y][x]) }


  getAll(cb) {
    for (var y = 0; y < this.height; y++)for (var x = 0; x < this.width; x++) cb(this.get(x, y), x, y);
  }

  trimAll() {
    if (this.lock) return;
    for (var x = this.width - 1; x >= 0; x--) {
      var emptyCol = true;
      for (var y = 0; y < this.data.length; y++) if (this.data[y][x].length > 0) { emptyCol = false; break }
      if (emptyCol) this.deleteCol(x);
    }
    for (var y = this.data.length - 1; y >= 0; y--) {
      var emptyRow = true;
      for (var x = 0; x < this.data[y].length; x++) if (this.data[y][x].length > 0) { emptyRow = false; break }
      if (emptyRow) this.deleteRow(y);
    }
  }

  order(new_order) {
    let old_order = new Array(new_order.length);
    for (let i = 0; i < new_order.length; i++) old_order[new_order[i]] = i;
    var redo = () => { this.data = new_order.map(index => this.data[index]); }
    var undo = () => { this.data = old_order.map(index => this.data[index]); }
    this.create(redo, undo);
  }

  shiftCol(n) {
    if (n < 0 || n + 1 > this.width) return;
    if (n + 1 === this.width) return this.insertCol(n);
    var redo = () => { for (var row of this.data) { var t = row[n]; row[n] = row[n + 1]; row[n + 1] = t } }
    var undo = () => { for (var row of this.data) { var t = row[n]; row[n] = row[n + 1]; row[n + 1] = t } }
    this.create(redo, undo);
  }
  shiftRow(n) {
    if (n < 0 || n + 1 > this.height) return;
    if (n + 1 === this.height) return this.insertRow(n);
    var redo = () => { var t = this.data[n]; this.data[n] = this.data[n + 1]; this.data[n + 1] = t }
    var undo = () => { var t = this.data[n]; this.data[n] = this.data[n + 1]; this.data[n + 1] = t }
    this.create(redo, undo);
  }
  deleteRow(n) {

    if (this.height < 2 || n < 0 || n >= this.height) return;
    for (var x = 0; x < this.width; x++) this.edit(x, n, '');
    var redo = () => { this.data.splice(n, 1); }
    var undo = () => { this.data.splice(n, 0, Array(this.width).fill('')) }
    this.create(redo, undo);
  }
  deleteCol(n) {
    if (this.width < 2 || n < 0 || n >= this.width) return;
    for (var y = 0; y < this.height; y++) this.edit(n, y, '');
    var redo = () => { for (var row of this.data) row.splice(n, 1) }
    var undo = () => { for (var row of this.data) row.splice(n, 0, '') }
    this.create(redo, undo);
  }
  insertCol(n) {
    if (n > this.width) return;
    var redo = () => { for (var row of this.data) row.splice(n, 0, '') }
    var undo = () => { for (var row of this.data) row.splice(n, 1) }
    this.create(redo, undo);
  }
  insertRow(n) {
    var redo = () => { this.data.splice(n, 0, Array(this.width).fill('')) }
    var undo = () => { this.data.splice(n, 1); }
    this.create(redo, undo);
  }

  pushCol() {
    var redo = () => { for (var row of this.data) row.push('') }
    var undo = () => { for (var row of this.data) row.pop() }
    this.create(redo, undo);
  }
  pushRow() {
    var redo = () => { this.data.push(Array(this.width).fill('')) }
    var undo = () => { this.data.pop() }
    this.create(redo, undo);
  }
  edit(x, y, n) {
    if (this.lock) return;
    var o = this.get(x, y);
    if (stg.autoRound) {
      try {
        var array = String(n).split('=');
        array[array.length - 1] = round(array[array.length - 1], false);
        n = array.join('=');
      } catch (e) {
        console.log(e)
        throw new Error("edit error n = " + n)
      }
    }
    if (n === o) return;
    while (this.width <= x) this.pushCol();
    while (this.height <= y) this.pushRow();
    var redo = () => this.data[y][x] = n;
    var undo = () => this.data[y][x] = o;
    this.create(redo, undo);
  }

  create(r, u) {
    if (this.lock) return;
    var action = { t: Date.now(), redo: r, undo: u }; r();
    this.undoStack.push(action);
    this.redoStack = [];
    this.isSaved = false;
  }

  undo() {
    var prev, action;
    do {
      if (this.undoStack.length < 1) return;
      action = this.undoStack.pop();
      action.undo();
      this.redoStack.push(action);
      prev = this.undoStack[this.undoStack.length - 1];
    } while (prev && action.t - prev.t < Dataframe.MS_DELTA);
    this.isSaved = false;
  }
  redo() {
    var prev, action;
    do {
      if (this.redoStack.length < 1) return;
      var action = this.redoStack.pop();
      action.redo();
      this.undoStack.push(action);
      var next = this.redoStack[this.redoStack.length - 1];
    } while (next && next.t - action.t < Dataframe.MS_DELTA);
    this.isSaved = false;
  }
  square() {
    if (this.lock) return;
    var m = 1;
    for (var row of this.data) m = Math.max(m, row.length);
    for (var row of this.data) while (row.length < m) row.push("");
  }

  get width() { return (this.data.length > 0) ? this.data[0].length : 0 }
  get height() { return this.data.length }

}

Object.defineProperty(Dataframe, 'MS_DELTA', { value: 100 });




export { Dataframe };
