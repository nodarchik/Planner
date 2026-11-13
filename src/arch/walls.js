import * as THREE from 'three';
import { clampables } from '../scene.js';
import { H } from '../plan/plan.js';
import { M } from '../materials.js';
import { B, C, add } from '../primitives.js';

/* ================= architecture ================= */
export function wallRun(axis, t1, t2, s, e, ops, m, inSign) {
  ops = [...ops].sort((p, q) => p.a - q.a); let c = s;
  const mk = (a, b, h1, h2) => axis === 'x' ? B(a, t1, b, t2, h1, h2, m) : B(t1, a, t2, b, h1, h2, m);
  for (const o of ops) { if (o.a > c) mk(c, o.a, 0, H); if (o.sill > 0) mk(o.a, o.b, 0, o.sill); if (o.head < H) mk(o.a, o.b, o.head, H);
    if (o.glass) glazing(axis, (t1 + t2) / 2, o, inSign, Math.abs(t2 - t1)); c = o.b; }
  if (c < e) mk(c, e, 0, H);
}
function glazing(axis, c, o, inSign, thick) {
  const f = .055, d = .075, { a, b, sill: s, head: h } = o;
  const R = (a1, b1, h1, h2, m, dd = d, off = 0, opt = {}) => axis === 'x' ? B(a1, c - dd / 2 + off, b1, c + dd / 2 + off, h1, h2, m, opt) : B(c - dd / 2 + off, a1, c + dd / 2 + off, b1, h1, h2, m, opt);
  R(a, a + f, s, h, M.frame); R(b - f, b, s, h, M.frame); R(a, b, h - f, h, M.frame); R(a, b, s, s + f * (o.glass === 'door' ? .5 : 1), M.frame);
  R(a + f, b - f, s + f * (o.glass === 'door' ? .5 : 1), h - f, M.glassWin, .012, 0, { cast: false });
  // reveals (plaster returns) and sills
  if (o.glass === 'win') R(a - .01, b + .01, s - .025, s, M.trav, .2, inSign * (thick / 2 + .02));
  else R(a, b, 0, .012, M.steelDark, thick, 0);
  if (o.glass === 'door') R(b - f - .05, b - f - .035, 1.0, 1.25, M.blackMetal, .03, inSign * .05);
}
export function door(hx, hy, cdx, cdy, len, ang, sign, m, o = {}) {
  const c = Math.cos(ang * sign), s = Math.sin(ang * sign), dx = cdx * c - cdy * s, dy = cdx * s + cdy * c;
  const mx = hx + dx * len / 2, my = hy + dy * len / 2, rot = -Math.atan2(dy, dx), hgt = o.h || 2.08;
  const leaf = add(new THREE.BoxGeometry(len - .006, hgt, .042), m, mx, hgt / 2 + .005, my, { rotY: rot });
  clampables.push({ me: leaf, h1: .005, h2: hgt + .005 }); leaf.userData.clamp = true;
  // lever handles both faces
  const ex = hx + dx * (len - .07), ey = hy + dy * (len - .07), nx = -dy, ny = dx;
  for (const sd of [-1, 1]) {
    C(ex + nx * .03 * sd, ey + ny * .03 * sd, .025, 0.99, 1.0, M[o.handle || 'blackMetal'], { rt: .025 }).rotation.x = 0;
    add(new THREE.BoxGeometry(.13, .016, .016), M[o.handle || 'blackMetal'], ex + nx * .045 * sd - dx * .055, 1.0, ey + ny * .045 * sd - dy * .055, { rotY: rot });
  }
}
export function skirt(axis, at, inSign, a, b, gaps = []) { // 80 mm skirting board on one wall face
  let c = a; const segs = []; [...gaps].sort((p, q) => p[0] - q[0]).forEach(([g1, g2]) => { if (g1 > c) segs.push([c, g1]); c = Math.max(c, g2); }); if (c < b) segs.push([c, b]);
  for (const [s, e] of segs) axis === 'x' ? B(s, at, e, at + inSign * .012, 0, .08, M.skirting) : B(at, s, at + inSign * .012, e, 0, .08, M.skirting);
}
