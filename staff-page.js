import { getAllStaff, saveStaffMember, deleteStaffMember } from './db.js';
import { getIcon } from './icons.js';
const ROLE_NAMES={admin:'Admin',reception:'Reception',bar:'Bar',kitchen:'Kitchen',games:'Game'};
function el(t,c='',h=''){const e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e;}
export async function renderStaffPage({onSaved=()=>{}}={}){
 const root=el('div','dashboard fade-in-up');
 root.appendChild(el('div','section-header','<span class="section-header__title">Staff Management</span>'));
 const form=el('div','card'); form.innerHTML=`<div class="section-header"><span class="section-header__title">Add Staff</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"><input class="form-input" id="st-name" placeholder="Full name"><input class="form-input" id="st-user" placeholder="Username"><input class="form-input" id="st-pin" placeholder="PIN / Password" type="password"><select class="form-input" id="st-role"><option value="reception">Reception</option><option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="games">Game</option><option value="admin">Admin</option></select></div><button class="btn btn--primary" id="st-save" style="margin-top:12px">${getIcon('plus',18)} Add Staff</button>`;
 root.appendChild(form);
 const table=el('div','card'); table.innerHTML='<div class="section-header"><span class="section-header__title">Staff Accounts</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody id="staff-body"></tbody></table></div>';root.appendChild(table);
 const body=table.querySelector('#staff-body');
 async function render(){const staff=await getAllStaff();body.innerHTML='';staff.sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${s.name}</td><td>${s.username}</td><td>${ROLE_NAMES[s.role]||s.role}</td><td>${s.isActive?'Active':'Deactivated'}</td><td style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn--ghost edit-name">Name</button><button class="btn btn--ghost edit-pin">PIN</button><button class="btn btn--ghost edit-role">Role</button><button class="btn btn--ghost toggle">${s.isActive?'Deactivate':'Activate'}</button><button class="btn btn--ghost delete">Delete</button></td>`;
 tr.querySelector('.edit-name').onclick=async()=>{const v=prompt('New name',s.name);if(v?.trim()){s.name=v.trim();await saveStaffMember(s);await render();onSaved();}};
 tr.querySelector('.edit-pin').onclick=async()=>{const v=prompt('New PIN / password',s.pin||s.password||'');if(v){s.pin=v;await saveStaffMember(s);await render();}};
 tr.querySelector('.edit-role').onclick=async()=>{const v=prompt('Role: admin, reception, bar, kitchen, games',s.role);if(v&&ROLE_NAMES[v]){s.role=v;await saveStaffMember(s);await render();}};
 tr.querySelector('.toggle').onclick=async()=>{s.isActive=!s.isActive;await saveStaffMember(s);await render();};
 tr.querySelector('.delete').onclick=async()=>{if(confirm(`Delete ${s.name}?`)){await deleteStaffMember(s.id);await render();}};body.appendChild(tr);});}
 form.querySelector('#st-save').onclick=async()=>{const name=form.querySelector('#st-name').value.trim(),username=form.querySelector('#st-user').value.trim().toLowerCase(),pin=form.querySelector('#st-pin').value.trim(),role=form.querySelector('#st-role').value;if(!name||!username||!pin){alert('Name, username and PIN are required.');return;}try{await saveStaffMember({id:`staff-${username}-${Date.now()}`,name,username,pin,role,isActive:true,createdAt:new Date().toISOString()});form.querySelectorAll('input').forEach(i=>i.value='');await render();onSaved();}catch(e){alert('Could not save staff. Username may already exist.');}};
 await render(); return root;
}
