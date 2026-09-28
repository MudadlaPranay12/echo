"use client";
// CaseList — zone 1, the exception queue.
// Triage order matters more than decoration here, so each row leads with the
// exception type and the variance that caused it, then names the vendor and the
// amount. Rows, not cards. Selected row carries a single accent bar.

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

function SearchGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink4"
    >
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CaseRow({
  c,
  selected,
  settled,
  onSelect,
  delay,
  disabled,
}: {
  c: CaseItem;
  selected: boolean;
  settled: boolean;
  onSelect: () => void;
  delay: number;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={selected ? "true" : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={cx(
        "echo-rise group relative block w-full rounded-[6px] py-2 pl-3 pr-2.5 text-left",
        "transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.99]",
        disabled && "pointer-events-none opacity-45",
        selected ? "bg-teal-wash shadow-soft" : "hover:bg-sunken",
      )}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-teal" />
      )}

      <span className="flex items-baseline justify-between gap-2">
        <span
          className={cx(
            "truncate text-[11px] transition-colors",
            selected ? "text-teal" : "text-ink3 group-hover:text-ink2",
          )}
        >
          {c.exception.replace(/_/g, " ")}
        </span>
        <span
          className={cx(
            "shrink-0 font-mono text-[10px] tabular-nums transition-colors",
            varianceTone(c),
            selected && "opacity-90",
          )}
        >
          {c.label}
        </span>
      </span>

      <span
        className={cx(
          "mt-1 block truncate text-[12.5px] transition-colors",
          selected ? "font-medium text-ink" : "text-ink2 group-hover:text-ink",
        )}
      >
        {c.vendor}
      </span>

      <span className="mt-0.5 flex items-center gap-1.5">
        <span className="font-mono text-[10.5px] text-ink3">{c.invoiceNo}</span>
        {settled && (
          <span
            aria-label="Resolved"
            title="Resolved"
            className="inline-flex h-[11px] w-[11px] items-center justify-center rounded-full bg-good/12 text-good"
          >
            <svg width="7" height="7" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2.4 6.3 4.8 8.7 9.6 3.6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink4">
          ₹{c.invoice.toLocaleString("en-IN")}
        </span>
      </span>
    </button>
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
    <div className="flex min-h-0 w-[236px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="shrink-0 px-3.5 pb-2.5 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <Lbl className="text-ink2">{title}</Lbl>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-ink4">{filtered.length}</span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close queue"
                className="-mr-1 rounded px-1 text-[13px] leading-none text-ink4 transition-colors hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="relative mt-2.5">
          <SearchGlyph />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter queue"
            aria-label="Filter exception queue"
            className="h-[28px] w-full rounded-[6px] border border-line bg-base pl-7 pr-2 text-[12px] text-ink outline-none transition-colors placeholder:text-ink4 focus:border-teal-soft focus:bg-surface"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11.5px] leading-relaxed text-ink4">
            {q.trim() ? `Nothing matches “${q.trim()}”.` : "Queue is empty."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c, i) => (
              <li key={c.key}>
                <CaseRow
                  c={c}
                  selected={c.key === activeKey}
                  settled={resolved.includes(c.key)}
                  onSelect={() => onSelect(c)}
                  delay={i * 30}
                  disabled={!!busy}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
