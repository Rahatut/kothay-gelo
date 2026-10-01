import { db } from './db';
import { extractWithGemini } from './gemini';
import { DocumentRecord, ProcessingJob, ProcessingStage, Evidence, Transaction } from '../src/types';

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
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

  private static async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async updateStage(job: ProcessingJob, stage: ProcessingStage, doc?: DocumentRecord) {
    job.stage = stage;
    job.status = stage;
    if (doc) {
      doc.stage = stage;
    }
    // Brief delay to allow UI state machine visualization
    await this.sleep(400);
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
        page_number: 1,
        bounding_box: {
          x: 48,
          y: 100 + i * 36,
          width: 680,
          height: 28,
          page: 1,
        },
        raw_text: cand.rawText || `${cand.date} ${cand.merchant} ${cand.amount}`,
        raw_text_snippet: cand.evidenceSnippet || cand.rawText,
        normalized_text: `${norm.canonicalName} ৳${cand.amount} (${cand.direction})`,
        evidence_type: cand.direction === 'INCOME' ? 'AMOUNT' : 'MERCHANT',
        created_at: new Date().toISOString(),
      };
      db.evidence.set(evId, evidenceRecord);

      const txId = `txn_${Date.now()}_${i + 1}`;
      const isUncertain = cand.confidence < 0.85 || norm.categoryId === 'cat_other';

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
        status: isUncertain ? 'NEEDS_REVIEW' : 'ACCEPTED',
        evidence_ids: [evId],
        confidence: cand.confidence,
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

    // 8. VALIDATING_RESULTS
    await this.updateStage(job, 'VALIDATING_RESULTS', doc);
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
   * Deterministic line parser for CSV, statements, and plain text
   */
  private static deterministicTextExtraction(text: string) {
    const candidates: any[] = [];
    const lines = text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('---') || line.startsWith('Account') || line.startsWith('Date')) continue;

      // Check for date pattern YYYY-MM-DD or DD/MM/YYYY
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
      // Check for amounts: ৳500, 500.00, +75,000.00, -680.00
      const amountMatch = line.match(/([+-]?)(?:৳\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);

      if (dateMatch && amountMatch) {
        const rawDate = dateMatch[0];
        let standardDate = rawDate;
        if (!rawDate.includes('-') || rawDate.length < 10) {
          standardDate = '2026-09-15';
        }

        const cleanAmtStr = amountMatch[2].replace(/,/g, '');
        const amount = parseFloat(cleanAmtStr);
        if (isNaN(amount) || amount <= 0) continue;

        const isCredit = line.toLowerCase().includes('credit') || line.toLowerCase().includes('salary') || amountMatch[1] === '+';
        const direction = isCredit ? 'INCOME' : 'EXPENSE';

        let merchant = 'Unknown Merchant';
        for (const rule of db.categories) {
          // Look for recognizable merchant names
        }
        if (line.match(/Foodpanda|FP\*/i)) merchant = 'Foodpanda';
        else if (line.match(/Chaldal/i)) merchant = 'Chaldal';
        else if (line.match(/Shwapno/i)) merchant = 'Shwapno';
        else if (line.match(/Uber/i)) merchant = 'Uber BD';
        else if (line.match(/Pathao/i)) merchant = 'Pathao';
        else if (line.match(/DESCO/i)) merchant = 'DESCO Electricity';
        else if (line.match(/Grameenphone|GP/i)) merchant = 'Grameenphone';
        else if (line.match(/Salary/i)) merchant = 'Monthly Salary';
        else if (line.match(/Rent/i)) merchant = 'Apartment Rent';

        candidates.push({
          date: standardDate,
          amount,
          merchant,
          description: line,
          direction,
          confidence: 0.92,
          rawText: line,
          evidenceSnippet: line,
        });
      }
    }

    return candidates;
  }
}
