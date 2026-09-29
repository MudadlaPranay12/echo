// Deterministic tests for the grounding validator: no network, no LLM.
// Exercises verifyClaim, verifyReplyText, factsFromRecall, emptyFacts.

import {
  PatternFactInput,
  factsFromRecall,
  emptyFacts,
  verifyClaim,
  verifyReplyText,
} from "../lib/grounding";
import { confidenceLabel } from "../lib/confidence";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = eq(got, want);
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} -> ${JSON.stringify(got)}`);
};

const section = (s: string) => console.log(`\n${s}`);

/* A minimal recall-like shape to build GroundingFact from */
function makeRecall(overrides: Partial<{
  no_history: boolean;
  written_policy_route: string;
  similar_cases: { id: string; outcome: "approved" | "rejected"; condition?: string | null }[];
  stats: { similar_cases: number; approved: number; confidence: string };
}> = {}) {
  const base = {
    no_history: false,
    written_policy_route: "AP Manager review: mismatch above 2%.",
    similar_cases: [
      { id: "C01", outcome: "approved" as const, condition: "retroactive PO raised" },
      { id: "C02", outcome: "approved" as const, condition: "fuel-surcharge annexure attached" },
    ],
    stats: { similar_cases: 2, approved: 2, confidence: "low (very small sample)" },
  };
  return { ...base, ...overrides };
}

function makePatterns(overrides: Partial<PatternFactInput> = {}): PatternFactInput[] {
  return [{
    key: "fuel surcharge annexure",
    support: 5,
    approved: 5,
    lastSeen: "2026-08-14",
    caseIds: ["C02", "C04", "C08", "C10", "C12"],
    ...overrides,
  }];
}

section("factsFromRecall builds correct GroundingFact");
{
  const r = makeRecall();
  const patterns = makePatterns();
  console.log("DEBUG: patterns passed to factsFromRecall:", JSON.stringify(patterns, null, 2));
  const f = factsFromRecall(r, true, patterns);
  console.log("DEBUG: patternSupport keys:", Array.from(f.patternSupport.keys()));
  console.log("DEBUG: patternSupport size:", f.patternSupport.size);
  t("memoryOn = true", f.memoryOn, true);
  t("noHistory = false", f.noHistory, false);
  t("policyRoute set", f.policyRoute, "AP Manager review: mismatch above 2%.");
  t("caseIds has C01,C02 and pattern cases", Array.from(f.caseIds).sort(), ["C01", "C02", "C04", "C08", "C10", "C12"]);
  t("outcomeById has C01->approved", f.outcomeById.get("C01"), "approved");
  t("conditionById has C01", f.conditionById.get("C01"), "retroactive PO raised");
  t("similarCount = 2", f.similarCount, 2);
  t("approvedCount = 2", f.approvedCount, 2);
  t("confidence = low (very small sample)", f.confidence, "low (very small sample)");
  t("patternSupport has key", f.patternSupport.has("fuel surcharge annexure"), true);
  const ps = f.patternSupport.get("fuel surcharge annexure")!;
  t("pattern support = 5", ps.support, 5);
  t("pattern approved = 5", ps.approved, 5);
  t("pattern caseIds includes pattern cases", ps.caseIds.includes("C02"), true);
}

section("emptyFacts returns zeroed fact base");
{
  const f = emptyFacts(false);
  t("memoryOn = false", f.memoryOn, false);
  t("noHistory = true", f.noHistory, true);
  t("policyRoute empty", f.policyRoute, "");
  t("caseIds empty", f.caseIds.size, 0);
  t("similarCount = 0", f.similarCount, 0);
  t("approvedCount = 0", f.approvedCount, 0);
  t("confidence = none", f.confidence, "none");
  t("patternSupport empty", f.patternSupport.size, 0);
}

section("verifyClaim - case_exists");
{
  const f = factsFromRecall(makeRecall(), true);
  t("existing case supported", verifyClaim({ kind: "case_exists", id: "C01" }, f).verdict, "supported");
  t("fabricated case unsupported", verifyClaim({ kind: "case_exists", id: "C99" }, f).verdict, "unsupported");
  t("invalid id format unsupported", verifyClaim({ kind: "case_exists", id: "XYZ" }, f).verdict, "unsupported");
  const fNoHist = factsFromRecall(makeRecall({ no_history: true }), true);
  t("no_history => unsupported", verifyClaim({ kind: "case_exists", id: "C01" }, fNoHist).verdict, "unsupported");
}

section("verifyClaim - case_outcome");
{
  const f = factsFromRecall(makeRecall(), true);
  t("correct outcome supported", verifyClaim({ kind: "case_outcome", id: "C01", outcome: "approved" }, f).verdict, "supported");
  t("wrong outcome unsupported", verifyClaim({ kind: "case_outcome", id: "C01", outcome: "rejected" }, f).verdict, "unsupported");
  t("case not in evidence unsupported", verifyClaim({ kind: "case_outcome", id: "C99", outcome: "approved" }, f).verdict, "unsupported");
}

section("verifyClaim - case_condition");
{
  const f = factsFromRecall(makeRecall(), true);
  t("exact match supported", verifyClaim({ kind: "case_condition", id: "C01", label: "retroactive PO raised" }, f).verdict, "supported");
  t("substring match supported", verifyClaim({ kind: "case_condition", id: "C01", label: "retroactive PO" }, f).verdict, "supported");
  t("no condition recorded => unverifiable", verifyClaim({ kind: "case_condition", id: "C99", label: "anything" }, f).verdict, "unverifiable");
  t("mismatch unsupported", verifyClaim({ kind: "case_condition", id: "C01", label: "annexure" }, f).verdict, "unsupported");
}

section("verifyClaim - count_approved");
{
  const f = factsFromRecall(makeRecall(), true);
  t("correct count supported", verifyClaim({ kind: "count_approved", n: 2 }, f).verdict, "supported");
  t("wrong count unsupported", verifyClaim({ kind: "count_approved", n: 1 }, f).verdict, "unsupported");
}

section("verifyClaim - count_total");
{
  const f = factsFromRecall(makeRecall(), true);
  t("correct count supported", verifyClaim({ kind: "count_total", n: 2 }, f).verdict, "supported");
  t("wrong count unsupported", verifyClaim({ kind: "count_total", n: 3 }, f).verdict, "unsupported");
}

section("verifyClaim - confidence");
{
  const f = factsFromRecall(makeRecall(), true);
  t("correct label supported", verifyClaim({ kind: "confidence", label: "low (very small sample)" }, f).verdict, "supported");
  t("wrong label unsupported", verifyClaim({ kind: "confidence", label: "medium (small sample)" }, f).verdict, "unsupported");
}

section("verifyClaim - no_history");
{
  const fNoHist = factsFromRecall(makeRecall({ no_history: true, similar_cases: [], stats: { similar_cases: 0, approved: 0, confidence: "none" } }), true);
  t("no_history true => supported", verifyClaim({ kind: "no_history" }, fNoHist).verdict, "supported");
  const fHist = factsFromRecall(makeRecall({ no_history: false }), true);
  t("no_history false with evidence => unsupported", verifyClaim({ kind: "no_history" }, fHist).verdict, "unsupported");
}

section("verifyClaim - memory_off");
{
  const fOn = factsFromRecall(makeRecall(), true);
  t("memory_on + claimsMemory=false => supported", verifyClaim({ kind: "memory_off", claimsMemory: false }, fOn).verdict, "supported");
  t("memory_on + claimsMemory=true => unsupported", verifyClaim({ kind: "memory_off", claimsMemory: true }, fOn).verdict, "unsupported");
  const fOff = emptyFacts(false);
  t("memory_off + claimsMemory=true => supported", verifyClaim({ kind: "memory_off", claimsMemory: true }, fOff).verdict, "supported");
  t("memory_off + claimsMemory=false => unsupported", verifyClaim({ kind: "memory_off", claimsMemory: false }, fOff).verdict, "unsupported");
}

section("verifyClaim - policy_route");
{
  const f = factsFromRecall(makeRecall(), true);
  t("exact match supported", verifyClaim({ kind: "policy_route", route: "AP Manager review: mismatch above 2%." }, f).verdict, "supported");
  t("case-insensitive match supported", verifyClaim({ kind: "policy_route", route: "ap manager review: mismatch above 2%." }, f).verdict, "supported");
  t("mismatch => unverifiable", verifyClaim({ kind: "policy_route", route: "CFO approval required" }, f).verdict, "unverifiable");
  const fNoRoute = factsFromRecall(makeRecall({ written_policy_route: "" }), true);
  t("empty route => unverifiable", verifyClaim({ kind: "policy_route", route: "anything" }, fNoRoute).verdict, "unverifiable");
}

section("verifyClaim - pattern_support");
{
  const f = factsFromRecall(makeRecall(), true, makePatterns());
  t("correct support/approved supported", verifyClaim({ kind: "pattern_support", key: "fuel surcharge annexure", support: 5, approved: 5 }, f).verdict, "supported");
  t("wrong support unsupported", verifyClaim({ kind: "pattern_support", key: "fuel surcharge annexure", support: 4, approved: 5 }, f).verdict, "unsupported");
  t("wrong approved unsupported", verifyClaim({ kind: "pattern_support", key: "fuel surcharge annexure", support: 5, approved: 4 }, f).verdict, "unsupported");
  t("unknown pattern unverifiable", verifyClaim({ kind: "pattern_support", key: "unknown pattern", support: 1, approved: 1 }, f).verdict, "unverifiable");
}

section("verifyReplyText scrubs fabricated IDs");
{
  const f = factsFromRecall(makeRecall(), true);
  const text = "Based on C01 and C99, the case was approved.";
  const r = verifyReplyText(text, f);
  t("C01 kept", r.cleaned.includes("C01"), true);
  t("C99 replaced", r.cleaned.includes("a recalled case"), true);
  t("flagged recorded", r.flagged.some((x) => x.includes("C99")), true);
}

section("verifyReplyText memory OFF removes all IDs");
{
  const f = emptyFacts(false);
  const text = "C01 and C02 were approved.";
  const r = verifyReplyText(text, f);
  t("C01 replaced", r.cleaned.includes("a past case"), true);
  t("C02 replaced", (r.cleaned.match(/a past case/g) ?? []).length, 2);
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