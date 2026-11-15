// Downloads the comforter.ge catalog (public JSON API, English) into src/plan/comforter.json.
// Usage: node tools/fetch_comforter.mjs [--cache <dir>]; writes assets/comforter/catalog.json (all) and src/plan/comforter.json (furniture, app fields).
import fs from 'fs'; import os from 'os'; import path from 'path';
const API = 'https://api.comforter.ge/products/products', UA = 'catalog-fetch/1.0', OUT = 'src/plan/comforter.json', FULL = 'assets/comforter/catalog.json';
const ci = process.argv.indexOf('--cache');
const CACHE = ci > 0 ? process.argv[ci + 1] : path.join(os.tmpdir(), 'comforter-cache');
fs.mkdirSync(CACHE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 403 || r.status === 429) { console.error('Blocked (' + r.status + ') on ' + url + ': stopping.'); process.exit(2); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === 3) throw new Error(url + ': ' + e.message); await sleep(1000 * 2 ** i); }
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); await sleep(100); } }));
}

const list = [];
for (let off = 0; ; off += 200) {
  const d = await getJson(`${API}?limit=200&offset=${off}&locale=en`);
  list.push(...d.products); console.error('list', list.length, '/', d.count);
  if (!d.products.length || list.length >= d.count) break; await sleep(100);
}
const ids = [...new Set(list.map(p => p.product_id))];

const details = new Map(); let done = 0;
await pool(ids, 4, async id => {
  const f = path.join(CACHE, id + '.json');
  let d;
  if (fs.existsSync(f)) { try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* refetch */ } }
  if (!d) { d = await getJson(`${API}/${id}?locale=en`); fs.writeFileSync(f, JSON.stringify(d)); }
  details.set(id, d); if (++done % 100 === 0) console.error('detail', done, '/', ids.length);
});

const bad = []; const unparsed = { w: 0, d: 0, h: 0 };
// Returns [min, max] in metres or null; ranges "160/240", "x"-joined values and unit text are handled.
function num(raw, key, id) {
  if (raw == null || raw === '') return null;
  const nums = String(raw).replace(/,/g, '.').match(/\d+(?:\.\d+)?/g);
  if (!nums || /[xX×]/.test(String(raw)) && nums.length > 2) { unparsed[key]++; bad.push(`${id} ${key}=${JSON.stringify(raw)}`); return null; }
  const v = nums.map(Number).filter(x => x > 0);
  if (!v.length || v.length > 2) { unparsed[key]++; bad.push(`${id} ${key}=${JSON.stringify(raw)}`); return null; }
  const m = x => Math.round(x) / 100;
  return [m(Math.min(...v)), m(Math.max(...v))];
}
const clean = (v, max = 200) => v == null ? null : String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const okImg = u => { try { const x = new URL(u); return x.protocol === 'https:' && (x.host === 'media.comforter.ge' || (x.host === 'storage.googleapis.com' && x.pathname.startsWith('/comforter-media/'))) ? u : null; } catch { return null; } };
const spec = (d, ...names) => { const s = (d.specifications || []).find(x => names.includes(x.category_title)); return s ? s.value : null; };
const NOT_FURNITURE = /textile|serving|tableware|pillow|cushion|bedding|blanket|towel|duvet|bedspread|protector|hanger|mirror|clock/i;
// kind from the category leaf, then the title (some category trees stop at the parent)
const LEAF = { 'Shoe Stand': 'shoeStand', 'Storage Chest': 'storageChest', Mattress: 'mattress', 'Chest of Drawers': 'chest', 'Bar stool': 'barStool', 'Corner Sofa': 'cornerSofa', Sofa: 'sofa',
  Armchair: 'armchair', Pouf: 'pouf', 'Sun Lounger': 'lounger', 'Wall Unit': 'tvStand', Showcase: 'showcase', Nightstand: 'nightstand', Wardrobe: 'wardrobe', Bookcase: 'bookcase', Desk: 'desk', Shelf: 'shelf', 'Coffee Table': 'coffeeTable', Table: 'table' };
const TITLE = [[/^corner sofa/, 'cornerSofa'], [/^sofa/, 'sofa'], [/^armchair/, 'armchair'], [/^pouf/, 'pouf'], [/^bar stool|^stool/, 'barStool'], [/^chair/, 'chair'], [/^(sun )?lounger/, 'lounger'],
  [/^(coffee|side|center|end) table/, 'coffeeTable'], [/desk/, 'desk'], [/^table/, 'table'], [/^console/, 'console'], [/^tv /, 'tvStand'], [/^mattress/, 'mattress'], [/^bed/, 'bed'], [/^nightstand/, 'nightstand'],
  [/^wardrobe/, 'wardrobe'], [/^showcase/, 'showcase'], [/^book(case|shelf)/, 'bookcase'], [/^shelf/, 'shelf'], [/cabinet/, 'cabinet'], [/^shoe/, 'shoeStand'], [/chest/, 'storageChest']];
function kindOf(cat, title) {
  const top = cat[0] || '', leaf = cat[cat.length - 1] || '', t = title.toLowerCase();
  if (cat.length > 1) {
    if (leaf === 'Chair') return /outdoor/i.test(top) ? 'outdoorChair' : 'chair';
    if (leaf === 'Bed') return /kids/i.test(top) ? 'kidsBed' : 'bed';
    if (leaf === 'Console') return /^cabinet/.test(t) ? 'cabinet' : 'console';
    if (LEAF[leaf]) return LEAF[leaf];
  }
  const k = TITLE.find(([re]) => re.test(t));
  if (!k) return null;
  return k[1] === 'chair' && /outdoor/i.test(top) ? 'outdoorChair' : k[1] === 'bed' && /kids/i.test(top) ? 'kidsBed' : k[1];
}
const BEDS = new Set(['bed', 'kidsBed', 'mattress']), STORAGE = new Set(['bookcase', 'shelf', 'console', 'tvStand', 'cabinet', 'showcase', 'wardrobe', 'chest', 'nightstand', 'shoeStand']), swapped = [], short = [];
const sizeOf = raw => { const m = raw && String(raw).match(/^\s*(\d{2,3})\s*[xX×]\s*(\d{2,3})\s*(cm)?\s*$/); return m ? [Number(m[1]) / 100, Number(m[2]) / 100] : null; };

const products = ids.map(id => {
  const d = details.get(id), cat = (d.category_tree || []).map(c => c.title);
  const W = num(spec(d, 'Length'), 'w', id), D = num(spec(d, 'Width'), 'd', id), H = num(spec(d, 'Height'), 'h', id);
  const p = { id, group: d.product_group_id ?? null, title: clean(d.title, 80) || String(id), sku: d.sku, cat, kind: kindOf(cat, d.title),
    w: W ? W[0] : null, d: D ? D[0] : null, h: H ? H[0] : null };
  if (W && W[1] !== W[0]) p.wMax = W[1];
  if (D && D[1] !== D[0]) p.dMax = D[1];
  if (H && H[1] !== H[0]) p.hMax = H[1];
  const sleep = sizeOf(spec(d, 'Size')); if (sleep) p.sleep = sleep;
  if (sleep && (p.kind === 'bed' || p.kind === 'kidsBed' || p.kind === 'mattress') && (p.w == null || p.d == null)) {
    const bed = p.kind !== 'mattress'; p.w = Math.round((sleep[0] + (bed ? .1 : 0)) * 100) / 100; p.d = Math.round((sleep[1] + (bed ? .15 : 0)) * 100) / 100; p.est = true; }
  const swap = () => { [p.w, p.d] = [p.d, p.w]; [p.wMax, p.dMax] = [p.dMax, p.wMax]; for (const k of ['wMax', 'dMax']) if (p[k] === undefined) delete p[k]; swapped.push(`${p.id} ${p.kind} ${p.title} ${p.w}x${p.d}`); };
  if (p.w != null && p.d != null) {
    if (BEDS.has(p.kind) && p.w > p.d) { if (p.w >= 1.5) swap(); else short.push(`${p.id} ${p.title} ${p.w}x${p.d}`); }
    else if (STORAGE.has(p.kind) && p.d > p.w && p.d > (p.kind === 'bookcase' || p.kind === 'shelf' ? .7 : .8)) swap(); }
  p.material = clean(spec(d, 'Material')); p.color = clean(spec(d, 'Color', 'Colour'));
  p.price = Number(d.price); p.salePrice = d.on_sale && d.new_price ? Number(d.new_price) : null;
  p.img = okImg(d.image_url || (d.media && d.media[0] && d.media[0].image_url));
  p.furniture = !!p.kind && !cat.some(c => NOT_FURNITURE.test(c)) && p.w != null && p.d != null;
  return p;
}).sort((a, b) => a.id - b.id);

const head = { source: 'https://api.comforter.ge/products/products (locale=en)', fetched: new Date().toISOString().slice(0, 10) };
const write = (file, list) => { fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{' + Object.entries({ ...head, count: list.length }).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',') + ',"products":[\n' + list.map(p => JSON.stringify(p)).join(',\n') + '\n]}\n'); };
const APP = ['id', 'group', 'title', 'kind', 'w', 'd', 'h', 'wMax', 'dMax', 'hMax', 'sleep', 'est', 'material', 'color', 'price', 'salePrice', 'img'];
write(FULL, products);
write(OUT, products.filter(p => p.furniture).map(p => Object.fromEntries(APP.filter(k => p[k] !== undefined).map(k => [k, p[k]]))));
console.error('wrote', FULL, products.length, 'and', OUT, products.filter(p => p.furniture).length, 'furniture');
console.error('unparsed', JSON.stringify(unparsed), bad.slice(0, 10).join(' | '));
const lost = products.filter(p => !p.kind && p.w != null && p.d != null && !p.cat.some(c => NOT_FURNITURE.test(c)));
if (lost.length) console.error('unclassified (furniture:false):', lost.map(p => p.id + ' ' + p.title).join(' | '));
console.error('w/d swapped:', swapped.length, '\n' + swapped.join('\n'));
if (short.length) console.error('beds shorter than 1.5 m left as is:', short.join(' | '));
