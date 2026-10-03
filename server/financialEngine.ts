import { Transaction, Insight, Recommendation } from '../src/types';
import { prefixedId, randomId } from '../src/lib/ids';

export interface PeriodMetrics {
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
}

/**
 * Rounds a BDT amount to two decimal places, half away from zero.
 *
 * The single rounding authority for the whole product, so it must be symmetric.
 * `Math.round((val + Number.EPSILON) * 100) / 100` looks correct but is not:
 * Number.EPSILON is far too small to nudge a negative value across the halfway
 * point, so -1.005 rounded to -1.00 while 1.005 correctly rounded to 1.01.
 * Asymmetric rounding silently loses a paisa on one sign only, which is exactly
 * the class of defect this engine exists to prevent.
 *
 * The epsilon must be added BEFORE scaling. Scaled values sit near 100, where
 * the spacing between representable doubles is about 1.4e-14 -- a thousand times
 * larger than Number.EPSILON, so adding epsilon afterwards is a no-op and
 * 1.005 collapses to 1.00.
 *
 * Collapses -0 to 0 so a rounded-down negative never surfaces as "-0".
 */
export function roundMoney(val: number): number {
  const scaled = (Math.abs(val) + Number.EPSILON) * 100;
  const rounded = Math.round(scaled);
  const magnitude = rounded / 100;
  if (magnitude === 0) return 0;
  return val < 0 ? -magnitude : magnitude;
}

/**
 * Progress toward a savings target, as a percentage.
 *
 * A figure about money, so it lives here rather than in each view that displays
 * a progress bar. It was previously computed independently in `DashboardView`
 * and `GoalsView`, which is exactly the duplication Principle I forbids — and the
 * `GoalsView` copy was unguarded, so a zero target produced `Infinity` or `NaN`
 * straight into a CSS width and an ARIA value.
 *
 * A target of zero or less has no meaningful percentage, so it yields null rather
 * than a number the user would read as progress.
 */
export function goalProgress(
  currentAmount: number,
  targetAmount: number,
): number | null {
  if (!Number.isFinite(currentAmount) || !Number.isFinite(targetAmount)) return null;
  if (targetAmount <= 0) return null;
  const pct = roundMoney((currentAmount / targetAmount) * 100);
  // Clamped for display: over-target progress is 100%, not 340%.
  return Math.min(Math.max(pct, 0), 100);
}

export function sumExpenses(transactions: Transaction[]): number {
  const sum = transactions
    .filter(t => t.direction === 'EXPENSE')
    .reduce((acc, t) => acc + t.amount, 0);
  return roundMoney(sum);
}

export function sumIncome(transactions: Transaction[]): number {
  const sum = transactions
    .filter(t => t.direction === 'INCOME')
    .reduce((acc, t) => acc + t.amount, 0);
  return roundMoney(sum);
}

export function calculatePeriodMetrics(transactions: Transaction[]): PeriodMetrics {
  const total_expenses = sumExpenses(transactions);
  const total_income = sumIncome(transactions);
  return {
    total_expenses,
    total_income,
    net_savings: roundMoney(total_income - total_expenses),
    count: transactions.length,
  };
}

// Period arithmetic. Principle I puts date ranges and period comparison in this
// engine, so a period is derived from the data instead of being written into a
// call site. Before this existed, server/db.ts filtered on a literal '2026-09'
// prefix and labelled the dashboard 'September 2026', which meant a row entered
// on any other date was listed but appeared in no total, breakdown, or insight.
//
// Deliberately clock-free and pure: 'which period is current' is product policy
// and belongs to the caller, while 'what period does this date fall in' is date
// math and belongs here. That split is what the contract requires.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_KEY = /^(\d{4})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, so this handles
  // February in leap years without a table of month lengths.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The 'YYYY-MM' period key a transaction date belongs to, or null when the date
 * is absent or not a canonical ISO calendar date.
 *
 * Rejects rather than coerces. `new Date('2026-02-31')` silently rolls into
 * March, which would file a row under a period the user never chose, and
 * `new Date(iso)` parses at UTC midnight but reads back in local time, so a
 * user west of Greenwich sees the row on the previous day. Day count is checked
 * explicitly instead.
 */
export function periodKeyOf(transactionDate: string): string | null {
  const parts = ISO_DATE.exec(transactionDate);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${parts[1]}-${parts[2]}`;
}

/**
 * The period key immediately before the given one, or null when the key is not a
 * canonical 'YYYY-MM' value.
 *
 * Year rollover is the case worth writing down: '2026-01' is '2025-12'. Month
 * arithmetic goes through Date.UTC rather than integer maths so that rollover
 * needs no special branch to get wrong.
 */
export function previousPeriodKey(periodKey: string): string | null {
  const parts = PERIOD_KEY.exec(periodKey);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  if (month < 1 || month > 12) return null;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Partitions a whole transaction set by period key, keyed in ascending order.
 *
 * Rows whose date cannot be placed are omitted rather than bucketed somewhere
 * arbitrary, so an unparseable date is visible as absence instead of inflating
 * some period's total.
 */
export function groupTransactionsByPeriod(
  transactions: Transaction[]
): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const key = periodKeyOf(transaction.transaction_date);
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(transaction);
    else grouped.set(key, [transaction]);
  }
  return new Map(
    Array.from(grouped.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );
}

/**
 * The most recent period key present in the data, or null when no row carries a
 * usable date. This is how a caller picks "current" without hardcoding a month.
 */
export function latestPeriodKey(transactions: Transaction[]): string | null {
  const grouped = groupTransactionsByPeriod(transactions);
  const keys = Array.from(grouped.keys());
  return keys.length > 0 ? keys[keys.length - 1] : null;
}

/** '2026-09' to 'September 2026'. Null when the key is not canonical. */
export function periodLabelOf(periodKey: string): string | null {
  const parts = PERIOD_KEY.exec(periodKey);
  if (!parts) return null;
  const month = Number(parts[2]);
  if (month < 1 || month > 12) return null;
  return `${MONTH_NAMES[month - 1]} ${parts[1]}`;
}

/**
 * The period key with the most expense transactions, or null when no row carries
 * a usable date. This is a stable "current period" for a dashboard: a single
 * newly-entered row cannot flip the headline totals the way `latestPeriodKey`
 * does. Ties are broken by choosing the later period, so a genuinely active
 * recent month still wins over a larger but older one.
 */
export function mostActivePeriodKey(transactions: Transaction[]): string | null {
  const grouped = groupTransactionsByPeriod(transactions);
  if (grouped.size === 0) return null;
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, bucket] of grouped) {
    const count = bucket.filter(t => t.direction === 'EXPENSE').length;
    if (count > bestCount || (count === bestCount && count > 0 && key > (bestKey ?? ''))) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}

export interface CategorySummary {
  category_id: string;
  amount: number;
  count: number;
  pct: number;
}

export function calculateCategoryBreakdown(transactions: Transaction[]): CategorySummary[] {
  const expenseTxns = transactions.filter(t => t.direction === 'EXPENSE');
  const total = sumExpenses(expenseTxns);
  if (total === 0) return [];

  const map = new Map<string, { amount: number; count: number }>();
  for (const t of expenseTxns) {
    const existing = map.get(t.category_id) || { amount: 0, count: 0 };
    existing.amount += t.amount;
    existing.count += 1;
    map.set(t.category_id, existing);
  }

  const result: CategorySummary[] = [];
  map.forEach((val, catId) => {
    result.push({
      category_id: catId,
      amount: roundMoney(val.amount),
      count: val.count,
      pct: roundMoney((val.amount / total) * 100),
    });
  });

  return result.sort((a, b) => b.amount - a.amount);
}

export interface MerchantSummary {
  merchant_name: string;
  amount: number;
  count: number;
  pct_of_spend: number;
}

export function calculateMerchantConcentration(transactions: Transaction[]): MerchantSummary[] {
  const expenseTxns = transactions.filter(t => t.direction === 'EXPENSE');
  const total = sumExpenses(expenseTxns);
  if (total === 0) return [];

  const map = new Map<string, { amount: number; count: number }>();
  for (const t of expenseTxns) {
    const name = t.merchant_name || 'Unspecified Merchant';
    const existing = map.get(name) || { amount: 0, count: 0 };
    existing.amount += t.amount;
    existing.count += 1;
    map.set(name, existing);
  }

  const result: MerchantSummary[] = [];
  map.forEach((val, name) => {
    result.push({
      merchant_name: name,
      amount: roundMoney(val.amount),
      count: val.count,
      pct_of_spend: roundMoney((val.amount / total) * 100),
    });
  });

  return result.sort((a, b) => b.amount - a.amount).slice(0, 7);
}

/**
 * Deterministic Insight Detection Engine
 * Section 34 - 37: Every insight has machine-readable provenance and valid math
 */
/**
 * The bare half of a prefixed id, for the ids that already contain a category or
 * merchant name and so cannot use `prefixedId` directly.
 *
 * Returns the literal `unavailable` rather than an invented hex string when the
 * runtime cannot mint one: an id that is visibly wrong is better than one that
 * looks real and would be filed as real.
 */
function randomIdPart(): string {
  return randomId() ?? 'unavailable';
}

/**
 * Detector thresholds, named and versioned.
 *
 * These were bare literals in the middle of the detectors, so a figure shown to a
 * user -- "8 orders", "under ৳400" -- had no stated basis and no way to be
 * audited. Each constant below records what it is for and why it has that value.
 * None of them is a measurement: they are the editorial line between "worth
 * mentioning" and "noise", and they are gathered here so that changing the
 * product's voice is one edit in one place rather than a search.
 *
 * They are not calibrated against user data, because none has been collected.
 * That is stated rather than implied: a threshold presented as evidence-derived
 * when it was chosen by judgement is the same defect as an unsourced total.
 */
export const DETECTOR_VERSION = 'detector-v1';

export const THRESHOLDS = {
  /**
   * A month-over-month rise is only worth reporting once it is large enough to
   * exceed ordinary variation between statements. ৳1,500 is roughly the smallest
   * rise that survives that, on a consumer statement.
   */
  notableIncreaseAmount: 1500,

  /**
   * A savings estimate below ৳400 is not worth the user's attention: it is inside
   * the range where the estimate itself is uncertain, so stating it would imply
   * more precision than the data supports.
   */
  minimumSavingsFloor: 400,

  /**
   * Micro-spend band. Below ৳400 and above ৳25: small enough that no single one is
   * worth noticing, large enough to be a real payment rather than a fee or a
   * top-up fragment.
   */
  microSpendMax: 400,
  microSpendMin: 25,

  /**
   * Share of micro-spend a user could plausibly redirect. 25% to 45%, never the
   * full total: the remaining transactions are the ones they actually wanted, and
   * a bound that reaches 100% would be a promise rather than an estimate.
   */
  microSavingsMinRate: 0.25,
  microSavingsMaxRate: 0.45,

  /**
   * A dependency is only worth naming when the merchant has been used repeatedly
   * and the total is material. Five uses and ৳2,000.
   */
  dependencyMinCount: 5,
  dependencyMinTotal: 2000,

  /**
   * Upper bound on the share of a rise that could be saved: 70%. The remainder is
   * assumed to be a price change or a one-off rather than a habit, so the
   * estimate never claims the whole difference is recoverable.
   */
  increaseMaxSavingsRate: 0.7,

  /**
   * A share of orders dropped when suggesting a cut: 35% of the count. Naming a
   * higher number of orders to cancel would be advice the evidence does not
   * support.
   */
  dependencyOrderCutRate: 0.35,
} as const;


export function generateDeterministicInsights(
  currentTxns: Transaction[],
  previousTxns: Transaction[],
  userId: string
): { insights: Insight[]; recommendations: Recommendation[] } {
  const insights: Insight[] = [];
  const recommendations: Recommendation[] = [];
  const now = new Date().toISOString();

  const currentExpenses = currentTxns.filter(t => t.direction === 'EXPENSE');
  const prevExpenses = previousTxns.filter(t => t.direction === 'EXPENSE');
  const currTotal = sumExpenses(currentExpenses);
  const prevTotal = sumExpenses(prevExpenses);

  /**
   * Rows responsible for the change between periods.
   *
   * A transaction counts as a mover when the counterparty appears in the current
   * window but not in the previous one, or when its current amount exceeds its
   * previous amount for that counterparty. Rows unchanged between periods are
   * excluded: they are part of the totals but not the explanation.
   */
  const previousByMerchant = new Map<string, number>();
  for (const t of prevExpenses) {
    previousByMerchant.set(
      t.merchant_name,
      roundMoney((previousByMerchant.get(t.merchant_name) ?? 0) + t.amount),
    );
  }

  const currentByMerchant = new Map<string, Transaction[]>();
  for (const t of currentExpenses) {
    const bucket = currentByMerchant.get(t.merchant_name);
    if (bucket) bucket.push(t);
    else currentByMerchant.set(t.merchant_name, [t]);
  }

  const movers = Array.from(currentByMerchant.entries())
    .filter(([merchant, rows]) => {
      const current = roundMoney(rows.reduce((sum, t) => sum + t.amount, 0));
      const previous = previousByMerchant.get(merchant) ?? 0;
      return current - previous > 0;
    })
    .flatMap(([, rows]) => rows)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25);

  // 1. Period Comparison
  //
  // Guarded on `movers` as well as on both totals being non-zero. When the two
  // periods are identical the change is 0%, and "Monthly spend shifted +0% vs
  // last cycle" is not a finding — it is the absence of one. It also cited
  // nothing, which Principle VI forbids for anything presented as a finding.
  if (prevTotal > 0 && currTotal > 0 && movers.length > 0) {
    const diff = currTotal - prevTotal;
    const pctChange = roundMoney(((currTotal - prevTotal) / prevTotal) * 100);
    const sign = diff >= 0 ? '+' : '';
    insights.push({
      id: prefixedId('ins_period'),
      user_id: userId,
      type: 'PERIOD_COMPARISON',
      title: `Monthly spend shifted ${sign}${pctChange}% vs last cycle`,
      title_bn: `আগের মাসের তুলনায় খরচ ${diff >= 0 ? 'বৃদ্ধি' : 'হ্রাস'} পেয়েছে ${Math.abs(pctChange)}%`,
      summary: `Total current period spending is ৳${currTotal.toLocaleString()} compared to ৳${prevTotal.toLocaleString()} in the previous window (${sign}৳${Math.abs(diff).toLocaleString()}).`,
      summary_bn: `চলতি সময়ের মোট খরচ ৳${currTotal.toLocaleString()}, যেখানে পূর্ববর্তী সময়ে ছিল ৳${prevTotal.toLocaleString()} (${sign}৳${Math.abs(diff).toLocaleString()})।`,
      calculation_version: 'v1.0-deterministic',
      // The rows that *moved*, not every row in the month.
      //
      // Citing all current expenses made the drill-down meaningless: tapping the
      // insight opened the entire month's ledger, so the user could not see which
      // transactions the 12% was actually about. Ranked by absolute contribution
      // so the largest movers come first, capped so the citation stays readable.
      supporting_transaction_ids: movers.map(t => t.id),
      evidence_ids: movers.flatMap(t => t.evidence_ids),
      confidence: 1.0,
      status: 'ACTIVE',
      math_formula: `(৳${currTotal} - ৳${prevTotal}) / ৳${prevTotal} = ${pctChange}%`,
      metric_value: `${sign}${pctChange}%`,
      created_at: now,
    });
  }

  // 2. High-spend category & Category Change (Food / Groceries / Transport)
  const currCatMap = new Map<string, { amount: number; txns: Transaction[] }>();
  for (const t of currentExpenses) {
    const entry = currCatMap.get(t.category_id) || { amount: 0, txns: [] };
    entry.amount += t.amount;
    entry.txns.push(t);
    currCatMap.set(t.category_id, entry);
  }

  const prevCatMap = new Map<string, { amount: number; txns: Transaction[] }>();
  for (const t of prevExpenses) {
    const entry = prevCatMap.get(t.category_id) || { amount: 0, txns: [] };
    entry.amount += t.amount;
    entry.txns.push(t);
    prevCatMap.set(t.category_id, entry);
  }

  // Check Category Growth
  currCatMap.forEach((currVal, catId) => {
    const prevVal = prevCatMap.get(catId);
    if (prevVal && prevVal.amount > 0 && currVal.amount >= THRESHOLDS.notableIncreaseAmount) {
      const catPctChange = roundMoney(((currVal.amount - prevVal.amount) / prevVal.amount) * 100);
      if (catPctChange >= 20) {
        const catName = catId === 'cat_food' ? 'Food & Dining' : catId === 'cat_shopping' ? 'Shopping' : 'Category';
        const insId = `ins_cat_growth_${catId}_${randomIdPart()}`;
        insights.push({
          id: insId,
          user_id: userId,
          type: 'CATEGORY_CHANGE',
          title: `${catName} spending surged by +${catPctChange}%`,
          title_bn: `${catName} খরচ +${catPctChange}% বৃদ্ধি পেয়েছে`,
          summary: `${catName} outlays rose from ৳${roundMoney(prevVal.amount).toLocaleString()} to ৳${roundMoney(currVal.amount).toLocaleString()} across ${currVal.txns.length} verified transactions.`,
          summary_bn: `${catName} খাতে খরচ পূর্বের ৳${roundMoney(prevVal.amount).toLocaleString()} থেকে বেড়ে ৳${roundMoney(currVal.amount).toLocaleString()} এ পৌঁছেছে (${currVal.txns.length} টি লেনদেন)।`,
          calculation_version: 'v1.0-deterministic',
          supporting_transaction_ids: currVal.txns.map(t => t.id),
          evidence_ids: currVal.txns.flatMap(t => t.evidence_ids),
          confidence: 0.98,
          status: 'ACTIVE',
          math_formula: `(৳${roundMoney(currVal.amount)} - ৳${roundMoney(prevVal.amount)}) / ৳${roundMoney(prevVal.amount)} = +${catPctChange}%`,
          metric_value: `+${catPctChange}%`,
          created_at: now,
        });

        // Recommendation linked to this surge
        const potentialMin = roundMoney((currVal.amount - prevVal.amount) * 0.4);
        const potentialMax = roundMoney((currVal.amount - prevVal.amount) * THRESHOLDS.increaseMaxSavingsRate);
        if (potentialMin > THRESHOLDS.minimumSavingsFloor) {
          recommendations.push({
            id: `rec_cat_${catId}_${randomIdPart()}`,
            user_id: userId,
            insight_id: insId,
            title: `Cap weekly ${catName} allowance`,
            title_bn: `${catName} খাতে সাপ্তাহিক বাজেট নির্ধারণ করুন`,
            description: `Reverting food orders or dining frequency by 3–4 outings per month will capture estimated savings between ৳${potentialMin.toLocaleString()} and ৳${potentialMax.toLocaleString()}.`,
            description_bn: `মাসে ৩-৪ বার বাইরের খাবার কমানো হলে আনুমানিক ৳${potentialMin.toLocaleString()} থেকে ৳${potentialMax.toLocaleString()} পর্যন্ত সাশ্রয় করা সম্ভব।`,
            potential_savings_min: potentialMin,
            potential_savings_max: potentialMax,
            calculation_method: `40% - 70% reduction on excess delta of ৳${roundMoney(currVal.amount - prevVal.amount)}`,
            calculation_version: 'v1.0-deterministic',
            supporting_transaction_ids: currVal.txns.map(t => t.id),
            action_type: 'BUDGET_CAP',
            created_at: now,
          });
        }
      }
    }
  });

  // 3. Small Purchases Clustered (micro-spend band)
  const microTxns = currentExpenses.filter(t => t.amount <= THRESHOLDS.microSpendMax && t.amount >= THRESHOLDS.microSpendMin);
  if (microTxns.length >= 6) {
    const microTotal = sumExpenses(microTxns);
    const avgMicro = roundMoney(microTotal / microTxns.length);
    const insId = prefixedId('ins_micro');
    insights.push({
      id: insId,
      user_id: userId,
      type: 'SMALL_PURCHASES',
      title: `${microTxns.length} micro-payments aggregate to ৳${microTotal.toLocaleString()}`,
      title_bn: `${microTxns.length} টি ছোট লেনদেন মিলিয়ে মোট ৳${microTotal.toLocaleString()} খরচ হয়েছে`,
      summary: `Frequent low-denomination expenses under ৳${THRESHOLDS.microSpendMax} (averaging ৳${avgMicro}) silently consumed ${currTotal > 0 ? roundMoney((microTotal / currTotal) * 100) : 0}% of your periodic expenditure.`,
      summary_bn: `৪০০ টাকার নিচে ছোট ছোট খরচগুলো (গড়ে ৳${avgMicro}) আপনার মোট ব্যয়ের ${currTotal > 0 ? roundMoney((microTotal / currTotal) * 100) : 0}% দখল করেছে।`,
      calculation_version: 'v1.0-deterministic',
      supporting_transaction_ids: microTxns.map(t => t.id),
      evidence_ids: microTxns.flatMap(t => t.evidence_ids),
      confidence: 0.95,
      status: 'ACTIVE',
      math_formula: `Sum of ${microTxns.length} transactions (≤ ৳${THRESHOLDS.microSpendMax}) = ৳${microTotal}`,
      metric_value: `৳${microTotal}`,
      created_at: now,
    });

    const potSavingsMin = roundMoney(microTotal * THRESHOLDS.microSavingsMinRate);
    const potSavingsMax = roundMoney(microTotal * THRESHOLDS.microSavingsMaxRate);
    recommendations.push({
      id: prefixedId('rec_micro'),
      user_id: userId,
      insight_id: insId,
      title: 'Consolidate discretionary micro-transactions',
      title_bn: 'ছোট ছোট বিচ্ছিন্ন খরচগুলোকে একত্র বা সীমিত করুন',
      description: `Grouping ride-hail short hops, impulse snacks, and repeated mobile recharges into structured routines can reclaim ৳${potSavingsMin.toLocaleString()}–৳${potSavingsMax.toLocaleString()} every month.`,
      description_bn: `ছোট ছোট রাইড, স্ন্যাকস বা ঘনঘন মোবাইল রিচার্জ সুনির্দিষ্ট নিয়মে আনলে মাসে ৳${potSavingsMin.toLocaleString()}–৳${potSavingsMax.toLocaleString()} পর্যন্ত সাশ্রয় হতে পারে।`,
      potential_savings_min: potSavingsMin,
      potential_savings_max: potSavingsMax,
      calculation_method: `25% - 45% reduction of ৳${microTotal} aggregate micro-spend`,
      calculation_version: 'v1.0-deterministic',
      supporting_transaction_ids: microTxns.map(t => t.id),
      action_type: 'REDUCE_FREQUENCY',
      created_at: now,
    });
  }

  // 4. Frequent Merchant Concentration (e.g. Foodpanda, Uber, Pathao)
  const merchantCountMap = new Map<string, { count: number; total: number; txns: Transaction[] }>();
  for (const t of currentExpenses) {
    const name = t.merchant_name || 'Unknown';
    const entry = merchantCountMap.get(name) || { count: 0, total: 0, txns: [] };
    entry.count += 1;
    entry.total += t.amount;
    entry.txns.push(t);
    merchantCountMap.set(name, entry);
  }

  merchantCountMap.forEach((val, name) => {
    if (val.count >= THRESHOLDS.dependencyMinCount && val.total >= THRESHOLDS.dependencyMinTotal) {
      const insId = `ins_freq_${name.replace(/\s+/g, '_')}_${randomIdPart()}`;
      const avgPerTxn = roundMoney(val.total / val.count);
      insights.push({
        id: insId,
        user_id: userId,
        type: 'MERCHANT_FREQUENCY',
        title: `High dependency on ${name} (${val.count} orders)`,
        title_bn: `${name} এ ঘনঘন লেনদেন (${val.count} বার)`,
        summary: `You transacted with ${name} ${val.count} times this period, totaling ৳${roundMoney(val.total).toLocaleString()} (average ৳${avgPerTxn} per checkout).`,
        summary_bn: `এই সময়ে ${name} এ মোট ${val.count} বার লেনদেনে মোট ৳${roundMoney(val.total).toLocaleString()} পরিশোধ করা হয়েছে (গড় ৳${avgPerTxn})।`,
        calculation_version: 'v1.0-deterministic',
        supporting_transaction_ids: val.txns.map(t => t.id),
        evidence_ids: val.txns.flatMap(t => t.evidence_ids),
        confidence: 0.99,
        status: 'ACTIVE',
        math_formula: `${val.count} transactions totaling ৳${roundMoney(val.total)}`,
        metric_value: `${val.count} orders`,
        created_at: now,
      });

      if (val.count >= 6) {
        const orderCut = Math.max(2, Math.floor(val.count * THRESHOLDS.dependencyOrderCutRate));
        const recMin = roundMoney(orderCut * avgPerTxn * 0.85);
        const recMax = roundMoney(orderCut * avgPerTxn * 1.15);
        recommendations.push({
          id: `rec_freq_${name.replace(/\s+/g, '_')}_${randomIdPart()}`,
          user_id: userId,
          insight_id: insId,
          title: `Reduce ${name} frequency by ~${orderCut} orders`,
          title_bn: `${name} এর ব্যবহার প্রায় ${orderCut} বার কমিয়ে আনুন`,
          description: `Trimming ${orderCut} orders at the current average ticket price of ৳${avgPerTxn} would retain an estimated ৳${recMin.toLocaleString()}–৳${recMax.toLocaleString()} in your account.`,
          description_bn: `বর্তমান গড় মূল্য ৳${avgPerTxn} হিসেবে ${orderCut} টি অর্ডার কমালে প্রতি মাসে আনুমানিক ৳${recMin.toLocaleString()}–৳${recMax.toLocaleString()} অবশিষ্ট থাকবে।`,
          potential_savings_min: recMin,
          potential_savings_max: recMax,
          calculation_method: `Trimming ${orderCut} orders at average ticket size of ৳${avgPerTxn} ± 15%`,
          calculation_version: 'v1.0-deterministic',
          supporting_transaction_ids: val.txns.map(t => t.id),
          action_type: 'REDUCE_FREQUENCY',
          created_at: now,
        });
      }
    }
  });

  return { insights, recommendations };
}

/**
 * Time-series bucketing for the trends view (spec 004).
 *
 * Every point here is computed by this module. The trends surface renders what
 * follows and computes nothing, so there is one denominator and one definition of
 * what a "day" or a "week" is, shared by the chart, the tooltip, and the drill-down.
 */

/**
 * Totals for a period. Mirrors the shape the capability layer already returns, so a
 * trend and a summary can be reconciled against each other by eye.
 */
export interface PeriodTotals {
  period: { start: string; end: string };
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
  open_period: boolean;
}

/** Granularity of a trend series. Fixed vocabulary; the client cannot invent one. */
export const TREND_GRANULARITIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;

export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

/**
 * The bucket a date falls into, and the bounds of that bucket.
 *
 * FR-004 requires the grouping rule to be stated in the interface, so it is stated
 * here once and reported to the client rather than implied by the shape of the
 * output:
 *
 *   - `DAILY`    one bucket per calendar day, `YYYY-MM-DD`
 *   - `WEEKLY`   one bucket per Monday-to-Sunday week, keyed by that Monday.
 *                ISO weeks, so a year always has 52 or 53 of them and week 1 is the
 *                week containing 4 January. A partial first or last week is marked,
 *                never silently dropped.
 *   - `MONTHLY`  one bucket per calendar month, `YYYY-MM`
 *   - `YEARLY`   one bucket per calendar year, `YYYY`
 */
export interface Bucket {
  /** The bucket's key, in the form named by the rule above. */
  key: string;
  start: string;
  end: string;
}

export function bucketFor(date: string, granularity: TrendGranularity): Bucket | null {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const parsed = new Date(ms);

  switch (granularity) {
    case 'DAILY':
      return { key: date, start: date, end: date };

    case 'MONTHLY': {
      const month = date.slice(0, 7);
      const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
      return {
        key: month,
        start: `${month}-01`,
        end: lastDay.toISOString().slice(0, 10),
      };
    }

    case 'YEARLY': {
      const year = date.slice(0, 4);
      return { key: year, start: `${year}-01-01`, end: `${year}-12-31` };
    }

    case 'WEEKLY': {
      const dayOfWeek = parsed.getUTCDay(); // 0 = Sunday
      // Monday-to-Sunday: shift so Monday is the origin.
      const offset = (dayOfWeek + 6) % 7;
      const monday = new Date(parsed.getTime() - offset * 86_400_000);
      const sunday = new Date(monday.getTime() + 6 * 86_400_000);
      return {
        key: monday.toISOString().slice(0, 10),
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
      };
    }
  }
}

/** Every bucket between two dates inclusive, with no gaps and no overlap. */
export function bucketRange(
  start: string,
  end: string,
  granularity: TrendGranularity,
): Bucket[] {
  const buckets: Bucket[] = [];
  const seen = new Set<string>();

  // Walk day by day and keep each new bucket once. Deriving the list from the
  // calendar rather than from the transactions is what makes a period with no
  // spending appear as a gap (FR-006) instead of vanishing.
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(first) || Number.isNaN(last) || first > last) return [];

  for (let t = first; t <= last; t += 86_400_000) {
    const bucket = bucketFor(new Date(t).toISOString().slice(0, 10), granularity);
    if (bucket && !seen.has(bucket.key)) {
      seen.add(bucket.key);
      buckets.push(bucket);
    }
  }
  return buckets;
}

export interface TrendPoint {
  key: string;
  start: string;
  end: string;
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
  /** Rows behind this point, so the surface can drill to them (FR-007). */
  transaction_ids: string[];
  /** True when the bucket extends past today, or its bounds fall outside the range. */
  partial: boolean;
  /**
   * True when the bucket could not be compared like for like: a partial bucket, or
   * one shorter than the full granularity length.
   *
   * FR-005 excludes these from period-over-period percentages. A partial week
   * compared against a whole one reports a false drop.
   */
  comparable: boolean;
  /** Set when the bucket has no rows. Carries a sentence, not just a zero (FR-006). */
  note?: string;
}

export interface TrendSeries {
  granularity: TrendGranularity;
  period: { start: string; end: string };
  /** The rule that produced the buckets, restated for the interface (FR-004). */
  grouping_rule: string;
  points: TrendPoint[];
  /**
   * How much of the range actually has rows behind it (FR-011).
   *
   * Reported because a chart of three weeks of uploads looks like a month of
   * spending, and the user cannot tell the difference without being told.
   */
  coverage: {
    range_start: string;
    range_end: string;
    first_transaction: string | null;
    last_transaction: string | null;
    days_with_rows: number;
    days_in_range: number;
    /** Percentage 0-100, rounded to one decimal. */
    days_with_rows_pct: number;
  };
  /** True when every bucket is comparable, so a comparison may be shown. */
  comparison_allowed: boolean;
  totals: PeriodTotals;
}

/** The grouping rule as a sentence, so the interface can state it rather than imply it. */
export function describeGrouping(granularity: TrendGranularity): string {
  switch (granularity) {
    case 'DAILY':
      return 'One point per calendar day.';
    case 'WEEKLY':
      return 'One point per week, Monday to Sunday, keyed by that Monday.';
    case 'MONTHLY':
      return 'One point per calendar month.';
    case 'YEARLY':
      return 'One point per calendar year.';
  }
}

/**
 * Groups a period's transactions into a trend series.
 *
 * FR-003: every transaction lands in exactly one bucket, because buckets come from
 * the calendar and each transaction is assigned by its own date. A transaction
 * outside the range is reported in `omitted` rather than being forced into a
 * neighbouring bucket.
 *
 * FR-012: manual entries are included on equal footing. There is no filter on
 * `extraction_method` anywhere in this module, and that is the point -- a figure
 * that excluded a payment the user typed in themselves would be wrong.
 */
export function buildTrendSeries(
  transactions: Transaction[],
  options: { start: string; end: string; granularity: TrendGranularity; today: string },
): TrendSeries & { omitted_outside_range: number } {
  const { start, end, granularity, today } = options;

  const buckets = bucketRange(start, end, granularity);
  const byKey = new Map<string, TrendPoint>(
    buckets.map((b) => [
      b.key,
      {
        key: b.key,
        start: b.start,
        end: b.end,
        total_expenses: 0,
        total_income: 0,
        net_savings: 0,
        count: 0,
        transaction_ids: [],
        partial: false,
        comparable: false,
      },
    ]),
  );

  let omitted = 0;
  for (const tx of transactions) {
    // FR-020: the caller supplies the range and it is used verbatim. The bucket is
    // found by the transaction's own date, never by the client choosing one.
    const bucket = bucketFor(tx.transaction_date, granularity);
    if (!bucket) {
      omitted++;
      continue;
    }
    const point = byKey.get(bucket.key);
    if (!point) {
      // Outside the selected range. Counted and left out, so a row cannot leak into
      // a neighbouring period's total.
      omitted++;
      continue;
    }

    const amount = roundMoney(tx.amount);
    if (tx.direction === 'INCOME') {
      point.total_income = roundMoney(point.total_income + amount);
    } else {
      point.total_expenses = roundMoney(point.total_expenses + amount);
    }
    point.count++;
    point.transaction_ids.push(tx.id);
  }

  const todayMs = Date.parse(`${today}T00:00:00Z`);

  for (const point of byKey.values()) {
    point.net_savings = roundMoney(point.total_income - point.total_expenses);

    // A bucket is partial when it runs past today, or when the selected range cuts
    // into it at either end.
    const startMs = Date.parse(`${point.start}T00:00:00Z`);
    const endMs = Date.parse(`${point.end}T00:00:00Z`);
    const truncatedAtStart = startMs < Date.parse(`${start}T00:00:00Z`);
    const truncatedAtEnd = endMs > Date.parse(`${end}T00:00:00Z`);

    point.partial = truncatedAtStart || truncatedAtEnd || endMs > todayMs;
    point.comparable = !point.partial && isFullBucket(point, granularity);
    point.total_expenses = roundMoney(point.total_expenses);
    point.total_income = roundMoney(point.total_income);

    if (point.count === 0) {
      // FR-006: a gap is shown, with a reason. A silent zero reads as "you spent
      // nothing that day", which is a different claim.
      point.note = point.partial
        ? 'No rows yet for this part of the period.'
        : 'No transactions recorded on these dates.';
    }
  }

  const points = [...byKey.values()];
  const withRows = points.filter((p) => p.count > 0);
  const dates = new Set<string>();
  for (const tx of transactions) {
    const inRange = tx.transaction_date >= start && tx.transaction_date <= end;
    if (inRange) dates.add(tx.transaction_date);
  }

  const daysInRange = Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  ) + 1;

  const sortedDates = [...dates].sort();

  const totalExpenses = roundMoney(
    points.reduce((sum, p) => sum + p.total_expenses, 0),
  );
  const totalIncome = roundMoney(points.reduce((sum, p) => sum + p.total_income, 0));

  return {
    granularity,
    period: { start, end },
    grouping_rule: describeGrouping(granularity),
    points,
    omitted_outside_range: omitted,
    coverage: {
      range_start: start,
      range_end: end,
      first_transaction: sortedDates[0] ?? null,
      last_transaction: sortedDates[sortedDates.length - 1] ?? null,
      days_with_rows: dates.size,
      days_in_range: Math.max(1, daysInRange),
      days_with_rows_pct:
        Math.round((dates.size / Math.max(1, daysInRange)) * 1000) / 10,
    },
    // FR-018: a comparison is only shown when every bucket is like for like.
    comparison_allowed: points.length > 0 && points.every((p) => p.comparable),
    totals: {
      period: { start, end },
      total_expenses: totalExpenses,
      total_income: totalIncome,
      net_savings: roundMoney(totalIncome - totalExpenses),
      count: points.reduce((sum, p) => sum + p.count, 0),
      open_period: buckets.some((b) => Date.parse(`${b.end}T00:00:00Z`) >= todayMs),
    },
  };
}

/**
 * Whether a bucket spans its whole granularity rather than a slice of one.
 *
 * A DAILY bucket is complete by construction. A WEEKLY one needs all seven days,
 * MONTHLY the whole month, YEARLY all 365/366.
 */
function isFullBucket(point: TrendPoint, granularity: TrendGranularity): boolean {
  const days =
    Math.round(
      (Date.parse(`${point.end}T00:00:00Z`) - Date.parse(`${point.start}T00:00:00Z`)) /
        86_400_000,
    ) + 1;

  switch (granularity) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return days === 7;
    case 'MONTHLY':
      return days >= 28 && days <= 31;
    case 'YEARLY':
      return days >= 365;
  }
}

// ---------------------------------------------------------------------------
// Recurring expense detection (spec 007)
// ---------------------------------------------------------------------------

export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface RecurringPattern {
  merchant: string;
  frequency: RecurringFrequency;
  /** 'provisional' for exactly two supporting occurrences, else 'confirmed'. */
  confidence: 'provisional' | 'confirmed';
  /** 'stopped' when the expected next charge is already past. */
  state: 'active' | 'stopped';
  occurrences: { id: string; date: string; amount: number }[];
  amount_min: number;
  amount_max: number;
  /** Max minus min across occurrences; zero when the amount is stable. */
  amount_variation: number;
  /** Monthly and annual cost, both derived from the occurrences. */
  monthly_cost: number;
  annual_cost: number;
  calculation_version: string;
}

const RECURRING_FREQUENCIES: { name: RecurringFrequency; targetDays: number; tolerance: number }[] = [
  { name: 'WEEKLY', targetDays: 7, tolerance: 2 },
  { name: 'MONTHLY', targetDays: 30, tolerance: 4 },
  { name: 'QUARTERLY', targetDays: 91, tolerance: 8 },
  { name: 'ANNUAL', targetDays: 365, tolerance: 15 },
];

function normaliseMerchantKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Detects standing commitments: a merchant paid at a steady interval.
 *
 * Rules, all derived from spec 007:
 *  - at least two occurrences, two being provisional and three or more
 *    confirmed (FR-003);
 *  - grouping is by normalised merchant name, per identity by construction
 *    since the caller passes one identity's rows (FR-002, FR-011);
 *  - the interval must be steady within tolerance for every gap (FR-007);
 *  - amounts that carry no stable centre are excluded (FR-015): a merchant
 *    whose "subscription" is anywhere between ৳50 and ৳5,000 is not a
 *    subscription the system can price;
 *  - monthly and annual costs come from the engine's own rounding (FR-006).
 */
export function detectRecurringPatterns(
  transactions: Transaction[],
  options: { today?: string } = {},
): RecurringPattern[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const expenses = transactions.filter(
    (t) => t.direction === 'EXPENSE' && t.amount > 0 && t.merchant_name,
  );

  const byMerchant = new Map<string, Transaction[]>();
  for (const t of expenses) {
    const key = normaliseMerchantKey(t.merchant_name);
    if (!key) continue;
    const bucket = byMerchant.get(key);
    if (bucket) bucket.push(t);
    else byMerchant.set(key, [t]);
  }

  const patterns: RecurringPattern[] = [];

  for (const rows of byMerchant.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(
        Math.round(
          (Date.parse(`${sorted[i].transaction_date}T00:00:00Z`) -
            Date.parse(`${sorted[i - 1].transaction_date}T00:00:00Z`)) /
            86_400_000,
        ),
      );
    }

    const frequency = RECURRING_FREQUENCIES.find((f) =>
      gaps.every((g) => Math.abs(g - f.targetDays) <= f.tolerance),
    );
    if (!frequency) continue;

    const amounts = sorted.map((t) => t.amount);
    const min = roundMoney(Math.min(...amounts));
    const max = roundMoney(Math.max(...amounts));
    const median = roundMoney([...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)]);

    if (max - min > median && max - min > 100) continue;

    const average = roundMoney(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    const monthly_cost =
      frequency.name === 'WEEKLY'
        ? roundMoney((average * 52) / 12)
        : frequency.name === 'QUARTERLY'
          ? roundMoney(average / 3)
          : frequency.name === 'ANNUAL'
            ? roundMoney(average / 12)
            : average;
    const annual_cost = roundMoney(monthly_cost * 12);

    const intervalDays = frequency.targetDays;
    const lastDate = sorted[sorted.length - 1].transaction_date;
    const daysSinceLast = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000,
    );
    // A pattern whose last charge is overdue by more than its own interval is a
    // stopped commitment, not an active one (FR-008).
    const state: 'active' | 'stopped' = daysSinceLast > intervalDays * 1.5 ? 'stopped' : 'active';

    patterns.push({
      merchant: sorted[0].merchant_name,
      frequency: frequency.name,
      confidence: sorted.length === 2 ? 'provisional' : 'confirmed',
      state,
      occurrences: sorted.map((t) => ({ id: t.id, date: t.transaction_date, amount: t.amount })),
      amount_min: min,
      amount_max: max,
      amount_variation: roundMoney(max - min),
      monthly_cost,
      annual_cost,
      calculation_version: 'recurring-v1',
    });
  }

  return patterns.sort((a, b) => b.annual_cost - a.annual_cost);
}
