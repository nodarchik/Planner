// Input bindings as data: plan.meta.bindings = [{ input, action, speed? }] maps gestures and keys to camera actions. No code in the plan; unknown values are rejected.
import { MOUSE, Spherical, TOUCH } from 'three';
import { V3, camera, controls, renderer, state } from '../scene.js';
import { plan } from '../plan/plan.js';
import { setView } from './views.js';

const DRAG = ['touch1-drag', 'touch2-drag', 'touch3-drag', 'mouse-left', 'mouse-middle', 'mouse-right', 'shift+mouse-left'];
const WHEEL = ['wheel', 'shift+wheel', 'ctrl+wheel', 'alt+wheel'];
const FIXED = [...DRAG, 'pinch', ...WHEEL];
const KEY = /^key:((?:(?:shift|ctrl|alt|meta)\+)*)(.+)$/;
const TOGGLES = ['night', 'photo', 'cut', 'walk', 'dims', 'furniture', 'labels'], DIRS = ['left', 'right', 'up', 'down'];
const KEY_FORMS = [...['pan', 'orbit'].flatMap(a => DIRS.map(d => `${a}:${d}`)), 'zoom:in', 'zoom:out', ...TOGGLES.map(t => `toggle:${t}`), 'view:<view id>', 'none'];
const allowed = i => (i === 'pinch' ? ['zoom', 'none'] : /^touch\d-drag$|^shift\+mouse/.test(i) ? ['orbit', 'pan', 'none'] : ['orbit', 'pan', 'zoom', 'none']);

// one text for the assistant: generated from the lists above
export const bindingsInfo = () => ['Input bindings = plan.meta.bindings, a list of { input, action, speed? } (set with apply_changes on list "meta", path "bindings"; an invalid list is rejected and the batch rolled back). Inputs: ' + FIXED.join(', ') + ', key:<KeyboardEvent.code or key, optional ctrl+ shift+ alt+ meta+ prefix, e.g. key:shift+KeyF>. Actions for gestures: ' + allowed('wheel').join(', ') + ' (touch and shift+mouse-left: no zoom; pinch: zoom or none; touch2-drag orbit = pinch + rotate, pan = pinch + pan). Actions for key: inputs: ' + KEY_FORMS.join(', ') + ' (view ids: ' + Object.keys(plan.views).join(', ') + '). speed (> 0, default 1) only for touch3-drag, shift+mouse-left, wheel inputs with pan or orbit, and key pan/orbit/zoom. wheel with pan: scroll moves the camera like a map. Default: [{input:"touch3-drag",action:"pan"}]; unbound inputs keep the OrbitControls behaviour (one finger / left mouse rotate, two fingers pinch + pan, right mouse pan, wheel zoom). Example, trackpad scroll pans and pinch zooms: [{input:"wheel",action:"pan"},{input:"ctrl+wheel",action:"zoom"}]. Device facts: a page sees three fingers only on touch screens, and iOS, iPadOS and Android may take three-finger gestures for themselves; on a macOS trackpad a page cannot see three fingers at all (wheel events carry no finger count), so the trackpad equivalent is remapping two-finger scroll (wheel) and pinch (ctrl+wheel). Never promise a three-finger trackpad gesture. Bindings are off in walk mode and ignored with ?safe=1 in the URL.'].join('\n');

function keyAction(a, at) {
  const [k, v] = String(a).split(/:(.*)/s);
  if (a === 'none' || (['pan', 'orbit'].includes(k) && DIRS.includes(v)) || (k === 'zoom' && ['in', 'out'].includes(v)) || (k === 'toggle' && TOGGLES.includes(v))) return;
  if (k === 'view' && plan.views[v]) return;
  throw new Error(`${at}: unknown key action "${a}"${k === 'view' ? ` (no view "${v}"; views: ${Object.keys(plan.views).join(', ')})` : ''}. Valid: ${KEY_FORMS.join(', ')}`);
}
// validate and resolve the list; throws with a message that lists the valid values
function parse(list) {
  if (!Array.isArray(list)) throw new Error('meta.bindings must be a list of { input, action, speed? }');
  const seen = new Set();
  return list.map((b, i) => { const at = `meta.bindings[${i}]`;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error(`${at} must be { input, action, speed? }`);
    for (const k of Object.keys(b)) if (!['input', 'action', 'speed'].includes(k)) throw new Error(`${at}: unknown field "${k}" (allowed: input, action, speed)`);
    const { input, action } = b, m = typeof input === 'string' && input.match(KEY), e = { input, action, speed: b.speed ?? 1 };
    if (!m && !FIXED.includes(input)) throw new Error(`${at}: unknown input "${input}". Valid inputs: ${FIXED.join(', ')}, key:<code or key>`);
    if (m) { keyAction(action, at); const mods = ['shift', 'ctrl', 'alt', 'meta'].filter(x => m[1].includes(x + '+')); Object.assign(e, { key: m[2], mods, id: 'key:' + mods.join('+') + '+' + m[2].toLowerCase() }); }
    else if (!allowed(input).includes(action)) throw new Error(`${at}: action "${action}" is not valid for ${input}. Valid: ${allowed(input).join(', ')}`);
    if (b.speed !== undefined && !(Number.isFinite(b.speed) && b.speed > 0 && b.speed <= 10)) throw new Error(`${at}: speed must be a number above 0 and up to 10`);
    if (b.speed !== undefined && !(m ? /^(pan|orbit|zoom):/.test(action) : (input === 'touch3-drag' || input === 'shift+mouse-left' || WHEEL.includes(input)) && ['pan', 'orbit'].includes(action))) throw new Error(`${at}: speed does not apply to ${input} → ${action}`);
    e.id ||= input; if (seen.has(e.id)) throw new Error(`${at}: ${input} is bound twice`); seen.add(e.id); return e; });
}

const safe = new URLSearchParams(location.search).get('safe') === '1';
const D = { mouse: { ...controls.mouseButtons }, touch: { ...controls.touches } }, dom = renderer.domElement;
let table = [], T = new Map(), keys = [];

// validates first (throws, nothing changed), then maps what OrbitControls supports natively; the rest is handled by the listeners below
export function applyBindings() {
  const t = safe ? [] : parse(plan.meta.bindings || []);
  table = t; T = new Map(t.map(e => [e.input, e])); keys = t.filter(e => e.key !== undefined);
  controls.mouseButtons = { ...D.mouse }; controls.touches = { ...D.touch }; controls.enableZoom = true;
  const mb = { orbit: MOUSE.ROTATE, pan: MOUSE.PAN, zoom: MOUSE.DOLLY, none: -1 }, t1 = { orbit: TOUCH.ROTATE, pan: TOUCH.PAN, none: -1 }, t2 = { orbit: TOUCH.DOLLY_ROTATE, pan: TOUCH.DOLLY_PAN, none: -1 };
  for (const [i, k] of [['mouse-left', 'LEFT'], ['mouse-middle', 'MIDDLE'], ['mouse-right', 'RIGHT']]) if (T.has(i)) controls.mouseButtons[k] = mb[T.get(i).action];
  if (T.has('touch1-drag')) controls.touches.ONE = t1[T.get('touch1-drag').action];
  if (T.has('touch2-drag')) controls.touches.TWO = t2[T.get('touch2-drag').action];
  if (T.get('pinch')?.action === 'none') controls.enableZoom = false;
}

/* ---------- camera moves for the inputs OrbitControls lacks ---------- */
const off = new V3(), right = new V3(), up = new V3(), sph = new Spherical();
const live = () => !safe && !state.walk && controls.enabled; // not in walk mode, not during an editor drag
function pan(dx, dy) { // camera offset in screen pixels (right, up)
  camera.updateMatrix(); right.setFromMatrixColumn(camera.matrix, 0); up.setFromMatrixColumn(camera.matrix, 1);
  const s = 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.distanceTo(controls.target) / dom.clientHeight;
  off.copy(right).multiplyScalar(dx * s).addScaledVector(up, dy * s); camera.position.add(off); controls.target.add(off); state.anim = null; }
function orbit(dx, dy) { // like dragging by dx, dy pixels
  off.copy(camera.position).sub(controls.target); sph.setFromVector3(off); const k = 2 * Math.PI / dom.clientHeight;
  sph.theta -= dx * k; sph.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, sph.phi - dy * k)); sph.makeSafe();
  camera.position.copy(controls.target).add(off.setFromSpherical(sph)); state.anim = null; }
function dolly(f) { off.copy(camera.position).sub(controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(off); state.anim = null; }

dom.addEventListener('wheel', ev => {
  if (!live() || ev.metaKey) return; const b = T.get(ev.ctrlKey ? 'ctrl+wheel' : ev.shiftKey ? 'shift+wheel' : ev.altKey ? 'alt+wheel' : 'wheel');
  if (!b || (b.action === 'zoom' && controls.enableZoom)) return; // unbound or plain zoom: OrbitControls
  ev.preventDefault(); ev.stopImmediatePropagation(); const m = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1, dx = ev.deltaX * m * b.speed, dy = ev.deltaY * m * b.speed;
  if (b.action === 'pan') pan(dx, -dy); else if (b.action === 'orbit') orbit(dx, dy); else if (b.action === 'zoom') dolly(ev.deltaY < 0 ? .95 : 1 / .95); }, { capture: true, passive: false });

let drag = null; // shift + left mouse drag
dom.addEventListener('pointerdown', ev => {
  if (!live() || ev.pointerType !== 'mouse' || ev.button !== 0 || !ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return; const b = T.get('shift+mouse-left'); if (!b) return;
  ev.preventDefault(); ev.stopImmediatePropagation(); if (b.action === 'none') return; drag = { id: ev.pointerId, b, x: ev.clientX, y: ev.clientY }; dom.setPointerCapture(ev.pointerId); }, true);
dom.addEventListener('pointermove', ev => { if (!drag || ev.pointerId !== drag.id) return; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y, k = drag.b.speed; drag.x = ev.clientX; drag.y = ev.clientY;
  if (drag.b.action === 'pan') pan(-dx * k, dy * k); else orbit(dx * k, dy * k); });
for (const t of ['pointerup', 'pointercancel']) dom.addEventListener(t, ev => { if (drag && ev.pointerId === drag.id) drag = null; });

let tc = null; // centre of three touches
const centre = ts => [(ts[0].clientX + ts[1].clientX + ts[2].clientX) / 3, (ts[0].clientY + ts[1].clientY + ts[2].clientY) / 3];
dom.addEventListener('touchstart', ev => { tc = ev.touches.length === 3 && live() && ['pan', 'orbit'].includes(T.get('touch3-drag')?.action) ? centre(ev.touches) : null; }, { passive: true });
dom.addEventListener('touchmove', ev => { if (!tc || ev.touches.length !== 3 || !live()) { tc = null; return; } const c = centre(ev.touches), b = T.get('touch3-drag'), dx = (c[0] - tc[0]) * b.speed, dy = (c[1] - tc[1]) * b.speed; tc = c;
  if (b.action === 'pan') pan(-dx, dy); else orbit(dx, dy); }, { passive: true });
for (const t of ['touchend', 'touchcancel']) dom.addEventListener(t, () => { tc = null; }, { passive: true });

/* ---------- keys ---------- */
const click = id => document.getElementById(id).click();
const TOGGLE = { night: () => click(state.night ? 'mday' : 'mnight'), cut: () => click(state.cutOn ? 'wfull' : 'wcut'), photo: () => click('photo'), walk: () => click('walk'), dims: () => click('tdim'), furniture: () => click('tfur'), labels: () => click('tlab') };
export function runKey(b, repeat) {
  const [k, v] = b.action.split(/:(.*)/s), n = (k === 'pan' ? 40 : 30) * b.speed, d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[v];
  if (k === 'pan') pan(d[0] * n, -d[1] * n); else if (k === 'orbit') orbit(d[0] * n, d[1] * n); else if (k === 'zoom') dolly(.9 ** (v === 'in' ? b.speed : -b.speed));
  else if (!repeat && k === 'view') setView(v); else if (!repeat && k === 'toggle') TOGGLE[v](); }
addEventListener('keydown', ev => {
  if (!keys.length || safe || state.walk || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') || (state.moveMode && state.sel)) return;
  const b = keys.find(e => ['shift', 'ctrl', 'alt', 'meta'].every(m => e.mods.includes(m) === ev[m + 'Key']) && (ev.code === e.key || ev.key.toLowerCase() === e.key.toLowerCase())); if (!b || b.action === 'none') return;
  ev.preventDefault(); runKey(b, ev.repeat); });

window.__bindings = { get table() { return table; }, get safe() { return safe; }, get cam() { return camera.position.toArray(); }, get target() { return controls.target.toArray(); }, get native() { return { mouse: { ...controls.mouseButtons }, touch: { ...controls.touches }, zoom: controls.enableZoom }; } }; // test hook
