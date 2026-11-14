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
- Anything the catalog lacks: an item of type "parts" = { id, type:"parts", pos:[x,y], rot, h (base height, default 0), label, parts:[{ shape, pos:[x,y,z], size, rot?, material, color?, radius? }] }. Part pos is the part centre in x (right) and y (depth) relative to the item origin and z = its bottom, metres above the base. size is [w,d,h] for box and rbox, [r,h] for cyl, [r] for sphere. rot is [rx,ry,rz] degrees (rz turns it about the vertical). Example, a side table: {"id":"side-1","type":"parts","pos":[3,4],"rot":0,"label":"Side table","parts":[{"shape":"rbox","pos":[0,0,0.5],"size":[0.5,0.5,0.04],"material":"oakFurn","radius":0.01},{"shape":"cyl","pos":[0,0,0],"size":[0.03,0.5],"material":"brass"}]}. "solid":false removes its floor footprint from the checks and walking. Shapes and material keys are listed in the first message.
- Looks: "look" on an item = { partKey: { fin, color } } (fin and colour per key are listed in the first message); "resize" = [x, height, y] scale factors; "opts" on a catalog item holds the design options listed in the catalog (e.g. {"W": 2.7} for sofa width). To change a style for the whole apartment set meta.style.preset.
- Colours (all #rrggbb hex, set with apply_changes). Floor: floors[i].material (a material key, e.g. oakFloor), floors[i].finish (overlay material key, e.g. chevron) and floors[i].color (tint); meta.style.floorTint tints every floor without its own colour. Floors are rectangles: to recolour one room, set the floor entries covering it (split an entry in two if it spans several rooms). Walls: meta.style.wallTint (all), walls[id].color (one whole wall), rooms[id].wallColor (that room's wall faces), blocks[id].color. Ceiling: meta.style.ceilingTint, ceilings[i].color. Skirting, picture-frame mouldings and arch casings: meta.style.trimTint (arch casings have no per-room colour); rooms[id].trimColor (skirting of one room). Doors: openings.N.leaf.color or leaf.material on the wall. Window and door frames: meta.style.frameTint. Items: "look". Tints multiply the texture, so mid-light colours work best. To unset a colour use op unset; unset on an array index (e.g. openings.1) removes that entry; several such unsets on one array in a batch all refer to the list as it was before the batch.
- Renaming an id: add a copy under the new id, fix every field that references the old id (room, wall, item references, views), then remove the old one, in one batch.
- Moving a wall: change "from"/"to"; also move the room "poly" points that lie on it, and check the items standing on the wall (they follow through "wall" but free items and openings do not).

Rules
- The owner has full authority over the whole plan. You may change anything: walls, rooms, openings, slabs, floors, ceilings, balconies, blocks, items, views and meta. You may add and delete anything asked. Do what is asked; do not refuse, hold back or shrink a request.
- After a change, report the check findings and any value below standard as information, read from the tool result, not as a reason to refuse.
- If a tool result reports an error, fix the change and retry.
- If the request is ambiguous, pick the most likely meaning, do it, and say what you assumed. Edits are undoable.
- Replies: blunt and short, plain text only (no markdown, no bullet lists, no bold). State what changed with the numbers, then stop. No filler, no offers.`;

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
            op: { type: 'string', enum: ['set', 'unset', 'add', 'remove'], description: 'set / unset a field of an existing object; add a new object; remove an object. For meta, add = set and remove = unset of the key at path (any key, including new ones).' },
            list: { type: 'string', enum: ['items', 'walls', 'rooms', 'blocks', 'balconies', 'slabs', 'floors', 'ceilings', 'views', 'meta'], description: 'Which part of the plan.' },
            id: { type: 'string', description: 'Object id (item, wall, room, block, balcony id or view name). For slabs, floors and ceilings, which have no id, the zero-based index as text ("0"); for add, any text. Indexes refer to the list as it was before this batch (removals are applied from the highest index down, and so are unsets of array entries such as openings.1). Empty string for meta.' },
            path: { type: 'string', description: 'Dotted path of the field for set / unset, e.g. "to", "anchor.offset", "pos", "openings.0.at". Empty string for add / remove of a list entry; for meta add / remove use it like set / unset.' },
            value_json: { type: 'string', description: 'The new value as JSON text for set (e.g. "4.6", "[3.7, 4.43]", "\\"S\\""), the whole new object as JSON text for add (for meta: the new value). Empty string for unset / remove.' }
          }
        }
      }
    }
  }
}];

// set_view_state is not strict: strict mode needs every field required and nullable (17 nulls per call) and drops minimum/maximum; the app validates every field itself.
TOOLS.push({
  name: 'set_view_state',
  description: 'Change what is not part of the plan file: the same controls as the toolbar. Give only the fields you want to change. Not saved in the plan and not undoable, except style, which sets meta.style.preset (saved, undoable).',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      night: { type: 'boolean', description: 'Night (true) or day (false).' },
      photo: { type: 'boolean', description: 'Photo render (path tracer) on or off.' },
      cut: { type: 'boolean', description: 'Cut (walls cut at 1.2 m) on or off.' },
      style: { type: 'string', description: 'Interior style preset: warm, soft, nordic, japandi, luxe or midcentury.' },
      sun_month: { type: 'integer', minimum: 1, maximum: 12, description: 'Month for the sun.' },
      sun_hour: { type: 'number', minimum: 5, maximum: 21, description: 'Hour of day for the sun, e.g. 14.5.' },
      view: { type: 'string', description: 'Name of a camera view (a key of plan.views) to jump to.' },
      focal: { type: 'number', enum: [0, 18, 24, 35, 50], description: 'Photo lens in mm (0 = auto).' },
      fstop: { type: 'number', enum: [0, 1.4, 2.8, 5.6, 11], description: 'Photo depth of field, f-number (0 = off); focus is on the orbit target.' },
      dims: { type: 'boolean', description: 'Dimension labels on or off.' },
      furniture: { type: 'boolean', description: 'Furniture overlay on or off.' },
      labels: { type: 'boolean', description: 'Room labels on or off.' },
      walk: { type: 'boolean', description: 'Walk mode (first person, eye height 1.6 m) on or off.' },
      walk_to: { type: 'object', additionalProperties: false, required: ['x', 'y'], description: 'Stand at plan point (x, y) in metres looking yaw degrees (default 0 = north, 90 = east, clockwise seen from above); turns walk mode on. Rejected if the point is inside a wall or furniture.',
        properties: { x: { type: 'number' }, y: { type: 'number' }, yaw: { type: 'number' } } },
      camera: { type: 'object', additionalProperties: false, required: ['cam', 'target'], description: 'Orbit camera position and look-at point as [x, y, z] in metres (x east, y height, z south = plan y). Not saved in the plan; not while walking. Ceilings show automatically when the camera is inside the apartment; there is no manual ceiling switch.',
        properties: { cam: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, target: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } } }
    }
  }
});

TOOLS.push({
  name: 'history',
  strict: true,
  description: 'Undo or redo the last edit steps, or reset the whole plan to the published one (the same as the editor buttons; the undo list also holds the owner\'s hand edits). The result lists what changed, or says nothing was left. Reset is itself undoable.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['action', 'steps'],
    properties: {
      action: { type: 'string', enum: ['undo', 'redo', 'reset'] },
      steps: { type: ['integer', 'null'], description: 'How many undo or redo steps, 1 to 100 (null = 1); ignored for reset.' }
    }
  }
});

const bad = (res, code, error) => res.status(code).json({ error });

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'POST only');
  if (process.env.CHAT_PASSWORD && req.headers['x-chat-password'] !== process.env.CHAT_PASSWORD) return bad(res, 401, 'password required');
  if (!process.env.ANTHROPIC_API_KEY) return bad(res, 500, 'ANTHROPIC_API_KEY is not set in the Vercel project (Settings → Environment Variables); add it and redeploy.');
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 200 || messages[0].role !== 'user') return bad(res, 400, 'messages must be a non-empty conversation starting with the user');
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
