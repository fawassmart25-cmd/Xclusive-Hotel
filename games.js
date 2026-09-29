// ═══════════════════════════════════════════════════════════
//  Games Module — Game lounge POS
//  Customer, Game Type, Duration, Price (auto-calc), Payment
// ═══════════════════════════════════════════════════════════

import {
  getItemsByDepartment,
  saveItemSale,
  saveSale,
  getSale,
  saveGameSession,
  getActiveGameSessions,
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
import { syncSaleImmediately } from './sync.js';

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

export function setGamesCallbacks({ showToast, isOnline, refreshDashboard }) {
  _showToast = showToast;
  _isOnline = isOnline;
  _refreshDashboard = refreshDashboard;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN RENDER
// ═══════════════════════════════════════════════════════════════

export async function renderGames() {
  const deptId = 'games';
  const items = (await getItemsByDepartment(deptId)).filter(i => Number(i.quantity) > 0);
  const activeSessions = await getActiveGameSessions();

  const container = el('div', 'dashboard');

  // New game button
  const newGameBtn = el('button', 'btn btn--primary btn--full games-new-btn');
  newGameBtn.innerHTML = `${getIcon('plus', 20)}<span>New Game Session</span>`;
  newGameBtn.addEventListener('click', () => openGameSheet(container, deptId, items));
  container.appendChild(newGameBtn);

  // Active sessions
  if (activeSessions.length > 0) {
    const sessionsHeader = el('div', 'section-header', `
      <span class="section-header__title">Active Sessions</span>
    `);
    container.appendChild(sessionsHeader);

    const sessionsList = el('div', 'games-sessions');
    activeSessions.forEach((session) => {
      const card = createActiveSessionCard(session);
      sessionsList.appendChild(card);
    });
    container.appendChild(sessionsList);
  }

  // Game type grid
  const typesHeader = el('div', 'section-header', `
    <span class="section-header__title">Game Types</span>
  `);
  container.appendChild(typesHeader);

  const grid = el('div', 'games-grid');
  items.forEach((item) => {
    const tile = el('div', 'games-tile');
    tile.innerHTML = `
      <div class="games-tile__icon">${getIcon('gamepad', 28)}</div>
      <div class="games-tile__name">${item.name}</div>
      <div class="games-tile__price">${formatCurrency(item.price)}</div>
    `;
    tile.addEventListener('click', () => {
      openGameSheet(container, deptId, items, item);
    });
    grid.appendChild(tile);
  });
  container.appendChild(grid);

  return container;
}

function createActiveSessionCard(session) {
  const startTime = new Date(session.startTime);
  const now = new Date();
  const elapsedMs = now - startTime;
  const hours = Math.floor(elapsedMs / 3600000);
  const mins = Math.floor((elapsedMs % 3600000) / 60000);

  const card = el('div', 'games-session-card');
  card.innerHTML = `
    <div class="games-session-card__header">
      <div class="games-session-card__type">${getIcon('gamepad', 18)}<span>${session.gameType}</span></div>
      <span class="badge badge--warning">Active</span>
    </div>
    <div class="games-session-card__customer">
      ${getIcon('user', 16)}<span>${session.customerName}</span>
    </div>
    <div class="games-session-card__time">
      ${getIcon('clock', 16)}<span>Started ${startTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} · ${hours}h ${mins}m ago</span>
    </div>
    <div class="games-session-card__actions">
      <button class="btn btn--primary games-session-card__end" data-session-id="${session.id}">
        ${getIcon('check', 18)}<span>End & Charge</span>
      </button>
    </div>
  `;

  card.querySelector('.games-session-card__end').addEventListener('click', () => {
    endSession(session);
  });

  return card;
}

// ═══════════════════════════════════════════════════════════════
//  NEW GAME SHEET
// ═══════════════════════════════════════════════════════════════

function openGameSheet(parentContainer, deptId, items, preselectedItem) {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const online = _isOnline();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';

  const sheet = el('div', 'bottom-sheet');
  let gameStartedAt = null;
  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>New Game Session</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="form-row">
        <label class="form-label">Customer Name <span class="form-required">*</span></label>
        <input type="text" class="form-input" id="game-customer" placeholder="Enter customer name" autocomplete="off" />
      </div>

      <div class="form-row">
        <label class="form-label">Game Type <span class="form-required">*</span></label>
        <select class="form-input" id="game-type">
          <option value="">Select game...</option>
          ${items.map((i) => `<option value="${i.id}" data-name="${i.name}" data-price="${i.price}" ${preselectedItem && i.id === preselectedItem.id ? 'selected' : ''}>${i.name} — ${formatCurrency(i.price)}/hour</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <label class="form-label">Duration (hours) <span class="form-required">*</span></label>
        <div class="segmented" id="game-duration-seg">
          <button class="seg-btn active" data-dur="1">1 hr</button>
          <button class="seg-btn" data-dur="2">2 hrs</button>
          <button class="seg-btn" data-dur="3">3 hrs</button>
          <button class="seg-btn" data-dur="custom">Custom</button>
        </div>
        <input type="number" class="form-input hidden" id="game-duration-custom" placeholder="Hours" min="0.5" step="0.5" style="margin-top:8px;" />
      </div>

      <div class="form-row">
        <label class="form-label">Payment Method</label>
        <div class="segmented" id="game-payment">
          ${PAYMENT_METHODS.map((m, i) =>
            `<button class="seg-btn ${i === 0 ? 'active' : ''}" data-payment="${m.id}">${m.name}</button>`
          ).join('')}
        </div>
        <input type="text" class="form-input hidden" id="game-refno" placeholder="Reference No." style="margin-top:8px;" />
      </div>

      <div class="form-row">
        <label class="form-label">Attendant Name</label>
        <input type="text" class="form-input" id="game-attendant" placeholder="Your name" />
      </div>

      ${!online ? `
        <div class="pending-sync-banner">
          ${getIcon('wifiOff', 16)}
          <span>Offline — will sync when reconnected</span>
        </div>
      ` : ''}

      <div class="form-total">
        <span>Total</span>
        <span class="form-total__value" id="game-total">${formatCurrency(0)}</span>
      </div>

      <button class="btn btn--primary btn--full" id="game-start-btn">
        ${getIcon('gamepad', 20)}
        <span>Start Session</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  let duration = 1;
  let paymentMethod = 'cash';

  // Duration toggle
  sheet.querySelectorAll('[data-dur]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sheet.querySelectorAll('[data-dur]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const durVal = btn.dataset.dur;
      const customInput = $('#game-duration-custom', sheet);
      if (durVal === 'custom') {
        customInput.classList.remove('hidden');
        duration = Number(customInput.value) || 1;
      } else {
        customInput.classList.add('hidden');
        duration = Number(durVal);
      }
      updateGameTotal(sheet, duration);
    });
  });

  sheet.addEventListener('focusin', () => { if (!sheet.dataset.timeStarted) sheet.dataset.timeStarted = new Date().toISOString(); });
  sheet.dataset.timeStarted = gameStartedAt || '';

  $('#game-duration-custom', sheet).addEventListener('input', () => {
    duration = Number($('#game-duration-custom', sheet).value) || 1;
    updateGameTotal(sheet, duration);
  });

  // Game type change updates total
  $('#game-type', sheet).addEventListener('change', () => {
    updateGameTotal(sheet, duration);
  });

  // Payment toggle
  sheet.querySelectorAll('[data-payment]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sheet.querySelectorAll('[data-payment]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      paymentMethod = btn.dataset.payment;
      const refInput = $('#game-refno', sheet);
      refInput.classList.toggle('hidden', paymentMethod === 'cash');
    });
  });

  // Close
  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });

  // Initial total
  if (preselectedItem) {
    updateGameTotal(sheet, duration);
  }

  // Start session
  $('#game-start-btn', sheet).addEventListener('click', async () => {
    const customer = $('#game-customer', sheet).value.trim();
    const typeSelect = $('#game-type', sheet);
    const typeId = typeSelect.value;
    const typeName = typeSelect.selectedIndex > 0 ? typeSelect.options[typeSelect.selectedIndex].dataset.name : '';
    const typePrice = typeSelect.selectedIndex > 0 ? Number(typeSelect.options[typeSelect.selectedIndex].dataset.price) : 0;
    const attendant = $('#game-attendant', sheet).value.trim();
    const refNo = $('#game-refno', sheet).value.trim();

    if (!customer) {
      _showToast('Enter customer name', 'error');
      $('#game-customer', sheet).focus();
      return;
    }
    if (!typeId) {
      _showToast('Select game type', 'error');
      typeSelect.focus();
      return;
    }

    const total = typePrice * duration;
    const now = new Date();
    const sessionId = generateId('GS');

    // Save session
    const session = {
      id: sessionId,
      department: 'games',
      customerName: customer,
      gameType: typeName,
      gameTypeId: typeId,
      duration,
      unitPrice: typePrice,
      total,
      paymentMethod,
      refNo: paymentMethod !== 'cash' ? refNo : '',
      attendant: attendant || 'Game Lounge',
      startTime: sheet.dataset.timeStarted || now.toISOString(),
      status: 'active',
      dateStr: todayStr(),
      syncStatus: 'pending',
    };

    const immediateSale = {
      id: generateSaleId('games'),
      department: 'games',
      type: 'game_sale',
      status: 'paid',
      sessionId,
      gameType: typeName,
      gameTypeId: typeId,
      itemName: typeName,
      customerName: customer,
      duration,
      unitPrice: typePrice,
      total,
      paymentMethod,
      refNo: paymentMethod !== 'cash' ? refNo : '',
      attendant: attendant || 'Game Lounge',
      soldBy: localStorage.getItem('xclusive_staff_username') || localStorage.getItem('xclusive_staff_name') || attendant || 'Game',
      username: localStorage.getItem('xclusive_staff_username') || '',
      timeStarted: session.startTime,
      timeSaved: now.toISOString(),
      timestamp: now.toISOString(),
      dateStr: todayStr(),
      receiptNo: generateSaleId('games'),
      locked: true,
      voided: false,
      syncStatus: 'pending',
    };
    await saveSale(immediateSale);
    const immediateSync = await syncSaleImmediately(immediateSale);
    session.saleId = immediateSale.id;
    session.syncStatus = immediateSync.success ? 'synced' : 'pending';
    await saveGameSession(session);
    closeSheet();
    _showToast(immediateSync.success ? `Session started and paid for ${customer}` : `Session started; sync pending`, immediateSync.success ? 'success' : '');
    _refreshDashboard();

    // Re-render games
    refreshGames(parentContainer);
  });
}

function updateGameTotal(sheet, duration) {
  const typeSelect = $('#game-type', sheet);
  const price = typeSelect.selectedIndex > 0 ? Number(typeSelect.options[typeSelect.selectedIndex].dataset.price) : 0;
  const total = price * duration;
  $('#game-total', sheet).textContent = formatCurrency(total);
}

// ═══════════════════════════════════════════════════════════════
//  END SESSION — finalize and save as sale
// ═══════════════════════════════════════════════════════════════

async function endSession(session) {
  const endTime = new Date();
  const startTime = new Date(session.startTime);
  const actualMs = endTime - startTime;
  const actualHours = Math.max(0.5, Math.ceil(actualMs / 3600000));

  // Use actual duration if longer than booked, otherwise use booked
  const finalDuration = Math.max(session.duration, actualHours);
  const finalTotal = session.unitPrice * finalDuration;

  // The sale was registered as paid when the session started. Update its
  // local record with the final duration without creating a duplicate sale.
  const sale = await getSale(session.saleId);
  const saleSyncResult = { success: true };
  if (sale) {
    sale.duration = finalDuration;
    sale.total = finalTotal;
    sale.endTime = endTime.toISOString();
    sale.timeSaved = endTime.toISOString();
    await saveSale(sale);
  }

  _showToast(!saleSyncResult.success ? `Session ended; Google Sheets sync pending` : `Session ended — ${formatCurrency(finalTotal)}`, !saleSyncResult.success ? '' : 'success');
  _refreshDashboard();

  // Re-render
  const content = $('#content-area');
  if (content) {
    while (content.firstChild) content.removeChild(content.firstChild);
    const gamesEl = await renderGames();
    content.appendChild(gamesEl);
  }
}

// ═══════════════════════════════════════════════════════════════
//  REFRESH
// ═══════════════════════════════════════════════════════════════

async function refreshGames(parentContainer) {
  const content = $('#content-area');
  if (!content) return;
  while (content.firstChild) content.removeChild(content.firstChild);
  const gamesEl = await renderGames();
  content.appendChild(gamesEl);
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
