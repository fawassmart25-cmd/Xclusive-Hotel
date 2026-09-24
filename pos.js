// ═══════════════════════════════════════════════════════════
//  POS Module — shared by Bar & Kitchen
//  Sub-tabs: Stock IN | Sales
//  Sales: search-as-you-type, qty, live remaining count
//  All saves go to IndexedDB. Shows "Pending Sync" if offline.
// ═══════════════════════════════════════════════════════════

import {
  getItemPrices,
} from './prices.js';
import {
  saveSale,
  saveStockIn,
  getFullInventory,
  getStockInByDepartment,
  getSalesByDepartment,
  generateSaleId,
  generateId,
  todayStr,
} from './db.js';
import {
  PAYMENT_METHODS,
  formatCurrency,
  getDepartmentById,
} from './config.js';
import { getIcon } from './icons.js';

// ── DOM helpers ──────────────────────────────────────────────
function el(tag, className = '', innerHTML = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (innerHTML) e.innerHTML = innerHTML;
  return e;
}

function $(sel, parent = document) {
  return parent.querySelector(sel);
}

// ── Callbacks ────────────────────────────────────────────────
let _showToast = () => {};
let _isOnline = () => true;
let _refreshDashboard = () => {};

export function setPOSCallbacks({ showToast, isOnline, refreshDashboard }) {
  _showToast = showToast;
  _isOnline = isOnline;
  _refreshDashboard = refreshDashboard;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN RENDER — called by app.js with deptId
// ═══════════════════════════════════════════════════════════════

export async function renderPOS(deptId) {
  const dept = getDepartmentById(deptId);
  if (!dept) return el('div', '', 'Department not found');

  const container = el('div', 'dashboard');

  // Sub-tab switcher
  const subTabs = el('div', 'sub-tabs');
  subTabs.innerHTML = `
    <button class="sub-tab active" data-subtab="sales">${getIcon('receipt', 16)}<span>Sales</span></button>
    <button class="sub-tab" data-subtab="stock">${getIcon('plus', 16)}<span>Stock IN</span></button>
  `;
  container.appendChild(subTabs);

  // Content area for sub-tabs
  const subContent = el('div', 'sub-content');
  subContent.id = 'pos-sub-content';
  container.appendChild(subContent);

  // Render sales tab by default
  await renderSalesTab(subContent, deptId);

  // Sub-tab switching
  subTabs.querySelectorAll('.sub-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      subTabs.querySelectorAll('.sub-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const subtab = tab.dataset.subtab;
      while (subContent.firstChild) subContent.removeChild(subContent.firstChild);
      if (subtab === 'sales') {
        await renderSalesTab(subContent, deptId);
      } else {
        await renderStockTab(subContent, deptId);
      }
    });
  });

  return container;
}

// ═══════════════════════════════════════════════════════════════
//  SALES TAB — search, add to cart, checkout
// ═══════════════════════════════════════════════════════════════

async function renderSalesTab(parent, deptId) {
  const items = getItemPrices(deptId);
  const inventory = await getFullInventory(deptId);
  const cart = [];

  const wrap = el('div', 'pos-sales');

  // Search bar
  const searchBar = el('div', 'pos-search-bar');
  searchBar.innerHTML = `
    <div class="pos-search-input-wrap">
      ${getIcon('search', 20)}
      <input type="text" class="pos-search-input" id="pos-search" placeholder="Search items..." autocomplete="off" />
    </div>
  `;
  wrap.appendChild(searchBar);

  // Search results
  const resultsWrap = el('div', 'pos-results-wrap');
  const results = el('div', 'pos-results');
  results.id = 'pos-results';
  resultsWrap.appendChild(results);
  wrap.appendChild(resultsWrap);

  // Cart
  const cartWrap = el('div', 'pos-cart');
  cartWrap.id = 'pos-cart';
  cartWrap.innerHTML = `
    <div class="pos-cart__header">
      <span class="pos-cart__title">${getIcon('receipt', 18)}<span>Current Order</span></span>
      <span class="pos-cart__count" id="pos-cart-count">0 items</span>
    </div>
    <div class="pos-cart__items" id="pos-cart-items">
      <div class="pos-cart__empty">Tap items above to add to order</div>
    </div>
    <div class="pos-cart__total">
      <span>Total</span>
      <span class="pos-cart__total-value" id="pos-cart-total">${formatCurrency(0)}</span>
    </div>
    <button class="btn btn--primary btn--full pos-cart__checkout" id="pos-checkout-btn" disabled>
      ${getIcon('check', 20)}
      <span>Checkout</span>
    </button>
  `;
  wrap.appendChild(cartWrap);

  parent.appendChild(wrap);

  // Render initial results (all items)
  renderSearchResults(results, items, inventory, deptId, cart, () => updateCartUI(cartWrap, cart));

  // Search handler
  const searchInput = $('#pos-search', wrap);
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = items.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
    renderSearchResults(results, filtered, inventory, deptId, cart, () => updateCartUI(cartWrap, cart));
  });

  // Checkout handler
  $('#pos-checkout-btn', wrap).addEventListener('click', () => {
    if (cart.length === 0) return;
    openCheckoutSheet(deptId, cart, wrap, () => {
      // After successful sale, refresh
      cart.length = 0;
      updateCartUI(cartWrap, cart);
      // Re-render the sales tab to refresh inventory
      while (parent.firstChild) parent.removeChild(parent.firstChild);
      renderSalesTab(parent, deptId);
    });
  });
}

function renderSearchResults(container, items, inventory, deptId, cart, onCartChange) {
  while (container.firstChild) container.removeChild(container.firstChild);

  if (items.length === 0) {
    container.innerHTML = `
      <div class="pos-results__empty">
        ${getIcon('search', 32)}
        <p>No items found</p>
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const inv = inventory[item.id] || { remaining: 0 };
    const remaining = inv.remaining;
    const lowStock = remaining <= 5 && remaining > 0;
    const outOfStock = remaining <= 0;

    const result = el('div', `pos-result ${outOfStock ? 'pos-result--out' : ''}`);
    result.innerHTML = `
      <div class="pos-result__info">
        <div class="pos-result__name">${item.name}</div>
        <div class="pos-result__meta">
          <span class="pos-result__price">${formatCurrency(item.price)}</span>
          <span class="pos-result__remaining ${outOfStock ? 'pos-result__remaining--out' : lowStock ? 'pos-result__remaining--low' : ''}">
            ${outOfStock ? 'Out of stock' : `${remaining} remaining`}
          </span>
        </div>
      </div>
      <button class="pos-result__add" ${outOfStock ? 'disabled' : ''}>
        ${getIcon('plus', 20)}
      </button>
    `;

    if (!outOfStock) {
      result.addEventListener('click', () => {
        addToCart(cart, item);
        onCartChange();
      });
    }

    container.appendChild(result);
  });
}

function addToCart(cart, item) {
  const existing = cart.find((c) => c.id === item.id);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  }
}

function updateCartUI(cartWrap, cart) {
  const itemsEl = $('#pos-cart-items', cartWrap);
  const totalEl = $('#pos-cart-total', cartWrap);
  const countEl = $('#pos-cart-count', cartWrap);
  const checkoutBtn = $('#pos-checkout-btn', cartWrap);

  const totalQty = cart.reduce((sum, c) => sum + c.qty, 0);
  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  countEl.textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''}`;
  totalEl.textContent = formatCurrency(total);
  checkoutBtn.disabled = cart.length === 0;

  while (itemsEl.firstChild) itemsEl.removeChild(itemsEl.firstChild);

  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="pos-cart__empty">Tap items above to add to order</div>';
    return;
  }

  cart.forEach((c, idx) => {
    const item = el('div', 'pos-cart-item');
    item.innerHTML = `
      <div class="pos-cart-item__info">
        <span class="pos-cart-item__name">${c.name}</span>
        <span class="pos-cart-item__price">${formatCurrency(c.price)} × ${c.qty}</span>
      </div>
      <div class="pos-cart-item__controls">
        <button class="pos-qty-btn" data-action="dec" data-idx="${idx}">−</button>
        <span class="pos-cart-item__qty">${c.qty}</span>
        <button class="pos-qty-btn" data-action="inc" data-idx="${idx}">+</button>
        <button class="pos-qty-btn pos-qty-btn--remove" data-action="remove" data-idx="${idx}">${getIcon('x', 16)}</button>
      </div>
      <span class="pos-cart-item__total">${formatCurrency(c.price * c.qty)}</span>
    `;
    itemsEl.appendChild(item);
  });

  // Wire qty buttons
  itemsEl.querySelectorAll('.pos-qty-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const idx = Number(btn.dataset.idx);
      if (action === 'inc') {
        cart[idx].qty++;
      } else if (action === 'dec') {
        cart[idx].qty--;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
      } else if (action === 'remove') {
        cart.splice(idx, 1);
      }
      updateCartUI(cartWrap, cart);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHECKOUT SHEET
// ═══════════════════════════════════════════════════════════════

function openCheckoutSheet(deptId, cart, parentEl, onSuccess) {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const dept = getDepartmentById(deptId);
  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const online = _isOnline();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';

  const sheet = el('div', 'bottom-sheet');
  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>Checkout — ${dept.name}</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="checkout-info">
        ${cart.map((c) => `
          <div class="checkout-info__row">
            <span class="checkout-info__label">${c.name} × ${c.qty}</span>
            <span class="checkout-info__value">${formatCurrency(c.price * c.qty)}</span>
          </div>
        `).join('')}
        <div class="checkout-info__row" style="border-top:1px solid var(--ink-600); padding-top:var(--sm); margin-top:var(--xs);">
          <span class="checkout-info__label" style="font-weight:600;">Total</span>
          <span class="checkout-info__value" style="color:var(--gold-300); font-size:18px;">${formatCurrency(total)}</span>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">Customer Name</label>
        <input type="text" class="form-input" id="co-customer" placeholder="Customer name" autocomplete="off" />
      </div>
      <div class="form-row">
        <label class="form-label">Receipt No</label>
        <input type="text" class="form-input" id="co-receipt" placeholder="Auto-generated if left blank" />
      </div>

      <div class="form-row">
        <label class="form-label">Payment Method</label>
        <div class="segmented" id="co-payment">
          ${PAYMENT_METHODS.map((m, i) =>
            `<button class="seg-btn ${i === 0 ? 'active' : ''}" data-payment="${m.id}">${m.name}</button>`
          ).join('')}
        </div>
        <input type="text" class="form-input hidden" id="co-refno" placeholder="Reference No." style="margin-top:8px;" />
      </div>

      <div class="form-row">
        <label class="form-label">Attendant Name</label>
        <input type="text" class="form-input" id="co-attendant" placeholder="Your name" />
      </div>

      ${!online ? `
        <div class="pending-sync-banner">
          ${getIcon('wifiOff', 16)}
          <span>Offline — sale will sync when reconnected</span>
        </div>
      ` : ''}

      <div class="form-total">
        <span>Amount to Pay</span>
        <span class="form-total__value">${formatCurrency(total)}</span>
      </div>

      <button class="btn btn--primary btn--full" id="co-confirm">
        ${getIcon('check', 20)}
        <span>Complete Sale</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  let paymentMethod = 'cash';
  let timeStarted = null;
  $('#co-customer', sheet).addEventListener('focus', () => { if (!timeStarted) timeStarted = new Date().toISOString(); }, { once: true });

  // Payment toggle
  sheet.querySelectorAll('[data-payment]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sheet.querySelectorAll('[data-payment]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      paymentMethod = btn.dataset.payment;
      const refInput = $('#co-refno', sheet);
      refInput.classList.toggle('hidden', paymentMethod === 'cash');
    });
  });

  // Close
  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });

  // Confirm
  $('#co-confirm', sheet).addEventListener('click', async () => {
    const customerName = $('#co-customer', sheet).value.trim();
    const attendant = $('#co-attendant', sheet).value.trim();
    let receiptNo = $('#co-receipt', sheet).value.trim();
    const refNo = $('#co-refno', sheet).value.trim();

    if (!receiptNo) receiptNo = generateSaleId(deptId);

    const now = new Date();
    if (!timeStarted) timeStarted = now.toISOString();

    // Save each cart item as a separate sale record (for inventory tracking)
    for (const c of cart) {
      const sale = {
        id: receiptNo + '_' + c.id,
        department: deptId,
        type: 'item_sale',
        itemId: c.id,
        itemName: c.name,
        qty: c.qty,
        unitPrice: c.price,
        total: c.price * c.qty,
        paymentMethod,
        refNo: paymentMethod !== 'cash' ? refNo : '',
        attendant: attendant || dept.name,
        soldBy: localStorage.getItem('xclusive_staff_name') || attendant || dept.name,
        username: (() => { try { return JSON.parse(localStorage.getItem('xclusive_currentUser') || '{}').username || ''; } catch { return ''; } })(),
        customerName,
        timeStarted,
        timeSaved: now.toISOString(),
        timestamp: now.toISOString(),
        dateStr: todayStr(),
        receiptNo,
        locked: true,
        voided: false,
        syncStatus: online ? 'synced' : 'pending',
      };
      await saveSale(sale);
    }

    closeSheet();
    _showToast(`Sale completed — ${formatCurrency(total)}`, 'success');
    _refreshDashboard();
    onSuccess();
  });
}

// ═══════════════════════════════════════════════════════════════
//  STOCK IN TAB — add inventory
// ═══════════════════════════════════════════════════════════════

async function renderStockTab(parent, deptId) {
  const items = getItemPrices(deptId);
  const stockRecords = await getStockInByDepartment(deptId);
  const inventory = await getFullInventory(deptId);

  const wrap = el('div', 'pos-stock');

  // Add stock form
  const formCard = el('div', 'card');
  formCard.innerHTML = `
    <div class="section-header">
      <span class="section-header__title">Add Stock</span>
    </div>
    <div class="form-row">
      <label class="form-label">Item <span class="form-required">*</span></label>
      <select class="form-input" id="stock-item-select">
        <option value="">Select item...</option>
        ${items.map((i) => `<option value="${i.id}" data-name="${i.name}">${i.name} — ${formatCurrency(i.price)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row" style="margin-top:var(--md);">
      <label class="form-label">Quantity Added <span class="form-required">*</span></label>
      <input type="number" class="form-input" id="stock-qty" placeholder="e.g. 24" min="1" />
    </div>
    <button class="btn btn--primary btn--full" id="stock-add-btn" style="margin-top:var(--md);">
      ${getIcon('plus', 20)}
      <span>Add Stock</span>
    </button>
  `;
  wrap.appendChild(formCard);

  // Current inventory table
  const invCard = el('div', 'card');
  invCard.style.marginTop = 'var(--lg)';
  invCard.innerHTML = `
    <div class="section-header">
      <span class="section-header__title">Current Inventory</span>
    </div>
    <div class="stock-inventory" id="stock-inventory"></div>
  `;
  wrap.appendChild(invCard);

  // Recent stock additions
  const recentCard = el('div', 'card');
  recentCard.style.marginTop = 'var(--lg)';
  recentCard.innerHTML = `
    <div class="section-header">
      <span class="section-header__title">Recent Stock Additions</span>
    </div>
    <div class="stock-log" id="stock-log"></div>
  `;
  wrap.appendChild(recentCard);

  parent.appendChild(wrap);

  // Render inventory
  const invEl = $('#stock-inventory', wrap);
  if (items.length === 0) {
    invEl.innerHTML = '<div class="pos-cart__empty">No items configured</div>';
  } else {
    items.forEach((item) => {
      const inv = inventory[item.id] || { totalIn: 0, totalOut: 0, remaining: 0 };
      const row = el('div', 'stock-inv-row');
      const statusClass = inv.remaining <= 0 ? 'stock-inv-row--out' : inv.remaining <= 5 ? 'stock-inv-row--low' : '';
      row.className = `stock-inv-row ${statusClass}`;
      row.innerHTML = `
        <div class="stock-inv-row__name">${item.name}</div>
        <div class="stock-inv-row__nums">
          <span class="stock-inv-row__in">IN: ${inv.totalIn}</span>
          <span class="stock-inv-row__out">OUT: ${inv.totalOut}</span>
          <span class="stock-inv-row__remaining">${inv.remaining} left</span>
        </div>
      `;
      invEl.appendChild(row);
    });
  }

  // Render recent stock log
  const logEl = $('#stock-log', wrap);
  const recentStock = [...stockRecords].reverse().slice(0, 10);
  if (recentStock.length === 0) {
    logEl.innerHTML = '<div class="pos-cart__empty">No stock added yet</div>';
  } else {
    recentStock.forEach((r) => {
      const date = new Date(r.timestamp).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' });
      const row = el('div', 'stock-log-row');
      row.innerHTML = `
        <div class="stock-log-row__info">
          <span class="stock-log-row__name">${r.itemName}</span>
          <span class="stock-log-row__date">${date}</span>
        </div>
        <span class="stock-log-row__qty">+${r.qty}</span>
      `;
      logEl.appendChild(row);
    });
  }

  // Add stock handler
  $('#stock-add-btn', wrap).addEventListener('click', async () => {
    const itemSelect = $('#stock-item-select', wrap);
    const qtyInput = $('#stock-qty', wrap);
    const itemId = itemSelect.value;
    const qty = Number(qtyInput.value);

    if (!itemId) {
      _showToast('Select an item', 'error');
      itemSelect.focus();
      return;
    }
    if (!qty || qty <= 0) {
      _showToast('Enter valid quantity', 'error');
      qtyInput.focus();
      return;
    }

    const itemName = itemSelect.options[itemSelect.selectedIndex].dataset.name;
    const now = new Date();

    const record = {
      id: generateId('STK'),
      department: deptId,
      itemId,
      itemName,
      qty,
      timestamp: now.toISOString(),
      dateStr: todayStr(),
      syncStatus: _isOnline() ? 'synced' : 'pending',
    };

    await saveStockIn(record);
    _showToast(`${qty} ${itemName} added to stock`, 'success');
    _refreshDashboard();

    // Re-render stock tab
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    await renderStockTab(parent, deptId);
  });
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function closeSheet() {
  const overlay = $('#modal-overlay');
  if (overlay) {
    const sheet = overlay.querySelector('.bottom-sheet');
    if (sheet) {
      sheet.style.transform = 'translateY(100%)';
      sheet.style.transition = 'transform 0.2s ease';
    }
    setTimeout(() => overlay.remove(), 200);
  }
}
