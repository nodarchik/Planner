import * as THREE from 'three';
import { H, scene, state, world } from './scene.js';
import { art1Tex, art2Tex, planar, rand, tvTex } from './textures.js';
import { lamp } from './lighting.js';
import { M, P, emissives } from './materials.js';
import { B, C, G, RB, S, add, beginG, endG, lathe, merged, pillow, tube } from './primitives.js';
import { buildArchVar } from './arch/soft.js';
import { cab } from './furniture/storage.js';
import { fig, olive, pot, snake } from './furniture/plants.js';
import { artAt, artFrame, book, curtain, diningDecor, hobAt, livingRug, vase } from './furniture/decor.js';
import { bed, nightstand } from './furniture/bed.js';
import { FACE, faceTo, namedTyped, typed } from './catalog.js';
import { zoneLabels } from './ui/dims.js';
import { rebuildPT } from './pathtracer.js';
import { attachLabels, loadLayout } from './ui/editor.js';
import { loadStyle } from './ui/style.js';
import { loadTypes } from './ui/swap.js';
import { renderPlanNotes } from './ui/panels.js';

export function buildFurniture() { // loose items outside LAYOUTS.soft.build(): bedroom 2 bed group, curtains, west balcony, general lamps
  // Removed pre-Soft items drew from the seeded generator: the old bedroom 1 bed (288 numbers, here) and the east-balcony herb planter (55, below).
  // Skip the same amounts so plants, drapes, hanging garments and books stay identical to the baseline screenshots.
  for (let i = 0; i < 288; i++) rand();
  /* ---- Bedroom 1 curtains ---- */
  curtain('y', .1, 1.25, 1.6, .02, 2.74, M.sheer); curtain('y', .1, 3.63, 3.95, .02, 2.74, M.sheer);
  /* ---- Bedroom 2 (5.06 × 3.05) ---- */
  beginG('Bed (B2)'); bed(1.55, 7.13, 1.60, 2.00, -1, M.velvetSage, M.linenWhite, M.velvetToffee); endG();
  G('Nightstand', () => nightstand(.48, 6.81)); G('Nightstand', () => nightstand(2.62, 6.81));
  beginG('Wall art (B2)'); B(1.15, 7.13, 1.95, 7.10, 1.25, 1.96, M.oakFurn); B(1.18, 7.10, 1.92, 7.098, 1.28, 1.93, M.paper); B(1.24, 7.098, 1.86, 7.097, 1.34, 1.87, artAt(art2Tex, 1.24, 1.34, .62, .53, true)); endG();
  G('Rug (B2)', () => RB(.4, 4.55, 2.7, 6.6, 0, .014, .3, M.rugDark, { cast: false }));
  curtain('y', .1, 4.4, 4.72, .02, 2.74, M.sheer); curtain('y', .1, 6.73, 7.05, .02, 2.74, M.sheer);
  /* ---- Bathroom + hall lamps, hall panel ---- */
  lamp(5.9, 1.4, 2.6, 0xffe2c0, 4);
  B(6.6, 7.10, 7.0, 7.13, 1.5, 1.9, M.lacquerCream);
  lamp(6.9, 5.6, 2.6, 0xffdcb4, 5); lamp(5.9, 3.5, 2.6, 0xffdcb4, 4);
  /* ---- West balcony ---- */
  namedTyped('Lounge chair (loggia)', 'armchair', 4, -1.05, 2.2, FACE.W); namedTyped('Lounge chair (loggia)', 'armchair', 4, -1.05, 3.3, FACE.W);
  namedTyped('Side table (loggia)', 'sidetable', 0, -1.25, 2.75);
  G('Planter (W)', () => { pot(-1.5, 6.6, .2, .16, .46, M.stoneware); snake(-1.5, 6.6, 1); }); G('Planter (W)', () => { pot(-1.5, 1.0, .18, .14, .42, M.stonewareDark); fig(-1.5, 1.0, .75); });
  for (let i = 0; i < 55; i++) rand();
}
/* ================= Soft classic plan: notes, labels and furniture ================= */
export const LAYOUTS = {
  soft: { preset: 'soft', wallTint: 0xe9ddcc, ceilTint: 0xf3ebe0, trimTint: 0xeadfcf,
    name: 'Soft classic · arches, panels, chevron oak', tag: 'Design vibe',
    why: 'Your reference applied to the original plan (studio + office): warm greige walls with picture-frame mouldings and chair rail, light oak chevron floor everywhere, rounded-shoulder arches corridor → hall → studio, fluted rounded corners on the column and shaft, coffered ceilings with rounded corners, fluted lip and LED cove in every room, arched mirror fronts with oak knobs on the hall wardrobe, sculptural stone console under a textured plaster artwork with a brass sconce, bouclé and light-oak palette.',
    met: 'Studio: corner sofa 4 + armchair + dining 4 + 3 bar stools · TV 3.31 m · Office: 2.66 m built-in desk',
    clr: [['Bathroom free floor', '1.18 × 1.74'], ['Guest room: shower glass → WC / basin', '0.32 · 0.64'], ['Hall: entrance clear', 'wardrobe removed'], ['Closet units (max depth)', '0.30'], ['Closet aisle (B1)', '0.75'], ['B2 bed side → wardrobe', '0.60'], ['U-kitchen aisle (west leg → bar)', '1.07'], ['Bar stools → chaise', '1.45'], ['Sofa front → TV', '3.31'], ['Chaise → coffee table', '0.30'], ['Sofa seat → coffee table', '0.38'], ['Dining table → partition', '0.05'], ['Dining chair → bar end', '0.58'], ['Hall passage (open, no door)', '1.46'], ['Office door swing → armchair', 'clear']],
    rooms: [[7.0, 5.0, 'Hall', '≈13.7 m²'], [10.2, 3.4, 'Studio: living + kitchen', '≈27.9 m²'], [10.6, 5.0, 'Office', '≈12.6 m²']],
    furn: [['Bathtub (west wall)', 5.065, 1.33, .58, '0.75', '1.70', '0.58'], ['Walk-in shower', 6.68, .72, 2.05, '0.78', '1.45', '2.05'], ['Guest shower (full depth, 2 doors)', 7.46, 8.22, 2.0, '0.80', '1.67', '2.00'], ['Double vanity 1.25', 6.84, 2.12, .85, '0.45', '1.25', '0.85'], ['Wardrobe (B2)', 4.0, 6.83, 2.6, '2.11', '0.60', '2.60'], ['Beauty organiser (B1)', 1.92, 3.79, 1.27, '0.40', '0.40', '1.27'], ['Terrace sofa', 14.32, .95, .78, '0.80', '1.60', '0.78'], ['Terrace dining (4)', 14.85, 3.6, .75, '0.80', '1.40', '0.75'], ['Laundry tower + wardrobe', 6.75, 3.64, 2.63, '0.64', '1.49', '2.63'], ['Walk-in closet (B1)', 3.94, 1.47, 2.6, '1.30', '2.95', '2.60'], ['Corner kitchen (L)', 7.6, .9, .92, '1.69', '2.31', '0.92'], ['Fridge + oven towers', 7.48, 2.91, 2.6, '0.62', '1.20', '2.60'], ['Kitchen bar (U extension) + 3 stools', 9.1, 1.07, .92, '0.49', '1.75', '0.92'], ['Corner sofa 3 + chaise (L)', 12.2, .47, .84, '2.70', '2.10', '0.84'], ['Coffee table (rect)', 12.65, 1.6, .38, '1.20', '0.60', '0.38'], ['TV wall + 65" TV', 12.3, 4.1, 1.8, '2.50', '0.40', '2.70'], ['Dining table 1.40 (4 seats)', 9.9, 3.87, .75, '1.40', '0.80', '0.75'], ['Built-in desk (wall to wall)', 12.25, 6.79, .76, '2.66', '0.68', '2.60'], ['Bookshelf (on shaft)', 10.06, 6.47, 2.4, '1.59', '0.34', '2.40']],
    plants() { G('Fig plant', () => fig(13.25, 3.95, 1)); G('Snake plant', () => snake(13.3, 4.75, .8)); },
    build() {
      // hall: arched mirror fronts on the wardrobe, stone arch console + plaster artwork + brass sconce on the east wall
      beginG('Stone arch console'); const stone = M.stoneware;
      RB(8.56, 5.50, 8.845, 6.30, .80, .855, .012, stone); RB(8.59, 5.50, 8.83, 5.82, 0, .185, .01, stone); RB(8.60, 5.52, 8.82, 5.80, .195, .375, .01, stone);
      { const sp = new THREE.Shape(); sp.moveTo(5.50, .385); sp.lineTo(5.50, .80); sp.lineTo(6.18, .80); sp.lineTo(6.18, .72); sp.absarc(6.18, .385, .335, Math.PI / 2, Math.PI, false); sp.lineTo(5.50, .385);
        const g = new THREE.ExtrudeGeometry(sp, { depth: .24, bevelEnabled: false, curveSegments: 32 }); g.rotateY(-Math.PI / 2); g.translate(8.835, 0, 0); add(g, stone, 0, 0, 0); }
      B(8.84, 5.50, 8.86, 5.82, .185, .195, M.walnut); B(8.84, 5.50, 8.86, 5.82, .375, .385, M.walnut);
      lathe([[0, 0], [.05, 0], [.055, .02], [.05, .16], [.045, .17], [0, .17]], 8.70, 6.08, .855, M.glass);
      [[0, 0, .1], [.03, .05, .09], [.02, -.05, .09], [-.05, .02, .085], [-.04, -.03, .08], [-.02, .06, .075]].forEach(([dx, dy, z]) => S(8.70 + dx, 6.08 + dy, .855 + .17 + z, .045, M.blush));
      RB(8.63, 5.62, 8.79, 5.90, .855, .865, .005, M.blackMetal); endG();
      beginG('Plaster artwork'); B(8.815, 5.46, 8.86, 6.36, 1.05, 2.25, M.plasterArt);
      B(8.81, 5.44, 8.86, 6.38, 1.03, 1.05, M.walnut); B(8.81, 5.44, 8.86, 6.38, 2.25, 2.27, M.walnut); B(8.81, 5.44, 8.86, 5.46, 1.05, 2.25, M.walnut); B(8.81, 6.36, 8.86, 6.38, 1.05, 2.25, M.walnut); endG();
      beginG('Wall sconce'); RB(8.81, 6.55, 8.86, 6.69, 1.32, 1.88, .02, M.brass); B(8.805, 6.57, 8.812, 6.67, 1.36, 1.84, M.opal, { cast: false }); lamp(8.65, 6.62, 1.6, 0xffcf96, 3); endG();
      G('Hall runner', () => RB(5.95, 4.6, 8.2, 6.6, 0, .012, .05, M.rugDark, { cast: false }));
      // L-shaped corner kitchen: north leg (hob) + west leg on the bathroom wet wall (sink, dishwasher) ending in fridge + oven towers
      beginG('Kitchen run');
      cab({ axis: 'x', a1: 7.19, a2: 7.79, back: 0, front: .58, h1: .1, h2: .88, cols: [[1, 1]], fm: M.lacquerChoco });
      cab({ axis: 'x', a1: 7.81, a2: 8.84, back: 0, front: .58, h1: .1, h2: .88, cols: [[.6, 1], [.43, 3]], fm: M.lacquerChoco });
      cab({ axis: 'y', a1: .64, a2: 2.29, back: 7.17, front: 7.75, h1: .1, h2: .88, cols: [[.6, 1], [.6, 1], [.45, 3]], fm: M.lacquerChoco });
      B(7.19, .02, 8.82, .52, 0, .1, M.carcass); B(7.19, .52, 7.69, 2.27, 0, .1, M.carcass);
      B(7.17, 0, 8.86, .62, .88, .92, M.trav); B(7.17, .62, 7.79, 2.31, .88, .92, M.trav);
      B(7.17, 0, 8.86, .02, .92, 1.5, M.trav); B(7.17, .02, 7.19, 2.31, .92, 1.5, M.trav);
      B(7.86, .06, 8.44, .54, .92, .926, hobAt(7.83, .05)); B(7.865, .58, 8.435, .595, .30, .845, M.blackGlass); B(7.9, .595, 8.4, .612, .79, .802, M.brass);
      B(7.27, .72, 7.65, 1.2, .918, .9215, M.steelDark); C(7.46, .96, .025, .92, .9218, M.blackMetal, { cast: false });
      C(7.21, .96, .028, .92, .97, M.brass); tube([[7.21, .96, .96], [7.23, 1.20, .96], [7.33, 1.30, .96], [7.44, 1.25, .96], [7.47, 1.12, .96]], .011, M.brass, { seg: 48 });
      B(7.71, .66, 7.73, 2.27, .02, .03, M.led, { cast: false }); B(7.21, .54, 8.82, .56, .02, .03, M.led, { cast: false });
      cab({ axis: 'y', a1: 2.31, a2: 2.91, back: 7.17, front: 7.79, h1: .1, h2: 2.6, cols: [[1, 2]], fm: M.lacquerChoco });
      cab({ axis: 'y', a1: 2.93, a2: 3.51, back: 7.17, front: 7.79, h1: .1, h2: 2.6, cols: [[1, 3]], fm: M.lacquerChoco });
      B(7.79, 2.96, 7.805, 3.48, .86, 1.46, M.blackGlass); B(7.805, 3.0, 7.822, 3.44, 1.42, 1.432, M.brass); B(7.19, 2.33, 7.69, 3.49, 0, .1, M.carcass);
      endG();
      beginG('Wall cabinets');
      cab({ axis: 'y', a1: .02, a2: 2.29, back: 7.17, front: 7.52, h1: 1.5, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      cab({ axis: 'x', a1: 7.54, a2: 8.84, back: 0, front: .35, h1: 1.5, h2: 2.6, cols: [[.3, 1], [.6, 1], [.4, 1]], fm: M.lacquerCream });
      B(7.49, .02, 7.53, 2.27, 1.49, 1.5, M.led, { cast: false }); B(7.54, .31, 8.82, .35, 1.49, 1.5, M.led, { cast: false });
      endG();
      beginG('Coffee machine'); RB(7.2, 1.92, 7.6, 2.2, .92, 1.31, .02, M.steel); B(7.6, 1.96, 7.604, 2.16, 1.19, 1.27, M.display); B(7.45, 1.96, 7.65, 2.16, .92, .95, M.steelDark); endG();
      beginG('Air fryer'); RB(8.5, .1, 8.78, .42, .92, 1.24, .05, M.plastic, { seg: 5 }); RB(8.515, .37, 8.765, .435, .935, 1.10, .02, M.plastic); B(8.59, .435, 8.69, .465, 1.0, 1.06, M.blackMetal); endG();
      // kitchen bar as an extension of the kitchen: runs south from the column at exactly the column's width (0.49), U-shape;
      // shallow drawers on the kitchen side, 0.20 knee recess under the top on the room side for 3 stools
      beginG('Kitchen bar');
      cab({ axis: 'y', a1: .24, a2: 1.89, back: 9.15, front: 8.88, h1: .1, h2: .88, cols: [[.55, 3], [.55, 1], [.55, 3]], fm: M.lacquerChoco });
      B(8.90, .26, 9.13, 1.87, 0, .1, M.carcass); B(9.13, .2, 9.15, 1.91, 0, .88, M.walnut);
      B(8.86, .2, 9.35, 1.95, .88, .92, M.trav); B(8.86, 1.91, 9.35, 1.95, 0, .88, M.trav); B(8.86, .2, 9.15, .24, 0, .88, M.lacquerChoco);
      RB(8.95, .9, 9.25, 1.25, .92, .94, .01, M.oakFurn); lathe([[0, 0], [.07, 0], [.14, .05], [.16, .09], [0, .02]], 9.1, 1.65, .92, M.stoneware); [[9.06, 1.63], [9.14, 1.67], [9.1, 1.59]].forEach(([x, y]) => S(x, y, .99, .037, M.fruit));
      [.75, 1.55].forEach(y => { S(9.1, y, 1.75, .1, M.opal, { cast: false }); C(9.1, y, .02, 1.84, 1.87, M.brass); C(9.1, y, .003, 1.87, H, M.blackMetal, { seg: 6 }); C(9.1, y, .04, H - .015, H, M.brass); });
      lamp(9.1, 1.15, 1.55, 0xffd3a0, 4);
      endG();
      [.7, 1.2, 1.7].forEach(y => typed('stool', 0, 9.5, y, FACE.W));
      // laundry tower at the corridor's dead end, against the bathroom wet wall: washer below, dryer above, storage cabinet on top
      beginG('Washer + dryer');
      B(6.43, 2.89, 7.07, 2.91, 0, 2.6, M.oakFurn); B(6.43, 3.58, 7.07, 3.60, 0, 2.6, M.oakFurn); B(6.43, 2.91, 7.07, 3.58, 0, .04, M.oakFurn);
      [[.05, .90], [.93, 1.78]].forEach(([h1, h2], i) => {
        RB(6.46, 2.93, 7.05, 3.56, h1, h2, .02, M.ceramic);
        B(6.452, 2.97, 6.46, 3.52, h2 - .11, h2 - .03, M.blackGlass, { cast: false }); B(6.451, 3.36, 6.453, 3.48, h2 - .09, h2 - .05, M.display, { cast: false });
        add(new THREE.TorusGeometry(.17, .028, 14, 48), M.steel, 6.452, (h1 + h2) / 2 - .04, 3.245, { uv: false, rotY: Math.PI / 2 });
        add(new THREE.CircleGeometry(.16, 48), i ? M.glassTint : M.blackGlass, 6.451, (h1 + h2) / 2 - .04, 3.245, { uv: false, rotY: -Math.PI / 2, cast: false }); });
      B(6.43, 2.91, 7.07, 3.58, 1.80, 1.83, M.oakFurn);
      cab({ axis: 'y', a1: 2.92, a2: 3.57, back: 7.07, front: 6.45, h1: 1.84, h2: 2.6, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      cab({ axis: 'y', a1: 3.60, a2: 4.38, back: 7.07, front: 6.43, h1: 0, h2: 2.6, cols: [[1, 1], [1, 1]], fm: M.lacquerCream }); B(6.43, 3.60, 7.07, 4.38, 2.6, 2.63, M.oakFurn);
      [3.97, 3.99].forEach((y, i) => B(6.415, y + (i ? .02 : -.03), 6.43, y + (i ? .03 : -.02), .85, 1.55, M.brass));
      B(6.43, 2.91, 7.07, 3.58, 2.6, 2.62, M.oakFurn);
      endG();
      // ---- bathroom 6.6 m² re-planned: tub on the west wall, walk-in shower in the north-east niche, WC on the riser shaft, 1.0 m vanity (washer moved to the corridor tower)
      beginG('Bath · tub'); RB(4.69, .48, 5.44, 2.18, 0, .58, .01, M.trav); RB(4.77, .56, 5.36, 2.10, .3, .585, .2, M.resin, { seg: 5 });
      { const g = new THREE.PlaneGeometry(.5, 1.45); g.rotateX(-Math.PI / 2); add(g, M.water, 5.065, .5, 1.33, { uv: false, cast: false }); }
      C(4.78, .62, .02, .58, .9, M.brass); tube([[4.78, .9, .62], [4.84, .95, .62], [4.92, .9, .62]], .012, M.brass); endG();
      beginG('Bath · niche'); [.62, 1.02, 1.42].forEach(h => B(4.70, .02, 4.97, .46, h, h + .025, M.oakFurn));
      [[4.8, .15, .645], [4.8, .32, .645], [4.86, .23, 1.045]].forEach(([x, y, h]) => add(new THREE.CylinderGeometry(.06, .06, .22, 20).rotateZ(Math.PI / 2), M.towel, x, h + .06, y, { uv: false }));
      vase(4.85, .24, 1.445, .3, M.stoneware); endG();
      beginG('Bath · shower'); B(6.29, 0, 7.07, 1.45, 0, .012, M.micro, { cast: false }); B(6.32, 1.32, 7.04, 1.36, .012, .014, M.steelDark, { cast: false });
      B(6.29, .48, 6.302, 1.25, .012, 2.05, M.glass, { cast: false }); B(6.285, .48, 6.307, 1.25, 2.03, 2.05, M.brass); B(6.285, 1.23, 6.307, 1.25, .012, 2.05, M.brass);
      C(6.68, .55, .14, 2.2, 2.22, M.brass); B(6.66, .0, 6.70, .55, 2.2, 2.22, M.brass); B(7.05, .65, 7.068, .85, 1.0, 1.2, M.brass);
      B(7.0, .9, 7.068, 1.25, 1.1, 1.12, M.trav); endG();
      beginG('Bath · shaft cladding'); B(4.98, .48, 6.29, .486, .005, H, M.travSmall, { cast: false }); endG();
      beginG('Bath · WC'); RB(5.70, .48, 6.06, 1.03, .30, .44, .16, M.ceramic, { seg: 6 }); RB(5.705, .51, 6.055, 1.02, .44, .455, .15, M.ceramic, { seg: 6 }); B(5.80, .48, 5.96, .49, .9, 1.06, M.brass); endG();
      beginG('Bath · vanity'); RB(6.62, 1.50, 7.065, 2.75, .45, .82, .015, M.walnut); B(6.60, 1.50, 7.07, 2.75, .82, .85, M.trav);
      [1.82, 2.43].forEach(y => { lathe([[0, 0], [.16, 0], [.19, .04], [.19, .13], [.18, .13], [.16, .05], [0, .03]], 6.84, y, .85, M.ceramic, { sx: .85, sz: 1 });
        tube([[7.065, 1.1, y], [6.98, 1.1, y], [6.95, 1.08, y]], .01, M.brass); B(7.03, y - .27, 7.065, y + .27, 1.15, 1.95, M.mirror); B(7.025, y - .29, 7.035, y + .29, 1.13, 1.97, M.led, { cast: false }); });
      B(6.64, 1.52, 7.06, 1.54, .42, .44, M.led, { cast: false }); lamp(6.8, 2.12, 1.6, 0xffe2c0, 2.5); endG();
      beginG('Bath · radiator'); [4.8, 5.25].forEach(x => C(x, 2.74, .012, .3, 1.5, M.brass, { seg: 10 })); for (let i = 0; i < 7; i++) add(new THREE.CylinderGeometry(.01, .01, .45, 8).rotateZ(Math.PI / 2), M.brass, 5.025, .38 + i * .18, 2.74, { uv: false });
      RB(4.85, 2.70, 5.2, 2.76, .95, 1.45, .02, M.towel); endG();
      beginG('Bath · mat'); RB(5.55, 1.3, 6.25, 1.75, .008, .02, .04, M.towel, { cast: false }); endG();
      // ---- guest WC 3.0 m² → full shower room: 0.80 corner shower, wall-hung WC, compact basin
      beginG('Shower room · shower'); B(7.06, 7.39, 7.86, 9.06, 0, .025, M.micro, { cast: false }); B(7.10, 7.46, 7.14, 9.0, .025, .027, M.steelDark, { cast: false });
      B(7.855, 7.39, 7.867, 7.93, .025, 2.0, M.glass, { cast: false }); B(7.872, 7.95, 7.884, 8.50, .025, 2.0, M.glass, { cast: false }); B(7.855, 8.52, 7.867, 9.06, .025, 2.0, M.glass, { cast: false });
      B(7.84, 7.39, 7.89, 9.06, 1.98, 2.0, M.brass); [7.94, 8.51].forEach(y => B(7.84, y - .01, 7.89, y + .01, .025, 2.0, M.brass));
      B(7.867, 7.85, 7.887, 7.87, .85, 1.35, M.brass); B(7.867, 8.58, 7.887, 8.60, .85, 1.35, M.brass);
      C(7.46, 8.22, .14, 2.15, 2.17, M.brass); B(7.06, 8.20, 7.46, 8.24, 2.15, 2.17, M.brass); B(7.06, 8.12, 7.08, 8.32, 1.0, 1.2, M.brass); B(7.06, 8.62, 7.09, 8.96, 1.1, 1.12, M.trav); endG();
      beginG('Shower room · WC'); RB(8.18, 8.51, 8.54, 9.06, .30, .44, .16, M.ceramic, { seg: 6 }); RB(8.185, 8.52, 8.535, 9.03, .44, .455, .15, M.ceramic, { seg: 6 }); B(8.28, 9.05, 8.44, 9.06, .9, 1.06, M.brass); endG();
      beginG('Shower room · basin'); RB(8.50, 7.75, 8.86, 8.20, .62, .85, .015, M.walnut); lathe([[0, 0], [.12, 0], [.14, .04], [.14, .11], [.13, .11], [.11, .04], [0, .03]], 8.68, 7.98, .85, M.ceramic);
      tube([[8.86, 1.06, 7.98], [8.79, 1.06, 7.98], [8.77, 1.04, 7.98]], .009, M.brass);
      add(new THREE.CircleGeometry(.22, 64), M.mirror, 8.855, 1.55, 7.98, { uv: false, rotY: -Math.PI / 2 }); add(new THREE.TorusGeometry(.225, .012, 12, 64), M.led, 8.854, 1.55, 7.98, { uv: false, rotY: -Math.PI / 2 });
      [8.42, 8.62].forEach(y => C(8.845, y, .015, 1.6, 1.62, M.brass, { seg: 10 })); RB(8.82, 8.37, 8.86, 8.67, 1.0, 1.58, .02, M.towel); lamp(7.96, 7.9, 2.5, 0xffe2c0, 3); endG();
      // ---- bedroom 2: wardrobe moved to the free part of the south wall (2.11 m), desk to the north wall where the wardrobe was
      // bedroom 2: built-in hinged wardrobe on the free south wall beside the bed (2.11 m × 0.60)
      beginG('Wardrobe (B2, south wall)'); cab({ axis: 'x', a1: 2.95, a2: 5.06, back: 7.13, front: 6.53, h1: 0, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      B(2.95, 6.53, 5.06, 7.13, 2.6, 2.63, M.oakFurn); [3.47, 3.48, 4.0, 4.01, 4.53, 4.54].forEach((x, i) => B(x + (i % 2 ? .02 : -.03), 6.515, x + (i % 2 ? .03 : -.02), 6.53, .85, 1.55, M.brass)); endG();
      typed('desk', 0, 2.9, 4.43, FACE.N); typed('deskchair', 0, 2.9, 5.05, FACE.N);
      // ---- main balcony (off the studio): outdoor lounge · dining for 4 · sun corner with herb garden
      beginG('Terrace sofa'); RB(13.92, .15, 14.72, 1.75, 0, .38, .03, M.oakFurn); RB(13.92, .15, 14.12, 1.75, .38, .78, .03, M.oakFurn);
      RB(14.12, .2, 14.70, .97, .38, .52, .05, M.linenOut, { seg: 5 }); RB(14.12, .98, 14.70, 1.70, .38, .52, .05, M.linenOut, { seg: 5 });
      RB(14.12, .2, 14.30, .97, .52, .86, .05, M.linenOut, { seg: 5 }); RB(14.12, .98, 14.30, 1.70, .52, .86, .05, M.linenOut, { seg: 5 });
      pillow(14.36, .55, .66, .4, .14, .4, M.velvetTerra, 1.2, Math.PI / 2); pillow(14.36, 1.45, .66, .4, .14, .4, M.velvetSage, 1.2, Math.PI / 2); endG();
      typed('coffee', 0, 15.15, .95);
      typed('dining', 5, 14.85, 3.6, FACE.E); [[14.23, 3.25, FACE.E], [14.23, 3.95, FACE.E], [15.47, 3.25, FACE.W], [15.47, 3.95, FACE.W]].forEach(([x, y, f]) => typed('chair', 4, x, y, f));
      diningDecor(14.85, 3.6);
      beginG('Terrace herb garden'); RB(14.0, 6.72, 15.62, 7.05, 0, .62, .02, M.concrete); for (let i = 0; i < 6; i++) { pot(14.15 + i * .27, 6.88, .09, .07, .2, M.stoneware); } snake(14.4, 6.88, .5); snake(15.2, 6.88, .45); endG();
      typed('armchair', 4, 14.45, 6.0, FACE.S); typed('armchair', 4, 15.25, 6.0, FACE.S); typed('sidetable', 0, 14.85, 6.15);
      beginG('Terrace planter'); pot(15.45, .3, .24, .18, .55, M.stonewareDark); olive(15.45, .3, 1.1); endG();
      beginG('Terrace planter'); pot(15.45, 2.2, .2, .16, .5, M.stoneware); fig(15.45, 2.2, .85); endG();
      // walk-in closet (bedroom 1): open hanging on all three sides (no doors), top shelves, LED, pendant; bedroom 1 re-planned around it
      beginG('Walk-in closet');
      const cloth = [M.linenWhite, M.linenSand, M.velvetChoco, M.boucleOat, M.linenSage, M.velvetTerra, M.book2, M.paper, M.velvetSage, M.rugDark];
      const hangY = (x1, x2, y1, y2, h, len) => { // face-out hanging in a 0.30 m deep unit: hooks every 0.48 m, garments parallel to the wall
        const n = Math.max(1, Math.floor((y2 - y1) / .48)), step = (y2 - y1) / n; let k = 0;
        for (let i = 0; i < n; i++) { const yc = y1 + step * (i + .5); add(new THREE.CylinderGeometry(.01, .01, x2 - x1 - .02, 10).rotateZ(Math.PI / 2), M.brass, (x1 + x2) / 2, h, yc, { uv: false });
          for (let j = 0; j < 4; j++) { const x = x1 + .05 + j * .055; B(x, yc - .21, x + .03, yc + .21, h - .03 - len * (.8 + .2 * rand()), h - .03, cloth[(k++ * 7 + i * 3) % cloth.length]); } } };
      const hangX = (x1, x2, y1, y2, h, len) => {
        const n = Math.max(1, Math.floor((x2 - x1) / .48)), step = (x2 - x1) / n; let k = 0;
        for (let i = 0; i < n; i++) { const xc = x1 + step * (i + .5); add(new THREE.CylinderGeometry(.01, .01, y2 - y1 - .02, 10).rotateX(Math.PI / 2), M.brass, xc, h, (y1 + y2) / 2, { uv: false });
          for (let j = 0; j < 4; j++) { const y = y1 + .05 + j * .055; B(xc - .21, y, xc + .21, y + .03, h - .03 - len * (.8 + .2 * rand()), h - .03, cloth[(k++ * 7 + i * 3) % cloth.length]); } } };
      // east side: long hanging | double rail | long hanging
      [.32, 1.0, 1.95, 2.91].forEach(y => B(4.29, y, 4.59, y + .025, 0, 2.6, M.oakFurn));
      B(4.29, .02, 4.59, 2.935, 2.25, 2.28, M.oakFurn); B(4.29, .02, 4.59, 2.935, 2.57, 2.6, M.oakFurn);
      hangY(4.29, 4.59, .345, 1.0, 2.15, 1.45); hangY(4.29, 4.59, 1.025, 1.95, 2.15, .85); hangY(4.29, 4.59, 1.025, 1.95, 1.12, .8); hangY(4.29, 4.59, 1.975, 2.91, 2.15, 1.45);
      // west side: shallow 0.25 m open shelving (folded clothes, bags, shoes) so all three sides carry storage
      [.6, 1.75, 2.9].forEach(y => B(3.29, y, 3.54, y + .025, 0, 2.6, M.oakFurn));
      for (let i = 0; i < 7; i++) { const h = .08 + i * .36; B(3.29, .6, 3.54, 2.925, h, h + .025, M.oakFurn);
        let y = .66; while (y < 2.85) { const w = .18 + rand() * .14; if (y + w > 1.72 && y < 1.8) { y = 1.8; continue; } if (y + w > 2.88) break;
          RB(3.31, y, 3.52, y + w, h + .025, h + .025 + (i < 2 ? .12 : .1 + rand() * .1), .015, cloth[(i * 5 + Math.floor(y * 11)) % cloth.length]); y += w + .03; } }
      B(3.53, .62, 3.54, 2.9, 2.5, 2.52, M.led, { cast: false });
      // north end: hanging across, shoe shelves below
      B(3.29, .02, 4.59, .32, 2.25, 2.28, M.oakFurn); B(3.29, .02, 4.59, .32, 2.57, 2.6, M.oakFurn); hangX(3.54, 4.59, .02, .32, 2.15, .95);
      [.08, .32].forEach(h => { B(3.54, .02, 4.59, .30, h, h + .025, M.oakFurn); for (let k = 0; k < 4; k++) RB(3.62 + k * .24, .05, 3.80 + k * .24, .27, h + .025, h + .12, .02, [M.carcass, M.paper, M.rattanDark, M.velvetChoco][k]); });
      // boxes on the top shelves
      [[3.6, .04], [4.32, .5], [4.32, 1.6], [4.32, 2.4]].forEach(([x, y], i) => i ? RB(x, y, x + .25, y + .4, 2.28, 2.5, .02, M.linenSand) : RB(x, y, x + .4, y + .25, 2.28, 2.5, .02, M.linenSand));
      B(4.29, .35, 4.30, 2.9, 2.2, 2.24, M.led, { cast: false });
      S(3.66, 1.6, 2.5, .14, M.opal, { cast: false }); C(3.66, 1.6, .003, 2.62, H, M.blackMetal, { seg: 6 }); lamp(3.66, 1.6, 2.3, 0xffe6c8, 3);
      RB(3.62, .45, 4.24, 2.88, 0, .012, .15, M.rug, { cast: false });
      endG();
      // sliding entrance door (arched top, on a brass rail on the bedroom side), drawn a third open
      beginG('Closet door');
      { const w = .76, hs = 2.05, r = .3, x0 = 3.83; const sh = new THREE.Shape(); sh.moveTo(x0, 0); sh.lineTo(x0 + w, 0); sh.lineTo(x0 + w, hs); sh.absarc(x0 + w - r, hs, r, 0, Math.PI / 2, false); sh.lineTo(x0 + r, hs + r); sh.absarc(x0 + r, hs, r, Math.PI / 2, Math.PI, false); sh.lineTo(x0, 0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: .035, bevelEnabled: false, curveSegments: 24 }); g.translate(0, .01, 3.062); add(g, M.lacquerCream, 0, 0, 0);
        B(x0 + .1, 3.1, x0 + w - .1, 3.104, .2, .23, M.skirting); B(x0 + .1, 3.1, x0 + w - .1, 3.104, 1.9, 1.93, M.skirting); B(x0 + .1, 3.1, x0 + .13, 3.104, .23, 1.9, M.skirting); B(x0 + w - .13, 3.1, x0 + w - .1, 3.104, .23, 1.9, M.skirting);
        B(x0 + .05, 3.1, x0 + .07, 3.13, .85, 1.35, M.brass); }
      B(3.25, 3.06, 4.58, 3.10, 2.40, 2.43, M.brass);
      endG();
      // bedroom 1 re-planned: headboard on the closet partition, bed faces west to the balcony door + window
      beginG('Bed (B1)'); bed(0, 0, 1.60, 2.00, 1, M.velvetTerra, M.linenSand, M.velvetSage);
      { const g = state.CUR; endG(); g.rotation.y = -Math.PI / 2; g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g);
        g.position.x += 3.185 - bb.max.x; g.position.z += 1.62 - (bb.min.z + bb.max.z) / 2; g.userData.home = { x: g.position.x, z: g.position.z, r: g.rotation.y }; }
      G('Nightstand', () => nightstand(2.95, .44)); G('Nightstand', () => nightstand(2.95, 2.80));
      beginG('Wall art (B1)'); artFrame('x', 0, 1, 1.2, 1.9, 1.28, 2.28, artAt(art1Tex, 1.29, 1.37, .52, .82)); endG();
      G('Rug (B1)', () => RB(.75, .45, 2.95, 2.79, 0, .014, .3, M.rug, { cast: false }));
      beginG('Beauty table (B1)'); RB(.6, 3.52, 1.7, 3.98, .72, .75, .008, M.walnut); cab({ axis: 'x', a1: .62, a2: 1.68, back: 3.98, front: 3.54, h1: .6, h2: .72, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      [.66, 1.64].forEach(x => C(x, 3.56, .012, 0, .6, M.brass, { seg: 12 }));
      add(new THREE.CircleGeometry(.36, 96), M.mirror, 1.15, 1.45, 3.975, { uv: false, rotY: Math.PI }); add(new THREE.TorusGeometry(.365, .014, 16, 96), M.led, 1.15, 1.45, 3.974, { uv: false, rotY: Math.PI });
      vase(1.45, 3.8, .75, .5, M.stoneware); lamp(1.15, 3.7, 1.4, 0xffe6c8, 1.4); endG();
      beginG('Beauty organiser (B1)'); cab({ axis: 'x', a1: 1.72, a2: 2.12, back: 3.98, front: 3.60, h1: .08, h2: .72, cols: [[1, 3]], fm: M.lacquerCream }); RB(1.70, 3.58, 2.14, 3.98, .72, .75, .008, M.walnut);
        [1.0, 1.25].forEach(h => B(1.72, 3.74, 2.12, 3.98, h, h + .02, M.oakFurn)); B(1.72, 3.74, 1.74, 3.98, .75, 1.27, M.oakFurn); B(2.10, 3.74, 2.12, 3.98, .75, 1.27, M.oakFurn);
        [[1.79, 3.85, .75, .16, M.ceramic], [1.88, 3.82, .75, .11, M.brass], [1.97, 3.86, .75, .2, M.glassTint], [2.05, 3.83, .75, .09, M.blackGlass], [1.80, 3.86, 1.02, .13, M.glassTint], [1.92, 3.85, 1.02, .08, M.ceramic], [2.03, 3.86, 1.02, .15, M.paper], [1.85, 3.86, 1.27, .1, M.brass], [2.0, 3.86, 1.27, .17, M.ceramic]]
          .forEach(([x, y, h, t, m]) => C(x, y, .028, h, h + t, m, { seg: 14 })); endG();
      G('Vanity stool', () => { lathe([[0, 0], [.17, 0], [.17, .01], [.03, .03], [.025, .36], [0, .36]], 1.15, 3.22, 0, M.brass); lathe([[0, .36], [.17, .36], [.18, .38], [.18, .43], [.16, .46], [0, .465]], 1.15, 3.22, 0, M.velvetTerra); });
      // lounge: corner sofa (chaise on the kitchen side) faces the TV wall
      beginG('TV wall panel'); B(11.05, 4.285, 13.55, 4.32, 0, 2.7, M.walnut);
      { const geos = [], N = 50, w = 2.5 / N; for (let i = 0; i < N; i++) { const g = new THREE.CylinderGeometry(w / 2, w / 2, 2.7, 12, 1, true, Math.PI / 2, Math.PI); g.translate(11.05 + w / 2 + i * w, 1.35, 4.285); geos.push(g); } merged(geos, M.walnut, { clampMesh: true }); }
      B(11.03, 4.26, 11.05, 4.32, 0, 2.7, M.led, { cast: false }); B(13.55, 4.26, 13.57, 4.32, 0, 2.7, M.led, { cast: false }); endG();
      beginG('TV + console'); cab({ axis: 'x', a1: 11.45, a2: 13.15, back: 4.26, front: 3.88, h1: .24, h2: .52, cols: [[1, 1], [1, 1], [1, 1]], fm: M.walnut });
      B(11.5, 3.92, 13.1, 4.22, .22, .225, M.led, { cast: false }); B(11.58, 4.23, 13.02, 4.26, .98, 1.8, M.blackMetal);
      B(11.6, 4.227, 13.0, 4.23, 1.0, 1.78, P({ color: 0x050506, roughness: .08, clearcoat: 1, emissive: 0xffffff, emissiveMap: planar(tvTex, 11.6, 1.0, 1.40, .78, true), emissiveIntensity: 0, nightIntensity: 1.6 }), { cast: false });
      RB(11.8, 3.95, 12.8, 4.06, .52, .58, .02, M.blackMetal); vase(11.59, 4.06, .52, .9, M.stoneware); book(12.96, 4.06, .52, .22, .16, .035, M.book1, .1); lamp(12.3, 3.8, 1.3, 0x9fc4ff, .8); endG();
      typed('sofa', 6, 12.2, .47, FACE.S, { W: 2.7 }); typed('coffee', 6, 12.65, 1.6);
      typed('armchair', 3, 13.1, 3.0, faceTo(13.1, 3.0, 12.3, 1.2)); typed('floorlamp', 0, 10.55, .35);
      livingRug(12.25, 1.55, 1.35, 1.0);
      // dining for 4 by the open hall passage
      typed('dining', 5, 9.9, 3.87); [[9.55, 3.25, FACE.S], [10.25, 3.25, FACE.S], [8.92, 3.87, FACE.E], [10.88, 3.87, FACE.W]].forEach(([x, y, f]) => typed('chair', 0, x, y, f));
      diningDecor(9.9, 3.87);
      // one big built-in desk: wall to wall between the shaft and the east wall, open shelves + cabinets above, LED under the shelves
      beginG('Built-in desk');
      B(10.88, 6.45, 10.92, 7.13, 0, 2.6, M.oakFurn); B(13.58, 6.45, 13.62, 7.13, 0, 2.6, M.oakFurn);
      B(10.92, 6.45, 13.58, 7.13, .72, .76, M.oakFurn); B(10.92, 7.10, 13.58, 7.13, .76, 1.55, M.oakFurn);
      cab({ axis: 'x', a1: 10.94, a2: 11.44, back: 7.10, front: 6.50, h1: .06, h2: .72, cols: [[1, 3]], fm: M.lacquerCream });
      cab({ axis: 'x', a1: 13.06, a2: 13.56, back: 7.10, front: 6.50, h1: .06, h2: .72, cols: [[1, 3]], fm: M.lacquerCream });
      B(10.92, 6.80, 13.58, 7.13, 1.55, 1.58, M.oakFurn); B(10.92, 6.80, 13.58, 7.13, 1.95, 1.98, M.oakFurn);
      cab({ axis: 'x', a1: 10.92, a2: 13.58, back: 7.13, front: 6.78, h1: 2.0, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      B(10.94, 6.80, 13.56, 6.83, 1.535, 1.55, M.led, { cast: false });
      [[11.95, M.book1], [12.15, M.book3], [13.2, M.book2]].forEach(([x, m], i) => { for (let k = 0; k < 6; k++) B(x + k * .035, 6.85, x + k * .035 + .03, 7.08, 1.58, 1.80 + (k % 3) * .03, [m, M.paper, M.book3][k % 3]); });
      vase(11.3, 6.95, 1.58, .5, M.stoneware); vase(12.8, 6.95, 1.98, .6, M.stonewareDark);
      [11.75, 12.85].forEach(x => { B(x - .3, 6.92, x + .3, 6.95, 1.0, 1.36, M.blackMetal); B(x - .28, 6.919, x + .28, 6.92, 1.02, 1.34, M.laptop, { cast: false }); B(x - .03, 6.93, x + .03, 7.0, .76, 1.0, M.blackMetal); B(x - .12, 6.88, x + .12, 7.05, .76, .77, M.blackMetal); B(x - .22, 6.62, x + .22, 6.76, .76, .775, M.carcass); });
      lamp(12.3, 6.8, 1.45, 0xffe2c0, 3);
      endG();
      typed('deskchair', 0, 11.75, 6.0, FACE.S); typed('deskchair', 0, 12.85, 6.0, FACE.S);
      beginG('Bookshelf'); B(9.27, 6.30, 10.86, 6.64, 0, .04, M.oakFurn); B(9.27, 6.30, 9.30, 6.64, 0, 2.4, M.oakFurn); B(10.83, 6.30, 10.86, 6.64, 0, 2.4, M.oakFurn); B(10.04, 6.30, 10.07, 6.64, 0, 2.4, M.oakFurn);
      [.45, .85, 1.25, 1.65, 2.05, 2.37].forEach(h => B(9.27, 6.30, 10.86, 6.64, h, h + .03, M.oakFurn));
      const bm = [M.book1, M.book2, M.book3, M.paper]; [.48, .88, 1.28, 1.68].forEach((h, r) => { let x = 9.33; while (x < 10.75) { const w = .025 + rand() * .03, hh = .22 + rand() * .1; if (x + w > 10.0 && x < 10.1) { x = 10.1; continue; } B(x, 6.36, x + w, 6.6, h, h + hh, bm[(r + Math.floor(x * 37)) % 4]); x += w + .004; } });
      vase(10.45, 6.47, 2.08, .6, M.stonewareDark); endG();
      typed('armchair', 2, 10.0, 5.5, faceTo(10.0, 5.5, 11.5, 5.4)); typed('floorlamp', 0, 9.2, 5.95);
      beginG('Office rug'); RB(10.7, 4.85, 13.3, 6.35, 0, .012, .05, M.rug, { cast: false }); endG();
    } },
};
export function applyLayout() { // builds the Soft classic plan once at start-up
  const L = LAYOUTS.soft;
  buildArchVar();
  L.build(); L.plants();
  emissives.forEach(m => m.emissiveIntensity = state.night ? m.userData.night : m.userData.day);
  world.updateMatrixWorld(true);
  world.traverse(o => { if (o.isMesh && !o.userData.clamp && o.userData.minY === undefined) { const bb = new THREE.Box3().setFromObject(o); o.userData.minY = bb.min.y; o.userData.maxY = bb.max.y; } });
  scene.traverse(o => { if (o.isPointLight) o.visible = state.night; });
  loadTypes(); loadLayout(); loadStyle();
  zoneLabels(L); attachLabels();
  renderPlanNotes(); rebuildPT();
}
