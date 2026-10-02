import { periodKeyOf, previousPeriodKey } from '../financialEngine';

/**
 * Period handling for the capability layer.
 *
 * A period is resolved server-side and always explicit. There is no default
 * period: a capability that needs one returns `invalid_params` if it was not
 * supplied, because silently defaulting to "this month" answers a different
 * question from the one that was asked.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_KEY = /^\d{4}-\d{2}$/;

/** Maximum span. Five years is generous for a personal ledger and bounds the work. */
const MAX_SPAN_DAYS = 365 * 5;

export interface Period {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
}

export class InvalidPeriodError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPeriodError';
  }
}

/**
 * Validates a period.
 *
 * A malformed or reversed range must be rejected rather than clamped. Clamping
 * yields an empty result set, and an empty result set renders as "you spent
 * ৳0" — which reads as a fact about the user's spending rather than a bad
 * request.
 */
export function assertPeriod(period: unknown): Period {
  if (typeof period !== 'object' || period === null) {
    throw new InvalidPeriodError('period is required');
  }
  const { start, end } = period as { start?: unknown; end?: unknown };

  if (typeof start !== 'string' || typeof end !== 'string') {
    throw new InvalidPeriodError('period start and end are required');
  }
  if (!ISO_DATE.test(start)) {
    throw new InvalidPeriodError(`period start "${start}" is not YYYY-MM-DD`);
  }
  if (!ISO_DATE.test(end)) {
    throw new InvalidPeriodError(`period end "${end}" is not YYYY-MM-DD`);
  }
  if (!periodKeyOf(start) || !periodKeyOf(end)) {
    throw new InvalidPeriodError('period contains an impossible date');
  }
  if (start > end) {
    throw new InvalidPeriodError('period start must not be after period end');
  }

  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_SPAN_DAYS) {
    throw new InvalidPeriodError('period must not exceed five years');
  }

  return { start, end };
}

/** A whole calendar month, from a `YYYY-MM` key. */
export function monthPeriod(periodKey: string): Period {
  if (!PERIOD_KEY.test(periodKey) || !periodKeyOf(`${periodKey}-01`)) {
    throw new InvalidPeriodError(`"${periodKey}" is not a YYYY-MM period key`);
  }
  const [year, month] = periodKey.split('-');
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { start: `${periodKey}-01`, end: `${periodKey}-${String(lastDay).padStart(2, '0')}` };
}

/** The calendar month immediately before this one, as a period. */
export function previousMonthPeriod(period: Period): Period | null {
  const key = periodKeyOf(period.start);
  if (!key) return null;
  const previous = previousPeriodKey(key);
  return previous ? monthPeriod(previous) : null;
}

/** True when the period extends beyond today, so its figures are still accruing. */
export function isOpenPeriod(period: Period, today = new Date()): boolean {
  const todayIso = today.toISOString().slice(0, 10);
  return period.end > todayIso;
}

/** The most recent `YYYY-MM` key present in a period's rows, or null. */
export function periodKeyOfPeriod(period: Period): string {
  return periodKeyOf(period.start) ?? '';
}