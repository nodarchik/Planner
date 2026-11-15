// Overlays computed from the plan: room labels with areas, room sizes and dimension lines, furniture labels with measured sizes.
import * as THREE from 'three';
import { V3, scene } from '../scene.js';
import { H, plan, bbox, area, fmt } from '../plan/plan.js';
import { itemGroups } from '../items/index.js';

export const labelsEl = document.getElementById('labels'), labels = [];
export const dimGroup = new THREE.Group(); scene.add(dimGroup); dimGroup.visible = false;
const dimMat = new THREE.LineBasicMaterial({ color: 0x2f6fd8 }); dimMat.userData.shared = true;

function addLabel(x, y, h, parts, cls, group) {
  const d = document.createElement('div'); d.className = 'lbl ' + (cls || '');
  for (const part of parts) d.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
  labelsEl.appendChild(d);
  const L = { el: d, p: new V3(x, h, y), group }; labels.push(L); return L;
}
const elTag = (tag, text) => { const e = document.createElement(tag); e.textContent = text; return e; };
export function clearOverlays() {
  labels.splice(0).forEach(l => l.el.remove());
  dimGroup.children.forEach(c => c.geometry?.dispose());
  dimGroup.clear();
}
function fillTable(id, cols, rows, captionText) {
  const tbl = document.getElementById(id); tbl.replaceChildren();
  const cap = elTag('caption', captionText); cap.className = 'sr-only'; tbl.appendChild(cap);
  const thead = document.createElement('thead'), htr = document.createElement('tr');
  cols.forEach(c => { const th = elTag('th', c); th.scope = 'col'; htr.appendChild(th); });
  thead.appendChild(htr); tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const [a, b] of rows) {
    const tr = document.createElement('tr'), th = elTag('th', a), td = elTag('td', b);
    th.scope = 'row'; tr.append(th, td); tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
}

export function setupOverlays() {
  const h = H + .12;
  const line = pts => dimGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new V3(x, h, y))), dimMat));
  function dim(x1, y1, x2, y2, txt) { const hz = Math.abs(x2 - x1) > Math.abs(y2 - y1); line([[x1, y1], [x2, y2]]);
    [[x1, y1], [x2, y2]].forEach(([x, y]) => line(hz ? [[x, y - .12], [x, y + .12]] : [[x - .12, y], [x + .12, y]]));
    addLabel((x1 + x2) / 2, (y1 + y2) / 2, h, [txt], 'dim', 'dim'); }
  const rows = [];
  for (const r of plan.rooms) { const [x1, y1, x2, y2] = bbox(r.poly), w = x2 - x1, d = y2 - y1, a = r.area ?? area(r.poly), size = `${fmt(w)} × ${fmt(d)}`;
    if (r.labelAt) addLabel(r.labelAt[0], r.labelAt[1], .05, [elTag('b', r.short || r.name), `≈${a.toFixed(1)} m²`], '', 'room');
    addLabel((x1 + x2) / 2, (y1 + y2) / 2, .6, [elTag('b', r.name), `${size} m`], 'dim', 'dim');
    dim(x1, y1 + Math.min(.3, d / 3), x2, y1 + Math.min(.3, d / 3), fmt(w)); dim(x1 + Math.min(.2, w / 3), y1, x1 + Math.min(.2, w / 3), y2, fmt(d));
    rows.push([r.name, `${size} · ${a.toFixed(1)} m²`]); }
  fillTable('roomSizeTable', ['Room', 'Size · area'], rows, 'Rooms by length, width and area');
}
// call after the items are built: one label per item that has a "label", size measured from what was built
export function furnitureLabels() {
  const rows = [];
  for (const it of plan.items) { if (!it.label) continue; const groups = itemGroups.get(it.id) || []; if (!groups.length) continue;
    const bb = new THREE.Box3(); groups.forEach(g => bb.expandByObject(g)); const s = bb.getSize(new V3()), c = bb.getCenter(new V3()), size = `${fmt(s.x)} × ${fmt(s.z)} × ${fmt(s.y)}`;
    const L = addLabel(c.x, c.z, bb.max.y + .05, [it.label, elTag('i', size)], 'furn', 'furn'); L.top = bb.max.y + .05; L.grp = groups[0]; L.local = groups[0].worldToLocal(L.p.clone());
    rows.push([it.label, size]); }
  fillTable('furnTable', ['Item', 'W × D × H (m)'], rows, 'Furniture dimensions');
}
