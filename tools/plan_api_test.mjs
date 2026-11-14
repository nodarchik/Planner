// Unit check of api/plan.js with a stubbed @vercel/blob (no store, no network). Usage: node tools/plan_api_test.mjs  (exit 1 on failure)
import { createHandler } from '../api/plan.js';
import { HISTORY } from '../api/history.js';

class BlobPreconditionFailedError extends Error {}
class BlobStoreNotFoundError extends Error {}
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra === '' ? '' : ' — ' + extra)); if (!ok) fails++; };

let stored = null, etag = 0, raceOnce = false, throwOnGet = null; // stored = JSON text
const stub = {
  BlobPreconditionFailedError, BlobStoreNotFoundError,
  async get() { if (throwOnGet) throw throwOnGet; return stored === null ? null : { statusCode: 200, stream: new Response(stored).body, blob: { etag: 'e' + etag } }; },
  async put(path, body, o) {
    if (raceOnce) { raceOnce = false; stored = JSON.stringify({ rev: 9, patch: { x: 1 }, base: 'b' }); etag++; }
    if (o.ifMatch && o.ifMatch !== 'e' + etag) throw new BlobPreconditionFailedError();
    if (o.access !== 'private' || !o.allowOverwrite) throw new Error('bad options');
    stored = body; etag++; return { etag: 'e' + etag };
  }
};
const handler = createHandler(stub);
const call = async (method, body, headers = {}) => { const out = {}; const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(j) { out.json = j; return this; } }; await handler({ method, body, headers }, res); return out; };

process.env.BLOB_READ_WRITE_TOKEN = 'test';
let r = await call('GET'); check('GET empty store', r.code === 200 && r.json.rev === 0 && r.json.patch === null);
r = await call('PUT', { rev: 0, patch: { a: 1 }, base: 'b' }); check('PUT first write gives rev 1', r.code === 200 && r.json.rev === 1 && r.json.patch.a === 1);
r = await call('GET'); check('GET returns what was stored', r.json.rev === 1 && r.json.base === 'b');
r = await call('PUT', { rev: 0, patch: { a: 2 }, base: 'b' }); check('stale rev gives 409 with the current copy', r.code === 409 && r.json.rev === 1 && r.json.patch.a === 1);
raceOnce = true; r = await call('PUT', { rev: 1, patch: { a: 3 }, base: 'b' }); check('etag mismatch gives 409 with the new copy', r.code === 409 && r.json.rev === 9);
r = await call('PUT', { rev: 9, patch: null, base: 'b' }); check('patch null (discard) is accepted', r.code === 200 && r.json.rev === 10 && r.json.patch === null);
r = await call('PUT', { rev: 10, patch: { big: 'x'.repeat(260 * 1024) }, base: 'b' }); check('over 256 KB gives 413', r.code === 413);
r = await call('PUT', { rev: 10, patch: { big: 'é'.repeat(140 * 1024) }, base: 'b' }); check('256 KB cap counts bytes, not characters', r.code === 413);
{ const out = {}; await handler({ method: 'PUT', headers: {}, get body() { throw new SyntaxError('bad json'); } }, { setHeader() {}, status(c) { out.code = c; return this; }, json() { return this; } }); check('invalid JSON body gives 400', out.code === 400); }
r = await call('PUT', { rev: 'x', patch: {} }); check('bad body gives 400', r.code === 400);
r = await call('POST', {}); check('other methods give 405', r.code === 405);
process.env.CHAT_PASSWORD = 'pw';
r = await call('PUT', { rev: 10, patch: {}, base: 'b' }); check('PUT needs the password when set', r.code === 401);
r = await call('PUT', { rev: 10, patch: {}, base: 'b' }, { 'x-chat-password': 'pw' }); check('PUT with the password works', r.code === 200);
r = await call('PUT', { rev: 10, patch: {}, base: 'b' }, { 'x-chat-password': 'p' }); check('wrong password of another length gives 401', r.code === 401);
r = await call('GET'); check('GET stays open', r.code === 200);
delete process.env.CHAT_PASSWORD;
throwOnGet = new BlobStoreNotFoundError(); r = await call('GET'); check('missing store gives 503', r.code === 503 && r.json.error === 'storage not configured'); throwOnGet = null;
delete process.env.BLOB_READ_WRITE_TOKEN; r = await call('GET'); check('no token or store id gives 503', r.code === 503 && r.json.error === 'storage not configured');
// api/history.js: same factory, {rev, data}, 2 MB cap
{ process.env.BLOB_READ_WRITE_TOKEN = 'test'; stored = null; etag++;
  const h = createHandler(stub, HISTORY), hc = async (method, body, headers = {}) => { const out = {}; await h({ method, body, headers }, { setHeader() {}, status(c) { out.code = c; return this; }, json(j) { out.json = j; return this; } }); return out; };
  const d = { messages: [{ role: 'user', content: 'hi' }], log: [['user', 'hi']] };
  r = await hc('GET'); check('history: GET empty store', r.code === 200 && r.json.rev === 0 && r.json.data === null);
  r = await hc('PUT', { rev: 0, data: d }); check('history: PUT first write gives rev 1', r.code === 200 && r.json.rev === 1 && r.json.data.log[0][1] === 'hi');
  check('history: stored under chat path with only rev and data', Object.keys(JSON.parse(stored)).sort().join() === 'data,rev');
  r = await hc('PUT', { rev: 0, data: d }); check('history: stale rev gives 409 with the stored copy', r.code === 409 && r.json.rev === 1 && r.json.data.messages.length === 1);
  r = await hc('PUT', { rev: 1, data: null }); check('history: data null (clear) is accepted', r.code === 200 && r.json.rev === 2 && r.json.data === null);
  r = await hc('PUT', { rev: 2, data: { messages: [], log: ['x'.repeat(1.5 * 1024 * 1024)] } }); check('history: 1.5 MB is accepted', r.code === 200);
  r = await hc('PUT', { rev: 3, data: { messages: [], log: ['x'.repeat(2.1 * 1024 * 1024)] } }); check('history: over 2 MB gives 413', r.code === 413);
  r = await hc('PUT', { rev: 3, data: 'x' }); check('history: bad data gives 400', r.code === 400);
  r = await hc('PUT', { rev: 3, patch: {} }); check('history: plan-shaped body gives 400', r.code === 400);
  process.env.CHAT_PASSWORD = 'pw'; r = await hc('PUT', { rev: 3, data: d }); check('history: PUT needs the password when set', r.code === 401);
  r = await hc('PUT', { rev: 3, data: d }, { 'x-chat-password': 'pw' }); check('history: PUT with the password works', r.code === 200);
  r = await hc('GET'); check('history: GET needs the password when set', r.code === 401);
  r = await hc('GET', null, { 'x-chat-password': 'pw' }); check('history: GET with the password works', r.code === 200 && r.json.rev >= 1); delete process.env.CHAT_PASSWORD;
  delete process.env.BLOB_READ_WRITE_TOKEN; r = await hc('GET'); check('history: no token gives 503', r.code === 503);
}
process.exit(fails ? 1 : 0);
