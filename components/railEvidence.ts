// Pure selectors for the Institutional Memory rail.
//
// These live apart from the component because they are the part that was wrong
// before, and a React test runner is not in this project's toolchain. Keeping
// them free of JSX means scripts/rail-evidence-tests.ts can exercise them
// directly against the real recall payloads.
//
// Nothing here invents, infers or rounds. Every number returned is a number the
// backend produced, and every label is a string the backend recorded.

import type { PatternView, RecallResult } from "./echoTypes";

/** How many observed patterns the rail will show. */
const MAX_PATTERNS = 3;

/**
 * Real pattern documents that are genuinely supported by the evidence on
 * screen, ranked by how much of that evidence they account for.
 *
 * The join is on CASE ID, never on text.
 *
 * `stats.top_condition.label` and `PatternView.conditions[]` come from
 * unrelated vocabularies: the first is a canonical label regex-matched against
 * each case's `workaround` (lib/echo_agent_core.ts computeStats), the second is
 * a tally of each case's literal `condition` field (lib/pattern_memory.ts
 * aggregatePattern). For the cases behind the fuel-surcharge precedent,
 * `condition` is null and the evidence lives only in the `workaround` prose, so
 * `conditions` comes back empty while `top_condition` is populated — and an
 * `conditions.includes(top_condition.label)` test is therefore always false.
 *
 * `supporting_cases_on_screen` is the intersection of a pattern's retained case
 * ids with the ids actually shown, so both sides speak the same vocabulary and
 * a pattern can be counted only against evidence the user can see.
 *
 * A pattern with no recorded name — blank, or the literal "unspecified" that
 * aggregatePattern assigns when the cases carry no `exception_pattern` — is not
 * a usable pattern. It is excluded here and the rail falls back to a derived
 * grouping, so the rail never prints the word "unspecified" as if it were a
 * finding.
 */
export function observedPatterns(recall: RecallResult | undefined): PatternView[] {
  if (!recall || recall.no_history) return [];
  return recall.patterns
    .filter((p) => {
      const name = p.exception_pattern.trim();
      return (
        p.supporting_cases_on_screen.length > 0 &&
        name !== "" &&
        name.toLowerCase() !== "unspecified"
      );
    })
    .sort(
      (a, b) =>
        b.supporting_cases_on_screen.length - a.supporting_cases_on_screen.length ||
        b.support_count - a.support_count ||
        a.pattern_id.localeCompare(b.pattern_id),
    )
    .slice(0, MAX_PATTERNS);
}

/** One condition that the comparable decisions share, and how many carried it. */
export type ConditionCount = { label: string; count: number };

/**
 * Every condition genuinely present across the comparable decisions, ranked by
 * real support. Two sources, and only two, because only two carry counts:
 *
 *   stats.top_condition  the canonical label and the count the backend recorded
 *                        for it, matched deterministically from the workarounds
 *   similar_cases[].condition
 *                        a condition literally recorded on one case — one case,
 *                        one count
 *
 * `PatternView.conditions[]` is deliberately NOT counted here. It is a ranked
 * list of distinct labels with no per-label support figure, so attaching a
 * count to one of its entries would state a number the backend never produced.
 */
export function observedConditions(recall: RecallResult | undefined): ConditionCount[] {
  if (!recall || recall.no_history) return [];
  const tally = new Map<string, number>();
  const bump = (label: string | null | undefined, n: number) => {
    const key = (label ?? "").trim();
    if (!key) return;
    tally.set(key, (tally.get(key) ?? 0) + n);
  };
  const top = recall.stats.top_condition;
  if (top) bump(top.label, top.count);
  for (const c of recall.similar_cases) bump(c.condition, 1);
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The condition the rail marks as the primary one, if the backend named one. */
export function primaryCondition(recall: RecallResult | undefined): string | null {
  return recall?.stats.top_condition?.label ?? null;
}
