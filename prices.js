// ═══════════════════════════════════════════════════════════
//  Price Manager — all room and item prices
//  Admin can edit these; changes persist to localStorage
//  and affect all departments instantly.
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'xclusive_prices';

// ── Default room prices (per category) ───────────────────────
const DEFAULT_ROOM_PRICES = [
  { id: 'basic', name: 'Basic', lodgeRate: 3000, shortRestRate: 1500 },
  { id: 'standard', name: 'Standard', lodgeRate: 5000, shortRestRate: 2500 },
  { id: 'classic', name: 'Classic', lodgeRate: 8000, shortRestRate: 4000 },
  { id: 'deluxe', name: 'Deluxe / Executive', lodgeRate: 15000, shortRestRate: 7500 },
];

// ── Default item prices by department ────────────────────────
const DEFAULT_ITEM_PRICES = {
  bar: [
    { id: 'heineken', name: 'Heineken', price: 500, active: true },
    { id: 'guinness', name: 'Guinness', price: 600, active: true },
    { id: 'star', name: 'Star Beer', price: 500, active: true },
    { id: 'gulder', name: 'Gulder', price: 500, active: true },
    { id: 'cocacola', name: 'Coca-Cola', price: 300, active: true },
    { id: 'fanta', name: 'Fanta', price: 300, active: true },
    { id: 'sprite', name: 'Sprite', price: 300, active: true },
    { id: 'pepsi', name: 'Pepsi', price: 300, active: true },
    { id: 'water', name: 'Bottled Water', price: 200, active: true },
    { id: 'hennessy', name: 'Hennessy', price: 3500, active: true },
    { id: 'jackdaniels', name: "Jack Daniel's", price: 3000, active: true },
    { id: 'smirnoff', name: 'Smirnoff Ice', price: 700, active: true },
  ],
  kitchen: [
    { id: 'jollof', name: 'Jollof Rice', price: 1500, active: true },
    { id: 'friedrice', name: 'Fried Rice', price: 1500, active: true },
    { id: 'egusi', name: 'Egusi Soup', price: 1200, active: true },
    { id: 'okra', name: 'Okra Soup', price: 1200, active: true },
    { id: 'peppersoup', name: 'Pepper Soup', price: 1500, active: true },
    { id: 'indomie', name: 'Indomie', price: 800, active: true },
    { id: 'shawarma', name: 'Shawarma', price: 1200, active: true },
    { id: 'plantain', name: 'Fried Plantain', price: 500, active: true },
  ],
  games: [
    { id: 'pool', name: 'Pool Table (per hour)', price: 1000, active: true },
    { id: 'ps5', name: 'PS5 (per hour)', price: 2000, active: true },
    { id: 'snooker', name: 'Snooker (per hour)', price: 1500, active: true },
    { id: 'ludo', name: 'Ludo', price: 200, active: true },
    { id: 'whot', name: 'Whot Cards', price: 200, active: true },
  ],
};

// ── Load from localStorage or return defaults ────────────────
function loadPrices() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    // fall through to defaults
  }
  return {
    roomPrices: JSON.parse(JSON.stringify(DEFAULT_ROOM_PRICES)),
    itemPrices: JSON.parse(JSON.stringify(DEFAULT_ITEM_PRICES)),
  };
}

let _prices = loadPrices();

// ── Getters ──────────────────────────────────────────────────
export function getRoomPrices() {
  return _prices.roomPrices;
}

export function getRoomPrice(categoryId, stayType = 'lodge') {
  const cat = _prices.roomPrices.find((r) => r.id === categoryId);
  if (!cat) return 0;
  return stayType === 'shortRest' ? cat.shortRestRate : cat.lodgeRate;
}

export function getItemPrices(departmentId) {
  return (_prices.itemPrices[departmentId] || []).filter((i) => i.active);
}

export function getAllItemPrices() {
  return _prices.itemPrices;
}

// ── Setters (admin) ──────────────────────────────────────────
export function updateRoomPrice(categoryId, field, value) {
  const cat = _prices.roomPrices.find((r) => r.id === categoryId);
  if (cat) {
    cat[field] = Number(value) || 0;
    persist();
  }
}

export function updateItemPrice(departmentId, itemId, price) {
  const items = _prices.itemPrices[departmentId];
  if (!items) return;
  const item = items.find((i) => i.id === itemId);
  if (item) {
    item.price = Number(price) || 0;
    persist();
  }
}

export function addItem(departmentId, name, price) {
  if (!_prices.itemPrices[departmentId]) _prices.itemPrices[departmentId] = [];
  const id = name.toLowerCase().replace(/\s+/g, '') + '_' + Date.now().toString(36);
  _prices.itemPrices[departmentId].push({ id, name, price: Number(price) || 0, active: true });
  persist();
  return id;
}

export function toggleItem(departmentId, itemId) {
  const items = _prices.itemPrices[departmentId];
  if (!items) return;
  const item = items.find((i) => i.id === itemId);
  if (item) {
    item.active = !item.active;
    persist();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_prices));
}

export function resetPrices() {
  _prices = {
    roomPrices: JSON.parse(JSON.stringify(DEFAULT_ROOM_PRICES)),
    itemPrices: JSON.parse(JSON.stringify(DEFAULT_ITEM_PRICES)),
  };
  persist();
}
