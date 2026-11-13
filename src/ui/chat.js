// In-app assistant: plain-language requests are sent to Claude through /api/chat (a Vercel function that holds the API key).
// Claude answers with apply_changes tool calls; they are applied here as one undoable edit each, and the check findings go back to Claude.
import { plan } from '../plan/plan.js';
import { describe } from '../plan/patch.js';
import { runChecks } from '../plan/checks.js';
import { DESIGNS } from '../catalog.js';
import { MODELS } from '../assets.js';
import { BUILDERS } from '../items/index.js';
import { tryEdit } from './editor.js';

const $ = id => document.getElementById(id), panel = $('chatpanel'), log = $('chatlog'), input = $('chatinput'), sendBtn = $('chatsend');
const PWKEY = 'palace1-chat-password';
let history = [], synced = null, busy = false;

const context = () => ['Furniture catalog (type → variant index: design):',
  ...Object.entries(DESIGNS).map(([t, d]) => `- ${t}: ` + d.items.map((v, i) => `${i}: ${v.name} (${v.info})`).join('; ')),
  'Built-in item types: ' + Object.keys(BUILDERS).join(', '),
  'Model ids for items of type "model" or planter.model: ' + Object.entries(MODELS).map(([k, m]) => `${k} (${m.size.map(n => n.toFixed(2)).join(' × ')})`).join(', ')].join('\n');

function say(cls, text) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }

// one batch from Claude → plan edits. Throws on the first invalid edit; tryEdit then restores the plan.
function applyBatch(changes) {
  for (const c of changes) { const parts = c.path ? c.path.split('.').map(p => (/^\d+$/.test(p) ? +p : p)) : [], val = () => JSON.parse(c.value_json);
    const find = () => { if (c.list === 'meta') return plan.meta; if (c.list === 'views') { if (!plan.views[c.id]) throw new Error(`no view "${c.id}"`); return plan.views[c.id]; }
      const o = plan[c.list].find(x => x.id === c.id); if (!o) throw new Error(`no ${c.list} entry with id "${c.id}"`); return o; };
    if (c.op === 'add') { const o = val(); if (c.list === 'views') { plan.views[c.id] = o; continue; } if (c.list === 'meta') throw new Error('cannot add to meta');
      if (!o.id) o.id = c.id; if (plan[c.list].some(x => x.id === o.id)) throw new Error(`id "${o.id}" already exists`); if (c.list === 'items' && !o.type) throw new Error('an item needs a type'); plan[c.list].push(o); }
    else if (c.op === 'remove') { if (c.list === 'views') { find(); delete plan.views[c.id]; continue; } if (c.list === 'meta') throw new Error('cannot remove meta'); find(); plan[c.list].splice(plan[c.list].findIndex(x => x.id === c.id), 1); }
    else { if (!parts.length) throw new Error('set / unset need a path'); let host = find(); for (const p of parts.slice(0, -1)) { host = host[p]; if (host === null || typeof host !== 'object') throw new Error(`path "${c.path}" does not exist on ${c.id}`); }
      const last = parts[parts.length - 1]; if (c.op === 'unset') delete host[last]; else host[last] = val(); } }
}
function runTool(block) {
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
    for (let turn = 0; turn < 8; turn++) { const r = await post(history); history.push({ role: 'assistant', content: r.content }); // content goes back unchanged (thinking blocks included)
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
