// Pattern Memory: the deterministic layer that turns real retained cases into
// institutional memory.
//
// This module owns exactly three things and deliberately owns nothing else:
//   1. the confidence label (one definition, shared with the evidence layer),
//   2. issue-family routing (which family a question is about),
//   3. the aggregate that becomes a Pattern Memory document.
//
// It must stay free of any dependency on lib/echo_agent_core. That file imports
// this one; if the import were mutual the module graph would be cyclic and the
// build would break. Anything that is really an *evidence* concern -- the amount
// ceiling, PO presence, duplicate and permission-route validation -- belongs in
// echo_agent_core, where those rules already live, and is not duplicated here.

import {
  ISSUE_FAMILIES,
  type IssueFamily,
  type PatternId,
  type RecalledCase,
  type RetainedPattern,
  slug,
  stablePatternKey,
} from "./hindsight";
import { confidenceLabel } from "./confidence";

export { confidenceLabel };

/* ------------------------------------------------------------ family routing */

/**
 * Routing keywords, fixed and reviewable. Routing is a lookup, not a judgement:
 * the same question always lands in the same family, and the same words never
 * mean two different families.
 */
const FAMILY_KEYWORDS: Record<IssueFamily, string[]> = {
  amount_mismatch: [
    "amount mismatch", "amount_mismatch", "amount differs", "amount differs by",
    "mismatch in amount", "difference between", "discrepancy", "invoice value",
    "total is", "total differs", "exceeded", "exceeds", "over invoice", "overbill",
    "over billed", "overbilled", "under the po", "variance",
  ],
  missing_po: [
    "missing po", "missing purchase order", "no po", "po not", "po is not",
    "po number", "po reference", "po not mentioned", "po not available",
    "without po", "purchase order not",
  ],
  gst_mismatch: [
    "gst", "cgst", "sgst", "igst", "vat", "tax rate", "tax mismatch", "tax amount",
    "gst rate", "gst amount", "tax percentage",
  ],
  duplicate_suspect: [
    "duplicate", "duplicate invoice", "same invoice", "already paid", "paid twice",
    "possible duplicate", "suspected duplicate",
  ],
  permission_approval: [
    "permission", "approval matrix", "approver", "not authorised", "not authorized",
    "access right", "role based", "role-based", "sign off", "sign-off", "signoff",
    "who can approve", "authorisation", "authorization",
  ],
};

export interface FamilyDetection {
  family: IssueFamily | "unknown";
  /** Which keyword decided it. Empty when nothing matched. */
  matchedBy: string;
  /** Every family that scored, highest first. Empty when nothing matched. */
  ranked: { family: IssueFamily; hits: number }[];
}

/**
 * Route a question to exactly one family, or to "unknown" when it is not about a
 * remembered issue at all. Scores are keyword counts; ties break on the fixed
 * ISSUE_FAMILIES order, so the result never depends on object key order or on
 * which pattern happened to be seen first.
 */
export function detectIssueFamilies(query: string): FamilyDetection {
  const haystack = ` ${slug(query).replace(/_/g, " ")} `;
  const ranked = ISSUE_FAMILIES.map((family) => ({
    family,
    hits: FAMILY_KEYWORDS[family].filter((k) => haystack.includes(` ${k} `) || haystack.includes(`${k} `) || haystack.includes(k)).length,
  }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || ISSUE_FAMILIES.indexOf(a.family) - ISSUE_FAMILIES.indexOf(b.family));

  if (ranked.length === 0) return { family: "unknown", matchedBy: "", ranked: [] };
  const winner = ranked[0];
  const matchedBy = FAMILY_KEYWORDS[winner.family].find((k) => haystack.includes(k)) ?? "";
  return { family: winner.family, matchedBy, ranked };
}

/* ------------------------------------------------------- pattern aggregation */

const tally = (values: (string | null | undefined)[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
};

/** Highest count first, ties broken alphabetically so the order never drifts. */
const rankedTally = (counts: Map<string, number>) =>
  [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/** Chronological, then by id, so the same cases always produce the same order. */
const chronological = (cases: RecalledCase[]) =>
  [...cases].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export const patternDocumentId = (family: string, exceptionPattern: string): string =>
  `echo-pattern-${stablePatternKey(family, exceptionPattern)}`;

/**
 * How a recalled case ranks against the invoice under investigation, in rupees.
 *
 * The gap is absolute, not a ratio, so "how far apart are these two invoices" is
 * the same number whether the pair is INR 10,000 or INR 10,00,000. A case whose
 * amount memory never recorded has no distance and is reported as such rather
 * than being treated as close.
 */
export function amountGap(caseAmount: number | null | undefined, currentAmount: number): number | null {
  if (caseAmount === null || caseAmount === undefined) return null;
  return Math.abs(caseAmount - currentAmount);
}

/* ------------------------------------------------------- comparability rule */

/**
 * Rupee thresholds the written policy records, per family. These are read off
 * the policy the corpus already states, not invented for this rule: the seeded
 * cases say "CFO approval required: mismatch on invoice above INR 50,000" and
 * "Retro PO is NOT allowed above INR 50,000", and both families resolve
 * differently on either side of that line.
 */
export const POLICY_AMOUNT_THRESHOLDS: Record<IssueFamily, number[]> = {
  amount_mismatch: [50000],
  missing_po: [50000],
  gst_mismatch: [],
  duplicate_suspect: [],
  permission_approval: [],
};

/** Which band of the policy thresholds an amount falls in. 0 is the lowest. */
export function amountBand(amount: number, family: IssueFamily): number {
  return POLICY_AMOUNT_THRESHOLDS[family].filter((t) => amount > t).length;
}

/**
 * A comparable case is one resolved under the same written policy as the invoice
 * being investigated. Two invoices on opposite sides of a recorded policy
 * threshold are not comparable whatever the recall ranking says: they were
 * decided by different rules, so neither is precedent for the other.
 *
 * A case that never recorded its amount cannot be placed in a band, so it is
 * treated as uncomparable rather than assumed close. That is deliberate: the
 * alternative would let an unquantified case stand in for a quantified one.
 */
export function sameAmountRegime(
  caseAmount: number | null | undefined,
  currentAmount: number,
  family: IssueFamily,
): boolean {
  if (POLICY_AMOUNT_THRESHOLDS[family].length === 0) return true;
  if (caseAmount === null || caseAmount === undefined) return false;
  return amountBand(caseAmount, family) === amountBand(currentAmount, family);
}

/**
 * Build the Pattern Memory record for one family+pattern from the real cases that
 * support it. Every number is counted here; none is carried over from prose.
 *
 * `cases` must be the cases actually retained in memory for that family+pattern
 * -- not the subset that happened to be recalled for one question. Passing a
 * subset would make support_count describe the question rather than the memory.
 */
export function aggregatePattern(params: {
  patternId: PatternId;
  family: IssueFamily;
  exceptionPattern: string;
  cases: RecalledCase[];
}): RetainedPattern {
  const { patternId, family, exceptionPattern } = params;
  const cases = chronological(params.cases);
  const support_count = cases.length;
  const approved_count = cases.filter((c) => c.outcome === "approved").length;
  const rejected_count = cases.filter((c) => c.outcome === "rejected").length;

  return {
    pattern_id: patternId,
    document_id: patternDocumentId(family, exceptionPattern),
    family,
    exception_pattern: exceptionPattern,
    support_count,
    approved_count,
    rejected_count,
    // null, not 0, when nothing supports the pattern: "no record" is not "never approved".
    approval_rate: support_count === 0 ? null : Math.round((approved_count / support_count) * 1000) / 10,
    case_ids: cases.map((c) => c.id),
    approvers: rankedTally(tally(cases.map((c) => c.approver))),
    conditions: rankedTally(tally(cases.map((c) => c.condition))).map((c) => c.name),
    typical_resolution: rankedTally(tally(cases.map((c) => c.workaround)))[0]?.name ?? "",
    policy_route: rankedTally(tally(cases.map((c) => c.policy_route)))[0]?.name ?? null,
    last_seen: cases.reduce((max, c) => (c.date > max ? c.date : max), ""),
    confidence: confidenceLabel(support_count),
  };
}

/**
 * Choose the patterns worth showing. Ranking is by real support, then by how
 * often support ended in approval, then by document id so the order is stable
 * when two patterns are otherwise equal.
 */
export function selectPatterns(patterns: RetainedPattern[], max = 3): RetainedPattern[] {
  return [...patterns]
    .sort(
      (a, b) =>
        b.support_count - a.support_count ||
        (b.approval_rate ?? -1) - (a.approval_rate ?? -1) ||
        a.document_id.localeCompare(b.document_id),
    )
    .slice(0, max)
    .sort((a, b) => ISSUE_FAMILIES.indexOf(a.family) - ISSUE_FAMILIES.indexOf(b.family) || a.document_id.localeCompare(b.document_id));
}

/**
 * The cases that actually stand behind the patterns being shown, so the counts on
 * a pattern can be checked against the evidence on screen. Returned ids are the
 * union across the shown patterns, so no case is counted twice.
 */
export function patternCaseIds(patterns: RetainedPattern[]): string[] {
  const ids: string[] = [];
  for (const p of patterns) for (const id of p.case_ids) if (!ids.includes(id)) ids.push(id);
  return ids;
}
