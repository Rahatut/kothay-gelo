import React, { useState, useRef } from 'react';
import { FileText, Database, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { ProcessingStage, DocumentRecord } from '../types';
import { API_BASE_URL } from '../config';

interface UploadViewProps {
  locale: 'en' | 'bn';
  onUploadComplete: () => void;
  onLoadGolden: () => void;
  isLoadingGolden: boolean;
  documents: DocumentRecord[];
}

const STAGES: { key: ProcessingStage; labelEn: string; labelBn: string }[] = [
  { key: 'QUEUED', labelEn: 'Upload received and queued', labelBn: 'আপলোড গ্রহণ ও সারিবদ্ধকরণ' },
  {
    key: 'VALIDATING',
    labelEn: 'Validating file integrity and format',
    labelBn: 'ফাইলের সততা ও ফরম্যাট যাচাই',
  },
  {
    key: 'CLASSIFYING',
    labelEn: 'Classifying statement source (bKash / bank / CSV)',
    labelBn: 'স্টেটমেন্টের উৎস নির্ধারণ (বিকাশ / ব্যাংক / সিএসভি)',
  },
  {
    key: 'EXTRACTING',
    labelEn: 'OCR and transaction candidate extraction',
    labelBn: 'ওসিআর এবং লেনদেন তথ্য শনাক্তকরণ',
  },
  {
    key: 'NORMALIZING',
    labelEn: 'Normalizing counterparties and merchant rules',
    labelBn: 'মার্চেন্ট নাম ও লেনদেনের ধরন স্বাভাবিকীকরণ',
  },
  {
    key: 'CATEGORIZING',
    labelEn: 'Applying Bangladesh category taxonomy',
    labelBn: 'বাংলাদেশের ক্যাটাগরি ম্যাপিং প্রয়োগ',
  },
  {
    key: 'DEDUPLICATING',
    labelEn: 'Detecting duplicate candidates and overlaps',
    labelBn: 'ডুপ্লিকেট বা দ্বৈত লেনদেন শনাক্তকরণ',
  },
  {
    key: 'VALIDATING_RESULTS',
    labelEn: 'Deterministic financial sanity validation',
    labelBn: 'গাণিতিক নির্ভুলতা ও যাচাই',
  },
  {
    key: 'COMPLETED',
    labelEn: 'Ledger synchronized and evidence anchored',
    labelBn: 'খতিয়ান প্রস্তুত ও প্রমাণপত্র সংযুক্ত',
  },
];

const COPY = {
  en: {
    title: 'Drop the evidence',
    subtitle:
      'Upload bank statements, bKash or Nagad histories. Stored on your account so you can come back, and erased on request.',
    dragPrompt: 'Drop your statement here',
    orChoose: 'or',
    chooseFiles: 'Choose a file',
    supportedTypes: 'PDF, JPG, PNG, or CSV up to 25 MB',
    dragActiveText: 'Drop it. We are ready.',
    processing: 'Processing',
    process: 'Process statement',
    stage: 'Stage',
    active: 'Active',
    candidatesAnchored: 'candidates anchored to raw document bounding boxes.',
    seeMoney: 'See your money',
    testSampleTitle: 'Or test immediately with sample evidence',
    testSampleDesc:
      'Load authentic bKash, City Bank, and Pathao statements pre-formatted for Dhaka consumers.',
    loadSampleBtn: 'Load sample statements',
    loading: 'Loading',
    documentHistory: 'Previous processed statements',
    statements: 'statements',
  },
  bn: {
    title: 'প্রমাণপত্র আপলোড করুন',
    subtitle: 'বিকাশ, নগদ বা ব্যাংক স্টেটমেন্ট আপলোড করুন। আপনার অ্যাকাউন্টে সংরক্ষিত থাকে, চাইলে যেকোনো সময় মুছে ফেলা যায়।',
    dragPrompt: 'আপনার স্টেটমেন্ট ফাইলটি এখানে টেনে আনুন',
    orChoose: 'অথবা',
    chooseFiles: 'ফাইল পছন্দ করুন',
    supportedTypes: 'পিডিএফ, জেপিজি, পিএনজি, বা সিএসভি সর্বোচ্চ ২৫ এমবি',
    dragActiveText: 'ছেড়ে দিন, আমরা প্রস্তুত।',
    processing: 'প্রক্রিয়াধীন',
    process: 'প্রক্রিয়া করুন',
    stage: 'ধাপ',
    active: 'সক্রিয়',
    candidatesAnchored: 'টি লেনদেন মূল ডকুমেন্টের সাথে সংযুক্ত।',
    seeMoney: 'হিসাব দেখুন',
    testSampleTitle: 'অথবা নমুনা তথ্যপ্রমাণ দিয়ে তাৎক্ষণিক পরীক্ষা করুন',
    testSampleDesc: 'প্রকৃত বিকাশ ও ব্যাংক স্টেটমেন্ট লোড করে সাথে সাথে পরীক্ষা করুন।',
    loadSampleBtn: 'নমুনা স্টেটমেন্ট লোড করুন',
    loading: 'লোড হচ্ছে',
    documentHistory: 'পূর্বে প্রসেস করা স্টেটমেন্টসমূহ',
    statements: 'টি স্টেটমেন্ট',
  },
} as const;

export const UploadView: React.FC<UploadViewProps> = ({
  locale,
  onUploadComplete,
  onLoadGolden,
  isLoadingGolden,
  documents,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStage, setCurrentStage] = useState<ProcessingStage | null>(null);
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = COPY[locale];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setUploadError(null);
    setSelectedFile(file);
  };

  const executeUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setCurrentStage('QUEUED');

    try {
      const isImage = selectedFile.type.startsWith('image/');
      let content = '';

      if (isImage) {
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const base64 = res.split(',')[1] || res;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      } else if (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) {
        // PDFs are posted as base64 bytes, not as text.
        //
        // `selectedFile.text()` decodes the binary as UTF-8 and loses everything that
        // is not valid UTF-8, so the text layer never reached the server and every
        // PDF was refused as a scan. The server extracts the text with a real parser.
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      } else {
        content = await selectedFile.text();
      }

      const uploadRes = await fetch(`${API_BASE_URL}/v1/uploads`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mime_type: selectedFile.type || 'text/plain',
          file_size_bytes: selectedFile.size,
          content,
          // The server trusted the filename before; flag image bytes so the
          // pipeline OCRs them instead of parsing the base64 as a statement.
          is_base64_image: isImage,
        }),
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      const resJson = await uploadRes.json();
      const docId = resJson?.data?.document?.id || resJson?.document_id || resJson?.id;

      if (!docId) {
        throw new Error('No document identifier returned from upload service');
      }

      let isComplete = false;
      let pollAttempts = 0;
      // The poll interval is 250 ms. The visible minimum dwell is applied in the
      // stage list below, not here: the server used to sleep 400 ms per stage
      // transition purely so this list had something to animate, which added
      // ~2.8 s of pure latency to every upload against a 20 s budget.
      const POLL_INTERVAL_MS = 250;
      const MAX_POLLS = 80;
      while (!isComplete && pollAttempts < MAX_POLLS) {
        pollAttempts++;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const statusRes = await fetch(`${API_BASE_URL}/v1/uploads/${docId}/status`, { credentials: 'include' });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const doc = statusData.data || statusData;
          if (doc.stage) {
            setCurrentStage(doc.stage as ProcessingStage);
          }

          if (doc.stage === 'COMPLETED' || doc.status === 'PROCESSED') {
            isComplete = true;
            setCurrentStage('COMPLETED');
            // Null when extraction produced no count. Absence is rendered as
            // absence; the previous `|| 12` invented a row count and displayed
            // it as though twelve transactions had been read.
            setExtractedCount(doc.extracted_candidate_count ?? null);
          } else if (doc.stage === 'FAILED' || doc.status === 'FAILED') {
            throw new Error(doc.error_message || 'Processing stage failed');
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Upload flow error:', err);
      setUploadError(
        message ||
          "We couldn't read this file. Try a clearer image or upload the original PDF.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-hairline pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-pill">Evidence ingestion</span>
          <span className="type-caption-uppercase text-muted">Deterministic</span>
        </div>
        <h1 className="type-display-md text-ink">{t.title}</h1>
        <p className="type-body-md text-body mt-2">{t.subtitle}</p>
      </header>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors ${
          dragActive ? 'border-hairline-strong bg-canvas-soft' : 'border-hairline bg-surface-card'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.csv"
          onChange={handleFileChange}
          className="hidden"
          aria-label={t.chooseFiles}
        />

        <div className="max-w-md mx-auto">
          <h2 className="type-display-sm text-ink mb-2">
            {dragActive ? t.dragActiveText : t.dragPrompt}
          </h2>

          <p className="type-caption text-muted my-2">{t.orChoose}</p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary my-3"
          >
            {t.chooseFiles}
          </button>

          <p className="type-caption text-muted-soft mt-3">{t.supportedTypes}</p>

          {selectedFile && (
            <div className="mt-6 p-4 border border-hairline bg-canvas rounded-md flex flex-wrap items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                <div className="truncate">
                  <p className="type-body-sm text-ink truncate">{selectedFile.name}</p>
                  <p className="font-figure type-caption text-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={executeUpload}
                disabled={isUploading}
                className="btn-primary btn-sm shrink-0"
              >
                <span>{isUploading ? t.processing : t.process}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {uploadError && (
        <div role="alert" className="feature-card border-error p-4">
          <p className="type-body-sm text-error flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{uploadError}</span>
          </p>
        </div>
      )}

      {currentStage && (
        <div className="feature-card p-6">
          <div className="flex items-center justify-between border-b border-hairline pb-3 mb-4 gap-3">
            <h2 className="type-title-md text-ink">
              {currentStage === 'COMPLETED' ? t.seeMoney : t.title}
            </h2>
            <span className="badge-pill shrink-0">
              {t.stage} <span className="font-figure">{currentStage}</span>
            </span>
          </div>

          <ol className="space-y-1 mb-6">
            {STAGES.map((s, idx) => {
              const isPast = STAGES.findIndex((x) => x.key === currentStage) >= idx;
              const isCurrent = s.key === currentStage;
              return (
                <li
                  key={s.key}
                  className={`type-caption p-2 rounded-xs flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-surface-strong text-ink'
                      : isPast
                        ? 'text-body'
                        : 'text-muted-soft'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                        isPast ? 'border-hairline-strong' : 'border-hairline'
                      }`}
                      aria-hidden="true"
                    >
                      {isPast ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                    </span>
                    <span>{locale === 'bn' ? s.labelBn : s.labelEn}</span>
                  </span>
                  {isCurrent && <span className="animate-pulse shrink-0">{t.active}</span>}
                </li>
              );
            })}
          </ol>

          {currentStage === 'COMPLETED' && (
            <div className="pt-4 border-t border-hairline flex flex-wrap items-center justify-between gap-4">
              <span className="font-figure type-caption text-body">
                <span className="font-medium text-ink">{extractedCount}</span>{' '}
                {t.candidatesAnchored}
              </span>
              <button type="button" onClick={onUploadComplete} className="btn-primary">
                {t.seeMoney}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="feature-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="type-title-md text-ink">{t.testSampleTitle}</h2>
            <p className="type-caption text-body mt-1 max-w-xl">{t.testSampleDesc}</p>
          </div>
          <button
            type="button"
            onClick={onLoadGolden}
            disabled={isLoadingGolden}
            className="btn-outline shrink-0"
          >
            <Database className="w-4 h-4" aria-hidden="true" />
            <span>{isLoadingGolden ? t.loading : t.loadSampleBtn}</span>
          </button>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="feature-card p-6">
          <div className="flex items-center justify-between border-b border-hairline pb-3 mb-4 gap-3">
            <h2 className="type-title-sm text-ink">{t.documentHistory}</h2>
            <span className="type-caption text-muted">
              <span className="font-figure">{documents.length}</span> {t.statements}
            </span>
          </div>
          <div className="divide-y divide-hairline-soft">
            {documents.map((doc, idx) => (
              <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="type-body-sm text-ink">{doc.filename}</span>
                  <span className="type-caption text-muted ml-2">
                    {doc.stage || doc.status}
                  </span>
                </div>
                <div className="type-caption text-muted font-figure">
                  {doc.extracted_candidate_count ?? 'unknown count'} candidates ·{' '}
                  {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
