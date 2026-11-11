import { LAYOUTS } from '../layout.js';

export function renderPlanNotes() { const L = LAYOUTS.soft;
  document.getElementById('planNotes').innerHTML = `<div class="note"><b>${L.name}</b><span class="why">${L.why}</span><span class="met">${L.met}</span></div>`
    + `<h2>Clearances (m)</h2><table>${L.clr.map(c => `<tr><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('')}</table><p>Clearances are for the published plan; they do not update when you move furniture.</p>`; }
if (innerWidth < 700) document.getElementById('layouts').open = false;
