import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// r160 scenes lack the rotation fields the path tracer reads
if (!('backgroundRotation' in THREE.Scene.prototype)) { THREE.Scene.prototype.backgroundRotation = new THREE.Euler(); THREE.Scene.prototype.environmentRotation = new THREE.Euler(); }
const H = 2.8, CUT = 1.2;
const V2 = THREE.Vector2, V3 = THREE.Vector3;
const statusEl = document.getElementById('status');
const loader = document.getElementById('loader');
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ================= renderer ================= */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const MOBILE = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
const DPR = Math.min(devicePixelRatio, MOBILE ? 1.3 : 1.75);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

/* ================= procedural noise ================= */
let SEED = 11;
const rand = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };
function vnoise(nx, ny = nx) {
  const g = new Float32Array(nx * ny); for (let i = 0; i < g.length; i++) g[i] = rand();
  return (u, v) => {
    const x = u * nx, y = v * ny, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % nx) + nx) % nx, y0 = ((yi % ny) + ny) % ny, x1 = (x0 + 1) % nx, y1 = (y0 + 1) % ny;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = g[y0 * nx + x0], b = g[y0 * nx + x1], c = g[y1 * nx + x0], d = g[y1 * nx + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(list) { const ns = list.map(o => Array.isArray(o) ? vnoise(o[0], o[1]) : vnoise(o));
  return (u, v) => { let s = 0, a = 1, t = 0; for (const f of ns) { s += f(u, v) * a; t += a; a *= .55; } return s / t; }; }

// builds color / normal / roughness textures from a per-pixel function
function makeSet(size, strength, fn) {
  const N = size * size, col = new Uint8ClampedArray(N * 4), rgh = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), nrm = new Uint8ClampedArray(N * 4);
  const o = [0, 0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn((x + .5) / size, (y + .5) / size, o); const i = y * size + x, j = i * 4;
    col[j] = o[0]; col[j + 1] = o[1]; col[j + 2] = o[2]; col[j + 3] = 255;
    hgt[i] = o[3]; const r = Math.max(0, Math.min(255, o[4] * 255));
    rgh[j] = r; rgh[j + 1] = r; rgh[j + 2] = r; rgh[j + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = hgt[y * size + (x - 1 + size) % size], r = hgt[y * size + (x + 1) % size];
    const u = hgt[((y - 1 + size) % size) * size + x], d = hgt[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1; const len = Math.hypot(nx, ny, nz);
    const j = (y * size + x) * 4; nrm[j] = (nx / len * .5 + .5) * 255; nrm[j + 1] = (ny / len * .5 + .5) * 255; nrm[j + 2] = (nz / len * .5 + .5) * 255; nrm[j + 3] = 255;
  }
  const tex = (data, srgb) => { const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rgh, false) };
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const SETS = {};
async function buildTextures() {
  // European oak planks, 8 per tile, staggered joints
  { const grain = vnoise(96, 3), fine = fbm([[256, 16], [512, 32]]), knots = vnoise(24, 6); const off = [], tone = [];
    for (let i = 0; i < 8; i++) off.push(rand()); for (let i = 0; i < 16; i++) tone.push(rand());
    SETS.oak = makeSet(1024, 6, (u, v, o) => {
      const c = Math.floor(u * 8), lu = u * 8 - c, vv = (v + off[c]) % 1, p = Math.floor(vv * 2), lv = vv * 2 - p, id = c * 2 + p;
      const g = grain((u + id * .13) % 1, vv), f = fine(u, (vv + id * .31) % 1), k = Math.pow(knots((u + id * .07) % 1, vv), 6);
      const t = .86 + .26 * tone[id], s = (.82 + .3 * g + .12 * f) * t - k * .35;
      const gap = lu < .006 || lu > .994 || lv < .003 || lv > .997;
      o[0] = gap ? 70 : 201 * s; o[1] = gap ? 52 : 163 * s; o[2] = gap ? 36 : 120 * s;
      o[3] = gap ? -1 : (g * .35 + f * .25); o[4] = gap ? .9 : .42 + .25 * (1 - g);
    }); }
  await frame();
  // honed travertine with banding and pores
  { const band = fbm([[3, 40], [6, 90]]), warp = fbm([4, 8]), pore = vnoise(220, 90), pore2 = vnoise(400, 160), tint = fbm([5, 10]);
    SETS.trav = makeSet(1024, 5, (u, v, o) => {
      const b = band(u, (v + warp(u, v) * .08) % 1), p = Math.max(0, pore(u, v) - .78) * 4 + Math.max(0, pore2(u, v) - .86) * 5, t = tint(u, v);
      const s = .86 + .2 * b;
      o[0] = (236 - 30 * p) * s + 8 * t; o[1] = (222 - 34 * p) * s; o[2] = (201 - 40 * p) * s - 6 * t;
      o[3] = -p * .9 + b * .1; o[4] = .34 + p * .5;
    }); }
  await frame();
  // Rosso Levanto polished marble
  { const f1 = fbm([3, 6, 12, 24]), f2 = fbm([5, 10, 20, 40, 80]), cloud = fbm([2, 4, 8]);
    SETS.marble = makeSet(1024, 1, (u, v, o) => {
      const w = Math.sin(2 * Math.PI * (u * 2 + v * 1) + 7 * f1(u, v)), w2 = Math.sin(2 * Math.PI * (u * 3 - v * 2) + 9 * f2(u, v));
      const vein = Math.pow(1 - Math.abs(w), 24) + .45 * Math.pow(1 - Math.abs(w2), 40) + .15 * Math.pow(1 - Math.abs(w2), 6);
      const c = cloud(u, v), k = clamp01(vein);
      o[0] = (118 + 50 * c) * (1 - k) + 226 * k; o[1] = (38 + 16 * c) * (1 - k) + 206 * k; o[2] = (32 + 12 * c) * (1 - k) + 194 * k;
      o[3] = 0; o[4] = .07 + .05 * c;
    }); }
  await frame();
  // fine plaster / paint
  { const f = fbm([16, 32, 64, 128, 256]), b = fbm([4, 8]);
    SETS.plaster = makeSet(512, 2.5, (u, v, o) => { const n = f(u, v), m = b(u, v); const s = .975 + .03 * m;
      o[0] = 244 * s; o[1] = 239 * s; o[2] = 232 * s; o[3] = n; o[4] = .88 + .08 * n; }); }
  // microcement
  { const f = fbm([3, 6, 12, 24, 48]), g = fbm([64, 128, 256]);
    SETS.micro = makeSet(512, 3, (u, v, o) => { const n = f(u, v), m = g(u, v); const s = .86 + .2 * n;
      o[0] = 214 * s; o[1] = 203 * s; o[2] = 190 * s; o[3] = m * .6 + n * .4; o[4] = .55 + .3 * m; }); }
  await frame();
  // bouclé (looped yarn) – neutral, tinted by material color
  { const a = vnoise(110), b = vnoise(55), c = vnoise(220);
    SETS.boucle = makeSet(512, 9, (u, v, o) => { const h = Math.sqrt(Math.abs(a(u, v) - .5) * 2) * .55 + b(u, v) * .3 + c(u, v) * .15; const s = .78 + .22 * h;
      o[0] = o[1] = o[2] = 255 * s; o[3] = h; o[4] = 1; }); }
  // linen weave
  { const slub = vnoise(6, 300), slub2 = vnoise(300, 6), fz = vnoise(256);
    SETS.linen = makeSet(512, 5, (u, v, o) => { const n = 96, cu = Math.floor(u * n), cv = Math.floor(v * n);
      const wu = .5 + .5 * Math.sin(Math.PI * (u * n - cu)), wv = .5 + .5 * Math.sin(Math.PI * (v * n - cv));
      const over = (cu + cv) % 2 === 0, h = (over ? wu : wv) * (.8 + .4 * (over ? slub(u, v) : slub2(u, v))) + fz(u, v) * .15;
      const s = .86 + .14 * h; o[0] = o[1] = o[2] = 255 * s; o[3] = h; o[4] = .92; }); }
  await frame();
  // velvet pile
  { const f = fbm([128, 256]), w = fbm([[4, 16], [8, 32]]);
    SETS.velvet = makeSet(512, 2, (u, v, o) => { const n = f(u, v), m = w(u, v); const s = .9 + .1 * m;
      o[0] = o[1] = o[2] = 255 * s; o[3] = n; o[4] = .75 + .2 * n; }); }
  // generic wood grain (tinted by material color)
  { const g = vnoise(64, 3), r = fbm([[6, 1], [12, 2]]), fine = fbm([[256, 12]]);
    SETS.wood = makeSet(512, 3, (u, v, o) => { const ring = .5 + .5 * Math.sin(2 * Math.PI * (u * 9 + 3.5 * r(u, v))); const gg = g(u, v), f = fine(u, v);
      const s = .72 + .16 * ring + .1 * gg + .06 * f; o[0] = o[1] = o[2] = 255 * s; o[3] = ring * .4 + f * .3; o[4] = .38 + .22 * (1 - ring); }); }
  await frame();
  // thermo-ash decking
  { const grain = vnoise(80, 3), fine = fbm([[256, 10]]), tone = []; for (let i = 0; i < 10; i++) tone.push(rand());
    SETS.deck = makeSet(1024, 6, (u, v, o) => { const c = Math.floor(u * 10), lu = u * 10 - c; const gap = lu < .025 || lu > .975;
      const g = grain((u + c * .17) % 1, v), f = fine(u, (v + c * .23) % 1), s = (.8 + .25 * g + .1 * f) * (.85 + .3 * tone[c]);
      o[0] = gap ? 30 : 128 * s; o[1] = gap ? 24 : 98 * s; o[2] = gap ? 20 : 74 * s; o[3] = gap ? -1.5 : g * .4; o[4] = gap ? 1 : .6 + .2 * g; }); }
  // wool rug
  // light oak chevron (Hungarian point): 4 columns per tile, 45° planks meeting on each column's centre line
  { const grain = vnoise(96, 3), fine = fbm([[256, 16], [512, 32]]), tone = []; for (let i = 0; i < 96; i++) tone.push(rand());
    const PW = 4 / 14;
    SETS.chevron = makeSet(1024, 6, (u, v, o) => {
      const x = u * 4, c = Math.floor(x), lx = x - c, d = Math.abs(lx - .5), q = (v * 4 + d) / PW, id = Math.floor(q), across = q - id;
      const along = (((v * 4 - d) * .25) % 1 + 1) % 1, pid = (id + c * 37) % 96;
      const g = grain(((across * .3 + pid * .173) % 1 + 1) % 1, along), f = fine(((across * .5 + pid * .29) % 1 + 1) % 1, (along * 2) % 1);
      const t = .9 + .18 * tone[pid], sh = (.86 + .22 * g + .1 * f) * t;
      const gap = across < .012 || across > .988 || d < .004 || lx < .004 || lx > .996;
      o[0] = gap ? 120 : 214 * sh; o[1] = gap ? 96 : 182 * sh; o[2] = gap ? 72 : 140 * sh;
      o[3] = gap ? -1 : (g * .3 + f * .25); o[4] = gap ? .9 : .5 + .2 * (1 - g);
    }); }
  { const a = vnoise(90), b = vnoise(180), c = fbm([4, 8]);
    SETS.wool = makeSet(512, 7, (u, v, o) => { const h = a(u, v) * .6 + b(u, v) * .4, m = c(u, v); const s = .82 + .14 * h + .06 * m;
      o[0] = o[1] = o[2] = 255 * s; o[3] = h; o[4] = 1; }); }
  await frame();
}
const texCache = {};
function texFor(set, tile) {
  const k = set + '@' + tile; if (texCache[k]) return texCache[k];
  const s = SETS[set], r = {};
  for (const n of ['map', 'normalMap', 'roughnessMap']) { const t = s[n].clone(); t.repeat.set(1 / tile, 1 / tile); t.needsUpdate = true; r[n] = t; }
  return (texCache[k] = r);
}

/* ================= canvas images: TV, art, hob ================= */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const tvTex = canvasTex(1280, 720, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h * .7); sky.addColorStop(0, '#2b3a6b'); sky.addColorStop(.45, '#c96b5a'); sky.addColorStop(1, '#f5b77a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,224,170,.95)'; g.beginPath(); g.arc(w * .62, h * .56, h * .07, 0, 7); g.fill();
  const layers = [['#b45a3c', .58], ['#8a3f2e', .66], ['#5e2b26', .76], ['#38191a', .88]];
  layers.forEach(([c, y], i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * y + Math.sin(x / w * (3 + i) * Math.PI + i) * h * .04 + Math.sin(x / w * 11 + i * 2) * h * .012);
    g.lineTo(w, h); g.fill(); });
});
const art1Tex = canvasTex(700, 1000, (g, w, h) => {
  g.fillStyle = '#efe6d8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c1623d'; g.beginPath(); g.moveTo(w * .18, h * .86); g.lineTo(w * .18, h * .45); g.arc(w * .5, h * .45, w * .32, Math.PI, 0); g.lineTo(w * .82, h * .86); g.fill();
  g.fillStyle = '#8c9a7e'; g.beginPath(); g.arc(w * .66, h * .3, w * .14, 0, 7); g.fill();
  g.fillStyle = '#4a2e22'; g.fillRect(w * .18, h * .86, w * .64, h * .012);
  g.strokeStyle = '#4a2e22'; g.lineWidth = 3; g.beginPath(); g.arc(w * .5, h * .45, w * .2, Math.PI, 0); g.stroke();
});
const art2Tex = canvasTex(1000, 700, (g, w, h) => {
  g.fillStyle = '#e9dccb'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d99a4e'; g.beginPath(); g.arc(w * .35, h * .42, h * .18, 0, 7); g.fill();
  [['#a5683f', .62], ['#7d8b6d', .74], ['#4a3a2c', .86]].forEach(([c, y], i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, h * y + Math.sin(x / w * Math.PI * (1.5 + i * .5) + i) * h * .06); g.lineTo(w, h); g.fill(); });
});
const hobTex = canvasTex(700, 400, (g, w, h) => {
  g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3;
  [[.25, .3, .2], [.25, .72, .14], [.72, .3, .14], [.72, .7, .2]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x * w, y * h, r * h, 0, 7); g.stroke(); });
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * (.38 + i * .045), h * .93, 3, 0, 7); g.fill(); }
});
function planar(tex, u0, v0, w, h, flipU = false) { const t = tex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (flipU) { t.repeat.set(-1 / w, 1 / h); t.offset.set((u0 + w) / w, -v0 / h); } else { t.repeat.set(1 / w, 1 / h); t.offset.set(-u0 / w, -v0 / h); } return t; }

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
const skyDay = makeSky(false), skyNight = makeSky(true);

/* ================= lights ================= */
const sun = new THREE.DirectionalLight(0xfff1de, 3.2);
const TARGET = new V3(7.0, 0, 3.8);
sun.position.copy(TARGET).addScaledVector(SUN_DIR, 25);
sun.target.position.copy(TARGET);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 5, far: 50 });
scene.add(sun, sun.target);
const nightLights = [];
function lamp(x, y, h, color = 0xffd2a0, intensity = 6, dist = 0) {
  const l = new THREE.PointLight(color, intensity * .4, dist, 2); l.position.set(x, h, y); l.visible = false; (CUR === world ? scene : CUR).add(l); nightLights.push(l); return l;
}

/* ================= materials ================= */
const emissives = [];
function P(o) { const ni = o.nightIntensity; delete o.nightIntensity;
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ roughness: .8, metalness: 0 }, o));
  if (o.emissive !== undefined) { m.userData.night = ni ?? 3; m.userData.day = o.emissiveIntensity ?? 0; emissives.push(m); }
  return m; }
function T(set, tile, o = {}) { const t = texFor(set, tile); const ns = o.normalScale ?? 1; delete o.normalScale;
  return P(Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, normalScale: new V2(ns, ns) }, o)); }
let M = {};
function buildMaterials() {
  M = {
    wall: T('plaster', 2, { normalScale: .35 }),
    ceiling: T('plaster', 2, { normalScale: .2 }),
    skirting: P({ color: 0xefe8df, roughness: .45 }),
    oakFloor: T('oak', 1.6, { normalScale: .6 }),
    chevron: T('chevron', 2.4, { normalScale: .5, clearcoat: .25, clearcoatRoughness: .5 }),
    plasterArt: T('plaster', .6, { color: 0xf1e8db, normalScale: 4 }),
    blush: P({ color: 0xf2b8bf, roughness: .7, sheen: .5, sheenColor: 0xffe0e4 }),
    trav: T('trav', 1.2, { normalScale: .5 }),
    travSmall: T('trav', .8, { normalScale: .5 }),
    marble: T('marble', 1.4, { clearcoat: .7, clearcoatRoughness: .06 }),
    micro: T('micro', 2.4, { normalScale: .4 }),
    concrete: T('micro', 3, { color: 0xd8d2c8, normalScale: .6 }),
    deck: T('deck', 2.0, { normalScale: .8 }),
    boucle: T('boucle', .16, { color: 0xf0e9de, sheen: 1, sheenColor: 0xffffff, sheenRoughness: .7, normalScale: 1.4 }),
    boucleOat: T('boucle', .16, { color: 0xd9ccb8, sheen: 1, sheenColor: 0xfff4e4, sheenRoughness: .7, normalScale: 1.4 }),
    linenWhite: T('linen', .1, { color: 0xf5f2ec, sheen: .6, sheenColor: 0xffffff, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenSand: T('linen', .1, { color: 0xdcc3a0, sheen: .6, sheenColor: 0xfff1dc, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenSage: T('linen', .1, { color: 0x9da88c, sheen: .6, sheenColor: 0xe6f0d6, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenOut: T('linen', .14, { color: 0xe6ddcf, sheen: .4, sheenRoughness: .6 }),
    velvetTerra: T('velvet', .25, { color: 0xae4f2c, sheen: 1, sheenColor: 0xff9e74, sheenRoughness: .32, normalScale: .5 }),
    velvetSage: T('velvet', .25, { color: 0x75845f, sheen: 1, sheenColor: 0xcfe0b4, sheenRoughness: .32, normalScale: .5 }),
    velvetToffee: T('velvet', .25, { color: 0x94562f, sheen: 1, sheenColor: 0xffc08a, sheenRoughness: .32, normalScale: .5 }),
    velvetChoco: T('velvet', .25, { color: 0x4b2d22, sheen: 1, sheenColor: 0xb07a5c, sheenRoughness: .35, normalScale: .5 }),
    walnut: T('wood', .7, { color: 0x7a5236 }),
    oakFurn: T('wood', .7, { color: 0xd2a676 }),
    lacquerCream: P({ color: 0xe8dfd2, roughness: .32, clearcoat: 1, clearcoatRoughness: .1 }),
    lacquerChoco: P({ color: 0x4a2f24, roughness: .38, clearcoat: 1, clearcoatRoughness: .08 }),
    carcass: P({ color: 0x1d1916, roughness: .8 }),
    brass: P({ color: 0xd8b273, metalness: 1, roughness: .26 }),
    steel: P({ color: 0xcfcfcf, metalness: 1, roughness: .3 }),
    steelDark: P({ color: 0x8c8c8c, metalness: 1, roughness: .38 }),
    blackMetal: P({ color: 0x1a1918, metalness: .7, roughness: .45 }),
    frame: P({ color: 0x302c28, metalness: .6, roughness: .42 }),
    glass: P({ color: 0xffffff, roughness: 0, transmission: 1, thickness: .008, ior: 1.5, specularIntensity: 1 }),
    glassRail: P({ color: 0xe2ecea, roughness: .02, transmission: 1, thickness: .012, ior: 1.5 }),
    glassTint: P({ color: 0xdfe6df, roughness: .03, transmission: 1, thickness: .012, ior: 1.5 }),
    opal: P({ color: 0xfff8ef, roughness: .45, transmission: .55, thickness: .02, emissive: 0xffd6a2, emissiveIntensity: 0, nightIntensity: 2.2 }),
    ceramic: P({ color: 0xf6f3ee, roughness: .14, clearcoat: .6, clearcoatRoughness: .05 }),
    stoneware: T('micro', .4, { color: 0xd7cbbd, normalScale: .8 }),
    stonewareDark: T('micro', .4, { color: 0x6b5a4d, normalScale: .8 }),
    resin: P({ color: 0xf4f2ee, roughness: .28, clearcoat: .4, clearcoatRoughness: .2 }),
    water: P({ color: 0xd8eef0, roughness: .02, transmission: 1, thickness: .2, ior: 1.33 }),
    mirror: P({ color: 0xf2f2f2, metalness: 1, roughness: .015 }),
    blackGlass: P({ color: 0x08080a, roughness: .06, clearcoat: 1, clearcoatRoughness: .02 }),
    screen: P({ color: 0x050506, roughness: .08, clearcoat: 1, emissive: 0xffffff, emissiveMap: planar(tvTex, 7.51, 1.01, 1.38, .76), emissiveIntensity: 0, nightIntensity: 1.6 }),
    led: P({ color: 0xfff1db, emissive: 0xffc98a, emissiveIntensity: 0, nightIntensity: 2.5 }),
    leaf: P({ color: 0x3f5e33, roughness: .5, side: THREE.DoubleSide, sheen: .3, sheenColor: 0x9fcf80 }),
    leafOlive: P({ color: 0x7a8a68, roughness: .6, side: THREE.DoubleSide, sheen: .4, sheenColor: 0xd8e6c8 }),
    leafSnake: P({ color: 0x2f4b2c, roughness: .35, side: THREE.DoubleSide, clearcoat: .3 }),
    bark: T('wood', .25, { color: 0x6c5b4b, normalScale: 2 }),
    soil: P({ color: 0x33271f, roughness: 1 }),
    pebble: P({ color: 0xbdb3a6, roughness: .7 }),
    rug: T('wool', .25, { color: 0xd5c2a6, normalScale: 1.2 }),
    rugDark: T('wool', .25, { color: 0x8f6a4c, normalScale: 1.2 }),
    sheer: P({ color: 0xf6f2ea, roughness: .95, transparent: true, opacity: .72, side: THREE.DoubleSide, sheen: .6, sheenColor: 0xffffff, depthWrite: false }),
    paper: P({ color: 0xf1ebe0, roughness: .9 }),
    book1: P({ color: 0x8c3b2a, roughness: .7 }), book2: P({ color: 0x2d3b36, roughness: .7 }), book3: P({ color: 0xd8c9a8, roughness: .7 }),
    fruit: P({ color: 0xe0761f, roughness: .45, clearcoat: .3 }),
    towel: T('boucle', .08, { color: 0xeee6da, sheen: .6, sheenRoughness: .8, normalScale: 1.6 }),
    rubber: P({ color: 0x151515, roughness: .9 }),
    plastic: P({ color: 0x1c1c1d, roughness: .55 }),
    display: P({ color: 0x050506, roughness: .05, clearcoat: 1, emissive: 0x7fb0ff, emissiveIntensity: .06, nightIntensity: .6 }),
    rattan: T('linen', .045, { color: 0xb88d5c, roughness: 1, normalScale: 3, side: THREE.DoubleSide }),
    rattanDark: T('wood', .3, { color: 0x8a6440 }),
    laptop: P({ color: 0x0c0f16, roughness: .1, emissive: 0x9db8e8, emissiveIntensity: .12, nightIntensity: .5 })
  };
}

/* ================= geometry helpers ================= */
const world = new THREE.Group(); scene.add(world);
const clampables = [];
let CUR = world; const movables = [];
function beginG(name) { const g = new THREE.Group(); g.name = name; world.add(g); CUR = g; }
function endG() { const g = CUR; CUR = world; const bb = new THREE.Box3();
  g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) bb.expandByObject(o); });
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  g.children.forEach(c => { c.position.x -= cx; c.position.z -= cz; }); g.position.set(cx, 0, cz);
  g.userData = { movable: true, home: { x: cx, z: cz, r: 0 }, size: bb.getSize(new V3()), minY0: bb.min.y, custom: {} }; movables.push(g);
  if (!MKEY) MKEY = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  g.traverse(o => { if (o.isMesh) o.userData.mkey = MKEY.get(o.material); }); }
let MKEY = null;
function G(name, fn) { beginG(name); fn(); endG(); }
function worldUV(g, ox = 0, oy = 0, oz = 0) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i) + oz, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[2 * i] = u; uv[2 * i + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function add(geo, m, x = 0, h = 0, y = 0, o = {}) {
  if (o.uv !== false) worldUV(geo, x, h, y);
  const me = new THREE.Mesh(geo, m); me.position.set(x, h, y); if (o.rotY) me.rotation.y = o.rotY;
  me.castShadow = o.cast !== false; me.receiveShadow = true; me.userData.hideInCut = !!o.hideInCut; me.userData.clampMesh = !!o.clampMesh;
  (o.parent || CUR).add(me); return me;
}
function B(x1, y1, x2, y2, h1, h2, m, o = {}) {
  const ax = Math.min(x1, x2), bx = Math.max(x1, x2), ay = Math.min(y1, y2), by = Math.max(y1, y2);
  const me = add(new THREE.BoxGeometry(bx - ax, h2 - h1, by - ay), m, (ax + bx) / 2, (h1 + h2) / 2, (ay + by) / 2, o);
  if (o.clamp !== false) { me.userData.clamp = true; clampables.push({ me, h1, h2 }); } return me;
}
function RB(x1, y1, x2, y2, h1, h2, r, m, o = {}) {
  const w = x2 - x1, d = y2 - y1, h = h2 - h1; r = Math.max(.001, Math.min(r, w / 2 - .001, d / 2 - .001, h / 2 - .001));
  return add(new RoundedBoxGeometry(w, h, d, o.seg || 4, r), m, (x1 + x2) / 2, (h1 + h2) / 2, (y1 + y2) / 2, o);
}
function C(x, y, r, h1, h2, m, o = {}) { return add(new THREE.CylinderGeometry(o.rt ?? r, r, h2 - h1, o.seg || 48, 1, !!o.open), m, x, (h1 + h2) / 2, y, o); }
function S(x, y, h, r, m, o = {}) { return add(new THREE.SphereGeometry(r, 40, 24), m, x, h, y, o); }
function lathe(pts, x, y, h, m, o = {}) {
  const g = new THREE.LatheGeometry(pts.map(p => new V2(p[0], p[1])), o.seg || 64);
  if (o.sx || o.sz) g.scale(o.sx || 1, 1, o.sz || 1); if (o.rotY) g.rotateY(o.rotY);
  return add(g, m, x, h, y, Object.assign({}, o, { rotY: 0 }));
}
function tube(pts, r, m, o = {}) { const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2])));
  return add(new THREE.TubeGeometry(c, o.seg || 64, r, o.rs || 12, false), m, 0, 0, 0, o); }
// soft, puffy cushion: w along x, t thickness (vertical), d along z
function pillowGeo(w, t, d, puff = .9) {
  let g = new RoundedBoxGeometry(w, t, d, 7, Math.min(t * .48, w * .2, d * .2)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = x / (w / 2), nz = z / (d / 2);
    const e = Math.min(1, Math.hypot(nx * .8, nz * .8) * .6 + Math.max(Math.abs(nx), Math.abs(nz)) * .45), f = Math.max(.12, 1 - puff * Math.pow(e, 2.2)); p.setY(i, y * f);
    p.setX(i, x * (1 - .05 * nz * nz)); p.setZ(i, z * (1 - .05 * nx * nx)); }
  g.computeVertexNormals(); return g;
}
function pillow(x, y, h, w, t, d, m, rx = 0, ry = 0, rz = 0) { const g = pillowGeo(w, t, d); g.rotateZ(rz); g.rotateX(rx); g.rotateY(ry); return add(g, m, x, h, y, { hideInCut: false }); }
// annular sector in plan (angles in plan radians; 0 = +x, PI/2 = +y)
function sectorGeo(cx, cy, r1, r2, a1, a2, h, b) {
  const s = new THREE.Shape(), n = 48;
  for (let i = 0; i <= n; i++) { const a = a1 + (a2 - a1) * i / n, x = cx + r2 * Math.cos(a), y = cy + r2 * Math.sin(a); i ? s.lineTo(x, -y) : s.moveTo(x, -y); }
  for (let i = n; i >= 0; i--) { const a = a1 + (a2 - a1) * i / n; s.lineTo(cx + r1 * Math.cos(a), -(cy + r1 * Math.sin(a))); }
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * .85, bevelSegments: 5, curveSegments: 32 });
  g.rotateX(-Math.PI / 2); return g;
}
function sector(cx, cy, r1, r2, a1, a2, h1, h2, m, b = .04) { const g = sectorGeo(cx, cy, r1, r2, a1, a2, h2 - h1, b); g.translate(0, h1 + b, 0); return add(g, m, 0, 0, 0, {}); }
// draped fabric over a rectangle (duvet / throw). foot = +1 (towards +y) or -1
function drape(x1, y1, x2, y2, top, hangSide, hangFoot, foot, m, o = {}) {
  const W = x2 - x1, D = y2 - y1, NS = 90, NT = 70, rr = .035;
  const g = new THREE.PlaneGeometry(1, 1, NS, NT), p = g.attributes.position;
  const wr = vnoise(12, 12);
  for (let i = 0; i < p.count; i++) {
    const s = (p.getX(i) + .5) * (W + 2 * hangSide) - hangSide, t = (p.getY(i) + .5) * (D + hangFoot);
    const cs = Math.min(Math.max(s, 0), W), ct = Math.min(Math.max(t, 0), D), ex = s - cs, ey = t - ct, e = Math.hypot(ex, ey);
    let px = cs, py = ct, hh = top;
    if (e > 1e-6) { const dx = ex / e, dy = ey / e; let out, down;
      if (e <= rr * Math.PI / 2) { const a = e / rr; out = rr * Math.sin(a); down = rr * (1 - Math.cos(a)); } else { out = rr; down = rr + (e - rr * Math.PI / 2); }
      out += .012 * Math.sin((cs + ct) * 22) * Math.min(1, down / .2) + Math.max(0, down - .05) * .05;
      px = cs + dx * out; py = ct + dy * out; hh = top - down;
    } else { hh = top + .018 * (wr((s / W) % 1, (t / D) % 1) - .5) + .008 * Math.sin(s * 6 + t * 3) * Math.sin(t * 5); }
    p.setXYZ(i, x1 + px, hh, foot > 0 ? y1 + py : y2 - py);
  }
  g.computeVertexNormals(); return add(g, m, 0, 0, 0, Object.assign({ hideInCut: false }, o));
}
function merged(geos, m, o = {}) { const g = mergeGeometries(geos, false); if (o.uv !== false) worldUV(g); return add(g, m, 0, 0, 0, Object.assign({}, o, { uv: false })); }

/* ================= architecture ================= */
const DOOR = (a, b) => ({ a, b, sill: 0, head: 2.1 });
const WIN = (a, b) => ({ a, b, sill: .9, head: 2.4, glass: 'win' });
const TDOOR = (a, b) => ({ a, b, sill: 0, head: 2.4, glass: 'door' });
function wallRun(axis, t1, t2, s, e, ops, m, inSign) {
  ops = [...ops].sort((p, q) => p.a - q.a); let c = s;
  const mk = (a, b, h1, h2) => axis === 'x' ? B(a, t1, b, t2, h1, h2, m) : B(t1, a, t2, b, h1, h2, m);
  for (const o of ops) { if (o.a > c) mk(c, o.a, 0, H); if (o.sill > 0) mk(o.a, o.b, 0, o.sill); if (o.head < H) mk(o.a, o.b, o.head, H);
    if (o.glass) glazing(axis, (t1 + t2) / 2, o, inSign, Math.abs(t2 - t1)); c = o.b; }
  if (c < e) mk(c, e, 0, H);
}
const wallX = (y1, y2, x1, x2, ops = [], inSign = 1, m) => wallRun('x', y1, y2, x1, x2, ops, m || M.wall, inSign);
const wallY = (x1, x2, y1, y2, ops = [], inSign = 1, m) => wallRun('y', x1, x2, y1, y2, ops, m || M.wall, inSign);
function glazing(axis, c, o, inSign, thick) {
  const f = .055, d = .075, { a, b, sill: s, head: h } = o;
  const R = (a1, b1, h1, h2, m, dd = d, off = 0, opt = {}) => axis === 'x' ? B(a1, c - dd / 2 + off, b1, c + dd / 2 + off, h1, h2, m, opt) : B(c - dd / 2 + off, a1, c + dd / 2 + off, b1, h1, h2, m, opt);
  R(a, a + f, s, h, M.frame); R(b - f, b, s, h, M.frame); R(a, b, h - f, h, M.frame); R(a, b, s, s + f * (o.glass === 'door' ? .5 : 1), M.frame);
  R(a + f, b - f, s + f * (o.glass === 'door' ? .5 : 1), h - f, M.glass, .012, 0, { cast: false });
  // reveals (plaster returns) and sills
  if (o.glass === 'win') R(a - .01, b + .01, s - .025, s, M.trav, .2, inSign * (thick / 2 + .02));
  else R(a, b, 0, .012, M.steelDark, thick, 0);
  if (o.glass === 'door') R(b - f - .05, b - f - .035, 1.0, 1.25, M.blackMetal, .03, inSign * .05);
}
function door(hx, hy, cdx, cdy, len, ang, sign, m, o = {}) {
  const c = Math.cos(ang * sign), s = Math.sin(ang * sign), dx = cdx * c - cdy * s, dy = cdx * s + cdy * c;
  const mx = hx + dx * len / 2, my = hy + dy * len / 2, rot = -Math.atan2(dy, dx), hgt = o.h || 2.08;
  const leaf = add(new THREE.BoxGeometry(len - .006, hgt, .042), m, mx, hgt / 2 + .005, my, { rotY: rot });
  clampables.push({ me: leaf, h1: .005, h2: hgt + .005 }); leaf.userData.clamp = true;
  // lever handles both faces
  const ex = hx + dx * (len - .07), ey = hy + dy * (len - .07), nx = -dy, ny = dx;
  for (const sd of [-1, 1]) {
    C(ex + nx * .03 * sd, ey + ny * .03 * sd, .025, 0.99, 1.0, M[o.handle || 'blackMetal'], { rt: .025 }).rotation.x = 0;
    const lv = add(new THREE.BoxGeometry(.13, .016, .016), M[o.handle || 'blackMetal'], ex + nx * .045 * sd - dx * .055, 1.0, ey + ny * .045 * sd - dy * .055, { rotY: rot });
  }
}
function skirt(axis, at, inSign, a, b, gaps = []) {
  let c = a; const segs = []; [...gaps].sort((p, q) => p[0] - q[0]).forEach(([g1, g2]) => { if (g1 > c) segs.push([c, g1]); c = Math.max(c, g2); }); if (c < b) segs.push([c, b]);
  for (const [s, e] of segs) axis === 'x' ? B(s, at, e, at + inSign * .012, 0, .08, M.skirting) : B(at, s, at + inSign * .012, e, 0, .08, M.skirting);
}

function buildArchitecture() {
  // plan coordinates in metres: x east from the bedrooms' west wall, y south from the north wall (scaled from the 1:100 plan, 71.4 px/m)
  const W0 = -2.0, W1 = 15.9;
  B(W0, -0.29, W1, 7.39, -.36, -.05, M.concrete, { clamp: false }); B(6.86, 7.39, 9.06, 9.30, -.36, -.05, M.concrete, { clamp: false });
  // floors
  B(0, 0, 4.59, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(4.59, 2.87, 7.07, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(7.07, 0, 13.62, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(4.69, 0, 7.07, 2.77, -.05, .008, M.micro, { clamp: false });
  B(7.06, 7.39, 8.86, 9.06, -.05, .008, M.micro, { clamp: false });
  B(-1.85, 0, -0.25, 7.13, -.05, -.02, M.deck, { clamp: false }); B(13.87, 0, 15.75, 7.13, -.05, -.02, M.deck, { clamp: false });
  // exterior walls
  wallX(-0.29, 0, -0.25, 13.87);
  wallX(7.13, 7.39, -0.25, 6.86, [DOOR(5.23, 6.18)]);
  wallX(7.13, 7.39, 6.86, 9.06, [DOOR(7.96, 8.73)]);
  wallX(7.13, 7.39, 9.06, 13.87);
  B(6.86, 7.39, 7.06, 9.30, 0, H, M.wall); B(8.86, 7.39, 9.06, 9.30, 0, H, M.wall); B(6.86, 9.06, 9.06, 9.30, 0, H, M.wall);
  wallY(-0.25, 0, 0, 7.13, [WIN(1.63, 2.83), TDOOR(2.84, 3.61), TDOOR(4.74, 5.48), WIN(5.48, 6.71)], 1);
  wallY(13.62, 13.87, 0, 7.13, [WIN(.89, 1.69), TDOOR(1.69, 2.48), WIN(2.48, 3.28), TDOOR(4.71, 5.51), WIN(5.51, 6.55)], -1);
  // balconies: open, no walls — frameless glass balustrade (1.05 m) with a steel handrail on the three open sides
  [[-1.99, -0.25, -1], [15.89, 13.87, 1]].forEach(([xo, xi, sg]) => {
    const edge = [[xi, -0.27], [xo, -0.27], [xo, 7.37], [xi, 7.37]];
    for (let k = 0; k < 3; k++) { const [ax, ay] = edge[k], [bx, by] = edge[k + 1], len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      add(new THREE.BoxGeometry(len, .98, .012), M.glassRail, (ax + bx) / 2, .05 + .49, (ay + by) / 2, { rotY: -ang, cast: false });
      add(new THREE.BoxGeometry(len + .02, .06, .05), M.frame, (ax + bx) / 2, .0, (ay + by) / 2, { rotY: -ang }); }
    const c = new THREE.CurvePath(); for (let k = 0; k < 3; k++) c.add(new THREE.LineCurve3(new V3(edge[k][0], 1.05, edge[k][1]), new V3(edge[k + 1][0], 1.05, edge[k + 1][1])));
    add(new THREE.TubeGeometry(c, 120, .022, 12, false), M.steel, 0, 0, 0); });
  // partitions
  wallX(3.98, 4.08, 0, 5.16);
  wallY(4.59, 4.69, 0, 3.98, [DOOR(3.05, 3.85)]);
  wallX(2.77, 2.87, 4.69, 7.07, [DOOR(5.47, 6.27)]);
  wallY(7.07, 7.17, 0, 2.87);
  wallY(5.06, 5.16, 4.08, 7.13, [DOOR(4.89, 5.79)]);
  // swapped plan: hall + old kitchen + south band of the old living room = one open living/kitchen; office takes the north room
  B(8.86, 0, 9.35, .2, 0, H, M.wall);
  B(9.25, 6.64, 10.88, 7.13, 0, H, M.wall);
  B(4.98, 0, 6.29, .48, 0, H, M.wall);
  // door leaves
  door(4.59, 3.85, 0, -1, .8, 1.25, -1, M.skirting);
  door(5.06, 4.89, 0, 1, .9, 1.25, 1, M.skirting);
  door(5.47, 2.77, 1, 0, .8, 1.3, -1, M.skirting);
  door(8.73, 7.13, -1, 0, .77, 1.3, 1, M.skirting);
  door(6.18, 7.13, -1, 0, .95, 1.3, 1, M.walnut, { handle: 'brass' });
  // skirting
  skirt('x', 0, 1, 0, 4.59); skirt('y', 0, 1, 0, 3.98, [[2.84, 3.61]]); skirt('x', 3.98, -1, 0, 4.59); skirt('y', 4.59, -1, 0, 3.98, [[3.05, 3.85]]);
  skirt('x', 4.08, 1, 0, 5.06); skirt('y', 0, 1, 4.08, 7.13, [[4.74, 5.48]]); skirt('x', 7.13, -1, 0, 5.06); skirt('y', 5.06, -1, 4.08, 7.13, [[4.89, 5.79]]);
  skirt('x', 0, 1, 7.17, 13.62); skirt('y', 7.17, 1, 0, 2.87); skirt('y', 13.62, -1, 0, 7.13, [[1.69, 2.48], [4.71, 5.51]]);
  skirt('x', 7.13, -1, 9.06, 9.25); skirt('x', 7.13, -1, 10.88, 13.62); skirt('x', 6.64, -1, 9.25, 10.88);
  skirt('x', 7.13, -1, 5.16, 8.86, [[5.23, 6.18], [7.96, 8.73]]); skirt('y', 5.16, 1, 4.08, 7.13, [[4.89, 5.79]]);
  skirt('y', 4.69, 1, 2.87, 3.98, [[3.05, 3.85]]); skirt('x', 2.87, 1, 4.69, 7.07, [[5.47, 6.27]]);
  // bathroom + guest WC finishes
  B(4.69, 0, 4.98, .005, .008, H, M.travSmall); B(6.29, 0, 7.07, .005, .008, H, M.travSmall); B(4.98, .48, 6.29, .485, .008, H, M.marble);
  B(4.69, .005, 4.695, 2.77, .008, H, M.travSmall); B(7.065, .005, 7.07, 2.77, .008, H, M.travSmall);
  B(4.695, 2.765, 5.47, 2.77, .008, H, M.travSmall); B(6.27, 2.765, 7.065, 2.77, .008, H, M.travSmall);
  B(7.06, 7.39, 7.065, 9.06, .008, H, M.micro); B(8.855, 7.39, 8.86, 9.06, .008, H, M.micro); B(7.065, 9.055, 8.855, 9.06, .008, H, M.micro);
  // ceiling (shown from eye level)
  const ceil = new THREE.Group(); world.add(ceil); ceil.userData.ceiling = true;
  B(-0.25, -0.29, 13.87, 7.39, H, H + .06, M.ceiling, { parent: ceil, clamp: false, cast: false }); B(6.86, 7.39, 9.06, 9.30, H, H + .06, M.ceiling, { parent: ceil, clamp: false, cast: false });
  [[1.0, 1.0], [3.5, 1.0], [3.5, 3.4], [1.0, 5.5], [3.6, 5.5], [5.9, 1.4], [5.9, 3.5], [6.0, 5.6], [7.9, 5.6], [7.9, 8.2], [9.5, 4.3], [12.4, 4.6], [12.4, 6.2], [9.6, 5.5], [8.2, 1.6], [10.6, 1.6], [12.6, 1.6]].forEach(([x, y]) => {
    C(x, y, .048, H - .004, H, M.blackMetal, { parent: ceil, cast: false }); C(x, y, .036, H - .006, H - .004, M.led, { parent: ceil, cast: false }); });
  return ceil;
}

// Soft classic partitions and finishes
const ARCH = {};
ARCH.softStudio = function () {
  // studio north, office in the old kitchen room, hall separate on the east side
    wallY(7.07, 7.17, 2.87, 4.32); skirt('y', 7.07, -1, 2.87, 4.32); skirt('y', 7.17, 1, 2.87, 4.32);
    wallX(4.32, 4.42, 8.86, 13.62); wallY(8.86, 8.96, 4.42, 7.13, [DOOR(4.66, 5.43)]);
    door(8.96, 4.66, 0, 1, .77, 1.3, -1, M.skirting);
    B(8.96, 4.42, 13.62, 7.13, -.05, .004, M.trav, { clamp: false });
    skirt('x', 4.32, -1, 7.17, 13.62, [[7.17, 8.86]]); skirt('y', 8.86, -1, 4.42, 7.13, [[4.66, 5.43]]); skirt('y', 8.96, 1, 4.42, 7.13, [[4.66, 5.43]]); skirt('x', 4.42, 1, 8.96, 13.62);
  // chevron oak over every oak / stone living floor (bathroom + WC keep their tiles)
  B(0, 0, 4.59, 7.13, 0, .006, M.chevron, { clamp: false, cast: false }); B(4.59, 2.87, 7.07, 7.13, 0, .006, M.chevron, { clamp: false, cast: false });
  B(7.07, 0, 13.62, 7.13, 0, .006, M.chevron, { clamp: false, cast: false });
  // rounded-shoulder arches: corridor → hall and hall → studio
  softArch(4.32, 4.42, 7.17, 8.86, 7.24, 8.79, 2.45, .5);
  // fluted rounded corners on convex corners
  softBullnose(5.16, 3.98, 1, -1); softBullnose(8.86, .2, -1, 1); softBullnose(9.35, .2, 1, 1); softBullnose(9.25, 6.64, -1, -1); softBullnose(10.88, 6.64, 1, -1);
  // boiserie
  // walk-in closet in bedroom 1 (1.54 × 2.95 inside): partition at x 2.95–3.05 with an arched opening facing the bed, closet front wall at y 2.95–3.05
  // walk-in closet in bedroom 1 (1.30 × 2.95 inside), entered right at the bedroom door through an arch in its south wall
  B(3.19, 0, 3.29, 3.05, 0, H, M.wall); softArch(2.95, 3.05, 3.29, 4.59, 3.32, 4.0, 2.3, .3);
  skirt('y', 3.19, -1, 0, 2.95); skirt('x', 3.05, 1, 3.19, 4.59, [[3.32, 4.0]]);
  softPanels('x', 0, 1, 0, 3.19);                                 // bedroom 1 headboard wall
  softPanels('x', 3.98, -1, 0, 4.59, [[.5, 1.8], [2.6, 4.59]]);   // bedroom 1 south (beauty table bay + entry plain)
  softPanels('x', 4.08, 1, 0, 2.6);                               // bedroom 2 north
  softPanels('x', 7.13, -1, 0, 2.9);                              // bedroom 2 headboard wall (wardrobe bay plain)
  softPanels('y', 7.07, -1, 2.87, 4.30, [[2.87, 4.40]]);          // corridor east (laundry tower bay)
  softPanels('x', 2.87, 1, 4.69, 7.07, [[5.42, 6.32]]);           // corridor north (bathroom door)
  softPanels('x', 7.13, -1, 5.16, 8.86, [[5.18, 6.23], [7.91, 8.78]]); // hall south (entrance + WC doors)
  softPanels('y', 8.86, -1, 4.42, 7.13, [[4.61, 5.48], [5.40, 6.40]]); // hall east (office door; console + art bay plain)
  softPanels('x', 0, 1, 9.35, 13.62);                             // studio north (behind the sofa)
  softPanels('x', 4.32, -1, 8.86, 11.0);                          // studio partition (dining side)
  softPanels('y', 8.96, 1, 5.48, 7.13);                           // office west
  // coffered ceilings with rounded corners, fluted lip and LED cove
  softCeil = new THREE.Group(); softCeil.name = 'softCeil'; ceiling.add(softCeil);
  softTray(0, 0, 3.19, 3.98, .3, .4); softTray(0, 4.08, 5.06, 7.13, .35, .45); softTray(4.69, 2.87, 7.07, 4.30, .18, .25);
  softTray(5.16, 4.42, 8.86, 7.13, .25, .4); softTray(7.17, 0, 13.62, 4.32, .45, .6); softTray(8.96, 4.42, 13.62, 7.13, .3, .45);
};
/* ---- "Soft classic" architecture: chevron oak, boiserie panels, rounded arches, fluted rounded corners, coffered ceilings ---- */
function rrPath(x1, y1, x2, y2, r, n = 10) { r = Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2); const pts = [];
  const C4 = [[x2 - r, y1 + r, -Math.PI / 2], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, Math.PI / 2], [x1 + r, y1 + r, Math.PI]];
  C4.forEach(([cx, cy, a0]) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }); return pts; }
function softPanels(axis, at, s, a, b, gaps = [], top = 2.42) { // picture-frame mouldings + chair rail on one wall face
  const pr = .014, w = .03, out = [];
  const Bx = (p, q, h1, h2, d = pr) => out.push(axis === 'x' ? new THREE.BoxGeometry(q - p, h2 - h1, d).translate((p + q) / 2, (h1 + h2) / 2, at + s * d / 2) : new THREE.BoxGeometry(d, h2 - h1, q - p).translate(at + s * d / 2, (h1 + h2) / 2, (p + q) / 2));
  const fr = (x1, x2, h1, h2) => { Bx(x1, x2, h1, h1 + w); Bx(x1, x2, h2 - w, h2); Bx(x1, x1 + w, h1 + w, h2 - w); Bx(x2 - w, x2, h1 + w, h2 - w); };
  const segs = []; let st = a; gaps.slice().sort((x, y) => x[0] - y[0]).forEach(([g1, g2]) => { if (g1 - st > .3) segs.push([st, g1]); st = Math.max(st, g2); }); if (b - st > .3) segs.push([st, b]);
  segs.forEach(([p, q]) => { Bx(p, q, .9, .96, .024); Bx(p, q, .955, .965, .034);
    const n = Math.max(1, Math.round((q - p) / .9)), pw = (q - p) / n;
    for (let i = 0; i < n; i++) { const x1 = p + i * pw + .08, x2 = p + (i + 1) * pw - .08; if (x2 - x1 < .14) continue; fr(x1, x2, .2, .78); fr(x1, x2, 1.08, top); } });
  if (out.length) merged(out, M.skirting, { cast: false });
}
function softArch(y1, y2, a, b, ha, hb, top = 2.45, r = .42) { // wall with a rounded-shoulder arched opening (ha–hb), painted casing both sides
  const s = new THREE.Shape(); s.moveTo(a, 0); s.lineTo(b, 0); s.lineTo(b, H); s.lineTo(a, H); s.lineTo(a, 0);
  const hole = new THREE.Path(); hole.moveTo(ha, 0); hole.lineTo(ha, top - r); hole.absarc(ha + r, top - r, r, Math.PI, Math.PI / 2, true); hole.lineTo(hb - r, top);
  hole.absarc(hb - r, top - r, r, Math.PI / 2, 0, true); hole.lineTo(hb, 0); hole.lineTo(ha, 0); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: y2 - y1, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, y1); add(g, M.wall, 0, 0, 0);
  const c = new THREE.CurvePath(); c.add(new THREE.LineCurve3(new V3(ha, 0, 0), new V3(ha, top - r, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(ha, top - r, 0), new V3(ha, top - r * .45, 0), new V3(ha + r * .45, top, 0), new V3(ha + r, top, 0)));
  c.add(new THREE.LineCurve3(new V3(ha + r, top, 0), new V3(hb - r, top, 0)));
  c.add(new THREE.CubicBezierCurve3(new V3(hb - r, top, 0), new V3(hb - r * .45, top, 0), new V3(hb, top - r * .45, 0), new V3(hb, top - r, 0)));
  c.add(new THREE.LineCurve3(new V3(hb, top - r, 0), new V3(hb, 0, 0)));
  [y1 - .012, y2 + .012].forEach(z => { const t = new THREE.TubeGeometry(c, 120, .03, 10, false); t.translate(0, 0, z); add(t, M.skirting, 0, 0, 0, { uv: false }); });
}
function softBullnose(x, y, qx, qy, r = .085) { // fluted rounded corner on a convex wall corner (quadrant qx, qy = outward direction)
  const t0 = qx > 0 ? (qy > 0 ? 0 : Math.PI / 2) : (qy > 0 ? 1.5 * Math.PI : Math.PI);
  add(new THREE.CylinderGeometry(r, r, H, 24, 1, false, t0, Math.PI / 2).translate(0, H / 2, 0), M.wall, x, 0, y);
  const ribs = []; for (let i = 1; i < 9; i++) { const t = t0 + i / 9 * Math.PI / 2; ribs.push(new THREE.CylinderGeometry(.011, .011, H - .3, 8).translate(x + r * Math.sin(t), .15 + (H - .3) / 2, y + r * Math.cos(t))); }
  merged(ribs, M.wall, { cast: false });
}
let softCeil = null;
function softTray(x1, y1, x2, y2, border, r, drop = .16) { // coffered ceiling: dropped border with rounded inner corners, fluted lip and LED cove
  const ix1 = x1 + border, iy1 = y1 + border, ix2 = x2 - border, iy2 = y2 - border, inner = rrPath(ix1, iy1, ix2, iy2, r);
  const s = new THREE.Shape(); [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(([x, y], i) => i ? s.lineTo(x, -y) : s.moveTo(x, -y));
  const h = new THREE.Path(); inner.forEach(([x, y], i) => i ? h.lineTo(x, -y) : h.moveTo(x, -y)); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: drop, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, H - drop, 0);
  add(g, M.ceiling, 0, 0, 0, { parent: softCeil, cast: false });
  const ribs = []; let acc = 0;
  for (let i = 0; i < inner.length; i++) { const [ax, ay] = inner[i], [bx, by] = inner[(i + 1) % inner.length], L = Math.hypot(bx - ax, by - ay);
    for (let d = .035 - acc; d < L; d += .035) { const t = d / L; ribs.push(new THREE.CylinderGeometry(.008, .008, drop - .03, 6).translate(ax + (bx - ax) * t, H - drop / 2 - .015, ay + (by - ay) * t)); }
    acc = (acc + L) % .035; }
  merged(ribs, M.ceiling, { parent: softCeil, cast: false });
  const c = new THREE.CurvePath(); for (let i = 0; i < inner.length; i++) { const [ax, ay] = inner[i], [bx, by] = inner[(i + 1) % inner.length]; c.add(new THREE.LineCurve3(new V3(ax, H - .012, ay), new V3(bx, H - .012, by))); }
  add(new THREE.TubeGeometry(c, inner.length * 3, .007, 6, true), M.led, 0, 0, 0, { parent: softCeil, cast: false, uv: false });
}
function buildArchVar() { const L = LAYOUTS.soft; M.wall.color.set(L.wallTint); M.ceiling.color.set(L.ceilTint); M.skirting.color.set(L.trimTint);
  const archG = new THREE.Group(); archG.name = 'archVar'; world.add(archG); CUR = archG; ARCH.softStudio(); CUR = world; }

/* ================= furniture & objects ================= */
function cab(o) { // run of cabinets with real 3.5 mm shadow gaps between fronts
  const { axis, a1, a2, back, front, h1, h2, cols, fm, cm = M.carcass } = o; const s = Math.sign(front - back), t = .019, g = .0035, cf = front - s * t;
  axis === 'x' ? B(a1, Math.min(back, cf), a2, Math.max(back, cf), h1, h2, cm) : B(Math.min(back, cf), a1, Math.max(back, cf), a2, h1, h2, cm);
  const total = cols.reduce((p, c) => p + c[0], 0), k = (a2 - a1) / total; let a = a1;
  for (const [w, rows] of cols) { const b = a + w * k, rh = (h2 - h1) / rows;
    for (let r = 0; r < rows; r++) { const z1 = h1 + r * rh + g / 2, z2 = h1 + (r + 1) * rh - g / 2;
      axis === 'x' ? B(a + g / 2, Math.min(cf, front), b - g / 2, Math.max(cf, front), z1, z2, fm) : B(Math.min(cf, front), a + g / 2, Math.max(cf, front), b - g / 2, z1, z2, fm); }
    a = b; }
}
function leafGeo(L, W, fold = .3, bend = .25) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(W, L * .42, 0, L); s.quadraticCurveTo(-W, L * .42, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.abs(x) * fold - bend * L * Math.pow(y / L, 2)); }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
function placeLeaves(base, n, place) {
  const geos = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new V3(), pos = new V3(), dir = new V3();
  for (let i = 0; i < n; i++) { const r = place(i, pos, dir); if (r === false) continue; const s = r || 1;
    e.set(-Math.PI / 2 + .25 + rand() * .6, Math.atan2(-dir.x, -dir.z) + (rand() - .5) * .6, (rand() - .5) * .8); q.setFromEuler(e); sc.set(s, s, s);
    m4.compose(pos, q, sc); geos.push(base.clone().applyMatrix4(m4)); }
  return mergeGeometries(geos, false);
}
function pot(x, y, rTop, rBot, h, m) {
  lathe([[0, 0], [rBot, 0], [rBot + .005, .01], [rTop, h - .01], [rTop - .012, h], [rTop - .02, h - .03], [0, h - .03]], x, y, 0, m);
  C(x, y, rTop - .02, h - .06, h - .035, M.soil, { cast: false });
}
function fig(x, y, s = 1) {
  pot(x, y, .2, .16, .46, M.stoneware);
  const top = 1.85 * s; tube([[x, .4, y], [x + .03, 1.0 * s, y - .02], [x - .02, top, y + .03]], .022, M.bark, { hideInCut: false });
  const L = leafGeo(.27, .1, .25, .2);
  add(placeLeaves(L, 62, (i, p, d) => { const t = rand(), hh = (.95 + .9 * t) * s, a = rand() * Math.PI * 2, r = .05 + rand() * .28 * (1 - t * .4);
    p.set(x + Math.cos(a) * r * .4, hh, y + Math.sin(a) * r * .4); d.set(Math.cos(a), 0, Math.sin(a)); return .8 + rand() * .45; }), M.leaf, 0, 0, 0, { uv: false });
}
function olive(x, y, s = 1) {
  RB(x - .3, y - .3, x + .3, y + .3, -.03, .62, .03, M.concrete); C(x, y, .26, .56, .6, M.pebble, { cast: false, seg: 24 });
  const top = 1.45 * s; tube([[x, .5, y], [x + .05, .9 * s, y + .02], [x - .03, 1.2 * s, y - .04], [x + .02, top, y]], .035, M.bark);
  const ctr = new V3(x, top + .25, y);
  [[.3, .1], [-.25, .2], [.05, -.3], [-.1, .28]].forEach(([dx, dy]) => tube([[x, top - .1, y], [x + dx * .5, top + .1, y + dy * .5], [x + dx, top + .25, y + dy]], .014, M.bark));
  const L = leafGeo(.075, .012, .1, .05);
  add(placeLeaves(L, 1300, (i, p, d) => { const th = rand() * Math.PI * 2, ph = Math.acos(rand() * 2 - 1), r = .25 + .3 * Math.cbrt(rand());
    d.set(Math.sin(ph) * Math.cos(th), Math.cos(ph) * .7, Math.sin(ph) * Math.sin(th)); p.copy(ctr).addScaledVector(d, r); p.y = Math.max(p.y, top - .1); return 1; }), M.leafOlive, 0, 0, 0, { uv: false });
}
function snake(x, y, s = 1) {
  pot(x, y, .16, .13, .42, M.stonewareDark);
  const geos = [];
  for (let i = 0; i < 11; i++) { const L = (.55 + rand() * .45) * s, g = new THREE.PlaneGeometry(.075, L, 1, 10), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const yy = p.getY(k) + L / 2, t = yy / L; p.setX(k, p.getX(k) * (1 - Math.pow(t, 3) * .9)); p.setZ(k, .06 * t * t + Math.abs(p.getX(k)) * .4); p.setY(k, yy); }
    g.rotateY(rand() * Math.PI * 2); g.rotateX((rand() - .5) * .25); g.translate(x + (rand() - .5) * .14, .38, y + (rand() - .5) * .14); g.deleteAttribute('uv'); geos.push(g); }
  add(mergeGeometries(geos), M.leafSnake, 0, 0, 0, { uv: false });
}
function curtain(axis, at, a, b, h1, h2, m) {
  const w = b - a, g = new THREE.PlaneGeometry(w, h2 - h1, Math.ceil(w * 120), 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, .035 * Math.sin(x * 2 * Math.PI / .11) + .012 * Math.sin(x * 37)); }
  g.computeVertexNormals();
  if (axis === 'y') g.rotateY(Math.PI / 2);
  const me = add(g, m, axis === 'x' ? (a + b) / 2 : at, (h1 + h2) / 2, axis === 'x' ? at : (a + b) / 2, { cast: false, hideInCut: true });
  axis === 'x' ? B(a - .05, at - .012, b + .05, at + .012, h2, h2 + .03, M.blackMetal, { cast: false }) : B(at - .012, a - .05, at + .012, b + .05, h2, h2 + .03, M.blackMetal, { cast: false });
  return me;
}
function mushroomLamp(x, y, h) {
  lathe([[0, 0], [.07, 0], [.075, .008], [.02, .02], [.012, .3], [0, .3]], x, y, h, M.brass);
  lathe([[0, .38], [.06, .375], [.12, .35], [.155, .31], [.16, .285], [.0, .285]], x, y, h, M.opal);
  lamp(x, y, h + .26, 0xffcf98, 2.2);
}
function book(x, y, h, w, d, t, m, rot = 0) { add(new THREE.BoxGeometry(w, t, d), m, x, h + t / 2, y, { rotY: rot }); add(new THREE.BoxGeometry(w - .01, t - .006, d - .006), M.paper, x + .006, h + t / 2, y, { rotY: rot }); }
function vase(x, y, h, s, m) { lathe([[0, 0], [.05 * s, 0], [.09 * s, .08 * s], [.1 * s, .16 * s], [.05 * s, .27 * s], [.035 * s, .32 * s], [.04 * s, .34 * s], [.03 * s, .34 * s], [0, .1 * s]], x, y, h, m); }
function artFrame(axis, at, inSign, a, b, h1, h2, artMat) {
  const f = .03, dp = .035;
  if (axis === 'x') { const y0 = at, y1 = at + inSign * dp; B(a, y0, b, y1, h1, h2, M.oakFurn); B(a + f, y1, b - f, y1 + inSign * .002, h1 + f, h2 - f, M.paper); B(a + f + .06, y1 + inSign * .002, b - f - .06, y1 + inSign * .003, h1 + f + .06, h2 - f - .06, artMat); }
}
function bed(cx, headY, w, l, dir, accent, duvetMat, throwMat) {
  const y1 = dir > 0 ? headY + .08 : headY - .08 - l, y2 = dir > 0 ? headY + .08 + l : headY - .08;
  // channel-tufted upholstered headboard on the wall
  const hb0 = dir > 0 ? headY : headY - .09, hb1 = dir > 0 ? headY + .09 : headY;
  B(cx - w / 2 - .14, hb0, cx + w / 2 + .14, (hb0 + hb1) / 2, .12, 1.18, M.carcass);
  const n = 9, cw = (w + .28) / n;
  for (let i = 0; i < n; i++) { const x0 = cx - w / 2 - .14 + i * cw; const g = new RoundedBoxGeometry(cw - .004, 1.06, .085, 5, .04); add(g, accent, x0 + cw / 2, .12 + .53, (hb0 + hb1) / 2 + (dir > 0 ? .005 : -.005)); }
  // floating platform (walnut) with LED underglow
  B(cx - w / 2 + .14, y1 + .14, cx + w / 2 - .14, y2 - .14, .0, .12, M.carcass);
  B(cx - w / 2 + .15, y1 + .15, cx + w / 2 - .15, y2 - .15, .002, .006, M.led, { cast: false });
  RB(cx - w / 2, y1, cx + w / 2, y2, .12, .30, .025, M.walnut);
  RB(cx - w / 2 + .03, y1 + .03, cx + w / 2 - .03, y2 - .03, .30, .54, .07, M.linenWhite, { seg: 5 });
  // duvet + folded throw
  const dy1 = dir > 0 ? y1 + .55 : y1, dy2 = dir > 0 ? y2 : y2 - .55;
  drape(cx - w / 2 + .02, dy1, cx + w / 2 - .02, dy2, .565, .36, .30, dir, duvetMat);
  RB(cx - w / 2 - .015, dir > 0 ? dy1 - .03 : dy2 - .22, cx + w / 2 + .015, dir > 0 ? dy1 + .22 : dy2 + .03, .55, .595, .02, M.linenWhite, { seg: 5 });
  const ty1 = dir > 0 ? y2 - .62 : y1, ty2 = dir > 0 ? y2 : y1 + .62;
  drape(cx - w / 2 - .01, ty1, cx + w / 2 + .01, ty2, .60, .42, .34, dir, throwMat);
  // pillows
  const py = dir > 0 ? y1 + .2 : y2 - .2, lean = dir > 0 ? 1.05 : -1.05;
  pillow(cx - w / 4 + .02, py, .75, .7, .18, .48, M.linenWhite, lean); pillow(cx + w / 4 - .02, py, .75, .7, .18, .48, M.linenWhite, lean);
  const py2 = dir > 0 ? y1 + .34 : y2 - .34;
  pillow(cx - w / 4 + .04, py2, .72, .55, .15, .42, M.linenSand, lean * .9); pillow(cx + w / 4 - .04, py2, .72, .55, .15, .42, M.linenSand, lean * .9);
  pillow(cx, dir > 0 ? y1 + .5 : y2 - .5, .66, .5, .13, .28, accent, lean * .8);
  return { y1, y2 };
}
function nightstand(x, y) {
  lathe([[0, 0], [.2, 0], [.215, .01], [.22, .46], [.21, .48], [0, .48]], x, y, 0, M.walnut);
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; C(x + Math.cos(a) * .218, y + Math.sin(a) * .218, .012, .02, .46, M.walnut, { seg: 10 }); }
  C(x, y, .225, .48, .5, M.travSmall); mushroomLamp(x, y, .5);
}
function shellChair(x, y, cx, cy, m = M.velvetTerra, base = M.brass) {
  const phi = Math.atan2(y - cy, x - cx);
  lathe([[0, 0], [.2, 0], [.2, .01], [.04, .03], [.022, .1], [.02, .41], [0, .41]], x, y, 0, base);
  lathe([[0, .40], [.22, .40], [.238, .415], [.24, .445], [.225, .475], [0, .48]], x, y, 0, m);
  sector(x, y, .195, .24, phi - 1.15, phi + 1.15, .44, .82, m, .018);
}
function barStool(x, y) { // 0.65 m seat for a 0.90 m bar, with footrest
  C(x, y, .2, 0, .015, M.blackMetal); C(x, y, .022, .015, .62, M.blackMetal, { seg: 16 });
  add(new THREE.TorusGeometry(.17, .01, 8, 40).rotateX(Math.PI / 2), M.brass, x, .3, y, { uv: false });
  lathe([[0, .62], [.19, .62], [.2, .635], [.2, .66], [.18, .68], [0, .685]], x, y, 0, M.velvetTerra);
}
function taskChair(x, y, face) { // swivel chair, face = plan angle the sitter looks toward
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, ex = x + Math.cos(a) * .3, ey = y + Math.sin(a) * .3;
    tube([[x, .09, y], [ex, .07, ey]], .014, M.blackMetal, { seg: 4, rs: 8 }); S(ex, ey, .03, .028, M.rubber); }
  C(x, y, .03, .09, .43, M.steel, { seg: 20 });
  RB(x - .23, y - .23, x + .23, y + .23, .43, .52, .05, M.boucleOat, { seg: 5 });
  const bx = x - Math.cos(face) * .24, by = y - Math.sin(face) * .24, g = new RoundedBoxGeometry(.44, .42, .07, 5, .03);
  g.rotateX(-.18); g.rotateY(-face - Math.PI / 2); add(g, M.boucleOat, bx, .8, by);
  tube([[x - Math.cos(face) * .2, .5, y - Math.sin(face) * .2], [bx - Math.cos(face) * .02, .62, by - Math.sin(face) * .02]], .012, M.blackMetal, { seg: 6 });
}
function hobAt(x0, y0) { return P({ color: 0xffffff, map: planar(hobTex, x0, y0, .64, .52), roughness: .06, clearcoat: 1, clearcoatRoughness: .02 }); }
function artAt(tex, a, h1, w, h, flip) { return P({ color: 0xffffff, roughness: .92, map: planar(tex, a, h1, w, h, flip) }); }
function namedTyped(name, type, d, x, y, face = 0, opts) { const g = typed(type, d, x, y, face, opts); g.name = name; return g; }
function buildFurniture() { // loose items outside LAYOUTS.soft.build(): bedroom 2 bed group, curtains, west balcony, general lamps
  /* ---- Bedroom 1 curtains ---- */
  curtain('y', .1, 1.25, 1.6, .02, 2.74, M.sheer); curtain('y', .1, 3.63, 3.95, .02, 2.74, M.sheer);
  /* ---- Bedroom 2 (5.06 × 3.05) ---- */
  beginG('Bed (B2)'); bed(1.55, 7.13, 1.60, 2.00, -1, M.velvetSage, M.linenWhite, M.velvetToffee); endG();
  G('Nightstand', () => nightstand(.48, 6.81)); G('Nightstand', () => nightstand(2.62, 6.81));
  beginG('Wall art (B2)'); B(1.15, 7.13, 1.95, 7.10, 1.25, 1.96, M.oakFurn); B(1.18, 7.10, 1.92, 7.098, 1.28, 1.93, M.paper); B(1.24, 7.098, 1.86, 7.097, 1.34, 1.87, artAt(art2Tex, 1.24, 1.34, .62, .53, true)); endG();
  G('Rug (B2)', () => RB(.4, 4.55, 2.7, 6.6, 0, .014, .3, M.rugDark, { cast: false }));
  curtain('y', .1, 4.4, 4.72, .02, 2.74, M.sheer); curtain('y', .1, 6.73, 7.05, .02, 2.74, M.sheer);
  /* ---- Bathroom + hall lamps, hall panel ---- */
  lamp(5.9, 1.4, 2.6, 0xffe2c0, 4);
  B(6.6, 7.10, 7.0, 7.13, 1.5, 1.9, M.lacquerCream);
  lamp(6.9, 5.6, 2.6, 0xffdcb4, 5); lamp(5.9, 3.5, 2.6, 0xffdcb4, 4);
  /* ---- West balcony ---- */
  namedTyped('Lounge chair (loggia)', 'armchair', 4, -1.05, 2.2, FACE.W); namedTyped('Lounge chair (loggia)', 'armchair', 4, -1.05, 3.3, FACE.W);
  namedTyped('Side table (loggia)', 'sidetable', 0, -1.25, 2.75);
  G('Planter (W)', () => { pot(-1.5, 6.6, .2, .16, .46, M.stoneware); snake(-1.5, 6.6, 1); }); G('Planter (W)', () => { pot(-1.5, 1.0, .18, .14, .42, M.stonewareDark); fig(-1.5, 1.0, .75); });
  // the herb planter that stood on the east balcony before the Soft classic plan drew 55 numbers from the seeded generator here;
  // skip them so plants, hanging garments and books stay identical to the baseline screenshots
  for (let i = 0; i < 55; i++) rand();
}

/* ================= post-processing ================= */
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: .35, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = .9;
if (MOBILE) gtao.updateGtaoMaterial({ samples: 8 }), gtao.updatePdMaterial({ samples: 8 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new V2(1, 1), .18, .5, .92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ================= build ================= */
let ceiling;
async function build() {
  await frame(); await buildTextures(); buildMaterials();
  loader.textContent = 'Building apartment…'; await frame();
  ceiling = buildArchitecture(); buildFurniture();
  world.updateMatrixWorld(true);
  world.traverse(o => { if (o.isMesh && !o.userData.clamp) { const bb = new THREE.Box3().setFromObject(o); o.userData.minY = bb.min.y; o.userData.maxY = bb.max.y; } });
  setupOverlays(); applyLayout(); setMood(false); setView('overview', true);
  loader.hidden = true;
}

/* ================= labels / dims / furniture table ================= */
const labelsEl = document.getElementById('labels'), labels = [];
const dimGroup = new THREE.Group(); scene.add(dimGroup); dimGroup.visible = false;
function label(x, y, h, html, cls, group) { const d = document.createElement('div'); d.className = 'lbl ' + (cls || ''); d.innerHTML = html; labelsEl.appendChild(d);
  const L = { el: d, p: new V3(x, h, y), group }; labels.push(L); return L; }
let BASEFURN = [];
const sizeTxt = f => [f[4], f[5], f[6]].filter(Boolean).join(' × ');
// room length × width per wall arrangement (interior faces, metres) — shown with the Dims overlay and in the Dimensions panel
const RS_BASE = [['Bedroom 1', 2.3, 2.0, '4.60 × 3.98'], ['Bedroom 2', 2.5, 5.6, '5.06 × 3.05'], ['Bathroom', 5.88, 1.45, '2.38 × 2.77'], ['Guest WC', 7.96, 8.25, '1.80 × 1.67'],
  ['West balcony', -1.05, 3.5, '1.60 × 7.13'], ['East balcony', 14.8, 3.5, '1.88 × 7.13']];
const RS_CORR = ['Corridor', 5.88, 3.62, '2.38 × 1.53'];
const ROOM_SIZES = {
  softStudio: [['Bedroom 1', 1.55, 2.4, '3.19 × 3.98 + entry 1.30 × 0.93'], ['Walk-in closet', 3.94, 1.5, '1.30 × 2.95 (units 0.30 deep)'], ['Bedroom 2', 1.8, 5.6, '5.06 × 3.05'], RS_CORR, ['Hall', 7.0, 5.9, '3.70 × 2.73'], ['Studio (living + kitchen)', 10.4, 2.7, '6.45 × 4.32'], ['Office', 11.3, 5.9, '4.66 × 2.71']]
};
function roomSizes() {
  const extra = ROOM_SIZES.softStudio, list = [...RS_BASE.filter(r => !extra.some(e => e[0] === r[0])), ...extra];
  list.forEach(([n, x, y, t]) => { label(x, y, .6, `<b>${n}</b>${t} m`, 'dim', 'dim'); });
  document.getElementById('roomSizeTable').innerHTML = list.map(([n, , , t]) => `<tr><td>${n}</td><td>${t}</td></tr>`).join('');
}
function zoneLabels(L) {
  L.rooms.forEach(([x, y, n, a]) => label(x, y, .05, `<b>${n}</b>${a}`, '', 'room'));
  L.furn.forEach(f => { const l = label(f[1], f[2], f[3] + .05, `${f[0]}<i>${sizeTxt(f)}</i>`, 'furn', 'furn'); l.top = f[3] + .05; });
  document.getElementById('furnTable').innerHTML = [...BASEFURN, ...L.furn].map(f => `<tr><td>${f[0]}</td><td>${sizeTxt(f)}</td></tr>`).join('');
  roomSizes();
}
function setupOverlays() {
  [[2.3, 2.6, 'Bedroom 1', '≈18.3 m²'], [3.4, 5.5, 'Bedroom 2', '≈15.4 m²'], [5.9, 1.9, 'Bathroom', '≈6.6 m²'], 
   [7.96, 8.1, 'WC', '≈3.0 m²'], [-1.05, 4.6, 'Balcony', '11.0 m²'], [14.8, 4.6, 'Balcony', '12.9 m²']]
    .forEach(([x, y, n, a]) => label(x, y, .05, `<b>${n}</b>${a}`, '', 'room'));
  const dimMat = new THREE.LineBasicMaterial({ color: 0x2f6fd8 });
  function dim(x1, y1, x2, y2, txt) { const h = H + .12;
    dimGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(x1, h, y1), new V3(x2, h, y2)]), dimMat));
    const hz = Math.abs(x2 - x1) > Math.abs(y2 - y1);
    [[x1, y1], [x2, y2]].forEach(([x, y]) => dimGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hz ? [new V3(x, h, y - .12), new V3(x, h, y + .12)] : [new V3(x - .12, h, y), new V3(x + .12, h, y)]), dimMat)));
    label((x1 + x2) / 2, (y1 + y2) / 2, h, txt, 'dim', 'dim'); }
  dim(0, 3.4, 4.59, 3.4, '0.40 + 2.30 + 1.90 = 4.60'); dim(0, 6.9, 4.59, 6.9, '4.60'); dim(.2, 0, .2, 3.98, '3.98'); dim(.2, 4.08, .2, 7.13, '3.05');
  dim(7.17, .3, 13.62, .3, '6.45'); dim(13.3, 0, 13.3, 7.13, '7.13');
  dim(-1.85, 7.0, -.25, 7.0, '1.60'); dim(13.87, 7.0, 15.75, 7.0, '1.88');
  const FURN = [
    ['Platform bed 160 (B1)', 2.19, 1.62, .6, '2.00', '1.60', '0.54'], ['Platform bed 160 (B2)', 1.55, 6.0, .6, '1.60', '2.00', '0.54'],
    ['Beauty table + lit mirror (B1)', 1.15, 3.75, .75, '1.10', '0.46', '0.75'], ['Vanity stool (B1)', 1.15, 3.22, .47, 'Ø0.36', '', '0.46'], ['Work desk (B2)', 2.9, 4.43, .75, '0.90', '0.60', '0.75']];
  BASEFURN = FURN;
  FURN.forEach(f => { const L = label(f[1], f[2], f[3] + .05, `${f[0]}<i>${sizeTxt(f)}</i>`, 'furn', 'furn'); L.top = f[3] + .05; });
  document.getElementById('furnTable').innerHTML = FURN.map(f => `<tr><td>${f[0]}</td><td>${sizeTxt(f)}</td></tr>`).join('');
}

/* ================= modes ================= */
let night = false, cutOn = false, showRooms = true, showDims = false, showFurn = false;
function setMood(n) {
  night = n;
  document.getElementById('mday').setAttribute('aria-pressed', !n); document.getElementById('mnight').setAttribute('aria-pressed', n);
  scene.environment = n ? skyNight : skyDay; scene.background = n ? skyNight : skyDay;
  sun.visible = !n;
  nightLights.forEach(l => l.visible = n);
  emissives.forEach(m => m.emissiveIntensity = n ? m.userData.night : m.userData.day);
  bloom.strength = n ? .22 : .12;
  rebuildPT();
}
function applyCut(on) {
  cutOn = on;
  document.getElementById('wfull').setAttribute('aria-pressed', !on); document.getElementById('wcut').setAttribute('aria-pressed', on);
  for (const { me, h1, h2 } of clampables) { if (!on) { me.visible = true; me.scale.y = 1; me.position.y = (h1 + h2) / 2; continue; }
    if (h1 >= CUT) me.visible = false; else if (h2 > CUT) { const nh = CUT - h1; me.scale.y = nh / (h2 - h1); me.position.y = h1 + nh / 2; } }
  world.traverse(o => { if (!o.isMesh || o.userData.clamp) return;
    if (!on) { o.visible = true; o.scale.y = 1; return; }
    if (o.userData.clampMesh && o.userData.maxY > CUT) { o.scale.y = CUT / o.userData.maxY; return; }
    if (o.userData.minY >= CUT || o.userData.hideInCut) o.visible = false; });
  rebuildPT();
}

/* ================= camera views ================= */
const VIEWS = {
  overview: [[3.0, 12.5, 14.5], [7.0, 0, 3.6]], livingArea: [[9.6, 10.5, 1.2], [9.6, 0, 5.3]], top: [[7.0, 27, 3.801], [7.0, 0, 3.8]],
  living: [[1.5, 1.6, 6.75], [4.3, .75, 8.7]], kitchen: [[3.0, 1.65, 6.4], [5.3, .8, 8.9]],
  bed1: [[3.75, 1.55, .85], [1.9, .8, 3.6]], bed2: [[1.0, 1.55, 4.5], [4.7, .8, 6.5]],
  bath: [[6.7, 1.6, 2.55], [5.0, .85, .7]], hall: [[8.75, 1.45, 3.7], [5.5, 1.0, 6.7]], wc: [[8.6, 1.6, 7.5], [7.2, .8, 8.6]], office: [[7.9, 1.6, 2.9], [12.0, .85, .8]],
  loggiaW: [[-1.0, 1.6, 6.9], [-1.0, .6, 1.2]], loggiaE: [[14.8, 1.6, 6.8], [14.8, .6, 1.2]],
  entrance: [[6.25, 1.5, 6.95], [8.6, 1.2, 1.4]], closet: [[3.75, 1.55, .85], [1.9, .8, 3.6]], closet2: [[3.92, 1.6, 6.05], [4.95, 1.0, 7.05]], console: [[6.0, 1.55, 4.9], [8.86, 1.3, 6.0]], corridor: [[6.1, 1.55, 6.4], [5.9, 1.3, 2.9]]
};
let anim = null;
function setView(name, instant) {
  const [p, t] = VIEWS[name]; document.getElementById('view').value = name;
  const to = { p: new V3(...p), t: new V3(...t) };
  if (instant) { camera.position.copy(to.p); controls.target.copy(to.t); controls.update(); return; }
  anim = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, t0: performance.now() };
}
document.getElementById('view').onchange = e => setView(e.target.value);

/* ================= path tracer ("Photo render") ================= */
let pt = null, photo = false, ptDirty = false, lastCeil = null;
function rebuildPT() { if (photo) ptDirty = true; }
async function setPhoto(on) {
  const btn = document.getElementById('photo');
  if (!on) { photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = ''; return; }
  btn.setAttribute('aria-pressed', 'true');
  try {
    if (!pt) { statusEl.textContent = 'Loading renderer…'; await frame();
      const mod = await import('three-gpu-pathtracer');
      pt = new mod.WebGLPathTracer(renderer);
      pt.tiles.set(2, 2); pt.bounces = 6; pt.transmissiveBounces = 8; pt.filterGlossyFactor = .5; pt.minSamples = 3; pt.renderDelay = 0; pt.fadeDuration = 300;
      pt.renderScale = Math.min(1, 1.4 / DPR);
      pt.rasterizeSceneCallback = () => composer.render(); }
    statusEl.textContent = 'Preparing scene…'; await frame(); await frame();
    photo = true; pt.setScene(scene, camera); ptDirty = false;
  } catch (err) { console.warn(err); photo = false; btn.setAttribute('aria-pressed', 'false'); statusEl.textContent = 'Photo render unavailable on this device'; }
}
document.getElementById('photo').onclick = () => setPhoto(!photo);
controls.addEventListener('change', () => { if (photo && pt) pt.updateCamera(); });

/* ================= UI wiring ================= */
document.getElementById('wfull').onclick = () => applyCut(false);
document.getElementById('wcut').onclick = () => applyCut(true);
document.getElementById('mday').onclick = () => setMood(false);
document.getElementById('mnight').onclick = () => setMood(true);
const tog = (id, fn) => document.getElementById(id).onclick = e => e.currentTarget.setAttribute('aria-pressed', fn());
tog('tlab', () => showRooms = !showRooms);
tog('tdim', () => { showDims = !showDims; dimGroup.visible = showDims; return showDims; });
tog('tfur', () => showFurn = !showFurn);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setPixelRatio(DPR); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (photo && pt) pt.updateCamera();
}
addEventListener('resize', resize); resize();
{ const sp = document.getElementById('spec'), ly = document.getElementById('layouts'), narrow = () => innerWidth <= 700;
  sp.addEventListener('toggle', () => { if (sp.open && narrow()) ly.open = false; }); ly.addEventListener('toggle', () => { if (ly.open && narrow()) sp.open = false; });
  if (narrow()) { sp.open = false; ly.open = false; } }


/* ================= drag & drop furniture ================= */
// storage: one plan, so one key per kind (v3); keys of the removed layouts (…-v2:<layout>, palace1-layout-v4) are deleted once
const LKEY = 'palace1-pos-v3';
try { Object.keys(localStorage).filter(k => /^palace1-(pos-v2|style-v2|types-v2|layout-v4)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
const ray = new THREE.Raycaster(), ndc = new V2(), dragPlane = new THREE.Plane(new V3(0, 1, 0), 0), hitP = new V3();
let moveMode = false, sel = null, drag = null, selBox = null, photoWasOn = false;
const selPanel = document.getElementById('selpanel'), hintEl = document.getElementById('hint');
function visibleChain(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function movableOf(o) { for (; o && o !== world; o = o.parent) if (o.userData && o.userData.movable) return o; return null; }
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(world, true);
  for (const h of hits) { if (!h.object.isMesh || !visibleChain(h.object)) continue; if (h.object.material === M.sheer) continue; return { g: movableOf(h.object), point: h.point }; }
  return null;
}
function attachLabels() {
  const boxes = movables.map(g => { const bb = new THREE.Box3().setFromObject(g); return { g, bb, area: (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) }; });
  for (const L of labels) { if (L.group !== 'furn') continue;
    let best = null; for (const b of boxes) if (L.p.x >= b.bb.min.x - .05 && L.p.x <= b.bb.max.x + .05 && L.p.z >= b.bb.min.z - .05 && L.p.z <= b.bb.max.z + .05 && (!best || b.area < best.area)) best = b;
    if (best) { L.grp = best.g; L.local = best.g.worldToLocal(L.p.clone()); } }
}
function saveLayout() { try { const d = movables.map(g => [+(g.position.x.toFixed(3)), +(g.position.z.toFixed(3)), +(g.rotation.y.toFixed(4)), +(g.scale.x.toFixed(4)), +(g.scale.y.toFixed(4)), +(g.scale.z.toFixed(4))]); localStorage.setItem(LKEY, JSON.stringify(d)); } catch (e) {} }
function loadLayout() { try { const d = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (!Array.isArray(d) || d.length !== movables.length) return;
  d.forEach(([x, z, r, sx, sy, sz], i) => { const g = movables[i]; g.position.x = x; g.position.z = z; g.rotation.y = r; if (sx) applyScale(g, sx, sy, sz); }); } catch (e) {} }
function fmtPos(g) { const deg = Math.round(((-g.rotation.y * 180 / Math.PI) % 360 + 360) % 360);
  const dx = g.position.x - g.userData.home.x, dz = g.position.z - g.userData.home.z;
  return `x ${g.position.x.toFixed(2)} m · y ${g.position.z.toFixed(2)} m · ${deg}°` + (Math.hypot(dx, dz) > .005 ? ` · moved ${Math.hypot(dx, dz).toFixed(2)} m` : ''); }
function select(g) {
  sel = g; if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; }
  selPanel.hidden = !g; if (!g) return;
  selBox = new THREE.BoxHelper(g, 0x2f6fd8); selBox.material.depthTest = false; selBox.material.transparent = true; selBox.renderOrder = 10; scene.add(selBox);
  document.getElementById('selname').textContent = g.name; document.getElementById('selpos').textContent = fmtPos(g);
  renderParts(g); renderSize(g);
}
function changed() { if (!sel) return; selBox && selBox.update(); document.getElementById('selpos').textContent = fmtPos(sel); renderSize(sel); saveLayout(); rebuildPT(); }
function applyScale(g, sx, sy, sz) { g.scale.set(sx, sy, sz); g.position.y = g.userData.minY0 * (1 - sy); }
function renderSize(g) { const s = g.userData.size;
  [['szW', s.x * g.scale.x], ['szD', s.z * g.scale.z], ['szH', s.y * g.scale.y]].forEach(([id, v]) => { const el = document.getElementById(id); if (document.activeElement !== el) el.value = v.toFixed(2); }); }
function setSize(axis, val) { if (!sel || !(val > .04)) return; const s = sel.userData.size, k = { x: 'x', y: 'y', z: 'z' }[axis];
  const base = s[k], ratio = Math.min(4, Math.max(.2, val / base)); let { x, y, z } = sel.scale;
  if (document.getElementById('szLock').checked) { const f = ratio / sel.scale[k]; x *= f; y *= f; z *= f; } else { if (k === 'x') x = ratio; if (k === 'y') y = ratio; if (k === 'z') z = ratio; }
  applyScale(sel, x, y, z); changed(); }
[['szW', 'x'], ['szD', 'z'], ['szH', 'y']].forEach(([id, a]) => { const el = document.getElementById(id);
  el.addEventListener('change', () => setSize(a, parseFloat(el.value)));
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { setSize(a, parseFloat(el.value)); el.blur(); } ev.stopPropagation(); }); });
document.getElementById('szReset').onclick = () => { if (sel) { applyScale(sel, 1, 1, 1); changed(); } };
function rotateSel(deg) { if (!sel) return; sel.rotation.y -= deg * Math.PI / 180; changed(); }
function setMove(on) {
  if (on && swapMode) setSwap(false);
  moveMode = on; document.getElementById('move').setAttribute('aria-pressed', on);
  hintEl.textContent = on ? 'Click furniture to change colours and finishes · drag to move · drag empty space to orbit' : 'Drag rotate · Right-drag pan · Scroll zoom';
  if (!on) select(null); renderer.domElement.style.cursor = '';
}
document.getElementById('move').onclick = () => setMove(!moveMode);
document.getElementById('rotL').onclick = () => rotateSel(-15);
document.getElementById('rotR').onclick = () => rotateSel(15);
document.getElementById('rot90').onclick = () => rotateSel(90);
document.getElementById('selReset').onclick = () => { if (!sel) return; const h = sel.userData.home; sel.position.x = h.x; sel.position.z = h.z; sel.rotation.y = h.r || 0; changed(); };
document.getElementById('resetAll').onclick = () => { movables.forEach(g => { const h = g.userData.home; g.position.x = h.x; g.position.z = h.z; g.rotation.y = h.r || 0; applyScale(g, 1, 1, 1); resetLook(g, true); }); saveStyle(); if (sel) renderParts(sel); try { localStorage.removeItem(LKEY); } catch (e) {} if (sel) changed(); rebuildPT(); };
document.getElementById('selDone').onclick = () => select(null);
stage.addEventListener('pointerdown', ev => {
  if (!moveMode || ev.button !== 0) return;
  const h = pick(ev); if (!h || !h.g) return;
  ev.stopPropagation(); controls.enabled = false;
  select(h.g);
  dragPlane.set(new V3(0, 1, 0), -h.point.y);
  ray.ray.intersectPlane(dragPlane, hitP);
  drag = { id: ev.pointerId, off: new V3(h.g.position.x - hitP.x, 0, h.g.position.z - hitP.z) };
  if (photo) { photoWasOn = true; setPhoto(false); }
  renderer.domElement.setPointerCapture(ev.pointerId); renderer.domElement.style.cursor = 'grabbing';
}, { capture: true });
renderer.domElement.addEventListener('pointermove', ev => {
  if (drag && ev.pointerId === drag.id) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(dragPlane, hitP)) { const st = ev.shiftKey ? .1 : .01;
      sel.position.x = Math.round((hitP.x + drag.off.x) / st) * st; sel.position.z = Math.round((hitP.z + drag.off.z) / st) * st;
      selBox && selBox.update(); document.getElementById('selpos').textContent = fmtPos(sel); }
    return;
  }
  if (moveMode && ev.pointerType === 'mouse' && !ev.buttons) { const h = pick(ev); renderer.domElement.style.cursor = h && h.g ? 'grab' : ''; }
});
function endDrag(ev) { if (!drag || ev.pointerId !== drag.id) return; drag = null; controls.enabled = true; renderer.domElement.style.cursor = 'grab';
  try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) {} changed(); if (photoWasOn) { photoWasOn = false; setPhoto(true); } }
renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag);
addEventListener('keydown', ev => {
  if (!moveMode || !sel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const st = ev.shiftKey ? .1 : .01; let used = true;
  if (ev.key === 'ArrowLeft') sel.position.x -= st; else if (ev.key === 'ArrowRight') sel.position.x += st;
  else if (ev.key === 'ArrowUp') sel.position.z -= st; else if (ev.key === 'ArrowDown') sel.position.z += st;
  else if (ev.key === 'r' || ev.key === 'R') { rotateSel(ev.shiftKey ? -15 : 90); return; }
  else if (ev.key === 'Escape') { select(null); return; } else used = false;
  if (used) { ev.preventDefault(); changed(); }
});


/* ================= colours, finishes and style presets ================= */
const SKEY = 'palace1-style-v3', DS = THREE.DoubleSide;
const CAT = {};
['boucle', 'boucleOat', 'linenWhite', 'linenSand', 'linenSage', 'linenOut', 'velvetTerra', 'velvetSage', 'velvetToffee', 'velvetChoco', 'towel', 'rattan'].forEach(k => CAT[k] = 'fab');
['walnut', 'oakFurn', 'rattanDark'].forEach(k => CAT[k] = 'wood');
['lacquerCream', 'lacquerChoco'].forEach(k => CAT[k] = 'laq');
['brass', 'steel', 'steelDark', 'blackMetal', 'frame'].forEach(k => CAT[k] = 'met');
['trav', 'travSmall', 'marble', 'resin', 'ceramic', 'stoneware', 'stonewareDark'].forEach(k => CAT[k] = 'stone');
const PART_NAME = { boucle: 'Main upholstery', boucleOat: 'Seat cushion', linenWhite: 'White linen', linenSand: 'Sand linen', linenSage: 'Sage linen', linenOut: 'Outdoor cushions',
  velvetTerra: 'Accent fabric', velvetSage: 'Second accent', velvetToffee: 'Third accent', velvetChoco: 'Throw', towel: 'Towels', rattan: 'Woven seat',
  walnut: 'Wood', oakFurn: 'Light wood', rattanDark: 'Rattan frame', lacquerCream: 'Fronts', lacquerChoco: 'Fronts',
  brass: 'Metal details', steel: 'Steel', steelDark: 'Steel', blackMetal: 'Black metal', frame: 'Frame',
  trav: 'Top / stone', travSmall: 'Stone', marble: 'Marble', resin: 'Solid surface', ceramic: 'Ceramic', stoneware: 'Stoneware', stonewareDark: 'Stoneware' };
const FIN = { fab: ['Bouclé', 'Velvet', 'Linen', 'Leather', 'Rattan'], wood: ['Walnut', 'Oak', 'Ash', 'Black oak'], laq: ['Gloss', 'Matte', 'Veneer'],
  met: ['Brass', 'Chrome', 'Black', 'Bronze'], stone: ['Travertine', 'Red marble', 'Concrete', 'Solid white'] };
const FIN_OF = { boucle: 'Bouclé', boucleOat: 'Bouclé', towel: 'Bouclé', linenWhite: 'Linen', linenSand: 'Linen', linenSage: 'Linen', linenOut: 'Linen', rattan: 'Rattan',
  velvetTerra: 'Velvet', velvetSage: 'Velvet', velvetToffee: 'Velvet', velvetChoco: 'Velvet', walnut: 'Walnut', oakFurn: 'Oak', rattanDark: 'Walnut',
  lacquerCream: 'Gloss', lacquerChoco: 'Gloss', brass: 'Brass', steel: 'Chrome', steelDark: 'Chrome', blackMetal: 'Black', frame: 'Black',
  trav: 'Travertine', travSmall: 'Travertine', marble: 'Red marble', resin: 'Solid white', ceramic: 'Solid white', stoneware: 'Concrete', stonewareDark: 'Concrete' };
const FIN_COLOR = { Walnut: '#7a5236', Oak: '#d2a676', Ash: '#e8d6b8', 'Black oak': '#2a221d', Brass: '#d8b273', Chrome: '#e2e2e4', Black: '#1a1918', Bronze: '#7d5636',
  Travertine: '#ffffff', 'Red marble': '#ffffff', Concrete: '#e2dcd2', 'Solid white': '#f4f2ee', Veneer: '#a77a52' };
const SW = {
  fab: ['#f0e9de', '#d9ccb8', '#dcc3a0', '#ae4f2c', '#c98a3a', '#75845f', '#2f5d62', '#2d4a8a', '#6b1f2a', '#4b2d22', '#3a3a3c'],
  wood: ['#e8d6b8', '#d2a676', '#b98c5a', '#7a5236', '#4a3424', '#2a221d'],
  laq: ['#f4f2ee', '#e8dfd2', '#b9ab95', '#7d8b6d', '#2f4a5a', '#8a6d55', '#4a2f24', '#1d1c1b'],
  met: ['#d8b273', '#e6c57a', '#e2e2e4', '#8a8a8c', '#7d5636', '#1a1918'],
  stone: ['#ffffff', '#efe6da', '#d8cfc4', '#a89a8c', '#5a524c', '#2b2b2b'] };
function makeFinish(fin, color) {
  let m;
  switch (fin) {
    case 'Bouclé': m = T('boucle', .16, { sheen: 1, sheenColor: 0xffffff, sheenRoughness: .7, normalScale: 1.4, side: DS }); break;
    case 'Velvet': m = T('velvet', .25, { sheen: 1, sheenColor: 0xffffff, sheenRoughness: .32, normalScale: .5, side: DS }); break;
    case 'Linen': m = T('linen', .1, { sheen: .6, sheenColor: 0xffffff, sheenRoughness: .5, side: DS }); break;
    case 'Leather': m = T('micro', .3, { roughness: .6, clearcoat: .35, clearcoatRoughness: .45, normalScale: .7, side: DS }); break;
    case 'Rattan': m = T('linen', .045, { roughness: 1, normalScale: 3, side: DS }); break;
    case 'Walnut': case 'Oak': case 'Ash': case 'Black oak': case 'Veneer': m = T('wood', .7, {}); break;
    case 'Gloss': m = P({ roughness: .32, clearcoat: 1, clearcoatRoughness: .1 }); break;
    case 'Matte': m = P({ roughness: .78 }); break;
    case 'Brass': m = P({ metalness: 1, roughness: .26 }); break;
    case 'Chrome': m = P({ metalness: 1, roughness: .07 }); break;
    case 'Black': m = P({ metalness: .6, roughness: .5 }); break;
    case 'Bronze': m = P({ metalness: 1, roughness: .38 }); break;
    case 'Travertine': m = T('trav', 1.2, { normalScale: .5 }); break;
    case 'Red marble': m = T('marble', 1.4, { clearcoat: .7, clearcoatRoughness: .06 }); break;
    case 'Concrete': m = T('micro', 1.2, { normalScale: .6 }); break;
    default: m = P({ roughness: .28, clearcoat: .4 });
  }
  m.color.set(color); return m;
}
// global style presets recolour the shared materials (pieces you customised keep their own look)
const PRESETS = {
  warm: {},
  soft: { boucle: '#efe7da', boucleOat: '#e3d6c3', linenWhite: '#f3eee6', linenSand: '#ddcdb6', linenSage: '#cbbfa9', velvetTerra: '#c9b49a', velvetSage: '#bba98f', velvetToffee: '#a89070', velvetChoco: '#8c7a66',
    walnut: '#c4a27a', oakFurn: '#d8bc94', rattanDark: '#b89a74', lacquerCream: '#dccbb5', lacquerChoco: '#cdb89d', brass: '#d9b878', stoneware: '#e2d6c5', linenOut: '#eee6da' },
  nordic: { boucle: '#eeebe6', boucleOat: '#d8d3cb', velvetTerra: '#8fa3b8', velvetSage: '#a9b5a0', velvetToffee: '#c9b79c', velvetChoco: '#6b7a8a', linenSand: '#e3dfd8', linenSage: '#c9d0c4',
    walnut: '#d9bf98', oakFurn: '#ead7b8', rattanDark: '#c9b08a', lacquerChoco: '#f2f0ec', lacquerCream: '#f8f7f4', brass: '#d9d9db', linenOut: '#f0ede8' },
  japandi: { boucle: '#e4dccf', boucleOat: '#b9ab95', velvetTerra: '#8a6e52', velvetSage: '#6f7a5c', velvetToffee: '#a08462', velvetChoco: '#3a332c', linenSand: '#cfc3ae',
    walnut: '#4a3a2c', oakFurn: '#c8ad86', rattanDark: '#5a4632', lacquerChoco: '#3a332c', lacquerCream: '#dcd2c3', brass: '#2a2826' },
  luxe: { boucle: '#3d3936', boucleOat: '#5a524a', velvetTerra: '#6b1f2a', velvetSage: '#2f4a3c', velvetToffee: '#8a6a3a', velvetChoco: '#1f1a18', linenSand: '#5c544c', linenWhite: '#d6d0c7',
    walnut: '#3b2618', oakFurn: '#5a4030', lacquerChoco: '#1d1b1a', lacquerCream: '#2c2a28', brass: '#e2bf7a', linenOut: '#4a4541' },
  midcentury: { boucle: '#b8862b', boucleOat: '#d9c7a0', velvetTerra: '#2f5d62', velvetSage: '#c96b2c', velvetToffee: '#7a4a2a', velvetChoco: '#3d2b1f', linenSand: '#d8c39a',
    walnut: '#6e4527', oakFurn: '#9b6a3e', lacquerChoco: '#6e4527', lacquerCream: '#efe6d4', brass: '#d8b273' } };
let BASE = null, curPreset = 'warm';
function applyPreset(name) {
  if (!BASE) { BASE = {}; for (const k in CAT) BASE[k] = M[k].color.getHex(); }
  curPreset = PRESETS[name] ? name : 'warm'; document.getElementById('style').value = curPreset;
  for (const k in CAT) M[k].color.set(PRESETS[curPreset][k] || BASE[k]);
  if (sel) renderParts(sel); rebuildPT();
}
function applyPart(g, key, fin, color, save = true) {
  const m = makeFinish(fin, color);
  g.traverse(o => { if (o.isMesh && o.userData.mkey === key) o.material = m; });
  g.userData.custom[key] = { fin, color };
  if (save) { saveStyle(); rebuildPT(); }
}
function resetLook(g, quiet) { g.traverse(o => { if (o.isMesh && o.userData.mkey) o.material = M[o.userData.mkey]; }); g.userData.custom = {}; if (!quiet) { saveStyle(); rebuildPT(); } }
function saveStyle() { try { const custom = {}; movables.forEach((g, i) => { if (Object.keys(g.userData.custom).length) custom[i] = g.userData.custom; });
  localStorage.setItem(SKEY, JSON.stringify({ preset: curPreset, custom })); } catch (e) {} }
function loadStyle() { let d = null; try { d = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) {}
  applyPreset(d && d.preset || LAYOUTS.soft.preset);
  if (d && d.custom) for (const i in d.custom) { const g = movables[i]; if (!g) continue; for (const k in d.custom[i]) { const c = d.custom[i][k]; if (CAT[k]) applyPart(g, k, c.fin, c.color, false); } } }
function partsOf(g) { const cnt = {}; g.traverse(o => { const k = o.isMesh && o.userData.mkey; if (k && CAT[k]) cnt[k] = (cnt[k] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6); }
function renderParts(g) {
  const box = document.getElementById('selparts'); box.textContent = '';
  for (const key of partsOf(g)) {
    const cat = CAT[key], cur = g.userData.custom[key];
    let mesh = null; g.traverse(o => { if (!mesh && o.isMesh && o.userData.mkey === key) mesh = o; });
    const fin = cur ? cur.fin : FIN_OF[key], color = '#' + mesh.material.color.getHexString();
    const wrap = document.createElement('div'); wrap.className = 'part';
    const h = document.createElement('h3'); h.textContent = PART_NAME[key] + ' · ' + fin; wrap.appendChild(h);
    const chips = document.createElement('div'); chips.className = 'chips';
    FIN[cat].forEach(f => { const b = document.createElement('button'); b.textContent = f; b.setAttribute('aria-pressed', f === fin);
      b.onclick = () => { applyPart(g, key, f, FIN_COLOR[f] || color); renderParts(g); }; chips.appendChild(b); });
    wrap.appendChild(chips);
    const sws = document.createElement('div'); sws.className = 'sws';
    SW[cat].forEach(c => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Colour ' + c);
      b.setAttribute('aria-pressed', c.toLowerCase() === color.toLowerCase()); b.onclick = () => { applyPart(g, key, fin, c); renderParts(g); }; sws.appendChild(b); });
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = color; inp.title = 'Custom colour'; inp.id = 'col-' + key;
    inp.oninput = () => { mesh.material === M[key] ? applyPart(g, key, fin, inp.value, false) : g.traverse(o => { if (o.isMesh && o.userData.mkey === key) o.material.color.set(inp.value); }); g.userData.custom[key] = { fin, color: inp.value }; };
    inp.onchange = () => { saveStyle(); rebuildPT(); renderParts(g); };
    sws.appendChild(inp); wrap.appendChild(sws); box.appendChild(wrap);
  }
}
document.getElementById('style').onchange = e => { applyPreset(e.target.value); saveStyle(); };
document.getElementById('lookReset').onclick = () => { if (sel) { resetLook(sel); renderParts(sel); } };


/* ================= furniture designs (swap mode) + living layouts ================= */
// every design is built around (0,0) in plan; the sitter / front faces -y (north) at rotation 0
const FACE = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const faceTo = (x, y, tx, ty) => Math.atan2(-(tx - x), -(ty - y));
const legs4 = (x1, y1, x2, y2, h, r, m, inset = .06, rt) => [[x1 + inset, y1 + inset], [x2 - inset, y1 + inset], [x1 + inset, y2 - inset], [x2 - inset, y2 - inset]].forEach(([x, y]) => C(x, y, r, 0, h, m, { seg: 14, rt: rt ?? r }));
function cylAlong(axis, x, y, h, r, len, m) { const g = new THREE.CylinderGeometry(r, r, len, 28); axis === 'x' ? g.rotateZ(Math.PI / 2) : g.rotateX(Math.PI / 2); return add(g, m, x, h, y); }
const DESIGNS = {
  sofa: { label: 'Sofa', items: [
    { name: 'Bouclé modern', info: '2.20 × 0.90 · 3 seats', build: (o) => { const W = o.W || 2.2, x1 = -W / 2, x2 = W / 2, y1 = -.45, y2 = .45;
      B(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); RB(x1, y1, x2, y2, .08, .36, .04, M.boucle);
      RB(x1, y1, x1 + .18, y2, .08, .62, .06, M.boucle, { seg: 5 }); RB(x2 - .18, y1, x2, y2, .08, .62, .06, M.boucle, { seg: 5 });
      const n = W >= 2 ? 3 : 2, w = (W - .36) / n;
      for (let i = 0; i < n; i++) { const a = x1 + .18 + i * w + .01, b = a + w - .02; RB(a, y1 + .02, b, y2 - .28, .34, .50, .06, M.boucle, { seg: 5 }); RB(a, y2 - .27, b, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); }
      pillow(x1 + .44, .09, .64, .44, .15, .44, M.velvetTerra, 1.2, Math.PI); pillow(x2 - .44, .09, .64, .44, .15, .44, M.velvetSage, 1.2, Math.PI);
      drape(x2 - .18, y1 + .1, x2 + .01, y1 + .55, .64, .14, .05, 1, M.velvetChoco); } },
    { name: 'Chesterfield', info: '2.10 × 0.92 · tufted velvet', build: (o) => { const W = o.W || 2.1, x1 = -W / 2, x2 = W / 2, y1 = -.46, y2 = .46;
      [[x1 + .08, y1 + .08], [x2 - .08, y1 + .08], [x1 + .08, y2 - .08], [x2 - .08, y2 - .08]].forEach(([x, y]) => lathe([[0, 0], [.03, 0], [.045, .04], [.035, .09], [0, .09]], x, y, 0, M.walnut));
      RB(x1, y1, x2, y2, .09, .42, .02, M.velvetChoco);
      [x1 + .11, x2 - .11].forEach(x => { RB(x - .11, y1, x + .11, y2, .09, .62, .02, M.velvetChoco); cylAlong('y', x, 0, .64, .13, y2 - y1, M.velvetChoco); });
      RB(x1 + .2, y2 - .22, x2 - .2, y2, .42, .78, .02, M.velvetChoco); cylAlong('x', 0, y2 - .12, .78, .11, W - .3, M.velvetChoco);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) S(x1 + .3 + i * (W - .6) / 8 + (r ? (W - .6) / 16 : 0), y2 - .225, .52 + r * .14, .012, M.velvetChoco);
      RB(x1 + .22, y1 + .03, x2 - .22, y2 - .22, .42, .56, .05, M.velvetChoco, { seg: 5 });
      pillow(x1 + .5, .1, .66, .42, .14, .42, M.linenSand, 1.2, Math.PI); } },
    { name: 'Mid-century', info: '1.90 × 0.85 · on walnut legs', build: (o) => { const W = o.W || 1.9, x1 = -W / 2, x2 = W / 2, y1 = -.425, y2 = .425;
      [[x1 + .08, y1 + .08], [x2 - .08, y1 + .08], [x1 + .08, y2 - .08], [x2 - .08, y2 - .08], [0, y1 + .08], [0, y2 - .08]].forEach(([x, y]) => C(x, y, .022, 0, .2, M.walnut, { rt: .014, seg: 12 }));
      B(x1, y1, x2, y2, .2, .24, M.walnut); RB(x1 + .02, y1 + .02, x2 - .02, y2 - .02, .24, .38, .02, M.linenSand);
      RB(x1, y1, x1 + .09, y2, .24, .6, .02, M.linenSand); RB(x2 - .09, y1, x2, y2, .24, .6, .02, M.linenSand);
      const w = (W - .2) / 2; for (let i = 0; i < 2; i++) { const a = x1 + .1 + i * w + .005, b = a + w - .01;
        RB(a, y1 + .03, b, y2 - .22, .38, .5, .03, M.linenSand, { seg: 4 }); RB(a, y2 - .21, b, y2 - .03, .4, .82, .03, M.linenSand, { seg: 4 });
        [.55, .7].forEach(h => S((a + b) / 2, y2 - .215, h, .012, M.linenSand)); }
      pillow(x1 + .4, .05, .62, .4, .13, .4, M.velvetTerra, 1.25, Math.PI); } },
    { name: 'Cloud modular', info: '2.30 × 1.05 · deep & low', build: (o) => { const W = o.W || 2.3, x1 = -W / 2, x2 = W / 2, y1 = -.525, y2 = .525;
      RB(x1, y1, x2, y2, 0, .28, .1, M.boucle, { seg: 5 });
      [x1 + .16, x2 - .16].forEach(x => { const g = pillowGeo(.34, .58, 1.0, .5); add(g, M.boucle, x, .32, 0); });
      const w = (W - .34) / 3; for (let i = 0; i < 3; i++) { const cx = x1 + .32 + w * i + w / 2 - .15;
        add(pillowGeo(w - .02, .24, .78, .6), M.boucle, x1 + .17 + w * i + w / 2, .38, y1 + .41);
        pillow(x1 + .17 + w * i + w / 2, y2 - .17, .58, w - .04, .26, .5, M.boucle, 1.35, Math.PI); }
      pillow(x1 + .55, -.05, .62, .4, .14, .4, M.velvetSage, 1.2, Math.PI); } },
    { name: 'Corner chaise (L)', info: '2.20 × 2.10 · chaise on the left', build: (o) => { const x1 = -1.1, x2 = 1.1, y1 = -.45, y2 = .45, cy1 = -1.65, cx2 = -.2;
      B(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); B(x1 + .07, cy1 + .07, cx2 - .07, y1 + .07, 0, .08, M.carcass);
      RB(x1, y1, x2, y2, .08, .36, .04, M.boucle); RB(x1, cy1, cx2, y1 + .02, .08, .36, .04, M.boucle);
      RB(x2 - .18, y1, x2, y2, .08, .62, .06, M.boucle, { seg: 5 });
      RB(x1 + .02, y2 - .27, x1 + .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .29, y2 - .27, .07, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); RB(.09, y2 - .27, x2 - .2, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .02, cy1 + .05, x1 + .27, -.6, .34, .84, .07, M.boucle, { seg: 5 }); RB(x1 + .02, -.58, x1 + .27, y2 - .29, .34, .84, .07, M.boucle, { seg: 5 });
      RB(x1 + .29, cy1 + .02, cx2 - .02, y1 - .01, .34, .50, .06, M.boucle, { seg: 5 });
      [[x1 + .29, .12], [.14, x2 - .2]].forEach(([a, b]) => RB(a, y1 + .01, b, y2 - .29, .34, .50, .06, M.boucle, { seg: 5 }));
      pillow(-.35, .05, .64, .46, .15, .46, M.velvetTerra, 1.2, Math.PI); pillow(-.65, .0, .64, .46, .15, .46, M.velvetSage, 1.2, Math.PI * .75);
      pillow(-.68, -1.15, .64, .42, .15, .42, M.velvetToffee, 1.2, Math.PI / 2); } },
    { name: 'Curved', info: '2.30 wide · arc back', build: () => { const cy = -1.7, A = .62, a1 = Math.PI / 2 - A, a2 = Math.PI / 2 + A;
      sector(0, cy, 1.25, 1.95, a1 + .02, a2 - .02, 0, .08, M.carcass, .01); sector(0, cy, 1.15, 2.05, a1, a2, .08, .34, M.boucleOat, .05);
      sector(0, cy, 1.18, 1.8, a1 + .1, a2 - .1, .33, .5, M.boucleOat, .06); sector(0, cy, 1.76, 2.03, a1, a2, .33, .84, M.boucleOat, .075);
      [-.3, 0, .3].forEach((d, i) => { const a = Math.PI / 2 + d, r = 1.7; pillow(r * Math.cos(a), cy + r * Math.sin(a), .64, .42, .15, .42, [M.velvetTerra, M.linenSand, M.velvetSage][i], 1.2, Math.atan2(-Math.cos(a), -Math.sin(a))); }); } } ,
    { name: 'Corner chaise (R)', info: '2.20 × 2.10 · chaise on the right', build: (o) => { const X = v => -v, R = (a, b, c, d, h1, h2, r, m, o) => RB(Math.min(X(a), X(b)), c, Math.max(X(a), X(b)), d, h1, h2, r, m, o), BB = (a, b, c, d, h1, h2, m) => B(X(a), b, X(c), d, h1, h2, m);
      const W = o.W || 2.2, x1 = -W / 2, x2 = W / 2, y1 = -.45, y2 = .45, cy1 = -1.65, cx2 = x1 + .9;
      BB(x1 + .07, y1 + .07, x2 - .07, y2 - .07, 0, .08, M.carcass); BB(x1 + .07, cy1 + .07, cx2 - .07, y1 + .07, 0, .08, M.carcass);
      R(x1, x2, y1, y2, .08, .36, .04, M.boucle); R(x1, cx2, cy1, y1 + .02, .08, .36, .04, M.boucle);
      R(x2 - .18, x2, y1, y2, .08, .62, .06, M.boucle, { seg: 5 });
      R(x1 + .02, x1 + .27, y2 - .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 });
      { const a = x1 + .29, b = x2 - .2, n = Math.max(2, Math.round((b - a) / .66)), w = (b - a) / n;
        for (let i = 0; i < n; i++) { const p = a + i * w + (i ? .01 : 0), q = a + (i + 1) * w - (i < n - 1 ? .01 : 0);
          R(p, q, y2 - .27, y2 - .02, .34, .84, .07, M.boucle, { seg: 5 }); R(p, q, y1 + .01, y2 - .29, .34, .50, .06, M.boucle, { seg: 5 }); } }
      R(x1 + .02, x1 + .27, cy1 + .05, -.6, .34, .84, .07, M.boucle, { seg: 5 }); R(x1 + .02, x1 + .27, -.58, y2 - .29, .34, .84, .07, M.boucle, { seg: 5 });
      R(x1 + .29, cx2 - .02, cy1 + .02, y1 - .01, .34, .50, .06, M.boucle, { seg: 5 });
      pillow(-(x1 + 1.45), .05, .64, .46, .15, .46, M.velvetTerra, 1.2, Math.PI); pillow(-(x1 + 1.75), .0, .64, .46, .15, .46, M.velvetSage, 1.2, -Math.PI * .75);
      pillow(-(x1 + .42), -1.15, .64, .42, .15, .42, M.velvetToffee, 1.2, -Math.PI / 2); } } ] },
  coffee: { label: 'Coffee table', items: [
    { name: 'Travertine slab', info: '0.80 × 0.45 × 0.38', build: () => { B(-.34, -.165, .34, .165, .01, .30, M.walnut); RB(-.4, -.225, .4, .225, .30, .38, .012, M.trav); book(-.2, -.05, .38, .22, .16, .03, M.book2, .2); S(.22, .01, .43, .045, M.stonewareDark); } },
    { name: 'Round marble', info: 'Ø0.70 × 0.38', build: () => { lathe([[0, 0], [.2, 0], [.21, .02], [.12, .08], [.08, .3], [0, .3]], 0, 0, 0, M.brass); lathe([[0, .3], [.35, .3], [.35, .38], [0, .38]], 0, 0, 0, M.marble, { seg: 96 }); vase(.1, .05, .38, .6, M.ceramic); } },
    { name: 'Oval walnut', info: '1.00 × 0.55 × 0.36', build: () => { lathe([[0, .32], [.5, .32], [.5, .36], [0, .36]], 0, 0, 0, M.walnut, { sz: .55, seg: 96 }); [[-.32, -.12], [.32, -.12], [0, .17]].forEach(([x, y]) => C(x, y, .025, 0, .32, M.walnut, { rt: .018, seg: 12 })); book(-.15, 0, .36, .2, .15, .03, M.book1, .3); } },
    { name: 'Glass & brass', info: '0.90 × 0.50 × 0.40', build: () => { const x = .45, y = .25; [[-x, -y], [x, -y], [-x, y], [x, y]].forEach(([a, b]) => B(a - .01, b - .01, a + .01, b + .01, 0, .4, M.brass));
      [-y, y].forEach(b => { B(-x, b - .01, x, b + .01, .38, .4, M.brass); B(-x, b - .01, x, b + .01, .08, .1, M.brass); }); [-x, x].forEach(a => { B(a - .01, -y, a + .01, y, .38, .4, M.brass); });
      B(-x + .01, -y + .01, x - .01, y - .01, .39, .402, M.glassTint, { cast: false }); B(-x + .01, -y + .01, x - .01, y - .01, .09, .11, M.oakFurn); S(.15, .05, .44, .04, M.stonewareDark); } },
    { name: 'Nesting pair', info: 'Ø0.55 + Ø0.40', build: () => { [[-.12, 0, .275, .42], [.24, .12, .2, .34]].forEach(([x, y, r, h]) => { C(x, y, r, h - .025, h, M.oakFurn, { seg: 64 }); [0, 2.09, 4.19].forEach(a => C(x + Math.cos(a) * (r - .06), y + Math.sin(a) * (r - .06), .012, 0, h - .025, M.blackMetal, { seg: 8 })); }); } },
    { name: 'Bouclé ottoman', info: '0.80 × 0.60 × 0.42', build: () => { RB(-.4, -.3, .4, .3, .03, .42, .1, M.boucleOat, { seg: 6 }); RB(-.18, -.12, .18, .12, .42, .44, .02, M.walnut); S(0, 0, .48, .04, M.brass); } },
    { name: 'Rect travertine 1.20', info: '1.20 × 0.60 × 0.38', build: () => { B(-.5, -.22, -.38, .22, .01, .30, M.walnut); B(.38, -.22, .5, .22, .01, .30, M.walnut); RB(-.6, -.3, .6, .3, .30, .38, .012, M.trav); book(-.3, -.05, .38, .24, .17, .035, M.book2, .2); book(-.3, -.05, .415, .2, .14, .03, M.book3, .1); S(.3, .02, .44, .05, M.stonewareDark); lathe([[0, 0], [.05, 0], [.06, .1], [.04, .2], [0, .21]], .05, .1, .38, M.stoneware); } }
  ] },
  dining: { label: 'Dining table', items: [
    { name: 'Tulip, travertine', info: 'Ø0.90 · seats 4', build: () => { lathe([[0, 0], [.27, 0], [.275, .015], [.2, .03], [.07, .1], [.05, .4], [.09, .64], [.2, .7], [0, .7]], 0, 0, 0, M.resin); lathe([[0, .7], [.43, .7], [.45, .715], [.45, .735], [.44, .75], [0, .75]], 0, 0, 0, M.trav, { seg: 96 }); } },
    { name: 'Square oak', info: '0.85 × 0.85 · seats 4', build: () => { RB(-.425, -.425, .425, .425, .72, .75, .008, M.oakFurn); legs4(-.425, -.425, .425, .425, .72, .025, M.oakFurn, .05); B(-.37, -.38, .37, -.36, .64, .72, M.oakFurn); B(-.37, .36, .37, .38, .64, .72, M.oakFurn); } },
    { name: 'Marble pedestal', info: 'Ø1.00 · seats 4–5', build: () => { lathe([[0, 0], [.3, 0], [.3, .02], [.14, .06], [.11, .72], [0, .72]], 0, 0, 0, M.marble); lathe([[0, .72], [.5, .72], [.5, .75], [0, .75]], 0, 0, 0, M.marble, { seg: 96 }); } },
    { name: 'Walnut X-base', info: '0.90 × 0.90 · seats 4', build: () => { RB(-.45, -.45, .45, .45, .72, .76, .01, M.walnut); [Math.PI / 4, -Math.PI / 4].forEach(a => { const g = new THREE.BoxGeometry(1.1, .05, .06); g.rotateY(a); add(g, M.walnut, 0, .03, 0); }); C(0, 0, .06, .05, .72, M.walnut, { seg: 24 }); } },
    { name: 'Round oak trestle', info: 'Ø0.90 · 3 legs', build: () => { lathe([[0, .72], [.45, .72], [.45, .75], [0, .75]], 0, 0, 0, M.oakFurn, { seg: 96 }); [0, 2.09, 4.19].forEach(a => { tube([[Math.cos(a) * .14, .7, Math.sin(a) * .14], [Math.cos(a) * .36, 0, Math.sin(a) * .36]], .022, M.oakFurn, { seg: 4, rs: 10 }); }); } } ,
    { name: 'Rect travertine 1.40', info: '1.40 × 0.80 · seats 4–6', build: () => { RB(-.7, -.4, .7, .4, .71, .75, .008, M.trav); [[-.62, -.32], [.62, -.32], [-.62, .32], [.62, .32]].forEach(([x, y]) => B(x - .025, y - .025, x + .025, y + .025, 0, .71, M.walnut)); B(-.62, -.33, .62, -.31, .64, .71, M.walnut); B(-.62, .31, .62, .33, .64, .71, M.walnut); } } ] },
  chair: { label: 'Dining chair', items: [
    { name: 'Shell velvet', info: 'Ø0.48 · swivel base', build: () => shellChair(0, 0, 0, -1) },
    { name: 'Wishbone', info: '0.55 × 0.51 · oak + cord', build: () => { legs4(-.25, -.23, .25, .23, .45, .016, M.oakFurn, .03); RB(-.25, -.24, .25, .2, .43, .46, .01, M.rattan);
      const pts = []; for (let i = 0; i <= 20; i++) { const a = Math.PI * i / 20; pts.push([Math.cos(a) * .25, .72, .02 + Math.sin(a) * .2]); } tube(pts, .014, M.oakFurn, { seg: 40, rs: 8 });
      tube([[0, .46, .2], [0, .58, .19], [-.06, .7, .21]], .012, M.oakFurn, { seg: 8 }); tube([[0, .58, .19], [.06, .7, .21]], .012, M.oakFurn, { seg: 8 }); [-.25, .25].forEach(x => C(x, .02, .016, .46, .72, M.oakFurn, { seg: 10 })); } },
    { name: 'Parsons', info: '0.47 × 0.55 · upholstered', build: () => { legs4(-.23, -.25, .23, .27, .38, .018, M.walnut, .03); RB(-.235, -.27, .235, .23, .38, .48, .03, M.linenSand); RB(-.235, .2, .235, .27, .38, .94, .03, M.linenSand); } },
    { name: 'Cantilever', info: '0.48 × 0.58 · chrome', build: () => { [-.21, .21].forEach(x => tube([[x, .45, -.24], [x, .45, .14], [x, .03, .18], [x, .01, -.26], [x, .03, -.3]], .011, M.steel, { seg: 40, rs: 8 })); RB(-.23, -.26, .23, .18, .44, .5, .03, M.velvetChoco); const g = new RoundedBoxGeometry(.46, .38, .05, 4, .02); g.rotateX(-.12); add(g, M.velvetChoco, 0, .72, .2); [-.21, .21].forEach(x => tube([[x, .48, .16], [x, .9, .22]], .011, M.steel, { seg: 8, rs: 8 })); } },
    { name: 'Rattan bistro', info: '0.50 × 0.52 · woven', build: () => { legs4(-.23, -.24, .23, .22, .45, .014, M.rattanDark, .03); C(0, -.01, .24, .42, .46, M.rattan, { seg: 40 }); sector(0, 0, .2, .24, Math.PI * .25, Math.PI * .75, .46, .82, M.rattan, .012); tube([[-.2, .82, .13], [0, .86, .24], [.2, .82, .13]], .014, M.rattanDark, { seg: 24 }); } } ] },
  armchair: { label: 'Armchair', items: [
    { name: 'Bouclé tub', info: '0.78 × 0.74', build: () => { lathe([[0, 0], [.37, 0], [.39, .02], [.39, .38], [0, .38]], 0, 0, 0, M.boucle, { sz: .95 }); sector(0, 0, .26, .39, Math.PI * .02, Math.PI * .98, .36, .72, M.boucle, .05); lathe([[0, .38], [.3, .38], [.31, .44], [.28, .47], [0, .47]], 0, -.03, 0, M.boucleOat); pillow(0, .1, .58, .36, .13, .3, M.velvetTerra, 1.2, Math.PI); } },
    { name: 'Wingback', info: '0.80 × 0.82 · velvet', build: () => { legs4(-.36, -.36, .36, .38, .14, .022, M.walnut, .05, .015); RB(-.36, -.38, .36, .32, .14, .44, .03, M.velvetSage); RB(-.33, -.36, .33, .2, .44, .54, .04, M.velvetSage); RB(-.36, .24, .36, .4, .14, 1.08, .04, M.velvetSage);
      [-.33, .33].forEach(x => { RB(x - .05, -.12, x + .05, .38, .44, .92, .04, M.velvetSage); RB(x - .05, -.38, x + .05, -.1, .44, .62, .04, M.velvetSage); }); } },
    { name: 'Mid-century lounge', info: '0.74 × 0.80 · walnut frame', build: () => { [-.33, .33].forEach(x => tube([[x, .02, -.36], [x, .46, -.3], [x, .52, -.05], [x, .5, .2], [x, .02, .36]], .022, M.walnut, { seg: 30, rs: 10 })); RB(-.31, -.34, .31, .22, .3, .42, .04, M.velvetToffee); const g = new RoundedBoxGeometry(.62, .52, .1, 4, .04); g.rotateX(-.3); add(g, M.velvetToffee, 0, .66, .28); } },
    { name: 'Barrel swivel', info: 'Ø0.76', build: () => { C(0, 0, .25, 0, .03, M.brass, { seg: 40 }); C(0, 0, .05, .03, .14, M.brass, { seg: 20 }); lathe([[0, .14], [.36, .14], [.38, .16], [.38, .4], [0, .4]], 0, 0, 0, M.velvetTerra); sector(0, 0, .26, .38, Math.PI * -.05, Math.PI * 1.05, .38, .74, M.velvetTerra, .06); lathe([[0, .4], [.29, .4], [.3, .46], [.27, .49], [0, .49]], 0, -.02, 0, M.velvetTerra); } },
    { name: 'Rattan lounge', info: '0.80 × 0.78', build: () => { legs4(-.34, -.34, .34, .34, .16, .02, M.rattanDark, .04); RB(-.36, -.36, .36, .34, .16, .26, .03, M.rattanDark); sector(0, -.05, .32, .38, Math.PI * .05, Math.PI * .95, .26, .9, M.rattan, .015); RB(-.32, -.34, .32, .22, .26, .4, .05, M.linenOut, { seg: 5 }); pillow(0, .12, .56, .42, .14, .34, M.linenOut, 1.2, Math.PI); } } ] },
  stool: { label: 'Bar stool', items: [
    { name: 'Velvet pedestal', info: 'Ø0.40 · seat 0.65', build: () => barStool(0, 0) },
    { name: 'Oak saddle', info: '0.40 × 0.36 · seat 0.65', build: () => { [[-.15, -.13], [.15, -.13], [-.15, .13], [.15, .13]].forEach(([x, y]) => tube([[x * .7, .63, y * .7], [x, 0, y]], .016, M.oakFurn, { seg: 4, rs: 8 })); B(-.14, -.12, .14, .12, .25, .27, M.oakFurn, { clamp: false }); RB(-.19, -.17, .19, .17, .62, .66, .03, M.oakFurn); } },
    { name: 'Low-back stool', info: 'Ø0.42 · seat 0.65', build: () => { C(0, 0, .2, 0, .015, M.blackMetal); C(0, 0, .022, .015, .62, M.blackMetal, { seg: 16 }); add(new THREE.TorusGeometry(.17, .01, 8, 40).rotateX(Math.PI / 2), M.brass, 0, .3, 0, { uv: false }); lathe([[0, .62], [.2, .62], [.21, .64], [.2, .68], [0, .69]], 0, 0, 0, M.boucleOat); sector(0, 0, .17, .21, Math.PI * .15, Math.PI * .85, .66, .84, M.boucleOat, .015); } },
    { name: 'Cane seat', info: '0.38 × 0.38 · seat 0.65', build: () => { legs4(-.17, -.17, .17, .17, .63, .016, M.rattanDark, .02); B(-.15, -.15, .15, .15, .28, .3, M.rattanDark, { clamp: false }); C(0, 0, .19, .62, .66, M.rattan, { seg: 40 }); } },
    { name: 'Hairpin metal', info: 'Ø0.36 · seat 0.65', build: () => { [0, 2.09, 4.19].forEach(a => tube([[Math.cos(a) * .08, .63, Math.sin(a) * .08], [Math.cos(a) * .19, 0, Math.sin(a) * .19]], .009, M.blackMetal, { seg: 4, rs: 8 })); C(0, 0, .18, .62, .66, M.walnut, { seg: 40 }); } } ] },
  sidetable: { label: 'Side table', items: [{ name: 'Travertine drum', info: 'Ø0.45 × 0.50', build: () => { lathe([[0, 0], [.18, 0], [.12, .22], [.12, .46], [.225, .48], [.225, .5], [0, .5]], 0, 0, 0, M.trav); vase(0, 0, .5, .45, M.stonewareDark); } }] },
  floorlamp: { label: 'Floor lamp', items: [{ name: 'Linen drum lamp', info: 'Ø0.45 × 1.60', build: () => { C(0, 0, .15, 0, .025, M.blackMetal); C(0, 0, .012, .025, 1.25, M.brass, { seg: 10 }); lathe([[.18, 1.25], [.2, 1.25], [.18, 1.55], [.16, 1.55]], 0, 0, 0, M.opal, { seg: 48 }); lamp(0, 0, 1.35, 0xffd3a0, 3); } }] },
  desk: { label: 'Desk', items: [{ name: 'Oak writing desk', info: '0.90 × 0.60 × 0.75', build: () => { RB(-.45, -.3, .45, .3, .72, .75, .008, M.oakFurn); legs4(-.45, -.3, .45, .3, .72, .02, M.blackMetal, .04);
      cab({ axis: 'x', a1: -.43, a2: .43, back: -.28, front: .28, h1: .64, h2: .72, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      B(-.16, -.13, .16, .09, .75, .765, M.steel); { const g = new THREE.BoxGeometry(.32, .21, .007); const m = add(g, M.blackMetal, 0, .87, -.14); m.rotation.x = -.28; }
      C(.33, -.2, .06, .75, .765, M.brass); tube([[.33, .765, -.2], [.31, 1.08, -.18], [.22, 1.18, -.08]], .008, M.brass, { seg: 16 }); lathe([[0, 0], [.03, 0], [.07, -.06], [.075, -.07], [0, -.06]], .2, -.06, 1.18, M.opal); lamp(.2, -.06, 1.08, 0xffd3a0, 1.6);
      book(-.33, -.1, .75, .2, .15, .03, M.book1, .2); } },
    { name: 'Long oak desk + monitor', info: '1.40 × 0.70 × 0.75', build: () => { RB(-.7, -.35, .7, .35, .72, .75, .008, M.oakFurn);
      [[-.66, -.31], [.66, -.31], [-.66, .31], [.66, .31]].forEach(([x, y]) => B(x - .02, y - .02, x + .02, y + .02, 0, .72, M.blackMetal));
      cab({ axis: 'x', a1: .2, a2: .66, back: -.33, front: .33, h1: .5, h2: .72, cols: [[1, 2]], fm: M.lacquerCream });
      B(-.35, -.24, .35, -.21, .77, 1.15, M.blackMetal); B(-.34, -.212, .34, -.209, .79, 1.13, M.screen, { cast: false }); B(-.04, -.26, .04, -.2, .75, .79, M.blackMetal);
      B(-.22, -.02, .22, .12, .75, .765, M.plastic); RB(.3, -.05, .42, .1, .75, .77, .01, M.plastic);
      C(-.55, -.2, .06, .75, .765, M.brass); tube([[-.55, .765, -.2], [-.57, 1.1, -.18], [-.45, 1.2, -.08]], .008, M.brass, { seg: 16 }); lathe([[0, 0], [.03, 0], [.07, -.06], [.075, -.07], [0, -.06]], -.42, -.06, 1.2, M.opal); lamp(-.42, -.06, 1.1, 0xffd3a0, 1.6);
      book(.5, -.2, .75, .2, .15, .04, M.book2, .1); } }] },
  deskchair: { label: 'Desk chair', items: [{ name: 'Swivel task chair', info: 'Ø0.60', build: () => taskChair(0, 0, -Math.PI / 2) }] }
};
function endGRaw() { const g = CUR; CUR = world; const bb = new THREE.Box3(); g.updateMatrixWorld(true); g.traverse(o => { if (o.isMesh) bb.expandByObject(o); });
  g.userData = { movable: true, home: { x: 0, z: 0, r: 0 }, size: bb.getSize(new V3()), minY0: bb.min.y, custom: {} };
  if (!MKEY) MKEY = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  g.traverse(o => { if (o.isMesh) { o.userData.mkey = MKEY.get(o.material); const b2 = new THREE.Box3().setFromObject(o); o.userData.minY = b2.min.y; o.userData.maxY = b2.max.y; } });
  g.traverse(o => { if (o.isLight) o.visible = night; });
  return g; }
function makeTyped(type, d, opts) { beginG(DESIGNS[type].label); DESIGNS[type].items[d].build(opts || {}); const g = endGRaw(); g.userData.type = type; g.userData.design = d; return g; }
function replaceWith(old, type, d, keepCustom = true) {
  const g = makeTyped(type, d); g.position.set(old.position.x, 0, old.position.z); g.rotation.y = old.rotation.y; g.visible = old.visible;
  g.userData.home = { ...old.userData.home };
  if (keepCustom) for (const k in old.userData.custom) { if (partsOf(g).includes(k)) { const c = old.userData.custom[k]; applyPart(g, k, c.fin, c.color, false); } }
  const i = movables.indexOf(old); if (i >= 0) movables[i] = g; else movables.push(g);
  old.parent && old.parent.remove(old);
  if (sel === old) select(g);
  return g;
}

function livingRug(cx, cy, rx, ry) { beginG('Living rug');
  const s = new THREE.Shape(), n = 96; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, rr = 1 + .05 * Math.sin(3 * t) + .03 * Math.cos(5 * t);
    const x = cx + rx * rr * Math.cos(t), y = cy + ry * rr * Math.sin(t); i ? s.lineTo(x, -y) : s.moveTo(x, -y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: .008, bevelEnabled: true, bevelThickness: .005, bevelSize: .008, bevelSegments: 3, curveSegments: 48 }); g.rotateX(-Math.PI / 2); g.translate(0, .005, 0); add(g, M.rug, 0, 0, 0, { cast: false });
  endG(); }
function diningDecor(x, y) {
  beginG('Table decor'); vase(x, y, .75, 1.0, M.stoneware);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, r = .08 + rand() * .1; tube([[x, .98, y], [x + Math.cos(a) * r * .5, 1.2, y + Math.sin(a) * r * .5], [x + Math.cos(a) * r, 1.4 + rand() * .2, y + Math.sin(a) * r]], .004, M.bark, { seg: 16, rs: 5 }); }
  endG();
  beginG('Pendant lights');
  [[0, 0, 1.78, .16], [.2, .1, 1.98, .11], [-.18, .12, 2.06, .09]].forEach(([dx, dy, h, r]) => { S(x + dx, y + dy, h, r, M.opal, { cast: false }); C(x + dx, y + dy, .025, h + r - .01, h + r + .03, M.brass); C(x + dx, y + dy, .003, h + r + .03, H, M.blackMetal, { seg: 6 }); C(x + dx, y + dy, .045, H - .015, H, M.brass); });
  lamp(x, y, 1.55, 0xffcf98, 9); endG(); }
function typed(type, d, x, y, face = 0, opts) { const g = makeTyped(type, d, opts); g.position.set(x, 0, y); g.rotation.y = face; g.userData.home = { x, z: y, r: face }; movables.push(g); return g; }
/* ================= layout ================= */
const LAYOUTS = {
  soft: { walls: 'softStudio', preset: 'soft', wallTint: 0xe9ddcc, ceilTint: 0xf3ebe0, trimTint: 0xeadfcf,
    name: 'Soft classic · arches, panels, chevron oak', tag: 'Design vibe',
    why: 'Your reference applied to the original plan (studio + office): warm greige walls with picture-frame mouldings and chair rail, light oak chevron floor everywhere, rounded-shoulder arches corridor → hall → studio, fluted rounded corners on the column and shaft, coffered ceilings with rounded corners, fluted lip and LED cove in every room, arched mirror fronts with oak knobs on the hall wardrobe, sculptural stone console under a textured plaster artwork with a brass sconce, bouclé and light-oak palette.',
    met: 'Studio: corner sofa 4 + armchair + dining 4 + 3 bar stools · TV 3.31 m · Office: 2.66 m built-in desk',
    clr: [['Bathroom free floor', '1.18 × 1.74'], ['Guest room: shower glass → WC / basin', '0.32 · 0.64'], ['Hall: entrance clear', 'wardrobe removed'], ['Closet units (max depth)', '0.30'], ['Closet aisle (B1)', '0.75'], ['B2 bed side → wardrobe', '0.60'], ['U-kitchen aisle (west leg → bar)', '1.07'], ['Bar stools → chaise', '1.45'], ['Sofa front → TV', '3.31'], ['Chaise → coffee table', '0.30'], ['Sofa seat → coffee table', '0.38'], ['Dining table → partition', '0.05'], ['Dining chair → bar end', '0.58'], ['Hall passage (open, no door)', '1.46'], ['Office door swing → armchair', 'clear']],
    views: { bath: [[6.25, 1.65, 2.6], [5.0, .8, .6]], wc: [[8.75, 1.6, 7.5], [7.3, .8, 8.8]], loggiaE: [[14.85, 1.65, 7.0], [14.6, .6, .6]], bed2: [[4.6, 1.55, 4.5], [1.5, .8, 6.8]], closet2: [[3.92, 1.6, 6.05], [4.95, 1.0, 7.05]], corridor: [[5.4, 1.55, 4.3], [7.0, 1.1, 3.2]], closet: [[3.66, 1.6, 3.55], [3.66, 1.05, .2]], bed1: [[3.05, 1.6, 3.55], [.3, .9, 2.4]], kitchen: [[10.4, 1.6, 3.4], [7.6, 1.0, .6]], living: [[8.2, 1.65, 2.35], [12.8, .8, 1.3]], livingArea: [[10.3, 10.5, 5.6], [10.3, 0, 2.0]], hall: [[6.25, 1.5, 6.95], [8.6, 1.2, 1.4]], office: [[9.3, 1.6, 4.75], [12.8, .85, 6.4]] },
    rooms: [[7.0, 5.0, 'Hall', '≈13.7 m²'], [10.2, 3.4, 'Studio: living + kitchen', '≈27.9 m²'], [10.6, 5.0, 'Office', '≈12.6 m²']],
    furn: [['Bathtub (west wall)', 5.065, 1.33, .58, '0.75', '1.70', '0.58'], ['Walk-in shower', 6.68, .72, 2.05, '0.78', '1.45', '2.05'], ['Guest shower (full depth, 2 doors)', 7.46, 8.22, 2.0, '0.80', '1.67', '2.00'], ['Double vanity 1.25', 6.84, 2.12, .85, '0.45', '1.25', '0.85'], ['Wardrobe (B2)', 4.0, 6.83, 2.6, '2.11', '0.60', '2.60'], ['Beauty organiser (B1)', 1.92, 3.79, 1.27, '0.40', '0.40', '1.27'], ['Terrace sofa', 14.32, .95, .78, '0.80', '1.60', '0.78'], ['Terrace dining (4)', 14.85, 3.6, .75, '0.80', '1.40', '0.75'], ['Laundry tower + wardrobe', 6.75, 3.64, 2.63, '0.64', '1.49', '2.63'], ['Walk-in closet (B1)', 3.94, 1.47, 2.6, '1.30', '2.95', '2.60'], ['Corner kitchen (L)', 7.6, .9, .92, '1.69', '2.31', '0.92'], ['Fridge + oven towers', 7.48, 2.91, 2.6, '0.62', '1.20', '2.60'], ['Kitchen bar (U extension) + 3 stools', 9.1, 1.07, .92, '0.49', '1.75', '0.92'], ['Corner sofa 3 + chaise (L)', 12.2, .47, .84, '2.70', '2.10', '0.84'], ['Coffee table (rect)', 12.65, 1.6, .38, '1.20', '0.60', '0.38'], ['TV wall + 65" TV', 12.3, 4.1, 1.8, '2.50', '0.40', '2.70'], ['Dining table 1.40 (4 seats)', 9.9, 3.87, .75, '1.40', '0.80', '0.75'], ['Built-in desk (wall to wall)', 12.25, 6.79, .76, '2.66', '0.68', '2.60'], ['Bookshelf (on shaft)', 10.06, 6.47, 2.4, '1.59', '0.34', '2.40']],
    plants() { G('Fig plant', () => fig(13.25, 3.95, 1)); G('Snake plant', () => snake(13.3, 4.75, .8)); },
    build() {
      // hall: arched mirror fronts on the wardrobe, stone arch console + plaster artwork + brass sconce on the east wall
      beginG('Stone arch console'); const stone = M.stoneware;
      RB(8.56, 5.50, 8.845, 6.30, .80, .855, .012, stone); RB(8.59, 5.50, 8.83, 5.82, 0, .185, .01, stone); RB(8.60, 5.52, 8.82, 5.80, .195, .375, .01, stone);
      { const sp = new THREE.Shape(); sp.moveTo(5.50, .385); sp.lineTo(5.50, .80); sp.lineTo(6.18, .80); sp.lineTo(6.18, .72); sp.absarc(6.18, .385, .335, Math.PI / 2, Math.PI, false); sp.lineTo(5.50, .385);
        const g = new THREE.ExtrudeGeometry(sp, { depth: .24, bevelEnabled: false, curveSegments: 32 }); g.rotateY(-Math.PI / 2); g.translate(8.835, 0, 0); add(g, stone, 0, 0, 0); }
      B(8.84, 5.50, 8.86, 5.82, .185, .195, M.walnut); B(8.84, 5.50, 8.86, 5.82, .375, .385, M.walnut);
      lathe([[0, 0], [.05, 0], [.055, .02], [.05, .16], [.045, .17], [0, .17]], 8.70, 6.08, .855, M.glass);
      [[0, 0, .1], [.03, .05, .09], [.02, -.05, .09], [-.05, .02, .085], [-.04, -.03, .08], [-.02, .06, .075]].forEach(([dx, dy, z]) => S(8.70 + dx, 6.08 + dy, .855 + .17 + z, .045, M.blush));
      RB(8.63, 5.62, 8.79, 5.90, .855, .865, .005, M.blackMetal); endG();
      beginG('Plaster artwork'); B(8.815, 5.46, 8.86, 6.36, 1.05, 2.25, M.plasterArt);
      B(8.81, 5.44, 8.86, 6.38, 1.03, 1.05, M.walnut); B(8.81, 5.44, 8.86, 6.38, 2.25, 2.27, M.walnut); B(8.81, 5.44, 8.86, 5.46, 1.05, 2.25, M.walnut); B(8.81, 6.36, 8.86, 6.38, 1.05, 2.25, M.walnut); endG();
      beginG('Wall sconce'); RB(8.81, 6.55, 8.86, 6.69, 1.32, 1.88, .02, M.brass); B(8.805, 6.57, 8.812, 6.67, 1.36, 1.84, M.opal, { cast: false }); lamp(8.65, 6.62, 1.6, 0xffcf96, 3); endG();
      G('Hall runner', () => RB(5.95, 4.6, 8.2, 6.6, 0, .012, .05, M.rugDark, { cast: false }));
      // L-shaped corner kitchen: north leg (hob) + west leg on the bathroom wet wall (sink, dishwasher) ending in fridge + oven towers
      beginG('Kitchen run');
      cab({ axis: 'x', a1: 7.19, a2: 7.79, back: 0, front: .58, h1: .1, h2: .88, cols: [[1, 1]], fm: M.lacquerChoco });
      cab({ axis: 'x', a1: 7.81, a2: 8.84, back: 0, front: .58, h1: .1, h2: .88, cols: [[.6, 1], [.43, 3]], fm: M.lacquerChoco });
      cab({ axis: 'y', a1: .64, a2: 2.29, back: 7.17, front: 7.75, h1: .1, h2: .88, cols: [[.6, 1], [.6, 1], [.45, 3]], fm: M.lacquerChoco });
      B(7.19, .02, 8.82, .52, 0, .1, M.carcass); B(7.19, .52, 7.69, 2.27, 0, .1, M.carcass);
      B(7.17, 0, 8.86, .62, .88, .92, M.trav); B(7.17, .62, 7.79, 2.31, .88, .92, M.trav);
      B(7.17, 0, 8.86, .02, .92, 1.5, M.trav); B(7.17, .02, 7.19, 2.31, .92, 1.5, M.trav);
      B(7.86, .06, 8.44, .54, .92, .926, hobAt(7.83, .05)); B(7.865, .58, 8.435, .595, .30, .845, M.blackGlass); B(7.9, .595, 8.4, .612, .79, .802, M.brass);
      B(7.27, .72, 7.65, 1.2, .918, .9215, M.steelDark); C(7.46, .96, .025, .92, .9218, M.blackMetal, { cast: false });
      C(7.21, .96, .028, .92, .97, M.brass); tube([[7.21, .96, .96], [7.23, 1.20, .96], [7.33, 1.30, .96], [7.44, 1.25, .96], [7.47, 1.12, .96]], .011, M.brass, { seg: 48 });
      B(7.71, .66, 7.73, 2.27, .02, .03, M.led, { cast: false }); B(7.21, .54, 8.82, .56, .02, .03, M.led, { cast: false });
      cab({ axis: 'y', a1: 2.31, a2: 2.91, back: 7.17, front: 7.79, h1: .1, h2: 2.6, cols: [[1, 2]], fm: M.lacquerChoco });
      cab({ axis: 'y', a1: 2.93, a2: 3.51, back: 7.17, front: 7.79, h1: .1, h2: 2.6, cols: [[1, 3]], fm: M.lacquerChoco });
      B(7.79, 2.96, 7.805, 3.48, .86, 1.46, M.blackGlass); B(7.805, 3.0, 7.822, 3.44, 1.42, 1.432, M.brass); B(7.19, 2.33, 7.69, 3.49, 0, .1, M.carcass);
      endG();
      beginG('Wall cabinets');
      cab({ axis: 'y', a1: .02, a2: 2.29, back: 7.17, front: 7.52, h1: 1.5, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      cab({ axis: 'x', a1: 7.54, a2: 8.84, back: 0, front: .35, h1: 1.5, h2: 2.6, cols: [[.3, 1], [.6, 1], [.4, 1]], fm: M.lacquerCream });
      B(7.49, .02, 7.53, 2.27, 1.49, 1.5, M.led, { cast: false }); B(7.54, .31, 8.82, .35, 1.49, 1.5, M.led, { cast: false });
      endG();
      beginG('Coffee machine'); RB(7.2, 1.92, 7.6, 2.2, .92, 1.31, .02, M.steel); B(7.6, 1.96, 7.604, 2.16, 1.19, 1.27, M.display); B(7.45, 1.96, 7.65, 2.16, .92, .95, M.steelDark); endG();
      beginG('Air fryer'); RB(8.5, .1, 8.78, .42, .92, 1.24, .05, M.plastic, { seg: 5 }); RB(8.515, .37, 8.765, .435, .935, 1.10, .02, M.plastic); B(8.59, .435, 8.69, .465, 1.0, 1.06, M.blackMetal); endG();
      // kitchen bar as an extension of the kitchen: runs south from the column at exactly the column's width (0.49), U-shape;
      // shallow drawers on the kitchen side, 0.20 knee recess under the top on the room side for 3 stools
      beginG('Kitchen bar');
      cab({ axis: 'y', a1: .24, a2: 1.89, back: 9.15, front: 8.88, h1: .1, h2: .88, cols: [[.55, 3], [.55, 1], [.55, 3]], fm: M.lacquerChoco });
      B(8.90, .26, 9.13, 1.87, 0, .1, M.carcass); B(9.13, .2, 9.15, 1.91, 0, .88, M.walnut);
      B(8.86, .2, 9.35, 1.95, .88, .92, M.trav); B(8.86, 1.91, 9.35, 1.95, 0, .88, M.trav); B(8.86, .2, 9.15, .24, 0, .88, M.lacquerChoco);
      RB(8.95, .9, 9.25, 1.25, .92, .94, .01, M.oakFurn); lathe([[0, 0], [.07, 0], [.14, .05], [.16, .09], [0, .02]], 9.1, 1.65, .92, M.stoneware); [[9.06, 1.63], [9.14, 1.67], [9.1, 1.59]].forEach(([x, y]) => S(x, y, .99, .037, M.fruit));
      [.75, 1.55].forEach(y => { S(9.1, y, 1.75, .1, M.opal, { cast: false }); C(9.1, y, .02, 1.84, 1.87, M.brass); C(9.1, y, .003, 1.87, H, M.blackMetal, { seg: 6 }); C(9.1, y, .04, H - .015, H, M.brass); });
      lamp(9.1, 1.15, 1.55, 0xffd3a0, 4);
      endG();
      [.7, 1.2, 1.7].forEach(y => typed('stool', 0, 9.5, y, FACE.W));
      // laundry tower at the corridor's dead end, against the bathroom wet wall: washer below, dryer above, storage cabinet on top
      beginG('Washer + dryer');
      B(6.43, 2.89, 7.07, 2.91, 0, 2.6, M.oakFurn); B(6.43, 3.58, 7.07, 3.60, 0, 2.6, M.oakFurn); B(6.43, 2.91, 7.07, 3.58, 0, .04, M.oakFurn);
      [[.05, .90], [.93, 1.78]].forEach(([h1, h2], i) => {
        RB(6.46, 2.93, 7.05, 3.56, h1, h2, .02, M.ceramic);
        B(6.452, 2.97, 6.46, 3.52, h2 - .11, h2 - .03, M.blackGlass, { cast: false }); B(6.451, 3.36, 6.453, 3.48, h2 - .09, h2 - .05, M.display, { cast: false });
        add(new THREE.TorusGeometry(.17, .028, 14, 48), M.steel, 6.452, (h1 + h2) / 2 - .04, 3.245, { uv: false, rotY: Math.PI / 2 });
        add(new THREE.CircleGeometry(.16, 48), i ? M.glassTint : M.blackGlass, 6.451, (h1 + h2) / 2 - .04, 3.245, { uv: false, rotY: -Math.PI / 2, cast: false }); });
      B(6.43, 2.91, 7.07, 3.58, 1.80, 1.83, M.oakFurn);
      cab({ axis: 'y', a1: 2.92, a2: 3.57, back: 7.07, front: 6.45, h1: 1.84, h2: 2.6, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      cab({ axis: 'y', a1: 3.60, a2: 4.38, back: 7.07, front: 6.43, h1: 0, h2: 2.6, cols: [[1, 1], [1, 1]], fm: M.lacquerCream }); B(6.43, 3.60, 7.07, 4.38, 2.6, 2.63, M.oakFurn);
      [3.97, 3.99].forEach((y, i) => B(6.415, y + (i ? .02 : -.03), 6.43, y + (i ? .03 : -.02), .85, 1.55, M.brass));
      B(6.43, 2.91, 7.07, 3.58, 2.6, 2.62, M.oakFurn);
      endG();
      // ---- bathroom 6.6 m² re-planned: tub on the west wall, walk-in shower in the north-east niche, WC on the riser shaft, 1.0 m vanity (washer moved to the corridor tower)
      beginG('Bath · tub'); RB(4.69, .48, 5.44, 2.18, 0, .58, .01, M.trav); RB(4.77, .56, 5.36, 2.10, .3, .585, .2, M.resin, { seg: 5 });
      { const g = new THREE.PlaneGeometry(.5, 1.45); g.rotateX(-Math.PI / 2); add(g, M.water, 5.065, .5, 1.33, { uv: false, cast: false }); }
      C(4.78, .62, .02, .58, .9, M.brass); tube([[4.78, .9, .62], [4.84, .95, .62], [4.92, .9, .62]], .012, M.brass); endG();
      beginG('Bath · niche'); [.62, 1.02, 1.42].forEach(h => B(4.70, .02, 4.97, .46, h, h + .025, M.oakFurn));
      [[4.8, .15, .645], [4.8, .32, .645], [4.86, .23, 1.045]].forEach(([x, y, h]) => add(new THREE.CylinderGeometry(.06, .06, .22, 20).rotateZ(Math.PI / 2), M.towel, x, h + .06, y, { uv: false }));
      vase(4.85, .24, 1.445, .3, M.stoneware); endG();
      beginG('Bath · shower'); B(6.29, 0, 7.07, 1.45, 0, .012, M.micro, { cast: false }); B(6.32, 1.32, 7.04, 1.36, .012, .014, M.steelDark, { cast: false });
      B(6.29, .48, 6.302, 1.25, .012, 2.05, M.glass, { cast: false }); B(6.285, .48, 6.307, 1.25, 2.03, 2.05, M.brass); B(6.285, 1.23, 6.307, 1.25, .012, 2.05, M.brass);
      C(6.68, .55, .14, 2.2, 2.22, M.brass); B(6.66, .0, 6.70, .55, 2.2, 2.22, M.brass); B(7.05, .65, 7.068, .85, 1.0, 1.2, M.brass);
      B(7.0, .9, 7.068, 1.25, 1.1, 1.12, M.trav); endG();
      beginG('Bath · shaft cladding'); B(4.98, .48, 6.29, .486, .005, H, M.travSmall, { cast: false }); endG();
      beginG('Bath · WC'); RB(5.70, .48, 6.06, 1.03, .30, .44, .16, M.ceramic, { seg: 6 }); RB(5.705, .51, 6.055, 1.02, .44, .455, .15, M.ceramic, { seg: 6 }); B(5.80, .48, 5.96, .49, .9, 1.06, M.brass); endG();
      beginG('Bath · vanity'); RB(6.62, 1.50, 7.065, 2.75, .45, .82, .015, M.walnut); B(6.60, 1.50, 7.07, 2.75, .82, .85, M.trav);
      [1.82, 2.43].forEach(y => { lathe([[0, 0], [.16, 0], [.19, .04], [.19, .13], [.18, .13], [.16, .05], [0, .03]], 6.84, y, .85, M.ceramic, { sx: .85, sz: 1 });
        tube([[7.065, 1.1, y], [6.98, 1.1, y], [6.95, 1.08, y]], .01, M.brass); B(7.03, y - .27, 7.065, y + .27, 1.15, 1.95, M.mirror); B(7.025, y - .29, 7.035, y + .29, 1.13, 1.97, M.led, { cast: false }); });
      B(6.64, 1.52, 7.06, 1.54, .42, .44, M.led, { cast: false }); lamp(6.8, 2.12, 1.6, 0xffe2c0, 2.5); endG();
      beginG('Bath · radiator'); [4.8, 5.25].forEach(x => C(x, 2.74, .012, .3, 1.5, M.brass, { seg: 10 })); for (let i = 0; i < 7; i++) add(new THREE.CylinderGeometry(.01, .01, .45, 8).rotateZ(Math.PI / 2), M.brass, 5.025, .38 + i * .18, 2.74, { uv: false });
      RB(4.85, 2.70, 5.2, 2.76, .95, 1.45, .02, M.towel); endG();
      beginG('Bath · mat'); RB(5.55, 1.3, 6.25, 1.75, .008, .02, .04, M.towel, { cast: false }); endG();
      // ---- guest WC 3.0 m² → full shower room: 0.80 corner shower, wall-hung WC, compact basin
      beginG('Shower room · shower'); B(7.06, 7.39, 7.86, 9.06, 0, .025, M.micro, { cast: false }); B(7.10, 7.46, 7.14, 9.0, .025, .027, M.steelDark, { cast: false });
      B(7.855, 7.39, 7.867, 7.93, .025, 2.0, M.glass, { cast: false }); B(7.872, 7.95, 7.884, 8.50, .025, 2.0, M.glass, { cast: false }); B(7.855, 8.52, 7.867, 9.06, .025, 2.0, M.glass, { cast: false });
      B(7.84, 7.39, 7.89, 9.06, 1.98, 2.0, M.brass); [7.94, 8.51].forEach(y => B(7.84, y - .01, 7.89, y + .01, .025, 2.0, M.brass));
      B(7.867, 7.85, 7.887, 7.87, .85, 1.35, M.brass); B(7.867, 8.58, 7.887, 8.60, .85, 1.35, M.brass);
      C(7.46, 8.22, .14, 2.15, 2.17, M.brass); B(7.06, 8.20, 7.46, 8.24, 2.15, 2.17, M.brass); B(7.06, 8.12, 7.08, 8.32, 1.0, 1.2, M.brass); B(7.06, 8.62, 7.09, 8.96, 1.1, 1.12, M.trav); endG();
      beginG('Shower room · WC'); RB(8.18, 8.51, 8.54, 9.06, .30, .44, .16, M.ceramic, { seg: 6 }); RB(8.185, 8.52, 8.535, 9.03, .44, .455, .15, M.ceramic, { seg: 6 }); B(8.28, 9.05, 8.44, 9.06, .9, 1.06, M.brass); endG();
      beginG('Shower room · basin'); RB(8.50, 7.75, 8.86, 8.20, .62, .85, .015, M.walnut); lathe([[0, 0], [.12, 0], [.14, .04], [.14, .11], [.13, .11], [.11, .04], [0, .03]], 8.68, 7.98, .85, M.ceramic);
      tube([[8.86, 1.06, 7.98], [8.79, 1.06, 7.98], [8.77, 1.04, 7.98]], .009, M.brass);
      add(new THREE.CircleGeometry(.22, 64), M.mirror, 8.855, 1.55, 7.98, { uv: false, rotY: -Math.PI / 2 }); add(new THREE.TorusGeometry(.225, .012, 12, 64), M.led, 8.854, 1.55, 7.98, { uv: false, rotY: -Math.PI / 2 });
      [8.42, 8.62].forEach(y => C(8.845, y, .015, 1.6, 1.62, M.brass, { seg: 10 })); RB(8.82, 8.37, 8.86, 8.67, 1.0, 1.58, .02, M.towel); lamp(7.96, 7.9, 2.5, 0xffe2c0, 3); endG();
      // ---- bedroom 2: wardrobe moved to the free part of the south wall (2.11 m), desk to the north wall where the wardrobe was
      // bedroom 2: built-in hinged wardrobe on the free south wall beside the bed (2.11 m × 0.60)
      beginG('Wardrobe (B2, south wall)'); cab({ axis: 'x', a1: 2.95, a2: 5.06, back: 7.13, front: 6.53, h1: 0, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      B(2.95, 6.53, 5.06, 7.13, 2.6, 2.63, M.oakFurn); [3.47, 3.48, 4.0, 4.01, 4.53, 4.54].forEach((x, i) => B(x + (i % 2 ? .02 : -.03), 6.515, x + (i % 2 ? .03 : -.02), 6.53, .85, 1.55, M.brass)); endG();
      typed('desk', 0, 2.9, 4.43, FACE.N); typed('deskchair', 0, 2.9, 5.05, FACE.N);
      // ---- main balcony (off the studio): outdoor lounge · dining for 4 · sun corner with herb garden
      beginG('Terrace sofa'); RB(13.92, .15, 14.72, 1.75, 0, .38, .03, M.oakFurn); RB(13.92, .15, 14.12, 1.75, .38, .78, .03, M.oakFurn);
      RB(14.12, .2, 14.70, .97, .38, .52, .05, M.linenOut, { seg: 5 }); RB(14.12, .98, 14.70, 1.70, .38, .52, .05, M.linenOut, { seg: 5 });
      RB(14.12, .2, 14.30, .97, .52, .86, .05, M.linenOut, { seg: 5 }); RB(14.12, .98, 14.30, 1.70, .52, .86, .05, M.linenOut, { seg: 5 });
      pillow(14.36, .55, .66, .4, .14, .4, M.velvetTerra, 1.2, Math.PI / 2); pillow(14.36, 1.45, .66, .4, .14, .4, M.velvetSage, 1.2, Math.PI / 2); endG();
      typed('coffee', 0, 15.15, .95);
      typed('dining', 5, 14.85, 3.6, FACE.E); [[14.23, 3.25, FACE.E], [14.23, 3.95, FACE.E], [15.47, 3.25, FACE.W], [15.47, 3.95, FACE.W]].forEach(([x, y, f]) => typed('chair', 4, x, y, f));
      diningDecor(14.85, 3.6);
      beginG('Terrace herb garden'); RB(14.0, 6.72, 15.62, 7.05, 0, .62, .02, M.concrete); for (let i = 0; i < 6; i++) { pot(14.15 + i * .27, 6.88, .09, .07, .2, M.stoneware); } snake(14.4, 6.88, .5); snake(15.2, 6.88, .45); endG();
      typed('armchair', 4, 14.45, 6.0, FACE.S); typed('armchair', 4, 15.25, 6.0, FACE.S); typed('sidetable', 0, 14.85, 6.15);
      beginG('Terrace planter'); pot(15.45, .3, .24, .18, .55, M.stonewareDark); olive(15.45, .3, 1.1); endG();
      beginG('Terrace planter'); pot(15.45, 2.2, .2, .16, .5, M.stoneware); fig(15.45, 2.2, .85); endG();
      // walk-in closet (bedroom 1): open hanging on all three sides (no doors), top shelves, LED, pendant; bedroom 1 re-planned around it
      beginG('Walk-in closet');
      const cloth = [M.linenWhite, M.linenSand, M.velvetChoco, M.boucleOat, M.linenSage, M.velvetTerra, M.book2, M.paper, M.velvetSage, M.rugDark];
      const hangY = (x1, x2, y1, y2, h, len) => { // face-out hanging in a 0.30 m deep unit: hooks every 0.48 m, garments parallel to the wall
        const n = Math.max(1, Math.floor((y2 - y1) / .48)), step = (y2 - y1) / n; let k = 0;
        for (let i = 0; i < n; i++) { const yc = y1 + step * (i + .5); add(new THREE.CylinderGeometry(.01, .01, x2 - x1 - .02, 10).rotateZ(Math.PI / 2), M.brass, (x1 + x2) / 2, h, yc, { uv: false });
          for (let j = 0; j < 4; j++) { const x = x1 + .05 + j * .055; B(x, yc - .21, x + .03, yc + .21, h - .03 - len * (.8 + .2 * rand()), h - .03, cloth[(k++ * 7 + i * 3) % cloth.length]); } } };
      const hangX = (x1, x2, y1, y2, h, len) => {
        const n = Math.max(1, Math.floor((x2 - x1) / .48)), step = (x2 - x1) / n; let k = 0;
        for (let i = 0; i < n; i++) { const xc = x1 + step * (i + .5); add(new THREE.CylinderGeometry(.01, .01, y2 - y1 - .02, 10).rotateX(Math.PI / 2), M.brass, xc, h, (y1 + y2) / 2, { uv: false });
          for (let j = 0; j < 4; j++) { const y = y1 + .05 + j * .055; B(xc - .21, y, xc + .21, y + .03, h - .03 - len * (.8 + .2 * rand()), h - .03, cloth[(k++ * 7 + i * 3) % cloth.length]); } } };
      // east side: long hanging | double rail | long hanging
      [.32, 1.0, 1.95, 2.91].forEach(y => B(4.29, y, 4.59, y + .025, 0, 2.6, M.oakFurn));
      B(4.29, .02, 4.59, 2.935, 2.25, 2.28, M.oakFurn); B(4.29, .02, 4.59, 2.935, 2.57, 2.6, M.oakFurn);
      hangY(4.29, 4.59, .345, 1.0, 2.15, 1.45); hangY(4.29, 4.59, 1.025, 1.95, 2.15, .85); hangY(4.29, 4.59, 1.025, 1.95, 1.12, .8); hangY(4.29, 4.59, 1.975, 2.91, 2.15, 1.45);
      // west side: shallow 0.25 m open shelving (folded clothes, bags, shoes) so all three sides carry storage
      [.6, 1.75, 2.9].forEach(y => B(3.29, y, 3.54, y + .025, 0, 2.6, M.oakFurn));
      for (let i = 0; i < 7; i++) { const h = .08 + i * .36; B(3.29, .6, 3.54, 2.925, h, h + .025, M.oakFurn);
        let y = .66; while (y < 2.85) { const w = .18 + rand() * .14; if (y + w > 1.72 && y < 1.8) { y = 1.8; continue; } if (y + w > 2.88) break;
          RB(3.31, y, 3.52, y + w, h + .025, h + .025 + (i < 2 ? .12 : .1 + rand() * .1), .015, cloth[(i * 5 + Math.floor(y * 11)) % cloth.length]); y += w + .03; } }
      B(3.53, .62, 3.54, 2.9, 2.5, 2.52, M.led, { cast: false });
      // north end: hanging across, shoe shelves below
      B(3.29, .02, 4.59, .32, 2.25, 2.28, M.oakFurn); B(3.29, .02, 4.59, .32, 2.57, 2.6, M.oakFurn); hangX(3.54, 4.59, .02, .32, 2.15, .95);
      [.08, .32].forEach(h => { B(3.54, .02, 4.59, .30, h, h + .025, M.oakFurn); for (let k = 0; k < 4; k++) RB(3.62 + k * .24, .05, 3.80 + k * .24, .27, h + .025, h + .12, .02, [M.carcass, M.paper, M.rattanDark, M.velvetChoco][k]); });
      // boxes on the top shelves
      [[3.6, .04], [4.32, .5], [4.32, 1.6], [4.32, 2.4]].forEach(([x, y], i) => i ? RB(x, y, x + .25, y + .4, 2.28, 2.5, .02, M.linenSand) : RB(x, y, x + .4, y + .25, 2.28, 2.5, .02, M.linenSand));
      B(4.29, .35, 4.30, 2.9, 2.2, 2.24, M.led, { cast: false });
      S(3.66, 1.6, 2.5, .14, M.opal, { cast: false }); C(3.66, 1.6, .003, 2.62, H, M.blackMetal, { seg: 6 }); lamp(3.66, 1.6, 2.3, 0xffe6c8, 3);
      RB(3.62, .45, 4.24, 2.88, 0, .012, .15, M.rug, { cast: false });
      endG();
      // sliding entrance door (arched top, on a brass rail on the bedroom side), drawn a third open
      beginG('Closet door');
      { const w = .76, hs = 2.05, r = .3, x0 = 3.83; const sh = new THREE.Shape(); sh.moveTo(x0, 0); sh.lineTo(x0 + w, 0); sh.lineTo(x0 + w, hs); sh.absarc(x0 + w - r, hs, r, 0, Math.PI / 2, false); sh.lineTo(x0 + r, hs + r); sh.absarc(x0 + r, hs, r, Math.PI / 2, Math.PI, false); sh.lineTo(x0, 0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: .035, bevelEnabled: false, curveSegments: 24 }); g.translate(0, .01, 3.062); add(g, M.lacquerCream, 0, 0, 0);
        B(x0 + .1, 3.1, x0 + w - .1, 3.104, .2, .23, M.skirting); B(x0 + .1, 3.1, x0 + w - .1, 3.104, 1.9, 1.93, M.skirting); B(x0 + .1, 3.1, x0 + .13, 3.104, .23, 1.9, M.skirting); B(x0 + w - .13, 3.1, x0 + w - .1, 3.104, .23, 1.9, M.skirting);
        B(x0 + .05, 3.1, x0 + .07, 3.13, .85, 1.35, M.brass); }
      B(3.25, 3.06, 4.58, 3.10, 2.40, 2.43, M.brass);
      endG();
      // bedroom 1 re-planned: headboard on the closet partition, bed faces west to the balcony door + window
      beginG('Bed (B1)'); bed(0, 0, 1.60, 2.00, 1, M.velvetTerra, M.linenSand, M.velvetSage);
      { const g = CUR; endG(); g.rotation.y = -Math.PI / 2; g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g);
        g.position.x += 3.185 - bb.max.x; g.position.z += 1.62 - (bb.min.z + bb.max.z) / 2; g.userData.home = { x: g.position.x, z: g.position.z, r: g.rotation.y }; }
      G('Nightstand', () => nightstand(2.95, .44)); G('Nightstand', () => nightstand(2.95, 2.80));
      beginG('Wall art (B1)'); artFrame('x', 0, 1, 1.2, 1.9, 1.28, 2.28, artAt(art1Tex, 1.29, 1.37, .52, .82)); endG();
      G('Rug (B1)', () => RB(.75, .45, 2.95, 2.79, 0, .014, .3, M.rug, { cast: false }));
      beginG('Beauty table (B1)'); RB(.6, 3.52, 1.7, 3.98, .72, .75, .008, M.walnut); cab({ axis: 'x', a1: .62, a2: 1.68, back: 3.98, front: 3.54, h1: .6, h2: .72, cols: [[1, 1], [1, 1]], fm: M.lacquerCream });
      [.66, 1.64].forEach(x => C(x, 3.56, .012, 0, .6, M.brass, { seg: 12 }));
      add(new THREE.CircleGeometry(.36, 96), M.mirror, 1.15, 1.45, 3.975, { uv: false, rotY: Math.PI }); add(new THREE.TorusGeometry(.365, .014, 16, 96), M.led, 1.15, 1.45, 3.974, { uv: false, rotY: Math.PI });
      vase(1.45, 3.8, .75, .5, M.stoneware); lamp(1.15, 3.7, 1.4, 0xffe6c8, 1.4); endG();
      beginG('Beauty organiser (B1)'); cab({ axis: 'x', a1: 1.72, a2: 2.12, back: 3.98, front: 3.60, h1: .08, h2: .72, cols: [[1, 3]], fm: M.lacquerCream }); RB(1.70, 3.58, 2.14, 3.98, .72, .75, .008, M.walnut);
        [1.0, 1.25].forEach(h => B(1.72, 3.74, 2.12, 3.98, h, h + .02, M.oakFurn)); B(1.72, 3.74, 1.74, 3.98, .75, 1.27, M.oakFurn); B(2.10, 3.74, 2.12, 3.98, .75, 1.27, M.oakFurn);
        [[1.79, 3.85, .75, .16, M.ceramic], [1.88, 3.82, .75, .11, M.brass], [1.97, 3.86, .75, .2, M.glassTint], [2.05, 3.83, .75, .09, M.blackGlass], [1.80, 3.86, 1.02, .13, M.glassTint], [1.92, 3.85, 1.02, .08, M.ceramic], [2.03, 3.86, 1.02, .15, M.paper], [1.85, 3.86, 1.27, .1, M.brass], [2.0, 3.86, 1.27, .17, M.ceramic]]
          .forEach(([x, y, h, t, m]) => C(x, y, .028, h, h + t, m, { seg: 14 })); endG();
      G('Vanity stool', () => { lathe([[0, 0], [.17, 0], [.17, .01], [.03, .03], [.025, .36], [0, .36]], 1.15, 3.22, 0, M.brass); lathe([[0, .36], [.17, .36], [.18, .38], [.18, .43], [.16, .46], [0, .465]], 1.15, 3.22, 0, M.velvetTerra); });
      // lounge: corner sofa (chaise on the kitchen side) faces the TV wall
      beginG('TV wall panel'); B(11.05, 4.285, 13.55, 4.32, 0, 2.7, M.walnut);
      { const geos = [], N = 50, w = 2.5 / N; for (let i = 0; i < N; i++) { const g = new THREE.CylinderGeometry(w / 2, w / 2, 2.7, 12, 1, true, Math.PI / 2, Math.PI); g.translate(11.05 + w / 2 + i * w, 1.35, 4.285); geos.push(g); } merged(geos, M.walnut, { clampMesh: true }); }
      B(11.03, 4.26, 11.05, 4.32, 0, 2.7, M.led, { cast: false }); B(13.55, 4.26, 13.57, 4.32, 0, 2.7, M.led, { cast: false }); endG();
      beginG('TV + console'); cab({ axis: 'x', a1: 11.45, a2: 13.15, back: 4.26, front: 3.88, h1: .24, h2: .52, cols: [[1, 1], [1, 1], [1, 1]], fm: M.walnut });
      B(11.5, 3.92, 13.1, 4.22, .22, .225, M.led, { cast: false }); B(11.58, 4.23, 13.02, 4.26, .98, 1.8, M.blackMetal);
      B(11.6, 4.227, 13.0, 4.23, 1.0, 1.78, P({ color: 0x050506, roughness: .08, clearcoat: 1, emissive: 0xffffff, emissiveMap: planar(tvTex, 11.6, 1.0, 1.40, .78, true), emissiveIntensity: 0, nightIntensity: 1.6 }), { cast: false });
      RB(11.8, 3.95, 12.8, 4.06, .52, .58, .02, M.blackMetal); vase(11.59, 4.06, .52, .9, M.stoneware); book(12.96, 4.06, .52, .22, .16, .035, M.book1, .1); lamp(12.3, 3.8, 1.3, 0x9fc4ff, .8); endG();
      typed('sofa', 6, 12.2, .47, FACE.S, { W: 2.7 }); typed('coffee', 6, 12.65, 1.6);
      typed('armchair', 3, 13.1, 3.0, faceTo(13.1, 3.0, 12.3, 1.2)); typed('floorlamp', 0, 10.55, .35);
      livingRug(12.25, 1.55, 1.35, 1.0);
      // dining for 4 by the open hall passage
      typed('dining', 5, 9.9, 3.87); [[9.55, 3.25, FACE.S], [10.25, 3.25, FACE.S], [8.92, 3.87, FACE.E], [10.88, 3.87, FACE.W]].forEach(([x, y, f]) => typed('chair', 0, x, y, f));
      diningDecor(9.9, 3.87);
      // one big built-in desk: wall to wall between the shaft and the east wall, open shelves + cabinets above, LED under the shelves
      beginG('Built-in desk');
      B(10.88, 6.45, 10.92, 7.13, 0, 2.6, M.oakFurn); B(13.58, 6.45, 13.62, 7.13, 0, 2.6, M.oakFurn);
      B(10.92, 6.45, 13.58, 7.13, .72, .76, M.oakFurn); B(10.92, 7.10, 13.58, 7.13, .76, 1.55, M.oakFurn);
      cab({ axis: 'x', a1: 10.94, a2: 11.44, back: 7.10, front: 6.50, h1: .06, h2: .72, cols: [[1, 3]], fm: M.lacquerCream });
      cab({ axis: 'x', a1: 13.06, a2: 13.56, back: 7.10, front: 6.50, h1: .06, h2: .72, cols: [[1, 3]], fm: M.lacquerCream });
      B(10.92, 6.80, 13.58, 7.13, 1.55, 1.58, M.oakFurn); B(10.92, 6.80, 13.58, 7.13, 1.95, 1.98, M.oakFurn);
      cab({ axis: 'x', a1: 10.92, a2: 13.58, back: 7.13, front: 6.78, h1: 2.0, h2: 2.6, cols: [[1, 1], [1, 1], [1, 1], [1, 1]], fm: M.lacquerCream });
      B(10.94, 6.80, 13.56, 6.83, 1.535, 1.55, M.led, { cast: false });
      [[11.95, M.book1], [12.15, M.book3], [13.2, M.book2]].forEach(([x, m], i) => { for (let k = 0; k < 6; k++) B(x + k * .035, 6.85, x + k * .035 + .03, 7.08, 1.58, 1.80 + (k % 3) * .03, [m, M.paper, M.book3][k % 3]); });
      vase(11.3, 6.95, 1.58, .5, M.stoneware); vase(12.8, 6.95, 1.98, .6, M.stonewareDark);
      [11.75, 12.85].forEach(x => { B(x - .3, 6.92, x + .3, 6.95, 1.0, 1.36, M.blackMetal); B(x - .28, 6.919, x + .28, 6.92, 1.02, 1.34, M.laptop, { cast: false }); B(x - .03, 6.93, x + .03, 7.0, .76, 1.0, M.blackMetal); B(x - .12, 6.88, x + .12, 7.05, .76, .77, M.blackMetal); B(x - .22, 6.62, x + .22, 6.76, .76, .775, M.carcass); });
      lamp(12.3, 6.8, 1.45, 0xffe2c0, 3);
      endG();
      typed('deskchair', 0, 11.75, 6.0, FACE.S); typed('deskchair', 0, 12.85, 6.0, FACE.S);
      beginG('Bookshelf'); B(9.27, 6.30, 10.86, 6.64, 0, .04, M.oakFurn); B(9.27, 6.30, 9.30, 6.64, 0, 2.4, M.oakFurn); B(10.83, 6.30, 10.86, 6.64, 0, 2.4, M.oakFurn); B(10.04, 6.30, 10.07, 6.64, 0, 2.4, M.oakFurn);
      [.45, .85, 1.25, 1.65, 2.05, 2.37].forEach(h => B(9.27, 6.30, 10.86, 6.64, h, h + .03, M.oakFurn));
      const bm = [M.book1, M.book2, M.book3, M.paper]; [.48, .88, 1.28, 1.68].forEach((h, r) => { let x = 9.33; while (x < 10.75) { const w = .025 + rand() * .03, hh = .22 + rand() * .1; if (x + w > 10.0 && x < 10.1) { x = 10.1; continue; } B(x, 6.36, x + w, 6.6, h, h + hh, bm[(r + Math.floor(x * 37)) % 4]); x += w + .004; } });
      vase(10.45, 6.47, 2.08, .6, M.stonewareDark); endG();
      typed('armchair', 2, 10.0, 5.5, faceTo(10.0, 5.5, 11.5, 5.4)); typed('floorlamp', 0, 9.2, 5.95);
      beginG('Office rug'); RB(10.7, 4.85, 13.3, 6.35, 0, .012, .05, M.rug, { cast: false }); endG();
    } },
};
const TKEY = 'palace1-types-v3';
function applyLayout() { // builds the Soft classic plan once at start-up
  const L = LAYOUTS.soft;
  buildArchVar();
  L.build(); L.plants();
  emissives.forEach(m => m.emissiveIntensity = night ? m.userData.night : m.userData.day);
  world.updateMatrixWorld(true);
  world.traverse(o => { if (o.isMesh && !o.userData.clamp && o.userData.minY === undefined) { const bb = new THREE.Box3().setFromObject(o); o.userData.minY = bb.min.y; o.userData.maxY = bb.max.y; } });
  scene.traverse(o => { if (o.isPointLight) o.visible = night; });
  Object.assign(VIEWS, L.views);
  loadTypes(); loadLayout(); loadStyle();
  zoneLabels(L); attachLabels();
  renderPlanNotes(); rebuildPT();
}
function saveTypes() { try { const d = {}; movables.forEach((g, i) => { if (g.userData.type) d[i] = g.userData.design; }); localStorage.setItem(TKEY, JSON.stringify(d)); } catch (e) {} }
function loadTypes() { let d = null; try { d = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) {} if (!d) return;
  for (const i in d) { const g = movables[i]; if (g && g.userData.type && DESIGNS[g.userData.type].items[d[i]] && g.userData.design !== d[i]) replaceWith(g, g.userData.type, d[i]); } }
function renderPlanNotes() { const L = LAYOUTS.soft;
  document.getElementById('planNotes').innerHTML = `<div class="note"><b>${L.name}</b><span class="why">${L.why}</span><span class="met">${L.met}</span></div>`
    + `<h2>Clearances (m)</h2><table>${L.clr.map(c => `<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('')}</table><p>Clearances are for the published plan; they do not update when you move furniture.</p>`; }
if (innerWidth < 700) document.getElementById('layouts').open = false;
/* ---- swap mode ---- */
let swapMode = false, swapSel = null;
const swapPanel = document.getElementById('swappanel');
function setSwap(on) { if (on && moveMode) setMove(false); swapMode = on; document.getElementById('swapBtn').setAttribute('aria-pressed', on);
  hintEl.textContent = on ? 'Click a sofa, table, chair, armchair or stool to choose another design' : 'Drag rotate · Right-drag pan · Scroll zoom';
  if (!on) showSwap(null); }
function showSwap(g) { swapSel = g; if (selBox) { scene.remove(selBox); selBox = null; } swapPanel.hidden = !g; if (!g) return;
  selBox = new THREE.BoxHelper(g, 0xc4552f); selBox.material.depthTest = false; selBox.material.transparent = true; selBox.renderOrder = 10; scene.add(selBox);
  const t = g.userData.type, list = document.getElementById('swaplist'); list.textContent = '';
  if (!t || DESIGNS[t].items.length < 2) { document.getElementById('swapname').textContent = g.name; document.getElementById('swaphint').textContent = 'No alternative designs for this item yet. Try a sofa, table, chair, armchair or bar stool.'; return; }
  document.getElementById('swapname').textContent = 'Choose a ' + DESIGNS[t].label.toLowerCase() + ' design'; document.getElementById('swaphint').textContent = 'Position, rotation and colours carry over.';
  DESIGNS[t].items.forEach((it, d) => { const b = document.createElement('button'); b.className = 'dbtn'; b.setAttribute('aria-pressed', d === g.userData.design);
    b.innerHTML = `<b>${it.name}</b><span>${it.info}</span>`;
    b.onclick = () => { const ng = replaceWith(swapSel, t, d); if (cutOn) applyCut(true); attachLabels(); saveTypes(); saveLayout(); saveStyle(); rebuildPT(); showSwap(ng); };
    list.appendChild(b); }); }
document.getElementById('swapBtn').onclick = () => setSwap(!swapMode);
document.getElementById('swapDone').onclick = () => showSwap(null);
stage.addEventListener('pointerdown', ev => { if (!swapMode || ev.button !== 0) return; const h = pick(ev); if (!h || !h.g) return; ev.stopPropagation(); showSwap(h.g); }, { capture: true });

/* ================= loop ================= */
const v = new V3();
function tick(now) {
  requestAnimationFrame(tick); window.__frames = (window.__frames || 0) + 1;
  if (anim) { const k = Math.min(1, (now - anim.t0) / 900), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(anim.from.p, anim.to.p, e); controls.target.lerpVectors(anim.from.t, anim.to.t, e); if (k >= 1) anim = null; if (photo && pt) pt.updateCamera(); }
  controls.update();
  const inside = camera.position.y < H - .05 && camera.position.x > -0.25 && camera.position.x < 13.87 && camera.position.z > -0.29 && camera.position.z < 9.3;
  const fov = (inside ? 62 : 42) + (innerWidth < 600 ? 14 : 0); if (Math.abs(camera.fov - fov) > .01) { camera.fov += (fov - camera.fov) * .15; if (Math.abs(camera.fov - fov) < .05) camera.fov = fov; camera.updateProjectionMatrix(); if (photo && pt) pt.updateCamera(); }
  if (ceiling) { ceiling.visible = inside; if (lastCeil !== inside) { lastCeil = inside; rebuildPT(); } }
  renderer.toneMappingExposure = (night ? 1.1 : 1.0) * (photo ? (inside ? 2.3 : 1.25) : 1);
  if (photo && pt) {
    if (ptDirty) { ptDirty = false; pt.setScene(scene, camera); }
    pt.renderSample(); statusEl.textContent = `Photo · ${Math.floor(pt.samples)} samples`;
  } else composer.render();
  const w = innerWidth, h = innerHeight;
  for (const l of labels) { const on = l.group === 'room' ? showRooms && camera.position.y > H : l.group === 'furn' ? showFurn && !!l.grp : showDims;
    if (l.grp) { if (!l.grp.visible || !l.grp.parent) { l.el.hidden = true; continue; } l.p.copy(l.local); l.grp.localToWorld(l.p); }
    if (l.top) l.p.y = cutOn ? Math.min(l.top, CUT + .02) : l.top;
    if (!on) { l.el.hidden = true; continue; } v.copy(l.p).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { l.el.hidden = true; continue; }
    l.el.hidden = false; l.el.style.left = ((v.x + 1) / 2 * w) + 'px'; l.el.style.top = ((1 - v.y) / 2 * h) + 'px'; }
}
build().then(() => requestAnimationFrame(tick)).catch(err => { console.error(err); loader.textContent = 'Could not build the 3D scene: ' + err.message; });
