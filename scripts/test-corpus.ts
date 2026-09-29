// The seeded corpus, read the same way runtime recall reads it: as text Hindsight
// retained. Tests build their fixtures from these strings rather than inventing
// new shapes, so a change to the retained format fails the tests instead of
// silently passing against a format nothing uses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRetainedCase, type RecalledCase } from "../lib/hindsight";

interface SeedCase {
  id: string;
  exception_type: string;
  outcome: string;
  invoice_amount_inr: number;
  retain_text: string;
}
interface SeedFile {
  past_cases: SeedCase[];
}

const seedPath = join(process.cwd(), "lib", "echo_seed_data.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;

export const seedCases: SeedCase[] = seed.past_cases;

/** A real seeded case, parsed back out of its retained text. */
export function seedCase(id: string): RecalledCase {
  const found = seedCases.find((c) => c.id === id);
  if (!found) throw new Error(`no seeded case ${id}`);
  const parsed = parseRetainedCase(found.id, found.retain_text);
  if (!parsed) throw new Error(`seeded case ${id} did not parse`);
  return parsed;
}

/** Every seeded case, parsed. Fails loudly if the format drifts. */
export function allSeedCases(): RecalledCase[] {
  return seedCases.map((c) => {
    const parsed = parseRetainedCase(c.id, c.retain_text);
    if (!parsed) throw new Error(`seeded case ${c.id} did not parse`);
    return parsed;
  });
}

/** Retained text in the exact shape save_resolution writes, not the seeded one. */
export function savedCaseText(parts: {
  date: string; vendor: string; invoice_no: string; exception_type: string;
  approver: string; workaround: string; outcome: "approved" | "rejected";
  days: number; note?: string; condition?: string; decision?: string; policy_route?: string;
}): string {
  return (
    `${parts.date} ${parts.vendor} ${parts.invoice_no} (${parts.exception_type}): handled by ${parts.approver}. ` +
    `${parts.workaround}. Outcome: ${parts.outcome} in ${parts.days} day(s). ${parts.note ?? ""}` +
    (parts.condition ? ` Condition relied on: ${parts.condition}.` : "") +
    (parts.decision ? ` Decision: ${parts.decision}.` : "") +
    (parts.policy_route ? ` Written policy at the time: ${parts.policy_route}` : "")
  );
}
