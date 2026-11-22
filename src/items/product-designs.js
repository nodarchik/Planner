// Hand-modelled designs for single shop products, keyed by comforter.ge id; used by product() instead of the generic kind builder.
import { tinted } from '../tint.js';
import { RB } from '../primitives.js';

// Corner Sofa Alikante (634): deep 2-seat body, tufted wide arms, 3 quilted back cushions, one-piece chaise, short dark feet. Built chaise at +x, mirrored for chaise "L".
function alikante(c) {
  const { x1, x2, y1, y2 } = c, left = c.it.chaise === 'L', hex = c.it.color || '#d9c8b0', f = c.it.color ? c.fab : tinted('boucle', hex), dark = tinted('walnut', '#3a281e');
  const seam = tinted('boucle', '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * .82).toString(16).padStart(2, '0')).join(''));
  const rb = (a, y, b, ya, z1, z2, r, seg = 2, m = f) => { const [p, q] = left ? [-b, -a] : [a, b]; return RB(p, y, q, ya, z1, z2, r, m, { seg }); };
  const D = 1.05, yb = y2 - D, armW = .27, armR = .24, ch = 1.3, fz = .06, bz = .27, sz = .46, az = .68, g = .004;
  const sw = (x2 - x1 - armW - ch) / 2, xs = [x1 + armW, x1 + armW + sw, x1 + armW + 2 * sw, x2 - ch, x2 - armR];
  for (const [x, y] of [[x1 + .09, yb + .08], [x1 + .09, y2 - .08], [x2 - .09, y2 - .08], [x2 - .09, y1 + .08], [x2 - ch + .09, y1 + .08], [x2 - ch + .09, yb + .08], [(x1 + x2 - ch) / 2, y2 - .08]]) rb(x - .04, y - .04, x + .04, y + .04, 0, fz + .01, .02, 1).material = dark;
  rb(x1 + armW - .02, yb, x2 - armR + .02, y2, fz, bz, .035); rb(x2 - ch, y1, x2, yb, fz, bz, .035); // seat bases
  for (const [a, b] of [[xs[0], xs[1]], [xs[1], xs[2]]]) rb(a + g, yb - .02, b - g, y2 - .3, bz - .01, sz, .075, 4);
  rb(xs[3] + g, y1 - .02, x2 - .004, yb + .02, bz - .01, sz, .075, 4); rb(xs[3] + g, yb + .09, xs[4] - g, y2 - .3, bz - .01, sz - .004, .075, 4); // chaise: front part full width, rear part beside the arm
  for (const [a, b] of [[x1, x1 + armW], [x2 - armR, x2]]) { const s = D / 3; // arms: 3 x 2 tufts and a cap
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) rb(a, yb + i * s + g, b, yb + (i + 1) * s - g, fz + j * .27 + g, fz + (j + 1) * .27 - g, .05, 2);
    rb(a, yb, b, y2, az - .13, az, .06, 3); }
  rb(x1 + .03, y2 - .2, x2 - .03, y2, bz, .6, .05); // back rail
  const bw = (xs[4] - xs[0]) / 3; // back: 3 equal cushions, each with 2 seam strips, and a lumbar pillow in front
  for (let i = 0; i < 3; i++) { const a = xs[0] + i * bw, b = a + bw, top = .895;
    rb(a + g, y2 - .38, b - g, y2 - .14, .46, top, .09, 4).rotation.x = .14;
    for (const t of [1, 2]) rb(a + t * bw / 3 - .004, y2 - .384, a + t * bw / 3 + .004, y2 - .14, .47, top - .02, .003, 1, seam).rotation.x = .14;
    rb(a + .09, y2 - .5, b - .09, y2 - .38, .5, .78, .05, 3).rotation.x = -.32; }
}

export const DESIGNS_BY_ID = { 634: alikante };
