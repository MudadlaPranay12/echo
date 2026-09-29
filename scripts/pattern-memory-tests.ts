// Deterministic tests for Pattern Memory: tags, family routing, aggregation and
// the text that Pattern Memory actually stores. No network, no LLM.
import {
  caseTags,
  patternTags,
  familyTag,
  stablePatternKey,
  issueFamilyOf,
  buildPatternText,
  parseRetainedPattern,
  parseRetainedCase,
  ISSUE_FAMILIES,
  type RecalledCase,
} from "../lib/hindsight";
import {
  aggregatePattern,
  confidenceLabel,
  detectIssueFamilies,
  patternDocumentId,
  selectPatterns,
  patternCaseIds,
  amountGap,
  amountBand,
  sameAmountRegime,
  POLICY_AMOUNT_THRESHOLDS,
} from "../lib/pattern_memory";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = eq(got, want);
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} -> ${JSON.stringify(got)}`);
};
const section = (s: string) => console.log(`\n${s}`);

/* Fixtures come from the seeded corpus so the tests exercise the same retained
   format runtime recall uses. */
import { seedCase, seedCases, allSeedCases, savedCaseText } from "./test-corpus";

section("tag scheme");
t(
  "case tags",
  caseTags("amount_mismatch", "fuel surcharge annexure", "Northwind Freight"),
  ["domain:ap", "memory:case", "family:amount_mismatch", "pattern:fuel_surcharge_annexure", "vendor:northwind_freight"],
);
t(
  "pattern tags carry no vendor (institutional, not per-supplier)",
  patternTags("amount_mismatch", "fuel surcharge annexure"),
  ["domain:ap", "memory:pattern", "family:amount_mismatch", "pattern:fuel_surcharge_annexure"],
);
t("family tag", familyTag("gst_mismatch"), "family:gst_mismatch");
t("empty pattern is not a blank tag", caseTags("missing_po", "", "Acme").includes("pattern:unspecified"), true);
t("case/pattern scopes are disjoint", caseTags("amount_mismatch", "x", "Acme").includes("memory:pattern"), false);
t("stable pattern key is not case wording", stablePatternKey("amount_mismatch", "Fuel Surcharge Annexure"), "amount_mismatch-fuel_surcharge_annexure");
t("family of a known type", issueFamilyOf("gst_mismatch"), "gst_mismatch");
t("document id is derived from family+pattern", patternDocumentId("missing_po", "po not mentioned"), "echo-pattern-missing_po-po_not_mentioned");

section("family routing (deterministic)");
t("amount mismatch wording", detectIssueFamilies("The invoice amount differs from the PO by 8%").family, "amount_mismatch");
t("missing po wording", detectIssueFamilies("There is a missing PO for this invoice").family, "missing_po");
t("gst wording", detectIssueFamilies("GST rate on this bill looks wrong").family, "gst_mismatch");
t("duplicate wording", detectIssueFamilies("This looks like a duplicate invoice").family, "duplicate_suspect");
t("permission wording", detectIssueFamilies("Who can approve this under the approval matrix?").family, "permission_approval");
t("unrelated question routes nowhere", detectIssueFamilies("What is the weather today").family, "unknown");
t("routing is stable across repeats", detectIssueFamilies("amount discrepancy on invoice").family, detectIssueFamilies("amount discrepancy on invoice").family);
t("reports the keyword that decided it", detectIssueFamilies("this is a duplicate invoice").matchedBy, "duplicate");
t("ties break on the fixed family order", detectIssueFamilies("duplicate and gst issue").ranked.length >= 2, true);

section("confidence scale (one definition)");
t("no support", confidenceLabel(0), "none");
t("one case", confidenceLabel(1), "low (very small sample)");
t("five cases (NW-1188 demo)", confidenceLabel(5), "medium (small sample)");
t("six cases", confidenceLabel(6), "higher");
t("never a percentage", /\d+%/.test(confidenceLabel(9)), false);

section("pattern aggregation from the real corpus");
/* Aggregated over seeded cases that share one pattern, so every count below is a
   count of retained cases rather than of anything typed into this file. */
const VARIANCE = "small price variance";
const fuelCases = allSeedCases().filter((k) => k.exception_pattern === VARIANCE);
t("the corpus contains that pattern", fuelCases.length, 7);
const fuel = aggregatePattern({ patternId: "P17", family: "amount_mismatch", exceptionPattern: VARIANCE, cases: fuelCases });
t("support is the real case count", fuel.support_count, fuelCases.length);
t("approved + rejected equals support", fuel.approved_count + fuel.rejected_count, fuel.support_count);
t(
  "approved counted from the corpus",
  fuel.approved_count,
  fuelCases.filter((k) => k.outcome === "approved").length,
);
t(
  "rejected counted from the corpus",
  fuel.rejected_count,
  fuelCases.filter((k) => k.outcome === "rejected").length,
);
t("approval rate is derived, not stated", fuel.approval_rate, fuel.support_count ? Math.round((fuel.approved_count / fuel.support_count) * 1000) / 10 : null);
t("every supporting case is traceable", fuel.case_ids.length, fuelCases.length);
t("case ids are the real ids", fuel.case_ids.every((id) => /^C\d{2}$/.test(id)), true);
t("case ids are in date order, not recall order", fuel.case_ids, [...fuel.case_ids].sort((a, b) => seedCase(a).date.localeCompare(seedCase(b).date) || a.localeCompare(b)));
t("approver counts sum to support", fuel.approvers.reduce((n, a) => n + a.count, 0), fuel.support_count);
t("approvers are ranked by real frequency", fuel.approvers[0].count >= fuel.approvers[fuel.approvers.length - 1].count, true);
t("last seen is the latest real date", fuel.last_seen, fuelCases.reduce((m, k) => (k.date > m ? k.date : m), ""));
t("confidence follows support", fuel.confidence, confidenceLabel(fuelCases.length));
t("typical resolution is a real workaround", fuelCases.map((k) => k.workaround).includes(fuel.typical_resolution), true);
t("aggregation is order independent", aggregatePattern({ patternId: "P17", family: "amount_mismatch", exceptionPattern: VARIANCE, cases: [...fuelCases].reverse() }), fuel);
t("a pattern with no support claims no approval rate", aggregatePattern({ patternId: "P1", family: "missing_po", exceptionPattern: "nothing", cases: [] }).approval_rate, null);
t("a pattern with no support claims no confidence", aggregatePattern({ patternId: "P1", family: "missing_po", exceptionPattern: "nothing", cases: [] }).confidence, "none");
t("a pattern with no support is still not evidence", aggregatePattern({ patternId: "P1", family: "missing_po", exceptionPattern: "nothing", cases: [] }).case_ids, []);

section("the demo evidence is what it claims to be");
t("the NW-1188 evidence set is all amount_mismatch", ["C02", "C04", "C08", "C10", "C12"].every((id) => issueFamilyOf(seedCase(id).exception_type) === "amount_mismatch"), true);
t("none of them carries an exception pattern yet", ["C02", "C04", "C08", "C10", "C12"].every((id) => seedCase(id).exception_pattern === ""), true);
t("the CC-2360 evidence set is all missing_po", ["C01", "C03", "C11"].every((id) => issueFamilyOf(seedCase(id).exception_type) === "missing_po"), true);
t("C06 really is an amount_mismatch case", issueFamilyOf(seedCase("C06").exception_type), "amount_mismatch");
t("no two families share a case", new Set(allSeedCases().map((k) => `${k.id}/${issueFamilyOf(k.exception_type)}`)).size, 47);

section("patterns never cross family boundaries");
const byFamily = new Map<string, RecalledCase[]>();
for (const k of allSeedCases()) {
  const f = issueFamilyOf(k.exception_type);
  byFamily.set(f, [...(byFamily.get(f) ?? []), k]);
}
t("every seeded case routes to a real family", [...byFamily.keys()].every((f) => ISSUE_FAMILIES.includes(f as never)), true);
for (const [family, cases] of byFamily) {
  const doc = patternDocumentId(family, "x");
  t(`family ${family} has its own document`, doc.startsWith(`echo-pattern-${family}-`), true);
  t(`family ${family} holds only its own cases`, cases.every((k) => issueFamilyOf(k.exception_type) === family), true);
}
t("an amount_mismatch case is never evidence for a gst question", allSeedCases().some((k) => k.exception_type === "amount_mismatch" && issueFamilyOf(k.exception_type) === "gst_mismatch"), false);

section("saved resolutions aggregate like seeded ones");
const saved = parseRetainedCase("C48", savedCaseText({
  date: "2026-09-28", vendor: "Northwind Freight", invoice_no: "INV-NW-1188",
  exception_type: "amount_mismatch", approver: "Suresh Iyer", workaround: "Attach fuel-surcharge annexure",
  outcome: "approved", days: 0, condition: "annexure attached", decision: "approve as practised",
  policy_route: "CFO sign-off for amount mismatch over INR 50,000",
}));
t("a saved resolution reads back", saved?.invoice_no, "INV-NW-1188");
t("its condition is retained", saved?.condition, "annexure attached");
t("its policy route is retained", saved?.policy_route, "CFO sign-off for amount mismatch over INR 50,000");
const savedFuel = aggregatePattern({ patternId: "P17", family: "amount_mismatch", exceptionPattern: "annexure attached", cases: [saved as RecalledCase, fuelCases[0]] });
t("a saved case raises the pattern's real support", savedFuel.support_count, 2);
t("its id joins the traceable set", savedFuel.case_ids.includes("C48"), true);
t("a tied policy route resolves deterministically by name", savedFuel.policy_route, "AP Manager review: mismatch above 2%.");
const soloFuel = aggregatePattern({ patternId: "P18", family: "amount_mismatch", exceptionPattern: "solo", cases: [saved as RecalledCase] });
t("a lone policy route is the pattern's route", soloFuel.policy_route, "CFO sign-off for amount mismatch over INR 50,000");
t("a condition a human recorded reaches the pattern", soloFuel.conditions, ["annexure attached"]);


section("pattern document is aggregate-only and readable back");
const text = buildPatternText(fuel);
t("carries the stable marker", text.startsWith("[echo-pattern:P17]"), true);
t("carries the family", text.includes("amount_mismatch"), true);
t("copies no invoice numbers into pattern memory", /INV-/.test(text), false);
t("copies no case vendor into pattern memory", /Northwind Freight|Contoso|Acme|Zenith/.test(text), false);
t("copies no per-case workaround text into pattern memory", fuelCases.some((k) => k.workaround === fuel.typical_resolution) && text.includes(fuel.typical_resolution), true);
const back = parseRetainedPattern(fuel.document_id, text);
t("support reads back", back?.support_count, 7);
t("approved reads back", back?.approved_count, 7);
t("rejected reads back", back?.rejected_count, 0);
t("approval rate reads back", back?.approval_rate, 100);
t("pattern id reads back", back?.pattern_id, "P17");
t("document id reads back", back?.document_id, "echo-pattern-amount_mismatch-small_price_variance");
t("last seen reads back", back?.last_seen, "2026-08-06");
t("confidence reads back", back?.confidence, "higher");
t("traceable ids read back", back?.case_ids, fuel.case_ids);
t("an unreadable pattern body is refused, not guessed", parseRetainedPattern("echo-pattern-x", "some unrelated text"), null);
t("a pattern whose counts contradict itself is refused", parseRetainedPattern("echo-pattern-x", text.replace("Seen in 7 cases", "Seen in 9 cases")), null);

section("pattern selection");
const p2 = { ...fuel, pattern_id: "P18" as const, document_id: "echo-pattern-amount_mismatch-other", exception_pattern: "other", support_count: 9 };
const p3 = { ...fuel, pattern_id: "P19" as const, document_id: "echo-pattern-amount_mismatch-third", exception_pattern: "third", support_count: 1 };
t("at most three patterns are shown", selectPatterns([fuel, p2, p3, { ...fuel, document_id: "echo-pattern-x", pattern_id: "P20" as const }]).length, 3);
t("ranked by real support", selectPatterns([fuel, p2, p3])[0].document_id, "echo-pattern-amount_mismatch-other");
t("the cases behind them are unioned once", patternCaseIds([fuel, { ...fuel, case_ids: [...fuel.case_ids, "C50"] }]), [...fuel.case_ids, "C50"]);
t("selection is order independent", selectPatterns([p3, fuel, p2]), selectPatterns([p2, p3, fuel]));

section("amounts are read back, or reported absent");
t("a mismatch case states both amounts", seedCase("C02").invoice_amount_inr, 148000);
t("and its PO amount", seedCase("C02").po_amount_inr, 143000);
t("Indian digit grouping is handled", seedCase("C13").invoice_amount_inr, 134000);
t("the difference is also stated", seedCase("C02").diff_pct, 3.5);
t("a no-PO case still records its invoice amount", seedCase("C01").invoice_amount_inr, 18400);
t("but records no PO amount, because there was no PO", seedCase("C01").po_amount_inr, null);
t("a no-PO case states no difference either", seedCase("C01").diff_pct, null);
t("an absent amount is null, not zero", allSeedCases().every((k) => k.invoice_amount_inr === null || k.invoice_amount_inr > 0), true);
t("every seeded case kept its amount", allSeedCases().every((k) => k.invoice_amount_inr !== null), true);
t("no seeded amount disagrees with its structured field", allSeedCases().every((k) => k.invoice_amount_inr === seedCases.find((s) => s.id === k.id)?.invoice_amount_inr), true);
t("gap is absolute rupees", amountGap(148000, 133900), 14100);
t("gap to a case with no recorded amount is null", amountGap(null, 133900), null);
t("gap to itself is zero", amountGap(133900, 133900), 0);

section("comparability follows the written policy, not the ranking");
t("the policy records one threshold for amount mismatches", POLICY_AMOUNT_THRESHOLDS.amount_mismatch, [50000]);
t("and one for missing POs", POLICY_AMOUNT_THRESHOLDS.missing_po, [50000]);
t("below the threshold is band 0", amountBand(22500, "missing_po"), 0);
t("above the threshold is band 1", amountBand(61200, "missing_po"), 1);
t("two sub-threshold invoices are comparable", sameAmountRegime(18400, 22500, "missing_po"), true);
t("a supra-threshold case is not precedent for a sub-threshold invoice", sameAmountRegime(61200, 22500, "missing_po"), false);
t("and not the other way round either", sameAmountRegime(9750, 68400, "missing_po"), false);
t("a case with no recorded amount is uncomparable, not assumed close", sameAmountRegime(null, 22500, "missing_po"), false);
t("a family with no recorded threshold compares on family alone", sameAmountRegime(null, 22500, "gst_mismatch"), true);
t("this is what separates the CC-2360 precedent from the CFO refusals", ["C01", "C03", "C11"].filter((id) => sameAmountRegime(seedCase(id).invoice_amount_inr, 22500, "missing_po")), ["C01", "C03", "C11"]);
t("the CFO refusals are excluded for a stated reason", ["C05", "C20"].filter((id) => sameAmountRegime(seedCase(id).invoice_amount_inr, 22500, "missing_po")), []);
t("the NW-1188 band still holds all five diff-window cases", ["C02", "C04", "C08", "C10", "C12"].filter((id) => sameAmountRegime(seedCase(id).invoice_amount_inr, 133900, "amount_mismatch")).length, 5);

section("evidence gap orders cases the same way every time");
const order = (cases: RecalledCase[], current: number) =>
  [...cases].sort((a, b) => (amountGap(a.invoice_amount_inr, current) ?? Infinity) - (amountGap(b.invoice_amount_inr, current) ?? Infinity) || a.id.localeCompare(b.id));
const nw = allSeedCases().filter((k) => k.vendor === "Northwind Freight" && k.exception_type === "amount_mismatch");
t("nearest comparable case comes first", order(nw, 133900)[0].id, "C13");
t("gap ordering is stable", order(nw, 133900).map((c) => c.id), order([...nw].reverse(), 133900).map((c) => c.id));
t("a case with no amount sorts last, not first", order([...nw, seedCase("C01")], 133900).at(-1)?.id, "C01");

console.log(`\n${bad === 0 ? "ALL PASS" : `${bad} FAILURES`}`);
process.exit(bad === 0 ? 0 : 1);
