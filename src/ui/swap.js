import * as THREE from 'three';
import { movables, scene, stage, state } from '../scene.js';
import { DESIGNS, replaceWith } from '../catalog.js';
import { applyCut } from './toolbar.js';
import { rebuildPT } from '../pathtracer.js';
import { attachLabels, hintEl, pick, saveLayout, setMove } from './editor.js';
import { saveStyle } from './style.js';

const TKEY = 'palace1-types-v3';
function saveTypes() { try { const d = {}; movables.forEach((g, i) => { if (g.userData.type) d[i] = g.userData.design; }); localStorage.setItem(TKEY, JSON.stringify(d)); } catch (e) {} }
export function loadTypes() { let d = null; try { d = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) {} if (!d) return;
  for (const i in d) { const g = movables[i]; if (g && g.userData.type && DESIGNS[g.userData.type].items[d[i]] && g.userData.design !== d[i]) replaceWith(g, g.userData.type, d[i]); } }
/* ---- swap mode ---- */
let swapSel = null;
const swapPanel = document.getElementById('swappanel');
export function setSwap(on) { if (on && state.moveMode) setMove(false); state.swapMode = on; document.getElementById('swapBtn').setAttribute('aria-pressed', on);
  hintEl.textContent = on ? 'Click a sofa, table, chair, armchair or stool to choose another design' : 'Drag rotate · Right-drag pan · Scroll zoom';
  if (!on) showSwap(null); }
function showSwap(g) { swapSel = g; if (state.selBox) { scene.remove(state.selBox); state.selBox = null; } swapPanel.hidden = !g; if (!g) return;
  state.selBox = new THREE.BoxHelper(g, 0xc4552f); state.selBox.material.depthTest = false; state.selBox.material.transparent = true; state.selBox.renderOrder = 10; scene.add(state.selBox);
  const t = g.userData.type, list = document.getElementById('swaplist'); list.textContent = '';
  if (!t || DESIGNS[t].items.length < 2) { document.getElementById('swapname').textContent = g.name; document.getElementById('swaphint').textContent = 'No alternative designs for this item yet. Try a sofa, table, chair, armchair or bar stool.'; return; }
  document.getElementById('swapname').textContent = 'Choose a ' + DESIGNS[t].label.toLowerCase() + ' design'; document.getElementById('swaphint').textContent = 'Position, rotation and colours carry over.';
  DESIGNS[t].items.forEach((it, d) => { const b = document.createElement('button'); b.className = 'dbtn'; b.setAttribute('aria-pressed', d === g.userData.design);
    b.innerHTML = `<b>${it.name}</b><span>${it.info}</span>`;
    b.onclick = () => { const ng = replaceWith(swapSel, t, d); if (state.cutOn) applyCut(true); attachLabels(); saveTypes(); saveLayout(); saveStyle(); rebuildPT(); showSwap(ng); };
    list.appendChild(b); }); }
document.getElementById('swapBtn').onclick = () => setSwap(!state.swapMode);
document.getElementById('swapDone').onclick = () => showSwap(null);
stage.addEventListener('pointerdown', ev => { if (!state.swapMode || ev.button !== 0) return; const h = pick(ev); if (!h || !h.g) return; ev.stopPropagation(); showSwap(h.g); }, { capture: true });
