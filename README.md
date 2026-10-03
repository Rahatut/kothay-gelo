# Kothay Gelo? (কোথায় গেল?)

Money-leak detector for Bangladesh. Upload a bKash statement PDF → get one ranked insight card with potential savings.

## Quick Start

```bash
# Install dependencies
npm install

# Copy local env template
cp .env.example .env

# Edit .env with your keys (see Environment Variables below)
# Required: DATABASE_URL, APP_URL
# Optional: GEMINI_API_KEY

# Start dev server (Express + Vite HMR on port 3000)
npm run dev
```

Open http://localhost:3000

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite file path for dev (`file:./data/kothay-gelo.db`) |
| `APP_URL` | Yes | Base URL for Origin checks (`http://localhost:3000`) |
| `PORT` | No | Server port (default: 3000) |
| `DEMO_SEED` | No | Seed demo data on boot (`1` = yes) |
| `GEMINI_API_KEY` | No | Google AI Studio key for LLM extraction/narration |
| `GEMINI_MODEL` | No | Model override (default: `gemini-flash-lite-latest`) |
| `DATABASE_AUTH_TOKEN` | No | libSQL auth token (remote DB) |
| `SUPABASE_URL` | No | Supabase project URL (migrations) |
| `SUPABASE_SERVICE_KEY` | No | Supabase service role key |
| `SUPABASE_APP_DB_URL` | No | Pooler connection string for app DB |
| `SUPABASE_APP_DB_PASSWORD` | No | Pooler password |

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