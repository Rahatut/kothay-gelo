import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'kg-auth-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { migrate } = await import('../db/migrate');
const { closeClient, query } = await import('../db/client');
const { hashPassword, verifyPassword, needsRehash, SCRYPT_COST } = await import('./password');
const {
  generateSessionToken,
  hashSessionToken,
  readSessionToken,
} = await import('./session');
const { requireSameOrigin, requireIdentity } = await import('./guard');
const { createAccount, updatePasswordHash } = await import('../db/repositories/accounts');
const { issueSession, resolveSession, revokeSession } = await import('../db/repositories/sessions');

let accountId: string;

before(async () => {
  await migrate();
  const account = await createAccount('auth@example.com', await hashPassword('correct-horse-battery'));
  accountId = account.id;
});

after(() => {
  closeClient();
  rmSync(dir, { recursive: true, force: true });
});

/** Minimal Response double capturing what the guards wrote. */
function fakeRes() {
  const captured: { status?: number; body?: unknown } = {};
  return {
    captured,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
}

/** Minimal Request double carrying only what the guards read. */
function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    get: (name: string) => (overrides[name.toLowerCase()] as string | undefined),
    headers: (overrides.headers as Record<string, string> | undefined) ?? {},
    ...overrides,
  } as any;
}

describe('scrypt parameters', () => {
  test('requires memory below the default maxmem ceiling', () => {
    // Exactly 32 MB, which equals Node's default maxmem. The library's check is
    // a strict `>`, so omitting maxmem throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
    assert.equal(SCRYPT_COST.memoryBytes, 32 * 1024 * 1024);
    assert.ok(SCRYPT_COST.maxmemBytes > SCRYPT_COST.memoryBytes, 'maxmem must exceed the requirement');
  });

  test('hashes within a reasonable time budget', async () => {
    const started = Date.now();
    await hashPassword('some-password-value');
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `hashing took ${elapsed}ms, expected under 1000ms`);
  });
});

describe('password hashing', () => {
  test('produces a self-describing hash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    const parts = hash.split('$');
    assert.equal(parts[0], 'scrypt');
    assert.equal(Number(parts[1]), SCRYPT_COST.N);
    assert.equal(Number(parts[2]), SCRYPT_COST.r);
    assert.equal(Number(parts[3]), SCRYPT_COST.p);
  });

  test('never stores the password in the hash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.ok(!hash.includes('correct-horse-battery'));
  });

  test('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password-here');
    const b = await hashPassword('same-password-here');
    assert.notEqual(a, b, 'two hashes of one password must differ');
    assert.equal(await verifyPassword('same-password-here', a), true);
    assert.equal(await verifyPassword('same-password-here', b), true);
  });

  test('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.equal(await verifyPassword('correct-horse-battery', hash), true);
    assert.equal(await verifyPassword('wrong-horse-battery!!', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  test('rejects a malformed hash without throwing', async () => {
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'bcrypt$1$2$3$a$b', 'scrypt$x$y$z$a$b']) {
      assert.equal(await verifyPassword('anything', bad), false, `accepted "${bad}"`);
    }
  });

  test('refuses a hash whose claimed cost exceeds the ceiling', async () => {
    // An attacker able to write this column could otherwise request a hash that
    // exhausts memory on the next sign-in attempt.
    const malicious = `scrypt${SCRYPT_COST.N * 64}$8$1$${'A'.repeat(22)}$${'A'.repeat(43)}`;
    assert.equal(await verifyPassword('anything', malicious), false);
  });

  test('flags a below-cost hash for upgrade and leaves a current one alone', async () => {
    const weak = `scrypt$1024$8$1$${'A'.repeat(22)}$${'A'.repeat(43)}`;
    assert.equal(needsRehash(weak), true);
    assert.equal(needsRehash(await hashPassword('correct-horse-battery')), false);
  });

  test('tolerates concurrent verifications without exhausting memory', async () => {
    const hash = await hashPassword('correct-horse-battery');
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        verifyPassword(i % 2 === 0 ? 'correct-horse-battery' : 'nope', hash),
      ),
    );
    assert.equal(results.filter(Boolean).length, 6);
  });

  test('upgraded credentials still verify after a rehash', async () => {
    const weak = await hashPassword('upgrade-me-please');
    await updatePasswordHash(accountId, weak);
    const account = await query<{ password_hash: string }>(
      'SELECT password_hash FROM accounts WHERE id = ?',
      [accountId],
    );
    assert.equal(await verifyPassword('upgrade-me-please', account[0].password_hash), true);
  });
});

describe('session tokens', () => {
  test('generates a long, unique, url-safe token', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    assert.equal(tokens.size, 50, 'tokens must not repeat');
    for (const token of tokens) {
      assert.match(token, /^[A-Za-z0-9_-]+$/, 'token must be cookie-safe without escaping');
      assert.ok(Buffer.from(token, 'base64url').length >= 32, 'token must carry at least 32 bytes');
    }
  });

  test('hashes deterministically and never equals the token', () => {
    const token = generateSessionToken();
    assert.equal(hashSessionToken(token), hashSessionToken(token));
    assert.notEqual(hashSessionToken(token), token);
  });

  test('reads the cookie among others and tolerates a missing header', () => {
    assert.equal(readSessionToken(undefined), null);
    assert.equal(readSessionToken(''), null);
    assert.equal(readSessionToken('a=1'), null);
    assert.equal(readSessionToken('a=1; kg_session=abc; b=2'), 'abc');
    assert.equal(readSessionToken('kg_session=xyz'), 'xyz');
  });

  test('stores only the hash, never the token', async () => {
    const issued = await issueSession(accountId, hashSessionToken, generateSessionToken);
    const rows = await query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE id = ?',
      [issued.sessionId],
    );
    assert.equal(rows[0].token_hash, hashSessionToken(issued.token));
    assert.notEqual(rows[0].token_hash, issued.token);
  });

  test('resolves a live session and stops resolving once revoked', async () => {
    const issued = await issueSession(accountId, hashSessionToken, generateSessionToken);
    assert.ok(await resolveSession(hashSessionToken(issued.token), hashSessionToken));

    await revokeSession(issued.sessionId);
    assert.equal(
      await resolveSession(hashSessionToken(issued.token), hashSessionToken),
      null,
      'revocation must take effect immediately, not at expiry',
    );
  });
});

describe('origin guard', () => {
  test('allows a same-origin state change', () => {
    const res = fakeRes();
    let passed = false;
    requireSameOrigin(
      fakeReq({ method: 'POST', origin: 'http://localhost:3000' }),
      res as any,
      () => {
        passed = true;
      },
    );
    assert.equal(passed, true);
  });

  test('rejects a cross-origin state change', () => {
    const res = fakeRes();
    let passed = false;
    requireSameOrigin(
      fakeReq({ method: 'POST', origin: 'https://evil.example' }),
      res as any,
      () => {
        passed = true;
      },
    );
    assert.equal(passed, false);
    assert.equal(res.captured.status, 403);
    assert.equal((res.captured.body as any).error, 'forbidden_origin');
  });

  test('ignores origin on a read', () => {
    let passed = false;
    requireSameOrigin(fakeReq({ method: 'GET', origin: 'https://evil.example' }), fakeRes() as any, () => {
      passed = true;
    });
    assert.equal(passed, true);
  });

  test('allows a request with no origin, which a browser never sends', () => {
    let passed = false;
    requireSameOrigin(fakeReq({ method: 'POST' }), fakeRes() as any, () => {
      passed = true;
    });
    assert.equal(passed, true);
  });
});

describe('identity guard', () => {
  test('rejects a request with no session', () => {
    const res = fakeRes();
    let passed = false;
    requireIdentity(fakeReq(), res as any, () => {
      passed = true;
    });
    assert.equal(passed, false);
    assert.equal(res.captured.status, 401);
    assert.equal((res.captured.body as any).error, 'unauthenticated');
  });

  test('admits a request carrying a resolved identity', () => {
    let passed = false;
    requireIdentity(fakeReq({ accountId: 'acct_x' }), fakeRes() as any, () => {
      passed = true;
    });
    assert.equal(passed, true);
  });
});
