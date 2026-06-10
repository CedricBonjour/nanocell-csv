function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function qid(id) { return document.querySelector(id).click(); }

var time_start = Date.now(); // Point A



csvHandle.reloadFile(true);
await sleep(200);
stg.theme = "light";
sheet.fixTop = false;
sheet.x = 0;
sheet.y = 0;
stg.rows = 15;
stg.cols = 10;
sheet.nViewCols = stg.cols;
sheet.nViewRows = stg.rows;
sheet.colWidthList = [];
sheet.reload();
sheet.slctRefresh();


await sleep(2000);
for (i = 0; i < 10; i++) { sheet.nViewRows++; sheet.reload(); await sleep(7); }
await sleep(260);
for (i = 0; i < 6; i++) { sheet.nViewRows++; sheet.reload(); await sleep(7); }
await sleep(260);
sheet.fixTop = true; 
sheet.reload();
await sleep(440);

await sleep(440);
sheet.fitWidth();
await sleep(440);


for (i = 0; i < 20; i++) { sheet.baseY ++;sheet.slctRefresh(false); await sleep(7); }
await sleep(260);
for (i = 0; i < 30; i++) { sheet.baseY --;sheet.slctRefresh(false); await sleep(7); }


sheet.x = 0;
sheet.y = 0;
sheet.refresh();
await sleep(260);
sheet.insert(3); //left 
await sleep(600);
sheet.x = 0;
sheet.y = 0;
sheet.slctRefresh();
await sleep(260);
sheet.input("i");
await sleep(200);
sheet.inputField.value += "d";
await sleep(200);
sheet.inputField.blur();
sheet.y++;
sheet.slctRefresh();
sheet.refresh();
await sleep(440);

sheet.slctRange = true;
sheet.y = sheet.df.height-1;
sheet.slctRange = false;
sheet.slctRefresh(true);
await sleep(440);
for (i = 0; i < 7; i++) { sheet.baseY ++;sheet.slctRefresh(false); await sleep(7); }
await sleep(260);
sheet.expand();
sheet.refresh();
await sleep(440);
sheet.y=0;
sheet.slctRefresh(true);
await sleep(440);
for (i = 0; i < 3; i++) { sheet.x++;sheet.slctRefresh(true); await sleep(40); }
await sleep(440);
sheet.sort(sheet.x, true);
await sleep(600);
for (i = 0; i < 3; i++) { sheet.x++;sheet.slctRefresh(true); await sleep(40); }
await sleep(440);
sheet.slctCol(sheet.x);
await sleep(440);
cmd.integer.run();
await sleep(440);
cmd.decimal.run();
await sleep(440);
for (i = 0; i < 10; i++) { sheet.baseY ++;sheet.slctRefresh(false); await sleep(3); }
await sleep(440);

qid('img[title="about"]');
await sleep(3000);
qid('#closeDialog');



var time_end = Date.now();   // Point B
console.log(`Time elapsed: ${time_end - time_start} ms`);

