import { query, execute } from '../client';

/**
 * Durable processing-job state.
 *
 * The pipeline runs in memory and mutates a `ProcessingJob` object. It is upserted
 * here on every stage transition so a status read after a restart sees the last
 * recorded stage instead of a `NOT_FOUND` for a job that plainly ran.
 */
export interface ProcessingJobRow {
  id: string;
  account_id: string;
  document_id: string;
  status: string;
  stage: string;
  attempt: number;
  pipeline_version: string;
  extracted_count: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ProcessingJobWrite {
  id: string;
  accountId: string;
  documentId: string;
  status: string;
  stage: string;
  attempt: number;
  pipelineVersion: string;
  extractedCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
}

export async function upsertProcessingJob(job: ProcessingJobWrite): Promise<void> {
  await execute(
    `INSERT INTO processing_jobs
       (id, account_id, document_id, status, stage, attempt, pipeline_version,
        extracted_count, error_code, error_message, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       stage = excluded.stage,
       extracted_count = excluded.extracted_count,
       error_code = excluded.error_code,
       error_message = excluded.error_message,
       completed_at = excluded.completed_at`,
    [
      job.id,
      job.accountId,
      job.documentId,
      job.status,
      job.stage,
      job.attempt,
      job.pipelineVersion,
      job.extractedCount,
      job.errorCode ?? null,
      job.errorMessage ?? null,
      job.startedAt,
      job.completedAt ?? null,
      job.createdAt,
    ],
  );
}

/** One job, scoped to its owning account. A guessed id cannot read another tenant's. */
export async function getProcessingJob(
  accountId: string,
  jobId: string,
): Promise<ProcessingJobRow | null> {
  const rows = await query<ProcessingJobRow>(
    `SELECT * FROM processing_jobs WHERE account_id = ? AND id = ?`,
    [accountId, jobId],
  );
  return rows[0] ?? null;
}
