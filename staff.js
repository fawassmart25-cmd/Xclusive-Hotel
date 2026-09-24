// ═══════════════════════════════════════════════════════════
//  Staff list and PINs per department
//  Add or remove staff here — the login screen updates automatically
// ═══════════════════════════════════════════════════════════

export const STAFF = {
  reception: [
    { name: 'Tolu', pin: '1234' },
    { name: 'Blessing', pin: '2345' },
  ],
  bar: [
    { name: 'Musa', pin: '1111' },
  ],
  kitchen: [
    { name: 'Mama K', pin: '2222' },
  ],
  games: [
    { name: 'Peter', pin: '3333' },
  ],
  admin: [
    { name: 'Boss', pin: '9999' },
  ],
};

export function getStaffByRole(roleId) {
  return STAFF[roleId] || [];
}

export function verifyPin(roleId, name, pin) {
  const staff = STAFF[roleId] || [];
  const member = staff.find((s) => s.name === name);
  return member ? member.pin === pin : false;
}
