import * as THREE from 'three';
import { plan } from './plan/plan.js';

// Lumens are the truth between lamps; meta.lights.scale maps them into this scene's (non-physical) units.
const DEFAULT = { scale: .018, kinds: { pendant: { lm: 1000, k: 3000 }, closetPendant: { lm: 600, k: 3000 }, sconce: { lm: 400, k: 3000 }, tableLamp: { lm: 450, k: 3000 }, floorLamp: { lm: 800, k: 3000 },
  downlight: { lm: 400, k: 3000 }, coveStrip: { lm: 600, k: 3000 }, mirrorLight: { lm: 650, k: 3000 }, shelfStrip: { lm: 300, k: 3000 }, tvGlow: { lm: 100, k: 6500 } } };
const L = () => plan.meta.lights || DEFAULT;
export const lightScale = () => L().scale;
export function kindOf(kind) { const k = L().kinds[kind] || DEFAULT.kinds[kind]; if (!k) throw new Error(`plan: unknown light kind "${kind}" (meta.lights.kinds)`); return k; }
export const pointCd = lm => lm / (4 * Math.PI) * lightScale();
export const spotCd = (lm, half) => lm / (2 * Math.PI * (1 - Math.cos(half))) * lightScale();
export const stripNits = (lm, area) => lm / (Math.PI * area) * lightScale();
// colour temperature (K) to a linear colour, normalised to max channel 1 (Tanner Helland fit)
export function kelvin(k) { const t = k / 100, c = v => Math.max(0, Math.min(255, v)) / 255;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -.1332047592), g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -.0755148492),
    b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace); }
// { lm, k } of a plan light item: lm / k, or the old unitless intensity (candela = intensity * .4)
export function itemLight(it) { return { lm: it.lm ?? (it.intensity ?? 6) * .4 * 4 * Math.PI / lightScale(), k: it.k }; }

// rooms with no window or balcony door within reach of their outline: they only ever get artificial light
const nearEdge = (p, poly, d) => poly.some((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < d; });
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
  if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
export function isWindowless(x, y) {
  const room = plan.rooms.find(r => inside([x, y], r.poly)); if (!room) return false;
  for (const w of plan.walls) for (const o of w.openings || []) { if (o.type !== 'window' && o.type !== 'balconyDoor') continue;
    const m = o.at + o.w / 2, p = w.from[1] === w.to[1] ? [m, w.from[1]] : [w.from[0], m]; if (nearEdge(p, room.poly, .5)) return false; }
  return true; }
