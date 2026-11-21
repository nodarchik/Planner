// Test hook window.__products (tools/products_test.py): build catalog products in isolation, measure them, lay out contact sheets.
import * as THREE from 'three';
import { camera, controls, markShadows, scene, state } from './scene.js';
import { plan } from './plan/plan.js';
import { rebuildItem } from './build.js';
import { itemGroups } from './items/index.js';
import MODELS from './plan/comforter-models.json';
import { PRODUCTS, ensureProducts, productSize } from './plan/products.js';

const ids = new Set(); let ground = null, bg = null;
const mk = (id, product, pos, extra) => ({ id: '__p' + id, type: 'product', product, pos, ...extra });
const drop = () => { for (const id of ids) { const i = plan.items.findIndex(it => it.id === id); if (i >= 0) plan.items.splice(i, 1); rebuildItem(id, true); } ids.clear(); };
function measure(id) { const gs = itemGroups.get(id) || [], bb = new THREE.Box3(); gs.forEach(g => bb.expandByObject(g)); const s = bb.getSize(new THREE.Vector3()); return { size: [s.x, s.z, s.y], min: [bb.min.x, bb.min.z, bb.min.y], max: [bb.max.x, bb.max.z, bb.max.y], fit: gs[0] ? gs[0].scale.toArray() : [1, 1, 1], local: gs[0] && gs[0].userData.size ? gs[0].userData.size.toArray() : null }; }

const mapList = () => [...PRODUCTS.values()].map(p => { const s = productSize({ product: p.id }); return { id: p.id, kind: p.kind, title: p.title, w: s.w, d: s.d, h: s.h }; });

window.__products = {
  list: () => (PRODUCTS.size ? mapList() : ensureProducts().then(mapList)),
  // build one product at the origin, return its measured box [w, d, h] and remove it
  async build(product, extra = {}) { await ensureProducts(); const it = mk('b', product, [0, 0], extra); plan.items.push(it); ids.add(it.id);
    try { const sw = MODELS[product] && new Promise(r => { window.addEventListener('modelswap', r, { once: true }); setTimeout(r, 5000); }); rebuildItem(it.id, true); if (sw) await sw; const r = measure(it.id); return { ...r, hasModel: !!MODELS[product], modelLoaded: (itemGroups.get(it.id) || [])[0]?.userData.model == product }; } finally { drop(); } },
  // contact sheet: products in one row outside the apartment on a neutral floor, camera in front
  async sheet(list, gap = .35) { await ensureProducts(); drop(); const X0 = 400, items = list.map(id => ({ id, s: productSize({ product: id }) }));
    const total = items.reduce((a, o) => a + o.s.w + gap, -gap); let x = X0 - total / 2, deep = 0;
    items.forEach((o, i) => { const it = mk(i, o.id, [x + o.s.w / 2, 0]); x += o.s.w + gap; deep = Math.max(deep, o.s.d); plan.items.push(it); ids.add(it.id); rebuildItem(it.id, true); });
    if (!ground) { ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(X0, -.002, 0); ground.receiveShadow = true; }
    scene.add(ground); bg = bg || scene.background; scene.background = new THREE.Color(0xe4e4e4);
    const dist = Math.max(2.2, total * .29 + deep * 1.5), hh = Math.max(...items.map(o => o.s.h));
    camera.position.set(X0, hh * .5 + dist * .35, -(deep / 2 + dist)); controls.target.set(X0, hh * .35, 0); controls.update(); state.anim = null; markShadows(); state.dirty = true; return total; },
  clear() { drop(); if (ground) scene.remove(ground); if (bg) scene.background = bg; bg = null; markShadows(); state.dirty = true; }
};
