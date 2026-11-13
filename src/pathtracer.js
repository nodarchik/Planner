import { DPR, V2, camera, controls, frame, markShadows, renderer, scene, state, statusEl } from './scene.js';
import { composer } from './post.js';
import { M } from './materials.js';
import { setView } from './ui/views.js';
import { syncLights } from './lighting.js';

// vertical FOV in degrees for a full-frame focal length at the given aspect
export const focalFov = (mm, aspect) => 2 * Math.atan(18 / Math.max(aspect, 1) / mm) * 180 / Math.PI;
// push lens settings to the path tracer and restart accumulation (focus = distance to the orbit target)
const lens = () => { camera.focusDistance = camera.position.distanceTo(controls.target); camera.fStop = state.fstop || Infinity; };
export function ptCamera() { lens(); if (state.pt) state.pt.updateCamera(); }

/* ================= path tracer ("Photo render") ================= */

// transmissive window glass blocks the path tracer's shadow rays (black rooms): fully clear alpha glass lets light through; clearcoat renders black patches or whole objects, so it is off in Photo
const GLASS = { glassWin: 0, glassRail: 0, glassShower: .1 }, glassKept = new Map(), matKept = new Map(); // key → opacity in Photo
// partly transmissive opal (lamp shades) renders black: opaque white in Photo (its emissive still glows at night)
export function ptMats(on) { if (on) scene.traverse(o => { for (const m of [].concat(o.material || [])) if (!matKept.has(m) && (m.clearcoat > 0 || (m.transmission > 0 && m.transmission < 1))) {
      matKept.set(m, [m.clearcoat, m.transmission]); m.clearcoat = 0; if (m.transmission < 1) m.transmission = 0; m.needsUpdate = true; } });
  else { for (const [m, [c, t]] of matKept) { m.clearcoat = c; m.transmission = t; m.needsUpdate = true; } matKept.clear(); } }
function ptGlass(on) { for (const [k, op] of Object.entries(GLASS)) { const m = M[k]; if (!m) continue;
  if (on && !glassKept.has(k)) { glassKept.set(k, [m.transmission, m.transparent, m.opacity]); m.transmission = 0; m.transparent = true; m.opacity = op; m.needsUpdate = true; }
  else if (!on && glassKept.has(k)) { [m.transmission, m.transparent, m.opacity] = glassKept.get(k); glassKept.delete(k); m.needsUpdate = true; } }
  ptMats(on); }
// day sky 3x stronger in Photo: the room is lit only through the windows, the raster view gets unoccluded sky light everywhere
export function ptSetScene() { ptMats(true); lens(); scene.environmentIntensity = state.night ? 1 : 3; state.pt.setScene(scene, camera); }
export function rebuildPT() { if (state.photo) state.ptDirty = true; }
// 2560 × 1440 still of the current view: path-trace off the page size to `samples`, then download a PNG (or resolve a data URL for window.__still)
const STILL = { w: 2560, h: 1440, samples: 96 }, stillBtn = document.getElementById('still');
let still = null;
function endStill() { const s = still; still = null; renderer.setPixelRatio(s.pr); renderer.setSize(s.size.x, s.size.y); camera.aspect = s.aspect; camera.updateProjectionMatrix(); state.pt.renderScale = s.scale; ptCamera(); stillBtn.textContent = 'Save 2K still'; }
function startStill(o = {}) { if (!state.photo || !state.pt || still) return false;
  still = { pr: renderer.getPixelRatio(), size: renderer.getSize(new V2()), aspect: camera.aspect, scale: state.pt.renderScale, w: o.w || STILL.w, h: o.h || STILL.h, samples: o.samples || STILL.samples, resolve: o.resolve, reject: o.reject };
  renderer.setPixelRatio(1); renderer.setSize(still.w, still.h, false); camera.aspect = still.w / still.h; camera.updateProjectionMatrix(); state.pt.renderScale = 1; if (state.focal) { camera.fov = focalFov(state.focal, camera.aspect); camera.updateProjectionMatrix(); } ptCamera(); stillBtn.textContent = 'Rendering…'; return true; }
// called by the render loop right after a path-traced sample, while the frame is still in the canvas
export function stillTick() { if (!still) return false; window.__stillSamples = Math.floor(state.pt.samples); statusEl.textContent = `Still · ${window.__stillSamples} / ${still.samples} samples`; if (state.pt.samples < still.samples) return true;
  const s = still, url = renderer.domElement.toDataURL('image/png'); endStill();
  if (s.resolve) s.resolve(url); else { const a = document.createElement('a'); a.href = url; a.download = `palace1-${document.getElementById('view').value}-${s.w}x${s.h}.png`; a.click(); }
  return true; }
stillBtn.onclick = () => startStill();
// scripted still (tools/stills.py): resolves with a PNG data URL, then restores view, mood and Photo state
window.__still = async ({ view, samples, w, h, night = false, focal, fstop } = {}) => {
  const prev = { view: document.getElementById('view').value, night: state.night, photo: state.photo, focal: state.focal, fstop: state.fstop };
  if (still) throw new Error('a still is already running');
  setLens(focal || 0, fstop || 0);
  document.getElementById(night ? 'mnight' : 'mday').click(); if (view) setView(view, true);
  if (!state.photo) await setPhoto(true); if (!state.photo) throw new Error('Photo render unavailable');
  for (let i = 0; i < 90 && (!window.__settled || state.ptDirty || i < 8); i++) await frame(); // camera, fov and ceiling settled, scene rebuilt
  const url = await new Promise((resolve, reject) => { if (!startStill({ w, h, samples, resolve, reject })) reject(new Error('still did not start (Photo off or busy)')); });
  document.getElementById(prev.night ? 'mnight' : 'mday').click(); setView(prev.view, true); setLens(prev.focal, prev.fstop); if (!prev.photo) await setPhoto(false); return url; };
const focalSel = document.getElementById('focal'), fstopSel = document.getElementById('fstop');
function setLens(focal, fstop) { state.focal = focal; state.fstop = fstop; focalSel.value = String(focal); fstopSel.value = String(fstop); if (state.photo) ptCamera(); }
focalSel.onchange = fstopSel.onchange = () => setLens(+focalSel.value, +fstopSel.value);
export async function setPhoto(on) {
  document.getElementById('pcam').hidden = !on;
  const btn = document.getElementById('photo');
  if (!on) { if (still) { const s = still; endStill(); s.reject?.(new Error('Photo turned off during the still')); } ptGlass(false); scene.environmentIntensity = 1; state.photo = false; syncLights(); markShadows(); btn.setAttribute('aria-pressed', 'false'); stillBtn.disabled = true; statusEl.textContent = ''; return; }
  btn.setAttribute('aria-pressed', 'true');
  try {
    if (!state.pt) { statusEl.textContent = 'Loading renderer…'; await frame();
      const mod = await import('three-gpu-pathtracer');
      state.pt = new mod.WebGLPathTracer(renderer);
      state.pt.tiles.set(2, 2); state.pt.bounces = 8; state.pt.transmissiveBounces = 8; state.pt.filterGlossyFactor = .5; state.pt.minSamples = 3; state.pt.renderDelay = 0; state.pt.fadeDuration = 300;
      state.pt.renderScale = Math.min(1, 1.4 / DPR);
      state.pt.rasterizeSceneCallback = () => composer.render(); }
    statusEl.textContent = 'Preparing scene…'; await frame(); await frame();
    ptGlass(true); state.photo = true; syncLights(); ptSetScene(); state.ptDirty = false; stillBtn.disabled = false;
  } catch (err) { console.warn(err); ptGlass(false); state.photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = 'Photo render unavailable on this device'; }
}
document.getElementById('photo').onclick = () => setPhoto(!state.photo);
controls.addEventListener('change', () => { if (state.photo && state.pt) ptCamera(); });

