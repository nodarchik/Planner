// Kitchen: L-shaped run with towers, wall cabinets, bar, small appliances.
import { M, P } from '../materials.js';
import { lamp } from '../lighting.js';
import { hobTex, planar } from '../textures.js';
import { H, faceCoord, frameSpec } from '../plan/plan.js';
import { frame } from '../plan/frame.js';
import { framed, group } from './util.js';

export const kitchen = {
  // north leg along one wall (hob), west leg along the adjoining wall (sink) ending in full-height towers
  kitchenL(it) { const D = it.depth, DT = D + .04, n = it.north, w = it.west, ch = M.lacquerChoco;
    const spn = frameSpec(n), Fn = frame(spn), Ln = spn.len;
    const a0 = faceCoord(n.wall, n.side), Fw = frame(frameSpec({ ...w, from: a0, to: w.to })), Tw = w.to - a0, sum = it.towers.reduce((p, c) => p + c, 0);
    group(it, () => {
      Fn.cab({ u1: .02, u2: DT, d1: D, h1: .1, h2: .88, cols: [[1, 1]], fm: ch }); Fn.cab({ u1: DT + .02, u2: Ln - .02, d1: D, h1: .1, h2: .88, cols: [[.6, 1], [.43, 3]], fm: ch });
      Fw.cab({ u1: DT + .02, u2: Tw - .02, d1: D, h1: .1, h2: .88, cols: [[.6, 1], [.6, 1], [.45, 3]], fm: ch });
      Fn.B(.02, .02, Ln - .04, D - .06, 0, .1, M.carcass); Fw.B(D - .06, .02, Tw - .04, D - .06, 0, .1, M.carcass);
      Fn.B(0, 0, Ln, DT, .88, .92, M.trav); Fw.B(DT, 0, Tw, DT, .88, .92, M.trav);
      Fn.B(0, 0, Ln, .02, .92, 1.5, M.trav); Fw.B(.02, 0, Tw, .02, .92, 1.5, M.trav);
      const hr = Fn.rect(.66, .05, 1.30, .57), hob = P({ color: 0xffffff, map: planar(hobTex, hr[0], hr[1], hr[2] - hr[0], hr[3] - hr[1]), roughness: .06, clearcoat: 1, clearcoatRoughness: .02 });
      Fn.B(.69, .06, 1.27, .54, .92, .926, hob); Fn.B(.695, D, 1.265, D + .015, .30, .845, M.blackGlass); Fn.B(.73, D + .015, 1.23, D + .032, .79, .802, M.brass);
      Fw.B(.72, .10, 1.2, .48, .918, .9215, M.steelDark); Fw.C(.96, .29, .025, .92, .9218, M.blackMetal, { cast: false });
      Fw.C(.96, .04, .028, .92, .97, M.brass); Fw.tube([[.96, .96, .04], [.96, 1.20, .06], [.96, 1.30, .16], [.96, 1.25, .27], [.96, 1.12, .30]], .011, M.brass, { seg: 48 });
      Fw.B(.66, D - .04, Tw - .04, D - .02, .02, .03, M.led, { cast: false }); Fn.B(.04, D - .04, Ln - .04, D - .02, .02, .03, M.led, { cast: false });
      let t = Tw; it.towers.forEach((tw, i) => { const u1 = t + (i ? .02 : 0), u2 = t + tw; t = u2;
        Fw.cab({ u1, u2, d1: DT, h1: .1, h2: 2.6, cols: [[1, i ? 3 : 2]], fm: ch });
        if (i) { Fw.B(u1 + .03, DT, u2 - .03, DT + .015, .86, 1.46, M.blackGlass); Fw.B(u1 + .07, DT + .015, u2 - .07, DT + .032, 1.42, 1.432, M.brass); } });
      Fw.B(Tw + .02, .02, Tw + sum - .02, D - .06, 0, .1, M.carcass); });
    group(it, () => {
      Fw.cab({ u1: .02, u2: Tw - .02, d1: .35, h1: 1.5, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      Fn.cab({ u1: .37, u2: Ln - .02, d1: .35, h1: 1.5, h2: 2.6, cols: [[.3, 1], [.6, 1], [.4, 1]], fm: M.lacquerCream });
      Fw.B(.02, .32, Tw - .04, .36, 1.49, 1.5, M.led, { cast: false }); Fn.B(.37, .31, Ln - .04, .35, 1.49, 1.5, M.led, { cast: false }); }, 'Wall cabinets'); },
  coffeeMachine(it) { const { F, L } = framed(it), h = it.h;
    group(it, () => { F.RB(0, .03, L, .43, h, h + .39, .02, M.steel); F.B(.04, .43, L - .04, .434, h + .27, h + .35, M.display); F.B(.04, .28, L - .04, .48, h, h + .03, M.steelDark); }); },
  airFryer(it) { const { F, L } = framed(it), h = it.h;
    group(it, () => { F.RB(0, .1, L, .42, h, h + .32, .05, M.plastic, { seg: 5 }); F.RB(.015, .37, L - .015, .435, h + .015, h + .18, .02, M.plastic); F.B(.09, .435, L - .09, .465, h + .08, h + .14, M.blackMetal); }); },
  // bar: shallow drawers on the kitchen (front) side, knee recess under the top on the back side for stools
  kitchenBar(it) { const { F, L, D } = framed(it);
    group(it, () => {
      F.cab({ u1: .04, u2: L - .06, d0: .20, d1: D - .02, h1: .1, h2: .88, cols: [[.55, 3], [.55, 1], [.55, 3]], fm: M.lacquerChoco });
      F.B(.06, .22, L - .08, D - .04, 0, .1, M.carcass); F.B(0, .20, L - .04, .22, 0, .88, M.walnut);
      F.B(0, 0, L, D, .88, .92, M.trav); F.B(L - .04, 0, L, D, 0, .88, M.trav); F.B(0, .20, .04, D, 0, .88, M.lacquerChoco);
      F.RB(.7, .10, 1.05, .40, .92, .94, .01, M.oakFurn); F.lathe([[0, 0], [.07, 0], [.14, .05], [.16, .09], [0, .02]], 1.45, .25, .92, M.stoneware);
      [[1.43, .29], [1.47, .21], [1.39, .25]].forEach(([u, d]) => F.S(u, d, .99, .037, M.fruit));
      [.55, 1.35].forEach(u => { F.S(u, .25, 1.75, .1, M.opal, { cast: false }); F.C(u, .25, .02, 1.84, 1.87, M.brass); F.C(u, .25, .003, 1.87, H, M.blackMetal, { seg: 6 }); F.C(u, .25, .04, H - .015, H, M.brass); });
      lamp(...F.P(.95, .25), 1.55, 'pendant', 2); }); }
};
