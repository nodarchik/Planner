// Living room, bedroom and terrace built-ins: TV wall, beauty table + organiser, terrace sofa.
import * as THREE from 'three';
import { M, P } from '../materials.js';
import { C, merged, pillow } from '../primitives.js';
import { lamp } from '../lighting.js';
import { planar, tvTex } from '../textures.js';
import { book, vase } from '../furniture/decor.js';
import { framed, group } from './util.js';

export const living = {
  // fluted walnut panel with LED edges, floating console and TV centred on it
  tvWall(it) { const { F, L, sp } = framed(it), c = L / 2, n = Math.round(L / .05), w = L / n, flipU = it.side === 'N' || it.side === 'E';
    group(it, () => { F.B(0, 0, L, .035, 0, 2.7, M.walnut);
      const geos = []; for (let i = 0; i < n; i++) geos.push(F.geo(new THREE.CylinderGeometry(w / 2, w / 2, 2.7, 12, 1, true, -Math.PI / 2, Math.PI).translate(w / 2 + i * w, 1.35, .035)));
      merged(geos, M.walnut, { clampMesh: true });
      F.B(-.02, 0, 0, .06, 0, 2.7, M.led, { cast: false }); F.B(L, 0, L + .02, .06, 0, 2.7, M.led, { cast: false }); });
    group(it, () => { F.cab({ u1: c - .85, u2: c + .85, d0: .06, d1: .44, h1: .24, h2: .52, cols: [[1, 1], [1, 1], [1, 1]], fm: M.walnut });
      F.B(c - .8, .10, c + .8, .40, .22, .225, M.led, { cast: false }); F.B(c - .72, .06, c + .72, .09, .98, 1.8, M.blackMetal);
      F.B(c - .7, .09, c + .7, .093, 1.0, 1.78, P({ color: 0x050506, roughness: .08, clearcoat: 1, emissive: 0xffffff, emissiveMap: planar(tvTex, sp.a0 + c - .7, 1.0, 1.40, .78, flipU), emissiveIntensity: 0, nightIntensity: 1.6 }), { cast: false });
      F.RB(c - .5, .26, c + .5, .37, .52, .58, .02, M.blackMetal); vase(...F.P(c - .71, .26), .52, .9, M.stoneware);
      book(...F.P(c + .66, .26), .52, .22, .16, .035, M.book1, .1 + (sp.axis === 'y' ? Math.PI / 2 : 0)); lamp(...F.P(c, .52), 1.3, 0x9fc4ff, .8); }, 'TV + console'); },
  beautyTable(it) { const { F, L, D } = framed(it);
    group(it, () => { F.RB(0, 0, L, D, .72, .75, .008, M.walnut); F.cab({ u1: .02, u2: L - .02, d1: D - .02, h1: .6, h2: .72, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      [.06, L - .06].forEach(u => F.C(u, D - .04, .012, 0, .6, M.brass, { seg: 12 }));
      F.add(new THREE.CircleGeometry(.36, 96), M.mirror, L / 2, 1.45, .005, { uv: false, rotY: F.face }); F.add(new THREE.TorusGeometry(.365, .014, 16, 96), M.led, L / 2, 1.45, .006, { uv: false, rotY: F.face });
      vase(...F.P(L - .25, .18), .75, .5, M.stoneware); lamp(...F.P(L / 2, .28), 1.4, 0xffe6c8, 1.4); }); },
  // drawers below, two open shelves above
  beautyOrganiser(it) { const { F, L, D } = framed(it);
    group(it, () => { F.cab({ u1: 0, u2: L, d1: D, h1: .08, h2: .72, cols: [[1, 3]], fm: M.lacquerCream }); F.RB(-.02, 0, L + .02, D + .02, .72, .75, .008, M.walnut);
      [1.0, 1.25].forEach(h => F.B(0, 0, L, .24, h, h + .02, M.oakFurn)); F.B(0, 0, .02, .24, .75, 1.27, M.oakFurn); F.B(L - .02, 0, L, .24, .75, 1.27, M.oakFurn);
      [[.07, .13, .75, .16, M.ceramic], [.16, .16, .75, .11, M.brass], [.25, .12, .75, .2, M.glassTint], [.33, .15, .75, .09, M.blackGlass], [.08, .12, 1.02, .13, M.glassTint], [.20, .13, 1.02, .08, M.ceramic], [.31, .12, 1.02, .15, M.paper], [.13, .12, 1.27, .1, M.brass], [.28, .12, 1.27, .17, M.ceramic]]
        .forEach(([u, d, h, t, m]) => { const [x, y] = F.P(u, d); C(x, y, .028, h, h + t, m, { seg: 14 }); }); }); },
  terraceSofa(it) { const { F, L, D } = framed(it), cush = [[.05, L / 2 + .02], [L / 2 + .03, L - .05]];
    group(it, () => { F.RB(0, 0, L, D, 0, .38, .03, M.oakFurn); F.RB(0, 0, L, .20, .38, .78, .03, M.oakFurn);
      cush.forEach(([a, b]) => F.RB(a, .20, b, D - .02, .38, .52, .05, M.linenOut, { seg: 5 })); cush.forEach(([a, b]) => F.RB(a, .20, b, .38, .52, .86, .05, M.linenOut, { seg: 5 }));
      [[.40, M.velvetTerra], [L - .30, M.velvetSage]].forEach(([u, m]) => { const [x, y] = F.P(u, .44); pillow(x, y, .66, .4, .14, .4, m, 1.2, F.face); }); }); }
};
