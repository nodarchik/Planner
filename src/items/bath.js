// Bathroom and shower-room fixtures.
import * as THREE from 'three';
import { M } from '../materials.js';
import { B, add } from '../primitives.js';
import { lamp } from '../lighting.js';
import { vase } from '../furniture/decor.js';
import { alongRoom } from '../plan/plan.js';
import { frame } from '../plan/frame.js';
import { framed, group } from './util.js';

const BASIN = [[0, 0], [.16, 0], [.19, .04], [.19, .13], [.18, .13], [.16, .05], [0, .03]], SMALL = [[0, 0], [.12, 0], [.14, .04], [.14, .11], [.13, .11], [.11, .04], [0, .03]];
export const bath = {
  bathtub(it) { const { F, L, D, sp } = framed(it);
    group(it, () => { F.RB(0, 0, L, D, 0, .58, .01, M.trav); F.RB(.08, .08, L - .08, D - .08, .3, .585, .2, M.resin, { seg: 5 });
      const g = sp.axis === 'y' ? new THREE.PlaneGeometry(D - .25, L - .25) : new THREE.PlaneGeometry(L - .25, D - .25); g.rotateX(-Math.PI / 2); F.add(g, M.water, L / 2, .5, D / 2, { uv: false, cast: false });
      F.C(.14, .09, .02, .58, .9, M.brass); F.tube([[.14, .9, .09], [.14, .95, .15], [.14, .9, .23]], .012, M.brass); }); },
  nicheShelves(it) { const [x1, y1, x2, y2] = it.rect;
    group(it, () => { [.62, 1.02, 1.42].forEach(h => B(x1 + .01, y1 + .02, x2 - .01, y2 - .02, h, h + .025, M.oakFurn));
      [[.11, .15, .645], [.11, .32, .645], [.17, .23, 1.045]].forEach(([dx, dy, h]) => add(new THREE.CylinderGeometry(.06, .06, .22, 20).rotateZ(Math.PI / 2), M.towel, x1 + dx, h + .06, y1 + dy, { uv: false }));
      vase(x1 + .16, y1 + .24, 1.445, .3, M.stoneware); }); },
  // variant "niche": walk-in tray between walls with one fixed glass screen · variant "strip": full length of one room side behind a glass wall with a door at each end
  shower(it) { const brass = M.brass, glass = M.glassShower;
    if (it.variant === 'strip') { const sp = alongRoom(it.room, it.along), F = frame(sp), L = sp.len, D = it.width, c = L / 2;
      group(it, () => { F.B(0, 0, L, D, 0, .025, M.micro, { cast: false }); F.B(.07, .04, L - .06, .08, .025, .027, M.steelDark, { cast: false });
        F.B(0, D - .005, .54, D + .007, .025, 2.0, glass, { cast: false }); F.B(.56, D + .012, L - .56, D + .024, .025, 2.0, glass, { cast: false }); F.B(L - .54, D - .005, L, D + .007, .025, 2.0, glass, { cast: false });
        F.B(0, D - .02, L, D + .03, 1.98, 2.0, brass); [.55, L - .55].forEach(u => F.B(u - .01, D - .02, u + .01, D + .03, .025, 2.0, brass));
        F.B(.46, D + .007, .48, D + .027, .85, 1.35, brass); F.B(L - .48, D + .007, L - .46, D + .027, .85, 1.35, brass);
        F.C(c - .005, D / 2, .14, 2.15, 2.17, brass); F.B(c - .025, 0, c + .015, D / 2, 2.15, 2.17, brass); F.B(c - .105, 0, c + .095, .02, 1.0, 1.2, brass); F.B(L - .44, 0, L - .10, .03, 1.1, 1.12, M.trav); });
      return; }
    const { F, L, D } = framed(it), [s0, s1] = [it.screen.from, it.screen.to];
    group(it, () => { F.B(0, 0, L, D, 0, .012, M.micro, { cast: false }); F.B(.03, D - .13, L - .03, D - .09, .012, .014, M.steelDark, { cast: false });
      F.B(0, s0, .012, s1, .012, 2.05, glass, { cast: false }); F.B(-.005, s0, .017, s1, 2.03, 2.05, brass); F.B(-.005, s1 - .02, .017, s1, .012, 2.05, brass);
      F.C(L / 2, .55, .14, 2.2, 2.22, brass); F.B(L / 2 - .02, 0, L / 2 + .02, .55, 2.2, 2.22, brass); F.B(L - .02, .65, L - .002, .85, 1.0, 1.2, brass); F.B(L - .07, .9, L - .002, 1.25, 1.1, 1.12, M.trav); }); },
  wc(it) { const { F, L, D } = framed(it);
    group(it, () => { F.RB(0, 0, L, D, .30, .44, .16, M.ceramic, { seg: 6 }); F.RB(.005, .03, L - .005, D - .01, .44, .455, .15, M.ceramic, { seg: 6 }); F.B(.10, 0, L - .10, .01, .9, 1.06, M.brass); }); },
  // floating vanity with stone top; one mirror, basin and tap per basin
  vanity(it) { const { F, L, D } = framed(it), n = it.basins;
    group(it, () => { F.RB(0, .005, L, D - .02, .45, .82, .015, M.walnut); F.B(0, 0, L, D, .82, .85, M.trav);
      for (let i = 0; i < n; i++) { const u = n === 1 ? L / 2 : .32 + i * (L - .64) / (n - 1);
        F.lathe(BASIN, u, .23, .85, M.ceramic, { sd: .85, su: 1 }); F.tube([[u, 1.1, .005], [u, 1.1, .09], [u, 1.08, .12]], .01, M.brass);
        F.B(u - .27, .005, u + .27, .04, 1.15, 1.95, M.mirror); F.B(u - .29, .035, u + .29, .045, 1.13, 1.97, M.led, { cast: false }); }
      F.B(.02, .01, .04, D - .04, .42, .44, M.led, { cast: false }); lamp(...F.P(L / 2 - .005, .27), 1.6, 'mirrorLight'); }); },
  basinUnit(it) { const { F, L, D, sp } = framed(it), u = L / 2 + .005;
    group(it, () => { F.RB(0, 0, L, D, .62, .85, .015, M.walnut); F.lathe(SMALL, u, D / 2, .85, M.ceramic); F.tube([[u, 1.06, 0], [u, 1.06, .07], [u, 1.04, .09]], .009, M.brass);
      F.add(new THREE.CircleGeometry(.22, 64), M.mirror, u, 1.55, .005, { uv: false, rotY: F.face }); F.add(new THREE.TorusGeometry(.225, .012, 12, 64), M.led, u, 1.55, .006, { uv: false, rotY: F.face });
      if (it.towel) { const [t0, t1] = it.towel.map(v => v - sp.a0); [t0 + .05, t1 - .05].forEach(v => F.C(v, .015, .015, 1.6, 1.62, M.brass, { seg: 10 })); F.RB(t0, 0, t1, .04, 1.0, 1.58, .02, M.towel); } }); },
  towelRadiator(it) { const { F, L } = framed(it);
    group(it, () => { [0, L].forEach(u => F.C(u, .03, .012, .3, 1.5, M.brass, { seg: 10 }));
      for (let i = 0; i < 7; i++) F.mesh(new THREE.CylinderGeometry(.01, .01, L, 8).rotateZ(Math.PI / 2).translate(L / 2, .38 + i * .18, .03), M.brass, { uv: false });
      F.RB(.05, .01, L - .05, .07, .95, 1.45, .02, M.towel); }); }
};
