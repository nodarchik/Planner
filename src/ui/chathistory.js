// Assistant chat history: kept in localStorage and, where the server has storage, in api/history.js (one rev-checked copy shared by all devices).
const KEY = 'palace1-chat-history-v1', REVKEY = 'palace1-chat-rev', PWKEY = 'palace1-chat-password', UNSENT = 'palace1-chat-unsent', MAX_PUT = 1.9e6, URL = '/api/history', OFF = !!import.meta.env.VITE_NO_ASSETS;
export const STOP_TEXT = '(Stopped after 30 steps. Say "continue" to go on.)';
export const MAX_MSGS = 120, MAX_BYTES = 1e6, KEEP_MSGS = 80, KEEP_BYTES = 6e5, MAX_LOG = 300, MAX_TEXT = 3000, CLASSES = ['user', 'bot', 'note', 'note error'];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
let rev = +ls.get(REVKEY) || 0, latest = null, inflight = false, queued = false, noPrompt = false, badge = null;
const setRev = r => { rev = r; ls.set(REVKEY, r); };
const writeLocal = d => d ? ls.set(KEY, JSON.stringify(d)) : ls.del(KEY);
const readLocal = () => { try { const d = JSON.parse(ls.get(KEY)); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } };
async function call(method, body, ms = 8000) {
  const headers = { 'content-type': 'application/json' }, pw = ls.get(PWKEY); if (pw) headers['x-chat-password'] = pw;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(URL, { method, headers, body: body && JSON.stringify(body), cache: 'no-store', signal: ctl.signal }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j: j && Number.isInteger(j.rev) ? j : null }; }
  catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); } }

const plain = m => m.role === 'user' && typeof m.content === 'string', uses = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_use').map(b => b.id) : [], results = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_result').map(b => b.tool_use_id) : [];
// old thinking blocks are never kept: a block is bound to the exact history before it, so cutting or editing that history later makes the API reject it (removing them all is allowed)
const clean = m => { if (!m || typeof m !== 'object' || !['user', 'assistant'].includes(m.role)) return null; let c = m.content;
  if (Array.isArray(c)) c = c.filter(b => b && typeof b === 'object' && b.type !== 'thinking' && b.type !== 'redacted_thinking' && !(b.type === 'text' && !String(b.text || '').trim()));
  else if (typeof c !== 'string' || !c.trim()) return null;
  if (!c.length) { if (m.role === 'user') return null; c = [{ type: 'text', text: '(no answer)' }]; } // an empty assistant message is rejected by the API: keep the turn, say so
  return { role: m.role, content: c }; };
// longest valid prefix (the request of an unanswered turn is cut): starts with a plain user message, roles alternate, every tool_use is answered by the next message; thinking and empty blocks removed
export function repair(h) {
  const out = []; if (!Array.isArray(h)) return out;
  for (let i = 0; i < h.length; i++) { const m = clean(h[i]), prev = out[out.length - 1];
    if (!m || m.role !== (prev ? (prev.role === 'user' ? 'assistant' : 'user') : 'user') || (!prev && !plain(m))) break;
    const ids = m.role === 'assistant' ? uses(m) : [], back = m.role === 'user' ? results(m) : [];
    if (back.length !== (prev ? uses(prev).length : 0) || back.some(id => !uses(prev).includes(id))) break;
    if (ids.length) { const n = clean(h[i + 1]); if (!n || n.role !== 'user' || results(n).length !== ids.length || !ids.every(id => results(n).includes(id))) break; }
    out.push(m); }
  if (out.length && plain(out[out.length - 1])) out.pop(); // a request without its answer is dropped
  if (out.length && out[out.length - 1].role === 'user') out.push({ role: 'assistant', content: [{ type: 'text', text: STOP_TEXT }] }); // a stored turn always ends with an assistant message
  return out; }
const size = h => JSON.stringify(h).length;
// drop the oldest whole turns (cut at a plain user message) once the conversation nears the server limits; returns the same list if nothing to cut
export function trim(h) {
  if (h.length <= MAX_MSGS && size(h) <= MAX_BYTES) return h;
  const cuts = h.map((m, i) => i && plain(m) ? i : 0).filter(Boolean); if (!cuts.length) return h;
  const at = cuts.find(i => h.length - i <= KEEP_MSGS && size(h.slice(i)) <= KEEP_BYTES) ?? cuts[cuts.length - 1]; return h.slice(at); }
export const cleanLog = l => (Array.isArray(l) ? l : []).filter(e => Array.isArray(e) && CLASSES.includes(e[0]) && typeof e[1] === 'string').map(e => typeof e[2] === 'string' && e[2] ? [e[0], e[1].slice(0, MAX_TEXT), e[2].slice(0, 60)] : [e[0], e[1].slice(0, MAX_TEXT)]).slice(-MAX_LOG);
export const cleanData = d => d && typeof d === 'object' ? { messages: repair(d.messages), log: cleanLog(d.log) } : null;

const bytes = d => new TextEncoder().encode(JSON.stringify(d)).length;
// keep one PUT under the server cap (2 MB): the oldest transcript lines go first
const fit = d => { const out = { messages: d.messages, log: cleanLog(d.log) }; while (out.log.length && bytes(out) > MAX_PUT) out.log.shift(); return out; };
const css = 'position:fixed;z-index:9;font:600 12px system-ui;border-radius:8px;padding:6px 12px;background:#2f2a24;color:#fff;';
function note(text) { if (OFF) return; const n = document.createElement('div'); n.textContent = text; n.style.cssText = css + 'left:50%;top:12px;transform:translateX(-50%);cursor:pointer'; n.onclick = () => n.remove(); document.body.appendChild(n); setTimeout(() => n.remove(), 5000); }
function setLocalOnly(on) { if (OFF) return; if (!badge) { badge = document.createElement('div'); badge.id = 'chatlocalbadge'; badge.textContent = 'Chat saved on this device only'; badge.style.cssText = css + 'left:12px;bottom:48px;pointer-events:none'; document.body.appendChild(badge); } badge.hidden = !on; }

// at start: server copy first (short timeout), else the local one; a local copy the server never confirmed is pushed first
export async function load() {
  const local = readLocal(); if (OFF) return cleanData(local);
  const { status, j } = await call('GET', null, 3000);
  if (status !== 200 || !j) return cleanData(local);
  if (ls.get(UNSENT) || (j.rev === 0 && local)) { setRev(j.rev); const mine = cleanData(local); save(mine); return mine; } // a 409 on the way resolves it: this copy wins
  setRev(j.rev); writeLocal(j.data); return cleanData(j.data); }
// after a finished turn (data null = New chat): local copy now, server copy with the last known rev; on 409 this copy wins (never merged)
export async function save(data) {
  if (data) data = fit(data); writeLocal(data); if (OFF) return; ls.set(UNSENT, '1'); latest = data; if (inflight) { queued = true; return; }
  inflight = true;
  try { do { queued = false; const sent = latest;
      for (let n = 0; n < 3; n++) { let { status, j } = await call('PUT', { rev, data: sent });
        if (status === 401 && !noPrompt) { const pw = prompt('Chat password (the same as the assistant):'); if (pw) { ls.set(PWKEY, pw); ({ status, j } = await call('PUT', { rev, data: sent })); } if (status === 401) { ls.del(PWKEY); noPrompt = true; } }
        if (status === 200 && j) { setRev(j.rev); setLocalOnly(false); if (!queued) ls.del(UNSENT); break; }
        if (status === 409 && j && JSON.stringify(j.data) === JSON.stringify(sent)) { setRev(j.rev); setLocalOnly(false); if (!queued) ls.del(UNSENT); break; } // our own PUT whose reply was lost
        if (status === 409 && j) { setRev(j.rev); note("Chat was changed on another device; this device's version was kept"); continue; }
        if (status === 413) setLocalOnly(true);
        break; } } while (queued); }
  finally { inflight = false; } }
// the server copy if it is newer than ours and this device has nothing unsent: { data } (data null = cleared), else null
export async function fresh() {
  if (OFF || inflight || ls.get(UNSENT)) return null;
  const { status, j } = await call('GET', null, 2000); if (status !== 200 || !j || j.rev === rev) return null;
  const local = readLocal(); if (j.rev === 0 && local) { setRev(0); save(cleanData(local)); return null; } // empty server: push the local chat, like load()
  return { data: cleanData(j.data), commit: () => { setRev(j.rev); writeLocal(j.data); } }; } // the caller commits only when it really adopts the copy
// tab visible again: adopt a newer server copy unless a turn is running
export function watch(isBusy, adopt) {
  if (OFF) return;
  document.addEventListener('visibilitychange', async () => { if (document.hidden || isBusy()) return; const f = await fresh(); if (f && !isBusy()) { f.commit(); adopt(f.data); } }); }
