import * as THREE from 'three';
import { H, V3, scene } from '../scene.js';

/* ================= labels / dims / furniture table ================= */
export const labelsEl = document.getElementById('labels'), labels = [];
export const dimGroup = new THREE.Group(); scene.add(dimGroup); dimGroup.visible = false;
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
export function zoneLabels(L) {
  L.rooms.forEach(([x, y, n, a]) => label(x, y, .05, `<b>${n}</b>${a}`, '', 'room'));
  L.furn.forEach(f => { const l = label(f[1], f[2], f[3] + .05, `${f[0]}<i>${sizeTxt(f)}</i>`, 'furn', 'furn'); l.top = f[3] + .05; });
  document.getElementById('furnTable').innerHTML = [...BASEFURN, ...L.furn].map(f => `<tr><td>${f[0]}</td><td>${sizeTxt(f)}</td></tr>`).join('');
  roomSizes();
}
export function setupOverlays() {
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
