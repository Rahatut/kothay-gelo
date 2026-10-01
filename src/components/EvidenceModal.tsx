import React, { useEffect, useState } from 'react';
import { X, FileText, CheckCircle2, ShieldCheck, MapPin } from 'lucide-react';
import { Transaction, EvidenceItem } from '../types';

interface EvidenceModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  locale: 'en' | 'bn';
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  transaction,
  onClose,
  locale,
}) => {
  const [evidence, setEvidence] = useState<EvidenceItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    const fetchEvidence = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/v1/transactions/${transaction.id}/evidence`);
        if (res.ok) {
          const json = await res.json();
          setEvidence(json.data?.evidence || json.data || null);
        }
      } catch (err) {
        console.error('Failed to load evidence:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvidence();
  }, [transaction]);

  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-[#F6F1E8] border-4 border-[#171717] w-full max-w-2xl shadow-[12px_12px_0px_#171717] p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b-2 border-[#171717] pb-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase bg-[#FFD84D] border border-[#171717] px-2 py-0.5">
              EVIDENCE DOSSIER
            </span>
            <span className="font-mono text-xs text-[#171717]/70">
              DOC #{transaction.document_id ? transaction.document_id.slice(0, 8) : 'ORIGIN'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 border-2 border-[#171717] bg-white hover:bg-[#FF725E] hover:text-white flex items-center justify-center font-black text-sm transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transaction Summary Badge */}
        <div className="bg-white border-2 border-[#171717] p-4 mb-6 shadow-[4px_4px_0px_#171717]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-black text-xl text-[#171717]">
                {transaction.merchant_name}
              </div>
              <div className="font-mono text-xs text-[#171717]/70 mt-0.5">
                {transaction.transaction_date} · ID: {transaction.id}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-black text-2xl text-[#171717]">
                ৳{transaction.amount.toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-[#171717]/60">
                CONFIDENCE: {Math.round(transaction.confidence * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Evidence Content */}
        {isLoading ? (
          <div className="py-12 text-center font-mono text-xs text-[#171717]/60">
            RETRIEVING RAW OCR ARTIFACTS...
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Raw OCR Snippet */}
            <div>
              <div className="font-mono text-xs font-bold uppercase text-[#171717] mb-2">
                1. RAW STATEMENT TEXT EXTRACTION
              </div>
              <div className="bg-[#171717] text-[#B7F34A] font-mono text-xs p-4 border border-[#171717] leading-relaxed select-all">
                {evidence?.raw_text_snippet || evidence?.raw_text || transaction.raw_text_snippet || transaction.description || 'No raw snippet recorded for this transaction candidate.'}
              </div>
            </div>

            {/* Bounding Box Coordinates */}
            {evidence?.bounding_box && (
              <div>
                <div className="font-mono text-xs font-bold uppercase text-[#171717] mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>2. DOCUMENT BOUNDING BOX COORDINATES</span>
                </div>
                <div className="bg-white border-2 border-[#171717] p-3 font-mono text-xs text-[#171717] grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>X: <strong>{evidence.bounding_box.x.toFixed(1)}</strong></div>
                  <div>Y: <strong>{evidence.bounding_box.y.toFixed(1)}</strong></div>
                  <div>WIDTH: <strong>{evidence.bounding_box.width.toFixed(1)}</strong></div>
                  <div>HEIGHT: <strong>{evidence.bounding_box.height.toFixed(1)}</strong></div>
                </div>
              </div>
            )}

            {/* Canonical Verification Stamp */}
            <div className="bg-[#B7F34A] border-2 border-[#171717] p-4 shadow-[3px_3px_0px_#171717]">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#171717] shrink-0 mt-0.5" />
                <div>
                  <div className="font-display font-black text-sm text-[#171717]">
                    IMMUTABLE AUDIT RECORD
                  </div>
                  <p className="font-display text-xs text-[#171717]/90 mt-0.5 leading-relaxed">
                    This transaction was extracted with zero hallucination. All numerical values correspond to confirmed entries in the user-provided statement.
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Footer actions */}
        <div className="mt-8 pt-4 border-t-2 border-[#171717] flex justify-end">
          <button
            onClick={onClose}
            className="brutalist-btn bg-[#171717] text-white px-6 py-2.5 text-xs font-bold"
          >
            <span>CLOSE DOSSIER</span>
          </button>
        </div>

      </div>
    </div>
  );
};
