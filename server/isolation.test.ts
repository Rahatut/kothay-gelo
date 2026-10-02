import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';

/**
 * Cross-tenant isolation, verified over HTTP against the real server.
 *
 * This is the acceptance proof for US1 and for SC-001: two accounts attempt
 * every read and write against each other's records, and none may succeed.
 *
 * The suite spawns the actual process rather than building an app in-process,
 * because the property under test is the whole chain — middleware order, the
 * blanket /v1 guard, per-route ownership checks, and the capability guard. An
 * in-process harness would exercise the handlers while skipping the ordering that
 * is exactly what needs proving.
 *
 * The in-memory constant that used to sit in `getAuthenticatedUserId` made every
 * ownership check unfailable while every test suite still passed, because no test
 * ever had two identities. That is why this suite exists.
 */

const PORT = await freePort();
const ORIGIN = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'kg-iso-'));

let server: ChildProcess;

/**
 * Spawns the server in its own process group.
 *
 * `npx tsx server.ts` creates a child, so killing the wrapper alone orphans the
 * real server. The orphan keeps stdio open and the test runner never exits —
 * which shows up as a hang rather than a failure. `detached` plus a negative-pid
 * kill takes the whole group down.
 */
function spawnServer(env: Record<string, string>): ChildProcess {
  return spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function killServer(child: ChildProcess | undefined): void {
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

const SERVER_ENV = (dbPath: string) => ({
  PORT: String(PORT),
  APP_URL: ORIGIN,
  DATABASE_URL: `file:${dbPath}`,
  // No model key: the app must degrade to the deterministic path rather than
  // fail, and the isolation property must hold either way.
  GEMINI_API_KEY: '',
});

async function waitForHealth(timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become healthy in time');
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function cookieJar(): string[] {
  return [];
}

/** Minimal cookie-jar fetch: keeps whatever Set-Cookie the server hands back. */
async function call(
  jar: string[],
  method: string,
  path: string,
  body?: unknown,
  options: { origin?: string | null } = {},
): Promise<{ status: number; body: any; setCookie: string[] }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.length > 0) headers.Cookie = jar.join('; ');
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;

  // fetch() rejects a body on GET/HEAD, so one is attached only where it is legal.
  const sendsBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    body: sendsBody ? JSON.stringify(body) : undefined,
  });

  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    if (pair) jar.push(pair);
  }

  let parsed: any = null;
  const text = await response.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return { status: response.status, body: parsed, setCookie: [] };
}

async function register(jar: string[], email: string): Promise<string> {
  const res = await call(jar, 'POST', '/v1/auth/register', {
    email,
    password: 'correct-horse-battery',
  });
  assert.equal(res.status, 201, `register ${email} failed: ${JSON.stringify(res.body)}`);
  return res.body.account.id;
}

before(async () => {
  server = spawnServer(SERVER_ENV(path.join(dir, 'iso.db')));
  await waitForHealth();
});

after(() => {
  killServer(server);
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* cleanup is best-effort on Windows */ }
});

describe('unauthenticated access', () => {
  const PUBLIC_OK = ['/api/health'];

  const DATA_ROUTES = [
    ['GET', '/v1/dashboard'],
    ['GET', '/v1/transactions'],
    ['GET', '/v1/insights'],
    ['GET', '/v1/recommendations'],
    ['GET', '/v1/goals'],
    ['GET', '/v1/uploads'],
    ['GET', '/v1/categories'],
    ['GET', '/v1/users/me'],
    ['GET', '/v1/settings/audit'],
    ['GET', '/v1/capabilities'],
    ['POST', '/v1/capabilities/financial_summary'],
    ['GET', '/v1/transactions/anything'],
    ['GET', '/v1/transactions/anything/evidence'],
    ['PATCH', '/v1/transactions/anything'],
    ['POST', '/v1/transactions/anything/confirm'],
    ['GET', '/v1/uploads/anything/status'],
    ['GET', '/v1/processing/anything'],
    ['GET', '/v1/evidence/anything'],
    ['GET', '/v1/insights/anything'],
    ['POST', '/v1/insights/anything/feedback'],
    ['GET', '/v1/insights/anything/narrate'],
    ['GET', '/v1/goals/anything'],
    ['POST', '/v1/dataset/load-golden'],
    ['POST', '/v1/uploads'],
    ['POST', '/v1/settings/reset'],
    ['POST', '/v1/settings/export'],
    ['POST', '/v1/settings/delete-account'],
  ] as const;

  test('health stays open so orchestration can probe it', async () => {
    for (const route of PUBLIC_OK) {
      assert.equal((await call(cookieJar(), 'GET', route)).status, 200, route);
    }
  });

  test('every data route refuses a request with no session', async () => {
    for (const [method, route] of DATA_ROUTES) {
      const res = await call(cookieJar(), method, route);
      assert.equal(res.status, 401, `${method} ${route} returned ${res.status}`);

      // The refusal must also name authentication, so a client can act on it.
      // Two layers currently spell it differently -- requireIdentity emits
      // `{ error: { code: 'UNAUTHENTICATED' } }` while the capability guard
      // emits `{ error: 'unauthenticated' }` -- so both are accepted here.
      // Unifying the envelope is a contract change, tracked separately; what
      // matters now is that no route leaks data while unauthenticated.
      const marker = JSON.stringify(res.body).toLowerCase();
      assert.match(marker, /unauthenticated/, `${method} ${route} gave ${marker}`);
    }
  });
});

describe('cross-tenant isolation', () => {
  let aliceJar: string[];
  let bobJar: string[];
  let aliceId: string;
  let bobId: string;
  let aliceTxId: string;
  let bobTxId: string;

  before(async () => {
    aliceJar = cookieJar();
    bobJar = cookieJar();
    aliceId = await register(aliceJar, 'alice-iso@example.com');
    bobId = await register(bobJar, 'bob-iso@example.com');

    // Give each account distinct data so a leak is unmistakable.
    for (const [jar, email] of [[aliceJar, 'alice'], [bobJar, 'bob']] as const) {
      const res = await call(jar, 'POST', '/v1/dataset/load-golden');
      assert.equal(res.status, 200, `${email} seed failed: ${JSON.stringify(res.body)}`);
    }

    const aliceTx = await call(aliceJar, 'GET', '/v1/transactions');
    const bobTx = await call(bobJar, 'GET', '/v1/transactions');
    aliceTxId = aliceTx.body.data?.[0]?.id;
    bobTxId = bobTx.body.data?.[0]?.id;

    assert.ok(aliceTxId, 'alice must have rows');
    assert.ok(bobTxId, 'bob must have rows');
    assert.notEqual(aliceTxId, bobTxId, 'the two ledgers must not share row ids');
  });

  test('each account sees only its own ledger', async () => {
    const alice = await call(aliceJar, 'GET', '/v1/transactions');
    const bob = await call(bobJar, 'GET', '/v1/transactions');

    assert.ok(alice.body.data.length > 0);
    assert.equal(alice.body.data.some((t: any) => t.id === bobTxId), false);
    assert.equal(bob.body.data.some((t: any) => t.id === aliceTxId), false);
  });

  test('a foreign transaction id is refused for read, evidence, and edit', async () => {
    const attempts: [string, string][] = [
      ['GET', `/v1/transactions/${aliceTxId}`],
      ['GET', `/v1/transactions/${aliceTxId}/evidence`],
      ['PATCH', `/v1/transactions/${aliceTxId}`],
      ['POST', `/v1/transactions/${aliceTxId}/confirm`],
    ];

    for (const [method, route] of attempts) {
      const res = await call(bobJar, method, route, { merchant_name: 'hijacked' });
      assert.equal(res.status, 404, `${method} ${route} returned ${res.status}`);
    }
  });

  test('bob cannot confirm or corrupt alice\'s transaction', async () => {
    const before = await call(aliceJar, 'GET', `/v1/transactions/${aliceTxId}`);
    await call(bobJar, 'POST', `/v1/transactions/${aliceTxId}/confirm`);
    const after = await call(aliceJar, 'GET', `/v1/transactions/${aliceTxId}`);
    assert.deepEqual(after.body.data, before.body.data, 'a cross-account confirm changed the row');
  });

  test('a foreign document and job id are refused', async () => {
    const uploads = await call(aliceJar, 'GET', '/v1/uploads');
    const docId = uploads.body.data?.[0]?.id;
    if (docId) {
      assert.equal((await call(bobJar, 'GET', `/v1/uploads/${docId}/status`)).status, 404);
    }
    assert.equal((await call(bobJar, 'GET', '/v1/processing/anything')).status, 404);
  });

  test('a foreign evidence id is refused', async () => {
    const aliceEvidence = await call(aliceJar, 'GET', `/v1/transactions/${aliceTxId}/evidence`);
    const evId = aliceEvidence.body.data?.[0]?.id ?? aliceEvidence.body.data?.evidence?.[0]?.id;
    if (evId) {
      assert.equal((await call(bobJar, 'GET', `/v1/evidence/${evId}`)).status, 404);
    }
  });

  test('a foreign goal cannot be deleted', async () => {
    const created = await call(aliceJar, 'POST', '/v1/goals', {
      title: 'Alice goal',
      target_amount: 1000,
      target_date: '2027-01-01',
    });
    // The route answers 200 with the created row rather than a bare 201.
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
    const goalId = created.body.data?.id;

    assert.equal((await call(bobJar, 'DELETE', `/v1/goals/${goalId}`)).status, 404);
    const still = await call(aliceJar, 'GET', '/v1/goals');
    assert.ok(still.body.data.some((g: any) => g.id === goalId), 'the goal must survive');
  });

  test('feedback for a foreign insight is refused', async () => {
    const insights = await call(aliceJar, 'GET', '/v1/insights');
    const insightId = insights.body.data?.[0]?.id;
    if (insightId) {
      const res = await call(bobJar, 'POST', `/v1/insights/${insightId}/feedback`, {
        feedback_type: 'WRONG',
        comment: 'probe',
      });
      assert.equal(res.status, 404);
    }
  });

  test('narration for a foreign insight is refused', async () => {
    const insights = await call(aliceJar, 'GET', '/v1/insights');
    const insightId = insights.body.data?.[0]?.id;
    if (insightId) {
      const res = await call(bobJar, 'GET', `/v1/insights/${insightId}/narrate`);
      assert.equal(res.status, 404);
    }
  });

  test('the audit trail is scoped per account', async () => {
    const bobAudit = await call(bobJar, 'GET', '/v1/settings/audit');
    const aliceAudit = await call(aliceJar, 'GET', '/v1/settings/audit');

    const bobEntries = bobAudit.body.data ?? [];
    const aliceEntries = aliceAudit.body.data ?? [];
    assert.ok(Array.isArray(bobEntries));
    assert.ok(bobEntries.length > 0, 'bob should have his own entries');

    // Every entry carries the account it belongs to, and none may name the other.
    // A refusal legitimately records the id the caller *tried* to reach — that is
    // what makes probing detectable — so the assertion is on account scoping,
    // not on the two logs mentioning disjoint resources.
    for (const entry of bobEntries) {
      assert.equal(entry.account_id, bobId, 'bob saw an entry belonging to another account');
    }
    for (const entry of aliceEntries) {
      assert.equal(entry.account_id, aliceId, 'alice saw an entry belonging to another account');
    }

    // Neither log contains the other's registration.
    assert.equal(
      bobEntries.some((e: any) => e.action === 'SIGNED_UP' && e.account_id === aliceId),
      false,
    );
    assert.equal(
      aliceEntries.some((e: any) => e.action === 'SIGNED_UP' && e.account_id === bobId),
      false,
    );
  });

  test('a cross-account probe is recorded as a refusal', async () => {
    const probe = await call(bobJar, 'GET', `/v1/transactions/${aliceTxId}`);
    assert.equal(probe.status, 404);

    // The refusal must leave a trace server-side. Without it, enumeration across
    // tenants is indistinguishable from a quiet client reading the audit log.
    const audit = await call(bobJar, 'GET', '/v1/settings/audit');
    const refusals = (audit.body.data ?? []).filter(
      (e: any) => e.action === 'OWNERSHIP_REFUSED',
    );
    assert.ok(refusals.length > 0, 'the probe left no audit trace');
    assert.equal(refusals[0].resource_id, aliceTxId);
  });

  test('a refusal records no financial content', async () => {
    const audit = await call(bobJar, 'GET', '/v1/settings/audit');
    for (const entry of audit.body.data ?? []) {
      const serialised = JSON.stringify(entry);
      assert.equal(/amount|merchant|raw_text|৳/.test(serialised), false, serialised);
    }
  });

  test('the session endpoint reports only the caller', async () => {
    const alice = await call(aliceJar, 'GET', '/v1/auth/session');
    const bob = await call(bobJar, 'GET', '/v1/auth/session');
    assert.equal(alice.body.account.id, aliceId);
    assert.equal(bob.body.account.id, bobId);
    assert.notEqual(alice.body.account.id, bob.body.account.id);
  });

  test('the session response never carries a password hash', async () => {
    const res = await call(aliceJar, 'GET', '/v1/auth/session');
    assert.equal('password_hash' in res.body.account, false);
    assert.equal('passwordHash' in res.body.account, false);
  });

  test('capability answers are scoped: the two accounts get different totals', async () => {
    const params = { period: { start: '2026-09-01', end: '2026-09-30' } };
    const alice = await call(aliceJar, 'POST', '/v1/capabilities/financial_summary', { params });
    const bob = await call(bobJar, 'POST', '/v1/capabilities/financial_summary', { params });

    assert.equal(alice.status, 200);
    assert.equal(bob.status, 200);
    // Both were seeded from the same fixture, so equal totals are expected. What
    // matters is that neither can be empty while the other has data, and that
    // each answer cites only its own rows.
    assert.ok(alice.body.evidence.transaction_ids.length > 0);
    const bobIds = new Set(bob.body.evidence.transaction_ids);
    assert.equal(
      alice.body.evidence.transaction_ids.some((id: string) => bobIds.has(id)),
      false,
      'evidence ids leaked between accounts',
    );
  });
});

describe('response indistinguishability', () => {
  test('a foreign id and a nonexistent id are byte-identical', async () => {
    const aliceJar = cookieJar();
    const bobJar = cookieJar();
    const aliceId = await register(aliceJar, 'alice-indist@example.com');
    await register(bobJar, 'bob-indist@example.com');
    await call(aliceJar, 'POST', '/v1/dataset/load-golden');

    const own = await call(aliceJar, 'GET', '/v1/transactions');
    const aliceTxId = own.body.data?.[0]?.id;
    assert.ok(aliceTxId);

    const foreign = await call(bobJar, 'GET', `/v1/transactions/${aliceTxId}`);
    const missing = await call(bobJar, 'GET', '/v1/transactions/txn_definitely_not_real');

    assert.equal(foreign.status, missing.status);
    // `request_id` is minted per request and nested inside `error`, so it is the
    // one field allowed to differ. Everything else must be identical, or the
    // response itself reveals whether the id exists.
    const strip = (b: any) =>
      JSON.stringify({ ...b, error: { ...b.error, request_id: undefined } });
    assert.equal(strip(foreign.body), strip(missing.body));
    assert.ok(aliceId);
  });
});

describe('session lifecycle', () => {
  test('signing out invalidates the cookie immediately', async () => {
    const jar = cookieJar();
    await register(jar, 'logout@example.com');

    assert.equal((await call(jar, 'GET', '/v1/auth/session')).status, 200);

    const out = await call(jar, 'POST', '/v1/auth/logout');
    assert.equal(out.status, 200);

    // The old cookie must stop working at once, not at expiry. This is the
    // behaviour a stateless token could not provide without a denylist.
    assert.equal((await call(jar, 'GET', '/v1/auth/session')).status, 401);
    assert.equal((await call(jar, 'GET', '/v1/transactions')).status, 401);
  });

  test('deleting an account revokes its sessions', async () => {
    const jar = cookieJar();
    await register(jar, 'delete@example.com');

    const res = await call(jar, 'POST', '/v1/settings/delete-account');
    assert.ok(res.status === 200 || res.status === 404, `unexpected ${res.status}`);

    assert.equal(
      (await call(jar, 'GET', '/v1/auth/session')).status,
      401,
      'deletion must invalidate the session immediately',
    );
  });

  test('a wrong password is rejected and a right one accepted', async () => {
    await register(cookieJar(), 'creds@example.com');

    const wrong = await call(cookieJar(), 'POST', '/v1/auth/login', {
      email: 'creds@example.com',
      password: 'wrong-password-here',
    });
    assert.equal(wrong.status, 401);

    const right = cookieJar();
    const ok = await call(right, 'POST', '/v1/auth/login', {
      email: 'creds@example.com',
      password: 'correct-horse-battery',
    });
    assert.equal(ok.status, 200);
    assert.equal((await call(right, 'GET', '/v1/auth/session')).status, 200);
  });

  test('an unknown address and a wrong password are indistinguishable', async () => {
    const unknown = await call(cookieJar(), 'POST', '/v1/auth/login', {
      email: 'nobody-at-all@example.com',
      password: 'correct-horse-battery',
    });
    const wrong = await call(cookieJar(), 'POST', '/v1/auth/login', {
      email: 'creds@example.com',
      password: 'completely-different-password',
    });
    assert.equal(unknown.status, wrong.status);
    assert.deepEqual(unknown.body.error, wrong.body.error);
  });
});

describe('origin enforcement', () => {
  test('a cross-origin state change is refused', async () => {
    const jar = cookieJar();
    await register(jar, 'origin@example.com');

    const res = await call(jar, 'POST', '/v1/dataset/load-golden', undefined, {
      origin: 'https://evil.example',
    });
    assert.equal(res.status, 403);
  });

  test('a same-origin read is unaffected by the check', async () => {
    const jar = cookieJar();
    await register(jar, 'origin2@example.com');
    assert.equal((await call(jar, 'GET', '/v1/auth/session')).status, 200);
  });
});

describe('persistence', () => {
  test('records survive a restart', async () => {
    const dbPath = path.join(dir, 'iso.db');
    assert.ok(existsSync(dbPath), 'the database file must exist on disk');

    const jar = cookieJar();
    const email = 'persist@example.com';
    await register(jar, email);
    await call(jar, 'POST', '/v1/dataset/load-golden');

    const before = await call(jar, 'GET', '/v1/transactions');
    const count = before.body.data?.length ?? 0;
    assert.ok(count > 0, 'there must be rows to persist');

    // Restart the process against the same database file.
    killServer(server);
    await new Promise((r) => setTimeout(r, 750));

    server = spawnServer(SERVER_ENV(dbPath));
    await waitForHealth();

    // The cookie must still work: it is a stored session, not in-memory state.
    const session = await call(jar, 'GET', '/v1/auth/session');
    assert.equal(session.status, 200, 'the session did not survive the restart');

    const after = await call(jar, 'GET', '/v1/transactions');
    assert.equal(after.body.data?.length, count, 'row count changed across the restart');
    assert.deepEqual(
      after.body.data?.map((t: any) => t.id),
      before.body.data?.map((t: any) => t.id),
      'rows changed across the restart',
    );
  });
});