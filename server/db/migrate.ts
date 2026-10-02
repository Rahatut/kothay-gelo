import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getClient } from './client';

/**
 * Migration runner.
 *
 * Hand-rolled on purpose. A migration framework earns its cost across multiple
 * dialects, environments, seeding strategies, and down-migrations; this project
 * has exactly one dialect and one database, and a framework would add a
 * dependency plus a config file to solve a problem `PRAGMA user_version`
 * already solves in one line.
 *
 * A query builder was explicitly rejected for the same reason it is rejected in
 * research.md Q3: it would pull SQL construction into route and service code,
 * where it competes with the financial engine as the place figures are produced.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations');

/** Migration filenames must sort numerically, so a leading zero count is fixed. */
const MIGRATION_FILENAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

interface Migration {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
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
      sql: await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8'),
    });
  }

  migrations.sort((a, b) => a.version - b.version);

  // A duplicated version number means the ordering is ambiguous, and an
  // out-of-order apply is far harder to diagnose than a duplicate filename.
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
  const result = await getClient().execute('PRAGMA user_version');
  const row = result.rows[0] as unknown as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

export interface MigrationResult {
  applied: string[];
  alreadyCurrent: number;
}

/**
 * Applies every migration newer than `PRAGMA user_version`, each in its own
 * transaction, then records the new version.
 *
 * The version is advanced inside the same transaction as the migration body, so
 * an interrupted apply rolls back to a consistent state rather than leaving
 * schema applied but unrecorded.
 */
export async function migrate(): Promise<MigrationResult> {
  const migrations = await loadMigrations();
  const from = await currentVersion();
  const applied: string[] = [];

  for (const migration of migrations) {
    if (migration.version <= from) continue;

    const tx = await getClient().transaction('write');
    try {
      // executeMultiple rather than a hand-rolled split: the driver iterates
      // statements with the SQLite parser, so BEGIN...END trigger bodies and
      // semicolons inside string literals are handled correctly. Splitting on
      // ';' would tear a trigger in half and fail with "incomplete input".
      await tx.executeMultiple(migration.sql);
      await tx.execute({ sql: `PRAGMA user_version = ${migration.version}` });
      await tx.commit();
      applied.push(migration.filename);
    } catch (err) {
      await tx.rollback().catch(() => {
        // Preserve the original failure; it names the offending statement.
      });
      throw new Error(
        `Migration ${migration.filename} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      tx.close();
    }
  }

  return { applied, alreadyCurrent: from };
}
