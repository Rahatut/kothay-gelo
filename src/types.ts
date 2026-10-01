export type TransactionDirection = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'UNKNOWN';

export type TransactionStatus = 
  | 'EXTRACTED' 
  | 'NORMALIZED' 
  | 'CLASSIFIED' 
  | 'ACCEPTED' 
  | 'CONFIRMED'
  | 'NEEDS_REVIEW' 
  | 'USER_EDITED';

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
  category_id: string;
  status: TransactionStatus;
  evidence_ids: string[];
  is_duplicate_candidate?: boolean;
  duplicate_of_id?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
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
  page_count: number;
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
  ip_hash: string;
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

export interface DashboardSummary {
  period?: string; // e.g. "September 2026"
  total_expenses: number;
  total_income: number;
  net_savings: number;
  previous_period_expenses?: number;
  expense_change_pct: number;
  needs_review_count: number;
  duplicate_candidates_count?: number;
  total_transactions_count?: number;
  category_breakdown?: {
    category_id: string;
    category_name: string;
    category_name_bn: string;
    amount: number;
    pct: number;
    count: number;
    color: string;
  }[];
  top_categories?: {
    category_id?: string;
    category_name: string;
    category_name_bn?: string;
    amount: number;
    count?: number;
  }[];
  merchant_concentration?: {
    merchant_name: string;
    amount: number;
    count: number;
    pct_of_spend?: number;
  }[];
  top_merchants?: {
    merchant: string;
    amount: number;
    count: number;
  }[];
  potential_savings?: {
    min: number;
    max: number;
  };
  recent_transactions?: Transaction[];
}
