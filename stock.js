// Stock Management — Admin and Reception only.
// Canonical IndexedDB table: items { id, name, department, quantity, price }.

import { getAllItems, saveItem, deleteItem, generateId } from './db.js';
import { getActiveDepartments, formatCurrency } from './config.js';
import { getIcon } from './icons.js';

function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function seedItemStore(getAllItemPrices) {
  const existing = await getAllItems();
  if (existing.length) return existing;
  const prices = getAllItemPrices();
  const seeded = [];
  for (const [department, items] of Object.entries(prices)) {
    if (department === 'reception') continue;
    for (const item of items || []) {
      if (!item.active) continue;
      const record = {
        id: item.id,
        name: item.name,
        department,
        quantity: 0,
        price: Number(item.price) || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveItem(record);
      seeded.push(record);
    }
  }
  return seeded;
}

export async function renderStock({ canManage = false } = {}) {
  const root = el('div', 'dashboard fade-in-up');
  root.appendChild(el('div', 'section-header',
    `<div><div class="section-header__title">Stock Management</div><div style="font-size:12px;color:var(--ink-200);margin-top:4px;">Products available for Bar, Kitchen and Game sales</div></div>`
  ));

  if (canManage) {
    const formCard = el('div', 'card');
    formCard.innerHTML = `
      <div class="section-header"><span class="section-header__title">Add / Edit Item</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
        <input class="form-input" id="stock-name" placeholder="Item name">
        <select class="form-input" id="stock-dept">
          <option value="">Department</option>
          <option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="games">Game</option>
        </select>
        <input class="form-input" id="stock-qty" type="number" min="0" step="1" placeholder="Quantity">
        <input class="form-input" id="stock-price" type="number" min="0" step="50" placeholder="Price (₦)">
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn--primary" id="stock-save">${getIcon('save',18)}<span>Save Item</span></button>
        <button class="btn btn--ghost" id="stock-cancel" style="display:none;">Cancel Edit</button>
      </div>
    `;
    root.appendChild(formCard);
  }

  const tableCard = el('div', 'card');
  tableCard.innerHTML = `
    <div class="section-header"><span class="section-header__title">Items</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>S/N</th><th>Item</th><th>Department</th><th>Quantity</th><th>Price</th>${canManage ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody id="stock-body"></tbody>
    </table></div>
  `;
  root.appendChild(tableCard);

  const body = root.querySelector('#stock-body');
  let editingId = null;
  let items = [];

  async function renderRows() {
    items = (await getAllItems()).filter(i => ['bar','kitchen','games'].includes(i.department))
      .sort((a,b) => `${a.department}-${a.name}`.localeCompare(`${b.department}-${b.name}`));
    body.innerHTML = '';
    if (!items.length) {
      body.innerHTML = `<tr><td colspan="${canManage ? 6 : 5}" style="text-align:center;padding:24px;color:var(--ink-200);">No items added yet.</td></tr>`;
      return;
    }
    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td><td>${esc(item.name)}</td>
        <td>${item.department === 'games' ? 'Game' : esc(item.department)}</td>
        <td>${Number(item.quantity) || 0}</td><td>${formatCurrency(item.price)}</td>
        ${canManage ? `<td style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn--ghost edit" data-id="${esc(item.id)}">Edit</button>
          <button class="btn btn--ghost delete" data-id="${esc(item.id)}">Delete</button>
        </td>` : ''}
      `;
      body.appendChild(tr);
    });

    if (canManage) {
      body.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.dataset.id);
        if (!item) return;
        editingId = item.id;
        root.querySelector('#stock-name').value = item.name;
        root.querySelector('#stock-dept').value = item.department;
        root.querySelector('#stock-qty').value = item.quantity;
        root.querySelector('#stock-price').value = item.price;
        root.querySelector('#stock-cancel').style.display = '';
        root.querySelector('#stock-save').querySelector('span').textContent = 'Update Item';
      }));
      body.querySelectorAll('.delete').forEach(btn => btn.addEventListener('click', async () => {
        const item = items.find(i => i.id === btn.dataset.id);
        if (!item || !confirm(`Delete ${item.name}?`)) return;
        await deleteItem(item.id);
        if (editingId === item.id) resetForm();
        await renderRows();
      }));
    }
  }

  function resetForm() {
    editingId = null;
    if (!canManage) return;
    root.querySelector('#stock-name').value = '';
    root.querySelector('#stock-dept').value = '';
    root.querySelector('#stock-qty').value = '';
    root.querySelector('#stock-price').value = '';
    root.querySelector('#stock-cancel').style.display = 'none';
    root.querySelector('#stock-save').querySelector('span').textContent = 'Save Item';
  }

  if (canManage) {
    root.querySelector('#stock-cancel').addEventListener('click', resetForm);
    root.querySelector('#stock-save').addEventListener('click', async () => {
      const name = root.querySelector('#stock-name').value.trim();
      const department = root.querySelector('#stock-dept').value;
      const quantity = Number(root.querySelector('#stock-qty').value);
      const price = Number(root.querySelector('#stock-price').value);
      if (!name || !department || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) {
        alert('Enter item name, department, quantity and price.');
        return;
      }
      const duplicate = (await getAllItems()).find(i =>
        i.department === department && i.name.trim().toLowerCase() === name.toLowerCase() && i.id !== editingId
      );
      if (duplicate) { alert('An item with this name already exists in that department.'); return; }
      await saveItem({
        id: editingId || generateId('ITEM'),
        name, department, quantity, price,
        createdAt: editingId ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      resetForm();
      await renderRows();
    });
  }

  await renderRows();
  return root;
}
