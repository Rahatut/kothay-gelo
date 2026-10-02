# Phase 0 Research — spec 001 foundation-authority

**Created**: 2026-10-01
**For**: `spec.md` (foundation-authority)
**Runtime verified**: Node 22.22.1 local, `@types/node` 22.20.4
**Bundle verified**: `dist/server.cjs` performs exactly four runtime `require`s —
`express`, `@google/genai`, `path`, `vite`

---

## Q1. Relational store

> **SUPERSEDED 2026-10-01 — see [adr-002-supabase.md](./adr-002-supabase.md).**
> The product owner has chosen Supabase (Postgres) as the production store. The
> analysis below was correct about the durability problem and remains the reason
> a local SQLite file was rejected, but the recommended destination is now
> Supabase rather than libSQL/Turso. The SQLite-specific inventory that migration
> will need is recorded in the ADR.

**Decision**: libSQL / Turso remote via `@libsql/client` (0.18.0). `file:` URL
in development, `libsql://` in production. One SQLite dialect, one query layer,
no container to run, no volume mount.

**Rationale**

The decisive constraint is Cloud Run, not the driver.

1. **No local-file SQLite can satisfy SC-009.** Cloud Run offers three volume
   types and none is durable: in-memory RAM (dies with the instance),
   ephemeral disk (gen2 only, per-instance, also dies with the instance), and
   Cloud Storage FUSE (object storage with no POSIX locking, which corrupts
   SQLite). A user's ledger would vanish on every cold start.
2. **AI Studio publish gives no control over the service spec.** No
   `--add-volume`, no sidecar, no VPC connector. The "mount a volume" escape
   hatch is not reachable from this deployment path.
3. **Multi-instance splits data silently.** Two instances holding two SQLite
   files produce divergent data with no error. Scale-to-zero plus scale-out
   makes this routine rather than theoretical.
4. libSQL needs no infrastructure from us — no VM, no container, no pooler, no
   VPC. Authentication is a URL plus a token in existing AI Studio secrets, the
   same mechanism already used for `GEMINI_API_KEY`.
5. Constitution fit: `financialEngine.ts` remains pure functions over
   `Transaction[]`. Only the repository layer becomes `async`, so Principle X
   survives intact.

**Alternatives considered**

| Option | Rejected because |
|---|---|
| `better-sqlite3` 13.0.3 | Fails durability identically — local file, ephemeral FS. Its sync API also blocks the event loop during concurrent uploads on a 1–2 vCPU instance. In fairness it bundles cleanly and ships prebuilds, so it fails on durability, not packaging |
| `node:sqlite` | Same durability failure, plus Stability 1.1 experimental in Node 22. Keep as a possible *test-fixture* engine, never the product store |
| `pg` 8.23.1 | Right at scale, wrong shape here. Requires a second managed service the AI Studio deploy path cannot provision, a separate async pool, and a different SQL dialect that locks every migration. Moves query construction toward the app layer where it competes with the deterministic engine |

**`--packages=external` implication, verified**: dependencies are not bundled;
esbuild emits runtime `require()` calls, so it never parses or breaks a native
`.node` binary. The requirement is that `node_modules` with a platform-correct
prebuild exists in the runtime image — which the build already depends on, since
prod `require`s `vite`. `@libsql/client`'s Node entry pulls a native binding
(`@libsql/linux-x64-gnu`); its `./http` subpath is pure JavaScript if that ever
becomes an issue.

---

## Q2. Password authentication without an SMS provider

**Decision**: `node:crypto` `scrypt`. Opaque random session token in an httpOnly
cookie. `Origin` check plus SameSite for CSRF. No self-serve password reset.

**Rationale — hashing**

scrypt is memory-hard, ships in the standard library, and adds zero
dependencies, zero native compilation, and zero bundle risk. Argon2id is the
better primitive, but buying it costs a native module, a prebuild matrix, and an
ABI surface on a container image not under our control.

**Verified cost caveat**: `scryptSync` at N=32768, r=8, p=1 exceeds Node's
default 32 MB `maxmem` and throws `error:030000AC`. Any chosen N MUST pass
`maxmem` explicitly. N=2^15 (32 MB) at roughly 70 ms per hash is the right point
for a 512 MB–1 GB instance. Because the memory-hard cost is paid per concurrent
login, verifications MUST be capped by a small in-process semaphore — otherwise
parallel sign-ins are a memory-exhaustion vector.

**Rationale — session token**

32 random bytes from `crypto.randomBytes`, stored server-side as a SHA-256 hash.
Cookie is `httpOnly`, `secure`, `sameSite=lax`, `path=/`, no `domain`. Idle
expiry plus absolute expiry; rotate on sign-in.

**JWT rejected decisively**: a JWT cannot be revoked without a server-side
denylist, which is a session table wearing a hat. FR-005 and SC-010 require
immediate invalidation on sign-out and delete-account, and an audit log already
exists. An opaque token is strictly less machinery.

**CSRF**

Primary control: reject any state-changing request whose `Origin` does not match
`APP_URL`. The SPA is served by the same Express process, so nothing legitimate
is cross-origin. Secondary: `SameSite=Lax`. `csurf` rejected as unmaintained;
double-submit rejected as a second cookie to keep in sync for zero gain when
`Origin` is directly checkable.

**Password reset without an email provider — the honest minimum**

Ship no self-serve reset, and say so plainly in the interface rather than
pretending. Provide one ops-only path: a `server/scripts/reset-password.ts` run
locally against the production database with credentials from the environment —
audited, no network surface. Delete-then-register also works and loses nothing
but password history.

**Explicitly deferred**: reset email, email verification, magic links, MFA/TOTP,
recovery codes, password rotation policy, breached-password checks. All require
an email or authenticator provider. Adding one is a scope amendment, not a task.

**Alternatives**: bcrypt rejected — not memory-hard, 72-byte truncation, and
still a native module, with no advantage at any point on this curve.

---

## Q3. Migration strategy

**Decision**: hand-rolled numbered `.sql` runner. Approximately 60 lines, using
`PRAGMA user_version` as the version store, one transaction per file, numeric
filename ordering. No dependency.

**Rationale**

The entire problem is "apply unapplied files in order, once". `user_version` is
an integer SQLite maintains natively, verified working. That is the whole state
store required. A migration framework earns its keep across multiple dialects,
multiple environments, seeding strategies, and down-migrations — none of which
exist in a single-developer, single-dialect, single-database project.

**Schema and seed must be split — this is a hard rule**

Migrations own **schema only**, never demo rows. A migration that inserts a user
is a migration that eventually has to be un-inserted. Extract
`MemoryDatabase.seedInitialData()` from `server/db.ts:47` into `server/seed.ts`,
made idempotent with `INSERT ... ON CONFLICT DO NOTHING` on fixed identifiers,
invoked only when `DEMO_SEED=1` or via the existing `/v1/dataset/load-golden`
route. Migrations run unconditionally at boot; seed does not.

DDL must additionally be written so that re-running is safe even before
versioning is fully wired, since D1-B replaces the store with no production data
to migrate.

**Alternatives**: `umzug` 3.8.3 rejected as ESM-first and designed to sit under
knex or sequelize — a dependency plus a config file to solve a problem
`user_version` already solves in one line. `knex` 3.3.0 rejected **on principle,
not capability**: it is a query builder, and adopting it pulls SQL construction
into route and service code where it competes with `financialEngine.ts` as the
place numbers are produced — a direct threat to Principle I and Principle VIII.
`node-sqlite3-migrator` does not exist on npm (404, verified).

**Dialect lock, accepted deliberately**: migrations are SQLite-dialect. A
PostgreSQL move later means rewriting migration files.

---

## Q4. Test runner

**Decision**: `node:test` driven by `tsx`. Add script:
`node --import tsx --test "server/**/*.test.ts"`.

**Rationale**

Verified working on this repository, including the `@/*` path alias and
TypeScript types: `roundMoney(1.005) === 1.01` passes through
`@/server/financialEngine`.

**Verified failure of the bare alternative**: `node --test a.test.ts` throws
`ERR_UNKNOWN_FILE_EXTENSION` on this machine. The cause is that `/usr/bin/node`
is a Debian build with amaro stripped
(`process.features.typescript === false`). Type stripping is default in upstream
22.18+, but not in every Node 22 build. So `tsx` as an explicit loader is not
optional here — it is the reason the command works, and it keeps the choice
portable across build variance.

`tsx` is already the dev entrypoint, so this is one TypeScript pipeline, one
transform, one set of resolution rules shared with dev. Assertions and reporting
come from `node:assert/strict` and built-in TAP. No config file.

Coverage is available via `node --test --experimental-test-coverage`.
Threshold enforcement needs a small check script — a known gap, not a reason to
pick a different runner.

**Alternatives**: `vitest` 5.0.3 rejected — ESM-only, needs a config file, and
brings a second Vite-based transform alongside tsx. Its peer dependencies happen
to be satisfiable today against Vite 8.3.0, which is exactly what makes it a
tempting default and why it needs an explicit rejection. It is the right answer
for React component tests with jsdom; this project has no component tests and its
constitutional target is the engine, not the DOM. `jest` rejected — babel/ts-jest
config, CJS assumptions fighting `"type":"module"`, slowest of the three, and it
re-implements assertions and reporting that ship in Node.

**Coverage against the 8 `PRODUCT.md` acceptance metrics**: metrics 1, 2, 3, 6,
9, and 10 are directly testable against `financialEngine.ts` plus
`server/goldenDataset.ts` with no browser and no model. Metrics 4, 5, 7, and 8
need Playwright later and must not block this choice.

---

## Q5. Removing the artificial pipeline delay

**Decision**: delete the sleep. Keep polling. Move the minimum visible duration
to the client.

**Correction to the audit**: `server/pipeline.ts` has **7** `updateStage` call
sites — lines 71, 77, 89, 98, 99, 156, and 168 — not 8. At 400 ms each the
added floor is **2.8 s**, not 3.2 s. The earlier audit figure was wrong.

**Rationale**

Once stages complete in microseconds, a 600 ms poll will observe one or two
transitions and the state machine will appear to teleport. The dwell belongs in
the view, not the server: a client-side stage queue holding each stage for a
minimum of roughly 120–150 ms before advancing. Perceived smoothness for zero
server latency and zero budget cost.

Polling already exists and works (`UploadView.tsx:203`: 600 ms interval, 30
attempts, an 18 s ceiling). No new transport required.

Add per-stage duration to the audit event **before** deleting the sleep. Nobody
currently knows the real cost of `EXTRACTING` because the sleep hides it.
Measure first, then tune.

**Alternatives**: Server-Sent Events rejected — eight discrete events over a
sub-two-second job. SSE earns its cost with many small updates on a long-lived
stream; this is neither. It would also require connection lifecycle and
reconnect logic in the client, authentication on a long-lived connection, a
request occupying a Cloud Run instance for its full duration, and proxy
buffering behaviour to reason about. SSE becomes correct only if extraction
becomes a genuinely long-running streaming operation, which is not the current
design. If a future stage runs beyond three seconds, the honest fix is real
progress reporting inside that stage, not a transport change.

**Second finding**: after Q6, `EXTRACTING` does real CPU work and narration does
a real network call. Those become the honest long poles, so the state machine
should display elapsed time per stage.

---

## Q6. PDF text extraction

**Decision**: `unpdf` (1.8.1). `extractText` for the model payload,
`extractTextItems` for evidence coordinates.

**Rationale — verified on this machine, not from documentation**

- `engines: node>=22`, ships both `import` and `require` exports. `require` from
  CJS works — the three API functions load.
- Extracted real text from a generated PDF:
  `{"totalPages":1,"text":["Daraz 450.00 2026-01-05"]}`.
- **Coordinates confirmed**, which was the deciding requirement:
  `extractTextItems` returned `{str, x, y, width, height, fontSize, fontFamily,
  dir, hasEOL}` per page — everything `BoundingBox` in `src/types.ts` needs.
- 2.5 MB installed, **zero runtime dependencies** — it inlines its own
  serverless PDF.js build with the worker embedded. No `pdfjs-dist` install, no
  worker file to ship, no canvas.
- Its CJS entry internally uses `await import("unpdf/pdfjs")`, which works from a
  CJS bundle. Bundling is a non-issue: with `--packages=external`, unpdf is
  `require`d from `node_modules` at runtime exactly like express.
- Its optional `pdfjs-dist` lookup for standard fonts sits in a `try`/`catch` and
  degrades silently; extraction was verified working without it.

**Alternatives**: `pdf-parse` 2.4.5 rejected — pulls `pdfjs-dist@5.4.296` **and**
`@napi-rs/canvas@0.1.80`, a native module with its own prebuild matrix, for
strictly less capability; its 1.x line additionally probes the filesystem for a
test PDF, a well-known serverless footgun; and it offers no coordinates.
`pdfjs-dist` 6.3.289 rejected on API surface, not compatibility — its
`engines: node>=22.13` is satisfied, but you must hand-pick
`legacy/build/pdf.mjs`, configure the worker, wire `cMapUrl` and
`standardFontDataUrl`, and assemble the item array yourself. unpdf is that
wiring, preconfigured. `pdf2json` 4.1.0 rejected on a hard version exclusion —
`engines: node>=22.23.2` against a local runtime of 22.22.1 — plus XML output
and an unmaintained lineage.

**Follow-on work this creates**

- The browser must stop using `File.text()` on PDFs (`UploadView.tsx:174`) and
  send bytes. Base64-over-JSON works short-term; `multipart/form-data` is the
  correct transport. Type and size validation moves to the route boundary.
- PDF.js coordinates are **bottom-left origin in PDF units**. `BoundingBox` needs
  page height, a Y flip, and unit normalisation. Get this wrong and every
  evidence highlight lands mirrored.
- Untrusted-input caps: bound `numPages` and set `maxImageSize`. unpdf's
  serverless build parses on the event loop with no worker, so long PDFs need a
  timeout race. A decompression bomb in an uploaded PDF is a real availability
  risk.
- Scanned PDFs yield no text. `PRODUCT.md` rejects OCR, so the failure path must
  be a plain message plus a next step.

---

## Risks to verify before implementation

1. **AI Studio publish surface.** The storage decision assumes no volume mounts
   and no VPC connector are available. If the deployment path does permit a
   mounted volume, Q1 must be reopened. This is the single assumption the whole
   plan rests on, and it must be verified before the repository layer is
   written.
2. **SQLite dialect lock.** Q1 plus Q3 lock migrations to SQLite. Accepted
   deliberately.
3. **Node build variance.** The local `/usr/bin/node` lacks amaro, so nothing
   should rely on native type stripping. `tsx` as an explicit loader is the
   portable answer.
4. **Cost and credential provisioning.** libSQL adds an external service
   dependency with a token in AI Studio secrets. If no token is available, the
   fallback is a local `file:` SQLite database, which is acceptable for
   development and **fails SC-009 in production**. This must be resolved before
   the plan is considered complete, not during implementation.
