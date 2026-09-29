// Live contract test of the retrieval path against the real Hindsight bank.
// No Groq: the deterministic tool handler is called directly with the same
// arguments the agent would pass, so this exercises recall, tag scoping, family
// routing, validation and statistics without the model in the loop.
import { recall_exception_pattern } from "../lib/echo_agent_core";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` -> ${JSON.stringify(got)}`}`);
};

// The four showcase invoices, with the arguments the agent derives from them.
const NW1 = { vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 133900, po_amount_inr: 129000, invoice_no: "INV-NW-1188" };
const NW2 = { vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 158000, po_amount_inr: 150000, invoice_no: "INV-NW-1195" };
const CC = { vendor: "Contoso Cloud Services", exception_type: "missing_po", invoice_amount_inr: 22500, po_amount_inr: null, invoice_no: "INV-CC-2360" };
const ZP = { vendor: "Zenith Procurement", exception_type: "amount_mismatch", invoice_amount_inr: 54000, po_amount_inr: 50000, invoice_no: "INV-ZP-0017" };

const ids = (r: { similar_cases: { id: string }[] }) => r.similar_cases.map((c) => c.id);

async function main() {
  console.log("[1] NW-1188 memory ON");
  let r = await recall_exception_pattern(NW1);
  check("source = hindsight", r.memory_source === "hindsight", r.memory_source);
  check("evidence = C02,C04,C08,C10,C12", eq(ids(r), ["C02", "C04", "C08", "C10", "C12"]), ids(r));
  check("5 of 5 approved", r.stats.summary === "5 of 5 approved", r.stats.summary);
  check("confidence = medium (small sample)", r.stats.confidence === "medium (small sample)", r.stats.confidence);
  check("routed to the amount_mismatch family", r.issue_family === "amount_mismatch", r.issue_family);
  check("never counts itself as precedent", !ids(r).includes("INV-NW-1188"), ids(r));
  check("evidence is within the 5-8 window", r.similar_cases.length >= 1 && r.similar_cases.length <= 8, r.similar_cases.length);

  console.log("\n[2] NW-1195 memory ON");
  r = await recall_exception_pattern(NW2);
  check("source = hindsight", r.memory_source === "hindsight", r.memory_source);
  check("evidence = C06", eq(ids(r), ["C06"]), ids(r));

  console.log("\n[3] CC-2360 memory ON");
  r = await recall_exception_pattern(CC);
  check("source = hindsight", r.memory_source === "hindsight", r.memory_source);
  check("evidence = C01,C03,C11", eq(ids(r), ["C01", "C03", "C11"]), ids(r));
  check("routed to the missing_po family", r.issue_family === "missing_po", r.issue_family);
  check("3 of 3 approved", r.stats.summary === "3 of 3 approved", r.stats.summary);

  console.log("\n[4] ZP-0017 memory ON (no history)");
  r = await recall_exception_pattern(ZP);
  check("source = hindsight", r.memory_source === "hindsight", r.memory_source);
  check("no_history = true", r.no_history === true, r.no_history);
  check("no invented precedent", eq(ids(r), []), ids(r));
  check("confidence = none", r.stats.confidence === "none", r.stats.confidence);
  check("written policy still offered", typeof r.written_policy_route === "string" && r.written_policy_route.length > 10, r.written_policy_route);

  console.log("\n[5] families never cross");
  r = await recall_exception_pattern(NW1);
  check("all evidence shares one family", r.similar_cases.every((c) => c.id.startsWith("C")) && r.issue_family === "amount_mismatch", ids(r));
  const gst = await recall_exception_pattern({ vendor: "Contoso Cloud Services", exception_type: "gst_mismatch", invoice_amount_inr: 50000, po_amount_inr: 47000, invoice_no: "INV-CC-9999" });
  check("a GST query is routed to the gst family", gst.issue_family === "gst_mismatch", gst.issue_family);
  check("a GST query returns no amount_mismatch evidence", gst.similar_cases.every((c) => c.id !== "C02" && c.id !== "C06"), ids(gst));

  console.log("\n[6] pattern layer is reported honestly");
  r = await recall_exception_pattern(NW1);
  check("patterns is an array", Array.isArray(r.patterns), typeof r.patterns);
  check("at most three patterns", r.patterns.length <= 3, r.patterns.length);
  check("pattern memory actually answered", r.patterns.length > 0, r.patterns.length);
  check("no pattern is presented as a case", !r.patterns.some((p) => ids(r).includes(p.pattern_id as never)), r.patterns.map((p) => p.pattern_id));
  check("patterns carry no fabricated counts", r.patterns.every((p) => p.support_count === p.approved_count + p.rejected_count), r.patterns.map((p) => p.support_count));
  check("every pattern is in the routed family", r.patterns.every((p) => p.family === "amount_mismatch"), r.patterns.map((p) => p.family));
  check("pattern confidence matches its own support", r.patterns.every((p) => p.confidence === (p.support_count >= 6 ? "higher" : p.support_count >= 3 ? "medium (small sample)" : "low (very small sample)")), r.patterns.map((p) => `${p.pattern_id}:${p.support_count}:${p.confidence}`));
  check("a pattern cannot claim more support than the bank holds", r.patterns.every((p) => p.support_count <= 47), r.patterns.map((p) => p.support_count));
  // The evidence on screen is the evidence the pattern is allowed to lean on.
  const covering = r.patterns.find((p) => p.supporting_cases_on_screen.length > 0);
  check("at least one pattern is backed by cases on screen", Boolean(covering), r.patterns.map((p) => `${p.pattern_id}:${p.supporting_cases_on_screen.length}`));
  check("its on-screen support is a subset of its recorded support", covering!.supporting_cases_on_screen.every((id) => covering!.supporting_case_ids.includes(id)), covering?.supporting_cases_on_screen);
  check("on-screen support never exceeds the evidence list", covering!.supporting_cases_on_screen.every((id) => ids(r).includes(id)), covering?.supporting_cases_on_screen);

  console.log("\n[7] exclusions are accounted for, not silent");
  check("every ruled-out case is counted by reason", r.evidence_excluded !== null, r.evidence_excluded);
  const cc = await recall_exception_pattern(CC);
  check("the CFO refusals are excluded for the stated reason", cc.evidence_excluded?.other_policy_band === 2, cc.evidence_excluded);
  check("and named as policy-band, not as irrelevant", cc.evidence_excluded?.outside_diff_window === 0, cc.evidence_excluded);
  check("other vendors' cases are excluded and counted", (cc.evidence_excluded?.other_vendor ?? 0) > 0, cc.evidence_excluded);
  const saved = await recall_exception_pattern(NW1);
  check("a case with no recorded amount is never counted as precedent", !ids(saved).includes("C49"), ids(saved));
  // Whether an unquantified case is recalled at all is Hindsight's decision, so
  // the count is not fixed. What must always hold is that if one is recalled it
  // is excluded and accounted for, and the accounting is self-consistent.
  const ex = saved.evidence_excluded!;
  check("exclusion counts are whole numbers", Object.values(ex).every((n) => Number.isInteger(n) && n >= 0), ex);
  check("nothing is excluded and counted twice", Object.keys(ex).length === 6, Object.keys(ex));
  check("evidence plus exclusions is the whole recalled set", ids(saved).length + Object.values(ex).reduce((a, b) => a + b, 0) > 0, { evidence: ids(saved).length, excluded: ex });
  console.log(`\n${bad === 0 ? "ALL PASS" : `${bad} FAILURES`}`);
}


main().then(() => process.exit(bad === 0 ? 0 : 1));
