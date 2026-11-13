// In-app assistant: plain-language requests are sent to Claude through /api/chat (a Vercel function that holds the API key).
// Claude answers with apply_changes tool calls; they are applied here as one undoable edit each, and the check findings go back to Claude.
import { plan } from '../plan/plan.js';
import { describe } from '../plan/patch.js';
import { runChecks } from '../plan/checks.js';
import { DESIGNS } from '../catalog.js';
import { MODELS } from '../assets.js';
import { BUILDERS } from '../items/index.js';
import { tryEdit } from './editor.js';
import { setPhoto } from '../pathtracer.js';

const $ = id => document.getElementById(id), panel = $('chatpanel'), log = $('chatlog'), input = $('chatinput'), sendBtn = $('chatsend');
const NO_ID = ['slabs', 'floors', 'ceilings']; // lists whose entries are addressed by index
const PWKEY = 'palace1-chat-password';
let history = [], synced = null, busy = false;

const context = () => ['Furniture catalog (type → variant index: design):',
  ...Object.entries(DESIGNS).map(([t, d]) => `- ${t}: ` + d.items.map((v, i) => `${i}: ${v.name} (${v.info})`).join('; ')),
  'Built-in item types: ' + Object.keys(BUILDERS).join(', '),
  'Model ids for items of type "model" or planter.model: ' + Object.entries(MODELS).map(([k, m]) => `${k} (${m.size.map(n => n.toFixed(2)).join(' × ')})`).join(', ')].join('\n');

function say(cls, text) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }

// one batch from Claude → plan edits. Throws on the first invalid edit; tryEdit then restores the plan.
function applyBatch(changes) {
  for (const c of changes) { const parts = c.path ? c.path.split('.').map(p => (/^\d+$/.test(p) ? +p : p)) : [], val = () => JSON.parse(c.value_json), noId = NO_ID.includes(c.list);
    const index = () => { const i = plan[c.list].findIndex((x, n) => (noId ? String(n) : x.id) === c.id); if (i < 0) throw new Error(`no ${c.list} entry "${c.id}"`); return i; };
    const find = () => c.list === 'meta' ? plan.meta : c.list === 'views' ? (plan.views[c.id] || (() => { throw new Error(`no view "${c.id}"`); })()) : plan[c.list][index()];
    const setPath = (host, v) => { if (!parts.length) throw new Error('set / unset need a path'); for (const p of parts.slice(0, -1)) { host = host[p]; if (host === null || typeof host !== 'object') throw new Error(`path "${c.path}" does not exist on ${c.id || 'meta'}`); }
      const last = parts[parts.length - 1]; if (v === undefined) delete host[last]; else host[last] = v; };
    if (c.list === 'meta' && c.op !== 'set' && c.op !== 'unset') { setPath(plan.meta, c.op === 'add' ? val() : undefined); continue; }
    if (c.op === 'add') { const o = val(); if (c.list === 'views') { plan.views[c.id] = o; continue; } if (!noId) { if (!o.id) o.id = c.id; if (plan[c.list].some(x => x.id === o.id)) throw new Error(`id "${o.id}" already exists`); } if (c.list === 'items' && !o.type) throw new Error('an item needs a type'); plan[c.list].push(o); }
    else if (c.op === 'remove') { if (c.list === 'views') { find(); delete plan.views[c.id]; continue; } plan[c.list].splice(index(), 1); }
    else setPath(find(), c.op === 'unset' ? undefined : val()); }
}
// view state: drive the same toolbar controls a click would
function applyViewState(v) {
  const fire = (id, value) => { const e = $(id); e.value = value; e.dispatchEvent(new Event(id === 'sunTime' ? 'input' : 'change')); }, done = [];
  if ('night' in v) { $(v.night ? 'mnight' : 'mday').click(); done.push('night ' + v.night); }
  if ('cut' in v) { $(v.cut ? 'wcut' : 'wfull').click(); done.push('cut ' + v.cut); }
  if ('style' in v) { if (![...$('style').options].some(o => o.value === v.style)) throw new Error(`unknown style "${v.style}"`); fire('style', v.style); done.push('style ' + v.style); }
  if ('sun_month' in v) { fire('sunMonth', v.sun_month); done.push('sun month ' + v.sun_month); }
  if ('sun_hour' in v) { fire('sunTime', v.sun_hour); done.push('sun hour ' + v.sun_hour); }
  if ('view' in v) { if (!plan.views[v.view]) throw new Error(`no view "${v.view}"`); fire('view', v.view); done.push('view ' + v.view); }
  if ('photo' in v) { setPhoto(v.photo); done.push('photo ' + v.photo); }
  return done;
}
function runTool(block) {
  if (block.name === 'set_view_state') { try { const done = applyViewState(block.input || {}); say('note', done.length ? 'View: ' + done.join(', ') : 'No change.'); return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ applied: done }) }; }
    catch (e) { say('note error', 'Rejected: ' + e.message); return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: e.message }; } }
  if (block.name !== 'apply_changes') return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'unknown tool' };
  const before = JSON.parse(JSON.stringify(plan)), err = tryEdit(() => applyBatch(block.input.changes || []));
  if (err) { say('note error', 'Rejected: ' + err); return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Batch rejected, plan unchanged: ' + err }; }
  const lines = describe(before, plan), findings = runChecks(plan).filter(c => c.severity !== 'ok').map(c => `${c.severity}: ${c.item} — ${c.check}: ${c.value} (required ${c.required})`);
  say('note', lines.length ? lines.join('\n') : 'No change.');
  return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ applied: lines, checks_not_passing: findings }) };
}
async function post(messages) {
  const headers = { 'content-type': 'application/json' }; let pw = null; try { pw = localStorage.getItem(PWKEY); } catch (e) {} if (pw) headers['x-chat-password'] = pw;
  let r; try { r = await fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify({ messages }) }); } catch (e) { throw new Error('Could not reach the assistant.'); }
  if (r.status === 404) throw new Error('The assistant runs only on the deployed site (Vercel), not in this build.');
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (r.status === 401) { try { localStorage.removeItem(PWKEY); } catch (e) {} $('chatpw').hidden = false; throw new Error('Enter the chat password below, then send again.'); }
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`); return data;
}
async function send() { const text = input.value.trim(); if (!text || busy) return; busy = true; sendBtn.disabled = true; input.value = ''; say('user', text);
  let content = text;
  if (!history.length) content = `${context()}\n\nCurrent plan (palace1.json):\n${JSON.stringify(plan)}\n\nRequest: ${text}`;
  else { const manual = describe(JSON.parse(synced), plan); if (manual.length) content = `Edits made by hand in the editor since your last turn:\n${manual.join('\n')}\n\nRequest: ${text}`; }
  const mark = history.length; history.push({ role: 'user', content }); const wait = say('note', 'Thinking…');
  try {
    for (let turn = 0; turn < 30; turn++) { const r = await post(history); history.push({ role: 'assistant', content: r.content }); // content goes back unchanged (thinking blocks included)
      for (const b of r.content) if (b.type === 'text' && b.text.trim()) say('bot', b.text.trim());
      if (r.stop_reason === 'refusal') { say('note error', 'The request was declined.'); break; }
      if (r.stop_reason === 'max_tokens') { say('note error', 'The reply was cut off; ask again in smaller steps.'); break; }
      if (r.stop_reason !== 'tool_use') break;
      history.push({ role: 'user', content: r.content.filter(b => b.type === 'tool_use').map(runTool) }); } // all results of one turn in a single message
    synced = JSON.stringify(plan);
  } catch (e) { say('note error', e.message); if (history.length === mark + 1) history.pop(); else { history = []; say('note', 'Conversation reset; the plan keeps the edits already applied.'); } }
  wait.remove(); busy = false; sendBtn.disabled = false; input.focus(); }

if ($('chatBtn')) { const off = !!import.meta.env.VITE_NO_ASSETS; $('chatBtn').hidden = off;
  $('chatBtn').onclick = () => { panel.hidden = !panel.hidden; $('chatBtn').setAttribute('aria-pressed', !panel.hidden); if (!panel.hidden) input.focus(); };
  sendBtn.onclick = send; input.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); } };
  $('chatnew').onclick = () => { if (busy) return; history = []; synced = null; log.textContent = ''; };
  $('chatpwsave').onclick = () => { try { localStorage.setItem(PWKEY, $('chatpwinput').value); } catch (e) {} $('chatpw').hidden = true; $('chatpwinput').value = ''; };
  $('chatpwinput').onkeydown = ev => ev.stopPropagation(); }
