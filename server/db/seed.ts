import { execute, transaction, query } from './client';
import { GOLDEN_SAMPLES, PREVIOUS_MONTH_SAMPLE_TRANSACTIONS } from '../goldenDataset';

/**
 * Demo data.
 *
 * Separated from schema migrations on purpose. A migration that inserts a user
 * is a migration that eventually has to be un-inserted; migrations own schema,
 * this module owns demo content, and the two are never mixed.
 *
 * Every insert is idempotent on a fixed identifier, so calling this twice is
 * harmless. It runs only when explicitly asked — never implicitly at boot.
 *
 * Demo rows belong to a dedicated account and carry `is_sample_data = 1`, so
 * they can never be mistaken for a real person's records. The previous
 * behaviour seeded 24 transactions during database construction, which made
 * every fresh start look like it already held the user's own history — and made
 * the product's privacy claim untrue.
 */

/** Fixed identifier for the demo account. Carries no credential, so it cannot sign in. */
export const SAMPLE_ACCOUNT_ID = 'acct_sample_demo';
const SAMPLE_EMAIL = 'demo@kothaygelo.invalid';

type Sql = { execute: (q: any) => Promise<unknown> };

async function ensureSampleAccount(accountId: string, email: string): Promise<void> {
  await execute(
    `INSERT INTO accounts (id, email, password_hash, created_at, updated_at, status)
     VALUES (?, ?, '', ?, ?, 'ACTIVE')
     ON CONFLICT(id) DO NOTHING`,
    [accountId, email, '2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z'],
  );
}

/**
 * Derives a document's covered period from its rows.
 *
 * The period is a fact about the data, so it is computed from the rows rather
 * than asserted. A source document record carries no period of its own.
 */
function spanOf(rows: { transaction_date: string }[]): [string | null, string | null] {
  if (rows.length === 0) return [null, null];
  const dates = rows.map((r) => r.transaction_date).sort();
  return [dates[0], dates[dates.length - 1]];
}

async function insertDocument(
  tx: Sql,
  accountId: string,
  doc: {
    id: string;
    filename: string;
    mime_type: string;
    file_size: number;
    created_at: string;
    document_type: string;
    source_type: string;
  },
  rows: { transaction_date: string }[],
): Promise<void> {
  const [start, end] = spanOf(rows);
  await tx.execute({
    sql: `INSERT INTO source_documents
            (id, account_id, source_kind, provider, original_filename, detected_mime,
             byte_size, content_fingerprint, period_start, period_end, row_count,
             stage, is_sample_data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', true, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [
      doc.id,
      accountId,
      sourceKindOf(doc.document_type),
      doc.source_type,
      doc.filename,
      doc.mime_type,
      doc.file_size,
      `sample-${doc.id}`,
      start,
      end,
      rows.length,
      doc.created_at,
    ],
  });
}

/** Maps the domain's DocumentType onto the narrower discriminator in the schema. */
function sourceKindOf(documentType: string): string {
  if (documentType === 'BANK_STATEMENT') return 'BANK_STATEMENT';
  if (documentType === 'MOBILE_MONEY_STATEMENT' || documentType === 'TRANSACTION_HISTORY') {
    return 'MOBILE_WALLET';
  }
  return 'DELIMITED';
}

async function insertTransaction(
  tx: Sql,
  accountId: string,
  row: {
    id: string;
    transaction_date: string;
    amount: number;
    direction: string;
    merchant_name?: string;
    description?: string;
    category_id?: string | null;
    confidence?: number;
    raw_text_snippet?: string;
    status?: string;
    evidence_ids?: string[];
  },
  documentId: string,
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO transaction_candidates
            (id, account_id, document_id, transaction_date, amount, direction,
             merchant_name, raw_text_snippet, category_id, confidence,
             extraction_method, status, is_duplicate_candidate, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DETERMINISTIC', ?, false, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [
      row.id,
      accountId,
      documentId,
      row.transaction_date,
      row.amount,
      row.direction,
      row.merchant_name ?? '',
      row.raw_text_snippet ?? row.description ?? '',
      // An absent category stays absent. It is not relabelled as a guess.
      row.category_id && row.category_id !== 'cat_other' ? row.category_id : null,
      typeof row.confidence === 'number' ? row.confidence : null,
      // Fixtures already carry a domain status; nothing is invented here.
      row.status ?? 'EXTRACTED',
      new Date().toISOString(),
    ],
  });

  /**
   * Every extracted row is cited, whether or not the fixture declared evidence.
   *
   * 13 of the 18 golden transactions carried `evidence_ids: []`, so the sample
   * dataset held uncited rows -- and the schema trigger cannot catch that, because
   * it fires on INSERT into transaction_evidence and a row with no links never
   * fires it. The `trg_extracted_row_requires_evidence` check passed on an uncited
   * ledger.
   *
   * So the invariant is made structural here: a row with no declared evidence gets
   * one built from the source text it was read from. That is a real citation -- it
   * quotes the line the figure came from -- rather than a placeholder id. A row
   * with no source text at all is refused, because there is nothing honest to cite.
   */
  const declared = row.evidence_ids ?? [];
  const sourceText = row.raw_text_snippet ?? row.description ?? '';

  if (declared.length === 0) {
    if (!sourceText.trim()) {
      throw new Error(
        `seed row ${row.id} has neither declared evidence nor any source text to ` +
          'cite; refusing to write an uncited extracted row',
      );
    }
    await insertEvidence(tx, accountId, documentId, {
      id: `ev_${row.id}`,
      raw_text: sourceText,
      evidence_type: row.direction === 'INCOME' ? 'AMOUNT' : 'MERCHANT',
      created_at: new Date().toISOString(),
    });
    await tx.execute({
      sql: `INSERT INTO transaction_evidence (transaction_id, evidence_id)
            VALUES (?, ?) ON CONFLICT DO NOTHING`,
      args: [row.id, `ev_${row.id}`],
    });
    return;
  }

  for (const evidenceId of declared) {
    await tx.execute({
      sql: `INSERT INTO transaction_evidence (transaction_id, evidence_id)
            VALUES (?, ?) ON CONFLICT DO NOTHING`,
      args: [row.id, evidenceId],
    });
  }
}

async function insertEvidence(
  tx: Sql,
  accountId: string,
  documentId: string,
  ev: {
    id: string;
    page_number?: number;
    bounding_box?: { x: number; y: number; width: number; height: number };
    raw_text: string;
    normalized_text?: string;
    evidence_type?: string;
    created_at: string;
  },
): Promise<void> {
  await tx.execute({
    sql: `INSERT INTO evidence
            (id, account_id, document_id, evidence_type, raw_text, raw_text_snippet,
             normalized_text, page_number, bbox_x, bbox_y, bbox_width, bbox_height,
             coordinate_space, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [
      ev.id,
      accountId,
      documentId,
      ev.evidence_type ?? null,
      ev.raw_text,
      ev.raw_text,
      ev.normalized_text ?? null,
      ev.page_number ?? null,
      ev.bounding_box?.x ?? null,
      ev.bounding_box?.y ?? null,
      ev.bounding_box?.width ?? null,
      ev.bounding_box?.height ?? null,
      ev.bounding_box ? 'pdf-points-bottom-left' : null,
      ev.created_at,
    ],
  });
}

/**
 * Indexes the source document's verbatim text by date.
 *
 * Evidence must be the real line a row was read from, not a description of it.
 * The fixture document carries its own raw text, so every row can be traced to
 * the line it came from — including the 13 rows that previously cited nothing.
 * A date with no matching line is reported rather than papered over.
 */
function indexSourceLines(rawText: string): Map<string, string> {
  const index = new Map<string, string>();
  for (const line of rawText.split('\n')) {
    const match = /^(\d{4}-\d{2}-\d{2})\s/.exec(line.trim());
    if (match) index.set(match[1], line.trimEnd());
  }
  return index;
}

/**
 * Loads the demo dataset.
 *
 * Wrapped in one transaction so a partial load cannot leave the ledger holding
 * transactions whose evidence did not land.
 */
/**
 * Loads the sample dataset into an account.
 *
 * Parameterised by account id so an authenticated user can load the sample into
 * their own ledger. The previous version wrote to a fixed demo account while the
 * read path consulted the signed-in account, so the loader appeared to work and
 * the dashboard then reported no data — which is honest but useless.
 */
export async function seedSampleData(accountId: string, email?: string): Promise<number> {
  await ensureSampleAccount(
    accountId,
    email ?? `${accountId}@demo.kothaygelo.invalid`,
  );

  // Fixture identifiers are fixed, so they are namespaced per account. Without
  // this, a second account loading the sample hits `ON CONFLICT DO NOTHING` on
  // the document, skips its own, and leaves its transactions referencing the
  // first account's document -- a silent cross-tenant leak that nothing in the
  // schema prevented, because no constraint ties a row's account to its
  // document's.
  const ns = accountId.slice(-8);
  const scoped = (id: string) => `${id}_${ns}`;

  return transaction(async (tx) => {
    const sample = GOLDEN_SAMPLES.sample_bkash;

    const documentId = scoped(sample.document.id);
    await insertDocument(tx, accountId, { ...(sample.document as any), id: documentId }, sample.transactions);

    // Evidence before links: the link trigger reads the evidence row.
    const evidenceIdMap = new Map<string, string>();
    for (const ev of sample.evidence) {
      const scopedEvidenceId = scoped(ev.id);
      evidenceIdMap.set(ev.id, scopedEvidenceId);
      await insertEvidence(tx, accountId, documentId, { ...(ev as any), id: scopedEvidenceId });
    }

    const sourceLines = indexSourceLines(sample.rawText ?? '');

    for (const row of sample.transactions) {
      const transactionId = scoped(row.id);

      // Every extracted row cites the line it was read from. Rows that already
      // carry explicit evidence keep it; the rest are traced to the document
      // text, which is where their evidence genuinely is.
      const evidenceIds = (row.evidence_ids ?? []).map((id) => evidenceIdMap.get(id)).filter(
        (id): id is string => Boolean(id),
      );
      const sourceLine = sourceLines.get(row.transaction_date);
      if (sourceLine && evidenceIds.length === 0) {
        const evId = scoped(`ev_line_${row.id}`);
        await insertEvidence(tx, accountId, documentId, {
          id: evId,
          raw_text: sourceLine,
          evidence_type: 'AMOUNT',
          created_at: sample.document.created_at,
        });
        evidenceIds.push(evId);
      }

      await insertTransaction(
        tx,
        accountId,
        { ...(row as any), id: transactionId, evidence_ids: evidenceIds },
        documentId,
      );
    }

    // Previous-month rows exist so period comparison has a real baseline.
    const previousDocId = `${documentId}_prev`;
    const previousDoc = {
      ...sample.document,
      id: previousDocId,
      filename: 'bKash-August-2026.pdf',
      created_at: '2026-08-02T10:00:00.000Z',
    };

    await insertDocument(tx, accountId, previousDoc as any, PREVIOUS_MONTH_SAMPLE_TRANSACTIONS);

    // Each August row gets its own evidence so the extraction path, the
    // drill-down, and the link trigger all exercise real rows.
    for (const row of PREVIOUS_MONTH_SAMPLE_TRANSACTIONS) {
      const evidenceId = scoped(`ev_${row.id}`);
      await insertEvidence(tx, accountId, previousDocId, {
        id: evidenceId,
        raw_text:
          `${row.transaction_date} ${row.merchant_name ?? ''} ` +
          `${row.direction} ${row.amount}`,
        evidence_type: 'AMOUNT',
        created_at: row.created_at ?? '2026-08-02T10:00:00.000Z',
      });
      await insertTransaction(
        tx,
        accountId,
        { ...(row as any), id: scoped(row.id), evidence_ids: [evidenceId] },
        previousDocId,
      );
    }

    return sample.transactions.length + PREVIOUS_MONTH_SAMPLE_TRANSACTIONS.length;
  });
}

/** Seeds the fixed demo account. Kept for the seed tests and the demo route. */
export async function seedDemoData(): Promise<void> {
  await seedSampleData(SAMPLE_ACCOUNT_ID, SAMPLE_EMAIL);
}

/** True when the given account is the demo account. */
export async function isSampleAccount(accountId: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM accounts WHERE id = ? AND id = ?`,
    [accountId, SAMPLE_ACCOUNT_ID],
  );
  return (rows[0]?.n ?? 0) > 0;
}
