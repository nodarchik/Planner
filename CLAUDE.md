# Palace 1 apartment — 3D model

Interactive, photoreal-leaning 3D model of one real apartment ("Palace 1", Tbilisi; plan PDF 107.3 m², owner counts 130 m² total with balconies). The owner iterates on layout and furniture by plain-language requests ("make the closet 1.30 m", "rotate the bed to face the balcony"). Every request must be answerable by a small, safe edit.

## Current state
- Vite + vanilla ES modules, three 0.160 + three-gpu-pathtracer. Procedural geometry and textures, plus CC0 Poly Haven assets in `public/assets/` (13 models, scanned normal/roughness maps, sky HDRI; sources in `assets/CREDITS.md`). Every asset has a procedural fallback.
- **The apartment is data: `src/plan/palace1.json`** (rooms, walls with openings, blocks, items, views). Code in `src/` builds whatever the file says. A layout or furniture request is an edit to that file, not to code.
- Photo render (path tracer), stills hook, lamps in lumens, cabinet bevels and pulls, shadow and orbit performance work are done (PLAN.md Phases 6–8 status).
- **Walk mode** (Phase 9, done): `Walk` button, eye height 1.60, 1.4 m/s (Shift 2.5), radius 0.25, collision from plan data; Esc or the button leaves, view change teleports, Photo/Cut/Edit plan and walk switch each other off.
- `PLAN.md` — the refactor + realism plan and its status.
- `legacy/palace-apartment.html` — the original single-file app (Claude artifact version 22). Reference only; do not edit.
- `baseline/*.png` — 13 reference screenshots (12 views day + `top_night`) of the current plan with models, scanned maps and sky loaded. Recapture them after any intended visual change.

## Commands
- `npm run dev` — dev server. `npm run check` — lint + validate + build. `npm run preview` — serve `dist/` on :4173.
- `npm run validate` — schema + reference checks, then the geometric checks (overlaps, clearances, door swings, routes). Findings are listed; `-- --strict` makes errors fail. `-- --all` lists passed checks too.
- `npm run build:single` — `dist-single/index.html`, one self-contained file without external assets, for the Claude artifact.
- `node tools/fetch_assets.mjs` / `node tools/fetch_textures.mjs` — re-download and convert the Poly Haven assets (needs network access to polyhaven.com).
- `npm run shots` — 13 screenshots of the preview server into `shots/` (~40 s with `SHOT_GPU=1` on an M4; ~22 min with default software GL); `npm run shots:diff` — compare with `baseline/` (fails above 2 % differing pixels; identical builds differ by 0.1–1.5 % on GPU (software-GL and GPU shots differ by 1–3 %, so keep the baseline from one mode) from unseeded ambient-occlusion noise, so also look at `shots/diff/*.png`: grain is noise, shapes are real changes).
- `SHOT_GPU=1 npm run shots` (also `tools/editor_test.py`) launches Chromium on the real GPU (ANGLE Metal on macOS) instead of SwiftShader; default stays software GL. `tools/launch.py` is the shared launcher; without CHROME_PATH or /opt/pw-browsers it uses Playwright's own Chromium. If system Python refuses pip, use `.venv` (`source .venv/bin/activate` first).
- `npm run stills` — `tools/stills.py`: 2560×1440 path-traced stills of the 12 day views into `renders/` (`--samples N` default 96, `--views a,b`, `--night`, `--focal mm`, `--fstop f`; ~7–11 min per still at 96 samples on an M4; needs `SHOT_GPU=1`). `renders/` is gitignored (143 MB for 15 stills); wc, corridor, closet and hall there predate the white-balance fix, hall also the closet change: re-render with `--views wc,corridor,hall,closet`. A timed-out or failed still reloads the page and goes on with the next view.
- `python3 tools/editor_test.py <url> [dir]` — functional test of the in-page editor.
- `python3 tools/walk_test.py <url> [dir]` (`npm run walk:test` against :4173) — test of walk mode: collisions, doors, balcony edge, teleport, Esc, mode exclusion, phone stick (needs `SHOT_GPU=1` for speed).
- `npm run fast:test` — `tools/fast_test.py`: Fast button, persistence, rebuild, exact restore, Photo exclusion, night brightness.
- `python3 tools/chat_test.py <url>` — test of the in-app assistant against a mocked `/api/chat` (no Claude API call).
- `npm run sync:test` — shared plan storage: `tools/plan_api_test.mjs` (api/plan.js with a stubbed Blob module) then `tools/sync_test.py <url>` (browser, mocked `/api/plan`).
- Python needs `pip install playwright pillow numpy`; Chromium is taken from `CHROME_PATH` or `/opt/pw-browsers/chromium`.

## Local setup
- Prerequisites: Node 20+ and `npm install`; Python 3 venv (`python3 -m venv .venv && source .venv/bin/activate && pip install playwright pillow numpy && playwright install chromium`); Vercel CLI (`npm i -g vercel`, then `vercel link` once).
- `.env.local` (gitignored, copy from `.env.example`): `ANTHROPIC_API_KEY` (needed by the assistant); optional `CHAT_PASSWORD`.
- Shared plan edits need a private Vercel Blob store connected to the project; it adds `BLOB_READ_WRITE_TOKEN` (or `BLOB_STORE_ID` + OIDC). Store setup (NOT yet run or verified): `vercel blob create-store palace1-plan --access private -e production -e preview -e development -y`. `vercel env pull .env.local` brings the token for `npm run dev:full`, but it overwrites `.env.local`: back up the `ANTHROPIC_API_KEY` line (and any local-only values) first. Without a store `/api/plan` answers 503 and the app stays local-only (badge "Saved on this device only"). Without `CHAT_PASSWORD`, anyone who can reach the site can overwrite the shared plan (today the site is behind Vercel login). The single-file build never calls the API. Known: two simultaneous very first writes (no stored blob yet, so no etag) can race.
- `npm run dev` — app only, http://localhost:5173 (no assistant). It calls `/api/plan`, gets `index.html` back, and goes local-only (badge).
- `npm run dev:full` — app + assistant API with `.env.local` loaded, http://127.0.0.1:3000 (`tools/dev-full.sh`; stops with a clear message if `.env.local` or `vercel` is missing).
- `npm run check` — lint + validate + build.
- Screenshots / stills: `npm run build && npm run preview`, then in another shell `SHOT_GPU=1 npm run shots` and `SHOT_GPU=1 npm run stills`.

## How to make a change
1. Edit `src/plan/palace1.json` (one value where possible). Examples: closet depth → `items[closet-b1].unitDepth`; wardrobe width → `from`/`to`; vanity basins → `basins`; guest shower side → `along`; move a wall → its `from`/`to` (and the room `poly` points on it).
2. `npm run validate` and read the findings. Report any value below standard.
3. Screenshot the affected views and look at them.
The owner can make the same edits in the page (Edit plan) and paste the "Copy changes" summary; apply those lines to the JSON.

### Plan file conventions
- Walls: `from`–`to` is the reference face (axis-aligned), `t` thickness grows towards `grow` (N/S/E/W). Openings: `at` (coordinate along the wall) + `w`; types `door`, `window`, `balconyDoor`, `arch`; `leaf` = hinge end, swing side, open angle in degrees.
- Wall-attached items: `wall` + `side` (the face the item stands against and protrudes from) + `from`/`to` along the wall + `depth`. Moving the wall moves the item. Alternative without a wall: `axis` + `back` + `face`.
- Free furniture (catalog types sofa, coffee, dining, chair, armchair, stool, sidetable, floorlamp, desk, deskchair): `pos` [x, y], `rot` degrees clockwise as seen from above (0 = facing north) or `lookAt` [x, y], `variant` index into `DESIGNS` in `src/catalog.js`.
- Beds: `anchor` { wall, side, offset along the wall, gap } or free `pos` + `rot`.
- `coversWall` (margin in m) makes wall mouldings skip the item. `label` puts the item in the Furniture overlay and table (sizes are measured from what is built).
- `parts` item (any object the catalog lacks): `pos`, `rot`, `h` (base height), `label`, `solid:false` (no floor footprint), `parts:[{shape: box|rbox|cyl|sphere, pos:[x,y,z] (x,y centre, z bottom, local, metres), size ([w,d,h] | [r,h] | [r]), rot:[rx,ry,rz] degrees, material (key of `M`), color (hex tint), radius}]`. Builder `src/items/parts.js`.
- Surface colours (hex `#rrggbb`, all optional, defaults leave the look unchanged): `floors[i].color` (+ `material`/`finish` keys), `meta.style.floorTint|wallTint|ceilingTint|trimTint|frameTint`, `walls[].color`, `blocks[].color`, `ceilings[i].color`, `rooms[].wallColor|trimColor`, `openings[].leaf.color`; items use `look`. Applied in `src/arch/shell.js`.
- Models: a catalog design marked "(3D model)", a `planter` with `model`, or an item of type `model` (`model` id from `MODELS` in `src/assets.js`, `pos`, `rot`, `h` = height of its base, optional `width`).
- Lights: `type:"light"` items take `lm` (lumens) and `k` (kelvin); builders' own lamps read `meta.lights.kinds` (lm, K per fixture or per metre); `meta.lights.scale` maps lumens to scene units (one constant). Lamps of rooms without windows are also on in day Photo.
- `meta.site` (lat, lon, time zone) and `meta.north` (compass bearing of plan north, degrees; 352 was read off a map screenshot and is approximate) drive the sun; `meta.sun` is the default month and hour.
- Skirting, wall cladding, mouldings, rounded corners and ceiling trays are derived from rooms and walls; nothing is listed by hand.

## Photo render and performance notes
- Photo (path tracer, `pathtracer.js`): window and rail glass are clear alpha, clearcoat (floor, TV, ...) and the opal lamp material are off in Photo, day sky ×3, 8 bounces; exposure inside 6 / outside 0.5 by day, 0.75 / 1.3 at night; downlights come from room spots, lamps of windowless rooms are on in day Photo at ×0.2 and 5200 K (white-balanced), LED coves are RectAreaLights at night. Lens Auto/18/24/35/50 mm and DOF f/1.4–f/11 (focus on the orbit target). `window.__still({view, samples, w, h, night, focal, fstop})` rejects if a still is running or Photo drops.
- Sun shadow map is refreshed only on change (`markShadows()`: sun, night, Cut, rebuilds, drags, model swap-in, ceiling toggle); its frustum is fitted to the apartment along the sun (0.9–5.0 mm per texel). Cascaded shadows were skipped (the fit made contact shadows fine, the shadow pass costs ~3 ms).
- Desktop: while the camera moves, pixel ratio ≤ 1.25 and no AO/bloom; full quality 8 frames after it stops (1080p: 13.9 → 44 fps). Phones: AO off (60 fps in iPhone 14 emulation).
- Fast (`src/fast.js`, toolbar button, saved per device in localStorage `palace1-fast-v1`): off = shadow map, environment reflections, clearcoat, sheen, transmission (glass becomes plain transparent, opacity 0.2), metalness (black without reflections), normal and roughness maps, AO, bloom, sun, lamps and LED coves, pixel ratio 1; on = one hemisphere light plus one shadowless directional light (day), hemisphere only (night, dimmer). Originals are recorded per material and restored on exit; `fastSync()` re-applies it after `buildAll`/`rebuildItem`, model swap-in and scanned-map arrival, `fastInherit` covers tinted clones. Photo turns Fast off. The composer stays (MSAA + tone mapping) with AO and bloom disabled. `window.__fast` (on, settings(), snapshot()) and `npm run fast:test` check it. Measured on an M4 at 1080p while orbiting, living view: day 22.5 ms (44 fps) to 16.7 ms (60 fps, vsync cap), night 135 ms (7 fps) to 16.7 ms; phone emulation (390x844, dpr 3) day 60 to 60 fps, night 49 to 60 fps.
- Textures stay WebP (KTX2 was tried: UASTC normals 8.3 MB vs 2.4 MB WebP, ETC1S normals blocky).

## Owner preferences
- Replies: blunt, short, no filler, no questions, no offers. State what changed and stop.
- Only the **Soft classic** layout exists.
- Design language: greige walls (#E9DDCC), picture-frame mouldings + chair rail, light-oak chevron floor, rounded-shoulder arches, fluted rounded corners, coffered ceilings with LED cove, brass, travertine, cream lacquer, bouclé.
- Dimensions are in metres, shown to 2 decimals. Walk-in closet units: 0.30 m deep maximum.

## Coordinate system
Plan coordinates `(x, y)` in metres, x → east, y → south, origin at the NW interior corner of bedroom 1. three.js mapping: plan x → world X, plan y → world Z, height → world Y. Ceiling height `H` = 2.80.

| Room | x | y | Notes |
|---|---|---|---|
| Bedroom 1 | 0–2.89 (lobe to 4.59 at y 3.05–3.98) | 0–3.98 | door on east wall y 3.05–3.85; west wall: window y 1.63–2.83, balcony door y 2.84–3.61 |
| B1 walk-in closet | 2.99–4.59 | 0–2.95 | partition x 2.89–2.99; arched entry in wall y 2.95–3.05 (opening x 3.32–4.0); sliding door |
| Bedroom 2 | 0–5.06 | 4.08–7.13 | door on east wall y 4.89–5.79; west wall: balcony door y 4.74–5.48, window y 5.48–6.71 |
| Bathroom | 4.69–7.07 | 0–2.77 | riser shaft x 4.98–6.29, y 0–0.48; door x 5.47–6.27 in south wall |
| Corridor | 4.69–7.07 | 2.87–4.40 | open to hall (no arch) |
| Hall | 5.16–8.86 | 4.40–7.13 | entrance door x 5.23–6.18 (south wall) |
| Studio (living + kitchen) | 7.17–13.62 | 0–4.32 | arch to hall x 7.24–8.79 |
| Office | 8.96–13.62 | 4.42–7.13 | |
| Guest shower room | 7.06–8.86 | 7.39–9.06 | door x 7.96–8.73, opens into hall |
| West balcony | −1.85–−0.25 | 0–7.13 | off both bedrooms |
| East balcony (main) | 13.87–15.89 | 0–7.13 | doors y 1.69–2.48 and 4.71–5.51 |

## Current furniture plan (Soft classic)
- **Bedroom 1**: bed 1.60 × 2.00, headboard on the closet partition (x 2.89), faces west to the balcony; nightstands (2.65, 0.44) and (2.65, 2.74); beauty table x 0.6–1.7 on the south wall + 0.40 m organiser x 1.72–2.12 (3 drawers, 2 open shelves, h 1.27).
- **B1 closet**: east unit x 4.29–4.59, north unit y 0.02–0.32, west shelves x 2.99–3.24; face-out hanging; aisle 1.05.
- **Bedroom 2**: bed headboard on south wall (cx 1.55); hinged wardrobe x 2.95–5.06, y 6.53–7.13, h 2.60; desk at (2.9, 4.43) on the north wall.
- **Bathroom**: tub x 4.69–5.44, y 0.48–2.18; walk-in shower x 6.29–7.07, y 0–1.45; WC x 5.70–6.06 on the shaft; double vanity x 6.62–7.065, y 1.50–2.75.
- **Corridor**: washer + dryer tower y 2.89–3.60 and wardrobe y 3.60–4.38, both x 6.43–7.07.
- **Hall**: stone console, plaster artwork, brass sconce on the east wall. No wardrobe (it blocked the entrance).
- **Studio**: corner kitchen NW + bar x 8.86–9.35, y 0.2–1.95 with 3 stools; sofa 2.70 (chaise R) at (12.2, 0.47); rect coffee table (12.65, 1.6); dining table (9.9, 3.87) against the partition; TV wall on the south partition x 11.05–13.55.
- **Office**: built-in desk x 10.88–13.62, y 6.45–7.13, 2 chairs.
- **Guest shower room**: shower strip x 7.06–7.86 full depth, glass wall along x 7.86 with a door at each end; WC on south wall x 8.18–8.54; basin on east wall y 7.75–8.20.
- **East balcony**: sofa x 13.92–14.72, y 0.15–1.75; dining for 4 at (14.85, 3.6); herb garden y 6.72–7.05; 2 lounge chairs at y 6.0.

## Code map (`src/`)
- `plan/` — `palace1.json` (the apartment), `schema.json`, `plan.js` (working copy `plan`, `PUBLISHED`, wall/face/frame lookups), `geom.js` (pure geometry), `frame.js` (local frame for wall-attached builders: `u` along the wall, `d` out from it; works on all four wall directions), `footprints.js` + `checks.js` (automatic checks), `patch.js` (diff / patch / change summary), `walk.js` (walk collision: `walkSolids`, `moveCircle`; `geom.js` `solids()` / `pointInPoly`)
- `arch/shell.js` — `buildArchitecture`: slabs, floors, walls, openings, door leaves, skirting, cladding, mouldings, corners, ceilings from the plan · `arch/walls.js` — `wallRun`, glazing, `door`, `skirt` · `arch/soft.js` — `softPanels`, `softArch`, `softBullnose`, `softTray`
- `items/` — one parametric builder per item type: `loose.js` (bed, nightstand, rug, planter, curtain, wall art, light…), `hall.js`, `kitchen.js`, `storage.js` (wardrobe, laundry tower, walk-in closet, sliding door, bookshelf, built-in desk), `bath.js` (tub, shower, WC, vanity…), `living.js` (TV wall, beauty table, terrace sofa); `index.js` = registry + `buildItem`
- `catalog.js` — `DESIGNS`: swappable free-furniture designs · `furniture/` — shared shape helpers (`cab` cabinet run, `bed`, chairs, plants, decor)
- `api/chat.js` (repo root, Vercel function) + `ui/chat.js` — in-app assistant: the browser sends the conversation, the function adds the system prompt and the `apply_changes` tool and calls Claude (`claude-opus-5-5`); it has no content limits: `apply_changes` edits any plan list (items, walls, rooms, blocks, balconies, views, slabs/floors/ceilings by index) and meta keys (add/remove), `set_view_state` changes night, photo, cut, style, sun and view, up to 30 tool turns per request; edits are applied in the browser as undoable steps and the check findings go back as the tool result. Needs `ANTHROPIC_API_KEY` in the Vercel project; optional `CHAT_PASSWORD`. Not available in `npm run dev` (use `vercel dev`) or the single-file build. Tools: `apply_changes`; `set_view_state` (night, photo, cut, style (written to `meta.style.preset`, undoable), sun_month, sun_hour, view, focal, fstop, dims, furniture, labels, walk, walk_to {x,y,yaw}, camera {cam,target}; no ceiling switch because the ceiling follows the camera); `history` (undo/redo 1-100 steps, reset). The first message carries the plan plus generated lists (catalog and opts, parts shapes, material keys, look keys/finishes by item type, presets). `meta.ceiling` and `meta.cut` are re-read on every rebuild. `tools/chat_test.py` covers all of this against the mocked API.
- `api/plan.js` (Vercel function) + `plan/sync.js` — shared edits: one private Blob `plan/palace1.json` = `{rev, patch, base}` (`base` = hash of the published plan, information only; a patch is applied whatever the base). GET open; PUT checks `rev` (409 returns the current copy), 256 KB max (bytes), `CHAT_PASSWORD` required when set (401 makes the page ask for it once). `sync.js`: `pullServer()` at start (3 s, writes the server patch into `palace1-plan-patch-v1`, local one kept under `-backup` when it differs), `save()` from `persist()` (2 s debounce, whole patch; also sent at once when the tab is hidden or closing), marker `palace1-plan-unsent` + last rev `palace1-plan-rev`: with the marker set, the next load pushes the local patch instead of adopting the server's. 409 adopts the server patch (note "Updated from another session", plus "; your last edit was replaced" when local edits were lost; undo stacks cleared), failures go local-only (badge), tab focus refreshes, Reset to published clears the server copy; a patch that cannot be built is backed up, then cleared. View, sun and style stay per device.
- `fast.js` — Fast mode (flatten materials, flat lights, `setFast`, `fastSync`, `fastLights`, `fastInherit`; hooks in `build.js` finish, `lighting.js` `syncLights`, `assets.js`, `tint.js`, `post.js` `applyPost`)
- `lights.js` — lumen helpers (`kindOf`, `pointCd`, `spotCd`, `stripNits`, `kelvin`), built-in default kinds when a plan has no `meta.lights`, `isWindowless` · `furniture/pulls.js` — cabinet pulls (brass bar / knob / edge pull, merged per cabinet run) · `tools/stills.py` (stills) · `tools/launch.py` (shared Chromium launcher, `SHOT_GPU=1`)
- `build.js` — `buildAll()` (after structural edits) and `rebuildItem(id)`
- `assets.js` — model and scanned-map loading (`MODELS`, `instance`, `swapIn`, `upgradeMaterials`); `lighting.js` — `solar()`, `setSun()`, sky
- `scene.js` — renderer, scene, camera, `world`, `movables`, and `state` (all shared mutable state). `textures.js`, `materials.js` (`M`), `lighting.js`, `post.js`, `pathtracer.js`, `primitives.js` (`B` box, `RB` rounded box, `C`, `S`, `lathe`, `tube`…)
- `ui/` — `walk.js` (walk mode: look, keys, stick, teleport, `window.__walk` test hook), `editor.js` (select, fields, drag with snapping, add/duplicate/delete, wall move, undo/redo, export/import, change summary, per-device persistence), `style.js` (finishes, presets), `dims.js` (labels computed from the plan), `panels.js` (Plan notes + checks), `toolbar.js`, `views.js`
- Random details (leaves, drapes, garments, books) are seeded per item id, so editing one item never changes another.

## Working rules
- Never change a room's wall coordinates without being asked — they come from the measured plan.
- After every visual change: run `tools/shot.py` for the affected views and LOOK at the PNGs before reporting.
- Keep clearances honest: aisles ≥ 0.60, door swings free, report any value below standard.
- One change per commit; commit message states the dimension changed.
