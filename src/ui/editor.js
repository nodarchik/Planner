import * as THREE from 'three';
import { V2, V3, camera, controls, movables, renderer, scene, stage, state, world } from '../scene.js';
import { M } from '../materials.js';
import { labels } from './dims.js';
import { rebuildPT, setPhoto } from '../pathtracer.js';
import { renderParts, resetLook, saveStyle } from './style.js';
import { setSwap } from './swap.js';

/* ================= drag & drop furniture ================= */
// storage: one plan, so one key per kind (v3); keys of the removed layouts (…-v2:<layout>, palace1-layout-v4) are deleted once
const LKEY = 'palace1-pos-v3';
try { Object.keys(localStorage).filter(k => /^palace1-(pos-v2|style-v2|types-v2|layout-v4)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
const ray = new THREE.Raycaster(), ndc = new V2(), dragPlane = new THREE.Plane(new V3(0, 1, 0), 0), hitP = new V3();
let drag = null, photoWasOn = false;
export const selPanel = document.getElementById('selpanel'), hintEl = document.getElementById('hint');
function visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function movableOf(o) { for (; o && o !== world; o = o.parent) if (o.userData && o.userData.movable) return o; return null; }
export function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(world, true);
  for (const h of hits) { if (!h.object.isMesh || !visibleChain(h.object)) continue; if (h.object.material === M.sheer) continue; return { g: movableOf(h.object), point: h.point }; }
  return null;
}
export function attachLabels() {
  const boxes = movables.map(g => { const bb = new THREE.Box3().setFromObject(g); return { g, bb, area: (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) }; });
  for (const L of labels) { if (L.group !== 'furn') continue;
    let best = null; for (const b of boxes) if (L.p.x >= b.bb.min.x - .05 && L.p.x <= b.bb.max.x + .05 && L.p.z >= b.bb.min.z - .05 && L.p.z <= b.bb.max.z + .05 && (!best || b.area < best.area)) best = b;
    if (best) { L.grp = best.g; L.local = best.g.worldToLocal(L.p.clone()); } }
}
export function saveLayout() { try { const d = movables.map(g => [+(g.position.x.toFixed(3)), +(g.position.z.toFixed(3)), +(g.rotation.y.toFixed(4)), +(g.scale.x.toFixed(4)), +(g.scale.y.toFixed(4)), +(g.scale.z.toFixed(4))]); localStorage.setItem(LKEY, JSON.stringify(d)); } catch (e) {} }
export function loadLayout() { try { const d = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (!Array.isArray(d) || d.length !== movables.length) return;
  d.forEach(([x, z, r, sx, sy, sz], i) => { const g = movables[i]; g.position.x = x; g.position.z = z; g.rotation.y = r; if (sx) applyScale(g, sx, sy, sz); }); } catch (e) {} }
function fmtPos(g) { const deg = Math.round(((-g.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  const dx = g.position.x - g.userData.home.x, dz = g.position.z - g.userData.home.z;
  return `x ${g.position.x.toFixed(2)} m · y ${g.position.z.toFixed(2)} m · ${deg}°` + (Math.hypot(dx, dz) > .005 ? ` · moved ${Math.hypot(dx, dz).toFixed(2)} m` : ''); }
export function select(g) {
  state.sel = g; if (state.selBox) { scene.remove(state.selBox); state.selBox.geometry.dispose(); state.selBox = null; }
  selPanel.hidden = !g; if (!g) return;
  state.selBox = new THREE.BoxHelper(g, 0x2f6fd8); state.selBox.material.depthTest = false; state.selBox.material.transparent = true; state.selBox.renderOrder = 10; scene.add(state.selBox);
  document.getElementById('selname').textContent = g.name; document.getElementById('selpos').textContent = fmtPos(g);
  renderParts(g); renderSize(g);
}
function changed() { if (!state.sel) return; state.selBox && state.selBox.update(); document.getElementById('selpos').textContent = fmtPos(state.sel); renderSize(state.sel); saveLayout(); rebuildPT(); }
function applyScale(g, sx, sy, sz) { g.scale.set(sx, sy, sz); g.position.y = g.userData.minY0 * (1 - sy); }
function renderSize(g) { const s = g.userData.size;
  [['szW', s.x * g.scale.x], ['szD', s.z * g.scale.z], ['szH', s.y * g.scale.y]].forEach(([id, v]) => { const el = document.getElementById(id); if (document.activeElement !== el) el.value = v.toFixed(2); }); }
function setSize(axis, val) { if (!state.sel || !(val > .04)) return; const s = state.sel.userData.size, k = { x: 'x', y: 'y', z: 'z' }[axis];
  const base = s[k], ratio = Math.min(4, Math.max(.2, val / base)); let { x, y, z } = state.sel.scale;
  if (document.getElementById('szLock').checked) { const f = ratio / state.sel.scale[k]; x *= f; y *= f; z *= f; } else { if (k === 'x') x = ratio; if (k === 'y') y = ratio; if (k === 'z') z = ratio; }
  applyScale(state.sel, x, y, z); changed(); }
[['szW', 'x'], ['szD', 'z'], ['szH', 'y']].forEach(([id, a]) => { const el = document.getElementById(id);
  el.addEventListener('change', () => setSize(a, parseFloat(el.value)));
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { setSize(a, parseFloat(el.value)); el.blur(); } ev.stopPropagation(); }); });
document.getElementById('szReset').onclick = () => { if (state.sel) { applyScale(state.sel, 1, 1, 1); changed(); } };
function rotateSel(deg) { if (!state.sel) return; state.sel.rotation.y -= deg * Math.PI / 180; changed(); }
export function setMove(on) {
  if (on && state.swapMode) setSwap(false);
  state.moveMode = on; document.getElementById('move').setAttribute('aria-pressed', on);
  hintEl.textContent = on ? 'Click furniture to change colours and finishes · drag to move · drag empty space to orbit' : 'Drag rotate · Right-drag pan · Scroll zoom';
  if (!on) select(null); renderer.domElement.style.cursor = '';
}
document.getElementById('move').onclick = () => setMove(!state.moveMode);
document.getElementById('rotL').onclick = () => rotateSel(-15);
document.getElementById('rotR').onclick = () => rotateSel(15);
document.getElementById('rot90').onclick = () => rotateSel(90);
document.getElementById('selReset').onclick = () => { if (!state.sel) return; const h = state.sel.userData.home; state.sel.position.x = h.x; state.sel.position.z = h.z; state.sel.rotation.y = h.r || 0; changed(); };
document.getElementById('resetAll').onclick = () => { movables.forEach(g => { const h = g.userData.home; g.position.x = h.x; g.position.z = h.z; g.rotation.y = h.r || 0; applyScale(g, 1, 1, 1); resetLook(g, true); }); saveStyle(); if (state.sel) renderParts(state.sel); try { localStorage.removeItem(LKEY); } catch (e) {} if (state.sel) changed(); rebuildPT(); };
document.getElementById('selDone').onclick = () => select(null);
stage.addEventListener('pointerdown', ev => {
  if (!state.moveMode || ev.button !== 0) return;
  const h = pick(ev); if (!h || !h.g) return;
  ev.stopPropagation(); controls.enabled = false;
  select(h.g);
  dragPlane.set(new V3(0, 1, 0), -h.point.y);
  ray.ray.intersectPlane(dragPlane, hitP);
  drag = { id: ev.pointerId, off: new V3(h.g.position.x - hitP.x, 0, h.g.position.z - hitP.z) };
  if (state.photo) { photoWasOn = true; setPhoto(false); }
  renderer.domElement.setPointerCapture(ev.pointerId); renderer.domElement.style.cursor = 'grabbing';
}, { capture: true });
renderer.domElement.addEventListener('pointermove', ev => {
  if (drag && ev.pointerId === drag.id) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(dragPlane, hitP)) { const st = ev.shiftKey ? .1 : .01;
      state.sel.position.x = Math.round((hitP.x + drag.off.x) / st) * st; state.sel.position.z = Math.round((hitP.z + drag.off.z) / st) * st;
      state.selBox && state.selBox.update(); document.getElementById('selpos').textContent = fmtPos(state.sel); }
    return;
  }
  if (state.moveMode && ev.pointerType === 'mouse' && !ev.buttons) { const h = pick(ev); renderer.domElement.style.cursor = h && h.g ? 'grab' : ''; }
});
function endDrag(ev) { if (!drag || ev.pointerId !== drag.id) return; drag = null; controls.enabled = true; renderer.domElement.style.cursor = 'grab';
  try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) {} changed(); if (photoWasOn) { photoWasOn = false; setPhoto(true); } }
renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);
addEventListener('keydown', ev => {
  if (!state.moveMode || !state.sel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const st = ev.shiftKey ? .1 : .01; let used = true;
  if (ev.key === 'ArrowLeft') state.sel.position.x -= st; else if (ev.key === 'ArrowRight') state.sel.position.x += st;
  else if (ev.key === 'ArrowUp') state.sel.position.z -= st; else if (ev.key === 'ArrowDown') state.sel.position.z += st;
  else if (ev.key === 'r' || ev.key === 'R') { rotateSel(ev.shiftKey ? -15 : 90); return; }
  else if (ev.key === 'Escape') { select(null); return; } else used = false;
  if (used) { ev.preventDefault(); changed(); }
});
