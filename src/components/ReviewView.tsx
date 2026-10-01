import React, { useState } from 'react';
import { 
  Check, 
  X, 
  FileText, 
  Edit3, 
  AlertTriangle, 
  CheckSquare,
  ShieldCheck
} from 'lucide-react';
import { Transaction, Category } from '../types';

interface ReviewViewProps {
  transactions: Transaction[];
  categories: Category[];
  locale: 'en' | 'bn';
  onConfirmTransaction: (txId: string) => Promise<void>;
  onUpdateTransaction: (txId: string, updates: Partial<Transaction>) => Promise<void>;
  onInspectEvidence: (tx: Transaction) => void;
}

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
  const [filterType, setFilterType] = useState<'ALL' | 'NEEDS_REVIEW' | 'DUPLICATES'>('NEEDS_REVIEW');

  const t = {
    en: {
      title: 'EVIDENCE VERIFICATION DESK',
      subtitle: 'Audit raw extraction candidates. Confirm predictions, reclassify categories, and resolve duplicate suspects.',
      tabNeedsReview: 'NEEDS CONFIRMATION',
      tabDuplicates: 'DUPLICATE SUSPECTS',
      tabAll: 'ALL TRANSACTIONS',
      confirmAllPrompt: 'ACCEPT ALL FILTERED',
      amountConfirmed: 'Amount: Verified',
      dateConfirmed: 'Date: Verified',
      merchantConfirmed: 'Merchant: Matched',
      needsReviewTag: 'CONFIRM CATEGORY',
      duplicateTag: 'DUPLICATE SUSPECT',
      save: 'SAVE CORRECTION',
      cancel: 'CANCEL',
      confirm: 'ACCEPT & LOCK',
      inspectEvidence: 'INSPECT PROOF',
      emptyReview: 'No pending items! All transactions are locked in verified standing.',
      currency: '৳',
    },
    bn: {
      title: 'তথ্যপ্রমাণ যাচাই ও পর্যালোচনা ডেক্স',
      subtitle: 'স্বয়ংক্রিয়ভাবে বের করা লেনদেনের তথ্য পর্যালোচনা করুন। ক্যাটাগরি সংশোধন বা ডুপ্লিকেট চিহ্নিত করে শতভাগ নির্ভুলতা নিশ্চিত করুন।',
      tabNeedsReview: 'যাচাই প্রয়োজন',
      tabDuplicates: 'ডুপ্লিকেট সন্দেহজনক',
      tabAll: 'সব লেনদেন',
      confirmAllPrompt: 'সবগুলো নিশ্চিত করুন',
      amountConfirmed: 'টাকা: নিশ্চিত',
      dateConfirmed: 'তারিখ: নিশ্চিত',
      merchantConfirmed: 'মার্চেন্ট: শনাক্ত',
      needsReviewTag: 'ক্যাটাগরি নির্ধারণ',
      duplicateTag: 'ডুপ্লিকেট সন্দেহ',
      save: 'সংরক্ষণ',
      cancel: 'বাতিল',
      confirm: 'নিশ্চিত করুন',
      inspectEvidence: 'প্রমাণপত্র দেখুন',
      emptyReview: 'পর্যালোচনার জন্য কোনো পেন্ডিং লেনদেন নেই! সব লেনদেন যাচাইকৃত।',
      currency: '৳',
    },
  }[locale];

  let filtered = transactions;
  if (filterType === 'NEEDS_REVIEW') {
    filtered = transactions.filter(t => t.status === 'NEEDS_REVIEW');
  } else if (filterType === 'DUPLICATES') {
    filtered = transactions.filter(t => t.is_duplicate_candidate);
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

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="tape-tag bg-[#FFD84D]">AUDIT WORKSPACE</span>
            <span className="font-mono text-xs font-bold text-[#171717]/60">
              CANDIDATE TRIAGE
            </span>
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171717] tracking-tight">
            {t.title}
          </h1>
          <p className="font-display text-sm text-[#171717]/80 mt-1">
            {t.subtitle}
          </p>
        </div>

        {filtered.length > 0 && (
          <button
            onClick={handleBulkConfirm}
            className="brutalist-btn bg-[#B7F34A] text-[#171717] px-5 py-2.5 text-xs font-bold shrink-0"
          >
            <span>{t.confirmAllPrompt} ({filtered.length})</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b-2 border-[#171717] pb-3 overflow-x-auto">
        <button
          onClick={() => setFilterType('NEEDS_REVIEW')}
          className={`font-display font-bold text-xs uppercase px-3 py-1.5 border-2 border-[#171717] transition-all cursor-pointer ${
            filterType === 'NEEDS_REVIEW'
              ? 'bg-[#FFD84D] text-[#171717] shadow-[2px_2px_0px_#171717]'
              : 'bg-white text-[#171717] hover:bg-[#F6F1E8]'
          }`}
        >
          {t.tabNeedsReview} ({transactions.filter(t => t.status === 'NEEDS_REVIEW').length})
        </button>
        <button
          onClick={() => setFilterType('DUPLICATES')}
          className={`font-display font-bold text-xs uppercase px-3 py-1.5 border-2 border-[#171717] transition-all cursor-pointer ${
            filterType === 'DUPLICATES'
              ? 'bg-[#FF725E] text-white shadow-[2px_2px_0px_#171717]'
              : 'bg-white text-[#171717] hover:bg-[#F6F1E8]'
          }`}
        >
          {t.tabDuplicates} ({transactions.filter(t => t.is_duplicate_candidate).length})
        </button>
        <button
          onClick={() => setFilterType('ALL')}
          className={`font-display font-bold text-xs uppercase px-3 py-1.5 border-2 border-[#171717] transition-all cursor-pointer ${
            filterType === 'ALL'
              ? 'bg-[#171717] text-white shadow-[2px_2px_0px_#171717]'
              : 'bg-white text-[#171717] hover:bg-[#F6F1E8]'
          }`}
        >
          {t.tabAll} ({transactions.length})
        </button>
      </div>

      {/* Review Candidate List */}
      {filtered.length === 0 ? (
        <div className="brutalist-card p-12 text-center bg-white">
          <div className="font-display font-black text-2xl text-[#171717] mb-2">
            ALL CAUGHT UP.
          </div>
          <p className="font-display text-sm text-[#171717]/80 max-w-md mx-auto">
            {t.emptyReview}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(tx => {
            const isEditing = editingTxId === tx.id;
            const catObj = categories.find(c => c.id === tx.category_id);
            const categoryName = locale === 'bn' ? catObj?.name_bn || catObj?.name : catObj?.name;

            return (
              <div
                key={tx.id}
                className="brutalist-card p-5 sm:p-6 bg-white border-2 border-[#171717] shadow-[5px_5px_0px_#171717]"
              >
                {isEditing ? (
                  /* In-line Edit Mode */
                  <div className="space-y-4">
                    <div className="font-mono text-xs font-bold uppercase text-[#171717]/70">
                      EDITING TRANSACTION · ID: {tx.id}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="font-mono text-[11px] font-bold block text-[#171717] mb-1">
                          MERCHANT / COUNTERPARTY
                        </label>
                        <input
                          type="text"
                          value={editMerchant}
                          onChange={e => setEditMerchant(e.target.value)}
                          className="w-full font-display text-sm font-bold border-2 border-[#171717] p-2 bg-[#F6F1E8] focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-mono text-[11px] font-bold block text-[#171717] mb-1">
                          CATEGORY
                        </label>
                        <select
                          value={editCategory}
                          onChange={e => setEditCategory(e.target.value)}
                          className="w-full font-display text-sm font-bold border-2 border-[#171717] p-2 bg-[#F6F1E8] focus:bg-white"
                        >
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>
                              {locale === 'bn' ? c.name_bn || c.name : c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-mono text-[11px] font-bold block text-[#171717] mb-1">
                          AMOUNT (৳ BDT)
                        </label>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={e => setEditAmount(Number(e.target.value))}
                          className="w-full font-display text-sm font-bold border-2 border-[#171717] p-2 bg-[#F6F1E8] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => handleSave(tx.id)}
                        className="brutalist-btn bg-[#B7F34A] text-[#171717] px-4 py-2 text-xs font-bold"
                      >
                        <span>{t.save}</span>
                      </button>
                      <button
                        onClick={() => setEditingTxId(null)}
                        className="brutalist-btn bg-white text-[#171717] px-4 py-2 text-xs font-bold"
                      >
                        <span>{t.cancel}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Display Mode */
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tx.status === 'NEEDS_REVIEW' && (
                          <span className="font-mono text-[10px] font-bold bg-[#FFD84D] border border-[#171717] px-1.5 py-0.5">
                            {t.needsReviewTag}
                          </span>
                        )}
                        {tx.is_duplicate_candidate && (
                          <span className="font-mono text-[10px] font-bold bg-[#FF725E] text-white px-1.5 py-0.5">
                            {t.duplicateTag}
                          </span>
                        )}
                        <span className="font-mono text-xs text-[#171717]/60">
                          {tx.transaction_date}
                        </span>
                        <span className="font-mono text-xs font-bold bg-[#F6F1E8] border border-[#171717] px-1.5 py-0.5">
                          {categoryName || 'General'}
                        </span>
                      </div>

                      <div className="font-display font-black text-lg text-[#171717]">
                        {tx.merchant_name}
                      </div>

                      {tx.raw_text_snippet && (
                        <div className="font-mono text-xs text-[#171717]/70 bg-[#F6F1E8] border border-[#171717]/30 px-2 py-1 max-w-xl truncate">
                          Line: "{tx.raw_text_snippet}"
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="text-left sm:text-right">
                        <div className="text-2xl font-display font-black text-[#171717]">
                          ৳{tx.amount.toLocaleString()}
                        </div>
                        <div className="font-mono text-[10px] text-[#171717]/60">
                          CONFIDENCE: {Math.round(tx.confidence * 100)}%
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onInspectEvidence(tx)}
                          className="brutalist-btn brutalist-btn-sm bg-white text-[#171717] text-xs font-bold"
                          title="Audit raw document coordinates"
                        >
                          <FileText className="w-3.5 h-3.5 mr-1" />
                          <span>{t.inspectEvidence}</span>
                        </button>

                        <button
                          onClick={() => startEdit(tx)}
                          className="brutalist-btn brutalist-btn-sm bg-[#FFD84D] text-[#171717] text-xs font-bold"
                          title="Correct merchant or category"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" />
                          <span>EDIT</span>
                        </button>

                        {(tx.status as string) !== 'ACCEPTED' && (tx.status as string) !== 'CONFIRMED' && (
                          <button
                            onClick={() => onConfirmTransaction(tx.id)}
                            className="brutalist-btn brutalist-btn-sm bg-[#B7F34A] text-[#171717] text-xs font-bold"
                            title="Accept and lock into verified ledger"
                          >
                            <Check className="w-3.5 h-3.5 mr-1 stroke-[3]" />
                            <span>{t.confirm}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
