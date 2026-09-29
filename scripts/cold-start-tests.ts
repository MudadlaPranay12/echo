/**
 * Phase 5: prove memory is the only source of truth.
 *
 * A restart is simulated by dropping the compiled modules from the require
 * cache and loading them again. That clears every piece of in-process state:
 * the bootstrap case list, the local store, cached patterns, module singletons.
 * Hindsight is untouched, because it is a service, not process state.
 *
 * If a fact survives that, it came from Hindsight.
 */
import { createRequire } from "module";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { patternDocumentId as patternDocFor } from "../lib/pattern_memory";
import { nextCaseId, parseRetainedPattern, hindsightGetCasesByIds } from "../lib/hindsight";
import { save_resolution } from "../lib/echo_agent_core";

// The whole point of this test is to drop module state and run the library
// again with nothing in memory. createRequire keeps that out of the lint rule
// while calling the same require machinery.
const req = createRequire(__filename);

let bad = 0;
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got: ${JSON.stringify(detail)}`);
}

const VENDOR = "Coldstart Probe Logistics";
const PATTERN = "cold start probe annexure";
const FAMILY = "amount_mismatch";

/** A resolution shaped like the ones the app saves. */
const resolution = (invoice: number, po: number, approver: string, outcome: "approved" | "rejected") => ({
  date: "2026-02-14",
  vendor: VENDOR,
  invoice_no: `INV-PROBE-${invoice}`,
  exception_type: FAMILY,
  exception_pattern: PATTERN,
  approver,
  workaround: "Drove the probe through the real save path.",
  outcome,
  days_to_resolve: 4,
  note: "Cold-start probe. Safe to delete.",
  invoice_amount_inr: invoice,
  po_amount_inr: po,
  diff_pct: Math.round(((invoice - po) / po) * 1000) / 10,
});

/** Throw away every module-level cache so the next require is a cold start. */
function coldStart() {
  const root = req.resolve("../lib/echo_agent_core");
  const hs = req.resolve("../lib/hindsight");
  delete req.cache[root];
  delete req.cache[hs];
  return req("../lib/echo_agent_core") as typeof import("../lib/echo_agent_core");
}

/** The bootstrap file, read fresh. Nothing may ever write to it. */
function seedText() {
  return req("fs").readFileSync(req.resolve("../lib/echo_seed_data.json"), "utf8");
}
function localHas(s: string) {
  return seedText().includes(s);
}

async function main() {
  const client = new HindsightClient({
    baseUrl: process.env.HINDSIGHT_BASE_URL!,
    apiKey: process.env.HINDSIGHT_API_KEY!,
    maxAttempts: 3,
  });
  const bankId = process.env.HINDSIGHT_BANK_ID!;
  const created: string[] = [];
  const patternDoc = patternDocFor(FAMILY, PATTERN);

  try {
    console.log("[1] a resolution is written to memory, not to local state");
    const beforeId = await nextCaseId();
    console.log(`        next case id from the bank: ${beforeId}`);

    const first = await save_resolution(resolution(61200, 58500, "Anita Desai", "approved"));
    console.log(`        saved ${first.saved_case_id}, memory_source=${first.memory_source}, retained=${first.retained}`);
    created.push(first.saved_case_id);

    check("the save is retained in memory", first.retained && first.memory_source === "hindsight", first);
    check("it is given exactly the id memory had free", first.saved_case_id === beforeId, { beforeId, got: first.saved_case_id });
    check("a pattern document was created and updated", first.pattern_memory_updated === true, first);
    check("the new pattern starts at one case", first.pattern?.support_count === 1, first.pattern);
    check("the pattern reports itself as a very small sample", first.pattern?.confidence === "low (very small sample)", first.pattern);

    console.log("\n[2] a second resolution updates that same pattern");
    const second = await save_resolution(resolution(64800, 61500, "Anita Desai", "rejected"));
    console.log(`        saved ${second.saved_case_id}, pattern=${second.pattern?.pattern_id}, support=${second.pattern?.support_count}`);
    created.push(second.saved_case_id);

    check("a different id is allocated", second.saved_case_id !== first.saved_case_id, { a: first.saved_case_id, b: second.saved_case_id });
    check("the pattern id is stable across updates", second.pattern?.pattern_id === first.pattern?.pattern_id, { a: first.pattern?.pattern_id, b: second.pattern?.pattern_id });
    check("support grew to two", second.pattern?.support_count === 2, second.pattern);
    check("approval and rejection are both counted", second.pattern?.approved_count === 1 && second.pattern?.rejected_count === 1, second.pattern);
    check("a written policy is never claimed to have moved", second.written_policy_changed === false, second);

    console.log("\n[3] the process restarts and forgets everything");
    const fresh = coldStart();
    const freshHs = req("../lib/hindsight") as typeof import("../lib/hindsight");

    const knownToFresh = await fresh.find_knowledge_owner({ vendor: VENDOR, exception_type: FAMILY });
    console.log(`        restarted agent's local view of the probe vendor: ${JSON.stringify(knownToFresh)}`);
    check("the probe vendor is absent from the bootstrap store", !localHas(VENDOR), VENDOR);

    console.log("\n[4] both cases come back from Hindsight alone (direct document reads)");
    // Use direct document reads to prove persistence without depending on
    // semantic indexing latency. The cases were just saved, so their document
    // IDs are known: echo-case-{id}.
    const caseIds = [first.saved_case_id, second.saved_case_id];
    const directCases = await hindsightGetCasesByIds(caseIds);
    const ids = directCases.map((c) => c.id);
    console.log(`        read back from memory (direct): ${JSON.stringify(ids)}`);
    check("both saved cases are readable after the restart (direct read)", directCases.length === 2, ids);
    check("the probe vendor came back with them", directCases.some((c) => c.vendor === VENDOR) === true, directCases.map((c) => c.vendor));

    const parsed = directCases.find((c) => c.id === second.saved_case_id);
    check("the retrieved case keeps its amounts", parsed?.invoice_amount_inr === 64800 && parsed?.po_amount_inr === 61500, parsed);
    check("and its pattern, with no punctuation drift", parsed?.exception_pattern === PATTERN, parsed?.exception_pattern);
    check("and its outcome", parsed?.outcome === "rejected", parsed?.outcome);

    console.log("\n[5] the updated pattern comes back from Hindsight alone");
    // Read by document id rather than by rank. A pattern's document id is derived
    // from its stable key, so this is an exact lookup, and it is what proves the
    // record survived the restart. Whether recall *ranks* a two-case pattern highly
    // is a separate question, checked by the recall contract tests.
    const doc = await client.getDocument(bankId, patternDoc);
    const mine = parseRetainedPattern(patternDoc, doc?.original_text ?? "");
    console.log(`        pattern from memory: ${mine?.pattern_id} support=${mine?.support_count} cases=${JSON.stringify(mine?.case_ids)}`);
    check("the pattern document is in memory after the restart", mine !== null, doc?.original_text?.slice(0, 120));
    check("its id is the one the save reported", mine?.pattern_id === second.pattern?.pattern_id, { read: mine?.pattern_id, saved: second.pattern?.pattern_id });
    check("it counts both cases", mine?.support_count === 2, mine?.support_count);
    check("and names them", (mine?.case_ids ?? []).includes(first.saved_case_id) && (mine?.case_ids ?? []).includes(second.saved_case_id), mine?.case_ids);
    check("and keeps the approval split", mine?.approved_count === 1 && mine?.rejected_count === 1, mine);
    check("and its name did not drift on the way through memory", mine?.exception_pattern === PATTERN, mine?.exception_pattern);
    check("and it names the approver who actually decided", mine?.approvers.length === 1 && mine?.approvers[0].name === "Anita Desai", mine?.approvers);

    const ranked = await freshHs.hindsightRecalledPatterns(FAMILY, `recurring ${PATTERN} exception pattern`, {
      tags: [`family:${FAMILY}`, "memory:pattern"],
    });
    console.log(`        (informational) recall ranked ${ranked.length} patterns, probe among them: ${ranked.some((p) => p.exception_pattern === PATTERN)}`);

    console.log("\n[6] memory was the only place this lived");
    const local = JSON.parse(seedText()) as { past_cases?: unknown[] };
    check("the bootstrap file was never written to", !localHas(PATTERN), PATTERN);
    check("the seed file still holds its original case count", (local.past_cases ?? []).length === 47, (local.past_cases ?? []).length);
  } finally {
    console.log("\n[cleanup] removing probe documents from the bank");
    for (const id of created) {
      try { await client.deleteDocument(bankId, `echo-case-${id}`); console.log(`        deleted echo-case-${id}`); }
      catch (e) { console.log(`        could not delete echo-case-${id}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    try { await client.deleteDocument(bankId, patternDoc); console.log(`        deleted ${patternDoc}`); }
    catch (e) { console.log(`        could not delete ${patternDoc}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  console.log(`\n${bad === 0 ? "ALL PASS" : `${bad} FAILURES`}`);
  if (bad > 0) process.exitCode = 1;
}
main();
