// One-off, surgical edit of lib/echo_seed_data.json.
//
// The 10 missing_po cases never stated their invoice value in the text Hindsight
// retains, so nothing in memory could tell a sub-INR-50,000 case from a
// supra-INR-50,000 one. The amount is already present in each case's structured
// `invoice_amount_inr` field, so this copies that existing value into the
// retained text. No case is added, removed or renumbered, and no figure is
// invented: the script refuses to run if any case lacks a structured amount.
//
// Edits the raw text in place rather than re-serialising, so no unrelated
// formatting in the file can change.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "lib", "echo_seed_data.json");
const raw = readFileSync(path, "utf8");
const data = JSON.parse(raw);

const inr = (n) => n.toLocaleString("en-IN");
let changed = 0;
const report = [];

for (const c of data.past_cases) {
  if (c.retain_text.includes("invoice INR")) continue;
  if (typeof c.invoice_amount_inr !== "number") {
    throw new Error(`${c.id} has no structured invoice_amount_inr; refusing to invent one`);
  }
  const before = c.retain_text;
  // Insert the amount as its own sentence immediately before "Handled by", which
  // both corpus writers use as the boundary after the exception clause.
  const after = before.replace(" Handled by ", ` Invoice INR ${inr(c.invoice_amount_inr)}. Handled by `);
  if (after === before) throw new Error(`${c.id} retain_text has no "Handled by" boundary`);
  c.retain_text = after;
  changed++;
  report.push(`  ${c.id} ${c.exception_type} INR ${inr(c.invoice_amount_inr)}`);
}

if (changed !== 10) throw new Error(`expected to update 10 cases, updated ${changed}`);

// Re-serialise with the file's existing 2-space indent, then splice the new
// retain_text values back into the original raw text by exact match.
const json = `${JSON.stringify(data, null, 2)}\n`;
const originalValues = JSON.parse(raw).past_cases.map((c) => c.retain_text);
const newValues = data.past_cases.map((c) => c.retain_text);

let out = json;
for (let i = 0; i < originalValues.length; i++) {
  if (originalValues[i] === newValues[i]) continue;
  out = out.replace(
    `"retain_text": ${JSON.stringify(originalValues[i])}`,
    `"retain_text": ${JSON.stringify(newValues[i])}`,
  );
}
if (out.includes(originalValues.find((v, i) => v !== newValues[i]))) {
  throw new Error("at least one retain_text was not replaced");
}

writeFileSync(path, out, "utf8");
console.log(`updated ${changed} retain_text values:`);
console.log(report.join("\n"));
console.log("cases in file:", data.past_cases.length);
