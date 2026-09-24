// Staff seed data. Persistent staff records live in IndexedDB (staff store).
export const STAFF = {
  reception: [{ name:'Tolu', username:'tolu', pin:'1234' }, { name:'Blessing', username:'blessing', pin:'2345' }],
  bar: [{ name:'Musa', username:'musa', pin:'1111' }],
  kitchen: [{ name:'Mama K', username:'mamak', pin:'2222' }],
  game: [{ name:'Peter', username:'peter', pin:'3333' }],
  admin: [{ name:'Boss', username:'admin', pin:'9999' }],
};
export function getStaffByRole(roleId){ return STAFF[roleId] || STAFF[roleId === 'games' ? 'game' : roleId] || []; }
export function verifyPin(roleId,name,pin){ const member=getStaffByRole(roleId).find(s=>s.name===name); return !!member && member.pin===pin; }
export function getSeedStaff(){ return Object.entries(STAFF).flatMap(([role,members])=>members.map(s=>({id:`seed-${s.username}`,...s,role,isActive:true,createdAt:new Date().toISOString()}))); }
