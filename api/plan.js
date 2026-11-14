// Vercel function: the shared plan edits. One private Blob "plan/palace1.json" = {rev, patch, base}; GET reads it, PUT replaces it if the client's rev is current.
// Needs a Blob store on the project (BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID + OIDC). Optional CHAT_PASSWORD: if set, PUT must send it as x-chat-password.
import * as blob from '@vercel/blob';

const PATH = 'plan/palace1.json', MAX = 256 * 1024;
const bad = (res, code, error) => res.status(code).json({ error });
const NOT_CONFIGURED = 'storage not configured';

export function createHandler(b) {
  async function read() {
    const r = await b.get(PATH, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { rev: 0, patch: null, base: null, etag: null };
    const data = JSON.parse(await new Response(r.stream).text());
    return { rev: data.rev | 0, patch: data.patch ?? null, base: data.base ?? null, etag: r.blob.etag };
  }
  const pub = ({ rev, patch, base }) => ({ rev, patch, base });
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'PUT') return bad(res, 405, 'GET or PUT only');
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return bad(res, 503, NOT_CONFIGURED);
    try {
      res.setHeader('cache-control', 'no-store');
      if (req.method === 'GET') return res.status(200).json(pub(await read()));
      if (process.env.CHAT_PASSWORD && req.headers['x-chat-password'] !== process.env.CHAT_PASSWORD) return bad(res, 401, 'password required');
      const body = req.body, text = JSON.stringify(body ?? null);
      if (text.length > MAX || Number(req.headers['content-length']) > MAX) return bad(res, 413, 'plan too large');
      if (!body || typeof body !== 'object' || !Number.isInteger(body.rev) || body.rev < 0 || (body.patch !== null && (typeof body.patch !== 'object' || Array.isArray(body.patch))) || (body.base != null && typeof body.base !== 'string')) return bad(res, 400, 'body must be {rev, patch, base}');
      const cur = await read();
      if (cur.rev !== body.rev) return res.status(409).json(pub(cur));
      const next = { rev: cur.rev + 1, patch: body.patch, base: body.base ?? null };
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
