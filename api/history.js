// Vercel function: the shared assistant chats. One private Blob per chat, "chat/<id>.json" = {rev, data} (?id=, id "main" or none = "chat/palace1.json"), plus "chat/index.json" (?index=1) = the chat list; same rev and storage rules as api/plan.js; with CHAT_PASSWORD set, GET needs it too (the history is private).
import * as blob from '@vercel/blob';
import { createHandler } from './plan.js';

const ID = /^[a-z0-9-]{8,40}$/;
export const chatPath = req => { const q = req.query || (req.url ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {}), id = q.id === undefined ? 'main' : q.id;
  if (q.index !== undefined) return q.index === '1' ? 'chat/index.json' : null;
  return id === 'main' ? 'chat/palace1.json' : typeof id === 'string' && ID.test(id) ? `chat/${id}.json` : null; };
export const HISTORY = { pathFor: chatPath, max: 2 * 1024 * 1024, keys: ['data'], what: 'history', protectGet: true, shape: '{rev, data}', valid: b => b.data === null || (typeof b.data === 'object' && !Array.isArray(b.data)) };

export default createHandler(blob, HISTORY);
