# Palace 1 — refactor and realism plan

Goal: the same apartment, (1) changeable by editing data instead of code, (2) editable in the page, (3) visibly more realistic. Baseline: `legacy/palace-apartment.html` (artifact version 22). Read `CLAUDE.md` first.

## Status

| Phase | State | Notes |
|---|---|---|
| 0 Setup | done | |
| 1 Delete dead layouts | done | |
| 2 Modules | done | |
| 3 Plan as data | done | `src/plan/palace1.json`; matched baseline within noise before random details became per-item |
| 4 Checks | done | Plan notes panel + `npm run validate`; current plan: 0 errors, 2 warnings (basin–WC front clearance 0.64, balcony door clearance 0.37; real findings, not fixed) |
| 5 Editor | done | 20 functional checks in `tools/editor_test.py`; openings move by typed value, not by drag; not tried on a phone |
| 6 Models + materials | done except owner files | 13 Poly Haven models, scanned normal/roughness maps, 2 mm cabinet bevels, brass pulls (`src/furniture/pulls.js`). Skipped: KTX2 (UASTC normals 8.3 MB vs 2.4 MB WebP, ETC1S blocky, plus a transcoder: the download would grow), so WebP stays. Missing: sanitaryware, appliances, sofa, bed models (no fitting CC0 source, need manufacturer files) |
| 7 Lighting + detail | done except details | Sun from site + `meta.north`, sky, lamps in lumens, Photo render (lens, DOF, 8 bounces, exposure per mood), 15 path-traced stills in `renders/` (96 samples, 143 MB, gitignored; wc, corridor, closet are from before the day white-balance fix, hall also from before the closet change: re-render with `SHOT_GPU=1 python3 tools/stills.py http://localhost:4173/ renders --samples 96 --views wc,corridor,hall,closet`; bed1 stills show dark patches on the bed frame, cause not found), shadow refresh on change + fitted frustum. Skipped: cascaded shadows (not needed after the fit), OIDN denoise (stills are 96 samples, grain is visible at 100 %). Missing: sockets, AC units, radiators |
| 8 Deploy | partial | Vercel project `palace1`, all deployments behind Vercel login; `npm run build:single`; in-app assistant verified with real requests through `vercel dev`; `npm run dev:full` local setup. Missing: production on `main`, shared edit storage |
| 9 Measured reality | not started | needs site measurements |


Rules for every phase:
- The app must load and look correct at the end of each phase. No phase leaves the model broken.
- Visual check after each step: `python3 tools/shot.py <target> top,hall,bed1,bed2,bath,wc,corridor,closet,kitchen,living,office,loggiaE` and compare against `baseline/` (created in Phase 0).
- Commit per step. Do not start a phase before the previous phase's acceptance list passes.

---

## Phase 0 — Project setup (½ day)

1. Vite + vanilla ES modules project (no framework). `three@0.160.0`, `three-mesh-bvh@0.7.6`, `three-gpu-pathtracer@0.0.23` from npm instead of the CDN import map.
2. Move the legacy file's `<style>` to `src/style.css`, markup to `index.html`, the module script unchanged to `src/legacy.js`. App must run identically via `npm run dev`.
3. Capture `baseline/*.png` for all 12 views with `tools/shot.py` (day mode) + `top:night`.
4. Add `npm run shots` and `npm run check` (lint + build).

Acceptance: `npm run dev` shows the Soft classic layout identical to the artifact; 13 baseline images committed.

## Phase 1 — Delete dead weight (½ day)

1. Remove layouts `studio`, `swap`, open A–E (`open1…`), office F–J (`off1…off5`), their `ARCH.*` wall sets, `ROOM_SIZES` entries, kitchen variants (`oTvEast`, `k_*` builders) and any helper used only by them.
2. Remove the Layouts panel's switcher; keep its info content (why / metrics / clearances) as a single "Plan notes" panel.
3. Remove the base (pre-layout) furniture that `soft.hideIf` hides — build only what is visible. Delete `hideIf`, `ZONE`, `layoutBuilt` bookkeeping.
4. Remove `localStorage` keys tied to other layouts; bump the storage key.

Acceptance: screenshots match baseline; `src/` under ~1,500 lines; no reference to removed layout ids (`grep`).

## Phase 2 — Split into modules (1 day)

```
src/
  main.js            boot, renderer, post-processing, render loop
  materials.js       makeSet/SETS/texFor, M (material table), style presets
  primitives.js      add, B, RB, C, S, lathe, tube, pillow, merged, beginG/endG
  arch/              walls.js (wallX/wallY, openings, glazing), soft.js (panels, arches, bullnose, trays), doors.js, skirting.js
  furniture/         bed.js, sofa.js, tables.js, chairs.js, storage.js (cab, wardrobe, closet), bath.js, kitchen.js, decor.js, plants.js
  catalog.js         DESIGNS / makeTyped registry
  plan/              (Phase 3)
  ui/                toolbar.js, views.js, dims.js, editor.js, panels.js
  pathtracer.js      photo render
```

No behaviour change. Globals (`CUR`, `world`, `movables`, `M`) become explicit exports of one `scene.js` module.

Acceptance: screenshots match baseline; no file over 400 lines; no implicit globals.

## Phase 3 — Plan as data (2–3 days) — the core change

Everything specific to this apartment moves into `src/plan/palace1.json` (validated by a JSON Schema in `src/plan/schema.json`).

```jsonc
{
  "meta": { "name": "Palace 1", "ceiling": 2.80, "north": 0 },
  "rooms": [
    { "id": "bed1", "name": "Bedroom 1", "poly": [[0,0],[4.59,0],[4.59,3.98],[0,3.98]],
      "floor": "chevronOak", "ceiling": { "type": "tray", "border": 0.30, "radius": 0.40 } }
  ],
  "walls": [
    { "id": "w-bed1-west", "from": [0,0], "to": [0,7.13], "t": 0.25, "exterior": true,
      "openings": [ { "type": "window", "at": 1.63, "w": 1.20, "sill": 0.90, "head": 2.30 },
                    { "type": "balconyDoor", "at": 2.84, "w": 0.77 } ],
      "finish": { "east": { "panels": true } } }
  ],
  "items": [
    { "id": "bed-b1", "type": "bed", "room": "bed1", "anchor": { "wall": "w-b1-closet", "side": "west", "offset": 1.62 },
      "size": [1.60, 2.00], "variant": "tufted", "materials": { "accent": "velvetTerra" } },
    { "id": "wardrobe-b2", "type": "wardrobe", "room": "bed2", "along": { "wall": "w-b2-south", "from": 2.95, "to": 5.06 },
      "depth": 0.60, "height": 2.60, "doors": 4, "front": "lacquerCream" },
    { "id": "closet-b1", "type": "walkInCloset", "room": "closet1", "unitDepth": 0.30,
      "sides": { "east": ["long","double","long"], "north": ["hang+shoes"], "west": ["shelves:0.25"] } }
  ],
  "views": { "bed1": { "cam": [3.05,1.6,3.55], "target": [0.3,0.9,2.4] } }
}
```

Steps:
1. **Walls + openings** from data → replaces `ARCH.softStudio` wall/door/window calls. Room sizes and areas (Dims) computed from `rooms[].poly`, not hand-typed strings.
2. **Finishes** (panels, skirting, arches, bullnose corners, trays) derived from wall/room properties. Panels automatically skip openings and items flagged `"coversWall": true` (wardrobes, towers) — no more hand-written gap lists.
3. **Parametric built-ins** — one function each, all dimensions as parameters: `wardrobe`, `walkInCloset`, `laundryTower`, `vanity(basins)`, `showerEnclosure(orientation, doors)`, `kitchenRun`, `builtInDesk`, `tvWall`.
4. **Placement by anchor**: items are positioned relative to a wall (`along` / `anchor` + offset) or absolutely (`pos`, `rot`). Moving a wall moves what is attached to it.
5. **Free furniture** (`bed`, `sofa`, `table`, `chair`…) through the existing catalog with `pos`, `rot`, `size`, `variant`.
6. Port room by room; after each room compare screenshots. Delete the corresponding block from `LAYOUTS.soft.build()` when its room matches.
7. `npm run validate` — schema check + geometric checks (Phase 4).

Acceptance: `LAYOUTS` and all hard-coded coordinates are gone from `src/` (only `palace1.json` holds numbers); screenshots match baseline within tolerance; each of these is a one-value JSON edit and verified as such: closet unit depth 0.30→0.35, corridor wardrobe width, bed rotation 90°, guest shower orientation, vanity 2→1 basins.

## Phase 4 — Automatic checks (1 day)

`src/plan/checks.js`, run in the page (warnings panel + red highlight) and in CI (`npm run validate`):
- item/item and item/wall overlap (2D footprint, with height bands)
- walkway width between any two obstacles < 0.60 m (0.80 on main routes: entrance → every room door)
- door swing arcs intersecting items; balcony doors blocked
- clearance in front of: WC 0.60, basin 0.70, wardrobe doors = door leaf width, bed sides 0.50, desk chair 0.80, washer 0.90
- closet rule from the owner: any unit in a walk-in closet deeper than 0.30 → error
- Output: list of `{severity, item, value, required}`; "Plan notes" panel shows it instead of the hand-written clearance table.

Acceptance: current plan produces a known, reviewed list; deliberately breaking a rule in JSON is reported.

## Phase 5 — In-page editor (2–3 days)

1. Select → side panel with numeric fields: x, y, rotation, width, depth, height, variant, material. Typing updates live.
2. Drag with snapping: to walls (back flush), to other items, to a 5 cm grid; rotate in 90° steps (free with a modifier key).
3. Add from catalog, duplicate, delete.
4. Walls: drag a partition along its normal; drag an opening along its wall; attached items follow.
5. Undo/redo (command stack), reset-to-published.
6. Export / import plan JSON; "copy change summary" button producing a short diff ("wardrobe-b2: to 5.06 → 4.60") to paste to Claude.
7. Mobile: bottom sheet editor, large hit targets, pinch/drag unchanged.
8. Persistence: plan diff in `localStorage`; shared persistence comes with deployment (Phase 8).

Acceptance: every change requested in the last 10 owner messages can be done in the editor without code (closet depth, bed rotation, shower orientation, wardrobe width, moving the dining table).

## Phase 6 — Real models and materials (3–4 days)

1. `public/assets/` pipeline: GLB (Draco + KTX2/Basis textures), `GLTFLoader` with a loading manager and progressive loading (procedural placeholder → model).
2. Replace primitives with models, in order of visual payoff: sofa, bed + bedding, dining + bar chairs, armchairs, sanitaryware (WC, basins, tub, taps, shower set), washer/dryer, kitchen appliances, lamps, plants, decor. Sources: Poly Haven (CC0), ambientCG (CC0), manufacturer GLB/3D files for the exact products the owner intends to buy. Record source + licence in `assets/CREDITS.md`.
3. Catalog entry = `{ model, footprint, anchors, materialSlots }` so models stay swappable and scalable to the plan's `size`.
4. Scanned PBR sets (1–2K, KTX2) for: oak chevron, travertine, micro-cement, plaster wall, bouclé, linen, velvet, brass, lacquer. Keep the procedural sets as fallback.
5. Built-ins stay parametric geometry (wardrobes, closets, kitchen) but get: 2 mm edge bevels, real handle models, shadow gaps, plinths.
6. Budget: initial download ≤ 25 MB, ≤ 1.5 M triangles, 60 fps on a recent phone in the default view (LOD or simplified meshes on mobile).

Acceptance: side-by-side with baseline shows models in all rooms; mobile still interactive; credits file complete.

## Phase 7 — Lighting and detail (2–3 days)

1. HDRI sky (Poly Haven, 2K for lighting / 8K backdrop) + sun direction from `meta.north`, date and time slider (Tbilisi 41.7° N). Owner must supply the building's orientation.
2. Real-time: PMREM environment, cascaded sun shadows, light probes or baked lightmaps per room for bounce light, SSAO/GTAO tuned, SSR on floors optional, ACES/AgX tone mapping, slight bloom on luminaires.
3. Night mode: per-fixture lights with physically plausible lumen values, LED coves as area lights (RectAreaLight + emissive).
4. Path tracer ("Photo render"): env-map importance sampling, denoise (OIDN web build if size allows), 2–4K export, camera with real focal length + DOF.
5. Detail pass from data (`rooms[].fittings`): sockets, switches, door handles and hinges, AC indoor units, radiators, curtains with folds (cloth mesh), window frames/handles, thresholds, ceiling spots, books/clutter sets per room type.
6. Outside: balcony railing detail, neighbouring-building backdrop or the HDRI skyline.

Acceptance: 12 path-traced stills at 2K in `renders/` (not committed: too large); owner review.

## Phase 8 — Deploy and share (½ day)

1. Vercel project (owner's account is connected), preview deployment per branch, production on `main`.
2. Plan persistence: `palace1.json` in the repo is the published state; editor changes stored per-device and exportable; optional shared state (Vercel KV/Blob) with a simple edit token so phone and desktop see the same edits.
3. Optional single-file build (`vite-plugin-singlefile`, assets inlined, ≤ 16 MB, reduced models) to republish as the Claude artifact.

Acceptance: production URL loads on phone and desktop; an edit saved on one device appears on the other (if shared state is enabled).

## Phase 9 — Measured reality (ongoing, needs the owner)

Inputs required from site: ceiling height per room, beam and riser positions, sill and head heights of every window, real wall thicknesses, door leaf sizes and swing directions, radiator and AC positions, socket positions, building orientation. Enter into `palace1.json`; checks from Phase 4 re-run automatically. Replace generic items with the exact products chosen (dimensions from the manufacturer).

Needs the owner:
- Site measurements (Phase 9, list above).
- Manufacturer 3D files for sanitaryware, appliances, sofa and bed.
- Shared edit storage (phone and desktop seeing the same edits): decision and a Vercel KV/Blob store.
- Compass bearing for `meta.north` (352 is an estimate from a map screenshot).

---

## Order and effort

| Phase | Depends on | Effort |
|---|---|---|
| 0 Setup | — | ½ d |
| 1 Delete dead layouts | 0 | ½ d |
| 2 Modules | 1 | 1 d |
| 3 Plan as data | 2 | 2–3 d |
| 4 Checks | 3 | 1 d |
| 5 Editor | 3 | 2–3 d |
| 6 Models + materials | 2 (3 preferred) | 3–4 d |
| 7 Lighting + detail | 6 | 2–3 d |
| 8 Deploy | 0 (any time) | ½ d |
| 9 Measured reality | 3 | ongoing |

Phases 0–3 are mandatory before anything else. 8 can be done right after 0 to get a live URL early.

## Risks
- **Visual regressions during the port** → baseline screenshots per room, port one room at a time.
- **Asset weight on mobile** → KTX2 + Draco, LODs, budget in Phase 6.
- **Path tracer + GLB materials** → some material features (clearcoat, transmission) differ; verify per material.
- **Over-generalising the schema** → model exactly this apartment; add fields only when a real request needs them.

## First prompt for the Claude Code session

> Read CLAUDE.md and PLAN.md. Execute Phase 0 and Phase 1 of PLAN.md. Capture the baseline screenshots before deleting anything, compare after, and commit per step. Report only what changed and any screenshot differences.
