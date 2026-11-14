// In-app assistant: plain-language requests are sent to Claude through /api/chat (a Vercel function that holds the API key).
// Claude answers with apply_changes tool calls; they are applied here as one undoable edit each, and the check findings go back to Claude.
import { plan } from '../plan/plan.js';
import { describe } from '../plan/patch.js';
import { runChecks } from '../plan/checks.js';
import { DESIGNS } from '../catalog.js';
import { MODELS } from '../assets.js';
import { BUILDERS, itemGroups } from '../items/index.js';
import { SHAPES } from '../items/parts.js';
import { M } from '../materials.js';
import { lookKeys, setPreset, styleInfo } from './style.js';
import { history as editHistory, tryEdit } from './editor.js';
import { setView } from './views.js';
import { camera, controls, state } from '../scene.js';
import { enter as walkEnter, leave as walkLeave, walkError, walkTo } from './walk.js';
import { setPhoto } from '../pathtracer.js';
import { CHAT_MODELS, DEFAULT_MODEL } from '../chat-models.js';
import { load, save, fresh, watch, trim, repair, cleanLog, MAX_LOG } from './chathistory.js';
import { bindingsInfo } from './bindings.js';
import { setFast } from '../fast.js';

const $ = id => document.getElementById(id), panel = $('chatpanel'), log = $('chatlog'), input = $('chatinput'), sendBtn = $('chatsend');
const NO_ID = ['slabs', 'floors', 'ceilings']; // lists whose entries are addressed by index
const PWKEY = 'palace1-chat-password', MODELKEY = 'palace1-chat-model', labelOf = id => (CHAT_MODELS.find(m => m.id === id) || { label: id }).label;
let model = DEFAULT_MODEL; try { const m = localStorage.getItem(MODELKEY); if (CHAT_MODELS.some(c => c.id === m)) model = m; } catch (e) {}
let history = [], entries = [], synced = null, busy = false, ready = Promise.resolve(); // history = API conversation, entries = visible transcript [class, text]

const keysByType = () => { const by = {}; for (const it of plan.items) for (const g of itemGroups.get(it.id) || []) for (const k of lookKeys(g)) (by[it.type] ||= new Set()).add(k); return by; };
const context = () => ['Furniture catalog (type → variant index: design; opts = extra fields in the item "opts" object, W = overall width in m):',
  ...Object.entries(DESIGNS).map(([t, d]) => `- ${t}: ` + d.items.map((v, i) => `${i}: ${v.name} (${v.info})${v.opts ? ' opts ' + v.opts.join(',') : ''}`).join('; ')),
  bindingsInfo(),
  'Built-in item types: ' + Object.keys(BUILDERS).join(', '),
  'Shapes of a "parts" item (size length): ' + Object.entries(SHAPES).map(([k, n]) => `${k} (${n})`).join(', '),
  'Material keys for parts[].material (a part with "color" clones the material and tints it): ' + Object.keys(M).join(', '),
  'Model ids for items of type "model" or planter.model: ' + Object.entries(MODELS).map(([k, m]) => `${k} (${m.size.map(n => n.toFixed(2)).join(' × ')})`).join(', '),
  'item.look = { partKey: { fin, color } } recolours one part of an item. Part keys and finishes:', ...styleInfo(),
  'Part keys found on the built items, by item type (other designs of a type may differ; a key an item does not have is ignored): ' + Object.entries(keysByType()).map(([t, k]) => `${t}: ${[...k].join(' ')}`).join('; ')].join('\n');

function add(cls, text, by) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; if (by) d.dataset.model = by; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
function say(cls, text, keep = true, by = '') { if (keep) entries = [...entries, by ? [cls, text, by] : [cls, text]].slice(-MAX_LOG); return add(cls, text, by); } // by = model label, display data only (never sent to the API)
// stored or adopted conversation: the next request carries the full current plan again (synced = null)
function restore(d) { history = d ? d.messages : []; entries = d ? d.log : []; synced = null; log.textContent = ''; entries.forEach(([c, t, by]) => add(c, t, by)); }
const persist = () => save(history.length || entries.length ? { messages: history, log: entries } : null);

// one batch from Claude → plan edits. Throws on the first invalid edit; tryEdit then restores the plan.
function applyBatch(changes) {
  const rm = changes.filter(c => c.op === 'remove' && NO_ID.includes(c.list)).filter((c, i, a) => a.findIndex(d => d.list === c.list && d.id === c.id) === i).sort((a, b) => b.id - a.id); // indexes refer to the list before the batch
  const isIdx = c => c.op === 'unset' && /\.\d+$/.test(c.path), groups = new Map(); // unset of array entries: highest index first per array, so indexes refer to the list before the batch
  changes.filter(isIdx).forEach(c => { const k = [c.list, c.id, c.path.replace(/\.\d+$/, '')].join('|'); (groups.get(k) || groups.set(k, []).get(k)).push(c); });
  const idx = [...groups.values()].flatMap(g => g.sort((a, b) => +b.path.match(/\d+$/)[0] - +a.path.match(/\d+$/)[0]));
  changes = [...changes.filter(c => !(c.op === 'remove' && NO_ID.includes(c.list)) && !isIdx(c)), ...idx, ...rm];
  for (const c of changes) { const parts = c.path ? c.path.split('.').map(p => (/^\d+$/.test(p) ? +p : p)) : [], val = () => JSON.parse(c.value_json), noId = NO_ID.includes(c.list);
    const index = () => { const i = plan[c.list].findIndex((x, n) => (noId ? String(n) : x.id) === c.id); if (i < 0) throw new Error(`no ${c.list} entry "${c.id}"`); return i; };
    const find = () => c.list === 'meta' ? plan.meta : c.list === 'views' ? (plan.views[c.id] || (() => { throw new Error(`no view "${c.id}"`); })()) : plan[c.list][index()];
    const setPath = (host, v) => { if (!parts.length) throw new Error('set / unset need a path'); if (parts.some(p => ['__proto__', 'constructor', 'prototype'].includes(p))) throw new Error(`path "${c.path}" is not allowed`); for (const p of parts.slice(0, -1)) { host = host[p]; if (host === null || typeof host !== 'object') throw new Error(`path "${c.path}" does not exist on ${c.id || 'meta'}`); }
      const last = parts[parts.length - 1]; if (v === undefined) { if (Array.isArray(host) && typeof last === 'number') host.splice(last, 1); else delete host[last]; } else host[last] = v; };
    if (c.list === 'meta' && c.op !== 'set' && c.op !== 'unset') { setPath(plan.meta, c.op === 'add' ? val() : undefined); continue; }
    if (c.op === 'add') { const o = val(); if (c.list === 'views') { plan.views[c.id] = o; continue; } if (!noId) { if (!o.id) o.id = c.id; if (plan[c.list].some(x => x.id === o.id)) throw new Error(`id "${o.id}" already exists`); } if (c.list === 'items' && !o.type) throw new Error('an item needs a type'); plan[c.list].push(o); }
    else if (c.op === 'remove') { if (c.list === 'views') { find(); delete plan.views[c.id]; continue; } plan[c.list].splice(index(), 1); }
    else setPath(find(), c.op === 'unset' ? undefined : val()); }
}
// view state: drive the same toolbar controls a click would
function applyViewState(v) {
  let uiErr = null; const onErr = ev => { uiErr = ev.error || new Error(ev.message); ev.preventDefault(); };
  const fire = (id, value) => { const e = $(id); e.value = value; addEventListener('error', onErr); e.dispatchEvent(new Event(id === 'sunTime' ? 'input' : 'change')); removeEventListener('error', onErr); if (uiErr) throw uiErr; }, done = []; // listener errors do not propagate: catch and rethrow them
  if ('sun_month' in v && !(Number.isInteger(v.sun_month) && v.sun_month >= 1 && v.sun_month <= 12)) throw new Error('sun_month must be an integer 1 to 12');
  if ('sun_hour' in v && !(v.sun_hour >= 5 && v.sun_hour <= 21)) throw new Error('sun_hour must be between 5 and 21');
  const num3 = (a, n) => { if (!Array.isArray(a) || a.length !== 3 || !a.every(Number.isFinite)) throw new Error(n + ' needs 3 numbers [x, y, z]'); };
  if ('focal' in v && ![...$('focal').options].some(o => +o.value === v.focal)) throw new Error('focal must be one of ' + [...$('focal').options].map(o => o.value).join(', ') + ' (0 = auto)');
  if ('fstop' in v && ![...$('fstop').options].some(o => +o.value === v.fstop)) throw new Error('fstop must be one of ' + [...$('fstop').options].map(o => o.value).join(', ') + ' (0 = off)');
  for (const k of ['dims', 'furniture', 'labels', 'walk', 'fast']) if (k in v && typeof v[k] !== 'boolean') throw new Error(k + ' must be true or false');
  if (v.fast && v.photo) throw new Error('fast and photo cannot both be on: Photo needs the full lighting');
  if ('walk_to' in v) { const w = v.walk_to; if (!w || ![w.x, w.y].every(Number.isFinite) || ('yaw' in w && !Number.isFinite(w.yaw))) throw new Error('walk_to needs {x, y, yaw} as numbers'); if (v.walk === false) throw new Error('walk_to conflicts with walk false'); }
  if ('camera' in v) { const c = v.camera; if (!c) throw new Error('camera needs {cam, target}'); num3(c.cam, 'camera.cam'); num3(c.target, 'camera.target'); if (v.walk_to || v.walk || state.walk && v.walk !== false) throw new Error('leave walk mode (walk false) before setting the camera'); }
  if ('style' in v && ![...$('style').options].some(o => o.value === v.style)) throw new Error(`unknown style "${v.style}"`);
  if ('view' in v && !plan.views[v.view]) throw new Error(`no view "${v.view}"`);
  if ('walk_to' in v) { const e = walkError(v.walk_to.x, v.walk_to.y); if (e) throw new Error(e); }
  if ('night' in v) { $(v.night ? 'mnight' : 'mday').click(); done.push('night ' + v.night); }
  if ('cut' in v) { $(v.cut ? 'wcut' : 'wfull').click(); done.push('cut ' + v.cut); }
  if ('style' in v) { setPreset(v.style); done.push('style ' + v.style + ' (saved in meta.style.preset)'); }
  if ('sun_month' in v) { fire('sunMonth', v.sun_month); done.push('sun month ' + v.sun_month); }
  if ('sun_hour' in v) { fire('sunTime', v.sun_hour); done.push('sun hour ' + v.sun_hour); }
  if ('view' in v) { setView(v.view); done.push('view ' + v.view); }
  if ('focal' in v) { fire('focal', v.focal); done.push('focal ' + v.focal); }
  if ('fstop' in v) { fire('fstop', v.fstop); done.push('fstop ' + v.fstop); }
  for (const [k, id] of [['dims', 'tdim'], ['furniture', 'tfur'], ['labels', 'tlab']]) if (k in v) { if (($(id).getAttribute('aria-pressed') === 'true') !== v[k]) $(id).click(); done.push(k + ' ' + v[k]); }
  if (v.walk === false && state.walk) { walkLeave(true); done.push('walk false'); }
  if (v.walk === true && !state.walk) { walkEnter(); done.push('walk true'); }
  if ('walk_to' in v) { walkTo(v.walk_to.x, v.walk_to.y, v.walk_to.yaw || 0); done.push(`walk_to ${v.walk_to.x}, ${v.walk_to.y}`); }
  if ('camera' in v) { state.anim = null; camera.position.set(...v.camera.cam); controls.target.set(...v.camera.target); controls.update(); done.push('camera set'); }
  if ('fast' in v) { setFast(v.fast); done.push('fast ' + v.fast); }
  if ('photo' in v) { setPhoto(v.photo); done.push('photo ' + v.photo); }
  return done;
}
function runTool(block) {
  if (block.name === 'set_view_state') { try { const done = applyViewState(block.input || {}); say('note', done.length ? 'View: ' + done.join(', ') : 'No change.'); return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ applied: done }) }; }
    catch (e) { say('note error', 'Rejected: ' + e.message); return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: e.message }; } }
  if (block.name === 'history') { const { action, steps: st } = block.input || {}, steps = st ?? 1, fail = m => { say('note error', 'Rejected: ' + m); return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: m }; };
    if (!['undo', 'redo', 'reset'].includes(action)) return fail('action must be undo, redo or reset'); if (!Number.isInteger(steps) || steps < 1 || steps > 100) return fail('steps must be an integer 1 to 100');
    const r = editHistory(action, steps), msg = r.steps ? `${action}: ${r.steps} step${r.steps > 1 ? 's' : ''}\n${r.lines.join('\n') || 'no net change'}` : `Nothing to ${action === 'reset' ? 'reset: the plan equals the published one' : action}.`;
    say('note', msg); return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ steps_done: r.steps, changes: r.lines, undo_left: r.left.undo, redo_left: r.left.redo, note: r.steps ? undefined : msg }) }; }
  if (block.name !== 'apply_changes') return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'unknown tool' };
  const before = JSON.parse(JSON.stringify(plan)), err = tryEdit(() => applyBatch(block.input.changes || []));
  if (err) { say('note error', 'Rejected: ' + err); return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Batch rejected, plan unchanged: ' + err }; }
  const lines = describe(before, plan), findings = runChecks(plan).filter(c => c.severity !== 'ok').map(c => `${c.severity}: ${c.item} — ${c.check}: ${c.value} (required ${c.required})`);
  say('note', lines.length ? lines.join('\n') : 'No change.');
  return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ applied: lines, checks_not_passing: findings }) };
}
async function post(messages) {
  const headers = { 'content-type': 'application/json' }; let pw = null; try { pw = localStorage.getItem(PWKEY); } catch (e) {} if (pw) headers['x-chat-password'] = pw;
  let r; try { r = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify({ messages, model }) }); } catch (e) { throw new Error('Could not reach the assistant.'); }
  if (r.status === 404) throw new Error('The assistant runs only on the deployed site (Vercel), not in this build.');
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (r.status === 401) { try { localStorage.removeItem(PWKEY); } catch (e) {} $('chatpw').hidden = false; throw new Error('Enter the chat password below, then send again.'); }
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`); return data;
}
async function send() { const text = input.value.trim(); if (!text || busy) return; await ready; if (busy) return; busy = true; sendBtn.disabled = $('chatmodel').disabled = true; input.value = '';
  const other = await fresh(); if (other) { restore(other.data); say('note', 'Chat updated from another device.', false); } // another device changed the chat since this one loaded
  say('user', text);
  const cut = trim(history); if (cut !== history) { history = cut; synced = null; } // oldest turns dropped near the server limits
  let content = text;
  if (!history.length) content = `${context()}\n\nCurrent plan (palace1.json):\n${JSON.stringify(plan)}\n\nRequest: ${text}`;
  else if (!synced) content = `${context()}\n\nCurrent plan (palace1.json), the state right now; any plan or edit list earlier in this conversation is outdated:\n${JSON.stringify(plan)}\n\nRequest: ${text}`;
  else { const manual = describe(JSON.parse(synced), plan); if (manual.length) content = `Edits made by hand in the editor since your last turn:\n${manual.join('\n')}\n\nRequest: ${text}`; }
  const base = history.slice(), tail = base[base.length - 1]; // base = the conversation to fall back to if this request fails
  if (tail && tail.role === 'user' && Array.isArray(tail.content)) history = [...base.slice(0, -1), { ...tail, content: [...tail.content, { type: 'text', text: content }] }]; else history = [...base, { role: 'user', content }]; // after a 30-step stop the last message is a user one
  const wait = say('note', 'Thinking…', false);
  try {
    let last = ''; for (let turn = 0; turn < 30; turn++) { const r = await post(history); last = r.stop_reason; history.push({ role: 'assistant', content: r.content }); // content goes back unchanged (thinking blocks included)
      for (const b of r.content) if (b.type === 'text' && b.text.trim()) say('bot', b.text.trim(), true, labelOf(r.model || model));
      if (r.stop_reason === 'refusal') { say('note error', 'The request was declined.'); break; }
      if (r.stop_reason === 'max_tokens') { say('note error', 'The answer was cut off; say "continue" to get the rest.'); break; }
      if (r.stop_reason !== 'tool_use') break;
      history.push({ role: 'user', content: r.content.filter(b => b.type === 'tool_use').map(runTool) }); } // all results of one turn in a single message
    if (last === 'tool_use') say('note', 'Stopped after 30 steps; tell it to continue.');
    history = repair(history); // never keep an unanswered tool_use
    if (history.length > base.length) synced = JSON.stringify(plan);
  } catch (e) { say('note error', e.message); if (history.length > base.length + 1) say('note', 'This request was left out of the conversation; the plan keeps the edits already applied.'); history = base; }
  wait.remove(); persist(); busy = false; sendBtn.disabled = $('chatmodel').disabled = false; input.focus(); }

if ($('chatBtn')) { const off = !!import.meta.env.VITE_NO_ASSETS; $('chatBtn').hidden = off;
  const pick = $('chatmodel'); CHAT_MODELS.forEach(m => pick.add(new Option(m.label, m.id))); pick.value = model;
  pick.onchange = () => { model = pick.value; try { localStorage.setItem(MODELKEY, model); } catch (e) {} };
  ready = load().then(d => { if (d && !busy) restore(d); }); watch(() => busy, d => restore(d));
  $('chatBtn').onclick = () => { panel.hidden = !panel.hidden; $('chatBtn').setAttribute('aria-pressed', !panel.hidden); if (!panel.hidden) input.focus(); };
  sendBtn.onclick = send; input.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); } };
  $('chatnew').onclick = () => { if (busy || !(history.length || entries.length) || !confirm('Clear this conversation on all devices? The plan keeps its edits.')) return; restore(null); persist(); };
  $('chatpwsave').onclick = () => { try { localStorage.setItem(PWKEY, $('chatpwinput').value); } catch (e) {} $('chatpw').hidden = true; $('chatpwinput').value = ''; };
  $('chatpwinput').onkeydown = ev => ev.stopPropagation(); }
