import { CUT, H, V3, camera, controls, frame, loader, renderer, scene, state, statusEl } from './scene.js';
import { buildTextures } from './textures.js';
import { buildMaterials, textured } from './materials.js';
import { upgradeMaterials, whenIdle } from './assets.js';
import { PUBLISHED, bbox, plan, setPlan } from './plan/plan.js';
import { buildAll, refreshOverlays } from './build.js';
import { composer } from './post.js';
import { labels } from './ui/dims.js';
import { setMood } from './ui/toolbar.js';
import { setView } from './ui/views.js';
import { loadEdits } from './ui/editor.js';
import { loadStyle } from './ui/style.js';
import { rebuildPT } from './pathtracer.js';

// extent of the ceilings: the camera counts as inside (wide lens, ceiling shown) within it
const ROOF = bbox(plan.ceilings.flatMap(c => [[c.rect[0], c.rect[1]], [c.rect[2], c.rect[3]]]));

async function build() {
  await frame(); await buildTextures(); buildMaterials();
  loader.textContent = 'Building apartment…'; await frame();
  loadEdits(); loadStyle();
  try { buildAll(); } catch (err) { console.error('stored edits could not be built; using the published plan', err); setPlan(PUBLISHED); buildAll(); }
  setMood(false); setView('overview', true);
  loader.hidden = true;
  upgradeMaterials(textured); whenIdle(refreshOverlays); // scanned detail maps and models arrive after the first frame
}

window.__sceneTriangles = () => { let n = 0; scene.traverse(o => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(n); }; // budget check

/* ================= loop ================= */
const v = new V3();
function tick(now) {
  requestAnimationFrame(tick); window.__frames = (window.__frames || 0) + 1;
  if (state.anim) { const k = Math.min(1, (now - state.anim.t0) / 900), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(state.anim.from.p, state.anim.to.p, e); controls.target.lerpVectors(state.anim.from.t, state.anim.to.t, e); if (k >= 1) state.anim = null; if (state.photo && state.pt) state.pt.updateCamera(); }
  controls.update();
  const inside = camera.position.y < H - .05 && camera.position.x > ROOF[0] && camera.position.x < ROOF[2] && camera.position.z > ROOF[1] && camera.position.z < ROOF[3];
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
