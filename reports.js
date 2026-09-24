import { getAllSales, todayStr } from './db.js';
import { formatCurrency, getDepartmentById } from './config.js';
import { getIcon } from './icons.js';

function el(tag, cls='', html='') { const e=document.createElement(tag); if(cls)e.className=cls; if(html)e.innerHTML=html; return e; }
const deptName = id => getDepartmentById(id)?.shortName || (id === 'reception' ? 'Room' : id || '—');

export async function renderReports({ title='Reports', canClear=false } = {}) {
  const root=el('div','dashboard fade-in-up');
  const all=(await getAllSales()).filter(s=>!s.voided);
  const today=todayStr();
  let filtered=all.slice();
  const money=n=>formatCurrency(n);
  const sum=arr=>arr.reduce((a,s)=>a+(Number(s.total)||0),0);
  const dateOnly=s=>s.dateStr || (s.timestamp ? new Date(s.timestamp).toISOString().slice(0,10) : '');
  const todaySales=all.filter(s=>dateOnly(s)===today);
  const now=new Date(); const weekStart=new Date(now); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate()-weekStart.getDay());
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const inRange=(s,start)=>{ const d=new Date(s.timestamp||`${dateOnly(s)}T00:00:00`); return d>=start; };
  const weekSales=all.filter(s=>inRange(s,weekStart)); const monthSales=all.filter(s=>inRange(s,monthStart));

  root.appendChild(el('div','section-header',`<div><div class="section-header__title">${title}</div><div style="font-size:12px;color:var(--ink-200);margin-top:4px;">Live data from this device's IndexedDB sales records</div></div>`));
  const cards=el('div','stat-grid');
  [ ['Today Total Sales',sum(todaySales)], ['This Week',sum(weekSales)], ['This Month',sum(monthSales)] ].forEach(([label,val])=>{
    cards.appendChild(el('div','stat-card',`<div class="stat-card__icon">${getIcon('chart',20)}</div><div style="font-size:20px;font-weight:700;color:var(--gold-400);">${money(val)}</div><div class="stat-card__label">${label}</div>`));
  });
  root.appendChild(cards);

  const deptBox=el('div','card');
  deptBox.innerHTML='<div class="section-header"><span class="section-header__title">Today by Department</span></div>';
  const deptGrid=el('div','stat-grid');
  ['bar','kitchen','games','reception'].forEach(id=>{
    const total=sum(todaySales.filter(s=>s.department===id));
    deptGrid.appendChild(el('div','stat-card',`<div style="font-weight:600;">${id==='reception'?'Room':deptName(id)}</div><div style="font-size:18px;font-weight:700;color:var(--ink-100);margin-top:6px;">${money(total)}</div>`));
  });
  deptBox.appendChild(deptGrid); root.appendChild(deptBox);

  const aggregate=(field)=>{ const m={}; todaySales.forEach(s=>{const k=s[field]||s.itemName||s.gameType||'Unknown'; m[k]=(m[k]||0)+(Number(s.qty)||1);}); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]; };
  const top=aggregate('itemName');
  const staff={}; todaySales.forEach(s=>{const k=s.soldBy||s.username||s.attendant||'Unknown'; if(!staff[k])staff[k]={count:0,amount:0}; staff[k].count++; staff[k].amount+=Number(s.total)||0;});
  const active=Object.entries(staff).sort((a,b)=>b[1].count-a[1].count)[0];
  const insights=el('div','stat-grid');
  insights.appendChild(el('div','stat-card',`<div class="stat-card__label">Highest Selling Item Today</div><div style="font-size:16px;font-weight:700;margin-top:7px;">${top?top[0]:'—'}</div><div class="stat-card__label">${top?`${top[1]} unit(s)`:''}</div>`));
  insights.appendChild(el('div','stat-card',`<div class="stat-card__label">Most Active Staff Today</div><div style="font-size:16px;font-weight:700;margin-top:7px;">${active?active[0]:'—'}</div><div class="stat-card__label">${active?`${active[1].count} sales · ${money(active[1].amount)}`:''}</div>`));
  root.appendChild(insights);

  const filterCard=el('div','card');
  filterCard.innerHTML=`<div class="section-header"><span class="section-header__title">Sales Detail</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;"><input class="form-input" id="report-date" type="date" value="${today}"><select class="form-input" id="report-dept"><option value="">All Departments</option><option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="games">Game</option><option value="reception">Room</option></select><input class="form-input" id="report-staff" placeholder="Staff username/name"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;"><button class="btn btn--ghost" id="report-reset">Reset</button><button class="btn btn--primary" id="report-export">${getIcon('download',18)} Export CSV</button>${canClear?'<button class="btn btn--ghost" id="report-clear">Clear All Sales</button>':''}</div>`;
  root.appendChild(filterCard);
  const tableCard=el('div','card');
  const tableWrap=el('div','table-wrap');
  tableWrap.innerHTML='<table><thead><tr><th>S/N</th><th>Who Sold</th><th>What Item</th><th>Department</th><th>Qty</th><th>Amount</th><th>Customer</th><th>Time Started</th><th>Time Saved</th><th>Payment</th></tr></thead><tbody id="report-body"></tbody></table>';
  tableCard.appendChild(tableWrap); root.appendChild(tableCard);

  const body=$('#report-body',root);
  function label(s){return s.roomNumber?`Room ${s.roomNumber}`:s.itemName||s.gameType||s.type||s.department;}
  function renderRows(){
    const date=$('#report-date',root).value, dep=$('#report-dept',root).value, staffQ=$('#report-staff',root).value.trim().toLowerCase();
    filtered=all.filter(s=>{const d=dateOnly(s); const who=(s.soldBy||s.username||s.attendant||'').toLowerCase(); return (!date||d===date)&&(!dep||s.department===dep)&&(!staffQ||who.includes(staffQ));}).sort((a,b)=>new Date(b.timeSaved||b.timestamp||0)-new Date(a.timeSaved||a.timestamp||0));
    body.innerHTML='';
    if(!filtered.length){body.innerHTML='<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--ink-200);">No sales found for these filters.</td></tr>';return;}
    filtered.forEach((s,i)=>{const tr=document.createElement('tr'); const start=s.timeStarted||s.startTime||''; const saved=s.timeSaved||s.timestamp||''; const fmt=v=>v?new Date(v).toLocaleString('en-NG',{dateStyle:'short',timeStyle:'short'}):'—'; tr.innerHTML=`<td>${i+1}</td><td>${s.soldBy||s.username||s.attendant||'—'}</td><td>${label(s)}</td><td>${deptName(s.department)}</td><td>${s.qty||1}</td><td>${money(s.total)}</td><td>${s.customerName||s.guestName||'—'}</td><td>${fmt(start)}</td><td>${fmt(saved)}</td><td>${s.paymentMethod||'—'}</td>`;body.appendChild(tr);});
  }
  ['report-date','report-dept','report-staff'].forEach(id=>$('#'+id,root).addEventListener(id==='report-staff'?'input':'change',renderRows));
  $('#report-reset',root).addEventListener('click',()=>{ $('#report-date',root).value=today; $('#report-dept',root).value=''; $('#report-staff',root).value=''; renderRows(); });
  $('#report-export',root).addEventListener('click',()=>exportCsv(filtered,today));
  if(canClear) $('#report-clear',root).addEventListener('click',async()=>{ if(!confirm('Clear every saved sale on this device? This cannot be undone.'))return; const db=await (await indexedDB.open('xclusive_hotel')).result; const tx=db.transaction('sales','readwrite'); tx.objectStore('sales').clear(); tx.oncomplete=()=>{alert('Sales cleared. Reloading report.');location.reload();}; });
  renderRows(); return root;
}
function $(s,p){return p.querySelector(s);}
function exportCsv(rows,date){ if(!rows.length)return; const h=['S/N','Who Sold','What Item','Department','Qty','Amount','Customer','Time Started','Time Saved','Payment Method']; const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`; const out=[h.join(','),...rows.map((s,i)=>[i+1,s.soldBy||s.username||s.attendant||'',s.roomNumber?`Room ${s.roomNumber}`:s.itemName||s.gameType||s.type||s.department,s.department,s.qty||1,s.total||0,s.customerName||s.guestName||'',s.timeStarted||s.startTime||'',s.timeSaved||s.timestamp||'',s.paymentMethod||''].map(esc).join(','))].join('\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([out],{type:'text/csv'}));a.download=`xclusive-sales-${date||todayStr()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
