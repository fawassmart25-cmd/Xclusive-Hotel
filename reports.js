import { getAllSales, clearSales } from './db.js';
import { formatCurrency } from './config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deptLabel = d => ({bar:'Bar', kitchen:'Kitchen', game:'Game', games:'Game', reception:'Room', rooms:'Room'}[d] || d || 'Other');
const saleTime = s => s.timeSaved || s.timestamp || '';
const dayKey = d => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Lagos'}).format(x);
};
const today = () => dayKey(new Date());
const startOfWeek = () => { const d=new Date(); const n=d.getDay(); d.setDate(d.getDate()-n); return dayKey(d); };
const monthKey = () => today().slice(0,7);

function validSales(sales) { return sales.filter(s => !s.voided); }
function inRange(s, mode) {
  const k = dayKey(s.timeSaved || s.timestamp);
  if (mode==='today') return k===today();
  if (mode==='week') return k>=startOfWeek() && k<=today();
  if (mode==='month') return k.startsWith(monthKey());
  return true;
}
function aggregate(sales) {
  const byDept={bar:0,kitchen:0,game:0,reception:0};
  sales.forEach(s => { const d=s.department==='games'?'game':s.department; if (d in byDept) byDept[d]+=Number(s.total)||0; });
  return byDept;
}

export async function renderReports({showToast, title='Reports'}={}) {
  let all = validSales(await getAllSales());
  const wrap=document.createElement('div'); wrap.className='reports-page fade-in-up';
  wrap.innerHTML=`
    <div class="section-header"><div><div class="section-header__title">${title}</div><div class="dashboard__date">Saved sales from IndexedDB</div></div>
      <div class="reports-actions"><button class="btn btn--secondary btn--sm" id="clear-report-filters">Clear Filters</button><button class="btn btn--primary btn--sm" id="export-csv">Export to CSV</button></div>
    </div>
    <div class="reports-filters card">
      <label>Date<input class="form-input" id="report-date" type="date"></label>
      <label>Department<select class="form-input" id="report-dept"><option value="">All Departments</option><option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="game">Game</option><option value="reception">Room</option></select></label>
      <label>Staff<select class="form-input" id="report-staff"><option value="">All Staff</option></select></label>
    </div>
    <div class="stat-grid reports-stats" id="report-cards"></div>
    <div class="card" id="report-highlights"></div>
    <div class="card report-table-card"><div class="report-table-wrap"><table class="report-table"><thead><tr><th>S/N</th><th>Who Sold</th><th>What Item</th><th>Department</th><th>Qty</th><th>Amount</th><th>Customer Name</th><th>Time Started</th><th>Time Saved</th><th>Payment Method</th></tr></thead><tbody id="report-body"></tbody></table></div></div>`;
  const body=wrap.querySelector('#report-body'), cards=wrap.querySelector('#report-cards'), highlights=wrap.querySelector('#report-highlights');
  const dateEl=wrap.querySelector('#report-date'), deptEl=wrap.querySelector('#report-dept'), staffEl=wrap.querySelector('#report-staff');
  const staffSet=[...new Set(all.map(s=>s.soldBy||s.username||s.attendant).filter(Boolean))].sort();
  staffSet.forEach(x=>{ const o=document.createElement('option'); o.value=x;o.textContent=x;staffEl.appendChild(o); });

  let filtered=all.slice();
  const render=()=>{
    filtered=all.filter(s=>{
      const dateOk=!dateEl.value || dayKey(s.timeSaved||s.timestamp)===dateEl.value;
      const sd=s.department==='games'?'game':s.department;
      const deptOk=!deptEl.value || sd===deptEl.value;
      const who=s.soldBy||s.username||s.attendant||'';
      return dateOk&&deptOk&&(!staffEl.value||who===staffEl.value);
    }).sort((a,b)=>new Date(saleTime(b))-new Date(saleTime(a)));
    const todaySales=all.filter(s=>inRange(s,'today')), weekSales=all.filter(s=>inRange(s,'week')), monthSales=all.filter(s=>inRange(s,'month'));
    const dept=aggregate(todaySales);
    cards.innerHTML=`
      <div class="stat-card"><div class="stat-card__value">${formatCurrency(todaySales.reduce((a,s)=>a+(+s.total||0),0))}</div><div class="stat-card__label">Today's Total Sales</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatCurrency(dept.bar+dept.kitchen+dept.game+dept.reception)}</div><div class="stat-card__label">Today by Department · B ${formatCurrency(dept.bar)} · K ${formatCurrency(dept.kitchen)} · G ${formatCurrency(dept.game)} · R ${formatCurrency(dept.reception)}</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatCurrency(weekSales.reduce((a,s)=>a+(+s.total||0),0))}</div><div class="stat-card__label">Total Sales This Week</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatCurrency(monthSales.reduce((a,s)=>a+(+s.total||0),0))}</div><div class="stat-card__label">Total Sales This Month</div></div>`;
    const itemMap={}, staffMap={};
    todaySales.forEach(s=>{ const item=s.itemName||s.item||'Unknown'; itemMap[item]=(itemMap[item]||0)+(+s.total||0); const who=s.soldBy||s.username||s.attendant||'Unknown'; if(!staffMap[who])staffMap[who]={count:0,amount:0}; staffMap[who].count++;staffMap[who].amount+=+s.total||0; });
    const topItem=Object.entries(itemMap).sort((a,b)=>b[1]-a[1])[0];
    const topStaff=Object.entries(staffMap).sort((a,b)=>b[1].amount-a[1].amount)[0];
    highlights.innerHTML=`<div class="section-header"><span class="section-header__title">Today's Highlights</span></div><div class="highlight-grid"><div><span>Highest Selling Item Today</span><strong>${topItem?esc(topItem[0])+' · '+formatCurrency(topItem[1]):'No sales yet'}</strong></div><div><span>Most Active Staff Today</span><strong>${topStaff?esc(topStaff[0])+' · '+topStaff[1].count+' sales · '+formatCurrency(topStaff[1].amount):'No sales yet'}</strong></div></div>`;
    body.innerHTML=filtered.length?filtered.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.soldBy||s.username||s.attendant||'')}</td><td>${esc(s.itemName||s.item||'')}</td><td>${esc(deptLabel(s.department))}</td><td>${esc(s.qty||1)}</td><td>${formatCurrency(s.total)}</td><td>${esc(s.customerName||'')}</td><td>${s.timeStarted?new Date(s.timeStarted).toLocaleString('en-NG'):''}</td><td>${saleTime(s)?new Date(saleTime(s)).toLocaleString('en-NG'):''}</td><td>${esc(s.paymentMethod||'')}</td></tr>`).join(''):`<tr><td colspan="10" class="empty-state">No saved sales match the filters.</td></tr>`;
  };
  dateEl.addEventListener('change',render);deptEl.addEventListener('change',render);staffEl.addEventListener('change',render);
  wrap.querySelector('#clear-report-filters').onclick=()=>{dateEl.value='';deptEl.value='';staffEl.value='';render();};
  wrap.querySelector('#export-csv').onclick=()=>{
    const headers=['S/N','Who Sold','What Item','Department','Qty','Amount','Customer Name','Time Started','Time Saved','Payment Method'];
    const rows=filtered.map((s,i)=>[i+1,s.soldBy||s.username||s.attendant||'',s.itemName||s.item||'',deptLabel(s.department),s.qty||1,s.total||0,s.customerName||'',s.timeStarted||'',saleTime(s),s.paymentMethod||'']);
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download=`xclusive-sales-${today()}.csv`;a.click();URL.revokeObjectURL(a.href);
  };
  render(); return wrap;
}
