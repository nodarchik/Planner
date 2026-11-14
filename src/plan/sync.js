// Shared plan edits: the patch is also kept on the server (api/plan.js, one rev-checked copy) so every device sees the same apartment. localStorage stays the fallback.
import { PUBLISHED } from './plan.js';

const PKEY = 'palace1-plan-patch-v1', PWKEY = 'palace1-chat-password', UNSENT = 'palace1-plan-unsent', REVKEY = 'palace1-plan-rev', URL = '/api/plan', DEBOUNCE = 2000, OFF = !!import.meta.env.VITE_NO_ASSETS; // PKEY: same key as ui/editor.js
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const BASE = hash(JSON.stringify(PUBLISHED)); // stored with the patch for information only
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
let rev = +ls.get(REVKEY) || 0, latest = null, dirty = false, seq = 0, timer = 0, busy = false, noPrompt = false, apply = null, badge = null;
export const setApplier = fn => { apply = fn; };
export const active = () => !OFF && !(badge && !badge.hidden);

const css = 'position:fixed;z-index:9;font:600 12px system-ui;border-radius:8px;padding:6px 12px;';
function note(text, sticky) { if (OFF) return; const n = document.createElement('div'); n.textContent = text; n.style.cssText = css + 'left:50%;top:12px;transform:translateX(-50%);background:#2f2a24;color:#fff;cursor:pointer'; n.onclick = () => n.remove(); document.body.appendChild(n); if (!sticky) setTimeout(() => n.remove(), 4000); }
function setLocalOnly(on) { if (OFF) return; if (!badge) { badge = document.createElement('div'); badge.id = 'localbadge'; badge.textContent = 'Saved on this device only'; badge.style.cssText = css + 'left:12px;bottom:12px;background:#6b6258;color:#fff;pointer-events:none'; document.body.appendChild(badge); } badge.hidden = !on; }
const readLocal = () => { try { const raw = ls.get(PKEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
const backup = p => ls.set(PKEY + '-backup', JSON.stringify(p));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const setRev = r => { rev = r; ls.set(REVKEY, r); };
async function call(method, body, ms = 8000, keepalive = false) {
  const headers = { 'content-type': 'application/json' }, pw = ls.get(PWKEY); if (pw) headers['x-chat-password'] = pw;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(URL, { method, headers, body: body && JSON.stringify(body), cache: 'no-store', signal: ctl.signal, keepalive }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j: j && Number.isInteger(j.rev) ? j : null }; }
  catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); } }

// at start, before the editor loads its edits: put the server patch into localStorage so the normal load path stays unchanged
export async function pullServer() {
  if (OFF) return;
  const { status, j } = await call('GET', null, 3000);
  if (status !== 200 || !j) { setLocalOnly(true); return; }
  const local = readLocal();
  if (ls.get(UNSENT) || (j.rev === 0 && local)) { if (j.rev === 0) setRev(0); latest = local; dirty = true; return; } // edits the server has not confirmed: push them from the last known rev (a 409 resolves it); start() sends
  setRev(j.rev); if (j.rev === 0) return;
  if (local && !same(local, j.patch)) backup(local);
  if (j.patch) ls.set(PKEY, JSON.stringify(j.patch)); else ls.del(PKEY);
}
// after the scene is built: send what pullServer left unsent
export function start() { if (!OFF && dirty) { clearTimeout(timer); timer = setTimeout(push, 500); } }
// a plan that could not be built is dropped: keep it as backup, then clear the shared copy too
export function discardBroken() { const raw = ls.get(PKEY); if (raw) ls.set(PKEY + '-backup', raw); save(null); }

// called by the editor after every change (null = no edits)
export function save(patch) { if (OFF) return; latest = patch; dirty = true; seq++; ls.set(UNSENT, '1'); clearTimeout(timer); timer = setTimeout(push, DEBOUNCE); }

async function push(quiet) {
  if (busy) { if (quiet !== true) timer = setTimeout(push, DEBOUNCE); return; }
  busy = true; const sent = seq, patch = latest, send = () => call('PUT', { rev, patch, base: BASE }, 8000, quiet === true);
  let { status, j } = await send();
  if (status === 401 && quiet !== true && !noPrompt) { const pw = prompt('Plan password (the same as the assistant):'); if (pw) { ls.set(PWKEY, pw); ({ status, j } = await send()); } if (status === 401) { ls.del(PWKEY); noPrompt = true; } }
  busy = false;
  if (status === 200 && j) { setRev(j.rev); setLocalOnly(false); if (seq === sent) { dirty = false; ls.del(UNSENT); } else { clearTimeout(timer); timer = setTimeout(push, DEBOUNCE); } return; }
  if (status === 409 && j) { setRev(j.rev); clearTimeout(timer); const mine = latest; // edits made while the request was in flight count as lost too
    latest = j.patch; dirty = false; seq++; ls.del(UNSENT);
    if (same(mine, j.patch)) return;
    backup(mine); adopt(j.patch, true); return; }
  setLocalOnly(true); // network error, 401, 404, 503, ...: local only until the next edit
}

function adopt(patch, lost) { if (!apply) return; if (apply(patch)) note('Updated from another session' + (lost ? '; your last edit was replaced' : '')); else note('Could not apply edits from another session', true); }

// the tab is hidden or closing: send pending edits now; visible again: save pending edits first, otherwise pick up newer edits from other sessions
const flush = () => { if (dirty && !busy) { clearTimeout(timer); push(true); } };
if (!OFF) { addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return flush();
    if (busy) return;
    if (dirty) { clearTimeout(timer); return push(); }
    const { status, j } = await call('GET', null, 5000);
    if (status !== 200 || !j) return; setLocalOnly(false);
    if (j.rev !== rev && !dirty && !busy) { setRev(j.rev); adopt(j.patch); }
  }); }
