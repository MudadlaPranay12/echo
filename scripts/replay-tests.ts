// Deterministic tests for Echo Replay: no network, no LLM.
// Exercises computeReplay with various case/condition configurations.

import { computeReplay, type ReplayCaseLike } from "../lib/replay";
import { confidenceLabel } from "../lib/confidence";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = eq(got, want);
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} -> ${JSON.stringify(got)}`);
};

const section = (s: string) => console.log(`\n${s}`);

function makeCase(id: string, outcome: "approved" | "rejected", condition?: string | null): ReplayCaseLike {
  return { id, outcome, condition };
}

section("computeReplay - empty evidence");
{
  const r = computeReplay([]);
  t("available = false", r.available, false);
  t("current label = Observed condition", r.current.label, "Observed condition");
  t("current count = 0", r.current.count, 0);
  t("alternative label = Any other condition", r.alternative.label, "Any other condition");
  t("alternative count = 0", r.alternative.count, 0);
  t("explanation mentions no precedent", r.explanation.includes("No comparable historical precedent"), true);
  t("explanation mentions policy", r.explanation.includes("Written policy remains"), true);
}

section("computeReplay - single case with condition");
{
  const r = computeReplay([makeCase("C01", "approved", "annexure attached")]);
  t("available = true", r.available, true);
  t("current label = annexure attached", r.current.label, "annexure attached");
  t("current count = 1", r.current.count, 1);
  t("current approved = 1", r.current.approved, 1);
  t("alternative count = 0", r.alternative.count, 0);
  t("alternative label = Any other recorded condition", r.alternative.label, "Any other recorded condition");
  t("explanation mentions comparison", r.explanation.includes("versus"), true);
}

section("computeReplay - multiple cases, same condition");
{
  const r = computeReplay([
    makeCase("C01", "approved", "annexure attached"),
    makeCase("C02", "approved", "annexure attached"),
    makeCase("C03", "rejected", "annexure attached"),
  ]);
  t("available = true", r.available, true);
  t("current count = 3", r.current.count, 3);
  t("current approved = 2", r.current.approved, 2);
  t("current approvalRate = 66.7", r.current.approvalRate, 66.7);
  t("alternative count = 0", r.alternative.count, 0);
  t("confidence = medium (small sample)", r.current.confidence, "medium (small sample)");
}

section("computeReplay - two conditions, observed is most common");
{
  const r = computeReplay([
    makeCase("C01", "approved", "annexure attached"),
    makeCase("C02", "approved", "annexure attached"),
    makeCase("C03", "approved", "annexure attached"),
    makeCase("C04", "rejected", "credit note issued"),
    makeCase("C05", "rejected", "credit note issued"),
  ]);
  t("available = true", r.available, true);
  t("current label = annexure attached", r.current.label, "annexure attached");
  t("current count = 3", r.current.count, 3);
  t("current approved = 3", r.current.approved, 3);
  t("alternative label = Any other recorded condition", r.alternative.label, "Any other recorded condition");
  t("alternative count = 2", r.alternative.count, 2);
  t("alternative approved = 0", r.alternative.approved, 0);
  t("explanation mentions annexure attached", r.explanation.includes("annexure attached"), true);
  t("explanation mentions alternative condition (lowercase)", r.explanation.includes("any other recorded condition"), true);
}

section("computeReplay - cases with no condition always go to alternative");
{
  // Cases without a recorded condition (null/empty) never become the observed condition.
  // They are always placed in the alternative side.
  const r = computeReplay([
    makeCase("C01", "approved", "annexure attached"),
    makeCase("C02", "approved", "annexure attached"),
    makeCase("C03", "rejected", null),
    makeCase("C04", "approved", ""),
  ]);
  t("available = true", r.available, true);
  t("current label = annexure attached (only condition with cases)", r.current.label, "annexure attached");
  t("current count = 2 (only cases with condition)", r.current.count, 2);
  t("alternative label = Any other recorded condition", r.alternative.label, "Any other recorded condition");
  t("alternative count = 2 (cases without condition)", r.alternative.count, 2);
  t("alternative includes null condition", r.alternative.caseIds.includes("C03"), true);
  t("alternative includes empty condition", r.alternative.caseIds.includes("C04"), true);
  t("current does not include null condition", r.current.caseIds.includes("C03"), false);
  t("current does not include empty condition", r.current.caseIds.includes("C04"), false);
}

section("computeReplay - tie in condition frequency broken alphabetically");
{
  const r = computeReplay([
    makeCase("C01", "approved", "alpha condition"),
    makeCase("C02", "rejected", "beta condition"),
  ]);
  // Both conditions have count 1, tie broken by localeCompare -> "alpha condition" wins
  t("available = true", r.available, true);
  t("current label = alpha condition", r.current.label, "alpha condition");
  t("current count = 1", r.current.count, 1);
  t("alternative label = Any other recorded condition", r.alternative.label, "Any other recorded condition");
  t("alternative count = 1", r.alternative.count, 1);
}

section("computeReplay - approvalRate rounding");
{
  const r = computeReplay([
    makeCase("C01", "approved", "cond"),
    makeCase("C02", "approved", "cond"),
    makeCase("C03", "rejected", "cond"),
  ]);
  // 2/3 = 66.666... => 66.7
  t("approvalRate = 66.7", r.current.approvalRate, 66.7);
}

section("computeReplay - confidence uses shared scale");
{
  const r = computeReplay([
    makeCase("C01", "approved", "cond"),
    makeCase("C02", "approved", "cond"),
  ]);
  t("confidence = low (very small sample)", r.current.confidence, "low (very small sample)");

  const r2 = computeReplay([
    makeCase("C01", "approved", "cond"),
    makeCase("C02", "approved", "cond"),
    makeCase("C03", "approved", "cond"),
    makeCase("C04", "approved", "cond"),
    makeCase("C05", "approved", "cond"),
  ]);
  t("confidence for 5 = medium (small sample)", r2.current.confidence, "medium (small sample)");

  const r3 = computeReplay([
    makeCase("C01", "approved", "cond"),
    makeCase("C02", "approved", "cond"),
    makeCase("C03", "approved", "cond"),
    makeCase("C04", "approved", "cond"),
    makeCase("C05", "approved", "cond"),
    makeCase("C06", "approved", "cond"),
  ]);
  t("confidence for 6 = higher", r3.current.confidence, "higher");
}

section("computeReplay - caseIds preserved on each side");
{
  const r = computeReplay([
    makeCase("C01", "approved", "cond A"),
    makeCase("C02", "approved", "cond A"),
    makeCase("C03", "rejected", "cond B"),
  ]);
  t("current caseIds = [C01,C02]", r.current.caseIds, ["C01", "C02"]);
  t("alternative caseIds = [C03]", r.alternative.caseIds, ["C03"]);
}

section("computeReplay - explanation is prediction-free");
{
  const r = computeReplay([
    makeCase("C01", "approved", "cond A"),
    makeCase("C02", "rejected", "cond B"),
  ]);
  t("explanation does not contain 'would' or 'predict'", !/would|predict/i.test(r.explanation), true);
  t("explanation contains 'historical evidence'", r.explanation.includes("Historical evidence"), true);
  t("explanation contains 'historical comparison'", r.explanation.includes("historical comparison"), true);
}

section("confidenceLabel scale");
{
  t("0 => none", confidenceLabel(0), "none");
  t("1 => low (very small sample)", confidenceLabel(1), "low (very small sample)");
  t("2 => low (very small sample)", confidenceLabel(2), "low (very small sample)");
  t("3 => medium (small sample)", confidenceLabel(3), "medium (small sample)");
  t("5 => medium (small sample)", confidenceLabel(5), "medium (small sample)");
  t("6 => higher", confidenceLabel(6), "higher");
  t("10 => higher", confidenceLabel(10), "higher");
}

console.log(`\n${bad === 0 ? "ALL PASS" : `${bad} FAILURES`}`);
process.exit(bad === 0 ? 0 : 1);