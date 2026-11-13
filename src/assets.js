// External assets: CC0 models (Draco GLB) and scanned detail maps. Everything has a procedural fallback, so the app works while they load or if they fail.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { rebuildPT } from './pathtracer.js';
import { markShadows } from './scene.js';

const BASE = import.meta.env.BASE_URL;
const OFF = !!import.meta.env.VITE_NO_ASSETS; // single-file build: no external files, procedural fallbacks only
let pending = 0; const idle = [];
window.__assetsReady = true; // read by tools/shot.py
const begin = () => { pending++; window.__assetsReady = false; };
const end = () => { if (--pending === 0) { window.__assetsReady = true; rebuildPT(); idle.splice(0).forEach(f => f()); } };
export const whenIdle = fn => (pending ? idle.push(fn) : fn());

// natural size in metres [width, depth, height] and the yaw that turns the model's front to the catalog front (−y in plan)
export const MODELS = {
  modern_coffee_table_01: { name: 'Modern coffee table', size: [1.2, .6, .39] },
  modern_arm_chair_01: { name: 'Modern armchair', size: [.82, .99, 1.02] },
  potted_plant_01: { name: 'Potted plant, tall', size: [.59, .64, 1.35] },
  potted_plant_02: { name: 'Potted plant, bushy', size: [.7, .66, .84] },
  potted_plant_04: { name: 'Succulent', size: [.17, .19, .27] },
  side_table_01: { name: 'Side table', size: [.55, .45, .55] },
  dining_chair_02: { name: 'Dining chair', size: [.43, .58, .97] },
  bar_chair_round_01: { name: 'Bar chair', size: [.48, .49, .75] },
  ceramic_vase_01: { name: 'Ceramic vase', size: [.2, .21, .4] },
  ceramic_vase_03: { name: 'Ceramic vase, slim', size: [.11, .11, .41] },
  book_encyclopedia_set_01: { name: 'Book set', size: [.55, .16, .24] },
  wooden_bowl_01: { name: 'Wooden bowl', size: [.31, .31, .09] },
  modern_ceiling_lamp_01: { name: 'Ceiling lamp', size: [.43, .43, .95] }
};
const draco = new DRACOLoader().setDecoderPath(BASE + 'draco/'), gltf = new GLTFLoader().setDRACOLoader(draco), cache = new Map();
function template(id) { if (OFF) return Promise.reject(new Error('assets are disabled in this build')); if (!cache.has(id)) { begin(); cache.set(id, gltf.loadAsync(`${BASE}assets/models/${id}.glb`).then(g => g.scene).finally(end)); } return cache.get(id); }
// a fresh instance standing on y = 0, centred on its footprint, front towards −z; width (m) rescales it uniformly
export async function instance(id, width) {
  const src = await template(id), obj = src.clone(true), box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), wrap = new THREE.Group();
  obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); wrap.add(obj); wrap.rotation.y = Math.PI;
  const k = width ? width / (box.max.x - box.min.x) : 1, out = new THREE.Group(); wrap.scale.setScalar(k); out.add(wrap);
  out.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return out;
}
// replace the placeholder content of a group with a model once it has loaded; the group keeps its position, rotation and name
export function swapIn(g, id, opts = {}) {
  instance(id, opts.width).then(obj => { if (!g.parent) return; // the item was rebuilt or deleted meanwhile
    g.clear(); if (opts.pos) g.position.set(opts.pos[0], 0, opts.pos[1]); obj.position.y = opts.h || 0; g.add(obj); g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj); g.userData.size = bb.getSize(new THREE.Vector3()); g.userData.minY0 = bb.min.y; g.userData.model = id;
    g.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); o.userData.minY = b.min.y; o.userData.maxY = b.max.y; } });
    markShadows(); window.dispatchEvent(new CustomEvent('modelswap', { detail: g })); }).catch(err => { if (!OFF) console.warn(`model ${id} not loaded; keeping the placeholder`, err); });
}
// scanned normal + roughness maps for the procedural texture sets (sizes in metres per tile)
const SCANS = { plaster: 1.0, boucle: .31, linen: .27, velvet: .28, micro: 2.0, wood: 1.83 };
export function upgradeMaterials(registry) { if (OFF) return; const tl = new THREE.TextureLoader();
  for (const [set, size] of Object.entries(SCANS)) { const mats = registry.filter(r => r.set === set).map(r => r.material); if (!mats.length) continue;
    for (const [file, slot] of [['nor', 'normalMap'], ['rough', 'roughnessMap']]) { begin();
      tl.load(`${BASE}assets/textures/${set}_${file}.webp`, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / size, 1 / size); t.anisotropy = 4;
        mats.forEach(m => { m[slot] = t; m.needsUpdate = true; }); end(); }, undefined, () => { console.warn(`scan ${set}_${file} not loaded; keeping the procedural map`); end(); }); } }
}
export function loadSkyHDR() { if (OFF) return Promise.reject(new Error('assets are disabled in this build')); begin(); return new RGBELoader().loadAsync(`${BASE}assets/hdri/sky_2k.hdr`).finally(end); }
