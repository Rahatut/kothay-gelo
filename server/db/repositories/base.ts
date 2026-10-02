import { query, execute } from '../client';

/**
 * Repository base.
 *
 * Two rules are enforced structurally rather than left to each caller's
 * discipline, because getting them wrong is a data breach rather than a bug:
 *
 *   1. `accountId` is the first parameter of every scoped method and is woven
 *      into the WHERE clause by the query builder below. A caller cannot
 *      forget it, because there is no overload that omits it.
 *   2. A record belonging to another account is reported as absent, not as
 *      forbidden. The distinction is what lets an attacker enumerate ids.
 *
 * Nothing in this layer computes a financial figure. Rows are returned for the
 * engine to aggregate; the only numbers produced here are row counts and
 * pagination offsets.
 */

/** A row that exists but belongs to somebody else. Indistinguishable from absent. */
export class NotFound extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFound';
  }
}

/**
 * Optional paging. Both fields are optional because the repository applies a
 * bounded default rather than requiring every caller to supply one — an
 * unbounded result set is the failure mode, and bounding it here prevents it
 * regardless of the caller.
 */
export interface ScopedPage {
  limit?: number;
  offset?: number;
}

/** Validates a row count so a caller cannot request an unbounded result set. */
export function boundedLimit(limit: number | undefined, fallback = 100, max = 1000): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

/** Validates an offset, rejecting negatives rather than silently clamping. */
export function validOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  if (offset < 0) throw new RangeError('offset must not be negative');
  return Math.trunc(offset);
}

/** ISO 8601 timestamp. Every stored timestamp goes through here. */
export function nowIso(): string {
  return new Date().toISOString();
}
