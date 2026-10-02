import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The client load path, against a real server.
 *
 * Written because three separate bugs made the app unusable and none of them could
 * be caught by the tests that existed:
 *
 *   1. `txRes.clone()` was called after the body had been read. That throws, and the
 *      throw was swallowed by a `catch` that only logged -- so `summary` stayed
 *      null and the dashboard sat on "Initializing the desk" indefinitely.
 *   2. `category_breakdown` was typed as a flat array while the endpoint returned an
 *      object, so a view called `.map` on it and the app unmounted.
 *   3. Ledger rows were returned exactly as stored, without `provenance`, so the
 *      dashboard and the review desk both threw on `undefined.source` after an
 *      upload. That is the "most screens stop working once I upload" report.
 *
 * All three were invisible to a typecheck, invisible to the server test suite, and
 * invisible to the PRODUCT.md metrics, which are all server-side. This exercises the
 * loader and the row mapping over real HTTP against a real database.
 *
 * `loadAllData` lives in `src/lib/dataLoader.ts` specifically so this file can reach
 * it; while the logic was inside the `App` component none of it was testable.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

/** A free port, so parallel runs cannot collide. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      srv.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kothay-load-'));

let server: ChildProcess;


// No server module is imported here. `db/client` asserts DATABASE_URL at load time,
// and the test process has none: the spawned server owns its own database. Importing
// the loader is enough, and it has no server-side dependencies.
const { loadAllData } = await import('../src/lib/dataLoader.ts');

let accounts = 0;

/** POSTs with the origin header the server's CSRF guard requires. */
function post(url: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(url, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

function get(url: string, cookie: string): Promise<Response> {
  return fetch(url, { headers: { Cookie: cookie } });
}

async function register(): Promise<string> {
  const email = `load-${++accounts}-${Date.now()}@example.com`;
  const res = await post(`${BASE}/v1/auth/register`, '', { email, password: 'Correct-Horse-9' });
  assert.equal(res.status, 201, `register failed: ${await res.text()}`);
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'no session cookie');
  return cookie;
}

/**
 * A statement whose totals are known, so the loader's output can be checked against
 * a hand sum rather than merely being non-null.
 */
const STATEMENT = [
  '01/09/2026 Credit Salary 85,000.00',
  '01/09/2026 250.00 Foodpanda',
  '02/09/2026 1,250.50 Chaldal',
  '03/09/2026 450.00 Pathao',
  '04/09/2026 4,500.00 Shwapno',
  '05/09/2026 1,200.00 Daraz',
  '06/09/2026 640.00 DESCO',
  '07/09/2026 780.00 Grameenphone',
  '08/09/2026 320.00 Bikroy',
  '09/09/2026 2,100.00 Apex',
  'Total Debit: 11,490.50',
].join('\n');

async function upload(cookie: string): Promise<void> {
  const res = await post(`${BASE}/v1/uploads`, cookie, {
    filename: 'sep.csv',
    content: STATEMENT,
    mime_type: 'text/csv',
  });
  assert.equal(res.status, 200, `upload failed: ${await res.text()}`);
  // The pipeline runs detached; wait for it rather than racing it.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const status = await get(`${BASE}/v1/transactions`, cookie);
    const payload = await status.json();
    if ((payload.total ?? 0) > 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the upload never produced rows');
}

describe('the client load path', () => {
  before(async () => {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(),
      // Its own process group, so the whole tree can be killed. `npx tsx` forks a
      // child; killing only the wrapper orphans the real server and the run hangs.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        APP_URL: BASE,
        DATABASE_URL: `file:${path.join(dir, 'load.db')}`,
        DISABLE_HMR: 'true',
        // No model key: the deterministic path must carry the whole flow.
        GEMINI_API_KEY: '',
      },
    });

    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('server did not become healthy in time');
  });

  after(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        server.kill('SIGKILL');
      }
    }
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* cleanup is best-effort on Windows */ }
  });

  test('loads an empty account without throwing', async () => {
    const cookie = await register();
    // Seed the session cookie for the module-level fetch the loader performs.
    const data = await loadAllDataWithCookie(cookie);

    assert.deepEqual(data.failed, [], 'a fresh account must not report a failure');
    // The endpoint answers `insufficient_data`. That must arrive as a summary with
    // `has_data: false`, not as null: a null summary is indistinguishable from a
    // request still in flight, which left the dashboard loading forever.
    assert.ok(data.summary, 'an empty account still needs a summary');
    assert.equal(data.summary!.has_data, false, 'an empty account must be marked as such');
    assert.equal(data.summary!.count, 0);
    assert.deepEqual(data.transactions, []);
    assert.ok(data.categories.length > 0, 'categories are reference data and always load');
  });

  test('loads a populated account with totals that match a hand sum', async () => {
    const cookie = await register();
    await upload(cookie);

    const data = await loadAllDataWithCookie(cookie);

    assert.deepEqual(data.failed, [], `load reported: ${data.failed.join(', ')}`);
    assert.ok(data.summary, 'the summary must be assembled');
    assert.equal(data.summary!.total_income, 85000, 'the salary line is the only income');

    const expectedExpenses = 11490.5;
    assert.equal(data.summary!.total_expenses, expectedExpenses, 'expenses must match the hand sum');
    assert.equal(data.summary!.count, 10, 'nine expenses plus the salary');

    // The statement footer must not have become a transaction.
    const footers = data.transactions.filter((t) => t.amount === 52000 || t.merchant_name === 'Total');
    assert.deepEqual(footers, [], 'a statement total must never be filed as a transaction');
  });

  test('every transaction satisfies the contract the views read', async () => {
    // This is the assertion that was missing. Views read `provenance.source`,
    // `category_source`, `currency`, `description`, `evidence_ids`, and `status`;
    // a row missing any of them crashed a screen after an upload.
    const cookie = await register();
    await upload(cookie);

    const { transactions } = await loadAllDataWithCookie(cookie);
    assert.ok(transactions.length > 0, 'there is something to check');

    for (const tx of transactions) {
      assert.equal(typeof tx.provenance, 'object', `${tx.id}: provenance missing`);
      assert.ok(tx.provenance && typeof tx.provenance.source === 'string', `${tx.id}: no provenance.source`);

      // An EXTRACTED row must carry a real confidence, and a row with no stored
      // confidence must not claim one.
      if (tx.provenance.source === 'EXTRACTED') {
        assert.equal(typeof tx.provenance.extraction_confidence, 'number', `${tx.id}: EXTRACTED without confidence`);
        assert.ok(
          tx.provenance.extraction_confidence >= 0 && tx.provenance.extraction_confidence <= 1,
          `${tx.id}: confidence out of range`,
        );
      }

      assert.ok(['MERCHANT_RULE', 'USER_CORRECTION', 'UNCATEGORIZED'].includes(tx.category_source), `${tx.id}: bad category_source`);
      assert.equal(tx.currency, 'BDT');
      assert.equal(typeof tx.description, 'string');
      assert.ok(Array.isArray(tx.evidence_ids), `${tx.id}: evidence_ids must be an array`);
      assert.ok(typeof tx.status === 'string' && tx.status.length > 0, `${tx.id}: no status`);
      assert.ok(!Number.isNaN(tx.amount) && tx.amount > 0, `${tx.id}: bad amount`);
      assert.match(tx.transaction_date, /^\d{4}-\d{2}-\d{2}$/, `${tx.id}: bad date`);
    }
  });

  test('an extracted row carries evidence, since evidence is mandatory', async () => {
    const cookie = await register();
    await upload(cookie);

    const { transactions } = await loadAllDataWithCookie(cookie);
    const uncited = transactions.filter(
      (t) => t.provenance.source !== 'USER_ASSERTED' && t.evidence_ids.length === 0,
    );
    assert.deepEqual(
      uncited.map((t) => t.id),
      [],
      'an extracted row with no evidence breaks the claim -> calculation -> evidence chain',
    );
  });

  test('a failed endpoint is reported instead of looking like an empty account', async () => {
    // The difference between "nothing here yet" and "we could not reach the server".
    const unreachable = 'http://127.0.0.1:1';
    const data = await loadAllData(unreachable);
    assert.ok(data.failed.includes('network'), `expected a network failure, got ${data.failed.join(', ')}`);
  });
});

/**
 * Runs the loader with a session cookie.
 *
 * `fetch` in Node sends no cookie without one being attached, so the cookie is
 * installed on the global fetch for the duration of the call. Restored afterwards,
 * so the tests cannot leak credentials into each other.
 */
async function loadAllDataWithCookie(cookie: string) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Cookie', cookie);
    return original(input as string, { ...init, headers });
  }) as typeof fetch;
  try {
    // The base URL must be passed: in the browser a relative path resolves against
    // the page origin, and in Node there is no origin, so `/v1/dashboard` throws.
    return await loadAllData(BASE);
  } finally {
    globalThis.fetch = original;
  }
}