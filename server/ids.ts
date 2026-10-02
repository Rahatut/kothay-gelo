import { randomUUID } from 'node:crypto';

/**
 * Prefixed, collision-resistant record identifiers.
 *
 * Identifiers previously came from `Date.now()`, which collides whenever two
 * records are created inside the same millisecond. That is routine: a single
 * statement yields many transaction rows, and two uploads can start together.
 * A UUID makes collision a non-event rather than a rare race that silently
 * overwrites one account's row with another's.
 */
function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export const newAccountId = (): string => newId('acct');
export const newSessionId = (): string => newId('sess');
export const newDocumentId = (): string => newId('doc');
export const newUploadId = (): string => newId('upl');
export const newTransactionId = (): string => newId('txn');
export const newEvidenceId = (): string => newId('evd');
export const newInsightId = (): string => newId('ins');
export const newRecommendationId = (): string => newId('rec');
export const newGoalId = (): string => newId('goal');
export const newConsentId = (): string => newId('cst');
export const newFeedbackId = (): string => newId('fb');
export const newAuditId = (): string => newId('aud');
export const newRequestId = (): string => newId('req');
export const newJobId = (): string => newId('job');
export const newCorrectionId = (): string => newId('cor');
