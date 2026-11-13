// Architecture from data: slabs, floors, walls with openings, door leaves, skirting, wall cladding, mouldings, arches, rounded corners, ceilings.
import * as THREE from 'three';
import { MOBILE, V3, world } from '../scene.js';
import { lamp } from '../lighting.js';
import { M } from '../materials.js';
import { B, C, add } from '../primitives.js';
import { H, PASSABLE, plan, wallRect, wallAxis, openingsOf, faceCoord, bbox } from '../plan/plan.js';
import { door, skirt, wallRun } from './walls.js';
import { softArch, softBullnose, softPanels, softTray } from './soft.js';

const EPS = 1e-6;
const solids = () => [...plan.walls.map(w => ({ rect: wallRect(w), axis: wallAxis(w), wall: w })), ...plan.blocks.map(b => ({ rect: b.rect }))];

// Room outline → wall-backed runs: [{ axis, at, inSign, a, b, gaps }]. An edge only yields a run where a wall or block face lies on it.
export function roomRuns(room) {
  const poly = room.poly, n = poly.length, runs = [];
  let twice = 0; for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; twice += x1 * y2 - x2 * y1; }
  const cw = twice > 0; // plan y points south, so positive shoelace = clockwise on screen
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n], horiz = Math.abs(y1 - y2) < EPS;
    const at = horiz ? y1 : x1, a = horiz ? Math.min(x1, x2) : Math.min(y1, y2), b = horiz ? Math.max(x1, x2) : Math.max(y1, y2);
    const inSign = horiz ? ((x2 > x1) === cw ? 1 : -1) : ((y2 > y1) === cw ? -1 : 1);
    for (const s of solids()) {
      const [sx1, sy1, sx2, sy2] = s.rect, face = horiz ? (inSign > 0 ? sy2 : sy1) : (inSign > 0 ? sx2 : sx1);
      if (Math.abs(face - at) > EPS) continue;
      const lo = Math.max(a, horiz ? sx1 : sy1), hi = Math.min(b, horiz ? sx2 : sy2); if (hi - lo < EPS) continue;
      const gaps = s.wall && s.axis === (horiz ? 'x' : 'y') ? openingsOf(s.wall).filter(o => PASSABLE.has(o.type)).map(o => [o.a, o.b]) : [];
      runs.push({ axis: horiz ? 'x' : 'y', at, inSign, a: lo, b: hi, gaps, side: horiz ? (inSign > 0 ? 'N' : 'S') : (inSign > 0 ? 'W' : 'E') });
    }
  }
  return runs;
}
const cut = (a, b, gaps, min) => { const out = []; let c = a; [...gaps].sort((p, q) => p[0] - q[0]).forEach(([g1, g2]) => { if (g1 - c > min) out.push([c, Math.min(g1, b)]); c = Math.max(c, g2); }); if (b - c > min) out.push([c, b]); return out; };

function buildWall(w) {
  const [x1, y1, x2, y2] = wallRect(w), axis = wallAxis(w), ops = openingsOf(w), inSign = w.grow === 'W' || w.grow === 'N' ? 1 : -1;
  const t1 = axis === 'x' ? y1 : x1, t2 = axis === 'x' ? y2 : x2, s = axis === 'x' ? x1 : y1, e = axis === 'x' ? x2 : y2;
  const arches = ops.filter(o => o.type === 'arch');
  if (!arches.length) { wallRun(axis, t1, t2, s, e, ops, M.wall, inSign); return; }
  if (arches.length !== ops.length) throw new Error(`plan: wall ${w.id} mixes arches with other openings (not supported)`);
  let c = s;
  for (const o of arches) { const end = Math.min(e, o.b + (o.a - c)); softArch(axis, t1, t2, c, end, o.a, o.b, o.top, o.radius); c = end; }
  if (e - c > EPS) wallRun(axis, t1, t2, c, e, [], M.wall, inSign);
}
function buildLeaves(w) {
  const axis = wallAxis(w);
  for (const o of openingsOf(w)) { const lf = o.leaf; if (!lf) continue;
    const along = lf.hinge === 'start' ? o.a : o.b, closed = lf.hinge === 'start' ? 1 : -1, face = faceCoord(w.id, lf.swing), sw = lf.swing === 'S' || lf.swing === 'E' ? 1 : -1;
    const ang = lf.open * Math.PI / 180, opt = lf.handle ? { handle: lf.handle } : {}, m = M[lf.material || 'skirting'];
    if (axis === 'y') door(face, along, 0, closed, o.w, ang, -sw * closed, m, opt); else door(along, face, closed, 0, o.w, ang, sw * closed, m, opt);
    // light switch on the latch side, on the face the door opens towards, 0.12 from the frame, centre 1.05 above the floor
    const latch = lf.hinge === 'start' ? o.b + .12 : o.a - .2, [x1, y1, x2, y2] = wallRect(w); if (latch < (axis === 'x' ? x1 : y1) + .05 || latch + .08 > (axis === 'x' ? x2 : y2) - .05) continue;
    const d1 = face, d2 = face + sw * .008, d3 = face + sw * .012, lo = Math.min, hi = Math.max;
    if (axis === 'x') { B(latch, lo(d1, d2), latch + .08, hi(d1, d2), 1.01, 1.09, M.lacquerCream, { cast: false }); B(latch + .02, lo(d2, d3), latch + .06, hi(d2, d3), 1.03, 1.07, M.ceramic, { cast: false }); }
    else { B(lo(d1, d2), latch, hi(d1, d2), latch + .08, 1.01, 1.09, M.lacquerCream, { cast: false }); B(lo(d2, d3), latch + .02, hi(d2, d3), latch + .06, 1.03, 1.07, M.ceramic, { cast: false }); } }
}

export function buildArchitecture() {
  const st = plan.meta.style; M.wall.color.set(st.wallTint); M.ceiling.color.set(st.ceilingTint); M.skirting.color.set(st.trimTint);
  for (const s of plan.slabs) B(...s.rect, -.36, -.05, M.concrete, { clamp: false });
  for (const f of plan.floors) { B(...f.rect, -.05, f.top ?? 0, M[f.material], { clamp: false }); if (f.finish) B(...f.rect, 0, .006, M[f.finish], { clamp: false, cast: false }); }
  for (const w of plan.walls) { const n = world.children.length; buildWall(w); world.children.slice(n).forEach(o => { o.userData.wall = w.id; }); }
  for (const b of plan.blocks) B(...b.rect, 0, H, M.wall);
  // balconies: open, no walls — frameless glass balustrade (1.05 m) with a steel handrail on the three open sides
  for (const { inner: xi, outer: xo, from: ya, to: yb } of plan.balconies) {
    const edge = [[xi, ya], [xo, ya], [xo, yb], [xi, yb]];
    for (let k = 0; k < 3; k++) { const [ax, ay] = edge[k], [bx, by] = edge[k + 1], len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      add(new THREE.BoxGeometry(len, .98, .012), M.glassRail, (ax + bx) / 2, .05 + .49, (ay + by) / 2, { rotY: -ang, cast: false });
      add(new THREE.BoxGeometry(len + .02, .06, .05), M.frame, (ax + bx) / 2, .0, (ay + by) / 2, { rotY: -ang }); }
    const c = new THREE.CurvePath(); for (let k = 0; k < 3; k++) c.add(new THREE.LineCurve3(new V3(edge[k][0], 1.05, edge[k][1]), new V3(edge[k + 1][0], 1.05, edge[k + 1][1])));
    add(new THREE.TubeGeometry(c, 120, .022, 12, false), M.steel, 0, 0, 0); }
  for (const w of plan.walls) buildLeaves(w);
  // per room: skirting or wall cladding on every wall-backed edge
  for (const room of plan.rooms) for (const r of roomRuns(room)) {
    if (room.skirting) for (const [a, b] of cut(r.a, r.b, r.gaps, .1)) skirt(r.axis, r.at, r.inSign, a, b);
    if (room.wallFinish && !(room.wallFinishSkip || []).includes(r.side)) for (const [a, b] of cut(r.a, r.b, r.gaps, .01)) {
      const t = r.at + r.inSign * .005, m = M[room.wallFinish];
      r.axis === 'x' ? B(a, Math.min(r.at, t), b, Math.max(r.at, t), .008, H, m) : B(Math.min(r.at, t), a, Math.max(r.at, t), b, .008, H, m); } }
  // picture-frame mouldings: listed ranges per wall face, minus openings (±0.05) and items that cover the wall
  for (const w of plan.walls) for (const [side, fin] of Object.entries(w.finish || {})) { if (!fin.panels) continue;
    const axis = wallAxis(w), at = faceCoord(w.id, side), s = side === 'S' || side === 'E' ? 1 : -1;
    const gaps = openingsOf(w).filter(o => PASSABLE.has(o.type)).map(o => [o.a - .05, o.b + .05]);
    for (const it of plan.items) if (it.wall === w.id && it.side === side && it.coversWall !== undefined) gaps.push([it.from - it.coversWall, it.to + it.coversWall]);
    for (const [a, b] of fin.panels) softPanels(axis, at, s, a, b, gaps); }
  // fluted rounded corners
  const Q = { SW: [0, 3, -1, 1], SE: [2, 3, 1, 1], NW: [0, 1, -1, -1], NE: [2, 1, 1, -1] };
  for (const b of plan.blocks) for (const c of b.bullnose || []) { const [ix, iy, qx, qy] = Q[c]; softBullnose(b.rect[ix], b.rect[iy], qx, qy); }
  for (const w of plan.walls) for (const c of w.bullnose || []) { const p = w[c.end], dir = c.end === 'to' ? 1 : -1, sd = c.side === 'S' || c.side === 'E' ? 1 : -1;
    wallAxis(w) === 'x' ? softBullnose(p[0], p[1], dir, sd) : softBullnose(p[0], p[1], sd, dir); }
  // ceiling (shown from eye level): slab, spots, coffered trays with LED cove
  const ceil = new THREE.Group(); world.add(ceil); ceil.userData.ceiling = true;
  for (const c of plan.ceilings) B(...c.rect, H, H + .06, M.ceiling, { parent: ceil, clamp: false, cast: false });
  for (const room of plan.rooms) for (const [x, y] of room.spots || []) { C(x, y, .048, H - .004, H, M.blackMetal, { parent: ceil, cast: false }); C(x, y, .036, H - .006, H - .004, M.led, { parent: ceil, cast: false }); }
  // spot positions without a plan light also get a downlight (not on phones: fewer lights)
  if (!MOBILE) for (const room of plan.rooms) for (const [x, y] of room.spots || []) if (!plan.items.some(i => i.type === 'light' && Math.hypot(i.pos[0] - x, i.pos[1] - y) < .5)) lamp(x, y, H - .06, 'downlight');
  const trays = new THREE.Group(); trays.name = 'trays'; ceil.add(trays);
  for (const room of plan.rooms) { const c = room.ceiling; if (!c || c.type !== 'tray') continue; softTray(...(c.rect || bbox(room.poly)), c.border, c.radius, trays); }
  return ceil;
}
