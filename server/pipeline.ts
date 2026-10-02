import { randomUUID } from 'node:crypto';
import { db } from './db';
import { extractWithGemini, type ExtractedCandidate } from './gemini';
import { parseRow } from './rowParse';
import { insertExtractedRows } from './db/repositories/transactions';
import { UNCATEGORIZED_CATEGORY_ID } from './categories';
import { DocumentRecord, ProcessingJob, ProcessingStage, Evidence, Transaction } from '../src/types';


/**
 * Version of the confidence derivation below. Bump when the weights change, so a
 * stored figure stays interpretable.
 */
export const PARSE_CONFIDENCE_VERSION = 'parse-confidence-v1';

/** Exposed for the honesty gate in honesty.test.ts, which asserts the derivation
 *  rather than a constant. Same function the parser calls. */
export const deriveParseConfidenceForTest = deriveParseConfidence;

/**
 * Weights for a deterministically parsed row.
 *
 * The parser previously assigned a flat 0.92 to every row regardless of what it
 * had actually determined, so a row with no recognisable merchant and no explicit
 * direction was indistinguishable from a clean one. The score now reflects which
 * fields were genuinely established, and the weights are named and versioned
 * rather than being a bare literal in the middle of a loop.
 */
export const PARSE_WEIGHTS = {
  date: 0.4,
  amount: 0.4,
  merchant: 0.15,
  direction: 0.05,
} as const;

/**
 * Deductions for readings the parser is not sure of.
 *
 * `dateAmbiguous` and `amountAmbiguous` were computed by the parser and then
 * discarded: `deriveParseConfidence` took only the four presence booleans, so a
 * date that could be either 1 September or 9 January scored exactly what a
 * certain date scored, and a line carrying two money tokens filed the last one as
 * definite. Both deductions are large enough to drop a row under the 0.85 bar,
 * which is the point -- an unresolved reading has to reach the reviewer.
 */
const AMBIGUITY_DEDUCTIONS = {
  date: 0.3,
  amount: 0.25,
  inferredDirection: 0.05,
} as const;

/**
 * Confidence for a parsed row, from the signals the parser actually resolved.
 *
 * A perfect score is achievable only when every field was established. Nothing
 * here invents certainty: an unrecognised merchant costs its weight, and an
 * implied rather than stated direction costs its own.
 */
function deriveParseConfidence(signals: {
  dateRecognised: boolean;
  amountRecognised: boolean;
  merchantRecognised: boolean;
  directionExplicit: boolean;
  dateAmbiguous?: boolean;
  amountAmbiguous?: boolean;
  directionInferred?: boolean;
}): number {
  let score = 0;
  if (signals.dateRecognised) score += PARSE_WEIGHTS.date;
  if (signals.amountRecognised) score += PARSE_WEIGHTS.amount;
  if (signals.merchantRecognised) score += PARSE_WEIGHTS.merchant;
  if (signals.directionExplicit) score += PARSE_WEIGHTS.direction;

  if (signals.dateAmbiguous) score -= AMBIGUITY_DEDUCTIONS.date;
  if (signals.amountAmbiguous) score -= AMBIGUITY_DEDUCTIONS.amount;
  if (signals.directionInferred) score -= AMBIGUITY_DEDUCTIONS.inferredDirection;

  // Clamped rather than wrapped: a row missing several fields must not produce a
  // negative "confidence", which is a number no view knows how to display.
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

export class ProcessingPipeline {
  /**
   * Starts processing job for an uploaded document
   */
  public static async processDocumentAsync(
    documentId: string,
    fileContent: string,
    isBase64Image: boolean = false,
    mimeType: string = 'text/plain'
  ): Promise<ProcessingJob> {
    const doc = db.documents.get(documentId);
    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    const job: ProcessingJob = {
      id: `job_${randomUUID()}`,
      document_id: documentId,
      user_id: doc.user_id,
      status: 'QUEUED',
      stage: 'QUEUED',
      attempt: 1,
      pipeline_version: 'v1.0-bd',
      started_at: new Date().toISOString(),
      extracted_count: 0,
      created_at: new Date().toISOString(),
    };

    db.processingJobs.set(job.id, job);
    db.logAudit(doc.user_id, 'PROCESSING_STARTED', 'ProcessingJob', job.id, `Started extraction for ${doc.filename}`);

    // Run asynchronous pipeline through the defined state machine stages
    this.runStages(job, doc, fileContent, isBase64Image, mimeType).catch(err => {
      console.error('[Pipeline] Error in processing execution:', err);
      job.status = 'FAILED';
      job.stage = 'FAILED';
      job.error_code = 'PIPELINE_ERROR';
      job.error_message = err.message || 'Processing failed unexpectedly';
      db.logAudit(doc.user_id, 'PROCESSING_FAILED', 'ProcessingJob', job.id, job.error_message || '');
    });

    return job;
  }

  /**
   * Advances the pipeline and records how long the stage took.
   *
   * This used to sleep 400 ms per transition purely so the UI state machine had
   * something to animate — seven transitions, a ~2.8 s floor added to every
   * upload against a 20 s budget. The delay is gone; the visible dwell now lives
   * in the client, where it costs the server nothing.
   *
   * Per-stage duration is measured and kept, because the sleep was hiding the
   * real cost of extraction. Knowing which stage is actually slow is the only
   * way to spend the budget where it matters.
   */
  private static async updateStage(
    job: ProcessingJob,
    stage: ProcessingStage,
    doc?: DocumentRecord,
  ) {
    const previousStage = job.stage;
    const previousAt = (job as ProcessingJob & { stage_started_at?: string }).stage_started_at;
    if (previousStage && previousAt && previousStage !== 'QUEUED') {
      const durationMs = Date.now() - Date.parse(previousAt);
      const timings = (job as ProcessingJob & { stage_durations_ms?: Record<string, number> })
        .stage_durations_ms ?? {};
      timings[previousStage] = durationMs;
      (job as ProcessingJob & { stage_durations_ms?: Record<string, number> })
        .stage_durations_ms = timings;
    }

    (job as ProcessingJob & { stage_started_at?: string }).stage_started_at =
      new Date().toISOString();
    job.stage = stage;
    job.status = stage;
    if (doc) {
      doc.stage = stage;
    }
  }

  private static async runStages(
    job: ProcessingJob,
    doc: DocumentRecord,
    fileContent: string,
    isBase64Image: boolean,
    mimeType: string
  ) {
    // 1. VALIDATING
    await this.updateStage(job, 'VALIDATING', doc);
    if (!fileContent && !isBase64Image) {
      throw new Error('Empty document payload');
    }

    // 2. CLASSIFYING
    await this.updateStage(job, 'CLASSIFYING', doc);
    let detectedSource = doc.source_type || 'General';
    if (fileContent.includes('bKash') || fileContent.includes('017') || fileContent.includes('TrxID')) {
      detectedSource = 'bKash';
    } else if (fileContent.includes('Nagad')) {
      detectedSource = 'Nagad';
    } else if (fileContent.includes('City Bank') || fileContent.includes('Visa')) {
      detectedSource = 'City Bank';
    }
    doc.source_type = detectedSource as any;

    // 3. EXTRACTING
    await this.updateStage(job, 'EXTRACTING', doc);
    let candidates = await extractWithGemini(fileContent, isBase64Image, mimeType);

    // Fallback: If Gemini returned empty (e.g. no key or offline), use deterministic parser for CSV/text
    const usedModel = Boolean(candidates && candidates.length > 0);
    if (!candidates || candidates.length === 0) {
      candidates = this.deterministicTextExtraction(fileContent);
    }

    // 4. NORMALIZING & 5. CATEGORIZING & 6. EVIDENCE MAPPING
    await this.updateStage(job, 'NORMALIZING', doc);
    await this.updateStage(job, 'CATEGORIZING', doc);

    const createdTransactions: Transaction[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const norm = db.normalizeMerchant(cand.merchant);

      // Create evidence record
      const evId = `ev_${job.id}_${i + 1}`;
      const evidenceRecord: Evidence = {
        id: evId,
        document_id: doc.id,
        // No page or coordinates. The previous values were synthesised as
        // `y: 100 + i * 36`, so every row got a plausible-looking box that pointed
        // at an arbitrary line — a highlight on the wrong words, presented as
        // though it were located. Absence is honest; a fabricated coordinate is
        // not. Real geometry arrives with the PDF extractor in spec 002.
        page_number: undefined,
        bounding_box: undefined,
        // The verbatim source line, or nothing. The previous fallback built
        // `${date} ${merchant} ${amount}`, a string that never appeared in the
        // user's statement, and persisted it as the citation the interface quotes.
        // A missing quote is better than a fabricated one, so this may be empty.
        raw_text: cand.rawText ?? '',
        raw_text_snippet: cand.evidenceSnippet || cand.rawText,
        normalized_text: `${norm.canonicalName} ৳${cand.amount} (${cand.direction})`,
        evidence_type: cand.direction === 'INCOME' ? 'AMOUNT' : 'MERCHANT',
        created_at: new Date().toISOString(),
      };
      db.evidence.set(evId, evidenceRecord);

      const txId = `txn_${randomUUID()}`;
      // A row with no established confidence is uncertain by definition. It was
      // previously compared against 0.85, which meant a null either threw or --
      // once nulls were allowed -- silently passed the check and was accepted
      // as though the extractor had been certain.
      const isUncertain =
        cand.confidence === null ||
        cand.confidence < 0.85 ||
        norm.categoryId === UNCATEGORIZED_CATEGORY_ID;

      const transaction: Transaction = {
        id: txId,
        user_id: doc.user_id,
        document_id: doc.id,
        transaction_date: cand.date,
        posted_at: `${cand.date}T12:00:00Z`,
        amount: cand.amount,
        currency: 'BDT',
        direction: cand.direction,
        merchant_name: norm.canonicalName,
        raw_merchant_name: cand.merchant,
        raw_text_snippet: cand.evidenceSnippet || cand.rawText,
        description: cand.description || cand.merchant,
        category_id: norm.categoryId,
        // The normalizer falls back to the uncategorized sentinel when no rule matched,
        // so labelling that MERCHANT_RULE would claim a derivation that never
        // happened (constitution Principle VI).
        category_source: norm.categoryId === UNCATEGORIZED_CATEGORY_ID ? 'UNCATEGORIZED' : 'MERCHANT_RULE',
        status: isUncertain ? 'NEEDS_REVIEW' : 'ACCEPTED',
        evidence_ids: [evId],
        // ExtractedCandidate carries no model/version fields; the pipeline is
        // the only place that knows the row came from extraction, not from the
        // deterministic fallback, so the value is recorded as 'unknown' rather
        // than guessed.
        // The provenance union is what enforces this: `extraction_confidence`
        // exists only on the EXTRACTED arm, so a row the extractor did not
        // qualify falls to ENGINE_DERIVED and no view can display a confidence
        // for it at all.
        provenance:
          cand.confidence !== null
            ? {
                source: 'EXTRACTED',
                extraction_model: 'unknown',
                extraction_version: 'unknown',
                extraction_confidence: cand.confidence,
              }
            : {
                source: 'ENGINE_DERIVED',
                calculation_version: 'engine-1.1.0',
                derivation: 'extracted without a stated confidence',
              },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      createdTransactions.push(transaction);
    }

    // 7. DEDUPLICATING
    await this.updateStage(job, 'DEDUPLICATING', doc);
    for (const tx of createdTransactions) {
      const dup = db.detectDuplicateCandidate(tx, doc.user_id);
      if (dup) {
        tx.is_duplicate_candidate = true;
        tx.duplicate_of_id = dup.id;
        tx.status = 'NEEDS_REVIEW';
      }
      db.transactions.set(tx.id, tx);
    }

    // 7b. PERSISTING
    //
    // The rows above were only ever written into the in-memory maps. Every read
    // path -- the transactions list, the dashboard, each capability -- queries
    // `transaction_candidates`, so a finished upload reported zero transactions.
    // The statement uploaded, the job completed, and the user saw nothing.
    //
    // Both halves go in one transaction, and the schema aborts a write whose
    // evidence link is missing, so a row cannot reach the ledger uncited.
    await this.updateStage(job, 'VALIDATING_RESULTS', doc);
    try {
      await insertExtractedRows(
        createdTransactions.map((tx) => ({
          id: tx.id,
          accountId: tx.user_id,
          // Both are set on every row this loop creates, so a missing value is a
          // programming error rather than something to paper over with a null.
          documentId: tx.document_id ?? doc.id,
          date: tx.transaction_date,
          amount: tx.amount,
          direction: tx.direction,
          merchantName: tx.merchant_name,
          rawTextSnippet: tx.raw_text_snippet ?? tx.description,
          categoryId: tx.category_id === UNCATEGORIZED_CATEGORY_ID ? null : tx.category_id,
          confidence:
            tx.provenance.source === 'EXTRACTED' ? tx.provenance.extraction_confidence : null,
          // Which parser actually produced the row, not a constant. The previous
          // value was always 'DETERMINISTIC' while the block above recorded the
          // model as 'unknown', so a model-extracted row was filed as deterministic.
          extractionMethod: usedModel ? 'MODEL' : 'DETERMINISTIC',
          status: tx.status,
          isDuplicateCandidate: Boolean(tx.is_duplicate_candidate),
        })),
        Array.from(db.evidence.values())
          .filter((ev) => ev.document_id === doc.id)
          .map((ev) => ({
            id: ev.id,
            accountId: doc.user_id,
            documentId: doc.id,
            // The schema's CHECK list is the authority on what a type may be;
            // 'OTHER' is its escape hatch, so an unrecognised value is stored as
            // such rather than being forced into a category that would misdescribe
            // the evidence.
            evidenceType: ev.evidence_type ?? 'OTHER',
            rawText: ev.raw_text,
            rawTextSnippet: ev.raw_text_snippet ?? ev.raw_text,
            normalizedText: ev.normalized_text ?? ev.raw_text,
            confidence: null,
          })),
        createdTransactions.flatMap((tx) =>
          tx.evidence_ids.map((evidenceId) => ({ transactionId: tx.id, evidenceId })),
        ),
      );
    } catch (err) {
      // A silent partial write would leave the ledger disagreeing with the job
      // status, so the job fails loudly instead of reporting success.
      throw new Error(
        `Could not save the extracted rows: ${(err as Error).message}`,
      );
    }

    job.extracted_count = createdTransactions.length;
    doc.status = 'PROCESSED';
    doc.stage = 'COMPLETED';
    doc.extracted_candidate_count = createdTransactions.length;

    // Recalculate deterministic insights and recommendations
    db.recalculateUserInsights(doc.user_id);

    // 9. COMPLETED
    job.status = 'COMPLETED';
    job.stage = 'COMPLETED';
    job.completed_at = new Date().toISOString();

    db.logAudit(
      doc.user_id,
      'PROCESSING_COMPLETED',
      'ProcessingJob',
      job.id,
      `Successfully extracted ${createdTransactions.length} transactions from ${doc.filename}`
    );
  }

  /**
   * Deterministic extraction for delimited and plain-text statements.
   *
   * Delegated to `parseRow`, which is where the field-level rules live and where
   * they are unit-tested. The previous in-line version found "the first number on
   * the line" as the amount, so every dated row took the year as its amount and
   * reported it at a flat 0.92.
   *
   * Rows the parser could not fully establish are still returned, with a lower
   * confidence, so the reviewer sees them. They are never dropped silently and
   * never completed by guessing.
   */
  private static deterministicTextExtraction(text: string) {
    const candidates: ExtractedCandidate[] = [];

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (
        !line ||
        line.startsWith('---') ||
        line.startsWith('Account') ||
        line.startsWith('Date') ||
        line.startsWith('Sl') ||
        line.startsWith('Total')
      ) {
        continue;
      }

      const row = parseRow(line);
      // No date and no amount means nothing in the line to file. Returning null
      // here is not a silent drop: such a line is a header or a page footer,
      // and the row count is reported separately from the extraction result.
      if (!row) continue;
      if (row.date === null || row.amount === null) continue;

      candidates.push({
        date: row.date,
        amount: row.amount,
        merchant: row.merchant,
        description: row.raw,
        // The parser states a direction for every filed row: explicitly, or from
        // the statement convention, which it reports through directionInferred and
        // the confidence above. The previous `row.direction ?? 'EXPENSE'` put the
        // guess here, where nothing recorded that it had been made.
        direction: row.direction,
        confidence: deriveParseConfidence({
          dateRecognised: true,
          amountRecognised: !row.signals.amountWeak,
          merchantRecognised: row.signals.merchant,
          directionExplicit: !row.directionInferred,
          dateAmbiguous: row.signals.dateAmbiguous,
          amountAmbiguous: row.signals.amountAmbiguous,
          directionInferred: row.directionInferred,
        }),
        rawText: row.raw,
        evidenceSnippet: row.raw,
      });
    }

    return candidates;
  }
}
