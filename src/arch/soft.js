import * as THREE from 'three';
import { H, V3, state, world } from '../scene.js';
import { M } from '../materials.js';
import { B, add, merged } from '../primitives.js';
import { DOOR, door, skirt, wallX, wallY } from './walls.js';
import { LAYOUTS } from '../layout.js';

// Soft classic partitions and finishes
const ARCH = {};
ARCH.softStudio = function () {
  // studio north, office in the old kitchen room, hall separate on the east side
    wallY(7.07, 7.17, 2.87, 4.32); skirt('y', 7.07, -1, 2.87, 4.32); skirt('y', 7.17, 1, 2.87, 4.32);
    wallX(4.32, 4.42, 8.86, 13.62); wallY(8.86, 8.96, 4.42, 7.13, [DOOR(4.66, 5.43)]);
    door(8.96, 4.66, 0, 1, .77, 1.3, -1, M.skirting);
    B(8.96, 4.42, 13.62, 7.13, -.05, .004, M.trav, { clamp: false });
    skirt('x', 4.32, -1, 7.17, 13.62, [[7.17, 8.86]]); skirt('y', 8.86, -1, 4.42, 7.13, [[4.66, 5.43]]); skirt('y', 8.96, 1, 4.42, 7.13, [[4.66, 5.43]]); skirt('x', 4.42, 1, 8.96, 13.62);
  // chevron oak over every oak / stone living floor (bathroom + WC keep their tiles)
  B(0, 0, 4.59, 7.13, 0, .006, M.chevron, { clamp: false, cast: false }); B(4.59, 2.87, 7.07, 7.13, 0, .006, M.chevron, { clamp: false, cast: false });
  B(7.07, 0, 13.62, 7.13, 0, .006, M.chevron, { clamp: false, cast: false });
  // rounded-shoulder arches: corridor → hall and hall → studio
  softArch(4.32, 4.42, 7.17, 8.86, 7.24, 8.79, 2.45, .5);
  // fluted rounded corners on convex corners
  softBullnose(5.16, 3.98, 1, -1); softBullnose(8.86, .2, -1, 1); softBullnose(9.35, .2, 1, 1); softBullnose(9.25, 6.64, -1, -1); softBullnose(10.88, 6.64, 1, -1);
  // boiserie
  // walk-in closet in bedroom 1 (1.54 × 2.95 inside): partition at x 2.95–3.05 with an arched opening facing the bed, closet front wall at y 2.95–3.05
  // walk-in closet in bedroom 1 (1.30 × 2.95 inside), entered right at the bedroom door through an arch in its south wall
  B(3.19, 0, 3.29, 3.05, 0, H, M.wall); softArch(2.95, 3.05, 3.29, 4.59, 3.32, 4.0, 2.3, .3);
  skirt('y', 3.19, -1, 0, 2.95); skirt('x', 3.05, 1, 3.19, 4.59, [[3.32, 4.0]]);
  softPanels('x', 0, 1, 0, 3.19);                                 // bedroom 1 headboard wall
  softPanels('x', 3.98, -1, 0, 4.59, [[.5, 1.8], [2.6, 4.59]]);   // bedroom 1 south (beauty table bay + entry plain)
  softPanels('x', 4.08, 1, 0, 2.6);                               // bedroom 2 north
  softPanels('x', 7.13, -1, 0, 2.9);                              // bedroom 2 headboard wall (wardrobe bay plain)
  softPanels('y', 7.07, -1, 2.87, 4.30, [[2.87, 4.40]]);          // corridor east (laundry tower bay)
  softPanels('x', 2.87, 1, 4.69, 7.07, [[5.42, 6.32]]);           // corridor north (bathroom door)
  softPanels('x', 7.13, -1, 5.16, 8.86, [[5.18, 6.23], [7.91, 8.78]]); // hall south (entrance + WC doors)
  softPanels('y', 8.86, -1, 4.42, 7.13, [[4.61, 5.48], [5.40, 6.40]]); // hall east (office door; console + art bay plain)
  softPanels('x', 0, 1, 9.35, 13.62);                             // studio north (behind the sofa)
  softPanels('x', 4.32, -1, 8.86, 11.0);                          // studio partition (dining side)
  softPanels('y', 8.96, 1, 5.48, 7.13);                           // office west
  // coffered ceilings with rounded corners, fluted lip and LED cove
  softCeil = new THREE.Group(); softCeil.name = 'softCeil'; state.ceiling.add(softCeil);
  softTray(0, 0, 3.19, 3.98, .3, .4); softTray(0, 4.08, 5.06, 7.13, .35, .45); softTray(4.69, 2.87, 7.07, 4.30, .18, .25);
  softTray(5.16, 4.42, 8.86, 7.13, .25, .4); softTray(7.17, 0, 13.62, 4.32, .45, .6); softTray(8.96, 4.42, 13.62, 7.13, .3, .45);
};
/* ---- "Soft classic" architecture: chevron oak, boiserie panels, rounded arches, fluted rounded corners, coffered ceilings ---- */
function rrPath(x1, y1, x2, y2, r, n = 10) { r = Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2); const pts = [];
  const C4 = [[x2 - r, y1 + r, -Math.PI / 2], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, Math.PI / 2], [x1 + r, y1 + r, Math.PI]];
  C4.forEach(([cx, cy, a0]) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }); return pts; }
function softPanels(axis, at, s, a, b, gaps = [], top = 2.42) { // picture-frame mouldings + chair rail on one wall face
  const pr = .014, w = .03, out = [];
  const Bx = (p, q, h1, h2, d = pr) => out.push(axis === 'x' ? new THREE.BoxGeometry(q - p, h2 - h1, d).translate((p + q) / 2, (h1 + h2) / 2, at + s * d / 2) : new THREE.BoxGeometry(d, h2 - h1, q - p).translate(at + s * d / 2, (h1 + h2) / 2, (p + q) / 2));
  const fr = (x1, x2, h1, h2) => { Bx(x1, x2, h1, h1 + w); Bx(x1, x2, h2 - w, h2); Bx(x1, x1 + w, h1 + w, h2 - w); Bx(x2 - w, x2, h1 + w, h2 - w); };
  const segs = []; let st = a; gaps.slice().sort((x, y) => x[0] - y[0]).forEach(([g1, g2]) => { if (g1 - st > .3) segs.push([st, g1]); st = Math.max(st, g2); }); if (b - st > .3) segs.push([st, b]);
  segs.forEach(([p, q]) => { Bx(p, q, .9, .96, .024); Bx(p, q, .955, .965, .034);
    const n = Math.max(1, Math.round((q - p) / .9)), pw = (q - p) / n;
    for (let i = 0; i < n; i++) { const x1 = p + i * pw + .08, x2 = p + (i + 1) * pw - .08; if (x2 - x1 < .14) continue; fr(x1, x2, .2, .78); fr(x1, x2, 1.08, top); } });
  if (out.length) merged(out, M.skirting, { cast: false });
}
function softArch(y1, y2, a, b, ha, hb, top = 2.45, r = .42) { // wall with a rounded-shoulder arched opening (ha–hb), painted casing both sides
  const s = new THREE.Shape(); s.moveTo(a, 0); s.lineTo(b, 0); s.lineTo(b, H); s.lineTo(a, H); s.lineTo(a, 0);
  const hole = new THREE.Path(); hole.moveTo(ha, 0); hole.lineTo(ha, top - r); hole.absarc(ha + r, top - r, r, Math.PI, Math.PI / 2, true); hole.lineTo(hb - r, top);
  hole.absarc(hb - r, top - r, r, Math.PI / 2, 0, true); hole.lineTo(hb, 0); hole.lineTo(ha, 0); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: y2 - y1, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, y1); add(g, M.wall, 0, 0, 0);
  const c = new THREE.CurvePath(); c.add(new THREE.LineCurve3(new V3(ha, 0, 0), new V3(ha, top - r, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(ha, top - r, 0), new V3(ha, top - r * .45, 0), new V3(ha + r * .45, top, 0), new V3(ha + r, top, 0)));
  c.add(new THREE.LineCurve3(new V3(ha + r, top, 0), new V3(hb - r, top, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(hb - r, top, 0), new V3(hb - r * .45, top, 0), new V3(hb, top - r * .45, 0), new V3(hb, top - r, 0)));
  c.add(new THREE.LineCurve3(new V3(hb, top - r, 0), new V3(hb, 0, 0)));
  [y1 - .012, y2 + .012].forEach(z => { const t = new THREE.TubeGeometry(c, 120, .03, 10, false); t.translate(0, 0, z); add(t, M.skirting, 0, 0, 0, { uv: false }); });
}
function softBullnose(x, y, qx, qy, r = .085) { // fluted rounded corner on a convex wall corner (quadrant qx, qy = outward direction)
  const t0 = qx > 0 ? (qy > 0 ? 0 : Math.PI / 2) : (qy > 0 ? 1.5 * Math.PI : Math.PI);
  add(new THREE.CylinderGeometry(r, r, H, 24, 1, false, t0, Math.PI / 2).translate(0, H / 2, 0), M.wall, x, 0, y);
  const ribs = []; for (let i = 1; i < 9; i++) { const t = t0 + i / 9 * Math.PI / 2; ribs.push(new THREE.CylinderGeometry(.011, .011, H - .3, 8).translate(x + r * Math.sin(t), .15 + (H - .3) / 2, y + r * Math.cos(t))); }
  merged(ribs, M.wall, { cast: false });
}
let softCeil = null;
function softTray(x1, y1, x2, y2, border, r, drop = .16) { // coffered ceiling: dropped border with rounded inner corners, fluted lip and LED cove
  const ix1 = x1 + border, iy1 = y1 + border, ix2 = x2 - border, iy2 = y2 - border, inner = rrPath(ix1, iy1, ix2, iy2, r);
  const s = new THREE.Shape(); [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(([x, y], i) => i ? s.lineTo(x, -y) : s.moveTo(x, -y));
  const h = new THREE.Path(); inner.forEach(([x, y], i) => i ? h.lineTo(x, -y) : h.moveTo(x, -y)); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: drop, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, H - drop, 0);
  add(g, M.ceiling, 0, 0, 0, { parent: softCeil, cast: false });
  const ribs = []; let acc = 0;
  for (let i = 0; i < inner.length; i++) { const [ax, ay] = inner[i], [bx, by] = inner[(i + 1) % inner.length], L = Math.hypot(bx - ax, by - ay);
    for (let d = .035 - acc; d < L; d += .035) { const t = d / L; ribs.push(new THREE.CylinderGeometry(.008, .008, drop - .03, 6).translate(ax + (bx - ax) * t, H - drop / 2 - .015, ay + (by - ay) * t)); }
    acc = (acc + L) % .035; }
  merged(ribs, M.ceiling, { parent: softCeil, cast: false });
  const c = new THREE.CurvePath(); for (let i = 0; i < inner.length; i++) { const [ax, ay] = inner[i], [bx, by] = inner[(i + 1) % inner.length]; c.add(new THREE.LineCurve3(new V3(ax, H - .012, ay), new V3(bx, H - .012, by))); }
  add(new THREE.TubeGeometry(c, inner.length * 3, .007, 6, true), M.led, 0, 0, 0, { parent: softCeil, cast: false, uv: false });
}
export function buildArchVar() { const L = LAYOUTS.soft; M.wall.color.set(L.wallTint); M.ceiling.color.set(L.ceilTint); M.skirting.color.set(L.trimTint);
  const archG = new THREE.Group(); archG.name = 'archVar'; world.add(archG); state.CUR = archG; ARCH.softStudio(); state.CUR = world; }
