import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3 } from '../scene.js';
import { rand } from '../textures.js';
import { M } from '../materials.js';
import { C, RB, add, lathe, tube } from '../primitives.js';

function leafGeo(L, W, fold = .3, bend = .25) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(W, L * .42, 0, L); s.quadraticCurveTo(-W, L * .42, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.abs(x) * fold - bend * L * Math.pow(y / L, 2)); }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
function placeLeaves(base, n, place) {
  const geos = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new V3(), pos = new V3(), dir = new V3();
  for (let i = 0; i < n; i++) { const r = place(i, pos, dir); if (r === false) continue; const s = r || 1;
    e.set(-Math.PI / 2 + .25 + rand() * .6, Math.atan2(-dir.x, -dir.z) + (rand() - .5) * .6, (rand() - .5) * .8); q.setFromEuler(e); sc.set(s, s, s);
    m4.compose(pos, q, sc); geos.push(base.clone().applyMatrix4(m4)); }
  return mergeGeometries(geos, false);
}
export function pot(x, y, rTop, rBot, h, m) {
  lathe([[0, 0], [rBot, 0], [rBot + .005, .01], [rTop, h - .01], [rTop - .012, h], [rTop - .02, h - .03], [0, h - .03]], x, y, 0, m);
  C(x, y, rTop - .02, h - .06, h - .035, M.soil, { cast: false });
}
export function fig(x, y, s = 1) {
  pot(x, y, .2, .16, .46, M.stoneware);
  const top = 1.85 * s; tube([[x, .4, y], [x + .03, 1.0 * s, y - .02], [x - .02, top, y + .03]], .022, M.bark, { hideInCut: false });
  const L = leafGeo(.27, .1, .25, .2);
  add(placeLeaves(L, 62, (i, p, d) => { const t = rand(), hh = (.95 + .9 * t) * s, a = rand() * Math.PI * 2, r = .05 + rand() * .28 * (1 - t * .4);
    p.set(x + Math.cos(a) * r * .4, hh, y + Math.sin(a) * r * .4); d.set(Math.cos(a), 0, Math.sin(a)); return .8 + rand() * .45; }), M.leaf, 0, 0, 0, { uv: false });
}
export function olive(x, y, s = 1) {
  RB(x - .3, y - .3, x + .3, y + .3, -.03, .62, .03, M.concrete); C(x, y, .26, .56, .6, M.pebble, { cast: false, seg: 24 });
  const top = 1.45 * s; tube([[x, .5, y], [x + .05, .9 * s, y + .02], [x - .03, 1.2 * s, y - .04], [x + .02, top, y]], .035, M.bark);
  const ctr = new V3(x, top + .25, y);
  [[.3, .1], [-.25, .2], [.05, -.3], [-.1, .28]].forEach(([dx, dy]) => tube([[x, top - .1, y], [x + dx * .5, top + .1, y + dy * .5], [x + dx, top + .25, y + dy]], .014, M.bark));
  const L = leafGeo(.075, .012, .1, .05);
  add(placeLeaves(L, 1300, (i, p, d) => { const th = rand() * Math.PI * 2, ph = Math.acos(rand() * 2 - 1), r = .25 + .3 * Math.cbrt(rand());
    d.set(Math.sin(ph) * Math.cos(th), Math.cos(ph) * .7, Math.sin(ph) * Math.sin(th)); p.copy(ctr).addScaledVector(d, r); p.y = Math.max(p.y, top - .1); return 1; }), M.leafOlive, 0, 0, 0, { uv: false });
}
export function snake(x, y, s = 1) {
  pot(x, y, .16, .13, .42, M.stonewareDark);
  const geos = [];
  for (let i = 0; i < 11; i++) { const L = (.55 + rand() * .45) * s, g = new THREE.PlaneGeometry(.075, L, 1, 10), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const yy = p.getY(k) + L / 2, t = yy / L; p.setX(k, p.getX(k) * (1 - Math.pow(t, 3) * .9)); p.setZ(k, .06 * t * t + Math.abs(p.getX(k)) * .4); p.setY(k, yy); }
    g.rotateY(rand() * Math.PI * 2); g.rotateX((rand() - .5) * .25); g.translate(x + (rand() - .5) * .14, .38, y + (rand() - .5) * .14); g.deleteAttribute('uv'); geos.push(g); }
  add(mergeGeometries(geos), M.leafSnake, 0, 0, 0, { uv: false });
}
