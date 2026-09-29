/**
 * Xclusive Hotel Manager - Google Apps Script backend.
 * Supports both the current flat sale payload and the older {type, records} envelope.
 * Deploy as a Web App: execute as Me, access Anyone.
 */
var SPREADSHEET_ID = '';
var SHEET_NAME = 'Xclusive Hotel Data';
var LAGOS_TZ = 'Africa/Lagos';

function setup() {
  var ss = SpreadsheetApp.create(SHEET_NAME);
  SPREADSHEET_ID = ss.getId();
  ensureSheet_(ss, 'Reception', ['Date','Receipt No','Guest Name','Phone','Room Number','Category','Stay Type','Check-in','Check-out','Total','Payment Method','Ref No','Attendant','Sync Time','Sale ID','Status','Checked Out At']);
  ensureSheet_(ss, 'Bar', ['Date','Receipt No','Item','Qty','Unit Price','Total','Payment Method','Ref No','Attendant','Sync Time','Sale ID','Status']);
  ensureSheet_(ss, 'Kitchen', ['Date','Receipt No','Item','Qty','Unit Price','Total','Payment Method','Ref No','Attendant','Sync Time','Sale ID','Status']);
  ensureSheet_(ss, 'Game', ['Date','Receipt No','Customer','Game Type','Duration (hrs)','Unit Price','Total','Payment Method','Attendant','Start Time','End Time','Sync Time','Sale ID','Status']);
  ensureSheet_(ss, 'Stock', ['Date','Stock ID','Department','Item','Qty Added','Attendant','Sync Time']);
  ensureSheet_(ss, 'CONFIG_DEPARTMENTS', ['ID','Name','Active','Color']);
  ensureSheet_(ss, 'PRICES', ['Department','Item ID','Item Name','Price','Active']);
  ensureSheet_(ss, 'ROOM_SETTINGS', ['Room Number','Room Name','Short Rest Enabled','Updated At']);
  ensureSheet_(ss, 'DAILY_HISTORY', ['Date','Reception Total','Bar Total','Kitchen Total','Game Total','Grand Total','Cash Total','POS Total','Transfer Total','Rooms Occupied','Total Sales Count']);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', SPREADSHEET_ID);
  createTimeTrigger();
  return ss.getUrl();
}

function getSS_() {
  var id = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Spreadsheet is not configured. Run setup() once.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function lagosDate_(date) { return Utilities.formatDate(date || new Date(), LAGOS_TZ, 'yyyy-MM-dd'); }
function lagosDateOffset_(days) {
  var d = new Date();
  d.setDate(d.getDate() + days);
  return lagosDate_(d);
}
function nowLagos_() { return Utilities.formatDate(new Date(), LAGOS_TZ, 'yyyy-MM-dd HH:mm:ss'); }
function dateKey_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, LAGOS_TZ, 'yyyy-MM-dd');
  var s = String(value || '');
  var m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'status';
  if (action === 'getConfig') return json_(getConfig_());
  if (action === 'getDailyHistory') return json_(getDailyHistory_());
  return json_({ status: 'ok', message: 'Xclusive Hotel API live', time: nowLagos_() });
}

function getConfig_() {
  var ss = getSS_(), departments = [], prices = {};
  var ds = ss.getSheetByName('CONFIG_DEPARTMENTS');
  if (ds && ds.getLastRow() > 1) ds.getRange(2,1,ds.getLastRow()-1,4).getValues().forEach(function(r){ departments.push({id:r[0],name:r[1],active:r[2]===true,color:r[3]}); });
  var ps = ss.getSheetByName('PRICES');
  if (ps && ps.getLastRow() > 1) ps.getRange(2,1,ps.getLastRow()-1,5).getValues().forEach(function(r){ if(!prices[r[0]]) prices[r[0]]=[]; prices[r[0]].push({id:r[1],name:r[2],price:r[3],active:r[4]===true}); });
  return { departments: departments, prices: prices, timestamp: new Date().toISOString() };
}

function getDailyHistory_() {
  var s = getSS_().getSheetByName('DAILY_HISTORY');
  if (!s || s.getLastRow() <= 1) return { history: [] };
  return { history: s.getRange(2,1,s.getLastRow()-1,11).getValues().map(function(r){ return {date:dateKey_(r[0]),reception:r[1],bar:r[2],kitchen:r[3],game:r[4],grandTotal:r[5],cash:r[6],pos:r[7],transfer:r[8],roomsOccupied:r[9],salesCount:r[10]}; }) };
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var ss = getSS_(), now = new Date().toISOString();
    if (body.type && body.records) {
      var type = String(body.type).toLowerCase();
      if (type === 'reception') writeReception_(ss, body.records, now);
      else if (type === 'bar' || type === 'kitchen') writeItemSales_(ss, type, body.records, now);
      else if (type === 'games' || type === 'game') writeGameSales_(ss, body.records, now);
      else if (type === 'stock') writeStock_(ss, body.records, now);
      else if (type === 'prices') writePrices_(ss, body.records);
      else if (type === 'room_settings') writeRoomSettings_(ss, body.rooms || [], now);
      else return json_({success:false,error:'Unknown type: '+body.type});
      return json_({success:true,synced:body.records.length||0,timestamp:now});
    }
    if (body.room_settings || body.rooms) { writeRoomSettings_(ss, body.rooms || body.room_settings, now); return json_({success:true,synced:1,timestamp:now}); }
    if (body.type === 'prices') { writePrices_(ss, body.records || {}); return json_({success:true,synced:0,timestamp:now}); }
    if (body.department || body.itemName || body.roomNumber || body.gameType) {
      var dept = String(body.department || 'reception').toLowerCase();
      if (dept === 'game') dept = 'games';
      if (dept === 'reception') writeReception_(ss,[body],now);
      else if (dept === 'bar' || dept === 'kitchen') writeItemSales_(ss,dept,[body],now);
      else if (dept === 'games') writeGameSales_(ss,[body],now);
      return json_({success:true,synced:1,timestamp:now});
    }
    return json_({success:false,error:'No supported payload found'});
  } catch (err) { return json_({success:false,error:String(err)}); }
}

function writeReception_(ss, records, now) {
  var s=ensureSheet_(ss,'Reception',null); var rows=records.map(function(r){ return [r.dateStr||lagosDate_(),r.receiptNo||r.id||'',r.guestName||r.customerName||'',r.phone||'',r.roomNumber||'',r.categoryName||r.categoryId||'',r.stayType||'',r.checkIn||r.timeStarted||'',r.checkOut||'',Number(r.total!=null?r.total:r.amount)||0,r.paymentMethod||'Cash',r.refNo||'',r.attendant||r.soldBy||'',now,r.id||'',r.status||'paid',r.checkedOutAt||'']; });
  appendUnique_(s,rows,15);
}
function writeItemSales_(ss, dept, records, now) {
  var s=ensureSheet_(ss,dept==='bar'?'Bar':'Kitchen',null); var rows=records.map(function(r){ return [r.dateStr||lagosDate_(),r.receiptNo||r.id||'',r.itemName||'',Number(r.qty!=null?r.qty:r.quantity)||1,Number(r.unitPrice)||0,Number(r.total!=null?r.total:r.amount)||0,r.paymentMethod||'Cash',r.refNo||'',r.attendant||r.soldBy||'',now,r.id||'',r.status||'paid']; });
  appendUnique_(s,rows,11);
}
function writeGameSales_(ss, records, now) {
  var s=ensureSheet_(ss,'Game',null); var rows=records.map(function(r){ return [r.dateStr||lagosDate_(),r.receiptNo||r.id||'',r.customerName||'',r.gameType||r.itemName||'',Number(r.duration)||1,Number(r.unitPrice)||0,Number(r.total!=null?r.total:r.amount)||0,r.paymentMethod||'Cash',r.attendant||r.soldBy||'',r.startTime||r.timeStarted||'',r.endTime||'',now,r.id||'',r.status||'paid']; });
  appendUnique_(s,rows,13);
}
function appendUnique_(sheet, rows, idColumn) {
  if (!rows.length) return;
  var existing={};
  if(sheet.getLastRow()>1) sheet.getRange(2,idColumn,sheet.getLastRow()-1,1).getValues().forEach(function(r){ existing[String(r[0])]=true; });
  var fresh=rows.filter(function(r){ var id=String(r[idColumn-1]||''); if(!id || existing[id]) return false; existing[id]=true; return true; });
  if(fresh.length) sheet.getRange(sheet.getLastRow()+1,1,fresh.length,fresh[0].length).setValues(fresh);
}
function writeStock_(ss, records, now) {
  var s=ensureSheet_(ss,'Stock',null); var rows=records.map(function(r){ return [r.dateStr||lagosDate_(),r.id||'',r.department||'',r.itemName||r.name||'',Number(r.qty)||0,r.attendant||r.soldBy||'',now]; });
  if(rows.length) s.getRange(s.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
}
function writeRoomSettings_(ss, rooms, now) {
  var s=ensureSheet_(ss,'ROOM_SETTINGS',null); if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,4).clearContent();
  var rows=(rooms||[]).map(function(r){return [r.number||'',r.name||'',r.shortRestEnabled===true,now];}); if(rows.length)s.getRange(2,1,rows.length,4).setValues(rows);
}
function writePrices_(ss, records) {
  var s=ensureSheet_(ss,'PRICES',null); if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,5).clearContent(); var rows=[];
  Object.keys(records||{}).forEach(function(d){(records[d]||[]).forEach(function(i){rows.push([d,i.id,i.name,i.price,i.active]);});}); if(rows.length)s.getRange(2,1,rows.length,5).setValues(rows);
}

function archiveDay_(ss, date) {
  var archive = ensureSheet_(ss, 'Sales_' + date, ['Date','Department','Sale ID','Receipt No','Item / Room','Qty','Amount','Payment Method','Staff','Customer','Status','Archived At']);
  if (archive.getLastRow() > 1) return;
  var rows = [];
  function addRows(name, dept, mapper) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(function (r) {
      if (dateKey_(r[0]) === date) rows.push(mapper(r));
    });
  }
  addRows('Reception', 'reception', function (r) { return [date, 'reception', r[14] || '', r[1] || '', 'Room ' + (r[4] || ''), 1, r[9] || 0, r[10] || '', r[12] || '', r[2] || '', r[15] || 'paid', nowLagos_()]; });
  ['Bar', 'Kitchen'].forEach(function (name) { addRows(name, name.toLowerCase(), function (r) { return [date, name.toLowerCase(), r[10] || '', r[1] || '', r[2] || '', r[3] || 1, r[5] || 0, r[6] || '', r[8] || '', '', r[11] || 'paid', nowLagos_()]; }); });
  addRows('Game', 'games', function (r) { return [date, 'games', r[12] || '', r[1] || '', r[3] || '', r[4] || 1, r[6] || 0, r[7] || '', r[8] || '', r[2] || '', r[13] || 'paid', nowLagos_()]; });
  if (rows.length) { archive.getRange(2, 1, rows.length, rows[0].length).setValues(rows); archive.getRange(2, 1, rows.length, 12).setBackground('#eeeeee'); }
}
function midnightReset() {
  var ss=getSS_(), date=lagosDateOffset_(-1), hist=ensureSheet_(ss,'DAILY_HISTORY',null);
  archiveDay_(ss,date);
  var existing=false; if(hist.getLastRow()>1) hist.getRange(2,1,hist.getLastRow()-1,1).getValues().forEach(function(r){if(dateKey_(r[0])===date)existing=true;});
  if(existing)return;
  var t={reception:0,bar:0,kitchen:0,game:0,cash:0,pos:0,transfer:0,salesCount:0,roomsOccupied:0};
  function pay(amount,method){var m=String(method||'cash').toLowerCase(); if(m==='cash')t.cash+=Number(amount)||0; else if(m==='pos')t.pos+=Number(amount)||0; else if(m==='transfer')t.transfer+=Number(amount)||0;}
  function scan(name,dept,amountCol,paymentCol,checkoutCol){var s=ss.getSheetByName(name);if(!s||s.getLastRow()<=1)return;s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getValues().forEach(function(r){if(dateKey_(r[0])!==date)return;t[dept]+=Number(r[amountCol])||0;t.salesCount++;pay(r[amountCol],r[paymentCol]);if(name==='Reception'&&!r[checkoutCol])t.roomsOccupied++;});}
  scan('Reception','reception',9,10,16); scan('Bar','bar',5,6,-1); scan('Kitchen','kitchen',5,6,-1); scan('Game','game',6,7,-1);
  hist.appendRow([date,t.reception,t.bar,t.kitchen,t.game,t.reception+t.bar+t.kitchen+t.game,t.cash,t.pos,t.transfer,t.roomsOccupied,t.salesCount]);
}
function createTimeTrigger(){ ScriptApp.getProjectTriggers().forEach(function(t){ScriptApp.deleteTrigger(t);}); ScriptApp.newTrigger('midnightReset').timeBased().everyDays(1).atHour(0).nearMinute(5).inTimezone(LAGOS_TZ).create(); }
