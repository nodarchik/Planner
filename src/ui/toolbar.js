import { CUT, camera, clampables, markShadows, renderer, scene, state, world } from '../scene.js';
import { SKY, setSun, syncLights, sun, useHDRI } from '../lighting.js';
import { loadSkyHDR } from '../assets.js';
import { plan } from '../plan/plan.js';
import { emissives } from '../materials.js';
import { bloom, composer } from '../post.js';
import { dimGroup } from './dims.js';
import { rebuildPT } from '../pathtracer.js';

/* ================= modes ================= */

export function setMood(n) {
  state.night = n;
  document.getElementById('mday').setAttribute('aria-pressed', !n); document.getElementById('mnight').setAttribute('aria-pressed', n);
  scene.environment = n ? SKY.night : SKY.day; scene.background = n ? SKY.night : SKY.back;
  sun.visible = !n && SKY.sunUp; markShadows();
  syncLights();
  emissives.forEach(m => m.emissiveIntensity = n ? m.userData.night : m.userData.day);
  bloom.strength = n ? .22 : .12;
  rebuildPT();
}
export function applyCut(on) {
  if (on) state.leaveWalk?.();
  state.cutOn = on;
  document.getElementById('wfull').setAttribute('aria-pressed', !on); document.getElementById('wcut').setAttribute('aria-pressed', on);
  for (const { me, h1, h2 } of clampables) { if (!on) { me.visible = true; me.scale.y = 1; me.position.y = (h1 + h2) / 2; continue; }
    if (h1 >= CUT) me.visible = false; else if (h2 > CUT) { const nh = CUT - h1; me.scale.y = nh / (h2 - h1); me.position.y = h1 + nh / 2; } }
  world.traverse(o => { if (!o.isMesh || o.userData.clamp) return;
    if (!on) { o.visible = true; o.scale.y = 1; return; }
    if (o.userData.clampMesh && o.userData.maxY > CUT) { o.scale.y = CUT / o.userData.maxY; return; }
    if (o.userData.minY >= CUT || o.userData.hideInCut) o.visible = false; });
  markShadows(); rebuildPT();
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
  renderer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (state.photo && state.pt) state.pt.updateCamera();
}
addEventListener('resize', resize); resize();
{ const sp = document.getElementById('spec'), ly = document.getElementById('layouts'), narrow = () => innerWidth <= 700;
  sp.addEventListener('toggle', () => { if (sp.open && narrow()) ly.open = false; }); ly.addEventListener('toggle', () => { if (ly.open && narrow()) sp.open = false; });
  if (narrow()) { sp.open = false; ly.open = false; } }

/* ================= sun: month + time of day ================= */
const SUNKEY = 'palace1-sun-v1', MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sunTime = document.getElementById('sunTime'), sunMonth = document.getElementById('sunMonth'), sunInfo = document.getElementById('sunInfo');
MONTHS.forEach((m, i) => sunMonth.add(new Option(m, i + 1)));
export function applySun(save) { const month = +sunMonth.value, hour = +sunTime.value, s = setSun(month, hour), hh = Math.floor(hour), mm = Math.round((hour - hh) * 60);
  sunInfo.textContent = `${hh}:${String(mm).padStart(2, '0')} · sun ${s.el > 0 ? `${Math.round(s.az)}° / ${Math.round(s.el)}° up` : 'down'}${plan.meta.north === null ? ' · north not set' : ''}`;
  if (save) { try { localStorage.setItem(SUNKEY, JSON.stringify({ month, hour })); } catch (e) {} }
  setMood(state.night); }
{ let d = plan.meta.sun; try { d = JSON.parse(localStorage.getItem(SUNKEY) || 'null') || d; } catch (e) {} sunMonth.value = d.month; sunTime.value = d.hour; setSun(d.month, d.hour); }
sunTime.oninput = () => applySun(true); sunMonth.onchange = () => applySun(true);
export function loadSky() { loadSkyHDR().then(t => { useHDRI(t); applySun(false); }).catch(() => {}); } // without the HDRI the procedural sky stays
