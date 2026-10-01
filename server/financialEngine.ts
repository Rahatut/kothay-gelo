import { Transaction, Insight, Recommendation } from '../src/types';

export interface PeriodMetrics {
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
}

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
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

  // 1. Period Comparison
  if (prevTotal > 0 && currTotal > 0) {
    const diff = currTotal - prevTotal;
    const pctChange = roundMoney(((currTotal - prevTotal) / prevTotal) * 100);
    const sign = diff >= 0 ? '+' : '';
    insights.push({
      id: `ins_period_${Date.now()}`,
      user_id: userId,
      type: 'PERIOD_COMPARISON',
      title: `Monthly spend shifted ${sign}${pctChange}% vs last cycle`,
      title_bn: `আগের মাসের তুলনায় খরচ ${diff >= 0 ? 'বৃদ্ধি' : 'হ্রাস'} পেয়েছে ${Math.abs(pctChange)}%`,
      summary: `Total current period spending is ৳${currTotal.toLocaleString()} compared to ৳${prevTotal.toLocaleString()} in the previous window (${sign}৳${Math.abs(diff).toLocaleString()}).`,
      summary_bn: `চলতি সময়ের মোট খরচ ৳${currTotal.toLocaleString()}, যেখানে পূর্ববর্তী সময়ে ছিল ৳${prevTotal.toLocaleString()} (${sign}৳${Math.abs(diff).toLocaleString()})।`,
      calculation_version: 'v1.0-deterministic',
      supporting_transaction_ids: currentExpenses.map(t => t.id),
      evidence_ids: currentExpenses.flatMap(t => t.evidence_ids),
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
    if (prevVal && prevVal.amount > 0 && currVal.amount >= 1500) {
      const catPctChange = roundMoney(((currVal.amount - prevVal.amount) / prevVal.amount) * 100);
      if (catPctChange >= 20) {
        const catName = catId === 'cat_food' ? 'Food & Dining' : catId === 'cat_shopping' ? 'Shopping' : 'Category';
        const insId = `ins_cat_growth_${catId}_${Date.now()}`;
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
        const potentialMax = roundMoney((currVal.amount - prevVal.amount) * 0.7);
        if (potentialMin > 400) {
          recommendations.push({
            id: `rec_cat_${catId}_${Date.now()}`,
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

  // 3. Small Purchases Clustered (Micro-spend under ৳400)
  const microTxns = currentExpenses.filter(t => t.amount <= 400 && t.amount >= 25);
  if (microTxns.length >= 6) {
    const microTotal = sumExpenses(microTxns);
    const avgMicro = roundMoney(microTotal / microTxns.length);
    const insId = `ins_micro_${Date.now()}`;
    insights.push({
      id: insId,
      user_id: userId,
      type: 'SMALL_PURCHASES',
      title: `${microTxns.length} micro-payments aggregate to ৳${microTotal.toLocaleString()}`,
      title_bn: `${microTxns.length} টি ছোট লেনদেন মিলিয়ে মোট ৳${microTotal.toLocaleString()} খরচ হয়েছে`,
      summary: `Frequent low-denomination expenses under ৳400 (averaging ৳${avgMicro}) silently consumed ${currTotal > 0 ? roundMoney((microTotal / currTotal) * 100) : 0}% of your periodic expenditure.`,
      summary_bn: `৪০০ টাকার নিচে ছোট ছোট খরচগুলো (গড়ে ৳${avgMicro}) আপনার মোট ব্যয়ের ${currTotal > 0 ? roundMoney((microTotal / currTotal) * 100) : 0}% দখল করেছে।`,
      calculation_version: 'v1.0-deterministic',
      supporting_transaction_ids: microTxns.map(t => t.id),
      evidence_ids: microTxns.flatMap(t => t.evidence_ids),
      confidence: 0.95,
      status: 'ACTIVE',
      math_formula: `Sum of ${microTxns.length} transactions (≤ ৳400) = ৳${microTotal}`,
      metric_value: `৳${microTotal}`,
      created_at: now,
    });

    const potSavingsMin = roundMoney(microTotal * 0.25);
    const potSavingsMax = roundMoney(microTotal * 0.45);
    recommendations.push({
      id: `rec_micro_${Date.now()}`,
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
    if (val.count >= 5 && val.total >= 2000) {
      const insId = `ins_freq_${name.replace(/\s+/g, '_')}_${Date.now()}`;
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
        const orderCut = Math.max(2, Math.floor(val.count * 0.35));
        const recMin = roundMoney(orderCut * avgPerTxn * 0.85);
        const recMax = roundMoney(orderCut * avgPerTxn * 1.15);
        recommendations.push({
          id: `rec_freq_${name.replace(/\s+/g, '_')}_${Date.now()}`,
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
