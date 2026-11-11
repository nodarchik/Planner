import * as THREE from 'three';
import { plan } from './plan/plan.js';
import { MOBILE, V3, scene, state, world } from './scene.js';

/* ================= sky (equirectangular, shared by raster + path tracer) ================= */
const SUN_DIR = new V3(-0.78, 0.48, 0.34).normalize();
function makeSky(night) {
  const W = 512, Hh = 256, data = new Float32Array(W * Hh * 4);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const u = (i + .5) / W, v = (j + .5) / Hh, phi = (u - .5) * 2 * Math.PI, e = (v - .5) * Math.PI;
    const d = new V3(Math.cos(phi) * Math.cos(e), Math.sin(e), Math.sin(phi) * Math.cos(e));
    let r, g, b;
    if (!night) {
      if (e > 0) { const t = Math.pow(e / (Math.PI / 2), .45);
        r = 1.15 * (1 - t) + .42 * t; g = 1.12 * (1 - t) + .56 * t; b = 1.06 * (1 - t) + .82 * t;
        const s = Math.max(0, d.dot(SUN_DIR)); r += 4.0 * Math.pow(s, 300) + .35 * Math.pow(s, 10); g += 3.6 * Math.pow(s, 300) + .28 * Math.pow(s, 10); b += 3.0 * Math.pow(s, 300) + .18 * Math.pow(s, 10);
      } else { const t = Math.min(1, -e * 6); r = 1.1 * (1 - t) + .42 * t; g = 1.07 * (1 - t) + .39 * t; b = 1.02 * (1 - t) + .35 * t; }
    } else {
      if (e > 0) { const t = Math.pow(e / (Math.PI / 2), .5); r = .045 * (1 - t) + .006 * t; g = .04 * (1 - t) + .009 * t; b = .045 * (1 - t) + .02 * t; }
      else { const t = Math.min(1, -e * 6); r = .04 * (1 - t) + .01 * t; g = .035 * (1 - t) + .009 * t; b = .03 * (1 - t) + .008 * t; }
    }
    const k = (j * W + i) * 4; data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 1;
  }
  const t = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export const skyDay = makeSky(false), skyNight = makeSky(true);

/* ================= lights ================= */
export const sun = new THREE.DirectionalLight(0xfff1de, 3.2);
const TARGET = new V3(...plan.meta.sunTarget);
sun.position.copy(TARGET).addScaledVector(SUN_DIR, 25);
sun.target.position.copy(TARGET);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 5, far: 50 });
scene.add(sun, sun.target);
export const nightLights = [];
export function lamp(x, y, h, color = 0xffd2a0, intensity = 6, dist = 0) {
  const l = new THREE.PointLight(color, intensity * .4, dist, 2); l.position.set(x, h, y); l.visible = false; (state.CUR === world ? scene : state.CUR).add(l); nightLights.push(l); return l;
}
