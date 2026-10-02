# AGENTS.md — Kothay Gelo?

Runtime development guidance for coding agents working in this repository.
Product definition lives in `PRODUCT.md`. Visual authority lives in `DESIGN.md`.
Hard rules live in `.specify/memory/constitution.md`.

## 1. What this project is

`Kothay Gelo?` (কোথায় গেল?) — "Where did it go?" — a money-leak detector for
Bangladesh. A user uploads a bKash statement PDF; the system extracts
transactions, categorizes them, runs deterministic detectors, and surfaces one
ranked insight card with a potential-savings line.

Target loop time is 20 seconds from upload to clue. 4 weeks, 1 developer,
scope is the only variable.

| Layer | Stack |
|---|---|
| Server | Express 4, TypeScript, run through `tsx` (dev) / bundled to CJS (prod) |
| Client | React 19, Vite 8, Tailwind CSS 4 via `@tailwindcss/vite` |
| LLM | `@google/genai` (`GEMINI_API_KEY`), used only for extraction and narration phrasing |
| Storage | SQLite via libSQL today. **Supabase/Postgres is the decided destination** — see `specs/001-foundation-authority/adr-002-supabase.md`. The in-memory `MemoryDatabase` is being retired |
| Icons | `lucide-react` |
| Motion | `motion` (v12) |
| Path alias | `@/*` → repo root (`tsconfig.json` + `vite.config.ts`) |
| Hosting | Google AI Studio applet; `dist/` served by `server.ts` in prod |

Tests run on the Node built-in runner (`node --test`) via `tsx`. No Jest, no
Vitest, no Playwright. `npm run lint` is `tsc --noEmit` — typecheck only.

## 2. Authority order

When two artifacts disagree, the higher one wins and you must report the
conflict before continuing.

1. `.specify/memory/constitution.md` — ten ratified principles, MVP scope
   discipline, quality gates. Supersedes all later artifacts and all agent
   assumptions.
2. `PRODUCT.md` — persona, job-to-be-done, acceptance metrics, will-not-build
   ledger.
3. `DESIGN.md` — colors, typography, layout, component rules.
4. `AGENTS.md` — this file: how to build, verify, and delegate.
5. Feature specs under `specs/<feature>/` (`spec.md`, `plan.md`, `tasks.md`).

Amendments to the constitution require a file edit, a semantic version bump, an
updated Sync Impact Report, and re-evaluation of existing specs.

## 3. Commands

```bash
npm run dev       # tsx server.ts — Express + Vite middleware, HMR, port 3000
npm run build     # vite build, then esbuild server.ts → dist/server.cjs
npm run start     # node dist/server.cjs — serves dist/ statically
npm run preview   # vite preview
npm run clean     # rm -rf dist server.js
npm run lint      # tsc --noEmit (typecheck)
npm test          # node --import tsx --test "server/**/*.test.ts"
npm run test:metrics  # PRODUCT.md acceptance metrics only
```

`DISABLE_HMR=true` turns off Vite HMR and file watching. AI Studio sets it
during agent edits; do not remove that guard in `vite.config.ts`.

Run `npm run lint` and `npm test` before declaring any task done. There is still
no CI, so neither runs unless you run them.

**Three suites matter more than the rest**, because they catch the defects that
have actually shipped:

```
server/screens.test.ts     every view renders against payloads captured from a live server
server/clientLoad.test.ts  the client load path over real HTTP, against a real database
server/purge.test.ts       a purge that reports success must actually erase
```

A typecheck cannot see any of the bugs that broke this application. Each of those
suites exists because a defect reached the browser that `tsc`, the server suite,
and the metrics all passed through. If you change anything a view reads, change
one of these suites too.

Environment: `DATABASE_URL` (required — the server refuses to boot without it),
`APP_URL` (required, used for Origin checking), `GEMINI_API_KEY` (optional; the
app degrades to the deterministic parser and deterministic narration when it is
absent), `DATABASE_AUTH_TOKEN` and `DEMO_SEED` (optional). See `.env.example`.
Never commit `.env*`; `.gitignore` blocks both `.env*` and the SQLite files under
`data/` and `.data/`.

**Do not introduce further SQLite-specific SQL.** Supabase/Postgres is the target,
so `PRAGMA`, `INSERT OR IGNORE`, `RAISE(ABORT)`, and `json_valid()` do not belong
in new migrations. The inventory of what already needs converting is in
`specs/001-foundation-authority/adr-002-supabase.md`.

**Every route that reads financial data reads the relational store, not `db.*`.**
Four separate defects shipped from reading one store and writing the other: uploads
reported success and stored nothing visible, the purge erased nothing, goals
vanished on restart, and the data export shipped a null profile. `db.*` is a
legacy in-memory map with a shrinking surface. If you add a read, read the
repository.

## 4. Repository layout

```
index.html            Shell, font preconnects, body theme classes
server.ts             Express app: all /v1 routes, Vite dev middleware, static prod
src/
  main.tsx            React entry
  App.tsx             View router and app state
  types.ts            Shared domain types (Transaction, Insight, Evidence, ...)
  index.css           CSS custom properties + Tailwind import + font utilities
  components/         23 view/section components
server/               Backend modules, imported by server.ts
  db.ts               Legacy in-memory Maps. Still backs /v1/uploads and
                      /v1/insights; everything else reads the relational store
  financialEngine.ts  All deterministic money math
  rowParse.ts         Single-row statement parsing: dates, amounts, merchant,
                      direction. Unit-tested without a database
  uploadValidation.ts Content-based upload type and size checks
  categories.ts       DEFAULT_CATEGORIES + MERCHANT_RULES
  pipeline.ts         ProcessingPipeline state machine
  gemini.ts           Gemini extraction + narration, with fallbacks
  goldenDataset.ts    GOLDEN_SAMPLES + previous-month fixtures
  db/                 libSQL layer: client, migrations, seed, repositories
  auth/               scrypt, sessions, identity/origin guards, account routes
  capabilities/       The eight approved capabilities, registry, period rules
src/lib/              Framework-free helpers shared by the client
  dataLoader.ts       Every endpoint the app reads, in one testable function
  ids.ts              Ids that work in both runtimes, so the engine stays
                      importable from the browser
.specify/             Spec Kit: constitution, templates, scripts, workflow registry
.opencode/            Project agents, commands, skills
DESIGN.md PRODUCT.md  Product and visual authority
```

Note the layout quirk: server-side modules live in `server/` but import UI
types from `src/types.ts`. That is intentional — one domain type surface
shared by both sides. Do not fork it.

## 5. API surface

All endpoints are in `server.ts` under the `/v1` prefix, plus `/api/health`.

```
GET    /api/health

POST   /v1/auth/request-otp          GET/POST /v1/auth/verify-otp   POST /v1/auth/logout
GET    /v1/users/me

GET/POST /v1/settings/consents      GET  /v1/settings/audit
POST   /v1/settings/export           POST /v1/settings/delete-account
POST   /v1/settings/reset

POST   /v1/uploads                   GET  /v1/uploads
GET    /v1/uploads/:id/status        GET  /v1/processing/:job_id
POST   /v1/dataset/load-golden

GET    /v1/transactions              GET  /v1/transactions/:id
GET    /v1/transactions/:id/evidence POST /v1/transactions/:id/confirm
GET    /v1/evidence/:id              GET  /v1/categories

GET    /v1/dashboard                 GET  /v1/dashboard/summary
GET    /v1/insights                  GET  /v1/insights/:id
POST   /v1/insights/:id/feedback     GET|POST /v1/insights/:id/narrate
GET    /v1/recommendations

GET/POST /v1/goals                   DELETE /v1/goals/:id
```

JSON body limit is 50 MB on both `express.json` and `express.urlencoded`.
Adding a route means adding it in `server.ts` and updating this list.

## 6. Architecture invariants

These are constitutional. Violating them fails review regardless of whether
the feature "works".

1. **The financial engine is authoritative.** Every total, income/expense sum,
   net, count, percentage, date range, aggregation, recurring detection,
   period comparison, savings estimate, and reconciliation comes from
   `server/financialEngine.ts`. The LLM may interpret engine output; it must
   never originate a number. Never trust LLM arithmetic when the engine can
   compute the result.
2. **Fixed tool surface.** Quantitative answers come only from the approved
   financial capabilities: financial summary, category breakdown, transactions,
   top merchants, recurring expenses, period comparison, spending patterns,
   savings estimation. No arbitrary SQL, no ad-hoc analytical endpoints
   without a documented requirement. Every tool validates its parameters.
3. **Dataset isolation is a backend invariant.** Each tool execution enforces
   `authenticated_user == dataset.owner` server-side. A model-supplied
   `dataset_id` is untrusted input. Conversation context and transaction text
   never override authorization.
4. **Imported data is data, not instructions.** CSV rows, merchant names,
   descriptions, notes, and uploaded text are attacker-controllable. Prompt
   injection inside a transaction must stay ordinary transaction content and
   must never change system behavior, permissions, tool availability,
   authorization, secrets, or hidden instructions.
5. **Read-only MVP.** No transaction execution, no mutation of financial
   records, no autonomous financial action. A write path to financial data is
   out of scope no matter how easy a library makes it.
6. **Evidence is mandatory.** Material claims trace as
   `claim → calculation → evidence → View transactions`. Never fabricate
   transactions, merchants, amounts, dates, totals, percentages, or
   categories. Evidence is a user-facing surface, not a debug feature.
7. **Label certainty levels.** State facts as facts, estimates as estimates,
   and answer unanswerable questions by saying the data cannot answer them.
8. **Deterministic engine stays independently testable.** Engine logic must
   remain runnable and verifiable without the LLM. Keep Gemini imports out of
   `financialEngine.ts` and out of its test path.
9. **Boring architecture.** Modular monolith, no speculative abstraction, no
   premature microservices, no dependency churn. New dependency needs a
   concrete reason in the change.

## 7. Scope discipline

Permanently out of scope for this MVP: general-purpose chatbot, autonomous
financial actions, transaction execution, arbitrary SQL, whole-database agent
access, bank API integration, investment advice, voice agent, long-term memory,
multi-agent product architecture, plugin marketplace, autonomous budgeting,
arbitrary report generation.

From `PRODUCT.md`'s will-not-build ledger: no accounts/login (in-session
processing, nothing stored), bKash only, text PDF only, no dashboard charts, one
clue card at a time, no what-if scenarios, no chat, no budgets or goals UI, no
history or return loop, and no security/privacy badges beyond what is verifiably
true.

`PRODUCT.md` success metrics are pass/fail gates, not aspirations: ≥95% row
extraction accuracy on 3 fixtures, clue totals matching hand computation, clue
tap sums equal to the headline total, ≤20 s upload-to-clue on a 100-row
statement, zero raw errors in 5 bad-file tests, zero shaming language across 20
generated clues, full path working at 375 px, and 4 of 5 first-time testers
self-explaining the result.

## 8. Design system

`DESIGN.md` is the visual authority and the code now implements it. The earlier
conflict is resolved: the paper/green neobrutalist world is gone.

**The system.** Off-white canvas `#f5f5f5`, warm near-black ink `#0c0a09`, hairline
borders, one soft drop tier (`0 4px 16px rgb(0 0 0 / 0.04)`), and pastel
atmospheric gradient orbs (mint, peach, lavender, sky, rose) as the only
chromatic moments. The ink pill is the only CTA color.

**Type.** Display is Waldenburg Light at weight 300. Waldenburg is licensed, so
the shipped stack loads **EB Garamond 300** as its sanctioned substitute and
declares `'Waldenburg'` first in the stack for licensed environments. Body,
navigation, captions, and buttons are **Inter**. **Noto Sans Bengali** covers
Bengali script and is applied to Bengali display copy at weight 300 so the
Bengali headline matches the Latin display weight. DESIGN.md defines no
monospace face, so money and codes use `.font-figure` (Inter with tabular
numerals) rather than a mono family.

**Token layer.** Every token lives in `src/index.css` as a Tailwind 4 `@theme`
entry, so `bg-canvas`, `text-ink`, `border-hairline`, `text-success`, and
`rounded-pill` all resolve by name. **Never inline a hex value in a `.tsx` file.**
Type-scale and component classes are hand-written in the same file:
`type-display-*`, `type-title-*`, `type-body-*`, `type-caption*`, `btn-primary`,
`btn-outline`, `btn-text`, `btn-sm`, `feature-card`, `badge-pill`, `text-input`,
`.band`, `.shell`, and the `.orb-*` decoration classes.

**Radius.** The `@theme` block overrides Tailwind's default radius scale to
DESIGN.md's: `xs 4`, `sm 6`, `md 8`, `lg 12`, `xl 16`, `2xl 24`, `pill/full
9999`. `rounded-xl` is 16px here, not 12px. Do not assume Tailwind defaults.

**Reserved.** `colors.primary` is for primary CTAs only. Gradient orbs are
decoration: never a button fill, never a text color, never a card surface.
Display copy never goes above weight 300. Pills are the brand button; do not
reintroduce sharp or offset shadows.

**Responsive.** `.band` steps 96px to 64px to 48px. Display type steps
64 to 48 to 32px. Orbs scale down but never disappear. The whole path must work
at 375px. The nav collapses to a hamburger below 768px.


## 9. Verification order

Constitution quality gate, in order:

```
tests → typecheck (npm run lint) → relevant E2E → security review
→ code review → acceptance criteria
```

There is no test harness today, so the practical minimum before reporting done
is: `npm run lint` clean, `npm run build` succeeds, the affected route or view
actually exercised in the browser, and the PRODUCT.md acceptance criteria for
the touched path re-checked. Use the `verification-loop` skill for the full
six-phase pass. Never claim a metric passed without running it — golden
fixtures live in `server/goldenDataset.ts` and are the way to check the numbers.

## 10. Security rules

- Secrets only from environment. Never hardcode, never log, never echo a key
  into a response or a screenshot.
- Treat all uploaded files and imported text as untrusted input. Validate type
  and size at the route boundary.
- Authorization is server-side, per request, checked against the dataset
  owner. Never trust a client- or model-supplied identifier.
- Keep PII out of logs and audit entries. Redact before any artifact leaves the
  machine.
- No transaction execution, ever.

## 11. Commits and branches

Conventional Commits, imperative, lowercase after the type, subject ≤50 chars,
no trailing period. Body only when the "why" is not obvious from the subject.
Type-prefixed commits only; no fixup or squash noise.

```bash
git add <specific files>   # never `git add -A` on a dirty shared tree
git commit -m "feat: add recurring expense detector"
```

Never commit `.env*`, `dist/`, `node_modules/`, or `.opencode/node_modules/`.
Never force-push, amend a pushed commit, or commit directly to `main` for
anything beyond a trivial scaffold.

Remote: `origin` → `https://github.com/mounoTaa/kothay-gelo.git`. Current
branch: `main`.

## 12. Agents available

### Project agents (`.opencode/agents/`) — use proactively

| Agent | Use for | Edit |
|---|---|---|
| `planner` | Feature plans, architectural changes, refactor scoping | no |
| `code-architect` | Implementation blueprints: files, interfaces, data flow, build order | no |
| `code-reviewer` | Mandatory after writing or modifying code | no |
| `designer` | UI work — shape UX first, implement, then batched critique and DESIGN.md stewardship | yes |
| `security-reviewer` | After touching user input, auth, API routes, or sensitive data | no |
| `tdd-guide` | New features, bug fixes, refactors; enforces tests-first, 80%+ coverage | yes |
| `e2e-runner` | Playwright journeys, flaky-test quarantine, artifact upload | yes |
| `build-error-resolver` | Build or type errors; minimal diffs, no architecture edits | yes |
| `doc-updater` | Codemaps, READMEs, guides; backs `/update-docs` | yes |

`code-reviewer`, `security-reviewer`, and `planner` cannot edit. They return
analysis; apply their output yourself.

### Global agents (`~/.config/opencode/agents/`) — cavecrew, token-saving

| Agent | Use for |
|---|---|
| `cavecrew-investigator` | Locate code. Returns `file:line` tables. Read-only, refuses fixes |
| `cavecrew-builder` | Surgical 1–2 file edits. Refuses 3+ files and new files |
| `cavecrew-reviewer` | Diff review, one severity-tagged line per finding |

Reach for these instead of manual searching when the scope is small and
bounded; their compressed output keeps the main context cheap. Note
`cavecrew-builder` has no `Bash` and cannot delete, commit, or push.

### Delegation rules

- Locate before you edit. `cavecrew-investigator` or `Grep` first, then `Read`
  the exact ranges.
- Every code change goes through `code-reviewer`.
- Anything touching auth, uploads, or financial data goes through
  `security-reviewer`.
- UI work starts with `designer`, not with a component edit.
- Never let a subagent expand scope. Hand it one bounded unit.

## 13. Skills available

Load with the `skill` tool. Read `SKILL.md` before acting; they are long.

**Project skills (`.opencode/skills/`, 26):**

*Design and UI* — `impeccable` (the full design lifecycle: shape, audit,
critique, animate, colorize, typeset, harden, polish, live browser iteration;
run `scripts/impeccable context` once per session first), `design-system`
(extract or audit tokens, score the UI in 10 dimensions),
`frontend-design-direction` (pick a direction before coding UI),
`make-interfaces-feel-better` (radius, optical alignment, hover/focus/empty
states), `frontend-patterns`.

*Frontend engineering* — `react-patterns` (React 19 hooks, composition,
Suspense, actions), `react-performance` (70+ rules by priority; waterfalls and
bundle size first), `react-testing` (RTL, MSW, axe, when to use Playwright
instead), `e2e-testing` (Playwright POM and CI stability), `frontend-a11y`
and `accessibility` (WCAG 2.2 AA), `ui-demo` (Playwright demo video).

*Backend and data* — `backend-patterns` (Express layers, caching, jobs),
`api-design` (REST naming, status codes, pagination, versioning),
`postgres-patterns`, `database-migrations` (expand-contract, concurrent
indexes, forward-only), `docker-patterns`, `deployment-patterns`.

*Quality and process* — `verification-loop` (six-phase PASS/FAIL report),
`tdd-workflow` (red-green-refactor, plan-file safety rules), `agentic-engineering`
(eval-first, decomposition, model routing), `python-testing`,
`security-review`, `security-scan` (AgentShield audit of agent config),
`context-budget` (audit context-window cost of agents, skills, MCP servers).

**Global skills:** `caveman` (terse response mode, seven levels),
`cavecrew` (when to delegate to the cavecrew agents), `caveman-commit`,
`caveman-review`, `caveman-compress`, `caveman-stats`, `caveman-help`, and
`no-mistakes` (`~/.agents/skills/`) — the local gate that runs
review → test → docs → lint → push → PR → CI before changes reach the remote.

`security-scan` and `context-budget` target Claude Code config paths, not this
project. Use them only when auditing agent configuration itself.

## 14. Slash commands

### Spec Kit SDD cycle (`.opencode/commands/`, speckit v1.0.13)

Feature directory is set in `.specify/feature.json`. The cycle:

```
/speckit.specify   → /speckit.clarify → /speckit.plan
                  → /speckit.tasks  → /speckit.analyze → /speckit.implement
```

Also `/speckit.checklist`, `/speckit.constitution`, `/speckit.converge`
(appends unbuilt work back into `tasks.md`), and `/speckit.taskstoissues`
(pushes tasks to GitHub issues).

Workflow registry: `.specify/workflows/workflow-registry.json`. Templates in
`.specify/templates/`. Shell helpers in `.specify/scripts/bash/`, invoked with
`sh` and a `.` separator.

### Project commands

| Command | What it does |
|---|---|
| `/plan [feature \| path.prd.md]` | Plan only. Wait for explicit CONFIRM before touching code |
| `/build-fix` | Detect the build system, fix build/type errors incrementally |
| `/code-review [pr#\|url]` | Review uncommitted changes, or a GitHub PR |
| `/react-review` | Hook correctness, render perf, boundaries, a11y, React security |
| `/react-test` | Enforce TDD for React; detects Vitest or Jest |
| `/security-scan` | AgentShield audit of agent, hook, MCP, permission, and secret surfaces |
| `/update-docs` | Sync docs from source-of-truth files |
| `/project-init` | Dry-run onboarding plan for agent configuration |

### Global commands

| Command | What |
|---|---|
| `/caveman [lite\|full\|ultra\|wenyan-*\|off]` | Terse response mode. Default level is currently `full` |
| `/caveman-commit` | Conventional Commit message for staged changes |
| `/caveman-review` | One-line severity-tagged diff findings |
| `/caveman-compress <file>` | Compress a Markdown file to caveman style; backs up to `<file>.original.md` |
| `/caveman-stats` | Session token usage, only if the runtime supplied counts |
| `/caveman-help` | Quick reference card |

Caveman mode is active at `full` and persists for the session. It compresses
chat output only — code, commits, specs, PRs, and security warnings are written
in normal English. `/caveman off` or "normal mode" ends it.

## 15. Writing conventions

- TypeScript strict-clean. `npm run lint` must pass.
- Match the existing file style: 2-space indent, single quotes, semicolons,
  trailing commas in multi-line literals. No Prettier or ESLint config exists,
  so match what is already in the file you are editing.
- Prefer editing an existing file over adding one. `server/financialEngine.ts`
  and `src/types.ts` are the two files most likely to grow wrong — read them
  fully before extending.
- No comments that restate the code. Comment the "why", the invariants, and
  the citation to a constitutional principle when one applies.
- Currency is BDT (৳ / Taka). All money goes through `roundMoney` in
  `financialEngine.ts`; never round at the call site.
- Dates are ISO `YYYY-MM-DD` strings; timestamps are ISO 8601.
- Bengali text uses the `font-bangla` utility; never assume a Latin fallback
  renders Bengali correctly.
- Imported statement direction: debit is `EXPENSE`, credit is `INCOME`.
  Unclassified rows stay uncategorized rather than being guessed.
- Gemini model order is `gemini-3.1-flash-lite` → `gemini-3.8-flash` →
  `gemini-flash-latest`, with cooldown tracking. Preserve the fallback chain.
- Never delete a constitutional principle, acceptance criterion, or evidence
  path to make a task pass. Cut scope instead.
