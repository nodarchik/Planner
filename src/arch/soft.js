import * as THREE from 'three';
import { V3 } from '../scene.js';
import { M } from '../materials.js';
import { add, merged } from '../primitives.js';
import { H } from '../plan/plan.js';
import { flip } from '../plan/frame.js';

/* ---- "Soft classic" architecture: chevron oak, boiserie panels, rounded arches, fluted rounded corners, coffered ceilings ---- */
function rrPath(x1, y1, x2, y2, r, n = 10) { r = Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2); const pts = [];
  const C4 = [[x2 - r, y1 + r, -Math.PI / 2], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, Math.PI / 2], [x1 + r, y1 + r, Math.PI]];
  C4.forEach(([cx, cy, a0]) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }); return pts; }
export function softPanels(axis, at, s, a, b, gaps = [], top = 2.42) { // picture-frame mouldings + chair rail on one wall face
  const pr = .014, w = .03, out = [];
  const Bx = (p, q, h1, h2, d = pr) => out.push(axis === 'x' ? new THREE.BoxGeometry(q - p, h2 - h1, d).translate((p + q) / 2, (h1 + h2) / 2, at + s * d / 2) : new THREE.BoxGeometry(d, h2 - h1, q - p).translate(at + s * d / 2, (h1 + h2) / 2, (p + q) / 2));
  const fr = (x1, x2, h1, h2) => { Bx(x1, x2, h1, h1 + w); Bx(x1, x2, h2 - w, h2); Bx(x1, x1 + w, h1 + w, h2 - w); Bx(x2 - w, x2, h1 + w, h2 - w); };
  const segs = []; let st = a; gaps.slice().sort((x, y) => x[0] - y[0]).forEach(([g1, g2]) => { if (g1 - st > .3) segs.push([st, g1]); st = Math.max(st, g2); }); if (b - st > .3) segs.push([st, b]);
  segs.forEach(([p, q]) => { Bx(p, q, .9, .96, .024); Bx(p, q, .955, .965, .034);
    const n = Math.max(1, Math.round((q - p) / .9)), pw = (q - p) / n;
    for (let i = 0; i < n; i++) { const x1 = p + i * pw + .08, x2 = p + (i + 1) * pw - .08; if (x2 - x1 < .14) continue; fr(x1, x2, .2, .78); fr(x1, x2, 1.08, top); } });
  if (out.length) merged(out, M.skirting, { cast: false });
}
export function softArch(axis, t1, t2, a, b, ha, hb, top = 2.45, r = .42) { // wall piece a–b (thickness t1–t2) with a rounded-shoulder arched opening ha–hb, painted casing both sides
  const m4 = new THREE.Matrix4(); if (axis === 'x') m4.makeTranslation(0, 0, t1); else m4.set(0, 0, 1, t1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  const put = g => { g.applyMatrix4(m4); return axis === 'x' ? g : flip(g); };
  const s = new THREE.Shape(); s.moveTo(a, 0); s.lineTo(b, 0); s.lineTo(b, H); s.lineTo(a, H); s.lineTo(a, 0);
  const hole = new THREE.Path(); hole.moveTo(ha, 0); hole.lineTo(ha, top - r); hole.absarc(ha + r, top - r, r, Math.PI, Math.PI / 2, true); hole.lineTo(hb - r, top);
  hole.absarc(hb - r, top - r, r, Math.PI / 2, 0, true); hole.lineTo(hb, 0); hole.lineTo(ha, 0); s.holes.push(hole);
  add(put(new THREE.ExtrudeGeometry(s, { depth: t2 - t1, bevelEnabled: false, curveSegments: 24 })), M.wall, 0, 0, 0);
  const c = new THREE.CurvePath(); c.add(new THREE.LineCurve3(new V3(ha, 0, 0), new V3(ha, top - r, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(ha, top - r, 0), new V3(ha, top - r * .45, 0), new V3(ha + r * .45, top, 0), new V3(ha + r, top, 0)));
  c.add(new THREE.LineCurve3(new V3(ha + r, top, 0), new V3(hb - r, top, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(hb - r, top, 0), new V3(hb - r * .45, top, 0), new V3(hb, top - r * .45, 0), new V3(hb, top - r, 0)));
  c.add(new THREE.LineCurve3(new V3(hb, top - r, 0), new V3(hb, 0, 0)));
  [-.012, t2 - t1 + .012].forEach(z => { const t = new THREE.TubeGeometry(c, 120, .03, 10, false); t.translate(0, 0, z); add(put(t), M.skirting, 0, 0, 0, { uv: false }); });
}
export function softBullnose(x, y, qx, qy, r = .085) { // fluted rounded corner on a convex wall corner (quadrant qx, qy = outward direction)
  const t0 = qx > 0 ? (qy > 0 ? 0 : Math.PI / 2) : (qy > 0 ? 1.5 * Math.PI : Math.PI);
  add(new THREE.CylinderGeometry(r, r, H, 24, 1, false, t0, Math.PI / 2).translate(0, H / 2, 0), M.wall, x, 0, y);
  const ribs = []; for (let i = 1; i < 9; i++) { const t = t0 + i / 9 * Math.PI / 2; ribs.push(new THREE.CylinderGeometry(.011, .011, H - .3, 8).translate(x + r * Math.sin(t), .15 + (H - .3) / 2, y + r * Math.cos(t))); }
  merged(ribs, M.wall, { cast: false });
}
export function softTray(x1, y1, x2, y2, border, r, softCeil, drop = .16) { // coffered ceiling: dropped border with rounded inner corners, fluted lip and LED cove
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
