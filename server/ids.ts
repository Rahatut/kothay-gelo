import { createHash, randomUUID } from 'node:crypto';

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

/**
 * Deterministic identifier derived from a seed.
 *
 * Insights and recommendations are replaced wholesale on every recompute. With a
 * random id, two recomputes over unchanged data produce different ids, so feedback
 * the user recorded against a recommendation (keyed by its id) is orphaned the next
 * time any transaction is added, edited, confirmed, or deleted. Seeding the id from
 * the record's own content keeps it stable while the record is unchanged, which is
 * what makes the feedback durable.
 */
function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

export const stableInsightId = (seed: string): string => stableId('ins', seed);
export const stableRecommendationId = (seed: string): string => stableId('rec', seed);

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
