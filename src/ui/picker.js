// Shop product picker: search + kind filter over src/plan/comforter.json; openPicker(onPick) calls onPick(productId).
import { PRODUCTS, ensureProducts } from '../plan/products.js';

const PAGE = 60, fmt = n => n.toFixed(2);
export const sizeText = p => `${fmt(p.w)} × ${fmt(p.d)} × ${p.h != null ? fmt(p.h) : '—'}`;
let LIST = null, root, q, kind, list, more, count, cb = null, shown = 0, results = [];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function syncData() {
  if (LIST) return true;
  if (!PRODUCTS.size) return false;
  LIST = [...PRODUCTS.values()];
  const kinds = Object.entries(LIST.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  kind.replaceChildren(new Option(`All kinds (${LIST.length})`, ''));
  kinds.forEach(([k, n]) => kind.add(new Option(`${k} (${n})`, k)));
  return true;
}

function row(p) {
  const b = el('button', 'pick-row'); b.type = 'button'; b.dataset.id = p.id;
  const th = el('span', 'pick-img'); if (p.img) { const im = new Image(); im.loading = 'lazy'; im.alt = ''; im.width = im.height = 48; im.onerror = () => { im.style.visibility = 'hidden'; }; im.src = p.img; th.appendChild(im); }
  const t = el('span', 'pick-t'); t.append(el('b', '', p.title), el('i', '', `${sizeText(p)} m · ${p.kind}${p.color ? ' · ' + p.color : ''}${p.est ? ' · est.' : ''}`));
  const price = el('span', 'pick-p'); price.textContent = 'GEL ' + (p.salePrice ?? p.price); if (p.salePrice != null) price.title = 'sale, was ' + p.price;
  b.append(th, t, price); b.onclick = () => pick(p.id); return b;
}
function render(reset = true) {
  if (!syncData()) return;
  if (reset) { const s = q.value.trim().toLowerCase(), k = kind.value; results = LIST.filter(p => (!k || p.kind === k) && (!s || p.title.toLowerCase().includes(s))); shown = 0; list.textContent = ''; list.scrollTop = 0; }
  const next = results.slice(shown, shown + PAGE); next.forEach(p => list.appendChild(row(p))); shown += next.length;
  more.hidden = shown >= results.length; more.textContent = `Show more (${results.length - shown} left)`;
  if (reset && !results.length) list.appendChild(el('div', 'pick-empty', 'No products match.'));
  count.textContent = `${results.length} products`;
}
function pick(id) { const f = cb; close(); if (f) f(id); }
export function closePicker() { close(); }
function close() { if (!root || (!root.open && root.hidden)) return; if (root.open) root.close(); root.hidden = true; cb = null; }

function build() {
  root = el('dialog', 'picker'); root.id = 'picker'; root.hidden = true; root.setAttribute('closedby', 'any'); root.setAttribute('aria-label', 'Shop products');
  const head = el('div', 'picker-head');
  q = el('input'); q.type = 'text'; q.inputMode = 'search'; q.id = 'pickQ'; q.placeholder = 'Search shop products…'; q.setAttribute('aria-label', 'Search shop products'); q.autocomplete = 'off'; q.autofocus = true;
  kind = el('select', 'sel'); kind.id = 'pickKind'; kind.setAttribute('aria-label', 'Kind'); kind.add(new Option('All kinds', ''));
  const x = el('button', '', 'Close'); x.type = 'button'; x.id = 'pickClose'; x.onclick = close;
  head.append(q, kind, x); list = el('div', 'pick-list'); list.id = 'pickList'; more = el('button', 'pick-more'); more.type = 'button'; more.onclick = () => render(false);
  count = el('div', 'pick-count');
  root.append(head, list, more, count); document.body.appendChild(root);
  q.oninput = kind.onchange = () => render();
  root.onkeydown = ev => { if (ev.key !== 'Escape') ev.stopPropagation(); if (ev.key === 'Enter' && ev.target === q && !ev.isComposing) { ev.preventDefault(); if (results[0]) pick(results[0].id); } };
  root.addEventListener('cancel', () => { root.hidden = true; cb = null; });
  root.addEventListener('close', () => { root.hidden = true; cb = null; root.returnValue = ''; });
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = e => { const r = root.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    let pressedOutside = false;
    root.addEventListener('pointerdown', e => { pressedOutside = outside(e); });
    root.addEventListener('pointerup', e => { if (pressedOutside && outside(e)) close(); });
  }
}
export function openPicker(onPick) {
  if (!root) build();
  cb = onPick; root.hidden = false; q.value = ''; kind.value = '';
  if (!root.open) root.showModal();
  if (syncData()) render();
  else { list.textContent = ''; more.hidden = true; count.textContent = 'Loading products…'; ensureProducts().then(() => { if (root.open) render(); }); }
  q.focus();
}
