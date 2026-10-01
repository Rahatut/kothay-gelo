import React, { useState } from 'react';
import { Shield, Download, Trash2, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';

interface SettingsViewProps {
  locale: 'en' | 'bn';
  onResetData: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ locale, onResetData }) => {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const t = {
    en: {
      title: 'DATA SOVEREIGNTY & AUDIT DESK',
      subtitle: 'Audit system configuration, export raw ledger archives, or purge private data.',
      privacyTitle: 'TENANT ISOLATION ARCHITECTURE',
      privacyDesc: 'All transactions, bounding boxes, and OCR text fragments are isolated within this ephemeral tenant workspace. No financial data is used for advertising or model training.',
      exportTitle: 'EXPORT CANONICAL DATA',
      exportDesc: 'Download your full financial ledger and extracted metadata in standard JSON format.',
      exportBtn: 'DOWNLOAD COMPLETE LEDGER (.JSON)',
      resetTitle: 'PURGE TENANT DATA',
      resetDesc: 'Permanently wipe all uploaded statements, candidate transactions, and calculated leaks from local database memory.',
      resetBtn: 'PERMANENTLY PURGE ALL DATA',
      resetting: 'PURGING...',
      resetSuccessMsg: 'All tenant data has been permanently wiped.',
    },
    bn: {
      title: 'ডেটা নিরাপত্তা ও অডিট ডেক্স',
      subtitle: 'সিস্টেম কনফিগারেশন নিরীক্ষা, সম্পূর্ণ খতিয়ান এক্সপোর্ট অথবা ব্যক্তিগত ডেটা মুছুন।',
      privacyTitle: 'নিরাপদ টেন্যান্ট আইসোলেশন',
      privacyDesc: 'আপনার সব লেনদেনের তথ্য ও স্টেটমেন্ট সম্পূর্ণ ব্যক্তিগত ও সুরক্ষিত। কোনো তথ্য বিজ্ঞাপনে ব্যবহৃত হয় না।',
      exportTitle: 'ডেটা ডাউনলোড ও ব্যাকআপ',
      exportDesc: 'আপনার সম্পূর্ণ আর্থিক হিসাব এবং মেটাডাটা স্ট্যান্ডার্ড JSON ফরম্যাটে ডাউনলোড করুন।',
      exportBtn: 'সম্পূর্ণ লেজার ডাউনলোড করুন (.JSON)',
      resetTitle: 'সকল ডেটা স্থায়ীভাবে মুছে ফেলুন',
      resetDesc: 'আপনার আপলোড করা সকল স্টেটমেন্ট ও হিসাবের তথ্য তাৎক্ষণিকভাবে মুছে ফেলুন।',
      resetBtn: 'স্থায়ীভাবে সকল তথ্য মুছুন',
      resetting: 'মুছে ফেলা হচ্ছে...',
      resetSuccessMsg: 'সকল তথ্য স্থায়ীভাবে মুছে ফেলা হয়েছে।',
    },
  }[locale];

  const handleExport = async () => {
    try {
      const res = await fetch('/v1/transactions');
      if (res.ok) {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kothay-gelo-ledger-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to purge all financial records in this session? This action cannot be undone.')) {
      return;
    }
    setResetting(true);
    try {
      await onResetData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 4000);
    } catch (err) {
      console.error('Reset error:', err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="tape-tag bg-[#171717] text-white">SOVEREIGNTY</span>
          <span className="font-mono text-xs uppercase font-bold text-[#171717]/60">
            TRANSPARENT GOVERNANCE
          </span>
        </div>
        <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171717] tracking-tight">
          {t.title}
        </h1>
        <p className="font-display text-sm text-[#171717]/80 mt-1">
          {t.subtitle}
        </p>
      </div>

      {/* Section 1: Tenant Privacy */}
      <div className="brutalist-card p-6 sm:p-8 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]">
        <div className="flex items-center gap-2 border-b-2 border-[#171717] pb-3 mb-4">
          <Lock className="w-5 h-5 text-[#171717]" />
          <span className="font-display font-black text-base uppercase text-[#171717]">
            {t.privacyTitle}
          </span>
        </div>
        <p className="font-display text-sm text-[#171717]/80 leading-relaxed mb-4">
          {t.privacyDesc}
        </p>
        <div className="bg-[#F6F1E8] border-2 border-[#171717] p-4 font-mono text-xs text-[#171717] space-y-1">
          <div>· OCR BOUNDING BOX STORAGE: MEMORY-ISOLATED</div>
          <div>· TELEMETRY / THIRD-PARTY AD PIXELS: DISABLED (0 TRACKERS)</div>
          <div>· RUNTIME ENVIRONMENT: RESTRICTED CLOUD WORKSPACE</div>
        </div>
      </div>

      {/* Section 2: Data Export */}
      <div className="brutalist-card p-6 sm:p-8 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]">
        <div className="flex items-center gap-2 border-b-2 border-[#171717] pb-3 mb-4">
          <Download className="w-5 h-5 text-[#171717]" />
          <span className="font-display font-black text-base uppercase text-[#171717]">
            {t.exportTitle}
          </span>
        </div>
        <p className="font-display text-sm text-[#171717]/80 leading-relaxed mb-6">
          {t.exportDesc}
        </p>
        <button
          onClick={handleExport}
          className="brutalist-btn bg-[#FFD84D] text-[#171717] px-6 py-3 text-xs font-bold"
        >
          <span>{t.exportBtn}</span>
        </button>
      </div>

      {/* Section 3: Permanent Purge */}
      <div className="brutalist-card p-6 sm:p-8 bg-white border-2 border-[#FF725E] shadow-[6px_6px_0px_#FF725E]">
        <div className="flex items-center gap-2 border-b-2 border-[#FF725E] pb-3 mb-4">
          <Trash2 className="w-5 h-5 text-[#FF725E]" />
          <span className="font-display font-black text-base uppercase text-[#FF725E]">
            {t.resetTitle}
          </span>
        </div>
        <p className="font-display text-sm text-[#171717]/80 leading-relaxed mb-6">
          {t.resetDesc}
        </p>

        {resetSuccess && (
          <div className="p-3 bg-[#B7F34A] border-2 border-[#171717] font-display text-xs font-bold text-[#171717] mb-4">
            {t.resetSuccessMsg}
          </div>
        )}

        <button
          onClick={handleReset}
          disabled={resetting}
          className="brutalist-btn bg-[#FF725E] text-white px-6 py-3 text-xs font-bold"
        >
          <span>{resetting ? t.resetting : t.resetBtn}</span>
        </button>
      </div>

    </div>
  );
};
