// lib/grounding.ts
// The grounding validator: the deterministic referee between what the model says
// and what the evidence actually holds.
//
// Model prose is not evidence. Every number, case id, count and confidence that
// reaches the user must be checkable against the state the deterministic layer
// computed. This module runs AFTER the final model reply is produced: it verifies
// structured claims against a fact base built only from tool results, and it scrubs
// fabricated case ids out of free-text replies. Nothing here invents facts, calls a
// provider, or leaks into the UI (the UI only ever sees verified content).
//
// The fact base never contains the current invoice: it is not a case id, and a
// lookup of it must fail, so the validator can never certify the invoice being
// investigated as its own precedent.

export type Outcome = "approved" | "rejected";

export interface GroundingFact {
  /** Whether institutional memory was searched for this answer. */
  memoryOn: boolean;
  /** Recalled memory was searched and matched nothing. */
  noHistory: boolean;
  /** The written policy route for the current invoice, verbatim from the rule. */
  policyRoute: string;
  /**
   * Case ids that are real on this record: the comparable evidence plus the ids
   * the shown patterns aggregate over. An id outside this set is fabricated —
   * there is no memory behind it on this run at all.
   */
  caseIds: ReadonlySet<string>;
  /** Outcome recorded for each on-screen comparable case. */
  outcomeById: ReadonlyMap<string, Outcome>;
  /** The resolution condition recorded for each on-screen case, when any. */
  conditionById: ReadonlyMap<string, string>;
  /** Counts computed from the on-screen cases alone. */
  similarCount: number;
  approvedCount: number;
  /** Exactly what computeStats/pattern memory report (the shared label). */
  confidence: string;
  /** Patterns shown on screen: key -> deterministic support facts. */
  patternSupport: ReadonlyMap<string, { support: number; approved: number; lastSeen: string; caseIds: string[] }>;
}

export interface PatternFactInput {
  key: string;
  support: number;
  approved: number;
  lastSeen: string;
  caseIds: string[];
}

/**
 * Facts from the shapes recall_exception_pattern returns. Deterministic only:
 * every fact is copied out of what the tool computed, never out of model prose.
 */
export function factsFromRecall(
  r: {
    no_history: boolean;
    written_policy_route: string;
    stats: { similar_cases: number; approved: number; confidence: string };
    similar_cases: { id: string; outcome: Outcome; condition?: string | null }[];
  },
  memoryOn: boolean,
  patterns: PatternFactInput[] = [],
): GroundingFact {
  const caseIds = new Set<string>();
  const outcomeById = new Map<string, Outcome>();
  const conditionById = new Map<string, string>();
  for (const c of r.similar_cases) {
    caseIds.add(c.id);
    outcomeById.set(c.id, c.outcome);
    if (c.condition) conditionById.set(c.id, c.condition);
  }
  const patternSupport = new Map<string, { support: number; approved: number; lastSeen: string; caseIds: string[] }>();
  // Pattern ids are real retained cases too. They are not on the comparable-evidence
  // list (a pattern is advisory and must never be counted as a precedent), so they
  // are not claimed as outcomes or conditions, but a reply that cites them is
  // citing genuine memory, not fabrication.
  for (const p of patterns) {
    patternSupport.set(p.key, { support: p.support, approved: p.approved, lastSeen: p.lastSeen, caseIds: p.caseIds });
    for (const id of p.caseIds) caseIds.add(id);
  }
  return {
    memoryOn,
    noHistory: r.no_history,
    policyRoute: r.written_policy_route,
    caseIds,
    outcomeById,
    conditionById,
    similarCount: r.stats.similar_cases,
    approvedCount: r.stats.approved,
    confidence: r.stats.confidence,
    patternSupport,
  };
}

/** Empty facts: memory off, or no recall happened. No case id may survive it. */
export function emptyFacts(memoryOn: boolean): GroundingFact {
  return {
    memoryOn,
    noHistory: true,
    policyRoute: "",
    caseIds: new Set(),
    outcomeById: new Map(),
    conditionById: new Map(),
    similarCount: 0,
    approvedCount: 0,
    confidence: "none",
    patternSupport: new Map(),
  };
}

export type Verdict = "supported" | "unsupported" | "unverifiable";

export interface ClaimCheck {
  verdict: Verdict;
  reason: string;
}

const CASE_ID = /\bC\d{2}\b/;

export type Claim =
  | { kind: "case_exists"; id: string }
  | { kind: "case_outcome"; id: string; outcome: Outcome }
  | { kind: "case_condition"; id: string; label: string }
  | { kind: "count_approved"; n: number }
  | { kind: "count_total"; n: number }
  | { kind: "confidence"; label: string }
  | { kind: "no_history" }
  | { kind: "memory_off"; claimsMemory: boolean }
  | { kind: "policy_route"; route: string }
  | { kind: "pattern_support"; key: string; support: number; approved: number };

const ok = (reason: string): ClaimCheck => ({ verdict: "supported", reason });
const no = (reason: string): ClaimCheck => ({ verdict: "unsupported", reason });
const unknown = (reason: string): ClaimCheck => ({ verdict: "unverifiable", reason });

/**
 * Verify one structured claim against the deterministic fact base.
 *
 * Rules are strict on purpose: an id the memory never showed is not "unknown",
 * it is unsupported — a fabricated id is the one thing this validator exists to
 * stop. A claim that memory holds nothing while evidence exists is likewise an
 * error, never a shrug.
 */
export function verifyClaim(claim: Claim, facts: GroundingFact): ClaimCheck {
  switch (claim.kind) {
    case "case_exists":
      if (!CASE_ID.test(claim.id)) return no(`"${claim.id}" is not a case id.`);
      if (facts.noHistory) return no("no history was recalled, so no case can exist.");
      if (!facts.caseIds.has(claim.id)) return no(`case ${claim.id} does not appear anywhere on the evidence record.`);
      return ok(`case ${claim.id} is on the evidence record.`);

    case "case_outcome": {
      if (facts.noHistory) return no("no history was recalled, so no outcome can be stated.");
      const actual = facts.outcomeById.get(claim.id);
      if (actual === undefined) return no(`case ${claim.id} is not a comparable case, so its outcome cannot be verified.`);
      if (actual !== claim.outcome) return no(`case ${claim.id} was recorded ${actual}, not ${claim.outcome}.`);
      return ok(`case ${claim.id} outcome matches the record.`);
    }

    case "case_condition": {
      if (facts.noHistory) return no("no history was recalled, so no condition can be stated.");
      const actual = facts.conditionById.get(claim.id);
      if (!actual) return unknown(`case ${claim.id} recorded no condition to compare against.`);
      const a = actual.trim().toLowerCase();
      const b = claim.label.trim().toLowerCase();
      if (a !== b && !a.includes(b) && !b.includes(a)) return no(`the recorded condition for case ${claim.id} is not "${claim.label}".`);
      return ok(`case ${claim.id} was resolved under that condition.`);
    }

    case "count_approved":
      return claim.n === facts.approvedCount
        ? ok(`${claim.n} approved matches the evidence.`)
        : no(`${claim.n} approved does not match the ${facts.approvedCount} recorded.`);

    case "count_total":
      return claim.n === facts.similarCount
        ? ok(`${claim.n} comparable cases match the evidence.`)
        : no(`${claim.n} comparable cases does not match the ${facts.similarCount} recorded.`);

    case "confidence":
      return claim.label === facts.confidence
        ? ok("confidence matches the shared deterministic label.")
        : no(`confidence was stated as "${claim.label}" but the record says "${facts.confidence}".`);

    case "no_history":
      if (facts.similarCount > 0)
        return no("no-history was claimed, but the evidence contains real cases.");
      return facts.noHistory
        ? ok("the record confirms no history.")
        : no("the record was unable to confirm no history.");

    case "memory_off":
      return claim.claimsMemory === !facts.memoryOn
        ? ok(claim.claimsMemory ? "memory was indeed not searched." : "the memory state matches the request.")
        : no(claim.claimsMemory ? "memory was searched, so a memory-off claim is false." : "memory was not searched, so claiming it was is false.");

    case "policy_route":
      return facts.policyRoute && claim.route.trim().toLowerCase() === facts.policyRoute.trim().toLowerCase()
        ? ok("the policy route matches the written rule.")
        : unknown("the written policy route could not be matched to a recorded one.");

    case "pattern_support": {
      const p = facts.patternSupport.get(claim.key);
      if (!p) return unknown("that pattern is not shown on this evidence record.");
      if (p.support !== claim.support) return no(`pattern ${claim.key} has support ${p.support}, not ${claim.support}.`);
      if (p.approved !== claim.approved) return no(`pattern ${claim.key} records ${p.approved} approved, not ${claim.approved}.`);
      return ok(`pattern ${claim.key} support matches the aggregate.`);
    }

    default:
      return unknown("that kind of claim is not verifiable.");
  }
}

/* --------------------------------------------------------- reply scrubbing */

export interface GroundedReply {
  cleaned: string;
  /** Human-readable reasons for each correction, for the audit trace only. */
  flagged: string[];
}

/**
 * Scrub a free-text reply of case ids that are not on the evidence record.
 *
 * A model reply that cites C99 when this run's memory holds no such case is a
 * fabricated fact and must not reach the user as if it were evidence. The token
 * is replaced with neutral copy so the surrounding sentence still reads, and the
 * correction is reported so the run can be audited without surfacing validator
 * internals in the UI.
 *
 * With memory off there is no evidence record at all, so every case id is
 * removed: a memory-off answer can only speak in policy terms.
 */
export function verifyReplyText(text: string, facts: GroundingFact): GroundedReply {
  const flagged: string[] = [];
  const replacement = facts.memoryOn ? "a recalled case" : "a past case";
  const cleaned = text.replace(/C\d{2}\b/g, (id) => {
    if (facts.caseIds.has(id)) return id;
    flagged.push(`replaced fabricated id ${id} with "${replacement}"`);
    return replacement;
  });
  return { cleaned, flagged };
}