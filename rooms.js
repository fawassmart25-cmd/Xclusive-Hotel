// ═══════════════════════════════════════════════════════════
//  Rooms — 20 rooms definition + occupancy helpers
//  16 Lodge rooms, 4 Short-Rest eligible (rooms 17–20)
// ═══════════════════════════════════════════════════════════

import { getAllOccupancy, getRoomOccupancy } from './db.js';

// ── Room definitions ─────────────────────────────────────────
export const ROOMS = [
  { number: 1, category: 'standard', shortRestEligible: false },
  { number: 2, category: 'standard', shortRestEligible: false },
  { number: 3, category: 'standard', shortRestEligible: false },
  { number: 4, category: 'standard', shortRestEligible: false },
  { number: 5, category: 'basic', shortRestEligible: false },
  { number: 6, category: 'basic', shortRestEligible: false },
  { number: 7, category: 'classic', shortRestEligible: false },
  { number: 8, category: 'classic', shortRestEligible: false },
  { number: 9, category: 'deluxe', shortRestEligible: false },
  { number: 10, category: 'deluxe', shortRestEligible: false },
  { number: 11, category: 'standard', shortRestEligible: false },
  { number: 12, category: 'standard', shortRestEligible: false },
  { number: 13, category: 'classic', shortRestEligible: false },
  { number: 14, category: 'classic', shortRestEligible: false },
  { number: 15, category: 'basic', shortRestEligible: false },
  { number: 16, category: 'basic', shortRestEligible: false },
  { number: 17, category: 'standard', shortRestEligible: true },
  { number: 18, category: 'standard', shortRestEligible: true },
  { number: 19, category: 'classic', shortRestEligible: true },
  { number: 20, category: 'deluxe', shortRestEligible: true },
];

export function getRoomByNumber(num) {
  return ROOMS.find((r) => r.number === Number(num));
}

export async function getRoomStatus(num) {
  const occ = await getRoomOccupancy(Number(num));
  if (occ && occ.status === 'occupied') {
    return {
      status: 'occupied',
      guestName: occ.guestName,
      phone: occ.phone,
      checkIn: occ.checkIn,
      checkOut: occ.checkOut,
      stayType: occ.stayType,
      categoryId: occ.categoryId,
      saleId: occ.saleId,
    };
  }
  return { status: 'free' };
}

export async function getAllRoomStatuses() {
  const allOcc = await getAllOccupancy();
  const occMap = {};
  allOcc.forEach((o) => {
    if (o.status === 'occupied') occMap[o.roomId] = o;
  });
  return ROOMS.map((room) => {
    const occ = occMap[room.number];
    return {
      ...room,
      status: occ ? 'occupied' : 'free',
      occupancy: occ || null,
    };
  });
}

export async function countFreeRooms() {
  const all = await getAllRoomStatuses();
  return all.filter((r) => r.status === 'free').length;
}

export async function countOccupiedRooms() {
  const all = await getAllRoomStatuses();
  return all.filter((r) => r.status === 'occupied').length;
}
