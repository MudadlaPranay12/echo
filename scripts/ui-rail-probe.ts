// Read-only probe: calls the real recall_exception_pattern() for the four demo
// cases and prints exactly what the frontend will receive. No mock data, no LLM.
import { recall_exception_pattern } from "../lib/echo_agent_core.js";
async function main() {

const CASES = [
  { k: "INV-NW-1188", vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 133900, po_amount_inr: 129000 },
  { k: "INV-NW-1195", vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 158000, po_amount_inr: 150000 },
  { k: "INV-CC-2360", vendor: "Contoso Cloud Services", exception_type: "missing_po", invoice_amount_inr: 22500, po_amount_inr: null },
  { k: "INV-ZP-0017", vendor: "Zenith Packaging", exception_type: "amount_mismatch", invoice_amount_inr: 54000, po_amount_inr: 50000 },
];

for (const c of CASES) {
  const r = await recall_exception_pattern({ ...c, synthesize: false });
  const st = r.stats;
  console.log("\n================ " + c.k + " ================");
  console.log("memory_source      :", r.memory_source, "| scope:", r.memory_scope, "| family:", r.issue_family);
  console.log("no_history         :", r.no_history);
  console.log("stats.similar_cases:", st.similar_cases, "| approved:", st.approved, "| confidence:", JSON.stringify(st.confidence));
  console.log("stats.top_condition :", JSON.stringify(st.top_condition));
  console.log("stats.approvers     :", JSON.stringify(st.approvers));
  console.log("similar_cases ids   :", r.similar_cases.map((x) => x.id).join(", ") || "(none)");
  console.log("  per-case .condition:", JSON.stringify(r.similar_cases.map((x) => x.condition)));
  console.log("patterns.length     :", r.patterns.length);
  for (const p of r.patterns) {
    console.log("  - exception_pattern      :", JSON.stringify(p.exception_pattern));
    console.log("    support/approved       :", p.support_count + "/" + p.approved_count, "| rate:", p.approval_rate);
    console.log("    conditions[]           :", JSON.stringify(p.conditions));
    console.log("    supporting_case_ids    :", JSON.stringify(p.supporting_case_ids));
    console.log("    supporting_on_screen   :", JSON.stringify(p.supporting_cases_on_screen));
  }
  // reproduce the OLD buggy join exactly, to show it fails
  const top = st.top_condition;
  const oldJoin = top ? r.patterns.filter((p) => p.conditions.includes(top.label)).length : "n/a (top_condition null)";
  console.log("OLD buggy join count   :", oldJoin, "| top.label:", JSON.stringify(top?.label ?? null));
  const newJoin = r.patterns.filter((p) => p.supporting_cases_on_screen.length > 0).length;
  console.log("NEW case-id join count :", newJoin);
}
}
main().catch((e) => { console.error(e); process.exit(1); });
