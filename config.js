// ═══════════════════════════════════════════════════════════
//  XCLUSIVE HOTEL MANAGER — Central Configuration
//  All UI reads from this file. Toggle active=false to hide
//  any department, room category, or role from the entire app.
// ═══════════════════════════════════════════════════════════

export const APP_CONFIG = {
  name: 'Xclusive Hotel Manager',
  shortName: 'Xclusive',
  version: '1.0.0',
  currency: '₦',
  currencyCode: 'NGN',
};

// ── Departments ──────────────────────────────────────────────
// Set active: false to remove a department from the entire app
// (bottom nav, dashboard, login roles, everything).
// Add new departments here and they appear automatically.
// ─────────────────────────────────────────────────────────────
export const DEPARTMENTS = [
  {
    id: 'reception',
    name: 'Reception',
    shortName: 'Rooms',
    icon: 'door',
    active: true,
    defaultTab: true,
    description: 'Manage room sales, check-ins, and check-outs',
    color: '#F5C842',
    accent: 'gold',
  },
  {
    id: 'bar',
    name: 'Bar',
    shortName: 'Bar',
    icon: 'wine',
    active: true,
    defaultTab: false,
    description: 'Sell drinks with instant search',
    color: '#60A5FA',
    accent: 'blue',
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    shortName: 'Kitchen',
    icon: 'utensils',
    active: true,
    defaultTab: false,
    description: 'Sell meals and food orders',
    color: '#34D399',
    accent: 'green',
  },
  {
    id: 'games',
    name: 'Games',
    shortName: 'Games',
    icon: 'gamepad',
    active: true,
    defaultTab: false,
    description: 'Manage game sessions and billing',
    color: '#F87171',
    accent: 'red',
  },
];

// ── Roles ────────────────────────────────────────────────────
// Each role determines which tab the user lands on after login.
// Admin sees everything including dashboard and settings.
// ─────────────────────────────────────────────────────────────
export const ROLES = [
  {
    id: 'admin',
    name: 'Admin',
    icon: 'shield',
    active: true,
    description: 'Full access — dashboard, reports, settings',
    landingTab: 'dashboard',
    isAdmin: true,
  },
  {
    id: 'reception',
    name: 'Reception',
    icon: 'door',
    active: true,
    description: 'Room sales and guest management',
    landingTab: 'reception',
    isAdmin: false,
  },
  {
    id: 'bar',
    name: 'Bar Staff',
    icon: 'wine',
    active: true,
    description: 'Bar sales and drink orders',
    landingTab: 'bar',
    isAdmin: false,
  },
  {
    id: 'kitchen',
    name: 'Kitchen Staff',
    icon: 'utensils',
    active: true,
    description: 'Kitchen orders and food sales',
    landingTab: 'kitchen',
    isAdmin: false,
  },
  {
    id: 'game',
    name: 'Game Lounge',
    icon: 'gamepad',
    active: true,
    description: 'Game sessions and billing',
    landingTab: 'games',
    isAdmin: false,
  },
];

// ── Room Categories ───────────────────────────────────────────
export const ROOM_CATEGORIES = [
  { id: 'basic', name: 'Basic', active: true, color: '#6B7280', lodgeRate: 3000, shortRestRate: 1500 },
  { id: 'standard', name: 'Standard', active: true, color: '#60A5FA', lodgeRate: 5000, shortRestRate: 2500 },
  { id: 'classic', name: 'Classic', active: true, color: '#34D399', lodgeRate: 8000, shortRestRate: 4000 },
  { id: 'deluxe', name: 'Deluxe / Executive', active: true, color: '#F5C842', lodgeRate: 15000, shortRestRate: 7500 },
];

// ── Room Setup (20 rooms: 16 Lodge, 4 Short-Rest eligible) ───
export const ROOMS_CONFIG = {
  totalRooms: 20,
  shortRestRooms: 4,
  shortRestConversionTime: '00:00',
};

// ── Payment Methods ──────────────────────────────────────────
export const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', icon: 'banknote', active: true },
  { id: 'pos', name: 'POS', icon: 'card', active: true },
  { id: 'transfer', name: 'Transfer', icon: 'smartphone', active: true },
];

// ── Helper Functions ─────────────────────────────────────────
export function getActiveDepartments() {
  return DEPARTMENTS.filter((d) => d.active);
}

export function getDepartmentById(id) {
  return DEPARTMENTS.find((d) => d.id === id);
}

export function getActiveRoles() {
  return ROLES.filter((r) => r.active);
}

export function getRoleById(id) {
  return ROLES.find((r) => r.id === id);
}

export function getActiveCategories() {
  return ROOM_CATEGORIES.filter((c) => c.active);
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return APP_CONFIG.currency + num.toLocaleString('en-NG');
}
