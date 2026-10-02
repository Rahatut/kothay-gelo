import React, { useEffect, useState } from 'react';
import { Recommendation } from '../types';

interface RecommendationsViewProps {
  locale: 'en' | 'bn';
}

interface RecResponse {
  data: (Recommendation & { overlapping_recommendation_ids?: string[]; tracked?: boolean })[];
  note?: string;
}

const t = {
  en: {
    title: 'Saving recommendations',
    subtitle:
      'Each range belongs to its own transaction set. Ranges are not additive: acting on one does not guarantee the others.',
    method: 'Method',
    version: 'Version',
    supporting: 'Supporting transactions',
    overlap: 'Overlaps with',
    estimate: 'Estimate',
    tracked: 'Tracking — you reported acting on this',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    actedOn: 'Mark acted on',
    empty: 'No recommendations yet. Detected patterns turn into saving ideas here.',
    loading: 'Loading…',
  },
  bn: {
    title: 'সঞ্চয়ের পরামর্শ',
    subtitle:
      'প্রতিটি পরিসর নিজস্ব লেনদেনসেটের উপর ভিত্তি করে। এগুলো যোগ করা যাবে না: একটি করলেই অন্যটি নিশ্চিত নয়।',
    method: 'পদ্ধতি',
    version: 'সংস্করণ',
    supporting: 'সহায়ক লেনদেন',
    overlap: 'এর সাথে মিলে যায়',
    estimate: 'অনুমান',
    tracked: 'ট্র্যাক হচ্ছে — আপনি জানিয়েছেন যে এটি অনুসরণ করেছেন',
    helpful: 'সহায়ক',
    notHelpful: 'সহায়ক নয়',
    actedOn: 'অনুসরণ করা হয়েছে বলে চিহ্নিত করুন',
    empty: 'এখনো কোনো পরামর্শ নেই। ধরা পড়া খরচের ধরন এখানে পরামর্শে রূপ নেয়।',
    loading: 'লোড হচ্ছে…',
  },
};

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({ locale }) => {
  const copy = t[locale];
  const [recs, setRecs] = useState<RecResponse['data'] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/v1/recommendations', { credentials: 'include' });
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.data) {
      setRecs(payload.data);
      setNote(payload.note ?? null);
    } else {
      setRecs([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const feedback = async (id: string, feedback_type: string) => {
    await fetch(`/v1/recommendations/${id}/feedback`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback_type }),
    }).catch(() => undefined);
    await load();
  };

  if (recs === null) {
    return <p className="type-body-md text-body">{copy.loading}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-6">
        <h1 className="type-display-md text-ink">{copy.title}</h1>
        <p className="type-body-md text-body mt-2">{copy.subtitle}</p>
      </header>

      {note && <p className="type-caption text-muted">{note}</p>}

      {recs.length === 0 ? (
        <p className="type-body-md text-body">{copy.empty}</p>
      ) : (
        <ul className="space-y-4">
          {recs.map((rec) => (
            <li key={rec.id} className="feature-card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="type-title-md text-ink">{locale === 'bn' ? rec.title_bn || rec.title : rec.title}</h2>
                {rec.tracked && <span className="badge-pill">{copy.tracked}</span>}
              </div>

              <p className="type-body-md text-body">{locale === 'bn' ? rec.description_bn || rec.description : rec.description}</p>

              <p className="font-figure type-title-sm text-ink">
                ৳{rec.potential_savings_min.toLocaleString()} – ৳{rec.potential_savings_max.toLocaleString()}
                <span className="type-caption text-muted ml-2">({copy.estimate})</span>
              </p>

              <dl className="type-caption text-muted space-y-1">
                <div className="flex gap-2">
                  <dt>{copy.method}:</dt>
                  <dd className="text-body">{rec.calculation_method}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{copy.version}:</dt>
                  <dd className="text-body">{rec.calculation_version}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{copy.supporting}:</dt>
                  <dd className="text-body">{rec.supporting_transaction_ids?.length ?? 0}</dd>
                </div>
                {(rec.overlapping_recommendation_ids?.length ?? 0) > 0 && (
                  <div className="flex gap-2">
                    <dt>{copy.overlap}:</dt>
                    <dd className="text-body">{rec.overlapping_recommendation_ids!.join(', ')}</dd>
                  </div>
                )}
              </dl>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-outline btn-sm" onClick={() => void feedback(rec.id, 'helpful')}>
                  {copy.helpful}
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => void feedback(rec.id, 'not_helpful')}>
                  {copy.notHelpful}
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => void feedback(rec.id, 'acted_on')}>
                  {copy.actedOn}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
