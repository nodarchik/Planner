# Palace 1 apartment — 3D model

Interactive, photoreal-leaning 3D model of one real apartment ("Palace 1", Tbilisi; plan PDF 107.3 m², owner counts 130 m² total with balconies). The owner iterates on layout and furniture by plain-language requests ("make the closet 1.30 m", "rotate the bed to face the balcony"). Every request must be answerable by a small, safe edit.

## Current state
- Vite + vanilla ES modules. `index.html` (markup), `src/style.css`, `src/legacy.js` (the whole app, 1,531 lines; three 0.160 + three-gpu-pathtracer from npm, everything procedural, no external assets). Only the Soft classic plan exists in code.
- `legacy/palace-apartment.html` — the original single-file app (2,626 lines, Claude artifact version 22). Reference only; do not edit.
- `PLAN.md` — the refactor + realism plan. Phases 0 and 1 are done; next is Phase 2 (split into modules).
- `baseline/*.png` — 13 reference screenshots (12 views day + `top_night`) of the unmodified app.
- `tools/shot.py` — headless screenshots (Playwright + SwiftShader, ~45 s per view); `tools/diff.py` — compares two screenshot folders.

## Commands
- `npm run dev` — dev server. `npm run check` — lint + build. `npm run preview` — serve `dist/` on :4173.
- `npm run shots` — 13 screenshots of the preview server into `shots/`; `npm run shots:diff` — compare `shots/` with `baseline/` (fails above 0.5 % differing pixels).
- Python needs `pip install playwright pillow numpy`; Chromium is taken from `CHROME_PATH` or `/opt/pw-browsers/chromium`.

## Owner preferences
- Replies: blunt, short, no filler, no questions, no offers. State what changed and stop.
- Only the **Soft classic** layout matters (`LAYOUTS.soft`, walls `softStudio`). All other layouts (studio, swap, open A–E, office F–J) are dead and get deleted in Phase 1.
- Design language: greige walls (#E9DDCC), picture-frame mouldings + chair rail, light-oak chevron floor, rounded-shoulder arches, fluted rounded corners, coffered ceilings with LED cove, brass, travertine, cream lacquer, bouclé.
- Dimensions are in metres, shown to 2 decimals. Walk-in closet units: 0.30 m deep maximum.

## Coordinate system
Plan coordinates `(x, y)` in metres, x → east, y → south, origin at the NW interior corner of bedroom 1. three.js mapping: plan x → world X, plan y → world Z, height → world Y. Ceiling height `H` = 2.80.

| Room | x | y | Notes |
|---|---|---|---|
| Bedroom 1 | 0–4.59 | 0–3.98 | door on east wall y 3.05–3.85; west wall: window y 1.63–2.83, balcony door y 2.84–3.61 |
| B1 walk-in closet | 3.29–4.59 | 0–2.95 | partition x 3.19–3.29; arched entry in wall y 2.95–3.05 (opening x 3.32–4.0); sliding door |
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
- **Bedroom 1**: bed 1.60 × 2.00, headboard on the closet partition (x 3.19), faces west to the balcony; nightstands (2.95, 0.44) and (2.95, 2.80); beauty table x 0.6–1.7 on the south wall + 0.40 m organiser x 1.72–2.12 (3 drawers, 2 open shelves, h 1.27).
- **B1 closet**: east unit x 4.29–4.59, north unit y 0.02–0.32, west shelves x 3.29–3.54; face-out hanging; aisle 0.75.
- **Bedroom 2**: bed headboard on south wall (cx 1.55); hinged wardrobe x 2.95–5.06, y 6.53–7.13, h 2.60; desk at (2.9, 4.43) on the north wall.
- **Bathroom**: tub x 4.69–5.44, y 0.48–2.18; walk-in shower x 6.29–7.07, y 0–1.45; WC x 5.70–6.06 on the shaft; double vanity x 6.62–7.065, y 1.50–2.75.
- **Corridor**: washer + dryer tower y 2.89–3.60 and wardrobe y 3.60–4.38, both x 6.43–7.07.
- **Hall**: stone console, plaster artwork, brass sconce on the east wall. No wardrobe (it blocked the entrance).
- **Studio**: corner kitchen NW + bar x 8.86–9.35, y 0.2–1.95 with 3 stools; sofa 2.70 (chaise R) at (12.2, 0.47); rect coffee table (12.65, 1.6); dining table (9.9, 3.87) against the partition; TV wall on the south partition x 11.05–13.55.
- **Office**: built-in desk x 10.88–13.62, y 6.45–7.13, 2 chairs.
- **Guest shower room**: shower strip x 7.06–7.86 full depth, glass wall along x 7.86 with a door at each end; WC on south wall x 8.18–8.54; basin on east wall y 7.75–8.20.
- **East balcony**: sofa x 13.92–14.72, y 0.15–1.75; dining for 4 at (14.85, 3.6); herb garden y 6.72–7.05; 2 lounge chairs at y 6.0.

## Code map (line numbers in `src/legacy.js`)
- 54 `makeSet`, 76 `SETS`, 162 `texFor` — procedural PBR texture sets
- 324–405 geometry helpers: `beginG/endG` (named movable groups), `add`, `B` box, `RB` rounded box, `C` cylinder, `S` sphere, `lathe`, `tube`, `pillow`, `merged`
- 430 `door`, 442 `skirt`, 447 `buildArchitecture` (shell, exterior walls, fixed partitions, doors, skirting, ceiling), 598 `cab` (cabinet run with shadow gaps), 668 `bed`
- 512 `ARCH.softStudio` — studio/office/closet partitions, arches, mouldings, ceilings; 551–590 `softPanels`, `softArch`, `softBullnose`, `softTray`
- 722 `buildFurniture` — bedroom 2 bed group, curtains, west balcony, general lamps
- 781 `ROOM_SIZES`, 784 `roomSizes`, 789 `zoneLabels` — Dims labels
- 841 `VIEWS` — camera presets `[[camX, camH, camY], [targetX, targetH, targetY]]`
- 1113 `DESIGNS`, 1234 `makeTyped`, 1257 `typed` — swappable furniture designs (sofa, coffee, dining, chair, desk, armchair…)
- 1259 `LAYOUTS.soft` — plan notes (why / metrics / clearances), labels, and `build()` with all other Soft-classic furniture
- 1470 `applyLayout` (runs once at start-up), 1485 `renderPlanNotes`
- The seeded generator `rand()` drives textures, plants, hanging garments and books. Adding or removing a `rand()` consumer changes everything built after it; keep the order or expect screenshot differences.

## Working rules
- Never change a room's wall coordinates without being asked — they come from the measured plan.
- After every visual change: run `tools/shot.py` for the affected views and LOOK at the PNGs before reporting.
- Keep clearances honest: aisles ≥ 0.60, door swings free, report any value below standard.
- One change per commit; commit message states the dimension changed.
