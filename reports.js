import { getAllSales, getAllStaff, todayStr } from './db.js';
import { formatCurrency, getDepartmentById } from './config.js';
import { getIcon } from './icons.js';

function el(tag, cls='', html=''){const e=document.createElement(tag);if(cls)e.className=cls;if(html)e.innerHTML=html;return e;}
function $(s,p=document){return p.querySelector(s);}
const deptName=id=>getDepartmentById(id)?.shortName || (id==='reception'?'Room':id||'—');
const money=n=>formatCurrency(n);
const dateOnly=s=>s.dateStr || (s.timeSaved||s.timestamp||'').slice(0,10);
const startOfWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;};
const isoDate=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};

export async function renderReports({ role='admin', username='', title='Reports', canClear=false }={}){
  const root=el('div','dashboard fade-in-up');
  const all=(await getAllSales()).filter(s=>!s.voided);
  const staffList=await getAllStaff();
  const staffNames=Object.fromEntries(staffList.map(s=>[s.username,s.name]));
  const displayStaff=s=>staffNames[s.soldBy||s.username] || s.soldBy || s.username || s.attendant || '—';
  const today=todayStr();
  const reportDept = role==='game' ? 'games' : role;
  const isAdmin=role==='admin', isReception=role==='reception', isDept=['bar','kitchen','games'].includes(reportDept);
  const base=isDept ? all.filter(s=>s.department===reportDept && (s.soldBy||s.username||'')===username) : all;
  const sum=rows=>rows.reduce((a,s)=>a+(Number(s.total)||0),0);
  const todayRows=base.filter(s=>dateOnly(s)===today);
  const now=new Date(), weekStart=isoDate(startOfWeek(now)), monthStart=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, yearStart=`${now.getFullYear()}-01-01`;
  const weekRows=base.filter(s=>dateOnly(s)>=weekStart&&dateOnly(s)<=today);
  const monthRows=base.filter(s=>dateOnly(s)>=monthStart&&dateOnly(s)<=today);
  const yearRows=base.filter(s=>dateOnly(s)>=yearStart&&dateOnly(s)<=today);

  root.appendChild(el('div','section-header',`<div><div class="section-header__title">${title}</div><div style="font-size:12px;color:var(--ink-200);margin-top:4px;">Saved sales from this device</div></div>`));

  const cards=el('div','stat-grid');
  if(isDept){
    cards.appendChild(card('chart','My Sales Today',money(sum(todayRows))));
  } else if(isReception){
    // Reception can inspect rows but not Admin financial rollups.
  } else {
    cards.appendChild(card('chart',"Today's Total",money(sum(todayRows))));
    cards.appendChild(card('chart','This Week',money(sum(weekRows))));
    cards.appendChild(card('chart','This Month',money(sum(monthRows))));
    cards.appendChild(card('chart','This Year',money(sum(yearRows))));
    root.appendChild(cards);
  }
  if(isDept){root.appendChild(cards);}

  if(isAdmin){
    const deptCard=el('div','card');
    deptCard.innerHTML='<div class="section-header"><span class="section-header__title">Sales by Department</span></div>';
    const grid=el('div','stat-grid');
    ['bar','kitchen','games','reception'].forEach(id=>grid.appendChild(card('chart',deptName(id),money(sum(todayRows.filter(s=>s.department===id))))));
    deptCard.appendChild(grid);root.appendChild(deptCard);
  }

  if(isAdmin){
    const itemMap={}, staffMap={};
    todayRows.forEach(s=>{
      const item=s.itemName||s.gameType||(s.roomNumber?`Room ${s.roomNumber}`:'Other');
      if(!itemMap[item])itemMap[item]={qty:0,amount:0};itemMap[item].qty+=Number(s.qty)||1;itemMap[item].amount+=Number(s.total)||0;
      const who=s.soldBy||s.username||s.attendant||'Unknown';
      if(!staffMap[who])staffMap[who]={count:0,amount:0};staffMap[who].count++;staffMap[who].amount+=Number(s.total)||0;
    });
    const highest=Object.entries(itemMap).sort((a,b)=>b[1].qty-a[1].qty)[0];
    const active=Object.entries(staffMap).sort((a,b)=>b[1].count-a[1].count)[0];
    const depts=['bar','kitchen','games','reception'].map(id=>({id,total:sum(todayRows.filter(s=>s.department===id))})).sort((a,b)=>a.total-b.total);
    const lowest=depts[0];
    const insights=el('div','stat-grid');
    insights.appendChild(card('receipt','Highest Selling Item',highest?`${highest[0]} · ${highest[1].qty} sold`: '—'));
    insights.appendChild(card('users','Most Active Staff',active?`${staffNames[active[0]] || active[0]} · ${active[1].count} sales · ${money(active[1].amount)}`:'—'));
    insights.appendChild(card('chart','Lowest Selling Dept',lowest?`${deptName(lowest.id)} · ${money(lowest.total)}`:'—'));
    root.appendChild(insights);
  }

  const filterCard=el('div','card');
  if(isDept){
    filterCard.innerHTML=`<div class="section-header"><span class="section-header__title">My Sales</span></div>`;
  } else {
    filterCard.innerHTML=`<div class="section-header"><span class="section-header__title">Sales Detail</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
        <input class="form-input" id="report-date" type="date" value="${today}">
        <select class="form-input" id="report-dept"><option value="">All Departments</option><option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="games">Game</option><option value="reception">Room</option></select>
        ${isAdmin?'<input class="form-input" id="report-staff" placeholder="Staff username/name">':''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn--ghost" id="report-reset">Reset</button>
        <button class="btn btn--primary" id="report-export">${getIcon('download',18)} Export CSV</button>
        ${canClear?'<button class="btn btn--ghost" id="report-clear">Clear All Sales</button>':''}
      </div>`;
  }
  root.appendChild(filterCard);

  const tableCard=el('div','card'), wrap=el('div','table-wrap');
  wrap.innerHTML='<table><thead><tr><th>S/N</th><th>Staff Name</th><th>Dept</th><th>Item</th><th>Qty</th><th>Amount</th><th>Customer</th><th>Time Started</th><th>Time Saved</th><th>Payment Method</th></tr></thead><tbody id="report-body"></tbody></table>';
  tableCard.appendChild(wrap);root.appendChild(tableCard);
  const body=$('#report-body',root);
  let filtered=[];

  function label(s){return s.roomNumber?`Room ${s.roomNumber}`:s.itemName||s.gameType||s.type||s.department;}
  function renderRows(){
    const date=isDept?today:($('#report-date',root)?.value||today), dep=$('#report-dept',root)?.value||'', q=$('#report-staff',root)?.value.trim().toLowerCase()||'';
    filtered=base.filter(s=>{
      const who=(staffNames[s.soldBy||s.username]||s.soldBy||s.username||s.attendant||'').toLowerCase();
      return (!date||dateOnly(s)===date)&&(!dep||s.department===dep)&&(!q||who.includes(q));
    }).sort((a,b)=>new Date(b.timeSaved||b.timestamp||0)-new Date(a.timeSaved||a.timestamp||0));
    body.innerHTML='';
    if(!filtered.length){body.innerHTML='<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--ink-200);">No sales found.</td></tr>';return;}
    filtered.forEach((s,i)=>{const tr=document.createElement('tr');const fmt=v=>v?new Date(v).toLocaleString('en-NG',{dateStyle:'short',timeStyle:'short'}):'—';tr.innerHTML=`<td>${i+1}</td><td>${displayStaff(s)}</td><td>${deptName(s.department)}</td><td>${label(s)}</td><td>${s.qty||1}</td><td>${money(s.total)}</td><td>${s.customerName||s.guestName||'—'}</td><td>${fmt(s.timeStarted||s.startTime)}</td><td>${fmt(s.timeSaved||s.timestamp)}</td><td>${s.paymentMethod||'—'}</td>`;body.appendChild(tr);});
  }
  if(!isDept){
    ['report-date','report-dept','report-staff'].forEach(id=>{const node=$('#'+id,root);if(node)node.addEventListener(node.tagName==='INPUT'&&node.type!=='date'?'input':'change',renderRows);});
    $('#report-reset',root)?.addEventListener('click',()=>{$('#report-date',root).value=today;$('#report-dept',root).value='';if($('#report-staff',root))$('#report-staff',root).value='';renderRows();});
    $('#report-export',root)?.addEventListener('click',()=>exportCsv(filtered,today,staffNames));
    $('#report-clear',root)?.addEventListener('click',async()=>{if(!confirm('Clear every saved sale on this device? This cannot be undone.'))return;const db=await new Promise((res,rej)=>{const r=indexedDB.open('xclusive_hotel');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});const tx=db.transaction('sales','readwrite');tx.objectStore('sales').clear();tx.oncomplete=()=>location.reload();});
  }
  renderRows();return root;
}
function card(icon,label,value){return el('div','stat-card',`<div class="stat-card__icon">${getIcon(icon,20)}</div><div style="font-size:18px;font-weight:700;color:var(--gold-400);">${value}</div><div class="stat-card__label">${label}</div>`);}
function exportCsv(rows,date,staffNames={}){const h=['S/N','Staff Name','Department','Item','Qty','Amount','Customer','Time Started','Time Saved','Payment Method'];const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;const out=[h.join(','),...rows.map((s,i)=>[i+1,staffNames[s.soldBy||s.username]||s.soldBy||s.username||s.attendant||'',deptName(s.department),s.roomNumber?`Room ${s.roomNumber}`:s.itemName||s.gameType||s.type||'',s.qty||1,s.total||0,s.customerName||s.guestName||'',s.timeStarted||s.startTime||'',s.timeSaved||s.timestamp||'',s.paymentMethod||''].map(esc).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([out],{type:'text/csv'}));a.download=`xclusive-sales-${date||todayStr()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
