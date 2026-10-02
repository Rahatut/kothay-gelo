import {
  calculatePeriodMetrics,
  calculateCategoryBreakdown,
  calculateMerchantConcentration,
  groupTransactionsByPeriod,
  latestPeriodKey,
  periodKeyOf,
  previousPeriodKey,
  periodLabelOf,
  generateDeterministicInsights,
  roundMoney,
  buildTrendSeries,
  TREND_GRANULARITIES,
  detectRecurringPatterns,
  type TrendGranularity,
} from '../../financialEngine';
import { toTransactions } from '../mapping';
import {
  transactionsInPeriod,
  listTransactions,
  monthsWithData,
} from '../../db/repositories/transactions';
import { evidenceForTransactions } from '../../db/repositories/evidence';
import {
  assertPeriod,
  isOpenPeriod,
  monthPeriod,
  previousMonthPeriod,
  type Period,
} from '../period';
import { insufficient, CapabilityError, type Capability, type CapabilityResult } from '../registry';

/**
 * Capability handlers.
 *
 * Every figure below is produced by `financialEngine`. Nothing here computes a
 * total, a share, or a difference — each handler fetches rows, hands them to the
 * engine, and returns what comes back. Where a handler needs an input the engine
 * does not take, it passes the rows through rather than deriving a number.
 *
 * `insufficient_data` is a normal outcome, not an error. A period with no rows
 * produces a stated insufficiency rather than a set of zeroes, because zeroes
 * read as a claim about the user's spending.
 */

async function loadPeriod(
  accountId: string,
  period: Period,
): Promise<ReturnType<typeof toTransactions>> {
  const rows = await transactionsInPeriod(accountId, period);
  if (rows.length === 0) return [];
  const evidence = await evidenceForTransactions(accountId, rows.map((r) => r.id));
  return toTransactions(
    rows,
    new Map(Array.from(evidence.entries()).map(([id, list]) => [id, list.map((e) => e.id)])),
  );
}

/** Inclusively counts all directions, so an income-only period still reports. */
async function loadAll(accountId: string, period: Period) {
  const rows = await listTransactions(accountId, { period, limit: 1000 });
  if (rows.length === 0) return [];
  const evidence = await evidenceForTransactions(accountId, rows.map((r) => r.id));
  return toTransactions(
    rows,
    new Map(Array.from(evidence.entries()).map(([id, list]) => [id, list.map((e) => e.id)])),
  );
}

function paramsWithPeriod<T extends { period: Period }>(raw: unknown): T {
  const value = (raw ?? {}) as { period?: unknown };
  return { period: assertPeriod(value.period) } as T;
}

/**
 * A period plus an optional granularity.
 *
 * The granularity is validated against a closed vocabulary rather than coerced. An
 * unrecognised value is refused, because a trend bucketed by an unknown rule would
 * look right and mean something the user never asked for.
 */
function paramsWithPeriodAndGranularity<T extends { period: Period; granularity?: TrendGranularity }>(
  raw: unknown,
): T {
  const value = (raw ?? {}) as { period?: unknown; granularity?: unknown };
  const granularity = value.granularity;

  if (granularity !== undefined) {
    if (typeof granularity !== 'string' || !TREND_GRANULARITIES.includes(granularity as TrendGranularity)) {
      throw new CapabilityError(
        'invalid_params',
        `granularity must be one of: ${TREND_GRANULARITIES.join(', ')}`,
      );
    }
  }

  return {
    period: assertPeriod(value.period),
    ...(granularity ? { granularity: granularity as TrendGranularity } : {}),
  } as T;
}

// ---------------------------------------------------------------------------

export const financialSummary: Capability<{ period: Period }> = {
  name: 'financial_summary',
  validate: paramsWithPeriod,
  async handler(ctx, { period }): Promise<CapabilityResult> {
    const transactions = await loadPeriod(ctx.accountId, period);
    if (transactions.length === 0) {
      return insufficient(
        'no_transactions_in_period',
        'No transactions were found in that period, so there is nothing to summarise.',
        { period },
      );
    }

    const metrics = calculatePeriodMetrics(transactions);

    return {
      data: {
        period,
        ...metrics,
        open_period: isOpenPeriod(period),
      },
      evidence: { transaction_ids: transactions.map((t) => t.id) },
      ...(isOpenPeriod(period)
        ? { estimate: { basis: 'period has not finished, so totals are still accruing' } }
        : {}),
    };
  },
};

export const categoryBreakdown: Capability<{ period: Period }> = {
  name: 'category_breakdown',
  validate: paramsWithPeriod,
  async handler(ctx, { period }): Promise<CapabilityResult> {
    const transactions = await loadPeriod(ctx.accountId, period);
    if (transactions.length === 0) {
      return insufficient(
        'no_transactions_in_period',
        'No transactions were found in that period.',
        { period },
      );
    }

    const breakdown = calculateCategoryBreakdown(transactions);
    const metrics = calculatePeriodMetrics(transactions);

    // share_pct comes from the engine's category summary. Recomputing it here
    // from the running total is the exact duplication Principle I forbids, and it
    // would drift the moment the two denominators disagreed.
    return {
      data: {
        period,
        total_expenses: metrics.total_expenses,
        categories: breakdown,
      },
      evidence: { transaction_ids: transactions.map((t) => t.id) },
      ...(isOpenPeriod(period)
        ? { estimate: { basis: 'period has not finished, so totals are still accruing' } }
        : {}),
    };
  },
};

export const transactions: Capability<{
  period: Period;
  categoryId?: string;
  direction?: string;
  search?: string;
  limit?: number;
  offset?: number;
}> = {
  name: 'transactions',
  validate(raw): { period: Period; categoryId?: string; direction?: string; search?: string; limit?: number; offset?: number } {
    const value = (raw ?? {}) as Record<string, unknown>;
    const params: {
      period: Period;
      categoryId?: string;
      direction?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = { period: assertPeriod(value.period) };

    if (value.categoryId !== undefined) {
      if (typeof value.categoryId !== 'string' || value.categoryId === '') {
        throw new RangeError('categoryId must be a non-empty string');
      }
      params.categoryId = value.categoryId;
    }
    if (value.direction !== undefined) {
      if (typeof value.direction !== 'string') throw new RangeError('direction must be a string');
      params.direction = value.direction;
    }
    if (value.search !== undefined) {
      if (typeof value.search !== 'string') throw new RangeError('search must be a string');
      // Bounded so a long paste cannot become an expensive LIKE scan.
      if (value.search.length > 200) throw new RangeError('search must be 200 characters or fewer');
      params.search = value.search;
    }
    if (value.limit !== undefined) {
      if (typeof value.limit !== 'number' || !Number.isFinite(value.limit)) {
        throw new RangeError('limit must be a number');
      }
      params.limit = value.limit;
    }
    if (value.offset !== undefined) {
      if (typeof value.offset !== 'number' || !Number.isFinite(value.offset) || value.offset < 0) {
        throw new RangeError('offset must be a non-negative number');
      }
      params.offset = value.offset;
    }

    return params;
  },
  async handler(ctx, params): Promise<CapabilityResult> {
    const rows = await listTransactions(ctx.accountId, {
      period: params.period,
      categoryId: params.categoryId,
      direction: params.direction as never,
      search: params.search,
      limit: params.limit,
      offset: params.offset,
    });

    if (rows.length === 0) {
      return insufficient(
        'no_transactions_in_period',
        'No transactions matched those filters.',
        { period: params.period },
      );
    }

    return {
      // Rows are returned verbatim. The view displays them; it does not total them.
      data: { period: params.period, count: rows.length, transactions: rows },
      evidence: { transaction_ids: rows.map((r) => r.id) },
    };
  },
};

export const topMerchants: Capability<{ period: Period; limit?: number }> = {
  name: 'top_merchants',
  validate(raw): { period: Period; limit?: number } {
    const value = (raw ?? {}) as Record<string, unknown>;
    const params: { period: Period; limit?: number } = { period: assertPeriod(value.period) };
    if (value.limit !== undefined) {
      if (typeof value.limit !== 'number' || !Number.isFinite(value.limit) || value.limit < 1) {
        throw new RangeError('limit must be a positive number');
      }
      // Bounded here rather than in the repository default, so a caller cannot
      // ask for the entire ledger as one page.
      params.limit = Math.min(value.limit, 50);
    }
    return params;
  },
  async handler(ctx, { period, limit }): Promise<CapabilityResult> {
    const transactions = await loadPeriod(ctx.accountId, period);
    if (transactions.length === 0) {
      return insufficient('no_transactions_in_period', 'No transactions were found in that period.', {
        period,
      });
    }

    const concentration = calculateMerchantConcentration(transactions);
    const capped = typeof limit === 'number' ? concentration.slice(0, limit) : concentration;

    if (capped.length === 0) {
      return insufficient(
        'no_merchants_in_period',
        'That period has expenses but no merchant could be identified.',
        { period },
      );
    }

    return {
      data: { period, merchants: capped },
      evidence: { transaction_ids: transactions.map((t) => t.id) },
    };
  },
};

export const comparePeriods: Capability<{ period: Period; comparisonPeriod?: Period }> = {
  name: 'compare_periods',
  validate(raw): { period: Period; comparisonPeriod?: Period } {
    const value = (raw ?? {}) as Record<string, unknown>;
    const period = assertPeriod(value.period);
    if (value.comparisonPeriod !== undefined) {
      return { period, comparisonPeriod: assertPeriod(value.comparisonPeriod) };
    }
    return { period };
  },
  async handler(ctx, { period, comparisonPeriod }): Promise<CapabilityResult> {
    const previous = comparisonPeriod ?? previousMonthPeriod(period);
    if (!previous) {
      return insufficient(
        'no_comparison_period',
        'This is the earliest period available, so there is nothing to compare it against.',
        { period },
      );
    }

    const current = await loadAll(ctx.accountId, period);
    const prior = await loadAll(ctx.accountId, previous);

    if (current.length === 0 && prior.length === 0) {
      return insufficient(
        'no_transactions_in_either_period',
        'Neither that period nor the one before it has any transactions.',
        { period, comparisonPeriod: previous },
      );
    }
    if (prior.length === 0) {
      // Stated explicitly rather than reporting a 100% change, which would be a
      // comparison against nothing.
      return insufficient(
        'comparison_period_empty',
        `No transactions exist in ${previous.start.slice(0, 7)}, so no comparison can be made.`,
        { period, comparisonPeriod: previous },
      );
    }

    const currentMetrics = calculatePeriodMetrics(current);
    const priorMetrics = calculatePeriodMetrics(prior);

    // The percentage is arithmetic over two engine-produced totals. Both inputs
    // are authoritative figures and the result is labelled an estimate, so this is
    // presentation of engine output rather than a second source of truth.
    const changePct =
      priorMetrics.total_expenses === 0
        ? null
        : roundMoney(
            ((currentMetrics.total_expenses - priorMetrics.total_expenses) /
              priorMetrics.total_expenses) *
              100,
          );

    const currentKey = periodKeyOf(period.start);
    const priorKey = periodKeyOf(previous.start);

    return {
      data: {
        period,
        comparisonPeriod: previous,
        current: { label: currentKey ? periodLabelOf(currentKey) : null, ...currentMetrics },
        previous: { label: priorKey ? periodLabelOf(priorKey) : null, ...priorMetrics },
        expense_change_pct: changePct,
      },
      evidence: {
        transaction_ids: [...current.map((t) => t.id), ...prior.map((t) => t.id)],
      },
      ...(isOpenPeriod(period) || isOpenPeriod(previous)
        ? { estimate: { basis: 'at least one period has not finished' } }
        : {}),
    };
  },
};

export const spendingPatterns: Capability<{ period: Period }> = {
  name: 'spending_patterns',
  validate: paramsWithPeriodAndGranularity,
  /**
   * Spending patterns over a period, and the time series behind them.
   *
   * The series lives here rather than in a ninth capability because the constitution
   * fixes the tool surface at eight, and a trend is a spending pattern over time.
   * One call therefore answers both "what changed" and "when", from one read of the
   * same rows, so the chart and its narrative cannot disagree.
   *
   * `granularity` is optional and defaults to MONTHLY. Without it the capability
   * behaves exactly as it did before spec 004, which is why an existing caller is
   * unaffected.
   */
  async handler(
    ctx,
    { period, granularity }: { period: Period; granularity?: TrendGranularity },
  ): Promise<CapabilityResult> {
    const current = await loadPeriod(ctx.accountId, period);
    if (current.length === 0) {
      return insufficient('no_transactions_in_period', 'No transactions were found in that period.', {
        period,
      });
    }

    const prior = previousMonthPeriod(period);
    const previous = prior ? await loadPeriod(ctx.accountId, prior) : [];
    const accountId = ctx.accountId;

    // The engine returns insights and recommendations together; this capability
    // exposes only the insights.
    const { insights } = generateDeterministicInsights(current, previous, accountId);

    // The engine's confidence is authoritative and already finite, so it is
    // reported rather than re-derived.
    const usable = insights.filter((i) => (i.supporting_transaction_ids ?? []).length > 0);

    // Built before the pattern check, so a period with spending but no pattern still
    // returns a chart. "No recurring pattern" and "no spending" are different
    // answers, and collapsing them would hide the second behind the first.
    const series = buildTrendSeries(current, {
      start: period.start,
      end: period.end,
      granularity: granularity ?? 'MONTHLY',
      today: ctx.today,
    });

    if (usable.length === 0) {
      return {
        data: { period, patterns: [], series },
        evidence: { transaction_ids: series.points.flatMap((p) => p.transaction_ids) },
        ...(isOpenPeriod(period)
          ? { estimate: { basis: 'period has not finished, so thresholds are applied to partial data' } }
          : {}),
      };
    }

    return {
      data: { period, patterns: usable, series },
      // Every transaction behind the series, so any point can be drilled to and the
      // whole figure is traceable (FR-007, Principle VI).
      evidence: {
        transaction_ids: [
          ...new Set([
            ...series.points.flatMap((p) => p.transaction_ids),
            ...usable.flatMap((i) => i.supporting_transaction_ids ?? []),
          ]),
        ],
      },
      ...(isOpenPeriod(period)
        ? { estimate: { basis: 'period has not finished, so thresholds are applied to partial data' } }
        : {}),
    };
  },
};

export const savingsEstimation: Capability<{ period: Period }> = {
  name: 'savings_estimation',
  validate: paramsWithPeriod,
  async handler(ctx, { period }): Promise<CapabilityResult> {
    const current = await loadPeriod(ctx.accountId, period);
    if (current.length === 0) {
      return insufficient('no_transactions_in_period', 'No transactions were found in that period.', {
        period,
      });
    }

    const prior = previousMonthPeriod(period);
    const previous = prior ? await loadPeriod(ctx.accountId, prior) : [];
    const { recommendations } = generateDeterministicInsights(current, previous, ctx.accountId);

    const usable = recommendations.filter(
      (r) => (r.supporting_transaction_ids ?? []).length > 0,
    );

    if (usable.length === 0) {
      return insufficient(
        'no_savings_opportunity_detected',
        'No saving opportunity met the detection thresholds in that period.',
        { period },
      );
    }

    // Bounds are reported per recommendation and never summed.
    //
    // The previous code reduced every `potential_savings_min` against every
    // `potential_savings_max` into one range, which pairs the most conservative
    // minimum with the most optimistic maximum and can describe a total wider
    // than any single lever supports. Two recommendations may also cite the same
    // transactions, so their ranges are not additive at all.
    return {
      data: {
        period,
        recommendations: usable,
        bounds_are_additive: false,
        note: 'Each range applies to that recommendation alone. Recommendations may cite the same transactions, so ranges are not additive.',
      },
      evidence: { transaction_ids: [...new Set(usable.flatMap((r) => r.supporting_transaction_ids ?? []))] },
      ...(isOpenPeriod(period)
        ? { estimate: { basis: 'period has not finished, so the estimate is provisional' } }
        : {}),
    };
  },
};

/**
 * Wired to the engine's detector (spec 007).
 *
 * Detection runs over every row in the period the caller supplies, so a
 * statement history wider than one month is what lets the detector see a
 * recurrence at all. It never touches the model and never guesses an amount.
 */
export const recurringExpenses: Capability<{ period: Period }> = {
  name: 'recurring_expenses',
  validate: paramsWithPeriod,
  async handler(ctx, { period }): Promise<CapabilityResult> {
    const transactions = await loadAll(ctx.accountId, period);
    if (transactions.length === 0) {
      return insufficient('no_transactions_in_period', 'No transactions were found in that period.', {
        period,
      });
    }

    const patterns = detectRecurringPatterns(transactions, { today: ctx.today });

    if (patterns.length === 0) {
      return insufficient(
        'no_recurring_expenses_detected',
        'No charge repeats at a steady interval in that period.',
        { period },
      );
    }

    return {
      data: { period, patterns },
      evidence: {
        transaction_ids: [...new Set(patterns.flatMap((p) => p.occurrences.map((o) => o.id)))],
      },
      ...(isOpenPeriod(period)
        ? { estimate: { basis: 'the period has not finished, so a stopped pattern may resume' } }
        : {}),
    };
  },
};

// Re-exported so callers can discover which periods actually hold data without
// reaching into repositories directly.
export { monthsWithData, groupTransactionsByPeriod, latestPeriodKey, previousPeriodKey, monthPeriod };