// Unit check of api/chat.js with a stubbed Anthropic client (no network, no API key). Usage: node tools/chat_api_test.mjs  (exit 1 on failure)
import { createHandler, clientOptions } from '../api/chat.js';
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
const img = t => [{ type: 'text', text: '[photo: a.jpg]' }, { type: 'image', source: { type: 'base64', media_type: t, data: 'AAAA' } }, { type: 'text', text: 'hi' }];
r = await call({ messages: [{ role: 'user', content: img('image/jpeg') }] }); check('image block (base64 jpeg) reaches the client call unchanged', r.code === 200 && sent.messages[0].content[1].source.data === 'AAAA');
r = await call({ messages: [{ role: 'user', content: img('image/svg+xml') }] }); check('bad image media type gives 400', r.code === 400 && sent === null);
r = await call({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'http://x/a.png' } }] }] }); check('image from a URL gives 400', r.code === 400 && sent === null);
r = await call({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '<script>' } }] }] }); check('non-base64 image data gives 400', r.code === 400);
r = await call({ messages: [{ role: 'user', content: 'x'.repeat(2_000_000) }] }); check('a 2 MB conversation is accepted (cap raised)', r.code === 200);
r = await call({ messages: [{ role: 'user', content: 'x'.repeat(3_600_000) }] }); check('over the 3.5 MB cap gives 413', r.code === 413 && sent === null);
delete process.env.ANTHROPIC_WORKSPACE_ID; check('no workspace header when ANTHROPIC_WORKSPACE_ID is unset', Object.keys(clientOptions()).length === 0);
process.env.ANTHROPIC_WORKSPACE_ID = ' wrkspc_test '; check('workspace header is sent (trimmed) when ANTHROPIC_WORKSPACE_ID is set', clientOptions().defaultHeaders['anthropic-workspace-id'] === 'wrkspc_test');
process.env.ANTHROPIC_WORKSPACE_ID = '  '; check('blank ANTHROPIC_WORKSPACE_ID adds no header', Object.keys(clientOptions()).length === 0);
process.exit(fails ? 1 : 0);
