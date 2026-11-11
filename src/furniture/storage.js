import { M } from '../materials.js';
import { B } from '../primitives.js';

export function cab(o) { // run of cabinets with real 3.5 mm shadow gaps between fronts
  const { axis, a1, a2, back, front, h1, h2, cols, fm, cm = M.carcass } = o; const s = Math.sign(front - back), t = .019, g = .0035, cf = front - s * t;
  axis === 'x' ? B(a1, Math.min(back, cf), a2, Math.max(back, cf), h1, h2, cm) : B(Math.min(back, cf), a1, Math.max(back, cf), a2, h1, h2, cm);
  const total = cols.reduce((p, c) => p + c[0], 0), k = (a2 - a1) / total; let a = a1;
  for (const [w, rows] of cols) { const b = a + w * k, rh = (h2 - h1) / rows;
    for (let r = 0; r < rows; r++) { const z1 = h1 + r * rh + g / 2, z2 = h1 + (r + 1) * rh - g / 2;
      axis === 'x' ? B(a + g / 2, Math.min(cf, front), b - g / 2, Math.max(cf, front), z1, z2, fm) : B(Math.min(cf, front), a + g / 2, Math.max(cf, front), b - g / 2, z1, z2, fm); }
    a = b; }
}
