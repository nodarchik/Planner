// Hand-modelled designs for single shop products, keyed by comforter.ge id; used by product() instead of the generic kind builder.
import { tinted, HEX } from '../tint.js';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RB, add } from '../primitives.js';

// Soft block (w x h x d, centred): rounded box whose edges reach the nominal size; faces crown outward by o.bow per axis, o.pw = crown profile exponent, o.cuts[axis] = [[at, width]] extra rings, o.disp(k, s, a, b, hf) = extra push of face k (sign s), o.ear lifts the top corners, o.rx tilts it.
function soft(w, h, d, o = {}) {
  const bow = o.bow || [0, 0, 0], hf = [w, h, d].map(e => e / 2), r = Math.min(o.r ?? .04, ...hf), st = o.step ?? .05, cu = o.cuts || [[], [], []];
  const axis = k => { const s = [];
    for (let j = 0; j <= 3; j++) s.push(hf[k] - r + r * j / 3, -(hf[k] - r + r * j / 3));
    for (let e = -hf[k] + r + st; e < hf[k] - r - st * .6; e += st) s.push(e);
    for (const [c, v] of cu[k]) for (const m of [-2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2]) if (Math.abs(c + m * v) < hf[k] - r) s.push(c + m * v);
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

// Corner Sofa Alikante (634), built at the fixed 3.20 x 2.24 footprint (fit() absorbs small size changes): arms as single tufted blocks, box seat cushions on a recessed base, pillowy back cushions with two creases, soft lumbar pillows. Built chaise at +x; the shop photo (chaise on the sitter's left) is the default, "R" mirrors it.
function alikante(c) {
  const { x1, x2, y1, y2 } = c, mx = c.it.chaise !== 'R' ? -1 : 1, hex = c.it.color || '#d8c4b0', f = tinted('boucleMatte', HEX.test(hex) ? hex : '#d8c4b0'), dark = tinted('walnut', '#3a281e');
  const put = (geo, x, z, y) => add(geo, f, mx * x, z, y, { hideInCut: false });
  const rb = (a, y, b, ya, z1, z2, r, m = f) => { const [p, q] = mx < 0 ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg: 2 }); };
  const D = 1.1, yb = y2 - D, fz = .045, bz = .26, sz = .45, az = .68, xa = x1 + .29, xr = x1 + 2.66, xar = x2 - .02, xc = x1 + 1.89, ys = y2 - .1, pf = .025; // xr: inner edge of the chaise-side arm, xc: chaise start, ys: seat back, pf: cushion front proud of the base
  for (const [x, y] of [[x1 + .15, yb + .14], [x1 + .15, y2 - .1], [xar - .15, y2 - .1], [xar - .15, yb + .14], [x2 - .1, y1 + .14], [xc + .1, y1 + .14], [xc + .1, yb - .1], [(x1 + xr) / 2, y2 - .1]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, dark);
  rb(xa, yb, xr, y2, fz, bz, .02); rb(xc, y1 + pf, x2 - pf, yb, fz, bz, .02); // bases, recessed behind the cushion fronts
  const sd = (k, s, a, b, hf) => { // seat cushion: welt lines, slight sink at the back
    if (k === 2 && s < 0) return -.005 * (gauss(b, hf[1] - .035, .006) + gauss(b, -hf[1] + .035, .006));
    if (k === 1 && s > 0) return -.005 * gauss(b, -hf[2] + .035, .006) - .01 * gauss(b, hf[2] - .02, .1) * (1 - Math.abs(a / hf[0]) ** 4);
    return 0; };
  const seat = (a, ya, b, yz, p0 = pf) => { const w = b - a - .004, th = sz - .01 - bz, dz = yz - ya + p0;
    return put(soft(w, th, dz, { r: .04, bow: [0, .03, .012], step: .09, cuts: [[], [[th / 2 - .035, .008], [-th / 2 + .035, .008]], [[-dz / 2 + .035, .008]]], disp: sd }), (a + b) / 2, bz + th / 2, (ya - p0 + yz) / 2); };
  seat(xa, yb, x1 + 1.10, ys); seat(x1 + 1.10, yb, xc, ys); seat(xc, y1, x2, yb + .004, 0); seat(xc, yb, xr, ys, 0); // seats, chaise cushion, seat behind the chaise
  for (const [a, b, out] of [[x1, xa, -1], [xr, xar, 1]]) { const o = out * mx, h = az - fz, dd = D / 6, yc = .02, tw = .05; // arm: one block, 3 x 2 tufts on the outer face
    const ad = (k, s, u, v, hf) => { if (k === 0 && s === o) { const e = Math.min(1, (1 - Math.abs(u) / hf[1]) / .18, (1 - Math.abs(v) / hf[2]) / .12);
        return -e * e * .04 * (1 - (1 - gauss(v, -dd, tw)) * (1 - gauss(v, dd, tw)) * (1 - gauss(u, yc, tw))); }
      return 0; };
    put(soft(b - a, h, D, { r: .04, step: .06, bow: [.02, .01, .01], cuts: [[], [[yc, tw]], [[-dd, tw], [dd, tw]]], disp: ad }), (a + b) / 2, fz + h / 2, yb + D / 2); }
  rb(xa, y2 - .2, xr, y2, bz, sz - .05, .02); // block behind the cushions
  const tl = .1, bh = .46, tk = .07, vx = .125; // back cushion: lean, creases at thirds, horizontal pinch 40 % up
  for (let i = 0; i < 3; i++) { const w = i === 1 ? .72 : .75, cx = x1 + [.765, 1.5, 2.235][i] + (rnd(i, 1) - .5) * .01, e = (rnd(i, 2) - .5) * .03, py = -bh / 2 + .4 * bh;
    const bd = (k, s, u, v) => { if (k !== 2 || s > 0) return 0; const t = Math.max(0, Math.min(1, (v - py) / .03));
      return -(.012 * t * (gauss(u, -vx, .014) + gauss(u, vx, .014)) + .008 * gauss(v, py, .016) * (1 - Math.abs(u / (w / 2)) ** 6)) - .008 * (gauss(u, vx, .03) + gauss(u, -vx, .03)) * gauss(v, py, .03); };
    put(soft(w, bh, tk, { r: .035, step: .08, bow: [0, 0, .075], pw: .7, rx: tl + e, ear: .03, cuts: [[[-vx, .014], [vx, .014]], [[py, .016]], []], disp: bd }), cx, sz - .02 + bh / 2 * Math.cos(tl), y2 - .2 + bh / 2 * Math.sin(tl));
    const g = soft(.66, .2, .06, { r: .025, step: .07, bow: [0, 0, .05], pw: .7, rx: .2, ear: .03 }); g.rotateY((rnd(i, 4) - .5) * .06); put(g, cx, sz + .095, y2 - .37); } // lumbar pillow
}

export const DESIGNS_BY_ID = { 634: alikante };
