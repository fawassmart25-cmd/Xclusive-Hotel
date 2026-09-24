// XCLUSIVE HOTEL — Staff seed + IndexedDB staff helpers.
// staff.js stores the initial/default staff records. Runtime changes are persisted in IndexedDB
// and mirrored to localStorage. Browser code cannot rewrite its own bundled source file.
import {
  saveStaffMember, getAllStaff, getStaffMember, deleteStaffMember,
  findStaffByUsername,
} from './db.js';

export const STAFF_SEED = [
  { id: 'staff-admin-001', name: 'Boss', username: 'admin', pin: '9999', role: 'admin' },
  { id: 'staff-reception-001', name: 'Tolu', username: 'tolu', pin: '1234', role: 'reception' },
  { id: 'staff-reception-002', name: 'Blessing', username: 'blessing', pin: '2345', role: 'reception' },
  { id: 'staff-bar-001', name: 'Musa', username: 'musa', pin: '1111', role: 'bar' },
  { id: 'staff-kitchen-001', name: 'Mama K', username: 'mamak', pin: '2222', role: 'kitchen' },
  { id: 'staff-game-001', name: 'Peter', username: 'peter', pin: '3333', role: 'game' },
];

export const STAFF_ROLES = ['admin', 'reception', 'bar', 'kitchen', 'game'];

export async function seedStaff() {
  const existing = await getAllStaff();
  if (existing.length) return existing;
  for (const s of STAFF_SEED) {
    await saveStaffMember({ ...s, isActive: true, createdAt: new Date().toISOString() });
  }
  return getAllStaff();
}

export async function authenticate(username, pin) {
  await seedStaff();
  const staff = await findStaffByUsername(username);
  if (!staff || !staff.isActive || String(staff.pin) !== String(pin)) return null;
  return staff;
}

export async function createStaff(data) {
  const username = String(data.username || '').trim().toLowerCase();
  if (!username) throw new Error('Username is required');
  const existing = await findStaffByUsername(username);
  if (existing) throw new Error('Username already exists');
  const staff = {
    id: data.id || `staff-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    name: String(data.name || '').trim(),
    username,
    pin: String(data.pin || ''),
    role: data.role,
    isActive: data.isActive !== false,
    createdAt: data.createdAt || new Date().toISOString(),
  };
  if (!staff.name || !staff.pin || !STAFF_ROLES.includes(staff.role)) throw new Error('Complete all staff fields');
  await saveStaffMember(staff);
  mirrorStaffToLocalStorage();
  return staff;
}
export async function updateStaff(staff) {
  const existing = await getStaffMember(staff.id);
  if (!existing) throw new Error('Staff not found');
  const other = await findStaffByUsername(staff.username);
  if (other && other.id !== staff.id) throw new Error('Username already exists');
  const next = { ...existing, ...staff, username: String(staff.username).trim().toLowerCase() };
  await saveStaffMember(next);
  mirrorStaffToLocalStorage();
  return next;
}
export async function removeStaff(id) {
  await deleteStaffMember(id);
  mirrorStaffToLocalStorage();
}
export async function mirrorStaffToLocalStorage() {
  try { localStorage.setItem('xclusive_staff_cache', JSON.stringify(await getAllStaff())); } catch {}
}
export async function getStaffByRole(role) {
  return (await getAllStaff()).filter(s => s.role === role && s.isActive);
}
