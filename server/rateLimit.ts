import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiting and per-account work caps.
 *
 * This exists because the expensive endpoints are expensive by design. One
 * upload runs a PDF text extraction, possibly a model call, possibly OCR, and a
 * parse over the whole file. The parser budget in `pipeline.ts` bounds a single
 * such request to roughly half a second of blocked event loop, which is
 * acceptable once and is a denial of service at any concurrency — the server is
 * single-threaded, so a handful of concurrent uploads stops serving anyone.
 *
 * The counters are per account where an identity exists, and per address
 * otherwise, so one account cannot exhaust the process for everyone else. State
 * is in memory and bounded: entries expire, and the map is capped, because a
 * limiter whose own memory grows without limit is a second denial of service.
 */

interface Bucket {
  /** Timestamps of recent requests, oldest first. */
  hits: number[];
  lastSeen: number;
}

export interface RateLimitOptions {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Counts only these methods. GETs on the dashboard are cheap and should not
   * spend an upload's budget.
   */
  methods?: string[];
  /** Label used in the error body. */
  name: string;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Hard cap on tracked keys, so a flood of distinct identities cannot grow memory. */
const MAX_TRACKED_KEYS = 10_000;

/** Drops entries untouched for longer than the longest window in use. */
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const cutoff = now - 15 * 60_000;
  for (const [key, bucket] of buckets) {
    if (bucket.lastSeen < cutoff) buckets.delete(key);
  }
}

function take(key: string, options: RateLimitOptions, now: number): boolean {
  sweep(now);
  const cutoff = now - options.windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    // Map insertion order is oldest-first, so the first key is the one to evict
    // when the cap is reached.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
    bucket = { hits: [], lastSeen: now };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  bucket.lastSeen = now;
  if (bucket.hits.length >= options.max) return false;
  bucket.hits.push(now);
  return true;
}

/**
 * The account id when the request is authenticated, the client address otherwise.
 *
 * `attachIdentity` has already run, so `req.accountId` is present for a real
 * session. Falling back to the address means an unauthenticated flood is still
 * bounded, which is the case that matters most since it precedes any signup.
 */
function keyFor(req: Request): string {
  const accountId = (req as Request & { accountId?: string }).accountId;
  if (accountId) return `a:${accountId}`;
  return `i:${req.ip ?? 'unknown'}`;
}

/**
 * Express middleware enforcing a per-key request budget.
 *
 * Rejections use 429 with `Retry-After`, and the message names the wait rather
 * than describing the limit as an error condition — a user who uploads two
 * statements in a minute has not done anything wrong.
 */
export function rateLimit(options: RateLimitOptions) {
  const methods = new Set(options.methods ?? ['POST', 'PUT', 'PATCH', 'DELETE']);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!methods.has(req.method)) {
      next();
      return;
    }
    const now = Date.now();
    if (take(`${options.name}:${keyFor(req)}`, options, now)) {
      next();
      return;
    }
    const bucket = buckets.get(`${options.name}:${keyFor(req)}`);
    const oldest = bucket?.hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message:
          `Too many requests. Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} ` +
          'and try again.',
      },
    });
  };
}

/**
 * In-flight work per key, for endpoints whose cost is measured in seconds.
 *
 * A rate limit bounds arrivals per window; it does not bound how many of those
 * arrivals are still running. Ten uploads permitted in a minute can all be
 * executing at once, which is the case the limiter above cannot see.
 */
const inFlight = new Map<string, number>();

/**
 * Wraps an async handler so at most `max` invocations per key run at once.
 *
 * Excess requests are refused with 429 rather than queued: queueing would let a
 * caller accumulate unbounded pending work holding their uploaded statements in
 * memory, which trades a denial of service for a memory leak.
 */
export function concurrencyLimit(
  keyForRequest: (req: Request) => string,
  max: number,
  name: string,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${name}:${keyForRequest(req)}`;
    const current = inFlight.get(key) ?? 0;
    if (current >= max) {
      res.setHeader('Retry-After', '30');
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_UPLOADS_IN_PROGRESS',
          message:
            'An upload is already being processed for this account. Wait for it to finish ' +
            'before starting another.',
        },
      });
      return;
    }
    inFlight.set(key, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const next = (inFlight.get(key) ?? 1) - 1;
      if (next <= 0) inFlight.delete(key);
      else inFlight.set(key, next);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

export const UPLOAD_RATE_LIMIT: RateLimitOptions = {
  max: 6,
  windowMs: 60_000,
  methods: ['POST'],
  name: 'upload',
};

/**
 * Coarse limit for the routes that can each trigger a model call.
 */
export const ASK_RATE_LIMIT: RateLimitOptions = {
  max: 20,
  windowMs: 60_000,
  methods: ['POST'],
  name: 'ask',
};

/**
 * Limit for the destructive account routes.
 *
 * `/v1/settings/reset` and `/v1/settings/delete-account` run a multi-table
 * purge and rewrite an audit entry. Repeated without a limit they are both an
 * amplification vector against the database and a way to churn the audit log, and
 * a per-account budget is the wrong tool here: the cost is in the writes, so one
 * account hammering it degrades the instance for everyone.
 */
export const DESTRUCTIVE_RATE_LIMIT: RateLimitOptions = {
  max: 3,
  windowMs: 60_000,
  methods: ['POST', 'DELETE'],
  name: 'destructive',
};

/** Bounds extraction work regardless of how many requests the limiter admits. */
export const MAX_CONCURRENT_UPLOADS_PER_ACCOUNT = 2;

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
  inFlight.clear();
  lastSweep = 0;
}