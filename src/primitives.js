import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { V2, V3, clampables, movables, state, world } from './scene.js';
import { vnoise } from './textures.js';
import { M } from './materials.js';

export function beginG(name) { const g = new THREE.Group(); g.name = name; world.add(g); state.CUR = g; }
export function endG() { const g = state.CUR; state.CUR = world; const bb = new THREE.Box3();
  g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) bb.expandByObject(o); });
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  g.children.forEach(c => { c.position.x -= cx; c.position.z -= cz; }); g.position.set(cx, 0, cz);
  g.userData = { movable: true, home: { x: cx, z: cz, r: 0 }, size: bb.getSize(new V3()), minY0: bb.min.y, custom: {} }; movables.push(g);
  if (!MKEY) MKEY = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  g.traverse(o => { if (o.isMesh) o.userData.mkey = MKEY.get(o.material); }); }
let MKEY = null;
function worldUV(g, ox = 0, oy = 0, oz = 0) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[2 * i] = u; uv[2 * i + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
export function add(geo, m, x = 0, h = 0, y = 0, o = {}) {
  if (o.uv !== false) worldUV(geo, x, h, y);
  const me = new THREE.Mesh(geo, m); me.position.set(x, h, y); if (o.rotY) me.rotation.y = o.rotY;
  me.castShadow = o.cast !== false; me.receiveShadow = true; me.userData.hideInCut = !!o.hideInCut; me.userData.clampMesh = !!o.clampMesh;
  (o.parent || state.CUR).add(me); return me;
}
export function B(x1, y1, x2, y2, h1, h2, m, o = {}) {
  const ax = Math.min(x1, x2), bx = Math.max(x1, x2), ay = Math.min(y1, y2), by = Math.max(y1, y2);
  const me = add(new THREE.BoxGeometry(bx - ax, h2 - h1, by - ay), m, (ax + bx) / 2, (h1 + h2) / 2, (ay + by) / 2, o);
  if (o.clamp !== false) { me.userData.clamp = true; clampables.push({ me, h1, h2 }); } return me;
}
export function RB(x1, y1, x2, y2, h1, h2, r, m, o = {}) {
  const w = x2 - x1, d = y2 - y1, h = h2 - h1; r = Math.max(.001, Math.min(r, w / 2 - .001, d / 2 - .001, h / 2 - .001));
  return add(new RoundedBoxGeometry(w, h, d, o.seg || 4, r), m, (x1 + x2) / 2, (h1 + h2) / 2, (y1 + y2) / 2, o);
}
export function C(x, y, r, h1, h2, m, o = {}) { return add(new THREE.CylinderGeometry(o.rt ?? r, r, h2 - h1, o.seg || 48, 1, !!o.open), m, x, (h1 + h2) / 2, y, o); }
export function S(x, y, h, r, m, o = {}) { return add(new THREE.SphereGeometry(r, 40, 24), m, x, h, y, o); }
export function lathe(pts, x, y, h, m, o = {}) {
  const g = new THREE.LatheGeometry(pts.map(p => new V2(p[0], p[1])), o.seg || 64);
  if (o.sx || o.sz) g.scale(o.sx || 1, 1, o.sz || 1); if (o.rotY) g.rotateY(o.rotY);
  return add(g, m, x, h, y, Object.assign({}, o, { rotY: 0 }));
}
export function tube(pts, r, m, o = {}) { const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2])));
  return add(new THREE.TubeGeometry(c, o.seg || 64, r, o.rs || 12, false), m, 0, 0, 0, o); }
// soft, puffy cushion: w along x, t thickness (vertical), d along z
export function pillowGeo(w, t, d, puff = .9) {
  let g = new RoundedBoxGeometry(w, t, d, 7, Math.min(t * .48, w * .2, d * .2)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = x / (w / 2), nz = z / (d / 2);
    const e = Math.min(1, Math.hypot(nx * .8, nz * .8) * .6 + Math.max(Math.abs(nx), Math.abs(nz)) * .45), f = Math.max(.12, 1 - puff * Math.pow(e, 2.2)); p.setY(i, y * f);
    p.setX(i, x * (1 - .05 * nz * nz)); p.setZ(i, z * (1 - .05 * nx * nx)); }
  g.computeVertexNormals(); return g;
}
export function pillow(x, y, h, w, t, d, m, rx = 0, ry = 0, rz = 0) { const g = pillowGeo(w, t, d); g.rotateZ(rz); g.rotateX(rx); g.rotateY(ry); return add(g, m, x, h, y, { hideInCut: false }); }
// annular sector in plan (angles in plan radians; 0 = +x, PI/2 = +y)
function sectorGeo(cx, cy, r1, r2, a1, a2, h, b) {
  const s = new THREE.Shape(), n = 48;
  for (let i = 0; i <= n; i++) { const a = a1 + (a2 - a1) * i / n, x = cx + r2 * Math.cos(a), y = cy + r2 * Math.sin(a); i ? s.lineTo(x, -y) : s.moveTo(x, -y); }
  for (let i = n; i >= 0; i--) { const a = a1 + (a2 - a1) * i / n; s.lineTo(cx + r1 * Math.cos(a), -(cy + r1 * Math.sin(a))); }
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * .85, bevelSegments: 5, curveSegments: 32 });
  g.rotateX(-Math.PI / 2); return g;
}
export function sector(cx, cy, r1, r2, a1, a2, h1, h2, m, b = .04) { const g = sectorGeo(cx, cy, r1, r2, a1, a2, h2 - h1, b); g.translate(0, h1 + b, 0); return add(g, m, 0, 0, 0, {}); }
// draped fabric over a rectangle (duvet / throw). foot = +1 (towards +y) or -1
export function drape(x1, y1, x2, y2, top, hangSide, hangFoot, foot, m, o = {}) {
  const W = x2 - x1, D = y2 - y1, NS = 90, NT = 70, rr = .035;
  const g = new THREE.PlaneGeometry(1, 1, NS, NT), p = g.attributes.position;
  const wr = vnoise(12, 12);
  for (let i = 0; i < p.count; i++) {
    const s = (p.getX(i) + .5) * (W + 2 * hangSide) - hangSide, t = (p.getY(i) + .5) * (D + hangFoot);
    const cs = Math.min(Math.max(s, 0), W), ct = Math.min(Math.max(t, 0), D), ex = s - cs, ey = t - ct, e = Math.hypot(ex, ey);
    let px = cs, py = ct, hh = top;
    if (e > 1e-6) { const dx = ex / e, dy = ey / e; let out, down;
      if (e <= rr * Math.PI / 2) { const a = e / rr; out = rr * Math.sin(a); down = rr * (1 - Math.cos(a)); } else { out = rr; down = rr + (e - rr * Math.PI / 2); }
      out += .012 * Math.sin((cs + ct) * 22) * Math.min(1, down / .2) + Math.max(0, down - .05) * .05;
      px = cs + dx * out; py = ct + dy * out; hh = top - down;
    } else { hh = top + .018 * (wr((s / W) % 1, (t / D) % 1) - .5) + .008 * Math.sin(s * 6 + t * 3) * Math.sin(t * 5); }
    p.setXYZ(i, x1 + px, hh, foot > 0 ? y1 + py : y2 - py);
  }
  g.computeVertexNormals(); return add(g, m, 0, 0, 0, Object.assign({ hideInCut: false }, o));
}
export function merged(geos, m, o = {}) { const g = mergeGeometries(geos, false); if (o.uv !== false) worldUV(g); return add(g, m, 0, 0, 0, Object.assign({}, o, { uv: false })); }
export function endGRaw() { const g = state.CUR; state.CUR = world; const bb = new THREE.Box3(); g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) bb.expandByObject(o); });
  g.userData = { movable: true, home: { x: 0, z: 0, r: 0 }, size: bb.getSize(new V3()), minY0: bb.min.y, custom: {} };
  if (!MKEY) MKEY = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  g.traverse(o => { if (o.isMesh) { o.userData.mkey = MKEY.get(o.material); const b2 = new THREE.Box3().setFromObject(o); o.userData.minY = b2.min.y; o.userData.maxY = b2.max.y; } });
  g.traverse(o => { if (o.isLight) o.visible = state.night; });
  return g; }
