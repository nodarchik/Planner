import * as THREE from 'three';
import { H } from '../scene.js';
import { planar, rand } from '../textures.js';
import { lamp } from '../lighting.js';
import { M, P } from '../materials.js';
import { B, C, S, add, beginG, endG, lathe, tube } from '../primitives.js';

export function curtain(axis, at, a, b, h1, h2, m) {
  const w = b - a, g = new THREE.PlaneGeometry(w, h2 - h1, Math.ceil(w * 120), 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, .035 * Math.sin(x * 2 * Math.PI / .11) + .012 * Math.sin(x * 37)); }
  g.computeVertexNormals();
  if (axis === 'y') g.rotateY(Math.PI / 2);
  const me = add(g, m, axis === 'x' ? (a + b) / 2 : at, (h1 + h2) / 2, axis === 'x' ? at : (a + b) / 2, { cast: false, hideInCut: true });
  axis === 'x' ? B(a - .05, at - .012, b + .05, at + .012, h2, h2 + .03, M.blackMetal, { cast: false }) : B(at - .012, a - .05, at + .012, b + .05, h2, h2 + .03, M.blackMetal, { cast: false });
  return me;
}
export function mushroomLamp(x, y, h) {
  lathe([[0, 0], [.07, 0], [.075, .008], [.02, .02], [.012, .3], [0, .3]], x, y, h, M.brass);
  lathe([[0, .38], [.06, .375], [.12, .35], [.155, .31], [.16, .285], [.0, .285]], x, y, h, M.opal);
  lamp(x, y, h + .26, 'tableLamp');
}
export function book(x, y, h, w, d, t, m, rot = 0) { add(new THREE.BoxGeometry(w, t, d), m, x, h + t / 2, y, { rotY: rot }); add(new THREE.BoxGeometry(w - .01, t - .006, d - .006), M.paper, x + .006, h + t / 2, y, { rotY: rot }); }
export function vase(x, y, h, s, m) { lathe([[0, 0], [.05 * s, 0], [.09 * s, .08 * s], [.1 * s, .16 * s], [.05 * s, .27 * s], [.035 * s, .32 * s], [.04 * s, .34 * s], [.03 * s, .34 * s], [0, .1 * s]], x, y, h, m); }
export function artAt(tex, a, h1, w, h, flip) { return P({ color: 0xffffff, roughness: .92, map: planar(tex, a, h1, w, h, flip) }); }

export function livingRug(cx, cy, rx, ry) { beginG('Living rug');
  const s = new THREE.Shape(), n = 96; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, rr = 1 + .05 * Math.sin(3 * t) + .03 * Math.cos(5 * t);
    const x = cx + rx * rr * Math.cos(t), y = cy + ry * rr * Math.sin(t); i ? s.lineTo(x, -y) : s.moveTo(x, -y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: .008, bevelEnabled: true, bevelThickness: .005, bevelSize: .008, bevelSegments: 3, curveSegments: 48 }); g.rotateX(-Math.PI / 2); g.translate(0, .005, 0); add(g, M.rug, 0, 0, 0, { cast: false });
  endG(); }
export function diningDecor(x, y) {
  beginG('Table decor'); vase(x, y, .75, 1.0, M.stoneware);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, r = .08 + rand() * .1; tube([[x, .98, y], [x + Math.cos(a) * r * .5, 1.2, y + Math.sin(a) * r * .5], [x + Math.cos(a) * r, 1.4 + rand() * .2, y + Math.sin(a) * r]], .004, M.bark, { seg: 16, rs: 5 }); }
  endG();
  beginG('Pendant lights');
  [[0, 0, 1.78, .16], [.2, .1, 1.98, .11], [-.18, .12, 2.06, .09]].forEach(([dx, dy, h, r]) => { S(x + dx, y + dy, h, r, M.opal, { cast: false }); C(x + dx, y + dy, .025, h + r - .01, h + r + .03, M.brass); C(x + dx, y + dy, .003, h + r + .03, H, M.blackMetal, { seg: 6 }); C(x + dx, y + dy, .045, H - .015, H, M.brass); });
  lamp(x, y, 1.55, 'pendant', 3); endG(); }
