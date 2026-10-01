import React, { useState } from 'react';
import { Target, Plus, Check, Trash2, ArrowUpRight } from 'lucide-react';
import { SavingsGoal } from '../types';

interface GoalsViewProps {
  goals: SavingsGoal[];
  locale: 'en' | 'bn';
  onCreateGoal: (goal: Omit<SavingsGoal, 'id' | 'current_amount'>) => Promise<void>;
  onDeleteGoal?: (goalId: string) => Promise<void>;
}

export const GoalsView: React.FC<GoalsViewProps> = ({
  goals,
  locale,
  onCreateGoal,
  onDeleteGoal,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState(10000);
  const [targetDate, setTargetDate] = useState('2026-12-31');

  const t = {
    en: {
      title: 'SAVINGS TARGETS & COMMITTED LEAKS',
      subtitle: 'Map saved leak capital toward real targets in Bangladesh (Emergency fund, DPS, Eid shopping).',
      addGoal: '+ CREATE NEW TARGET',
      target: 'TARGET',
      current: 'ACCUMULATED',
      deadline: 'TARGET DATE',
      saveAction: 'LOCK IN TARGET',
      cancelAction: 'CANCEL',
      noGoals: 'No active savings targets set yet. Direct your recovered leaks toward a concrete goal.',
    },
    bn: {
      title: 'সঞ্চয় লক্ষ্য ও তহবিল ব্যবস্থাপনা',
      subtitle: 'লিক থেকে বাঁচানো টাকা নির্দিষ্ট লক্ষ্য বা ডিপিএস-এ রূপান্তর করুন।',
      addGoal: '+ নতুন লক্ষ্য নির্ধারণ করুন',
      target: 'লক্ষ্যমাত্রা',
      current: 'সঞ্চিত পরিমাণ',
      deadline: 'নির্ধারিত সময়সীমা',
      saveAction: 'লক্ষ্য নিশ্চিত করুন',
      cancelAction: 'বাতিল',
      noGoals: 'এখনো কোনো সঞ্চয় লক্ষ্য নির্ধারণ করা হয়নি। বাঁচানো অর্থ দিয়ে একটি নতুন লক্ষ্য তৈরি করুন।',
    },
  }[locale];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    await onCreateGoal({
      title,
      target_amount: targetAmount,
      target_date: targetDate,
    });
    setTitle('');
    setShowAdd(false);
  };

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="tape-tag bg-[#B7F34A]">CAPITAL RETENTION</span>
            <span className="font-mono text-xs uppercase font-bold text-[#171717]/60">
              TARGET AUDIT
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
          onClick={() => setShowAdd(!showAdd)}
          className="brutalist-btn bg-[#B7F34A] text-[#171717] px-5 py-2.5 text-xs font-bold shrink-0"
        >
          <span>{t.addGoal}</span>
        </button>
      </div>

      {/* Add Goal Form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className="brutalist-card p-6 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]">
          <div className="font-mono text-xs font-bold uppercase text-[#171717] mb-4">
            SET REALISTIC TARGET IN ৳ BDT
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="font-mono text-[11px] font-bold block mb-1">NAME / PURPOSE</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., 3-Month Emergency Buffer"
                className="w-full font-display font-bold text-sm border-2 border-[#171717] p-2 bg-[#F6F1E8]"
                required
              />
            </div>
            <div>
              <label className="font-mono text-[11px] font-bold block mb-1">TARGET AMOUNT (৳)</label>
              <input
                type="number"
                value={targetAmount}
                onChange={e => setTargetAmount(Number(e.target.value))}
                className="w-full font-display font-bold text-sm border-2 border-[#171717] p-2 bg-[#F6F1E8]"
                required
              />
            </div>
            <div>
              <label className="font-mono text-[11px] font-bold block mb-1">TARGET DEADLINE</label>
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full font-display font-bold text-sm border-2 border-[#171717] p-2 bg-[#F6F1E8]"
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="brutalist-btn bg-[#B7F34A] text-[#171717] px-4 py-2 text-xs font-bold">
              <span>{t.saveAction}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="brutalist-btn bg-white text-[#171717] px-4 py-2 text-xs font-bold"
            >
              <span>{t.cancelAction}</span>
            </button>
          </div>
        </form>
      )}

      {/* Goal Cards Grid */}
      {goals.length === 0 ? (
        <div className="brutalist-card p-12 text-center bg-white">
          <div className="font-display font-black text-2xl text-[#171717] mb-2">
            NO TARGETS ACTIVE.
          </div>
          <p className="font-display text-sm text-[#171717]/80 max-w-md mx-auto">
            {t.noGoals}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map(goal => {
            const pct = Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100);
            return (
              <div
                key={goal.id}
                className="brutalist-card p-6 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]"
              >
                <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 mb-4">
                  <div className="font-display font-black text-xl text-[#171717]">
                    {goal.title || goal.name || (locale === 'bn' ? 'সঞ্চয় লক্ষ্য' : 'Savings Target')}
                  </div>
                  <span className="font-mono text-xs font-bold bg-[#FFD84D] border border-[#171717] px-2 py-0.5">
                    {pct}% REACHED
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-display font-black text-2xl text-[#171717]">
                    ৳{goal.current_amount.toLocaleString()}
                  </span>
                  <span className="font-mono text-xs text-[#171717]/70">
                    TARGET: ৳{goal.target_amount.toLocaleString()}
                  </span>
                </div>

                {/* Brutalist progress bar */}
                <div className="w-full h-4 border-2 border-[#171717] bg-[#F6F1E8] mb-4 overflow-hidden">
                  <div className="h-full bg-[#B7F34A]" style={{ width: `${pct}%` }}></div>
                </div>

                <div className="border-t-2 border-[#171717] pt-3 flex items-center justify-between font-mono text-xs text-[#171717]/70">
                  <span>DEADLINE: {goal.target_date}</span>
                  {onDeleteGoal && (
                    <button
                      onClick={() => onDeleteGoal(goal.id)}
                      className="text-[#FF725E] hover:underline font-bold"
                    >
                      REMOVE
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
