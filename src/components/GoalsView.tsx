import React, { useState } from 'react';
import { goalProgress } from '../../server/financialEngine';
import { Plus, Trash2 } from 'lucide-react';
import { SavingsGoal } from '../types';

interface GoalsViewProps {
  goals: SavingsGoal[];
  locale: 'en' | 'bn';
  onCreateGoal: (goal: Omit<SavingsGoal, 'id' | 'current_amount'>) => Promise<void>;
  onDeleteGoal?: (goalId: string) => Promise<void>;
}

const COPY = {
  en: {
    title: 'Savings targets',
    subtitle:
      'Map saved leak capital toward real targets in Bangladesh: emergency fund, DPS, Eid shopping.',
    addGoal: 'Create new target',
    nameLabel: 'Name / purpose',
    namePlaceholder: 'e.g. 3-month emergency buffer',
    amountLabel: 'Target amount (৳)',
    dateLabel: 'Target date',
    saveAction: 'Lock in target',
    cancelAction: 'Cancel',
    reached: 'reached',
    noGoals: 'No active savings targets set yet. Direct your recovered leaks toward a concrete goal.',
  },
  bn: {
    title: 'সঞ্চয় লক্ষ্য',
    subtitle: 'লিক থেকে বাঁচানো টাকা নির্দিষ্ট লক্ষ্য বা ডিপিএস-এ রূপান্তর করুন।',
    addGoal: 'নতুন লক্ষ্য নির্ধারণ করুন',
    nameLabel: 'নাম / উদ্দেশ্য',
    namePlaceholder: 'যেমন ৩ মাসের জরুরি তহবিল',
    amountLabel: 'লক্ষ্যমাত্রা (৳)',
    dateLabel: 'নির্ধারিত সময়সীমা',
    saveAction: 'লক্ষ্য নিশ্চিত করুন',
    cancelAction: 'বাতিল',
    reached: 'পূর্ণ',
    noGoals: 'এখনো কোনো সঞ্চয় লক্ষ্য নির্ধারণ করা হয়নি। বাঁচানো অর্থ দিয়ে একটি নতুন লক্ষ্য তৈরি করুন।',
  },
} as const;

export const GoalsView: React.FC<GoalsViewProps> = ({
  goals,
  locale,
  onCreateGoal,
  onDeleteGoal,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  // Empty, not prefilled. A goal form that opens already claiming the user wants
  // to save 10,000 by the end of the year states a financial intention on their
  // behalf, and the values then get saved. The previous defaults were 10000 and
  // 2026-12-31, which is the same class of fabrication as the row-count defaults
  // removed from the upload view.
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const t = COPY[locale];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    // Both fields are required in the form, but a goal with a zero or absent
    // target would render a progress figure that means nothing, so the value is
    // checked here rather than trusted to the browser.
    const amount = Number(targetAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!targetDate) return;

    await onCreateGoal({
      title,
      target_amount: amount,
      target_date: targetDate,
    });
    setTitle('');
    setTargetAmount('');
    setTargetDate('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-pill">Capital retention</span>
            <span className="type-caption-uppercase text-muted">Target audit</span>
          </div>
          <h1 className="type-display-md text-ink">{t.title}</h1>
          <p className="type-body-md text-body mt-2">{t.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="btn-primary shrink-0 self-start"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>{t.addGoal}</span>
        </button>
      </header>

      {showAdd && (
        <form onSubmit={handleSubmit} className="feature-card p-6">
          <p className="type-caption-uppercase text-muted mb-4">Set a realistic target in ৳ BDT</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="goal-title" className="type-caption text-body block mb-1">
                {t.nameLabel}
              </label>
              <input
                id="goal-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.namePlaceholder}
                className="text-input"
                required
              />
            </div>
            <div>
              <label htmlFor="goal-amount" className="type-caption text-body block mb-1">
                {t.amountLabel}
              </label>
              <input
                id="goal-amount"
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="text-input font-figure"
                required
              />
            </div>
            <div>
              <label htmlFor="goal-date" className="type-caption text-body block mb-1">
                {t.dateLabel}
              </label>
              <input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="text-input font-figure"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary">
              {t.saveAction}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-outline">
              {t.cancelAction}
            </button>
          </div>
        </form>
      )}

      {goals.length === 0 ? (
        <div className="feature-card p-12 text-center">
          <h2 className="type-display-sm text-ink mb-2">No targets active</h2>
          <p className="type-body-md text-body max-w-md mx-auto">{t.noGoals}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((goal) => {
            // One implementation, in the engine. This copy was unguarded, so a
            // goal with a zero target put `Infinity` into a style width and an
            // aria-valuenow.
            const pct = goalProgress(goal.current_amount, goal.target_amount);
            return (
              <article key={goal.id} className="feature-card p-6">
                <div className="flex items-start justify-between gap-3 border-b border-hairline pb-3 mb-4">
                  <h2 className="type-title-md text-ink">
                    {goal.title || goal.name ||
                      (locale === 'bn' ? 'সঞ্চয় লক্ষ্য' : 'Savings target')}
                  </h2>
                  <span className="badge-pill shrink-0">
                    <span className="font-figure">{pct}%</span> {t.reached}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                  <span className="font-figure type-display-sm text-ink">
                    ৳{goal.current_amount.toLocaleString()}
                  </span>
                  <span className="font-figure type-caption text-muted">
                    of ৳{goal.target_amount.toLocaleString()}
                  </span>
                </div>

                {/* No progressbar is rendered when the percentage is not
                    computable, rather than one reporting 0% -- which would
                    describe the goal as untouched rather than unmeasurable. */}
                {pct !== null ? (
                  <div
                    className="w-full h-1.5 rounded-pill bg-surface-strong overflow-hidden mb-4"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={goal.title || 'Savings target progress'}
                  >
                    <div className="h-full bg-primary rounded-pill" style={{ width: `${pct}%` }} />
                  </div>
                ) : (
                  <p className="type-caption text-muted-soft mb-4">
                    No target set, so progress cannot be measured.
                  </p>
                )}

                <div className="border-t border-hairline pt-3 flex items-center justify-between gap-3">
                  <span className="font-figure type-caption text-muted">
                    Deadline {goal.target_date}
                  </span>
                  {onDeleteGoal && (
                    <button
                      type="button"
                      onClick={() => onDeleteGoal(goal.id)}
                      className="btn-text text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
