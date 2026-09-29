import { recall_exception_pattern } from "../lib/echo_agent_core";

async function main() {
  const r = await recall_exception_pattern({
    vendor: "Northwind Freight", exception_type: "amount_mismatch",
    invoice_amount_inr: 133900, po_amount_inr: 129000, invoice_no: "INV-NW-1188",
  });
  console.log("scope    :", r.memory_scope);
  console.log("family   :", r.issue_family);
  console.log("evidence :", r.similar_cases.map((c) => c.id).join(","));
  console.log("excluded :", JSON.stringify(r.evidence_excluded));
  console.log("patterns :", r.patterns.length);
  for (const p of r.patterns) {
    console.log(`  ${p.pattern_id} ${p.family}/${p.exception_pattern} support=${p.support_count} approved=${p.approved_count} rate=${p.approval_rate} conf="${p.confidence}" onScreen=${p.supporting_cases_on_screen.length}/${p.supporting_case_ids.length}`);
  }
  const cc = await recall_exception_pattern({
    vendor: "Contoso Cloud Services", exception_type: "missing_po",
    invoice_amount_inr: 22500, po_amount_inr: null, invoice_no: "INV-CC-2360",
  });
  console.log("\nCC-2360 scope:", cc.memory_scope, "evidence:", cc.similar_cases.map((c) => c.id).join(","));
  console.log("CC-2360 excluded:", JSON.stringify(cc.evidence_excluded));
  console.log("CC-2360 patterns:", cc.patterns.map((p) => `${p.pattern_id}:${p.exception_pattern}(${p.support_count})`).join(" "));
  console.log("CC-2360 written policy:", cc.written_policy_route);
}
main();
