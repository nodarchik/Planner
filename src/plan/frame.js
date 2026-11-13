// Local frame for wall-attached items. u runs along the wall (same direction as the plan coordinate), d from the back plane to the front.
// Boxes stay axis-aligned for all four orientations, so one builder serves a north, south, east or west wall.
import * as THREE from 'three';
import { B, C, RB, S, add, lathe, tube } from '../primitives.js';
import { cab } from '../furniture/storage.js';
import { placePulls } from '../furniture/pulls.js';

export function frame({ axis, a0, back, dir }) {
  const P = (u, d) => axis === 'x' ? [a0 + u, back + dir * d] : [back + dir * d, a0 + u];
  const rect = (u1, d1, u2, d2) => { const [xa, ya] = P(u1, d1), [xb, yb] = P(u2, d2); return [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)]; };
  // local (u, h, d) → world (x, h, z); mirrored frames get their triangle winding flipped
  const m4 = new THREE.Matrix4();
  if (axis === 'x') m4.set(1, 0, 0, a0, 0, 1, 0, 0, 0, 0, dir, back, 0, 0, 0, 1); else m4.set(0, 0, dir, back, 0, 1, 0, 0, 1, 0, 0, a0, 0, 0, 0, 1);
  const mirrored = m4.determinant() < 0;
  const geo = g => { g.applyMatrix4(m4); if (mirrored) flip(g); return g; };
  const face = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2); // rotY that turns a +Z-facing geometry to the front
  return {
    axis, a0, back, dir, P, rect, geo, face,
    abs: u => a0 + u,
    B: (u1, d1, u2, d2, h1, h2, m, o) => { const r = rect(u1, d1, u2, d2); return B(r[0], r[1], r[2], r[3], h1, h2, m, o); },
    RB: (u1, d1, u2, d2, h1, h2, rad, m, o) => { const r = rect(u1, d1, u2, d2); return RB(r[0], r[1], r[2], r[3], h1, h2, rad, m, o); },
    C: (u, d, r, h1, h2, m, o) => { const [x, y] = P(u, d); return C(x, y, r, h1, h2, m, o); },
    S: (u, d, h, r, m, o) => { const [x, y] = P(u, d); return S(x, y, h, r, m, o); },
    lathe: (pts, u, d, h, m, o = {}) => { const [x, y] = P(u, d), { su, sd, ...rest } = o; if (su || sd) Object.assign(rest, axis === 'x' ? { sx: su || 1, sz: sd || 1 } : { sx: sd || 1, sz: su || 1 }); return lathe(pts, x, y, h, m, rest); },
    tube: (pts, r, m, o) => tube(pts.map(([u, h, d]) => { const [x, y] = P(u, d); return [x, h, y]; }), r, m, o),
    cab: o => cab({ axis, a1: a0 + o.u1, a2: a0 + o.u2, back: back + dir * (o.d0 || 0), front: back + dir * o.d1, h1: o.h1, h2: o.h2, cols: o.cols, fm: o.fm, cm: o.cm, pull: o.pull, skip: o.skip }),
    pulls: (d, list) => placePulls(list.map(p => ({ ...p, a: a0 + p.u })), { axis, front: back + dir * d, s: dir }), // u = along the wall
    add: (g, m, u, h, d, o) => { const [x, y] = P(u, d); return add(g, m, x, h, y, o); },
    mesh: (g, m, o) => add(geo(g), m, 0, 0, 0, o) // geometry authored in local (u, h, d) coordinates
  };
}
export function flip(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else { for (const name of Object.keys(g.attributes)) { const at = g.attributes[name], n = at.itemSize, a = at.array; for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) { const t = a[(i + 1) * n + k]; a[(i + 1) * n + k] = a[(i + 2) * n + k]; a[(i + 2) * n + k] = t; } at.needsUpdate = true; } }
  if (g.attributes.normal) g.computeVertexNormals();
  return g;
}
