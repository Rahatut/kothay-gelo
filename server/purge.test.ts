import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';

/**
 * The purge must actually erase.
 *
 * `POST /v1/settings/reset` deleted rows from the in-memory maps and answered
 * `{"success":true}`. Every read path queries the relational store, so nothing it
 * touched was ever read back. Confirmed against a running server: the route
 * reported success and left 25 transactions and ৳27,528 of expenses in place.
 *
 * A privacy control that says "your data is gone" while the data survives is worse
 * than no control at all, because the user stops looking. So this checks the
 * ledger after the purge by reading it back through the same endpoints the UI uses,
 * and it checks that a second account is untouched.
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
const dir = mkdtempSync(path.join(tmpdir(), 'kothay-purge-'));
let server: ChildProcess;

const STATEMENT = [
  '01/09/2026 Credit Salary 85,000.00',
  '01/09/2026 250.00 Foodpanda',
  '02/09/2026 1,250.50 Chaldal',
  '03/09/2026 450.00 Pathao',
  '04/09/2026 4,500.00 Shwapno',
  '05/09/2026 1,200.00 Daraz',
  'Total Debit: 7,650.50',
].join('\n');

interface Account {
  cookie: string;
  read(path: string): Promise<any>;
  call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>;
}

async function makeAccount(): Promise<Account> {
  let cookie = '';
  const email = `purge-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const reg = await fetch(`${BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ email, password: 'Correct-Horse-9' }),
  });
  const setCookies = (reg.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'registration must set a session');

  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  return {
    cookie,
    call,
    read: async (p: string) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json(),
  };
}

async function upload(account: Account): Promise<void> {
  const res = await account.call('POST', '/v1/uploads', {
    filename: 'sep.csv',
    content: STATEMENT,
    mime_type: 'text/csv',
  });
  assert.equal(res.status, 200, `upload failed: ${JSON.stringify(res.body)}`);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { total } = await account.read('/v1/transactions');
    if ((total ?? 0) > 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the upload never produced rows');
}

async function ledgerSize(account: Account): Promise<number> {
  return (await account.read('/v1/transactions')).total ?? 0;
}

async function dashboardExpenses(account: Account): Promise<number> {
  const body = await account.read('/v1/dashboard');
  return body?.data?.summary?.total_expenses ?? 0;
}

describe('purging tenant data', () => {
  before(async () => {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        APP_URL: BASE,
        DATABASE_URL: `file:${path.join(dir, 'purge.db')}`,
        DISABLE_HMR: 'true',
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

  test('a purge removes the rows it reported removing', async () => {
    const account = await makeAccount();
    await upload(account);
    const goals = await account.call('POST', '/v1/goals', {
      title: 'Emergency buffer',
      target_amount: 150000,
      target_date: '2027-03-31',
    });
    assert.equal(goals.status, 200, `goal creation failed: ${JSON.stringify(goals.body)}`);
    // The goal must be countable through the same path the purge uses. It was
    // written only to the in-memory map, so the purge confirmation reported zero
    // savings targets while one existed.
    const preview = await account.read('/v1/settings/purge-preview');
    assert.equal(
      (preview.data as Record<string, number>)['savings targets'],
      1,
      'the purge preview cannot see the goal that was just created',
    );

    const before = await ledgerSize(account);
    const expensesBefore = await dashboardExpenses(account);
    assert.ok(before > 0, 'there is something to purge');
    assert.ok(expensesBefore > 0, 'the dashboard has figures to purge');

    const purge = await account.call('POST', '/v1/settings/reset');
    assert.equal(purge.status, 200, `purge failed: ${JSON.stringify(purge.body)}`);
    assert.equal(purge.body.success, true);

    // The whole point. Read the ledger back through the same endpoint the UI uses.
    assert.equal(await ledgerSize(account), 0, 'transactions survived the purge');
    assert.equal(await dashboardExpenses(account), 0, 'dashboard figures survived the purge');

    const documents = await account.read('/v1/uploads');
    assert.equal((documents.data ?? []).length, 0, 'statements survived the purge');

    const goalsLeft = await account.read('/v1/goals');
    assert.equal((goalsLeft.data ?? []).length, 0, 'savings targets survived the purge');
    const previewAfter = await account.read('/v1/settings/purge-preview');
    assert.equal(
      (previewAfter.data as Record<string, number>)['savings targets'],
      0,
      'the purge reported success while a savings target was still stored',
    );

    const insights = await account.read('/v1/insights');
    assert.equal((insights.data ?? []).length, 0, 'calculated leaks survived the purge');
  });

  test('the response reports what was removed, and nothing remains', async () => {
    const account = await makeAccount();
    await upload(account);

    const purge = await account.call('POST', '/v1/settings/reset');
    const purged = purge.body.purged as Record<string, number>;

    assert.ok(purged, 'the purge must report what it removed');
    assert.ok(purged.transactions > 0, `expected removed transactions, got ${JSON.stringify(purged)}`);
    assert.equal(purge.body.total_removed, Object.values(purged).reduce((a, b) => a + b, 0));

    // Every reported count is what was counted before the delete.
    const preview = await account.read('/v1/settings/purge-preview');
    for (const [label, n] of Object.entries((preview.data ?? {}) as Record<string, number>)) {
      assert.equal(n, 0, `${label} still present after the purge`);
    }
  });

  test('the account survives its own purge and can be used again', async () => {
    const account = await makeAccount();
    await upload(account);
    await account.call('POST', '/v1/settings/reset');

    // A purge is not a deletion. The user keeps their account and can upload again.
    await upload(account);
    assert.ok((await ledgerSize(account)) > 0, 'the account could not be used after purging');
  });

  test('purging one account leaves another untouched', async () => {
    const alice = await makeAccount();
    const bob = await makeAccount();
    await upload(alice);
    await upload(bob);

    const bobBefore = await ledgerSize(bob);
    const bobExpensesBefore = await dashboardExpenses(bob);
    assert.ok(bobBefore > 0, "bob has rows to protect");

    await alice.call('POST', '/v1/settings/reset');

    assert.equal(await ledgerSize(alice), 0, "alice's ledger should be empty");
    assert.equal(await ledgerSize(bob), bobBefore, "bob's ledger was altered by alice's purge");
    assert.equal(
      await dashboardExpenses(bob),
      bobExpensesBefore,
      "bob's totals were altered by alice's purge",
    );
  });

  test('a purge with nothing to remove says so rather than claiming success blindly', async () => {
    const account = await makeAccount();
    const purge = await account.call('POST', '/v1/settings/reset');

    assert.equal(purge.status, 200);
    assert.equal(purge.body.total_removed, 0);
    assert.match(purge.body.message, /nothing stored/i);
  });
});
