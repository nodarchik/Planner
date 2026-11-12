import { DPR, V2, camera, controls, frame, renderer, scene, state, statusEl } from './scene.js';
import { composer } from './post.js';
import { M } from './materials.js';

/* ================= path tracer ("Photo render") ================= */

// transmissive glass blocks the path tracer's shadow rays (black rooms); near-clear alpha glass lets light through
const GLASS = ['glass', 'glassRail', 'glassTint'], glassKept = new Map();
function ptGlass(on) { for (const k of GLASS) { const m = M[k]; if (!m) continue;
  if (on && !glassKept.has(k)) { glassKept.set(k, [m.transmission, m.transparent, m.opacity]); m.transmission = 0; m.transparent = true; m.opacity = .06; m.needsUpdate = true; }
  else if (!on && glassKept.has(k)) { [m.transmission, m.transparent, m.opacity] = glassKept.get(k); glassKept.delete(k); m.needsUpdate = true; } } }
export function rebuildPT() { if (state.photo) state.ptDirty = true; }
// 2560 × 1440 still of the current view: path-trace off the page size for STILL_SAMPLES samples, then download a PNG
const STILL = { w: 2560, h: 1440, samples: 96 }, stillBtn = document.getElementById('still');
let still = null;
function endStill() { const s = still; still = null; renderer.setPixelRatio(s.pr); renderer.setSize(s.size.x, s.size.y); camera.aspect = s.aspect; camera.updateProjectionMatrix(); state.pt.renderScale = s.scale; state.pt.updateCamera(); stillBtn.textContent = 'Save 2K still'; }
function startStill() { if (!state.photo || !state.pt || still) return;
  still = { pr: renderer.getPixelRatio(), size: renderer.getSize(new V2()), aspect: camera.aspect, scale: state.pt.renderScale };
  renderer.setPixelRatio(1); renderer.setSize(STILL.w, STILL.h, false); camera.aspect = STILL.w / STILL.h; camera.updateProjectionMatrix(); state.pt.renderScale = 1; state.pt.updateCamera(); stillBtn.textContent = 'Rendering…'; }
// called by the render loop right after a path-traced sample, while the frame is still in the canvas
export function stillTick() { if (!still) return false; statusEl.textContent = `Still · ${Math.floor(state.pt.samples)} / ${STILL.samples} samples`; if (state.pt.samples < STILL.samples) return true;
  const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png'); a.download = `palace1-${document.getElementById('view').value}-${STILL.w}x${STILL.h}.png`; a.click(); endStill(); return true; }
stillBtn.onclick = startStill;
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
