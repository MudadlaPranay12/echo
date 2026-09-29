// scripts/expansion-util.ts
// Shared surface for the Phase 11 dataset expansion: a deterministic case -> text
// writer that reproduces the seeded narrative format byte-for-byte, and a
// validator that enforces the data-quality invariants the deterministic suite
// checks. Shared by scripts/generate-expansion.ts, scripts/seed-expansion.ts and
// the data-quality tests, so the writer the tests verify is the writer the seed
// actually uses.

import { parseRetainedCase } from "../lib/hindsight";

export const EXPANSION_IDS = { from: 51, to: 200 } as const;

export type ExpFamily = "amount_mismatch" | "missing_po" | "gst_mismatch" | "duplicate_suspect";

export interface ExpansionCase {
  id: string;
  date: string;
  vendor: string;
  invoice_no: string;
  po_no: string | null;
  invoice_amount_inr: number;
  po_amount_inr: number | null;
  diff_pct: number | null;
  exception_type: ExpFamily;
  exception_pattern: string;
  approver: string;
  workaround: string;
  outcome: "approved" | "rejected";
  days_to_resolve: number;
  condition: string;
  decision: string;
  policy_route: string;
  note: string;
}

export const EXPANSION_PEOPLE = [
  "Priya Nair",
  "Suresh Iyer",
  "Kavita Rao",
  "Anika Rao",
  "Rahul Menon",
  "Kavya Shah",
  "Daniel Thomas",
];

/** Prose the retained head uses for each family; canonicalType maps it back. */
export const TYPE_PROSE: Record<ExpFamily, string> = {
  amount_mismatch: "amount mismatch",
  missing_po: "missing PO",
  gst_mismatch: "GST mismatch",
  duplicate_suspect: "duplicate suspect",
};

const inr = (n: number) => n.toLocaleString("en-IN");

/**
 * The written-policy route this case would be routed by, mirroring policyRoute()
 * in echo_agent_core. Kept here so expansion data is validated without importing
 * the agent core.
 */
export function expectedPolicyRoute(c: Pick<ExpansionCase, "exception_type" | "invoice_amount_inr" | "po_amount_inr">): string {
  if (c.exception_type === "duplicate_suspect") return "Reject: duplicate invoice number.";
  if (c.exception_type === "missing_po") return "Reject and return to vendor: no PO number.";
  const d = c.po_amount_inr ? Math.round(((c.invoice_amount_inr - c.po_amount_inr) / c.po_amount_inr) * 10000) / 100 : null;
  if (d !== null && Math.abs(d) <= 2) return "Auto-approve: within 2% of PO.";
  if (c.invoice_amount_inr > 50000) return "CFO approval required: mismatch on invoice above INR 50,000.";
  return "AP Manager review: mismatch above 2%.";
}

/**
 * The retained narrative for one expansion case, written exactly like the seeded
 * corpus so parseRetainedCase reads every field back. The amount sentence for a
 * missing-PO case sits BEFORE the policy clause on purpose: parseRetainedCase's
 * policy capture runs lazily to the next "Handled by", so an amount sentence
 * after the policy would be swallowed into the recorded policy route.
 */
export function buildSeedText(c: ExpansionCase): string {
  const diff = c.diff_pct === null ? "0" : String(c.diff_pct);
  const why =
    c.exception_type === "missing_po"
      ? `no PO number on the invoice. Invoice INR ${inr(c.invoice_amount_inr)}`
      : `invoice INR ${inr(c.invoice_amount_inr)} vs PO INR ${inr(c.po_amount_inr ?? 0)} (${diff}% difference)`;
  return (
    `On ${c.date}, ${c.vendor} invoice ${c.invoice_no} was raised as a ${c.exception_pattern} (${TYPE_PROSE[c.exception_type]}) exception: ${why}. ` +
    `The written policy at the time said: ${c.policy_route} Handled by ${c.approver}. ` +
    `Decision: ${c.decision}. Resolution: ${c.workaround}. Condition relied on: ${c.condition}. Outcome: ${c.outcome} in ${c.days_to_resolve} day(s). Note: ${c.note.replace(/[.\s]+$/, "")}.`
  );
}

const FAMILY_KEYS = Object.keys(TYPE_PROSE) as ExpFamily[];
const EXPANSION_PEOPLE_SET = new Set(EXPANSION_PEOPLE);
const RE_INVOICE = /^INV-[A-Za-z0-9-]+$/;

/**
 * Every data-quality invariant the expansion must satisfy, checked before the
 * battery of round-trip parse checks. Returns a list of problems.
 */
export function validateExpansionCase(c: ExpansionCase): string[] {
  const problems: string[] = [];
  if (!/^C\d{2,3}$/.test(c.id)) problems.push(`${c.id}: id must be C<two or three digits>`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) problems.push(`${c.id}: bad date ${c.date}`);
  if (!RE_INVOICE.test(c.invoice_no)) problems.push(`${c.id}: bad invoice_no ${c.invoice_no}`);
  if (!FAMILY_KEYS.includes(c.exception_type)) problems.push(`${c.id}: unknown family ${c.exception_type}`);
  if (!c.exception_pattern.trim()) problems.push(`${c.id}: empty exception_pattern`);
  if (!EXPANSION_PEOPLE_SET.has(c.approver)) problems.push(`${c.id}: approver ${c.approver} not in the people list`);
  if (c.outcome !== "approved" && c.outcome !== "rejected") problems.push(`${c.id}: bad outcome`);
  if (!Number.isInteger(c.days_to_resolve) || c.days_to_resolve < 1) problems.push(`${c.id}: bad days_to_resolve`);
  if (!c.workaround.trim() || !c.condition.trim() || !c.decision.trim() || !c.note.trim()) problems.push(`${c.id}: empty narrative field`);
  if (!Number.isInteger(c.invoice_amount_inr) || c.invoice_amount_inr <= 0) problems.push(`${c.id}: bad invoice amount`);

  if (c.exception_type === "missing_po") {
    if (c.po_amount_inr !== null) problems.push(`${c.id}: missing-PO case cannot carry a PO amount`);
    if (c.diff_pct !== null) problems.push(`${c.id}: missing-PO case cannot carry a difference`);
  } else {
    if (c.po_amount_inr === null || c.diff_pct === null) {
      problems.push(`${c.id}: amount case requires PO amount and difference`);
    } else {
      const po = c.po_amount_inr;
      if (!Number.isInteger(po) || po <= 0) problems.push(`${c.id}: bad PO amount`);
      const expected = Math.round(((c.invoice_amount_inr - po) / po) * 10000) / 100;
      if (Math.abs(expected - c.diff_pct) > 0.051) problems.push(`${c.id}: diff_pct ${c.diff_pct} inconsistent with amounts (calc ${expected})`);
    }
  }
  if (c.exception_type === "duplicate_suspect" && c.outcome !== "rejected") problems.push(`${c.id}: duplicates are always rejected`);

  const route = expectedPolicyRoute(c);
  if (route !== c.policy_route) problems.push(`${c.id}: policy_route "${c.policy_route}" != expected "${route}"`);

  const text = buildSeedText(c);
  const parsed = parseRetainedCase(c.id, text);
  if (!parsed) {
    problems.push(`${c.id}: retained text failed to parse`);
    return problems;
  }
  const mismatch: string[] = [];
  if (parsed.date !== c.date) mismatch.push(`date "${parsed.date}"`);
  if (parsed.vendor !== c.vendor) mismatch.push(`vendor "${parsed.vendor}"`);
  if (parsed.invoice_no !== c.invoice_no) mismatch.push(`invoice "${parsed.invoice_no}"`);
  if (parsed.exception_type !== c.exception_type) mismatch.push(`type "${parsed.exception_type}"`);
  if (parsed.exception_pattern !== c.exception_pattern) mismatch.push(`pattern "${parsed.exception_pattern}"`);
  if (parsed.diff_pct !== c.diff_pct) mismatch.push(`diff "${parsed.diff_pct}"`);
  if (parsed.invoice_amount_inr !== c.invoice_amount_inr) mismatch.push(`inv "${parsed.invoice_amount_inr}"`);
  if (parsed.po_amount_inr !== c.po_amount_inr) mismatch.push(`po "${parsed.po_amount_inr}"`);
  if (parsed.approver !== c.approver) mismatch.push(`approver "${parsed.approver}"`);
  if (parsed.workaround !== c.workaround) mismatch.push(`workaround "${parsed.workaround}"`);
  if (parsed.outcome !== c.outcome) mismatch.push(`outcome "${parsed.outcome}"`);
  if (parsed.days_to_resolve !== c.days_to_resolve) mismatch.push(`days "${parsed.days_to_resolve}"`);
  if (parsed.condition !== c.condition) mismatch.push(`condition "${parsed.condition}"`);
  if (parsed.policy_route !== c.policy_route) mismatch.push(`policy "${parsed.policy_route}"`);
  if (parsed.note !== c.note) mismatch.push(`note "${parsed.note}"`);
  // decision's parser swallows the following Resolution sentence (TAIL has no
  // Resolution branch), so only the prefix is asserted, as in the live corpus.
  if (!parsed.decision) mismatch.push("no decision");
  else if (parsed.decision !== c.decision && !parsed.decision.startsWith(c.decision)) mismatch.push(`decision "${parsed.decision}"`);
  if (mismatch.length) problems.push(`${c.id}: round-trip mismatch: ${mismatch.join(", ")}`);
  return problems;
}

/** Family distribution across the expansion file, for the report. */
export function expansionSummary(cases: ExpansionCase[]) {
  const families: Record<string, number> = {};
  let approved = 0;
  let rejected = 0;
  for (const c of cases) {
    families[c.exception_type] = (families[c.exception_type] ?? 0) + 1;
    if (c.outcome === "approved") approved++;
    else rejected++;
  }
  const patterns = new Map<string, number>();
  for (const c of cases) patterns.set(c.exception_pattern, (patterns.get(c.exception_pattern) ?? 0) + 1);
  return {
    total: cases.length,
    ids: `${cases[0]?.id ?? "-"}..${cases[cases.length - 1]?.id ?? "-"}`,
    families,
    approved,
    rejected,
    approvalRate: cases.length ? Math.round((approved / cases.length) * 100) : 0,
    distinctPatterns: patterns.size,
    mostRecent: cases.reduce((acc, c) => (c.date > acc ? c.date : acc), ""),
  };
}