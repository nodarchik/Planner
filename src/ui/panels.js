// Plan notes panel: design notes + the automatic checks (replaces the hand-written clearance table). Click a row to outline the item in red.
import * as THREE from 'three';
import { scene } from '../scene.js';
import { plan } from '../plan/plan.js';
import { runChecks, summary } from '../plan/checks.js';
import { itemGroups } from '../items/index.js';
import { rebuildPT } from '../pathtracer.js';

const marks = [];
function highlight(id) { marks.splice(0).forEach(m => scene.remove(m));
  for (const g of itemGroups.get(id) || []) { const b = new THREE.BoxHelper(g, 0xd0342c); b.material.depthTest = false; b.material.transparent = true; b.renderOrder = 11; scene.add(b); marks.push(b); }
  rebuildPT(); }

export function renderPlanNotes() { const n = plan.meta.notes || {}, list = runChecks(plan), s = summary(list), box = document.getElementById('planNotes');
  const rows = sev => list.filter(c => c.severity === sev).map(c => `<tr class="chk ${sev}" data-item="${c.item}"><td>${c.item}<br><span>${c.check}</span></td><td>${c.value}<br><span>${c.required}</span></td></tr>`).join('');
  box.innerHTML = `<div class="note"><b>${plan.meta.layout ?? ''}</b><span class="why">${n.why ?? ''}</span><span class="met">${n.metrics ?? ''}</span></div>`
    + `<h2>Checks · ${s.error} errors · ${s.warn} warnings · ${s.ok} passed</h2><table>${rows('error')}${rows('warn')}</table>`
    + `<details class="passed"><summary>Passed (${s.ok})</summary><table>${rows('ok')}</table></details>`
    + '<p>Computed from the plan data (m): overlaps, clearances, door swings, narrowest point of the route from the entrance. Click a row to outline the item. They do not follow furniture you drag in the page.</p>';
  box.querySelectorAll('tr.chk').forEach(tr => tr.onclick = () => highlight(tr.dataset.item)); }
if (innerWidth < 700) document.getElementById('layouts').open = false;
