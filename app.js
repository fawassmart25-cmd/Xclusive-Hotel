// ═══════════════════════════════════════════════════════════
//  XCLUSIVE HOTEL MANAGER — Application Shell
//  Phase 5: Analytics Dashboard, Sync, Export, Deployment
// ═══════════════════════════════════════════════════════════

import {
  APP_CONFIG,
  DEPARTMENTS,
  ROLES,
  getActiveDepartments,
  getActiveRoles,
  getRoleById,
  getDepartmentById,
  getActiveCategories,
  formatCurrency,
} from './config.js';
import { getIcon } from './icons.js';
import { renderReception, setReceptionCallbacks } from './reception.js';
import { renderPriceManager, setPriceManagerCallbacks } from './pricemanager.js';
import { renderPOS, setPOSCallbacks } from './pos.js';
import { renderGames, setGamesCallbacks } from './games.js';
import {
  getAllSales,
  getSalesByDate,
  getSalesByDepartment,
  getFullInventory,
  getStockInByDepartment,
  todayStr,
} from './db.js';
import { getAllRoomStatuses, countFreeRooms, countOccupiedRooms } from './rooms.js';
import { getRoomPrices, getAllItemPrices } from './prices.js';
import {
  getSyncUrl,
  setSyncUrl,
  getLastSyncTime,
  getPendingCount,
  syncToGoogleSheets,
  pushPricesToSheets,
} from './sync.js';
import { seedStaff, authenticate, getAllStaff, createStaff, updateStaff, removeStaff, STAFF_ROLES } from './staff.js';
import { renderReports } from './reports.js';
import { renderStaffManagement } from './staff-page.js';

// ── State ────────────────────────────────────────────────────
const state = {
  currentRole: null,
  currentTab: null,
  currentStaffName: null,
  currentUser: null,
  online: navigator.onLine,
};

const STORAGE_KEYS = {
  role: 'xclusive_role',
  staffName: 'xclusive_staff_name',
  user: 'xclusive_currentUser',
};

// ── DOM Helpers ──────────────────────────────────────────────
function el(tag, className = '', innerHTML = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (innerHTML) e.innerHTML = innerHTML;
  return e;
}

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// ── Toast ────────────────────────────────────────────────────
function showToast(message, type = '') {
  const container = $('.toast-container') || createToastContainer();
  const toast = el('div', `toast ${type ? 'toast--' + type : ''}`);
  toast.innerHTML = `${getIcon(type === 'success' ? 'checkCircle' : type === 'error' ? 'circleX' : 'sparkles', 20)}<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

function createToastContainer() {
  const c = el('div', 'toast-container');
  document.body.appendChild(c);
  return c;
}

// ── Module callbacks ─────────────────────────────────────────
setReceptionCallbacks({
  showToast,
  refreshDashboard: () => { if (state.currentTab === 'dashboard') renderContent('dashboard', state.currentRole); },
});

setPriceManagerCallbacks({
  showToast,
  onPricesChanged: () => {},
});

setPOSCallbacks({
  showToast,
  isOnline: () => state.online,
  refreshDashboard: () => { if (state.currentTab === 'dashboard') renderContent('dashboard', state.currentRole); },
});

setGamesCallbacks({
  showToast,
  isOnline: () => state.online,
  refreshDashboard: () => { if (state.currentTab === 'dashboard') renderContent('dashboard', state.currentRole); },
});

// ═══════════════════════════════════════════════════════════════
//  AUTHENTICATION — IndexedDB staff accounts
// ═══════════════════════════════════════════════════════════════

async function renderLogin(errorMessage = '') {
  const app = $('#app'); clearNode(app);
  await seedStaff();
  const screen = el('div', 'login-screen');
  screen.innerHTML = `
    <div class="login-screen__header fade-in-up">
      <div class="login-screen__logo">${getIcon('hotel', 36)}</div>
      <h1 class="login-screen__title">${APP_CONFIG.name}</h1>
      <p class="login-screen__subtitle">Sign in with your staff account</p>
    </div>
    <form class="auth-card fade-in-up" id="login-form">
      <div class="form-row"><label class="form-label">Username</label><input id="login-username" class="form-input" autocomplete="username" required></div>
      <div class="form-row"><label class="form-label">PIN / Password</label><input id="login-pin" class="form-input" type="password" inputmode="numeric" autocomplete="current-password" required></div>
      <div class="auth-error" id="login-error">${errorMessage}</div>
      <button class="btn btn--primary btn--full" type="submit">${getIcon('lock',18)} Sign In</button>
    </form>
    <p style="text-align:center;font-size:11px;color:var(--ink-200);margin-top:auto;padding-top:var(--xl);">XCLUSIVE LATAGATI HOTEL · Offline-first</p>`;
  app.appendChild(screen);
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username=$('#login-username').value.trim(), pin=$('#login-pin').value;
    const user=await authenticate(username,pin);
    if(!user){ $('#login-error').textContent='Invalid username/PIN or inactive account'; return; }
    state.currentUser=user; state.currentRole=getRoleById(user.role) || {id:user.role,name:user.role};
    state.currentStaffName=user.name; state.currentTab=null;
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.role,user.role);
    localStorage.setItem(STORAGE_KEYS.staffName,user.name);
    history.replaceState({},'', user.role==='admin'?'/':'/'+(user.role==='game'?'game':user.role));
    renderApp();
  });
}

function accessAllowed(role, tabId) {
  if (!role) return false;
  if (role === 'admin') return true;
  if (role === 'reception') return ['reception','bar','kitchen','games','reports','analysis'].includes(tabId);
  return (role === 'bar' && tabId === 'bar') || (role === 'kitchen' && tabId === 'kitchen') || (role === 'game' && tabId === 'games');
}

function guardRoute(tabId, roleId = state.currentRole?.id) {
  if (!roleId || !accessAllowed(roleId, tabId)) {
    const label = roleId === 'bar' ? 'Bar' : roleId === 'kitchen' ? 'Kitchen' : roleId === 'game' ? 'Game' : roleId === 'reception' ? 'Reception' : 'Staff';
    showAccessDenied(label, roleId);
    return false;
  }
  return true;
}

function showAccessDenied(label, roleId) {
  const target = roleId === 'bar' ? 'bar' : roleId === 'kitchen' ? 'kitchen' : roleId === 'game' ? 'games' : roleId === 'reception' ? 'reception' : 'dashboard';
  showToast(`ACCESS DENIED - ${label} Staff Only`, 'error');
  state.currentTab=target;
  history.replaceState({},'',target==='games'?'/game':'/'+target);
  renderApp();
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP SHELL
// ═══════════════════════════════════════════════════════════════

function renderApp() {
  const app = $('#app');
  clearNode(app);

  const role = state.currentRole;
  if (!role) { renderLogin(); return; }

  const activeDepts = getActiveDepartments();
  const tabs = buildTabList(role, activeDepts);
  const pathTab = ({'/reception':'reception','/bar':'bar','/kitchen':'kitchen','/game':'games','/games':'games','/reports':'reports','/analysis':'analysis','/staff':'staff','/':'dashboard'})[location.pathname];
  if (pathTab && guardRoute(pathTab, role.id)) state.currentTab = pathTab;
  if (!state.currentTab || !tabs.find((t) => t.id === state.currentTab)) {
    const fallback = role.id === 'admin' ? 'dashboard' : role.id === 'reception' ? 'reception' : role.id === 'bar' ? 'bar' : role.id === 'kitchen' ? 'kitchen' : 'games';
    state.currentTab = tabs.find(t => t.id === fallback)?.id || tabs[0].id;
  }

  const shell = el('div', 'app-shell fade-in');
  shell.appendChild(buildTopBar(role));

  const content = el('div', 'content-area');
  content.id = 'content-area';
  shell.appendChild(content);

  shell.appendChild(buildBottomNav(tabs));
  app.appendChild(shell);

  renderContent(state.currentTab, role);
}

function buildTabList(role, activeDepts) {
  const tabs=[];
  const add=(id,name,icon,type='page')=>tabs.push({id,name,icon,type});
  if(role.isAdmin){ add('dashboard','Home','grid'); }
  if(role.id==='reception' || role.isAdmin){ add('reception','Rooms','door','department'); }
  if(role.id==='reception' || role.id==='bar' || role.isAdmin){ add('bar','Bar','wine','department'); }
  if(role.id==='reception' || role.id==='kitchen' || role.isAdmin){ add('kitchen','Kitchen','utensils','department'); }
  if(role.id==='reception' || role.id==='game' || role.isAdmin){ add('games','Game','gamepad','department'); }
  if(role.id==='reception' || role.isAdmin) { add('reports','Reports','receipt'); add('analysis','Analysis','chart'); }
  if(role.isAdmin){ add('pricemanager','Prices','tag'); add('staff','Staff','users'); add('settings','Admin','settings'); }
  return tabs;
}
function buildTopBar(role) {
  const bar = el('div', 'top-bar');
  bar.innerHTML = `
    <div class="top-bar__left">
      <div class="top-bar__logo">
        <div class="top-bar__logo-icon">${getIcon('hotel', 18)}</div>
        <span class="top-bar__logo-text">${APP_CONFIG.shortName}</span>
      </div>
      ${state.currentStaffName ? `<span class="top-bar__staff">${state.currentStaffName}</span>` : ''}
    </div>
    <div class="top-bar__right">
      <div class="offline-indicator ${state.online ? 'online' : ''}" id="offline-indicator">
        ${getIcon(state.online ? 'wifi' : 'wifiOff', 14)}
        <span>${state.online ? 'Online' : 'Offline'}</span>
      </div>
      <button class="logout-btn-top" id="topbar-logout" title="Sign Out">
        ${getIcon('logout', 18)}
      </button>
    </div>
  `;
  bar.querySelector('#topbar-logout').addEventListener('click', logout);
  return bar;
}

function buildBottomNav(tabs) {
  const nav = el('nav', 'bottom-nav');
  tabs.forEach((tab) => {
    const item = el('button', `nav-item ${tab.id === state.currentTab ? 'active' : ''}`);
    item.dataset.tabId = tab.id;
    item.innerHTML = `${getIcon(tab.icon, 24)}<span class="nav-item__label">${tab.name}</span>`;
    item.addEventListener('click', () => switchTab(tab.id));
    nav.appendChild(item);
  });
  return nav;
}

function switchTab(tabId) {
  if (!guardRoute(tabId, state.currentRole?.id)) return;
  if (tabId === state.currentTab) return;
  state.currentTab = tabId;
  const routeMap={dashboard:'/',reception:'/reception',bar:'/bar',kitchen:'/kitchen',games:'/game',reports:'/reports',analysis:'/analysis',staff:'/staff',pricemanager:'/prices',settings:'/settings'};
  history.pushState({},'',routeMap[tabId]||'/');
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tabId === tabId);
  });
  const topBar = $('.top-bar');
  if (topBar) topBar.replaceWith(buildTopBar(state.currentRole));
  renderContent(tabId, state.currentRole);
}

// ═══════════════════════════════════════════════════════════════
//  CONTENT ROUTING
// ═══════════════════════════════════════════════════════════════

async function renderContent(tabId, role) {
  const content = $('#content-area');
  if (!content) return;
  clearNode(content);

  if (!guardRoute(tabId, role.id)) return;
  if (tabId === 'reception') { content.appendChild(await renderReception()); return; }
  if (tabId === 'bar' || tabId === 'kitchen') { content.appendChild(await renderPOS(tabId)); return; }
  if (tabId === 'games') { content.appendChild(await renderGames()); return; }

  const wrapper = el('div', 'fade-in-up');

  if (tabId === 'dashboard') {
    await renderDashboard(role, wrapper);
  } else if (tabId === 'settings') {
    wrapper.appendChild(renderSettings(role));
  } else if (tabId === 'pricemanager') {
    wrapper.appendChild(renderPriceManager());
  } else if (tabId === 'reports' || tabId === 'analysis') {
    wrapper.appendChild(await renderReports({showToast, title: tabId === 'analysis' ? 'Analytics' : 'Reports'}));
  } else if (tabId === 'staff') {
    wrapper.appendChild(await renderStaffManagement());
  } else {
    wrapper.appendChild(renderGenericEmpty());
  }

  content.appendChild(wrapper);
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD — Analytics
// ═══════════════════════════════════════════════════════════════

async function renderDashboard(role, container) {
  const dashboardEl = el('div', 'dashboard');

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  dashboardEl.appendChild(el('div', '', `
    <div class="dashboard__greeting">${greeting}, ${role.name}</div>
    <div class="dashboard__date">${dateStr}</div>
  `));

  // Fetch all data
  const activeDepts = getActiveDepartments();
  const todaySales = await getSalesByDate(todayStr());
  const validSales = todaySales.filter((s) => !s.voided);
  const todayRevenue = validSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  // ── Top stats ────────────────────────────────────────────
  const stats = el('div', 'stat-grid stagger');

  if (activeDepts.find((d) => d.id === 'reception')) {
    const occCount = await countOccupiedRooms();
    const freeCount = await countFreeRooms();
    stats.appendChild(createStatCard('door', `${occCount}/20`, 'Rooms Occupied'));
    stats.appendChild(createStatCard('checkCircle', String(freeCount), 'Free Rooms'));
  }

  stats.appendChild(createStatCard('banknote', formatCurrency(todayRevenue), "Today's Revenue"));
  stats.appendChild(createStatCard('receipt', String(validSales.length), 'Sales Today'));

  // Pending sync badge
  const pendingCount = await getPendingCount();
  if (pendingCount > 0) {
    stats.appendChild(createStatCard('cloud', String(pendingCount), 'Pending Sync'));
  }

  dashboardEl.appendChild(stats);

  // ── Sync bar ─────────────────────────────────────────────
  const syncUrl = getSyncUrl();
  const lastSync = getLastSyncTime();
  const syncBar = el('div', 'sync-bar');
  if (syncUrl) {
    const lastSyncStr = lastSync
      ? new Date(lastSync).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
      : 'Never';
    syncBar.innerHTML = `
      <div class="sync-bar__info">
        ${getIcon('cloud', 18)}
        <div>
          <div class="sync-bar__title">Google Sheets Sync</div>
          <div class="sync-bar__meta">Last synced: ${lastSyncStr}${pendingCount > 0 ? ` · ${pendingCount} pending` : ' · All synced'}</div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm" id="sync-now-btn">
        ${getIcon('refresh', 18)}
        <span>Sync Now</span>
      </button>
    `;
    syncBar.querySelector('#sync-now-btn').addEventListener('click', async () => {
      const btn = syncBar.querySelector('#sync-now-btn');
      btn.disabled = true;
      btn.innerHTML = `${getIcon('refresh', 18)}<span>Syncing...</span>`;
      const result = await syncToGoogleSheets();
      btn.disabled = false;
      if (result.success) {
        showToast(`Synced ${result.synced} records`, 'success');
        renderContent('dashboard', state.currentRole);
      } else {
        showToast(result.error || 'Sync failed', 'error');
        btn.innerHTML = `${getIcon('refresh', 18)}<span>Sync Now</span>`;
      }
    });
  } else {
    syncBar.innerHTML = `
      <div class="sync-bar__info">
        ${getIcon('cloud', 18)}
        <div>
          <div class="sync-bar__title">Sync not configured</div>
          <div class="sync-bar__meta">Set up Google Sheets sync in Admin settings</div>
        </div>
      </div>
    `;
  }
  dashboardEl.appendChild(syncBar);

  // ── Payment breakdown ────────────────────────────────────
  const paymentBreakdown = { cash: 0, pos: 0, transfer: 0 };
  validSales.forEach((s) => {
    const m = (s.paymentMethod || 'cash').toLowerCase();
    if (paymentBreakdown[m] !== undefined) paymentBreakdown[m] += Number(s.total) || 0;
  });

  const paySection = el('div', '');
  paySection.innerHTML = `<div class="section-header"><span class="section-header__title">Payment Breakdown</span></div>`;
  const payCard = el('div', 'card pay-breakdown');

  const payTotal = paymentBreakdown.cash + paymentBreakdown.pos + paymentBreakdown.transfer || 1;
  const payMethods = [
    { id: 'cash', name: 'Cash', icon: 'banknote', color: '#34D399' },
    { id: 'pos', name: 'POS', icon: 'card', color: '#60A5FA' },
    { id: 'transfer', name: 'Transfer', icon: 'smartphone', color: '#F5C842' },
  ];

  payMethods.forEach((pm) => {
    const amount = paymentBreakdown[pm.id] || 0;
    const pct = Math.round((amount / payTotal) * 100);
    const row = el('div', 'pay-breakdown__row');
    row.innerHTML = `
      <div class="pay-breakdown__top">
        <span class="pay-breakdown__name">${getIcon(pm.icon, 16)}<span>${pm.name}</span></span>
        <span class="pay-breakdown__amount">${formatCurrency(amount)} <span class="pay-breakdown__pct">${pct}%</span></span>
      </div>
      <div class="pay-breakdown__bar">
        <div class="pay-breakdown__fill" style="width:${pct}%; background:${pm.color}"></div>
      </div>
    `;
    payCard.appendChild(row);
  });

  paySection.appendChild(payCard);
  dashboardEl.appendChild(paySection);

  // ── Revenue by department ────────────────────────────────
  const revenueByDept = {};
  activeDepts.forEach((d) => { revenueByDept[d.id] = 0; });
  validSales.forEach((s) => {
    if (revenueByDept[s.department] !== undefined) revenueByDept[s.department] += Number(s.total) || 0;
  });
  const maxRevenue = Math.max(...Object.values(revenueByDept), 1);

  const revSection = el('div', '', `
    <div class="section-header"><span class="section-header__title">Revenue by Department</span></div>
    <div class="revenue-card" id="revenue-card"></div>
  `);
  dashboardEl.appendChild(revSection);

  const revCard = $('#revenue-card', revSection);
  activeDepts.forEach((dept) => {
    const amount = revenueByDept[dept.id] || 0;
    const pct = Math.round((amount / maxRevenue) * 100);
    const row = el('div', 'revenue-row');
    row.innerHTML = `
      <div class="revenue-row__top">
        <span class="revenue-row__name">${dept.name}</span>
        <span class="revenue-row__amount">${formatCurrency(amount)}</span>
      </div>
      <div class="revenue-bar"><div class="revenue-bar__fill" style="width:${pct}%; background:${dept.color}"></div></div>
    `;
    revCard.appendChild(row);
  });

  // ── Staff activity (who sold what) ───────────────────────
  const staffMap = {};
  validSales.forEach((s) => {
    const attendant = s.attendant || 'Unknown';
    if (!staffMap[attendant]) staffMap[attendant] = { count: 0, total: 0, items: [] };
    staffMap[attendant].count++;
    staffMap[attendant].total += Number(s.total) || 0;
    const dept = getDepartmentById(s.department);
    const label = s.roomNumber ? `Room ${s.roomNumber}` : s.itemName || s.gameType || (dept ? dept.name : s.department);
    staffMap[attendant].items.push({ label, total: s.total, time: s.timestamp, dept: s.department });
  });

  const staffArr = Object.entries(staffMap).sort((a, b) => b[1].total - a[1].total);

  if (staffArr.length > 0) {
    const staffSection = el('div', '', `
      <div class="section-header"><span class="section-header__title">Staff Activity</span></div>
      <div class="staff-list" id="staff-list"></div>
    `);
    dashboardEl.appendChild(staffSection);

    const staffList = $('#staff-list', staffSection);
    staffArr.forEach(([name, data]) => {
      const card = el('div', 'staff-card');
      card.innerHTML = `
        <div class="staff-card__header">
          <div class="staff-card__name">${getIcon('user', 18)}<span>${name}</span></div>
          <div class="staff-card__totals">
            <span class="staff-card__count">${data.count} sales</span>
            <span class="staff-card__total">${formatCurrency(data.total)}</span>
          </div>
        </div>
        <div class="staff-card__items">
          ${data.items.slice(-5).reverse().map((item) => {
            const dept = getDepartmentById(item.dept);
            const time = new Date(item.time).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
            return `<div class="staff-card__item">
              <span class="staff-card__item-label">${getIcon(dept ? dept.icon : 'receipt', 14)}<span>${item.label}</span></span>
              <span class="staff-card__item-meta">${time}</span>
              <span class="staff-card__item-amount">${formatCurrency(item.total)}</span>
            </div>`;
          }).join('')}
        </div>
      `;
      staffList.appendChild(card);
    });
  }

  // ── Low stock alerts ─────────────────────────────────────
  const lowStockItems = [];
  for (const dept of activeDepts) {
    if (dept.id === 'reception' || dept.id === 'games') continue;
    const inventory = await getFullInventory(dept.id);
    const items = (getAllItemPrices()[dept.id] || []).filter((i) => i.active);
    items.forEach((item) => {
      const inv = inventory[item.id] || { remaining: 0 };
      if (inv.remaining <= 5) {
        lowStockItems.push({ dept: dept.name, deptColor: dept.color, name: item.name, remaining: inv.remaining });
      }
    });
  }

  if (lowStockItems.length > 0) {
    const alertSection = el('div', '', `
      <div class="section-header"><span class="section-header__title">Low Stock Alerts</span></div>
      <div class="alert-list" id="alert-list"></div>
    `);
    dashboardEl.appendChild(alertSection);

    const alertList = $('#alert-list', alertSection);
    lowStockItems.forEach((item) => {
      const alert = el('div', `alert-card ${item.remaining <= 0 ? 'alert-card--out' : 'alert-card--low'}`);
      alert.innerHTML = `
        <div class="alert-card__icon">${getIcon('alertTriangle', 20)}</div>
        <div class="alert-card__info">
          <span class="alert-card__name">${item.name}</span>
          <span class="alert-card__dept" style="color:${item.deptColor};">${item.dept}</span>
        </div>
        <span class="alert-card__qty">${item.remaining <= 0 ? 'Out of stock' : `${item.remaining} left`}</span>
      `;
      alertList.appendChild(alert);
    });
  }

  // ── Best sellers ─────────────────────────────────────────
  const sellerMap = {};
  validSales.forEach((s) => {
    if (!s.itemId) return;
    if (!sellerMap[s.itemId]) sellerMap[s.itemId] = { name: s.itemName, qty: 0, revenue: 0 };
    sellerMap[s.itemId].qty += Number(s.qty) || 1;
    sellerMap[s.itemId].revenue += Number(s.total) || 0;
  });

  const bestSellers = Object.entries(sellerMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

  if (bestSellers.length > 0) {
    const bsSection = el('div', '', `
      <div class="section-header"><span class="section-header__title">Best Sellers Today</span></div>
      <div class="bestseller-list" id="bestseller-list"></div>
    `);
    dashboardEl.appendChild(bsSection);

    const bsList = $('#bestseller-list', bsSection);
    bestSellers.forEach(([id, data], idx) => {
      const item = el('div', 'bestseller-item');
      const medal = idx === 0 ? 'trophy' : idx === 1 ? 'trophy' : idx === 2 ? 'trophy' : 'receipt';
      item.innerHTML = `
        <div class="bestseller-item__rank">${getIcon(medal, 18)}</div>
        <div class="bestseller-item__info">
          <span class="bestseller-item__name">${data.name}</span>
          <span class="bestseller-item__qty">${data.qty} sold</span>
        </div>
        <span class="bestseller-item__revenue">${formatCurrency(data.revenue)}</span>
      `;
      bsList.appendChild(item);
    });
  }

  // ── Opening / Closing stock ──────────────────────────────
  const stockDepts = activeDepts.filter((d) => d.id === 'bar' || d.id === 'kitchen');
  if (stockDepts.length > 0) {
    const stockSection = el('div', '', `
      <div class="section-header"><span class="section-header__title">Stock Summary (Today)</span></div>
      <div class="stock-summary" id="stock-summary"></div>
    `);
    dashboardEl.appendChild(stockSection);

    const stockSummary = $('#stock-summary', stockSection);
    for (const dept of stockDepts) {
      const inventory = await getFullInventory(dept.id);
      const items = (getAllItemPrices()[dept.id] || []).filter((i) => i.active);
      const deptCard = el('div', 'card stock-summary-card');
      deptCard.innerHTML = `
        <div class="stock-summary-card__header" style="color:${dept.color};">
          ${getIcon(dept.icon, 18)}<span>${dept.name}</span>
        </div>
        <div class="stock-summary-grid">
          ${items.map((item) => {
            const inv = inventory[item.id] || { totalIn: 0, totalOut: 0, remaining: 0 };
            return `<div class="stock-summary-row">
              <span class="stock-summary-row__name">${item.name}</span>
              <span class="stock-summary-row__in">Open: ${inv.totalIn - inv.totalOut + inv.totalOut}</span>
              <span class="stock-summary-row__out">Sold: ${inv.totalOut}</span>
              <span class="stock-summary-row__close">Close: ${inv.remaining}</span>
            </div>`;
          }).join('')}
        </div>
      `;
      stockSummary.appendChild(deptCard);
    }
  }

  // ── Recent sales ─────────────────────────────────────────
  const recentSales = [...validSales].reverse().slice(0, 10);
  const recentSection = el('div', '');

  if (recentSales.length === 0) {
    recentSection.innerHTML = `
      <div class="section-header"><span class="section-header__title">Recent Sales</span></div>
      <div class="empty-screen" style="min-height:200px; padding:var(--lg);">
        <div class="empty-screen__icon" style="width:56px; height:56px;">${getIcon('receipt', 28)}</div>
        <div class="empty-screen__title" style="font-size:16px;">No sales yet today</div>
        <div class="empty-screen__message" style="font-size:13px;">Sales will appear here as they happen.</div>
      </div>
    `;
  } else {
    recentSection.innerHTML = `
      <div class="section-header"><span class="section-header__title">Recent Sales</span></div>
      <div class="recent-sales" id="recent-sales"></div>
    `;
    dashboardEl.appendChild(recentSection);

    const salesList = $('#recent-sales', recentSection);
    recentSales.forEach((sale) => {
      const dept = getDepartmentById(sale.department);
      const time = new Date(sale.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
      const item = el('div', 'sale-item');
      const label = sale.roomNumber ? `Room ${sale.roomNumber}` : sale.itemName || sale.gameType || (dept ? dept.name : sale.department);
      item.innerHTML = `
        <div class="sale-item__icon">${getIcon(dept ? dept.icon : 'receipt', 20)}</div>
        <div class="sale-item__info">
          <span class="sale-item__id">${sale.receiptNo || sale.id}</span>
          <span class="sale-item__meta">${label} · ${sale.attendant || ''} · ${time}</span>
        </div>
        <span class="sale-item__amount">${formatCurrency(sale.total)}</span>
      `;
      salesList.appendChild(item);
    });
  }

  dashboardEl.appendChild(recentSection);
  container.appendChild(dashboardEl);
}

function createStatCard(icon, value, label) {
  const card = el('div', 'stat-card');
  card.innerHTML = `
    <div class="stat-card__icon">${getIcon(icon, 20)}</div>
    <div class="stat-card__value">${value}</div>
    <div class="stat-card__label">${label}</div>
  `;
  return card;
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS / ADMIN — with Sync + Export
// ═══════════════════════════════════════════════════════════════

function renderSettings(role) {
  const container = el('div', 'dashboard');
  container.innerHTML = `<div class="section-header"><span class="section-header__title">Administration</span></div>`;

  // Quick actions grid
  const settingsGrid = el('div', 'stat-grid stagger');
  const adminActions = [
    { icon: 'tag', label: 'Price Manager', desc: 'Edit room & item prices', tab: 'pricemanager', active: true },
    { icon: 'cloud', label: 'Sync Setup', desc: 'Google Sheets integration', tab: null, active: true, action: 'sync' },
    { icon: 'upload', label: 'Export Data', desc: 'Download sales as CSV', tab: null, active: true, action: 'export' },
    { icon: 'github', label: 'Push to GitHub', desc: 'Deploy to Netlify', tab: null, active: true, action: 'deploy' },
    { icon: 'chart', label: 'Reports', desc: 'View & export reports', tab: 'reports', active: true },
    { icon: 'users', label: 'Staff', desc: 'Manage staff & roles', tab: 'staff', active: true },
  ];

  adminActions.forEach((action) => {
    const tile = el('div', 'stat-card');
    if (action.active) { tile.style.cursor = 'pointer'; tile.style.borderColor = 'var(--gold-600)'; }
    tile.innerHTML = `
      <div class="stat-card__icon">${getIcon(action.icon, 20)}</div>
      <div style="font-size:15px; font-weight:600; color:var(--ink-100);">${action.label}</div>
      <div class="stat-card__label">${action.desc}</div>
      <div style="margin-top:auto; padding-top:var(--sm);">
        <span class="action-status">${action.active ? 'Open' : 'Unavailable'}</span>
      </div>
    `;
    if (action.active) {
      tile.addEventListener('click', () => {
        if (action.tab) switchTab(action.tab);
        else if (action.action === 'sync') openSyncSheet();
        else if (action.action === 'export') exportData();
        else if (action.action === 'deploy') openDeploySheet();
      });
    }
    settingsGrid.appendChild(tile);
  });
  container.appendChild(settingsGrid);

  // Sync status card
  const syncUrl = getSyncUrl();
  const lastSync = getLastSyncTime();
  const syncCard = el('div', 'card', `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sm);">
      <span style="font-size:13px; color:var(--ink-200);">Google Sheets Sync</span>
      <span style="font-size:13px; font-weight:600; color:${syncUrl ? 'var(--success-400)' : 'var(--ink-200)'};">${syncUrl ? 'Configured' : 'Not set'}</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:13px; color:var(--ink-200);">Last Sync</span>
      <span style="font-size:13px; font-weight:600; color:var(--ink-100);">${lastSync ? new Date(lastSync).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}</span>
    </div>
  `);
  container.appendChild(syncCard);

  // App info
  container.appendChild(el('div', 'card', `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sm);">
      <span style="font-size:13px; color:var(--ink-200);">Version</span>
      <span style="font-size:13px; font-weight:600; color:var(--ink-100);">${APP_CONFIG.version}</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:13px; color:var(--ink-200);">Active Departments</span>
      <span style="font-size:13px; font-weight:600; color:var(--ink-100);">${getActiveDepartments().length}</span>
    </div>
  `));

  const logoutBtn = el('button', 'logout-btn', `${getIcon('logout', 20)}<span>Sign Out</span>`);
  logoutBtn.addEventListener('click', logout);
  container.appendChild(logoutBtn);

  return container;
}

// ── Sync Setup Sheet ─────────────────────────────────────────
function openSyncSheet() {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';
  const sheet = el('div', 'bottom-sheet');
  const currentUrl = getSyncUrl();

  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>Google Sheets Sync</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="sync-guide">
        <p style="font-size:13px; color:var(--ink-200); margin-bottom:var(--md);">
          1. Go to <strong>script.google.com</strong> and create a new project<br>
          2. Paste the Code.gs file contents<br>
          3. Run <strong>setup()</strong> once to create the Google Sheet<br>
          4. Deploy as Web App (Execute as: Me, Access: Anyone)<br>
          5. Copy the deployment URL below
        </p>
      </div>

      <div class="form-row">
        <label class="form-label">Apps Script Web App URL</label>
        <input type="url" class="form-input" id="sync-url-input" placeholder="https://script.google.com/macros/s/..." value="${currentUrl}" />
      </div>

      <button class="btn btn--primary btn--full" id="sync-save-btn">
        ${getIcon('save', 20)}
        <span>Save URL</span>
      </button>

      <button class="btn btn--ghost btn--full" id="sync-push-prices" style="margin-top:var(--sm);">
        ${getIcon('tag', 20)}
        <span>Push Current Prices to Sheet</span>
      </button>

      <button class="btn btn--ghost btn--full" id="sync-now-sheet" style="margin-top:var(--sm);">
        ${getIcon('refresh', 20)}
        <span>Sync All Pending Data</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

  $('#sync-save-btn', sheet).addEventListener('click', () => {
    const url = $('#sync-url-input', sheet).value.trim();
    if (!url) { showToast('Enter a URL', 'error'); return; }
    setSyncUrl(url);
    showToast('Sync URL saved', 'success');
    closeSheet();
    renderContent('settings', state.currentRole);
  });

  $('#sync-push-prices', sheet).addEventListener('click', async () => {
    const result = await pushPricesToSheets();
    if (result.success) showToast('Prices pushed to Google Sheets', 'success');
    else showToast(result.error || 'Failed to push prices', 'error');
  });

  $('#sync-now-sheet', sheet).addEventListener('click', async () => {
    const result = await syncToGoogleSheets();
    if (result.success) showToast(`Synced ${result.synced} records`, 'success');
    else showToast(result.error || 'Sync failed', 'error');
  });
}

// ── Export Data (CSV) ────────────────────────────────────────
async function exportData() {
  const allSales = await getAllSales();
  const validSales = allSales.filter((s) => !s.voided);

  if (validSales.length === 0) {
    showToast('No sales to export', 'error');
    return;
  }

  const headers = ['Date', 'Receipt No', 'Department', 'Item/Room', 'Qty', 'Total', 'Payment', 'Attendant', 'Timestamp'];
  const rows = validSales.map((s) => {
    const label = s.roomNumber ? `Room ${s.roomNumber}` : s.itemName || s.gameType || s.department;
    return [
      s.dateStr || '',
      s.receiptNo || s.id || '',
      s.department || '',
      label,
      s.qty || 1,
      s.total || 0,
      s.paymentMethod || '',
      s.attendant || '',
      s.timestamp || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xclusive-sales-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Sales exported as CSV', 'success');
}

// ── Deploy Sheet ─────────────────────────────────────────────
function openDeploySheet() {
  const existing = $('#modal-overlay');
  if (existing) existing.remove();

  const overlay = el('div', 'modal-overlay');
  overlay.id = 'modal-overlay';
  const sheet = el('div', 'bottom-sheet deploy-sheet');
  sheet.innerHTML = `
    <div class="bottom-sheet__handle"></div>
    <div class="bottom-sheet__header">
      <h2>Deployment Guide</h2>
      <button class="icon-btn" id="close-sheet">${getIcon('x', 20)}</button>
    </div>
    <div class="bottom-sheet__body">
      <div class="deploy-step">
        <div class="deploy-step__num">1</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Push to GitHub</div>
          <div class="deploy-step__desc">
            Go to <strong>github.com/new</strong> and create a new repository (public). Upload all project files:
            <span class="deploy-file">app.js, config.js, db.js, icons.js, index.html, package.json, pos.js, prices.js, pricemanager.js, reception.js, rooms.js, games.js, sync.js, style.css, vite.config.js</span>
            and the <strong>public/</strong> folder. The Code.gs file goes in your Google Apps Script project, not GitHub.
          </div>
        </div>
      </div>

      <div class="deploy-step">
        <div class="deploy-step__num">2</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Connect to Netlify</div>
          <div class="deploy-step__desc">
            Go to <strong>app.netlify.com</strong> → "Add new site" → "Import from Git". Select your GitHub repo.
            Build command: <code>vite build</code>. Publish directory: <code>dist</code>. Click Deploy.
          </div>
        </div>
      </div>

      <div class="deploy-step">
        <div class="deploy-step__num">3</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Get Your App Link</div>
          <div class="deploy-step__desc">
            Netlify gives you a free URL like <code>xclusive-hotel.netlify.app</code>. You can rename it in
            Site Settings → Domain Management. This is your permanent app link — bookmark it on tablets.
          </div>
        </div>
      </div>

      <div class="deploy-step">
        <div class="deploy-step__num">4</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Generate QR Code</div>
          <div class="deploy-step__desc">
            Go to <strong>netlify.com</strong> site overview → the QR code icon next to your URL. Scan it with any
            tablet camera to install as a PWA (Add to Home Screen). Or use <strong>qrcode-monkey.com</strong> with
            your Netlify URL. The app works offline once installed.
          </div>
        </div>
      </div>

      <div class="deploy-step">
        <div class="deploy-step__num">5</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Set Up Google Sheets Sync</div>
          <div class="deploy-step__desc">
            Create a Google Apps Script project (script.google.com), paste the Code.gs file, run setup(), deploy as
            Web App. Paste the URL in Sync Setup (Admin tab → Sync Setup) on each tablet.
          </div>
        </div>
      </div>

      <div class="deploy-step">
        <div class="deploy-step__num">6</div>
        <div class="deploy-step__content">
          <div class="deploy-step__title">Midnight Auto-Reset</div>
          <div class="deploy-step__desc">
            In the Apps Script editor, run <code>createTimeTrigger()</code> once. This sets a daily 11:59 PM trigger
            that copies today's totals to DAILY_HISTORY and resets counters. Short-rest rooms auto-convert to lodge
            after midnight.
          </div>
        </div>
      </div>

      <button class="btn btn--ghost btn--full" id="copy-deploy" style="margin-top:var(--md);">
        ${getIcon('share', 20)}
        <span>Copy Guide as Text</span>
      </button>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  $('#close-sheet', sheet).addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

  $('#copy-deploy', sheet).addEventListener('click', () => {
    const text = `XCLUSIVE HOTEL — Deployment Guide

1. GITHUB: Create repo at github.com/new (public). Upload all .js files, index.html, package.json, style.css, vite.config.js, and the public/ folder. Code.gs goes in Google Apps Script, not GitHub.

2. NETLIFY: Go to app.netlify.com → Add new site → Import from Git. Select your repo. Build: vite build. Publish dir: dist. Deploy.

3. APP LINK: Netlify gives a free URL like xclusive-hotel.netlify.app. Rename in Site Settings → Domain Management.

4. QR CODE: Netlify shows a QR code next to your URL. Scan with tablet camera → Add to Home Screen. Also try qrcode-monkey.com.

5. GOOGLE SHEETS SYNC: Go to script.google.com → New Project → paste Code.gs → Run setup() → Deploy as Web App (Execute as Me, Access Anyone) → copy URL → paste in app Admin → Sync Setup.

6. MIDNIGHT RESET: In Apps Script, run createTimeTrigger() once. Daily 11:59 PM trigger archives totals to DAILY_HISTORY.`;

    navigator.clipboard.writeText(text).then(() => {
      showToast('Guide copied to clipboard', 'success');
    }).catch(() => {
      showToast('Could not copy — select text manually', 'error');
    });
  });
}

// ── Generic Empty ────────────────────────────────────────────
function renderGenericEmpty() {
  const screen = el('div', 'empty-screen');
  screen.innerHTML = `
    <div class="empty-screen__icon">${getIcon('grid', 40)}</div>
    <h2 class="empty-screen__title">Nothing here yet</h2>
    <p class="empty-screen__message">This screen is not yet configured.</p>
  `;
  return screen;
}

// ── Logout ───────────────────────────────────────────────────
function logout() {
  state.currentRole = null;
  state.currentTab = null;
  state.currentStaffName = null;
  localStorage.removeItem(STORAGE_KEYS.role);
  localStorage.removeItem(STORAGE_KEYS.staffName);
  localStorage.removeItem(STORAGE_KEYS.user);
  showToast('Signed out', '');
  renderLogin();
}

// ── Close sheet helper ───────────────────────────────────────
function closeSheet() {
  const overlay = $('#modal-overlay');
  if (overlay) {
    const sheet = overlay.querySelector('.bottom-sheet');
    if (sheet) { sheet.style.transform = 'translateY(100%)'; sheet.style.transition = 'transform 0.2s ease'; }
    setTimeout(() => overlay.remove(), 200);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ONLINE / OFFLINE + AUTO-SYNC
// ═══════════════════════════════════════════════════════════════

async function updateOnlineStatus() {
  state.online = navigator.onLine;
  const indicator = $('#offline-indicator');
  if (indicator) {
    indicator.classList.toggle('online', state.online);
    indicator.innerHTML = `${getIcon(state.online ? 'wifi' : 'wifiOff', 14)}<span>${state.online ? 'Online' : 'Offline'}</span>`;
  }

  // Auto-sync when coming back online
  if (state.online && getSyncUrl()) {
    const pending = await getPendingCount();
    if (pending > 0) {
      showToast(`Online — syncing ${pending} records...`, '');
      const result = await syncToGoogleSheets();
      if (result.success) {
        showToast(`Synced ${result.synced} records to Google Sheets`, 'success');
        if (state.currentTab === 'dashboard') renderContent('dashboard', state.currentRole);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

async function init() {
  await seedStaff();
  const raw=localStorage.getItem(STORAGE_KEYS.user);
  const savedRole=localStorage.getItem(STORAGE_KEYS.role);
  if(raw){
    try { state.currentUser=JSON.parse(raw); state.currentRole=getRoleById(state.currentUser.role); state.currentStaffName=state.currentUser.name; } catch {}
  } else if(savedRole){
    // Legacy sessions are not trusted as authenticated staff; require login.
    localStorage.removeItem(STORAGE_KEYS.role); localStorage.removeItem(STORAGE_KEYS.staffName);
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('popstate',()=>{ if(state.currentRole) renderApp(); });
  if(state.currentUser && state.currentRole) renderApp(); else renderLogin();
}
init();
