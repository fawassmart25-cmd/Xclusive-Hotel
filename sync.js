// ═══════════════════════════════════════════════════════════
//  Sync Module — Push pending IndexedDB records to Google Sheets
//  When online, collects all 'pending' sync records and sends
//  them to the Apps Script web app URL.
// ═══════════════════════════════════════════════════════════

import {
  getAllSales,
  getAllStockIn,
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

    const result = await response.json();

    if (result.error) {
      return { success: false, error: result.error };
    }

    // Mark all as synced (update in IndexedDB)
    // We can't easily update syncStatus in IndexedDB without re-saving each record
    // For now, we track last sync time and skip records older than that
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
