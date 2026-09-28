// echo_agent_core.ts
// Echo: AP exception memory agent. Drop into your Next.js project (e.g. lib/echo.ts)
// and call runAgent() from an API route. Needs: tsconfig "resolveJsonModule": true,
// echo_seed_data.json next to this file, env GROQ_API_KEY + HINDSIGHT_* (see lib/hindsight.ts).
//
// Memory: Hindsight Cloud (bank echo-ap-memory) does the retrieval. Recall returns the
// cases it considers relevant; the code then re-checks them against the deterministic
// rule and computes every number itself, so the LLM never invents figures. Reflect only
// adds a clearly labelled advisory pattern. If Hindsight is unreachable the agent falls
// back to local search and reports memory_source = "fallback".

import seed from "./echo_seed_data.json";
import { hindsightConfig, hindsightRecall, hindsightReflect, hindsightRetain } from "./hindsight";

// ---------- Types ----------
export type Outcome = "approved" | "rejected";
export interface Case {
  id: string; date: string; vendor: string; invoice_no: string;
  invoice_amount_inr: number; po_amount_inr: number | null; diff_pct: number | null;
  exception_type: string; approver: string; workaround: string;
  outcome: Outcome; days_to_resolve: number; note: string;
  /** Optional institutional detail, present on the generated history (C13+). */
  exception_pattern?: string; policy_route?: string; condition?: string; decision?: string;
}
export interface Query {
  vendor: string; exception_type: string; invoice_amount_inr: number; po_amount_inr: number | null;
}
interface Person { name: string; role: string; status: string }
interface SeedData { past_cases: Case[]; people: Person[] }
const seedData = seed as unknown as SeedData;

// ---------- Local structured store (source of truth for numbers) ----------
// Hindsight finds relevant memories; this store lets CODE compute confidence, so the LLM never invents figures.
// On serverless hosts this array resets between cold starts: re-seed from JSON (default) and retain to Hindsight.
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
function sameExceptionFamily(c: Case, q: Query): boolean {
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

export function computeStats(similar: Case[]) {
  const n = similar.length;
  const approved = similar.filter((c) => c.outcome === "approved").length;
  const approvers: Record<string, number> = {};
  similar.forEach((c) => (approvers[c.approver] = (approvers[c.approver] || 0) + 1));
  const conditions = CONDITIONS.map(([label, re]) => ({
    label, count: similar.filter((c) => re.test(c.workaround)).length,
  })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const last = similar.map((c) => c.date).sort().pop() ?? null;
  const confidence = n === 0 ? "none" : n < 3 ? "low (very small sample)" : n < 6 ? "medium (small sample)" : "higher";
  return { similar_cases: n, approved, summary: n ? `${approved} of ${n} approved` : "no similar cases",
           approvers, top_condition: conditions[0] ?? null, last_case_date: last, confidence };
}

// ---------- Memory adapter (Hindsight Cloud, with honest fallback) ----------
const caseText = (c: Case) =>
  `${c.date} ${c.vendor} ${c.invoice_no} (${c.exception_type}): handled by ${c.approver}. ${c.workaround}. Outcome: ${c.outcome} in ${c.days_to_resolve} day(s). ${c.note}` +
  (c.exception_pattern ? ` Pattern: ${c.exception_pattern}.` : "") +
  (c.condition ? ` Condition relied on: ${c.condition}.` : "") +
  (c.decision ? ` Decision: ${c.decision}.` : "") +
  (c.policy_route ? ` Written policy at the time: ${c.policy_route}` : "");

const recallQuery = (q: Query) =>
  `${q.vendor} ${q.exception_type} exception, invoice INR ${q.invoice_amount_inr}, PO ${q.po_amount_inr ?? "none"}`;

interface MemoryRecall { cases: Case[]; snippets: string[]; source: "hindsight" | "fallback" }

/**
 * Hindsight decides WHICH historical cases are relevant. This function then
 * decides what is allowed to count as evidence: the ids Hindsight returned are
 * looked up in the local store, and a record survives only if it is the same
 * vendor, is not the invoice under investigation, and belongs to the same
 * broad exception family. A historical case that records a more specific
 * pattern ("fuel surcharge", "split shipment", ...) is still in the family and
 * is kept. Every number is then computed by computeStats() from those records
 * alone, so Groq never contributes a figure.
 *
 * The local matcher is deliberately NOT consulted on this path. It runs only
 * when Hindsight fails (see the catch below), and its results are never merged
 * with Hindsight's, so `memory_source` always describes how evidence was found.
 */
async function safeRecall(q: Query, currentInvoiceNo?: string): Promise<MemoryRecall> {
  try {
    const recalled = await hindsightRecall(recallQuery(q));
    if (recalled.caseIds.length === 0) throw new Error("recall returned no recognisable Echo cases");
    const byId = new Map(store.map((c) => [c.id, c]));
    const d = diffPct(q.invoice_amount_inr, q.po_amount_inr);
    const ids = new Set(
      recalled.caseIds
        .map((id) => byId.get(id))
        .filter(
          (c): c is Case =>
            c !== undefined &&
            // vendor matching stays strict
            c.vendor === q.vendor &&
            // the invoice under investigation can never be its own precedent
            c.invoice_no !== currentInvoiceNo &&
            // same broad exception family; a narrower historical pattern is fine
            sameExceptionFamily(c, q) &&
            // amount similarity, only when the request actually carries amounts
            (d === null || c.diff_pct === null || Math.abs(c.diff_pct - d) <= DIFF_WINDOW),
        )
        .map((c) => c.id),
    );
    // store order keeps the evidence list and the stats stable between runs
    return { cases: store.filter((c) => ids.has(c.id)), snippets: recalled.snippets, source: "hindsight" };
  } catch (e) {
    console.warn("[hindsight] recall failed, using local fallback:", e instanceof Error ? e.message : String(e));
    const cases = findSimilar(q);
    return { cases, snippets: cases.map(caseText), source: "fallback" };
  }
}

/** Advisory only. Never replaces the deterministic evidence above it. */
async function safeReflect(q: Query): Promise<string | null> {
  if (!hindsightConfig()) return null;
  try {
    return await hindsightReflect(
      `What pattern explains how ${q.vendor} ${q.exception_type} exceptions were resolved before?`,
      "AP exception review",
    );
  } catch (e) {
    console.warn("[hindsight] reflect failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ---------- Tool handlers ----------
export async function recall_exception_pattern(a: Query & { invoice_no?: string }) {
  const q: Query = { vendor: a.vendor, exception_type: a.exception_type,
    invoice_amount_inr: a.invoice_amount_inr, po_amount_inr: a.po_amount_inr ?? null };
  const { cases, snippets, source } = await safeRecall(q, a.invoice_no);
  const pattern = cases.length > 0 && source === "hindsight" ? await safeReflect(q) : null;
  return {
    memory_source: source,
    no_history: cases.length === 0,
    written_policy_route: policyRoute(q),
    stats: computeStats(cases),
    similar_cases: cases.map((c) => ({ id: c.id, date: c.date, invoice_no: c.invoice_no, diff_pct: c.diff_pct,
      approver: c.approver, workaround: c.workaround, outcome: c.outcome, days: c.days_to_resolve })),
    memory_snippets: snippets.slice(0, 5),
    pattern_insight: pattern,
  };
}

export async function save_resolution(a: Omit<Case, "id" | "diff_pct">) {
  const c: Case = { ...a, id: `C${String(store.length + 1).padStart(2, "0")}`,
    diff_pct: diffPct(a.invoice_amount_inr, a.po_amount_inr) };
  const before = computeStats(findSimilar(a));
  store = [...store, c];
  const after = computeStats(findSimilar(a));
  let source: "hindsight" | "fallback" = "hindsight";
  let retained = false;
  try {
    await hindsightRetain({ id: c.id, text: caseText(c), context: "AP exception resolution",
      timestamp: new Date().toISOString(), vendor: c.vendor, exceptionType: c.exception_type, date: c.date });
    retained = true;
  } catch (e) {
    source = "fallback";
    console.warn("[hindsight] retain failed:", e instanceof Error ? e.message : String(e));
  }
  return { saved_case_id: c.id, memory_source: source, retained, confidence_before: before.summary, confidence_after: after.summary,
           top_condition_after: after.top_condition };
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
      invoice_amount_inr: N, po_amount_inr: { type: ["number", "null"] }, invoice_no: S },
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
11. pattern_insight is Hindsight Reflect: a narrative pattern drawn across many memories. Present it as supporting context in its own words, clearly separate from the counted evidence, and never let it contradict the stats or be quoted as a specific case.

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
export async function runAgent(history: EchoRequestMessage[], memoryOn = true) {
  const trace: { tool: string; args: string; result: unknown }[] = [];
  const messages: GroqMessage[] = [{ role: "system", content: memoryOn ? SYSTEM_PROMPT_MEMORY_ON : SYSTEM_PROMPT_MEMORY_OFF }, ...history];

  if (!memoryOn) { // no tools: this is the "before" half of the ON/OFF split
    const res = await groq({ model: MODEL, messages, temperature: 0 });
    return { reply: res.choices[0].message.content, trace };
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
    if (!msg.tool_calls?.length) return { reply: msg.content, trace };
    for (const call of msg.tool_calls) {
      let result: unknown;
      try { result = await handlers[call.function.name](JSON.parse(call.function.arguments || "{}")); }
      catch (e: unknown) { result = { error: `Tool failed: ${e instanceof Error ? e.message : String(e)}. Tell the user and continue with the written policy only.` }; }
      trace.push({ tool: call.function.name, args: call.function.arguments, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "I could not finish this lookup. Please retry.", trace };
}
