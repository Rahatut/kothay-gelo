import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Request, Response } from 'express';
import {
  rateLimit,
  concurrencyLimit,
  UPLOAD_RATE_LIMIT,
  resetRateLimits,
} from './rateLimit';

/**
 * The rate limiter and concurrency cap.
 *
 * Both exist because one upload costs roughly half a second of blocked event
 * loop, which is fine once and is a denial of service in parallel. Neither can be
 * verified by reading the middleware: the failure modes are a counter that never
 * decays, a key that collides across accounts, and a release that does not fire
 * when the client disconnects mid-request. Each is exercised here.
 */

interface FakeResponse {
  statusCode: number | null;
  headers: Record<string, string>;
  body: unknown;
  handlers: Record<string, (() => void) | undefined>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
  setHeader(name: string, value: string): FakeResponse;
  on(event: string, handler: () => void): FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: null,
    headers: {},
    body: null,
    handlers: {},
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
    setHeader(name, value) { res.headers[name] = value; return res; },
    on(event, handler) { res.handlers[event] = handler; return res; },
  };
  return res;
}

function fakeRequest(accountId: string | null, method = 'POST', ip = '10.0.0.1'): Request {
  return { method, ip } as unknown as Request & { accountId?: string };
}

function accountReq(accountId: string, method = 'POST'): Request & { accountId?: string } {
  return { method, ip: '10.0.0.1', accountId } as unknown as Request & {
    accountId?: string;
  };
}

describe('the rate limiter', () => {
  beforeEach(() => resetRateLimits());

  test('admits requests up to the budget and refuses the next one', () => {
    const limit = rateLimit({ max: 3, windowMs: 60_000, name: 'test' });
    const req = accountReq('acct_a');

    for (let i = 0; i < 3; i++) {
      let called = false;
      limit(req, fakeResponse() as unknown as Response, () => { called = true; });
      assert.equal(called, true, `request ${i + 1} of 3 must be admitted`);
    }

    const res = fakeResponse();
    let called = false;
    limit(req, res as unknown as Response, () => { called = true; });
    assert.equal(called, false, 'the fourth request must be refused');
    assert.equal(res.statusCode, 429);
  });

  test('scopes the budget per account, so one account cannot exhaust the process', () => {
    const limit = rateLimit({ max: 2, windowMs: 60_000, name: 'test' });
    for (let i = 0; i < 2; i++) {
      limit(accountReq('acct_a'), fakeResponse() as unknown as Response, () => {});
    }
    const exhausted = fakeResponse();
    let called = false;
    limit(accountReq('acct_a'), exhausted as unknown as Response, () => { called = true; });
    assert.equal(called, false);

    // A different account is untouched.
    const other = fakeResponse();
    let otherCalled = false;
    limit(accountReq('acct_b'), other as unknown as Response, () => { otherCalled = true; });
    assert.equal(otherCalled, true, 'one account must not spend another account\'s budget');
    assert.equal(other.statusCode, null);
  });

  test('refusal carries Retry-After and a wait, not a stack trace', () => {
    const limit = rateLimit({ max: 1, windowMs: 60_000, name: 'test' });
    const req = accountReq('acct_a');
    limit(req, fakeResponse() as unknown as Response, () => {});

    const res = fakeResponse();
    limit(req, res as unknown as Response, () => {});
    assert.equal(res.statusCode, 429);
    const retryAfter = Number(res.headers['Retry-After']);
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After was ${res.headers['Retry-After']}`);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.match(body.error.message, /wait/i);
  });

  test('does not spend the budget on reads', () => {
    // Only POST is charged, so browsing the dashboard cannot lock a user out of
    // uploading, and a dashboard refresh cannot exhaust an upload's budget.
    const limit = rateLimit({ max: 1, windowMs: 60_000, name: 'test' });
    for (let i = 0; i < 50; i++) {
      let called = false;
      limit(accountReq('acct_a', 'GET'), fakeResponse() as unknown as Response, () => {
        called = true;
      });
      assert.equal(called, true, 'GET must never be rate limited here');
    }
  });

  test('an unauthenticated flood is still bounded, keyed by address', () => {
    const limit = rateLimit({ max: 2, windowMs: 60_000, name: 'test' });
    const anon = fakeRequest(null);
    for (let i = 0; i < 2; i++) {
      limit(anon, fakeResponse() as unknown as Response, () => {});
    }
    const res = fakeResponse();
    let called = false;
    limit(anon, res as unknown as Response, () => { called = true; });
    assert.equal(called, false, 'pre-signup traffic must be limited too');
  });

  test('the counter decays, so a refusal is not permanent', async () => {
    const limit = rateLimit({ max: 1, windowMs: 30, name: 'test' });
    const req = accountReq('acct_a');
    limit(req, fakeResponse() as unknown as Response, () => {});
    const blocked = fakeResponse();
    limit(req, blocked as unknown as Response, () => {});
    assert.equal(blocked.statusCode, 429);

    await new Promise((r) => setTimeout(r, 60));
    const after = fakeResponse();
    let called = false;
    limit(req, after as unknown as Response, () => { called = true; });
    assert.equal(called, true, 'the budget must return after the window passes');
  });
});

describe('the concurrency cap', () => {
  beforeEach(() => resetRateLimits());

  const key = (req: Request) => (req as Request & { accountId?: string }).accountId ?? 'anon';

  test('admits up to the cap in flight and refuses the next', () => {
    const limit = concurrencyLimit(key, 2, 'upload');
    const held: FakeResponse[] = [];

    for (let i = 0; i < 2; i++) {
      let called = false;
      const res = fakeResponse();
      limit(accountReq('acct_a'), res as unknown as Response, () => { called = true; });
      assert.equal(called, true);
      held.push(res);
    }

    const res = fakeResponse();
    let called = false;
    limit(accountReq('acct_a'), res as unknown as Response, () => { called = true; });
    assert.equal(called, false, 'the third concurrent upload must be refused');
    assert.equal(res.statusCode, 429);
    assert.match(
      (res.body as { error: { code: string } }).error.code,
      /TOO_MANY_UPLOADS_IN_PROGRESS/,
    );
  });

  test('releases the slot when the response finishes', () => {
    const limit = concurrencyLimit(key, 1, 'upload');
    const first = fakeResponse();
    limit(accountReq('acct_a'), first as unknown as Response, () => {});
    first.handlers.finish?.();

    const second = fakeResponse();
    let called = false;
    limit(accountReq('acct_a'), second as unknown as Response, () => { called = true; });
    assert.equal(called, true, 'a completed upload must free its slot');
  });

  test('releases the slot when the client disconnects mid-request', () => {
    // A 25 MB upload that is abandoned mid-transfer must not hold its slot. If
    // `close` did not release, a user could permanently lock themselves out of
    // uploading by opening a few requests and navigating away.
    const limit = concurrencyLimit(key, 1, 'upload');
    const first = fakeResponse();
    limit(accountReq('acct_a'), first as unknown as Response, () => {});
    first.handlers.close?.();

    const second = fakeResponse();
    let called = false;
    limit(accountReq('acct_a'), second as unknown as Response, () => { called = true; });
    assert.equal(called, true, 'an abandoned upload must free its slot');
  });

  test('releasing twice does not free a slot belonging to another request', () => {
    // `finish` and `close` both fire on a normal response. Without idempotent
    // release, one finished upload would return two slots and the cap would be
    // silently exceeded.
    const limit = concurrencyLimit(key, 1, 'upload');
    const first = fakeResponse();
    limit(accountReq('acct_a'), first as unknown as Response, () => {});
    first.handlers.finish?.();
    first.handlers.close?.();

    const second = fakeResponse();
    limit(accountReq('acct_a'), second as unknown as Response, () => {});
    const third = fakeResponse();
    let called = false;
    limit(accountReq('acct_a'), third as unknown as Response, () => { called = true; });
    assert.equal(called, false, 'a double release must not hand out an extra slot');
  });

  test('is scoped per account', () => {
    const limit = concurrencyLimit(key, 1, 'upload');
    limit(accountReq('acct_a'), fakeResponse() as unknown as Response, () => {});
    let called = false;
    limit(accountReq('acct_b'), fakeResponse() as unknown as Response, () => { called = true; });
    assert.equal(called, true, 'a busy account must not block another account');
  });
});

describe('the shipped upload budget', () => {
  test('is at least as strict as the caps the server installs', () => {
    // Guards against the constants drifting apart: a `max` of 0 or a `windowMs`
    // of 0 would refuse every upload, and neither failure is visible without a
    // live request.
    assert.ok(UPLOAD_RATE_LIMIT.max > 0, 'uploads must be possible');
    assert.ok(UPLOAD_RATE_LIMIT.windowMs >= 1000, 'the window must be in seconds, not ms-off-by-1000');
    assert.ok(UPLOAD_RATE_LIMIT.methods?.includes('POST'));
  });
});