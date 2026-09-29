// Regression tests for the Institutional Memory rail selectors.
//
// The bug these guard: OBSERVED PATTERN rendered "No pattern" while MEMORY
// rendered "5 comparable cases", because the pattern was joined to the evidence
// by comparing two unrelated vocabularies as strings. Nothing in the backend
// test suite covered that join, so it shipped.
//
// Every expectation below is the value the live backend produced for the real
// demo case, captured from recall_exception_pattern(). See
// scripts/ui-rail-probe.ts, which prints the payloads these fixtures mirror.

import { recall_exception_pattern } from "../lib/echo_agent_core.js";
import {
  observedConditions,
  observedPatterns,
  primaryCondition,
} from "../components/railEvidence.js";
import type { RecallResult } from "../components/echoTypes.js";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log("  ok   " + name);
  } else {
    failures++;
    console.log("  FAIL " + name + "\n         expected " + e + "\n         actual   " + a);
  }
}

const CASES = [
  { k: "INV-NW-1188", vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 133900, po_amount_inr: 129000 },
  { k: "INV-NW-1195", vendor: "Northwind Freight", exception_type: "amount_mismatch", invoice_amount_inr: 158000, po_amount_inr: 150000 },
  { k: "INV-CC-2360", vendor: "Contoso Cloud Services", exception_type: "missing_po", invoice_amount_inr: 22500, po_amount_inr: null },
  { k: "INV-ZP-0017", vendor: "Zenith Packaging", exception_type: "amount_mismatch", invoice_amount_inr: 54000, po_amount_inr: 50000 },
];

async function main() {
  console.log("rail evidence selectors");

  for (const c of CASES) {
    const r: RecallResult = (await recall_exception_pattern({ ...c, synthesize: false })) as RecallResult;
    console.log("\n " + c.k);

    // ---- MEMORY: deterministic counts, passed through untouched
    check("stats.similar_cases", r.stats.similar_cases, { "INV-NW-1188": 5, "INV-NW-1195": 1, "INV-CC-2360": 3, "INV-ZP-0017": 0 }[c.k]);
    check("stats.approved", r.stats.approved, { "INV-NW-1188": 5, "INV-NW-1195": 1, "INV-CC-2360": 3, "INV-ZP-0017": 0 }[c.k]);
    check("stats.confidence", r.stats.confidence, { "INV-NW-1188": "medium (small sample)", "INV-NW-1195": "low (very small sample)", "INV-CC-2360": "medium (small sample)", "INV-ZP-0017": "none" }[c.k]);
    check("no_history", r.no_history, c.k === "INV-ZP-0017");

    // ---- CONDITION: never empty when the backend recorded one, never invented
    check("primaryCondition", primaryCondition(r), {
      "INV-NW-1188": "fuel-surcharge annexure attached",
      "INV-NW-1195": "vendor credit note issued",
      "INV-CC-2360": "retroactive PO raised",
      "INV-ZP-0017": null,
    }[c.k]);
    check("observedConditions", observedConditions(r), {
      "INV-NW-1188": [{ label: "fuel-surcharge annexure attached", count: 5 }],
      "INV-NW-1195": [{ label: "vendor credit note issued", count: 1 }],
      "INV-CC-2360": [{ label: "retroactive PO raised", count: 3 }],
      "INV-ZP-0017": [],
    }[c.k]);

    // ---- OBSERVED PATTERN: the regression itself.
    // Every demo precedent resolves its on-screen evidence to the one pattern
    // whose retained ids intersect the evidence, and that pattern is named
    // "unspecified" because the comparable cases carry no exception_pattern.
    // It must therefore be excluded, so the rail shows a derived grouping — and
    // must never fall through to "No pattern" while MEMORY shows cases.
    const pats = observedPatterns(r);
    check("observedPatterns (all unnamed -> [])", pats.map((p) => p.exception_pattern), []);
    check(
      "on-screen support exists when there is history",
      r.patterns.some((p) => p.supporting_cases_on_screen.length > 0),
      c.k !== "INV-ZP-0017",
    );

    // The old, broken join, asserted to still be broken, so nobody re-adopts it.
    const top = r.stats.top_condition;
    const oldJoin = top ? r.patterns.filter((p) => p.conditions.includes(top.label)).length : null;
    check("old text-join still yields nothing (why it was wrong)", oldJoin, top ? 0 : null);

    // The names that must never reach the rail as a finding.
    for (const p of r.patterns) {
      const name = p.exception_pattern.trim().toLowerCase();
      if (name === "unspecified" || name === "") {
        check(`"${p.exception_pattern}" excluded from display`, pats.includes(p), false);
      }
    }
  }

  // ---- no history means no pattern, no conditions, nothing
  const zp = (await recall_exception_pattern({ ...CASES[3], synthesize: false })) as RecallResult;
  check("no history -> no patterns", observedPatterns(zp), []);
  check("no history -> no conditions", observedConditions(zp), []);
  check("no history -> zero cases", zp.similar_cases.length, 0);

  console.log(failures === 0 ? "\nall rail evidence tests passed" : `\n${failures} FAILURES`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
