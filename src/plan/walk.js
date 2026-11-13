// Walk-mode collision (pure, plan coordinates in metres): what blocks a person, and a circle that slides along it.
import { planGeom, solids } from './geom.js';
import { footprints } from './footprints.js';

export const walkSolids = plan => [...solids(plan), ...footprints(plan, planGeom(plan)).filter(f => f.kind === 'solid').flatMap(f => f.rects)];

// push a circle out of one rect; returns true if it moved
function push(p, r, [x1, y1, x2, y2]) {
  const cx = Math.max(x1, Math.min(p[0], x2)), cy = Math.max(y1, Math.min(p[1], y2)), dx = p[0] - cx, dy = p[1] - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) { const d = Math.sqrt(d2), k = (r - d) / d; p[0] += dx * k; p[1] += dy * k; return true; }
  const l = p[0] - x1, rr = x2 - p[0], t = p[1] - y1, b = y2 - p[1], m = Math.min(l, rr, t, b); // centre inside the rect: leave by the nearest side
  if (m === l) p[0] = x1 - r; else if (m === rr) p[0] = x2 + r; else if (m === t) p[1] = y1 - r; else p[1] = y2 + r;
  return true;
}

// move a circle of radius r from pos by delta against rects; slides along surfaces, steps are cut to 5 cm so nothing is skipped
export function moveCircle(pos, delta, r, rects) {
  const p = [pos[0], pos[1]], n = Math.max(1, Math.ceil(Math.hypot(delta[0], delta[1]) / .05));
  for (let i = 0; i < n; i++) { p[0] += delta[0] / n; p[1] += delta[1] / n; for (let k = 0; k < 3; k++) { let hit = false; for (const s of rects) hit = push(p, r, s) || hit; if (!hit) break; } }
  return p;
}
