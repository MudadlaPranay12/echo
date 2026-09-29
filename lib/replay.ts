// lib/replay.ts
// Echo Replay: a deterministic comparison of the same invoice question under the
// condition that decided its precedents versus any other recorded condition.
//
// Replay is comparison, never prediction. It splits real, already-validated cases
// into two groups — those resolved under the observed condition, and those under
// any other condition — and reports the recorded outcomes in each. Nothing here
// forecasts what will happen; the explanation says so. When the evidence is empty
// both sides state plainly that no precedent exists ("NO PRECEDENT"), which is an
// answer, not a hole.
//
// Pure by design: the client panel computes it from the recall already returned,
// so showing a replay costs no extra model turn and no extra provider call.

import { confidenceLabel } from "./confidence";

export type Outcome = "approved" | "rejected";

export interface ReplayCaseLike {
  id: string;
  outcome: Outcome;
  /** The condition the case was resolved under, as recalled. May be absent. */
  condition?: string | null;
}

export interface ReplaySide {
  label: string;
  count: number;
  approved: number;
  rejected: number;
  /** Rounded like Pattern Memory, and null when the side is empty. */
  approvalRate: number | null;
  confidence: string;
  caseIds: string[];
}

export interface Replay {
  /** False when the evidence is empty; both sides then state no precedent. */
  available: boolean;
  /** The side under the condition that decided the precedents most often. */
  current: ReplaySide;
  /** The side under every other recorded condition. */
  alternative: ReplaySide;
  /** Fixed, comparison-only copy built from real counts. */
  explanation: string;
}

const norm = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

const sideOf = (label: string, cases: ReplayCaseLike[]): ReplaySide => {
  const count = cases.length;
  const approved = cases.filter((c) => c.outcome === "approved").length;
  return {
    label,
    count,
    approved,
    rejected: count - approved,
    approvalRate: count === 0 ? null : Math.round((approved / count) * 1000) / 10,
    confidence: confidenceLabel(count),
    caseIds: cases.map((c) => c.id),
  };
};

/**
 * Split cases by condition. The most common recorded condition counts as the
 * observed one; every other recorded condition is the alternative. Cases with no
 * recorded condition are compared under the alternative label, because a case
 * without a condition is explicitly not one decided under the observed one.
 */
export function computeReplay(cases: ReplayCaseLike[]): Replay {
  if (cases.length === 0) {
    return {
      available: false,
      current: sideOf("Observed condition", []),
      alternative: sideOf("Any other condition", []),
      explanation:
        "No comparable historical precedent was found, so a replay cannot be produced. Written policy remains the available guidance.",
    };
  }

  // Separate cases with recorded conditions from those without.
  // Cases without a recorded condition are never the observed condition;
  // they always belong to the alternative side.
  const casesWithCondition: ReplayCaseLike[] = [];
  const casesWithoutCondition: ReplayCaseLike[] = [];
  for (const c of cases) {
    const normalized = norm(c.condition);
    if (normalized === "") {
      casesWithoutCondition.push(c);
    } else {
      casesWithCondition.push(c);
    }
  }

  // If no cases have a recorded condition, there is no observed condition.
  if (casesWithCondition.length === 0) {
    const altSide = sideOf("Any other recorded condition", casesWithoutCondition);
    return {
      available: true,
      current: sideOf("Observed condition", []),
      alternative: altSide,
      explanation:
        `No recorded conditions in the evidence. ${altSide.approved} of ${altSide.count} comparable decisions were approved under any condition. A replay compares historical evidence — it does not predict how the current invoice will be decided.`,
    };
  }

  // Tally only cases with recorded conditions to find the observed condition.
  const tally = new Map<string, ReplayCaseLike[]>();
  for (const c of casesWithCondition) {
    const key = norm(c.condition);
    const bucket = tally.get(key) ?? [];
    bucket.push(c);
    tally.set(key, bucket);
  }

  const ranked = [...tally.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const [bestKey, bestCases] = ranked[0];
  const observedLabel = bestCases[0]?.condition?.trim() ?? "Observed condition";

  const current: ReplayCaseLike[] = [];
  const alternative: ReplayCaseLike[] = [...casesWithoutCondition]; // Cases without condition always go to alternative
  for (const [key, bucket] of ranked) {
    if (key === bestKey) current.push(...bucket);
    else alternative.push(...bucket);
  }

  const currentSide = sideOf(observedLabel, current);
  const altSide = sideOf("Any other recorded condition", alternative);
  const same =
    currentSide.approved + altSide.approved === cases.filter((c) => c.outcome === "approved").length &&
    currentSide.count + altSide.count === cases.length;

  return {
    available: true,
    current: currentSide,
    alternative: altSide,
    explanation: same
      ? `${currentSide.approved} of ${currentSide.count} comparable decisions were approved under "${observedLabel}", versus ${altSide.approved} of ${altSide.count} under any other recorded condition. Historical evidence under this condition is compared to evidence under alternative conditions — this is a historical comparison.`
      : "A replay compares recorded outcomes only — it does not predict how the current invoice will be decided.",
  };
}