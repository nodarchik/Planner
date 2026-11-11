// npm run validate — schema check + reference checks for src/plan/palace1.json
import fs from 'fs';
import Ajv from 'ajv';
const plan = JSON.parse(fs.readFileSync('src/plan/palace1.json', 'utf8')), schema = JSON.parse(fs.readFileSync('src/plan/schema.json', 'utf8'));
const errors = [];
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
if (!validate(plan)) for (const e of validate.errors) errors.push(`schema ${e.instancePath || '/'} ${e.message}`);
const ids = new Set(), dup = id => { if (ids.has(id)) errors.push(`duplicate id "${id}"`); ids.add(id); };
[...plan.rooms, ...plan.walls, ...plan.blocks, ...plan.items].forEach(o => dup(o.id));
const solid = new Set([...plan.walls, ...plan.blocks].map(o => o.id)), rooms = new Set(plan.rooms.map(r => r.id));
for (const w of plan.walls) {
  const horiz = w.from[1] === w.to[1], vert = w.from[0] === w.to[0];
  if (horiz === vert) errors.push(`wall ${w.id}: must be axis-aligned and non-zero`);
  if (horiz && !'NS'.includes(w.grow) || vert && !'EW'.includes(w.grow)) errors.push(`wall ${w.id}: grow "${w.grow}" is along the wall`);
  const a = horiz ? w.from[0] : w.from[1], b = horiz ? w.to[0] : w.to[1]; if (b <= a) errors.push(`wall ${w.id}: "to" must be east/south of "from"`);
  const ops = [...(w.openings || [])].sort((p, q) => p.at - q.at); let c = a;
  for (const o of ops) { if (o.at < c - 1e-9 || o.at + o.w > b + 1e-9) errors.push(`wall ${w.id}: opening at ${o.at} overlaps another opening or leaves the wall`); c = o.at + o.w; }
}
for (const it of plan.items) {
  for (const ref of [it.wall, it.anchor && it.anchor.wall, it.north && it.north.wall, it.west && it.west.wall]) if (ref && !solid.has(ref)) errors.push(`item ${it.id}: unknown wall "${ref}"`);
  if (it.room && !rooms.has(it.room)) errors.push(`item ${it.id}: unknown room "${it.room}"`);
  if (it.from !== undefined && it.to !== undefined && it.to <= it.from) errors.push(`item ${it.id}: "to" must be greater than "from"`);
  if (it.type === 'walkInCloset' && it.unitDepth > 0.30 + 1e-9) errors.push(`item ${it.id}: closet unit depth ${it.unitDepth.toFixed(2)} exceeds the owner's 0.30 maximum`);
}
if (errors.length) { console.error(errors.map(e => '✗ ' + e).join('\n')); process.exit(1); }
console.log(`plan OK — ${plan.rooms.length} rooms, ${plan.walls.length} walls, ${plan.items.length} items`);

// geometric checks: listed; they fail the run only with --strict (the published plan has known, reviewed findings)
const { runChecks, summary } = await import('../src/plan/checks.js');
const list = runChecks(plan), s = summary(list);
for (const c of list) if (c.severity !== 'ok' || process.argv.includes('--all')) console.log(`${c.severity === 'error' ? '✗' : c.severity === 'warn' ? '!' : '✓'} ${c.item.padEnd(20)} ${c.check.padEnd(38)} ${String(c.value).padEnd(16)} required ${c.required}${c.note ? '   (' + c.note + ')' : ''}`);
console.log(`checks: ${s.error} errors, ${s.warn} warnings, ${s.ok} passed`);
if (s.error && process.argv.includes('--strict')) process.exit(1);
