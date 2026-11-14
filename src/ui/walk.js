// Walk mode: first-person camera at eye height with 2D collision against the plan (src/plan/walk.js).
import { MOBILE, camera, controls, renderer, state } from '../scene.js';
import { plan } from '../plan/plan.js';
import { pointInPoly } from '../plan/geom.js';
import { moveCircle, overlaps, walkSolids } from '../plan/walk.js';
import { setPhoto } from '../pathtracer.js';
import { applyCut } from './toolbar.js';
import { setMove } from './editor.js';

const $ = id => document.getElementById(id), EYE = 1.6, RADIUS = .25, SPEED = 1.4, RUN = 2.5, SENS = .0022, PITCH = 1.4, HINT = 'Drag rotate · Right-drag pan · Scroll zoom';
const dom = renderer.domElement, keys = new Set(), joy = [0, 0]; // joy = stick x (right), y (down), each -1..1
let pos = [0, 0], yaw = 0, pitch = 0, prev = null, rects = [], ver = -1, dirty = false, locked = false;

const solids = () => { if (ver !== state.planVer) { ver = state.planVer; rects = walkSolids(plan); } return rects; };
const inRoom = (x, y) => plan.rooms.some(r => pointInPoly(r.poly, x, y));
const free = (x, y) => inRoom(x, y) && !overlaps([x, y], RADIUS, solids());
const nearestFree = (x, y, max) => { for (let d = .1; d <= max; d += .1) for (let a = 0; a < 16; a++) { const q = [x + d * Math.cos(a * Math.PI / 8), y + d * Math.sin(a * Math.PI / 8)]; if (free(q[0], q[1])) return q; } return null; };
const face = (from, to) => { yaw = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])); };

function place() {
  const d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  camera.position.set(pos[0], EYE, pos[1]); controls.target.set(pos[0] + d[0], EYE + d[1], pos[1] + d[2]); camera.lookAt(controls.target);
}
// stand where a plan view's camera is (or its target, or the hall) and look the way it looks
export function teleport(name) {
  const v = plan.views[name] || plan.views.entrance, c = [v.cam[0], v.cam[2]], t = [v.target[0], v.target[2]], at = [c, moveCircle(c, [0, 0], RADIUS, solids()), t, nearestFree(t[0], t[1], 2.5)].find(p => p && free(p[0], p[1]));
  if (at) { pos = [...at]; face(c, t); } else { pos = [5.7, 6.4]; face(pos, [plan.views.entrance.target[0], plan.views.entrance.target[2]]); }
  pitch = Math.max(-.6, Math.min(.6, Math.atan2(v.target[1] - v.cam[1], Math.hypot(t[0] - c[0], t[1] - c[1])))); state.anim = null; dirty = true; place();
}
// advance by dt seconds; true if the view changed
export function step(dt) {
  dt = Math.min(dt, .1);
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - joy[1], s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joy[0];
  if (overlaps(pos, RADIUS, solids())) { const q = nearestFree(pos[0], pos[1], 4); if (q) pos = q; else teleport('entrance'); dirty = true; } // a plan edit or a jump left us inside something
  let moved = dirty; dirty = false;
  if (f || s) { const n = Math.hypot(f, s), run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(joy[0], joy[1]) > .95, v = (run ? RUN : SPEED) * dt * Math.min(1, n) / n, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const q = moveCircle(pos, [(-sy * f + cy * s) * v, (-cy * f - sy * s) * v], RADIUS, solids()); moved = moved || q[0] !== pos[0] || q[1] !== pos[1]; pos = q; }
  if (moved) place(); return moved;
}

export function enter() {
  if (state.walk) return;
  if (state.photo) setPhoto(false); applyCut(false); setMove(false);
  prev = { p: camera.position.clone(), t: controls.target.clone() }; state.walk = true; document.body.classList.add('walking'); $('walk').setAttribute('aria-pressed', 'true'); $('hint').textContent = 'W A S D / arrows move · Shift runs · click the view, then move the mouse to look · Esc leaves'; if (MOBILE) $('hint').textContent = 'Left stick moves · drag to look';
  const t = controls.target; pitch = 0; keys.clear(); joy[0] = joy[1] = 0; state.anim = null; controls.enabled = false;
  if (free(t.x, t.z)) { pos = [t.x, t.z]; face([camera.position.x, camera.position.z], pos); if (Math.hypot(pos[0] - camera.position.x, pos[1] - camera.position.z) < .3) yaw = 0; dirty = true; place(); } else teleport('entrance');
}
// stand at plan point (x, y) looking yaw degrees (0 = north, clockwise from above, like item rot); enters walk mode; throws if the point is not free
export function walkTo(x, y, yawDeg = 0) {
  if (!free(x, y)) throw new Error(`walk_to (${x}, ${y}) is inside a wall or a piece of furniture, or outside every room`);
  if (!state.walk) enter(); pos = [x, y]; yaw = -yawDeg * Math.PI / 180; pitch = 0; dirty = true; place();
}
export function leave(instant) {
  if (!state.walk) return; state.walk = false; document.body.classList.remove('walking'); keys.clear(); joy[0] = joy[1] = 0; controls.enabled = true; $('walk').setAttribute('aria-pressed', 'false'); if (!state.moveMode) $('hint').textContent = HINT;
  if (document.pointerLockElement === dom) document.exitPointerLock();
  if (instant) { camera.position.copy(prev.p); controls.target.copy(prev.t); controls.update(); return; }
  state.anim = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: { p: prev.p, t: prev.t }, t0: performance.now() };
}

$('walk').onclick = () => (state.walk ? leave() : enter());
state.leaveWalk = () => leave(true);
$('view').addEventListener('change', e => { if (state.walk) e.target.blur(); });
addEventListener('keydown', ev => { if (!state.walk || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return; if (ev.metaKey || ev.ctrlKey) { keys.clear(); return; }
  if (ev.key === 'Escape') { leave(); return; } if (ev.code.startsWith('Key') || ev.code.startsWith('Arrow') || ev.code.startsWith('Shift')) { keys.add(ev.code); if (ev.code.startsWith('Arrow')) ev.preventDefault(); } });
addEventListener('keyup', ev => keys.delete(ev.code)); addEventListener('blur', () => keys.clear()); document.addEventListener('visibilitychange', () => keys.clear());
const look = (dx, dy) => { yaw -= dx * SENS; pitch = Math.max(-PITCH, Math.min(PITCH, pitch - dy * SENS)); dirty = true; };
dom.addEventListener('pointerdown', ev => { if (state.walk && ev.pointerType === 'mouse' && ev.button === 0 && !locked) { document.activeElement?.blur?.(); try { dom.requestPointerLock()?.catch?.(() => {}); } catch (e) { /* drag-look below */ } } });
dom.addEventListener('pointermove', ev => { if (state.walk && ev.pointerType === 'mouse' && (locked || ev.buttons & 1)) look(ev.movementX, ev.movementY); });
let lp = null; // touch finger that looks around: { id, x, y }
dom.addEventListener('pointerdown', ev => { if (state.walk && ev.pointerType !== 'mouse' && !lp) lp = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; });
dom.addEventListener('pointermove', ev => { if (lp && ev.pointerId === lp.id) { look(ev.clientX - lp.x, ev.clientY - lp.y); lp.x = ev.clientX; lp.y = ev.clientY; } });
for (const t of ['pointerup', 'pointercancel']) dom.addEventListener(t, ev => { if (lp && ev.pointerId === lp.id) lp = null; });
const stick = $('joy'), knob = $('knob'), SR = 40; // stick radius in px
const drive = ev => { const b = stick.getBoundingClientRect(); let x = ev.clientX - b.left - b.width / 2, y = ev.clientY - b.top - b.height / 2; const d = Math.hypot(x, y); if (d > SR) { x *= SR / d; y *= SR / d; }
  joy[0] = x / SR; joy[1] = y / SR; knob.style.transform = `translate(${x}px,${y}px)`; };
const rest = () => { joy[0] = joy[1] = 0; knob.style.transform = ''; };
stick.addEventListener('pointerdown', ev => { stick.setPointerCapture(ev.pointerId); drive(ev); });
stick.addEventListener('pointermove', ev => { if (stick.hasPointerCapture(ev.pointerId)) drive(ev); });
stick.addEventListener('pointerup', rest); stick.addEventListener('pointercancel', rest);
document.addEventListener('pointerlockchange', () => { const was = locked; locked = document.pointerLockElement === dom; if (was && !locked) leave(); });

state.teleport = teleport; // setView teleports while walking
window.__walk = { get on() { return state.walk; }, get pos() { return [...pos]; }, get yaw() { return yaw; }, get cam() { return camera.position.toArray(); }, setPos: (x, y) => { pos = [x, y]; dirty = true; place(); }, joy, look: (y, p = 0) => { yaw = y; pitch = p; dirty = true; place(); },
  key: (code, down = true) => (down ? keys.add(code) : keys.delete(code)), step, enter, leave, teleport, free, modes: { setPhoto, applyCut, setMove } };
