// Vercel function: the in-app assistant. The browser keeps the conversation and applies the edits;
// this endpoint only adds the system prompt and the tool definition and forwards the turn to Claude.
// Needs ANTHROPIC_API_KEY in the Vercel project. Optional CHAT_PASSWORD: if set, requests must send it as x-chat-password.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const SYSTEM = `You edit the plan of one real apartment ("Palace 1", Tbilisi) inside its 3D web app. The owner types plain requests ("make the closet 1.30 m", "rotate the bed to face the balcony", "move the dining table 20 cm east"). You answer by calling apply_changes; the app rebuilds the model and returns the result of its automatic checks.

The first user message contains the full plan JSON and the furniture catalog. Later tool results and messages tell you what changed; keep track of the current state from them.

Plan conventions
- Coordinates in metres: x east, y south, origin at the north-west inner corner of bedroom 1. Heights are separate fields. Show dimensions with 2 decimals.
- Walls: "from"-"to" is the reference face (axis-aligned), "t" thickness grows towards "grow" (N/S/E/W). Openings sit at "at" along the wall with width "w".
- Wall-attached items: "wall" + "side" (the face the item stands against) + "from"/"to" along the wall + "depth". Changing a width means changing "from" or "to".
- Free furniture (catalog types): "pos" [x, y], "rot" in degrees clockwise seen from above (0 = facing north) or "lookAt" [x, y], "variant" = index in the catalog list.
- Beds: "anchor" {wall, side, offset, gap}, or free "pos" + "rot".
- Models: an item of type "model" with a "model" id, "pos", "rot", "h" (height of its base).

Rules
- Make the smallest change that satisfies the request. Do not touch anything that was not asked for.
- Never change wall, room or block coordinates unless the owner explicitly asks to move a wall.
- Walk-in closet units are at most 0.30 deep. Aisles should be at least 0.60. Report any value below standard that your change causes; read it from the checks in the tool result, do not guess.
- If a tool result reports an error, fix the change or say plainly that it failed.
- If the request is ambiguous in a way that changes the result (which bed, which wall), ask one short question instead of guessing.
- Replies: blunt and short. State what changed with the numbers, then stop. No filler, no offers.`;

const TOOLS = [{
  name: 'apply_changes',
  description: 'Apply one batch of edits to the apartment plan. The app applies them in order as a single undoable step, rebuilds the 3D model and returns which edits were applied plus the automatic check findings (overlaps, clearances, door swings, route widths). If any edit is invalid the whole batch is rejected and the plan is left unchanged.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'changes'],
    properties: {
      summary: { type: 'string', description: 'One line for the owner: what this batch does.' },
      changes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['op', 'list', 'id', 'path', 'value_json'],
          properties: {
            op: { type: 'string', enum: ['set', 'unset', 'add', 'remove'], description: 'set / unset a field of an existing object; add a new object; remove an object.' },
            list: { type: 'string', enum: ['items', 'walls', 'rooms', 'blocks', 'views', 'meta'], description: 'Which part of the plan.' },
            id: { type: 'string', description: 'Object id (item, wall, room, block id or view name). Empty string for meta.' },
            path: { type: 'string', description: 'Dotted path of the field for set / unset, e.g. "to", "anchor.offset", "pos", "openings.0.at". Empty string for add / remove.' },
            value_json: { type: 'string', description: 'The new value as JSON text for set (e.g. "4.6", "[3.7, 4.43]", "\\"S\\""), the whole new object as JSON text for add. Empty string for unset / remove.' }
          }
        }
      }
    }
  }
}];

const bad = (res, code, error) => res.status(code).json({ error });

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'POST only');
  if (process.env.CHAT_PASSWORD && req.headers['x-chat-password'] !== process.env.CHAT_PASSWORD) return bad(res, 401, 'password required');
  if (!process.env.ANTHROPIC_API_KEY) return bad(res, 500, 'ANTHROPIC_API_KEY is not set in the Vercel project (Settings → Environment Variables); add it and redeploy.');
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 80 || messages[0].role !== 'user') return bad(res, 400, 'messages must be a non-empty conversation starting with the user');
  if (JSON.stringify(messages).length > 1_500_000) return bad(res, 413, 'conversation too long; start a new chat');
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // a declined request is retried on a fallback model in the same call
      thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM, tools: TOOLS, messages
    });
    return res.status(200).json({ content: response.content, stop_reason: response.stop_reason, stop_details: response.stop_details ?? null, model: response.model, usage: response.usage });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return bad(res, 500, 'The Anthropic API key was rejected.');
    if (error instanceof Anthropic.RateLimitError) return bad(res, 429, 'Rate limited by the Claude API; try again in a minute.');
    if (error instanceof Anthropic.BadRequestError) return bad(res, 400, 'Claude API rejected the request: ' + error.message);
    if (error instanceof Anthropic.APIConnectionError) return bad(res, 502, 'Could not reach the Claude API.');
    if (error instanceof Anthropic.APIError) return bad(res, 502, `Claude API error ${error.status}: ${error.message}`);
    return bad(res, 500, 'Unexpected error: ' + (error && error.message));
  }
}
