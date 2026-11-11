// Build pipeline: everything in the scene comes from the plan. buildAll() after structural edits, rebuildItem() after an item edit.
import * as THREE from 'three';
import { clampables, movables, scene, state, world } from './scene.js';
import { emissives } from './materials.js';
import { nightLights } from './lighting.js';
import { plan, refreshGeom } from './plan/plan.js';
import { buildArchitecture } from './arch/shell.js';
import { buildItem, buildItems, itemGroups, itemObjects } from './items/index.js';
import { applyLook } from './ui/style.js';
import { applyCut } from './ui/toolbar.js';
import { clearOverlays, furnitureLabels, setupOverlays } from './ui/dims.js';
import { renderPlanNotes } from './ui/panels.js';
import { rebuildPT } from './pathtracer.js';

let baseEmissives = -1;
const inScene = o => { for (; o; o = o.parent) if (o === scene) return true; return false; };
function prune() { // forget meshes and lights that are no longer in the scene
  for (let i = clampables.length - 1; i >= 0; i--) if (!inScene(clampables[i].me)) clampables.splice(i, 1);
  for (let i = nightLights.length - 1; i >= 0; i--) if (!inScene(nightLights[i])) nightLights.splice(i, 1);
  for (let i = movables.length - 1; i >= 0; i--) if (!inScene(movables[i])) movables.splice(i, 1);
}
function finish(root) {
  emissives.forEach(m => m.emissiveIntensity = state.night ? m.userData.night : m.userData.day);
  world.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh && !o.userData.clamp && o.userData.minY === undefined) { const bb = new THREE.Box3().setFromObject(o); o.userData.minY = bb.min.y; o.userData.maxY = bb.max.y; } });
  scene.traverse(o => { if (o.isPointLight) o.visible = state.night; });
  if (state.cutOn) applyCut(true);
}
function dress(it) { // per-item look and resize factors [x, height, y] stored in the plan
  for (const g of itemGroups.get(it.id) || []) { applyLook(g, it.look);
    if (it.resize) { g.scale.set(...it.resize); g.position.y = g.userData.minY0 * (1 - it.resize[1]); } }
}
export function buildAll() {
  if (baseEmissives < 0) baseEmissives = emissives.length; else emissives.length = baseEmissives;
  nightLights.forEach(l => l.parent && l.parent.remove(l)); world.clear(); clampables.length = 0; movables.length = 0; nightLights.length = 0;
  refreshGeom();
  state.ceiling = buildArchitecture(); state.lastCeil = null; buildItems(); plan.items.forEach(dress);
  finish(world); clearOverlays(); setupOverlays(); furnitureLabels(); renderPlanNotes(); rebuildPT();
}
export function refreshOverlays() { clearOverlays(); setupOverlays(); furnitureLabels(); }
export function removeItemObjects(id) { for (const o of itemObjects.get(id) || []) o.parent && o.parent.remove(o); itemObjects.delete(id); itemGroups.delete(id); prune(); }
export function rebuildItem(id, quiet) {
  removeItemObjects(id); const it = plan.items.find(i => i.id === id); if (!it) return [];
  const groups = buildItem(it); dress(it); finish(world);
  if (!quiet) { clearOverlays(); setupOverlays(); furnitureLabels(); renderPlanNotes(); rebuildPT(); }
  return groups;
}
