import * as THREE from 'three';
import { frame } from './scene.js';

/* ================= procedural noise ================= */
let SEED = 11;
export const rand = () => { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; };
export function vnoise(nx, ny = nx) {
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
export async function buildTextures() {
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
export function texFor(set, tile) {
  const k = set + '@' + tile; if (texCache[k]) return texCache[k];
  const s = SETS[set], r = {};
  for (const n of ['map', 'normalMap', 'roughnessMap']) { const t = s[n].clone(); t.repeat.set(1 / tile, 1 / tile); t.needsUpdate = true; r[n] = t; }
  return (texCache[k] = r);
}

/* ================= canvas images: TV, art, hob ================= */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
export const tvTex = canvasTex(1280, 720, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h * .7); sky.addColorStop(0, '#2b3a6b'); sky.addColorStop(.45, '#c96b5a'); sky.addColorStop(1, '#f5b77a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,224,170,.95)'; g.beginPath(); g.arc(w * .62, h * .56, h * .07, 0, 7); g.fill();
  const layers = [['#b45a3c', .58], ['#8a3f2e', .66], ['#5e2b26', .76], ['#38191a', .88]];
  layers.forEach(([c, y], i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * y + Math.sin(x / w * (3 + i) * Math.PI + i) * h * .04 + Math.sin(x / w * 11 + i * 2) * h * .012);
    g.lineTo(w, h); g.fill(); });
});
export const art1Tex = canvasTex(700, 1000, (g, w, h) => {
  g.fillStyle = '#efe6d8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c1623d'; g.beginPath(); g.moveTo(w * .18, h * .86); g.lineTo(w * .18, h * .45); g.arc(w * .5, h * .45, w * .32, Math.PI, 0); g.lineTo(w * .82, h * .86); g.fill();
  g.fillStyle = '#8c9a7e'; g.beginPath(); g.arc(w * .66, h * .3, w * .14, 0, 7); g.fill();
  g.fillStyle = '#4a2e22'; g.fillRect(w * .18, h * .86, w * .64, h * .012);
  g.strokeStyle = '#4a2e22'; g.lineWidth = 3; g.beginPath(); g.arc(w * .5, h * .45, w * .2, Math.PI, 0); g.stroke();
});
export const art2Tex = canvasTex(1000, 700, (g, w, h) => {
  g.fillStyle = '#e9dccb'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d99a4e'; g.beginPath(); g.arc(w * .35, h * .42, h * .18, 0, 7); g.fill();
  [['#a5683f', .62], ['#7d8b6d', .74], ['#4a3a2c', .86]].forEach(([c, y], i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) g.lineTo(x, h * y + Math.sin(x / w * Math.PI * (1.5 + i * .5) + i) * h * .06); g.lineTo(w, h); g.fill(); });
});
export const hobTex = canvasTex(700, 400, (g, w, h) => {
  g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3;
  [[.25, .3, .2], [.25, .72, .14], [.72, .3, .14], [.72, .7, .2]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x * w, y * h, r * h, 0, 7); g.stroke(); });
  g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * (.38 + i * .045), h * .93, 3, 0, 7); g.fill(); }
});
export function planar(tex, u0, v0, w, h, flipU = false) { const t = tex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (flipU) { t.repeat.set(-1 / w, 1 / h); t.offset.set((u0 + w) / w, -v0 / h); } else { t.repeat.set(1 / w, 1 / h); t.offset.set(-u0 / w, -v0 / h); } return t; }
