import { monthsWithData } from '../db/repositories/transactions';
import { monthPeriod, previousMonthPeriod, type Period } from './period';

/**
 * Route-level period selection.
 *
 * The capability layer deliberately has no default period: a capability asked
 * about an unspecified period returns `invalid_params`, because defaulting to
 * "this month" silently answers a different question from the one asked.
 *
 * Resolving it here is a presentation decision rather than a data one — "show me
 * my most recent month" is a reasonable thing for a dashboard to display — so
 * the route picks the period and the capability computes within it.
 *
 * The period comes from the rows that actually exist, never from the clock and
 * never from a literal. The previous code filtered on the string '2026-09', so a
 * statement from any other month produced an empty summary with all totals zero
 * and no indication that anything was wrong.
 */

export interface ResolvedPeriod {
  period: Period;
  /** True when the period was chosen from available data rather than supplied. */
  inferred: boolean;
  /** Set when the account holds no dated rows at all. */
  reason?: string;
}

/**
 * The most recent calendar month that actually contains transactions.
 *
 * When the caller supplied `?month=YYYY-MM` that month is used verbatim, so an
 * old period stays reachable rather than snapping forward to the newest data.
 */
export async function resolvePeriod(
  accountId: string,
  requestedMonth?: string | null,
): Promise<ResolvedPeriod> {
  if (requestedMonth) {
    // Validated by monthPeriod, which rejects anything that is not a real
    // YYYY-MM, so a malformed query parameter cannot produce an odd range.
    return { period: monthPeriod(requestedMonth), inferred: false };
  }

  const months = await monthsWithData(accountId);
  if (months.length === 0) {
    return {
      period: { start: '', end: '' },
      inferred: true,
      reason: 'no_transactions',
    };
  }

  // monthsWithData sorts descending, so the first entry is the latest.
  return { period: monthPeriod(months[0]), inferred: true };
}

/**
 * The period immediately before the supplied one, or null at the earliest month.
 */
export function comparisonPeriodFor(period: Period): Period | null {
  return previousMonthPeriod(period);
}