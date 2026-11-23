import { MOBILE, V2, camera, controls, frame, markShadows, renderer, scene, stage, state, statusEl } from './scene.js';
import { composer } from './post.js';
import { M } from './materials.js';
import { setView } from './ui/views.js';
import { syncLights } from './lighting.js';
import { setFast } from './fast.js';

const $ = id => document.getElementById(id);
// vertical FOV in degrees for a full-frame focal length at the given aspect
export const focalFov = (mm, aspect) => 2 * Math.atan(18 / Math.max(aspect, 1) / mm) * 180 / Math.PI;
let ptCam = null, denoiser = null;
// push lens settings to the path tracer (focus = distance to the orbit target)
const lens = () => {
  if (!ptCam) return;
  ptCam.fov = camera.fov; ptCam.aspect = camera.aspect; ptCam.near = camera.near; ptCam.far = camera.far;
  ptCam.zoom = camera.zoom; ptCam.filmGauge = camera.filmGauge;
  ptCam.position.copy(camera.position); ptCam.quaternion.copy(camera.quaternion); ptCam.scale.copy(camera.scale);
  ptCam.updateMatrixWorld(true); ptCam.updateProjectionMatrix();
  ptCam.focusDistance = camera.position.distanceTo(controls.target); ptCam.fStop = state.fstop || Infinity;
};
export function ptCamera() { lens(); if (state.pt) state.pt.updateCamera(); }

/* ================= path tracer ("Photo render") ================= */

const DEFAULT_SAMPLES = 32, DEFAULT_BOUNCES = 5;
// Photo size = the window in device pixels (as sharp as the screen), capped by pixel count (render time, GPU memory: up to 95 bytes per pixel) and long edge
const MAX_PIXELS = MOBILE ? 1e6 : 3.7e6, MAX_EDGE = MOBILE ? 2048 : 2880;
const photoDims = budget => { const w = innerWidth * devicePixelRatio, h = innerHeight * devicePixelRatio, k = Math.min(1, Math.sqrt(MAX_PIXELS * budget / (w * h)), MAX_EDGE / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; };
// true when the GPU ran out of memory since the last call (lost context included)
const gpuFull = () => { const gl = renderer.getContext(); let full = gl.isContextLost(); for (let e, i = 0; i < 8 && (e = gl.getError()); i++) if (e === gl.OUT_OF_MEMORY) full = true; return full; };
// window / rail / shower glass use clear alpha so sunlight reaches rooms cleanly; clearcoat breaks in the path tracer so it is off in Photo
const GLASS_ALPHA = { glassWin: 0, glassRail: 0, glassShower: .1 };
// decorative glass, tinted glass and pool water keep thin-walled/index transmission during path tracing
const GLASS_PHYS = {
  glass: { transmission: 1, thickness: .008, ior: 1.5, roughness: 0, metalness: 0, transparent: false, opacity: 1, depthWrite: true },
  glassTint: { transmission: 1, thickness: .012, ior: 1.5, roughness: .03, metalness: 0, transparent: false, opacity: 1, depthWrite: true },
  water: { transmission: 1, thickness: .2, ior: 1.33, roughness: .02, metalness: 0, transparent: false, opacity: 1, depthWrite: true },
};
const GLASS_FIELDS = ['transmission', 'thickness', 'ior', 'roughness', 'metalness', 'transparent', 'opacity', 'depthWrite'];
const skipMats = () => [M.glassWin, M.glassRail, M.glassShower];
const glassKept = new Map(), matKept = new Map();
export function forgetPtMaterial(m) { matKept.delete(m); }
export function disposePT() {
  denoiser?.dispose(); denoiser = null;
  if (!state.pt) return;
  const pt = state.pt;
  state.pt = null; ptCam = null;
  pt._quad?.dispose(); pt._quad?.material?.dispose();
  pt._pathTracer?.dispose(); pt._lowResPathTracer?.dispose();
  pt._internalBackground?.dispose(); pt._colorBackground?.dispose();
}
window.__disposePT = disposePT;
addEventListener('pagehide', disposePT);
export function ptMats(on) { if (on) scene.traverse(o => { for (const m of [].concat(o.material || [])) if (!matKept.has(m) && (m.clearcoat > 0 || (m.transmission > 0 && m.transmission < 1))) {
      matKept.set(m, [m.clearcoat, m.transmission]); m.clearcoat = 0; if (m.transmission < 1) m.transmission = 0; m.needsUpdate = true; } });
  else { for (const [m, [c, t]] of matKept) { m.clearcoat = c; m.transmission = t; m.needsUpdate = true; } matKept.clear(); } }
function saveGlass(k, m) { const o = {}; for (const f of GLASS_FIELDS) o[f] = m[f]; glassKept.set(k, o); }
function ptGlass(on) {
  if (on) {
    for (const [k, op] of Object.entries(GLASS_ALPHA)) { const m = M[k]; if (!m || glassKept.has(k)) continue;
      saveGlass(k, m); m.transmission = 0; m.transparent = true; m.opacity = op; m.depthWrite = false; m.needsUpdate = true; }
    for (const [k, spec] of Object.entries(GLASS_PHYS)) { const m = M[k]; if (!m || glassKept.has(k)) continue;
      saveGlass(k, m); Object.assign(m, spec); m.needsUpdate = true; }
  } else {
    for (const [k, orig] of glassKept) { const m = M[k]; if (m) { Object.assign(m, orig); m.needsUpdate = true; } }
    glassKept.clear();
  }
  ptMats(on);
}
// day sky 3x stronger in Photo: the room is lit only through the windows, the raster view gets unoccluded sky light everywhere
export function ptSetScene() { ptMats(true); lens(); scene.environmentIntensity = state.night ? 1 : 3; state.pt.setScene(scene, ptCam); }
export function rebuildPT() { state.dirty = true; if (state.photo) state.ptDirty = true; }

const photoBtn = $('photo'), photoBar = $('photobar'), photoImg = $('photoImg'), photoText = $('photoText'), photoProg = $('photoProg');
const photoStop = $('photoStop'), photoMore = $('photoMore'), photoSave = $('photoSave'), photoClose = $('photoClose');
const focalSel = $('focal'), fstopSel = $('fstop');
const LOCK_IDS = ['view', 'wfull', 'wcut', 'mday', 'mnight', 'sunMonth', 'sunTime', 'tlab', 'tdim', 'tfur', 'style', 'walk', 'move'];
const lockToolbar = on => { for (const id of LOCK_IDS) { const el = $(id); if (el) el.disabled = on; } };

let snap = null, runId = 0, passId = 0, targetSamples = DEFAULT_SAMPLES, stopRequested = false, photoDone = false, saving = false;
let photoUrl = null, photoSize = [0, 0], headlessReq = null;
let finishing = false, focusStop = false, lastSamples = 0, rearm = null;
// one percentage for the whole render: loading the renderer 0-3, preparing the scene 3-10, sampling up to 97, denoising 97, encoding 99, 100 = image ready.
// It never goes back within a pass; "+32 samples" and a lens change start a new pass at 0.
let pct = 0, stageName = '', passLo = 0, passFrom = 0;
function progress(p, name, samples) {
  pct = Math.max(pct, Math.min(100, Math.floor(p))); stageName = name;
  const line = `${headlessReq ? 'Still' : 'Photo'} · ${pct} % · ${samples || name.toLowerCase()}`;
  if (statusEl.textContent !== line) statusEl.textContent = line;
  if (headlessReq) return;
  const text = samples ? `${name} · ${pct} % · ${samples}` : `${name} · ${pct} %`;
  if (photoText.textContent !== text) photoText.textContent = text;
  photoProg.max = 100; photoProg.value = pct;
}
function sampling() {
  const s = state.pt.samples;
  if (!s && state.pt.isCompiling) return progress(passLo, 'Compiling shaders');
  progress(passLo + (97 - passLo) * Math.min(1, Math.max(0, (s - passFrom) / Math.max(1e-6, targetSamples - passFrom))), 'Rendering photo', `${Math.min(targetSamples, Math.floor(s))} / ${targetSamples} samples`);
}
const revokePhotoUrl = () => { if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; } photoImg.removeAttribute('src'); };

function beginPass(lo = 0) {
  passId++; revokePhotoUrl();
  photoImg.hidden = true; photoSave.hidden = photoMore.hidden = photoStop.hidden = true;
  photoDone = stopRequested = saving = finishing = false;
  targetSamples = headlessReq?.samples || DEFAULT_SAMPLES;
  window.__photoSamples = window.__stillSamples = 0;
  passLo = lo; passFrom = lastSamples = 0; if (!lo) pct = 0;
  denoiser?.reset(); sampling();
  state.photoRendering = true;
}

function exitPhoto() {
  runId++; passId++;
  if (headlessReq) { const rej = headlessReq.reject; headlessReq = null; rej(new Error('Photo turned off during the still')); }
  revokePhotoUrl();
  denoiser?.dispose(); denoiser = null;
  photoImg.hidden = true; photoBar.hidden = true;
  photoStop.hidden = photoMore.hidden = photoSave.hidden = true;
  stopRequested = photoDone = saving = finishing = false; rearm = null; pct = 0; stageName = '';
  ptGlass(false); scene.environmentIntensity = 1;
  state.photo = false; state.photoRendering = false; state.photoFov = null;
  if (snap) {
    const s = snap; snap = null;
    renderer.setPixelRatio(s.pr); renderer.setSize(s.size.x, s.size.y);
    camera.aspect = s.aspect; camera.fov = s.fov; camera.updateProjectionMatrix();
    if (state.pt) { state.pt.renderScale = s.scale; state.pt.bounces = s.bounces; }
    camera.position.copy(s.pos); controls.target.copy(s.target);
    controls.enabled = s.enabled; controls.enableDamping = s.damping; controls.update();
  } else controls.enabled = true;
  state.syncDims?.();
  stage.inert = false; document.body.classList.remove('photo-mode');
  lockToolbar(false);
  const inBar = document.activeElement && photoBar.contains(document.activeElement);
  photoBtn.setAttribute('aria-pressed', 'false'); statusEl.textContent = '';
  syncLights(); markShadows(); dispatchEvent(new Event('resize'));
  if (inBar) photoBtn.focus();
}

// called from main.js render loop while Photo render is actively refining samples
export function photoTick() {
  if (!state.photo || !state.photoRendering || !state.pt || saving) return false;
  if (finishing) { finishing = false; develop(); return true; }
  const pt = state.pt;
  pt.renderSample();
  const s = pt.samples, n = Math.floor(s);
  if (rearm && s > 0) { const again = rearm; rearm = null; if (gpuFull()) { again(); return true; } }
  if (s < lastSamples) denoiser?.reset(); // the accumulation restarted (scene or camera update)
  lastSamples = s;
  if (s === n && n > 0 && !(n & (n - 1))) denoiser?.snapshot(pt.target.texture, n); // halves for the noise estimate
  window.__photoSamples = window.__stillSamples = n;
  sampling();
  if (!headlessReq && n >= 1 && photoStop.hidden) photoStop.hidden = false;
  if (s < targetSamples && !stopRequested) return true;
  focusStop = document.activeElement === photoStop; photoStop.hidden = true;
  finishing = true; progress(97, 'Denoising'); // shown for one frame, the filter runs on the next tick
  return true;
}
// denoise the accumulated image onto the canvas, then hand it over (PNG blob on screen, data URL for a scripted still)
function develop() {
  const n = Math.floor(state.pt.samples);
  denoiser?.run(state.pt.target.texture, renderer.toneMappingExposure, { samples: state.pt.samples, dof: state.fstop > 0 });
  state.photoRendering = false;
  if (headlessReq) {
    const h = headlessReq; let url;
    try { url = renderer.domElement.toDataURL('image/png'); } catch (e) { headlessReq = null; h.reject(e); return; }
    progress(100, 'Photo ready'); headlessReq = null; h.resolve(url);
    return;
  }
  saving = true; progress(99, 'Saving image');
  const myPass = ++passId, w = renderer.domElement.width, h = renderer.domElement.height;
  const ready = (text, focus) => { saving = false; photoDone = true; photoMore.hidden = false; progress(100, 'Photo ready'); photoText.textContent = text; statusEl.textContent = `Photo ready · ${n} samples`; if (focusStop) focus.focus(); };
  try {
    renderer.domElement.toBlob(blob => {
      if (myPass !== passId || !state.photo) return;
      if (!blob) return ready(`Photo finished · ${n} samples`, photoClose);
      revokePhotoUrl(); photoUrl = URL.createObjectURL(blob); photoSize = [w, h];
      photoImg.src = photoUrl; photoImg.hidden = false; photoSave.hidden = false;
      ready(`Photo ready · ${w}×${h} · ${n} samples`, photoSave);
    }, 'image/png');
  } catch (e) { ready(`Photo finished · ${n} samples`, photoClose); }
}

function setLens(focal, fstop) {
  const focalChanged = state.focal !== focal;
  state.focal = focal; state.fstop = fstop; focalSel.value = String(focal); fstopSel.value = String(fstop);
  if (!state.photo || !state.pt || headlessReq) return;
  camera.fov = focal ? focalFov(focal, camera.aspect) : (state.photoFov ?? camera.fov);
  camera.updateProjectionMatrix();
  if (focalChanged && denoiser) denoiser.capture(scene, camera, renderer.domElement.width, renderer.domElement.height, skipMats());
  ptCamera();
  beginPass();
  state.dirty = true;
}
focalSel.onchange = fstopSel.onchange = () => setLens(+focalSel.value, +fstopSel.value);

export async function setPhoto(on, opts = {}) {
  if (!on) { if (state.photo) exitPhoto(); return; }
  if (state.photo && !opts.headless) return;
  const myRun = ++runId;
  state.leaveWalk?.(true); state.leaveMove?.(); setFast(false);
  const prevEnabled = controls.enabled, prevDamping = controls.enableDamping;
  if (state.anim) { camera.position.copy(state.anim.to.p); controls.target.copy(state.anim.to.t); state.anim = null; }
  controls.enableDamping = false; controls.update(); controls.enabled = false;
  const baseFov = state.fovNow ? state.fovNow() : camera.fov;
  camera.fov = baseFov; camera.updateProjectionMatrix(); state.syncCeiling?.();
  snap = { pr: renderer.getPixelRatio(), size: renderer.getSize(new V2()), aspect: camera.aspect, fov: baseFov, pos: camera.position.clone(), target: controls.target.clone(), enabled: prevEnabled, damping: prevDamping, scale: state.pt?.renderScale ?? 1, bounces: state.pt?.bounces ?? DEFAULT_BOUNCES };
  state.photo = true; state.photoRendering = false; state.photoFov = baseFov;
  stage.inert = true; document.body.classList.add('photo-mode'); lockToolbar(true); state.syncDims?.();
  photoBtn.setAttribute('aria-pressed', 'true');
  headlessReq = opts.headless || null;
  if (!headlessReq) {
    revokePhotoUrl(); photoImg.hidden = true; photoStop.hidden = photoMore.hidden = photoSave.hidden = true;
    photoBar.hidden = false; photoClose.focus();
  }
  pct = 0; progress(0, 'Loading renderer');
  try {
    if (!state.pt) {
      await frame();
      if (myRun !== runId || !state.photo) return;
      const [mod, dn] = await Promise.all([import('three-gpu-pathtracer'), import('./denoise.js')]);
      if (myRun !== runId || !state.photo) return;
      ptCam = new mod.PhysicalCamera(camera.fov, camera.aspect, camera.near, camera.far);
      ptCam.filmGauge = camera.filmGauge;
      state.pt = new mod.WebGLPathTracer(renderer);
      state.pt.bounces = DEFAULT_BOUNCES; state.pt.filterGlossyFactor = .25; state.pt.minSamples = 1; state.pt.renderDelay = 0; state.pt.fadeDuration = 0; state.pt.renderScale = 1;
      state.pt.rasterizeSceneCallback = () => composer.render();
      denoiser = dn.createDenoiser(renderer);
    } else if (!denoiser) {
      const { createDenoiser } = await import('./denoise.js');
      if (myRun !== runId || !state.photo) return;
      denoiser = createDenoiser(renderer);
    }
    progress(3, 'Preparing scene');
    await frame(); if (myRun !== runId || !state.photo) return;
    await frame(); if (myRun !== runId || !state.photo) return;
    setFast(false);
    // size, guide buffers, scene upload; `budget` 0.5 = second try with half the pixels after the GPU ran out of memory
    const arm = async budget => {
      const [rw, rh] = opts.w ? [opts.w, opts.h] : photoDims(budget);
      renderer.setPixelRatio(1); renderer.setSize(rw, rh, false);
      if (!opts.w) { renderer.domElement.style.width = `${innerWidth}px`; renderer.domElement.style.height = `${innerHeight}px`; }
      camera.aspect = rw / rh;
      camera.fov = state.focal ? focalFov(state.focal, camera.aspect) : baseFov;
      camera.updateProjectionMatrix();
      const t = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(rw * rh / 2.5e5)))); // about 0.25 MP per frame keeps the page and the percentage moving
      state.pt.tiles.set(t, t); state.pt.renderScale = 1;
      state.pt.bounces = opts.bounces || DEFAULT_BOUNCES;
      // the library keeps its random numbers in a table bounces + transmissiveBounces + 5 wide but reads columns 0-16 of it; with 5 + 4 + 5 = 14
      // the lobe choice (column 15) read outside the table, got the same value for every sample of a pixel, and glossy reflections never converged
      state.pt.transmissiveBounces = Math.max(4, 12 - state.pt.bounces);
      gpuFull(); denoiser.capture(scene, camera, rw, rh, skipMats());
      if (gpuFull()) throw new Error('GPU out of memory');
      progress(5, 'Preparing scene'); await frame(); if (myRun !== runId || !state.photo) return false;
      ptGlass(true); syncLights(); ptSetScene(); state.ptDirty = false;
      progress(10, 'Preparing scene');
      return true;
    };
    const start = async budget => { const ok = await arm(budget); if (ok) beginPass(10); return ok; };
    const half = () => { console.warn('Photo render: GPU out of memory, trying half the pixels'); state.photoRendering = false; return start(.5); };
    try { if (await start(1) && !opts.w) rearm = () => half().catch(fail); } // photoTick calls rearm when the first samples ran out of memory
    catch (err) { if (opts.w || myRun !== runId || !state.photo) throw err; await half(); }
  } catch (err) { fail(err); }
}
function fail(err) {
  console.warn(err);
  const rej = headlessReq?.reject; headlessReq = null;
  if (state.photo) exitPhoto();
  statusEl.textContent = 'Photo render unavailable on this device';
  rej?.(err);
}

photoBtn.onclick = () => setPhoto(!state.photo);
photoClose.onclick = () => setPhoto(false);
photoStop.onclick = () => { if (state.photoRendering) stopRequested = true; };
photoMore.onclick = () => {
  if (!state.photo || !state.pt || !photoDone || saving) return;
  passId++; revokePhotoUrl();
  photoImg.hidden = true; photoMore.hidden = photoSave.hidden = true;
  photoStop.hidden = false; photoDone = stopRequested = false;
  targetSamples = Math.max(targetSamples, Math.floor(state.pt.samples)) + DEFAULT_SAMPLES;
  passLo = pct = 0; passFrom = state.pt.samples; sampling(); // a new pass: the percentage covers the added samples
  state.photoRendering = true; photoStop.focus();
};
photoSave.onclick = () => {
  if (!photoUrl) return;
  const a = document.createElement('a'); a.href = photoUrl;
  a.download = `palace1-photo-${photoSize[0]}x${photoSize[1]}.png`; a.click();
};

// scripted still (tools/stills.py, walk_test.py): resolves with a PNG data URL, then restores view, mood and Photo state
window.__still = async ({ view, samples = 96, w = 2560, h = 1440, night = false, focal, fstop, bounces } = {}) => {
  if (state.photo) throw new Error('Photo render is already active');
  const prev = { view: $('view').value, night: state.night, focal: state.focal, fstop: state.fstop };
  if (view) { setLens(focal || 0, fstop || 0); $(night ? 'mnight' : 'mday').click(); setView(view, true); }
  for (let i = 0; i < 60 && !window.__settled; i++) await frame();
  const url = await new Promise((resolve, reject) => {
    setPhoto(true, { w, h, bounces, headless: { samples, resolve, reject } });
  });
  setPhoto(false);
  if (view) { $(prev.night ? 'mnight' : 'mday').click(); setView(prev.view, true); setLens(prev.focal, prev.fstop); }
  return url;
};

window.__photo = {
  get on() { return state.photo; },
  get rendering() { return state.photoRendering; },
  get done() { return photoDone; },
  get samples() { return window.__photoSamples || 0; },
  get target() { return targetSamples; },
  get percent() { return pct; }, // 0-100, see progress()
  get stage() { return stageName; },
  get size() { return [renderer.domElement.width, renderer.domElement.height]; },
  finish() { if (state.photoRendering) stopRequested = true; },
};
