import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';
import { databaseUrl, databaseAuthToken } from '../config';

/**
 * The single connection to durable storage.
 *
 * Why a remote SQLite rather than a local file: the container filesystem is
 * ephemeral, so a local database loses every user's ledger on instance restart.
 * Cloud Run offers no durable volume — in-memory RAM dies with the instance,
 * ephemeral disk likewise, and Cloud Storage FUSE has no POSIX locking, which
 * corrupts SQLite. See specs/001-foundation-authority/research.md Q1.
 *
 * One client for the process. libSQL multiplexes over HTTP, so there is no
 * connection pool to size and no risk of exhausting sockets under concurrency.
 */

let client: Client | null = null;

export function getClient(): Client {
  if (client) return client;

  const url = databaseUrl();
  const authToken = databaseAuthToken();

  client = createClient({
    url,
    // A remote database without a token is unauthenticated. Fail loudly rather
    // than silently writing financial records to an anonymous database.
    ...(authToken ? { authToken } : {}),
    // Integers come back as plain numbers rather than bigint. This is the
    // library default; it is set explicitly because amounts and counts flow
    // straight into JSON responses, where a bigint would throw.
    intMode: 'number',
  });

  return client;
}

/**
 * Runs a statement and returns rows.
 *
 * Integers come back as bigint under the default protocol, which breaks JSON
 * serialisation and arithmetic alike. `intMode: 'number'` restores plain
 * numbers; SQLite integers beyond 2^53 are not used by this schema.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: InValue[] = [],
): Promise<T[]> {
  const result = await getClient().execute({ sql, args: params });
  return result.rows as unknown as T[];
}

/** Runs a statement that returns no rows. */
export async function execute(sql: string, params: InValue[] = []): Promise<void> {
  await getClient().execute({ sql, args: params });
}

/**
 * Runs `fn` inside a transaction, committing on return and rolling back on
 * throw. Used wherever a partial write would leave a record without its
 * evidence, or an insight without its supporting rows.
 */
export async function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  // client.transaction() resolves to the handle, so it must be awaited before
  // execute/commit can be called on it.
  const tx = await getClient().transaction('write');
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {
      // A rollback failure must not mask the original error, which is the one
      // that explains what actually went wrong.
    });
    throw err;
  } finally {
    tx.close();
  }
}

/**
 * Reports whether the database currently holds any account.
 *
 * Used to choose between the sign-up screen and the sign-in screen on a fresh
 * deployment. Deliberately counts only ACTIVE accounts: a soft-deleted account
 * must not suppress registration.
 */
export async function hasAnyAccount(): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM accounts WHERE status = 'ACTIVE'`,
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Closes the client. Used by tests and by an orderly shutdown. */
export function closeClient(): void {
  if (client) {
    client.close();
    client = null;
  }
}
