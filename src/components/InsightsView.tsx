import React, { useState } from 'react';
import { 
  Sparkles, 
  Volume2, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  TrendingUp, 
  Calculator,
  RefreshCw
} from 'lucide-react';
import { InsightRecommendation, Transaction } from '../types';

interface InsightsViewProps {
  insights: InsightRecommendation[];
  locale: 'en' | 'bn';
  onInspectEvidence?: (txId: string) => void;
  onRefreshInsights: () => void;
  isRefreshing: boolean;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  insights,
  locale,
  onInspectEvidence,
  onRefreshInsights,
  isRefreshing,
}) => {
  const [narratingId, setNarratingId] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState<{ [id: string]: string }>({});

  const t = {
    en: {
      title: 'LEAK DETECTOR & CLUE DOSSIERS',
      subtitle: 'Deterministic mathematical proofs paired with AI contextual investigations. Every statement is verifiable.',
      refresh: 'RE-ANALYZE WITH LATEST DATA',
      narrateBtn: 'GENERATE BILINGUAL SUMMARY',
      narrating: 'ANALYZING EVIDENCE...',
      potentialSavings: 'ESTIMATED OPPORTUNITY:',
      proofFormula: 'MATHEMATICAL PROOF FORMULA',
      confidence: 'CONFIDENCE',
      impactHigh: 'HIGH PRIORITY',
      impactMed: 'MODERATE',
      emptyState: 'No leaks found in this statement cycle. Outstanding financial discipline!',
    },
    bn: {
      title: 'মানি লিক ডিটেক্টর ও তদন্ত প্রতিবেদন',
      subtitle: 'গাণিতিক সূত্রের ভিত্তিতে অপ্রয়োজনীয় খরচের সন্ধান এবং সমাধানের সুনির্দিষ্ট উপায়।',
      refresh: 'তথ্য পুনরায় বিশ্লেষণ করুন',
      narrateBtn: 'দ্বিভাষিক সারসংক্ষেপ তৈরি করুন',
      narrating: 'বিশ্লেষণ চলছে...',
      potentialSavings: 'সম্ভাব্য সাশ্রয়:',
      proofFormula: 'গাণিতিক প্রমাণের সূত্র',
      confidence: 'নির্ভরযোগ্যতা',
      impactHigh: 'জরুরি অগ্রাধিকার',
      impactMed: 'মাঝারি',
      emptyState: 'এই চক্রে কোনো অপ্রয়োজনীয় লিক শনাক্ত হয়নি। চমৎকার আর্থিক শৃঙ্খলা!',
    },
  }[locale];

  const handleNarrate = async (insightId: string) => {
    setNarratingId(insightId);
    try {
      const res = await fetch(`/v1/insights/${insightId}/narrate?lang=${locale}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.data?.narration || json.narration || '';
        setNarrationText(prev => ({
          ...prev,
          [insightId]: text,
        }));
      }
    } catch (err) {
      console.error('Narration error:', err);
    } finally {
      setNarratingId(null);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="tape-tag bg-[#B7F34A]">LEAK TAXONOMY</span>
            <span className="font-mono text-xs uppercase font-bold text-[#171717]/60">
              DETERMINISTIC FORMULAS
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171717] tracking-tight">
            {t.title}
          </h1>
          <p className="font-display text-sm text-[#171717]/80 mt-1">
            {t.subtitle}
          </p>
        </div>

        <button
          onClick={onRefreshInsights}
          disabled={isRefreshing}
          className="brutalist-btn bg-white hover:bg-[#FFD84D] text-[#171717] px-4 py-2.5 text-xs font-bold shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'ANALYZING...' : t.refresh}</span>
        </button>
      </div>

      {/* Clue Dossier Cards */}
      {insights.length === 0 ? (
        <div className="brutalist-card p-12 text-center bg-white">
          <div className="font-display font-black text-2xl text-[#171717] mb-2">
            CLEAN AUDIT.
          </div>
          <p className="font-display text-sm text-[#171717]/80">
            {t.emptyState}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {insights.map((insight, idx) => {
            const title = locale === 'bn' ? insight.title_bn || insight.title : insight.title;
            const description = locale === 'bn' ? insight.description_bn || insight.description : insight.description;
            const actionText = locale === 'bn' ? insight.action_text_bn || insight.action_text : insight.action_text;
            const narration = narrationText[insight.id];
            const isNarrating = narratingId === insight.id;

            return (
              <div
                key={insight.id}
                className="brutalist-card p-6 sm:p-8 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]"
              >
                {/* Dossier Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#171717] pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-[#171717] text-[#B7F34A] px-2 py-0.5">
                      LEAK #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-xs font-bold bg-[#FFD84D] border border-[#171717] px-2 py-0.5">
                      {insight.type.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[11px] text-[#171717]/60">
                      {t.confidence}: {Math.round(insight.confidence * 100)}%
                    </span>
                  </div>

                  {Boolean(insight.potential_savings_bdt && insight.potential_savings_bdt > 0) && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs font-bold text-[#171717]/70">
                        {t.potentialSavings}
                      </span>
                      <span className="font-display font-black text-2xl text-[#171717]">
                        ~৳{(insight.potential_savings_bdt || 0).toLocaleString()}
                        <span className="text-xs font-normal"> / mo</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Insight Main Body */}
                <div className="space-y-4">
                  <h3 className="font-display font-black text-2xl text-[#171717]">
                    {title}
                  </h3>

                  <p className="font-display text-base text-[#171717]/90 leading-relaxed max-w-3xl">
                    {description}
                  </p>

                  {/* Mathematical Proof Box */}
                  {insight.formula_explanation && (
                    <div className="bg-[#F6F1E8] border-2 border-[#171717] p-4 shadow-[3px_3px_0px_#171717]">
                      <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase text-[#171717] mb-1">
                        <Calculator className="w-3.5 h-3.5" />
                        <span>{t.proofFormula}</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-[#171717]">
                        {insight.formula_explanation}
                      </div>
                    </div>
                  )}

                  {/* AI Bilingual Narration (Conversational synthesis) */}
                  {narration && (
                    <div className="brutalist-card-yellow p-4 border-2 border-[#171717] shadow-[3px_3px_0px_#171717]">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#171717] mb-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>VERIFIED AI SYNTHESIS (GEMINI)</span>
                      </div>
                      <p className="font-display text-sm font-bold text-[#171717] leading-relaxed">
                        {narration}
                      </p>
                    </div>
                  )}

                  {/* Action Recommendation */}
                  <div className="pt-4 border-t-2 border-[#171717] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="font-display text-sm font-bold text-[#171717] flex items-center gap-2">
                      <span className="w-2 h-2 bg-[#B7F34A] border border-[#171717]"></span>
                      <span>{actionText}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleNarrate(insight.id)}
                        disabled={isNarrating}
                        className="brutalist-btn brutalist-btn-sm bg-white hover:bg-[#FFD84D] text-[#171717] text-xs font-bold"
                      >
                        <Volume2 className="w-3.5 h-3.5 mr-1" />
                        <span>{isNarrating ? t.narrating : t.narrateBtn}</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
