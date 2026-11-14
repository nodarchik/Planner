// Shared plan edits: the patch is also kept on the server (api/plan.js, one rev-checked copy) so every device sees the same apartment. localStorage stays the fallback.
import { PUBLISHED } from './plan.js';

const PKEY = 'palace1-plan-patch-v1', PWKEY = 'palace1-chat-password', URL = '/api/plan', DEBOUNCE = 2000, OFF = !!import.meta.env.VITE_NO_ASSETS; // PKEY: same key as ui/editor.js
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const BASE = hash(JSON.stringify(PUBLISHED));
let rev = 0, latest = null, dirty = false, seq = 0, timer = 0, busy = false, apply = null, badge = null;
export const setApplier = fn => { apply = fn; };
export const active = () => !OFF && !(badge && !badge.hidden);

const css = 'position:fixed;z-index:9;font:600 12px system-ui;border-radius:8px;padding:6px 12px;';
function note(text, sticky) { if (OFF) return; const n = document.createElement('div'); n.textContent = text; n.style.cssText = css + 'left:50%;top:12px;transform:translateX(-50%);background:#2f2a24;color:#fff;cursor:pointer'; n.onclick = () => n.remove(); document.body.appendChild(n); if (!sticky) setTimeout(() => n.remove(), 4000); }
function setLocalOnly(on) { if (OFF) return; if (!badge) { badge = document.createElement('div'); badge.id = 'localbadge'; badge.textContent = 'Saved on this device only'; badge.style.cssText = css + 'left:12px;bottom:12px;background:#6b6258;color:#fff;pointer-events:none'; document.body.appendChild(badge); } badge.hidden = !on; }
const writeLocal = p => { try { if (p) localStorage.setItem(PKEY, JSON.stringify(p)); else localStorage.removeItem(PKEY); } catch (e) {} };
const readLocal = () => { try { const raw = localStorage.getItem(PKEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
const backup = p => { try { localStorage.setItem(PKEY + '-backup', JSON.stringify(p)); } catch (e) {} };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
async function call(method, body, ms = 8000) {
  const headers = { 'content-type': 'application/json' }; let pw = null; try { pw = localStorage.getItem(PWKEY); } catch (e) {} if (pw) headers['x-chat-password'] = pw;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(URL, { method, headers, body: body && JSON.stringify(body), cache: 'no-store', signal: ctl.signal }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j: j && Number.isInteger(j.rev) ? j : null }; }
  catch (e) { return { status: 0, j: null }; } finally { clearTimeout(t); } }

// at start, before the editor loads its edits: put the server patch into localStorage so the normal load path stays unchanged
export async function pullServer() {
  if (OFF) return;
  const { status, j } = await call('GET', null, 3000);
  if (status !== 200 || !j) { setLocalOnly(true); return; }
  rev = j.rev; const local = readLocal();
  if (rev === 0) { if (local) save(local); return; } // first run: the local patch becomes the shared one
  if (j.base && j.base !== BASE) { writeLocal(null); save(null); note('Saved edits were discarded because the published plan changed. Click to close.', true); return; }
  if (local && !same(local, j.patch)) backup(local);
  writeLocal(j.patch);
}

// called by the editor after every change (null = no edits)
export function save(patch) { if (OFF) return; latest = patch; dirty = true; seq++; clearTimeout(timer); timer = setTimeout(push, DEBOUNCE); }

async function push() {
  if (busy) { timer = setTimeout(push, DEBOUNCE); return; }
  busy = true; const sent = seq, patch = latest, { status, j } = await call('PUT', { rev, patch, base: BASE }); busy = false;
  if (status === 200 && j) { rev = j.rev; setLocalOnly(false); if (seq === sent) dirty = false; else { clearTimeout(timer); timer = setTimeout(push, DEBOUNCE); } return; }
  if (status === 409 && j) { rev = j.rev; if (j.base && j.base !== BASE) { timer = setTimeout(push, 0); return; } // server copy is for an older published plan: overwrite it
    if (dirty && !same(patch, j.patch)) backup(patch);
    dirty = false; adopt(j.patch); return; }
  setLocalOnly(true); // network error, 401, 404, 503, ...: local only until the next edit
}

function adopt(patch) { if (!apply) return; if (apply(patch)) note('Updated from another session'); else note('Could not apply edits from another session', true); }

// the tab becomes visible: save pending edits first, otherwise pick up newer edits from other sessions
if (!OFF) document.addEventListener('visibilitychange', async () => {
  if (document.hidden || busy) return;
  if (dirty) { clearTimeout(timer); return push(); }
  const { status, j } = await call('GET', null, 5000);
  if (status !== 200 || !j) return; setLocalOnly(false);
  if (j.rev !== rev && !dirty && !busy) { rev = j.rev; if (!j.base || j.base === BASE) adopt(j.patch); }
});
