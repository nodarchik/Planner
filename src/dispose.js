// Shared Three.js geometry, material and planar texture disposal helpers.
import { forgetMaterial } from './fast.js';
import { forgetPtMaterial } from './pathtracer.js';

export function disposeMaterial(m, textured) {
  if (!m || m.userData?.shared) return;
  if (m.map?.userData?.planarClone) m.map.dispose();
  if (m.emissiveMap?.userData?.planarClone) m.emissiveMap.dispose();
  if (textured) {
    for (let i = textured.length - 1; i >= 0; i--) {
      if (textured[i].material === m) textured.splice(i, 1);
    }
  }
  forgetMaterial(m);
  forgetPtMaterial(m);
  m.dispose();
}

export function disposeObject(root, textured) {
  if (!root) return;
  root.traverse(o => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) disposeMaterial(m, textured);
  });
}
