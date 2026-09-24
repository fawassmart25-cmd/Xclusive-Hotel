// ═══════════════════════════════════════════════════════════
//  Reception Module — Room grid, sell form, checkout
// ═══════════════════════════════════════════════════════════

import {
  ROOMS,
  getAllRoomStatuses,
  getRoomStatus,
  getRoomByNumber,
} from './rooms.js';
import {
  getRoomPrices,
  getRoomPrice,
} from './prices.js';
import {
  saveSale,
  saveCustomer,
  getCustomerByPhone,
  setRoomOccupancy,
  clearRoomOccupancy,
  generateSaleId,
  todayStr,
} from './db.js';
import { ROOM_CATEGORIES, PAYMENT_METHODS, formatCurrency, getActiveCategories } from './config.js';
import { getIcon } from './icons.js';
import { syncSaleImmediately } from './sync.js';

// ── DOM helpers (local, matching app.js pattern) ─────────────
function el(tag, className = '', innerHTML = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (innerHTML) e.innerHTML = innerHTML;
  return e;
}

function $(sel, parent = document) {
  return parent.querySelector(sel);
}

// ── Category color map ───────────────────────────────────────
function catColor(id) {
  const cat = ROOM_CATEGORIES.find((c) => c.id === id);
  return cat ? cat.color : '#9E9EAE';
}

function catName(id) {
  const cat = ROOM_CATEGORIES.find((c) => c.id === id);
  return cat ? cat.name : id;
}

// ── Toast callback (set by app.js) ───────────────────────────
let _showToast = () => {};
let _refreshDashboard = () => {};

export function setReceptionCallbacks({ showToast, refreshDashboard }) {
  _showToast = showToast;
  _refreshDashboard = refreshDashboard;
}

// ═══════════════════════════════════════════════════════════════
//  ROOM GRID
// ═══════════════════════════════════════════════════════════════

export async function renderReception() {
  const container = el('div', 'dashboard');
  window.__xclusiveSaleStarted = null;

  container.addEventListener('focusin', (e) => { if (!window.__xclusiveSaleStarted && e.target.matches('input')) window.__xclusiveSaleStarted = new Date().toISOString(); });

  // Filter chips
  const filterRow = el('div', 'chip-row');
  filterRow.innerHTML = `
    <button class="chip active" data-filter="all">All Rooms</button>
    <button class="chip" data-filter="free">Free</button>
    <button class="chip" data-filter="occupied">Occupied</button>
  `;
  container.appendChild(filterRow);

  // Summary row
  const summary = el('div', 'reception-summary', `
    <div class="reception-summary__item">
      <span class="reception-summary__value" id="free-count">—</span>
      <span class="reception-summary__label">Free</span>
    </div>
    <div class="reception-summary__item">
      <span class="reception-summary__value" id="occupied-count">—</span>
      <span class="reception-summary__label">Occupied</span>
    </div>
    <div class="reception-summary__item">
      <span class="reception-summary__value" id="total-count">20</span>
      <span class="reception-summary__label">Total</span>
    </div>
  `);
  container.appendChild(summary);

  // Room grid
  const gridWrap = el('div', 'room-grid-wrap');
  const grid = el('div', 'room-grid');
  grid.id = 'room-grid';
  gridWrap.appendChild(grid);
  container.appendChild(gridWrap);

  // Load room statuses
  const statuses = await getAllRoomStatuses();
  updateSummary(statuses);
  renderRoomGrid(grid, statuses, 'all');

  // Filter chip events
  filterRow.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      filterRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      renderRoomGrid(grid, statuses, filter);
    });
  });

  return container;
}

function updateSummary(statuses) {
  const freeEl = $('#free-count');
  const occEl = $('#occupied-count');
  if (freeEl) freeEl.textContent = statuses.filter((r) => r.status === 'free').length;
  if (occEl) occEl.textContent = statuses.filter((r) => r.status === 'occupied').length;
}

function renderRoomGrid(grid, statuses, filter) {
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  const filtered = statuses.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  filtered.forEach((room) => {
    const card = createRoomCard(room);
    grid.appendChild(card);
  });
}

function createRoomCard(room) {
  const isOccupied = room.status === 'occupied';
  const color = catColor(room.category);
  const card = el('div', `room-card ${isOccupied ? 'room-card--occupied' : 'room-card--free'}`);
  card.style.borderLeftColor = isOccupied ? 'var(--error-400)' : color;

  card.innerHTML = `
    <div class="room-card__top">
      <span class="room-card__number">${room.number}</span>
      <span class="room-card__cat" style="background:${color}22; color:${color};">${catName(room.category)}</span>
    </div>
    <div class="room-card__status ${isOccupied ? 'room-card__status--occupied' : 'room-card__status--free'}">
      ${isOccupied
        ? getIcon('lock', 16) + '<span>Occupied</span>'
        : getIcon('checkCircle', 16) + '<span>Free</span>'}
    </div>
    ${isOccupied && room.occupancy
      ? `<div class="room-card__guest">${getIcon('user', 14)}<span>${room.occupancy.guestName || 'Guest'}</span></div>
         <div class="room-card__time">${getIcon('clock', 14)}<span>${formatTime(room.occupancy.checkOut)}</span></div>
         ${room.occupancy.stayType === 'shortRest'
           ? `<div class="room-card__shortrest">${getIcon('clock', 14)}<span>Short Rest</span></div>`
           : ''
         }`
      : `<div class="room-card__rate">${formatCurrency(getRoomPrice(room.category, 'lodge'))}<span class="room-card__rate-suffix">/night</span></div>`
    }
  `;

  card.addEventListener('click', () => {
    if (isOccupied) {
      openCheckoutSheet(room);
    } else {
      openSellSheet(room);
    }
  });

  return card;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════
//  SELL ROOM — Bottom Sheet
// ═══════════════════════════════════════════════════════════════

function openSellSheet(room) {
  // Remove any existing sheet
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';

  const sheet = el('div', 'bottom-sheet');
  const categories = getActiveCategories();
  const prices = getRoomPrices();
  const roomCat = categories.find((c) => c.id === room.category);
  const lodgeRate = getRoomPrice(room.category, 'lodge');
  const shortRestRate = getRoomPrice(room.category, 'shortRest');
  const canShortRest = room.shortRestEligible;

  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>Sell Room ${room.number}</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="form-row">
        <label class="form-label">Room Category</label>
        <div class="form-static">${catName(room.category)} · ${formatCurrency(lodgeRate)}/night</div>
      </div>

      <div class="form-row">
        <label class="form-label">Stay Type</label>
        <div class="segmented">
          <button class="seg-btn active" data-stay="lodge">Lodge (Overnight)</button>
          <button class="seg-btn ${canShortRest ? '' : 'seg-btn--disabled'}" data-stay="shortRest" ${canShortRest ? '' : 'disabled'}>
            Short Rest · ${formatCurrency(shortRestRate)}
          </button>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">Customer Name <span class="form-required">*</span></label>
        <input type="text" class="form-input" id="sell-guest-name" placeholder="Enter guest name" autocomplete="off" />
      </div>

      <div class="form-row">
        <label class="form-label">Phone Number</label>
        <input type="tel" class="form-input" id="sell-phone" placeholder="0800 000 0000" autocomplete="off" />
        <div class="form-hint hidden" id="returning-customer"></div>
      </div>

      <div class="form-row form-row--2col">
        <div>
          <label class="form-label">Check-in</label>
          <input type="text" class="form-input form-input--locked" id="sell-checkin" value="${new Date().toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })}" readonly />
        </div>
        <div>
          <label class="form-label">Check-out</label>
          <input type="datetime-local" class="form-input" id="sell-checkout" />
        </div>
      </div>

      <div class="form-row">
        <label class="form-label">Payment Method</label>
        <div class="segmented" id="payment-segmented">
          ${PAYMENT_METHODS.map((m, i) =>
            `<button class="seg-btn ${i === 0 ? 'active' : ''}" data-payment="${m.id}">${m.name}</button>`
          ).join('')}
        </div>
        <input type="text" class="form-input hidden" id="sell-refno" placeholder="Reference No." style="margin-top:8px;" />
      </div>

      <div class="form-row">
        <label class="form-label">Attendant Name</label>
        <input type="text" class="form-input" id="sell-attendant" placeholder="Your name" />
      </div>

      <div class="form-total">
        <span>Total</span>
        <span class="form-total__value" id="sell-total">${formatCurrency(lodgeRate)}</span>
      </div>

      <button class="btn btn--primary btn--full" id="sell-save-btn">
        ${getIcon('check', 20)}
        <span>Confirm Sale</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // State for this sheet
  let stayType = 'lodge';
  let paymentMethod = 'cash';
  let timestampLocked = false;

  // Lock timestamp when user starts typing
  const guestInput = $('#sell-guest-name', sheet);
  guestInput.addEventListener('input', () => {
    if (!timestampLocked) {
      timestampLocked = true;
      $('#sell-checkin', sheet).value = new Date().toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' });
    }
  });

  // Set default checkout (next day noon for lodge, +4 hours for short rest)
  const now = new Date();
  const checkoutDefault = new Date(now);
  checkoutDefault.setDate(checkoutDefault.getDate() + 1);
  checkoutDefault.setHours(12, 0, 0, 0);
  const coInput = $('#sell-checkout', sheet);
  coInput.value = toLocalDateTimeInput(checkoutDefault);

  // Stay type toggle
  sheet.querySelectorAll('[data-stay]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      sheet.querySelectorAll('[data-stay]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      stayType = btn.dataset.stay;
      const rate = stayType === 'shortRest' ? shortRestRate : lodgeRate;
      $('#sell-total', sheet).textContent = formatCurrency(rate);

      // Adjust checkout default
      if (stayType === 'shortRest') {
        const sr = new Date(now);
        sr.setHours(sr.getHours() + 4);
        coInput.value = toLocalDateTimeInput(sr);
      } else {
        const ld = new Date(now);
        ld.setDate(ld.getDate() + 1);
        ld.setHours(12, 0, 0, 0);
        coInput.value = toLocalDateTimeInput(ld);
      }
    });
  });

  // Payment method toggle
  sheet.querySelectorAll('[data-payment]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sheet.querySelectorAll('[data-payment]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      paymentMethod = btn.dataset.payment;
      const refInput = $('#sell-refno', sheet);
      if (paymentMethod !== 'cash') {
        refInput.classList.remove('hidden');
      } else {
        refInput.classList.add('hidden');
      }
    });
  });

  // Phone — detect returning customer
  const phoneInput = $('#sell-phone', sheet);
  phoneInput.addEventListener('blur', async () => {
    const phone = phoneInput.value.trim();
    const hint = $('#returning-customer', sheet);
    if (phone.length >= 7) {
      const existing = await getCustomerByPhone(phone);
      if (existing) {
        hint.innerHTML = `${getIcon('checkCircle', 14)} <span>Returning customer: ${existing.name}</span>`;
        hint.classList.remove('hidden');
        hint.classList.add('form-hint--success');
        if (!guestInput.value) guestInput.value = existing.name;
      } else {
        hint.classList.add('hidden');
      }
    } else {
      hint.classList.add('hidden');
    }
  });

  // Close handlers
  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });

  // Save
  $('#sell-save-btn', sheet).addEventListener('click', () => {
    handleSellSave(room, sheet, {
      stayType,
      paymentMethod,
      lodgeRate,
      shortRestRate,
      timestamp: timestampLocked ? $('#sell-checkin', sheet).value : new Date().toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }),
    });
  });
}

function toLocalDateTimeInput(date) {
  const off = date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

async function handleSellSave(room, sheet, ctx) {
  const guestName = $('#sell-guest-name', sheet).value.trim();
  const phone = $('#sell-phone', sheet).value.trim();
  const checkoutVal = $('#sell-checkout', sheet).value;
  const attendant = $('#sell-attendant', sheet).value.trim();
  const refNo = $('#sell-refno', sheet).value.trim();

  if (!guestName) {
    _showToast('Please enter customer name', 'error');
    $('#sell-guest-name', sheet).focus();
    return;
  }

  const total = ctx.stayType === 'shortRest' ? ctx.shortRestRate : ctx.lodgeRate;
  const checkInTime = new Date();
  const checkOutTime = checkoutVal ? new Date(checkoutVal) : new Date(Date.now() + 24 * 3600000);

  const saleId = generateSaleId('reception');

  const sale = {
    id: saleId,
    department: 'reception',
    type: 'room_sale',
    roomNumber: room.number,
    categoryId: room.category,
    categoryName: catName(room.category),
    guestName,
    phone,
    stayType: ctx.stayType,
    checkIn: checkInTime.toISOString(),
    checkOut: checkOutTime.toISOString(),
    total,
    paymentMethod: ctx.paymentMethod,
    refNo: ctx.paymentMethod !== 'cash' ? refNo : '',
    attendant: attendant || 'Reception',
    soldBy: localStorage.getItem('xclusive_staff_username') || localStorage.getItem('xclusive_staff_name') || attendant || 'Reception',
    username: localStorage.getItem('xclusive_staff_username') || '',
    customerName: guestName,
    timeStarted: window.__xclusiveSaleStarted || checkInTime.toISOString(),
    timeSaved: checkInTime.toISOString(),
    timestamp: checkInTime.toISOString(),
    dateStr: todayStr(),
    locked: true,
    voided: false,
    syncStatus: 'pending',
  };

  await saveSale(sale);
  const saleSyncResult = await syncSaleImmediately(sale);
  const saleSyncPending = !saleSyncResult.success;

  // Save customer
  if (phone) {
    const existing = await getCustomerByPhone(phone);
    if (!existing) {
      await saveCustomer({
        id: 'cust_' + Date.now().toString(36),
        name: guestName,
        phone,
        firstVisit: checkInTime.toISOString(),
        visits: 1,
      });
    } else {
      existing.visits = (existing.visits || 1) + 1;
      existing.lastVisit = checkInTime.toISOString();
      await saveCustomer(existing);
    }
  }

  // Mark room occupied
  await setRoomOccupancy({
    roomId: room.number,
    status: 'occupied',
    guestName,
    phone,
    categoryId: room.category,
    stayType: ctx.stayType,
    checkIn: checkInTime.toISOString(),
    checkOut: checkOutTime.toISOString(),
    saleId,
    total,
  });

  closeSheet();
  _showToast(saleSyncPending ? `Room ${room.number} saved; Google Sheets sync pending` : `Room ${room.number} sold to ${guestName}`, saleSyncPending ? '' : 'success');
  _refreshDashboard();

  // Show success screen
  showSaleSuccess(sale);
}

// ═══════════════════════════════════════════════════════════════
//  CHECKOUT — Bottom Sheet
// ═══════════════════════════════════════════════════════════════

function openCheckoutSheet(room) {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';

  const sheet = el('div', 'bottom-sheet');
  const occ = room.occupancy;
  const checkInDate = new Date(occ.checkIn).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const checkOutDate = new Date(occ.checkOut).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>Room ${room.number} — Checkout</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="checkout-info">
        <div class="checkout-info__row">
          <span class="checkout-info__label">Guest</span>
          <span class="checkout-info__value">${occ.guestName || '—'}</span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Phone</span>
          <span class="checkout-info__value">${occ.phone || '—'}</span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Stay Type</span>
          <span class="checkout-info__value">
            <span class="badge ${occ.stayType === 'shortRest' ? 'badge--warning' : 'badge--gold'}">
              ${occ.stayType === 'shortRest' ? 'Short Rest' : 'Lodge'}
            </span>
          </span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Category</span>
          <span class="checkout-info__value">${catName(occ.categoryId)}</span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Check-in</span>
          <span class="checkout-info__value">${checkInDate}</span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Check-out</span>
          <span class="checkout-info__value">${checkOutDate}</span>
        </div>
        <div class="checkout-info__row">
          <span class="checkout-info__label">Receipt #</span>
          <span class="checkout-info__value" style="font-family:monospace; font-size:12px;">${occ.saleId}</span>
        </div>
      </div>

      <div class="form-total">
        <span>Amount Paid</span>
        <span class="form-total__value">${formatCurrency(occ.total)}</span>
      </div>

      <div class="form-row">
        <label class="form-label">Additional Charge (optional)</label>
        <input type="number" class="form-input" id="checkout-extra" placeholder="0" min="0" />
      </div>

      <button class="btn btn--primary btn--full" id="checkout-btn">
        ${getIcon('logout', 20)}
        <span>Check Out & Free Room</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });

  $('#checkout-btn', sheet).addEventListener('click', async () => {
    const extra = Number($('#checkout-extra', sheet).value) || 0;
    let extraSyncPending = false;
    if (extra > 0) {
      const extraSale = {
        id: generateSaleId('reception'),
        department: 'reception',
        type: 'extra_charge',
        roomNumber: room.number,
        guestName: occ.guestName,
        total: extra,
        paymentMethod: 'cash',
        attendant: 'Reception',
        soldBy: localStorage.getItem('xclusive_staff_username') || localStorage.getItem('xclusive_staff_name') || 'Reception',
        username: localStorage.getItem('xclusive_staff_username') || '',
        timeStarted: window.__xclusiveSaleStarted || new Date().toISOString(),
        timeSaved: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        dateStr: todayStr(),
        locked: true,
        voided: false,
        syncStatus: 'pending',
      };
      await saveSale(extraSale);
      const extraSyncResult = await syncSaleImmediately(extraSale);
      extraSyncPending = !extraSyncResult.success;
    }

    await clearRoomOccupancy(room.number);
    closeSheet();
    _showToast(extraSyncPending ? `Room ${room.number} checked out; extra charge sync pending` : `Room ${room.number} checked out`, extraSyncPending ? '' : 'success');
    _refreshDashboard();

    // Refresh the room grid
    refreshReceptionGrid();
  });
}

// ═══════════════════════════════════════════════════════════════
//  SALE SUCCESS SCREEN
// ═══════════════════════════════════════════════════════════════

function showSaleSuccess(sale) {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';

  const sheet = el('div', 'bottom-sheet bottom-sheet--success');
  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__body" style="padding-top:var(--xl);">
      <div class="success-icon">
        ${getIcon('checkCircle', 48)}
      </div>
      <h2 class="success-title">Sale Complete</h2>
      <p class="success-subtitle">Room ${sale.roomNumber} sold to ${sale.guestName}</p>

      <div class="success-receipt">
        <div class="success-receipt__row">
          <span>Receipt #</span>
          <span style="font-family:monospace;">${sale.id}</span>
        </div>
        <div class="success-receipt__row">
          <span>Stay Type</span>
          <span>${sale.stayType === 'shortRest' ? 'Short Rest' : 'Lodge'}</span>
        </div>
        <div class="success-receipt__row">
          <span>Payment</span>
          <span>${sale.paymentMethod.toUpperCase()}</span>
        </div>
        <div class="success-receipt__row success-receipt__row--total">
          <span>Total</span>
          <span style="color:var(--gold-300); font-size:18px;">${formatCurrency(sale.total)}</span>
        </div>
      </div>

      <button class="btn btn--ghost btn--full" id="success-done">
        ${getIcon('check', 20)}
        <span>Done</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  $('#success-done', sheet).addEventListener('click', () => {
    closeSheet();
    refreshReceptionGrid();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSheet();
      refreshReceptionGrid();
    }
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

async function refreshReceptionGrid() {
  const grid = $('#room-grid');
  if (!grid) return;
  const statuses = await getAllRoomStatuses();
  updateSummary(statuses);

  const activeFilter = $('.chip.active');
  const filter = activeFilter ? activeFilter.dataset.filter : 'all';
  renderRoomGrid(grid, statuses, filter);
}
