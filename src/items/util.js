import { M } from '../materials.js';
import { beginG, endG } from '../primitives.js';
import { frameSpec } from '../plan/plan.js';
import { frame } from '../plan/frame.js';

// frame + length + depth for a wall-attached item
export function framed(it) { const sp = frameSpec(it); return { F: frame(sp), L: sp.len, D: sp.depth, sp }; }
export const mat = (name, fallback) => M[name || fallback];
export const group = (it, fn, name) => { beginG(name || it.name || it.type); fn(); endG(); };
