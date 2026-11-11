// Hall: sculptural stone console, plaster artwork, brass sconce.
import * as THREE from 'three';
import { M } from '../materials.js';
import { lamp } from '../lighting.js';
import { framed, group } from './util.js';

export const hall = {
  stoneConsole(it) { const { F, L: W, D } = framed(it), stone = M.stoneware;
    group(it, () => {
      F.RB(0, .015, W, D, .80, .855, .012, stone); F.RB(0, .03, .32, D - .03, 0, .185, .01, stone); F.RB(.02, .04, .30, D - .04, .195, .375, .01, stone);
      const sp = new THREE.Shape(), e = W - .12; sp.moveTo(0, .385); sp.lineTo(0, .80); sp.lineTo(e, .80); sp.lineTo(e, .72); sp.absarc(e, .385, .335, Math.PI / 2, Math.PI, false); sp.lineTo(0, .385);
      F.mesh(new THREE.ExtrudeGeometry(sp, { depth: D - .06, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, .025), stone);
      F.B(0, 0, .32, .02, .185, .195, M.walnut); F.B(0, 0, .32, .02, .375, .385, M.walnut);
      const vu = W - .22, vd = .16;
      F.lathe([[0, 0], [.05, 0], [.055, .02], [.05, .16], [.045, .17], [0, .17]], vu, vd, .855, M.glass);
      [[0, 0, .1], [.03, .05, .09], [.02, -.05, .09], [-.05, .02, .085], [-.04, -.03, .08], [-.02, .06, .075]].forEach(([dd, du, z]) => F.S(vu + du, vd - dd, .855 + .17 + z, .045, M.blush));
      F.RB(.12, .07, .40, .23, .855, .865, .005, M.blackMetal); }); },
  plasterArt(it) { const { F, L } = framed(it), [h1, h2] = it.h;
    group(it, () => { F.B(0, 0, L, .045, h1, h2, M.plasterArt);
      F.B(-.02, 0, L + .02, .05, h1 - .02, h1, M.walnut); F.B(-.02, 0, L + .02, .05, h2, h2 + .02, M.walnut); F.B(-.02, 0, 0, .05, h1, h2, M.walnut); F.B(L, 0, L + .02, .05, h1, h2, M.walnut); }); },
  sconce(it) { const { F, L } = framed(it), [h1, h2] = it.h;
    group(it, () => { F.RB(0, 0, L, .05, h1, h2, .02, M.brass); F.B(.02, .048, L - .02, .055, h1 + .04, h2 - .04, M.opal, { cast: false }); lamp(...F.P(L / 2, .21), (h1 + h2) / 2, 0xffcf96, 3); }); }
};
