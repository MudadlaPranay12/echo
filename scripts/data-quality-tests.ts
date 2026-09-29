// scripts/data-quality-tests.ts
// Deterministic quality gate for the Phase 11 dataset expansion. Pure: it only
// exercises the offline writer/parser round-trip, never the live bank. Run as
// part of the deterministic suite (npm run test:data). Failing any invariant is
// a dataset-authoring bug, not an environment flake.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPANSION_IDS,
  expansionSummary,
  validateExpansionCase,
  type ExpansionCase,
  type ExpFamily,
} from "./expansion-util";

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`FAIL  ${msg}`);
};

const cases = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "echo_expansion.json"), "utf8"),
) as ExpansionCase[];

// 1. every case validates, including the round-trip through parseRetainedCase
for (const c of cases) {
  for (const p of validateExpansionCase(c)) fail(p);
}

// 2. corpus shape: roughly 200 cases total, ids contiguous within the reserved range
const ids = cases.map((c) => Number(c.id.slice(1))).sort((a, b) => a - b);
for (let i = 0; i < ids.length; i++) {
  if (ids[i] !== EXPANSION_IDS.from + i) fail(`id gap or duplicate at index ${i}: ${ids[i]} (expected C${EXPANSION_IDS.from + i})`);
}
if (ids.length < 150) fail(`expected >=150 expansion cases, got ${ids.length}`);

// 3. family distribution follows the plan (within +/- 3)
const summary = expansionSummary(cases);
const plan: [ExpFamily, number][] = [
  ["amount_mismatch", 70],
  ["missing_po", 45],
  ["gst_mismatch", 20],
  ["duplicate_suspect", 15],
];
for (const [family, target] of plan) {
  const actual = (summary.families[family] ?? 0) as number;
  if (Math.abs(actual - target) > 3) fail(`family ${family}: ${actual} cases, target ~${target}`);
}

// 4. realistic spread: not all from the same week; a fresh tail per family
const dates = cases.map((c) => c.date);
if (new Set(dates).size < 60) fail(`only ${new Set(dates).size} distinct dates across ${cases.length} cases`);
for (const [family] of plan) {
  const familyCases = cases.filter((c) => c.exception_type === family);
  const newest = familyCases.reduce((acc, c) => (c.date > acc ? c.date : acc), "");
  if (newest < "2026-07-01") fail(`family ${family} has no fresh memory; newest ${newest}`);
}

// 5. honest distribution: every approve-capable pattern sees both outcomes
const byPattern = new Map<string, { approved: number; rejected: number }>();
for (const c of cases) {
  if (c.exception_type === "duplicate_suspect") continue;
  const s = byPattern.get(c.exception_pattern) ?? { approved: 0, rejected: 0 };
  s[c.outcome === "approved" ? "approved" : "rejected"]++;
  byPattern.set(c.exception_pattern, s);
}
for (const [pattern, s] of byPattern) {
  if (s.rejected === 0 || s.approved === 0) fail(`pattern "${pattern}" is one-sided (approved=${s.approved}, rejected=${s.rejected})`);
}

// 6. duplicate family is strictly rejected (matches written policy)
for (const c of cases.filter((x) => x.exception_type === "duplicate_suspect")) {
  if (c.outcome !== "rejected") fail(`duplicate case ${c.id} must be rejected`);
}

console.log(
  `\ndata-quality: ${cases.length} cases, ${new Set(ids).size} unique ids, ` +
  `distinct patterns=${(summary.distinctPatterns as number)}`,
);
console.log(`families      ${JSON.stringify(summary.families)}`);
console.log(`outcomes      approved=${summary.approved} rejected=${summary.rejected} rate=${summary.approvalRate}%`);
console.log(`newest case   ${summary.mostRecent}`);
console.log(failures === 0 ? "PASS all invariants." : `FAIL ${failures} invariant(s).`);
process.exitCode = failures === 0 ? 0 : 1;