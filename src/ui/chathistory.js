// Assistant chats: kept in localStorage and, where the server has storage, in api/history.js (one rev-checked copy per chat plus a chat list, shared by all devices).
import { showToast, toggleBadge } from './toast.js';
const KEY = 'palace1-chat-history-v1', REVKEY = 'palace1-chat-rev', PWKEY = 'palace1-chat-password', UNSENT = 'palace1-chat-unsent', CURKEY = 'palace1-chat-current', IDXKEY = 'palace1-chat-index-v1', MAX_PUT = 1.9e6, URL = '/api/history', OFF = !!import.meta.env.VITE_NO_ASSETS;
export const STOP_TEXT = '(Stopped after 30 steps. Say "continue" to go on.)';
export const MAX_MSGS = 120, MAX_BYTES = 1e6, KEEP_MSGS = 80, KEEP_BYTES = 6e5, MAX_LOG = 300, MAX_TEXT = 3000, MAX_CHATS = 50, MAIN = 'main', CLASSES = ['user', 'bot', 'note', 'note error'];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
// per chat: local copy, rev and unsent marker; "main" keeps the keys of the single-chat version; IDX is the chat list, handled like one more chat
const IDX = '@index', ID = /^[a-z0-9-]{8,40}$/, validId = id => typeof id === 'string' && (id === MAIN || ID.test(id));
const keysOf = id => id === MAIN ? { data: KEY, rev: REVKEY, unsent: UNSENT } : id === IDX ? { data: IDXKEY, rev: IDXKEY + '-rev', unsent: IDXKEY + '-unsent' } : { data: `${KEY}-${id}`, rev: `${REVKEY}-${id}`, unsent: `${UNSENT}-${id}` };
const urlOf = id => id === MAIN ? URL : id === IDX ? URL + '?index=1' : URL + '?id=' + id;
let cur = ls.get(CURKEY); if (!validId(cur)) cur = MAIN;
const st = {}, S = id => st[id] ||= { rev: +ls.get(keysOf(id).rev) || 0, latest: null, inflight: false, queued: false }, removed = new Set(); // removed = chats deleted in this page session (a merge never brings them back)
let noPrompt = false, badge = null;
export const chatId = () => cur;
export const setChat = id => { if (validId(id)) { cur = id; ls.set(CURKEY, id); } };
export const newChatId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const setRev = (id, r) => { S(id).rev = r; ls.set(keysOf(id).rev, r); };
const writeLocal = (id, d) => d ? ls.set(keysOf(id).data, JSON.stringify(d)) : ls.del(keysOf(id).data);
const readLocal = id => { try { const d = JSON.parse(ls.get(keysOf(id).data)); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } };
async function call(method, body, ms = 8000, id = cur) {
  const headers = { 'content-type': 'application/json' }, pw = ls.get(PWKEY); if (pw) headers['x-chat-password'] = pw;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(urlOf(id), { method, headers, body: body && JSON.stringify(body), cache: 'no-store', signal: ctl.signal }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j: j && Number.isInteger(j.rev) ? j : null }; }
  catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); } }

const photoMsg = m => Array.isArray(m.content) && m.content.length > 0 && m.content.every(b => b && (b.type === 'text' || b.type === 'image')); // a user message of text and photo blocks (memory only)
const plain = m => m.role === 'user' && (typeof m.content === 'string' || photoMsg(m)), uses = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_use').map(b => b.id) : [], results = m => Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'tool_result').map(b => b.tool_use_id) : [];
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
const size = h => JSON.stringify(h, (k, v) => v && v.type === 'image' ? '[photo]' : v).length; // photos count as their placeholder
// stored form of a user message with photos: its text plus one [photo: name] line each, never the pixels
const storable = m => { if (m.role !== 'user' || !photoMsg(m)) return m; const t = m.content.filter(b => b.type === 'text').map(b => b.text); return { role: 'user', content: [t[t.length - 1], ...t.slice(0, -1)].join('\n') }; };
// near the server cap the oldest photos are replaced by a text block, never those of the newest user message; null = still too big
export function dropPhotos(h, cap = 3.4e6) {
  const keep = h.findLastIndex(plain);
  for (let i = 0; i < h.length && JSON.stringify(h).length > cap; i++) if (i !== keep && Array.isArray(h[i].content) && h[i].content.some(b => b.type === 'image')) { h = h.slice(); h[i] = { ...h[i], content: h[i].content.map(b => b.type === 'image' ? { type: 'text', text: '[photo not kept]' } : b) }; }
  return JSON.stringify(h).length > cap ? null : h; }
// drop the oldest whole turns (cut at a plain user message) once the conversation nears the server limits; returns the same list if nothing to cut
export function trim(h) {
  if (h.length <= MAX_MSGS && size(h) <= MAX_BYTES) return h;
  const cuts = h.map((m, i) => i && plain(m) ? i : 0).filter(Boolean); if (!cuts.length) return h;
  const at = cuts.find(i => h.length - i <= KEEP_MSGS && size(h.slice(i)) <= KEEP_BYTES) ?? cuts[cuts.length - 1]; return h.slice(at); }
const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, MAX_THUMB = 12000, MAX_THUMBS = 4; // log thumbnails: small JPEG data URLs only
const thumbs = e => e[0] === 'user' && Array.isArray(e[3]) ? e[3].filter(t => typeof t === 'string' && t.length <= MAX_THUMB && THUMB.test(t)).slice(0, MAX_THUMBS) : [];
export const cleanLog = l => (Array.isArray(l) ? l : []).filter(e => Array.isArray(e) && CLASSES.includes(e[0]) && typeof e[1] === 'string').map(e => { const th = thumbs(e), by = typeof e[2] === 'string' ? e[2].slice(0, 60) : '', t = e[1].slice(0, MAX_TEXT); return th.length ? [e[0], t, by, th] : by ? [e[0], t, by] : [e[0], t]; }).slice(-MAX_LOG);
export const cleanData = d => d && typeof d === 'object' ? { messages: repair(d.messages).map(storable), log: cleanLog(d.log) } : null;

const bytes = d => new TextEncoder().encode(JSON.stringify(d)).length;
// keep one PUT under the server cap (2 MB): the oldest transcript lines go first
const fit = d => { const out = { messages: d.messages.map(storable), log: cleanLog(d.log) }; while (out.log.length && bytes(out) > MAX_PUT) out.log.shift(); return out; };
const note = text => { if (!OFF) showToast(text, { ms: 5000 }); };
const setLocalOnly = on => { if (!OFF) badge = toggleBadge(badge, 'chatlocalbadge', 'Chat saved on this device only', on, 'chat-local'); };

// the chat list: [{id, title, updated, count}], newest first, at most 50 (older ones leave the list only, their copies stay)
export const cleanIdx = d => { const seen = new Set(); return { chats: (d && Array.isArray(d.chats) ? d.chats : []).filter(c => c && validId(c.id) && !seen.has(c.id) && seen.add(c.id)).map(c => ({ id: c.id, title: String(c.title ?? '').slice(0, 80), updated: Number.isFinite(c.updated) ? c.updated : 0, count: Number.isInteger(c.count) ? c.count : 0 })).sort((a, b) => b.updated - a.updated).slice(0, MAX_CHATS) }; };
const mergeIdx = (a, b) => { const by = new Map(); for (const c of [...cleanIdx(a).chats, ...cleanIdx(b).chats]) if (!removed.has(c.id) && !(by.has(c.id) && by.get(c.id).updated >= c.updated)) by.set(c.id, c); return cleanIdx({ chats: [...by.values()] }); };
const readIdx = () => cleanIdx(readLocal(IDX));
export const localIndex = () => readIdx().chats;
export const titleOf = log => { const e = log.find(x => x[0] === 'user'); if (!e) return 'New chat'; return e[1].replace(/\s+/g, ' ').trim().slice(0, 40) || (e[3] && e[3].length ? 'Photo' : 'New chat'); };
const entry = (id, d) => ({ id, title: titleOf(d.log), updated: Date.now(), count: d.log.filter(e => e[0] === 'user').length });
const touch = (id, d) => save({ chats: [...readIdx().chats.filter(c => c.id !== id), entry(id, d)] }, IDX); // after each saved turn

// at start (or when a chat is opened): server copy first (short timeout), else the local one; a local copy the server never confirmed is pushed first
export async function load(id = cur, strict = false) { // strict: false (not null) when the server cannot be read and there is no local copy
  const local = readLocal(id); if (OFF) return cleanData(local);
  const { status, j } = await call('GET', null, 3000, id);
  if (status !== 200 || !j) return strict && !local ? false : cleanData(local);
  if (ls.get(keysOf(id).unsent) || (j.rev === 0 && local)) { setRev(id, j.rev); const mine = cleanData(local); save(mine, id); return mine; } // a 409 on the way resolves it: this copy wins
  setRev(id, j.rev); writeLocal(id, j.data); return cleanData(j.data); }
// the chat list for the panel; also adds a chat saved by the single-chat version ("main") the first time
export async function loadIndex() {
  let idx = readIdx(), push = false;
  if (!OFF) { const { status, j } = await call('GET', null, 3000, IDX);
    if (status === 200 && j) { setRev(IDX, j.rev); if (ls.get(keysOf(IDX).unsent) || (j.rev === 0 && idx.chats.length)) { idx = mergeIdx(idx, j.data); push = true; } else idx = cleanIdx(j.data); } }
  if (!removed.has(MAIN) && !idx.chats.some(c => c.id === MAIN)) { let d = cleanData(readLocal(MAIN)); if (!d && !OFF) { const r = await call('GET', null, 3000, MAIN); d = r.status === 200 && r.j ? cleanData(r.j.data) : null; }
    if (d && d.messages.length) { idx = cleanIdx({ chats: [...idx.chats, entry(MAIN, d)] }); push = true; } }
  if (push) save(idx, IDX); else writeLocal(IDX, idx);
  return idx.chats; }
// delete a chat: local copy, list entry and the server copy (emptied)
export async function drop(id) {
  removed.add(id); const k = keysOf(id), busy = st[id]; ls.del(k.data); ls.del(k.rev); ls.del(k.unsent); delete st[id];
  for (let i = 0; busy && busy.inflight && i < 80; i++) await new Promise(r => setTimeout(r, 100)); // a running save of this chat ends first (it stops at the next step)
  save({ chats: readIdx().chats.filter(c => c.id !== id) }, IDX);
  if (OFF) return; const { status, j } = await call('GET', null, 4000, id); if (status === 200 && j && j.rev > 0 && j.data) await call('PUT', { rev: j.rev, data: null }, 8000, id); }
// after a finished turn: local copy now, server copy with the last known rev; on 409 this copy wins (never merged), except the chat list, which is merged
export async function save(data, id = cur) {
  if (removed.has(id)) return; // a deleted chat is never written again
  const idx = id === IDX; if (data) data = idx ? cleanIdx(data) : fit(data); writeLocal(id, data); if (!idx && data) touch(id, data);
  if (OFF) return; const k = keysOf(id), s = S(id); ls.set(k.unsent, '1'); s.latest = data; if (s.inflight) { s.queued = true; return; }
  s.inflight = true;
  try { do { s.queued = false; let sent = s.latest;
      for (let n = 0; n < 3 && !removed.has(id); n++) { let { status, j } = await call('PUT', { rev: s.rev, data: sent }, 8000, id);
        if (status === 401 && !noPrompt) { const pw = prompt('Chat password (the same as the assistant):'); if (pw) { ls.set(PWKEY, pw); ({ status, j } = await call('PUT', { rev: s.rev, data: sent }, 8000, id)); } if (status === 401) { ls.del(PWKEY); noPrompt = true; } }
        if (status === 200 && j) { setRev(id, j.rev); if (!idx) setLocalOnly(false); if (!s.queued) ls.del(k.unsent); break; }
        if (status === 409 && j && JSON.stringify(j.data) === JSON.stringify(sent)) { setRev(id, j.rev); if (!idx) setLocalOnly(false); if (!s.queued) ls.del(k.unsent); break; } // our own PUT whose reply was lost
        if (status === 409 && j) { setRev(id, j.rev); if (idx) { sent = mergeIdx(sent, j.data); writeLocal(id, sent); } else note("Chat was changed on another device; this device's version was kept"); continue; }
        if (status === 413 && !idx) setLocalOnly(true);
        break; } } while (s.queued && !removed.has(id)); }
  finally { s.inflight = false; } }
// the server copy of the current chat if it is newer than ours and this device has nothing unsent: { data } (data null = cleared), else null
export async function fresh() {
  const id = cur, s = S(id); if (OFF || s.inflight || ls.get(keysOf(id).unsent)) return null;
  const { status, j } = await call('GET', null, 2000, id); if (status !== 200 || !j || j.rev === s.rev) return null;
  const local = readLocal(id); if (j.rev === 0 && local) { setRev(id, 0); save(cleanData(local), id); return null; } // empty server: push the local chat, like load()
  return { data: cleanData(j.data), commit: () => { setRev(id, j.rev); writeLocal(id, j.data); } }; } // the caller commits only when it really adopts the copy
// tab visible again: adopt a newer server copy unless a turn is running
export function watch(isBusy, adopt) {
  if (OFF) return;
  document.addEventListener('visibilitychange', async () => { if (document.hidden || isBusy()) return; const id = cur, f = await fresh(); if (f && !isBusy() && cur === id) { f.commit(); adopt(f.data); } }); }
