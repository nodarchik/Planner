// Generic item built from primitives: any object the catalog lacks (assistant or hand-written plan).
import { M } from '../materials.js';
import { isMat, tinted } from '../tint.js';
import { B, RB, C, S, beginG, endG } from '../primitives.js';
import { state } from '../scene.js';

const RAD = Math.PI / 180;
// shape → size length; pos = [x centre, y centre, z bottom] relative to the item origin
export const SHAPES = { box: 3, rbox: 3, cyl: 2, sphere: 1 };

function part(it, p, i, h) {
  const at = `item ${it.id} parts[${i}]`;
  if (!(p.shape in SHAPES)) throw new Error(`${at}: unknown shape "${p.shape}" (valid: ${Object.keys(SHAPES).join(', ')})`);
  if (!isMat(p.material)) throw new Error(`${at}: unknown material "${p.material}" (valid: ${Object.keys(M).join(', ')})`);
  if (!Array.isArray(p.pos) || p.pos.length !== 3 || !Array.isArray(p.size) || p.size.length !== SHAPES[p.shape] || ![...p.pos, ...p.size].every(Number.isFinite)) throw new Error(`${at}: pos needs 3 numbers and size ${SHAPES[p.shape]} for ${p.shape}`);
  if (!p.size.every(n => n > 0)) throw new Error(`${at}: size values must be greater than 0`);
  if (p.radius !== undefined && !(Number.isFinite(p.radius) && p.radius >= 0)) throw new Error(`${at}: radius must be a number of 0 or more`);
  if (p.rot !== undefined && !(Array.isArray(p.rot) && p.rot.length === 3 && p.rot.every(Number.isFinite))) throw new Error(`${at}: rot must be 3 numbers [rx, ry, rz] in degrees`);
  const [x, y, z] = p.pos, s = p.size, m = tinted(p.material, p.color), b = h + z, o = { clamp: !p.rot }; let me;
  if (p.shape === 'box') me = B(x - s[0] / 2, y - s[1] / 2, x + s[0] / 2, y + s[1] / 2, b, b + s[2], m, o);
  else if (p.shape === 'rbox') me = RB(x - s[0] / 2, y - s[1] / 2, x + s[0] / 2, y + s[1] / 2, b, b + s[2], p.radius ?? .02, m, o);
  else if (p.shape === 'cyl') me = C(x, y, s[0], b, b + s[1], m, o);
  else me = S(x, y, b + s[0], s[0], m, o);
  if (p.rot) me.rotation.set((p.rot[0] || 0) * RAD, -(p.rot[2] || 0) * RAD, (p.rot[1] || 0) * RAD, 'YXZ');
}

export const parts = {
  parts(it) {
    if (!Array.isArray(it.parts) || !it.parts.length || it.parts.length > 200) throw new Error(`item ${it.id}: parts needs a list of 1 to 200 parts`);
    const [x, y] = it.pos, r = -(it.rot || 0) * RAD, h = it.h || 0;
    beginG(it.name || it.label || 'Object'); it.parts.forEach((p, i) => part(it, p, i, h)); const g = state.CUR; endG();
    const cx = g.position.x, cz = g.position.z; g.rotation.y = r; // turn about the item origin, not the bounding-box centre
    g.position.set(x + cx * Math.cos(r) + cz * Math.sin(r), 0, y - cx * Math.sin(r) + cz * Math.cos(r)); g.userData.home = { x: g.position.x, z: g.position.z, r };
  }
};
