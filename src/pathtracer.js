import { DPR, V2, camera, controls, frame, markShadows, renderer, scene, stage, state, statusEl } from './scene.js';
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

const DEFAULT_SAMPLES = 32, DEFAULT_BOUNCES = 5, MAX_EDGE = 1440;
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
const revokePhotoUrl = () => { if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; } photoImg.removeAttribute('src'); };

function beginPass() {
  passId++; revokePhotoUrl();
  photoImg.hidden = true; photoSave.hidden = photoMore.hidden = photoStop.hidden = true;
  photoDone = stopRequested = saving = false;
  targetSamples = headlessReq?.samples || DEFAULT_SAMPLES;
  window.__photoSamples = window.__stillSamples = 0;
  photoProg.max = targetSamples; photoProg.value = 0;
  photoText.textContent = `Rendering photo · 0 / ${targetSamples} samples`;
  statusEl.textContent = `Photo · 0 / ${targetSamples} samples`;
  state.photoRendering = true;
}

function exitPhoto() {
  runId++; passId++;
  if (headlessReq) { const rej = headlessReq.reject; headlessReq = null; rej(new Error('Photo turned off during the still')); }
  revokePhotoUrl();
  denoiser?.dispose(); denoiser = null;
  photoImg.hidden = true; photoBar.hidden = true;
  photoStop.hidden = photoMore.hidden = photoSave.hidden = true;
  stopRequested = photoDone = saving = false;
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
  state.pt.renderSample();
  const n = Math.floor(state.pt.samples);
  window.__photoSamples = window.__stillSamples = n;
  const shown = Math.min(targetSamples, n);
  photoProg.value = shown;
  if (headlessReq) {
    statusEl.textContent = `Still · ${shown} / ${targetSamples} samples`;
    if (state.pt.samples < targetSamples && !stopRequested) return true;
    const h = headlessReq; headlessReq = null; state.photoRendering = false;
    denoiser?.run(state.pt.target.texture, renderer.toneMappingExposure, state.fstop > 0);
    try { h.resolve(renderer.domElement.toDataURL('image/png')); } catch (e) { h.reject(e); }
    return true;
  }
  photoText.textContent = `Rendering photo · ${n} / ${targetSamples} samples`;
  statusEl.textContent = `Photo · ${n} / ${targetSamples} samples`;
  if (n >= 1 && photoStop.hidden) photoStop.hidden = false;
  if (state.pt.samples < targetSamples && !stopRequested) return true;
  saving = true; state.photoRendering = false;
  const myPass = ++passId, w = renderer.domElement.width, h = renderer.domElement.height;
  const focusStop = document.activeElement === photoStop;
  photoStop.hidden = true;
  photoText.textContent = 'Denoising image…';
  denoiser?.run(state.pt.target.texture, renderer.toneMappingExposure, state.fstop > 0);
  try {
    renderer.domElement.toBlob(blob => {
      if (myPass !== passId || !state.photo) return;
      saving = false;
      if (!blob) { photoDone = true; photoMore.hidden = false; photoText.textContent = `Photo finished · ${n} samples`; if (focusStop) photoClose.focus(); return; }
      revokePhotoUrl(); photoUrl = URL.createObjectURL(blob); photoSize = [w, h];
      photoImg.src = photoUrl; photoImg.hidden = false; photoDone = true;
      photoProg.value = targetSamples;
      photoMore.hidden = photoSave.hidden = false;
      photoText.textContent = `Photo ready · ${w}×${h} · ${n} samples`;
      statusEl.textContent = `Photo ready · ${n} samples`;
      if (focusStop) photoSave.focus();
    }, 'image/png');
  } catch (e) { saving = false; photoDone = true; photoMore.hidden = false; if (focusStop) photoClose.focus(); }
  return true;
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
    photoProg.removeAttribute('value');
    photoBar.hidden = false; photoText.textContent = 'Loading renderer…'; statusEl.textContent = 'Loading renderer…';
    photoClose.focus();
  }
  try {
    if (!state.pt) {
      statusEl.textContent = 'Loading renderer…'; await frame();
      if (myRun !== runId || !state.photo) return;
      const [mod, dn] = await Promise.all([import('three-gpu-pathtracer'), import('./denoise.js')]);
      if (myRun !== runId || !state.photo) return;
      ptCam = new mod.PhysicalCamera(camera.fov, camera.aspect, camera.near, camera.far);
      ptCam.filmGauge = camera.filmGauge;
      state.pt = new mod.WebGLPathTracer(renderer);
      state.pt.tiles.set(2, 2); state.pt.bounces = DEFAULT_BOUNCES; state.pt.transmissiveBounces = 4; state.pt.filterGlossyFactor = .5; state.pt.minSamples = 1; state.pt.renderDelay = 0; state.pt.fadeDuration = 0; state.pt.renderScale = 1;
      state.pt.rasterizeSceneCallback = () => composer.render();
      denoiser = dn.createDenoiser(renderer);
    } else if (!denoiser) {
      const { createDenoiser } = await import('./denoise.js');
      if (myRun !== runId || !state.photo) return;
      denoiser = createDenoiser(renderer);
    }
    if (!headlessReq) photoText.textContent = 'Preparing scene…';
    statusEl.textContent = 'Preparing scene…';
    await frame(); if (myRun !== runId || !state.photo) return;
    await frame(); if (myRun !== runId || !state.photo) return;
    setFast(false);
    const rw0 = innerWidth * Math.min(DPR, 1.25), rh0 = innerHeight * Math.min(DPR, 1.25);
    const k = Math.min(1, MAX_EDGE / Math.max(rw0, rh0));
    const rw = opts.w || Math.max(1, Math.round(rw0 * k)), rh = opts.h || Math.max(1, Math.round(rh0 * k));
    renderer.setPixelRatio(1); renderer.setSize(rw, rh, false);
    if (!opts.w) { renderer.domElement.style.width = `${innerWidth}px`; renderer.domElement.style.height = `${innerHeight}px`; }
    camera.aspect = rw / rh;
    camera.fov = state.focal ? focalFov(state.focal, camera.aspect) : baseFov;
    camera.updateProjectionMatrix();
    state.pt.renderScale = 1;
    state.pt.bounces = opts.bounces || DEFAULT_BOUNCES;
    denoiser.capture(scene, camera, rw, rh, skipMats());
    ptGlass(true); syncLights(); ptSetScene(); state.ptDirty = false;
    beginPass();
  } catch (err) {
    console.warn(err);
    const rej = headlessReq?.reject; headlessReq = null;
    if (state.photo) exitPhoto();
    statusEl.textContent = 'Photo render unavailable on this device';
    rej?.(err);
  }
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
  photoProg.max = targetSamples; photoProg.value = Math.floor(state.pt.samples);
  photoText.textContent = `Rendering photo · ${Math.floor(state.pt.samples)} / ${targetSamples} samples`;
  statusEl.textContent = `Photo · ${Math.floor(state.pt.samples)} / ${targetSamples} samples`;
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
  finish() { if (state.photoRendering) stopRequested = true; },
};
