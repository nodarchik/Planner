import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DPR, MOBILE, V2, camera, renderer, scene, state } from './scene.js';

/* ================= post-processing ================= */
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 });
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
export const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: .35, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = .9;
gtao.enabled = !MOBILE; // the AO pass costs a second scene render; off on phones to hold 60 fps
composer.addPass(gtao);
export const bloom = new UnrealBloomPass(new V2(1, 1), .18, .5, .92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// while the camera moves (desktop): ratio <= 1.25, no AO, no bloom (~71 -> ~21 ms at 1080p DPR 1.75); full quality again once settled
export const lod = { on: false };
export function applyPost() { const pr = state.fast ? 1 : lod.on ? Math.min(DPR, 1.25) : DPR; // Fast: ratio 1, no AO, no bloom
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); gtao.enabled = !MOBILE && !lod.on && !state.fast; bloom.enabled = !lod.on && !state.fast; }
export function setMoving(on) { if (on === lod.on) return; lod.on = on; applyPost(); }
