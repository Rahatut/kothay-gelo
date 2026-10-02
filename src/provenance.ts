import { Transaction } from './types';

// A row the user typed has no statement behind it, so it has no extraction
// confidence and no evidence rows. tsconfig sets no strictNullChecks, which
// means a merely-optional field would have printed "Confidence 0%" for a
// hand-entered row instead of failing to compile. These three selectors are
// the only sanctioned way for the UI to reach either value, so the rule lives
// in exactly one place. src/types.ts holds no runtime code, which is why this
// module exists at all.

export function isUserAsserted(tx: Transaction): boolean {
  return tx.provenance.source === 'USER_ASSERTED';
}

// null means "no extraction confidence exists for this row", which the UI must
// render as nothing. Only the EXTRACTED arm declares the field.
export function extractionConfidenceOf(tx: Transaction): number | null {
  return tx.provenance.source === 'EXTRACTED'
    ? tx.provenance.extraction_confidence
    : null;
}

// FR-018: a hand-entered row has nothing to cite, and a synthetic evidence id
// would be a fabricated document location.
export function evidenceFor(tx: Transaction): string[] {
  return tx.provenance.source === 'EXTRACTED' ? tx.evidence_ids : [];
}
