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
}

/** Single source of truth for how a case is written to Hindsight.
 *
 *  The marker leads the text: Hindsight extracts facts with an LLM, and an
 *  identity at the very front is the most likely thing to survive into the
 *  fact it writes back. Structure and metadata still carry the id, so recall
 *  never depends on the marker alone. */
export function buildCaseMemory(c: RetainCaseInput) {
  return {
    content: `${caseMarker(c.id)} ${c.text}`,
    context: c.context,
    timestamp: c.timestamp,
    documentId: `${CASE_DOC_PREFIX}${c.id}`,
    updateMode: "replace" as const,
    tags: ["echo-ap", `exception:${c.exceptionType}`],
    metadata: {
      case_id: c.id,
      vendor: c.vendor,
      exception_type: c.exceptionType,
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
  const res = await getClient(cfg).retain(cfg.bankId, buildCaseMemory(input).content, {
    context: input.context,
    timestamp: input.timestamp,
    documentId: `${CASE_DOC_PREFIX}${input.id}`,
    updateMode: "replace",
    tags: ["echo-ap", `exception:${input.exceptionType}`],
    metadata: { case_id: input.id, vendor: input.vendor, exception_type: input.exceptionType, case_date: input.date },
  });
  return { ok: Boolean(res?.success), itemsCount: res?.items_count ?? 0, operationId: res?.operation_id ?? null };
}

export interface RecallOutcome {
  /** Case ids recovered from the recall results, de-duplicated, recall order kept. */
  caseIds: string[];
  /** The recalled text, for the "what Echo remembered" snippets. */
  snippets: string[];
}

export async function hindsightRecall(
  query: string,
  options: { maxTokens?: number; budget?: "low" | "mid" | "high" } = {},
  cfg: HindsightConfig = requireConfig(),
): Promise<RecallOutcome> {
  const res = await getClient(cfg).recall(cfg.bankId, query, {
    maxTokens: options.maxTokens ?? 1500,
    budget: options.budget ?? "low",
    includeEntities: false,
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

function requireConfig(): HindsightConfig {
  const cfg = hindsightConfig();
  if (!cfg) throw new Error("Hindsight is not configured (HINDSIGHT_BANK_ID / HINDSIGHT_BASE_URL missing)");
  return cfg;
}
