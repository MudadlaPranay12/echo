"use client";
// CaseFacts — the numbers before any argument.
// An investigator starts with the ledger, not the summary. Four figures, set in
// the mono face with tabular figures, separated by hairlines instead of cards.

import type { CaseItem } from "./echoTypes";
import { cx } from "./ui";

/** The written policy's tolerance band, as stated in the agent's policy route. */
const TOLERANCE_PCT = 2;

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Metric({
  label,
  value,
  sub,
  tone,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "stop" | "mute";
  delay: number;
}) {
  return (
    <div
      className="echo-rise min-w-0 flex-1 px-4 py-3 first:pl-0 last:pr-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.15em] text-ink3">
        {label}
      </div>
      <div
        className={cx(
          "mt-2 font-mono text-[15px] leading-none tracking-tight tabular-nums",
          tone === "good" && "text-good",
          tone === "warn" && "text-warn",
          tone === "stop" && "text-stop",
          (!tone || tone === "mute") && "text-ink",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 truncate text-[10.5px] leading-none text-ink4">{sub}</div>
      )}
    </div>
  );
}

export default function CaseFacts({ c }: { c: CaseItem }) {
  const variance = c.po !== null ? ((c.invoice - c.po) / c.po) * 100 : null;
  const over = variance !== null && Math.abs(variance) > TOLERANCE_PCT;
  const far = variance !== null && Math.abs(variance) >= 5;

  return (
    <div className="flex divide-x divide-line border-b border-line bg-sunken/45">
      <Metric
        label="Invoice"
        value={inr(c.invoice)}
        sub={c.invoiceNo}
        delay={0}
      />
      <Metric
        label="Purchase order"
        value={c.po === null ? "—" : inr(c.po)}
        sub={c.poRef ?? "no reference"}
        tone={c.po === null ? "stop" : undefined}
        delay={45}
      />
      <Metric
        label="Variance"
        value={
          variance === null
            ? "—"
            : `${variance > 0 ? "+" : ""}${Number(variance.toFixed(2))}%`
        }
        sub={variance === null ? "cannot be computed" : "invoice vs PO"}
        tone={over ? (far ? "stop" : "warn") : "good"}
        delay={90}
      />
      <Metric
        label="Against policy"
        value={variance === null ? "Missing PO" : over ? "Outside" : "Within"}
        sub={
          variance === null
            ? "no PO on record"
            : over
              ? `${TOLERANCE_PCT}% tolerance`
              : `${TOLERANCE_PCT}% tolerance`
        }
        tone={variance === null ? "stop" : over ? (far ? "stop" : "warn") : "good"}
        delay={135}
      />
    </div>
  );
}
