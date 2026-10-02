// Must precede every other import so configuration is present before any module
// reads it. `.env` is a local development convenience; AI Studio injects these
// variables at runtime from the Secrets panel.
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { ProcessingPipeline } from './server/pipeline';
import { narrateInsightFacts } from './server/gemini';
import { GOLDEN_SAMPLES } from './server/goldenDataset';
import { Transaction, type CorrectionRecord } from './src/types';
import { assertRequiredConfig, port, ConfigError } from './server/config';
import { migrate } from './server/db/migrate';
import { execute } from './server/db/client';
import { authRouter } from './server/auth/routes';
import { attachIdentity, requireSameOrigin, requireIdentity } from './server/auth/guard';
import { capabilityRouter } from './server/capabilities/routes';
import { askRouter } from './server/ask';
import { invokeCapability } from './server/capabilities/guard';
import { resolvePeriod } from './server/capabilities/resolvePeriod';
import {
  listTransactions,
  toClientTransaction,
  evidenceIdsFor,
} from './server/db/repositories/transactions';
import { purgeAccountData, countAccountData } from './server/db/repositories/purge';
import { createGoal, deleteGoal, listGoals } from './server/db/repositories/goals';
import { listEvidenceForAccount, evidenceForTransaction } from './server/db/repositories/evidence';
import { listInsights } from './server/db/repositories/insights';
import { listDocuments, getDocument } from './server/db/repositories/documents';
import { seedSampleData } from './server/db/seed';
import { getAccountById, markAccountDeleted } from './server/db/repositories/accounts';
import { clearSessionCookie } from './server/auth/session';
import { refuseNotFound } from './server/auth/refusal';
import { inspectUpload, rejectionMessage } from './server/uploadValidation';
import { extractPdfText, pdfPlainText, type PdfTextPage } from './server/pdfExtract';
import {
  validateManualEntry,
  proposeCategory,
  buildManualTransaction,
  applyManualCorrection,
  detectDuplicateFlag,
  removalRecord,
} from './server/manualEntry';
import { newTransactionId, newCorrectionId } from './server/ids';
import { monthPeriod } from './server/capabilities/period';
import { generateDeterministicInsights } from './server/financialEngine';
import {
  createManualTransaction,
  updateTransactionRow,
  deleteTransactionRow,
  listCorrections,
  getTransaction,
  monthsWithData,
  recordCorrections,
} from './server/db/repositories/transactions';
import { listAudit } from './server/db/repositories/audit';
import { recordAudit } from './server/db/repositories/audit';
import {
  newConsentId,
  newDocumentId,
  newFeedbackId,
  newGoalId,
  newRequestId,
  newUploadId,
} from './server/ids';

async function startServer() {
  const app = express();
  // Per-process salt for consent IP digests, so they are not correlatable across
  // restarts and cannot be matched against a known-address list.
  const consentSalt = randomBytes(16).toString('hex');
  // Fail fast on absent configuration so a misconfigured deployment reports one
  // clear error at boot rather than a confusing failure on the first request
  // that happens to need the value.
  assertRequiredConfig();

  // Schema is applied before the listener opens, so no request can arrive
  // against a half-built database. Migrations are idempotent and tracked in
  // PRAGMA user_version, so a restart is a no-op once current.
  const migrationResult = await migrate();
  if (migrationResult.applied.length > 0) {
    console.log(`[Kothay Gelo?] Applied ${migrationResult.applied.length} migration(s)`);
  }

  const PORT = port();

  // JSON Body parsing up to 50mb for base64 statement images / PDF chunks
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(attachIdentity);
  app.use(requireSameOrigin);

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).requestId = newRequestId();
    res.setHeader('X-Request-ID', (req as any).requestId);
    next();
  });

  // Health check
  
/**
 * Maps a content-detected kind to the schema's `source_kind` vocabulary.
 *
 * Derived from the detected kind, not the filename: a `.pdf` that is really CSV
 * text is delimited, and classifying it by extension would file a bank statement
 * as a mobile wallet.
 */
function sourceKindFor(kind: 'PDF' | 'IMAGE' | 'TEXT' | 'BINARY') {
  if (kind === 'IMAGE') return 'MOBILE_WALLET';
  if (kind === 'PDF') return 'MOBILE_WALLET';
  return 'DELIMITED';
}

/**
 * Whole months between now and a deadline, or null when there is no deadline or it
 * has passed.
 *
 * Used to divide a target into a monthly requirement. The previous version divided
 * by a hardcoded six months with a "6 months default" comment, which presented an
 * arbitrary horizon as though the user had chosen it.
 */
function monthsUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const parsed = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const now = Date.now();
  if (parsed <= now) return null;
  const months = (parsed - now) / (30.44 * 24 * 60 * 60 * 1000);
  return months < 1 ? 1 : Math.floor(months);
}

/**
 * Every row an account holds, paged to exhaustion.
 *
 * `listTransactions` bounds a page at 1000 and orders ascending, so any caller that
 * wanted "everything" silently received the oldest 1000. Two call sites did exactly
 * that: insight recomputation, where the newest entries — including the one just
 * written — reached no total at all, and duplicate detection, where a duplicate of a
 * recent row was never flagged.
 */
async function readAllTransactions(accountId: string) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listTransactions(accountId, { limit: PAGE, offset });
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/**
 * Recomputes a user's insights and recommendations from the ledger.
 *
 * The in-memory `recalculateUserInsights` reads `db.transactions`, which only holds
 * rows the pipeline happened to place there. Anything written through the repository
 * -- every manual entry, every correction -- is invisible to it, so calling it after
 * an edit computed insights from a stale set. This reads the relational ledger and
 * hands the rows to the engine.
 */
async function recalculateForAccount(userId: string): Promise<void> {
  try {
    // Bounded above by `boundedLimit`, which caps at 1000. Ordered ascending, that
    // silently meant "the oldest 1000 rows" -- so on a larger ledger the newest
    // entries, including the one just written, contributed to nothing. Paged
    // instead of truncated.
    const stored = await readAllTransactions(userId);
    const rows = stored.map((r) => toClientTransaction(r));
    const { insights, recommendations } = generateDeterministicInsights(rows, [], userId);

    // Scoped to this account. `db.insights` and `db.recommendations` are
    // process-global maps, so clearing them outright wiped every other user's
    // derived view the moment anyone recorded a transaction or corrected one. The
    // old per-user scrub in `MemoryDatabase` filters by `user_id` for exactly this
    // reason.
    for (const [id, insight] of db.insights) {
      if (insight.user_id === userId) db.insights.delete(id);
    }
    for (const [id, rec] of db.recommendations) {
      if (rec.user_id === userId) db.recommendations.delete(id);
    }
    for (const insight of insights) db.insights.set(insight.id, insight);
    for (const rec of recommendations) db.recommendations.set(rec.id, rec);
  } catch (err) {
    // A recompute failure must not fail the write that triggered it. The ledger is
    // already correct; only the derived view is stale.
    console.error('[insights] recompute failed:', err);
  }
}

/** The provider is advisory only; it never decides how content is parsed. */
function providerFor(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.includes('bkash')) return 'bKash';
  if (lower.includes('nagad')) return 'Nagad';
  if (lower.includes('rocket')) return 'Rocket';
  return null;
}

function detectedMimeFor(kind: 'PDF' | 'IMAGE' | 'TEXT' | 'BINARY'): string {
  switch (kind) {
    case 'PDF':
      return 'application/pdf';
    case 'IMAGE':
      return 'image/jpeg';
    case 'TEXT':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'kothay-gelo-api', version: 'v1.0-mvp' });
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1', requireIdentity);

  // The capability endpoint is the only path to a financial figure that does not
  // go through the engine. Mounted after the /v1 guard, so a caller must be
  // authenticated and the guard has already resolved the account.
  app.use('/v1/capabilities', capabilityRouter);
  app.use('/v1/ask', askRouter);

  /**
   * A salted digest of the request's IP, or null when the IP is unavailable.
   *
   * Used for consent provenance. Salted with a per-process value so the digest
   * cannot be reversed against a known address list, and it is deliberately not
   * stable across restarts: a consent log does not need to correlate by address.
   */
  function hashRequestIp(req: Request): string | null {
    const ip = req.ip ?? req.socket?.remoteAddress;
    if (!ip || ip === '::1' || ip === '127.0.0.1') return null;
    return `sha256:${createHash('sha256').update(`${consentSalt}:${ip}`).digest('hex').slice(0, 32)}`;
  }

  /**
   * The authenticated account for this request.
   *
   * Previously returned the literal 'usr_bangladesh_consumer_01' and ignored the
   * request entirely, which meant the ownership checks comparing against this
   * value could never fail. Identity now comes only from the server-held
   * session — never a header, query, or body field.
   *
   * Throws when absent, which is safe because `app.use('/v1', requireIdentity)`
   * above has already rejected every unauthenticated /v1 request: by the time a
   * handler runs, an identity exists. Throwing rather than returning null keeps
   * the ~25 call sites free of a nullable that would otherwise force a null
   * check at each one and silently produce empty results.
   */
  const getAuthenticatedUserId = (req: Request): string => {
    if (!req.accountId) {
      throw new ConfigError('Authentication is required for financial data routes.');
    }
    return req.accountId;
  };

  // `PATCH /v1/users/me` was removed. It read `db.users`, a map emptied when the boot
  // seed was deleted, so it answered 404 for every signed-in user while appearing to
  // offer profile editing. Nothing called it. Locale lives in local storage and
  // timezone is not yet a stored preference; spec 001 will reintroduce the surface if
  // a preference genuinely needs the server.

  app.get('/v1/settings/consents', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const records = db.consents.get(userId) || [];
    res.json({ data: records });
  });

  app.post('/v1/settings/consents', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { consent_type, accepted } = req.body;
    let userConsents = db.consents.get(userId) || [];

    const existingIndex = userConsents.findIndex(c => c.consent_type === consent_type);
    if (accepted) {
      if (existingIndex >= 0) {
        userConsents[existingIndex].revoked_at = undefined;
        userConsents[existingIndex].accepted_at = new Date().toISOString();
      } else {
        const ipHash = hashRequestIp(req);
        userConsents.push({
          id: newConsentId(),
          user_id: userId,
          consent_type,
          policy_version: 'v1.0-bd',
          accepted_at: new Date().toISOString(),
          // A real digest of the request's IP, or nothing. The previous value was
          // the truncated literal 'sha256:d8a9f...', which looked like a hash and
          // hashed nothing — so a consent record implied provenance it did not
          // have. Omitting the field is honest; inventing a digest is not.
          ...(ipHash ? { ip_hash: ipHash } : {}),
        });
      }
      db.logAudit(userId, 'CONSENT_ACCEPTED', 'ConsentRecord', consent_type, `Accepted ${consent_type}`);
    } else {
      if (existingIndex >= 0) {
        userConsents[existingIndex].revoked_at = new Date().toISOString();
        db.logAudit(userId, 'CONSENT_REVOKED', 'ConsentRecord', consent_type, `Revoked ${consent_type}`);
      }
    }
    db.consents.set(userId, userConsents);
    res.json({ data: userConsents });
  });

  /**
   * The account's own audit trail.
   *
   * Reads the relational store, because that is where refusals and auth events
   * are actually written. It previously filtered the in-memory log, which no
   * longer receives them, so every refusal was invisible to the one surface
   * meant to expose it.
   */
  app.get('/v1/settings/audit', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    try {
      const events = await listAudit(userId);
      return res.json({ data: events });
    } catch (err) {
      console.error('[settings] audit read failed:', err);
      return res.status(500).json({ error: { code: 'AUDIT_FAILED', message: 'Could not read the audit trail.' } });
    }
  });

  /**
   * The account's whole ledger, as JSON.
   *
   * Rewritten. It read `db.users` for the profile -- a map emptied when the boot seed
   * was removed, so `user` was always `null` -- and `db.transactions` for the rows,
   * while every read path had moved to the relational store. It therefore exported a
   * null profile and an incomplete ledger while presenting itself as the tenant
   * archive.
   *
   * The client had stopped calling this and was exporting `/v1/transactions`
   * directly, which is capped at 500 rows and omits documents, evidence, insights,
   * and goals entirely. The button's own copy says "your full financial ledger and
   * extracted metadata", so this route is what the button now calls.
   *
   * Everything is read scoped to the caller. The export is a data-sovereignty
   * feature, so it must contain exactly the caller's data and nothing else.
   */
  app.post('/v1/settings/export', async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    try {
      const [stored, evidence, documents, insights, goals] = await Promise.all([
        // No limit: an export that silently truncates is a wrong answer, not a
        // partial one. It is bounded by what the account actually holds.
        listTransactions(userId, { limit: 500_000 }),
        listEvidenceForAccount(userId),
        listDocuments(userId),
        listInsights(userId),
        listGoals(userId),
      ]);

      const evidenceByTransaction = await evidenceIdsFor(userId, stored.map((r) => r.id));
      const transactions = stored.map((r) => toClientTransaction(r, evidenceByTransaction.get(r.id) ?? []));

      const account = await getAccountById(userId);

      db.logAudit(userId, 'DATA_EXPORTED', 'User', userId, 'Downloaded tenant archive');

      return res.json({
        exported_at: new Date().toISOString(),
        account: account
          ? {
              id: account.id,
              email: account.email,
              status: account.status,
              created_at: account.created_at,
            }
          : null,
        counts: {
          transactions: transactions.length,
          documents: documents.length,
          evidence: evidence.length,
          insights: insights.length,
          goals: goals.length,
        },
        transactions,
        documents,
        evidence,
        insights,
        goals,
      });
    } catch (err) {
      // A failed export must not look like an empty one: an empty archive reads as
      // "you have no data", which is the opposite of what happened.
      console.error('[export] failed:', err);
      return res.status(500).json({
        error: {
          code: 'EXPORT_FAILED',
          message: 'Your archive could not be assembled. Nothing was downloaded; please try again.',
        },
      });
    }
  });

  // Account deletion lives in the auth router, which revokes the account's
  // sessions before the account is marked deleted.
  //
  // This duplicate was registered first and therefore shadowed it, so deletion
  // set the status without invalidating outstanding sessions: a session issued
  // before deletion kept working until it expired.
  app.post('/v1/settings/delete-account', requireIdentity, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    try {
      const account = await getAccountById(userId);
      if (!account) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
      }
      await markAccountDeleted(userId);
      await clearSessionCookie(res);
      return res.json({
        success: true,
        message: 'Account deleted and every session revoked.',
      });
    } catch (err) {
      console.error('[settings] delete-account failed:', err);
      return res
        .status(500)
        .json({ error: { code: 'DELETE_FAILED', message: 'Could not delete the account.' } });
    }
  });

  /**
   * Permanently erases the caller's statements, transactions, evidence, leaks, and
   * targets.
   *
   * This previously deleted rows from the in-memory maps and answered
   * `{"success":true}`. Every read path queries the relational store, so nothing it
   * touched was ever read back: verified against a running server, the route
   * reported success and left 25 transactions and ৳27,528 of expenses in place. The
   * UI showed the data gone because the documents list came from memory; reloading
   * brought it all back.
   *
   * Both stores are now cleared, the delete is scoped to the caller's account, and
   * the response reports what was actually removed and what survived. An incomplete
   * purge is a failure with a 500, not a success -- telling a user their financial
   * data is erased while it is not is the one outcome worth avoiding here.
   *
   * Audit events are kept: they record that the erasure happened and carry no
   * transaction content.
   */
  app.post('/v1/settings/reset', async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    const result = await purgeAccountData(userId);

    // The in-memory maps still back /v1/uploads and /v1/insights, so they are
    // cleared too. Leaving them would resurrect documents and leaks the
    // relational purge just removed.
    Array.from(db.transactions.values()).filter(t => t.user_id === userId).forEach(t => db.transactions.delete(t.id));
    Array.from(db.documents.values()).filter(d => d.user_id === userId).forEach(d => db.documents.delete(d.id));
    Array.from(db.insights.values()).filter(i => i.user_id === userId).forEach(i => db.insights.delete(i.id));
    Array.from(db.recommendations.values()).filter(r => r.user_id === userId).forEach(r => db.recommendations.delete(r.id));
    Array.from(db.goals.values()).filter(g => g.user_id === userId).forEach(g => db.goals.delete(g.id));

    db.logAudit(userId, 'SESSION_RESET', 'User', userId, 'Purged all statements, transactions, and calculations');

    if (!result.complete) {
      const survivors = Object.entries(result.remaining)
        .filter(([, n]) => n > 0)
        .map(([label, n]) => `${n} ${label}`)
        .join(', ');
      return res.status(500).json({
        error: {
          code: 'PURGE_INCOMPLETE',
          message:
            `Some data could not be erased and is still stored: ${survivors}. ` +
            'Your account is untouched otherwise; please contact support before retrying.',
        },
        removed: result.removed,
        remaining: result.remaining,
      });
    }

    const total = Object.values(result.removed).reduce<number>((a, b) => a + b, 0);
    return res.json({
      success: true,
      purged: result.removed,
      total_removed: total,
      // The old message said "session memory cleared", which described an
      // in-memory concept and implied nothing durable was touched.
      message:
        total === 0
          ? 'There was nothing stored to erase.'
          : 'Your statements, transactions, and calculations have been permanently deleted.',
    });
  });

  /** What a purge would remove, so the confirmation can say so before it happens. */
  app.get('/v1/settings/purge-preview', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    return res.json({ data: await countAccountData(userId) });
  });

  // -------------------------------------------------------------
  // UPLOAD & PROCESSING MODULE (/v1/uploads, /v1/processing)
  // -------------------------------------------------------------
  app.post('/v1/uploads', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const reqId = (req as any).requestId;
    const { filename, file_size, mime_type, content, is_base64_image } = req.body;

    // PDFs are posted as base64 bytes rather than as text read by the client.
    const is_base64_pdf =
      mime_type === 'application/pdf' || String(filename ?? '').toLowerCase().endsWith('.pdf');

    if (!filename) {
      return res.status(400).json({
        error: { code: 'FILENAME_REQUIRED', message: 'Filename is required.', request_id: reqId },
      });
    }

    /**
     * A PDF arrives as its bytes, base64 encoded, and is read here.
     *
     * The client used to call `selectedFile.text()` on a PDF, which decodes the
     * binary as UTF-8 and destroys everything that is not valid UTF-8. The text
     * layer never reached the parser, so almost every PDF looked like a scan and was
     * refused as "no readable text". The bytes are posted instead and extracted
     * server-side, where pdf.js is available.
     *
     * The page numbers come back with the text and are recorded on the evidence, so
     * a figure can cite the page it was read from rather than an invented coordinate.
     */
    let textForParsing = content ?? '';
    let extractedPages: PdfTextPage[] = [];

    if (is_base64_pdf) {
      const extraction = await extractPdfText(content ?? '');
      if (!extraction.ok) {
        return res.status(415).json({
          error: {
            code: extraction.reason === 'no_text_layer' ? 'PDF_HAS_NO_TEXT' : 'UNREADABLE_FILE',
            message: extraction.message,
            request_id: reqId,
          },
          detected_kind: 'PDF',
          byte_size: extraction.byteSize,
        });
      }
      extractedPages = extraction.pages;
      textForParsing = pdfPlainText(extraction);
    }

    // Content decides the type, not the filename or the declared MIME. Both are
    // supplied by the caller, so validating them proves nothing — the previous
    // route checked the filename alone and then handed whatever followed to a
    // parser and a model.
    //
    // A PDF is inspected on its extracted text rather than its bytes: after
    // extraction it is genuinely text, and running the binary through the printable
    // check would reject every real PDF.
    const inspection = is_base64_pdf
      ? { kind: 'PDF' as const, byteSize: Buffer.byteLength(textForParsing, 'utf8'), readable: true, text: textForParsing }
      : inspectUpload(content ?? '', Boolean(is_base64_image), mime_type);

    if (!inspection.readable) {
      return res.status(415).json({
        error: {
          code: 'UNREADABLE_FILE',
          message: rejectionMessage(inspection),
          request_id: reqId,
        },
        detected_kind: inspection.kind,
        byte_size: inspection.byteSize,
      });
    }

    const uploadId = newUploadId();
    const docId = newDocumentId();

    // Create Document record
    const documentRecord = {
      id: docId,
      upload_id: uploadId,
      user_id: userId,
      filename,
      // Derived from the detected content kind, not the filename. The previous
      // version read `.csv` and the words "bKash"/"Nagad" out of the filename,
      // which this same route documents as attacker-controlled.
      document_type: (inspection.kind === 'TEXT' ? 'TRANSACTION_HISTORY' : 'MOBILE_MONEY_STATEMENT') as any,
      source_type: (providerFor(filename) ?? 'General') as any,
      language: 'mixed' as any,
      // No page count. It was hardcoded to 1 for every upload, including
      // multi-page statements, which is the same fabricated-coordinate defect the
      // bounding boxes were removed for. Left null until a real paginator reports
      // one.
      page_count: null,
      status: 'PROCESSING' as any,
      stage: 'VALIDATING' as any,
      // The measured size, not the client-supplied one. The two stores disagreed:
      // this record took `file_size` from the request while the relational row
      // recorded `inspection.byteSize`.
      file_size: is_base64_pdf ? Buffer.byteLength(content ?? '', 'base64') : inspection.byteSize,
      mime_type: mime_type || (filename.endsWith('.csv') ? 'text/csv' : 'application/pdf'),
      created_at: new Date().toISOString(),
    };

    db.documents.set(docId, documentRecord);
    db.logAudit(userId, 'UPLOAD_CREATED', 'Document', docId, `Uploaded ${filename}`);

    // Persist the document row itself.
    //
    // Only the in-memory record was being created, so `source_documents` stayed
    // empty and the transaction insert that follows failed on its foreign key.
    // The whole upload therefore produced no rows, no evidence, and a failed job
    // behind a 200 response.
    //
    // The document id is reused rather than generated again so the in-memory
    // record and the relational row refer to the same thing.
    try {
      await execute(
        `INSERT INTO source_documents
           (id, account_id, source_kind, provider, original_filename, detected_mime,
            byte_size, content_fingerprint, period_start, period_end, row_count,
            stage, is_sample_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?)`,
        [
          docId,
          userId,
          sourceKindFor(inspection.kind),
          providerFor(filename),
          filename,
          // Content-determined, from the same inspection the route already made.
          detectedMimeFor(inspection.kind),
          is_base64_pdf ? Buffer.byteLength(content ?? '', 'base64') : inspection.byteSize,
          // Fingerprinted on the bytes as received, so a re-upload of the same file
        // is detectable without storing the file itself.
        createHash('sha256').update(content ?? '').digest('hex'),
          'VALIDATING',
          new Date().toISOString(),
        ],
      );
    } catch (err) {
      return res.status(500).json({
        error: {
          code: 'UPLOAD_NOT_SAVED',
          message: 'We could not save that file, so nothing was uploaded. Try again.',
          request_id: reqId,
        },
      });
    }

    // Asynchronously trigger processing job
    // The parser receives the extracted text, never the original bytes. Passing
    // base64 to the row parser would have it read the encoding as statement content.
    const job = await ProcessingPipeline.processDocumentAsync(
      docId,
      textForParsing,
      Boolean(is_base64_image),
      is_base64_pdf ? 'text/plain' : mime_type
    );

    res.json({
      data: {
        document: documentRecord,
        processing_job: job,
      },
      upload_id: uploadId,
      document_id: docId,
      processing_job_id: job.id,
      status: job.status,
    });
  });

  app.get('/v1/uploads', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const docs = Array.from(db.documents.values()).filter(d => d.user_id === userId);
    res.json({ data: docs });
  });

  app.get('/v1/uploads/:id/status', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const docId = req.params.id;
    const doc = db.documents.get(docId);
    // Same indistinguishability rule as the processing job: a document owned by
    // someone else reports NOT_FOUND, identical to a document that never existed.
    if (!doc || doc.user_id !== userId) {
      return refuseNotFound(req, res, 'Document', req.params.id, { code: 'NOT_FOUND', message: 'Document not found' });
    }
    const job = Array.from(db.processingJobs.values()).find(j => j.document_id === docId);
    res.json({
      data: {
        ...doc,
        stage: doc.stage || job?.stage || (doc.status === 'PROCESSED' ? 'COMPLETED' : 'PROCESSING'),
        extracted_candidate_count: doc.extracted_candidate_count || job?.extracted_count || 0,
      },
    });
  });

  app.get('/v1/processing/:job_id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const job = db.processingJobs.get(req.params.job_id);
    // A job belonging to another account must be indistinguishable from one that
    // does not exist, or this endpoint enumerates ids across tenants. Both cases
    // therefore return the same NOT_FOUND body.
    if (!job || job.user_id !== userId) {
      return refuseNotFound(req, res, 'ProcessingJob', req.params.job_id, { code: 'JOB_NOT_FOUND', message: 'Processing job not found' });
    }
    // The job is returned whole, so `error_message` would otherwise ship the
    // internal cause to the client -- a SQL constraint name, a table name, a
    // filesystem path. Those go to the log; the caller gets a sentence and a
    // request id.
    const safe: Record<string, unknown> = { ...job };
    if (job.error_message) {
      safe.error_message =
        'We could not read that file completely, so nothing was added to your ledger. ' +
        'Try uploading the original statement.';
      safe.error_reference = (req as { requestId?: string }).requestId ?? null;
    }
    res.json({ data: safe });
  });

  // 1-Click Load Golden Sample Dataset
  /**
   * Loads the sample dataset into the caller's own ledger.
   *
   * Writes through to the relational store, not the in-memory maps. It previously
   * wrote only to memory while every read went through the capability layer, so
   * the loader reported success and the dashboard then said it had no
   * transactions — honest, but not useful.
   */
  app.post('/v1/dataset/load-golden', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    try {
      const account = await getAccountById(userId);
      const count = await seedSampleData(userId, account?.email);

      await recordAudit({
        accountId: userId,
        action: 'MUTATED',
        resourceType: 'Dataset',
        resourceId: 'sample_bkash',
      });

      return res.json({
        success: true,
        message: 'Sample dataset loaded with verified provenance and evidence.',
        transactions_count: count,
        is_sample_data: true,
      });
    } catch (err) {
      console.error('[dataset] load failed:', err);
      return res.status(500).json({
        error: { code: 'SEED_FAILED', message: 'Could not load the sample dataset.' },
      });
    }
  });

  // -------------------------------------------------------------
  // TRANSACTIONS & EVIDENCE MODULE (/v1/transactions, /v1/evidence)
  // -------------------------------------------------------------
  app.get('/v1/transactions', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { category, search, status, direction, month } = req.query;

    try {
      const resolved = await resolvePeriod(userId, month as string | undefined);
      if (resolved.reason === 'no_transactions') {
        return res.json({ total: 0, data: [] });
      }

      const filters = {
        period: resolved.period,
        ...(category && category !== 'all' ? { categoryId: String(category) } : {}),
        ...(direction && direction !== 'all' ? { direction: String(direction) } : {}),
        ...(search ? { search: String(search) } : {}),
      };

      // Over-fetch before filtering, so a status filter cannot be defeated by the
      // page size. The previous code took 500 rows and then filtered them, which
      // returns a short list on a large ledger while `total` reports every row.
      const stored = await listTransactions(userId, { ...filters, limit: 500 });

      // Map to the contract views are written against, and attach evidence in the
      // same pass. Rows were previously returned as stored, which left `provenance`
      // undefined and killed the dashboard and the review desk on every screen
      // after an upload.
      const evidence = await evidenceIdsFor(userId, stored.map((r) => r.id));
      const rows = stored.map((r) => toClientTransaction(r, evidence.get(r.id) ?? []));

      // Status is not a stored column on the repository row for every value the
      // domain allows, so it is filtered here from the row rather than widened
      // into a second, divergent filter path.
      const visible =
        status && status !== 'all' ? rows.filter((r) => r.status === status) : rows;

      // `total` counts what `data` holds.
      //
      // The previous `countTransactions(userId, filters)` passed no status, so
      // the header reported every matching row while the body listed a filtered
      // subset -- two numbers for the same question, disagreeing. A client that
      // renders "showing N of M" showed nonsense. `truncated` is now stated too,
      // because a hard 500-row cap with no indicator is indistinguishable from an
      // empty result.
      const total = visible.length;

      return res.json({
        total,
        truncated: total === 500,
        limit: 500,
        data: visible.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)),
      });
    } catch (err) {
      console.error('[transactions] listing failed:', err);
      return res.status(500).json({
        error: { code: 'LIST_FAILED', message: 'Could not read the ledger.' },
      });
    }
  });

  /**
   * One transaction, with its evidence and its document.
   *
   * Reads the relational store. It previously read `db.transactions`, the
   * process-local map, while `GET /v1/transactions`, `PATCH`, and `DELETE` all read
   * `transaction_candidates` -- three answers for one row. After a restart the list
   * showed the row and this route 404'd it.
   */
  app.get('/v1/transactions/:id', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const stored = await getTransaction(userId, req.params.id);
    if (!stored) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }

    const tx = toClientTransaction(
      stored,
      (await evidenceIdsFor(userId, [req.params.id])).get(req.params.id) ?? [],
    );

    const linkedEvidence = await evidenceForTransaction(userId, req.params.id);
    const doc = stored.document_id
      ? ((await getDocument(userId, stored.document_id)) ?? null)
      : null;

    return res.json({
      data: {
        ...tx,
        evidence: linkedEvidence,
        document: doc,
      },
    });
  });

  /** The evidence behind one transaction, from the same store as the row. */
  app.get('/v1/transactions/:id/evidence', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const stored = await getTransaction(userId, req.params.id);
    if (!stored) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }

    const linkedEvidence = await evidenceForTransaction(userId, req.params.id);
    return res.json({
      data: {
        transaction: toClientTransaction(
          stored,
          (await evidenceIdsFor(userId, [req.params.id])).get(req.params.id) ?? [],
        ),
        evidence: linkedEvidence[0] ?? null,
        all_evidence: linkedEvidence,
      },
    });
  });

  // In-line editing / correction (Section 24 & 58)
  /**
   * Hand-entered transaction (spec 003).
   *
   * The user supplies a date, amount, direction, and description. Everything else is
   * the system's work: Bangla numerals are normalised, the category is proposed
   * rather than asked for (FR-013), the row is stamped `USER_ASSERTED` with no
   * confidence (FR-004, FR-005), and a likely duplicate is flagged rather than
   * refused (FR-009).
   *
   * Amounts are the dangerous field, so nothing is coerced here. `validateManualEntry`
   * returns field-scoped errors in both languages and the client renders them; a
   * malformed amount is a 422 with a reason, never a silent zero.
   */
  app.post('/v1/transactions', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const today = new Date().toISOString().slice(0, 10);

    // The account's existing period bounds the date, so a typo three years out is
    // warned about rather than silently accepted into a month with no other rows.
    const months = await monthsWithData(userId);
    const period = months[0]
      ? monthPeriod(months[0])
      : undefined;

    const validation = validateManualEntry(req.body ?? {}, { today, statement_period: period });

    if (!validation.ok || !validation.normalized_input) {
      return res.status(422).json({
        error: {
          code: 'ENTRY_INVALID',
          // The field list is what the client needs to mark the right boxes. An empty
          // message here would leave a user guessing which field was refused.
          message:
            validation.errors[0]?.reason ??
            'Some of that could not be read. Check the highlighted fields.',
        },
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const entry = validation.normalized_input;
    const proposal = proposeCategory(entry.merchant_name || entry.description);

    const id = newTransactionId();
    const now = new Date().toISOString();
    const built = buildManualTransaction({ entry, proposal, userId, id, now });

    // FR-009: flag, never refuse. The user may be recording a second identical
    // purchase on the same day, which is legitimate.
    // Every row, so a duplicate of a recent entry is actually seen. Previously the
    // oldest 1000 were loaded, which meant a duplicate of anything newer was never
    // flagged.
    const existing = (await readAllTransactions(userId)).map((r) => toClientTransaction(r));
    const duplicate = detectDuplicateFlag(built, existing);
    if (duplicate) built.is_duplicate_candidate = true;

    try {
      await createManualTransaction(userId, built, []);
    } catch (err) {
      console.error('[manual-entry] write failed:', err);
      return res.status(500).json({
        error: {
          code: 'ENTRY_NOT_SAVED',
          message: 'That entry could not be saved, so nothing was recorded. Try again.',
        },
      });
    }

    db.transactions.set(id, built);
    db.logAudit(userId, 'TRANSACTION_ENTERED', 'Transaction', id, 'Recorded a transaction by hand');
    await recalculateForAccount(userId);

    return res.status(201).json({
      data: built,
      // Returned so the client can say "this looks like one you already have" rather
      // than letting the user discover it in the review queue later.
      duplicate_flag: duplicate,
      warnings: validation.warnings,
    });
  });

  /**
   * Edits a row and records what it replaced (FR-010).
   *
   * Previously this read and wrote `db.transactions`, the in-memory map, so a
   * correction vanished on restart and never reached the ledger the dashboard reads.
   * The prior value is retained in `transaction_corrections`.
   */
  app.patch('/v1/transactions/:id', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const row = await getTransaction(userId, req.params.id);
    if (!row) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }

    const current = toClientTransaction(row);
    const patch = req.body ?? {};

    const result = applyManualCorrection(current, patch, {
      userId,
      correctionId: newCorrectionId(),
      now: new Date().toISOString(),
    });

    if (!result.ok) {
      return res.status(422).json({
        error: { code: result.code, message: result.reason, field: result.field },
      });
    }

    try {
      await updateTransactionRow(
        userId,
        req.params.id,
        {
          transaction_date: result.transaction.transaction_date,
          amount: result.transaction.amount,
          direction: result.transaction.direction as never,
          merchant_name: result.transaction.merchant_name,
          category_id: result.transaction.category_id,
          description: result.transaction.description,
        },
        result.corrections,
        new Date().toISOString(),
      );
    } catch (err) {
      console.error('[transaction-edit] write failed:', err);
      return res.status(500).json({
        error: {
          code: 'EDIT_NOT_SAVED',
          message: 'That change could not be saved, so the row is unchanged.',
        },
      });
    }

    db.transactions.set(req.params.id, result.transaction);
    db.logAudit(userId, 'TRANSACTION_EDITED', 'Transaction', req.params.id, 'Corrected a transaction');
    await recalculateForAccount(userId);

    return res.json({
      data: result.transaction,
      corrections: result.corrections,
    });
  });

  /**
   * Confirms a row from the review queue.
   *
   * Also repository-backed; it previously wrote only to the in-memory map, so
   * accepting a row changed nothing about the ledger.
   */
  app.post('/v1/transactions/:id/confirm', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const row = await getTransaction(userId, req.params.id);
    if (!row) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }

    try {
      await updateTransactionRow(
        userId,
        req.params.id,
        { status: 'ACCEPTED' },
        [],
        new Date().toISOString(),
      );
      // Clears the duplicate flag the user has just resolved by confirming.
      await execute(
        'UPDATE transaction_candidates SET is_duplicate_candidate = 0 WHERE account_id = ? AND id = ?',
        [userId, req.params.id],
      );
    } catch (err) {
      console.error('[confirm] write failed:', err);
      return res.status(500).json({
        error: {
          code: 'CONFIRM_NOT_SAVED',
          message: 'That could not be confirmed, so the row is unchanged.',
        },
      });
    }

    const confirmed = toClientTransaction({ ...row, status: 'ACCEPTED' });
    db.transactions.set(req.params.id, { ...confirmed, status: 'ACCEPTED' });
    db.logAudit(userId, 'TRANSACTION_CONFIRMED', 'Transaction', req.params.id, 'Confirmed a transaction');
    await recalculateForAccount(userId);

    return res.json({ data: { ...confirmed, status: 'ACCEPTED' } });
  });

  /**
   * Deletes a row (FR-011).
   *
   * The client is required to confirm first; the server records the deletion in the
   * audit log, which is the only trace left, since the row and its history are
   * removed together.
   */
  app.delete('/v1/transactions/:id', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const row = await getTransaction(userId, req.params.id);
    if (!row) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }

    // Recorded before the row goes, in the same store as the ledger, because the
    // row and its history are deleted together and the in-memory audit map dies with
    // the process. This is the only durable trace that the deletion happened.
    const stored = await getTransaction(userId, req.params.id);
    const corrections: CorrectionRecord[] = stored
      ? [removalRecord(toClientTransaction(stored), {
          userId,
          correctionId: newCorrectionId(),
          now: new Date().toISOString(),
        })]
      : [];

    // Recorded first, in the relational store. The in-memory audit map dies with the
    // process, so it cannot be the only trace that a deletion happened.
    await recordCorrections(corrections);

    const removed = await deleteTransactionRow(userId, req.params.id);
    if (!removed) {
      return res.status(500).json({
        error: {
          code: 'DELETE_NOT_SAVED',
          message: 'That row could not be deleted and is still in your ledger.',
        },
      });
    }

    // The correction rows cascade away with the row, so this records the deletion
    // before it is removed. Nothing is retained afterwards, which is deliberate: a
    // deletion record that outlived the row would keep the user's own description
    // text in the database after they asked for it to be gone.
    db.transactions.delete(req.params.id);
    db.logAudit(userId, 'TRANSACTION_DELETED', 'Transaction', req.params.id, 'Deleted a transaction');
    await recalculateForAccount(userId);

    return res.json({ success: true, message: 'That transaction was deleted.' });
  });

  /**
   * Correction history for a row, so a user can see what the system used to believe.
   */
  app.get('/v1/transactions/:id/corrections', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const row = await getTransaction(userId, req.params.id);
    if (!row) {
      return refuseNotFound(req, res, 'Transaction', req.params.id);
    }
    return res.json({ data: await listCorrections(userId, req.params.id) });
  });

  // Evidence detail
  app.get('/v1/evidence/:id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const ev = db.evidence.get(req.params.id);
    // Evidence carries a document, and the document carries the owner. Reach the
    // owner through that chain rather than trusting an account id on the row.
    const owner = ev ? db.documents.get(ev.document_id)?.user_id : undefined;
    if (!ev || owner !== userId) {
      return refuseNotFound(req, res, 'Evidence', req.params.id, { code: 'NOT_FOUND', message: 'Evidence not found' });
    }
    res.json({ data: ev });
  });

  app.get('/v1/categories', (req, res) => {
    res.json({ data: db.categories });
  });

  // -------------------------------------------------------------
  // DASHBOARD & FINANCIAL ENGINE (/v1/dashboard)
  // -------------------------------------------------------------
  /**
   * The dashboard is a view over capabilities, not a place figures are computed.
   *
   * It resolves which period to show from the rows that actually exist, then asks
   * the capability layer for each figure. The previous version called
   * `db.getDashboardSummary`, which aggregated in the data layer and filtered on
   * the literal '2026-09' — so a statement from any other month produced an empty
   * summary with every total at zero and nothing to indicate why.
   */
  app.get('/v1/dashboard', async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    try {
      const resolved = await resolvePeriod(userId, req.query.month as string | undefined);
      if (resolved.reason === 'no_transactions') {
        // Stated rather than answered with zeroes, which would read as a claim
        // that the user spent nothing.
        return res.json({
          data: null,
          status: 'insufficient_data',
          message: 'No transactions have been recorded yet.',
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const call = (name: string, params: unknown) =>
        invokeCapability({
          name,
          params,
          accountId: userId,
          sessionId: req.sessionId ?? null,
          today,
          locale: 'en',
        });

      const [summary, breakdown, comparison, patterns, savings] = await Promise.all([
        call('financial_summary', { period: resolved.period }),
        call('category_breakdown', { period: resolved.period }),
        call('compare_periods', { period: resolved.period }),
        call('spending_patterns', { period: resolved.period }),
        call('savings_estimation', { period: resolved.period }),
      ]);

      const body = (r: Awaited<ReturnType<typeof call>>) =>
        r.status === 'insufficient_data' ? null : r.data;

      return res.json({
        data: {
          period: resolved.period,
          period_inferred: resolved.inferred,
          summary: body(summary),
          category_breakdown: body(breakdown),
          comparison: body(comparison),
          patterns: body(patterns),
          savings: body(savings),
        },
      });
    } catch (err) {
      console.error('[dashboard] failed:', err);
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Could not build the summary.' } });
    }
  });

  // -------------------------------------------------------------
  // INSIGHTS & RECOMMENDATIONS MODULE (/v1/insights, /v1/recommendations)
  // -------------------------------------------------------------
  app.get('/v1/insights', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const list = Array.from(db.insights.values()).filter(i => i.user_id === userId);
    res.json({ data: list });
  });

  app.get('/v1/insights/:id', (req, res) => {
    const ins = db.insights.get(req.params.id);
    if (!ins || ins.user_id !== getAuthenticatedUserId(req)) {
        return refuseNotFound(req, res, 'Insight', req.params.id);
    }

    // Attach supporting transactions
    const supportingTxns = (ins.supporting_transaction_ids || [])
      .map(id => db.transactions.get(id))
      .filter(Boolean);

    res.json({
      data: {
        ...ins,
        supporting_transactions: supportingTxns,
      },
    });
  });

  app.get('/v1/recommendations', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const list = Array.from(db.recommendations.values()).filter((r) => r.user_id === userId);

    // Overlap is stated, not hidden: two recommendations that cite any of the
    // same rows cannot both be fully acted on, so each names the other.
    const withOverlap = list.map((rec) => {
      const mine = new Set(rec.supporting_transaction_ids ?? []);
      const overlapping = list
        .filter((other) => other.id !== rec.id && (other.supporting_transaction_ids ?? []).some((id) => mine.has(id)))
        .map((other) => other.id);
      const tracked = db.feedback.some(
        (f) => f.object_type === 'Recommendation' && f.object_id === rec.id && f.feedback_type === 'acted_on',
      );
      return { ...rec, overlapping_recommendation_ids: overlapping, tracked };
    });

    res.json({
      data: withOverlap,
      bounds_are_additive: false,
      note: 'Each saving range applies to that recommendation alone. Recommendations may share transactions, so the ranges are not additive.',
    });
  });

  app.post('/v1/recommendations/:id/feedback', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const rec = db.recommendations.get(req.params.id);
    if (!rec || rec.user_id !== userId) {
      return refuseNotFound(req, res, 'Recommendation', req.params.id, { code: 'NOT_FOUND', message: 'Recommendation not found' });
    }
    const { feedback_type, comment } = req.body ?? {};
    if (typeof feedback_type !== 'string' || !['helpful', 'not_helpful', 'acted_on'].includes(feedback_type)) {
      return res.status(422).json({ error: { code: 'invalid_params', message: 'feedback_type must be helpful, not_helpful, or acted_on.' } });
    }
    db.feedback.push({
      id: newFeedbackId(),
      user_id: userId,
      object_type: 'Recommendation',
      object_id: req.params.id,
      feedback_type,
      comment,
      created_at: new Date().toISOString(),
    });
    db.logAudit(userId, 'RECOMMENDATION_FEEDBACK', 'Recommendation', req.params.id, `Feedback: ${feedback_type}`);
    res.json({ success: true });
  });

  app.post('/v1/insights/:id/feedback', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const insight = db.insights.get(req.params.id);
    // Previously this accepted feedback for any id, including an insight that
    // does not exist and one owned by another account.
    if (!insight || insight.user_id !== userId) {
      return refuseNotFound(req, res, 'Insight', req.params.id, { code: 'NOT_FOUND', message: 'Insight not found' });
    }
    const { feedback_type, comment } = req.body;
    db.feedback.push({
      id: newFeedbackId(),
      user_id: userId,
      object_type: 'Insight',
      object_id: req.params.id,
      feedback_type,
      comment,
      created_at: new Date().toISOString(),
    });
    db.logAudit(userId, 'INSIGHT_FEEDBACK', 'Insight', req.params.id, `Submitted feedback: ${feedback_type}`);
    res.json({ success: true, message: 'Feedback logged for evaluation.' });
  });

  // Gemini AI Narration Layer (Strictly receives mathematical facts, outputs conversational Bangla or English)
  const handleInsightNarration = async (req: express.Request, res: express.Response) => {
    try {
      const userId = getAuthenticatedUserId(req);
      const ins = db.insights.get(req.params.id);
      // Narration is the one path where model input flows near the data, so it
      // checks ownership before anything is read out of the record.
      if (!ins || ins.user_id !== getAuthenticatedUserId(req)) {
        return refuseNotFound(req, res, 'Insight', req.params.id);
      }

      const locale = ((req.query.lang || req.query.locale || req.body?.locale || 'en') as string).toLowerCase() === 'bn' ? 'bn' : 'en';
      const supportingTxns = (ins.supporting_transaction_ids || [])
        .map(id => db.transactions.get(id))
        .filter(Boolean) as Transaction[];

      const totalAmount = supportingTxns.reduce((sum, t) => sum + t.amount, 0);

      const narration = await narrateInsightFacts(
        {
          title: ins.title,
          title_bn: ins.title_bn,
          summary: ins.summary,
          summary_bn: ins.summary_bn,
          category: ins.title,
          math_formula: ins.math_formula,
          metric_value: ins.metric_value,
          currentAmount: totalAmount,
          orderCount: supportingTxns.length,
          type: ins.type,
        },
        locale
      );

      const finalText = narration || (locale === 'bn' ? ins.summary_bn : ins.summary) || 'Spending pattern verified.';
      res.json({
        narration: finalText,
        data: { narration: finalText },
        success: true,
      });
    } catch (err: any) {
      console.warn('[Narration Route] Graceful fallback invoked:', err.message || err);
      const ins = db.insights.get(req.params.id);
      const locale = ((req.query.lang || req.query.locale || req.body?.locale || 'en') as string).toLowerCase() === 'bn' ? 'bn' : 'en';
      const fallback = locale === 'bn'
        ? (ins?.summary_bn || 'ব্যয়ের গাণিতিক পর্যালোচনা যাচাই করা হয়েছে।')
        : (ins?.summary || 'Spending pattern mathematically verified against evidence.');
      res.json({
        narration: fallback,
        data: { narration: fallback },
        success: true,
      });
    }
  };

  app.post('/v1/insights/:id/narrate', handleInsightNarration);
  app.get('/v1/insights/:id/narrate', handleInsightNarration);

  // -------------------------------------------------------------
  // GOALS MODULE (/v1/goals)
  // -------------------------------------------------------------
  /**
   * Reads goals from the repository, not the in-memory map.
   *
   * The map was the only store, so goals vanished on restart and the purge could
   * not reach them. The rows are returned with the same field names the map used, so
   * no view had to change.
   */
  app.get('/v1/goals', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    try {
      const rows = await listGoals(userId);
      res.json({
        data: rows.map((g) => ({
          id: g.id,
          user_id: g.account_id,
          title: g.title,
          name: g.title,
          name_bn: g.title,
          target_amount: g.target_amount,
          current_amount: g.current_amount,
          target_date: g.target_date || undefined,
          status: 'IN_PROGRESS',
          created_at: g.created_at,
        })),
      });
    } catch (err) {
      res.status(500).json({
        error: { code: 'GOALS_UNAVAILABLE', message: 'Could not load your targets.' },
      });
    }
  });

  /**
   * Creates a savings target.
   *
   * This bypassed the goals repository and wrote only to the in-memory map, so a
   * goal did not survive a restart and the purge could not see it: the confirmation
   * for a data-erasure feature listed "savings targets" and reported zero, because
   * the only copy lived somewhere the purge never looked.
   *
   * It also invented two figures the user never supplied:
   *
   *   - `Number(target_amount) || 10000` silently saved a ৳10,000 target for anyone
   *     who left the field blank. The same default was removed from the form; the
   *     server was still supplying it behind the form's back.
   *   - `Math.round(remaining / 6)` with a "6 months default" comment presented an
   *     arbitrary horizon as a required monthly saving.
   *
   * Now it writes through the repository, which validates, and a missing or invalid
   * target is a 422 rather than a fabricated default. The monthly figure is derived
   * from the months actually remaining before the stated deadline, and is null when
   * there is no deadline to divide by -- the UI already handles a null.
   */
  app.post('/v1/goals', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const { title, name, target_amount, current_amount, target_date } = req.body;

    const resolvedTitle = (title || name || '').trim();
    if (!resolvedTitle) {
      return res.status(422).json({
        error: { code: 'TITLE_REQUIRED', message: 'Give the target a name.' },
      });
    }

    const targetNum = Number(target_amount);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      // Refused rather than defaulted. A goal the user never chose an amount for
      // is not a goal, and filing it under ৳10,000 states a financial intention
      // they did not express.
      return res.status(422).json({
        error: {
          code: 'TARGET_AMOUNT_REQUIRED',
          message: 'Enter how much you want to save.',
        },
      });
    }

    const currentNum = Number(current_amount ?? 0);
    if (!Number.isFinite(currentNum) || currentNum < 0) {
      return res.status(422).json({
        error: { code: 'CURRENT_AMOUNT_INVALID', message: 'Saved amount cannot be negative.' },
      });
    }

    // Optional. A goal with no deadline is valid; it simply has no monthly figure.
    const deadline = target_date ? String(target_date) : null;
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      return res.status(422).json({
        error: { code: 'TARGET_DATE_INVALID', message: 'Date must be YYYY-MM-DD.' },
      });
    }

    try {
      const row = await createGoal({
        accountId: userId,
        title: resolvedTitle,
        targetAmount: targetNum,
        // The repository requires a date; a goal without one is stored with an
        // empty string rather than a fabricated deadline, and reports no monthly
        // requirement.
        targetDate: deadline ?? '',
      });

      const monthsRemaining = monthsUntil(deadline);
      const goal = {
        id: row.id,
        user_id: userId,
        title: row.title,
        name: row.title,
        name_bn: row.title,
        target_amount: row.target_amount,
        current_amount: currentNum,
        target_date: row.target_date || undefined,
        status: 'IN_PROGRESS' as const,
        // Null rather than a number derived from an invented six-month horizon.
        monthly_required_savings: monthsRemaining
          ? Math.round((row.target_amount - currentNum) / monthsRemaining)
          : null,
        created_at: row.created_at,
      };

      // Mirrored into the in-memory map so the views that still read it stay
      // consistent until they are moved onto the repository.
      db.goals.set(goal.id, goal as never);
      db.logAudit(userId, 'GOAL_CREATED', 'Goal', goal.id, `Created goal: ${goal.name}`);
      return res.json({ data: goal });
    } catch (err) {
      const message = err instanceof RangeError ? err.message : 'Could not save that target.';
      return res.status(422).json({ error: { code: 'GOAL_INVALID', message } });
    }
  });

  app.delete('/v1/goals/:id', async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const removed = await deleteGoal(userId, req.params.id);
    db.goals.delete(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Goal not found' } });
    }
    db.logAudit(userId, 'GOAL_DELETED', 'Goal', req.params.id, 'Deleted savings target');
    return res.json({ success: true, message: 'Goal removed.' });
  });

  app.patch('/v1/goals/:id', (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const goal = db.goals.get(req.params.id);
    if (!goal || goal.user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    }

    const { current_amount, status } = req.body;
    if (current_amount !== undefined) goal.current_amount = Number(current_amount);
    if (status) goal.status = status;

    db.goals.set(goal.id, goal);
    db.logAudit(userId, 'GOAL_UPDATED', 'Goal', goal.id, `Updated goal progress: ৳${goal.current_amount}`);
    res.json({ data: goal });
  });

  // -------------------------------------------------------------
  // STATIC SERVING (production only)
  // -------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // -------------------------------------------------------------
  // VITE DEV MIDDLEWARE / STATIC SERVING
  // -------------------------------------------------------------
  //
  // Mounted after every API route, deliberately. With `appType: 'spa'` the Vite
  // middleware answers anything it recognises, so placing it earlier meant
  // `POST /v1/auth/register` was swallowed and answered 404 before Express ever saw
  // it — registration, login, and every financial route silently unavailable in a
  // freshly started process. Mounted here, it serves modules and the SPA shell while
  // leaving the API alone.
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kothay Gelo?] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`[Kothay Gelo?] Configuration error: ${err.message}`);
    process.exit(1);
  }
  console.error('[Kothay Gelo?] Failed to start:', err);
  process.exit(1);
});
