// "product" item: a comforter.ge catalog piece built as a parametric model from its kind, size and colour (src/plan/products.js).
import * as THREE from 'three';
import { M } from '../materials.js';
import { HEX, tinted } from '../tint.js';
import { B, C, RB, beginG, endGRaw, pillow } from '../primitives.js';
import { movables, state } from '../scene.js';
import { cab } from '../furniture/storage.js';
import { productSize } from '../plan/products.js';
import { swapIn } from '../assets.js';
import MODELS from '../plan/comforter-models.json';

const COLORS = { beige: '#d8c8ae', 'light beige': '#e6dccb', 'dark beige': '#b9a68a', cashmere: '#cdb9a0', white: '#f0ede7', black: '#26262a', grey: '#8a8a8a', 'light grey': '#c4c4c2', 'dark grey': '#55575a',
  anthracite: '#3a3d40', green: '#6b7f5a', 'dark green': '#3f5a45', 'light green': '#a9bf98', blue: '#5a7690', navy: '#2c3e5c', brown: '#6b4a34', red: '#9b3a32', burgundy: '#6a2431', yellow: '#d5b04a',
  orange: '#cf7a3a', pink: '#d9a9a6', terracota: '#b8664a', golden: '#b9964f', silver: '#b4b6b8', travertine: '#d8c9ae' };
const hasM = (mt, re) => re.test(mt);

// colours and materials of one product: body (case goods), fab (upholstery), frame (legs), top (table tops)
function palette(p, it) {
  const name = String(p.color || '').toLowerCase().split(',')[0].trim(), over = it.color && HEX.test(it.color) ? it.color : null, hex = over || COLORS[name] || null, mt = String(p.material || '').toLowerCase();
  const body = !over && name === 'walnut' ? M.walnut : !over && name === 'oak' ? M.oakFurn : hex ? tinted('lacquerCream', hex) : M.oakFurn;
  const fab = hasM(mt, /velvet/) && hex ? tinted('velvetSage', hex) : hasM(mt, /leather/) ? tinted('plastic', hex || '#3a3330') : hex ? tinted('boucle', hex) : M.boucleOat;
  const metal = /gold/.test(name) ? M.brass : /silver/.test(name) ? M.steel : M.blackMetal, wood = hasM(mt, /wood|chipboard|mdf|veneer|oak|walnut/);
  const stone = hasM(mt, /travertine/) ? M.trav : hasM(mt, /ceram|porcelain|ceramogranit/) ? (hex && !/white|beige/.test(name) ? tinted('micro', hex) : M.ceramic) : hasM(mt, /microcement|concrete/) ? M.concrete : null;
  return { body, fab, metal, stone, glass: hasM(mt, /glass/), frame: hasM(mt, /metal/) || !wood ? metal : body, upholst: hasM(mt, /fabric|velvet|leather|mesh/), rattan: hasM(mt, /rattan/), plastic: hasM(mt, /plastic/), hex };
}

const legs4 = (x1, y1, x2, y2, z1, z2, s, m, ins = .04) => [[x1 + ins, y1 + ins], [x2 - ins, y1 + ins], [x1 + ins, y2 - ins], [x2 - ins, y2 - ins]].forEach(([x, y]) => B(x - s / 2, y - s / 2, x + s / 2, y + s / 2, z1, z2, m, { clamp: false }));
const nCols = (w, per, max = 6) => Math.max(1, Math.min(max, Math.round(w / per)));

// cabinet run with legs or plinth; cols doors/drawers of width ~colW and `rows` rows
function casegood(c, o) {
  const { x1, x2, y1, y2, w, h } = c, lg = o.leg || 0, n = nCols(w, o.colW || .5), rows = o.rows || 1;
  if (lg) legs4(x1, y1, x2, y2, 0, lg, .04, c.frame, .03); else if (o.plinth) B(x1 + .01, y1 + .03, x2 - .01, y2 - .01, 0, o.plinth, M.blackMetal, { clamp: false });
  cab({ axis: 'x', a1: x1, a2: x2, back: y2, front: y1, h1: lg || o.plinth || 0, h2: o.top ?? h, cols: Array.from({ length: n }, () => [1, rows]), fm: c.body, cm: c.body, pull: o.pull });
}

function carcassOpen(c, z1, z2, n, o = {}) { // open shelving between z1 and z2: sides, back, top, n-1 inner shelves
  const { x1, x2, y1, y2 } = c, m = c.body, t = .022;
  B(x1, y1, x1 + t, y2, z1, z2, m); B(x2 - t, y1, x2, y2, z1, z2, m); B(x1 + t, y2 - .012, x2 - t, y2, z1, z2, m); B(x1 + t, y1, x2 - t, y2, z2 - t, z2, m); B(x1 + t, y1, x2 - t, y2, z1, z1 + t, m);
  for (let i = 1; i < n; i++) { const z = z1 + (z2 - z1) * i / n; B(x1 + t, y1 + .01, x2 - t, y2 - .012, z - t / 2, z + t / 2, m); }
  if (o.books) for (let i = 0; i < n; i++) { const z = z1 + (z2 - z1) * i / n + t / 2; let x = x1 + t + .03; const top = z + Math.min(.3, (z2 - z1) / n - t - .06);
    for (let k = 0; k < 5 && x < x2 - t - .1; k++) { const bw = .03 + ((i * 7 + k * 3) % 4) * .008, bh = (top - z) * (.7 + ((i + k * 5) % 3) * .15); B(x, y2 - .24, x + bw, y2 - .03, z, z + bh, [M.book1, M.book2, M.book3][(i + k) % 3], { clamp: false }); x += bw + .004; } }
}

const kinds = {
  chest: c => casegood(c, { leg: c.h > .7 ? .1 : 0, rows: Math.max(2, Math.round((c.h - .1) / .2)), colW: .6 }),
  nightstand: c => casegood(c, { leg: c.h > .4 ? .12 : 0, rows: c.h > .5 ? 3 : 2, colW: .7 }),
  console: c => casegood(c, { leg: c.h > .6 ? .12 : 0, rows: c.h < .6 ? 1 : 2, colW: .45 }),
  tvStand: c => casegood(c, { leg: c.h > .35 ? .1 : 0, rows: 1, colW: .5 }),
  cabinet: c => casegood(c, { plinth: .06, rows: c.h > 1 ? 2 : 1, colW: .45 }),
  wardrobe: c => casegood(c, { plinth: .05, rows: 1, colW: .55 }),
  shoeStand: c => casegood(c, { plinth: .05, rows: Math.max(1, Math.min(4, Math.round(c.h / .45))), colW: .5 }),
  storageChest(c) { casegood(c, { plinth: 0, rows: 1, colW: .6, top: c.h - .04 }); RB(c.x1, c.y1, c.x2, c.y2, c.h - .04, c.h, .015, c.body); },
  showcase(c) { const { x1, y1, w, h } = c, lh = Math.max(.5, Math.min(.85, h * .38)), n = nCols(w, .5, 4), m = c.body;
    casegood(c, { plinth: .06, rows: lh > .6 ? 2 : 1, colW: .5, top: lh });
    carcassOpen(c, lh, h, Math.max(2, Math.round((h - lh) / .4))); const cw = (w - .044) / n;
    for (let i = 0; i < n; i++) { const a = x1 + .022 + i * cw; RB(a + .006, y1, a + cw - .006, y1 + .01, lh + .01, h - .03, .002, M.glass, { clamp: false });
      B(a, y1, a + cw, y1 + .018, lh, lh + .02, m); B(a, y1, a + cw, y1 + .018, h - .04, h - .02, m); B(a, y1, a + .016, y1 + .018, lh, h - .02, m); B(a + cw - .016, y1, a + cw, y1 + .018, lh, h - .02, m); } },
  bookcase(c) { const { h } = c, tall = h > 1.4; if (tall) casegood({ ...c, h: .5 }, { plinth: .05, rows: 1, colW: .5 }); carcassOpen(c, tall ? .5 : 0, h, Math.max(2, Math.round((h - (tall ? .5 : 0)) / .36)), { books: true }); },
  shelf(c) { carcassOpen(c, 0, c.h, Math.max(2, Math.round(c.h / .36)), { books: c.h > .8 }); },
  desk(c) { const { x1, x2, y1, y2, w, h } = c, tt = .03;
    RB(x1, y1, x2, y2, h - tt, h, .012, c.body);
    if (w >= 1.1) { const dw = Math.min(.45, w * .33); cab({ axis: 'x', a1: x2 - dw, a2: x2, back: y2, front: y1, h1: .04, h2: h - tt, cols: [[1, 3]], fm: c.body, cm: c.body }); B(x2 - dw, y1 + .03, x2, y2 - .02, 0, .04, M.blackMetal, { clamp: false });
      B(x1, y1 + .03, x1 + .03, y2, 0, h - tt, c.frame); B(x1 + .03, y2 - .02, x2 - dw, y2, .25, h - tt, c.body); }
    else legs4(x1, y1, x2, y2, 0, h - tt, .045, c.frame, .03); },
  table: c => table(c, { tt: c.glass && !c.stone ? .012 : .04 }),
  coffeeTable: c => table(c, { tt: c.glass && !c.stone ? .012 : .035, shelf: c.w >= .8 && c.h > .3 }),
  chair: c => seating(c, {}), outdoorChair: c => seating(c, { outdoor: true }), barStool: c => seating(c, { stool: true }),
  sofa: c => sofa(c, {}), armchair: c => sofa(c, { chair: true }), cornerSofa: c => cornerSofa(c), pouf: c => pouf(c),
  bed: c => bed(c), kidsBed: c => bed(c), mattress: c => { RB(c.x1, c.y1, c.x2, c.y2, 0, c.h, .05, M.linenWhite, { seg: 5 }); B(c.x1 + .004, c.y1 + .004, c.x2 - .004, c.y2 - .004, c.h * .3, c.h * .36, M.linenSand, { clamp: false, cast: false }); },
  lounger: c => lounger(c)
};

function table(c, o) {
  const { x1, x2, y1, y2, w, d, h } = c, glass = c.glass && !c.stone, tt = o.tt ?? (glass ? .012 : w > 1.4 ? .045 : .035), top = c.stone || (glass ? M.blackGlass : c.body), round = /round|oval|ø|circle|circular/i.test(c.title);
  if (round) { RB(-w / 2, -d / 2, w / 2, d / 2, h - tt, h, w, top, { seg: 8 }); if (w >= .8 || c.kind === 'table') { C(0, 0, .06, .03, h - tt, c.frame, { seg: 20 }); C(0, 0, Math.min(.3, w * .3), 0, .03, c.frame, { seg: 40 }); } else legs4(-w / 2 + .08, -d / 2 + .08, w / 2 - .08, d / 2 - .08, 0, h - tt, .035, c.frame, 0); }
  else { const r = Math.min(.02, tt * .5), ap = Math.min(.08, h * .12), m = c.frame; RB(x1, y1, x2, y2, h - tt, h, r, top, { seg: 3 });
    if (c.kind === 'table' || glass) { B(x1 + .04, y1 + .04, x2 - .04, y1 + .055, h - tt - ap, h - tt, m); B(x1 + .04, y2 - .055, x2 - .04, y2 - .04, h - tt - ap, h - tt, m); B(x1 + .04, y1 + .04, x1 + .055, y2 - .04, h - tt - ap, h - tt, m); B(x2 - .055, y1 + .04, x2 - .04, y2 - .04, h - tt - ap, h - tt, m); }
    legs4(x1, y1, x2, y2, 0, h - tt, c.kind === 'table' ? .06 : .04, m, .05); if (c.kind === 'table' && w > 1.6) B(x1 + .06, -.012, x2 - .06, .012, .18, .2, m); }
  if (o.shelf && !round) B(x1 + .04, y1 + .04, x2 - .04, y2 - .04, .1, .12, c.body, { clamp: false });
}

// chair family: wooden (posts, slat rails), upholstered on metal legs, woven (rattan slats on a metal frame)
function seating(c, o) {
  const { x1, x2, y1, y2, w, d, h } = c, sh = o.stool ? Math.min(.78, h * .68) : Math.min(.52, h * .56), round = Math.abs(w - d) < .02 && o.stool, f = c.frame;
  const style = o.outdoor || c.rattan ? 'woven' : c.upholst ? 'uph' : c.frame === c.body ? 'wood' : 'frame';
  const seatM = style === 'woven' ? tinted('rattan', c.hex) : style === 'uph' ? c.fab : c.plastic ? tinted('plastic', c.hex) : style === 'frame' ? c.metal : c.body, taper = (x, y, z2, m) => { C(x, y, .013, 0, z2, m, { seg: 12, rt: .019 }); };
  const lx = [x1 + .045, x2 - .045], ly = [y1 + .045, y2 - .045];
  if (style === 'uph' || style === 'frame') { for (const x of lx) for (const y of ly) taper(x, y, sh - .05, f); }
  else for (const x of lx) for (const y of ly) B(x - .02, y - .02, x + .02, y + .02, 0, sh - .03, f, { clamp: false });
  if (style === 'woven') { const n = Math.max(4, Math.round(w / .05)); for (let i = 0; i < n; i++) { const xx = x1 + .02 + (w - .04) * (i + .5) / n; B(xx - .02, y1, xx + .02, y2, sh - .03, sh, seatM, { clamp: false }); } B(x1, y1, x2, y1 + .03, sh - .06, sh - .03, f); B(x1, y2 - .03, x2, y2, sh - .06, sh - .03, f); }
  else if (style === 'uph') { B(x1 + .03, y1 + .03, x2 - .03, y2 - .03, sh - .09, sh - .05, f); RB(x1, y1, x2, y2, sh - .07, sh, .03, seatM, { seg: 5 }); }
  else RB(x1, y1, x2, y2, sh - .035, sh, round ? w : .025, seatM, { seg: 4 });
  const top = h; // backrest: posts to the top, then slats (woven / wood) or a stepped upholstered panel
  if (style === 'uph') { const n = 3, z0 = sh + .06; for (let i = 0; i < n; i++) { const za = z0 + (top - z0) * i / n, zb = z0 + (top - z0) * (i + 1) / n + .004, dy = .06 * (n - 1 - i) / (n - 1); RB(x1 + .015, y2 - .06 - dy, x2 - .015, y2 - dy, za, zb, i === n - 1 ? .04 : .006, seatM, { seg: 4 }); }
    for (const x of [x1 + .03, x2 - .03]) B(x - .012, y2 - .05, x + .012, y2 - .02, sh - .07, z0 + .1, f, { clamp: false }); }
  else { for (const x of lx) B(x - .02, y2 - .065, x + .02, y2 - .025, sh - .03, top, f, { clamp: false });
    const slats = style === 'woven' ? 4 : 2, z0 = sh + (o.stool ? .1 : .13), gap = (top - z0 - .05) / (slats - 1), sm = style === 'woven' ? seatM : c.frame === c.body ? c.body : seatM;
    for (let i = 0; i < slats; i++) { const zt = i === 0 ? top : top - .05 - i * gap + .045; B(x1 + .03, y2 - .06, x2 - .03, y2 - .03, zt - (i === 0 ? .09 : .045), zt, sm, { clamp: false }); } }
  if (o.stool) { const z = sh * .4; B(x1 + .035, y1 + .035, x2 - .035, y1 + .055, z, z + .02, f, { clamp: false }); B(x1 + .035, y2 - .055, x2 - .035, y2 - .035, z, z + .02, f, { clamp: false }); }
}

// one sofa block: base, seat cushions, optional back along +y and arms; x/y ranges are the block's outer edges
function block(c, xa, xb, ya, yb, o) {
  const lg = .1, seat = Math.min(.46, c.h * .55), arm = o.chair ? .14 : .16, f = c.fab, ar = seat + .2, back = o.back ? Math.min(.2, (yb - ya) * .28) : 0;
  legs4(xa, ya, xb, yb, 0, lg, .04, c.metal, .05);
  RB(xa, ya, xb, yb, lg, seat - .12, .03, f, { seg: 4 });
  const l = o.armL ? arm : 0, r = o.armR ? arm : 0;
  if (o.armL) RB(xa, ya, xa + arm, yb, lg, ar, .05, f, { seg: 4 }); if (o.armR) RB(xb - arm, ya, xb, yb, lg, ar, .05, f, { seg: 4 });
  const n = Math.max(1, Math.round((xb - xa - l - r) / .65)), cw = (xb - xa - l - r) / n;
  for (let i = 0; i < n; i++) { const a = xa + l + i * cw; RB(a + .006, ya + .01, a + cw - .006, yb - back, seat - .12, seat, .04, f, { seg: 5 });
    if (back) RB(a + .006, yb - back - .02, a + cw - .006, yb - .01, seat, c.h - .02, .06, f, { seg: 5 }); }
  if (back) RB(xa, yb - Math.min(.1, back * .6), xb, yb, lg, c.h, .05, f, { seg: 4 });
}
function sofa(c, o) { block(c, c.x1, c.x2, c.y1, c.y2, { back: true, armL: true, armR: true, chair: o.chair }); }
function cornerSofa(c) {
  const { x1, x2, y1, y2, w, d } = c, dm = Math.min(.98, d * .55), cw = Math.max(.9, Math.min(1.3, w * .3)), right = (c.it.chaise || 'R') !== 'L';
  block(c, x1, x2, y2 - dm, y2, { back: true, armL: right, armR: !right });
  if (right) block(c, x2 - cw, x2, y1, y2 - dm, { armR: true }); else block(c, x1, x1 + cw, y1, y2 - dm, { armL: true });
}
function pouf(c) { const { w, d, h } = c; if (Math.abs(w - d) < .03) { C(0, 0, w / 2, 0.02, h, c.fab, { seg: 48 }); C(0, 0, w / 2 - .02, 0, .02, c.metal, { seg: 24 }); } else { RB(c.x1, c.y1, c.x2, c.y2, 0, h, .08, c.fab, { seg: 5 }); } }

function bed(c) {
  const { x1, x2, y1, y2, w, d, h } = c, fh = Math.min(.34, h * .4), hb = .1, top = fh + .22, my = y2 - hb;
  legs4(x1, y1, x2, y2, 0, .1, .05, c.frame, .04);
  RB(x1, y1, x2, my, .1, fh, .02, c.body, { seg: 3 });
  RB(x1, y2 - hb, x2, y2, .1, h, .03, c.upholst ? c.fab : c.body, { seg: 4 });
  RB(x1 + .04, y1 + .03, x2 - .04, my - .005, fh, top, .06, M.linenWhite, { seg: 5 });
  RB(x1 + .03, y1 + .02, x2 - .03, my - d * .35, top - .01, top + .07, .035, c.hex ? tinted('linenWhite', c.hex) : M.linenSand, { seg: 4 });
  const n = w > 1.3 ? 2 : 1, pw = Math.min(.62, (w - .1) / n - .06), px = i => n === 1 ? 0 : (i - .5) * (w / 2 - .02);
  if (h > top + .25) for (let i = 0; i < n; i++) pillow(px(i), my - .26, top + .075, pw, .15, .4, M.linenWhite, .25);
}

function lounger(c) {
  const { x1, x2, y1, y2, h } = c, m = c.frame, hx = x1 + .8, a = [hx, .36], b = [x1 + .03, h - .05], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), fab = c.rattan ? M.rattan : c.fab;
  legs4(hx, y1, x2, y2, 0, .3, .04, m, .03); B(hx, y1 + .02, x2, y1 + .045, .27, .3, m); B(hx, y2 - .045, x2, y2 - .02, .27, .3, m);
  for (const f of [.45, .85]) { const xx = hx + (b[0] - hx) * f, zz = a[1] + (b[1] - a[1]) * f - .05; B(xx - .02, y1 + .03, xx + .02, y1 + .07, 0, zz, m, { clamp: false }); B(xx - .02, y2 - .07, xx + .02, y2 - .03, 0, zz, m, { clamp: false }); }
  RB(hx, y1, x2, y2, .3, .38, .03, fab, { seg: 3 });
  const back = RB(-L / 2, y1, L / 2, y2, -.035, .035, .03, fab, { seg: 3 }); back.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + .01, 0); back.rotation.z = ang;
  for (const y of [y1 + .05, y2 - .05]) C(x2 - .02, y, .04, .0, .08, M.rubber, { seg: 16 });
}

function fit(g, size) { // safety net: stretch the finished model by a few mm so the box matches the product exactly
  g.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()), k = [size[0] / s.x, size[2] / s.y, size[1] / s.z];
  if (k.some(v => Math.abs(v - 1) > .004 && Math.abs(v - 1) < .08)) g.scale.set(...k.map(v => Math.abs(v - 1) < .08 ? v : 1));
}

export const product = {
  product(it) {
    let s = productSize(it);
    if (!s) { console.warn(`plan: item ${it.id} uses unknown product ${it.product}; showing a placeholder`); s = { p: { id: it.product, title: `Unknown product ${it.product}` }, kind: 'unknown', w: .6, d: .6, h: .6 }; }
    const { p, kind, w, d, h } = s, build = kind === 'unknown' ? c => B(c.x1, c.y1, c.x2, c.y2, 0, c.h, M.carcass) : kinds[kind]; if (!build) throw new Error(`plan: item ${it.id} product ${it.product} has no model for kind "${kind}"`);
    const c = { w, d, h, kind, it, title: p.title, x1: -w / 2, x2: w / 2, y1: -d / 2, y2: d / 2, ...palette(p, it) };
    beginG(it.name || it.label || p.title); build(c); const g = state.CUR; fit(g, [w, d, h]); endGRaw();
    const [x, y] = it.pos, face = it.lookAt ? Math.atan2(-(it.lookAt[0] - x), -(it.lookAt[1] - y)) : -(it.rot || 0) * Math.PI / 180;
    g.position.set(x, 0, y); g.rotation.y = face; g.userData.home = { x, z: y, r: face }; g.userData.product = p.id; movables.push(g);
    const mo = kind !== 'unknown' && MODELS[p.id]; if (mo) swapIn(g, p.id, { path: `assets/comforter/${p.id}.glb`, rot: mo.rot, size: mo.fit === 'width' ? null : [w, d, h], width: mo.fit === 'width' ? w : 0, it });
  }
};
