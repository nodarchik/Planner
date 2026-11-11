// Floor footprints of plan items, from data only (no geometry is built). Used by the checks.
// Each entry: { id, name, type, kind: 'solid' | 'seat' | 'zone', rects: [[x1, y1, x2, y2], ...], front?: [dx, dy] }
import { bbox } from './geom.js';

// catalog footprints: [width, depth] in the item's own frame, centred on its position
const SIZE = {
  sofa: [[2.2, .9], [2.1, .92], [1.9, .85], [2.3, 1.05], [2.2, .9], [2.3, 1.2], [2.2, .9]],
  coffee: [[.8, .45], [.7, .7], [1.0, .55], [.9, .5], [.75, .6], [.8, .6], [1.2, .6]],
  dining: [[.9, .9], [.85, .85], [1.0, 1.0], [.9, .9], [.9, .9], [1.4, .8]],
  chair: [[.48, .5]], armchair: [[.78, .76]], stool: [[.4, .4]], sidetable: [[.45, .45]], floorlamp: [[.4, .4]], desk: [[.9, .6], [1.4, .7]], deskchair: [[.56, .56]]
};
const SEATS = new Set(['chair', 'stool', 'deskchair', 'vanityStool']);
const sq = ([x, y], s) => [x - s / 2, y - s / 2, x + s / 2, y + s / 2];

export function footprints(plan, G) {
  const out = [], put = (it, rects, extra = {}) => out.push({ id: it.id, name: it.label || it.name || it.type, type: it.type, kind: SEATS.has(it.type) ? 'seat' : 'solid', rects, ...extra });
  const dirOf = sp => sp.axis === 'x' ? [0, sp.dir] : [sp.dir, 0];
  for (const it of plan.items) {
    const t = it.type;
    if (SIZE[t]) { const v = SIZE[t][Math.min(it.variant || 0, SIZE[t].length - 1)], [x, y] = it.pos, W = it.opts && it.opts.W || v[0];
      const round = Math.abs(W - v[1]) < .1; // near-square pieces occupy the same floor at any angle; a rotated bounding box would overstate them
      const th = round ? 0 : (it.lookAt ? Math.atan2(-(it.lookAt[0] - x), -(it.lookAt[1] - y)) : -(it.rot || 0) * Math.PI / 180), c = Math.cos(th), s = Math.sin(th);
      const world = (lx, ly) => [x + lx * c + ly * s, y - lx * s + ly * c];
      const box = (a, b, e, f) => { const p = [world(a, b), world(e, b), world(e, f), world(a, f)]; return bbox(p); };
      const rects = [box(-W / 2, -v[1] / 2, W / 2, v[1] / 2)];
      if (t === 'sofa' && (it.variant === 4 || it.variant === 6)) rects.push(it.variant === 6 ? box(W / 2 - .9, -1.65, W / 2, -.45) : box(-W / 2, -1.65, -W / 2 + .9, -.45));
      put(it, rects, t === 'desk' ? { front: world(0, 1).map((p, i) => Math.round(p - [x, y][i])) } : {}); continue; }
    if (t === 'bed') { const [w, l] = it.size, an = it.anchor; if (!an) { put(it, [sq(it.pos, Math.max(w, l))]); continue; }
      const sp = G.frameSpec({ wall: an.wall, side: an.side, offset: an.gap || 0, from: an.offset - w / 2, to: an.offset + w / 2 });
      put(it, [G.frameRect(sp, 0, 0, w, l + .17)], { bed: { sp, w, l } }); continue; }
    if (t === 'nightstand') { put(it, [sq(it.pos, .45)]); continue; }
    if (t === 'vanityStool') { put(it, [sq(it.pos, .36)]); continue; }
    if (t === 'planter') { put(it, [sq(it.pos, it.plant === 'olive' ? .6 : 2 * (it.pot ? it.pot[0] : .2))]); continue; }
    if (t === 'herbPlanter') { put(it, [it.rect]); continue; }
    if (t === 'kitchenL') { const DT = it.depth + .04, spn = G.frameSpec(it.north), a0 = G.faceCoord(it.north.wall, it.north.side), sum = it.towers.reduce((p, c) => p + c, 0);
      const spw = G.frameSpec({ ...it.west, from: a0, to: it.west.to + sum });
      out.push({ id: it.id, name: it.label || it.name, type: t, kind: 'solid', rects: [G.frameRect(spn, 0, 0, spn.len, DT), G.frameRect(spw, 0, 0, spw.len, DT)], fronts: [{ rect: G.frameRect(spn, DT, 0, spn.len, DT), dir: dirOf(spn) }, { rect: G.frameRect(spw, DT, 0, spw.len, DT), dir: dirOf(spw) }] }); continue; }
    if (t === 'walkInCloset') { const [x1, y1, x2, y2] = bbox(G.roomById(it.room).poly), D = it.unitDepth, sd = it.sides, ws = (sd.west || [])[0], rects = [];
      if (sd.east) rects.push([x2 - D, y1 + .02, x2, y2 - .015]); if (sd.north) rects.push([x1, y1 + .02, x2, y1 + .02 + D]); if (ws) rects.push([x1, y1 + ws.from, x1 + ws.depth, y2 - .025]);
      put(it, rects, { closet: { D, Dw: ws ? ws.depth : 0, aisle: x2 - D - x1 - (ws ? ws.depth : 0) } }); continue; }
    if (t === 'shower' && it.variant === 'strip') { const sp = G.alongRoom(it.room, it.along); out.push({ id: it.id, name: it.label || it.name, type: t, kind: 'zone', rects: [G.frameRect(sp, 0, 0, sp.len, it.width)] }); continue; }
    if (t === 'tvWall') { const sp = G.frameSpec(it), c = sp.len / 2; put(it, [G.frameRect(sp, c - .85, 0, c + .85, .44)]); continue; }
    if (it.depth !== undefined && it.from !== undefined && (it.wall || it.axis) && it.depth >= .2 && !['wallArt', 'wallPanel'].includes(t)) {
      const sp = G.frameSpec(it); out.push({ id: it.id, name: it.label || it.name || t, type: t, kind: t === 'shower' ? 'zone' : 'solid', rects: [G.frameRect(sp, 0, 0, sp.len, sp.depth)], front: dirOf(sp), sp, doors: it.doors }); }
    // everything else (rugs, lights, curtains, wall décor, countertop appliances, niche shelves, sliding door) does not occupy floor
  }
  return out;
}
