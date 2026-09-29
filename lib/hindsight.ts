// lib/hindsight.ts
// Server-only Hindsight Cloud adapter for Echo. The client never imports this
// module: the API key stays on the server and only the normalised results below
// cross the wire in a tool response.
//
// SDK: @vectorize-io/hindsight-client (pinned to the deployed API version 0.10.1)
// Bank: HINDSIGHT_BANK_ID  Base URL: HINDSIGHT_BASE_URL  Auth: HINDSIGHT_API_KEY
//
// Every exported function throws on failure. The caller (lib/echo_agent_core.ts)
// is responsible for the honest fallback so the UI can report
// memory_source = "fallback" instead of pretending Hindsight answered.

import { HindsightClient } from "@vectorize-io/hindsight-client";

/* ------------------------------------------------------------------ config */

export interface HindsightConfig {
  bankId: string;
  baseUrl: string;
}

/** Returns null when Hindsight is not configured, so callers can fall back. */
export function hindsightConfig(): HindsightConfig | null {
  const bankId = process.env.HINDSIGHT_BANK_ID?.trim();
  const baseUrl = process.env.HINDSIGHT_BASE_URL?.trim();
  if (!bankId || !baseUrl) return null;
  return { bankId, baseUrl };
}

let client: HindsightClient | null = null;
let clientKey = "";

function getClient(cfg: HindsightConfig): HindsightClient {
  const apiKey = process.env.HINDSIGHT_API_KEY ?? "";
  const key = `${cfg.baseUrl}|${apiKey ? "key" : "anon"}`;
  if (!client || clientKey !== key) {
    // maxAttempts applies to idempotent reads only; the SDK never retries writes.
    client = new HindsightClient({ baseUrl: cfg.baseUrl, apiKey, maxAttempts: 3 });
    clientKey = key;
  }
  return client;
}

/* ------------------------------------------------------------ issue families */

/**
 * The five families Echo routes on. Routing is deterministic and closed: a query
 * is placed in exactly one family, and retrieval is scoped to that family, so
 * an amount_mismatch query can never pull permission memories and vice versa.
 * Anything unrecognised is "unknown", which retrieves nothing.
 */
export const ISSUE_FAMILIES = [
  "amount_mismatch",
  "missing_po",
  "gst_mismatch",
  "duplicate_suspect",
  "permission_approval",
] as const;
export type IssueFamily = (typeof ISSUE_FAMILIES)[number];

/** Slug used in tags, metadata and pattern document ids. Never free text. */
export const slug = (v: string): string =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

/** The family a case belongs to is its exception type; identity, not a guess. */
export function issueFamilyOf(exceptionType: string): IssueFamily {
  return (ISSUE_FAMILIES as readonly string[]).includes(exceptionType)
    ? (exceptionType as IssueFamily)
    : (slug(exceptionType) as IssueFamily);
}

/* ------------------------------------------------------------------- tagging */

/**
 * Tags are the retrieval scope; metadata is identity and traceability. A case
 * is findable by family, by pattern and by vendor. A pattern is deliberately NOT
 * tagged by vendor: it is institutional knowledge that outlives one supplier.
 */
export function caseTags(family: string, pattern: string, vendor: string): string[] {
  return ["domain:ap", "memory:case", `family:${slug(family)}`, `pattern:${slug(pattern || "unspecified")}`, `vendor:${slug(vendor)}`];
}

export function patternTags(family: string, pattern: string): string[] {
  return ["domain:ap", "memory:pattern", `family:${slug(family)}`, `pattern:${slug(pattern || "unspecified")}`];
}

/** The family tag, used on its own for a first-stage scoped recall. */
export const familyTag = (family: string) => `family:${slug(family)}`;

/** The tag for one specific pattern inside a family, e.g. `pattern:fuel_surcharge_annexure`. */
export const patternTag = (family: string, pattern: string) => `pattern:${slug(pattern || "unspecified")}`;

/* --------------------------------------------- case identity for retrieval */

// Hindsight extracts facts with an LLM, so the case id is stored three ways:
// in the document id, in string metadata, and as a literal marker in the text.
// Recall can then be normalised back to a real record without trusting prose.
//
// The marker is the only channel that survives a paraphrase-free read of the
// stored text, so it is written on every retain. Recall itself normally
// identifies cases through metadata.case_id / document_id, because Hindsight
// returns LLM-extracted facts rather than the stored text verbatim.

/** An Echo case id: C01, C02, ... Nothing else may ever become evidence. */
const ECHO_CASE_ID = /^C\d{2}$/;
export const isEchoCaseId = (v: unknown): v is string =>
  typeof v === "string" && ECHO_CASE_ID.test(v);

export const CASE_DOC_PREFIX = "echo-case-";
/** Machine-readable marker written into every retained case, from the real id. */
export const caseMarker = (id: string) => `[${id}]`;

// Accepts the current marker `[C02]` and the legacy `[echo-case:C02]`, so text
// retained before the marker change still resolves.
const MARKER_RE = /\[echo-case:([A-Za-z0-9_-]+)\]|\[(C\d{2})\]/g;

/**
 * Extract Echo case ids from explicit markers only, de-duplicated, in the order
 * they appear. Prose is never trusted: a memory that merely mentions "C08" in a
 * sentence must not be able to pull that case into the evidence.
 */
export function parseEchoCaseIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const id = m[2] ?? m[1];
    if (isEchoCaseId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function caseIdFromDocument(documentId: string | null | undefined): string | null {
  if (!documentId || !documentId.startsWith(CASE_DOC_PREFIX)) return null;
  const id = documentId.slice(CASE_DOC_PREFIX.length);
  return isEchoCaseId(id) ? id : null;
}

/* ------------------------------------------------------------- retain input */

export interface RetainCaseInput {
  id: string;
  /** Human-readable narrative, already phrased as a resolution story. */
  text: string;
  context: string;
  timestamp: string;
  vendor: string;
  exceptionType: string;
  date: string;
  /** Defaults to the exception type; routing is never inferred from prose. */
  issueFamily?: string;
  exceptionPattern?: string;
}

/** Single source of truth for how a case is written to Hindsight.
 *
 *  The marker leads the text: Hindsight extracts facts with an LLM, and an
 *  identity at the very front is the most likely thing to survive into the
 *  fact it writes back. Structure and metadata still carry the id, so recall
 *  never depends on the marker alone. */
export function buildCaseMemory(c: RetainCaseInput) {
  const family = c.issueFamily ?? issueFamilyOf(c.exceptionType);
  const pattern = c.exceptionPattern ?? "unspecified";
  return {
    content: `${caseMarker(c.id)} ${c.text}`,
    context: c.context,
    timestamp: c.timestamp,
    documentId: `${CASE_DOC_PREFIX}${c.id}`,
    updateMode: "replace" as const,
    tags: caseTags(family, pattern, c.vendor),
    metadata: {
      case_id: c.id,
      vendor: c.vendor,
      exception_type: c.exceptionType,
      issue_family: family,
      exception_pattern: pattern,
      case_date: c.date,
    },
  };
}

export interface RetainOutcome {
  ok: boolean;
  itemsCount: number;
  operationId: string | null;
}

export async function hindsightRetain(
  input: RetainCaseInput,
  cfg: HindsightConfig = requireConfig(),
): Promise<RetainOutcome> {
  const mem = buildCaseMemory(input);
  const res = await getClient(cfg).retain(cfg.bankId, mem.content, {
    context: mem.context,
    timestamp: mem.timestamp,
    documentId: mem.documentId,
    updateMode: mem.updateMode,
    tags: mem.tags,
    metadata: mem.metadata,
  });
  return { ok: Boolean(res?.success), itemsCount: res?.items_count ?? 0, operationId: res?.operation_id ?? null };
}

export interface RecallOutcome {
  /** Case ids recovered from the recall results, de-duplicated, recall order kept. */
  caseIds: string[];
  /** The recalled text, for the "what Echo remembered" snippets. */
  snippets: string[];
}

export interface RecallOptions {
  maxTokens?: number;
  budget?: "low" | "mid" | "high";
  /**
   * Scopes recall to documents carrying every one of these tags. A scoped recall
   * that returns nothing is not an error: the caller decides whether to widen,
   * because a tag that no document carries yet is a migration state, not proof
   * that the memory is empty.
   */
  tags?: string[];
}

export async function hindsightRecall(
  query: string,
  options: RecallOptions = {},
  cfg: HindsightConfig = requireConfig(),
): Promise<RecallOutcome> {
  const res = await getClient(cfg).recall(cfg.bankId, query, {
    maxTokens: options.maxTokens ?? 1500,
    budget: options.budget ?? "low",
    includeEntities: false,
    ...(options.tags?.length ? { tags: options.tags, tagsMatch: "all_strict" as const } : {}),
  });

  const caseIds: string[] = [];
  const snippets: string[] = [];
  for (const r of res.results ?? []) {
    const text = r.text ?? "";
    if (text.trim()) snippets.push(text.trim());

    // Identity order, most authoritative first: structured metadata, then the
    // document id, then an explicit marker in the text. Prose is never parsed.
    const metaId = r.metadata?.case_id;
    const docId = caseIdFromDocument(r.document_id);
    const ids = [
      ...(isEchoCaseId(metaId) ? [metaId] : []),
      ...(docId ? [docId] : []),
      ...parseEchoCaseIds(text),
    ];
    for (const id of ids) if (!caseIds.includes(id)) caseIds.push(id);
  }
  return { caseIds, snippets };
}

/* ------------------------------------------- actual retained case content */

/**
 * One historical case, recovered from the text Hindsight actually retained.
 *
 * Recall returns LLM-extracted facts, which are not a dependable record of the
 * case, so this is built from the verbatim document body (getDocument ->
 * original_text) instead. Every field is a fixed part of the format written by
 * buildCaseMemory/the seed; nothing is inferred from free prose.
 */
export interface RecalledCase {
  id: string;
  date: string;
  vendor: string;
  invoice_no: string;
  exception_type: string;
  /** Empty string when the retained text names no specific pattern. */
  exception_pattern: string;
  /** null when the retained text records no invoice-vs-PO difference. */
  diff_pct: number | null;
  /**
   * The invoice value, when the retained text states it. Null is a real answer,
   * not a gap to be filled in: a case that did not record its amount cannot be
   * compared on amount, and must never be ranked as though it had.
   */
  invoice_amount_inr: number | null;
  po_amount_inr: number | null;
  approver: string;
  workaround: string;
  outcome: "approved" | "rejected";
  days_to_resolve: number;
  note: string;
  condition: string | null;
  decision: string | null;
  policy_route: string | null;
}

const CAPTURE = (re: RegExp, text: string): string | null => {
  const m = re.exec(text);
  return m ? m[1].trim() : null;
};

/**
 * A named clause, with the sentence punctuation the writers add removed.
 *
 * The saved format ends a field with a full stop ("Pattern: fuel surcharge
 * annexure."), so a raw capture carries it. That is not cosmetic: the pattern
 * name decides the pattern's tag and document id, so a trailing full stop would
 * put a case in a pattern document of its own and it would never join the
 * pattern it actually belongs to. Note and policy captures keep their full stop,
 * because those fields are whole sentences and the stop is part of them.
 */
const CLAUSE = (re: RegExp, text: string): string | null => {
  const v = CAPTURE(re, text);
  return v === null ? null : v.replace(/[\s.;,]+$/, "");
};

// Two heads exist in the corpus: the seeded narrative opens "On <date>, <vendor>
// invoice <no> ...", and a case written by save_resolution opens "<date> <vendor>
// <no> ..." with the invoice number carrying no label. The id marker is already
// stripped before these run.
const RE_HEAD_SEEDED = /^On\s+(\d{4}-\d{2}-\d{2}),\s+(.+?)\s+invoice\s+([A-Za-z0-9-]+)/;
const RE_HEAD_SAVED = /^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([A-Za-z0-9-]+)\s+\(/;
// "... was raised as a <pattern> (<type>) exception: ..." names both, in that order.
const RE_HEAD_PATTERN = /was raised as a (.+?) \(([^)]+)\) exception:/;
// Otherwise the single parenthesised token after the invoice number is the type.
const RE_HEAD_TYPE = /\(([^)]+)\):/;
const RE_HANDLED_BY = /handled by ([^.]+)\./i;
// Retained text is one line, but [\s\S] is used instead of the `s` flag so the
// patterns survive a document that was wrapped on the way in.
const RE_RESOLUTION = /Resolution: ([\s\S]+?)(?=\. Condition relied on:|\. Outcome:|\. Note:|$)/;
const RE_SAVED_RESOLUTION = /handled by [^.]+\.\s*([\s\S]+?)\.\s*Outcome:/i;
const RE_OUTCOME = /Outcome: (approved|rejected) in (\d+) day\(s\)\./;
// "invoice INR 1,34,000 vs PO INR 1,24,000 (8.06% difference)" is the only place
// a difference is stated; a case with no PO number states none, so it stays null.
const RE_DIFFERENCE = /invoice INR [\d,]+ vs PO INR [\d,]+ \(([\d.]+)% difference\)/;
// The tail fields are ordered differently by the two writers: the seeded
// narrative puts the condition before the outcome, while save_resolution writes
// Pattern/Condition/Decision/Policy after it. Every tail field is therefore read
// with a lookahead that accepts either neighbour. Without this, a condition a
// human recorded at resolution time is silently dropped on read-back, and the
// pattern built from it would be missing a condition nobody invented.
const TAIL = "(?=\\. Pattern: |\\. Condition(?: relied on)?: |\\. Decision: |\\. Written policy at the time: |\\. Outcome: |$)";
const RE_PATTERN_TAGGED = new RegExp(`Pattern: ([\\s\\S]+?)${TAIL}`);
const RE_CONDITION_RELYED = new RegExp(`Condition relied on: ([\\s\\S]+?)${TAIL}`);
const RE_CONDITION_TAGGED = new RegExp(` Condition: ([\\s\\S]+?)${TAIL}`);
const RE_DECISION_TAGGED = new RegExp(`Decision: ([\\s\\S]+?)${TAIL}`);
const RE_POLICY_STATED = /The written policy at the time said: ([\s\S]+?\.)(?=\s*Handled by )/;
const RE_POLICY_TAGGED = /Written policy at the time: ([\s\S]+)$/;
const NOTE_TAIL = "(?=\\s*(?:Pattern|Condition(?: relied on)?|Decision|Written policy at the time):|\\s*$)";
const RE_NOTE_NAMED = new RegExp(`Note: ([\\s\\S]+?\\.)${NOTE_TAIL}`);
const RE_NOTE_TRAILING = new RegExp(`day\\(s\\)\\.\\s*([\\s\\S]+?\\.)${NOTE_TAIL}`);
// Amounts are written with Indian digit grouping ("INR 1,34,000"), so the commas
// are removed rather than parsed as thousands separators by position. Matching is
// case-insensitive: the amount is sometimes mid-sentence and sometimes the first
// word of its own sentence, and neither form should be the one that is dropped.
const RE_AMOUNT_BOTH = /invoice INR ([\d,]+) vs PO INR ([\d,]+)/i;
const RE_AMOUNT_INVOICE = /invoice INR ([\d,]+)/i;
const rupees = (s: string | undefined): number | null => (s ? Number(s.replace(/,/g, "")) : null);

/** The narrative writes the type in prose ("missing po"); the corpus uses the id. */
const canonicalType = (v: string) => v.toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");

/**
 * Rebuild a case from the text Hindsight stored for it.
 *
 * Returns null — never a guess — when any field the evidence layer depends on
 * cannot be read back, so a record that is not genuinely retained cannot enter
 * the statistics. A format-valid id with no retained document is dropped here,
 * which is what the local store lookup used to guarantee.
 */
export function parseRetainedCase(id: string, text: string): RecalledCase | null {
  const body = text.replace(/^\[echo-case:[A-Za-z0-9_-]+\]|\[C\d{2,3}\]/, "").trim();
  const seeded = RE_HEAD_SEEDED.exec(body);
  const saved = seeded ? null : RE_HEAD_SAVED.exec(body);

  const date = seeded?.[1] ?? saved?.[1] ?? null;
  const vendor = seeded?.[2] ?? saved?.[2] ?? null;
  const invoice_no = seeded?.[3] ?? saved?.[3] ?? null;

  const withPattern = RE_HEAD_PATTERN.exec(body);
  const exception_pattern = withPattern ? withPattern[1].trim() : CLAUSE(RE_PATTERN_TAGGED, body) ?? "";
  const rawType = withPattern?.[2] ?? CAPTURE(RE_HEAD_TYPE, body);
  const approver = CAPTURE(RE_HANDLED_BY, body);
  const workaround = CAPTURE(RE_RESOLUTION, body) ?? CAPTURE(RE_SAVED_RESOLUTION, body);
  const difference = CAPTURE(RE_DIFFERENCE, body);

  const outcome = RE_OUTCOME.exec(body);
  if (!date || !vendor || !invoice_no || !rawType || !approver || !workaround || !outcome) return null;

  const both = RE_AMOUNT_BOTH.exec(body);
  return {
    id,
    date,
    vendor,
    invoice_no,
    exception_type: canonicalType(rawType),
    exception_pattern,
    diff_pct: difference === null ? null : Number(difference),
    invoice_amount_inr: both ? rupees(both[1]) : rupees(RE_AMOUNT_INVOICE.exec(body)?.[1]),
    po_amount_inr: both ? rupees(both[2]) : null,
    approver,
    workaround,
    outcome: outcome[1] as "approved" | "rejected",
    days_to_resolve: Number(outcome[2]),
    note: CAPTURE(RE_NOTE_NAMED, body) ?? CAPTURE(RE_NOTE_TRAILING, body) ?? "",
    condition: CLAUSE(RE_CONDITION_RELYED, body) ?? CLAUSE(RE_CONDITION_TAGGED, body),
    decision: CLAUSE(RE_DECISION_TAGGED, body),
    policy_route: CAPTURE(RE_POLICY_STATED, body) ?? CAPTURE(RE_POLICY_TAGGED, body),
  };
}

export interface RecalledCasesOutcome extends RecallOutcome {
  /** The recalled cases whose retained content was actually read back, in recall order. */
  cases: RecalledCase[];
}

/**
 * The runtime memory read: recall says which cases are relevant, and the body of
 * each retained document supplies what those cases actually said. Callers get
 * real content to validate and count, not ids to resolve against a local list.
 */
export async function hindsightRecalledCases(
  query: string,
  options: RecallOptions = {},
  cfg: HindsightConfig = requireConfig(),
): Promise<RecalledCasesOutcome> {
  const recalled = await hindsightRecall(query, options, cfg);
  const ids = recalled.caseIds.filter((id, i, all) => all.indexOf(id) === i);
  const docs = await Promise.all(
    ids.map((id) => getClient(cfg).getDocument(cfg.bankId, `${CASE_DOC_PREFIX}${id}`)),
  );

  const cases: RecalledCase[] = [];
  for (const [i, doc] of docs.entries()) {
    const original = doc?.original_text;
    if (!original) {
      console.warn(`[hindsight] no retained content for ${ids[i]}`);
      continue;
    }
    const parsed = parseRetainedCase(ids[i], original);
    if (!parsed) console.warn(`[hindsight] retained content for ${ids[i]} could not be read back`);
    else cases.push(parsed);
  }
  return { ...recalled, cases };
}

/* ------------------------------------------------------------- pattern memory */

/**
 * Pattern Memory is the institutional layer: what repeatedly happened, not what
 * happened once. A pattern is written as one compact document holding only
 * deterministic aggregates. It never contains a copy of a case narrative, so a
 * pattern can never be mistaken for evidence.
 */
export const PATTERN_DOC_PREFIX = "echo-pattern-";
/** Readable, stable within a session: P17, P18, ... allocated in memory order. */
export type PatternId = `P${string}`;
export const isPatternId = (v: unknown): v is PatternId => typeof v === "string" && /^P\d+$/.test(v);

/**
 * Identity of a pattern, independent of any one case. The family is a prefix so
 * a pattern document id says which routing family owns it, and the pattern slug
 * names the exception shape it encodes. It must never be derived from a single
 * case's wording, or two cases of one pattern would create two patterns.
 */
export const stablePatternKey = (family: string, exceptionPattern: string): string =>
  `${slug(family)}-${slug(exceptionPattern || "unspecified")}`;

export const patternMarker = (id: PatternId) => `[echo-pattern:${id}]`;

/**
 * A pattern as it exists in memory. Every count here is computed from real
 * retained cases by lib/pattern_memory.ts; nothing in this shape is written by
 * hand or inferred from prose.
 */
export interface RetainedPattern {
  /** Human-facing reference, allocated when the pattern is first seen. */
  pattern_id: PatternId;
  /** echo-pattern-{stablePatternKey} */
  document_id: string;
  family: IssueFamily;
  exception_pattern: string;
  support_count: number;
  approved_count: number;
  rejected_count: number;
  /** null, not 0, when nothing supports the pattern yet. */
  approval_rate: number | null;
  /** Traceability only. Never a substitute for reading the cases themselves. */
  case_ids: string[];
  approvers: { name: string; count: number }[];
  conditions: string[];
  typical_resolution: string;
  policy_route: string | null;
  last_seen: string;
  confidence: string;
}

const pct = (rate: number | null) => (rate === null ? "n/a" : `${rate}%`);
const list = (items: string[], cap: number) =>
  items.length === 0 ? "none recorded" : `${items.slice(0, cap).join("; ")}${items.length > cap ? `; +${items.length - cap} more` : ""}`;

/**
 * The pattern document body. Compact and aggregate-only: counts, the approver
 * spread, the conditions seen, and where to look. A reader must be unable to
 * mistake this for a case, which is why no date/vendor/invoice narrative and no
 * per-case workaround text appears here.
 */
/**
 * The pattern document body. Compact and aggregate-only: counts, the approver
 * spread, the conditions seen, and where to look. A reader must be unable to
 * mistake this for a case, which is why no date/vendor/invoice narrative and no
 * per-case workaround text appears here.
 *
 * One field per line. The values are human phrases that routinely contain full
 * stops, so a line-joined format would make them unparseable, and the aggregate
 * cannot be read back without writing it.
 */
export function buildPatternText(p: RetainedPattern): string {
  return [
    patternMarker(p.pattern_id),
    `Pattern family: ${p.family}`,
    `Pattern name: ${p.exception_pattern}`,
    `Stable key: ${stablePatternKey(p.family, p.exception_pattern)}`,
    `Seen in ${p.support_count} case${p.support_count === 1 ? "" : "s"}: ${p.case_ids.join(", ") || "none"}`,
    `Approved ${p.approved_count}, rejected ${p.rejected_count}, approval ${pct(p.approval_rate)}`,
    `Approvers: ${list(p.approvers.map((a) => `${a.name} (${a.count})`), 6)}`,
    `Conditions present in memory: ${list(p.conditions, 6)}`,
    `Typical resolution: ${p.typical_resolution}`,
    `Policy route recorded: ${p.policy_route ?? "none recorded"}`,
    `Last seen: ${p.last_seen}`,
    `Confidence: ${p.confidence}`,
  ].join("\n");
}

export async function hindsightRetainPattern(
  p: RetainedPattern,
  cfg: HindsightConfig = requireConfig(),
): Promise<RetainOutcome> {
  const content = buildPatternText(p);
  const res = await getClient(cfg).retain(cfg.bankId, content, {
    context: `AP pattern memory (${p.family}): deterministic aggregate of ${p.support_count} retained case(s). Advisory synthesis only; per-case truth is in echo-case-* documents.`,
    documentId: p.document_id,
    updateMode: "replace",
    tags: patternTags(p.family, p.exception_pattern),
    metadata: {
      pattern_id: p.pattern_id,
      stable_pattern_key: stablePatternKey(p.family, p.exception_pattern),
      issue_family: p.family,
      exception_pattern: p.exception_pattern,
      support_count: String(p.support_count),
      approved_count: String(p.approved_count),
      rejected_count: String(p.rejected_count),
      approval_rate: p.approval_rate === null ? "" : String(p.approval_rate),
      confidence: p.confidence,
      last_seen: p.last_seen,
    },
  });
  return { ok: Boolean(res?.success), itemsCount: res?.items_count ?? 0, operationId: res?.operation_id ?? null };
}

// Pattern documents are one field per line (see buildPatternText), so each value
// runs to the end of its own line. That is what lets a phrase containing a full
// stop survive the round trip.
const LINE = (label: string) => new RegExp(`^${label} ?(.*)$`, "m");
const RE_PATTERNS_SEEN = /Seen in (\d+) cases?: (.*)$/m;
const RE_PATTERNS_OUTCOME = /Approved (\d+), rejected (\d+), approval ([\d.]+|n\/a)%$/m;

/**
 * Read a pattern back from the text Hindsight actually stored, so pattern memory
 * is verified from retained content rather than assumed from what we meant to
 * write. Returns null rather than a guess when the body cannot be read.
 */
/**
 * Read one pattern back from memory by its document id, or null if it is not
 * there. The id is derived from the stable pattern key, so this is an exact
 * lookup that does not depend on how anything happened to rank.
 */
export async function hindsightRetainedPattern(
  documentId: string,
  cfg: HindsightConfig = requireConfig(),
): Promise<RetainedPattern | null> {
  const doc = await getClient(cfg).getDocument(cfg.bankId, documentId);
  const text = doc?.original_text;
  return text ? parseRetainedPattern(documentId, text) : null;
}

const NONE_RECORDED = "none recorded";
const isOverflow = (s: string) => /^\+\d+ more$/.test(s);

export function parseRetainedPattern(documentId: string, text: string): RetainedPattern | null {
  const marker = /^\[echo-pattern:(P\d+)\]/.exec(text);
  if (!marker) return null;
  const seen = RE_PATTERNS_SEEN.exec(text);
  const outcome = RE_PATTERNS_OUTCOME.exec(text);
  const family = LINE("Pattern family:").exec(text)?.[1]?.trim();
  if (!seen || !outcome || !family) return null;

  const support_count = Number(seen[1]);
  const approved_count = Number(outcome[1]);
  const rejected_count = Number(outcome[2]);
  // The counts have to agree, or the document is damaged and must not be trusted.
  if (support_count !== approved_count + rejected_count) return null;

  // Both lists are written with a cap, so a truncated one is read back as
  // truncated rather than as a complete record. support_count stays the
  // authoritative size, which is why losing the overflow tail is acceptable.
  const approverLine = LINE("Approvers:").exec(text)?.[1]?.trim() ?? NONE_RECORDED;
  const approvers =
    approverLine === NONE_RECORDED
      ? []
      : approverLine
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s && !isOverflow(s))
          .map((s) => {
            const m = /^(.*) \((\d+)\)$/.exec(s);
            return { name: (m?.[1] ?? s).trim(), count: m ? Number(m[2]) : 1 };
          });

  const conditionLine = LINE("Conditions present in memory:").exec(text)?.[1]?.trim() ?? NONE_RECORDED;
  const conditions =
    conditionLine === NONE_RECORDED
      ? []
      : conditionLine.split(";").map((s) => s.trim()).filter((s) => s && !isOverflow(s));

  const policyRoute = LINE("Policy route recorded:").exec(text)?.[1]?.trim() ?? "";
  return {
    pattern_id: marker[1] as PatternId,
    document_id: documentId,
    family: family as IssueFamily,
    exception_pattern: LINE("Pattern name:").exec(text)?.[1]?.trim() || "unspecified",
    support_count,
    approved_count,
    rejected_count,
    approval_rate: outcome[3] === "n/a" ? null: Number(outcome[3]),
    case_ids: (seen[2] ?? "").split(",").map((s) => s.trim()).filter((s) => s && s !== "none"),
    approvers,
    conditions,
    typical_resolution: LINE("Typical resolution:").exec(text)?.[1]?.trim() ?? "",
    policy_route: policyRoute && policyRoute !== NONE_RECORDED ? policyRoute : null,
    last_seen: LINE("Last seen:").exec(text)?.[1]?.trim() ?? "",
    confidence: LINE("Confidence:").exec(text)?.[1]?.trim() ?? "",
  };
}

/** Recall Pattern Memory, scoped to one routing family by tag. */
export async function hindsightRecalledPatterns(
  family: string,
  query: string,
  options: RecallOptions = {},
  cfg: HindsightConfig = requireConfig(),
): Promise<RetainedPattern[]> {
  const res = await getClient(cfg).recall(cfg.bankId, query, {
    maxTokens: options.maxTokens ?? 800,
    budget: options.budget ?? "low",
    includeEntities: false,
    ...(options.tags?.length ? { tags: options.tags, tagsMatch: "all_strict" as const } : { tags: [familyTag(family)], tagsMatch: "all_strict" as const }),
  });

  const ids: string[] = [];
  for (const r of res.results ?? []) {
    const docId = r.document_id;
    if (docId?.startsWith(PATTERN_DOC_PREFIX) && !ids.includes(docId)) ids.push(docId);
  }

  const patterns: RetainedPattern[] = [];
  const docs = await Promise.all(ids.map((id) => getClient(cfg).getDocument(cfg.bankId, id)));
  docs.forEach((doc, i) => {
    const original = doc?.original_text;
    if (!original) {
      console.warn(`[hindsight] no retained content for pattern ${ids[i]}`);
      return;
    }
    const parsed = parseRetainedPattern(ids[i], original);
    if (parsed) patterns.push(parsed);
    else console.warn(`[hindsight] pattern ${ids[i]} could not be read back`);
  });
  return patterns;
}

/**
 * Every pattern document currently in memory, with the id each one carries.
 *
 * The id lives in the document body rather than in metadata because listDocuments
 * does not return metadata, so the body is the only reliable place to read it.
 * That costs one read per pattern document, which is why this is used on the
 * human-initiated save path and never on a query.
 */
export async function hindsightExistingPatterns(
  cfg: HindsightConfig = requireConfig(),
): Promise<{ document_id: string; pattern_id: PatternId }[]> {
  const docs = await getClient(cfg).listDocuments(cfg.bankId, { limit: 500 });
  const ids = (docs.items ?? []).filter((d) => d.id.startsWith(PATTERN_DOC_PREFIX)).map((d) => d.id);
  const out: { document_id: string; pattern_id: PatternId }[] = [];
  for (const id of ids) {
    const doc = await getClient(cfg).getDocument(cfg.bankId, id);
    const marker = doc?.original_text ? /^\[echo-pattern:(P\d+)\]/.exec(doc.original_text) : null;
    if (marker) out.push({ document_id: id, pattern_id: marker[1] as PatternId });
  }
  return out;
}

/** The next unused case number, taken from what the bank already holds.
 *
 *  A new case must never reuse an id, because retain writes with
 *  updateMode "replace": reusing C48 would silently destroy an earlier
 *  resolution. Deriving the id from the local store length is not safe, because
 *  the store is only the bootstrap copy and a restarted process forgets it. */
export async function nextCaseId(cfg: HindsightConfig = requireConfig()): Promise<string> {
  const docs = await getClient(cfg).listDocuments(cfg.bankId, { limit: 1000 });
  let highest = 0;
  for (const d of docs.items ?? []) {
    if (!d.id.startsWith(CASE_DOC_PREFIX)) continue;
    const n = Number(d.id.slice(CASE_DOC_PREFIX.length).replace(/^C/, ""));
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `C${String(highest + 1).padStart(2, "0")}`;
}

/**
 * Reflect synthesises a pattern across memories. It is advisory only: callers
 * must present it separately from deterministic evidence and must never let it
 * stand in for computed statistics.
 */
export async function hindsightReflect(
  query: string,
  context?: string,
  cfg: HindsightConfig = requireConfig(),
): Promise<string | null> {
  const res = await getClient(cfg).reflect(cfg.bankId, query, { context, budget: "low" });
  const text = res?.text?.trim();
  return text ? text : null;
}

export async function hindsightVersion(cfg: HindsightConfig = requireConfig()): Promise<string> {
  const res = await getClient(cfg).getVersion();
  return res?.api_version ?? "unknown";
}

/**
 * Fetch cases directly by their known IDs (bypassing semantic recall).
 * Used when we already know which case IDs should be evidence (e.g., from a pattern's supporting_case_ids).
 */
export async function hindsightGetCasesByIds(
  caseIds: string[],
  cfg: HindsightConfig = requireConfig(),
): Promise<RecalledCase[]> {
  const docs = await Promise.all(
    caseIds.map((id) => getClient(cfg).getDocument(cfg.bankId, `${CASE_DOC_PREFIX}${id}`)),
  );

  const cases: RecalledCase[] = [];
  for (const [i, doc] of docs.entries()) {
    const original = doc?.original_text;
    if (!original) {
      console.warn(`[hindsight] no retained content for ${caseIds[i]}`);
      continue;
    }
    const parsed = parseRetainedCase(caseIds[i], original);
    if (!parsed) console.warn(`[hindsight] retained content for ${caseIds[i]} could not be read back`);
    else cases.push(parsed);
  }
  return cases;
}

/**
 * Read a pattern's supporting cases directly from memory, using the pattern's
 * recorded case_ids. This bypasses semantic recall entirely, so it works
 * immediately after a case is retained without waiting for indexing.
 */
export async function hindsightGetPatternSupportingCases(
  patternDocumentId: string,
  cfg: HindsightConfig = requireConfig(),
): Promise<RecalledCase[]> {
  const pattern = await hindsightRetainedPattern(patternDocumentId, cfg);
  if (!pattern || pattern.case_ids.length === 0) return [];
  return hindsightGetCasesByIds(pattern.case_ids, cfg);
}

function requireConfig(): HindsightConfig {
  const cfg = hindsightConfig();
  if (!cfg) throw new Error("Hindsight is not configured (HINDSIGHT_BANK_ID / HINDSIGHT_BASE_URL missing)");
  return cfg;
}
