import type { Request, Response } from 'express';
import { recordAudit } from '../db/repositories/audit';

/**
 * Auditable refusal for a resource the caller may not see.
 *
 * Two jobs, and both matter:
 *
 *   1. Records the attempt. Without this, adversarial probing leaves no trace —
 *      an attacker enumerating ids across tenants looks exactly like a quiet
 *      client. `OWNERSHIP_REFUSED` is what makes it visible afterwards.
 *   2. Sends the *same* body as a genuinely missing resource, because that
 *      indistinguishability is the property that stops enumeration. The audit
 *      write happens server-side and is never reflected in the response.
 *
 * The refusal message is deliberately generic. "You do not own this" would be
 * more helpful to the caller and would confirm the id exists, which is exactly
 * the information an attacker is fishing for.
 *
 * The audit entry carries no amount, no merchant name, and no statement text —
 * only that a refusal occurred, against what, for whom.
 */
export async function refuseNotFound(
  req: Request,
  res: Response,
  resourceType: string,
  resourceId: string | null,
  options: { code?: string; message?: string } = {},
): Promise<void> {
  try {
    await recordAudit({
      accountId: req.accountId ?? null,
      action: 'OWNERSHIP_REFUSED',
      resourceType,
      resourceId,
    });
  } catch (err) {
    // A failure to record must not convert a refusal into a 500. The access is
    // denied either way, and losing the audit line is the lesser harm.
    console.error('[audit] could not record refusal:', err);
  }

  res.status(404).json({
    error: {
      code: options.code ?? 'NOT_FOUND',
      message: options.message ?? `${resourceType} not found`,
      ...((req as Request & { requestId?: string }).requestId
        ? { request_id: (req as Request & { requestId?: string }).requestId }
        : {}),
    },
  });
}