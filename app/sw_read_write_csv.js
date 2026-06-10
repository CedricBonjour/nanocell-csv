const CHUNK_SIZE = 500 * 1000; // = 500ko
const n_chars_for_separator_detection = 500;


function separatorDetection(txt) {
  if (txt.length > n_chars_for_separator_detection) txt = txt.substring(0, n_chars_for_separator_detection)
  let d = [',', '\t', ';', ':', '|']
  let n = [0, 0, 0, 0, 0]
  for (var i = 0; i < txt.length; i++) {
    for (var j = 0; j < d.length; j++) {
      if (txt[i] == d[j]) n[j]++;
    }
  }
  return d[n.indexOf(Math.max(...n))]
}

function csv_parse(s, d = ",") {
  var rows = [];
  var lr = '\n'
  var v = [];     //value characters;
  var q = '"';    //quote
  var f = false;  //force
  var len = s.length;
  var c, j;
  for (var i = 0; i < len; i++) {
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
    var r = [];     //result;
    var q = '"';    //quote
    var f = false;  //force
    var len = s.length;
    var c, j;
    for (var i = 0; i < len; i++) {
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

function loadcsv(data) {
  if (data.viewOnly) return load_csv_view_only(data);
  let file = data.file;
  console.log("reading chunk size : ", CHUNK_SIZE)
  console.log("sw loading : ", file.name)
  let fileSize = file.size;
  let offset = 0
  let iteration = 0;
  let sep = ';'
  let rowCount = 0;
  let prepend = "";
  let reader = new FileReader();
  reader.onloadend = e => {
    iteration++;
    let result = e.target.result;
    let status = offset / fileSize;
    if (iteration == 1) sep = separatorDetection(result);
    else result = prepend + result;
    if (status < 1) {
      let increment = result.length - 1
      while (result[increment] != '\n' && increment > 0) increment--;
      if (increment > 0) {
        prepend = result.slice(increment + 1)
        result = result.slice(0, increment)
      } else {
        console.log("Warning : case where a row seems longer than the chunk loaded size")
        prepend = result;
        return seek()
      }
    }
    let matrix = csv_parse(result, sep);
    rowCount += matrix.length;
    postMessage({
      cmd: "chunk_loaded",
      status: status,
      chunk: matrix,
      chunk_id: iteration,
      viewOnly: false,
      sep: sep,
      rowCount: rowCount
    })
    if (offset / fileSize < 1) seek()
  };
  function seek() {
    reader.readAsText(file.slice(offset, offset + CHUNK_SIZE), "utf-8");
    offset += CHUNK_SIZE;
  }
  seek()
}

function load_csv_view_only(data) {
  let file = data.file;
  console.log("reading chunk size : ", CHUNK_SIZE);
  console.log("sw loading view only : ", file.name);
  let fileSize = file.size;
  let sep = ';'
  let reader = new FileReader();
  let iteration = 0;
  let vo_n_chunks = data.n_chunks;
  let vo_n_rows = data.n_rows;
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
      matrix[0] = []
      for (var i = 0; i < matrix[1].length; i++)  matrix[0].push("! [...] !")
    }

    postMessage({
      cmd: "chunk_loaded",
      status: status,
      chunk: matrix,
      chunk_id: iteration,
      viewOnly: true,
      sep: sep,
      rowCount: 0
    })
    if (iteration < lastIteration) seek()
  };

  function seek() {
    iteration++;
    let offset = (iteration - 1) * (fileSize / vo_n_chunks);
    if (iteration == lastIteration) reader.readAsText(file.slice(file.size - CHUNK_SIZE, file.size), "utf-8");
    else reader.readAsText(file.slice(offset, offset + CHUNK_SIZE), "utf-8");
  }

  seek()
}

addEventListener("message", e => {
  switch (e.data.cmd) {
    case "read": loadcsv(e.data.data)
  }
})

