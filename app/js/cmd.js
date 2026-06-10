import { About } from './About.js';
import { dom } from './dom.js';
import { sheet, csvHandle } from './main.js';
import { Setting, stg } from './Setting.js';
import { Shortcuts } from './Shortcuts.js';
import { round } from './utils/misc.js';

const  cmd = {
    about           :{k:"H"    ,ctrl:true, run(){new About()}, description:"About"},
    new             :{k:"N"    ,ctrl:true, run(){csvHandle.new()}, description:"New sheet"},
    deleteRow       :{k:"BACKSPACE",ctrl:true, run(){sheet.deleteRows()}, description:"Delete Row"},
    deleteCol       :{k:"BACKSPACE",ctrl:true,shift:true, run(){sheet.deleteCols()}, description:"Delete Col"},
    delete          :{k:"BACKSPACE",run(){sheet.rangeEdit('');sheet.refresh() }, description:"Delete Selection"},
    delete2         :{k:"DELETE",run(){sheet.rangeEdit('');sheet.refresh() }, description:"Delete Selection"},
    settings        :{k:"G"    ,ctrl:true, run(){Setting.show()}, description:"Display Settings"},
    shortcuts       :{k:"K"    ,ctrl:true, run(){new Shortcuts()}, description:"Display Shortcuts"},
    slctAll         :{k:"A"    ,ctrl:true, run(){sheet.slctAll()}, description:"Select All"},
    transpose       :{k:"T"    ,ctrl:true, shift:true, run(){sheet.rangeTranspose();sheet.refresh()}, description:"Transpose Selection"},
    trim            :{k:"T"    ,ctrl:true, shift:true, run(){sheet.df.trimAll();sheet.refresh()}, description:"Trim : remove all empty rows/cols"},
    integer         :{k:"I"    ,ctrl:true, run(){sheet.round(true);sheet.refresh()}, description:"Round selection to integer"},
    decimal         :{k:"$"    ,ctrl:true, run(){sheet.round(false);sheet.refresh()}, description:"Round selection to decimal"},
    fixTop          :{k:"B"    ,ctrl:true, run(){sheet.fixTop = !sheet.fixTop;sheet.refresh()}, description:"Fix Header Top"},
    fixLeft         :{k:"B"    ,ctrl:true, shift:true, run(){sheet.fixLeft = !sheet.fixLeft;sheet.refresh()}, description:"Fix Header Left"},
    fit_width       :{k:"W"    ,ctrl:true, run(){sheet.fitWidth();sheet.refresh()}, description:"Fix Header Left"},
    undo            :{k:"Z"    ,ctrl:true, run(){sheet.df.undo();sheet.refresh()}, description:"Undo"},
    redo            :{k:"Z"    ,ctrl:true, shift:true, run(){sheet.df.redo();sheet.refresh()}, description:"Redo"},
    redo2           :{k:"Y"    ,ctrl:true, run(){sheet.df.redo();sheet.refresh()}, description:"Redo"},
    date            :{k:"T"    ,ctrl:true, run(){sheet.rangeEdit( (new Date()).getFormated("yyyy-mm-dd") );sheet.refresh() }, description:"Insert today's date"},
    find            :{k:"F"    ,ctrl:true, run(){sheet.finder.findMenu(sheet.getSlctFirstValue(),false); sheet.scrollbarRefresh();}, description:"Quick find / match"},
    findAdvanced    :{k:"F"    ,ctrl:true, shift:true,run(){sheet.finder.findMenu(sheet.getSlctFirstValue(),true)}, description:"Advanced find / replace (work in progress)"},
    menubar         :{k:"M"    ,ctrl:true, run(){stg.actionBar = !stg.actionBar }, description:"Toggle action bar display"},
    open            :{k:"O"    ,ctrl:true, run(){csvHandle.open()}, description:"Open a CSV file from the file finder"},
    save            :{k:"S"    ,ctrl:true, run(){csvHandle.save()}, description:"Save"},
    saveAs          :{k:"S"    ,ctrl:true, shift:true, run(){csvHandle.saveAs()}, description:"Save As"},
    reloadFile      :{k:"R"    ,ctrl:true, run(){csvHandle.reloadFile()}, description:"Reload file from last save"},
    expand          :{k:"E"    ,ctrl:true, run(){sheet.expand()}, description:"Expand first row to selection"},
    validate_data   :{k:"P"    ,ctrl:true, run(){sheet.validate_data()}, description:"Validate and format data to respect csv standards"},
    validate_headers:{k:"H"    ,ctrl:true, shift:true, run(){sheet.validate_headers()}, description:"Validate and format header to respect SQL standards"},
    next_occurance  :{k:"D"    ,ctrl:true, run(){sheet.go_to_next()}, description:"Go to next occurence of cell value"},
    sort            :{k:"L"    ,ctrl:true, run(){sheet.sort(sheet.x, true)}, description:"Sort rows based on active column (ascending order)"},
    sort_reverse    :{k:"L"    ,ctrl:true, shift:true, run(){sheet.sort(sheet.x, false)}, description:"Sort rows based on active column (descending order)"},

    
    shiftUp         :{k:"ARROWUP"    ,alt:true, run(dir){sheet.shift(0)}, description:"Shift row up"},
    shiftDown       :{k:"ARROWDOWN"  ,alt:true, run(dir){sheet.shift(2)}, description:"Shift row down"},
    shiftRight      :{k:"ARROWRIGHT" ,alt:true, run(dir){sheet.shift(1)}, description:"Shift col right"},
    shiftLeft       :{k:"ARROWLEFT"  ,alt:true, run(dir){sheet.shift(3)}, description:"Shift col left"},


    insertUp        :{k:"ARROWUP"    ,alt:true, shift:true, run(dir){sheet.insert(0)}, description:"Insert row above"},
    insertDown      :{k:"ARROWDOWN"  ,alt:true, shift:true, run(dir){sheet.insert(2)}, description:"Insert row below"},
    insertRight     :{k:"ARROWRIGHT" ,alt:true, shift:true, run(dir){sheet.insert(1)}, description:"Insert col right"},
    insertLeft      :{k:"ARROWLEFT"  ,alt:true, shift:true, run(dir){sheet.insert(3)}, description:"Insert col left"},

    // the following is just for documentation formating but does nothing
    scrollLeft      :{k:"scroll ARROWUP "  ,alt:true,  description:"Scroll left"},
    scrollRight     :{k:"scroll ARROWDOWN "  ,alt:true,  description:"Scroll right"},


}


function buildCommands() {
  for (var c of Object.values(cmd)) {
    if (!c.ctrl) c.ctrl = false;
    if (!c.shift) c.shift = false;
    if (!c.alt) c.alt = false;
  }
}


function buildMenu() {
  var menuItems = [
    "new", "open", "save", "reloadFile", "",
    "undo", "redo", "fixLeft", "fixTop","fit_width", "sort", "sort_reverse", "transpose", "trim", "date", "integer", "decimal","validate_headers",  "validate_data",
    "", "find", "about", "settings", "shortcuts"];
  function buildMenuItem(item) {
    if (item === "") return dom.header.appendChild(document.createElement("hr"));
    var img = document.createElement("img");
    img.src = "icn/menu/" + item + ".svg";
    img.setAttribute("title", item);
    img.addEventListener("click", function () { cmd[item].run() })
    dom.header.appendChild(img);
  }
  for (var m of menuItems) buildMenuItem(m);

}











export { cmd, buildCommands, buildMenu };
