import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';

/**
 * The capability layer's contract, exercised over HTTP.
 *
 * `POST /v1/capabilities/:name` is the only sanctioned path to a financial figure
 * (constitution Principle II). Everything downstream trusts that it answers in one
 * fixed shape, so the shape is asserted here rather than assumed: a consumer that
 * reads `data.total_expenses` must never meet an error object there.
 *
 * Two failure modes this is here to catch:
 *
 *   1. A capability that answers `insufficient_data` as a 4xx, or omits
 *      `calculation_version`. Callers treat a 200 as "there is an answer" and render
 *      `undefined` as a figure.
 *   2. A capability that returns a number with no `evidence.transaction_ids`. Every
 *      user-facing figure must trace to rows (Principle VI), and the ids are the only
 *      way to do it.
 */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const a = srv.address();
      srv.close(() => resolve(typeof a === 'object' && a ? a.port : 0));
    });
  });
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kothay-contract-'));
let server: ChildProcess;
let cookie = '';

const NAMES = [
  'financial_summary',
  'category_breakdown',
  'transactions',
  'top_merchants',
  'recurring_expenses',
  'compare_periods',
  'spending_patterns',
  'savings_estimation',
] as const;

function call(name: string, params: unknown, auth = true) {
  return fetch(`${BASE}/v1/capabilities/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ params }),
  });
}

const SEPT = { start: '2026-09-01', end: '2026-09-30' };

async function seedAccount(): Promise<void> {
  const reg = await fetch(`${BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ email: `contract-${Date.now()}@example.com`, password: 'Correct-Horse-9' }),
  });
  const setCookies = (reg.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'registration must set a session');

  const lines = ['01/09/2026 Credit Salary 85,000.00'];
  const merchants: [string, number][] = [
    ['Foodpanda', 520], ['Chaldal', 1850], ['Uber', 240], ['Shwapno', 3200], ['Daraz', 1450],
  ];
  let day = 1;
  for (const [name, base] of merchants) {
    for (let k = 0; k < 4; k++) {
      lines.push(`${String(day++).padStart(2, '0')}/09/2026 ${(base + k * 41).toLocaleString('en-US')}.00 ${name}`);
    }
  }
  const up = await fetch(`${BASE}/v1/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
    body: JSON.stringify({ filename: 'sep.csv', content: lines.join('\n'), mime_type: 'text/csv' }),
  });
  assert.equal(up.status, 200);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/v1/transactions`, { headers: { Cookie: cookie } });
    if (((await res.json()).total ?? 0) > 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the upload never produced rows');
}

describe('capability layer contract', () => {
  before(async () => {
    server = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        APP_URL: BASE,
        DATABASE_URL: `file:${path.join(dir, 'contract.db')}`,
        DISABLE_HMR: 'true',
        GEMINI_API_KEY: '',
      },
    });
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await seedAccount();
  });

  after(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        server.kill('SIGKILL');
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  for (const name of NAMES) {
    test(`${name} answers in the standard envelope`, async () => {
      const res = await call(name, { period: SEPT });
      assert.equal(res.status, 200, `${name} must answer 200 for a valid period`);

      const body = await res.json();
      assert.equal(body.ok, true, `${name} did not answer ok: ${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.capability, name, 'the envelope must echo which capability answered');
      assert.equal(
        body.calculation_version,
        'engine-1.1.0',
        'a figure must state which engine version produced it',
      );
      // `data` is required whenever there is an answer, and absent when there is
      // not: `insufficient_data` is a first-class result, not an error, and must not
      // carry a figure it does not have (contracts/capability-layer.md).
      if (body.status !== 'insufficient_data') {
        assert.ok('data' in body, `${name} returned no data without saying why`);
        assert.ok(body.evidence, `${name} returned no evidence block`);
        assert.ok(Array.isArray(body.evidence.transaction_ids), `${name} evidence has no transaction_ids`);
      }
    });
  }

  test('insufficient_data is a 200 with a status, not a 4xx', async () => {
    // A first upload has no previous month to compare against. Callers branch on the
    // envelope, so a 404 or 400 here would be read as a failure of the whole request.
    const res = await call('compare_periods', { period: SEPT });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'insufficient_data');
    // And it must not invent a figure while saying it cannot answer.
    assert.ok(body.data === undefined || body.data === null, 'insufficient_data must carry no figure');
  });

  test('an unknown capability is refused with its own code', async () => {
    const res = await call('not_a_capability', { period: SEPT });
    assert.ok(res.status === 404 || res.status === 400, `expected a refusal, got ${res.status}`);

    const body = await res.json();
    // The capability layer's error envelope is `{ok:false, error:'<code>', message}`
    // with the code as a string, per the contract document. The REST routes use
    // `{error:{code,message}}`; the difference is documented, not accidental.
    assert.equal(body.ok, false);
    assert.equal(body.error, 'unsupported_capability');
  });

  test('a malformed period is refused rather than clamped', async () => {
    // A clamped range returns an empty result, which renders as "you spent ৳0" --
    // a fact about the user's money rather than a bad request.
    for (const period of [
      { start: 'yesterday', end: '2026-09-30' },
      { start: '2026-09-30', end: '2026-09-01' },
      { start: '', end: '' },
    ]) {
      const res = await call('financial_summary', { period });
      assert.ok(res.status >= 400, `a malformed period must be refused, got ${res.status}`);
      const body = await res.json();
      assert.equal(body.error, 'invalid_params');
    }
  });

  test('an unauthenticated call is refused', async () => {
    const res = await call('financial_summary', { period: SEPT }, false);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'unauthenticated');
  });

  test('a capability cannot be asked about somebody else', async () => {
    // The account is resolved from the session, never from the body. A caller
    // supplying another account id must get its own data, not an error and not the
    // other tenant's figures.
    const res = await call('financial_summary', {
      period: SEPT,
      account_id: 'acct_someone_else',
      accountId: 'acct_someone_else',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.notEqual(body.params?.account_id, 'acct_someone_else', 'the body must not override identity');
  });

  test('every capability that returns figures cites rows that exist', async () => {
    // The ids must resolve, or the "view transactions" link a user follows lands on
    // nothing -- which is the whole point of citing them.
    const res = await fetch(`${BASE}/v1/transactions`, { headers: { Cookie: cookie } });
    const { data: rows } = await res.json();
    const known = new Set(rows.map((r: { id: string }) => r.id));

    for (const name of NAMES) {
      const body = await (await call(name, { period: SEPT })).json();
      if (body.status === 'insufficient_data') continue;
      for (const id of body.evidence?.transaction_ids ?? []) {
        assert.ok(known.has(id), `${name} cites ${id}, which is not in the caller's ledger`);
      }
    }
  });
});
