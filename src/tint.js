// Material lookup and tinted clones of materials, shared by the architecture and `parts` items. Cleared on every full rebuild.
import { M } from './materials.js';

export const HEX = /^#[0-9a-f]{6}$/i;
export const isMat = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(M, k) && !!M[k].isMaterial;
const clones = new Map();
export function mat(key) { if (!isMat(key)) throw new Error(`unknown material "${key}" (valid: ${Object.keys(M).join(', ')})`); return M[key]; }
// material `key`, or a clone tinted with a #rrggbb colour
export function tinted(key, hex) { const m = mat(key); if (hex === undefined || hex === null || hex === '') return m;
  if (!HEX.test(hex)) throw new Error(`colour "${hex}" must look like #e9ddcc`); const id = key + hex.toLowerCase();
  if (!clones.has(id)) { const c = m.clone(); c.color.set(hex); clones.set(id, c); } return clones.get(id); }
export function clearTints() { clones.forEach(c => c.dispose()); clones.clear(); }
export const hasTints = () => clones.size > 0;
