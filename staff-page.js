import { getAllStaff, createStaff, updateStaff, removeStaff } from './staff.js';
import { getIcon } from './icons.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles=['admin','reception','bar','kitchen','game'];

export async function renderStaffManagement(){
  const wrap=document.createElement('div'); wrap.className='staff-page fade-in-up';
  wrap.innerHTML=`<div class="section-header"><div><div class="section-header__title">Staff Management</div><div class="dashboard__date">Admin only · IndexedDB staff accounts</div></div></div>
  <div class="card staff-form-card"><div class="section-header"><span class="section-header__title" id="staff-form-title">Add Staff</span></div>
  <form id="staff-form"><input type="hidden" id="staff-id">
    <div class="form-grid"><label>Name<input id="staff-name" class="form-input" required></label><label>Username<input id="staff-username" class="form-input" required></label><label>PIN / Password<input id="staff-pin" class="form-input" required></label><label>Role<select id="staff-role" class="form-input">${roles.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></label></div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn--primary" type="submit">Save Staff</button><button class="btn btn--secondary hidden" type="button" id="cancel-edit">Cancel</button></div>
  </form></div>
  <div class="card report-table-card"><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="staff-body"></tbody></table></div></div>`;
  const form=wrap.querySelector('#staff-form'), body=wrap.querySelector('#staff-body'), id=wrap.querySelector('#staff-id');
  const render=async()=>{ const staff=await getAllStaff(); body.innerHTML=staff.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.username)}</td><td>${esc(s.role)}</td><td><span class="status-pill ${s.isActive?'status-active':'status-inactive'}">${s.isActive?'Active':'Inactive'}</span></td><td>${new Date(s.createdAt).toLocaleDateString('en-NG')}</td><td><div class="table-actions"><button class="btn btn--secondary btn--xs" data-edit="${s.id}">Edit</button><button class="btn btn--secondary btn--xs" data-pin="${s.id}">Edit PIN</button><button class="btn btn--secondary btn--xs" data-role="${s.id}">Edit Role</button><button class="btn btn--secondary btn--xs" data-toggle="${s.id}">${s.isActive?'Deactivate':'Activate'}</button><button class="btn btn--danger btn--xs" data-delete="${s.id}">Delete</button></div></td></tr>`).join('')||`<tr><td colspan="6" class="empty-state">No staff accounts.</td></tr>`;
    body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>load(awaitStaff(staff,b.dataset.edit),'all'));
  };
  const awaitStaff=async(list,id)=>list.find(x=>x.id===id);
  form.onsubmit=async e=>{e.preventDefault(); try{
    const data={id:id.value||undefined,name:wrap.querySelector('#staff-name').value.trim(),username:wrap.querySelector('#staff-username').value.trim(),pin:wrap.querySelector('#staff-pin').value,role:wrap.querySelector('#staff-role').value};
    if(id.value) await updateStaff(data); else await createStaff(data);
    form.reset();id.value='';wrap.querySelector('#cancel-edit').classList.add('hidden');wrap.querySelector('#staff-form-title').textContent='Add Staff';await render();
  }catch(err){alert(err.message)}};
  wrap.querySelector('#cancel-edit').onclick=()=>{form.reset();id.value='';wrap.querySelector('#cancel-edit').classList.add('hidden');wrap.querySelector('#staff-form-title').textContent='Add Staff';};
  const load=(s,mode)=>{if(!s)return; id.value=s.id;wrap.querySelector('#staff-name').value=s.name;wrap.querySelector('#staff-username').value=s.username;wrap.querySelector('#staff-pin').value=s.pin;wrap.querySelector('#staff-role').value=s.role;wrap.querySelector('#cancel-edit').classList.remove('hidden');wrap.querySelector('#staff-form-title').textContent='Edit Staff';};
  body.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;const staff=await getAllStaff(), s=staff.find(x=>x.id===(b.dataset.edit||b.dataset.pin||b.dataset.role||b.dataset.toggle||b.dataset.delete));if(!s)return;
    if(b.dataset.edit){load(s,'all');return;}
    if(b.dataset.pin){const pin=prompt('New PIN / Password',s.pin);if(pin!==null){s.pin=pin;await updateStaff(s);await render();}return;}
    if(b.dataset.role){const role=prompt('Role: admin, reception, bar, kitchen, game',s.role);if(role&&roles.includes(role)){s.role=role;await updateStaff(s);await render();}return;}
    if(b.dataset.toggle){s.isActive=!s.isActive;await updateStaff(s);await render();return;}
    if(b.dataset.delete && confirm(`Delete ${s.name}? This permanently removes the staff record.`)){await removeStaff(s.id);await render();}
  });
  await render(); return wrap;
}
