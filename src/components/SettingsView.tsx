import React, { useEffect, useState } from 'react';
import { Lock, Download, Trash2 } from 'lucide-react';
import { apiUrl } from '../config';

interface SettingsViewProps {
  locale: 'en' | 'bn';
  /**
   * Purges the account and resolves with what the server reported as removed.
   *
   * Returns the counts rather than nothing, and rejects when the purge was
   * incomplete, so the view can say what happened instead of asserting success. It
   * previously resolved with `void` and the screen showed "All tenant data has been
   * permanently wiped" whether or not anything was deleted.
   */
  onResetData: () => Promise<{ purged: Record<string, number>; total_removed: number }>;
}

const COPY = {
  en: {
    title: 'Data sovereignty & audit desk',
    subtitle: 'Audit system configuration, export raw ledger archives, or purge private data.',
    privacyTitle: 'Tenant isolation architecture',
    privacyDesc:
      'All transactions, bounding boxes, and OCR text fragments are isolated within this ephemeral tenant workspace. No financial data is used for advertising or model training.',
    exportTitle: 'Export canonical data',
    exportDesc:
      'Download your full financial ledger and extracted metadata in standard JSON format.',
    exportBtn: 'Download complete ledger (.json)',
    resetTitle: 'Purge tenant data',
    resetDesc:
      'Permanently delete your uploaded statements, candidate transactions, evidence, calculated leaks, and savings targets from the database.',
    resetBtn: 'Permanently purge all data',
    resetting: 'Purging',
    resetSuccessMsg: 'All tenant data has been permanently wiped.',
  },
  bn: {
    title: 'ডেটা নিরাপত্তা ও অডিট ডেক্স',
    subtitle: 'সিস্টেম কনফিগারেশন নিরীক্ষা, সম্পূর্ণ খতিয়ান এক্সপোর্ট অথবা ব্যক্তিগত ডেটা মুছুন।',
    privacyTitle: 'নিরাপদ টেন্যান্ট আইসোলেশন',
    privacyDesc:
      'আপনার সব লেনদেনের তথ্য ও স্টেটমেন্ট সম্পূর্ণ ব্যক্তিগত ও সুরক্ষিত। কোনো তথ্য বিজ্ঞাপনে ব্যবহৃত হয় না।',
    exportTitle: 'ডেটা ডাউনলোড ও ব্যাকআপ',
    exportDesc: 'আপনার সম্পূর্ণ আর্থিক হিসাব এবং মেটাডাটা স্ট্যান্ডার্ড JSON ফরম্যাটে ডাউনলোড করুন।',
    exportBtn: 'সম্পূর্ণ লেজার ডাউনলোড করুন (.json)',
    resetTitle: 'সকল ডেটা স্থায়ীভাবে মুছে ফেলুন',
    resetDesc: 'আপনার আপলোড করা সকল স্টেটমেন্ট ও হিসাবের তথ্য তাৎক্ষণিকভাবে মুছে ফেলুন।',
    resetBtn: 'স্থায়ীভাবে সকল তথ্য মুছুন',
    resetting: 'মুছে ফেলা হচ্ছে',
    resetSuccessMsg: 'সকল তথ্য স্থায়ীভাবে মুছে ফেলা হয়েছে।',
  },
} as const;

const RUNTIME_FACTS = [
  'OCR bounding box storage: memory-isolated',
  'Telemetry / third-party ad pixels: disabled (0 trackers)',
  'Runtime environment: restricted cloud workspace',
];

export const SettingsView: React.FC<SettingsViewProps> = ({ locale, onResetData }) => {
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [purgePreview, setPurgePreview] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const loadPreview = async () => {
    try {
      const res = await fetch(apiUrl('/settings/purge-preview'), { credentials: 'include' });
      const payload = await res.json();
      const counts = (payload.data ?? {}) as Record<string, number>;
      setPurgePreview(counts);
      return counts;
    } catch {
      return {};
    }
  };

  useEffect(() => {
    void loadPreview();
  }, []);

  const t = COPY[locale];

  /**
   * Downloads the whole archive.
   *
   * Called `/v1/transactions` before, which is capped at 500 rows and carries no
   * documents, evidence, insights, or goals -- so the file did not match the
   * button's own promise of "your full financial ledger and extracted metadata".
   * The dedicated export route is scoped to the caller and returns everything.
   */
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const res = await fetch(apiUrl('/settings/export'), {
        credentials: 'include',
        method: 'POST',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? 'Your archive could not be assembled.',
        );
      }
      const archive = await res.json();
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kothay-gelo-archive-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNote(
        `Downloaded ${archive.counts.transactions} transaction(s) and ` +
          `${archive.counts.documents} statement(s).`,
      );
    } catch (err) {
      // A failed download must say so. The previous handler caught the error, logged
      // it, and left the user with no file and no explanation.
      setExportError(err instanceof Error ? err.message : 'The archive could not be assembled.');
    } finally {
      setExporting(false);
    }
  };

  /**
   * Asks what will be destroyed, then destroys it and reports what actually went.
   *
   * The confirmation used to be a bare `confirm()` reading "in this session", which
   * described the old in-memory behaviour and warned about nothing in particular.
   * It now names the counts, so the user is agreeing to a specific destruction
   * rather than to a phrase.
   *
   * A failure is shown. The previous version set the success state unconditionally,
   * so a rejected purge reported "All tenant data has been permanently wiped."
   */
  const handleReset = async () => {
    const preview = await loadPreview();
    const total = Object.values(preview).reduce<number>((a, b) => a + b, 0);

    if (total === 0) {
      setResetMessage('There is nothing stored to erase.');
      return;
    }

    const detail = Object.entries(preview)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${n} ${label}`)
      .join(', ');

    if (!confirm(`Permanently delete ${detail}?\n\nThis cannot be undone.`)) {
      return;
    }

    setResetting(true);
    setResetMessage(null);
    try {
      const purged = await onResetData();
      
      setResetMessage(
        `Deleted ${purged.total_removed} record(s): ` +
          Object.entries(purged.purged)
            .filter(([, n]) => n > 0)
            .map(([label, n]: [string, number]) => `${n} ${label}`)
            .join(', ') +
          '.',
      );
      await loadPreview();
    } catch (err) {
      // An incomplete purge must not read as success. The server returns 500 with
      // what survived, and that text is what the user needs.
      setResetMessage(
        err instanceof Error
          ? `Not everything could be erased: ${err.message}`
          : 'The purge did not complete. Some data may still be stored.',
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="border-b border-hairline pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-pill">Sovereignty</span>
          <span className="type-caption-uppercase text-muted">Transparent governance</span>
        </div>
        <h1 className="type-display-md text-ink">{t.title}</h1>
        <p className="type-body-md text-body mt-2">{t.subtitle}</p>
      </header>

      <section className="feature-card p-6 sm:p-8">
        <div className="flex items-center gap-2 border-b border-hairline pb-3 mb-4">
          <Lock className="w-4 h-4 text-muted" aria-hidden="true" />
          <h2 className="type-title-md text-ink">{t.privacyTitle}</h2>
        </div>
        <p className="type-body-md text-body mb-4">{t.privacyDesc}</p>
        <ul className="bg-canvas border border-hairline rounded-md p-4 font-figure type-caption text-body space-y-1">
          {RUNTIME_FACTS.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>

      <section className="feature-card p-6 sm:p-8">
        <div className="flex items-center gap-2 border-b border-hairline pb-3 mb-4">
          <Download className="w-4 h-4 text-muted" aria-hidden="true" />
          <h2 className="type-title-md text-ink">{t.exportTitle}</h2>
        </div>
        <p className="type-body-md text-body mb-6">{t.exportDesc}</p>
        <button type="button" onClick={handleExport} disabled={exporting} className="btn-outline">
          {exporting ? 'Preparing your archive' : t.exportBtn}
        </button>
        {exportNote && (
          <p role="status" className="mt-3 type-caption text-success">
            {exportNote}
          </p>
        )}
        {exportError && (
          <p role="alert" className="mt-3 type-caption text-error">
            {exportError}
          </p>
        )}
      </section>

      <section className="feature-card p-6 sm:p-8 border-error">
        <div className="flex items-center gap-2 border-b border-hairline pb-3 mb-4">
          <Trash2 className="w-4 h-4 text-error" aria-hidden="true" />
          <h2 className="type-title-md text-error">{t.resetTitle}</h2>
        </div>
        <p className="type-body-md text-body mb-6">{t.resetDesc}</p>

        {resetMessage && (
          <div role="status" className="p-3 bg-surface-strong rounded-md type-caption text-ink mb-4">
            {resetMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="btn-primary bg-error border-error hover:bg-error/90"
        >
          {resetting ? t.resetting : t.resetBtn}
        </button>
      </section>
    </div>
  );
};
