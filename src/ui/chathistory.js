// Assistant chat history: kept in localStorage and, where the server has storage, in api/history.js (one rev-checked copy shared by all devices).
const KEY = 'palace1-chat-history-v1', REVKEY = 'palace1-chat-rev', PWKEY = 'palace1-chat-password', URL = '/api/history', OFF = !!import.meta.env.VITE_NO_ASSETS;
export const MAX_MSGS = 120, MAX_BYTES = 1e6, KEEP_MSGS = 80, KEEP_BYTES = 6e5, MAX_LOG = 300, CLASSES = ['user', 'bot', 'note', 'note error'];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
let rev = +ls.get(REVKEY) || 0, latest = null, inflight = false, queued = false;
const setRev = r => { rev = r; ls.set(REVKEY, r); };
const writeLocal = d => d ? ls.set(KEY, JSON.stringify(d)) : ls.del(KEY);
const readLocal = () => { try { const d = JSON.parse(ls.get(KEY)); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } };
async function call(method, body, ms = 8000) {
  const headers = { 'content-type': 'application/json' }, pw = ls.get(PWKEY); if (pw) headers['x-chat-password'] = pw;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(URL, { method, headers, body: body && JSON.stringify(body), cache: 'no-store', signal: ctl.signal }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j: j && Number.isInteger(j.rev) ? j : null }; }
  catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); } }

const plain = m => m.role === 'user' && typeof m.content === 'string', uses = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_use').map(b => b.id) : [], results = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_result').map(b => b.tool_use_id) : [];
// longest valid prefix (the request of an unanswered turn is cut): starts with a plain user message, roles alternate, every tool_use is answered by the next message
export function repair(h) {
  const out = []; if (!Array.isArray(h)) return out;
  for (let i = 0; i < h.length; i++) { const m = h[i], prev = out[out.length - 1];
    if (!m || typeof m !== 'object' || !(typeof m.content === 'string' || Array.isArray(m.content)) || m.role !== (prev ? (prev.role === 'user' ? 'assistant' : 'user') : 'user') || (!prev && !plain(m))) break;
    const ids = m.role === 'assistant' ? uses(m) : [], back = m.role === 'user' ? results(m) : [];
    if (back.length !== (prev ? uses(prev).length : 0) || back.some(id => !uses(prev).includes(id))) break;
    if (ids.length) { const n = h[i + 1]; if (!n || n.role !== 'user' || results(n).length !== ids.length || !ids.every(id => results(n).includes(id))) break; }
    out.push(m); }
  if (out.length && plain(out[out.length - 1])) out.pop(); // a request without its answer is dropped
  return out; }
const size = h => JSON.stringify(h).length;
// drop the oldest whole turns (cut at a plain user message) once the conversation nears the server limits; returns the same list if nothing to cut
export function trim(h) {
  if (h.length <= MAX_MSGS && size(h) <= MAX_BYTES) return h;
  const cuts = h.map((m, i) => i && plain(m) ? i : 0).filter(Boolean); if (!cuts.length) return h;
  const at = cuts.find(i => h.length - i <= KEEP_MSGS && size(h.slice(i)) <= KEEP_BYTES) ?? cuts[cuts.length - 1]; return h.slice(at); }
export const cleanLog = l => (Array.isArray(l) ? l : []).filter(e => Array.isArray(e) && CLASSES.includes(e[0]) && typeof e[1] === 'string').map(e => typeof e[2] === 'string' && e[2] ? [e[0], e[1].slice(0, 20000), e[2].slice(0, 60)] : [e[0], e[1].slice(0, 20000)]).slice(-MAX_LOG);
export const cleanData = d => d && typeof d === 'object' ? { messages: repair(d.messages), log: cleanLog(d.log) } : null;

// at start: server copy first (short timeout), else the local one
export async function load() {
  const local = readLocal(); if (OFF) return cleanData(local);
  const { status, j } = await call('GET', null, 3000);
  if (status !== 200 || !j) return cleanData(local);
  if (j.rev === 0) { setRev(0); if (local) save(local); return cleanData(local); }
  setRev(j.rev); writeLocal(j.data); return cleanData(j.data); }
// after a finished turn (data null = New chat): local copy now, server copy with the last known rev; on 409 this copy wins (never merged)
export async function save(data) {
  writeLocal(data); if (OFF) return; latest = data; if (inflight) { queued = true; return; }
  inflight = true;
  try { do { queued = false; for (let n = 0; n < 3; n++) { const { status, j } = await call('PUT', { rev, data: latest }); if (status === 200 && j) { setRev(j.rev); break; } if (status === 409 && j) { setRev(j.rev); continue; } break; } } while (queued); }
  finally { inflight = false; } }
// tab visible again: adopt a newer server copy unless a turn or a save is running
export function watch(isBusy, adopt) {
  if (OFF) return;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || isBusy() || inflight) return;
    const { status, j } = await call('GET', null, 5000); if (status !== 200 || !j || j.rev === rev || isBusy() || inflight) return;
    setRev(j.rev); writeLocal(j.data); adopt(cleanData(j.data)); }); }
