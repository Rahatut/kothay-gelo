# Quickstart — spec 001 foundation-authority

**Created**: 2026-10-01 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Runnable validation scenarios proving this feature works. Full implementation
belongs in `tasks.md`.

## Prerequisites

```bash
cd /home/rahatut/Desktop/Projects/kothay-gelo
npm install --legacy-peer-deps     # esbuild peer conflict, see plan.md
```

`--legacy-peer-deps` is required today: `esbuild@^0.25.0` conflicts with Vite 8's
peer-optional `esbuild@^0.27 || ^0.28`. This is pre-existing and unresolved.

Environment:

```bash
export DATABASE_URL="file:./.data/dev.db"     # local dev
export APP_URL="http://localhost:3000"
export SESSION_SECRET=""                       # not required; sessions are opaque
# export DATABASE_URL="libsql://...?"         # production
# export DATABASE_AUTH_TOKEN="..."            # production only
export GEMINI_API_KEY=""                       # optional; app degrades gracefully
```

**Before starting**: verify that the AI Studio deploy path permits neither a
mounted volume nor a sidecar. If it does permit a volume, the storage decision
changes — see `research.md` Q1 and Risks.

## Scenario 1 — Engine correctness with no database and no model

Proves Principle X: the financial engine is verifiable in isolation.

```bash
npm test
```

Expected: the engine suite passes with no database and no `GEMINI_API_KEY`.

```bash
GEMINI_API_KEY="" npm test
```

Expected: still passes. This must not change the result.

## Scenario 2 — The eight metrics become measurable

For the first time, `PRODUCT.md`'s pass/fail gates can be evaluated.

```bash
npm run test:metrics
```

Expected output, one line per metric with PASS or FAIL and the measured value:

```text
1  row accuracy, 3 fixtures          PASS  97.4%  (>= 95%)
2  clue totals vs hand computation   PASS
3  drill-down sums equal headline    PASS
6  shaming language, 20 samples      PASS  0 hits
9  cross-identity access, all routes PASS  0 leaks
10 figures match engine values       PASS
```

Metrics 4, 5, 7, and 8 require a browser and are reported as `NOT MEASURED`
here rather than silently omitted.

## Scenario 3 — Two accounts cannot see each other

Proves Principle III and metric 9.

```bash
npm run dev &
```

```bash
A=$(curl -s -X POST localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' -c /tmp/a.jar \
  -d '{"email":"a@example.com","password":"correct-horse-battery"}')

B=$(curl -s -X POST localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' -c /tmp/b.jar \
  -d '{"email":"b@example.com","password":"correct-horse-battery"}')
```

Seed account A only:

```bash
curl -s -X POST localhost:3000/v1/dataset/load-golden -b /tmp/a.jar
TX=$(curl -s localhost:3000/v1/transactions -b /tmp/a.jar | grep -o 'txn_[a-z0-9]*' | head -1)
```

Expected: `txn_...` found.

Account B attempts to read it:

```bash
curl -s -i localhost:3000/v1/transactions/$TX -b /tmp/b.jar
```

Expected: **404**, and byte-identical to a request for an identifier that does
not exist:

```bash
curl -s -i localhost:3000/v1/transactions/txn_does_not_exist -b /tmp/b.jar
```

Repeat across all five routes that currently perform no ownership check:
`/v1/uploads/:id/status`, `/v1/processing/:job_id`, `/v1/evidence/:id`,
`/v1/insights/:id/feedback`, and insight narration.

Confirm each refusal was recorded:

```bash
curl -s localhost:3000/v1/settings/audit -b /tmp/b.jar | grep OWNERSHIP_REFUSED
```

## Scenario 4 — Unauthenticated access is refused everywhere

```bash
for r in /v1/dashboard /v1/transactions /v1/insights /v1/goals /v1/uploads; do
  printf "%-20s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000$r)"
done
```

Expected: `401` on every line.

## Scenario 5 — Sign-out invalidates immediately

```bash
curl -s -X POST localhost:3000/v1/auth/logout -b /tmp/a.jar
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/v1/transactions -b /tmp/a.jar
```

Expected: `401`. Reusing the old cookie must fail — this is the behaviour a
stateless token could not provide.

## Scenario 6 — Records survive a restart

Proves the persistence decision.

```bash
COUNT_BEFORE=$(curl -s localhost:3000/v1/transactions -b /tmp/a.jar | grep -c 'txn_')
pkill -f "tsx server.ts"
npm run dev &
sleep 4
curl -s localhost:3000/v1/transactions -b /tmp/a.jar | grep -c 'txn_'
```

Expected: the count is unchanged. Today's build loses everything here.

## Scenario 7 — No fabricated defaults survive

```bash
grep -rn '?? 12\||| 12\|confidence = 0.92\|0.9\|\* 12\|\* 3\|/ 6' server/ src/ --include=*.ts --include=*.tsx
```

Expected: no financial-fabrication hits. Comments explaining *why* a figure is
absent are fine and expected.

```bash
grep -rn "'2026-09'\|\"2026-09\"\|'2026-08'" server/
```

Expected: no hits. The hardcoded comparison months are gone.

## Scenario 8 — Upload still reaches a clue within budget

```bash
curl -s -X POST localhost:3000/v1/dataset/load-golden -b /tmp/a.jar > /dev/null
```

Then upload a fixture and poll, measuring wall time:

```bash
time (curl -s -X POST localhost:3000/v1/uploads -b /tmp/a.jar \
  -H 'Content-Type: application/json' \
  -d "{\"filename\":\"fixture.csv\",\"mime_type\":\"text/csv\",\"content\":$(cat tests/fixtures/ground-truth/fixture-bkash.csv | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
  && poll_until_complete)
```

Expected: completion in **under 20 s** including the 2.8 s of artificial delay
removed from `server/pipeline.ts`.

## Scenario 9 — Sample data is labelled, not disguised

```bash
curl -s -X POST localhost:3000/v1/dataset/load-golden -b /tmp/a.jar | python3 -m json.tool | grep is_sample_data
```

Expected: `"is_sample_data": true`.

Expected behaviour: a brand-new account sees an empty state with an explicit
offer to load sample data — never 24 transactions that look like the user's own.

## Scenario 10 — Bengali parity

```bash
curl -s -X POST localhost:3000/v1/capabilities/category_breakdown \
  -b /tmp/a.jar -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -d '{"params":{"period":{"start":"2026-09-01","end":"2026-09-30"},"locale":"bn"}}'
```

Expected: every category name present in the English response also has a
non-empty Bengali counterpart.

## Scenario 11 — Production build

```bash
npm run lint && npm run build && npm run start
curl -s localhost:3000/api/health
```

Expected: typecheck clean, build succeeds, health returns `{"status":"ok"}`.
The `scrypt` call MUST pass an explicit `maxmem`; without it it throws
`error:030000AC` at the default parameters.

## What each scenario proves

| Scenario | Requirement |
|---|---|
| 1 | Principle X — engine testable without database or model |
| 2 | FR-021, and metric measurability for the first time |
| 3 | FR-003, FR-004, SC-001, SC-009 |
| 4 | FR-002 |
| 5 | FR-005, SC-010 |
| 6 | FR-016, SC-009, decision D2-A |
| 7 | FR-010, SC-003 |
| 8 | SC-006, decision to remove the artificial delay |
| 9 | FR-017 and `PRODUCT.md` ledger item 10 |
| 10 | FR-022 |
| 11 | Build integrity |
