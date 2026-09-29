// ═══════════════════════════════════════════════════════════
//  IndexedDB wrapper — offline-first persistence
//  Stores: sales, customers, roomOccupancy
// ═══════════════════════════════════════════════════════════

const DB_NAME = 'xclusive_hotel';
const DB_VERSION = 5;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('sales')) {
        const store = db.createObjectStore('sales', { keyPath: 'id' });
        store.createIndex('by_department', 'department', { unique: false });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
        store.createIndex('by_date', 'dateStr', { unique: false });
        store.createIndex('by_room', 'roomId', { unique: false });
      }

      if (!db.objectStoreNames.contains('customers')) {
        const store = db.createObjectStore('customers', { keyPath: 'id' });
        store.createIndex('by_phone', 'phone', { unique: false });
      }

      if (!db.objectStoreNames.contains('roomOccupancy')) {
        const store = db.createObjectStore('roomOccupancy', { keyPath: 'roomId' });
        store.createIndex('by_status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('stockIn')) {
        const store = db.createObjectStore('stockIn', { keyPath: 'id' });
        store.createIndex('by_department', 'department', { unique: false });
        store.createIndex('by_item', 'itemId', { unique: false });
        store.createIndex('by_date', 'dateStr', { unique: false });
      }

      if (!db.objectStoreNames.contains('gameSessions')) {
        const store = db.createObjectStore('gameSessions', { keyPath: 'id' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_date', 'dateStr', { unique: false });
      }

      if (!db.objectStoreNames.contains('staff')) {
        const store = db.createObjectStore('staff', { keyPath: 'id' });
        store.createIndex('by_username', 'username', { unique: true });
        store.createIndex('by_role', 'role', { unique: false });
        store.createIndex('by_active', 'isActive', { unique: false });
      }

      // Canonical stock/product table. Quantity is the current on-hand balance.
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id' });
        store.createIndex('by_department', 'department', { unique: false });
        store.createIndex('by_name', 'name', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Sales ────────────────────────────────────────────────────
export async function saveSale(sale) {
  const store = await tx('sales', 'readwrite');
  return reqToPromise(store.put(sale));
}

export async function getSale(id) {
  const store = await tx('sales');
  return reqToPromise(store.get(id));
}

export async function getAllSales() {
  const store = await tx('sales');
  return reqToPromise(store.getAll());
}

export async function getSalesByDate(dateStr) {
  const store = await tx('sales');
  const idx = store.index('by_date');
  return reqToPromise(idx.getAll(dateStr));
}

export async function getSalesByDepartment(deptId) {
  const store = await tx('sales');
  const idx = store.index('by_department');
  return reqToPromise(idx.getAll(deptId));
}

// ── Customers ────────────────────────────────────────────────
export async function saveCustomer(customer) {
  const store = await tx('customers', 'readwrite');
  return reqToPromise(store.put(customer));
}

export async function getCustomerByPhone(phone) {
  const store = await tx('customers');
  const idx = store.index('by_phone');
  return reqToPromise(idx.get(phone));
}

export async function getAllCustomers() {
  const store = await tx('customers');
  return reqToPromise(store.getAll());
}

// ── Room Occupancy ───────────────────────────────────────────
export async function setRoomOccupancy(occupancy) {
  const store = await tx('roomOccupancy', 'readwrite');
  return reqToPromise(store.put(occupancy));
}

export async function getRoomOccupancy(roomId) {
  const store = await tx('roomOccupancy');
  return reqToPromise(store.get(roomId));
}

export async function getAllOccupancy() {
  const store = await tx('roomOccupancy');
  return reqToPromise(store.getAll());
}

export async function clearRoomOccupancy(roomId) {
  const store = await tx('roomOccupancy', 'readwrite');
  return reqToPromise(store.delete(roomId));
}

// Atomically register a room sale and occupy the room. This prevents a sale
// being reported without the room state changing, and blocks double booking.
export async function saveRoomSaleAndOccupancy(sale, occupancy) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales', 'roomOccupancy'], 'readwrite');
    const salesStore = transaction.objectStore('sales');
    const occupancyStore = transaction.objectStore('roomOccupancy');
    const check = occupancyStore.get(occupancy.roomId);
    check.onerror = () => reject(check.error);
    check.onsuccess = () => {
      if (check.result && check.result.status === 'occupied') {
        transaction.abort();
        reject(new Error('Room is already occupied. Refresh and try another room.'));
        return;
      }
      salesStore.put(sale);
      occupancyStore.put(occupancy);
    };
    transaction.oncomplete = () => resolve(sale);
    transaction.onerror = () => reject(transaction.error || new Error('Could not save room check-in.'));
    transaction.onabort = () => reject(transaction.error || new Error('Room check-in was not saved.'));
  });
}

// At the first app open after midnight, release yesterday's occupancy only.
// Sales remain untouched so reports and history are preserved.
export async function resetStaleOccupancy(currentDate = todayStr()) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('roomOccupancy', 'readwrite');
    const store = transaction.objectStore('roomOccupancy');
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      for (const value of request.result || []) {
        const day = value.dayStr || (value.checkIn ? value.checkIn.slice(0, 10) : currentDate);
        if (value.status === 'occupied' && day !== currentDate) store.delete(value.roomId);
      }
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

// ── Utility: generate IDs ────────────────────────────────────
export function generateSaleId(dept) {
  const prefix = dept.toUpperCase().slice(0, 3);
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

export function todayStr() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// ── Stock In (Bar/Kitchen inventory additions) ──────────────
export async function saveStockIn(record) {
  const store = await tx('stockIn', 'readwrite');
  return reqToPromise(store.put(record));
}

export async function getStockInByDepartment(deptId) {
  const store = await tx('stockIn');
  const idx = store.index('by_department');
  return reqToPromise(idx.getAll(deptId));
}

export async function getAllStockIn() {
  const store = await tx('stockIn');
  return reqToPromise(store.getAll());
}

// Compute remaining = total stockIn - total sales qty for each item
export async function getInventoryByItem(deptId, itemId) {
  const stockRecords = await getStockInByDepartment(deptId);
  const salesRecords = await getSalesByDepartment(deptId);

  const totalIn = stockRecords
    .filter((r) => r.itemId === itemId)
    .reduce((sum, r) => sum + (Number(r.qty) || 0), 0);

  const totalOut = salesRecords
    .filter((s) => !s.voided && s.itemId === itemId)
    .reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

  return { totalIn, totalOut, remaining: totalIn - totalOut };
}

export async function getFullInventory(deptId) {
  const stockRecords = await getStockInByDepartment(deptId);
  const salesRecords = await getSalesByDepartment(deptId);

  const inMap = {};
  stockRecords.forEach((r) => {
    if (!inMap[r.itemId]) inMap[r.itemId] = 0;
    inMap[r.itemId] += Number(r.qty) || 0;
  });

  const outMap = {};
  salesRecords.filter((s) => !s.voided).forEach((s) => {
    if (!outMap[s.itemId]) outMap[s.itemId] = 0;
    outMap[s.itemId] += Number(s.qty) || 0;
  });

  const allItemIds = new Set([...Object.keys(inMap), ...Object.keys(outMap)]);
  const result = {};
  allItemIds.forEach((id) => {
    result[id] = {
      totalIn: inMap[id] || 0,
      totalOut: outMap[id] || 0,
      remaining: (inMap[id] || 0) - (outMap[id] || 0),
    };
  });
  return result;
}

// ── Game Sessions ───────────────────────────────────────────
export async function saveGameSession(session) {
  const store = await tx('gameSessions', 'readwrite');
  return reqToPromise(store.put(session));
}

export async function getActiveGameSessions() {
  const store = await tx('gameSessions');
  const idx = store.index('by_status');
  return reqToPromise(idx.getAll('active'));
}

export async function getAllGameSessions() {
  const store = await tx('gameSessions');
  return reqToPromise(store.getAll());
}

export function generateId(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}


// ── Staff ────────────────────────────────────────────────────
export async function saveStaffMember(staff) { const store=await tx('staff','readwrite'); return reqToPromise(store.put(staff)); }
export async function getAllStaff() { const store=await tx('staff'); return reqToPromise(store.getAll()); }
export async function getStaffMember(id) { const store=await tx('staff'); return reqToPromise(store.get(id)); }
export async function getStaffByUsername(username) { const store=await tx('staff'); return reqToPromise(store.index('by_username').get(username)); }
export async function deleteStaffMember(id) { const store=await tx('staff','readwrite'); return reqToPromise(store.delete(id)); }

// ── Items / Stock Management ─────────────────────────────────
export async function getAllItems() {
  const store = await tx('items');
  return reqToPromise(store.getAll());
}

export async function getItemsByDepartment(deptId) {
  const store = await tx('items');
  return reqToPromise(store.index('by_department').getAll(deptId));
}

export async function getItem(id) {
  const store = await tx('items');
  return reqToPromise(store.get(id));
}

export async function saveItem(item) {
  const store = await tx('items', 'readwrite');
  return reqToPromise(store.put({
    id: item.id,
    name: String(item.name || '').trim(),
    department: item.department,
    quantity: Math.max(0, Number(item.quantity) || 0),
    price: Math.max(0, Number(item.price) || 0),
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
}

export async function deleteItem(id) {
  const store = await tx('items', 'readwrite');
  return reqToPromise(store.delete(id));
}

// Atomically save a POS item sale and reduce its current stock quantity.
export async function saveItemSale(sale) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sales', 'items'], 'readwrite');
    const salesStore = transaction.objectStore('sales');
    const itemsStore = transaction.objectStore('items');
    const itemReq = itemsStore.get(sale.itemId);

    itemReq.onerror = () => reject(itemReq.error);
    itemReq.onsuccess = () => {
      const item = itemReq.result;
      const qty = Number(sale.qty) || 0;
      if (!item) {
        reject(new Error('Item no longer exists.'));
        transaction.abort();
        return;
      }
      if (qty <= 0 || Number(item.quantity) < qty) {
        reject(new Error(`Not enough stock for ${item.name}. Available: ${item.quantity}`));
        transaction.abort();
        return;
      }
      item.quantity = Number(item.quantity) - qty;
      item.updatedAt = new Date().toISOString();
      salesStore.put(sale);
      itemsStore.put(item);
    };
    transaction.oncomplete = () => resolve(sale);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Sale was not saved.'));
  });
}
