// scripts/generate-expansion.ts
// Deterministically generates the Phase 11 dataset expansion (ids C51-C200) and
// writes scripts/echo_expansion.json. A seeded PRNG keeps the output stable, so
// the committed fixture and the data-quality tests always agree. Run once:
//   npm run build:test && node .test-build/scripts/generate-expansion.js
// The output is committed; generation is idempotent only by construction.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPANSION_IDS,
  expectedPolicyRoute,
  type ExpansionCase,
  type ExpFamily,
} from "./expansion-util";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260929);
const ri = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Vendor {
  name: string;
  prefix: string;
  lo: number;
  hi: number;
}

const VENDORS: Vendor[] = [
  { name: "Northwind Freight", prefix: "INV-NW-", lo: 1138, hi: 1380 },
  { name: "Contoso Cloud Services", prefix: "INV-CC-", lo: 2321, hi: 2530 },
  { name: "Contoso Industrial", prefix: "INV-CI-", lo: 4521, hi: 4720 },
  { name: "Zenith Procurement", prefix: "INV-ZPR-", lo: 1311, hi: 1490 },
  { name: "Alpine Components", prefix: "INV-AC-", lo: 2231, hi: 2410 },
];

interface PatternDef {
  pattern: string;
  rate: number; // base approval probability, 0 and 1 lock the outcome
  condition: string;
  workaround: string;
}

const PATTERNS: Record<ExpFamily, PatternDef[]> = {
  amount_mismatch: [
    { pattern: "small price variance", rate: 0.85, condition: "variance under 3%", workaround: "procurement re-baselined the rate against the signed rate card" },
    { pattern: "contract price mismatch", rate: 0.7, condition: "signed rate-card amendment attached", workaround: "contract revision was on file and was matched before payment" },
    { pattern: "currency rounding", rate: 0.9, condition: "FX rounding was under 1% of the order", workaround: "currency conversion drift was reconciled at the billed rate" },
    { pattern: "quantity mismatch", rate: 0.6, condition: "quantity variance matched the delivery note", workaround: "counted delivery matched the billed quantity after recount" },
    { pattern: "partial shipment", rate: 0.75, condition: "remaining shipment was scheduled and evidenced", workaround: "billing for the first tranche was released once the carrier manifest matched" },
    { pattern: "split shipment", rate: 0.65, condition: "both delivery notes matched before payment", workaround: "split deliveries were consolidated and verified against two delivery notes" },
    { pattern: "damaged goods", rate: 0.6, condition: "vendor credit note issued", workaround: "the damaged portion was adjusted with a credit note on the next schedule" },
    { pattern: "fuel surcharge at origin", rate: 0.55, condition: "origin surcharge under 3%", workaround: "the fuel adjustment was charged at origin and capped under the lane cap" },
    { pattern: "express rate adjustment", rate: 0.8, condition: "written expedite approval present", workaround: "the expedite rate was pre-approved and applied to the difference only" },
    { pattern: "retroactive rate correction", rate: 0.7, condition: "rate correction letter attached", workaround: "the corrected rate was applied going forward and to this invoice only" },
  ],
  missing_po: [
    { pattern: "late PO creation", rate: 0.3, condition: "no written emergency pre-approval", workaround: "the AP lead would not back-date a purchase order without an emergency note" },
    { pattern: "emergency procurement", rate: 0.25, condition: "no documented emergency justification", workaround: "the team requested down-channel goods without raising a PO or a waiver" },
    { pattern: "retroactive PO", rate: 0.8, condition: "retro PO against an existing framework agreement", workaround: "the PO was raised against the framework and the invoice cleared on it" },
    { pattern: "framework agreement billing", rate: 0.9, condition: "invoice within the framework ceiling", workaround: "billing was netted against the open framework commitment" },
  ],
  gst_mismatch: [
    { pattern: "tax discrepancy", rate: 0.6, condition: "SAC/HSN code and tax rate checked", workaround: "the GST line was recomputed at the code-level rate and re-reconciled" },
    { pattern: "wrong tax rate", rate: 0.5, condition: "tax invoice corrected by the vendor", workaround: "the vendor re-issued the tax line at the applicable rate before settlement" },
    { pattern: "SAC code mismatch", rate: 0.55, condition: "SAC code corrected on the debit note", workaround: "the service classification was corrected and the credit rebooked" },
  ],
  duplicate_suspect: [
    { pattern: "duplicate invoice number", rate: 0, condition: "two invoices for one delivery", workaround: "the resubmitted invoice was rejected as a duplicate" },
    { pattern: "repeated billing", rate: 0, condition: "same line repeated across two invoices", workaround: "the second billing of the same delivery was rejected" },
  ],
};

function approverFor(inv: number): string {
  if (inv > 50000) {
    return rand() < 0.7 ? "Kavita Rao" : pick(["Priya Nair", "Kavya Shah"]);
  }
  return pick(["Suresh Iyer", "Rahul Menon", "Anika Rao", "Daniel Thomas", "Priya Nair"]);
}

/** Indian-grouped or plain invoice numbers per vendor base range. */
function nextInvoice(v: Vendor): string {
  const n = v.lo + Math.floor(rand() * (v.hi - v.lo + 1));
  return `${v.prefix}${n}`;
}

interface PlannedCase {
  family: ExpFamily;
  pattern: string;
  workaround: string;
  condition: string;
  rate: number;
}

function planCases(): PlannedCase[] {
  const plan: PlannedCase[] = [];
  const counts: Record<ExpFamily, number> = { amount_mismatch: 70, missing_po: 45, gst_mismatch: 20, duplicate_suspect: 15 };
  (Object.keys(counts) as ExpFamily[]).forEach((family) => {
    for (let i = 0; i < counts[family]; i++) {
      const def = pick(PATTERNS[family]);
      plan.push({ family, pattern: def.pattern, workaround: def.workaround, condition: def.condition, rate: def.rate });
    }
  });
  // interleave families so every family appears across the whole date window
  // (deterministic shuffle with the seeded PRNG, not Math.random)
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan;
}

function dateAfter(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function main() {
  const planned = planCases();
  let idCounter = EXPANSION_IDS.from;
  const cases: ExpansionCase[] = [];
  const usedInvoices = new Set<string>();

  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const family = p.family;
    const vendor = pick(VENDORS);
    let invoice_no = nextInvoice(vendor);
    while (usedInvoices.has(invoice_no)) invoice_no = nextInvoice(vendor);
    usedInvoices.add(invoice_no);

    let invoice_amount_inr: number;
    let po_amount_inr: number | null;
    let diff_pct: number | null;

    if (family === "missing_po") {
      invoice_amount_inr = ri(12000, 420000);
      po_amount_inr = null;
      diff_pct = null;
    } else {
      // route split: ~14% auto-approve band, rest above 2%
      const auto = family === "duplicate_suspect" || rand() < 0.14;
      const above50 = rand() < 0.52;
      invoice_amount_inr = above50 ? ri(52000, 600000) : ri(9000, 49000);
      const targetDiff = auto ? round2(rand() * 1.9) : round2(2 + rand() * 10);
      po_amount_inr = Math.round((invoice_amount_inr / (1 + targetDiff / 100)) / 10) * 10;
      diff_pct = round2(((invoice_amount_inr - po_amount_inr) / po_amount_inr) * 100);
      invoice_amount_inr = po_amount_inr + Math.round((po_amount_inr * diff_pct) / 100);
    }

    const inv = invoice_amount_inr;
    const route = expectedPolicyRoute({ exception_type: family, invoice_amount_inr: inv, po_amount_inr });
    const outcome = p.rate === 0 ? "rejected" : p.rate === 1 ? "approved" : rand() < p.rate ? "approved" : "rejected";
    const decision =
      outcome === "approved"
        ? inv > 50000 && rand() < 0.6
          ? "escalated to CFO, approved"
          : rand() < 0.5
            ? "approved with condition"
            : "approved"
        : pick(["rejected", "held", "rejected for documentation"]);

    cases.push({
      id: `C${idCounter++}`,
      date: "PLACEHOLDER",
      vendor: vendor.name,
      invoice_no,
      po_no: po_amount_inr === null ? null : `PO-${vendor.name.split(" ")[0].toUpperCase()}-${ri(10000, 99999)}`,
      invoice_amount_inr: inv,
      po_amount_inr,
      diff_pct,
      exception_type: family,
      exception_pattern: p.pattern,
      approver: approverFor(inv),
      workaround: p.workaround,
      outcome,
      days_to_resolve: outcome === "approved" ? ri(1, 6) : ri(3, 16),
      condition: p.condition,
      decision,
      policy_route: route,
      note: "Expansion dataset case.",
    });
  }

  // dates: spread across 2025-03 .. mid-2026 with per-family fresh tails
  const gapOf = (outcome: "approved" | "rejected") => (outcome === "approved" ? ri(2, 7) : ri(3, 12));
  let cursor = 0;
  for (let i = 0; i < cases.length; i++) {
    cursor += gapOf(cases[i].outcome);
    if (cursor > 540) cursor = ri(480, 540);
    cases[i].date = dateAfter(new Date(2025, 2, 1), cursor);
  }
  // per-family fresh tail: force each family's newest case into Aug/Sep 2026
  const newest = new Map<ExpFamily, number>();
  cases.forEach((c, i) => {
    const prev = newest.get(c.exception_type);
    if (prev === undefined || c.date > cases[prev].date) newest.set(c.exception_type, i);
  });
  let tail = 0;
  for (const [, idx] of newest) {
    cases[idx].date = dateAfter(new Date(2026, 7, 20), tail); // 2026-08-20 +
    tail += ri(1, 14);
  }

  // honest variety: no approve-capable pattern may look one-sided. Flip the
  // NEWEST case of any pattern with only one outcome, so the freshest memory is
  // the corrective one. Duplicates stay all-rejected by policy.
  const byPattern = new Map<string, { approved: number; rejected: number; newestIdx: number }>();
  cases.forEach((c, i) => {
    const s = byPattern.get(c.exception_pattern) ?? { approved: 0, rejected: 0, newestIdx: -1 };
    s[c.outcome === "approved" ? "approved" : "rejected"]++;
    if (s.newestIdx < 0 || c.date > cases[s.newestIdx].date) s.newestIdx = i;
    byPattern.set(c.exception_pattern, s);
  });
  for (const s of byPattern.values()) {
    const idx = s.newestIdx;
    if (idx < 0) continue;
    const c = cases[idx];
    if (c.exception_type === "duplicate_suspect") continue;
    if (s.approved === 0 || s.rejected === 0) {
      c.outcome = s.approved === 0 ? "approved" : "rejected";
      c.decision = c.outcome === "approved" ? "approved with condition" : "held";
      c.days_to_resolve = c.outcome === "approved" ? ri(1, 4) : ri(3, 12);
    }
  }

  // drop the random-sorted plan leftover and sort deterministically by id for a stable file
  cases.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  const out = join(process.cwd(), "scripts", "echo_expansion.json");
  writeFileSync(out, JSON.stringify(cases, null, 2) + "\n", "utf8");
  const families: Partial<Record<ExpFamily, number>> = {};
  for (const c of cases) families[c.exception_type] = (families[c.exception_type] ?? 0) + 1;
  console.log(`wrote ${out}`);
  console.log("families:", families);
  console.log(`range: ${cases[0].id} (${cases[0].date}) .. ${cases[cases.length - 1].id} (${cases[cases.length - 1].date})`);
}

main();