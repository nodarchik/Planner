// Pure plan geometry (no three.js, no DOM): shared by the app and by `npm run validate`.
export const KIND = { door: { sill: 0, head: 2.1 }, window: { sill: 0.9, head: 2.4, glass: 'win' }, balconyDoor: { sill: 0, head: 2.4, glass: 'door' }, arch: {} };
export const PASSABLE = new Set(['door', 'balconyDoor', 'arch']);

// wall → axis-aligned rectangle [x1, y1, x2, y2]; `from`–`to` is the reference face, thickness `t` grows towards `grow`
export function wallRect(w) {
  const [x0, y0] = w.from, [x1, y1] = w.to, t = w.t;
  if (y0 === y1) return w.grow === 'N' ? [x0, y0 - t, x1, y0] : [x0, y0, x1, y0 + t];
  return w.grow === 'W' ? [x0 - t, y0, x0, y1] : [x0, y0, x0 + t, y1];
}
export const wallAxis = w => (w.from[1] === w.to[1] ? 'x' : 'y'); // direction the wall runs along
export function bbox(poly) { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
export function area(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
export const fmt = v => v.toFixed(2);
// openings of a wall as absolute ranges along it: [{a, b, type, ...}]
export const openingsOf = w => (w.openings || []).map(o => ({ ...KIND[o.type], ...o, a: o.at, b: +(o.at + o.w).toFixed(4) }));

export function pointInPoly(poly, x, y) { let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c; }

// rects [x1, y1, x2, y2] nobody can pass: wall pieces (doors, balcony doors, arches cut out) + blocks (+ the outer edges of the balconies when `edges`)
export function solids(plan, edges = true) {
  const out = [];
  for (const w of plan.walls) { const [x1, y1, x2, y2] = wallRect(w), ax = wallAxis(w), s = ax === 'x' ? x1 : y1, e = ax === 'x' ? x2 : y2; let c = s;
    for (const o of openingsOf(w).filter(o => PASSABLE.has(o.type)).sort((p, q) => p.a - q.a)) { if (o.a > c) out.push(ax === 'x' ? [c, y1, o.a, y2] : [x1, c, x2, o.a]); c = o.b; }
    if (e > c) out.push(ax === 'x' ? [c, y1, e, y2] : [x1, c, x2, e]); }
  for (const b of plan.blocks) out.push(b.rect);
  if (edges) for (const b of plan.balconies || []) { const lo = Math.min(b.inner, b.outer), hi = Math.max(b.inner, b.outer), t = .1;
    out.push(b.outer > b.inner ? [b.outer, b.from, b.outer + t, b.to] : [b.outer - t, b.from, b.outer, b.to], [lo, b.from - t, hi, b.from], [lo, b.to, hi, b.to + t]); }
  if (edges) for (const w of plan.walls) { const [x1, y1, x2, y2] = wallRect(w), ax = wallAxis(w); // stop rect outside a passable opening that leads out of every room
    for (const o of openingsOf(w).filter(o => PASSABLE.has(o.type))) { const m = (o.a + o.b) / 2;
      for (const [px, py, r] of ax === 'x' ? [[m, y1 - .3, [o.a, y1 - .1, o.b, y1]], [m, y2 + .3, [o.a, y2, o.b, y2 + .1]]] : [[x1 - .3, m, [x1 - .1, o.a, x1, o.b]], [x2 + .3, m, [x2, o.a, x2 + .1, o.b]]])
        if (!plan.rooms.some(rm => pointInPoly(rm.poly, px, py))) out.push(r); } }
  return out; }

export function planGeom(plan) {
  const byId = new Map();
  for (const w of plan.walls) byId.set(w.id, { rect: wallRect(w), axis: wallAxis(w), wall: w });
  for (const b of plan.blocks) byId.set(b.id, { rect: b.rect, axis: null, block: b });
  const rectOf = id => { const r = byId.get(id); if (!r) throw new Error(`plan: unknown wall or block "${id}"`); return r.rect; };
  const roomById = id => { const r = plan.rooms.find(r => r.id === id); if (!r) throw new Error(`plan: unknown room "${id}"`); return r; };
  // coordinate of one face of a wall/block: side N/S → y, side W/E → x
  const faceCoord = (id, side) => { const [x1, y1, x2, y2] = rectOf(id); return { N: y1, S: y2, W: x1, E: x2 }[side]; };
  // placement frame of a wall-attached item: { axis, a0, back, dir, len, depth }
  //   wall + side  → back plane = that face of the wall/block (plus optional offset), item protrudes towards `side`
  //   axis + back + face → explicit back plane, front faces N/S/E/W
  const frameSpec = it => { const side = it.side || it.face, pos = side === 'S' || side === 'E'; let back, axis;
    if (it.wall) { back = faceCoord(it.wall, side) + (it.offset || 0) * (pos ? 1 : -1); axis = side === 'N' || side === 'S' ? 'x' : 'y'; } else { back = it.back; axis = it.axis; }
    return { axis, a0: it.from, back, dir: pos ? 1 : -1, len: it.to - it.from, depth: it.depth }; };
  // frame for something that runs the full length of one side of a room
  const alongRoom = (roomId, side) => { const r = bbox(roomById(roomId).poly);
    return { W: { axis: 'y', a0: r[1], back: r[0], dir: 1, len: r[3] - r[1] }, E: { axis: 'y', a0: r[1], back: r[2], dir: -1, len: r[3] - r[1] },
      N: { axis: 'x', a0: r[0], back: r[1], dir: 1, len: r[2] - r[0] }, S: { axis: 'x', a0: r[0], back: r[3], dir: -1, len: r[2] - r[0] } }[side]; };
  // rectangle [x1,y1,x2,y2] covered by local (u1..u2, d1..d2) of a frame
  const frameRect = (sp, u1, d1, u2, d2) => { const a = sp.a0 + u1, b = sp.a0 + u2, c = sp.back + sp.dir * d1, e = sp.back + sp.dir * d2;
    return sp.axis === 'x' ? [Math.min(a, b), Math.min(c, e), Math.max(a, b), Math.max(c, e)] : [Math.min(c, e), Math.min(a, b), Math.max(c, e), Math.max(a, b)]; };
  return { rectOf, roomById, faceCoord, frameSpec, alongRoom, frameRect };
}
