// Built-in storage: wardrobes, laundry tower, walk-in closet, sliding door, bookshelf, built-in desk.
import * as THREE from 'three';
import { M } from '../materials.js';
import { C, RB, S } from '../primitives.js';
import { lamp } from '../lighting.js';
import { rand } from '../textures.js';
import { vase } from '../furniture/decor.js';
import { H, bbox, roomById } from '../plan/plan.js';
import { frame } from '../plan/frame.js';
import { framed, group, mat } from './util.js';

// rod + four face-out garments per 0.48 m; fromFront: garments sit 0.05 behind the unit front, otherwise 0.05 off the back
function hang(F, D, ua, ub, h, len, cloth, fromFront) {
  const n = Math.max(1, Math.floor((ub - ua) / .48)), step = (ub - ua) / n; let k = 0;
  for (let i = 0; i < n; i++) { const uc = ua + step * (i + .5);
    F.mesh(new THREE.CylinderGeometry(.01, .01, D - .02, 10).rotateX(Math.PI / 2).translate(uc, h, D / 2), M.brass, { uv: false });
    for (let j = 0; j < 4; j++) { const d = fromFront ? D - .08 - j * .055 : .05 + j * .055; F.B(uc - .21, d, uc + .21, d + .03, h - .03 - len * (.8 + .2 * rand()), h - .03, cloth[(k++ * 7 + i * 3) % cloth.length]); } }
}

export const storage = {
  wardrobe(it) { const { F, L, D } = framed(it), Ht = it.height, n = it.doors;
    group(it, () => { F.cab({ u1: 0, u2: L, d1: D, h1: 0, h2: Ht, cols: Array.from({ length: n }, () => [1, 1]), fm: mat(it.front, 'lacquerCream') });
      F.B(0, 0, L, D, Ht, Ht + .03, M.oakFurn);
      for (let k = 1; k < n; k++) { const b = L * k / n; F.B(b - .0375, D, b - .0275, D + .015, .85, 1.55, M.brass); F.B(b + .0225, D, b + .0325, D + .015, .85, 1.55, M.brass); } }); },
  // washer below, dryer above, storage cabinet on top
  laundryTower(it) { const { F, L, D } = framed(it);
    group(it, () => { F.B(0, 0, .02, D, 0, 2.6, M.oakFurn); F.B(L - .02, 0, L, D, 0, 2.6, M.oakFurn); F.B(.02, 0, L - .02, D, 0, .04, M.oakFurn);
      [[.05, .90], [.93, 1.78]].forEach(([h1, h2], i) => { const hc = (h1 + h2) / 2 - .04;
        F.RB(.04, .02, L - .04, D - .03, h1, h2, .02, M.ceramic);
        F.B(.08, D - .03, L - .08, D - .022, h2 - .11, h2 - .03, M.blackGlass, { cast: false }); F.B(L - .24, D - .023, L - .12, D - .021, h2 - .09, h2 - .05, M.display, { cast: false });
        F.add(new THREE.TorusGeometry(.17, .028, 14, 48), M.steel, L / 2, hc, D - .022, { uv: false, rotY: F.face });
        F.add(new THREE.CircleGeometry(.16, 48), i ? M.glassTint : M.blackGlass, L / 2, hc, D - .021, { uv: false, rotY: F.face, cast: false }); });
      F.B(.02, 0, L - .02, D, 1.80, 1.83, M.oakFurn);
      F.cab({ u1: .03, u2: L - .03, d1: D - .02, h1: 1.84, h2: 2.6, cols: [[1, 1], [1, 1]], fm: M.lacquerCream }); F.B(.02, 0, L - .02, D, 2.6, 2.62, M.oakFurn); }); },
  // open hanging and shelving along three sides of a room: north = end unit, east = hanging bays, west = shallow shelves
  walkInCloset(it) { const [x1, y1, x2, y2] = bbox(roomById(it.room).poly), D = it.unitDepth, W = x2 - x1, len = y2 - y1, sd = it.sides, oak = M.oakFurn;
    for (const k of Object.keys(sd)) if (!['east', 'north', 'west'].includes(k)) throw new Error(`walkInCloset: side "${k}" is not supported (use east, north, west)`);
    const Fe = frame({ axis: 'y', a0: y1, back: x2, dir: -1 }), Fn = frame({ axis: 'x', a0: x1, back: y1 + .02, dir: 1 }), Fw = frame({ axis: 'y', a0: y1, back: x1, dir: 1 });
    const ws = (sd.west || [])[0], Dw = ws ? ws.depth : 0, wf = ws ? ws.from : 0;
    const cloth = [M.linenWhite, M.linenSand, M.velvetChoco, M.boucleOat, M.linenSage, M.velvetTerra, M.book2, M.paper, M.velvetSage, M.rugDark];
    group(it, () => {
      if (sd.east) { const divs = [.02 + D, ...sd.east.slice(0, -1).map(b => b.to - y1), len - .04];
        divs.forEach(v => Fe.B(v, 0, v + .025, D, 0, 2.6, oak));
        Fe.B(.02, 0, len - .015, D, 2.25, 2.28, oak); Fe.B(.02, 0, len - .015, D, 2.57, 2.6, oak);
        sd.east.forEach((bay, i) => { const a = divs[i] + .025, b = divs[i + 1];
          if (bay.type === 'double') { hang(Fe, D, a, b, 2.15, .85, cloth, true); hang(Fe, D, a, b, 1.12, .8, cloth, true); } else hang(Fe, D, a, b, 2.15, 1.45, cloth, true); }); }
      if (ws) { const mid = (wf + len - .05) / 2; [wf, mid, len - .05].forEach(v => Fw.B(v, 0, v + .025, Dw, 0, 2.6, oak));
        for (let i = 0; i < 7; i++) { const h = .08 + i * .36; Fw.B(wf, 0, len - .025, Dw, h, h + .025, oak);
          let u = wf + .06; while (u < len - .10) { const w = .18 + rand() * .14; if (u + w > mid - .03 && u < mid + .05) { u = mid + .05; continue; } if (u + w > len - .07) break;
            Fw.RB(u, .02, u + w, Dw - .02, h + .025, h + .025 + (i < 2 ? .12 : .1 + rand() * .1), .015, cloth[(i * 5 + Math.floor((y1 + u) * 11)) % cloth.length]); u += w + .03; } }
        Fw.B(wf + .02, Dw - .01, len - .05, Dw, 2.5, 2.52, M.led, { cast: false }); }
      if (sd.north) { Fn.B(0, 0, W, D, 2.25, 2.28, oak); Fn.B(0, 0, W, D, 2.57, 2.6, oak); hang(Fn, D, Dw, W, 2.15, .95, cloth, false);
        [.08, .32].forEach(h => { Fn.B(Dw, 0, W, D - .02, h, h + .025, oak); for (let k = 0; k < 4; k++) Fn.RB(Dw + .08 + k * .24, .03, Dw + .26 + k * .24, D - .05, h + .025, h + .12, .02, [M.carcass, M.paper, M.rattanDark, M.velvetChoco][k]); });
        Fn.RB(.31, .02, .71, D - .03, 2.28, 2.5, .02, M.linenSand); }
      if (sd.east) { [.5, 1.6, 2.4].forEach(u => Fe.RB(u, .02, u + .4, D - .03, 2.28, 2.5, .02, M.linenSand)); Fe.B(.05 + D, D - .01, len - .05, D, 2.2, 2.24, M.led, { cast: false }); }
      if (it.pendant) { const [px, py] = it.pendant; S(px, py, 2.5, .14, M.opal, { cast: false }); C(px, py, .003, 2.62, H, M.blackMetal, { seg: 6 }); lamp(px, py, 2.3, 'closetPendant'); }
      RB(x1 + Dw + .08, y1 + D + .15, x2 - D - .05, y2 - .07, 0, .012, .15, M.rug, { cast: false }); }); },
  // arched leaf sliding on a brass rail in front of an arched opening
  slidingDoor(it) { const { F } = framed({ ...it, from: it.at, to: it.at + it.w }), w = it.w, hs = 2.05, r = .3;
    group(it, () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(w, 0); sh.lineTo(w, hs); sh.absarc(w - r, hs, r, 0, Math.PI / 2, false); sh.lineTo(r, hs + r); sh.absarc(r, hs, r, Math.PI / 2, Math.PI, false); sh.lineTo(0, 0);
      F.mesh(new THREE.ExtrudeGeometry(sh, { depth: .035, bevelEnabled: false, curveSegments: 24 }).translate(0, .01, .012), M.lacquerCream);
      F.B(.1, .05, w - .1, .054, .2, .23, M.skirting); F.B(.1, .05, w - .1, .054, 1.9, 1.93, M.skirting); F.B(.1, .05, .13, .054, .23, 1.9, M.skirting); F.B(w - .13, .05, w - .1, .054, .23, 1.9, M.skirting);
      F.B(.05, .05, .07, .08, .85, 1.35, M.brass);
      F.B(it.rail[0] - it.at, .01, it.rail[1] - it.at, .05, 2.40, 2.43, M.brass); }); },
  bookshelf(it) { const { F, L, D } = framed(it), Ht = it.height, oak = M.oakFurn, c = L / 2;
    group(it, () => { F.B(0, 0, L, D, 0, .04, oak); F.B(0, 0, .03, D, 0, Ht, oak); F.B(L - .03, 0, L, D, 0, Ht, oak); F.B(c - .025, 0, c + .005, D, 0, Ht, oak);
      const hs = []; for (let h = .45; h < Ht - .3; h += .4) hs.push(+h.toFixed(2)); [...hs, Ht - .03].forEach(h => F.B(0, 0, L, D, h, h + .03, oak));
      const bm = [M.book1, M.book2, M.book3, M.paper];
      hs.slice(0, 4).forEach((hh0, r) => { const h = hh0 + .03; let u = .06; while (u < L - .11) { const w = .025 + rand() * .03, hh = .22 + rand() * .1; if (u + w > c - .065 && u < c + .035) { u = c + .035; continue; }
        F.B(u, .04, u + w, D - .06, h, h + hh, bm[(r + Math.floor(F.abs(u) * 37)) % 4]); u += w + .004; } });
      vase(...F.P(1.18, .17), hs[hs.length - 1] + .03, .6, M.stonewareDark); }); },
  // wall-to-wall desk: drawer units at both ends, open shelves and cabinets above, a monitor per seat
  builtInDesk(it) { const { F, L, D, sp } = framed(it), oak = M.oakFurn, cream = M.lacquerCream;
    group(it, () => { F.B(0, 0, .04, D, 0, 2.6, oak); F.B(L - .04, 0, L, D, 0, 2.6, oak); F.B(.04, 0, L - .04, D, .72, .76, oak); F.B(.04, 0, L - .04, .03, .76, 1.55, oak);
      F.cab({ u1: .06, u2: .56, d0: .03, d1: D - .05, h1: .06, h2: .72, cols: [[1, 3]], fm: cream }); F.cab({ u1: L - .56, u2: L - .06, d0: .03, d1: D - .05, h1: .06, h2: .72, cols: [[1, 3]], fm: cream });
      F.B(.04, 0, L - .04, .33, 1.55, 1.58, oak); F.B(.04, 0, L - .04, .33, 1.95, 1.98, oak);
      F.cab({ u1: .04, u2: L - .04, d1: .35, h1: 2.0, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: cream });
      F.B(.06, .30, L - .06, .33, 1.535, 1.55, M.led, { cast: false });
      [[1.07, M.book1], [1.27, M.book3], [2.32, M.book2]].forEach(([u, m]) => { for (let k = 0; k < 6; k++) F.B(u + k * .035, .05, u + k * .035 + .03, .28, 1.58, 1.80 + (k % 3) * .03, [m, M.paper, M.book3][k % 3]); });
      vase(...F.P(.42, .18), 1.58, .5, M.stoneware); vase(...F.P(1.92, .18), 1.98, .6, M.stonewareDark);
      const us = it.seats.map(x => x - sp.a0);
      us.forEach(u => { F.B(u - .3, .18, u + .3, .21, 1.0, 1.36, M.blackMetal); F.B(u - .28, .21, u + .28, .211, 1.02, 1.34, M.laptop, { cast: false }); F.B(u - .03, .13, u + .03, .20, .76, 1.0, M.blackMetal);
        F.B(u - .12, .08, u + .12, .25, .76, .77, M.blackMetal); F.B(u - .22, .37, u + .22, .51, .76, .775, M.carcass); });
      lamp(...F.P(us.reduce((p, c) => p + c, 0) / us.length, .33), 1.45, 'shelfStrip', L); }); }
};
