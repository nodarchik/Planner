// Free-standing and simple items: beds, nightstands, rugs, plants, curtains, art, lights.
import * as THREE from 'three';
import { state } from '../scene.js';
import { M } from '../materials.js';
import { RB, beginG, endG, lathe } from '../primitives.js';
import { lamp } from '../lighting.js';
import { art1Tex, art2Tex } from '../textures.js';
import { bed, nightstand } from '../furniture/bed.js';
import { fig, olive, pot, snake } from '../furniture/plants.js';
import { artAt, curtain, diningDecor, livingRug } from '../furniture/decor.js';
import { faceCoord, frameSpec } from '../plan/plan.js';
import { framed, group, hex, mat } from './util.js';

const PLANTS = { fig, olive, snake }, ART = { art1: art1Tex, art2: art2Tex };

export const loose = {
  curtain(it) { const sp = frameSpec(it), [h1, h2] = it.h || [.02, 2.74]; curtain(sp.axis, sp.back, it.from, it.to, h1, h2, mat(it.material, 'sheer')); },
  // headboard against a wall (anchor) or free (pos = centre of the headboard, rot in degrees)
  bed(it) { const [w, l] = it.size, m = it.materials, args = [w, l, 1, M[m.accent], M[m.duvet], M[m.throw]], an = it.anchor;
    beginG(it.name || 'Bed');
    if (an && (an.side === 'S' || an.side === 'N')) { const s = an.side === 'S' ? 1 : -1; args[2] = s; bed(an.offset, faceCoord(an.wall, an.side) + s * (an.gap || 0), ...args); endG(); return; }
    bed(0, 0, ...args); const g = state.CUR; endG();
    if (an) { const east = an.side === 'E', face = faceCoord(an.wall, an.side) + (east ? 1 : -1) * (an.gap || 0);
      g.rotation.y = east ? Math.PI / 2 : -Math.PI / 2; g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g);
      g.position.x += east ? face - bb.min.x : face - bb.max.x; g.position.z += an.offset - (bb.min.z + bb.max.z) / 2; }
    else { const r = -(it.rot || 0) * Math.PI / 180, cx = g.position.x, cz = g.position.z; // rotate about the headboard centre (local origin)
      g.rotation.y = r; g.position.set(it.pos[0] + cx * Math.cos(r) + cz * Math.sin(r), 0, it.pos[1] - cx * Math.sin(r) + cz * Math.cos(r)); }
    g.userData.home = { x: g.position.x, z: g.position.z, r: g.rotation.y }; },
  nightstand(it) { group(it, () => nightstand(...it.pos), it.name || 'Nightstand'); },
  wallArt(it) { const { F, L } = framed(it), [h1, h2] = it.h, dp = it.depth || .035, flipU = it.side === 'N' || it.side === 'E';
    group(it, () => { F.B(0, 0, L, dp, h1, h2, M.oakFurn); F.B(.03, dp, L - .03, dp + .002, h1 + .03, h2 - .03, M.paper);
      F.B(.09, dp + .002, L - .09, dp + .003, h1 + .09, h2 - .09, artAt(ART[it.image], it.from + .09, h1 + .09, L - .18, h2 - h1 - .18, flipU)); }); },
  rug(it) { const [h1, h2] = it.h || [0, .012]; group(it, () => RB(...it.rect, h1, h2, it.radius ?? .05, mat(it.material, 'rug'), { cast: false })); },
  organicRug(it) { livingRug(...it.center, it.rx, it.ry); },
  light(it) { lamp(it.pos[0], it.pos[1], it.h, hex(it.color), it.intensity); },
  wallPanel(it) { const { F, L } = framed(it); F.B(0, 0, L, it.depth, it.h[0], it.h[1], mat(it.material, 'lacquerCream')); },
  planter(it) { const [x, y] = it.pos; group(it, () => { if (it.pot) pot(x, y, it.pot[0], it.pot[1], it.pot[2], M[it.pot[3]]); PLANTS[it.plant](x, y, it.scale ?? 1); }); },
  tableDecor(it) { diningDecor(...it.pos); },
  vanityStool(it) { const [x, y] = it.pos; group(it, () => { lathe([[0, 0], [.17, 0], [.17, .01], [.03, .03], [.025, .36], [0, .36]], x, y, 0, M.brass);
    lathe([[0, .36], [.17, .36], [.18, .38], [.18, .43], [.16, .46], [0, .465]], x, y, 0, M.velvetTerra); }); },
  herbPlanter(it) { const [x1, y1, x2, y2] = it.rect, alongX = x2 - x1 >= y2 - y1, len = alongX ? x2 - x1 : y2 - y1, n = Math.floor((len - .24) / .27) + 1;
    const at = t => alongX ? [x1 + t, y1 + .16] : [x1 + .16, y1 + t];
    group(it, () => { RB(x1, y1, x2, y2, 0, .62, .02, M.concrete); for (let i = 0; i < n; i++) pot(...at(.15 + i * .27), .09, .07, .2, M.stoneware); snake(...at(.4), .5); snake(...at(1.2), .45); }); }
};
