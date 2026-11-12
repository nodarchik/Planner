import * as THREE from 'three';
import { plan } from './plan/plan.js';
import { MOBILE, V3, scene, state, world } from './scene.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { isWindowless, kelvin, kindOf, pointCd, stripNits } from './lights.js';

/* ================= sun position ================= */
// Solar azimuth (degrees clockwise from true north) and elevation for a site, day of year and local clock hour (NOAA approximation).
export function solar({ lat, lon, tz }, doy, hour) {
  const R = Math.PI / 180, g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((hour * 60 + eot + 4 * lon - 60 * tz) / 4 - 180) * R, la = lat * R;
  const el = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) + Math.PI;
  return { az: ((az / R) % 360 + 360) % 360, el: el / R };
}
const DOY = [15, 46, 75, 105, 135, 172, 196, 227, 264, 288, 319, 355]; // mid-month, solstices and September equinox on their day
// world direction towards the sun; meta.north = compass bearing of plan north (−y), 0 until the building orientation is measured
export function sunDirection(month, hour) { const { az, el } = solar(plan.meta.site, DOY[month - 1], hour), t = (az - (plan.meta.north || 0)) * Math.PI / 180, e = el * Math.PI / 180;
  return { az, el, dir: new V3(Math.sin(t) * Math.cos(e), Math.sin(e), -Math.cos(t) * Math.cos(e)) }; }

/* ================= sky (equirectangular, shared by raster + path tracer) ================= */
const SUN_DIR = new V3(0, 1, 0);
function makeSky(night) {
  const W = 512, Hh = 256, data = new Float32Array(W * Hh * 4), up = Math.max(0, Math.min(1, SUN_DIR.y * 4)); // sun glow fades out at the horizon
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const u = (i + .5) / W, v = (j + .5) / Hh, phi = (u - .5) * 2 * Math.PI, e = (v - .5) * Math.PI;
    const d = new V3(Math.cos(phi) * Math.cos(e), Math.sin(e), Math.sin(phi) * Math.cos(e));
    let r, g, b;
    if (!night) {
      if (e > 0) { const t = Math.pow(e / (Math.PI / 2), .45);
        r = 1.15 * (1 - t) + .42 * t; g = 1.12 * (1 - t) + .56 * t; b = 1.06 * (1 - t) + .82 * t;
        const s = Math.max(0, d.dot(SUN_DIR)) * (up > 0 ? 1 : 0); r += up * (4.0 * Math.pow(s, 300) + .35 * Math.pow(s, 10)); g += up * (3.6 * Math.pow(s, 300) + .28 * Math.pow(s, 10)); b += up * (3.0 * Math.pow(s, 300) + .18 * Math.pow(s, 10));
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

/* ================= lights ================= */
export const sun = new THREE.DirectionalLight(0xfff1de, 3.2);
const TARGET = new V3(...plan.meta.sunTarget);
sun.target.position.copy(TARGET);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 5, far: 50 });
scene.add(sun, sun.target);

// SKY.day lights the rooms (procedural, tuned for the interiors, sun at the computed position). SKY.back is what is seen outside:
// the scanned HDRI turned so its sun sits at the computed azimuth, or the procedural sky until it has loaded.
export const SKY = { day: null, back: null, night: makeSky(true), sunUp: true, info: null };
let hdr = null; // { data: Uint16Array (half floats, exposure-matched, sun clamped), w, h, sunCol }
export function useHDRI(tex) { const src = tex.image.data, w = tex.image.width, h = tex.image.height, f = THREE.DataUtils, lum = new Float32Array(w * h); let sum = 0, n = 0, best = -1, sunCol = 0;
  for (let i = 0; i < w * h; i++) { const l = .2126 * f.fromHalfFloat(src[i * 4]) + .7152 * f.fromHalfFloat(src[i * 4 + 1]) + .0722 * f.fromHalfFloat(src[i * 4 + 2]); lum[i] = l; if (l > best) { best = l; sunCol = i % w; } }
  const rows = tex.flipY ? [h / 2, h] : [0, h / 2]; // upper hemisphere
  for (let j = rows[0]; j < rows[1]; j++) for (let i = 0; i < w; i += 4) { sum += Math.min(lum[j * w + i], 20); n++; }
  const k = .95 / (sum / n), cap = 6, data = new Uint16Array(src.length); // exposure close to the procedural sky; the sun disc is clamped
  for (let i = 0; i < w * h; i++) { for (let c = 0; c < 3; c++) data[i * 4 + c] = f.toHalfFloat(Math.min(cap, f.fromHalfFloat(src[i * 4 + c]) * k)); data[i * 4 + 3] = src[i * 4 + 3]; }
  hdr = { data, w, h, sunCol, flipY: tex.flipY }; }
export function setSun(month, hour) {
  const s = sunDirection(month, hour), up = s.el > 0; SKY.info = s; SKY.sunUp = up; SUN_DIR.copy(up ? s.dir : new V3(s.dir.x, .001, s.dir.z).normalize());
  sun.position.copy(TARGET).addScaledVector(SUN_DIR, 25); const k = Math.max(0, Math.min(1, Math.sin(s.el * Math.PI / 180) * 2.6));
  sun.intensity = 3.2 * k; sun.color.setRGB(1, .86 + .085 * k, .62 + .25 * k);
  const old = [SKY.day, SKY.back]; SKY.day = makeSky(false); SKY.back = SKY.day;
  if (hdr && up) { const { data, w, h, sunCol } = hdr, phi = Math.atan2(SUN_DIR.z, SUN_DIR.x), col = Math.round((phi / (2 * Math.PI) + .5) * w), sh = ((col - sunCol) % w + w) % w, out = new Uint16Array(data.length);
    for (let j = 0; j < h; j++) { const r = j * w * 4; out.set(data.subarray(r, r + (w - sh) * 4), r + sh * 4); out.set(data.subarray(r + (w - sh) * 4, r + w * 4), r); }
    const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType); t.flipY = hdr.flipY; t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.LinearSRGBColorSpace; t.needsUpdate = true; SKY.back = t; }
  old.forEach(t => t && t.dispose());
  return s;
}
export const nightLights = [];
// lamp(x, y, h, kind | { lm, k }, n = 1): kind from meta.lights.kinds, n multiplies the lumens (fixtures or metres of strip)
export function lamp(x, y, h, spec, n = 1) {
  const { lm, k } = typeof spec === 'string' ? kindOf(spec) : spec, l = new THREE.PointLight(kelvin(k || 2700), pointCd(lm * n), 0, 2);
  l.position.set(x, h, y); l.visible = false; l.userData.lm = lm * n; (state.CUR === world ? scene : state.CUR).add(l); nightLights.push(l); return l;
}
// LED cove as an area light (Photo night only; the raster view keeps the emissive tube): a straight strip from (x1, y1) to (x2, y2) at height h facing down
export const coveLights = []; let rectInit = false;
export function coveLight(x1, y1, x2, y2, h) {
  if (!rectInit) { RectAreaLightUniformsLib.init(); rectInit = true; }
  const len = Math.hypot(x2 - x1, y2 - y1), { lm, k } = kindOf('coveStrip'), W = .05, l = new THREE.RectAreaLight(kelvin(k || 3000), stripNits(lm * len, len * W), len, W);
  const ex = new V3((x2 - x1) / len, 0, (y2 - y1) / len), up = new V3(0, 1, 0);
  l.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up.clone().cross(ex), up));
  l.position.set((x1 + x2) / 2, h, (y1 + y2) / 2); l.visible = false; scene.add(l); coveLights.push(l); return l; }
// lamps are on at night, and by day in Photo renders for rooms without daylight
const wp = new V3();
// Photo by day is exposed for window light (x6), so these lamps are scaled down to match what the night exposure shows
const DAY_LAMP = .2;
export function syncLights() { for (const l of nightLights) { l.getWorldPosition(wp); l.visible = state.night || (state.photo && isWindowless(wp.x, wp.z));
  l.intensity = pointCd(l.userData.lm) * (state.night || !state.photo ? 1 : DAY_LAMP); }
  for (const l of coveLights) l.visible = state.night && state.photo; }
