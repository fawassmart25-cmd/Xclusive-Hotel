// ═══════════════════════════════════════════════════════════
//  Price Manager — Admin-only price editing
//  Shows all room prices and item prices. Edits persist
//  to localStorage and affect all departments instantly.
// ═══════════════════════════════════════════════════════════

import {
  getRoomPrices,
  updateRoomPrice,
  getAllItemPrices,
  updateItemPrice,
  addItem,
  toggleItem,
  resetPrices,
} from './prices.js';
import { getActiveDepartments, getDepartmentById, formatCurrency } from './config.js';
import { getIcon } from './icons.js';

function el(tag, className = '', innerHTML = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (innerHTML) e.innerHTML = innerHTML;
  return e;
}

function $(sel, parent = document) {
  return parent.querySelector(sel);
}

let _showToast = () => {};
let _onPricesChanged = () => {};

export function setPriceManagerCallbacks({ showToast, onPricesChanged }) {
  _showToast = showToast;
  _onPricesChanged = onPricesChanged;
}

export function renderPriceManager() {
  const container = el('div', 'dashboard');

  // Header
  const header = el('div', 'section-header', `
    <span class="section-header__title">Price Manager</span>
    <button class="section-header__action" id="reset-prices">Reset to defaults</button>
  `);
  container.appendChild(header);

  // Room prices section
  const roomSection = el('div', '', `
    <div class="price-section-title">${getIcon('door', 18)} Room Prices</div>
  `);

  const roomCard = el('div', 'card price-card');
  const roomPrices = getRoomPrices();
  roomPrices.forEach((rp) => {
    const row = el('div', 'price-row');
    row.innerHTML = `
      <div class="price-row__name">${rp.name}</div>
      <div class="price-row__inputs">
        <div class="price-input-group">
          <label>Lodge</label>
          <input type="number" class="form-input price-input" data-cat="${rp.id}" data-field="lodgeRate" value="${rp.lodgeRate}" min="0" step="100" />
        </div>
        <div class="price-input-group">
          <label>Short Rest</label>
          <input type="number" class="form-input price-input" data-cat="${rp.id}" data-field="shortRestRate" value="${rp.shortRestRate}" min="0" step="100" />
        </div>
      </div>
    `;
    roomCard.appendChild(row);
  });
  roomSection.appendChild(roomCard);
  container.appendChild(roomSection);

  // Item prices by department
  const activeDepts = getActiveDepartments();
  const allItems = getAllItemPrices();

  activeDepts.forEach((dept) => {
    if (dept.id === 'reception') return;
    const items = allItems[dept.id] || [];

    const deptSection = el('div', '');
    deptSection.innerHTML = `
      <div class="price-section-title" style="color:${dept.color};">${getIcon(dept.icon, 18)} ${dept.name} Prices</div>
    `;

    const deptCard = el('div', 'card price-card');
    deptCard.id = `price-card-${dept.id}`;

    items.forEach((item) => {
      const row = el('div', `price-row ${!item.active ? 'price-row--inactive' : ''}`);
      row.innerHTML = `
        <div class="price-row__name">${item.name}</div>
        <div class="price-row__inputs">
          <div class="price-input-group">
            <input type="number" class="form-input price-input price-input--item" data-dept="${dept.id}" data-item="${item.id}" value="${item.price}" min="0" step="50" />
            <label>${formatCurrency(item.price)}</label>
          </div>
          <button class="icon-btn price-toggle" data-dept="${dept.id}" data-item="${item.id}" title="${item.active ? 'Deactivate' : 'Activate'}">
            ${getIcon(item.active ? 'checkCircle' : 'circleX', 20)}
          </button>
        </div>
      `;
      deptCard.appendChild(row);
    });

    // Add new item row
    const addRow = el('div', 'price-row price-row--add');
    addRow.innerHTML = `
      <input type="text" class="form-input" id="new-item-name-${dept.id}" placeholder="New item name" />
      <input type="number" class="form-input" id="new-item-price-${dept.id}" placeholder="Price" min="0" step="50" style="width:100px;" />
      <button class="icon-btn icon-btn--gold" id="add-item-${dept.id}">${getIcon('plus', 20)}</button>
    `;
    deptCard.appendChild(addRow);

    deptSection.appendChild(deptCard);
    container.appendChild(deptSection);
  });

  // Wire events after adding to DOM
  setTimeout(() => wirePriceEvents(container), 0);

  return container;
}

function wirePriceEvents(container) {
  // Room price inputs
  container.querySelectorAll('.price-input[data-cat]').forEach((input) => {
    input.addEventListener('change', () => {
      const cat = input.dataset.cat;
      const field = input.dataset.field;
      const value = input.value;
      updateRoomPrice(cat, field, value);
      _showToast(`${field === 'lodgeRate' ? 'Lodge' : 'Short Rest'} price updated`, 'success');
      _onPricesChanged();
    });
  });

  // Item price inputs
  container.querySelectorAll('.price-input--item').forEach((input) => {
    input.addEventListener('change', () => {
      const dept = input.dataset.dept;
      const item = input.dataset.item;
      const value = input.value;
      updateItemPrice(dept, item, value);
      const label = input.parentElement.querySelector('label');
      if (label) label.textContent = formatCurrency(Number(value));
      _showToast('Price updated', 'success');
      _onPricesChanged();
    });
  });

  // Toggle item active/inactive
  container.querySelectorAll('.price-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dept = btn.dataset.dept;
      const item = btn.dataset.item;
      toggleItem(dept, item);
      _showToast('Item status toggled', 'success');
      _onPricesChanged();
      // Re-render the price manager
      const content = $('#content-area');
      if (content) {
        while (content.firstChild) content.removeChild(content.firstChild);
        const wrapper = el('div', 'fade-in-up');
        wrapper.appendChild(renderPriceManager());
        content.appendChild(wrapper);
        wirePriceEvents(wrapper);
      }
    });
  });

  // Add new item
  getActiveDepartments().forEach((dept) => {
    if (dept.id === 'reception') return;
    const addBtn = $(`#add-item-${dept.id}`, container);
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const nameInput = $(`#new-item-name-${dept.id}`, container);
        const priceInput = $(`#new-item-price-${dept.id}`, container);
        const name = nameInput.value.trim();
        const price = priceInput.value;
        if (!name) {
          _showToast('Enter item name', 'error');
          nameInput.focus();
          return;
        }
        if (!price || Number(price) <= 0) {
          _showToast('Enter valid price', 'error');
          priceInput.focus();
          return;
        }
        addItem(dept.id, name, price);
        _showToast(`${name} added to ${dept.name}`, 'success');
        _onPricesChanged();
        // Re-render
        const content = $('#content-area');
        if (content) {
          while (content.firstChild) content.removeChild(content.firstChild);
          const wrapper = el('div', 'fade-in-up');
          wrapper.appendChild(renderPriceManager());
          content.appendChild(wrapper);
          wirePriceEvents(wrapper);
        }
      });
    }
  });

  // Reset prices
  const resetBtn = $('#reset-prices', container);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all prices to defaults? This cannot be undone.')) {
        resetPrices();
        _showToast('Prices reset to defaults', 'success');
        _onPricesChanged();
        const content = $('#content-area');
        if (content) {
          while (content.firstChild) content.removeChild(content.firstChild);
          const wrapper = el('div', 'fade-in-up');
          wrapper.appendChild(renderPriceManager());
          content.appendChild(wrapper);
          wirePriceEvents(wrapper);
        }
      }
    });
  }
}
