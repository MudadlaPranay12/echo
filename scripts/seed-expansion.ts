// scripts/seed-expansion.ts
// Development-only. Adds the Phase 11 dataset expansion (ids C51-C200 from
// scripts/echo_expansion.json) to the Hindsight bank. This is the additive half
// of the corpus: the 47 verified cases stay untouched, and NOTHING here writes
// pattern documents -- patterns already derived from the original seed must not
// be re-derived, renumbered, or touched.
//
//   npm run build:test && node .test-build/scripts/seed-expansion.js
//
// Safe to re-run: every case uses documentId echo-case-<id> with updateMode
// "replace", so a second run refreshes the same documents instead of creating
// duplicates. Every case is validated and its built retained text re-parsed
// before anything is written; a case that would not round-trip aborts the run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hindsightConfig,
  hindsightRetain,
  hindsightVersion,
  issueFamilyOf,
} from "../lib/hindsight";
import {
  buildSeedText,
  EXPANSION_IDS,
  expansionSummary,
  validateExpansionCase,
  type ExpansionCase,
} from "./expansion-util";

const EXPANSION_PATH = join(process.cwd(), "scripts", "echo_expansion.json");

async function main() {
  const cfg = hindsightConfig();
  if (!cfg) {
    console.error("Hindsight is not configured. Set HINDSIGHT_BANK_ID and HINDSIGHT_BASE_URL in .env.local");
    process.exitCode = 1;
    return;
  }

  const cases = JSON.parse(readFileSync(EXPANSION_PATH, "utf8")) as ExpansionCase[];
  const outOfRange = cases.filter((c) => {
    const n = Number(c.id.slice(1));
    return Number.isNaN(n) || n < EXPANSION_IDS.from || n > EXPANSION_IDS.to;
  });
  if (outOfRange.length) {
    console.error(`abort: ${outOfRange.length} case(s) outside the reserved expansion id range C${EXPANSION_IDS.from}-C${EXPANSION_IDS.to}.`);
    console.error("       this script must never touch the verified corpus.");
    process.exitCode = 1;
    return;
  }

  const problems: string[] = [];
  for (const c of cases) problems.push(...validateExpansionCase(c));
  if (problems.length) {
    console.error(`abort: ${problems.length} validation problem(s); nothing was seeded:`);
    for (const p of problems.slice(0, 20)) console.error("  " + p);
    process.exitCode = 1;
    return;
  }

  console.log(`bank      : ${cfg.bankId}`);
  console.log(`api ver   : ${await hindsightVersion(cfg)}`);
  console.log(`expanding : ${cases.length} cases (additive; ${
    new Set(cases.map((c) => c.id)).size
  } unique ids)\n`);

  let ok = 0;
  for (const c of cases) {
    try {
      const text = buildSeedText(c);
      const res = await hindsightRetain(
        {
          id: c.id,
          text,
          context: "AP exception resolution",
          timestamp: `${c.date}T09:00:00Z`,
          vendor: c.vendor,
          exceptionType: c.exception_type,
          date: c.date,
          issueFamily: issueFamilyOf(c.exception_type),
          exceptionPattern: c.exception_pattern,
        },
        cfg,
      );
      ok += 1;
      console.log(
        `  ${c.id}  ${c.vendor.padEnd(24)} ${c.exception_type.padEnd(17)} items=${res.itemsCount}  seed-expansion/C${c.id}`,
      );
    } catch (e) {
      console.error(`  ${c.id}  FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = expansionSummary(cases);
  console.log(
    `\nretained  : ${ok} of ${cases.length} (no pattern documents written)`,
  );
  console.log(`families  : ${JSON.stringify(summary.families)} (approved=${summary.approved}, rejected=${summary.rejected}, rate=${summary.approvalRate}%)`);
  if (ok !== cases.length) {
    console.error("expansion incomplete: some documents were not retained.");
    process.exitCode = 1;
  }
  console.log("done. Verify recall, then run the app with memoryOn=true.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});