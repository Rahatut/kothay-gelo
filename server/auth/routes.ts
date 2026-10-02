import { Router, type Request, type Response } from 'express';
import {
  assertValidPassword,
  createAccount,
  getAccountByEmail,
  getAccountById,
  markAccountDeleted,
  updatePasswordHash,
} from '../db/repositories/accounts';
import { revokeSession } from '../db/repositories/sessions';
import { recordAudit } from '../db/repositories/audit';
import { hasAnyAccount } from '../db/client';
import { hashPassword, verifyPassword, needsRehash } from './password';
import { clearSessionCookie, openSession, setSessionCookie } from './session';
import { requireIdentity } from './guard';
import { eraseAccountData } from '../erase';
import { rateLimit, DESTRUCTIVE_RATE_LIMIT } from '../rateLimit';

/**
 * Account lifecycle.
 *
 * Replaces the previous OTP endpoints, which compared the submitted code against
 * the string literal '123456', returned a token nobody stored or read, and left
 * a logout with no session to destroy.
 *
 * There is no password-reset endpoint. Without an email provider a reset flow
 * can only be fake, and a fake reset is worse than none: it teaches users that
 * a code arrived when nothing was sent. Recovery is an operations script run
 * against the database, or delete-and-re-register. Adding an email provider is a
 * scope amendment, not a task.
 */
export const authRouter = Router();

function failure(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ ok: false, error, message });
}

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return failure(res, 422, 'invalid_params', 'Email and password are required.');
    }

    assertValidPassword(password);

    if (await getAccountByEmail(email)) {
      // The same message for a taken address and a malformed one would be
      // marginally better for enumeration; different messages are more useful
      // to an honest user, so the honest message wins here.
      return failure(res, 409, 'email_taken', 'That address already has an account.');
    }

    const passwordHash = await hashPassword(password);
    const account = await createAccount(email, passwordHash);

    const session = await openSession(account.id);
    setSessionCookie(res, session.token, session.expiresAt);

    await recordAudit({
      accountId: account.id,
      action: 'SIGNED_UP',
      resourceType: 'Account',
      resourceId: account.id,
    });

    return res.status(201).json({
      ok: true,
      account: { id: account.id, email: account.email, createdAt: account.created_at },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create the account.';
    const isValidation = err instanceof RangeError;
    return failure(res, isValidation ? 422 : 500, isValidation ? 'invalid_params' : 'error', message);
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return failure(res, 422, 'invalid_params', 'Email and password are required.');
    }

    const account = await getAccountByEmail(email);

    // Verify against a dummy hash when the account is unknown, so the response
    // takes the same time whether or not the address exists. Without this, a
    // timing difference reveals which addresses are registered.
    const stored = account?.password_hash ?? (await timingHash());
    const ok = await verifyPassword(password, stored);

    if (!account || !ok) {
      return failure(res, 401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    // Transparent upgrade when the stored cost is below the current default, so
    // raising the parameters does not strand existing credentials.
    if (needsRehash(account.password_hash)) {
      await updatePasswordHash(account.id, await hashPassword(password));
    }

    const session = await openSession(account.id);
    setSessionCookie(res, session.token, session.expiresAt);

    await recordAudit({
      accountId: account.id,
      action: 'SIGNED_IN',
      resourceType: 'Account',
      resourceId: account.id,
    });

    return res.json({
      ok: true,
      account: { id: account.id, email: account.email, createdAt: account.created_at },
    });
  } catch (err) {
    console.error('[auth] login failed:', err);
    return failure(res, 500, 'error', 'Could not sign in. Try again.');
  }
});

authRouter.post('/logout', requireIdentity, async (req: Request, res: Response) => {
  if (req.sessionId) await revokeSession(req.sessionId);
  clearSessionCookie(res);

  await recordAudit({
    accountId: req.accountId ?? null,
    action: 'SIGNED_OUT',
    resourceType: 'Account',
    resourceId: req.accountId ?? null,
  });

  return res.json({ ok: true });
});

/** The signed-in account, or 401. Never returns the password hash. */
authRouter.get('/session', requireIdentity, async (req: Request, res: Response) => {
  const account = await getAccountById(req.accountId!);
  if (!account || account.status !== 'ACTIVE') {
    return failure(res, 401, 'unauthenticated', 'Sign in to continue.');
  }
  return res.json({
    ok: true,
    account: { id: account.id, email: account.email, createdAt: account.created_at },
  });
});

/**
 * Deletion, from the auth router.
 *
 * There is a second, equivalent route at `POST /v1/settings/delete-account`. Both
 * call `eraseAccountData` so neither can erase one store and skip the other. This
 * one previously called `markAccountDeleted` alone: it answered "ok" while every
 * statement, transaction, and evidence row the account owned stayed in the
 * relational store and in the in-memory maps. `/v1/settings/delete-account` had
 * already been fixed for the relational half; this copy was missed, which is exactly
 * the failure a shared helper exists to prevent.
 *
 * The audit entry is written first, and on purpose: it records that the erasure was
 * requested, which must survive the cascade that follows.
 */
authRouter.post(
  '/delete-account',
  requireIdentity,
  // The same limit the settings copy carries. An unauthenticated-adjacent endpoint
  // that erases an account on a single guessable path is worth bounding.
  rateLimit(DESTRUCTIVE_RATE_LIMIT),
  async (req: Request, res: Response) => {
    const accountId = req.accountId!;

    try {
      await recordAudit({
        accountId,
        action: 'DELETED',
        resourceType: 'Account',
        resourceId: accountId,
      });

      await eraseAccountData(accountId);
      await markAccountDeleted(accountId);
      clearSessionCookie(res);

      return res.json({
        ok: true,
        message: 'Account deleted, your data erased, and every session revoked.',
      });
    } catch (err) {
      console.error('[auth] delete-account failed:', err);
      return res.status(500).json({
        error: { code: 'DELETE_FAILED', message: 'Could not delete the account.' },
      });
    }
  },
);

/** Whether this deployment has any account, so the UI can choose a screen. */
authRouter.get('/has-account', async (_req: Request, res: Response) => {
  try {
    return res.json({ ok: true, hasAccount: await hasAnyAccount() });
  } catch {
    return failure(res, 500, 'error', 'Could not determine sign-up availability.');
  }
});

/**
 * A valid scrypt hash at the current cost, computed once and cached.
 *
 * Verifying against this when the address is unknown makes the response take
 * the same time whether or not the account exists. Without it, response latency
 * reveals which addresses are registered — a free account-enumeration oracle.
 */
let dummyHash: Promise<string> | null = null;

function timingHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = hashPassword('placeholder-for-timing-equalisation-only');
  }
  return dummyHash;
}
