"use client";
// CaseFacts — the money, before any argument.
//
// A four-column grid of identical cells. Equal width, equal height, equal
// padding, one number size. No metric is allowed to look more important than
// another, because at this point none of them is: they are the four quantities
// the whole investigation is about.
//
// Financial numbers: 32-36px per spec.

import type { CaseItem } from "./echoTypes";
import { cx } from "./ui";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Cell({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "good" | "warn" | "stop";
}) {
  return (
    <div className="flex h-[104px] flex-col justify-center gap-1.5 border-r border-line px-5 last:border-r-0">
      <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-ink4">
        {label}
      </div>
      <div
        className={cx(
          "font-mono text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums",
          tone === "good" && "text-good",
          tone === "warn" && "text-warn",
          tone === "stop" && "text-stop",
          !tone && "text-ink",
        )}
      >
        {value}
      </div>
      {meta && <div className="font-mono text-[12px] leading-none text-ink4">{meta}</div>}
    </div>
  );
}

export default function CaseFacts({ c }: { c: CaseItem }) {
  const variance = c.po !== null ? ((c.invoice - c.po) / c.po) * 100 : null;
  const over = variance !== null && Math.abs(variance) > 2;
  const far = variance !== null && Math.abs(variance) >= 5;

  return (
    <div className="grid grid-cols-4 border-y border-line">
      <Cell label="Invoiced" value={inr(c.invoice)} meta="as billed" />
      <Cell
        label="Purchase Order"
        value={c.po === null ? "—" : inr(c.po)}
        meta={c.poRef ?? "no reference"}
        tone={c.po === null ? "stop" : undefined}
      />
      <Cell
        label="Variance"
        value={variance === null ? "—" : `${Number(variance.toFixed(2))}%`}
        meta={variance === null ? "not computable" : over ? "outside 2% tolerance" : "within 2% tolerance"}
        tone={variance === null ? "stop" : over ? (far ? "stop" : "warn") : "good"}
      />
      <Cell
        label="Against Policy"
        value={variance === null ? "Missing PO" : over ? "Outside" : "Within"}
        meta={variance === null ? "—" : "2% tolerance"}
        tone={variance === null ? "stop" : over ? (far ? "stop" : "warn") : "good"}
      />
    </div>
  );
}
