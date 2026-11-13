// Walk mode: first-person camera at eye height with 2D collision against the plan (src/plan/walk.js).
import { camera, controls, renderer, state } from '../scene.js';
import { plan } from '../plan/plan.js';
import { pointInPoly } from '../plan/geom.js';
import { moveCircle, walkSolids } from '../plan/walk.js';
import { setPhoto } from '../pathtracer.js';
import { applyCut } from './toolbar.js';
import { setMove } from './editor.js';

const $ = id => document.getElementById(id), EYE = 1.6, RADIUS = .25, SPEED = 1.4, RUN = 2.5, SENS = .0022, PITCH = 1.4, HINT = 'Drag rotate · Right-drag pan · Scroll zoom';
const dom = renderer.domElement, keys = new Set();
let pos = [0, 0], yaw = 0, pitch = 0, prev = null, rects = [], ver = -1, dirty = false, locked = false;

const solids = () => { if (ver !== state.planVer) { ver = state.planVer; rects = walkSolids(plan); } return rects; };
const inRoom = (x, y) => plan.rooms.some(r => pointInPoly(r.poly, x, y));
const free = (x, y) => { const q = moveCircle([x, y], [0, 0], RADIUS, solids()); return inRoom(x, y) && Math.hypot(q[0] - x, q[1] - y) < .01; };
const face = (from, to) => { yaw = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])); };

function place() {
  const d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  camera.position.set(pos[0], EYE, pos[1]); controls.target.set(pos[0] + d[0], EYE + d[1], pos[1] + d[2]); camera.lookAt(controls.target);
}
// stand where a plan view's camera is (or its target, or the hall) and look the way it looks
export function teleport(name) {
  const v = plan.views[name] || plan.views.entrance, c = [v.cam[0], v.cam[2]], t = [v.target[0], v.target[2]], at = [c, moveCircle(c, [0, 0], RADIUS, solids()), t].find(p => free(p[0], p[1]));
  if (at) { pos = [...at]; face(c, t); } else { pos = [5.7, 6.4]; face(pos, [plan.views.entrance.target[0], plan.views.entrance.target[2]]); }
  pitch = Math.max(-.6, Math.min(.6, Math.atan2(v.target[1] - v.cam[1], Math.hypot(t[0] - c[0], t[1] - c[1])))); state.anim = null; dirty = true; place();
}
// advance by dt seconds; true if the view changed
export function step(dt) {
  dt = Math.min(dt, .1);
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0), s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let moved = dirty; dirty = false;
  if (f || s) { const n = Math.hypot(f, s), v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : SPEED) * dt / n, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const q = moveCircle(pos, [(-sy * f + cy * s) * v, (-cy * f - sy * s) * v], RADIUS, solids()); moved = moved || q[0] !== pos[0] || q[1] !== pos[1]; pos = q; }
  if (moved) place(); return moved;
}

export function enter() {
  if (state.walk) return;
  if (state.photo) setPhoto(false); applyCut(false); setMove(false);
  prev = { p: camera.position.clone(), t: controls.target.clone() }; state.walk = true; $('walk').setAttribute('aria-pressed', 'true'); $('hint').textContent = 'W A S D / arrows move · Shift runs · click the view, then move the mouse to look · Esc leaves';
  const t = controls.target; pitch = 0; keys.clear(); state.anim = null; controls.enabled = false;
  if (free(t.x, t.z)) { pos = [t.x, t.z]; face([camera.position.x, camera.position.z], pos); if (Math.hypot(pos[0] - camera.position.x, pos[1] - camera.position.z) < .3) yaw = 0; dirty = true; place(); } else teleport('entrance');
}
export function leave() {
  if (!state.walk) return; state.walk = false; keys.clear(); controls.enabled = true; $('walk').setAttribute('aria-pressed', 'false'); if (!state.moveMode) $('hint').textContent = HINT;
  if (document.pointerLockElement === dom) document.exitPointerLock();
  state.anim = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: { p: prev.p, t: prev.t }, t0: performance.now() };
}

$('walk').onclick = () => (state.walk ? leave() : enter());
for (const id of ['move', 'photo', 'wcut']) $(id).addEventListener('click', leave);
$('view').addEventListener('change', e => { if (state.walk) e.target.blur(); });
addEventListener('keydown', ev => { if (!state.walk || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  if (ev.key === 'Escape') { leave(); return; } if (ev.code.startsWith('Key') || ev.code.startsWith('Arrow') || ev.code.startsWith('Shift')) { keys.add(ev.code); if (ev.code.startsWith('Arrow')) ev.preventDefault(); } });
addEventListener('keyup', ev => keys.delete(ev.code)); addEventListener('blur', () => keys.clear());
const look = (dx, dy) => { yaw -= dx * SENS; pitch = Math.max(-PITCH, Math.min(PITCH, pitch - dy * SENS)); dirty = true; };
dom.addEventListener('pointerdown', ev => { if (state.walk && ev.pointerType === 'mouse' && ev.button === 0 && !locked) { document.activeElement?.blur?.(); try { dom.requestPointerLock()?.catch?.(() => {}); } catch (e) { /* drag-look below */ } } });
dom.addEventListener('pointermove', ev => { if (state.walk && ev.pointerType === 'mouse' && (locked || ev.buttons & 1)) look(ev.movementX, ev.movementY); });
document.addEventListener('pointerlockchange', () => { const was = locked; locked = document.pointerLockElement === dom; if (was && !locked) leave(); });

state.teleport = teleport; // setView teleports while walking
window.__walk = { get on() { return state.walk; }, get pos() { return [...pos]; }, get yaw() { return yaw; }, setPos: (x, y) => { pos = [x, y]; dirty = true; place(); }, look: (y, p = 0) => { yaw = y; pitch = p; dirty = true; place(); },
  key: (code, down = true) => (down ? keys.add(code) : keys.delete(code)), step, enter, leave, teleport, free };
