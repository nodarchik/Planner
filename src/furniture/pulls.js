import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M } from '../materials.js';
import { CUT } from '../scene.js';
import { add } from '../primitives.js';

// Brass pulls: bar on two standoffs (Ø10, bar axis 30 mm off the front), knob (Ø32), edge pull (thin lip on the top or bottom edge).
// Local space: x along the pull, y up, z out of the front; origin on the front face at the pull centre (edge pulls: at the edge).
const PI2 = Math.PI / 2, cache = new Map();
const cyl = (r, len, seg) => new THREE.CylinderGeometry(r, r, len, seg);
export const BAR_LENGTHS = [.128, .16, .192, .224, .256, .32];
function base(kind, len, vertical) {
  const key = `${kind}|${len}|${vertical}`; let g = cache.get(key); if (g) return g;
  if (kind === 'bar') { const parts = [cyl(.005, len, 10).rotateZ(PI2).translate(0, 0, .03)];
    for (const sx of [-1, 1]) parts.push(cyl(.004, .028, 8).rotateX(PI2).translate(sx * (len / 2 - .016), 0, .014));
    g = mergeGeometries(parts, false); if (vertical) g.rotateZ(PI2);
  } else if (kind === 'knob') g = new THREE.LatheGeometry([[0, 0], [.006, 0], [.006, .012], [.015, .014], [.016, .022], [.012, .027], [0, .028]].map(p => new THREE.Vector2(...p)), 14).rotateX(PI2);
  else { const top = kind === 'edge-top', sy = top ? -1 : 1; // plate on the face, lip pointing out at the front edge
    g = mergeGeometries([new THREE.BoxGeometry(len, .014, .002).translate(0, sy * .007, .001), new THREE.BoxGeometry(len, .002, .012).translate(0, sy * .001, .006)], false); }
  cache.set(key, g); return g;
}
const reach = (p) => p.kind === 'bar' && p.vertical ? p.len / 2 : p.kind === 'edge-top' ? 0 : p.kind === 'edge-bottom' ? .014 : .02;

// list: { kind, a, h, len?, vertical? }, a = coordinate along the cabinet run; ctx: { axis, front, s } = front plane and outward sign.
// One merged mesh below the wall cut and one above it (hidden in Cut mode); their bounding boxes stop at the front plane so item sizes ignore pulls.
export function placePulls(list, { axis, front, s }) {
  const lo = [], hi = [], rot = axis === 'x' ? (s > 0 ? 0 : Math.PI) : (s > 0 ? PI2 : -PI2);
  for (const p of list) { const g = base(p.kind, p.len, p.vertical).clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot).setPosition(...(axis === 'x' ? [p.a, p.h, front] : [front, p.h, p.a])));
    (p.h + reach(p) > CUT ? hi : lo).push(g); }
  for (const [gs, cut] of [[lo, false], [hi, true]]) { if (!gs.length) continue;
    const g = mergeGeometries(gs, false), d = axis === 'x' ? 'z' : 'x'; g.computeBoundingBox(); g.boundingBox.min[d] = g.boundingBox.max[d] = front;
    add(g, M.brass, 0, 0, 0, { uv: false, cast: false, hideInCut: cut }); }
}
