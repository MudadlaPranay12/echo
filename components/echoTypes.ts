// Shared view types and primitives for the Echo client.
// These mirror the shapes already returned by lib/echo_agent_core.ts — the
// client never imports the agent core, the seed data, or GROQ_API_KEY.

/* ---------------------------------------------------------------- wire types */

export type Msg = { role: "user" | "assistant"; content: string };

export type TopCondition = { label: string; count: number };

export type PatternView = {
  pattern_id: string;
  family: string;
  exception_pattern: string;
  support_count: number;
  approved_count: number;
  rejected_count: number;
  approval_rate: number | null;
  confidence: string;
  last_seen: string;
  approvers: { name: string; count: number }[];
  conditions: string[];
  typical_resolution: string;
  policy_route: string | null;
  source: "hindsight";
  supporting_case_ids: string[];
  supporting_cases_on_screen: string[];
};

export type EvidenceExcluded = {
  other_vendor: number;
  self: number;
  other_family: number;
  outside_diff_window: number;
  other_policy_band: number;
  no_recorded_amount: number;
} | null;

export type RecallStats = {
  similar_cases: number;
  approved: number;
  summary: string;
  approvers: Record<string, number>;
  top_condition: TopCondition | null;
  last_case_date: string | null;
  confidence: string;
};

export type SimilarCase = {
  id: string;
  date: string;
  invoice_no: string;
  diff_pct: number | null;
  approver: string;
  workaround: string;
  outcome: "approved" | "rejected";
  days: number;
  /** The condition the finding was resolved under, read back from retained memory. */
  condition?: string | null;
};

export type RecallArgs = {
  vendor?: string;
  exception_type?: string;
  invoice_amount_inr?: number;
  po_amount_inr?: number | null;
  invoice_no?: string;
  synthesize?: boolean;
};

export type RecallResult = {
  memory_source: "hindsight" | "fallback";
  memory_scope: "family" | "unscoped" | "local";
  issue_family: string;
  no_history: boolean;
  written_policy_route: string;
  evidence_excluded: EvidenceExcluded;
  stats: RecallStats;
  similar_cases: SimilarCase[];
  patterns: PatternView[];
  memory_snippets: string[];
  /** Whether a synthesis was requested for this lookup. */
  synthesis_requested: boolean;
  /** Narrative policy from Hindsight Reflect. Advisory: never a source of numbers. */
  pattern_insight?: string | null;
  /** Where the insight came from, so the UI can label it without overstating it. */
  synthesis_source?: "none" | "reflect" | "cached" | "deterministic";
};

export type SaveResult = {
  saved_case_id: string;
  memory_source: "hindsight" | "fallback";
  retained: boolean;
  pattern_memory_updated: boolean;
  confidence_before: string;
  confidence_after: string;
  top_condition_after: TopCondition | null;
  error?: string;
};

export type Owner = { name: string; cases_handled: number; status: string };
export type OwnerResult = { no_history: boolean; owners: Owner[] };

export type PromoteResult = {
  eligible: boolean;
  reason?: string;
  evidence_case_ids?: string[];
  top_condition?: TopCondition | null;
  draft_rule_basis?: string;
};

export type Trace = { tool: string; args: string; result: unknown };

/** Everything the UI knows about one investigation, extracted from the trace. */
export type Evidence = {
  args?: RecallArgs;
  recall?: RecallResult;
  owner?: OwnerResult;
  promo?: PromoteResult;
  saved?: SaveResult;
};

/* ---------------------------------------------------------------- view types */

/** A row in the left-hand Exceptions list. */
export type CaseItem = {
  key: string;
  vendor: string;
  invoiceNo: string;
  invoice: number;
  po: number | null;
  /** PO reference as it appears in the brief, e.g. "PO-7981". */
  poRef: string | null;
  /** The exception being investigated, e.g. "amount_mismatch". */
  exception: string;
  /** Short mismatch label, e.g. "3.8% mismatch" or "Missing PO". */
  label: string;
  /** The exact message sent to the agent when this case is opened. */
  message: string;
};

export type Turn = {
  role: "user" | "assistant";
  content: string;
  ev?: Evidence;
  tools?: string[];
};

export type ToastItem = { id: number; text: string; tone: "ok" | "info" };
