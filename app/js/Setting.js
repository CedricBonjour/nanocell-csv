import { cmd } from './cmd.js';
import { dom } from './dom.js';
import { sheet } from './main.js';
import { BoolInput } from './ui/input/BoolInput.js';
import { ListInput } from './ui/input/ListInput.js';
import { NumInput } from './ui/input/NumInput.js';

var stg = {};


class Setting {
  constructor(s) {
    var stored_val = localStorage.getItem(s.key);
    if (!(isNaN(stored_val) || stored_val == null)) stored_val = Number(stored_val);
    if (stored_val == "true") stored_val = true;
    if (stored_val == "false") stored_val = false;
    this.key = s.key;
    this.value = (stored_val === null) ? s.dflt : stored_val;
    this.cb = s.cb;
    Object.defineProperty(stg, this.key, {
      get: () => { return this.value },
      set: (e) => {
        this.value = e;
        localStorage.setItem(this.key, e);
        if (this.cb) this.cb(this.value);
      }
    });
    if(s.key=="theme" && stored_val===null && window.matchMedia('(prefers-color-scheme: dark)').matches) this.value = "night";
  }



  static init(cb) { for (var s of Setting.list) if (!s.title) new Setting(s); }


  static build(setting) {
    var row = document.createElement("tr");
    var name = document.createElement("td");
    if (setting.title) {
      var title = document.createElement("h3");
      title.innerHTML = setting.title;
      name.appendChild(title);
      row.appendChild(name);
      return row;
    }


    var inputCell = document.createElement("td");
    name.innerHTML = setting.name;
    var input = undefined;
    if (setting.list) input = new ListInput(setting.list, setting.hide);
    else if (setting.max) {
      input = new NumInput(setting.dflt, setting.min, setting.max);
    } else if (typeof setting.dflt === "boolean") {
      input = new BoolInput();
    }


    if (input === undefined) {
      input = document.createElement("span");
      input.innerText = stg[setting.key];
    } else {
      input.value = stg[setting.key];
      input.onchange = e => { var c = e.target.value; stg[setting.key] = isNaN(c) ? c : Number(c) }
    }
    inputCell.appendChild(input);
    row.appendChild(name);
    row.appendChild(inputCell);
    return row;
  }


  static show() {
    var content = document.createElement("div");
    var title = document.createElement("h1")
    title.innerHTML = "Settings";
    content.appendChild(title);
    content.style.margin = "2em";
    content.classList.add("stg");
    var table = document.createElement("table");
    for (var s of Setting.list) table.appendChild(Setting.build(s));
    var b = document.createElement("button");
    b.innerHTML = "Reset to default settings";
    b.style.marginTop = "1em"
    b.onclick = Setting.resetDefault;
    content.appendChild(table);
    content.appendChild(b);
    dom.dialog.push(content, true);
  }


  static setTheme() {
    dom.theme.href = "css/themes/" + stg.theme + ".css";
    dom.palette.href = "css/palettes/" + stg.theme + ".css";
  }

  static log() {
    for (var i = 0; i < localStorage.length; i++)
      console.log(localStorage.key(i), " >> ", (localStorage.getItem(localStorage.key(i))));
  }

  static runAll() {
    for (var s of Setting.list) if (s.key) stg[s.key] = stg[s.key];
  }


  static resetDefault() {
    localStorage.clear();
    for (var s of Setting.list) if (s.key) stg[s.key] = s.dflt;
    cmd.settings.run();
  }

}

Object.defineProperty(Setting, 'list', {value: [
{title:"Appearance"},
    {key:"theme"                    ,dflt:"light"       ,name:"Theme", list:[ "light" , "night", "dark"],hide:true, cb:Setting.setTheme},
    {key:"font"                     ,dflt:13            ,name:"Font Size",   min:7, max:24 ,cb:n=>{dom.body.style.fontSize = n+"px"; }   },
    {key:"rows"                     ,dflt:25            ,name:"Rows",        min:10, max:60,cb:n=>{if (sheet)sheet.reload()}   },
    {key:"cols"                     ,dflt:7             ,name:"Cols",        min:3, max:30 ,cb:n=>{if (sheet)sheet.reload()} },
    {key:"actionBar"                ,dflt:true          ,name:"Action Bar",                 cb:b=>{dom.header.style.display = b? "flex":"none"} },
    {key:"purple"                   ,dflt:true          ,name:"Warning color on line return, comma and double quote values", cb:b=>{sheet.reload()} },

{title:"Csv Save"},
    {key:"encoding"                 ,dflt:"utf-8"       ,name:"Encoding"},
    {key:"delimiter"                ,dflt:","           ,name:"Delimiter", list:[",", ";", "TAB", "|"], hide:true},
    {key:"save_fixed_width_size"    ,dflt:0             ,name:"Minimum column size",        min:0, max: 100  },
    {key:"save_strict"              ,dflt:false         ,name:"Save-Strict (error on comma  or double quotes)"},
{title:"Csv Open"},
    {key:"fit_col_width"            ,dflt:false          ,name:"Fit column width" },
    {key:"set_headers"              ,dflt:true          ,name:"Set headers" },
    {key:"trim"                     ,dflt:false          ,name:"Remove empty rows and columns" },

{title:"Data Validation"},
    {key:"dv_comma_num"             ,dflt:true          ,name:"In numeric values : replace commas by a dot"},
    {key:"dv_comma_txt"             ,dflt:true          ,name:"In text values : replace commas by a dash "},
    {key:"dv_quotes"                ,dflt:true          ,name:"Replace double quotes by single quotes"},
    {key:"dv_lr"                    ,dflt:true          ,name:"Replace line returns by a pipe (|)"},
    {key:"dv_lower"                 ,dflt:false         ,name:"Force all text to lower case"},
    
{title:"Csv View Only"},
    {key:"editMaxFileSize"          ,dflt: 10           ,name:"Max editable file size (Mo)"},
    {key:"vo_n_chunks"              ,dflt: 5            ,name:"Number of chunks loaded",           min:5, max:50  },
    {key:"vo_n_rows"                ,dflt: 10           ,name:"Number of rows per chunk loaded",   min:3, max:50  },

{title:"Sort"},
    {key:"sort_header"              ,dflt:true          ,name:"Ignore 1st row (header row)"},
    {key:"sort_num_first"           ,dflt:false         ,name:"Numbers are sorted before text"},


]});
 

export { Setting, stg };
