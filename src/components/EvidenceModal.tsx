import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, MapPin } from 'lucide-react';
import { Transaction, EvidenceItem } from '../types';
import { isUserAsserted, extractionConfidenceOf, evidenceFor } from '../provenance';

interface EvidenceModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  locale: 'en' | 'bn';
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  transaction,
  onClose,
}) => {
  const [fetchedEvidence, setFetchedEvidence] = useState<EvidenceItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Derived rather than computed after an early return. Returning null before the
  // hooks below would call them a different number of times when the transaction
  // goes from null to a value, which is exactly what happens as the modal opens
  // and closes — React would then hold stale hook state.
  const hasEvidence = transaction ? evidenceFor(transaction).length > 0 : false;

  useEffect(() => {
    if (!transaction || !hasEvidence) return;
    const fetchEvidence = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/v1/transactions/${transaction.id}/evidence`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setFetchedEvidence(json.data?.evidence || json.data || null);
        }
      } catch (err) {
        console.error('Failed to load evidence:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvidence();
  }, [transaction?.id, hasEvidence]);

  useEffect(() => {
    if (!transaction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transaction, onClose]);

  if (!transaction) return null;

  if (!transaction) return null;

  const provenance = transaction.provenance;
  const userAsserted = isUserAsserted(transaction);
  const extractionConfidence = extractionConfidenceOf(transaction);

  // When the current transaction has no evidence IDs, there is no dossier to show.
  // Use the fetched evidence only when IDs exist; otherwise null.
  const evidence = hasEvidence ? fetchedEvidence : null;

  const rawSnippet =
    evidence?.raw_text_snippet ||
    evidence?.raw_text ||
    transaction.raw_text_snippet ||
    transaction.description ||
    'No raw snippet recorded for this transaction candidate.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas-deep/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence dossier"
    >
      <div className="bg-canvas border border-hairline rounded-xl w-full max-w-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-hairline pb-4 mb-6 gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge-pill">Evidence dossier</span>
            <span className="font-figure type-caption text-muted">
              {userAsserted
                ? 'Hand-entered row'
                : provenance.source === 'ENGINE_DERIVED'
                  ? 'Engine-derived row'
                  : transaction.document_id
                    ? `Doc #${transaction.document_id.slice(0, 8)}`
                    : 'No statement document'}
            </span>
          </div>
          <button type="button" onClick={onClose} className="btn-outline btn-sm" aria-label="Close">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="feature-card p-4 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="type-title-md text-ink">{transaction.merchant_name}</p>
              <p className="font-figure type-caption text-muted mt-0.5">
                {transaction.transaction_date} · ID {transaction.id}
              </p>
            </div>
            <div className="text-right">
              <p className="font-figure type-display-sm text-ink">
                ৳{transaction.amount.toLocaleString()}
              </p>
              {extractionConfidence !== null && (
                <p className="type-caption text-muted-soft">
                  Confidence {Math.round(extractionConfidence * 100)}%
                </p>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center type-caption text-muted">Retrieving statement artifacts</p>
        ) : (
          <div className="space-y-6">
            {/* A hand-entered row has no statement behind it, so its own words must
                not be reprinted under an extracted-from-statement heading. */}
            {provenance.source === 'USER_ASSERTED' ? (
              <div>
                <p className="type-caption-uppercase text-muted mb-2">
                  1. How this row entered the ledger
                </p>
                <div className="bg-surface-strong rounded-lg p-4 type-caption text-body">
                  <p>Entered by hand on {provenance.asserted_at.slice(0, 10)}.</p>
                  <p className="text-muted mt-1.5">
                    No statement document backs this row, so there is no statement text and no
                    page coordinates to show.
                  </p>
                </div>
              </div>
            ) : provenance.source === 'ENGINE_DERIVED' ? (
              <div>
                <p className="type-caption-uppercase text-muted mb-2">
                  1. How this row entered the ledger
                </p>
                <div className="bg-surface-strong rounded-lg p-4 type-caption text-body">
                  <p>
                    Derived by the deterministic financial engine (version{' '}
                    {provenance.calculation_version}).
                  </p>
                  <p className="text-muted mt-1.5">
                    Derivation: {provenance.derivation}. No statement text extraction applies
                    because this is a comparison figure, not a line read from an uploaded
                    statement.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="type-caption-uppercase text-muted mb-2">
                  1. Raw statement text extraction
                </p>
                <div className="bg-surface-dark text-on-dark-soft font-figure type-caption p-4 rounded-md leading-relaxed select-all">
                  {rawSnippet}
                </div>
              </div>
            )}

            {evidence?.bounding_box && (
              <div>
                <p className="type-caption-uppercase text-muted mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>2. Document bounding box coordinates</span>
                </p>
                <dl className="feature-card p-3 font-figure type-caption grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>X: {evidence.bounding_box.x.toFixed(1)}</div>
                  <div>Y: {evidence.bounding_box.y.toFixed(1)}</div>
                  <div>Width: {evidence.bounding_box.width.toFixed(1)}</div>
                  <div>Height: {evidence.bounding_box.height.toFixed(1)}</div>
                </dl>
              </div>
            )}

            <div className="bg-surface-strong rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="type-body-strong text-ink">Immutable audit record</p>
                  <p className="type-caption text-body mt-1">
                    {userAsserted
                      ? 'This row is your own assertion, recorded as you typed it on the date above. No statement document backs it, so it carries no extraction record.'
                      : provenance.source === 'ENGINE_DERIVED'
                        ? 'This row was derived by the deterministic financial engine as a comparison figure. No statement extraction or page coordinates apply.'
                        : 'This transaction was extracted with zero hallucination. All numerical values correspond to confirmed entries in the user-provided statement.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-hairline flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Close dossier
          </button>
        </div>
      </div>
    </div>
  );
};
