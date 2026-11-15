// comforter.ge catalog entries (furniture only) and the size a plan item of type "product" takes. Pure data, also used in Node.
import data from './comforter.json' with { type: 'json' };

// height used when the catalog has none, per kind (metres; close to the median of the products that have one)
export const KIND_H = { table: .76, sofa: .85, cornerSofa: .85, tvStand: .5, coffeeTable: .45, armchair: .85, bed: .95, mattress: .25, wardrobe: 2.2, lounger: .9, barStool: .9, chair: .83, console: .8, showcase: 1.95,
  cabinet: 1.2, chest: .8, bookcase: 1.95, outdoorChair: .76, nightstand: .5, shelf: .4, shoeStand: .9, desk: .75, storageChest: .48, pouf: .38, kidsBed: .7 };
export const SEAT_KINDS = new Set(['chair', 'barStool', 'outdoorChair', 'pouf']);
export const TUCK_KINDS = new Set(['table', 'desk', 'coffeeTable']);
export const PRODUCTS = new Map(data.products.map(p => [p.id, p]));

// { p, w, d, h, kind } for a product item, or null when the product id is unknown; "extended" uses the larger width
export function productSize(it) {
  const p = PRODUCTS.get(it.product); if (!p) return null;
  return { p, kind: p.kind, w: it.extended && p.wMax ? p.wMax : p.w, d: p.d, h: p.h ?? KIND_H[p.kind] };
}
export const productLabel = it => it.type === 'product' ? (productSize(it)?.p.title ?? `Unknown product ${it.product}`) : null;
