// Bar & Kitchen POS. Staff can only sell items created in Stock Management.
import { getItemsByDepartment, saveItemSale, generateSaleId, todayStr } from './db.js';
import { PAYMENT_METHODS, formatCurrency, getDepartmentById } from './config.js';
import { getIcon } from './icons.js';

function el(tag, cls='', html=''){const e=document.createElement(tag);if(cls)e.className=cls;if(html)e.innerHTML=html;return e;}
function $(s,p=document){return p.querySelector(s);}
let _showToast=()=>{}, _isOnline=()=>true, _refreshDashboard=()=>{};
export function setPOSCallbacks(c){_showToast=c.showToast;_isOnline=c.isOnline;_refreshDashboard=c.refreshDashboard;}

export async function renderPOS(deptId){
  const dept=getDepartmentById(deptId);
  if(!dept)return el('div','','Department not found');
  const root=el('div','dashboard');
  const items=await getItemsByDepartment(deptId);
  const cart=[];
  const wrap=el('div','pos-sales');
  let timeStarted=null;
  wrap.addEventListener('focusin',e=>{if(e.target.matches('input,select,textarea')&&!timeStarted)timeStarted=new Date().toISOString();});
  wrap.innerHTML=`<div class="pos-search-bar"><div class="pos-search-input-wrap">${getIcon('search',20)}<input class="pos-search-input" id="pos-search" placeholder="Search items..." autocomplete="off"></div></div>
    <div class="pos-results-wrap"><div class="pos-results" id="pos-results"></div></div>
    <div class="pos-cart"><div class="pos-cart__header"><span class="pos-cart__title">${getIcon('receipt',18)}<span>Current Order</span></span><span id="pos-cart-count">0 items</span></div>
    <div class="pos-cart__items" id="pos-cart-items"><div class="pos-cart__empty">Tap an item above to add it</div></div>
    <div class="pos-cart__total"><span>Total</span><span id="pos-cart-total">${formatCurrency(0)}</span></div>
    <button class="btn btn--primary btn--full" id="pos-checkout-btn" disabled>${getIcon('check',20)}<span>Checkout</span></button></div>`;
  root.appendChild(wrap);

  const results=$('#pos-results',wrap), search=$('#pos-search',wrap);
  const renderResults=()=>{
    const q=search.value.trim().toLowerCase();
    results.innerHTML='';
    const shown=items.filter(i=>i.name.toLowerCase().includes(q));
    if(!shown.length){results.innerHTML='<div class="pos-results__empty"><p>No stock items found. Admin/Reception must add products in Stock.</p></div>';return;}
    shown.forEach(item=>{
      const qty=Number(item.quantity)||0, out=qty<=0;
      const row=el('div',`pos-result ${out?'pos-result--out':''}`);
      row.innerHTML=`<div class="pos-result__info"><div class="pos-result__name">${item.name}</div><div class="pos-result__meta"><span class="pos-result__price">${formatCurrency(item.price)}</span><span>${out?'Out of stock':`${qty} available`}</span></div></div><button class="pos-result__add" ${out?'disabled':''}>${getIcon('plus',20)}</button>`;
      if(!out)row.addEventListener('click',()=>{const c=cart.find(x=>x.id===item.id);if(c){if(c.qty<qty)c.qty++;}else cart.push({id:item.id,name:item.name,price:Number(item.price)||0,available:qty,qty:1});updateCart();});
      results.appendChild(row);
    });
  };
  function updateCart(){
    const body=$('#pos-cart-items',wrap), totalEl=$('#pos-cart-total',wrap), countEl=$('#pos-cart-count',wrap), btn=$('#pos-checkout-btn',wrap);
    body.innerHTML=''; let total=0,count=0;
    cart.forEach((c,i)=>{total+=c.price*c.qty;count+=c.qty;const row=el('div','pos-cart-item');row.innerHTML=`<div class="pos-cart-item__info"><span>${c.name}</span><span>${formatCurrency(c.price)} × ${c.qty}</span></div><div class="pos-cart-item__controls"><button class="pos-qty-btn" data-a="dec" data-i="${i}">−</button><span>${c.qty}</span><button class="pos-qty-btn" data-a="inc" data-i="${i}">+</button><button class="pos-qty-btn pos-qty-btn--remove" data-a="remove" data-i="${i}">${getIcon('x',16)}</button></div><span>${formatCurrency(c.price*c.qty)}</span>`;body.appendChild(row);});
    if(!cart.length)body.innerHTML='<div class="pos-cart__empty">Tap an item above to add it</div>';
    totalEl.textContent=formatCurrency(total);countEl.textContent=`${count} item${count!==1?'s':''}`;btn.disabled=!cart.length;
    body.querySelectorAll('.pos-qty-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();const c=cart[Number(b.dataset.i)];if(!c)return;const a=b.dataset.a;if(a==='inc'&&c.qty<c.available)c.qty++;if(a==='dec')c.qty--;if(a==='remove'||c.qty<=0)cart.splice(Number(b.dataset.i),1);updateCart();});
  }
  search.addEventListener('input',renderResults); renderResults();
  $('#pos-checkout-btn',wrap).addEventListener('click',()=>cart.length&&openCheckout(deptId,dept,cart,timeStarted,async()=>{cart.length=0;root.replaceWith(await renderPOS(deptId));}));
  return root;
}

function openCheckout(deptId,dept,cart,timeStarted,onSuccess){
  const overlay=el('div','modal-overlay');overlay.id='modal-overlay';const sheet=el('div','bottom-sheet');
  const total=cart.reduce((a,c)=>a+c.price*c.qty,0);
  sheet.innerHTML=`<div class="bottom-sheet__handle"></div><div class="bottom-sheet__header"><h2>Checkout — ${dept.name}</h2><button class="icon-btn" id="close-sheet">${getIcon('x',20)}</button></div><div class="bottom-sheet__body">
    <div class="checkout-info">${cart.map(c=>`<div class="checkout-info__row"><span>${c.name} × ${c.qty}</span><span>${formatCurrency(c.price*c.qty)}</span></div>`).join('')}<div class="checkout-info__row"><strong>Total</strong><strong>${formatCurrency(total)}</strong></div></div>
    <div class="form-row"><label class="form-label">Customer (optional)</label><input class="form-input" id="co-customer" placeholder="Customer name"></div>
    <div class="form-row"><label class="form-label">Payment Method</label><div class="segmented" id="co-payment">${PAYMENT_METHODS.map((m,i)=>`<button class="seg-btn ${i===0?'active':''}" data-payment="${m.id}">${m.name}</button>`).join('')}</div><input class="form-input hidden" id="co-refno" placeholder="Reference No." style="margin-top:8px"></div>
    ${!_isOnline()?`<div class="pending-sync-banner">${getIcon('wifiOff',16)}<span>Offline — sale saved on this device</span></div>`:''}
    <button class="btn btn--primary btn--full" id="co-confirm">${getIcon('check',20)}<span>Complete Sale</span></button></div>`;
  overlay.appendChild(sheet);document.body.appendChild(overlay);let payment='cash';
  sheet.querySelectorAll('[data-payment]').forEach(b=>b.onclick=()=>{sheet.querySelectorAll('[data-payment]').forEach(x=>x.classList.remove('active'));b.classList.add('active');payment=b.dataset.payment;$('#co-refno',sheet).classList.toggle('hidden',payment==='cash');});
  const close=()=>overlay.remove();$('#close-sheet',sheet).onclick=close;overlay.onclick=e=>{if(e.target===overlay)close();};
  $('#co-confirm',sheet).onclick=async()=>{
    const now=new Date(), customer=$('#co-customer',sheet).value.trim(), ref=$('#co-refno',sheet).value.trim();
    const username=localStorage.getItem('xclusive_staff_username')||'';
    try{
      for(const c of cart){
        await saveItemSale({id:generateSaleId(deptId)+'_'+c.id,department:deptId,type:'item_sale',itemId:c.id,itemName:c.name,qty:c.qty,unitPrice:c.price,total:c.price*c.qty,paymentMethod:payment,refNo:payment==='cash'?'':ref,customerName:customer,soldBy:username,username,timeStarted:timeStarted||now.toISOString(),timeSaved:now.toISOString(),timestamp:now.toISOString(),dateStr:todayStr(),locked:true,voided:false,syncStatus:_isOnline()?'synced':'pending'});
      }
      close();_showToast(`Sale completed — ${formatCurrency(total)}`,'success');_refreshDashboard();await onSuccess();
    }catch(err){_showToast(err.message||'Could not save sale','error');}
  };
}
