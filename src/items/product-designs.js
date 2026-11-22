// Hand-modelled designs for single shop products, keyed by comforter.ge id; used by product() instead of the generic kind builder.
import { tinted } from '../tint.js';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RB, add } from '../primitives.js';

// Soft block (w x h x d, centred): rounded box with extra rings at the seams, puffed faces (o.b on axes o.bk) and shallow grooves {k: face axis, s: face sign, a: axis along, at, w, d, lo, hi: range on the third axis}; o.rx tilts it.
function soft(w, h, d, o = {}) {
  const b = o.b ?? 0, bk = o.bk || [0, 1, 2], hf = [w, h, d].map((e, k) => e / 2 - (bk.includes(k) ? b : 0)), r = Math.min(o.r ?? .05, ...hf), st = o.step ?? .05, gr = o.grooves || [];
  const axis = k => { const s = [];
    for (let j = 0; j <= 3; j++) s.push(hf[k] - r + r * j / 3, -(hf[k] - r + r * j / 3));
    for (let e = -hf[k] + r + st; e < hf[k] - r - st * .6; e += st) s.push(e);
    for (const q of gr) if (q.a === k) for (const m of [-1.6, -.8, 0, .8, 1.6]) if (Math.abs(q.at + m * q.w) < hf[k] - r) s.push(q.at + m * q.w);
    s.sort((x, y) => x - y); return s.filter((e, i) => !i || e - s[i - 1] > .004); };
  const L = [0, 1, 2].map(axis), g = new THREE.BoxGeometry(2 * hf[0], 2 * hf[1], 2 * hf[2], L[0].length - 1, L[1].length - 1, L[2].length - 1), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const p = [0, 1, 2].map(k => L[k][Math.round((q.array[i * 3 + k] + hf[k]) / (2 * hf[k]) * (L[k].length - 1))]), o2 = p.slice();
    const c = p.map((e, k) => Math.max(-hf[k] + r, Math.min(hf[k] - r, e))), dv = p.map((e, k) => e - c[k]), l = Math.hypot(...dv) || 1;
    for (let k = 0; k < 3; k++) p[k] = c[k] + dv[k] / l * r;
    if (o.top || o.droop) p[1] += Math.max(0, p[1] / hf[1]) ** 3 * ((o.top || 0) * (.5 + .5 * Math.cos(6 * Math.PI * p[0] / w)) - (o.droop || 0) * (p[0] / hf[0]) ** 4); // optional scalloped top, corner droop (negative raises)
    for (let k = 0; k < 3; k++) { if (Math.abs(Math.abs(o2[k]) - hf[k]) > 1e-5) continue;
      const s = Math.sign(o2[k]), [m, n] = [0, 1, 2].filter(e => e !== k); let dz = !bk.includes(k) ? 0 : b * Math.max(0, Math.cos(Math.PI / 2 * o2[m] / hf[m]) * Math.cos(Math.PI / 2 * o2[n] / hf[n])) ** .6;
      for (const G of gr) if (G.k === k && G.s === s) { const a = G.a, e = 3 - k - a, f = Math.min(1, (1 - Math.abs(o2[e]) / hf[e]) / .12), t = G.lo === undefined ? 1 : Math.max(0, Math.min(1, (o2[e] - G.lo) / .03, (G.hi - o2[e]) / .03));
        dz -= G.d * Math.exp(-(((o2[a] - G.at) / G.w) ** 2)) * f * t; }
      p[k] += s * dz; }
    q.setXYZ(i, ...p); }
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); if (o.rx) m.rotateX(o.rx); m.computeVertexNormals(); return m;
}

// Corner Sofa Alikante (634): tufted one-piece arms, crowned seats filling the body over a flush base, one-piece chaise, tall back cushions with two seams, soft lumbar pillows. Built chaise at +x; the shop photo (chaise on the sitter's left) is the default, "R" mirrors it.
function alikante(c) {
  const { x1, x2, y1, y2 } = c, mx = c.it.chaise !== 'R' ? -1 : 1, hex = c.it.color || '#e0c8b0', f = c.it.color ? c.fab : tinted('boucle', hex), dark = tinted('walnut', '#3a281e');
  const put = (geo, x, z, y) => add(geo, f, mx * x, z, y, { hideInCut: false });
  const rb = (a, y, b, ya, z1, z2, r, m = f) => { const [p, q] = mx < 0 ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg: 2 }); };
  const D = 1.18, yb = y2 - D, aw = .29, fz = .045, bz = .26, sz = .45, az = .68, xa = x1 + aw, xr = x1 + 2.63, xc = x1 + 1.89, ys = y2 - .24; // xr: inner edge of the chaise-side arm, xc: chaise start, ys: seat back
  for (const [x, y] of [[x1 + .12, yb + .14], [x1 + .12, y2 - .1], [xr + .2, y2 - .1], [xr + .2, yb + .14], [x2 - .1, y1 + .14], [xc + .1, y1 + .14], [xc + .1, yb + .14], [(x1 + xr) / 2, y2 - .1]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, dark);
  rb(xa - .02, yb + .02, xr + .02, y2, fz, bz, .02); rb(xc, y1 + .02, x2 - .02, yb + .02, fz, bz, .02); // bases
  const seat = (a, ya, b, yz) => put(soft(b - a - .006, sz - bz + .02, yz - ya - .006, { r: .05, b: .014, bk: [1], step: .07 }), (a + b) / 2, (bz + sz) / 2 - .01, (ya + yz) / 2);
  seat(xa, yb, x1 + 1.10, ys); seat(x1 + 1.10, yb, xc, ys); seat(xc, y1 + .003, x2, yb + .003); seat(xc, yb, xr, ys); // seats, chaise front, chaise rear
  for (const [a, b, out] of [[x1, xa, -1], [xr, x1 + 3.12, 1]]) { const o = out * mx, G = (k, a2, at, w = .016, d = .02) => ({ k, s: k ? -1 : o, a: a2, at, w, d }), h = az - fz + .01, w = b - a; // arm: one block, 3 x 2 tufts on the outer face, top panel seam
    put(soft(w, h, D - .02, { r: .06, b: .012, step: .045, grooves: [G(0, 2, -D / 6 + .01), G(0, 2, D / 6 + .01), G(0, 1, 0), G(0, 1, h / 2 - .09, .01, .012), G(2, 1, h / 2 - .09, .01, .012)] }), (a + b) / 2, fz - .01 + h / 2, yb + .02 + (D - .02) / 2); }
  rb(xa, y2 - .2, xr, y2, bz, sz - .01, .02); // seat-level back block behind the cushions
  const tl = .12, bh = .455, py = .4 * bh - bh / 2, tk = .26; // back cushion: lean, pinch line at 40 %
  for (let i = 0; i < 3; i++) { const cx = x1 + .765 + .735 * i, G = at => ({ k: 2, s: -1, a: 0, at, w: .008, d: .012, lo: py, hi: bh / 2 });
    put(soft(.735, bh, tk, { r: .08, b: .075, bk: [2], step: .06, rx: tl, droop: -.014, grooves: [G(-.122), G(.122), { k: 2, s: -1, a: 1, at: py, w: .012, d: .012 }] }), cx, sz + bh / 2 * Math.cos(tl), y2 - .23 + bh / 2 * Math.sin(tl));
    put(soft(.66, .22, .16, { r: .015, b: .065, bk: [2], step: .05, rx: .35, droop: -.008 }), cx, sz + .11, y2 - .4); } // lumbar pillow
}

export const DESIGNS_BY_ID = { 634: alikante };
