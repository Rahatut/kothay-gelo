import React, { useState } from 'react';
import { Volume2, Calculator, Sparkles, RefreshCw } from 'lucide-react';
import { InsightRecommendation } from '../types';

interface InsightsViewProps {
  insights: InsightRecommendation[];
  locale: 'en' | 'bn';
  onInspectEvidence?: (txId: string) => void;
  onRefreshInsights: () => void;
  isRefreshing: boolean;
}

const COPY = {
  en: {
    title: 'Leak detector',
    subtitle:
      'Deterministic mathematical proofs paired with contextual narration. Every claim is verifiable.',
    refresh: 'Re-analyze with latest data',
    narrateBtn: 'Generate summary',
    narrating: 'Analyzing',
    potentialSavings: 'Estimated opportunity',
    proofFormula: 'Mathematical proof formula',
    confidence: 'Confidence',
    leak: 'Leak',
    synthesis: 'Verified synthesis',
    emptyState:
      'No leaks found in this statement cycle. Nothing to recover right now.',
  },
  bn: {
    title: 'মানি লিক ডিটেক্টর',
    subtitle: 'গাণিতিক সূত্রের ভিত্তিতে অপ্রয়োজনীয় খরচের সন্ধান এবং সমাধানের সুনির্দিষ্ট উপায়।',
    refresh: 'তথ্য পুনরায় বিশ্লেষণ করুন',
    narrateBtn: 'সারসংক্ষেপ তৈরি করুন',
    narrating: 'বিশ্লেষণ চলছে',
    potentialSavings: 'সম্ভাব্য সাশ্রয়',
    proofFormula: 'গাণিতিক প্রমাণের সূত্র',
    confidence: 'নির্ভরযোগ্যতা',
    leak: 'লিক',
    synthesis: 'যাচাইকৃত বিশ্লেষণ',
    emptyState: 'এই চক্রে কোনো অপ্রয়োজনীয় লিক শনাক্ত হয়নি।',
  },
} as const;

export const InsightsView: React.FC<InsightsViewProps> = ({
  insights,
  locale,
  onRefreshInsights,
  isRefreshing,
}) => {
  const [narratingId, setNarratingId] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState<{ [id: string]: string }>({});

  const t = COPY[locale];

  const handleNarrate = async (insightId: string) => {
    setNarratingId(insightId);
    try {
      const res = await fetch(`/v1/insights/${insightId}/narrate?lang=${locale}`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.data?.narration || json.narration || '';
        setNarrationText((prev) => ({ ...prev, [insightId]: text }));
      }
    } catch (err) {
      console.error('Narration error:', err);
    } finally {
      setNarratingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-pill">Leak taxonomy</span>
            <span className="type-caption-uppercase text-muted">Deterministic formulas</span>
          </div>
          <h1 className="type-display-md text-ink">{t.title}</h1>
          <p className="type-body-md text-body mt-2">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 self-start">
          <button
            type="button"
            onClick={onRefreshInsights}
            disabled={isRefreshing}
            className="btn-outline shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isRefreshing ? t.narrating : t.refresh}</span>
          </button>
        </div>
      </header>

      {insights.length === 0 ? (
        <div className="feature-card p-12 text-center">
          <h2 className="type-display-sm text-ink mb-2">Clean audit</h2>
          <p className="type-body-md text-body">{t.emptyState}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {insights.map((insight, idx) => {
            const title =
              locale === 'bn' ? insight.title_bn || insight.title : insight.title;
            const description =
              locale === 'bn'
                ? insight.description_bn || insight.description
                : insight.description;
            const actionText =
              locale === 'bn' ? insight.action_text_bn || insight.action_text : insight.action_text;
            const narration = narrationText[insight.id];
            const isNarrating = narratingId === insight.id;
            const hasSavings = Boolean(
              insight.potential_savings_bdt && insight.potential_savings_bdt > 0,
            );

            return (
              <article key={insight.id} className="feature-card p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4 mb-6">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge-pill">
                      {t.leak} {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="type-caption text-muted">
                      {insight.type.replace(/_/g, ' ')}
                    </span>
                    <span className="type-caption text-muted-soft">
                      {t.confidence} {Math.round(insight.confidence * 100)}%
                    </span>
                  </div>

                  {hasSavings && (
                    <div className="flex items-baseline gap-2">
                      <span className="type-caption text-muted">{t.potentialSavings}</span>
                      <span className="font-figure type-title-md text-success">
                        ~৳{insight.potential_savings_bdt!.toLocaleString()}
                        <span className="type-caption text-muted font-normal"> / mo</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h2 className="type-display-sm text-ink">{title}</h2>
                  <p className="type-body-md text-body max-w-3xl">{description}</p>

                  {insight.formula_explanation && (
                    <div className="bg-canvas border border-hairline rounded-md p-4">
                      <p className="type-caption-uppercase text-muted mb-1 flex items-center gap-1.5">
                        <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.proofFormula}</span>
                      </p>
                      <p className="font-figure type-caption text-ink">
                        {insight.formula_explanation}
                      </p>
                    </div>
                  )}

                  {narration && (
                    <div className="bg-surface-strong rounded-md p-4">
                      <p className="type-caption-uppercase text-muted mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.synthesis}</span>
                      </p>
                      <p className="type-body-sm text-ink">{narration}</p>
                    </div>
                  )}

                  <div className="pt-4 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <p className="type-body-sm text-ink">{actionText}</p>

                    <button
                      type="button"
                      onClick={() => handleNarrate(insight.id)}
                      disabled={isNarrating}
                      className="btn-outline btn-sm shrink-0"
                    >
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isNarrating ? t.narrating : t.narrateBtn}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
