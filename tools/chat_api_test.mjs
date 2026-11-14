// Unit check of api/chat.js with a stubbed Anthropic client (no network, no API key). Usage: node tools/chat_api_test.mjs  (exit 1 on failure)
import { createHandler } from '../api/chat.js';
import { CHAT_MODELS, DEFAULT_MODEL } from '../src/chat-models.js';

let fails = 0, sent = null;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra === '' ? '' : ' — ' + extra)); if (!ok) fails++; };
const handler = createHandler(() => ({ beta: { messages: { create: async p => { sent = p; return { content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', model: p.model, usage: {} }; } } } }));
const call = async body => { const out = {}; sent = null; await handler({ method: 'POST', headers: {}, body }, { status(c) { out.code = c; return this; }, json(j) { out.json = j; return this; } }); return out; };
process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.CHAT_PASSWORD;
const msgs = [{ role: 'user', content: 'x' }];

let r = await call({ messages: msgs });
check('default model is Haiku 5.5', DEFAULT_MODEL === 'claude-haiku-5-5' && r.code === 200 && sent.model === 'claude-haiku-5-5');
check('Haiku gets no fallback parameters', !('fallbacks' in sent) && !('betas' in sent));
check('shared options on Haiku: adaptive thinking, medium effort, 16000 tokens, cache', sent.thinking.type === 'adaptive' && sent.output_config.effort === 'medium' && sent.max_tokens === 16000 && sent.cache_control.type === 'ephemeral');
for (const m of CHAT_MODELS.filter(m => m.id !== DEFAULT_MODEL)) { r = await call({ messages: msgs, model: m.id }); check(m.id + ' is accepted and sent with the server-side fallback', r.code === 200 && sent.model === m.id && sent.fallbacks === 'default' && sent.betas.includes('server-side-fallback-2026-07-01')); }
r = await call({ messages: msgs, model: 'claude-opus-4-1' }); check('unknown model gives 400 with the allowed list', r.code === 400 && CHAT_MODELS.every(m => r.json.error.includes(m.id)) && sent === null);
r = await call({ messages: msgs, model: 5 }); check('non-string model gives 400', r.code === 400);
r = await call({ messages: msgs, model: null }); check('null model falls to the default', r.code === 200 && sent.model === DEFAULT_MODEL);
r = await call({ messages: [] }); check('empty conversation still gives 400', r.code === 400);
process.exit(fails ? 1 : 0);
