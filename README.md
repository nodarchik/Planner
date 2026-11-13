# Palace 1 — apartment 3D model
Start with `CLAUDE.md` (context) and `PLAN.md` (work plan).

```
npm install
npm run dev      # app
npm run check    # lint + build
```
Original single-file app: `legacy/palace-apartment.html`.

## Local setup
- Prerequisites: Node 20+ and `npm install`; Python 3 venv (`python3 -m venv .venv && source .venv/bin/activate && pip install playwright pillow numpy && playwright install chromium`); Vercel CLI (`npm i -g vercel`, then `vercel link` once).
- `.env.local` (gitignored, copy from `.env.example`): `ANTHROPIC_API_KEY` (needed by the assistant); optional `CHAT_PASSWORD`.
- `npm run dev` — app only, http://localhost:5173 (no assistant).
- `npm run dev:full` — app + assistant API with `.env.local` loaded, http://127.0.0.1:3000 (`tools/dev-full.sh`; stops with a clear message if `.env.local` or `vercel` is missing).
- `npm run check` — lint + validate + build.
- Screenshots / stills: `npm run build && npm run preview`, then in another shell `SHOT_GPU=1 npm run shots` and `SHOT_GPU=1 npm run stills`.
