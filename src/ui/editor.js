// In-page plan editor. Every edit changes the plan data, then the affected item (or everything) is rebuilt from it.
// Edits are kept per device as a patch against the published plan; undo/redo, export/import and a pasteable change summary.
import * as THREE from 'three';
import { V2, V3, camera, controls, markShadows, renderer, scene, stage, state, world } from '../scene.js';
import { M } from '../materials.js';
import { DESIGNS } from '../catalog.js';
import { PUBLISHED, plan, setPlan, wallAxis, wallRect } from '../plan/plan.js';
import { applyPatch, describe, diffPlan, isEmpty } from '../plan/patch.js';
import { buildAll, rebuildItem } from '../build.js';
import { itemGroups, itemObjects } from '../items/index.js';
import { rebuildPT, setPhoto } from '../pathtracer.js';
import { renderParts } from './style.js';
import { validateBindings } from './bindings.js';
import { active as syncActive, save as syncSave, setApplier } from '../plan/sync.js';

const PKEY = 'palace1-plan-patch-v1', GRID = .05, SNAP = .08;
try { Object.keys(localStorage).filter(k => /^palace1-(pos|style-v2|types|layout)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
const $ = id => document.getElementById(id), selPanel = $('selpanel'), hintEl = $('hint'), bar = $('editbar');
const undoStack = [], redoStack = [], snapshot = () => JSON.stringify(plan);
const itemOf = id => plan.items.find(i => i.id === id), wallOf = id => plan.walls.find(w => w.id === id);
const r2 = v => Math.round(v * 100) / 100;

/* ---------- persistence, undo, redo ---------- */
export function hasEdits() { try { return localStorage.getItem(PKEY) !== null; } catch (e) { return false; } }
export function loadEdits() { const raw = localStorage.getItem(PKEY); if (raw) setPlan(applyPatch(PUBLISHED, JSON.parse(raw))); } // throws when the saved patch cannot be applied; main.js recovers
export function discardEdits() { try { localStorage.removeItem(PKEY); } catch (e) {} }
function persist() { let p; try { p = diffPlan(PUBLISHED, plan); if (isEmpty(p)) { p = null; localStorage.removeItem(PKEY); } else localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} if (p !== undefined) syncSave(p); updateBar(); }
// edits from another session (sync.js): replaces the plan without a new save; false = the patch could not be built and the plan is unchanged
setApplier(patch => { const before = snapshot(); try { undoStack.length = redoStack.length = 0; setPlan(applyPatch(PUBLISHED, patch || {})); buildAll(); try { patch ? localStorage.setItem(PKEY, JSON.stringify(patch)) : localStorage.removeItem(PKEY); } catch (e) {} reselect(); updateBar(); return true; } catch (e) { console.error(e); try { setPlan(JSON.parse(before)); buildAll(); reselect(); } catch (e2) { console.error(e2); } return false; } });
function updateBar() { const n = describe(PUBLISHED, plan).length; $('changeCount').textContent = n ? `${n} change${n > 1 ? 's' : ''} vs published` : 'no changes';
  $('undoBtn').disabled = !undoStack.length; $('redoBtn').disabled = !redoStack.length; }
// run a change: opts.item = rebuild only that item, opts.none = already applied to the scene, otherwise rebuild everything
export function edit(fn, opts = {}) { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; const nb = JSON.stringify(plan.meta.bindings); fn(); if (JSON.stringify(plan.meta.bindings) !== nb) validateBindings(); persist(); // strict check only when the edit touched the bindings
  if (opts.none) return; if (opts.item) rebuildItem(opts.item); else buildAll(); reselect(); }
// like edit(), for changes that may be invalid: on any error the plan is put back and the message is returned
export function tryEdit(fn) { const before = snapshot(); try { edit(fn); return null; } catch (e) { if (undoStack[undoStack.length - 1] === before) undoStack.pop(); try { restore(before); } catch (e2) { console.error(e2); } return String((e && e.message) || e); } }
function restore(json) { setPlan(JSON.parse(json)); persist(); buildAll(); reselect(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
// reset every edit back to the published plan (one undo step); false when there is nothing to reset
export function resetPlan() { if (isEmpty(diffPlan(PUBLISHED, plan))) return false; undoStack.push(snapshot()); redoStack.length = 0; sel = null; restore(JSON.stringify(PUBLISHED)); return true; }
// undo / redo up to `steps` times, or reset; returns how many steps ran and what changed
export function history(action, steps = 1) {
  const before = JSON.parse(snapshot()); let n = 0;
  if (action === 'reset') n = +resetPlan(); else { const from = action === 'undo' ? undoStack : redoStack, to = action === 'undo' ? redoStack : undoStack; let cur = snapshot(); while (n < steps && from.length) { to.push(cur); cur = from.pop(); n++; } if (n) restore(cur); } // move the stacks, rebuild once
  return { steps: n, lines: describe(before, plan), left: { undo: undoStack.length, redo: redoStack.length } };
}

/* ---------- selection ---------- */
let sel = null; const boxes = []; // sel = { kind: 'item' | 'wall', id }
const objectsOf = s => s.kind === 'item' ? (itemObjects.get(s.id) || []) : world.children.filter(o => o.userData.wall === s.id);
function drawBoxes() { boxes.splice(0).forEach(b => { scene.remove(b); b.geometry.dispose(); }); if (!sel) return;
  for (const o of objectsOf(sel)) { if (o.isLight) continue; const b = new THREE.BoxHelper(o, sel.kind === 'wall' ? 0xc4552f : 0x2f6fd8); b.material.depthTest = false; b.material.transparent = true; b.renderOrder = 10; scene.add(b); boxes.push(b); } }
export function select(s) { sel = s; state.sel = s; selPanel.hidden = !s; drawBoxes(); if (s) renderPanel(); rebuildPT(); }
export function reselect() { if (sel && !(sel.kind === 'item' ? itemOf(sel.id) : wallOf(sel.id))) sel = null; select(sel); }

addEventListener('modelswap', () => drawBoxes()); // a model replaced its placeholder: selection outlines follow

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(), ndc = new V2(), dragPlane = new THREE.Plane(new V3(0, 1, 0), 0), hitP = new V3();
function aim(ev) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function pick(ev) { aim(ev);
  for (const h of ray.intersectObject(world, true)) { if (!h.object.isMesh || h.object.material === M.sheer) continue;
    let o = h.object, vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) continue;
    while (o.parent && o.parent !== world) o = o.parent;
    if (o.userData.item) return { kind: 'item', id: o.userData.item, point: h.point }; if (o.userData.wall) return { kind: 'wall', id: o.userData.wall, point: h.point }; }
  return null; }

/* ---------- what dragging does to each kind of item ---------- */
function mover(it) {
  if (it.pos) return { free: true, move: (dx, dy) => { it.pos = [r2(it.pos[0] + dx), r2(it.pos[1] + dy)]; if (it.lookAt) it.lookAt = [r2(it.lookAt[0] + dx), r2(it.lookAt[1] + dy)]; } };
  if (it.center) return { free: true, move: (dx, dy) => { it.center = [r2(it.center[0] + dx), r2(it.center[1] + dy)]; } };
  if (it.rect) return { free: true, move: (dx, dy) => { it.rect = [r2(it.rect[0] + dx), r2(it.rect[1] + dy), r2(it.rect[2] + dx), r2(it.rect[3] + dy)]; } };
  if (it.anchor) { const ax = it.anchor.side === 'N' || it.anchor.side === 'S' ? 'x' : 'y'; return { axis: ax, move: (dx, dy) => { it.anchor.offset = r2(it.anchor.offset + (ax === 'x' ? dx : dy)); } }; }
  if (it.from !== undefined && it.to !== undefined && (it.wall || it.axis)) { const sd = it.side || it.face, ax = it.axis || (sd === 'N' || sd === 'S' ? 'x' : 'y');
    return { axis: ax, move: (dx, dy) => { const d = ax === 'x' ? dx : dy; it.from = r2(it.from + d); it.to = r2(it.to + d); for (const k of ['rail', 'towel', 'seats']) if (it[k]) it[k] = it[k].map(v => r2(v + d)); if (it.at !== undefined) it.at = r2(it.at + d); } }; }
  if (it.at !== undefined && it.wall) { const ax = it.side === 'N' || it.side === 'S' ? 'x' : 'y'; return { axis: ax, move: (dx, dy) => { const d = ax === 'x' ? dx : dy; it.at = r2(it.at + d); if (it.rail) it.rail = it.rail.map(v => r2(v + d)); } }; }
  return null; }
// moving a wall along its normal: junction endpoints, room outlines and ceiling trays on its faces follow; attached items follow through their wall reference
function moveWall(w, d) { const ax = wallAxis(w), [x1, y1, x2, y2] = wallRect(w), k = ax === 'x' ? 1 : 0, faces = ax === 'x' ? [y1, y2] : [x1, x2], lo = (ax === 'x' ? x1 : y1) - .3, hi = (ax === 'x' ? x2 : y2) + .3;
  const on = p => faces.some(f => Math.abs(p[k] - f) < 1e-6) && p[1 - k] > lo && p[1 - k] < hi;
  for (const o of plan.walls) { if (o === w) continue; for (const e of ['from', 'to']) if (on(o[e])) o[e][k] = r2(o[e][k] + d); }
  for (const r of plan.rooms) { for (const p of r.poly) if (on(p)) p[k] = r2(p[k] + d);
    const c = r.ceiling && r.ceiling.rect; if (c) for (const i of ax === 'x' ? [1, 3] : [0, 2]) if (faces.some(f => Math.abs(c[i] - f) < 1e-6)) c[i] = r2(c[i] + d); }
  w.from[k] = r2(w.from[k] + d); w.to[k] = r2(w.to[k] + d); }

/* ---------- panel: every field of the selected item or wall is editable ---------- */
const SIDES = ['N', 'S', 'E', 'W'], HIDE = new Set(['id', 'type', 'look', 'finish', 'bullnose', 'exterior']);
const ENUM = { side: SIDES, face: SIDES, along: SIDES, grow: SIDES, swing: SIDES, hinge: ['start', 'end'], axis: ['x', 'y'], plant: ['fig', 'snake', 'olive'], image: ['art1', 'art2'] };
function fields(obj, path = [], out = []) {
  for (const [k, v] of Object.entries(obj)) { if (HIDE.has(k)) continue; const p = [...path, k];
    if (typeof v === 'number') out.push({ p, v, kind: 'num' }); else if (typeof v === 'boolean') out.push({ p, v, kind: 'bool' });
    else if (typeof v === 'string') out.push({ p, v, kind: k === 'wall' ? 'wall' : (ENUM[k] ? 'enum' : 'text'), opts: ENUM[k] });
    else if (Array.isArray(v) && v.every(e => typeof e === 'number')) out.push({ p, v, kind: 'nums' });
    else if (Array.isArray(v) && v.every(e => e && typeof e === 'object' && !Array.isArray(e))) v.forEach((e, i) => fields(e, [...p, i], out));
    else if (v && typeof v === 'object' && !Array.isArray(v)) fields(v, p, out); else out.push({ p, v, kind: 'json' }); }
  return out; }
const getAt = (o, p) => p.reduce((a, k) => a[k], o);
function setAt(o, p, v) { const last = p[p.length - 1], host = p.slice(0, -1).reduce((a, k) => a[k], o); host[last] = v; }
function renderPanel() { const isItem = sel.kind === 'item', obj = isItem ? itemOf(sel.id) : wallOf(sel.id), box = $('selfields'); if (!obj) return;
  $('selname').textContent = isItem ? (obj.label || obj.name || obj.type) : 'Wall'; $('selpos').textContent = `${sel.id}${isItem ? ' · ' + obj.type : ''}`;
  box.textContent = '';
  const list = fields(obj); const catalog = isItem && DESIGNS[obj.type];
  if (catalog) { if (!('variant' in obj)) list.unshift({ p: ['variant'], v: 0, kind: 'num' }); if (!('rot' in obj) && !obj.lookAt) list.push({ p: ['rot'], v: 0, kind: 'num' }); }
  const apply = (p, v) => edit(() => { setAt(obj, p, v); if (p[0] === 'rot') delete obj.lookAt; }, isItem ? { item: sel.id } : {});
  for (const f of list) { const row = document.createElement('label'); row.className = 'fld'; const name = document.createElement('span'); name.textContent = f.p.join('.'); row.appendChild(name);
    const mk = (type, val, on) => { const i = document.createElement('input'); i.type = type; if (type === 'number') { i.step = '0.01'; i.inputMode = 'decimal'; } i.value = val; i.onchange = () => on(i); i.onkeydown = ev => ev.stopPropagation(); row.appendChild(i); return i; };
    if (catalog && f.p.join() === 'variant') { const s = document.createElement('select'); catalog.items.forEach((d, i) => s.add(new Option(`${d.name} · ${d.info}`, i))); s.value = f.v; s.onchange = () => apply(f.p, +s.value); row.appendChild(s); }
    else if (f.kind === 'num') mk('number', f.v, i => { const v = parseFloat(i.value); if (!isNaN(v)) apply(f.p, v); });
    else if (f.kind === 'nums') { const w = document.createElement('span'); w.className = 'nums'; row.appendChild(w); f.v.forEach((n, k) => { const i = mk('number', n, el => { const v = parseFloat(el.value); if (!isNaN(v)) { const a = [...getAt(obj, f.p)]; a[k] = v; apply(f.p, a); } }); w.appendChild(i); }); }
    else if (f.kind === 'bool') { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = f.v; i.onchange = () => apply(f.p, i.checked); row.appendChild(i); }
    else if (f.kind === 'wall' || f.kind === 'enum') { const s = document.createElement('select'); (f.kind === 'wall' ? [...plan.walls, ...plan.blocks].map(w => w.id) : f.opts).forEach(o => s.add(new Option(o, o))); s.value = f.v; s.onchange = () => apply(f.p, s.value); row.appendChild(s); }
    else if (f.kind === 'text') mk('text', f.v, i => apply(f.p, i.value));
    else { const t = document.createElement('textarea'); t.rows = 2; t.value = JSON.stringify(f.v); t.onkeydown = ev => ev.stopPropagation(); t.onchange = () => { try { apply(f.p, JSON.parse(t.value)); } catch (e) { t.value = JSON.stringify(f.v); } }; row.appendChild(t); }
    box.appendChild(row); }
  $('selactions').hidden = !isItem; $('selparts').textContent = '';
  if (isItem) { const g = (itemGroups.get(sel.id) || [])[0]; if (g) { renderParts(g, sel.id); renderSize(g, obj); } $('sizebox').hidden = !g || !catalog;
    $('rotL').disabled = $('rotR').disabled = !(catalog || (obj.type === 'bed' && obj.pos)); } else $('sizebox').hidden = true; }
// catalog pieces have fixed designs: W × D × H scales them
function renderSize(g, it) { const s = g.userData.size, sc = it.resize || [1, 1, 1]; [['szW', s.x * sc[0]], ['szD', s.z * sc[2]], ['szH', s.y * sc[1]]].forEach(([id, v]) => { $(id).value = v.toFixed(2); }); }
[['szW', 0, 'x'], ['szD', 2, 'z'], ['szH', 1, 'y']].forEach(([id, k, ax]) => { const el = $(id); el.onkeydown = ev => ev.stopPropagation();
  el.onchange = () => { if (!sel || sel.kind !== 'item') return; const it = itemOf(sel.id), g = (itemGroups.get(sel.id) || [])[0], v = parseFloat(el.value); if (!g || !(v > .04)) return;
    const ratio = Math.min(4, Math.max(.2, v / g.userData.size[ax])); edit(() => { const sc = it.resize ? [...it.resize] : [1, 1, 1]; if ($('szLock').checked) { const f = ratio / sc[k]; sc[0] *= f; sc[1] *= f; sc[2] *= f; } else sc[k] = ratio; it.resize = sc.map(n => +n.toFixed(4)); }, { item: it.id }); }; });
$('szReset').onclick = () => { if (sel && sel.kind === 'item' && itemOf(sel.id).resize) edit(() => { delete itemOf(sel.id).resize; }, { item: sel.id }); };

/* ---------- actions ---------- */
function rotate(deg) { if (!sel || sel.kind !== 'item') return; const it = itemOf(sel.id); if (!(DESIGNS[it.type] || (it.type === 'bed' && it.pos))) return;
  edit(() => { let r = it.rot || 0; if (it.lookAt) { r = Math.round(Math.atan2(it.lookAt[0] - it.pos[0], it.lookAt[1] - it.pos[1]) * 180 / Math.PI); delete it.lookAt; } it.rot = ((r + deg) % 360 + 360) % 360; }, { item: it.id }); }
const freshId = base => { let n = 2, id = base; while (plan.items.some(i => i.id === id)) id = `${base}-${n++}`; return id; };
function duplicate() { if (!sel || sel.kind !== 'item') return; const src = itemOf(sel.id), it = structuredClone(src), mv = mover(it); it.id = freshId(src.id.replace(/-\d+$/, ''));
  if (mv) mv.move(mv.axis === 'y' ? 0 : .3, mv.axis === 'x' ? 0 : .3); edit(() => plan.items.push(it), { item: it.id }); select({ kind: 'item', id: it.id }); }
function remove() { if (!sel || sel.kind !== 'item') return; const id = sel.id; sel = null; edit(() => { plan.items.splice(plan.items.findIndex(i => i.id === id), 1); }, { item: id }); }
const ADD = { nightstand: { type: 'nightstand' }, 'planter · fig': { type: 'planter', plant: 'fig', scale: 1 }, 'planter · snake': { type: 'planter', plant: 'snake', scale: 1 }, 'planter · olive': { type: 'planter', plant: 'olive', scale: 1 },
  rug: { type: 'rug', material: 'rug', radius: .05, h: [0, .012] }, 'vanity stool': { type: 'vanityStool' }, 'table decor + pendants': { type: 'tableDecor' },
  bed: { type: 'bed', name: 'Bed', size: [1.6, 2.0], rot: 0, materials: { accent: 'velvetTerra', duvet: 'linenSand', throw: 'velvetSage' } } };
{ const s = $('addType'); Object.entries(DESIGNS).forEach(([k, d]) => s.add(new Option(d.label, 'catalog:' + k))); Object.keys(ADD).forEach(k => s.add(new Option(k, k))); }
function addItem() { const key = $('addType').value, x = r2(controls.target.x), y = r2(controls.target.z); let it;
  if (key.startsWith('catalog:')) it = { type: key.slice(8), variant: 0, pos: [x, y] }; else { it = structuredClone(ADD[key]); if (it.type === 'rug') it.rect = [x - .8, y - .5, x + .8, y + .5]; else it.pos = [x, y]; }
  it.id = freshId(it.type.toLowerCase()); edit(() => plan.items.push(it), { item: it.id }); select({ kind: 'item', id: it.id }); }
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function copyChanges() { const lines = describe(PUBLISHED, plan), text = lines.length ? lines.join('\n') : 'no changes'; let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {} const out = $('changeText'); out.hidden = false; out.value = text; out.select(); $('changeCount').textContent = ok ? 'copied' : 'select and copy'; }
$('rotL').onclick = ev => rotate(ev.shiftKey ? -15 : -90); $('rotR').onclick = ev => rotate(ev.shiftKey ? 15 : 90);
$('dupBtn').onclick = duplicate; $('delBtn').onclick = remove; $('selDone').onclick = () => select(null); $('addBtn').onclick = addItem;
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
$('resetPlan').onclick = () => { if (isEmpty(diffPlan(PUBLISHED, plan))) return; if (syncActive() && !confirm('Reset to the published plan? This resets the plan on all devices.')) return; resetPlan(); };
$('exportPlan').onclick = () => download('palace1.json', JSON.stringify(plan, null, 1));
$('importPlan').onclick = () => $('importFile').click();
$('importFile').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { const next = JSON.parse(await f.text()); if (!next.items || !next.walls || !next.rooms) throw new Error('not a plan file');
  const before = snapshot(); try { undoStack.push(before); restore(JSON.stringify(next)); } catch (e) { undoStack.pop(); restore(before); throw e; } } catch (e) { alert('Import failed: ' + e.message); } ev.target.value = ''; };
$('copyChanges').onclick = copyChanges;

window.__editor = { plan, select, edit, tryEdit, undo, redo, moveWall, describe: () => describe(PUBLISHED, plan) }; // for tools/ scripts and the console

/* ---------- edit mode, dragging with snapping, keyboard ---------- */
export function setMove(on) { if (on) state.leaveWalk?.(); state.moveMode = on; $('move').setAttribute('aria-pressed', on); bar.hidden = !on; updateBar();
  hintEl.textContent = on ? 'Click an item or wall to edit its values · drag to move (snaps to walls, items, 5 cm; Shift = free) · drag empty space to orbit' : 'Drag rotate · Right-drag pan · Scroll zoom';
  if (!on) select(null); renderer.domElement.style.cursor = ''; }
$('move').onclick = () => setMove(!state.moveMode);
let drag = null, photoWasOn = false;
function snapAxis(lo, hi, d, faces, free) { if (free) return r2(d);
  let best = null; for (const f of faces) for (const e of [lo, hi]) { const c = f - (e + d); if (Math.abs(c) < SNAP && (best === null || Math.abs(c) < Math.abs(best))) best = c; }
  return best !== null ? d + best : Math.round((lo + d) / GRID) * GRID - lo; }
stage.addEventListener('pointerdown', ev => { if (!state.moveMode || ev.button !== 0) return; const h = pick(ev); if (!h) return;
  ev.stopPropagation(); select({ kind: h.kind, id: h.id });
  const objs = objectsOf(sel), bb = new THREE.Box3(); objs.forEach(o => { if (!o.isLight) bb.expandByObject(o); });
  let mv = null, axis = null; if (h.kind === 'item') { mv = mover(itemOf(h.id)); if (!mv) return; axis = mv.axis || null; } else axis = wallAxis(wallOf(h.id)) === 'x' ? 'y' : 'x';
  // faces to snap to: walls and blocks, other items' bounding boxes
  const fx = [], fy = []; if (h.kind === 'item') { for (const w of plan.walls) { const r = wallRect(w); fx.push(r[0], r[2]); fy.push(r[1], r[3]); } for (const b of plan.blocks) { fx.push(b.rect[0], b.rect[2]); fy.push(b.rect[1], b.rect[3]); }
    for (const [id, gs] of itemGroups) { if (id === h.id) continue; for (const g of gs) { const b = new THREE.Box3().setFromObject(g); if (b.max.z < bb.min.z - .5 || b.min.z > bb.max.z + .5 || b.max.x < bb.min.x - .5 || b.min.x > bb.max.x + .5) continue; fx.push(b.min.x, b.max.x); fy.push(b.min.z, b.max.z); } } }
  controls.enabled = false; dragPlane.set(new V3(0, 1, 0), -h.point.y); ray.ray.intersectPlane(dragPlane, hitP);
  drag = { id: ev.pointerId, start: hitP.clone(), objs, home: objs.map(o => o.position.clone()), bb, mv, axis, fx, fy, dx: 0, dy: 0, moved: false };
  if (state.photo) { photoWasOn = true; setPhoto(false); } renderer.domElement.setPointerCapture(ev.pointerId); renderer.domElement.style.cursor = 'grabbing'; }, { capture: true });
renderer.domElement.addEventListener('pointermove', ev => {
  if (drag && ev.pointerId === drag.id) { aim(ev); if (!ray.ray.intersectPlane(dragPlane, hitP)) return;
    let dx = hitP.x - drag.start.x, dy = hitP.z - drag.start.z; if (Math.hypot(dx, dy) > .02) drag.moved = true;
    dx = drag.axis === 'y' ? 0 : snapAxis(drag.bb.min.x, drag.bb.max.x, dx, drag.fx, ev.shiftKey); dy = drag.axis === 'x' ? 0 : snapAxis(drag.bb.min.z, drag.bb.max.z, dy, drag.fy, ev.shiftKey);
    drag.dx = dx; drag.dy = dy; drag.objs.forEach((o, i) => { o.position.x = drag.home[i].x + dx; o.position.z = drag.home[i].z + dy; }); boxes.forEach(b => b.update()); markShadows(); $('selpos').textContent = `${sel.id} · moved ${dx.toFixed(2)}, ${dy.toFixed(2)} m`; return; }
  if (state.moveMode && ev.pointerType === 'mouse' && !ev.buttons) renderer.domElement.style.cursor = pick(ev) ? 'grab' : ''; });
function endDrag(ev) { if (!drag || ev.pointerId !== drag.id) return; const d = drag; drag = null; controls.enabled = true; renderer.domElement.style.cursor = 'grab';
  try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) {}
  const dx = r2(d.dx), dy = r2(d.dy);
  if (d.moved && (dx || dy)) { if (sel.kind === 'item') edit(() => d.mv.move(dx, dy), { item: sel.id }); else edit(() => moveWall(wallOf(sel.id), d.axis === 'x' ? dx : dy)); }
  else { d.objs.forEach((o, i) => o.position.copy(d.home[i])); markShadows(); }
  if (photoWasOn) { photoWasOn = false; setPhoto(true); } }
renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);
addEventListener('keydown', ev => { if (!state.moveMode || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if (!sel) return; if (ev.key === 'Escape') { select(null); return; } if (sel.kind !== 'item') return;
  const st = ev.shiftKey ? .1 : .01, dir = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key], it = itemOf(sel.id);
  if (dir) { const mv = mover(it); if (!mv) return; ev.preventDefault(); const dx = mv.axis === 'y' ? 0 : dir[0], dy = mv.axis === 'x' ? 0 : dir[1]; if (dx || dy) edit(() => mv.move(dx, dy), { item: it.id }); }
  else if (ev.key === 'r' || ev.key === 'R') rotate(ev.shiftKey ? 15 : 90); else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); remove(); } });
