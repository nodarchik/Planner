// Fast mode: no reflections, shadows, AO, bloom or lamps; flat hemisphere light instead. Every changed value is recorded and restored on exit.
import * as THREE from 'three';
import { markShadows, renderer, scene, state } from './scene.js';
import { SKY, coveLights, nightLights, sun, syncLights } from './lighting.js';
import { applyPost, bloom, gtao } from './post.js';

const KEY = 'palace1-fast-v1', btn = document.getElementById('fast');
const hemi = new THREE.HemisphereLight(0xfff6ea, 0xb9a994, 0), shape = new THREE.DirectionalLight(0xffffff, 0); // flat light, plus one cheap shadowless light for form
hemi.visible = shape.visible = false; shape.position.set(-.4, 1, .6); scene.add(hemi, shape);
const kept = new Map(); // material -> original values

const mats = () => { const s = new Set(); scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => s.add(m)); }); return s; };
const FIELDS = ['clearcoat', 'sheen', 'transmission', 'transparent', 'opacity', 'depthWrite', 'metalness', 'envMapIntensity', 'normalMap', 'roughnessMap'];
function flatten(m) {
  let r = kept.get(m); if (!r) { r = {}; for (const f of FIELDS) if (f in m) r[f] = m[f]; kept.set(m, r); }
  else { if (m.normalMap) r.normalMap = m.normalMap; if (m.roughnessMap) r.roughnessMap = m.roughnessMap; } // a scanned map that arrived while Fast is on
  if (m.clearcoat !== undefined) m.clearcoat = 0;
  if (m.sheen !== undefined) m.sheen = 0;
  if (m.transmission > 0) { if (m.transmission >= 1) { m.transparent = true; m.opacity = Math.min(m.opacity, .2); m.depthWrite = false; } m.transmission = 0; } // glass: plain transparent
  if (m.metalness > 0) m.metalness = 0; // metals are black without reflections
  for (const f of ['envMapIntensity', 'normalMap', 'roughnessMap']) if (f in m) m[f] = f[0] === 'e' ? 0 : null;
  m.needsUpdate = true;
}
export function fastInherit(src, dst) { const r = kept.get(src); if (r) kept.set(dst, { ...r }); }
export function fastSync() { if (state.fast) for (const m of mats()) flatten(m); }
// called at the end of syncLights: lamps and sun off, flat light on (dimmer at night)
export function fastLights() {
  if (!state.fast) return;
  nightLights.forEach(l => l.visible = false); coveLights.forEach(l => l.visible = false); sun.visible = false; scene.environment = null;
  hemi.visible = shape.visible = true; hemi.intensity = state.night ? .5 : 2.6; shape.intensity = state.night ? 0 : 1.1;
}
export function setFast(on) {
  if (on === state.fast) return;
  if (on && state.photo) document.getElementById('photo').click();
  state.fast = on; renderer.shadowMap.enabled = !on;
  if (on) fastSync();
  else { for (const [m, r] of kept) { Object.assign(m, r); m.needsUpdate = true; } kept.clear(); hemi.visible = shape.visible = false; hemi.intensity = shape.intensity = 0;
    scene.environment = state.night ? SKY.night : SKY.day; sun.visible = !state.night && SKY.sunUp; }
  syncLights(); applyPost(); markShadows(); btn.setAttribute('aria-pressed', on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
}
export function initFast() { try { if (localStorage.getItem(KEY) === '1') setFast(true); } catch (e) {} }
btn.onclick = () => setFast(!state.fast);
// test hook: snapshot of every material value Fast touches and of every light, plus the render settings
window.__fast = { get on() { return state.fast; },
  settings: () => ({ shadows: renderer.shadowMap.enabled, env: !!scene.environment, ao: gtao.enabled, bloom: bloom.enabled, pr: renderer.getPixelRatio() }),
  snapshot: () => { const mm = {}, ll = []; for (const m of mats()) { const o = { color: m.color?.getHex() }; for (const f of FIELDS) if (f in m) o[f] = f.endsWith('Map') ? m[f]?.uuid ?? null : m[f]; mm[m.uuid] = o; }
    scene.traverse(o => { if (o.isLight) ll.push([o.uuid, o.visible, o.intensity, o.type, o.castShadow]); }); return { mats: mm, lights: ll }; } };
