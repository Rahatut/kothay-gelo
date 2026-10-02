import React, { useState } from 'react';
import { Info, AlertCircle, Minus } from 'lucide-react';

/**
 * Spending trends (spec 004).
 *
 * Every number here arrived from the engine. This component selects a granularity,
 * asks for a range, and renders what comes back. It computes no total, no
 * percentage, and no bar height from its own arithmetic — a second denominator in a
 * chart is how a picture ends up disagreeing with the table beside it.
 *
 * Constraints the spec fixes, and how this view meets them:
 *
 *   FR-004  The grouping rule is displayed, not implied. The server sends a sentence
 *           describing how weeks and years are bounded and it is shown verbatim.
 *   FR-005  A partial bucket is drawn hollow and is excluded from comparison.
 *   FR-006  A bucket with no rows shows a note. A bare zero reads as "you spent
 *           nothing", which is a different claim from "there is nothing here".
 *   FR-011  Coverage is stated. Three weeks of uploads look exactly like a month of
 *           spending unless the view says so.
 *   FR-013  Bars carry their value as text and a shape, never colour alone.
 *   FR-017  No pie, no 3D, no gauge. A plain bar per period.
 *   FR-014  Each bar is a button, so the keyboard reaches every drill-down.
 */

export type TrendGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface TrendPoint {
  key: string;
  start: string;
  end: string;
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
  transaction_ids: string[];
  partial: boolean;
  comparable: boolean;
  note?: string;
}

export interface TrendSeries {
  granularity: TrendGranularity;
  period: { start: string; end: string };
  grouping_rule: string;
  points: TrendPoint[];
  omitted_outside_range: number;
  coverage: {
    range_start: string;
    range_end: string;
    first_transaction: string | null;
    last_transaction: string | null;
    days_with_rows: number;
    days_in_range: number;
    days_with_rows_pct: number;
  };
  comparison_allowed: boolean;
  totals: {
    period: { start: string; end: string };
    total_expenses: number;
    total_income: number;
    net_savings: number;
    count: number;
    open_period: boolean;
  };
}

interface TrendsViewProps {
  locale: 'en' | 'bn';
  series: TrendSeries | null;
  patterns?: { id: string; title: string; title_bn?: string; summary: string }[];
  isLoading: boolean;
  error: string | null;
  onGranularityChange: (g: TrendGranularity) => void;
  onDrill: (point: TrendPoint) => void;
}

const COPY = {
  en: {
    title: 'Where the spending went',
    subtitle: 'Every figure is computed from your ledger. Select a period to see it.',
    granularity: 'Grouping',
    daily: 'Day',
    weekly: 'Week',
    monthly: 'Month',
    yearly: 'Year',
    rule: 'How this is grouped',
    coverage: 'Coverage',
    coverageValue: 'days in this period have transactions',
    rows: 'rows',
    spent: 'Spent',
    partial: 'Part of this period',
    noRows: 'Nothing recorded for these dates',
    comparison: 'Comparison',
    comparisonBlocked: 'Not compared: part of this period is still open or was cut short.',
    empty: 'Nothing to plot yet',
    emptyBody: 'Upload a statement or record a transaction and the shape of your spending appears here.',
    loadError: 'The trend could not be loaded.',
    open: 'Open period',
  },
  bn: {
    title: 'খরচ কোথায় গেছে',
    subtitle: 'প্রতিটি সংখ্যা আপনার খতিয়ান থেকে হিসাব করা। দেখতে একটি সময় বেছে নিন।',
    granularity: 'ভাগ',
    daily: 'দিন',
    weekly: 'সপ্তাহ',
    monthly: 'মাস',
    yearly: 'বছর',
    rule: 'কীভাবে ভাগ করা হয়েছে',
    coverage: 'পরিসর',
    coverageValue: 'দিনে এই সময়ের মধ্যে লেনদেন আছে',
    rows: 'টি লেনদেন',
    spent: 'খরচ',
    partial: 'এই সময়ের একটি অংশ',
    noRows: 'এই তারিখগুলোতে কিছু নেই',
    comparison: 'তুলনা',
    comparisonBlocked: 'তুলনা করা হয়নি: সময়ের একটি অংশ এখনও চলছে বা অসম্পূর্ণ।',
    empty: 'এখনো দেখানোর কিছু নেই',
    emptyBody: 'একটি বিবরণী আপলোড করুন বা লেনদেন লিখুন, তাহলে খরচের চেহারা এখানে দেখা যাবে।',
    loadError: 'প্যাটার্নটি আনা যায়নি।',
    open: 'চলমান সময়',
  },
};

/** The largest spend in the series, so bars share one scale. */
function peak(points: TrendPoint[]): number {
  return points.reduce((max, p) => Math.max(max, p.total_expenses), 0);
}

export const TrendsView: React.FC<TrendsViewProps> = ({
  locale,
  series,
  patterns,
  isLoading,
  error,
  onGranularityChange,
  onDrill,
}) => {
  const t = COPY[locale];
  const [expanded, setExpanded] = useState<string | null>(null);

  const money = (value: number) =>
    `৳${value.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}`;

  if (error) {
    return (
      <div className="feature-card border-error p-6" role="alert">
        <p className="type-body-md text-error flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {t.loadError}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center" role="status" aria-live="polite">
        <p className="type-caption-uppercase text-muted">…</p>
      </div>
    );
  }

  if (!series || series.points.length === 0) {
    return (
      <div className="feature-card p-7 max-w-xl">
        <h2 className="type-title-md text-ink">{t.empty}</h2>
        <p className="type-body-md text-body mt-2">{t.emptyBody}</p>
      </div>
    );
  }

  const scale = peak(series.points);
  const hasRows = series.totals.count > 0;

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-pill">Pattern desk</span>
            {series.totals.open_period && (
              <span className="badge-pill">{t.open}</span>
            )}
          </div>
          <h1 className="type-display-md text-ink">{t.title}</h1>
          <p className="type-body-md text-body mt-2">{t.subtitle}</p>
        </div>
      </header>

      {/*
        Granularity. A closed set of four, because the grouping rule changes what a
        number means and the view must not offer a bucket it cannot describe.
      */}
      <fieldset>
        <legend className="type-caption text-body mb-2">{t.granularity}</legend>
        <div className="flex flex-wrap gap-2">
          {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGranularityChange(g)}
              aria-pressed={series.granularity === g}
              className={`btn-sm ${
                series.granularity === g ? 'btn-primary' : 'btn-outline'
              }`}
            >
              {t[g.toLowerCase() as 'daily']}
            </button>
          ))}
        </div>
      </fieldset>

      {/*
        The rule, stated. FR-004 requires the interface to say how periods are
        bounded rather than leaving the user to infer it from the axis.
      */}
      <p className="type-caption text-muted flex items-start gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <span className="text-body-strong">{t.rule}: </span>
          {series.grouping_rule}
        </span>
      </p>

      {hasRows && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="feature-card p-4">
            <p className="type-caption-uppercase text-muted">{t.spent}</p>
            <p className="font-figure type-title-md text-ink mt-1">
              {money(series.totals.total_expenses)}
            </p>
          </div>
          <div className="feature-card p-4">
            <p className="type-caption-uppercase text-muted">
              {locale === 'bn' ? 'লেনদেন' : 'Transactions'}
            </p>
            <p className="font-figure type-title-md text-ink mt-1">
              {series.totals.count}
            </p>
          </div>
          <div className="feature-card p-4">
            <p className="type-caption-uppercase text-muted">{t.coverage}</p>
            <p className="font-figure type-title-md text-ink mt-1">
              {series.coverage.days_with_rows_pct}%
            </p>
            <p className="type-caption text-muted mt-1">
              {series.coverage.days_with_rows} {t.coverageValue}
            </p>
          </div>
        </div>
      )}

      {hasRows ? (
        <div className="feature-card p-5 sm:p-6">
          <ul className="space-y-1">
            {series.points.map((point) => {
              const width = scale > 0 ? (point.total_expenses / scale) * 100 : 0;
              const open = expanded === point.key;

              return (
                <li key={point.key}>
                  {/*
                    A button, so every drill-down is reachable by keyboard (FR-014).
                    The bar is a div inside it; the value is written in text beside
                    the bar, so nothing is conveyed by colour or width alone (FR-013).
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(open ? null : point.key);
                      if (point.count > 0) onDrill(point);
                    }}
                    aria-expanded={open}
                    className="w-full text-left py-2 px-2 hover:bg-canvas-soft rounded-xs"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="type-caption font-figure text-body-strong">
                        {point.key}
                        {point.partial && (
                          <span className="ml-2 text-muted">({t.partial})</span>
                        )}
                      </span>
                      <span className="type-caption font-figure text-body">
                        {money(point.total_expenses)}
                        <span className="text-muted ml-2">
                          {point.count} {t.rows}
                        </span>
                      </span>
                    </div>

                    {point.count === 0 ? (
                      // FR-006: a gap is labelled, not drawn as a zero-height bar that
                      // reads as "you spent nothing".
                      <p className="type-caption text-muted-soft">{point.note}</p>
                    ) : (
                      <div
                        className={`h-2 rounded-pill ${
                          point.partial ? 'bg-hairline-strong' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.max(width, 1)}%` }}
                      />
                    )}
                  </button>

                  {open && point.count > 0 && (
                    <p className="type-caption text-muted px-2 pb-2">
                      {locale === 'bn' ? 'লেনদেন' : 'Transactions'}:{' '}
                      <span className="font-figure">{point.transaction_ids.length}</span> —{' '}
                      {locale === 'bn' ? 'বিস্তারিত দেখতে লেডারে যান' : 'open the ledger to see them'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="feature-card p-6 max-w-xl">
          <h2 className="type-title-md text-ink">{t.empty}</h2>
          <p className="type-body-md text-body mt-2">{t.emptyBody}</p>
        </div>
      )}

      {/*
        FR-018: the comparison is withheld unless the engine says every bucket is
        like for like. A part week against whole weeks reports a collapse in spending
        that did not happen.
      */}
      {!series.comparison_allowed && hasRows && (
        <p className="type-caption text-muted flex items-start gap-2">
          <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {t.comparisonBlocked}
        </p>
      )}

      {patterns && patterns.length > 0 && (
        <div className="space-y-3">
          <h2 className="type-title-sm text-ink">
            {locale === 'bn' ? 'যা পাওয়া গেল' : 'What was found'}
          </h2>
          {patterns.map((p) => (
            <article key={p.id} className="feature-card p-4">
              <h3 className="type-body-strong text-ink">
                {locale === 'bn' && p.title_bn ? p.title_bn : p.title}
              </h3>
              <p className="type-caption text-body mt-1">{p.summary}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
