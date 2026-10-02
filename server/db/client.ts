import postgres from 'postgres';
import { databaseUrl, isPostgresDatabase, postgresUrl } from '../config';

/**
 * The single connection to durable storage.
 *
 * Supports two modes:
 * 1. Local development: libSQL/SQLite via @libsql/client (file: or libsql://)
 * 2. Production: Postgres via postgres.js (postgresql:// via Supabase pooler)
 *
 * The API surface (query, execute, transaction, hasAnyAccount, closeClient)
 * is identical regardless of the underlying driver.
 */

type LibsqlClient = {
  execute: (q: { sql: string; args: unknown[] } | [string, unknown[]?]) => Promise<{ rows: unknown[] }>;
  close: () => void;
  transaction: (mode: string) => Promise<{
    execute: (q: { sql: string; args: unknown[] } | [string, unknown[]?]) => Promise<{ rows: unknown[] }>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    close: () => void;
  }>;
};

let pgClient: postgres.Sql | null = null;
let libsqlClient: LibsqlClient | null = null;

async function getLibsqlClient(): Promise<LibsqlClient> {
  if (libsqlClient) return libsqlClient;
  const { createClient } = await import('@libsql/client');
  const url = databaseUrl();
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  libsqlClient = createClient({
    url,
    ...(authToken ? { authToken } : {}),
    intMode: 'number',
  }) as unknown as LibsqlClient;
  return libsqlClient;
}

function getPgClient(): postgres.Sql {
  if (pgClient) return pgClient;
  const url = postgresUrl();
  if (!url) {
    throw new Error('Postgres database requested but no connection URL found. Set DATABASE_URL or SUPABASE_APP_DB_URL.');
  }
  pgClient = postgres(url, {
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (v: number) => v.toString(),
        parse: (v: string) => Number(v),
      },
    },
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return pgClient;
}

function usePostgres(): boolean {
  return isPostgresDatabase();
}

/**
 * Runs a statement and returns rows.
 * Accepts either (sql, params[]) or { sql, args } object for compatibility.
 */
export async function query<T = Record<string, unknown>>(
  sqlOrObj: string | { sql: string; args: unknown[] },
  params: unknown[] = [],
): Promise<T[]> {
  const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
  const args = typeof sqlOrObj === 'string' ? params : sqlOrObj.args;

  if (usePostgres()) {
    const result = await getPgClient().unsafe(sqlText, args as any[]);
    return result as unknown as T[];
  } else {
    const client = await getLibsqlClient();
    const result = await client.execute({ sql: sqlText, args });
    return result.rows as unknown as T[];
  }
}

/** Runs a statement that returns no rows. Accepts (sql, params[]) or { sql, args }. */
export async function execute(
  sqlOrObj: string | { sql: string; args: unknown[] },
  params: unknown[] = [],
): Promise<void> {
  const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
  const args = typeof sqlOrObj === 'string' ? params : sqlOrObj.args;

  if (usePostgres()) {
    await getPgClient().unsafe(sqlText, args as any[]);
  } else {
    const client = await getLibsqlClient();
    await client.execute({ sql: sqlText, args });
  }
}

/**
 * Runs `fn` inside a transaction, committing on return and rolling back on
 * throw. Used wherever a partial write would leave a record without its
 * evidence, or an insight without its supporting rows.
 */
export async function transaction<T>(
  fn: (tx: { execute: (sql: string | { sql: string; args: unknown[] }, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>
): Promise<T> {
  if (usePostgres()) {
    return await getPgClient().begin(async (tx) => {
      const txWrapper = {
        execute: async (sqlOrObj: string | { sql: string; args: unknown[] }, params?: unknown[]) => {
          const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
          const args = typeof sqlOrObj === 'string' ? (params ?? []) : sqlOrObj.args;
          const result = await tx.unsafe(sqlText, args as any[]);
          return result as unknown as unknown[];
        },
      };
      const result = await fn(txWrapper);
      return result as T;
    }) as unknown as Promise<T>;
  } else {
    const client = await getLibsqlClient();
    const tx = await client.transaction('write');
    try {
      const txWrapper = {
        execute: async (sqlOrObj: string | { sql: string; args: unknown[] }, params?: unknown[]) => {
          const sqlText = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
          const args = typeof sqlOrObj === 'string' ? (params ?? []) : sqlOrObj.args;
          const result = await tx.execute({ sql: sqlText, args });
          return result.rows;
        },
      };
      const result = await fn(txWrapper);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    } finally {
      tx.close();
    }
  }
}

/**
 * Reports whether the database currently holds any account.
 */
export async function hasAnyAccount(): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM accounts WHERE status = 'ACTIVE'`,
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Closes the client. Used by tests and by an orderly shutdown. */
export function closeClient(): void {
  if (pgClient) {
    pgClient.end({ timeout: 5 });
    pgClient = null;
  }
  if (libsqlClient) {
    libsqlClient.close();
    libsqlClient = null;
  }
}

/** Returns the libsql client for migration runner (libSQL-only). */
export async function getClient(): Promise<LibsqlClient | null> {
  if (!usePostgres()) {
    return await getLibsqlClient();
  }
  return null;
}