import React, { useState } from 'react';
import { Search, Filter, FileText, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { Transaction, Category } from '../types';

interface TransactionsViewProps {
  transactions: Transaction[];
  categories: Category[];
  locale: 'en' | 'bn';
  onInspectEvidence: (tx: Transaction) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  categories,
  locale,
  onInspectEvidence,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');

  const t = {
    en: {
      title: 'CANONICAL LEDGER',
      subtitle: 'Immutable record of verified transactions with provenance metadata.',
      searchPlaceholder: 'Search counterparty, merchant, or line item...',
      allCategories: 'ALL CATEGORIES',
      typeAll: 'ALL TYPES',
      typeDebit: 'DEBIT / OUTFLOW (৳)',
      typeCredit: 'CREDIT / INFLOW (৳)',
      date: 'DATE',
      counterparty: 'COUNTERPARTY / MERCHANT',
      category: 'CATEGORY',
      status: 'VERIFICATION',
      amount: 'AMOUNT',
      evidence: 'PROVENANCE',
      inspect: 'Inspect',
      emptyLedger: 'No transactions match current filters.',
    },
    bn: {
      title: 'মূল লেনদেন খতিয়ান',
      subtitle: 'যাচাইকৃত লেনদেনের স্থায়ী ও পরিবর্তন-অযোগ্য তালিকা।',
      searchPlaceholder: 'মার্চেন্ট বা লেনদেন অনুসন্ধান করুন...',
      allCategories: 'সব ক্যাটাগরি',
      typeAll: 'সব ধরনের',
      typeDebit: 'খরচ / ডেবিট (৳)',
      typeCredit: 'জমা / ক্রেডিট (৳)',
      date: 'তারিখ',
      counterparty: 'মার্চেন্ট / প্রাপক',
      category: 'ক্যাটাগরি',
      status: 'অবস্থা',
      amount: 'পরিমাণ',
      evidence: 'প্রমাণপত্র',
      inspect: 'যাচাই',
      emptyLedger: 'অনুসন্ধানের সাথে কোনো লেনদেন মেলেনি।',
    },
  }[locale];

  const filtered = transactions.filter(tx => {
    const rawText = tx.raw_text_snippet || tx.description || '';
    const matchSearch = tx.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rawText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'ALL' || tx.category_id === selectedCategory;
    const isIncome = tx.direction === 'INCOME';
    const matchType = typeFilter === 'ALL' || 
      (typeFilter === 'DEBIT' && !isIncome) || 
      (typeFilter === 'CREDIT' && isIncome);
    return matchSearch && matchCat && matchType;
  });

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="tape-tag bg-white">LEDGER DESK</span>
          <span className="font-mono text-xs uppercase font-bold text-[#171717]/60">
            {transactions.length} VERIFIED ENTRIES
          </span>
        </div>
        <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171717] tracking-tight">
          {t.title}
        </h1>
        <p className="font-display text-sm text-[#171717]/80 mt-1">
          {t.subtitle}
        </p>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        
        {/* Search Input */}
        <div className="md:col-span-6 relative">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full font-display font-bold text-sm border-2 border-[#171717] p-3 pl-10 bg-white focus:bg-[#F6F1E8] shadow-[3px_3px_0px_#171717]"
          />
          <Search className="w-4 h-4 text-[#171717] absolute left-3 top-4" />
        </div>

        {/* Category Dropdown */}
        <div className="md:col-span-3">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full font-display font-bold text-xs border-2 border-[#171717] p-3.5 bg-white shadow-[3px_3px_0px_#171717]"
          >
            <option value="ALL">{t.allCategories}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {locale === 'bn' ? c.name_bn || c.name : c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Type Toggle */}
        <div className="md:col-span-3">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="w-full font-display font-bold text-xs border-2 border-[#171717] p-3.5 bg-white shadow-[3px_3px_0px_#171717]"
          >
            <option value="ALL">{t.typeAll}</option>
            <option value="DEBIT">{t.typeDebit}</option>
            <option value="CREDIT">{t.typeCredit}</option>
          </select>
        </div>

      </div>

      {/* Physical Ledger Table */}
      <div className="border-2 border-[#171717] bg-white shadow-[6px_6px_0px_#171717] overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-[#171717] bg-[#F6F1E8] font-mono text-xs font-bold text-[#171717]">
              <th className="p-4 uppercase">{t.date}</th>
              <th className="p-4 uppercase">{t.counterparty}</th>
              <th className="p-4 uppercase">{t.category}</th>
              <th className="p-4 uppercase text-right">{t.amount}</th>
              <th className="p-4 uppercase text-center">{t.evidence}</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-[#171717]/10 font-display text-sm">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#171717]/60 font-mono text-xs">
                  {t.emptyLedger}
                </td>
              </tr>
            ) : (
              filtered.map(tx => {
                const cat = categories.find(c => c.id === tx.category_id);
                const isDebit = tx.direction !== 'INCOME';

                return (
                  <tr key={tx.id} className="hover:bg-[#FFD84D]/10 transition-colors">
                    <td className="p-4 font-mono text-xs text-[#171717]/80 whitespace-nowrap">
                      {tx.transaction_date}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-[#171717]">{tx.merchant_name}</div>
                      {tx.raw_text_snippet && (
                        <div className="font-mono text-[11px] text-[#171717]/60 truncate max-w-sm">
                          "{tx.raw_text_snippet}"
                        </div>
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold bg-[#F6F1E8] border border-[#171717] px-2 py-0.5">
                        {locale === 'bn' ? cat?.name_bn || cat?.name : cat?.name || 'General'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-display font-black text-base whitespace-nowrap">
                      <span className={isDebit ? 'text-[#171717]' : 'text-[#2e7d32]'}>
                        {isDebit ? '-' : '+'}৳{tx.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => onInspectEvidence(tx)}
                        className="font-mono text-xs font-bold text-[#171717] underline hover:bg-[#FFD84D] px-2 py-1 border border-[#171717] inline-flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
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
