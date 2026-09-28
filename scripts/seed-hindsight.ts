// scripts/seed-hindsight.ts
// Development-only. Seeds the 12 historical AP exceptions from
// lib/echo_seed_data.json into the Hindsight bank so Echo starts with real
// recallable memory. This is never called from an API request.
//
//   npm run seed:hindsight
//
// Safe to re-run: every case is written with documentId echo-case-<id> and
// updateMode "replace", so a second run refreshes the same 12 documents
// instead of creating duplicates.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASE_DOC_PREFIX, hindsightConfig, hindsightRetain, hindsightVersion } from "../lib/hindsight.ts";

interface SeedCase {
  id: string;
  date: string;
  vendor: string;
  exception_type: string;
  retain_text: string;
  retain_context: string;
  retain_timestamp: string;
}

interface SeedFile {
  past_cases: SeedCase[];
}

const SEED_PATH = join(process.cwd(), "lib", "echo_seed_data.json");
/** Hindsight retain is processed asynchronously; give it a moment before recalling. */
const SETTLE_MS = 4000;

async function main() {
  const cfg = hindsightConfig();
  if (!cfg) {
    console.error("Hindsight is not configured. Set HINDSIGHT_BANK_ID and HINDSIGHT_BASE_URL in .env.local");
    process.exitCode = 1;
    return;
  }

  const { past_cases: cases } = JSON.parse(readFileSync(SEED_PATH, "utf8")) as SeedFile;
  console.log(`bank      : ${cfg.bankId}`);
  console.log(`base url  : ${cfg.baseUrl}`);
  console.log(`api ver   : ${await hindsightVersion(cfg)}`);
  console.log(`seeding   : ${cases.length} historical cases\n`);

  let ok = 0;
  for (const c of cases) {
    try {
      const res = await hindsightRetain(
        {
          id: c.id,
          text: c.retain_text,
          context: c.retain_context,
          timestamp: c.retain_timestamp,
          vendor: c.vendor,
          exceptionType: c.exception_type,
          date: c.date,
        },
        cfg,
      );
      ok += 1;
      const doc = `${CASE_DOC_PREFIX}${c.id}`;
      console.log(`  ${c.id}  ${c.vendor.padEnd(24)} ${c.exception_type.padEnd(17)} items=${res.itemsCount} doc=${doc} op=${res.operationId ?? "sync"}`);
    } catch (e) {
      console.error(`  ${c.id}  FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nretained  : ${ok} of ${cases.length}`);
  console.log(`waiting   : ${SETTLE_MS / 1000}s for asynchronous processing`);
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  console.log("done. Run the app to verify recall, or call /api/agent with memoryOn=true.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
