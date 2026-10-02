import React, { useState } from 'react';
import { Search, FileText } from 'lucide-react';
import { Transaction, Category } from '../types';
import { ManualEntryTrigger } from './ManualEntryTrigger';
import { ManualEntryView } from './ManualEntryView';

interface TransactionsViewProps {
  transactions: Transaction[];
  categories: Category[];
  locale: 'en' | 'bn';
  onInspectEvidence: (tx: Transaction) => void;
  /**
   * Records a transaction the statement did not show (spec 003).
   *
   * Optional so the screen renders in a test harness and in the story sweep, which
   * supply data but no way to write. When it is absent the entry affordance is not
   * rendered at all, rather than rendered disabled: a control that cannot work
   * should not be on the page.
   *
   * The form is owned here rather than by the desk, so it opens directly beneath this
   * desk's trigger and is torn down with it. A form rendered by the desk shell would
   * outlive a tab change and appear on a page that has no entry affordance on it.
   */
  onCreateTransaction?: (input: {
    transaction_date: string;
    amount: string;
    direction: string;
    description: string;
    merchant_name?: string;
  }) => Promise<{
    created: {
      id: string;
      amount: number;
      currency: 'BDT';
      direction: 'EXPENSE' | 'INCOME';
      category_id: string;
      category_source: string;
      status: string;
    };
    duplicate: import('../types').DuplicateFlag | null;
    warnings: { field: string; code: string; reason: string; reason_bn: string }[];
  }>;
  /**
   * Called after a successful write. The confirmation panel stays up, so this is the
   * reload that puts the new row in the table behind the form rather than a close.
   */
  onEntrySaved?: () => void;
}

type TypeFilter = 'ALL' | 'DEBIT' | 'CREDIT';

const COPY = {
  en: {
    title: 'Canonical ledger',
    subtitle: 'Record of verified transactions with provenance metadata.',
    searchPlaceholder: 'Search counterparty, merchant, or line item',
    searchLabel: 'Search transactions',
    categoryLabel: 'Filter by category',
    typeLabel: 'Filter by direction',
    allCategories: 'All categories',
    typeAll: 'All types',
    typeDebit: 'Debit / outflow',
    typeCredit: 'Credit / inflow',
    date: 'Date',
    counterparty: 'Counterparty',
    category: 'Category',
    amount: 'Amount',
    evidence: 'Provenance',
    inspect: 'Inspect',
    emptyLedger: 'No transactions match the current filters.',
    uncategorized: 'Uncategorized',
    entries: 'verified entries',
  },
  bn: {
    title: 'মূল লেনদেন খতিয়ান',
    subtitle: 'যাচাইকৃত লেনদেনের স্থায়ী তালিকা।',
    searchPlaceholder: 'মার্চেন্ট বা লেনদেন অনুসন্ধান করুন',
    searchLabel: 'লেনদেন অনুসন্ধান',
    categoryLabel: 'ক্যাটাগরি দিয়ে ফিল্টার',
    typeLabel: 'ধরন দিয়ে ফিল্টার',
    allCategories: 'সব ক্যাটাগরি',
    typeAll: 'সব ধরনের',
    typeDebit: 'খরচ / ডেবিট',
    typeCredit: 'জমা / ক্রেডিট',
    date: 'তারিখ',
    counterparty: 'মার্চেন্ট',
    category: 'ক্যাটাগরি',
    amount: 'পরিমাণ',
    evidence: 'প্রমাণ',
    inspect: 'যাচাই',
    emptyLedger: 'অনুসন্ধানের সাথে কোনো লেনদেন মেলেনি।',
    uncategorized: 'শ্রেণিবিহীন',
    entries: 'যাচাইকৃত এন্ট্রি',
  },
} as const;

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  categories,
  locale,
  onInspectEvidence,
  onCreateTransaction,
  onEntrySaved,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [isEntryOpen, setIsEntryOpen] = useState(false);

  const t = COPY[locale];

  const filtered = transactions.filter((tx) => {
    const rawText = tx.raw_text_snippet || tx.description || '';
    const matchSearch =
      tx.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rawText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'ALL' || tx.category_id === selectedCategory;
    const isIncome = tx.direction === 'INCOME';
    const matchType =
      typeFilter === 'ALL' ||
      (typeFilter === 'DEBIT' && !isIncome) ||
      (typeFilter === 'CREDIT' && isIncome);
    return matchSearch && matchCat && matchType;
  });

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-6">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="badge-pill">Ledger desk</span>
          <span className="type-caption-uppercase text-muted">
            <span className="font-figure">{transactions.length}</span> {t.entries}
          </span>
        </div>
        <h1 className="type-display-md text-ink">{t.title}</h1>
        <p className="type-body-md text-body mt-2">{t.subtitle}</p>
        {onCreateTransaction && (
          <div className="mt-4">
            <ManualEntryTrigger
              locale={locale}
              onClick={() => setIsEntryOpen((open) => !open)}
              aria-expanded={isEntryOpen}
            />
          </div>
        )}
      </header>

      {/*
        Directly beneath the header and the button that opens it, and nowhere else.

        It previously rendered *inside* the <header>, which is inside its
        border-bottom and padding. A full feature-card form inside that box broke the
        header's layout badly enough that clicking the button looked like it had done
        nothing at all. It is a sibling now: same column, immediately under the
        button, still on this page and no other.
      */}
      {isEntryOpen && onCreateTransaction && (
        <ManualEntryView
          locale={locale}
          onSubmit={onCreateTransaction}
          // Not a teardown. The confirmation panel is how the user learns what was
          // recorded and whether it looked like a duplicate, so the form stays until
          // they dismiss it or close the trigger.
          onDone={() => onEntrySaved?.()}
          onDismiss={() => setIsEntryOpen(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <label htmlFor="ledger-search" className="sr-only">
            {t.searchLabel}
          </label>
          <input
            id="ledger-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="text-input pl-10"
          />
          <Search
            className="w-4 h-4 text-muted-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
        </div>

        <div className="md:col-span-3">
          <label htmlFor="ledger-category" className="sr-only">
            {t.categoryLabel}
          </label>
          <select
            id="ledger-category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-input"
          >
            <option value="ALL">{t.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'bn' ? c.name_bn || c.name : c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label htmlFor="ledger-type" className="sr-only">
            {t.typeLabel}
          </label>
          <select
            id="ledger-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="text-input"
          >
            <option value="ALL">{t.typeAll}</option>
            <option value="DEBIT">{t.typeDebit}</option>
            <option value="CREDIT">{t.typeCredit}</option>
          </select>
        </div>
      </div>

      <div className="border border-hairline bg-surface-card rounded-xl overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft">
              <th scope="col" className="p-4 type-caption-uppercase text-muted">
                {t.date}
              </th>
              <th scope="col" className="p-4 type-caption-uppercase text-muted">
                {t.counterparty}
              </th>
              <th scope="col" className="p-4 type-caption-uppercase text-muted">
                {t.category}
              </th>
              <th scope="col" className="p-4 type-caption-uppercase text-muted text-right">
                {t.amount}
              </th>
              <th scope="col" className="p-4 type-caption-uppercase text-muted text-center">
                {t.evidence}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center type-caption text-muted">
                  {t.emptyLedger}
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const cat = categories.find((c) => c.id === tx.category_id);
                const categoryName = locale === 'bn' ? cat?.name_bn || cat?.name : cat?.name;
                // The sentinel cat_uncategorized is a real row in DEFAULT_CATEGORIES, so
                // the lookup above resolves it. 'General' named no category anywhere.
                const categoryLabel = categoryName || t.uncategorized;
                const isDebit = tx.direction !== 'INCOME';

                return (
                  <tr key={tx.id} className="hover:bg-canvas-soft transition-colors">
                    <td className="p-4 font-figure type-caption text-muted whitespace-nowrap">
                      {tx.transaction_date}
                    </td>
                    <td className="p-4">
                      <p className="type-body-sm text-ink">{tx.merchant_name}</p>
                      {tx.raw_text_snippet && (
                        <p className="font-figure type-caption text-muted-soft truncate max-w-sm">
                          {tx.raw_text_snippet}
                        </p>
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span
                        className={`badge-pill ${
                          /[ঀ-৿]/.test(categoryLabel) ? 'font-bangla tracking-normal' : ''
                        }`}
                      >
                        {categoryLabel}
                      </span>
                    </td>
                    <td
                      className={`p-4 text-right font-figure type-body-sm whitespace-nowrap ${
                        isDebit ? 'text-ink' : 'text-success'
                      }`}
                    >
                      {isDebit ? '-' : '+'}৳{tx.amount.toLocaleString()}
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onInspectEvidence(tx)}
                        className="btn-outline btn-sm"
                      >
                        <FileText className="w-3 h-3" aria-hidden="true" />
                        <span>{t.inspect}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
