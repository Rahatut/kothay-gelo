import { db } from './db';
import { purgeAccountData, type PurgeResult } from './db/repositories/purge';

/**
 * Erases one account from both stores this process holds.
 *
 * There are two stores: the relational one, which is durable, and the in-memory
 * `MemoryDatabase` maps, which several routes still read. Both must be cleared for
 * an erasure to be real.
 *
 * This existed as an inline block in the reset route only. `POST
 * /v1/settings/delete-account` purged the relational rows and left the in-memory
 * maps populated, so the user was told "your data erased" while their statements,
 * transaction text, and evidence stayed resident in the process and readable
 * through any route still reading memory. The inline block was also why
 * `evidence` and `processingJobs` were missed once: an account's own quoted
 * statement lines survived a purge that reported success.
 *
 * One helper, called by both routes, so a map added to one store cannot be
 * forgotten in the other.
 *
 * The in-memory pass runs even when the relational purge throws, because leaving
 * half the data behind is worse than reporting the failure.
 */
export async function eraseAccountData(accountId: string): Promise<PurgeResult> {
  let result: PurgeResult | null = null;
  let failure: unknown = null;

  try {
    result = await purgeAccountData(accountId);
  } catch (err) {
    failure = err;
  }

  clearMemory(accountId);

  if (failure) throw failure;
  return result!;
}

/**
 * Drops every in-memory row belonging to an account.
 *
 * `evidence` carries no account id, so it is reached through the documents that own
 * it, collected before the documents are removed themselves. Processing jobs may
 * carry either an account id or a document id, so both are checked.
 */
export function clearMemory(accountId: string): void {
  const documentIds = new Set(
    Array.from(db.documents.values())
      .filter((d) => d.user_id === accountId)
      .map((d) => d.id),
  );

  Array.from(db.evidence.values())
    .filter((e) => documentIds.has(e.document_id))
    .forEach((e) => db.evidence.delete(e.id));
  Array.from(db.processingJobs.values())
    .filter((j) => j.user_id === accountId || documentIds.has(j.document_id))
    .forEach((j) => db.processingJobs.delete(j.id));
  Array.from(db.transactions.values())
    .filter((t) => t.user_id === accountId)
    .forEach((t) => db.transactions.delete(t.id));
  Array.from(db.documents.values())
    .filter((d) => d.user_id === accountId)
    .forEach((d) => db.documents.delete(d.id));
  Array.from(db.insights.values())
    .filter((i) => i.user_id === accountId)
    .forEach((i) => db.insights.delete(i.id));
  Array.from(db.recommendations.values())
    .filter((r) => r.user_id === accountId)
    .forEach((r) => db.recommendations.delete(r.id));
  Array.from(db.goals.values())
    .filter((g) => g.user_id === accountId)
    .forEach((g) => db.goals.delete(g.id));

  // Keyed by account rather than holding an id, so the whole entry goes.
  db.consents.delete(accountId);
}