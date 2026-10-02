import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';

/**
 * Spec 003 — manual transaction entry, over HTTP against a real database.
 *
 * The pure functions in `manualEntry.ts` were already covered by 82 unit tests, but
 * nothing imported that module: there was no route, no repository write, and no UI.
 * Unit coverage of an unwired module proves the arithmetic and nothing about the
 * product.
 *
 * So this exercises the whole path: validate, categorise, persist, read back, correct
 * with the prior value retained, confirm, and delete. Every assertion reads through
 * the same endpoints the interface calls, because the failure mode being guarded
 * against is precisely a write that never reaches the store the reads use.
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
const dir = mkdtempSync(path.join(tmpdir(), 'kothay-manual-'));
const dbPath = path.join(dir, 'manual.db');

let server: ChildProcess;

function spawnServer(): ChildProcess {
  return spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      APP_URL: BASE,
      DATABASE_URL: `file:${dbPath}`,
      DISABLE_HMR: 'true',
      GEMINI_API_KEY: '',
    },
  });
}

async function waitForHealth(): Promise<void> {
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
}

function kill(child: ChildProcess | undefined): void {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function makeAccount(): Promise<string> {
  const res = await fetch(`${BASE}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({
      email: `manual-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'Correct-Horse-9',
    }),
  });
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, `registration must set a session (status ${res.status}, base ${BASE})`);
  return cookie;
}

async function enter(
  cookie: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/v1/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function readLedger(cookie: string): Promise<any[]> {
  const res = await fetch(`${BASE}/v1/transactions`, { headers: { Cookie: cookie } });
  return (await res.json()).data ?? [];
}

describe('manual transaction entry', () => {
  before(async () => {
    server = spawnServer();
    await waitForHealth();
  });

  after(() => {
    kill(server);
    rmSync(dir, { recursive: true, force: true });
  });

  test('an entered transaction is persisted and readable back', async () => {
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: '৳১,২৫০.৫০',
      direction: 'EXPENSE',
      description: 'Groceries at the market',
      merchant_name: 'Chaldal',
    });

    assert.equal(created.status, 201, `entry failed: ${JSON.stringify(created.body)}`);

    const row = created.body.data;
    assert.equal(row.amount, 1250.5, 'Bangla numerals must be normalised to a number');
    assert.equal(row.status, 'USER_ENTERED');

    const ledger = await readLedger(cookie);
    assert.equal(ledger.length, 1, 'the entry did not reach the ledger');
    assert.equal(ledger[0].id, row.id);
    assert.equal(ledger[0].amount, 1250.5);
  });

  test('FR-004 and FR-005: it is user-asserted, with no confidence', async () => {
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 500,
      direction: 'EXPENSE',
      description: 'Lunch',
    });

    const row = created.body.data;
    assert.equal(row.provenance.source, 'USER_ASSERTED');
    assert.equal(
      row.provenance.extraction_confidence,
      undefined,
      'a user-asserted row must carry no extraction confidence',
    );
    assert.deepEqual(row.evidence_ids, [], 'FR-018: an entered row has no evidence');
    assert.equal(row.document_id, undefined, 'an entered row has no document');

    // And the same must be true after the round trip through the repository.
    const [stored] = await readLedger(cookie);
    assert.equal(stored.provenance.source, 'USER_ASSERTED');
    assert.equal(stored.provenance.extraction_confidence, undefined);
  });

  test('FR-002 and FR-013: the category is proposed, never asked for', async () => {
    const cookie = await makeAccount();
    const known = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 400,
      direction: 'EXPENSE',
      description: 'Order',
      merchant_name: 'Foodpanda',
    });
    assert.equal(known.body.data.category_source, 'MERCHANT_RULE', 'a known merchant should resolve by rule');
    assert.notEqual(known.body.data.category_id, 'cat_uncategorized');

    const unknown = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 400,
      direction: 'EXPENSE',
      description: 'Something with no known counterparty',
    });
    // FR-003: unrecognised stays unrecognised rather than being forced into a bucket.
    assert.equal(unknown.body.data.category_id, 'cat_uncategorized');
    assert.equal(unknown.body.data.category_source, 'UNCATEGORIZED');
  });

  test('FR-007: a bad entry is refused with a field-scoped reason', async () => {
    const cookie = await makeAccount();

    const noAmount = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 'not money',
      direction: 'EXPENSE',
      description: 'Something',
    });
    assert.equal(noAmount.status, 422);
    assert.ok(noAmount.body.error.message.length > 10, 'the reason must be a sentence');
    assert.ok(Array.isArray(noAmount.body.errors), 'errors must be field-scoped for the form');

    const badDate = await enter(cookie, {
      transaction_date: '2026-13-45',
      amount: 100,
      direction: 'EXPENSE',
      description: 'Something',
    });
    assert.equal(badDate.status, 422);

    const negative = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: -100,
      direction: 'EXPENSE',
      description: 'Something',
    });
    assert.equal(negative.status, 422);

    // Nothing rejected may have been written.
    assert.equal((await readLedger(cookie)).length, 0, 'a refused entry must leave no row');
  });

  test('FR-010: a correction retains the value it replaced', async () => {
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 500,
      direction: 'EXPENSE',
      description: 'Lunch',
    });
    const id = created.body.data.id;

    const patched = await fetch(`${BASE}/v1/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ amount: 750 }),
    });
    assert.equal(patched.status, 200, `correction failed: ${await patched.clone().text()}`);

    const body = await patched.json();
    assert.equal(body.data.amount, 750, 'the row must carry the new value');
    assert.ok(body.corrections.length > 0, 'a correction must be recorded');

    const prior = body.corrections.find((c: any) => c.field === 'amount');
    assert.ok(prior, 'the amount change must be in the trail');
    assert.equal(prior.previous_value, '500', 'the replaced value must be retained verbatim');
    assert.equal(prior.current_value, '750');

    // And it survives a fresh read. The description is asserted too: it was accepted
    // by the patch, written into the correction trail, and then silently dropped,
    // because the table has no `description` column and the code ignored it. The row
    // and its own history disagreed about what changed.
    const described = await fetch(`${BASE}/v1/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ description: 'Corrected description' }),
    });
    assert.equal(described.status, 200);
    const describedBody = await described.json();
    assert.equal(
      describedBody.data.description,
      'Corrected description',
      'the correction record claims a description the row does not hold',
    );

    const [stored] = await readLedger(cookie);
    assert.equal(stored.amount, 750, 'the correction did not persist');
    assert.equal(stored.description, 'Corrected description', 'the description did not persist');

    const history = await fetch(`${BASE}/v1/transactions/${id}/corrections`, {
      headers: { Cookie: cookie },
    });
    const trail = (await history.json()).data;
    assert.ok(trail.some((c: any) => c.previous_value === '500'), 'the trail is not readable back');
  });

  test('FR-009: a likely duplicate is flagged, not refused', async () => {
    const cookie = await makeAccount();
    const first = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: '৳400',
      direction: 'EXPENSE',
      description: 'Chaldal groceries',
      merchant_name: 'Chaldal',
    });
    assert.equal(first.status, 201);

    const second = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: '400',
      direction: 'EXPENSE',
      description: 'Chaldal groceries',
      merchant_name: 'Chaldal',
    });
    assert.equal(second.status, 201, 'a duplicate must not be refused');
    assert.ok(second.body.duplicate_flag, 'the duplicate must be flagged');

    // Both rows exist: flagging is not deduplication.
    assert.equal((await readLedger(cookie)).length, 2);
  });

  test('confirming clears the flag and persists', async () => {
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 400,
      direction: 'EXPENSE',
      description: 'Chaldal groceries',
      merchant_name: 'Chaldal',
    });
    await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 400,
      direction: 'EXPENSE',
      description: 'Chaldal groceries',
      merchant_name: 'Chaldal',
    });

    const id = created.body.data.id;
    const res = await fetch(`${BASE}/v1/transactions/${id}/confirm`, {
      method: 'POST',
      headers: { Origin: BASE, Cookie: cookie },
    });
    assert.equal(res.status, 200);

    const [stored] = (await readLedger(cookie)).filter((t: any) => t.id === id);
    assert.equal(stored.status, 'ACCEPTED', 'the confirmation did not persist');
    assert.equal(stored.is_duplicate_candidate, false, 'confirming must clear the flag');
  });

  test('FR-011: deletion removes the row and its history', async () => {
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: 900,
      direction: 'EXPENSE',
      description: 'To be removed',
    });
    const id = created.body.data.id;

    await fetch(`${BASE}/v1/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ amount: 950 }),
    });

    const del = await fetch(`${BASE}/v1/transactions/${id}`, {
      method: 'DELETE',
      headers: { Origin: BASE, Cookie: cookie },
    });
    assert.equal(del.status, 200);

    assert.equal((await readLedger(cookie)).length, 0, 'the row survived deletion');

    // The history goes with it. Keeping it would retain the user's own description
    // text after they asked for the row to be gone.
    const trail = await fetch(`${BASE}/v1/transactions/${id}/corrections`, {
      headers: { Cookie: cookie },
    });
    assert.equal(trail.status, 404, 'a deleted row must not serve its history');
  });

  test('FR-014: one account cannot touch another account row', async () => {
    const alice = await makeAccount();
    const bob = await makeAccount();

    const a = await enter(alice, {
      transaction_date: '2026-09-14',
      amount: 700,
      direction: 'EXPENSE',
      description: 'Alice entry',
    });
    const id = a.body.data.id;

    for (const [method, body] of [
      ['PATCH', JSON.stringify({ amount: 1 })],
      ['DELETE', undefined],
      ['POST', undefined],
    ] as const) {
      const res = await fetch(`${BASE}/v1/transactions/${id}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: BASE,
          Cookie: bob,
        },
        body,
      });
      assert.equal(res.status, 404, `${method} must be indistinguishable from a missing row`);
    }

    const [stillThere] = await readLedger(alice);
    assert.equal(stillThere.amount, 700, "another account must not have altered Alice's row");

    // The derived view is per-account too. Recomputing one user's insights cleared the
    // process-global insight maps, so recording a transaction silently emptied every
    // other user's leaks. Nothing caught it: each test made a fresh account and never
    // looked at anyone else's.
    // Enough rows, at one merchant, to trip a detector. Two arbitrary rows produce no
    // insight, which would make this assertion pass without exercising anything.
    for (let day = 2; day <= 8; day++) {
      await enter(alice, {
        transaction_date: `2026-09-0${day}`,
        amount: 180 + day,
        direction: 'EXPENSE',
        description: 'Groceries',
        merchant_name: 'Chaldal',
      });
    }

    const insightsFor = async (who: string) =>
      ((await (await fetch(`${BASE}/v1/insights`, { headers: { Cookie: who } })).json()) as {
        data: unknown[];
      }).data.length;

    const bobBefore = await insightsFor(bob);
    assert.ok(
      await insightsFor(alice) > 0,
      "alice's own insights should have been recomputed by her write",
    );
    assert.equal(
      await insightsFor(bob),
      bobBefore,
      "bob's insights were wiped when alice recorded a transaction",
    );
  });

  test('deleting a row that was never there reports failure, not success', async () => {
    // `deleteTransactionRow` counted rows after the delete and returned true when the
    // count was zero, which is also true when the row never existed. It reported
    // success for a no-op, which is how a delete can look like it worked.
    const cookie = await makeAccount();
    const res = await fetch(`${BASE}/v1/transactions/txn_does_not_exist`, {
      method: 'DELETE',
      headers: { Origin: BASE, Cookie: cookie },
    });
    assert.equal(res.status, 404, 'a missing row must not read as a successful delete');
  });

  test('an entry is still there after a restart', async () => {
    // The defect that made corrections worthless: the routes wrote to an in-memory
    // map that every read bypassed, so anything the user entered or corrected
    // disappeared. Persistence is only meaningful across a restart.
    const cookie = await makeAccount();
    const created = await enter(cookie, {
      transaction_date: '2026-09-14',
      amount: '৳১,২৫০.৫০',
      direction: 'EXPENSE',
      description: 'Survives a restart',
      merchant_name: 'Chaldal',
    });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    kill(server);
    server = spawnServer();
    await waitForHealth();

    const ledger = await readLedger(cookie);
    assert.equal(ledger.length, 1, 'the entry did not survive the restart');
    assert.equal(ledger[0].id, id);
    assert.equal(ledger[0].amount, 1250.5);

    // The by-id route too. It previously read the process-local map, so a row that
    // existed in the ledger answered 404 after a restart while the list showed it.
    // Reading only the list route could not see that split.
    const byId = await fetch(`${BASE}/v1/transactions/${id}`, { headers: { Cookie: cookie } });
    assert.equal(byId.status, 200, 'the row must be readable by id after a restart');
    const body = await byId.json();
    assert.equal(body.data.id, id);
    assert.equal(body.data.amount, 1250.5);
    assert.equal(body.data.provenance.source, 'USER_ASSERTED');
  });
});
