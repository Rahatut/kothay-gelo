# Contract: The Capability Layer

**Created**: 2026-10-01 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Constitution Principle II ratified eight approved capabilities in version 1.0.0.
They were never implemented. This is their contract, and it becomes the only
path to a financial figure.

## The eight capabilities

| Name | Answers | Primary parameters |
|---|---|---|
| `financial_summary` | How much did I spend, earn, and retain? | `period` |
| `category_breakdown` | Where did the money go, by category? | `period` |
| `transactions` | Which rows match these criteria? | `period`, `category_id`, `direction`, `search`, `limit` |
| `top_merchants` | Who received the most money? | `period`, `limit` |
| `recurring_expenses` | What repeats, and at what cost? | `period` — lands with spec 007 |
| `compare_periods` | Is this period higher or lower, and why? | `period`, `comparison_period` |
| `spending_patterns` | What recurring behaviour is detectable? | `period` |
| `savings_estimation` | What is recoverable, and how is that derived? | `period`, `pattern_id` |

No ninth capability may be added without a constitution amendment. No
analytical route may compute a figure outside this registry.

## Route-to-capability declaration

Every data route declares exactly one capability. The guard resolves identity,
validates parameters, scopes the query, and invokes the handler.

```ts
// server/capabilities/guard.ts
export interface CapabilityContext {
  accountId: string;      // server-resolved, never from the request body
  sessionId: string;
  period: Period;
}

export type CapabilityHandler<TParams, TResult> = (
  ctx: CapabilityContext,
  params: TParams,
) => Promise<TResult>;

export interface Capability<TParams, TResult> {
  name: string;
  validate: (raw: unknown) => TParams;  // throws CapabilityError, never coerces
  handler: CapabilityHandler<TParams, TResult>;
}
```

## Request contract

```http
POST /v1/capabilities/{name}
Content-Type: application/json
Cookie: kg_session=<opaque token>
Origin: https://<APP_URL>
```

```json
{ "params": { "period": { "start": "2026-09-01", "end": "2026-09-30" } } }
```

## Response contract

Success:

```json
{
  "ok": true,
  "capability": "category_breakdown",
  "params": { "period": { "start": "2026-09-01", "end": "2026-09-30" } },
  "calculation_version": "engine-1.1.0",
  "data": [ { "category_id": "cat_food", "amount": 11420, "share_pct": 26.8 } ],
  "evidence": { "transaction_ids": ["txn_...", "txn_..."] }
}
```

`evidence.transaction_ids` is present on every capability that produces a
figure. A capability that cannot supply supporting rows MUST return
`insufficient_data` rather than an empty claim.

Insufficient data is a first-class result, not an error:

```json
{
  "ok": true,
  "capability": "compare_periods",
  "status": "insufficient_data",
  "reason": "comparison_period_contains_no_transactions",
  "message": "August 2026 has no transactions, so no comparison can be computed.",
  "missing": { "period": { "start": "2026-08-01", "end": "2026-08-31" } }
}
```

Refusal:

```json
{ "ok": false, "error": "unauthenticated", "message": "Sign in to continue." }
```

## Error taxonomy

| Code | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No valid session |
| `session_expired` | 401 | Session past idle or absolute expiry |
| `forbidden_origin` | 403 | `Origin` does not match `APP_URL` on a state change |
| `not_found` | 404 | Resource absent **or** not owned — indistinguishable by design |
| `invalid_params` | 422 | Parameters failed validation |
| `unsupported_capability` | 404 | Name is not in the registry |
| `insufficient_data` | 200 with status | Data cannot answer; see above |

The `not_found` rule is the security-critical one. A cross-account request and a
nonexistent record MUST produce byte-identical responses, including the absence
of timing differences that would let an attacker enumerate identifiers.

## Authentication contract

```http
POST /v1/auth/register
{ "email": "...", "password": "..." }
```

Creates an account, opens a session, returns no credential in the body — the
session cookie is the only credential.

```http
POST /v1/auth/login
POST /v1/auth/logout
GET  /v1/auth/session
```

`logout` revokes server-side immediately. `GET /v1/auth/session` returns the
account's public profile or 401; it never returns the password hash.

**No password reset endpoint is exposed.** The absence is stated in the
interface. Recovery is either an operations script run against the production
database, or delete-account followed by re-registration. Adding an email
provider is a scope amendment, not a task.

## Period contract

```json
{ "start": "2026-09-01", "end": "2026-09-30" }
```

- `YYYY-MM-DD`, inclusive on both ends, Gregorian.
- Maximum span 5 years; exceeding it is `invalid_params`, not a silent truncation.
- The hardcoded literals `'2026-09'` and `'2026-08'` currently embedded in
  `server/db.ts` are deleted. There is no default period; a capability requiring
  one returns `invalid_params` if none is supplied.
- `Period` resolution happens server-side so the client and server can never
  disagree about which rows belong to a period.

## Client contract

The client displays figures and formats them. It does not compute them.

Forbidden in `.tsx` files, enforced in review:

| Pattern | Replacement |
|---|---|
| `amount / total * 100` | use `share_pct` from the engine |
| `Math.round(a / b)` for money | engine-computed value |
| `x * 12`, `x * 3`, `remaining / 6` | engine-computed value |
| `count \|\| 12`, `?? 12` | render absence as absence |
| `confidence * 100` | a formatted string from the API |

Nine such sites currently exist, listed in `specs/README.md`. `financialEngine.ts`
remains pure so this rule is testable: the engine suite runs with no client, no
database, and no model.

## Sample data contract

Demo rows are labelled. Every response carrying demo data includes:

```json
{ "is_sample_data": true, "sample_label": "Sample dataset" }
```

The current behaviour — seeding golden data during database construction so
every fresh start appears to hold 24 real transactions belonging to the user —
is deleted. It makes the product's own privacy claim untrue.
