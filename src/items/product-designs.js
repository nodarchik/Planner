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
    if (o.top) p[1] += Math.max(0, p[1] / hf[1]) ** 3 * (o.top * (.5 + .5 * Math.cos(6 * Math.PI * p[0] / w)) - o.droop * (p[0] / hf[0]) ** 4); // scalloped top, drooping corners
    for (let k = 0; k < 3; k++) { if (Math.abs(Math.abs(o2[k]) - hf[k]) > 1e-5) continue;
      const s = Math.sign(o2[k]), [m, n] = [0, 1, 2].filter(e => e !== k); let dz = !bk.includes(k) ? 0 : b * Math.max(0, Math.cos(Math.PI / 2 * o2[m] / hf[m]) * Math.cos(Math.PI / 2 * o2[n] / hf[n])) ** .6;
      for (const G of gr) if (G.k === k && G.s === s) { const a = G.a, e = 3 - k - a, f = Math.min(1, (1 - Math.abs(o2[e]) / hf[e]) / .12), t = G.lo === undefined ? 1 : Math.max(0, Math.min(1, (o2[e] - G.lo) / .03, (G.hi - o2[e]) / .03));
        dz -= G.d * Math.exp(-(((o2[a] - G.at) / G.w) ** 2)) * f * t; }
      p[k] += s * dz; }
    q.setXYZ(i, ...p); }
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); if (o.rx) m.rotateX(o.rx); m.computeVertexNormals(); return m;
}

// Corner Sofa Alikante (634): one-piece arms with tufted outer faces, thick crowned seats on a recessed base, one-piece chaise, tall back cushions in 3 lobes, soft lumbar pillows. Built chaise at +x; the shop photo (chaise on the sitter's left) is the default, "R" mirrors it.
function alikante(c) {
  const { x1, x2, y1, y2 } = c, mx = c.it.chaise !== 'R' ? -1 : 1, hex = c.it.color || '#e4c8ab', f = c.it.color ? c.fab : tinted('boucle', hex), dark = tinted('walnut', '#3a281e');
  const put = (geo, x, z, y) => add(geo, f, mx * x, z, y, { hideInCut: false });
  const rb = (a, y, b, ya, z1, z2, r, m = f) => { const [p, q] = mx < 0 ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg: 2 }); };
  const D = 1.18, yb = y2 - D, aw = .3, ch = 1.31, fz = .045, bz = .25, sz = .45, az = .66, sw = (x2 - x1 - aw - ch) / 2, xs = [x1 + aw, x1 + aw + sw, x2 - ch], sd = D - .36;
  for (const [x, y] of [[x1 + .1, yb + .12], [x1 + .1, y2 - .08], [x2 - .1, y2 - .08], [x2 - .1, y1 + .14], [x2 - ch + .1, y1 + .14], [x2 - ch + .1, yb + .12], [(x1 + x2 - ch) / 2, y2 - .08]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, dark);
  rb(x1 + aw - .02, yb + .06, x2 - aw + .02, y2, fz, bz, .03); rb(x2 - ch, y1 + .06, x2 - .02, yb + .06, fz, bz, .03); // recessed bases
  const seat = (a, ya, bb, yz) => put(soft(bb - a - .006, sz - bz + .01, yz - ya - .006, { r: .07, b: .016, bk: [1], step: .06 }), (a + bb) / 2, (bz + sz) / 2 - .005, (ya + yz) / 2);
  seat(xs[0], yb, xs[1], y2 - .36); seat(xs[1], yb, xs[2], y2 - .36); seat(xs[2], y1, x2, yb); seat(xs[2], yb, x2 - aw, y2 - .36); // seats, chaise front, chaise rear
  for (const [a, out] of [[x1, -1], [x2 - aw, 1]]) { const o = out * mx, G = (a2, at) => ({ k: 0, s: o, a: a2, at, w: .016, d: .02 }), h = az - .035; // arm: one block, outer face 3 x 2 tufts
    put(soft(aw, h, D - .004, { r: .06, b: .012, step: .04, grooves: [G(2, -D / 6), G(2, D / 6), G(1, 0)] }), a + aw / 2, .035 + h / 2, yb + D / 2); }
  rb(x1 + .03, y2 - .2, x2 - .03, y2, bz, .55, .05); // back rail
  const tl = .15, bh = .425, py = .38 * bh - bh / 2; // back cushion: lean, pinch line height
  for (let i = 0; i < 3; i++) { const cx = x1 + .76 + .73 * i, G = at => ({ k: 2, s: -1, a: 0, at, w: .024, d: .022, lo: py, hi: bh / 2 });
    put(soft(.74, bh, .23, { r: .06, b: .07, bk: [2], step: .05, rx: tl, top: .014, droop: .03, grooves: [G(-.123), G(.123), { k: 2, s: -1, a: 1, at: py, w: .035, d: .02 }] }), cx, sz + .01 + bh / 2 * Math.cos(tl), y2 - .3 + bh / 2 * Math.sin(tl));
    put(soft(.62, .22, .16, { r: .02, b: .06, bk: [2], step: .04, rx: -.26, top: .008, droop: .02 }), cx, sz + .12, y2 - .5); } // lumbar pillow
}

export const DESIGNS_BY_ID = { 634: alikante };
