# Kothay Gelo? (কোথায় গেল?)

Money-leak detector for Bangladesh. Upload a bKash statement PDF → get one ranked insight card with potential savings.

## Quick Start

```bash
# Install dependencies
npm install

# Copy local env template
cp .env.example .env

# Edit .env (see Environment Variables below)
# Required: DATABASE_URL, APP_URL
# Optional: GEMINI_API_KEY

# Start dev server (Express + Vite HMR on port 3000)
npm run dev
```

Open http://localhost:3000

Local dev needs no configuration beyond the two required server variables.
`VITE_API_BASE_URL` is empty by default, so the client calls the API
same-origin, and the Vite dev proxy forwards `/v1` to `DEV_API_TARGET`.

## Environment Variables

One codebase serves every environment. Local dev and production differ only
by these variables.

### Server runtime

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `file:` for dev (`file:./data/kothay-gelo.db`), `libsql://`, `https://` or `postgresql://` in production. Boot fails without it |
| `APP_URL` | Yes | Origin used for request Origin checks (`http://localhost:3000`) |
| `PORT` | No | Server port (default: 3000) |
| `ALLOWED_ORIGINS` | No | Comma-separated extra origins allowed to call the API, e.g. a GitHub Pages host |
| `DEMO_SEED` | No | Seed demo data on boot (`1` = yes) |
| `GEMINI_API_KEY` | No | Google AI Studio key for LLM extraction/narration |
| `GEMINI_MODEL` | No | Model override (default: `gemini-flash-lite-latest`) |
| `DATABASE_AUTH_TOKEN` | No | libSQL auth token (remote DB) |
| `SUPABASE_URL` | No | Supabase project URL (migrations) |
| `SUPABASE_SERVICE_KEY` | No | Supabase service role key |
| `SUPABASE_APP_DB_URL` | No | Pooler connection string for app DB |
| `SUPABASE_APP_DB_PASSWORD` | No | Pooler password |
| `SUPABASE_MIGRATION_DB_URL` | No | Pooler connection string for migrations; defaults to `SUPABASE_APP_DB_URL` |

### Build time — client

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | empty (same-origin) | API **origin only** — no trailing slash, no `/v1` suffix. The client appends `/v1`. Set it only when the API is on a different origin than the built client |
| `APP_BASE_PATH` | `/` | Base path the built client is served from. GitHub Pages project sites need `/kothay-gelo/` |
| `DEV_API_TARGET` | `http://localhost:3000` | Origin the Vite dev proxy forwards `/v1` to. Dev only |

All three are read from the process environment, the first two when
`npm run build` runs. Changing them changes only the built assets, not the
server.

**Never commit `.env`** — it's in `.gitignore`.

### Local SQLite (default)

```bash
DATABASE_URL="file:./data/kothay-gelo.db"
APP_URL="http://localhost:3000"
PORT="3000"
DEMO_SEED="1"
```

The `data/` directory is created automatically. SQLite file lives there.

### Supabase/Postgres (production target)

Uncomment and fill in the Supabase block in `.env` to run against Postgres instead of SQLite. Migrations live in `server/db/migrations-pg/`.

## Deployment

Both targets run the same `npm run build` output. They differ only in the
three build-time variables.

### Render (API and frontend on one origin)

`render.yaml` declares the blueprint, and `.env.production.example` lists
every variable the Render service needs. Express serves `dist/` statically, so
the client is built with an empty API base URL:

```
VITE_API_BASE_URL=      # empty = same-origin
APP_BASE_PATH=/
```

Set `DATABASE_URL` and `ALLOWED_ORIGINS` as `sync: false` secrets in the
Render dashboard. Build command stays `npm ci && npm run build`.

### GitHub Pages (static client, API on Render)

`.github/workflows/pages.yml` builds with the repo base path and an
origin-only API URL:

```
APP_BASE_PATH=/kothay-gelo/
VITE_API_BASE_URL=https://kothay-gelo-api.onrender.com
```

Set `ALLOWED_ORIGINS` on Render to the Pages origin
(`https://<user>.github.io`) so the browser requests pass Origin checks.

## Commands

```bash
npm run dev        # Dev server with HMR (tsx + Vite)
npm run build      # Production build (Vite + esbuild)
npm run start      # Run production build (node dist/server.cjs)
npm run preview    # Vite preview of built client
npm run clean      # Remove dist/ and server.js
npm run lint       # TypeScript typecheck (tsc --noEmit)
npm test           # Node test runner (server/**/*.test.ts)
npm run test:metrics  # PRODUCT.md acceptance metrics
```

## Project Structure

```
index.html              # Shell, font preconnects, theme classes
server.ts               # Express app: all /v1 routes, Vite dev middleware, static prod
src/                    # React 19 client
  main.tsx              # Entry
  App.tsx               # Router + app state
  types.ts              # Shared domain types
  index.css             # Tailwind 4 @theme tokens + component classes
  components/           # 23 view/section components
  lib/                  # Framework-free helpers (dataLoader, ids)
server/                 # Backend modules
  db/                   # libSQL client, migrations, seed, repositories
  financialEngine.ts    # Deterministic money math (authoritative)
  pipeline.ts           # ProcessingPipeline state machine
  gemini.ts             # Gemini extraction + narration + fallbacks
  auth/                 # scrypt sessions, identity/origin guards
  capabilities/         # 8 approved financial capabilities
specs/                  # Feature specs (spec.md, plan.md, tasks.md)
.specify/               # Spec Kit: constitution, templates, scripts
DESIGN.md               # Visual authority (colors, type, layout, components)
PRODUCT.md              # Product authority (persona, metrics, will-not-build)
AGENTS.md               # Agent guidance (this repo's conventions)
```

## Key Invariants

- **Financial engine is authoritative** — all totals, sums, percentages from `server/financialEngine.ts`
- **Fixed tool surface** — quantitative answers only from 8 approved capabilities
- **Dataset isolation** — server enforces `authenticated_user == dataset.owner`
- **Evidence mandatory** — every claim traces to `claim → calculation → evidence → View transactions`
- **Read-only MVP** — no transaction execution, no mutation of financial records
- **Deterministic engine** — independently testable without LLM

## Design System

Tokens in `src/index.css` as Tailwind 4 `@theme` entries:
- `bg-canvas` `#f5f5f5`, `text-ink` `#0c0a09`, `border-hairline`
- `rounded-pill` `9999px`, `rounded-xl` `16px`
- Display: **EB Garamond 300** (Waldenburg substitute), Body: **Inter**
- Bengali: **Noto Sans Bengali** weight 300 via `font-bangla`
- Money/codes: `.font-figure` (Inter tabular numerals)

## Verification

Before declaring work done:

```bash
npm run lint   # Typecheck must pass
npm run build  # Build must succeed
npm test       # Tests must pass
```

Three critical test suites:
- `server/screens.test.ts` — every view renders against live payloads
- `server/clientLoad.test.ts` — client load path over real HTTP + DB
- `server/purge.test.ts` — purge success = actual erase

## License

Private — internal tooling for Kothay Gelo? MVP.