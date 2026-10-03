import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { issueSession } from '../db/repositories/sessions';
import { appUrl } from '../config';

/**
 * Session issuing and transport.
 *
 * The session is an opaque random token, not a signed claim. A JWT cannot be
 * revoked without a server-side denylist, which is a session table wearing a
 * hat — and revocation is required, because sign-out and account deletion must
 * take effect immediately rather than at token expiry.
 */

export const SESSION_COOKIE = 'kg_session';

/** 32 bytes of CSPRNG output, base64url encoded for cookie safety. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a raw token for storage and lookup.
 *
 * SHA-256 is appropriate here and not for passwords: the input is 32 bytes of
 * CSPRNG output, so there is no dictionary to attack and no need for a
 * deliberately slow function. A database leak yields digests, not cookies.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function openSession(
  accountId: string,
): Promise<{ token: string; expiresAt: string }> {
  return issueSession(
    accountId,
    hashSessionToken,
    generateSessionToken,
  );
}

/**
 * Sets the session cookie.
 *
 * `secure` is omitted in development because a secure cookie is not sent over
 * plain HTTP, which would silently break local sign-in. In production APP_URL is
 * https and the attribute applies.
 */
export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  const isProduction = appUrl().startsWith('https://');
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

/** Clears the cookie with the same attributes it was set with. */
export function clearSessionCookie(res: Response): void {
  const isProduction = appUrl().startsWith('https://');
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}

/** Reads the raw token from the request cookie header. */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
