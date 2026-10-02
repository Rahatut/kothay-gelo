export type TransactionDirection = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'UNKNOWN';

export type TransactionStatus = 
  | 'EXTRACTED' 
  | 'NORMALIZED' 
  | 'CLASSIFIED' 
  | 'ACCEPTED' 
  | 'CONFIRMED'
  | 'NEEDS_REVIEW' 
  | 'USER_EDITED'
  | 'USER_ENTERED';

// Declared per arm so reading a confidence value without narrowing to
// 'EXTRACTED' is a compile error. tsconfig sets no strictNullChecks, so a
// nullable confidence would silently render as 0% rather than failing.
export type TransactionProvenance =
  | {
      source: 'USER_ASSERTED';
      asserted_at: string;
      assertion_method: 'MANUAL_ENTRY';
    }
  | {
      source: 'EXTRACTED';
      extraction_model: string;
      extraction_version: string;
      extraction_confidence: number;
    }
  | {
      source: 'ENGINE_DERIVED';
      calculation_version: string;
      derivation: string;
    };

export type CategoryAssignmentSource =
  | 'MERCHANT_RULE'
  | 'USER_CORRECTION'
  | 'UNCATEGORIZED';

export type DocumentType = 
  | 'BANK_STATEMENT' 
  | 'MOBILE_MONEY_STATEMENT' 
  | 'TRANSACTION_HISTORY' 
  | 'RECEIPT' 
  | 'UNKNOWN';

export type ProcessingStage = 
  | 'QUEUED' 
  | 'VALIDATING' 
  | 'CLASSIFYING' 
  | 'EXTRACTING' 
  | 'NORMALIZING' 
  | 'CATEGORIZING' 
  | 'DEDUPLICATING' 
  | 'VALIDATING_RESULTS' 
  | 'COMPLETED' 
  | 'FAILED';

export type EvidenceType = 
  | 'TRANSACTION_DATE' 
  | 'AMOUNT' 
  | 'MERCHANT' 
  | 'REFERENCE' 
  | 'ACCOUNT' 
  | 'BALANCE' 
  | 'OTHER';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
}

export interface Evidence {
  id: string;
  document_id: string;
  page_number?: number;
  bounding_box?: BoundingBox;
  raw_text: string;
  raw_text_snippet?: string;
  normalized_text?: string;
  evidence_type?: EvidenceType;
  created_at: string;
}

export type EvidenceItem = Evidence;

export interface Transaction {
  id: string;
  user_id: string;
  document_id?: string;
  transaction_date: string; // YYYY-MM-DD
  posted_at?: string;
  amount: number; // Stored in BDT, 2 decimals
  currency: 'BDT';
  direction: TransactionDirection;
  transaction_type?: 'DEBIT' | 'CREDIT';
  merchant_id?: string;
  merchant_name: string;
  raw_merchant_name?: string;
  raw_text_snippet?: string;
  description: string;
  category_id: string; // UNCATEGORIZED_CATEGORY_ID when nothing was justified
  category_source: CategoryAssignmentSource;
  status: TransactionStatus;
  provenance: TransactionProvenance;
  evidence_ids: string[]; // [] on a user-asserted row, never synthetic
  is_duplicate_candidate?: boolean;
  duplicate_of_id?: string;
  /**
   * True when this row came from the sample dataset rather than an upload.
   *
   * Every surface that displays a transaction must be able to say so. Sample figures
   * presented as a user's own spending would make the product's privacy claim false
   * and its totals wrong.
   */
  is_sample_data?: boolean;
  created_at: string;
  updated_at: string;
}

export type CorrectableTransactionField =
  | 'transaction_date'
  | 'amount'
  | 'direction'
  | 'description'
  | 'merchant_name'
  | 'category_id';

export type CorrectionKind =
  | 'USER_CORRECTION'
  | 'USER_CATEGORY_CORRECTION'
  | 'USER_DELETION';

export interface CorrectionRecord {
  id: string;
  transaction_id: string;
  user_id: string;
  field: CorrectableTransactionField;
  previous_value: string;
  current_value: string; // '' when kind is 'USER_DELETION'
  kind: CorrectionKind;
  corrected_at: string;
}

export type DuplicateMatchTier = 'EXACT_TEXT' | 'SAME_MERCHANT_SAME_TICKET';

export type DuplicateMatchedField =
  | 'amount'
  | 'direction'
  | 'date'
  | 'description'
  | 'merchant_name';

export interface DuplicateFlag {
  transaction_id: string;
  existing_transaction_id: string;
  tier: DuplicateMatchTier;
  matched_fields: DuplicateMatchedField[];
  amount_delta_bdt: number;
  day_delta: number;
  flagged_at: string;
}

export interface CategoryProposal {
  category_id: string; // UNCATEGORIZED_CATEGORY_ID when no rule matched
  canonical_merchant: string; // '' when no rule matched
  source: 'MERCHANT_RULE' | 'UNCATEGORIZED';
  matched_rule_index: number | null; // index into MERCHANT_RULES, the justification
  basis: string; // plain sentence, user-facing
  justification: 'RULE_MATCH' | 'NO_RULE_MATCH';
}

export interface ExtractedTransactionCandidate {
  id: string;
  document_id: string;
  evidence_ids: string[];
  date_raw: string;
  amount_raw: string;
  currency_raw: string;
  merchant_raw: string;
  description_raw: string;
  direction_raw: string;
  extraction_confidence: number;
  extraction_model: string;
  extraction_version: string;
}

export interface Merchant {
  id: string;
  canonical_name: string;
  normalized_name: string;
  aliases: string[];
  category_hint: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  name_bn: string;
  color: string;
  icon?: string;
}

export interface DocumentRecord {
  id: string;
  upload_id: string;
  user_id: string;
  filename: string;
  document_type: DocumentType;
  source_type: 'bKash' | 'Nagad' | 'City Bank' | 'BRAC Bank' | 'EBL' | 'General' | 'CSV';
  language: 'en' | 'bn' | 'mixed';
  /**
   * Null when the file has not been paginated.
   *
   * This was `number`, and the upload route set it to 1 for every file, so a
   * forty-page statement reported one page. A type that cannot express "unknown"
   * forces its author to invent a value; this one can.
   */
  page_count: number | null;
  status: 'PROCESSED' | 'PROCESSING' | 'FAILED';
  stage?: ProcessingStage;
  extracted_candidate_count?: number;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  document_id: string;
  user_id: string;
  status: ProcessingStage;
  stage: ProcessingStage;
  attempt: number;
  pipeline_version: string;
  started_at: string;
  completed_at?: string;
  error_code?: string;
  error_message?: string;
  extracted_count: number;
  created_at: string;
}

export interface Insight {
  id: string;
  user_id?: string;
  type: string;
  title: string;
  title_bn?: string;
  summary?: string;
  summary_bn?: string;
  description?: string;
  description_bn?: string;
  calculation_version?: string;
  supporting_transaction_ids?: string[];
  evidence_ids?: string[];
  confidence: number;
  status?: 'ACTIVE' | 'DISMISSED';
  math_formula?: string;
  formula_explanation?: string;
  metric_value?: string;
  potential_savings_bdt?: number;
  action_text?: string;
  action_text_bn?: string;
  created_at?: string;
}

export type InsightRecommendation = Insight;

export interface Recommendation {
  id: string;
  user_id: string;
  insight_id: string;
  title: string;
  title_bn: string;
  description: string;
  description_bn: string;
  potential_savings_min: number;
  potential_savings_max: number;
  calculation_method: string;
  calculation_version: string;
  supporting_transaction_ids: string[];
  action_type: 'REDUCE_FREQUENCY' | 'SWITCH_VENDOR' | 'CANCEL_SUBSCRIPTION' | 'BUDGET_CAP';
  created_at: string;
}

export interface Goal {
  id: string;
  user_id?: string;
  title?: string;
  name?: string;
  name_bn?: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  category_id?: string;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED';
  monthly_required_savings?: number;
  created_at?: string;
}

export type SavingsGoal = Goal;

export interface UserProfile {
  id: string;
  email: string;
  phone?: string;
  locale: 'en' | 'bn';
  timezone?: string;
  currency?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
  created_at?: string;
}

export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: 
    | 'PRIVACY_POLICY' 
    | 'FINANCIAL_DATA_PROCESSING' 
    | 'DOCUMENT_PROCESSING' 
    | 'OPTIONAL_ANALYTICS' 
    | 'OPTIONAL_AI_PROCESSING';
  policy_version: string;
  accepted_at: string;
  revoked_at?: string;
  /**
   * Salted digest of the request IP, absent when the IP could not be resolved.
   *
   * Optional rather than required because the IP genuinely is sometimes
   * unavailable — a local request, or a proxy that strips it. Making it required
   * forced the previous implementation to write the truncated literal
   * 'sha256:d8a9f...', which looked like a digest and hashed nothing. Absence is
   * honest; a fabricated digest is not.
   */
  ip_hash?: string;
}

export interface AuditEvent {
  id: string;
  user_id: string;
  event_type: string;
  object_type: string;
  object_id: string;
  action: string;
  metadata?: Record<string, any>;
  created_at: string;
}

/** An inclusive `YYYY-MM-DD` range, resolved server-side so both sides agree. */
export interface PeriodRange {
  start: string;
  end: string;
}

/** One category's share of a period's spending. */
export interface CategoryShare {
  category_id: string;
  amount: number;
  count: number;
  pct: number;
}

/**
 * Totals for one period.
 *
 * `count` rather than `total_transactions_count`, and `open_period` to say
 * whether the period is still running. A partial month and a finished one are
 * different facts, and presenting either as the other misleads by the whole
 * remaining spend.
 */
export interface PeriodTotals {
  period: PeriodRange;
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
  open_period: boolean;
}

/**
 * The response of `GET /v1/dashboard`.
 *
 * This describes the payload the endpoint actually returns, which is a wrapper
 * around several period-scoped blocks rather than one flat summary. It previously
 * declared `category_breakdown` as a flat array and `total_expenses` at the top
 * level, while the server sent `category_breakdown.categories` and nested the
 * totals under `summary`. The two disagreed, and `DashboardView` then called
 * `.map` on an object: `(intermediate value).map is not a function`, which
 * unmounted the whole page with no error boundary.
 *
 * Every block carries its own `period` and, where it is a breakdown, the total it
 * must reconcile against. The breakdown is shipped with the headline it came from
 * so the two can be checked against each other rather than trusted separately
 * (constitution Principle I).
 *
 * Blocks that could not be computed are null rather than absent or zero: no
 * comparison month and zero patterns are different claims.
 */
export interface DashboardResponse {
  period: PeriodRange;
  period_inferred: boolean;
  summary: PeriodTotals | null;
  category_breakdown: {
    period: PeriodRange;
    total_expenses: number;
    categories: CategoryShare[];
  } | null;
  comparison: unknown | null;
  patterns: unknown[] | null;
  savings: {
    min?: number;
    max?: number;
  } | null;
}

/**
 * The subset of the dashboard a view needs, with totals hoisted.
 *
 * Views should take this rather than the raw response so a component never has
 * to know which block a figure lives in. `categoryShares` is the empty array when
 * there is no data, so callers can map over it without a guard.
 */
export interface MerchantShare {
  merchant_name: string;
  amount: number;
  count: number;
  pct_of_spend: number;
}

export interface DashboardSummary {
  /**
   * False when the account holds no transactions.
   *
   * Needed because the endpoint answers `{ data: null, status: 'insufficient_data' }`
   * for an empty account, so a null summary meant both "still loading" and "nothing
   * here yet" — and the dashboard showed "Initializing the desk" forever to somebody
   * who had simply not uploaded anything.
   */
  has_data: boolean;
  period: PeriodRange;
  period_inferred: boolean;
  total_expenses: number;
  total_income: number;
  net_savings: number;
  count: number;
  needs_review_count: number;
  /** Never null. Empty when there is nothing to break down. */
  categoryShares: CategoryShare[];
  /** Null when the engine produced no estimate. */
  potential_savings: { min: number; max: number } | null;
  /** Never null. Empty when there is nothing to rank. */
  top_merchants: MerchantShare[];
  /**
   * Percent change against the preceding period, or null when there is no
   * preceding period to compare against.
   *
   * Null, not 0. Zero claims spending was unchanged, which is a fact about the
   * user's money; null says the question could not be answered. The
   * `compare_periods` capability returns `insufficient_data` for a first
   * upload, and rendering that as "0% vs prior cycle" invents a prior cycle.
   */
  expense_change_pct: number | null;
}
