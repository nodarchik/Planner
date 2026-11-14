// Vercel function: the shared plan edits. One private Blob "plan/palace1.json" = {rev, patch, base}; GET reads it, PUT replaces it if the client's rev is current.
// Needs a Blob store on the project (BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + OIDC). Optional CHAT_PASSWORD: if set, PUT must send it as x-chat-password.
import * as blob from '@vercel/blob';
import { createHash, timingSafeEqual } from 'node:crypto';

const PLAN = { path: 'plan/palace1.json', max: 256 * 1024, keys: ['patch', 'base'], what: 'plan', shape: '{rev, patch, base}',
  valid: b => (b.patch === null || (typeof b.patch === 'object' && !Array.isArray(b.patch))) && (b.base == null || typeof b.base === 'string') }; // cfg of one rev-checked blob; api/history.js passes its own
const bad = (res, code, error) => res.status(code).json({ error });
const NOT_CONFIGURED = 'storage not configured';
const sha = v => createHash('sha256').update(String(v ?? '')).digest(), pwOk = h => timingSafeEqual(sha(h), sha(process.env.CHAT_PASSWORD));

export function createHandler(b, cfg = PLAN) {
  const { path: PATH, max: MAX, keys } = cfg, fields = o => Object.fromEntries(keys.map(k => [k, o[k] ?? null]));
  async function read() {
    const r = await b.get(PATH, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { rev: 0, ...fields({}), etag: null };
    const data = JSON.parse(await new Response(r.stream).text());
    return { rev: data.rev | 0, ...fields(data), etag: r.blob.etag };
  }
  const pub = o => ({ rev: o.rev, ...fields(o) });
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'PUT') return bad(res, 405, 'GET or PUT only');
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return bad(res, 503, NOT_CONFIGURED);
    try {
      res.setHeader('cache-control', 'no-store');
      if (req.method === 'GET') return res.status(200).json(pub(await read()));
      if (process.env.CHAT_PASSWORD && !pwOk(req.headers['x-chat-password'])) return bad(res, 401, 'password required');
      let body; try { body = req.body; if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return bad(res, 400, 'invalid JSON'); }
      if (Buffer.byteLength(JSON.stringify(body ?? null)) > MAX || Number(req.headers['content-length']) > MAX) return bad(res, 413, cfg.what + ' too large');
      if (!body || typeof body !== 'object' || !Number.isInteger(body.rev) || body.rev < 0 || !cfg.valid(body)) return bad(res, 400, 'body must be ' + cfg.shape);
      const cur = await read();
      if (cur.rev !== body.rev) return res.status(409).json(pub(cur));
      const next = { rev: cur.rev + 1, ...fields(body) };
      try {
        await b.put(PATH, JSON.stringify(next), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 60, ...(cur.etag ? { ifMatch: cur.etag } : {}) });
      } catch (e) {
        if (e instanceof b.BlobPreconditionFailedError) return res.status(409).json(pub(await read()));
        throw e;
      }
      return res.status(200).json(next);
    } catch (e) {
      if (e instanceof b.BlobStoreNotFoundError || /no blob credentials|no read-write token/i.test(String(e && e.message))) return bad(res, 503, NOT_CONFIGURED);
      return bad(res, 500, 'Unexpected error: ' + (e && e.message));
    }
  };
}

export default createHandler(blob);
