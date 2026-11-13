import { M } from '../materials.js';
import { B, RB } from '../primitives.js';
import { BAR_LENGTHS, placePulls } from './pulls.js';

// pull for one front cell: drawers get a centred bar (knob when small), doors a vertical bar on the opening edge; mode overrides: 'knob', 'edge-top', 'edge-bottom'
function pullFor(mode, ci, a, b, z1, z2) {
  const wd = b - a - .0035, rh = z2 - z1, ac = (a + b) / 2, side = ci % 2 ? a + .042 : b - .042;
  if (mode === 'edge-top') return { kind: mode, a: ac, h: z2, len: wd - .04 };
  if (mode === 'edge-bottom') return { kind: mode, a: ac, h: z1, len: wd - .04 };
  const drawer = rh <= .36 && wd >= .3, fit = BAR_LENGTHS.filter(l => l <= Math.min(.32, wd * .5)).pop();
  if (mode === 'knob' || rh <= .16 || (drawer ? !fit : wd < .3)) return drawer || rh <= .16 ? { kind: 'knob', a: ac, h: (z1 + z2) / 2 } : { kind: 'knob', a: side, h: z2 - .1 };
  if (drawer) return { kind: 'bar', a: ac, h: (z1 + z2) / 2, len: fit };
  const len = Math.min(rh - .12, rh >= 1.2 ? .32 : rh >= .6 ? .224 : .16), h = z2 <= 1 ? z2 - .06 - len / 2 : z1 >= 1.2 ? z1 + .06 + len / 2 : Math.min(Math.max(1, z1 + len / 2 + .1), z2 - len / 2 - .1);
  return { kind: 'bar', vertical: true, a: side, h, len };
}

export function cab(o) { // run of cabinets with 2 mm bevelled fronts, real 3.5 mm shadow gaps between them and brass pulls
  const { axis, a1, a2, back, front, h1, h2, cols, fm, cm = M.carcass } = o; const s = Math.sign(front - back), t = .019, g = .0035, cf = front - s * t, pulls = [];
  axis === 'x' ? B(a1, Math.min(back, cf), a2, Math.max(back, cf), h1, h2, cm) : B(Math.min(back, cf), a1, Math.max(back, cf), a2, h1, h2, cm);
  const total = cols.reduce((p, c) => p + c[0], 0), k = (a2 - a1) / total; let a = a1;
  cols.forEach(([w, rows], ci) => { const b = a + w * k, rh = (h2 - h1) / rows;
    for (let r = 0; r < rows; r++) { const z1 = h1 + r * rh + g / 2, z2 = h1 + (r + 1) * rh - g / 2, mode = o.pull || 'auto';
      if (mode !== 'none' && !(o.skip && o.skip(ci, r))) pulls.push(pullFor(mode, ci, a, b, z1, z2));
      axis === 'x' ? RB(a + g / 2, Math.min(cf, front), b - g / 2, Math.max(cf, front), z1, z2, .002, fm, { seg: 1, clamp: true }) : RB(Math.min(cf, front), a + g / 2, Math.max(cf, front), b - g / 2, z1, z2, .002, fm, { seg: 1, clamp: true }); }
    a = b; });
  placePulls(pulls, { axis, front, s });
}
