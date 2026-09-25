// ═══════════════════════════════════════════════════════════
// Rooms — 24 rooms with admin-configurable names and Short Rest settings
// ═══════════════════════════════════════════════════════════

import { getAllOccupancy, getRoomOccupancy } from './db.js';

export const MAX_SHORT_REST_ROOMS = 4;
export const SHORT_REST_RATE_PER_HOUR = 3000;
export const SHORT_REST_HOURS = [1, 2, 3, 4];
export const ROOM_SETTINGS_KEY = 'xclusive_room_settings';

const DEFAULT_ROOMS = Array.from({ length: 24 }, (_, index) => ({
    number: index + 1,
    name: 'Room ' + (index + 1),
    category: ['standard', 'standard', 'standard', 'standard', 'basic', 'basic', 'classic', 'classic', 'deluxe', 'deluxe', 'standard', 'standard', 'classic', 'classic', 'basic', 'basic', 'standard', 'standard', 'classic', 'deluxe', 'standard', 'basic', 'classic', 'deluxe'][index],
    shortRestEnabled: index >= 16 && index < 20,
}));

export const ROOMS = DEFAULT_ROOMS.map((room) => ({
    ...room,
    shortRestEligible: room.shortRestEnabled,
}));

function normalizeRoomSettings(value) {
    const incoming = Array.isArray(value) ? value : [];
    return DEFAULT_ROOMS.map((fallback) => {
          const item = incoming.find((candidate) => Number(candidate.number) === fallback.number) || {};
          return {
                  number: fallback.number,
                  name: String(item.name || fallback.name).trim() || fallback.name,
                  category: item.category || fallback.category,
                  shortRestEnabled: Boolean(item.shortRestEnabled ?? item.shortRestEligible ?? fallback.shortRestEnabled),
          };
    });
}

export function getConfiguredRooms() {
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem(ROOM_SETTINGS_KEY) || '[]'); } catch (_) { stored = []; }
    const rooms = normalizeRoomSettings(stored);
    return rooms.map((room) => ({
          ...room,
          shortRestEligible: room.shortRestEnabled,
    }));
}

export function saveRoomSettings(settings) {
    const rooms = normalizeRoomSettings(settings);
    if (rooms.filter((room) => room.shortRestEnabled).length > MAX_SHORT_REST_ROOMS) {
          return { success: false, error: 'Max 4 short rest rooms allowed' };
    }
    localStorage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(rooms));
    return { success: true, rooms: getConfiguredRooms() };
}

export function getRoomByNumber(num) {
    return getConfiguredRooms().find((room) => room.number === Number(num));
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
                  shortRestHours: occ.shortRestHours,
      categoryId: occ.categoryId,
                  saleId: occ.saleId,
                  roomName: occ.roomName,
            };
    }
    return { status: 'free' };
            }

export async function getAllRoomStatuses() {
    const allOcc = await getAllOccupancy();
    const occMap = {};
    allOcc.forEach((occupancy) => {
          if (occupancy.status === 'occupied') occMap[occupancy.roomId] = occupancy;
    });
          return getConfiguredRooms().map((room) => {
    const occupancy = occMap[room.number];
                return {
                  ...room,
        status: occupancy ? 'occupied' : 'free',
                        occupancy: occupancy || null,
                };
          });
}

export async function countFreeRooms() {
                                   const all = await getAllRoomStatuses();
                    return all.filter((room) => room.status === 'free').length;
               }

      export async function countOccupiedRooms() {
    const all = await getAllRoomStatuses();
          return all.filter((room) => room.status === 'occupied').length;
      }
