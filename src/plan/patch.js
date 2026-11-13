// Difference between two plans, by id. Used for persistence (the patch is stored, not the whole plan) and for the change summary.
const LISTS = ['rooms', 'walls', 'blocks', 'items'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : JSON.stringify(v));

export function diffPlan(base, cur) {
  const patch = {};
  for (const k of LISTS) { const b = new Map(base[k].map(o => [o.id, o])), c = new Map(cur[k].map(o => [o.id, o])), p = { set: {}, unset: {}, add: [], remove: [] };
    for (const [id, o] of c) { const o0 = b.get(id); if (!o0) { p.add.push(o); continue; }
      for (const f of new Set([...Object.keys(o), ...Object.keys(o0)])) { if (same(o[f], o0[f])) continue; if (o[f] === undefined) (p.unset[id] ||= []).push(f); else (p.set[id] ||= {})[f] = o[f]; } }
    for (const id of b.keys()) if (!c.has(id)) p.remove.push(id);
    if (Object.keys(p.set).length || Object.keys(p.unset).length || p.add.length || p.remove.length) patch[k] = p; }
  for (const k of ['meta', 'views']) if (!same(base[k], cur[k])) patch[k] = cur[k];
  return patch;
}
export function applyPatch(base, patch) {
  const out = structuredClone(base);
  for (const k of LISTS) { const p = patch[k]; if (!p) continue;
    out[k] = out[k].filter(o => !p.remove.includes(o.id));
    for (const o of out[k]) { Object.assign(o, structuredClone(p.set[o.id] || {})); for (const f of p.unset[o.id] || []) delete o[f]; }
    out[k].push(...structuredClone(p.add)); }
  if (patch.views) out.views = structuredClone(patch.views);
  if (patch.meta) out.meta = { ...structuredClone(base.meta), ...structuredClone(patch.meta) }; // old patches may lack newer meta keys (lights)
  return out;
}
export const isEmpty = patch => !Object.keys(patch).length;

// short human-readable lines: "wardrobe-b2: to 5.06 → 4.6"
export function describe(base, cur) {
  const lines = [], patch = diffPlan(base, cur);
  for (const k of LISTS) { const p = patch[k]; if (!p) continue; const b = new Map(base[k].map(o => [o.id, o]));
    for (const id of new Set([...Object.keys(p.set), ...Object.keys(p.unset)])) { const o0 = b.get(id), parts = [];
      for (const [f, v] of Object.entries(p.set[id] || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v) && o0[f] && typeof o0[f] === 'object') { for (const g of Object.keys(v)) if (!same(v[g], o0[f][g])) parts.push(`${f}.${g} ${show(o0[f][g])} → ${show(v[g])}`); }
        else if (Array.isArray(v) && Array.isArray(o0[f]) && v.length === o0[f].length && v.some(e => e && typeof e === 'object' && !Array.isArray(e))) {
          v.forEach((e, i) => { for (const g of Object.keys(e)) if (!same(e[g], o0[f][i][g])) parts.push(`${f}[${e.id || i}].${g} ${show(o0[f][i][g])} → ${show(e[g])}`); }); }
        else parts.push(`${f} ${show(o0[f])} → ${show(v)}`); }
      for (const f of p.unset[id] || []) parts.push(`${f} removed`);
      lines.push(`${id}: ${parts.join(', ')}`); }
    for (const o of p.add) lines.push(`+ ${o.id} added: ${JSON.stringify(o)}`);
    for (const id of p.remove) lines.push(`− ${id} removed`); }
  if (patch.meta) lines.push('meta changed'); if (patch.views) lines.push('views changed');
  return lines;
}
