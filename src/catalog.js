import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { movables, state } from './scene.js';
import { lamp } from './lighting.js';
import { M } from './materials.js';
import { B, C, RB, S, add, beginG, drape, endGRaw, lathe, pillow, pillowGeo, sector, tube } from './primitives.js';
import { cab } from './furniture/storage.js';
import { book, vase } from './furniture/decor.js';
import { barStool, shellChair, taskChair } from './furniture/chairs.js';
import { select } from './ui/editor.js';
import { applyPart, partsOf } from './ui/style.js';


/* ================= furniture designs (Swap designs mode) ================= */
// every design is built around (0,0) in plan; the sitter / front faces -y (north) at rotation 0
export const faceTo = (x, y, tx, ty) => Math.atan2(-(tx - x), -(ty - y));
const legs4 = (x1, y1, x2, y2, h, r, m, inset = .06, rt) => [[x1 + inset, y1 + inset], [x2 - inset, y1 + inset], [x1 + inset, y2 - inset], [x2 - inset, y2 - inset]].forEach(([x, y]) => C(x, y, r, 0, h, m, { seg: 14, rt: rt ?? r }));
function cylAlong(axis, x, y, h, r, len, m) { const g = new THREE.CylinderGeometry(r, r, len, 28); axis === 'x' ? g.rotateZ(Math.PI / 2) : g.rotateX(Math.PI / 2); return add(g, m, x, h, y); }
export const DESIGNS = {
  sofa: { label: 'Sofa', items: [
    { name: 'Bouclé modern', info: '2.20 × 0.90 · 3 seats', build: (o) => { const W = o.W || 2.2, x1 = -W / 2, x2 = W / 2, y1 = -.45, y2 = .45;
      B(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); RB(x1, y1, x2, y2, .08, .36, .04, M.boucle);
      RB(x1, y1, x1 + .18, y2, .08, .62, .06, M.boucle, { seg: 5 }); RB(x2 - .18, y1, x2, y2, .08, .62, .06, M.boucle, { seg: 5 });
      const n = W >= 2 ? 3 : 2, w = (W - .36) / n;
      for (let i = 0; i < n; i++) { const a = x1 + .18 + i * w + .01, b = a + w - .02; RB(a, y1 + .02, b, y2 - .28, .34, .50, .06, M.boucle, { seg: 5 }); RB(a, y2 - .27, b, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); }
      pillow(x1 + .44, .09, .64, .44, .15, .44, M.velvetTerra, 1.2, Math.PI); pillow(x2 - .44, .09, .64, .44, .15, .44, M.velvetSage, 1.2, Math.PI);
      drape(x2 - .18, y1 + .1, x2 + .01, y1 + .55, .64, .14, .05, 1, M.velvetChoco); } },
    { name: 'Chesterfield', info: '2.10 × 0.92 · tufted velvet', build: (o) => { const W = o.W || 2.1, x1 = -W / 2, x2 = W / 2, y1 = -.46, y2 = .46;
      [[x1 + .08, y1 + .08], [x2 - .08, y1 + .08], [x1 + .08, y2 - .08], [x2 - .08, y2 - .08]].forEach(([x, y]) => lathe([[0, 0], [.03, 0], [.045, .04], [.035, .09], [0, .09]], x, y, 0, M.walnut));
      RB(x1, y1, x2, y2, .09, .42, .02, M.velvetChoco);
      [x1 + .11, x2 - .11].forEach(x => { RB(x - .11, y1, x + .11, y2, .09, .62, .02, M.velvetChoco); cylAlong('y', x, 0, .64, .13, y2 - y1, M.velvetChoco); });
      RB(x1 + .2, y2 - .22, x2 - .2, y2, .42, .78, .02, M.velvetChoco); cylAlong('x', 0, y2 - .12, .78, .11, W - .3, M.velvetChoco);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) S(x1 + .3 + i * (W - .6) / 8 + (r ? (W - .6) / 16 : 0), y2 - .225, .52 + r * .14, .012, M.velvetChoco);
      RB(x1 + .22, y1 + .03, x2 - .22, y2 - .22, .42, .56, .05, M.velvetChoco, { seg: 5 });
      pillow(x1 + .5, .1, .66, .42, .14, .42, M.linenSand, 1.2, Math.PI); } },
    { name: 'Mid-century', info: '1.90 × 0.85 · on walnut legs', build: (o) => { const W = o.W || 1.9, x1 = -W / 2, x2 = W / 2, y1 = -.425, y2 = .425;
      [[x1 + .08, y1 + .08], [x2 - .08, y1 + .08], [x1 + .08, y2 - .08], [x2 - .08, y2 - .08], [0, y1 + .08], [0, y2 - .08]].forEach(([x, y]) => C(x, y, .022, 0, .2, M.walnut, { rt: .014, seg: 12 }));
      B(x1, y1, x2, y2, .2, .24, M.walnut); RB(x1 + .02, y1 + .02, x2 - .02, y2 - .02, .24, .38, .02, M.linenSand);
      RB(x1, y1, x1 + .09, y2, .24, .6, .02, M.linenSand); RB(x2 - .09, y1, x2, y2, .24, .6, .02, M.linenSand);
      const w = (W - .2) / 2; for (let i = 0; i < 2; i++) { const a = x1 + .1 + i * w + .005, b = a + w - .01;
        RB(a, y1 + .03, b, y2 - .22, .38, .5, .03, M.linenSand, { seg: 4 }); RB(a, y2 - .21, b, y2 - .03, .4, .82, .03, M.linenSand, { seg: 4 });
        [.55, .7].forEach(h => S((a + b) / 2, y2 - .215, h, .012, M.linenSand)); }
      pillow(x1 + .4, .05, .62, .4, .13, .4, M.velvetTerra, 1.25, Math.PI); } },
    { name: 'Cloud modular', info: '2.30 × 1.05 · deep & low', build: (o) => { const W = o.W || 2.3, x1 = -W / 2, x2 = W / 2, y1 = -.525, y2 = .525;
      RB(x1, y1, x2, y2, 0, .28, .1, M.boucle, { seg: 5 });
      [x1 + .16, x2 - .16].forEach(x => { const g = pillowGeo(.34, .58, 1.0, .5); add(g, M.boucle, x, .32, 0); });
      const w = (W - .34) / 3; for (let i = 0; i < 3; i++) {
        add(pillowGeo(w - .02, .24, .78, .6), M.boucle, x1 + .17 + w * i + w / 2, .38, y1 + .41);
        pillow(x1 + .17 + w * i + w / 2, y2 - .17, .58, w - .04, .26, .5, M.boucle, 1.35, Math.PI); }
      pillow(x1 + .55, -.05, .62, .4, .14, .4, M.velvetSage, 1.2, Math.PI); } },
    { name: 'Corner chaise (L)', info: '2.20 × 2.10 · chaise on the left', build: (o) => { const x1 = -1.1, x2 = 1.1, y1 = -.45, y2 = .45, cy1 = -1.65, cx2 = -.2;
      B(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); B(x1 + .07, cy1 + .07, cx2 - .07, y1 + .07, 0, .08, M.carcass);
      RB(x1, y1, x2, y2, .08, .36, .04, M.boucle); RB(x1, cy1, cx2, y1 + .02, .08, .36, .04, M.boucle);
      RB(x2 - .18, y1, x2, y2, .08, .62, .06, M.boucle, { seg: 5 });
      RB(x1 + .02, y2 - .27, x1 + .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .29, y2 - .27, .07, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); RB(.09, y2 - .27, x2 - .2, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .02, cy1 + .05, x1 + .27, -.6, .34, .84, .07, M.boucle, { seg: 5 }); RB(x1 + .02, -.58, x1 + .27, y2 - .29, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .29, cy1 + .02, cx2 - .02, y1 - .01, .34, .50, .06, M.boucle, { seg: 5 });
      [[x1 + .29, .12], [.14, x2 - .2]].forEach(([a, b]) => RB(a, y1 + .01, b, y2 - .29, .34, .50, .06, M.boucle, { seg: 5 }));
      pillow(-.35, .05, .64, .46, .15, .46, M.velvetTerra, 1.2, Math.PI); pillow(-.65, .0, .64, .46, .15, .46, M.velvetSage, 1.2, Math.PI * .75);
      pillow(-.68, -1.15, .64, .42, .15, .42, M.velvetToffee, 1.2, Math.PI / 2); } },
    { name: 'Curved', info: '2.30 wide · arc back', build: () => { const cy = -1.7, A = .62, a1 = Math.PI / 2 - A, a2 = Math.PI / 2 + A;
      sector(0, cy, 1.25, 1.95, a1 + .02, a2 - .02, 0, .08, M.carcass, .01); sector(0, cy, 1.15, 2.05, a1, a2, .08, .34, M.boucleOat, .05);
      sector(0, cy, 1.18, 1.8, a1 + .1, a2 - .1, .33, .5, M.boucleOat, .06); sector(0, cy, 1.76, 2.03, a1, a2, .33, .84, M.boucleOat, .075);
      [-.3, 0, .3].forEach((d, i) => { const a = Math.PI / 2 + d, r = 1.7; pillow(r * Math.cos(a), cy + r * Math.sin(a), .64, .42, .15, .42, [M.velvetTerra, M.linenSand, M.velvetSage][i], 1.2, Math.atan2(-Math.cos(a), -Math.sin(a))); }); } } ,
    { name: 'Corner chaise (R)', info: '2.20 × 2.10 · chaise on the right', build: (o) => { const X = v => -v, R = (a, b, c, d, h1, h2, r, m, o) => RB(Math.min(X(a), X(b)), c, Math.max(X(a), X(b)), d, h1, h2, r, m, o), BB = (a, b, c, d, h1, h2, m) => B(X(a), b, X(c), d, h1, h2, m);
      const W = o.W || 2.2, x1 = -W / 2, x2 = W / 2, y1 = -.45, y2 = .45, cy1 = -1.65, cx2 = x1 + .9;
      BB(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); BB(x1 + .07, cy1 + .07, cx2 - .07, y1 + .07, 0, .08, M.carcass);
      R(x1, x2, y1, y2, .08, .36, .04, M.boucle); R(x1, cx2, cy1, y1 + .02, .08, .36, .04, M.boucle);
      R(x2 - .18, x2, y1, y2, .08, .62, .06, M.boucle, { seg: 5 });
      R(x1 + .02, x1 + .27, y2 - .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      { const a = x1 + .29, b = x2 - .2, n = Math.max(2, Math.round((b - a) / .66)), w = (b - a) / n;
        for (let i = 0; i < n; i++) { const p = a + i * w + (i ? .01 : 0), q = a + (i + 1) * w - (i < n - 1 ? .01 : 0);
          R(p, q, y2 - .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); R(p, q, y1 + .01, y2 - .29, .34, .50, .06, M.boucle, { seg: 5 }); } }
      R(x1 + .02, x1 + .27, cy1 + .05, -.6, .34, .84, .07, M.boucle, { seg: 5 }); R(x1 + .02, x1 + .27, -.58, y2 - .29, .34, .84, .07, M.boucle, { seg: 5 });
      R(x1 + .29, cx2 - .02, cy1 + .02, y1 - .01, .34, .50, .06, M.boucle, { seg: 5 });
      pillow(-(x1 + 1.45), .05, .64, .46, .15, .46, M.velvetTerra, 1.2, Math.PI); pillow(-(x1 + 1.75), .0, .64, .46, .15, .46, M.velvetSage, 1.2, -Math.PI * .75);
      pillow(-(x1 + .42), -1.15, .64, .42, .15, .42, M.velvetToffee, 1.2, -Math.PI / 2); } } ] },
  coffee: { label: 'Coffee table', items: [
    { name: 'Travertine slab', info: '0.80 × 0.45 × 0.38', build: () => { B(-.34, -.165, .34, .165, .01, .30, M.walnut); RB(-.4, -.225, .4, .225, .30, .38, .012, M.trav); book(-.2, -.05, .38, .22, .16, .03, M.book2, .2); S(.22, .01, .43, .045, M.stonewareDark); } },
    { name: 'Round marble', info: 'Ø0.70 × 0.38', build: () => { lathe([[0, 0], [.2, 0], [.21, .02], [.12, .08], [.08, .3], [0, .3]], 0, 0, 0, M.brass); lathe([[0, .3], [.35, .3], [.35, .38], [0, .38]], 0, 0, 0, M.marble, { seg: 96 }); vase(.1, .05, .38, .6, M.ceramic); } },
    { name: 'Oval walnut', info: '1.00 × 0.55 × 0.36', build: () => { lathe([[0, .32], [.5, .32], [.5, .36], [0, .36]], 0, 0, 0, M.walnut, { sz: .55, seg: 96 }); [[-.32, -.12], [.32, -.12], [0, .17]].forEach(([x, y]) => C(x, y, .025, 0, .32, M.walnut, { rt: .018, seg: 12 })); book(-.15, 0, .36, .2, .15, .03, M.book1, .3); } },
    { name: 'Glass & brass', info: '0.90 × 0.50 × 0.40', build: () => { const x = .45, y = .25; [[-x, -y], [x, -y], [-x, y], [x, y]].forEach(([a, b]) => B(a - .01, b - .01, a + .01, b + .01, 0, .4, M.brass));
      [-y, y].forEach(b => { B(-x, b - .01, x, b + .01, .38, .4, M.brass); B(-x, b - .01, x, b + .01, .08, .1, M.brass); }); [-x, x].forEach(a => { B(a - .01, -y, a + .01, y, .38, .4, M.brass); });
      B(-x + .01, -y + .01, x - .01, y - .01, .39, .402, M.glassTint, { cast: false }); B(-x + .01, -y + .01, x - .01, y - .01, .09, .11, M.oakFurn); S(.15, .05, .44, .04, M.stonewareDark); } },
    { name: 'Nesting pair', info: 'Ø0.55 + Ø0.40', build: () => { [[-.12, 0, .275, .42], [.24, .12, .2, .34]].forEach(([x, y, r, h]) => { C(x, y, r, h - .025, h, M.oakFurn, { seg: 64 }); [0, 2.09, 4.19].forEach(a => C(x + Math.cos(a) * (r - .06), y + Math.sin(a) * (r - .06), .012, 0, h - .025, M.blackMetal, { seg: 8 })); }); } },
    { name: 'Bouclé ottoman', info: '0.80 × 0.60 × 0.42', build: () => { RB(-.4, -.3, .4, .3, .03, .42, .1, M.boucleOat, { seg: 6 }); RB(-.18, -.12, .18, .12, .42, .44, .02, M.walnut); S(0, 0, .48, .04, M.brass); } },
    { name: 'Rect travertine 1.20', info: '1.20 × 0.60 × 0.38', build: () => { B(-.5, -.22, -.38, .22, .01, .30, M.walnut); B(.38, -.22, .5, .22, .01, .30, M.walnut); RB(-.6, -.3, .6, .3, .30, .38, .012, M.trav); book(-.3, -.05, .38, .24, .17, .035, M.book2, .2); book(-.3, -.05, .415, .2, .14, .03, M.book3, .1); S(.3, .02, .44, .05, M.stonewareDark); lathe([[0, 0], [.05, 0], [.06, .1], [.04, .2], [0, .21]], .05, .1, .38, M.stoneware); } }
  ] },
  dining: { label: 'Dining table', items: [
    { name: 'Tulip, travertine', info: 'Ø0.90 · seats 4', build: () => { lathe([[0, 0], [.27, 0], [.275, .015], [.2, .03], [.07, .1], [.05, .4], [.09, .64], [.2, .7], [0, .7]], 0, 0, 0, M.resin); lathe([[0, .7], [.43, .7], [.45, .715], [.45, .735], [.44, .75], [0, .75]], 0, 0, 0, M.trav, { seg: 96 }); } },
    { name: 'Square oak', info: '0.85 × 0.85 · seats 4', build: () => { RB(-.425, -.425, .425, .425, .72, .75, .008, M.oakFurn); legs4(-.425, -.425, .425, .425, .72, .025, M.oakFurn, .05); B(-.37, -.38, .37, -.36, .64, .72, M.oakFurn); B(-.37, .36, .37, .38, .64, .72, M.oakFurn); } },
    { name: 'Marble pedestal', info: 'Ø1.00 · seats 4–5', build: () => { lathe([[0, 0], [.3, 0], [.3, .02], [.14, .06], [.11, .72], [0, .72]], 0, 0, 0, M.marble); lathe([[0, .72], [.5, .72], [.5, .75], [0, .75]], 0, 0, 0, M.marble, { seg: 96 }); } },
    { name: 'Walnut X-base', info: '0.90 × 0.90 · seats 4', build: () => { RB(-.45, -.45, .45, .45, .72, .76, .01, M.walnut); [Math.PI / 4, -Math.PI / 4].forEach(a => { const g = new THREE.BoxGeometry(1.1, .05, .06); g.rotateY(a); add(g, M.walnut, 0, .03, 0); }); C(0, 0, .06, .05, .72, M.walnut, { seg: 24 }); } },
    { name: 'Round oak trestle', info: 'Ø0.90 · 3 legs', build: () => { lathe([[0, .72], [.45, .72], [.45, .75], [0, .75]], 0, 0, 0, M.oakFurn, { seg: 96 }); [0, 2.09, 4.19].forEach(a => { tube([[Math.cos(a) * .14, .7, Math.sin(a) * .14], [Math.cos(a) * .36, 0, Math.sin(a) * .36]], .022, M.oakFurn, { seg: 4, rs: 10 }); }); } } ,
    { name: 'Rect travertine 1.40', info: '1.40 × 0.80 · seats 4–6', build: () => { RB(-.7, -.4, .7, .4, .71, .75, .008, M.trav); [[-.62, -.32], [.62, -.32], [-.62, .32], [.62, .32]].forEach(([x, y]) => B(x - .025, y - .025, x + .025, y + .025, 0, .71, M.walnut)); B(-.62, -.33, .62, -.31, .64, .71, M.walnut); B(-.62, .31, .62, .33, .64, .71, M.walnut); } } ] },
  chair: { label: 'Dining chair', items: [
    { name: 'Shell velvet', info: 'Ø0.48 · swivel base', build: () => shellChair(0, 0, 0, -1) },
    { name: 'Wishbone', info: '0.55 × 0.51 · oak + cord', build: () => { legs4(-.25, -.23, .25, .23, .45, .016, M.oakFurn, .03); RB(-.25, -.24, .25, .2, .43, .46, .01, M.rattan);
      const pts = []; for (let i = 0; i <= 20; i++) { const a = Math.PI * i / 20; pts.push([Math.cos(a) * .25, .72, .02 + Math.sin(a) * .2]); } tube(pts, .014, M.oakFurn, { seg: 40, rs: 8 });
      tube([[0, .46, .2], [0, .58, .19], [-.06, .7, .21]], .012, M.oakFurn, { seg: 8 }); tube([[0, .58, .19], [.06, .7, .21]], .012, M.oakFurn, { seg: 8 }); [-.25, .25].forEach(x => C(x, .02, .016, .46, .72, M.oakFurn, { seg: 10 })); } },
    { name: 'Parsons', info: '0.47 × 0.55 · upholstered', build: () => { legs4(-.23, -.25, .23, .27, .38, .018, M.walnut, .03); RB(-.235, -.27, .235, .23, .38, .48, .03, M.linenSand); RB(-.235, .2, .235, .27, .38, .94, .03, M.linenSand); } },
    { name: 'Cantilever', info: '0.48 × 0.58 · chrome', build: () => { [-.21, .21].forEach(x => tube([[x, .45, -.24], [x, .45, .14], [x, .03, .18], [x, .01, -.26], [x, .03, -.3]], .011, M.steel, { seg: 40, rs: 8 })); RB(-.23, -.26, .23, .18, .44, .5, .03, M.velvetChoco); const g = new RoundedBoxGeometry(.46, .38, .05, 4, .02); g.rotateX(-.12); add(g, M.velvetChoco, 0, .72, .2); [-.21, .21].forEach(x => tube([[x, .48, .16], [x, .9, .22]], .011, M.steel, { seg: 8, rs: 8 })); } },
    { name: 'Rattan bistro', info: '0.50 × 0.52 · woven', build: () => { legs4(-.23, -.24, .23, .22, .45, .014, M.rattanDark, .03); C(0, -.01, .24, .42, .46, M.rattan, { seg: 40 }); sector(0, 0, .2, .24, Math.PI * .25, Math.PI * .75, .46, .82, M.rattan, .012); tube([[-.2, .82, .13], [0, .86, .24], [.2, .82, .13]], .014, M.rattanDark, { seg: 24 }); } } ] },
  armchair: { label: 'Armchair', items: [
    { name: 'Bouclé tub', info: '0.78 × 0.74', build: () => { lathe([[0, 0], [.37, 0], [.39, .02], [.39, .38], [0, .38]], 0, 0, 0, M.boucle, { sz: .95 }); sector(0, 0, .26, .39, Math.PI * .02, Math.PI * .98, .36, .72, M.boucle, .05); lathe([[0, .38], [.3, .38], [.31, .44], [.28, .47], [0, .47]], 0, -.03, 0, M.boucleOat); pillow(0, .1, .58, .36, .13, .3, M.velvetTerra, 1.2, Math.PI); } },
    { name: 'Wingback', info: '0.80 × 0.82 · velvet', build: () => { legs4(-.36, -.36, .36, .38, .14, .022, M.walnut, .05, .015); RB(-.36, -.38, .36, .32, .14, .44, .03, M.velvetSage); RB(-.33, -.36, .33, .2, .44, .54, .04, M.velvetSage); RB(-.36, .24, .36, .4, .14, 1.08, .04, M.velvetSage);
      [-.33, .33].forEach(x => { RB(x - .05, -.12, x + .05, .38, .44, .92, .04, M.velvetSage); RB(x - .05, -.38, x + .05, -.1, .44, .62, .04, M.velvetSage); }); } },
    { name: 'Mid-century lounge', info: '0.74 × 0.80 · walnut frame', build: () => { [-.33, .33].forEach(x => tube([[x, .02, -.36], [x, .46, -.3], [x, .52, -.05], [x, .5, .2], [x, .02, .36]], .022, M.walnut, { seg: 30, rs: 10 })); RB(-.31, -.34, .31, .22, .3, .42, .04, M.velvetToffee); const g = new RoundedBoxGeometry(.62, .52, .1, 4, .04); g.rotateX(-.3); add(g, M.velvetToffee, 0, .66, .28); } },
    { name: 'Barrel swivel', info: 'Ø0.76', build: () => { C(0, 0, .25, 0, .03, M.brass, { seg: 40 }); C(0, 0, .05, .03, .14, M.brass, { seg: 20 }); lathe([[0, .14], [.36, .14], [.38, .16], [.38, .4], [0, .4]], 0, 0, 0, M.velvetTerra); sector(0, 0, .26, .38, Math.PI * -.05, Math.PI * 1.05, .38, .74, M.velvetTerra, .06); lathe([[0, .4], [.29, .4], [.3, .46], [.27, .49], [0, .49]], 0, -.02, 0, M.velvetTerra); } },
    { name: 'Rattan lounge', info: '0.80 × 0.78', build: () => { legs4(-.34, -.34, .34, .34, .16, .02, M.rattanDark, .04); RB(-.36, -.36, .36, .34, .16, .26, .03, M.rattanDark); sector(0, -.05, .32, .38, Math.PI * .05, Math.PI * .95, .26, .9, M.rattan, .015); RB(-.32, -.34, .32, .22, .26, .4, .05, M.linenOut, { seg: 5 }); pillow(0, .12, .56, .42, .14, .34, M.linenOut, 1.2, Math.PI); } } ] },
  stool: { label: 'Bar stool', items: [
    { name: 'Velvet pedestal', info: 'Ø0.40 · seat 0.65', build: () => barStool(0, 0) },
    { name: 'Oak saddle', info: '0.40 × 0.36 · seat 0.65', build: () => { [[-.15, -.13], [.15, -.13], [-.15, .13], [.15, .13]].forEach(([x, y]) => tube([[x * .7, .63, y * .7], [x, 0, y]], .016, M.oakFurn, { seg: 4, rs: 8 })); B(-.14, -.12, .14, .12, .25, .27, M.oakFurn, { clamp: false }); RB(-.19, -.17, .19, .17, .62, .66, .03, M.oakFurn); } },
    { name: 'Low-back stool', info: 'Ø0.42 · seat 0.65', build: () => { C(0, 0, .2, 0, .015, M.blackMetal); C(0, 0, .022, .015, .62, M.blackMetal, { seg: 16 }); add(new THREE.TorusGeometry(.17, .01, 8, 40).rotateX(Math.PI / 2), M.brass, 0, .3, 0, { uv: false }); lathe([[0, .62], [.2, .62], [.21, .64], [.2, .68], [0, .69]], 0, 0, 0, M.boucleOat); sector(0, 0, .17, .21, Math.PI * .15, Math.PI * .85, .66, .84, M.boucleOat, .015); } },
    { name: 'Cane seat', info: '0.38 × 0.38 · seat 0.65', build: () => { legs4(-.17, -.17, .17, .17, .63, .016, M.rattanDark, .02); B(-.15, -.15, .15, .15, .28, .3, M.rattanDark, { clamp: false }); C(0, 0, .19, .62, .66, M.rattan, { seg: 40 }); } },
    { name: 'Hairpin metal', info: 'Ø0.36 · seat 0.65', build: () => { [0, 2.09, 4.19].forEach(a => tube([[Math.cos(a) * .08, .63, Math.sin(a) * .08], [Math.cos(a) * .19, 0, Math.sin(a) * .19]], .009, M.blackMetal, { seg: 4, rs: 8 })); C(0, 0, .18, .62, .66, M.walnut, { seg: 40 }); } } ] },
  sidetable: { label: 'Side table', items: [{ name: 'Travertine drum', info: 'Ø0.45 × 0.50', build: () => { lathe([[0, 0], [.18, 0], [.12, .22], [.12, .46], [.225, .48], [.225, .5], [0, .5]], 0, 0, 0, M.trav); vase(0, 0, .5, .45, M.stonewareDark); } }] },
  floorlamp: { label: 'Floor lamp', items: [{ name: 'Linen drum lamp', info: 'Ø0.45 × 1.60', build: () => { C(0, 0, .15, 0, .025, M.blackMetal); C(0, 0, .012, .025, 1.25, M.brass, { seg: 10 }); lathe([[.18, 1.25], [.2, 1.25], [.18, 1.55], [.16, 1.55]], 0, 0, 0, M.opal, { seg: 48 }); lamp(0, 0, 1.35, 0xffd3a0, 3); } }] },
  desk: { label: 'Desk', items: [{ name: 'Oak writing desk', info: '0.90 × 0.60 × 0.75', build: () => { RB(-.45, -.3, .45, .3, .72, .75, .008, M.oakFurn); legs4(-.45, -.3, .45, .3, .72, .02, M.blackMetal, .04);
      cab({ axis: 'x', a1: -.43, a2: .43, back: -.28, front: .28, h1: .64, h2: .72, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      B(-.16, -.13, .16, .09, .75, .765, M.steel); { const g = new THREE.BoxGeometry(.32, .21, .007); const m = add(g, M.blackMetal, 0, .87, -.14); m.rotation.x = -.28; }
      C(.33, -.2, .06, .75, .765, M.brass); tube([[.33, .765, -.2], [.31, 1.08, -.18], [.22, 1.18, -.08]], .008, M.brass, { seg: 16 }); lathe([[0, 0], [.03, 0], [.07, -.06], [.075, -.07], [0, -.06]], .2, -.06, 1.18, M.opal); lamp(.2, -.06, 1.08, 0xffd3a0, 1.6);
      book(-.33, -.1, .75, .2, .15, .03, M.book1, .2); } },
    { name: 'Long oak desk + monitor', info: '1.40 × 0.70 × 0.75', build: () => { RB(-.7, -.35, .7, .35, .72, .75, .008, M.oakFurn);
      [[-.66, -.31], [.66, -.31], [-.66, .31], [.66, .31]].forEach(([x, y]) => B(x - .02, y - .02, x + .02, y + .02, 0, .72, M.blackMetal));
      cab({ axis: 'x', a1: .2, a2: .66, back: -.33, front: .33, h1: .5, h2: .72, cols: [[1, 2]], fm: M.lacquerCream });
      B(-.35, -.24, .35, -.21, .77, 1.15, M.blackMetal); B(-.34, -.212, .34, -.209, .79, 1.13, M.screen, { cast: false }); B(-.04, -.26, .04, -.2, .75, .79, M.blackMetal);
      B(-.22, -.02, .22, .12, .75, .765, M.plastic); RB(.3, -.05, .42, .1, .75, .77, .01, M.plastic);
      C(-.55, -.2, .06, .75, .765, M.brass); tube([[-.55, .765, -.2], [-.57, 1.1, -.18], [-.45, 1.2, -.08]], .008, M.brass, { seg: 16 }); lathe([[0, 0], [.03, 0], [.07, -.06], [.075, -.07], [0, -.06]], -.42, -.06, 1.2, M.opal); lamp(-.42, -.06, 1.1, 0xffd3a0, 1.6);
      book(.5, -.2, .75, .2, .15, .04, M.book2, .1); } }] },
  deskchair: { label: 'Desk chair', items: [{ name: 'Swivel task chair', info: 'Ø0.60', build: () => taskChair(0, 0, -Math.PI / 2) }] }
};
function makeTyped(type, d, opts) { beginG(DESIGNS[type].label); DESIGNS[type].items[d].build(opts || {}); const g = endGRaw(); g.userData.type = type; g.userData.design = d; return g; }
export function replaceWith(old, type, d, keepCustom = true) {
  const g = makeTyped(type, d); g.position.set(old.position.x, 0, old.position.z); g.rotation.y = old.rotation.y; g.visible = old.visible;
  g.userData.home = { ...old.userData.home };
  if (keepCustom) for (const k in old.userData.custom) { if (partsOf(g).includes(k)) { const c = old.userData.custom[k]; applyPart(g, k, c.fin, c.color, false); } }
  const i = movables.indexOf(old); if (i >= 0) movables[i] = g; else movables.push(g);
  old.parent && old.parent.remove(old);
  if (state.sel === old) select(g);
  return g;
}
export function typed(type, d, x, y, face = 0, opts) { const g = makeTyped(type, d, opts); g.position.set(x, 0, y); g.rotation.y = face; g.userData.home = { x, z: y, r: face }; movables.push(g); return g; }
