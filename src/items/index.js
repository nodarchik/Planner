// Builds every item of the plan, in plan order. Wall-attached built-ins use parametric builders; free furniture comes from the design catalog.
import { movables } from '../scene.js';
import { rand } from '../textures.js';
import { DESIGNS, faceTo, typed } from '../catalog.js';
import { plan } from '../plan/plan.js';
import { loose } from './loose.js';
import { hall } from './hall.js';
import { kitchen } from './kitchen.js';
import { storage } from './storage.js';
import { bath } from './bath.js';
import { living } from './living.js';

export const BUILDERS = { ...loose, ...hall, ...kitchen, ...storage, ...bath, ...living };
// numbers drawn from the seeded generator by items that no longer exist (old B1 bed, east herb planter); keeps random details identical to the baseline
const LEGACY_SKIP = { 'curtain-b1-n': 288, 'console-hall': 55 };

export function buildItem(it) {
  const before = movables.length;
  if (BUILDERS[it.type]) BUILDERS[it.type](it);
  else if (DESIGNS[it.type]) { const [x, y] = it.pos, face = it.lookAt ? faceTo(x, y, ...it.lookAt) : -(it.rot || 0) * Math.PI / 180; const g = typed(it.type, it.variant || 0, x, y, face, it.opts); if (it.name) g.name = it.name; }
  else throw new Error(`plan: item ${it.id} has unknown type "${it.type}"`);
  const groups = movables.slice(before); groups.forEach(g => { g.userData.item = it.id; }); return groups;
}
export const itemGroups = new Map(); // item id → movable groups built for it
export function buildItems() {
  for (const it of plan.items) { for (let i = 0; i < (LEGACY_SKIP[it.id] || 0); i++) rand(); itemGroups.set(it.id, buildItem(it)); }
}
