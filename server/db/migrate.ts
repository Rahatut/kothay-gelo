import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { query, execute, transaction, closeClient, getClient } from './client';
import { isPostgresDatabase } from '../config';

/**
 * Migration runner.
 *
 * Hand-rolled on purpose. A migration framework earns its cost across multiple
 * dialects, environments, seeding strategies, and down-migrations; this project
 * has exactly one dialect and one database, and a framework would add a
 * dependency plus a config file to solve a problem a simple version table
 * already solves.
 *
 * For Postgres: uses a `schema_migrations` table with advisory lock for
 * concurrency. For SQLite: uses `PRAGMA user_version`.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations');

/** Postgres migrations directory. */
const PG_MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations-pg');

/** Migration filenames must sort numerically, so a leading zero count is fixed. */
const MIGRATION_FILENAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

interface Migration {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const dir = isPostgresDatabase() ? PG_MIGRATIONS_DIR : MIGRATIONS_DIR;
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
  const migrations: Migration[] = [];

  for (const filename of files) {
    const match = MIGRATION_FILENAME.exec(filename);
    if (!match) {
      throw new Error(
        `Migration filename "${filename}" does not match NNN_lowercase_name.sql`,
      );
    }
    migrations.push({
      version: Number(match[1]),
      name: filename.slice(4, -4),
      filename,
      sql: await readFile(path.join(dir, filename), 'utf8'),
    });
  }

  migrations.sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(
        `Duplicate migration version ${migrations[i].version}: ` +
          `"${migrations[i - 1].filename}" and "${migrations[i].filename}"`,
      );
    }
  }

  return migrations;
}

async function currentVersion(): Promise<number> {
  if (isPostgresDatabase()) {
    try {
      const rows = await query<{ version: number }>(
        `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`,
      );
      return rows[0]?.version ?? 0;
    } catch (err) {
      // Table doesn't exist yet (fresh database), version is 0
      return 0;
    }
  } else {
    const client = await getClient();
    if (!client) return 0;
    const result = await client.execute({ sql: 'PRAGMA user_version', args: [] });
    const row = result.rows[0] as unknown as { user_version?: number } | undefined;
    return Number(row?.user_version ?? 0);
  }
}

export interface MigrationResult {
  applied: string[];
  alreadyCurrent: number;
}

/**
 * Applies every migration newer than the current version, each in its own
 * transaction, then records the new version.
 *
 * For Postgres: uses pg_advisory_xact_lock to prevent concurrent applies.
 * For SQLite: uses executeMultiple on the client directly (not in a transaction).
 */
export async function migrate(): Promise<MigrationResult> {
  const migrations = await loadMigrations();
  const from = await currentVersion();
  const applied: string[] = [];

  for (const migration of migrations) {
    if (migration.version <= from) continue;

    if (isPostgresDatabase()) {
      await transaction(async (tx) => {
        // Acquire advisory lock for this migration version to prevent concurrent applies.
        await tx.execute(`SELECT pg_advisory_xact_lock($1)`, [migration.version]);

        // Execute the migration SQL. For Postgres, unsafe() accepts multi-statement strings.
        await tx.execute(migration.sql);

        // Record the version.
        await tx.execute(
          `INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, now())`,
          [migration.version, migration.name],
        );

        applied.push(migration.filename);
      });
    } else {
      const client = await getClient();
      if (!client) throw new Error('No libSQL client available');

      // Execute the migration SQL using executeMultiple (handles trigger bodies correctly).
      // @ts-expect-error - libSQL client has executeMultiple for multi-statement
      await client.executeMultiple(migration.sql);

      // Record the version in a separate transaction.
      const libsqlTx = await client.transaction('write');
      try {
        await libsqlTx.execute({ sql: `PRAGMA user_version = ${migration.version}`, args: [] });
        await libsqlTx.commit();
      } catch (err) {
        await libsqlTx.rollback().catch(() => {});
        throw err;
      } finally {
        libsqlTx.close();
      }

      applied.push(migration.filename);
    }
  }

  return { applied, alreadyCurrent: from };
}