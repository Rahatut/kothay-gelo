import React, { useState } from 'react';
import { Check, FileText, Pencil } from 'lucide-react';
import { Transaction, Category } from '../types';
import { extractionConfidenceOf } from '../provenance';

interface ReviewViewProps {
  transactions: Transaction[];
  categories: Category[];
  locale: 'en' | 'bn';
  onConfirmTransaction: (txId: string) => Promise<void>;
  onUpdateTransaction: (txId: string, updates: Partial<Transaction>) => Promise<void>;
  onInspectEvidence: (tx: Transaction) => void;
}

type FilterType = 'NEEDS_REVIEW' | 'DUPLICATES' | 'ALL';

const COPY = {
  en: {
    title: 'Evidence verification desk',
    subtitle:
      'Audit raw extraction candidates. Confirm predictions, reclassify categories, and resolve duplicate suspects.',
    tabNeedsReview: 'Needs confirmation',
    tabDuplicates: 'Duplicate suspects',
    tabAll: 'All transactions',
    confirmAllPrompt: 'Accept all filtered',
    editingTransaction: 'Editing transaction',
    merchantLabel: 'Merchant / counterparty',
    categoryLabel: 'Category',
    amountLabel: 'Amount (৳ BDT)',
    needsReviewTag: 'Confirm category',
    duplicateTag: 'Duplicate suspect',
    save: 'Save correction',
    cancel: 'Cancel',
    confirm: 'Accept',
    edit: 'Edit',
    inspectEvidence: 'Inspect proof',
    confidence: 'Confidence',
    uncategorized: 'Uncategorized',
    emptyReview: 'All caught up. Every transaction is locked in verified standing.',
  },
  bn: {
    title: 'তথ্যপ্রমাণ যাচাই ডেক্স',
    subtitle:
      'স্বয়ংক্রিয়ভাবে বের করা লেনদেনের তথ্য পর্যালোচনা করুন। ক্যাটাগরি সংশোধন বা ডুপ্লিকেট চিহ্নিত করে শতভাগ নির্ভুলতা নিশ্চিত করুন।',
    tabNeedsReview: 'যাচাই প্রয়োজন',
    tabDuplicates: 'ডুপ্লিকেট সন্দেহজনক',
    tabAll: 'সব লেনদেন',
    confirmAllPrompt: 'সবগুলো নিশ্চিত করুন',
    editingTransaction: 'লেনদেন সম্পাদনা হচ্ছে',
    merchantLabel: 'মার্চেন্ট / প্রাপক',
    categoryLabel: 'ক্যাটাগরি',
    amountLabel: 'পরিমাণ (৳ BDT)',
    needsReviewTag: 'ক্যাটাগরি নির্ধারণ',
    duplicateTag: 'ডুপ্লিকেট সন্দেহ',
    save: 'সংরক্ষণ',
    cancel: 'বাতিল',
    confirm: 'নিশ্চিত করুন',
    edit: 'সম্পাদনা',
    inspectEvidence: 'প্রমাণ দেখুন',
    confidence: 'নির্ভরযোগ্যতা',
    uncategorized: 'শ্রেণিবিহীন',
    emptyReview: 'সব যাচাই সম্পন্ন। প্রতিটি লেনদেন যাচাইকৃত অবস্থায় আছে।',
  },
} as const;

export const ReviewView: React.FC<ReviewViewProps> = ({
  transactions,
  categories,
  locale,
  onConfirmTransaction,
  onUpdateTransaction,
  onInspectEvidence,
}) => {
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editMerchant, setEditMerchant] = useState<string>('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [filterType, setFilterType] = useState<FilterType>('NEEDS_REVIEW');

  const t = COPY[locale];

  let filtered = transactions;
  if (filterType === 'NEEDS_REVIEW') {
    filtered = transactions.filter((tx) => tx.status === 'NEEDS_REVIEW');
  } else if (filterType === 'DUPLICATES') {
    filtered = transactions.filter((tx) => tx.is_duplicate_candidate);
  }

  const startEdit = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditCategory(tx.category_id);
    setEditMerchant(tx.merchant_name);
    setEditAmount(tx.amount);
  };

  const handleSave = async (txId: string) => {
    await onUpdateTransaction(txId, {
      category_id: editCategory,
      merchant_name: editMerchant,
      amount: editAmount,
      status: 'USER_EDITED',
      is_duplicate_candidate: false,
    });
    setEditingTxId(null);
  };

  const handleBulkConfirm = async () => {
    for (const tx of filtered) {
      await onConfirmTransaction(tx.id);
    }
  };

  const tabs: { id: FilterType; label: string; count: number }[] = [
    {
      id: 'NEEDS_REVIEW',
      label: t.tabNeedsReview,
      count: transactions.filter((tx) => tx.status === 'NEEDS_REVIEW').length,
    },
    {
      id: 'DUPLICATES',
      label: t.tabDuplicates,
      count: transactions.filter((tx) => tx.is_duplicate_candidate).length,
    },
    { id: 'ALL', label: t.tabAll, count: transactions.length },
  ];

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-pill">Audit workspace</span>
            <span className="type-caption-uppercase text-muted">Candidate triage</span>
          </div>
          <h1 className="type-display-md text-ink">{t.title}</h1>
          <p className="type-body-md text-body mt-2">{t.subtitle}</p>
        </div>

        {filtered.length > 0 && (
          <button
            type="button"
            onClick={handleBulkConfirm}
            className="btn-primary shrink-0 self-start"
          >
            {t.confirmAllPrompt} ({filtered.length})
          </button>
        )}
      </header>

      <div
        className="flex items-center gap-2 border-b border-hairline pb-3 overflow-x-auto"
        role="tablist"
        aria-label="Review queue filter"
      >
        {tabs.map((tab) => {
          const isActive = filterType === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilterType(tab.id)}
              className={`type-caption px-3.5 py-2 rounded-pill border transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-transparent text-body border-hairline hover:border-hairline-strong'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="feature-card p-12 text-center">
          <h2 className="type-display-sm text-ink mb-2">All caught up</h2>
          <p className="type-body-md text-body max-w-md mx-auto">{t.emptyReview}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((tx) => {
            const isEditing = editingTxId === tx.id;
            const catObj = categories.find((c) => c.id === tx.category_id);
            const categoryName = locale === 'bn' ? catObj?.name_bn || catObj?.name : catObj?.name;
            // The sentinel cat_uncategorized is a real row in DEFAULT_CATEGORIES, so the
            // lookup above resolves it. 'General' named no category anywhere.
            const categoryLabel = categoryName || t.uncategorized;
            // Only the EXTRACTED arm carries one. A hand-entered row gets no figure at
            // all rather than a 0% stand-in.
            const extractionConfidence = extractionConfidenceOf(tx);
            const isLocked =
              (tx.status as string) === 'ACCEPTED' || (tx.status as string) === 'CONFIRMED';

            return (
              <article key={tx.id} className="feature-card p-5 sm:p-6">
                {isEditing ? (
                  <div className="space-y-4">
                    <p className="type-caption-uppercase text-muted">
                      {t.editingTransaction} · <span className="font-figure">{tx.id}</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`m-${tx.id}`} className="type-caption text-body block mb-1">
                          {t.merchantLabel}
                        </label>
                        <input
                          id={`m-${tx.id}`}
                          type="text"
                          value={editMerchant}
                          onChange={(e) => setEditMerchant(e.target.value)}
                          className="text-input"
                        />
                      </div>
                      <div>
                        <label htmlFor={`c-${tx.id}`} className="type-caption text-body block mb-1">
                          {t.categoryLabel}
                        </label>
                        <select
                          id={`c-${tx.id}`}
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="text-input"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {locale === 'bn' ? c.name_bn || c.name : c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`a-${tx.id}`} className="type-caption text-body block mb-1">
                          {t.amountLabel}
                        </label>
                        <input
                          id={`a-${tx.id}`}
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(Number(e.target.value))}
                          className="text-input font-figure"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button type="button" onClick={() => handleSave(tx.id)} className="btn-primary">
                        {t.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTxId(null)}
                        className="btn-outline"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tx.status === 'NEEDS_REVIEW' && (
                          <span className="badge-pill">{t.needsReviewTag}</span>
                        )}
                        {tx.is_duplicate_candidate && (
                          <span className="type-caption-uppercase text-error">
                            {t.duplicateTag}
                          </span>
                        )}
                        <span className="font-figure type-caption text-muted">
                          {tx.transaction_date}
                        </span>
                        <span
                          className={`badge-pill ${
                            /[ঀ-৿]/.test(categoryLabel) ? 'font-bangla tracking-normal' : ''
                          }`}
                        >
                          {categoryLabel}
                        </span>
                      </div>

                      <p className="type-title-sm text-ink">{tx.merchant_name}</p>

                      {tx.raw_text_snippet && (
                        <p className="font-figure type-caption text-muted-soft bg-canvas border border-hairline rounded-xs px-2 py-1 max-w-xl truncate">
                          {tx.raw_text_snippet}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
                      <div className="text-left sm:text-right">
                        <p className="font-figure type-display-sm text-ink">
                          ৳{tx.amount.toLocaleString()}
                        </p>
                        {extractionConfidence !== null && (
                          <p className="type-caption text-muted-soft">
                            {t.confidence} {Math.round(extractionConfidence * 100)}%
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onInspectEvidence(tx)}
                          className="btn-outline btn-sm"
                          title="Audit raw document coordinates"
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.inspectEvidence}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => startEdit(tx)}
                          className="btn-outline btn-sm"
                          title="Correct merchant or category"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.edit}</span>
                        </button>

                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => onConfirmTransaction(tx.id)}
                            className="btn-primary btn-sm"
                            title="Accept and lock into verified ledger"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.confirm}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
