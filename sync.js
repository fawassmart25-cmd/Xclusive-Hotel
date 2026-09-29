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

// The live date-tab Apps Script accepts one sale object at the top level.
// Keep the mapping here so the app can work with that deployed API while
// preserving the local pending-first lifecycle.
function toDateTabSalePayload(sale) {
   return {
        date: sale.dateStr || sale.date || '',
        timeStarted: sale.timeStarted || sale.checkIn || sale.startTime || sale.timestamp || '',
        timeSaved: sale.timeSaved || sale.timestamp || new Date().toISOString(),
        soldBy: sale.soldBy || sale.staffName || sale.attendant || '',
        department: sale.department || '',
        itemName: sale.itemName || sale.gameType || (sale.roomNumber ? 'Room ' + sale.roomNumber : ''),
        quantity: sale.quantity || sale.qty || 1,
        amount: sale.amount != null ? sale.amount : (sale.total || 0),
        customerName: sale.customerName || sale.guestName || '',
        paymentMethod: sale.paymentMethod || 'Cash',
        device: sale.device || 'PWA',
   };
}

async function postSaleToDateTabEndpoint(url, sale) {
   const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(toDateTabSalePayload(sale)),
   });
   if (!response.ok) {
        return { success: false, error: 'Sync request failed (' + response.status + ')' };
   }
   const result = await response.json();
   if (failedResponse(result)) {
        return { success: false, error: result.error || result.message || 'Sync failed' };
   }
   return { success: true, result };
}

// Save locally first, then post immediately. A sale becomes synced only after
// the Apps Script endpoint confirms success; offline/error cases stay pending.
export async function syncSaleImmediately(sale) {
   const url = getSyncUrl();
   if (!url) return { success: false, error: 'No sync URL configured' };
   if (!navigator.onLine) return { success: false, error: 'Offline — sale saved on this device' };

  try {
       const result = await postSaleToDateTabEndpoint(url, sale);
       if (!result.success) return result;
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

  // Retry each pending sale with the deployed date-tab endpoint. Mark each
  // record only after its own successful response, so failures remain pending.
  try {
       let syncedSales = 0;
       for (const sale of pendingSales) {
              const result = await postSaleToDateTabEndpoint(url, sale);
              if (!result.success) {
                       return { success: false, synced: syncedSales, error: result.error };
              }
              await markSalesSynced([sale]);
              syncedSales += 1;
       }

     // Stock requires a different legacy payload and is left pending rather
     // than being falsely marked synced by the date-tab API.
     if (pendingStock.length > 0) {
            return {
                     success: false,
                     synced: syncedSales,
                     error: 'Pending stock records require the stock sync endpoint',
            };
     }

     const syncTime = new Date().toISOString();
       localStorage.setItem(LAST_SYNC_KEY, syncTime);
       return { success: true, synced: syncedSales, syncTime };
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


// Persist admin room names and Short Rest flags in the Google Sheet.
export async function syncRoomSettingsImmediately(rooms) {
   const url = getSyncUrl();
   if (!url) return { success: false, error: 'No sync URL configured' };
   if (!navigator.onLine) return { success: false, error: 'Offline — room settings saved on this device' };
   try {
        const response = await fetch(url, {
               method: 'POST',
               headers: { 'Content-Type': 'text/plain;charset=utf-8' },
               body: JSON.stringify({ type: 'room_settings', rooms }),
        });
        if (!response.ok) return { success: false, error: 'Room settings sync failed (' + response.status + ')' };
        const result = await response.json();
        if (result.error || result.success === false) return { success: false, error: result.error || 'Room settings sync failed' };
        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        return { success: true };
   } catch (err) {
        return { success: false, error: err.message || 'Network error during room settings sync' };
   }
}
