// ═══════════════════════════════════════════════════════════
//  Sync Module — Push pending IndexedDB records to Google Sheets
//  When online, collects all 'pending' sync records and sends
//  them to the Apps Script web app URL.
// ═══════════════════════════════════════════════════════════

import {
  getAllSales,
  getAllStockIn,
  saveSale,
  saveStockIn,
} from './db.js';
import { getAllItemPrices } from './prices.js';

const SYNC_URL_KEY = 'xclusive_sync_url';
const LAST_SYNC_KEY = 'xclusive_last_sync';

// ── Config ───────────────────────────────────────────────────
export function getSyncUrl() {
  return localStorage.getItem(SYNC_URL_KEY) || '';
}

export function setSyncUrl(url) {
  localStorage.setItem(SYNC_URL_KEY, url);
}

export function getLastSyncTime() {
  return localStorage.getItem(LAST_SYNC_KEY) || null;
}

// ── Count pending records ────────────────────────────────────
export async function getPendingCount() {
  const sales = await getAllSales();
  const stock = await getAllStockIn();
  const pendingSales = sales.filter((s) => s.syncStatus === 'pending');
  const pendingStock = stock.filter((s) => s.syncStatus === 'pending');
  return pendingSales.length + pendingStock.length;
}

async function markSalesSynced(records) {
  await Promise.all(records.map((record) => saveSale({ ...record, syncStatus: 'synced' })));
}

async function markStockSynced(records) {
  await Promise.all(records.map((record) => saveStockIn({ ...record, syncStatus: 'synced' })));
}

function failedResponse(result) {
  return result?.error || result?.status === 'error' || result?.success === false;
}

// Save locally first, then post immediately. A sale becomes synced only after
// the Apps Script endpoint confirms success; offline/error cases stay pending.
export async function syncSaleImmediately(sale) {
  const url = getSyncUrl();
  if (!url) return { success: false, error: 'No sync URL configured' };
  if (!navigator.onLine) return { success: false, error: 'Offline — sale saved on this device' };

  const data = { reception: [], bar: [], kitchen: [], games: [], stock: [] };
  if (!data[sale.department]) {
    return { success: false, error: 'Unsupported sale department: ' + sale.department };
  }
  data[sale.department].push({ ...sale, syncStatus: 'pending' });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'bulk', data }),
    });
    if (!response.ok) {
      return { success: false, error: 'Sync request failed (' + response.status + ')' };
    }
    const result = await response.json();
    if (failedResponse(result)) {
      return { success: false, error: result.error || result.message || 'Sync failed' };
    }
    await markSalesSynced([sale]);
    const syncTime = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, syncTime);
    return { success: true, synced: 1, syncTime };
  } catch (err) {
    return { success: false, error: err.message || 'Network error during sync' };
  }
}

// ── Main sync function ───────────────────────────────────────
export async function syncToGoogleSheets() {
  const url = getSyncUrl();
  if (!url) {
    return { success: false, error: 'No sync URL configured' };
  }

  if (!navigator.onLine) {
    return { success: false, error: 'Offline — cannot sync' };
  }

  const sales = await getAllSales();
  const stock = await getAllStockIn();

  // Group pending sales by department
  const pendingSales = sales.filter((s) => s.syncStatus === 'pending');
  const pendingStock = stock.filter((s) => s.syncStatus === 'pending');

  if (pendingSales.length === 0 && pendingStock.length === 0) {
    return { success: true, synced: 0, message: 'Everything already synced' };
  }

  // Group sales by department type
  const grouped = {
    reception: [],
    bar: [],
    kitchen: [],
    games: [],
    stock: pendingStock,
    prices: null,
  };

  pendingSales.forEach((s) => {
    if (s.department === 'reception') grouped.reception.push(s);
    else if (s.department === 'bar') grouped.bar.push(s);
    else if (s.department === 'kitchen') grouped.kitchen.push(s);
    else if (s.department === 'games') grouped.games.push(s);
  });

  // Send as bulk
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        type: 'bulk',
        data: {
          reception: grouped.reception,
          bar: grouped.bar,
          kitchen: grouped.kitchen,
          games: grouped.games,
          stock: grouped.stock,
        },
      }),
    });

    if (!response.ok) {
      return { success: false, error: 'Sync request failed (' + response.status + ')' };
    }
    const result = await response.json();

    if (failedResponse(result)) {
      return { success: false, error: result.error || result.message || 'Sync failed' };
    }

    await Promise.all([markSalesSynced(pendingSales), markStockSynced(pendingStock)]);
    const syncTime = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, syncTime);

    const totalSynced = pendingSales.length + pendingStock.length;
    return { success: true, synced: totalSynced, syncTime };
  } catch (err) {
    return { success: false, error: err.message || 'Network error during sync' };
  }
}

// ── Push prices to Google Sheets ─────────────────────────────
export async function pushPricesToSheets() {
  const url = getSyncUrl();
  if (!url) {
    return { success: false, error: 'No sync URL configured' };
  }

  const prices = getAllItemPrices();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        type: 'prices',
        records: prices,
      }),
    });

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, synced: 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
