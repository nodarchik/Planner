// Shop product picker: search + kind filter over src/plan/comforter.json; openPicker(onPick) calls onPick(productId).
import { PRODUCTS } from '../plan/products.js';

const PAGE = 60, LIST = [...PRODUCTS.values()], fmt = n => n.toFixed(2);
const KINDS = Object.entries(LIST.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
export const sizeText = p => `${fmt(p.w)} × ${fmt(p.d)} × ${p.h != null ? fmt(p.h) : '—'}`;
let root, q, kind, list, more, cb = null, shown = 0, results = [], opener = null;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function row(p) {
  const b = el('button', 'pick-row'); b.type = 'button'; b.dataset.id = p.id; b.setAttribute('role', 'option');
  const th = el('span', 'pick-img'); if (p.img) { const im = new Image(); im.loading = 'lazy'; im.alt = ''; im.width = im.height = 48; im.onerror = () => { im.style.visibility = 'hidden'; }; im.src = p.img; th.appendChild(im); }
  const t = el('span', 'pick-t'); t.append(el('b', '', p.title), el('i', '', `${sizeText(p)} m · ${p.kind}${p.color ? ' · ' + p.color : ''}${p.est ? ' · est.' : ''}`));
  const price = el('span', 'pick-p'); price.textContent = 'GEL ' + (p.salePrice ?? p.price); if (p.salePrice != null) price.title = 'sale, was ' + p.price;
  b.append(th, t, price); b.onclick = () => pick(p.id); return b;
}
function render(reset = true) {
  if (reset) { const s = q.value.trim().toLowerCase(), k = kind.value; results = LIST.filter(p => (!k || p.kind === k) && (!s || p.title.toLowerCase().includes(s))); shown = 0; list.textContent = ''; list.scrollTop = 0; }
  const next = results.slice(shown, shown + PAGE); next.forEach(p => list.appendChild(row(p))); shown += next.length;
  more.hidden = shown >= results.length; more.textContent = `Show more (${results.length - shown} left)`;
  if (reset && !results.length) list.appendChild(el('div', 'pick-empty', 'No products match.'));
  root.querySelector('.pick-count').textContent = `${results.length} products`;
}
function pick(id) { const f = cb; close(); if (f) f(id); }
export function closePicker() { close(); }
function close() { if (root.hidden) return; root.hidden = true; cb = null; if (opener && opener.isConnected) opener.focus(); opener = null; }

function build() {
  root = el('div', 'picker'); root.id = 'picker'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Shop products');
  const box = el('div', 'picker-box'), head = el('div', 'picker-head');
  q = el('input'); q.type = 'search'; q.id = 'pickQ'; q.placeholder = 'Search shop products…'; q.setAttribute('aria-label', 'Search shop products'); q.autocomplete = 'off';
  kind = el('select', 'sel'); kind.id = 'pickKind'; kind.setAttribute('aria-label', 'Kind'); kind.add(new Option(`All kinds (${LIST.length})`, '')); KINDS.forEach(([k, n]) => kind.add(new Option(`${k} (${n})`, k)));
  const x = el('button', '', 'Close'); x.type = 'button'; x.id = 'pickClose'; x.onclick = close;
  head.append(q, kind, x); list = el('div', 'pick-list'); list.id = 'pickList'; list.setAttribute('role', 'listbox'); more = el('button', 'pick-more'); more.type = 'button'; more.onclick = () => render(false);
  box.append(head, list, more, el('div', 'pick-count')); root.appendChild(box); document.body.appendChild(root);
  q.oninput = kind.onchange = () => render();
  root.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Escape') { ev.preventDefault(); close(); } else if (ev.key === 'Enter' && ev.target === q && !ev.isComposing) { ev.preventDefault(); if (results[0]) pick(results[0].id); } };
  root.onclick = ev => { if (ev.target === root) close(); };
}
export function openPicker(onPick) {
  if (!root) build(); cb = onPick; opener = document.activeElement; root.hidden = false; q.value = ''; kind.value = ''; render(); q.focus();
}
