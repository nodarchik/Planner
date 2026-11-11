import { CUT, DPR, camera, clampables, renderer, scene, state, world } from '../scene.js';
import { nightLights, skyDay, skyNight, sun } from '../lighting.js';
import { emissives } from '../materials.js';
import { bloom, composer } from '../post.js';
import { dimGroup } from './dims.js';
import { rebuildPT } from '../pathtracer.js';

/* ================= modes ================= */

export function setMood(n) {
  state.night = n;
  document.getElementById('mday').setAttribute('aria-pressed', !n); document.getElementById('mnight').setAttribute('aria-pressed', n);
  scene.environment = n ? skyNight : skyDay; scene.background = n ? skyNight : skyDay;
  sun.visible = !n;
  nightLights.forEach(l => l.visible = n);
  emissives.forEach(m => m.emissiveIntensity = n ? m.userData.night : m.userData.day);
  bloom.strength = n ? .22 : .12;
  rebuildPT();
}
export function applyCut(on) {
  state.cutOn = on;
  document.getElementById('wfull').setAttribute('aria-pressed', !on); document.getElementById('wcut').setAttribute('aria-pressed', on);
  for (const { me, h1, h2 } of clampables) { if (!on) { me.visible = true; me.scale.y = 1; me.position.y = (h1 + h2) / 2; continue; }
    if (h1 >= CUT) me.visible = false; else if (h2 > CUT) { const nh = CUT - h1; me.scale.y = nh / (h2 - h1); me.position.y = h1 + nh / 2; } }
  world.traverse(o => { if (!o.isMesh || o.userData.clamp) return;
    if (!on) { o.visible = true; o.scale.y = 1; return; }
    if (o.userData.clampMesh && o.userData.maxY > CUT) { o.scale.y = CUT / o.userData.maxY; return; }
    if (o.userData.minY >= CUT || o.userData.hideInCut) o.visible = false; });
  rebuildPT();
}

/* ================= UI wiring ================= */
document.getElementById('wfull').onclick = () => applyCut(false);
document.getElementById('wcut').onclick = () => applyCut(true);
document.getElementById('mday').onclick = () => setMood(false);
document.getElementById('mnight').onclick = () => setMood(true);
const tog = (id, fn) => document.getElementById(id).onclick = e => e.currentTarget.setAttribute('aria-pressed', fn());
tog('tlab', () => state.showRooms = !state.showRooms);
tog('tdim', () => { state.showDims = !state.showDims; dimGroup.visible = state.showDims; return state.showDims; });
tog('tfur', () => state.showFurn = !state.showFurn);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (state.photo && state.pt) state.pt.updateCamera();
}
addEventListener('resize', resize); resize();
{ const sp = document.getElementById('spec'), ly = document.getElementById('layouts'), narrow = () => innerWidth <= 700;
  sp.addEventListener('toggle', () => { if (sp.open && narrow()) ly.open = false; }); ly.addEventListener('toggle', () => { if (ly.open && narrow()) sp.open = false; });
  if (narrow()) { sp.open = false; ly.open = false; } }
