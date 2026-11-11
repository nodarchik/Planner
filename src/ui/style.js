import * as THREE from 'three';
import { movables, state } from '../scene.js';
import { M, P, T } from '../materials.js';
import { plan } from '../plan/plan.js';
import { rebuildPT } from '../pathtracer.js';

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
  if (state.sel) renderParts(state.sel); rebuildPT();
}
export function applyPart(g, key, fin, color, save = true) {
  const m = makeFinish(fin, color);
  g.traverse(o => { if (o.isMesh && o.userData.mkey === key) o.material = m; });
  g.userData.custom[key] = { fin, color };
  if (save) { saveStyle(); rebuildPT(); }
}
export function resetLook(g, quiet) { g.traverse(o => { if (o.isMesh && o.userData.mkey) o.material = M[o.userData.mkey]; }); g.userData.custom = {}; if (!quiet) { saveStyle(); rebuildPT(); } }
export function saveStyle() { try { const custom = {}; movables.forEach((g, i) => { if (Object.keys(g.userData.custom).length) custom[i] = g.userData.custom; });
  localStorage.setItem(SKEY, JSON.stringify({ preset: curPreset, custom })); } catch (e) {} }
export function loadStyle() { let d = null; try { d = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) {}
  applyPreset(d && d.preset || plan.meta.style.preset);
  if (d && d.custom) for (const i in d.custom) { const g = movables[i]; if (!g) continue; for (const k in d.custom[i]) { const c = d.custom[i][k]; if (CAT[k]) applyPart(g, k, c.fin, c.color, false); } } }
export function partsOf(g) { const cnt = {}; g.traverse(o => { const k = o.isMesh && o.userData.mkey; if (k && CAT[k]) cnt[k] = (cnt[k] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6); }
export function renderParts(g) {
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
document.getElementById('lookReset').onclick = () => { if (state.sel) { resetLook(state.sel); renderParts(state.sel); } };
