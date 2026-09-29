// echo_agent_core.ts
// Echo: AP exception memory agent. Drop into your Next.js project (e.g. lib/echo.ts)
// and call runAgent() from an API route. Needs: tsconfig "resolveJsonModule": true,
// echo_seed_data.json next to this file, env GROQ_API_KEY + HINDSIGHT_* (see lib/hindsight.ts).
//
// Memory: Hindsight Cloud (bank echo-ap-memory) does the retrieval AND holds the
// evidence. Recall returns the cases it considers relevant, each retained document
// is read back for the content it actually recorded, and the code then re-checks
// that content against the deterministic rule and computes every number itself, so
// the LLM never invents figures. Reflect only adds a clearly labelled advisory
// pattern. If Hindsight is unreachable the agent falls back to the bootstrap store
// and reports memory_source = "fallback".

import seed from "./echo_seed_data.json";
import {
  aggregatePattern,
  confidenceLabel,
  patternDocumentId,
  sameAmountRegime,
  selectPatterns,
} from "./pattern_memory";
import {
  familyTag,
  hindsightConfig,
  hindsightExistingPatterns,
  hindsightGetCasesByIds,
  hindsightRecalledCases,
  hindsightRecalledPatterns,
  hindsightReflect,
  hindsightRetain,
  hindsightRetainPattern,
  hindsightRetainedPattern,
  issueFamilyOf,
  nextCaseId,
  parseRetainedCase,
  stablePatternKey,
  type IssueFamily,
  type PatternId,
  type RecalledCase,
  type RetainedPattern,
} from "./hindsight";
import { computeReplay, type ReplayCaseLike } from "./replay";
import { emptyFacts, factsFromRecall, verifyReplyText, type GroundingFact } from "./grounding";

// ---------- Types ----------
export type Outcome = "approved" | "rejected";
/**
 * What evidence actually needs. A case read back from Hindsight satisfies this
 * even when the retained text recorded no invoice/PO amounts, so no figure is
 * ever invented to fill the shape.
 */
export interface EvidenceCase {
  id: string; date: string; vendor: string; invoice_no: string;
  diff_pct: number | null; exception_type: string;
  approver: string; workaround: string; outcome: Outcome; days_to_resolve: number;
  /** Optional institutional detail, present on the generated history (C13+). */
  exception_pattern?: string;
  /** Only seeded cases and local-fallback records carry one. */
  note?: string;
  /** Real rupees, when memory recorded them. Null means "not recorded". */
  invoice_amount_inr?: number | null;
  po_amount_inr?: number | null;
  // The condition/decision/policy a case was resolved under. They live on the
  // evidence record rather than the local Case because they are read back from
  // retained memory, and Pattern Memory aggregates them.
  condition?: string | null;
  decision?: string | null;
  policy_route?: string | null;
}
export interface Case extends EvidenceCase {
  invoice_amount_inr: number; po_amount_inr: number | null;
  note: string;
}
export interface Query {
  vendor: string; exception_type: string; invoice_amount_inr: number; po_amount_inr: number | null;
}
interface Person { name: string; role: string; status: string }
interface SeedData { past_cases: Case[]; people: Person[] }
const seedData = seed as unknown as SeedData;

// ---------- Bootstrap store (seed only; Hindsight is the runtime source) ----------
// Hindsight finds relevant memories and supplies their content, so this array is
// no longer the source of evidence for a lookup. It stays for the paths that
// still need the whole local corpus: the offline fallback in safeRecall, and the
// bookkeeping in save_resolution / find_knowledge_owner / promote_to_policy.
// On serverless hosts this array resets between cold starts: re-seed from JSON
// (default) and retain to Hindsight.
let store: Case[] = seedData.past_cases;
export const getStore = () => store;

// ---------- Policy check (written rules) ----------
export const diffPct = (inv: number, po: number | null) =>
  po ? Math.round(((inv - po) / po) * 10000) / 100 : null;

export function policyRoute(q: Query): string {
  const d = diffPct(q.invoice_amount_inr, q.po_amount_inr);
  if (q.exception_type === "duplicate_suspect") return "Reject: duplicate invoice number.";
  if (q.exception_type === "missing_po") return "Reject and return to vendor: no PO number.";
  if (d !== null && Math.abs(d) <= 2) return "Auto-approve: within 2% of PO.";
  if (q.invoice_amount_inr > 50000) return "CFO approval required: mismatch on invoice above INR 50,000.";
  return "AP Manager review: mismatch above 2%.";
}

// ---------- Similarity + computed confidence ----------
const DIFF_WINDOW = 1.0; // percentage points
/** The deterministic definition of "same kind of exception", used for local search. */
function matchesQuery(c: Case, q: Query) {
  if (c.vendor !== q.vendor || c.exception_type !== q.exception_type) return false;
  const d = diffPct(q.invoice_amount_inr, q.po_amount_inr);
  if (d !== null && c.diff_pct !== null) return Math.abs(c.diff_pct - d) <= DIFF_WINDOW;
  // no percentage available (e.g. missing PO): compare which side of the INR 50,000 threshold
  return (c.invoice_amount_inr > 50000) === (q.invoice_amount_inr > 50000);
}
export function findSimilar(q: Query, cases: Case[] = store): Case[] {
  return cases.filter((c) => matchesQuery(c, q));
}

/** Normalised token of a type/pattern phrase: lower case, underscores/spaces collapsed. */
const normType = (v: string) => v.toLowerCase().replace(/[\s_-]+/g, " ").trim();

/**
 * Broad exception family, used ONLY to re-check cases Hindsight recalled.
 *
 * A historical record is in the same family as the request when its
 * `exception_type` matches, OR when the request names a more specific
 * `exception_pattern` ("fuel surcharge", "split shipment", ...) that the
 * record also carries, OR the other way round. So an incoming
 * `amount_mismatch` is compatible with historical amount-mismatch cases whose
 * recorded pattern is a specific price/freight/quantity variance, instead of
 * being rejected for holding a narrower pattern. Anything else (a GST or
 * duplicate case) is a different family and never counts as evidence.
 */
function sameExceptionFamily(c: EvidenceCase, q: Query): boolean {
  const want = normType(q.exception_type);
  if (normType(c.exception_type) === want) return true;
  if (!c.exception_pattern) return false;
  const p = normType(c.exception_pattern);
  return p === want || p.startsWith(`${want} `) || want.startsWith(`${p} `) || p.includes(want) || want.includes(p);
}

const CONDITIONS: [string, RegExp][] = [
  ["fuel-surcharge annexure attached", /annexure/i],
  ["vendor credit note issued", /credit note/i],
  ["retroactive PO raised", /retroactive po/i],
  ["SAC/HSN code and tax rate checked", /sac code|hsn/i],
];

export function computeStats(similar: EvidenceCase[]) {
  const n = similar.length;
  const approved = similar.filter((c) => c.outcome === "approved").length;
  const approvers: Record<string, number> = {};
  similar.forEach((c) => (approvers[c.approver] = (approvers[c.approver] || 0) + 1));
  const conditions = CONDITIONS.map(([label, re]) => ({
    label, count: similar.filter((c) => re.test(c.workaround)).length,
  })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const last = similar.map((c) => c.date).sort().pop() ?? null;
  // The one confidence definition, shared with Pattern Memory, so a pattern and
  // the case evidence behind it can never disagree about how much support exists.
  const confidence = confidenceLabel(n);
  return { similar_cases: n, approved, summary: n ? `${approved} of ${n} approved` : "no similar cases",
           approvers, top_condition: conditions[0] ?? null, last_case_date: last, confidence };
}

// ---------- Memory adapter (Hindsight Cloud, with honest fallback) ----------
const caseText = (c: EvidenceCase) =>
  `${c.date} ${c.vendor} ${c.invoice_no} (${c.exception_type}): handled by ${c.approver}. ${c.workaround}. Outcome: ${c.outcome} in ${c.days_to_resolve} day(s). ${c.note}` +
  // The invoice value is recorded here because the comparability rules are
  // stated in rupees. Without it a retained resolution cannot be compared on
  // amount at all, and would be set aside as uncomparable rather than shown.
  (c.invoice_amount_inr
    ? c.po_amount_inr
      ? ` Invoice INR ${c.invoice_amount_inr.toLocaleString("en-IN")} vs PO INR ${c.po_amount_inr.toLocaleString("en-IN")}.`
      : ` Invoice INR ${c.invoice_amount_inr.toLocaleString("en-IN")}.`
    : "") +
  (c.exception_pattern ? ` Pattern: ${c.exception_pattern}.` : "") +
  (c.condition ? ` Condition relied on: ${c.condition}.` : "") +
  (c.decision ? ` Decision: ${c.decision}.` : "") +
  (c.policy_route ? ` Written policy at the time: ${c.policy_route}` : "");

const recallQuery = (q: Query) =>
  `${q.vendor} ${q.exception_type} exception, invoice INR ${q.invoice_amount_inr}, PO ${q.po_amount_inr ?? "none"}`;

interface MemoryRecall {
  cases: EvidenceCase[];
  patterns: RetainedPattern[];
  snippets: string[];
  source: "hindsight" | "fallback";
  family: IssueFamily | "unknown";
  /** How the case set was found, so the reply never overstates the memory used. */
  scope: "family" | "unscoped" | "local";
  /** Recalled cases ruled out by validation, by reason. null on the local path. */
  excluded: Record<string, number> | null;
}

/** The most case evidence one investigation may show, and the useful floor. */
const EVIDENCE_MAX = 8;
const PATTERN_MAX = 3;

/**
 * Pattern Memory is advisory. A failure to reach or read it must never cost the
 * user their case evidence, so it is isolated from the case path entirely.
 */
async function safePatterns(q: Query, family: IssueFamily | "unknown"): Promise<RetainedPattern[]> {
  if (family === "unknown" || !hindsightConfig()) return [];
  try {
    // No vendor in this query, on purpose. A pattern is institutional knowledge
    // and is not tagged or written per supplier, so naming the vendor here makes
    // the recall look for a pattern that mentions it and find nothing. The family
    // tag is what scopes this.
    return selectPatterns(
      await hindsightRecalledPatterns(family, `recurring ${q.exception_type} exception pattern in accounts payable`),
      PATTERN_MAX,
    );
  } catch (e) {
    console.warn("[hindsight] pattern memory unavailable:", e instanceof Error ? e.message : String(e));
    return [];
  }
}


/**
 * Hindsight decides WHICH historical cases are relevant AND supplies what each
 * one actually recorded: the body of the retained document is read back and
 * parsed, so the evidence below is the memory Hindsight holds, not a local copy.
 *
 * Retrieval is PATTERN-FIRST and family-scoped. Pattern Memory says which kinds of
 * case this family has seen before, and its supporting_case_ids become the
 * authoritative candidate evidence set. We then fetch those exact case IDs
 * directly from Hindsight and re-check their content against the deterministic
 * rule. A broad semantic recall is NEVER used to choose among those IDs.
 *
 * A family with no patterns yet falls back to a scoped case recall, then an
 * unscoped one, for migration compatibility. The same validation runs either way.
 *
 * This function only decides what is allowed to count. A case survives
 * if it is the same vendor, is not the invoice under investigation, belongs to
 * the same broad exception family, and matches on amount when the request
 * carries one. Every number is then computed by computeStats() from those
 * records alone, so Groq never contributes a figure.
 *
 * The local matcher is deliberately NOT consulted on this path. It runs only
 * when Hindsight fails (see the catch below), and its results are never merged
 * with Hindsight's, so `memory_source` always describes how evidence was found.
 */
async function safeRecall(q: Query, currentInvoiceNo?: string): Promise<MemoryRecall> {
  const family = issueFamilyOf(q.exception_type);
  try {
    // Step 1: Get patterns for this family (advisory layer, scoped by family tag)
    const patterns = await safePatterns(q, family);

    // Step 2: Authoritative evidence comes from the patterns' supporting_case_ids
    // We union the case IDs from the top patterns and fetch them directly.
    const candidateCaseIds: string[] = [];
    for (const p of patterns) {
      for (const id of p.case_ids) if (!candidateCaseIds.includes(id)) candidateCaseIds.push(id);
    }

    let recalledCases: RecalledCase[] = [];
    let scope: MemoryRecall["scope"] = "family";

    if (candidateCaseIds.length > 0) {
      // Pattern-first: fetch the exact cases the pattern memory says exist
      recalledCases = await hindsightGetCasesByIds(candidateCaseIds);
    } else {
      // Migration fallback: no patterns yet, do a scoped case recall
      const query = recallQuery(q);
      const recalled = await hindsightRecalledCases(query, { tags: [familyTag(family)] });
      if (recalled.caseIds.length === 0) {
        // Further fallback: unscoped recall for banks without tags
        const unscoped = await hindsightRecalledCases(query);
        recalledCases = unscoped.cases;
        scope = "unscoped";
      } else {
        recalledCases = recalled.cases;
      }
    }

    if (recalledCases.length === 0) throw new Error("recall returned no recognisable Echo cases");

    const d = diffPct(q.invoice_amount_inr, q.po_amount_inr);
    // Which cases were ruled out, and why. Every exclusion is counted here so
    // the UI can account for recalled memory that did not become evidence,
    // rather than letting it disappear without a trace.
    const excluded = { other_vendor: 0, self: 0, other_family: 0, outside_diff_window: 0, other_policy_band: 0, no_recorded_amount: 0 };

    const kept = recalledCases.filter((c) => {
      if (c.vendor !== q.vendor) return void excluded.other_vendor++;
      // the invoice under investigation can never be its own precedent
      if (c.invoice_no === currentInvoiceNo) return void excluded.self++;
      if (!sameExceptionFamily(c, q)) return void excluded.other_family++;
      // Cases resolved under a different written policy are not precedent.
      // Without a recorded amount a case cannot be placed in a band at all,
      // so it is set aside and reported rather than assumed comparable.
      if (!sameAmountRegime(c.invoice_amount_inr, q.invoice_amount_inr, family)) {
        excluded[c.invoice_amount_inr === null ? "no_recorded_amount" : "other_policy_band"]++;
        return false;
      }
      if (d !== null && c.diff_pct !== null && Math.abs(c.diff_pct - d) > DIFF_WINDOW) return void excluded.outside_diff_window++;
      return true;
    });

    return {
      cases: capEvidence(chronological(kept)),
      patterns,
      snippets: recalledCases.map(caseText),
      source: "hindsight",
      family,
      scope,
      excluded,
    };
  } catch (e) {
    console.warn("[hindsight] recall failed, using local fallback:", e instanceof Error ? e.message : String(e));
    const cases = capEvidence(chronological(findSimilar(q)));
    return { cases, patterns: [], snippets: cases.map(caseText), source: "fallback", family, scope: "local", excluded: null };
  }
}

/**
 * Evidence is ordered oldest first, by date and then id.
 *
 * Deliberately not recall order: Hindsight ranks with an LLM, so the same query
 * can come back in a different order between runs, which would make the evidence
 * list and everything derived from it flicker. Ordering by the date recorded in
 * the case itself is reproducible, and it also reads correctly -- the most recent
 * precedent, the one closest to today, ends up nearest the current invoice.
 */
const chronological = (cases: EvidenceCase[]): EvidenceCase[] =>
  [...cases].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

/**
 * Evidence is capped so a broad question cannot dump the whole history onto the
 * screen. The cap only removes the tail of an already-validated list, so it
 * changes how much is shown and never which cases qualified.
 */
const capEvidence = (cases: EvidenceCase[]): EvidenceCase[] =>
  cases.length > EVIDENCE_MAX ? cases.slice(0, EVIDENCE_MAX) : cases;

/** Advisory only. A live Reflect request, kept separate from the cached path. */
async function liveReflect(q: Query, family: IssueFamily | "unknown"): Promise<string | null> {
  if (!hindsightConfig()) return null;
  try {
    return await hindsightReflect(
      `What pattern explains how ${q.vendor} ${q.exception_type} exceptions were resolved before?`,
      `Accounts-payable ${family} family. Advisory synthesis only. Do not state counts, percentages, dates, case ids or policy rules.`,
    );
  } catch (e) {
    console.warn("[hindsight] reflect failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export type SynthesisSource = "none" | "reflect" | "cached" | "deterministic";
interface Synthesis { text: string | null; source: SynthesisSource }

/**
 * Reflect, made opt-in and cached. A lookup itself never pays for a synthesis:
 * pattern_insight exists only when the caller asked for it (synthesize=true).
 * The live cloud call is cached against the deterministic state of the patterns
 * and cases actually shown, so an unchanged question never spends a second call,
 * and a small per-process budget caps the feature's cost. Beyond the budget, or
 * when Hindsight is unreachable, the computed summary is returned instead, so the
 * feature degrades to counted facts rather than to silence or to a bare error.
 */
const SYNTHESIS_BUDGET = 2;
let synthesisBudget = SYNTHESIS_BUDGET;
const synthesisCache = new Map<string, { fingerprint: string; text: string }>();

/** Live Reflect requests still permitted in this process. 0 <= n <= 2. */
export function reflectBudgetRemaining(): number {
  return synthesisBudget;
}
/** Restore the live-synthesis budget (test/demo hygiene only; never called per query). */
export function resetReflectBudget(): void {
  synthesisBudget = SYNTHESIS_BUDGET;
}
/** The cache keys (families) currently holding a synthesis. */
export function reflectCacheKeys(): string[] {
  return [...synthesisCache.keys()];
}

const patternFingerprint = (patterns: RetainedPattern[], cases: EvidenceCase[]): string =>
  JSON.stringify([
    patterns.map((p) => [p.pattern_id, p.support_count, p.approved_count, p.rejected_count, p.last_seen]),
    cases.map((c) => [c.id, c.outcome]),
  ]);

function deterministicSummary(q: Query, family: IssueFamily | "unknown", stats: ReturnType<typeof computeStats>): string {
  const n = stats.similar_cases;
  if (n === 0) return "No sufficient historical precedent was found.";
  const rate = Math.round((stats.approved / n) * 1000) / 10;
  let s = `${stats.approved} of ${n} comparable ${family} precedents for ${q.vendor} were approved (${rate}% of cases).`;
  if (stats.top_condition) {
    s += ` The condition that appeared most often was "${stats.top_condition.label}" (${stats.top_condition.count} of ${n} decisions).`;
  }
  s += ` Confidence: ${stats.confidence}.`;
  return s;
}

async function synthesizePattern(
  q: Query,
  family: IssueFamily | "unknown",
  patterns: RetainedPattern[],
  cases: EvidenceCase[],
  synthesize: boolean,
): Promise<Synthesis> {
  if (!synthesize) return { text: null, source: "none" };
  const fingerprint = patternFingerprint(patterns, cases);
  const key = `${stablePatternKey(family, "any")}`;
  const cached = synthesisCache.get(key);
  if (cached && cached.fingerprint === fingerprint) return { text: cached.text, source: "cached" };

  const stats = computeStats(cases);
  const fallback: Synthesis = { text: deterministicSummary(q, family, stats), source: "deterministic" };
  if (synthesisBudget <= 0 || !hindsightConfig()) return fallback;
  // It is a live call the instant it reaches the client, so spend the budget first.
  synthesisBudget -= 1;
  const text = await liveReflect(q, family);
  if (!text) return fallback;
  synthesisCache.set(key, { fingerprint, text });
  return { text, source: "reflect" };
}

// ---------- Tool handlers ----------

/**
 * The pattern layer, shaped for display. support/approved/rejected/rate come
 * straight from the pattern document that was read back out of Hindsight, so the
 * UI can show the same numbers the memory holds. `on_screen` records how many of
 * the pattern's supporting cases are actually in the evidence list, which is what
 * lets the grounding check catch a pattern claimed from memory that is not on
 * screen.
 */
const patternView = (p: RetainedPattern, onScreen: string[]) => ({
  pattern_id: p.pattern_id,
  family: p.family,
  exception_pattern: p.exception_pattern,
  support_count: p.support_count,
  approved_count: p.approved_count,
  rejected_count: p.rejected_count,
  approval_rate: p.approval_rate,
  confidence: p.confidence,
  last_seen: p.last_seen,
  approvers: p.approvers,
  conditions: p.conditions,
  typical_resolution: p.typical_resolution,
  policy_route: p.policy_route,
  source: "hindsight" as const,
  supporting_case_ids: p.case_ids,
  supporting_cases_on_screen: p.case_ids.filter((id) => onScreen.includes(id)),
});

export async function recall_exception_pattern(a: Query & { invoice_no?: string; synthesize?: boolean }) {
  const q: Query = { vendor: a.vendor, exception_type: a.exception_type,
    invoice_amount_inr: a.invoice_amount_inr, po_amount_inr: a.po_amount_inr ?? null };
  const synthesize = a.synthesize === true;
  const { cases, patterns, snippets, source, family, scope, excluded } = await safeRecall(q, a.invoice_no);
  // Reflect is opt-in and cached (synthesizePattern). Without a synthesis
  // request the evidence is complete on its own, and no provider call is made.
  const synthesis =
    cases.length > 0 && source === "hindsight" && synthesize
      ? await synthesizePattern(q, family, patterns, cases, true)
      : ({ text: null, source: "none" } satisfies Synthesis);
  const onScreen = cases.map((c) => c.id);

  // Compute deterministic Replay from the validated cases
  const replayCases: ReplayCaseLike[] = cases.map((c) => ({
    id: c.id,
    outcome: c.outcome,
    condition: c.condition,
  }));
  const replay = computeReplay(replayCases);

  return {
    memory_source: source,
    memory_scope: scope,
    issue_family: family,
    // What validation ruled out, so a remembered case that did not qualify is
    // visible as a decision rather than missing without explanation.
    evidence_excluded: excluded,
    no_history: cases.length === 0,
    written_policy_route: policyRoute(q),
    stats: computeStats(cases),
    similar_cases: cases.map((c) => ({ id: c.id, date: c.date, invoice_no: c.invoice_no, diff_pct: c.diff_pct,
      approver: c.approver, workaround: c.workaround, outcome: c.outcome, days: c.days_to_resolve,
      // The condition each finding was resolved under, for Replay. Read back from
      // retained memory with the cases; never guessed from the workaround text.
      condition: c.condition })),
    // Pattern Memory: the institutional layer, at most three entries, never mixed
    // into similar_cases so a pattern can never be counted as a precedent.
    patterns: patterns.map((p) => patternView(p, onScreen)),
    memory_snippets: snippets.slice(0, 5),
    // Advisory synthesis. Present only when asked for; source tells the UI whether
    // it is a live reflection, a cached one, or the deterministic computed summary.
    synthesis_requested: synthesize,
    pattern_insight: synthesis.text,
    synthesis_source: synthesis.source,
    // Deterministic Replay: comparison of outcomes under observed vs alternative conditions
    replay,
  };
}

/**
 * Recompute one pattern from the cases that actually support it, and store the
 * new record. Nothing here invents support: the aggregate is rebuilt from real
 * retained cases, and the resolution just saved is included explicitly so the
 * update does not have to wait for asynchronous processing to catch up.
 */
/**
 * Read the support for one pattern from memory.
 *
 * Uses DIRECT document reads only: reads the pattern document by its stable
 * document_id, then fetches each supporting case by its document ID. This
 * bypasses semantic recall entirely, so it works immediately after a case is
 * retained without waiting for indexing.
 */
async function readPatternSupport(
  family: IssueFamily,
  exceptionPattern: string,
  added: RecalledCase,
): Promise<RecalledCase[]> {
  const key = patternDocumentId(family, exceptionPattern);

  // Read the existing pattern document directly
  const existingPattern = await hindsightRetainedPattern(key);
  const existingCaseIds = existingPattern?.case_ids ?? [];

  // Fetch all existing supporting cases directly by ID
  const existingCases = existingCaseIds.length > 0
    ? await hindsightGetCasesByIds(existingCaseIds)
    : [];

  // Add the newly saved case
  const byId = new Map<string, RecalledCase>();
  for (const c of existingCases) byId.set(c.id, c);
  byId.set(added.id, added);

  return [...byId.values()];
}

async function refreshPattern(
  family: IssueFamily,
  exceptionPattern: string,
  added: { id: string; text: string },
): Promise<RetainedPattern | null> {
  const key = patternDocumentId(family, exceptionPattern);
  const existing = await hindsightExistingPatterns();
  const priorId = existing.find((p) => p.document_id === key)?.pattern_id ?? null;
  const taken = existing.map((p) => Number(p.pattern_id.slice(1))).filter(Number.isFinite);
  const patternId: PatternId = priorId ?? `P${(taken.length ? Math.max(...taken) : 0) + 1}`;

  // The new resolution is parsed through the same reader memory will use, so it
  // joins the aggregate in the same shape as the recalled cases.
  const parsedAdded = parseRetainedCase(added.id, added.text);
  if (!parsedAdded) return null;

  const support = await readPatternSupport(family, exceptionPattern, parsedAdded);
  if (support.length === 0) return null;

  const record = aggregatePattern({ patternId, family, exceptionPattern, cases: support });
  await hindsightRetainPattern(record);

  // A pattern document is replaced in place, so a slower earlier write can land
  // last and leave memory holding a stale aggregate. The write is only believed
  // once memory reads back what was intended; support_count is the check because
  // it is the number a reader is shown.
  for (let attempt = 0; attempt < 4; attempt++) {
    const back = await hindsightRetainedPattern(record.document_id);
    if (back && back.support_count === record.support_count && back.case_ids.length === record.case_ids.length) return back;
    await hindsightRetainPattern(record);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return record;
}

export async function save_resolution(a: Omit<Case, "id" | "diff_pct">) {
  const family = issueFamilyOf(a.exception_type);
  const exceptionPattern = a.exception_pattern?.trim() || "unspecified";
  // The id is allocated from the bank, not from store.length: the store is only
  // the bootstrap copy, so after a restart it would hand out an id that a real
  // resolution already owns, and "replace" would destroy that resolution.
  let id = `C${String(store.length + 1).padStart(2, "0")}`;
  try {
    id = await nextCaseId();
  } catch (e) {
    console.warn("[hindsight] could not read the next case id:", e instanceof Error ? e.message : String(e));
  }
  const c: Case = { ...a, id, diff_pct: diffPct(a.invoice_amount_inr, a.po_amount_inr) };

  const before = computeStats(findSimilar(a));
  store = [...store, c];
  const after = computeStats(findSimilar(a));

  let source: "hindsight" | "fallback" = "hindsight";
  let retained = false;
  let pattern: RetainedPattern | null = null;
  const text = caseText(c);
  try {
    await hindsightRetain({ id: c.id, text, context: "AP exception resolution",
      timestamp: new Date().toISOString(), vendor: c.vendor, exceptionType: c.exception_type, date: c.date,
      issueFamily: family, exceptionPattern });
    retained = true;
    pattern = await refreshPattern(family, exceptionPattern, { id: c.id, text });
  } catch (e) {
    source = "fallback";
    console.warn("[hindsight] retain failed:", e instanceof Error ? e.message : String(e));
  }

  return {
    saved_case_id: c.id,
    memory_source: source,
    retained,
    // Pattern Memory reflects the resolution: the numbers below are the
    // recomputed ones, read back from the pattern document that was just written.
    pattern_memory_updated: pattern !== null,
    pattern: pattern && { pattern_id: pattern.pattern_id, exception_pattern: pattern.exception_pattern,
      support_count: pattern.support_count, approved_count: pattern.approved_count, rejected_count: pattern.rejected_count,
      approval_rate: pattern.approval_rate, confidence: pattern.confidence, last_seen: pattern.last_seen },
    confidence_before: before.summary,
    confidence_after: after.summary,
    top_condition_after: after.top_condition,
    // Recording a resolution updates memory, never the written policy. Promotion
    // to policy stays a separate, human-decided step.
    written_policy_changed: false,
  };
}

export async function find_knowledge_owner(a: { vendor: string; exception_type: string }) {
  const cases = store.filter((c) => c.vendor === a.vendor && c.exception_type === a.exception_type);
  const counts: Record<string, number> = {};
  cases.forEach((c) => (counts[c.approver] = (counts[c.approver] || 0) + 1));
  const ranked = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  const people = seedData.people;
  return { no_history: cases.length === 0,
    owners: ranked.map(([name, n]) => ({ name, cases_handled: n, status: people.find((p) => p.name === name)?.status ?? "unknown" })) };
}

export async function promote_to_policy(a: { vendor: string; exception_type: string }) {
  const cases = store.filter((c) => c.vendor === a.vendor && c.exception_type === a.exception_type && c.outcome === "approved");
  const all = store.filter((c) => c.vendor === a.vendor && c.exception_type === a.exception_type);
  const st = computeStats(cases);
  if (cases.length < 3 || cases.length / Math.max(all.length, 1) < 0.8)
    return { eligible: false, reason: `Not enough consistent evidence (${cases.length} approved of ${all.length}). Need at least 3 and 80%.` };
  return { eligible: true, evidence_case_ids: cases.map((c) => c.id), top_condition: st.top_condition,
    draft_rule_basis: `${cases.length} of ${all.length} ${a.exception_type} cases for ${a.vendor} were approved` +
      (st.top_condition ? `; most common condition: ${st.top_condition.label} (${st.top_condition.count} of ${cases.length} cases)` : "") +
      `. Approvers: ${JSON.stringify(st.approvers)}. A human must review before this becomes policy.` };
}

type ToolHandler =
  | typeof recall_exception_pattern
  | typeof save_resolution
  | typeof find_knowledge_owner
  | typeof promote_to_policy;
const handlers: Record<string, ToolHandler> = {
  recall_exception_pattern, save_resolution, find_knowledge_owner, promote_to_policy,
};

// ---------- Tool schemas (OpenAI-compatible, works with Groq) ----------
const S = { type: "string" }, N = { type: "number" };
export const tools = [
  { type: "function", function: { name: "recall_exception_pattern",
    description: "Look up similar past invoice exceptions and the written policy route. ALWAYS call this first for any new exception.",
    parameters: { type: "object", properties: { vendor: S, exception_type: { type: "string", enum: ["amount_mismatch", "missing_po", "gst_mismatch", "duplicate_suspect"] },
      invoice_amount_inr: N, po_amount_inr: { type: ["number", "null"] }, invoice_no: S,
      synthesize: { type: "boolean", description: "Set true ONLY when an advisory narrative synthesis is wanted. The deterministic evidence never needs it." } },
      required: ["vendor", "exception_type", "invoice_amount_inr"] } } },
  { type: "function", function: { name: "save_resolution",
    description: "Store a resolved exception ONLY after the human confirms who approved it and how it was resolved.",
    parameters: { type: "object", properties: { vendor: S, invoice_no: S, invoice_amount_inr: N, po_amount_inr: { type: ["number", "null"] },
      exception_type: S, approver: S, workaround: S, outcome: { type: "string", enum: ["approved", "rejected"] },
      days_to_resolve: N, date: S, note: S },
      required: ["vendor", "invoice_no", "invoice_amount_inr", "exception_type", "approver", "workaround", "outcome", "days_to_resolve", "date", "note"] } } },
  { type: "function", function: { name: "find_knowledge_owner",
    description: "Who has handled this vendor and exception type before, and are they available?",
    parameters: { type: "object", properties: { vendor: S, exception_type: S }, required: ["vendor", "exception_type"] } } },
  { type: "function", function: { name: "promote_to_policy",
    description: "Check whether a repeated practice has enough evidence to propose as a written policy update.",
    parameters: { type: "object", properties: { vendor: S, exception_type: S }, required: ["vendor", "exception_type"] } } },
];

// ---------- System prompts ----------
export const SYSTEM_PROMPT_MEMORY_ON = `You are Echo, an accounts-payable exception assistant with persistent memory of how this company actually resolves invoice exceptions.

RULES
1. For every new invoice exception, call recall_exception_pattern FIRST. Never answer from assumption.
2. Use ONLY numbers returned by tools (counts, dates, confidence). Never invent cases, approvers, percentages or dates.
3. Always show: (a) what the written policy says, (b) what actually happened in similar past cases, (c) the gap between them, (d) the condition that seems to make approval work (top_condition), (e) the confidence exactly as the tool states it, including sample size.
4. If no_history is true: say plainly there is no precedent for this vendor or exception type, give only the written policy route, and recommend escalating per policy. Do not guess.
5. If similar cases are few (confidence low), say so and do not present the pattern as an established rule.
6. If the usual approver is on leave (see find_knowledge_owner status), say who else has handled similar cases.
7. You advise; a human decides. Never claim to have approved or paid anything.
8. Call save_resolution only after the user confirms the approver, the workaround and the outcome. Afterwards, report how the evidence changed (confidence_before vs confidence_after).
9. If a pattern is strong and repeated, you may call promote_to_policy and present the result as a DRAFT for human review.
10. If memory_source is "fallback", mention that live Hindsight memory was unavailable for this lookup.
11. pattern_insight exists only when a synthesis was explicitly requested. synthesis_source says what it is: "reflect" or "cached" is a narrative reflection from Hindsight, "deterministic" is Echo's computed summary. Present it as supporting context in its own words, clearly separate from the counted evidence, and never let it contradict the stats or be quoted as a specific case. Do not request a synthesis in the same tool call as a routine lookup.

STYLE: short and scannable. Lead with the recommendation, then the evidence. Amounts in INR.`;

export const SYSTEM_PROMPT_MEMORY_OFF = `You are a generic accounts-payable assistant with NO memory of past cases. You only know this written policy:
- Within 2% of PO: auto-approve.
- Mismatch above 2%: AP Manager review; above INR 50,000: CFO approval.
- No PO number: reject. Duplicate invoice number: reject.
Answer using the written policy only. Do not claim knowledge of past exceptions or unofficial practice.`;

// ---------- Agent loop (Groq, OpenAI-compatible endpoint) ----------
const MODEL = "openai/gpt-oss-120b";
interface GroqToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}
type GroqToolChoice = "auto" | { type: "function"; function: { name: string } };
interface GroqRequestBody {
  model: string; messages: GroqMessage[]; tools?: unknown[]; tool_choice?: GroqToolChoice; temperature?: number;
}
interface GroqResponse { choices: { message: GroqMessage }[] }
class GroqError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message);
  }
}
/** Retry-After is either delta-seconds or an HTTP-date. Returns ms, or null if unusable. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const raw = header.trim();
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return null;
}
async function groq(body: GroqRequestBody) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    let code: string | undefined;
    try { code = (JSON.parse(text) as { error?: { code?: string } })?.error?.code; } catch { /* not JSON: keep raw text */ }
    const status = r.status;
    throw new GroqError(text, code, status, status === 429 ? parseRetryAfterMs(r.headers.get("retry-after")) ?? undefined : undefined);
  }
  return (await r.json()) as GroqResponse;
}

// A rate-limited organisation is not a transport fault, so retrying it straight
// away only burns the same budget. Wait first, but never long: waits are capped
// and the attempt count is unchanged, so the request cannot hang.
const RATE_LIMIT_MAX_WAIT_MS = 5000;
const RATE_LIMIT_FALLBACK_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function rateLimitDelayMs(e: GroqError, attempt: number): number {
  const wanted = e.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS * 2 ** attempt;
  return Math.min(wanted, RATE_LIMIT_MAX_WAIT_MS);
}

// Memory ON must always start by looking in historical memory, so step 0 pins
// the first call to recall_exception_pattern instead of asking the model to
// decide. Verified supported by Groq for openai/gpt-oss-120b.
const FORCE_RECALL: GroqToolChoice = { type: "function", function: { name: "recall_exception_pattern" } };

async function groqStep(messages: GroqMessage[], forceRecall: boolean): Promise<GroqResponse> {
  const base = { model: MODEL, messages, tools, temperature: 0.2 };
  if (forceRecall) {
    try { return await groq({ ...base, tool_choice: FORCE_RECALL }); }
    catch (e) {
      // Groq answers a refused forced call with 400 tool_use_failed. That is the
      // model insisting on replying directly, not a transport fault, so retrying
      // would burn calls. Fall back to the automatic choice for this step.
      if (!(e instanceof GroqError) || e.code !== "tool_use_failed") throw e;
    }
  }
  return groq({ ...base, tool_choice: "auto" });
}

export interface EchoRequestMessage { role: "user" | "assistant"; content: string }

/** The part of a recall result the grounding validator is allowed to read. */
interface RecallResultLike {
  no_history: boolean;
  written_policy_route: string;
  stats: { similar_cases: number; approved: number; confidence: string };
  similar_cases: { id: string; outcome: "approved" | "rejected"; condition?: string | null }[];
  patterns?: { exception_pattern: string; support_count: number; approved_count: number; last_seen: string; supporting_case_ids: string[] }[];
}

/** Facts from the recall tool result, if the reply actually used one. */
function recallFacts(result: unknown): GroundingFact | null {
  if (!result || typeof result !== "object") return null;
  if ("error" in result) return null;
  const r = result as RecallResultLike;
  if (!Array.isArray(r.similar_cases)) return null;
  const patterns = (Array.isArray(r.patterns) ? r.patterns : []).map((p) => ({
    key: p.exception_pattern,
    support: p.support_count,
    approved: p.approved_count,
    lastSeen: p.last_seen,
    caseIds: p.supporting_case_ids,
  }));
  return factsFromRecall(r, true, patterns);
}

export async function runAgent(history: EchoRequestMessage[], memoryOn = true) {
  const trace: { tool: string; args: string; result: unknown }[] = [];
  const messages: GroqMessage[] = [{ role: "system", content: memoryOn ? SYSTEM_PROMPT_MEMORY_ON : SYSTEM_PROMPT_MEMORY_OFF }, ...history];
  let lastFacts: GroundingFact | null = null;

  if (!memoryOn) { // no tools: this is the "before" half of the ON/OFF split
    const res = await groq({ model: MODEL, messages, temperature: 0 });
    const g = verifyReplyText(res.choices[0].message.content ?? "", emptyFacts(false));
    return { reply: g.cleaned, trace, grounding: { verified: true, corrected: g.flagged.length } };
  }

  for (let step = 0; step < 5; step++) {
    let res: GroqResponse;
    for (let attempt = 0; attempt < 3; attempt++) { // Groq sometimes returns malformed tool calls: retry
      try { res = await groqStep(messages, step === 0); break; }
      catch (e) {
        if (attempt === 2) throw e;
        // 429 only: back off so a throttled organisation is not hit three times in a row.
        if (e instanceof GroqError && e.status === 429) await sleep(rateLimitDelayMs(e, attempt));
      }
    }
    const msg = res!.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      // The final reply is grounded against the last real recall before it goes
      // out: fabricated case ids are replaced, counts are left untouched.
      if (lastFacts) {
        const g = verifyReplyText(msg.content ?? "", lastFacts);
        return { reply: g.cleaned, trace, grounding: { verified: true, corrected: g.flagged.length } };
      }
      return { reply: msg.content, trace, grounding: { verified: false, corrected: 0 } };
    }
    for (const call of msg.tool_calls) {
      let result: unknown;
      try { result = await handlers[call.function.name](JSON.parse(call.function.arguments || "{}")); }
      catch (e: unknown) { result = { error: `Tool failed: ${e instanceof Error ? e.message : String(e)}. Tell the user and continue with the written policy only.` }; }
      if (call.function.name === "recall_exception_pattern") {
        const facts = recallFacts(result);
        if (facts) lastFacts = facts;
      }
      trace.push({ tool: call.function.name, args: call.function.arguments, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "I could not finish this lookup. Please retry.", trace, grounding: { verified: false, corrected: 0 } };
}
