"use client";
// CaseList — zone 1, the operational queue.
//
// It fills whatever the grid gives it (280px on a wide desktop, 260px on a
// laptop) and never sets a width of its own, so the centre column can never be
// squeezed by the queue. The panel head and the filter are `flex: 0 0 auto`; only
// the card list scrolls, which is what keeps the selected case and the filter in
// view at 720px of height.
//
// A card carries four things: the case id (small), the vendor (the loudest line),
// the exception, and a status value right-aligned. The selected card is the
// brighter one — a teal wash, a 3px teal accent on the left edge, and text that
// steps up a brightness level.

import { useEffect, useMemo, useState } from "react";
import type { CaseItem } from "./echoTypes";
import { Lbl, cx } from "./ui";

type Props = {
  title: string;
  items: CaseItem[];
  activeKey: string | null;
  onSelect: (c: CaseItem) => void;
  busy?: boolean;
  /** Keys already resolved in this session — shown with a settled marker. */
  resolved?: string[];
  onClose?: () => void;
};

const TOLERANCE_PCT = 2;

function varianceTone(c: CaseItem): string {
  if (c.po === null) return "text-stop";
  const v = Math.abs(((c.invoice - c.po) / c.po) * 100);
  if (v <= TOLERANCE_PCT) return "text-good";
  return v < 5 ? "text-warn" : "text-stop";
}

function StatusMarker({ settled, live }: { settled: boolean; live: boolean }) {
  if (settled) {
    return (
      <span
        aria-label="Resolved"
        title="Resolved"
        className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-good-wash text-good"
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.4 6.3 4.8 8.7 9.6 3.6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (live) {
    return (
      <span
        aria-label="Under investigation"
        title="Under investigation"
        className="echo-live h-[6px] w-[6px] shrink-0 rounded-full bg-teal"
      />
    );
  }
  return <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-line2" />;
}

function CaseRow({
  c,
  selected,
  settled,
  onSelect,
  disabled,
}: {
  c: CaseItem;
  selected: boolean;
  settled: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <li id={`echo-queue-${c.key}`}>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-current={selected ? "true" : undefined}
        className={cx(
          "echo-queue-row flex w-full flex-col gap-1 rounded-[10px] border px-3 py-3 text-left",
          "transition-colors",
          selected ? "border-teal-soft bg-teal-wash" : "border-line bg-sunken hover:border-line2 hover:bg-surface-2",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {/* case id + status */}
        <span className="flex items-center gap-2">
          <span
            className={cx(
              "truncate font-mono text-[11px] tabular-nums",
              selected ? "text-teal" : "text-ink3",
            )}
          >
            {c.invoiceNo}
          </span>
          <span className="ml-auto">
            <StatusMarker settled={settled} live={selected} />
          </span>
        </span>

        {/* vendor — the loudest line on the card */}
        <span
          className={cx(
            "truncate text-[14px] leading-[1.35] text-ink",
            selected && "font-semibold",
          )}
        >
          {c.vendor}
        </span>

        {/* exception + variance, variance hard right */}
        <span className="flex items-baseline gap-2">
          <span
            className={cx(
              "truncate text-[11px] leading-[1.35]",
              selected ? "text-ink2" : "text-ink4",
            )}
          >
            {c.exception.replace(/_/g, " ")}
          </span>
          <span className={cx("ml-auto shrink-0 font-mono text-[12px] tabular-nums", varianceTone(c))}>
            {c.label}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function CaseList({
  title,
  items,
  activeKey,
  onSelect,
  busy,
  resolved = [],
  onClose,
}: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (c) =>
        c.vendor.toLowerCase().includes(needle) ||
        c.invoiceNo.toLowerCase().includes(needle) ||
        c.exception.toLowerCase().includes(needle),
    );
  }, [items, q]);

  /* The selected case is scrolled into view whenever it changes, so it can
     never end up off the top of an independently scrolling queue. */
  useEffect(() => {
    if (!activeKey) return;
    document
      .getElementById(`echo-queue-${activeKey}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="echo-panel-head">
        <Lbl className="text-ink2">{title}</Lbl>
        <span className="ml-auto font-mono text-[12px] text-ink4">{filtered.length}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close queue"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-ink4 hover:bg-sunken hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      <div className="echo-panel-sub">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter queue"
          aria-label="Filter exception queue"
          className="echo-filter h-9 w-full rounded-[10px] border border-line bg-sunken px-3 text-[13px] text-ink outline-none"
        />
      </div>

      <div className="echo-scroll px-3 pb-4 pt-3">
        {filtered.length === 0 ? (
          <p className="px-1 py-8 text-[13px] leading-[1.6] text-ink4">
            {q.trim() ? `Nothing matches “${q.trim()}”.` : "Queue is empty."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <CaseRow
                key={c.key}
                c={c}
                selected={c.key === activeKey}
                settled={resolved.includes(c.key)}
                onSelect={() => onSelect(c)}
                disabled={!!busy}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
