import type { NextFunction, Request, Response } from 'express';
import { resolveSession } from '../db/repositories/sessions';
import { appUrl, allowedOrigins } from '../config';
import { hashSessionToken, readSessionToken } from './session';

/**
 * Identity resolution and request guards.
 *
 * Identity comes from the server-held session and nowhere else. A header, a
 * query parameter, or a body field is never consulted, because any of them can
 * be set by the caller — which is precisely how the previous hardcoded
 * `getAuthenticatedUserId` made its ownership checks unfailable.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireIdentity`. Absent on an unauthenticated request. */
      accountId?: string;
      sessionId?: string;
    }
  }
}

export type AuthFailure = 'unauthenticated' | 'session_expired' | 'forbidden_origin';

/** Methods that change state and therefore require a same-origin request. */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rejects a state-changing request whose Origin does not match this deployment
 * or an explicitly allowed origin.
 *
 * The interface is served by this same process, so a legitimate request is
 * always same-origin. `SameSite=Lax` is the second layer; neither is a
 * substitute for the other, and no CSRF token is issued because `Origin` is
 * directly checkable here. A request with no Origin header at all — a
 * server-side client — is allowed through, since browsers always send one.
 */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  const allowed = [appUrl(), ...allowedOrigins()];
  if (!allowed.includes(origin)) {
    res.status(403).json({
      ok: false,
      error: 'forbidden_origin',
      message: 'This request did not originate from an allowed site.',
    });
    return;
  }

  next();
}

/**
 * Resolves identity from the session cookie when present.
 *
 * Deliberately does not reject. Routes that require an identity call
 * `requireIdentity`; routes that can serve anonymous content keep working. This
 * keeps one middleware from having to know which routes are which.
 */
export async function attachIdentity(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readSessionToken(req.headers.cookie);
  if (!token) return next();

  try {
    const session = await resolveSession(hashSessionToken(token), hashSessionToken);
    if (session) {
      req.accountId = session.account_id;
      req.sessionId = session.id;
    }
  } catch {
    // An unreadable session is treated as no session rather than an error, so a
    // database hiccup degrades to unauthenticated instead of leaking a 500.
  }

  next();
}

/** Rejects the request unless a valid session established an identity. */
export function requireIdentity(req: Request, res: Response, next: NextFunction): void {
  if (!req.accountId) {
    res.status(401).json({
      ok: false,
      error: 'unauthenticated',
      message: 'Sign in to continue.',
    });
    return;
  }
  next();
}

/**
 * Throws if identity is absent. For use inside the capability layer, where a
 * missing identity is a programming error rather than a client error.
 */
export function requireAccountId(req: Request): string {
  if (!req.accountId) {
    throw new Error('capability invoked without a resolved account');
  }
  return req.accountId;
}
