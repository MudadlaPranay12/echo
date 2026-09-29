"use client";
// CaseList — zone 1, the operational queue.
//
// 288px wide. Every case is one card — the same surface, border, radius and
// padding as the memory rail's frames — and the cards stack 8px apart so the
// queue reads as a set of distinct blocks. A card carries four things: the case
// id, the vendor, the exception, and a status value. The selected card is the
// brighter one: a teal-tinted surface, a 4px teal accent on the left edge, and
// text that steps up a brightness level.

import { useMemo, useState } from "react";
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
        className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-good/15 text-good"
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
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-current={selected ? "true" : undefined}
        className={cx(
          "echo-queue-row group flex w-full flex-col gap-1 rounded-[12px] border border-line bg-sunken px-4 py-3.5 text-left transition-colors",
          "disabled:pointer-events-none disabled:opacity-40",
          !selected && "hover:border-line2 hover:bg-surface-2",
        )}
      >
        {/* case id + status */}
        <span className="flex items-center gap-2">
          <span
            className={cx(
              "truncate font-mono text-[12px] tabular-nums",
              selected ? "font-medium text-teal" : "text-ink",
            )}
          >
            {c.invoiceNo}
          </span>
          <span className="ml-auto">
            <StatusMarker settled={settled} live={selected} />
          </span>
        </span>

        {/* vendor */}
        <span
          className={cx(
            "truncate text-[14px] leading-[1.3] text-ink",
            selected && "font-semibold",
          )}
        >
          {c.vendor}
        </span>

        {/* exception + variance */}
        <span className="flex items-baseline gap-2">
          <span
            className={cx(
              "truncate text-[12px] leading-[1.3]",
              selected ? "text-ink2" : "text-ink3 group-hover:text-ink2",
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

  return (
    <aside className="flex min-h-0 w-[288px] shrink-0 flex-col border-r border-line bg-rail">
      <div className="flex h-[48px] shrink-0 items-center gap-2 border-b border-line px-4">
        <Lbl className="text-ink2">{title}</Lbl>
        <span className="ml-auto font-mono text-[12px] text-ink4">{filtered.length}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close queue"
            className="-mr-2 flex h-[44px] w-[44px] items-center justify-center text-[13px] leading-none text-ink4 hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      <div className="shrink-0 border-b border-line p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter queue"
          aria-label="Filter exception queue"
          className="echo-filter h-[44px] w-full rounded-[12px] border border-line bg-sunken px-3 text-[14px] text-ink outline-none placeholder:text-ink4"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-3">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-[13px] leading-[1.6] text-ink4">
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
    </aside>
  );
}
