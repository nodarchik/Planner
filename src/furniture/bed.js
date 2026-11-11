import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M } from '../materials.js';
import { B, C, RB, add, drape, lathe, pillow } from '../primitives.js';
import { mushroomLamp } from './decor.js';

export function bed(cx, headY, w, l, dir, accent, duvetMat, throwMat) {
  const y1 = dir > 0 ? headY + .08 : headY - .08 - l, y2 = dir > 0 ? headY + .08 + l : headY - .08;
  // channel-tufted upholstered headboard on the wall
  const hb0 = dir > 0 ? headY : headY - .09, hb1 = dir > 0 ? headY + .09 : headY;
  B(cx - w / 2 - .14, hb0, cx + w / 2 + .14, (hb0 + hb1) / 2, .12, 1.18, M.carcass);
  const n = 9, cw = (w + .28) / n;
  for (let i = 0; i < n; i++) { const x0 = cx - w / 2 - .14 + i * cw; const g = new RoundedBoxGeometry(cw - .004, 1.06, .085, 5, .04); add(g, accent, x0 + cw / 2, .12 + .53, (hb0 + hb1) / 2 + (dir > 0 ? .005 : -.005)); }
  // floating platform (walnut) with LED underglow
  B(cx - w / 2 + .14, y1 + .14, cx + w / 2 - .14, y2 - .14, .0, .12, M.carcass);
  B(cx - w / 2 + .15, y1 + .15, cx + w / 2 - .15, y2 - .15, .002, .006, M.led, { cast: false });
  RB(cx - w / 2, y1, cx + w / 2, y2, .12, .30, .025, M.walnut);
  RB(cx - w / 2 + .03, y1 + .03, cx + w / 2 - .03, y2 - .03, .30, .54, .07, M.linenWhite, { seg: 5 });
  // duvet + folded throw
  const dy1 = dir > 0 ? y1 + .55 : y1, dy2 = dir > 0 ? y2 : y2 - .55;
  drape(cx - w / 2 + .02, dy1, cx + w / 2 - .02, dy2, .565, .36, .30, dir, duvetMat);
  RB(cx - w / 2 - .015, dir > 0 ? dy1 - .03 : dy2 - .22, cx + w / 2 + .015, dir > 0 ? dy1 + .22 : dy2 + .03, .55, .595, .02, M.linenWhite, { seg: 5 });
  const ty1 = dir > 0 ? y2 - .62 : y1, ty2 = dir > 0 ? y2 : y1 + .62;
  drape(cx - w / 2 - .01, ty1, cx + w / 2 + .01, ty2, .60, .42, .34, dir, throwMat);
  // pillows
  const py = dir > 0 ? y1 + .2 : y2 - .2, lean = dir > 0 ? 1.05 : -1.05;
  pillow(cx - w / 4 + .02, py, .75, .7, .18, .48, M.linenWhite, lean); pillow(cx + w / 4 - .02, py, .75, .7, .18, .48, M.linenWhite, lean);
  const py2 = dir > 0 ? y1 + .34 : y2 - .34;
  pillow(cx - w / 4 + .04, py2, .72, .55, .15, .42, M.linenSand, lean * .9); pillow(cx + w / 4 - .04, py2, .72, .55, .15, .42, M.linenSand, lean * .9);
  pillow(cx, dir > 0 ? y1 + .5 : y2 - .5, .66, .5, .13, .28, accent, lean * .8);
  return { y1, y2 };
}
export function nightstand(x, y) {
  lathe([[0, 0], [.2, 0], [.215, .01], [.22, .46], [.21, .48], [0, .48]], x, y, 0, M.walnut);
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; C(x + Math.cos(a) * .218, y + Math.sin(a) * .218, .012, .02, .46, M.walnut, { seg: 10 }); }
  C(x, y, .225, .48, .5, M.travSmall); mushroomLamp(x, y, .5);
}
