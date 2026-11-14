// Models the assistant may use: shared by api/chat.js (allow-list, per-model request options) and the chat panel (labels). fallback = server-side refusal fallback is supported (not on Haiku 5.5).
export const CHAT_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (fast)', fallback: false },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', fallback: true },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', fallback: true },
  { id: 'claude-fable-5-2', label: 'Fable 5.2 (most capable)', fallback: true }
];
export const DEFAULT_MODEL = CHAT_MODELS[0].id;
