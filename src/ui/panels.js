// Plan notes panel: design notes + the automatic checks (replaces the hand-written clearance table). Click a row to outline the item in red.
import * as THREE from 'three';
import { scene, state } from '../scene.js';
import { plan } from '../plan/plan.js';
import { runChecks, summary } from '../plan/checks.js';
import { itemGroups } from '../items/index.js';
import { rebuildPT } from '../pathtracer.js';

const marks = [];
function clearMarks() {
  if (!marks.length) return;
  marks.splice(0).forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  state.dirty = true;
}
function highlight(id) {
  clearMarks();
  for (const g of itemGroups.get(id) || []) { const b = new THREE.BoxHelper(g, 0xd0342c); b.material.depthTest = false; b.material.transparent = true; b.renderOrder = 11; scene.add(b); marks.push(b); }
  rebuildPT();
}

const FIXABLE_ITEMS = new Set(['basin-wc', 'w-east@1.69', 'closet-b1']);
function resolveWarnings() {
  const ed = window.__editor;
  if (!ed) return;
  const r2 = v => Math.round(v * 100) / 100;
  ed.edit(() => {
    const byId = id => plan.items.find(i => i.id === id);
    const basin = byId('basin-wc');
    if (basin && basin.depth > 0.30) basin.depth = 0.30;
    const coffee = byId('coffee-living');
    if (coffee && Array.isArray(coffee.pos) && coffee.pos[0] > 12.40) {
      const dx = 12.40 - coffee.pos[0];
      coffee.pos = [12.40, coffee.pos[1]];
      for (const decoId of ['bowl-coffee', 'books-coffee']) {
        const d = byId(decoId);
        if (d && Array.isArray(d.pos)) d.pos = [r2(d.pos[0] + dx), d.pos[1]];
      }
    }
    const closet = byId('closet-b1');
    if (closet && closet.unitDepth > 0.30) closet.unitDepth = 0.30;
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildChecksTable(items, sevLabel) {
  const tbl = document.createElement('table');
  const cap = el('caption', 'sr-only', sevLabel);
  tbl.appendChild(cap);
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const [col, cls] of [['Item / check', ''], ['Value / limit', '']]) {
    const th = el('th', cls, col);
    th.scope = 'col';
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const c of items) {
    const tr = el('tr', `chk ${c.severity}`);
    tr.dataset.item = c.item;
    const td1 = document.createElement('td');
    const btn = el('button', 'chk-btn');
    btn.type = 'button';
    btn.appendChild(document.createTextNode(String(c.item ?? '')));
    btn.appendChild(document.createElement('br'));
    btn.appendChild(el('span', '', String(c.check ?? '')));
    btn.onclick = () => highlight(c.item);
    td1.appendChild(btn);
    const td2 = document.createElement('td');
    td2.appendChild(document.createTextNode(String(c.value ?? '')));
    td2.appendChild(document.createElement('br'));
    td2.appendChild(el('span', '', String(c.required ?? '')));
    tr.append(td1, td2);
    tr.onclick = ev => { if (ev.target.closest('button') !== btn) highlight(c.item); };
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  return tbl;
}

export function renderPlanNotes() {
  clearMarks();
  const n = plan.meta.notes || {}, list = runChecks(plan), s = summary(list), box = document.getElementById('planNotes');
  box.replaceChildren();
  const note = el('div', 'note');
  note.append(el('b', '', plan.meta.layout ?? ''), el('span', 'why', n.why ?? ''), el('span', 'met', n.metrics ?? ''));
  const h = el('h2', '', `Checks · ${s.error} errors · ${s.warn} warnings · ${s.ok} passed`);
  const activeChecks = [...list.filter(c => c.severity === 'error'), ...list.filter(c => c.severity === 'warn')];
  let fixBtn = null;
  if (activeChecks.some(c => FIXABLE_ITEMS.has(c.item))) {
    fixBtn = el('button', 'fix-btn', 'Resolve warnings');
    fixBtn.id = 'fixWarnings';
    fixBtn.type = 'button';
    fixBtn.onclick = resolveWarnings;
  }
  const det = el('details', 'passed');
  det.append(el('summary', '', `Passed (${s.ok})`), buildChecksTable(list.filter(c => c.severity === 'ok'), 'Passed plan checks'));
  const p = el('p', '', 'Computed from the plan data (m): overlaps, clearances, door swings, narrowest point of the route from the entrance. Click a row to outline the item. They do not follow furniture you drag in the page.');
  box.append(...[note, h, fixBtn, buildChecksTable(activeChecks, 'Plan errors and warnings'), det, p].filter(Boolean));
}
if (innerWidth < 700) document.getElementById('layouts').open = false;
