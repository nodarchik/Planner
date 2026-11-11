import { DPR, camera, controls, frame, renderer, scene, state, statusEl } from './scene.js';
import { composer } from './post.js';

/* ================= path tracer ("Photo render") ================= */

export function rebuildPT() { if (state.photo) state.ptDirty = true; }
export async function setPhoto(on) {
  const btn = document.getElementById('photo');
  if (!on) { state.photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = ''; return; }
  btn.setAttribute('aria-pressed', 'true');
  try {
    if (!state.pt) { statusEl.textContent = 'Loading renderer…'; await frame();
      const mod = await import('three-gpu-pathtracer');
      state.pt = new mod.WebGLPathTracer(renderer);
      state.pt.tiles.set(2, 2); state.pt.bounces = 6; state.pt.transmissiveBounces = 8; state.pt.filterGlossyFactor = .5; state.pt.minSamples = 3; state.pt.renderDelay = 0; state.pt.fadeDuration = 300;
      state.pt.renderScale = Math.min(1, 1.4 / DPR);
      state.pt.rasterizeSceneCallback = () => composer.render(); }
    statusEl.textContent = 'Preparing scene…'; await frame(); await frame();
    state.photo = true; state.pt.setScene(scene, camera); state.ptDirty = false;
  } catch (err) { console.warn(err); state.photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = 'Photo render unavailable on this device'; }
}
document.getElementById('photo').onclick = () => setPhoto(!state.photo);
controls.addEventListener('change', () => { if (state.photo && state.pt) state.pt.updateCamera(); });
