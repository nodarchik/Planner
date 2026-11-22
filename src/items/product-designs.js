// Hand-modelled designs for single shop products, keyed by comforter.ge id; used by product() instead of the generic kind builder.
import { tinted } from '../tint.js';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RB, add } from '../primitives.js';

// Soft block (w x h x d, centred): rounded box, extra rings at o.cuts[axis] = [[at, width]], faces puffed by o.bow per axis, o.disp(k, s, a, b, hf) = extra outward push of face k (sign s) at a, b on the other axes; o.pw = bulge profile exponent, o.ear lifts the top corners, o.rx tilts it.
function soft(w, h, d, o = {}) {
  const bow = o.bow || [0, 0, 0], hf = [w, h, d].map((e, k) => e / 2 - bow[k]), r = Math.min(o.r ?? .05, ...hf), st = o.step ?? .05, cu = o.cuts || [[], [], []];
  const axis = k => { const s = [];
    for (let j = 0; j <= 3; j++) s.push(hf[k] - r + r * j / 3, -(hf[k] - r + r * j / 3));
    for (let e = -hf[k] + r + st; e < hf[k] - r - st * .6; e += st) s.push(e);
    for (const [c, v] of cu[k]) for (const m of [-2, -1, -.5, 0, .5, 1, 2]) if (Math.abs(c + m * v) < hf[k] - r) s.push(c + m * v);
    s.sort((x, y) => x - y); return s.filter((e, i) => !i || e - s[i - 1] > .004); };
  const L = [0, 1, 2].map(axis), g = new THREE.BoxGeometry(2 * hf[0], 2 * hf[1], 2 * hf[2], L[0].length - 1, L[1].length - 1, L[2].length - 1), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const p = [0, 1, 2].map(k => L[k][Math.round((q.array[i * 3 + k] + hf[k]) / (2 * hf[k]) * (L[k].length - 1))]), o2 = p.slice();
    const c = p.map((e, k) => Math.max(-hf[k] + r, Math.min(hf[k] - r, e))), dv = p.map((e, k) => e - c[k]), l = Math.hypot(...dv) || 1;
    for (let k = 0; k < 3; k++) p[k] = c[k] + dv[k] / l * r;
    if (o.ear) p[1] += Math.max(0, p[1] / hf[1]) ** 2 * Math.abs(p[0] / hf[0]) ** 6 * o.ear;
    for (let k = 0; k < 3; k++) { if (Math.abs(Math.abs(o2[k]) - hf[k]) > 1e-5) continue;
      const s = Math.sign(o2[k]), [m, n] = [0, 1, 2].filter(e => e !== k);
      p[k] += s * (bow[k] * Math.max(0, Math.cos(Math.PI / 2 * o2[m] / hf[m]) * Math.cos(Math.PI / 2 * o2[n] / hf[n])) ** (o.pw ?? .6) + (o.disp ? o.disp(k, s, o2[m], o2[n], hf) : 0)); }
    q.setXYZ(i, ...p); }
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); if (o.rx) m.rotateX(o.rx); m.computeVertexNormals(); return m;
}
const gauss = (x, at, w) => Math.exp(-(((x - at) / w) ** 2));
const rnd = (i, j) => { const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };

// Corner Sofa Alikante (634): arms as single tufted blocks, box seat cushions, pillowy back cushions with two creases, soft lumbar pillows. Built chaise at +x; the shop photo (chaise on the sitter's left) is the default, "R" mirrors it.
function alikante(c) {
  const { x1, x2, y1, y2 } = c, mx = c.it.chaise !== 'R' ? -1 : 1, hex = c.it.color || '#d6c1ac', f = c.it.color ? c.fab : tinted('boucle', hex), dark = tinted('walnut', '#3a281e');
  if (f.sheen) f.sheen = 0;
  const put = (geo, x, z, y) => add(geo, f, mx * x, z, y, { hideInCut: false });
  const rb = (a, y, b, ya, z1, z2, r, m = f) => { const [p, q] = mx < 0 ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg: 2 }); };
  const D = 1.18, yb = y2 - D, aw = .29, fz = .045, bz = .26, sz = .45, az = .68, xa = x1 + aw, xe = x2 - .02, xr = xe - aw, xc = x1 + 1.89, ys = y2 - .12; // xr: inner edge of the chaise-side arm, xc: chaise start, ys: seat back
  for (const [x, y] of [[x1 + .15, yb + .14], [x1 + .15, y2 - .1], [x2 - .16, y2 - .1], [x2 - .16, yb + .14], [x2 - .1, y1 + .14], [xc + .1, y1 + .14], [xc + .1, yb + .14], [(x1 + xr) / 2, y2 - .1]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, dark);
  rb(xa - .02, yb + .02, xr + .02, y2, fz, bz, .02); rb(xc, y1 + .02, xe, yb + .02, fz, bz, .02); // bases
  const sd = (k, s, a, b, hf) => { const hz = hf[2], hy = hf[1]; // seat cushion: welt lines, slight sink at the back
    if (k === 2 && s < 0) return -.006 * (gauss(b, hy - .03, .006) + gauss(b, -hy + .03, .006));
    if (k === 1 && s > 0) return -.006 * gauss(b, -hz + .03, .006) - .012 * gauss(b, hz - .02, .1) * (1 - Math.abs(a / hf[0]) ** 4);
    return 0; };
  const seat = (a, ya, b, yz, pf = .025) => { const w = b - a - .006, th = sz - bz + .02, dz = yz - ya + pf; // front sits pf proud of the base
    return put(soft(w, th, dz, { r: .05, b: 0, bow: [.008, .04, .014], step: .06, cuts: [[], [[th / 2 - .05, .008], [-th / 2 + .05, .008]], [[-dz / 2 + .038, .008]]], disp: sd }), (a + b) / 2, (bz + sz) / 2 - .01, (ya - pf + yz) / 2); };
  seat(xa, yb, x1 + 1.10, ys); seat(x1 + 1.10, yb, xc, ys); seat(xc, y1 - .02, xe, yb + .003, 0); seat(xc, yb, xr, ys, 0); // seats, chaise front, chaise rear
  for (const [a, b, out] of [[x1, xa, -1], [xr, xe, 1]]) { const o = out * mx, h = az - fz + .01, dd = (D - .02) / 6, yc = .41 - (fz - .01 + h / 2), tw = .05; // arm: one block, 3 x 2 tufts on the outer face
    const ad = (k, s, u, v, hf) => { if (k === 0 && s === o) { const e = Math.min(1, (1 - Math.abs(u) / hf[1]) / .18, (1 - Math.abs(v) / hf[2]) / .12);
        return -e * e * (.04 * (gauss(v, -dd, tw) + gauss(v, dd, tw) + gauss(u, yc, tw)) ); }
      return 0; };
    put(soft(b - a, h, D - .02, { r: .04, step: .06, bow: [.03, .012, .014], cuts: [[], [[yc, tw]], [[-dd, tw], [dd, tw]]], disp: ad }), (a + b) / 2, fz - .01 + h / 2, yb + .02 + (D - .02) / 2); }
  rb(xa, y2 - .2, xr, y2, bz, sz - .05, .02); // seat-level back block behind the cushions
  const tl = .12, bh = .58, py = 0, tk = .25; // back cushion: lean, pinch line at 40 %
  for (let i = 0; i < 3; i++) { const cx = x1 + .765 + .735 * i + (rnd(i, 1) - .5) * .02, e = (rnd(i, 2) - .5) * .02, w = .735 + (rnd(i, 3) - .5) * .02, vx = .122;
    const bd = (k, s, u, v, hf) => { if (k !== 2 || s > 0) return 0; const y = v, t = Math.max(0, Math.min(1, (y - py) / .03)); // creases from the top down to the pinch line
      return -(.014 * t * (gauss(u, -vx, .014) + gauss(u, vx, .014)) + .008 * gauss(y, py, .016) * (1 - Math.abs(u / hf[0]) ** 6)) - .01 * (gauss(u, vx, .03) * gauss(y, py, .03) + gauss(u, -vx, .03) * gauss(y, py, .03));  };
    put(soft(w, bh, tk, { r: .075, step: .06, bow: [.016, .03, .085], pw: .85, rx: tl + e, ear: .035, cuts: [[[-vx, .011], [vx, .011]], [[py, .014]], []], disp: bd }), cx, sz + bh / 2 * Math.cos(tl) - .126, y2 - .22 + bh / 2 * Math.sin(tl));
    const g = soft(.66, .24, .15, { r: .025, step: .04, bow: [0, .035, .055], pw: .6, rx: .25, ear: .03 }); g.rotateY((rnd(i, 4) - .5) * .07); put(g, cx, sz + .075, y2 - .39); } // lumbar pillow
}

export const DESIGNS_BY_ID = { 634: alikante };
