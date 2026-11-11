// Builds every item of the plan. Wall-attached built-ins use parametric builders; free furniture comes from the design catalog.
import { movables, scene, world } from '../scene.js';
import { nightLights } from '../lighting.js';
import { reseed } from '../textures.js';
import { DESIGNS, faceTo, typed } from '../catalog.js';
import { plan } from '../plan/plan.js';
import { loose } from './loose.js';
import { hall } from './hall.js';
import { kitchen } from './kitchen.js';
import { storage } from './storage.js';
import { bath } from './bath.js';
import { living } from './living.js';

export const BUILDERS = { ...loose, ...hall, ...kitchen, ...storage, ...bath, ...living };
export const itemGroups = new Map();  // item id → movable groups built for it
export const itemObjects = new Map(); // item id → every object it added (groups, loose meshes, lights)

export function buildItem(it) {
  const m0 = movables.length, w0 = world.children.length, l0 = nightLights.length;
  reseed(it.id); // random details (leaves, garments, books) depend only on the item, not on build order
  if (BUILDERS[it.type]) BUILDERS[it.type](it);
  else if (DESIGNS[it.type]) { const [x, y] = it.pos, face = it.lookAt ? faceTo(x, y, ...it.lookAt) : -(it.rot || 0) * Math.PI / 180; const g = typed(it.type, it.variant || 0, x, y, face, it.opts); if (it.name) g.name = it.name; }
  else throw new Error(`plan: item ${it.id} has unknown type "${it.type}"`);
  const groups = movables.slice(m0), objs = [...world.children.slice(w0), ...nightLights.slice(l0).filter(l => l.parent === scene)];
  objs.forEach(o => { o.userData.item = it.id; }); itemGroups.set(it.id, groups); itemObjects.set(it.id, objs); return groups;
}
export function buildItems() { itemGroups.clear(); itemObjects.clear(); for (const it of plan.items) buildItem(it); }
