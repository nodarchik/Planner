// Vercel function: the shared assistant chat history. One private Blob "chat/palace1.json" = {rev, data}; same rev and storage rules as api/plan.js; with CHAT_PASSWORD set, GET needs it too (the history is private).
import * as blob from '@vercel/blob';
import { createHandler } from './plan.js';

export const HISTORY = { path: 'chat/palace1.json', max: 2 * 1024 * 1024, keys: ['data'], what: 'history', protectGet: true, shape: '{rev, data}', valid: b => b.data === null || (typeof b.data === 'object' && !Array.isArray(b.data)) };

export default createHandler(blob, HISTORY);
