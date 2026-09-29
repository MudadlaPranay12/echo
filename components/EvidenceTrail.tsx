"use client";
// EvidenceTrail — the chain of comparable decisions.
//
// Every node is exactly 96 × 72 and says only what fits: the case id, the outcome,
// the approver. Text truncates. Nothing grows. When a node is selected the trail
// keeps its geometry and the detail appears in one panel beneath it, so the chain
// stays a straight, uninterrupted line down the page.
//
// Rendered only when a real recall returned comparable cases, so the trail can
// never imply history the agent did not find.

import { useState } from "react";
import type { SimilarCase } from "./echoTypes";
import { cx } from "./ui";

const day = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function Detail({ c }: { c: SimilarCase }) {
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[12px] leading-[1.6]">
      <dt className="text-ink4">Invoice</dt>
      <dd className="truncate font-mono text-ink2">
        {c.invoice_no}
        {c.diff_pct !== null && (
          <span className="ml-2 text-ink4">
            {c.diff_pct > 0 ? "+" : ""}
            {c.diff_pct}%
          </span>
        )}
      </dd>

      <dt className="text-ink4">Approver</dt>
      <dd className="truncate text-ink2">{c.approver}</dd>

      <dt className="text-ink4">Resolved</dt>
      <dd className="text-ink2">
        in {c.days} day{c.days === 1 ? "" : "s"} · {day(c.date)}
      </dd>

      <dt className="text-ink4">Workaround</dt>
      <dd className="text-ink2">{c.workaround}</dd>
    </dl>
  );
}

export default function EvidenceTrail({ cases }: { cases: SimilarCase[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (cases.length === 0) return null;

  const selected = cases.find((c) => c.id === open);

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="echo-trail">
          {cases.map((c) => {
            const approved = c.outcome === "approved";
            const isOpen = open === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  aria-label={`${c.id}, ${c.outcome}. Show detail.`}
                  className="echo-node"
                  data-open={isOpen}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cx(
                        "h-[5px] w-[5px] shrink-0 rounded-full",
                        approved ? "bg-good" : "bg-stop",
                      )}
                    />
                    <span className="truncate font-mono text-[14px] font-medium text-ink">
                      {c.id}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "truncate text-[11px] uppercase leading-none tracking-[0.1em]",
                      approved ? "text-good/90" : "text-stop/90",
                    )}
                  >
                    {c.outcome}
                  </span>
                  <span className="truncate text-[12px] leading-none text-ink4">{c.approver}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {selected && (
        <div className="echo-node-detail mt-3">
          <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
            <span className="font-mono text-[14px] font-medium text-ink">{selected.id}</span>
            <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-ink4">
              {selected.outcome}
            </span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close evidence detail"
              className="ml-auto -mr-2 flex h-[44px] w-[44px] items-center justify-center text-[13px] leading-none text-ink4 hover:text-ink"
            >
              ✕
            </button>
          </div>
          <Detail c={selected} />
        </div>
      )}
    </div>
  );
}
