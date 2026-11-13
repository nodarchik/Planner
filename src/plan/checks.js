// Automatic plan checks. Pure: runChecks(plan) → [{ severity: 'error' | 'warn' | 'ok', item, check, value, required, note }]
// Runs in the page (Plan notes panel) and in `npm run validate`.
import { planGeom, wallRect, wallAxis, openingsOf, PASSABLE, solids, fmt } from './geom.js';
import { footprints } from './footprints.js';

const CELL = .05, CLOSET_MAX = .30;
const NEED = { wc: .60, vanity: .70, basinUnit: .70, laundryTower: .90, desk: .80, builtInDesk: .80, kitchen: .90, bedSide: .50, routeMain: .80, routeBalcony: .60, balconyDoor: .60 };
const TUCK = new Set(['dining', 'desk', 'builtInDesk', 'beautyTable', 'kitchenBar', 'coffee']); // seats may slide under these
const inter = (a, b) => [Math.min(a[2], b[2]) - Math.max(a[0], b[0]), Math.min(a[3], b[3]) - Math.max(a[1], b[1])];
const inside = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];

export function runChecks(plan) {
  const G = planGeom(plan), out = [], fps = footprints(plan, G);
  const add = (severity, item, check, value, required, note = '') => out.push({ severity, item, check, value, required, note });
  const grade = (v, need) => (v >= need - .005 ? 'ok' : 'warn');
  const walls = plan.walls.map(w => ({ id: w.id, rect: wallRect(w), axis: wallAxis(w), ops: openingsOf(w), wall: w }));
  const fixed = solids(plan, false); // walls (passable openings removed) and blocks

  // 1. owner rule: walk-in closet units no deeper than 0.30
  for (const f of fps) if (f.closet) {
    add(f.closet.D > CLOSET_MAX + 1e-9 ? 'error' : 'ok', f.id, 'Closet unit depth', fmt(f.closet.D), '≤ ' + fmt(CLOSET_MAX));
    if (f.closet.Dw) add(f.closet.Dw > CLOSET_MAX + 1e-9 ? 'error' : 'ok', f.id, 'Closet shelf depth', fmt(f.closet.Dw), '≤ ' + fmt(CLOSET_MAX));
    add(grade(f.closet.aisle, .60), f.id, 'Closet aisle', fmt(f.closet.aisle), '≥ 0.60'); }

  // 2. items inside walls · 3. items overlapping each other
  for (const f of fps) for (const r of f.rects) for (const s of fixed) { const [ox, oy] = inter(r, s); if (ox > .03 && oy > .03) { add('error', f.id, 'Overlaps a wall', fmt(Math.min(ox, oy)), '0.00', f.name); break; } }
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) { const a = fps[i], b = fps[j];
    if ((a.kind === 'seat' && TUCK.has(b.type)) || (b.kind === 'seat' && TUCK.has(a.type))) continue;
    let worst = 0; for (const ra of a.rects) for (const rb of b.rects) { const [ox, oy] = inter(ra, rb); if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy)); }
    if (worst > .03) add(worst > .10 ? 'error' : 'warn', a.id, 'Overlaps ' + b.id, fmt(worst), '0.00', `${a.name} / ${b.name}`); }

  // free depth in front of a rectangle, in direction dir, ignoring the listed ids and (optionally) seats
  const obstacles = (skip, noSeats) => [...fixed, ...fps.filter(f => !skip.includes(f.id) && !(noSeats && f.kind === 'seat')).flatMap(f => f.rects)];
  function freeDepth(r, [dx, dy], obs, max = 3) { let best = max;
    for (const o of obs) { if (dx) { if (Math.min(r[3], o[3]) - Math.max(r[1], o[1]) < .05) continue; const g = dx > 0 ? o[0] - r[2] : r[0] - o[2]; if (g > -.02 && g < best) best = Math.max(0, g); }
      else { if (Math.min(r[2], o[2]) - Math.max(r[0], o[0]) < .05) continue; const g = dy > 0 ? o[1] - r[3] : r[1] - o[3]; if (g > -.02 && g < best) best = Math.max(0, g); } }
    return best; }
  const shown = v => (v >= 3 ? '> 3.00' : fmt(v));

  // 4. clearances in front of fixtures and storage
  for (const f of fps) {
    if (f.fronts) for (const fr of f.fronts) { const v = freeDepth(fr.rect, fr.dir, obstacles([f.id], true)); add(grade(v, NEED.kitchen), f.id, 'Worktop front clear', shown(v), '≥ ' + fmt(NEED.kitchen)); }
    if (f.front && NEED[f.type]) { const v = freeDepth(f.rects[0], f.front, obstacles([f.id], f.type === 'desk' || f.type === 'builtInDesk')); add(grade(v, NEED[f.type]), f.id, 'Front clear', shown(v), '≥ ' + fmt(NEED[f.type]), f.name); }
    if (f.type === 'wardrobe') { const leaf = f.sp.len / f.doors, v = freeDepth(f.rects[0], f.front, obstacles([f.id], true)); add(grade(v, leaf), f.id, 'Door leaf swing clear', shown(v), '≥ ' + fmt(leaf), f.name); }
    if (f.bed) { const { sp, w, l } = f.bed, nights = fps.filter(o => o.type === 'nightstand').map(o => o.id), obs = obstacles([f.id, ...nights], true);
      [[0, -1, 'left'], [w, 1, 'right']].forEach(([u, sgn, nm]) => { const strip = G.frameRect(sp, u, .6, u, l + .1), dir = sp.axis === 'x' ? [sgn, 0] : [0, sgn];
        const v = freeDepth(strip, dir, obs); add(grade(v, NEED.bedSide), f.id, `Bed side (${dir[0] ? (dir[0] > 0 ? 'east' : 'west') : (dir[1] > 0 ? 'south' : 'north')})`, shown(v), '≥ ' + fmt(NEED.bedSide), nm); }); }
  }

  // 5. door swings and balcony doors
  const blockers = fps;
  for (const w of walls) for (const o of w.ops) { const id = o.id || `${w.id}@${fmt(o.a)}`;
    if (o.leaf) { const lf = o.leaf, along = lf.hinge === 'start' ? o.a : o.b, cl = lf.hinge === 'start' ? 1 : -1, face = G.faceCoord(w.id, lf.swing), sw = lf.swing === 'S' || lf.swing === 'E' ? 1 : -1; let hit = null;
      for (let a = 0; a <= 90 && !hit; a += 7.5) for (const k of [.35, .65, .95]) { const r = k * o.w, ca = Math.cos(a * Math.PI / 180) * r, sa = Math.sin(a * Math.PI / 180) * r;
        const px = w.axis === 'y' ? face + sw * sa : along + cl * ca, py = w.axis === 'y' ? along + cl * ca : face + sw * sa;
        hit = blockers.find(f => f.rects.some(rc => inside(rc, px, py))) || (fixed.some(rc => inside(rc, px, py)) ? { id: 'a wall' } : null); if (hit) break; }
      add(hit ? 'error' : 'ok', id, 'Door swing', hit ? 'hits ' + hit.id : 'free', 'free'); }
    if (o.type === 'balconyDoor') { const inSign = w.wall.grow === 'W' || w.wall.grow === 'N' ? 1 : -1, face = inSign > 0 ? (w.axis === 'y' ? w.rect[2] : w.rect[3]) : (w.axis === 'y' ? w.rect[0] : w.rect[1]);
      const r = w.axis === 'y' ? [face, o.a, face, o.b] : [o.a, face, o.b, face], v = freeDepth(r, w.axis === 'y' ? [inSign, 0] : [0, inSign], obstacles([], false));
      add(grade(v, NEED.balconyDoor), id, 'Balcony door clear inside', shown(v), '≥ ' + fmt(NEED.balconyDoor)); } }

  // 6. routes: widest path from the entrance to every door / arch, on a 5 cm grid
  const entrance = walls.flatMap(w => w.ops.filter(o => o.id === 'door-entrance').map(o => ({ w, o })))[0];
  if (entrance) {
    const xs = plan.slabs.map(s => s.rect), X0 = Math.min(...xs.map(r => r[0])), Y0 = Math.min(...xs.map(r => r[1])), X1 = Math.max(...xs.map(r => r[2])), Y1 = Math.max(...xs.map(r => r[3]));
    const nx = Math.ceil((X1 - X0) / CELL), ny = Math.ceil((Y1 - Y0) / CELL), N = nx * ny, blocked = new Uint8Array(N), doorZone = new Uint8Array(N);
    const mark = (arr, r, v) => { const a = Math.max(0, Math.floor((r[0] - X0) / CELL + 1e-6)), b = Math.min(nx, Math.ceil((r[2] - X0) / CELL - 1e-6)), c = Math.max(0, Math.floor((r[1] - Y0) / CELL + 1e-6)), d = Math.min(ny, Math.ceil((r[3] - Y0) / CELL - 1e-6));
      for (let y = c; y < d; y++) for (let x = a; x < b; x++) arr[y * nx + x] = v; };
    blocked.fill(1); for (const s of plan.slabs) mark(blocked, s.rect, 0);
    for (const r of fixed) mark(blocked, r, 1); for (const f of fps) if (f.kind !== 'seat') for (const r of f.rects) mark(blocked, r, 1);
    const pts = []; // opening → a point 0.35 m off each face
    for (const w of walls) for (const o of w.ops) { if (!PASSABLE.has(o.type)) continue; const [x1, y1, x2, y2] = w.rect, m = (o.a + o.b) / 2;
      mark(doorZone, w.axis === 'x' ? [o.a, y1 - .2, o.b, y2 + .2] : [x1 - .2, o.a, x2 + .2, o.b], 1);
      pts.push({ id: o.id || `${w.id}@${fmt(o.a)}`, type: o.type, w: o.w, ends: w.axis === 'x' ? [[m, y1 - .35], [m, y2 + .35]] : [[x1 - .35, m], [x2 + .35, m]] }); }
    // chamfer distance to the nearest blocked cell → clear width ≈ 2 × distance
    const dist = new Float32Array(N).fill(1e6); for (let i = 0; i < N; i++) if (blocked[i]) dist[i] = 0;
    const relax = (i, j, c) => { if (dist[j] + c < dist[i]) dist[i] = dist[j] + c; };
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const i = y * nx + x; if (x) relax(i, i - 1, 1); if (y) { relax(i, i - nx, 1); if (x) relax(i, i - nx - 1, 1.414); if (x < nx - 1) relax(i, i - nx + 1, 1.414); } }
    for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) { const i = y * nx + x; if (x < nx - 1) relax(i, i + 1, 1); if (y < ny - 1) { relax(i, i + nx, 1); if (x < nx - 1) relax(i, i + nx + 1, 1.414); if (x) relax(i, i + nx - 1, 1.414); } }
    const width = i => (doorZone[i] ? 9 : (2 * dist[i] - 1) * CELL);
    const cell = ([x, y]) => Math.min(ny - 1, Math.max(0, Math.floor((y - Y0) / CELL))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - X0) / CELL)));
    const start = cell(entrance.w.axis === 'x' ? [(entrance.o.a + entrance.o.b) / 2, entrance.w.rect[1] - .35] : [entrance.w.rect[0] - .35, (entrance.o.a + entrance.o.b) / 2]);
    const reach = need => { const seen = new Uint8Array(N), q = [start]; seen[start] = 1; for (let h = 0; h < q.length; h++) { const i = q[h], x = i % nx;
      for (const j of [i - nx, i + nx, x ? i - 1 : -1, x < nx - 1 ? i + 1 : -1]) if (j >= 0 && j < N && !seen[j] && !blocked[j] && width(j) >= need) { seen[j] = 1; q.push(j); } } return seen; };
    const levels = [1.2, 1.1, 1.0, .9, .8, .7, .6, .5, .4], seen = levels.map(reach);
    for (const p of pts) { if (p.id === 'door-entrance') continue; const need = p.type === 'balconyDoor' ? NEED.routeBalcony : NEED.routeMain;
      const best = Math.min(...p.ends.map(e => { const k = seen.findIndex(s => s[cell(e)]); return k < 0 ? 99 : k; })); // nearest side of the opening is enough
      const v = best === 99 ? 0 : levels[best];
      add(v >= need ? 'ok' : (v === 0 ? 'error' : 'warn'), p.id, 'Route from entrance (narrowest point)', v === 0 ? '< 0.40' : (best === 0 ? '≥ 1.20' : '≈ ' + fmt(v)), '≥ ' + fmt(need)); }
  }
  return out;
}
export const summary = list => ({ error: list.filter(c => c.severity === 'error').length, warn: list.filter(c => c.severity === 'warn').length, ok: list.filter(c => c.severity === 'ok').length });
