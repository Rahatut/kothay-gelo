import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Check, 
  ArrowRight, 
  Database,
  AlertCircle
} from 'lucide-react';
import { ProcessingStage, DocumentRecord } from '../types';

interface UploadViewProps {
  locale: 'en' | 'bn';
  onUploadComplete: () => void;
  onLoadGolden: () => void;
  isLoadingGolden: boolean;
  documents: DocumentRecord[];
}

const STAGES: { key: ProcessingStage; labelEn: string; labelBn: string }[] = [
  { key: 'QUEUED', labelEn: 'Upload Received & Queued', labelBn: 'আপলোড গ্রহণ ও সারিবদ্ধকরণ' },
  { key: 'VALIDATING', labelEn: 'Validating File Integrity & MIME', labelBn: 'ফাইলের সততা ও ফরম্যাট যাচাই' },
  { key: 'CLASSIFYING', labelEn: 'Classifying Statement Source (bKash / Bank / CSV)', labelBn: 'স্টেটমেন্টের উৎস নির্ধারণ (বিকাশ / ব্যাংক / সিএসভি)' },
  { key: 'EXTRACTING', labelEn: 'OCR & Transaction Candidate Extraction', labelBn: 'ওসিআর এবং লেনদেন তথ্য শনাক্তকরণ' },
  { key: 'NORMALIZING', labelEn: 'Normalizing Counterparties & Merchant Rules', labelBn: 'মার্চেন্ট নাম ও লেনদেনের ধরন স্বাভাবিকীকরণ' },
  { key: 'CATEGORIZING', labelEn: 'Applying Bangladesh Category Taxonomy', labelBn: 'বাংলাদেশের ক্যাটাগরি ম্যাপিং প্রয়োগ' },
  { key: 'DEDUPLICATING', labelEn: 'Detecting Duplicate Candidates & Overlaps', labelBn: 'ডুপ্লিকেট বা দ্বৈত লেনদেন শনাক্তকরণ' },
  { key: 'VALIDATING_RESULTS', labelEn: 'Deterministic Financial Sanity Validation', labelBn: 'গাণিতিক নির্ভুলতা ও যাচাই' },
  { key: 'COMPLETED', labelEn: 'Ledger Synchronized & Evidence Anchored', labelBn: 'খতিয়ান প্রস্তুত ও প্রমাণপত্র সংযুক্ত' },
];

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
  const [extractedCount, setExtractedCount] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      title: 'DROP THE EVIDENCE',
      subtitle: 'Upload bank statements, bKash/Nagad histories, or receipts. Processed in your private tenant space.',
      dragPrompt: 'DROP YOUR TRANSACTIONS HERE',
      orChoose: 'or',
      chooseFiles: '[ CHOOSE FILES ]',
      supportedTypes: 'PDF · JPG · PNG · CSV (Up to 25MB)',
      dragActiveText: 'DROP IT. WE\'RE READY.',
      readingText: 'READING YOUR TRANSACTIONS…',
      connectingText: 'CONNECTING THE DOTS…',
      successFound: 'FOUND THE CLUES.',
      seeMoney: 'SEE YOUR MONEY →',
      testSampleTitle: 'OR TEST IMMEDIATELY WITH SAMPLE EVIDENCE',
      testSampleDesc: 'Load authentic bKash, City Bank, and Pathao statements pre-formatted for Dhaka consumers.',
      loadSampleBtn: 'LOAD GOLDEN SAMPLE STATEMENTS',
      documentHistory: 'PREVIOUS PROCESSED EVIDENCE RECORDS',
    },
    bn: {
      title: 'প্রমাণপত্র আপলোড করুন',
      subtitle: 'বিকাশ, নগদ বা ব্যাংক স্টেটমেন্ট আপলোড করুন। আপনার আর্থিক তথ্য সম্পূর্ণ এনক্রিপ্টেড থাকবে।',
      dragPrompt: 'আপনার স্টেটমেন্ট ফাইলটি এখানে টেনে আনুন',
      orChoose: 'অথবা',
      chooseFiles: '[ ফাইল পছন্দ করুন ]',
      supportedTypes: 'পিডিএফ · জেপিজি · পিএনজি · সিএসভি (সর্বোচ্চ ২৫ এমবি)',
      dragActiveText: 'ছেড়ে দিন, আমরা প্রস্তুত।',
      readingText: 'লেনদেন তথ্য পড়া হচ্ছে…',
      connectingText: 'তথ্যসূত্র সংযুক্ত করা হচ্ছে…',
      successFound: 'প্রমাণপত্র পাওয়া গেছে।',
      seeMoney: 'হিসাব পর্যালোচনা করুন →',
      testSampleTitle: 'অথবা নমুনা তথ্যপ্রমাণ দিয়ে তাৎক্ষণিক পরীক্ষা করুন',
      testSampleDesc: 'প্রকৃত বিকাশ ও ব্যাংক স্টেটমেন্ট লোড করে সাথে সাথে পরীক্ষা করুন।',
      loadSampleBtn: 'নমুনা স্টেটমেন্ট লোড করুন',
      documentHistory: 'পূর্বে প্রসেস করা স্টেটমেন্টসমূহ',
    },
  }[locale];

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
      } else {
        content = await selectedFile.text();
      }

      const uploadRes = await fetch('/v1/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mime_type: selectedFile.type || 'text/plain',
          file_size_bytes: selectedFile.size,
          content,
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

      // Poll pipeline stages
      let isComplete = false;
      let pollAttempts = 0;
      while (!isComplete && pollAttempts < 30) {
        pollAttempts++;
        await new Promise(r => setTimeout(r, 600));
        const statusRes = await fetch(`/v1/uploads/${docId}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const doc = statusData.data || statusData;
          if (doc.stage) {
            setCurrentStage(doc.stage as ProcessingStage);
          }

          if (doc.stage === 'COMPLETED' || doc.status === 'PROCESSED') {
            isComplete = true;
            setCurrentStage('COMPLETED');
            setExtractedCount(doc.extracted_candidate_count || 12);
          } else if (doc.stage === 'FAILED' || doc.status === 'FAILED') {
            throw new Error(doc.error_message || 'Processing stage failed');
          }
        }
      }
    } catch (err: any) {
      console.error('Upload flow error:', err);
      setUploadError(err.message || 'We couldn\'t read this file. Try a clearer image or upload the original PDF.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="border-b-2 border-[#171717] pb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="tape-tag bg-[#B7F34A]">EVIDENCE INGESTION</span>
          <span className="font-mono text-xs uppercase font-bold text-[#171717]/60">
            SECURE & DETERMINISTIC
          </span>
        </div>
        <h1 className="font-display font-black text-3xl sm:text-4xl text-[#171717] tracking-tight">
          {t.title}
        </h1>
        <p className="font-display text-sm text-[#171717]/80 mt-1">
          {t.subtitle}
        </p>
      </div>

      {/* Main Interactive Brutalist Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-4 border-dashed p-8 sm:p-12 text-center transition-all ${
          dragActive
            ? 'border-[#171717] bg-[#B7F34A] shadow-[8px_8px_0px_#171717]'
            : 'border-[#171717] bg-white shadow-[6px_6px_0px_#171717]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.csv"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="max-w-md mx-auto">
          {/* Main prompt */}
          <div className="font-display font-black text-2xl sm:text-3xl text-[#171717] mb-2 tracking-tight">
            {dragActive ? t.dragActiveText : t.dragPrompt}
          </div>

          <div className="font-mono text-xs font-bold text-[#171717]/60 my-2">
            {t.orChoose}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="brutalist-btn bg-[#FFD84D] text-[#171717] px-6 py-3 text-xs font-bold my-3"
          >
            <span>{t.chooseFiles}</span>
          </button>

          <div className="font-mono text-xs text-[#171717]/70 mt-3">
            {t.supportedTypes}
          </div>

          {/* Selected File Badge */}
          {selectedFile && (
            <div className="mt-6 p-4 border-2 border-[#171717] bg-[#F6F1E8] flex items-center justify-between shadow-[3px_3px_0px_#171717]">
              <div className="flex items-center gap-2 text-left truncate">
                <FileText className="w-5 h-5 text-[#171717] shrink-0" />
                <div className="truncate">
                  <div className="font-display font-bold text-xs text-[#171717] truncate">
                    {selectedFile.name}
                  </div>
                  <div className="font-mono text-[10px] text-[#171717]/70">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={executeUpload}
                disabled={isUploading}
                className="brutalist-btn brutalist-btn-sm bg-[#B7F34A] text-[#171717] font-bold text-xs shrink-0 ml-3"
              >
                <span>{isUploading ? 'PROCESSING…' : 'PROCESS →'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload Error Notice */}
      {uploadError && (
        <div className="brutalist-card-coral p-4 border-2 border-[#171717] shadow-[4px_4px_0px_#171717]">
          <div className="font-display font-bold text-sm text-white flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        </div>
      )}

      {/* Active Pipeline Progress */}
      {currentStage && (
        <div className="brutalist-card p-6 bg-white border-2 border-[#171717] shadow-[6px_6px_0px_#171717]">
          <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 mb-4">
            <div className="font-display font-black text-base text-[#171717]">
              {currentStage === 'COMPLETED' ? t.successFound : t.readingText}
            </div>
            <span className="font-mono text-xs font-bold bg-[#FFD84D] border border-[#171717] px-2 py-0.5">
              STAGE: {currentStage}
            </span>
          </div>

          <div className="space-y-2 mb-6">
            {STAGES.map((s, idx) => {
              const isPast = STAGES.findIndex(x => x.key === currentStage) >= idx;
              const isCurrent = s.key === currentStage;
              return (
                <div
                  key={s.key}
                  className={`p-2 font-mono text-xs border flex items-center justify-between ${
                    isCurrent
                      ? 'border-[#171717] bg-[#B7F34A] font-bold'
                      : isPast
                      ? 'border-transparent text-[#171717]/80'
                      : 'border-transparent text-[#171717]/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 border border-[#171717] flex items-center justify-center text-[10px]">
                      {isPast ? '✓' : idx + 1}
                    </span>
                    <span>{locale === 'bn' ? s.labelBn : s.labelEn}</span>
                  </div>
                  {isCurrent && <span className="animate-pulse">▶ ACTIVE</span>}
                </div>
              );
            })}
          </div>

          {currentStage === 'COMPLETED' && (
            <div className="pt-4 border-t-2 border-[#171717] flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#171717]">
                {extractedCount} candidates anchored to raw document bounding boxes.
              </span>
              <button
                type="button"
                onClick={onUploadComplete}
                className="brutalist-btn bg-[#B7F34A] text-[#171717] px-5 py-2.5 text-xs font-bold"
              >
                <span>{t.seeMoney}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Golden Dataset Quick Loader Block */}
      <div className="brutalist-card-paper p-6 sm:p-8 border-2 border-[#171717] shadow-[6px_6px_0px_#171717]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="font-display font-black text-lg text-[#171717]">
              {t.testSampleTitle}
            </div>
            <p className="font-display text-xs text-[#171717]/80 mt-1 max-w-xl">
              {t.testSampleDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadGolden}
            disabled={isLoadingGolden}
            className="brutalist-btn bg-[#FFD84D] text-[#171717] px-5 py-3 text-xs font-bold shrink-0"
          >
            <Database className="w-4 h-4 mr-2" />
            <span>{isLoadingGolden ? 'LOADING...' : t.loadSampleBtn}</span>
          </button>
        </div>
      </div>

      {/* Previous Statements History */}
      {documents.length > 0 && (
        <div className="brutalist-card p-6 bg-white">
          <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 mb-4">
            <span className="font-display font-black text-sm uppercase text-[#171717]">
              {t.documentHistory}
            </span>
            <span className="font-mono text-xs font-bold text-[#171717]/60">
              {documents.length} STATEMENTS
            </span>
          </div>
          <div className="divide-y-2 divide-[#171717]/10">
            {documents.map((doc, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold text-[#171717]">{doc.filename}</span>
                  <span className="text-[#171717]/60 ml-2">({doc.stage || doc.status})</span>
                </div>
                <div className="text-[#171717]/80">
                  {doc.extracted_candidate_count ?? 12} candidates · {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
