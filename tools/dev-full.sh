#!/bin/sh
# App + assistant API on http://127.0.0.1:3000 (vercel dev with .env.local loaded; values are never printed)
cd "$(dirname "$0")/.." || exit 1
[ -f .env.local ] || { echo "dev:full: .env.local is missing. Copy .env.example to .env.local and set ANTHROPIC_API_KEY." >&2; exit 1; }
command -v vercel >/dev/null 2>&1 || { echo "dev:full: the Vercel CLI is missing. Install it (npm i -g vercel), then run: vercel link" >&2; exit 1; }
set -a; . ./.env.local; set +a
exec vercel dev --listen 127.0.0.1:3000
