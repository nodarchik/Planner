import * as THREE from 'three';
import { CUT, H, V3, camera, controls, frame, loader, renderer, scene, state, statusEl, world } from './scene.js';
import { buildTextures } from './textures.js';
import { buildMaterials } from './materials.js';
import { buildArchitecture } from './arch/shell.js';
import { applyLayout, buildFurniture } from './layout.js';
import { composer } from './post.js';
import { labels, setupOverlays } from './ui/dims.js';
import { setMood } from './ui/toolbar.js';
import { setView } from './ui/views.js';
import { rebuildPT } from './pathtracer.js';
import './lighting.js';
import './primitives.js';
import './arch/walls.js';
import './arch/soft.js';
import './furniture/storage.js';
import './furniture/plants.js';
import './furniture/decor.js';
import './furniture/bed.js';
import './furniture/chairs.js';
import './catalog.js';
import './ui/editor.js';
import './ui/style.js';
import './ui/swap.js';
import './ui/panels.js';

async function build() {
  await frame(); await buildTextures(); buildMaterials();
  loader.textContent = 'Building apartment…'; await frame();
  state.ceiling = buildArchitecture(); buildFurniture();
  world.updateMatrixWorld(true);
  world.traverse(o => { if (o.isMesh && !o.userData.clamp) { const bb = new THREE.Box3().setFromObject(o); o.userData.minY = bb.min.y; o.userData.maxY = bb.max.y; } });
  setupOverlays(); applyLayout(); setMood(false); setView('overview', true);
  loader.hidden = true;
}

/* ================= loop ================= */
const v = new V3();
function tick(now) {
  requestAnimationFrame(tick); window.__frames = (window.__frames || 0) + 1;
  if (state.anim) { const k = Math.min(1, (now - state.anim.t0) / 900), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(state.anim.from.p, state.anim.to.p, e); controls.target.lerpVectors(state.anim.from.t, state.anim.to.t, e); if (k >= 1) state.anim = null; if (state.photo && state.pt) state.pt.updateCamera(); }
  controls.update();
  const inside = camera.position.y < H - .05 && camera.position.x > -0.25 && camera.position.x < 13.87 && camera.position.z > -0.29 && camera.position.z < 9.3;
  const fov = (inside ? 62 : 42) + (innerWidth < 600 ? 14 : 0); if (Math.abs(camera.fov - fov) > .01) { camera.fov += (fov - camera.fov) * .15; if (Math.abs(camera.fov - fov) < .05) camera.fov = fov; camera.updateProjectionMatrix(); if (state.photo && state.pt) state.pt.updateCamera(); }
  window.__settled = !state.anim && camera.fov === fov; // camera at rest: read by tools/shot.py
  if (state.ceiling) { state.ceiling.visible = inside; if (state.lastCeil !== inside) { state.lastCeil = inside; rebuildPT(); } }
  renderer.toneMappingExposure = (state.night ? 1.1 : 1.0) * (state.photo ? (inside ? 2.3 : 1.25) : 1);
  if (state.photo && state.pt) {
    if (state.ptDirty) { state.ptDirty = false; state.pt.setScene(scene, camera); }
    state.pt.renderSample(); statusEl.textContent = `Photo · ${Math.floor(state.pt.samples)} samples`;
  } else composer.render();
  const w = innerWidth, h = innerHeight;
  for (const l of labels) { const on = l.group === 'room' ? state.showRooms && camera.position.y > H : l.group === 'furn' ? state.showFurn && !!l.grp : state.showDims;
    if (l.grp) { if (!l.grp.visible || !l.grp.parent) { l.el.hidden = true; continue; } l.p.copy(l.local); l.grp.localToWorld(l.p); }
    if (l.top) l.p.y = state.cutOn ? Math.min(l.top, CUT + .02) : l.top;
    if (!on) { l.el.hidden = true; continue; } v.copy(l.p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { l.el.hidden = true; continue; }
    l.el.hidden = false; l.el.style.left = ((v.x + 1) / 2 * w) + 'px'; l.el.style.top = ((1 - v.y) / 2 * h) + 'px'; }
}
build().then(() => requestAnimationFrame(tick)).catch(err => { console.error(err); loader.textContent = 'Could not build the 3D scene: ' + err.message; });
