import type {
  Category,
  DashboardResponse,
  DashboardSummary,
  DocumentRecord,
  Goal,
  InsightRecommendation,
  PeriodRange,
  Transaction,
} from '../types';

/**
 * Everything the app shows, loaded in one pass.
 *
 * Extracted out of `App.tsx` because the version inside the component could not be
 * tested. It called `txRes.clone()` after the body had already been read, which
 * throws, and the throw was swallowed by a `catch` that logged and moved on -- so
 * `summary` stayed null and the dashboard sat on "Initializing the desk" forever
 * with no message. Both halves of that are structural: the logic was unreachable
 * from a test, and a null summary carried no distinction between "not yet" and
 * "failed".
 *
 * There is no React in here, so the whole load path can be exercised against a
 * running server in a unit test.
 */

export interface AppData {
  summary: DashboardSummary | null;
  transactions: Transaction[];
  categories: Category[];
  insights: InsightRecommendation[];
  goals: Goal[];
  documents: DocumentRecord[];
  /**
   * Which endpoints failed, by name.
   *
   * Recorded rather than thrown. A ledger that failed to load is not a reason to
   * refuse to show the rest, but it is a reason to say so: a silently empty list
   * and a genuinely empty account look identical.
   */
  failed: string[];
}

const EMPTY: AppData = {
  summary: null,
  transactions: [],
  categories: [],
  insights: [],
  goals: [],
  documents: [],
  failed: [],
};

/**
 * A summary for an account that holds nothing.
 *
 * Every figure is zero because zero is what an empty ledger means, and `has_data`
 * is false so the view renders an empty state rather than a set of zeros that read
 * as a finding. The period is empty for the same reason: there is no month to report
 * on until something is uploaded.
 */
function emptySummary(): DashboardSummary {
  return {
    has_data: false,
    period: { start: '', end: '' },
    period_inferred: false,
    total_expenses: 0,
    total_income: 0,
    net_savings: 0,
    count: 0,
    needs_review_count: 0,
    categoryShares: [],
    potential_savings: null,
    top_merchants: [],
    expense_change_pct: null,
  };
}

/**
 * Calls one approved capability for a period.
 *
 * The period goes inside `params`, which is where the capability layer reads it
 * from. A failure is returned rather than thrown: a missing merchant ranking
 * should leave that one card absent, not blank the dashboard.
 */
export async function runCapability<T>(
  name: string,
  period: PeriodRange,
  baseUrl = '',
): Promise<{ ok: boolean; data?: T }> {
  try {
    const res = await fetch(`${baseUrl}/v1/capabilities/${name}`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { period } }),
    });
    if (!res.ok) return { ok: false };
    const payload = await res.json();
    return payload?.ok ? { ok: true, data: payload.data as T } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Turns the dashboard endpoint's response into the shape views consume.
 *
 * The endpoint returns a wrapper of period-scoped blocks; views want the totals
 * hoisted, the category shares as a plain array, and absence represented as null
 * rather than as zero.
 *
 * `expense_change_pct` stays null when `compare_periods` reports
 * `insufficient_data`. A first upload has no preceding period, and rendering that
 * as "0% vs prior cycle" states that spending was unchanged, which is a claim about
 * the user's money that no data supports.
 */
export async function toDashboardSummary(
  data: DashboardResponse,
  needsReviewCount: number,
  baseUrl = '',
): Promise<DashboardSummary> {
  const period: PeriodRange = data.period ?? { start: '', end: '' };
  const totals = data.summary;

  const [merchants, comparison] = await Promise.all([
    runCapability<{ merchants: DashboardSummary['top_merchants'] }>('top_merchants', period, baseUrl),
    runCapability<{ status?: string; change_pct?: number }>('compare_periods', period, baseUrl),
  ]);

  const changeRaw =
    comparison.ok && comparison.data?.status !== 'insufficient_data'
      ? comparison.data?.change_pct
      : undefined;

  return {
    has_data: true,
    period,
    period_inferred: data.period_inferred,
    total_expenses: totals?.total_expenses ?? 0,
    total_income: totals?.total_income ?? 0,
    net_savings: totals?.net_savings ?? 0,
    count: totals?.count ?? 0,
    needs_review_count: needsReviewCount,
    categoryShares: data.category_breakdown?.categories ?? [],
    potential_savings:
      data.savings && typeof data.savings.min === 'number' && typeof data.savings.max === 'number'
        ? { min: data.savings.min, max: data.savings.max }
        : null,
    top_merchants: merchants.ok ? (merchants.data?.merchants ?? []) : [],
    expense_change_pct: typeof changeRaw === 'number' ? changeRaw : null,
  };
}

/**
 * Loads every screen's data.
 *
 * Each response is read exactly once. The previous version read the transaction
 * body and then reached back for it with `.clone()`, which throws once the body is
 * consumed.
 *
 * A slice that fails is recorded in `failed` and left at its empty value; the rest
 * still load. One broken endpoint should cost one card, not the page.
 */
export async function loadAllData(baseUrl = ''): Promise<AppData> {
  const get = (path: string) => fetch(`${baseUrl}${path}`, { credentials: 'include' });

  let responses: Response[];
  try {
    responses = await Promise.all([
      get('/v1/dashboard'),
      get('/v1/transactions'),
      get('/v1/categories'),
      get('/v1/insights'),
      get('/v1/goals'),
      get('/v1/uploads'),
    ]);
  } catch (err) {
    // A failed fan-out means no endpoint answered at all.
    return { ...EMPTY, failed: ['network'] };
  }

  const [dashRes, txRes, catRes, insRes, goalsRes, docsRes] = responses;
  const failed: string[] = [];
  const out: AppData = { ...EMPTY, failed };

  const read = async <T,>(res: Response, name: string): Promise<T | null> => {
    if (!res.ok) {
      failed.push(name);
      return null;
    }
    try {
      return (await res.json()) as T;
    } catch {
      failed.push(name);
      return null;
    }
  };

  const txPayload = await read<{ data?: Transaction[] }>(txRes, 'transactions');
  const transactions = txPayload?.data ?? [];
  if (txPayload) out.transactions = transactions;

  const dashPayload = await read<{ data: DashboardResponse | null; status?: string }>(
    dashRes,
    'dashboard',
  );
  if (dashPayload && dashPayload.data === null) {
    // The endpoint answered `insufficient_data`: a successful response saying there
    // is nothing to show. Left as a null summary, the dashboard could not tell this
    // from a request still in flight and showed "Initializing the desk" forever.
    // Zeroed with `has_data: false`, so the view can say the account is empty.
    out.summary = emptySummary();
  } else if (dashPayload?.data) {
    try {
      out.summary = await toDashboardSummary(
        dashPayload.data,
        transactions.filter((t) => t.status === 'NEEDS_REVIEW').length,
        baseUrl,
      );
    } catch {
      // A dashboard that cannot be assembled is reported as failed rather than
      // left null, so the view can say so instead of loading forever.
      failed.push('dashboard');
    }
  }

  const catPayload = await read<{ data?: Category[] }>(catRes, 'categories');
  if (catPayload) out.categories = catPayload.data ?? [];

  const insPayload = await read<{ data?: InsightRecommendation[] }>(insRes, 'insights');
  if (insPayload) out.insights = insPayload.data ?? [];

  const goalsPayload = await read<{ data?: Goal[] }>(goalsRes, 'goals');
  if (goalsPayload) out.goals = goalsPayload.data ?? [];

  const docsPayload = await read<{ data?: DocumentRecord[] }>(docsRes, 'uploads');
  if (docsPayload) out.documents = docsPayload.data ?? [];

  return out;
}