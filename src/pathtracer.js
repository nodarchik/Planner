import { DPR, V2, camera, controls, frame, renderer, scene, state, statusEl } from './scene.js';
import { composer } from './post.js';
import { M } from './materials.js';
import { setView } from './ui/views.js';

/* ================= path tracer ("Photo render") ================= */

// transmissive glass blocks the path tracer's shadow rays (black rooms); near-clear alpha glass lets light through
const GLASS = ['glass', 'glassRail', 'glassTint'], glassKept = new Map();
function ptGlass(on) { for (const k of GLASS) { const m = M[k]; if (!m) continue;
  if (on && !glassKept.has(k)) { glassKept.set(k, [m.transmission, m.transparent, m.opacity]); m.transmission = 0; m.transparent = true; m.opacity = .06; m.needsUpdate = true; }
  else if (!on && glassKept.has(k)) { [m.transmission, m.transparent, m.opacity] = glassKept.get(k); glassKept.delete(k); m.needsUpdate = true; } } }
export function rebuildPT() { if (state.photo) state.ptDirty = true; }
// 2560 × 1440 still of the current view: path-trace off the page size to `samples`, then download a PNG (or resolve a data URL for window.__still)
const STILL = { w: 2560, h: 1440, samples: 96 }, stillBtn = document.getElementById('still');
let still = null;
function endStill() { const s = still; still = null; renderer.setPixelRatio(s.pr); renderer.setSize(s.size.x, s.size.y); camera.aspect = s.aspect; camera.updateProjectionMatrix(); state.pt.renderScale = s.scale; state.pt.updateCamera(); stillBtn.textContent = 'Save 2K still'; }
function startStill(o = {}) { if (!state.photo || !state.pt || still) return;
  still = { pr: renderer.getPixelRatio(), size: renderer.getSize(new V2()), aspect: camera.aspect, scale: state.pt.renderScale, w: o.w || STILL.w, h: o.h || STILL.h, samples: o.samples || STILL.samples, resolve: o.resolve };
  renderer.setPixelRatio(1); renderer.setSize(still.w, still.h, false); camera.aspect = still.w / still.h; camera.updateProjectionMatrix(); state.pt.renderScale = 1; state.pt.updateCamera(); stillBtn.textContent = 'Rendering…'; }
// called by the render loop right after a path-traced sample, while the frame is still in the canvas
export function stillTick() { if (!still) return false; window.__stillSamples = Math.floor(state.pt.samples); statusEl.textContent = `Still · ${window.__stillSamples} / ${still.samples} samples`; if (state.pt.samples < still.samples) return true;
  const s = still, url = renderer.domElement.toDataURL('image/png'); endStill();
  if (s.resolve) s.resolve(url); else { const a = document.createElement('a'); a.href = url; a.download = `palace1-${document.getElementById('view').value}-${s.w}x${s.h}.png`; a.click(); }
  return true; }
stillBtn.onclick = () => startStill();
// scripted still (tools/stills.py): resolves with a PNG data URL, then restores view, mood and Photo state
window.__still = async ({ view, samples, w, h, night = false } = {}) => {
  const prev = { view: document.getElementById('view').value, night: state.night, photo: state.photo };
  document.getElementById(night ? 'mnight' : 'mday').click(); if (view) setView(view, true);
  if (!state.photo) await setPhoto(true); if (!state.photo) throw new Error('Photo render unavailable');
  for (let i = 0; i < 90 && (!window.__settled || state.ptDirty || i < 8); i++) await frame(); // camera, fov and ceiling settled, scene rebuilt
  const url = await new Promise(resolve => startStill({ w, h, samples, resolve }));
  document.getElementById(prev.night ? 'mnight' : 'mday').click(); setView(prev.view, true); if (!prev.photo) await setPhoto(false); return url; };
export async function setPhoto(on) {
  const btn = document.getElementById('photo');
  if (!on) { if (still) endStill(); ptGlass(false); state.photo = false; btn.setAttribute('aria-pressed', 'false'); stillBtn.disabled = true; statusEl.textContent = ''; return; }
  btn.setAttribute('aria-pressed', 'true');
  try {
    if (!state.pt) { statusEl.textContent = 'Loading renderer…'; await frame();
      const mod = await import('three-gpu-pathtracer');
      state.pt = new mod.WebGLPathTracer(renderer);
      state.pt.tiles.set(2, 2); state.pt.bounces = 6; state.pt.transmissiveBounces = 8; state.pt.filterGlossyFactor = .5; state.pt.minSamples = 3; state.pt.renderDelay = 0; state.pt.fadeDuration = 300;
      state.pt.renderScale = Math.min(1, 1.4 / DPR);
      state.pt.rasterizeSceneCallback = () => composer.render(); }
    statusEl.textContent = 'Preparing scene…'; await frame(); await frame();
    ptGlass(true); state.photo = true; state.pt.setScene(scene, camera); state.ptDirty = false; stillBtn.disabled = false;
  } catch (err) { console.warn(err); ptGlass(false); state.photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = 'Photo render unavailable on this device'; }
}
document.getElementById('photo').onclick = () => setPhoto(!state.photo);
controls.addEventListener('change', () => { if (state.photo && state.pt) state.pt.updateCamera(); });
