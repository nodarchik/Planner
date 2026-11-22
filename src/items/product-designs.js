// Hand-modelled designs for single shop products, keyed by comforter.ge id; used by product() instead of the generic kind builder.
import { tinted } from '../tint.js';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RB, add } from '../primitives.js';

// Corner Sofa Alikante (634): block arms with 2 x 2 tufts, 3 tall back cushions with 3 lobes, lumbar pillows, thick seats on a recessed base, one-piece chaise. Built chaise at +x; the shop photo (chaise on the sitter's left) is the default, "R" mirrors it.
function alikante(c) {
  const { x1, x2, y1, y2 } = c, left = c.it.chaise !== 'R', hex = c.it.color || '#e3c8a8', f = c.it.color ? c.fab : tinted('boucle', hex), dark = tinted('walnut', '#3a281e');
  const rb = (a, y, b, ya, z1, z2, r, seg = 2, m = f) => { const [p, q] = left ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg }); };
  const lean = (m, th, py, pz) => { const dy = m.position.y - pz, dz = m.position.z - py; m.rotation.x = th; m.position.y = pz + dy * Math.cos(th) - dz * Math.sin(th); m.position.z = py + dy * Math.sin(th) + dz * Math.cos(th); }; // tilt about a bottom pivot, top goes back
  const D = 1.18, yb = y2 - D, aw = .3, ch = 1.31, fz = .045, bz = .25, sz = .45, az = .66, g = .004, sw = (x2 - x1 - aw - ch) / 2, xs = [x1 + aw, x1 + aw + sw, x2 - ch];
  for (const [x, y] of [[x1 + .1, yb + .12], [x1 + .1, y2 - .08], [x2 - .1, y2 - .08], [x2 - .1, y1 + .14], [x2 - ch + .1, y1 + .14], [x2 - ch + .1, yb + .12], [(x1 + x2 - ch) / 2, y2 - .08]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, 1, dark);
  rb(x1 + aw - .02, yb + .05, x2 - aw + .02, y2, fz, bz, .03); rb(x2 - ch, y1 + .05, x2 - .02, yb + .05, fz, bz, .03); // recessed bases
  for (const [a, b] of [[xs[0], xs[1]], [xs[1], xs[2]]]) rb(a, yb, b, y2 - .36, bz - .01, sz, .06, 4); // seats
  rb(xs[2] + g, y1, x2, yb, bz - .01, sz, .06, 4); rb(xs[2] + g, yb, x2 - aw - g, y2 - .36, bz - .01, sz, .06, 4); // chaise: front part, rear part beside the arm
  for (const [a, b, out] of [[x1, x1 + aw, -1], [x2 - aw, x2, 1]]) { const t = .09, ia = out < 0 ? a + .05 : a, ib = out < 0 ? b : b - .05, h2 = (fz + az) / 2; // arm: one block, tufted outer face (3 x 2), plain front
    rb(ia, yb, ib, y2, fz, az - .06, .05, 2); rb(ia, yb, ib, y2, az - .12, az, .06, 3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rb(out < 0 ? a : b - t, yb + i * D / 3 + .0015, out < 0 ? a + t : b, yb + (i + 1) * D / 3 - .0015, j ? h2 + .002 : fz, j ? az : h2 - .002, .055, 2); }
  rb(x1 + .03, y2 - .2, x2 - .03, y2, bz, .6, .05); // back rail
  const cushion = (cx, py) => { const w = .73, t = .23, d = .46, r = .07, g3 = new THREE.BoxGeometry(w, t, d, 22, 3, 14), q = g3.attributes.position; // back cushion: puffy, 2 seam grooves in the upper part
    for (let i = 0; i < q.count; i++) { let x = q.getX(i), y = q.getY(i), z = q.getZ(i); const ix = Math.max(-w / 2 + r, Math.min(w / 2 - r, x)), iy = Math.max(-t / 2 + r, Math.min(t / 2 - r, y)), iz = Math.max(-d / 2 + r, Math.min(d / 2 - r, z)), vx = x - ix, vy = y - iy, vz = z - iz, l = Math.hypot(vx, vy, vz) || 1;
      x = ix + vx / l * r; y = iy + vy / l * r; z = iz + vz / l * r; const nx = x / (w / 2), nz = z / (d / 2), e = Math.min(1, Math.hypot(nx * .8, nz * .8) * .6 + Math.max(Math.abs(nx), Math.abs(nz)) * .45); y *= Math.max(.12, 1 - .9 * e ** 2.2);
      const k = Math.exp(-(((x - .12) / .03) ** 2)) + Math.exp(-(((x + .12) / .03) ** 2)); y -= Math.sign(y) * .022 * k * Math.min(1, Math.max(0, (.1 - z) / .1)); q.setXYZ(i, x, y, z); }
    g3.deleteAttribute('uv'); g3.deleteAttribute('normal'); const m = mergeVertices(g3, 1e-4); m.computeVertexNormals(); m.rotateX(Math.PI / 2 + .2); add(m, f, left ? -cx : cx, .66, py, { hideInCut: false }); };
  for (let i = 0; i < 3; i++) { const cx = x1 + .76 + .73 * i; cushion(cx, y2 - .27);
    lean(rb(cx - .32, y2 - .54, cx + .32, y2 - .41, .45, .69, .06, 3), .3, y2 - .475, .45); } // lumbar pillow
}

export const DESIGNS_BY_ID = { 634: alikante };
