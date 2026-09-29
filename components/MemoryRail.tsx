"use client";
// MemoryRail — zone 3, institutional memory.
//
// Three sections, in this order, and every value in them is read out of the
// recall result — never derived from the invoice, never written by the model:
//
//   MEMORY             COMPUTED  how much comparable evidence exists
//   OBSERVED PATTERN   EVIDENCE  what pattern the memory actually holds
//   CONDITION          EVIDENCE  the condition those decisions share
//
// then the comparable decisions themselves, searchable, then the source footer.
//
// ---------------------------------------------------------------------------
// Why OBSERVED PATTERN used to say "No pattern" while MEMORY said "5 cases".
//
// The two figures come from two unrelated vocabularies, and joining them on
// their text was the bug:
//
//   stats.top_condition.label  is a CANONICAL label produced by regex-matching
//                              each case's `workaround` against a fixed table
//                              ("fuel-surcharge annexure attached"). See
//                              lib/echo_agent_core.ts computeStats().
//
//   pattern.conditions[]       is a tally of each case's literal `condition`
//                              field. See lib/pattern_memory.ts
//                              aggregatePattern().
//
// For the comparable cases behind the fuel-surcharge precedent, `condition` is
// empty and the evidence lives in the `workaround` prose — so `conditions` is
// empty while `top_condition` is populated. `conditions.includes(top_condition.label)`
// was therefore always false, and the frame fell through to "No pattern". The
// `&& topCondition` guard made it worse: a null top_condition could never render
// a pattern at all.
//
// The fix does not loosen a string match. The reliable join key is the case id:
// `supporting_cases_on_screen` is the intersection of the pattern's retained
// case ids with the ids actually on screen, so both sides of the comparison are
// the same vocabulary. Where no pattern document exists, the frame falls back to
// a deterministic aggregation of the comparable cases that are on screen, and
// says so. It never invents a pattern.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import type { Evidence, PatternView, SimilarCase } from "./echoTypes";
import { observedConditions, observedPatterns, primaryCondition } from "./railEvidence";
import { Lbl, cx, useCountUp } from "./ui";
import ProvenanceChip from "./ProvenanceChip";

type Props = {
  memoryOn: boolean;
  evidence: Evidence;
  /** Rows are held back until the recall counter has settled. */
  evidenceReady: boolean;
  /** Fired once the outcome tally finishes counting, so rows can be revealed. */
  onSettled?: () => void;
  /** Bumped once per real saved resolution; drives a single sweep down the rail. */
  pulse?: number;
  onClose?: () => void;
};

const day = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

/* ------------------------------------------------------------------ section */

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="echo-mem-section">
      <div className="flex items-center gap-2">
        <Lbl className="text-ink2">{title}</Lbl>
        {meta && <span className="ml-auto shrink-0">{meta}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- one pattern */

/** A pattern document that is genuinely supported by cases on screen. */
function PatternRow({ p }: { p: PatternView }) {
  const onScreen = p.supporting_cases_on_screen;
  return (
    <li className="echo-mem-pattern">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.45] text-ink">
          {p.exception_pattern}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink4">
          {p.approved_count}/{p.support_count}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink4">
        <span>
          {p.support_count} supporting {p.support_count === 1 ? "case" : "cases"}
        </span>
        {p.last_seen && <span aria-hidden="true">·</span>}
        {p.last_seen && <span>last seen {day(p.last_seen)}</span>}
      </div>
      {onScreen.length > 0 && (
        <p className="mt-1.5 font-mono text-[11px] leading-[1.5] text-ink3">
          on screen: {onScreen.join(", ")}
        </p>
      )}
    </li>
  );
}

/**
 * A pattern that exists only as a grouping of the comparable cases actually on
 * screen. Real counts, real family, real condition — and labelled for what it
 * is: computed from the evidence, not read from a pattern document.
 */
function DerivedPatternRow({
  family,
  condition,
  support,
  approved,
}: {
  family: string;
  condition: string | null;
  support: number;
  approved: number;
}) {
  return (
    <li className="echo-mem-pattern">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.45] text-ink">
          {family.replace(/_/g, " ")}
          {condition && (
            <span className="font-normal text-ink2"> · {condition.toLowerCase()}</span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink4">
          {approved}/{support}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink4">
        <span>
          {support} supporting {support === 1 ? "case" : "cases"}
        </span>
        <span aria-hidden="true">·</span>
        <span>aggregated from the comparable decisions on screen</span>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- a card */

function DocumentIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border border-line bg-base text-ink3"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M9 1.8H4.4A1.4 1.4 0 0 0 3 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4V5.8L9 1.8Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M9 1.9v3.9h3.9M5.4 9h5.2M5.4 11.2h3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: SimilarCase["outcome"] }) {
  const approved = outcome === "approved";
  return (
    <span
      className={cx(
        "shrink-0 rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em]",
        approved ? "bg-good-wash text-good" : "bg-stop-wash text-stop",
      )}
    >
      {approved ? "Approved" : "Rejected"}
    </span>
  );
}

/** "Invoice was 3.8% over PO." Never asserted when the amount is unknown. */
function varianceLine(c: SimilarCase) {
  if (c.diff_pct === null || c.diff_pct === undefined) return "Amount variance not recorded";
  const abs = Math.abs(c.diff_pct);
  return abs === 0 ? "No amount variance" : `${abs.toFixed(1)}% variance`;
}

function CaseCard({ c }: { c: SimilarCase }) {
  return (
    <li className="echo-mem-card rounded-[12px] border border-line bg-sunken">
      <div className="flex items-center gap-2.5">
        <DocumentIcon />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] font-medium text-ink2">{c.id}</span>
          <span className="mt-[1px] block truncate text-[11px] text-ink4">
            {c.approver ? `Decided by ${c.approver}` : "Decided by the team"}
          </span>
        </span>
        <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-ink4">
          {day(c.date)}
        </span>
      </div>

      {c.condition && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-[1.5] text-ink2">
          <span aria-hidden="true" className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-teal" />
          <span className="min-w-0">{c.condition}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <span className="font-mono text-[11px] tabular-nums text-ink3">{varianceLine(c)}</span>
        <span className="ml-auto">
          <OutcomeBadge outcome={c.outcome} />
        </span>
      </div>

      {c.workaround && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-[1.6] text-ink3">
          {c.workaround}
        </p>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- the states */

function MemoryState({ title, text }: { title: string; text: string }) {
  return (
    <div className="echo-memory-off">
      <div className="echo-memory-off__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 15.6h.01" strokeLinecap="round" />
        </svg>
      </div>
      <div className="echo-memory-off__title">{title}</div>
      <p className="echo-memory-off__text">{text}</p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <li className="echo-mem-card rounded-[12px] border border-line bg-sunken" aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <div className="echo-skeleton h-[28px] w-[28px] rounded-[8px]" />
        <div className="flex-1 space-y-1.5">
          <div className="echo-skeleton h-[10px] w-[70%] rounded-[8px]" />
          <div className="echo-skeleton h-[9px] w-[45%] rounded-[8px]" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="echo-skeleton h-[10px] w-full rounded-[8px]" />
        <div className="echo-skeleton h-[10px] w-[60%] rounded-[8px]" />
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------- rail */

export default function MemoryRail({
  memoryOn,
  evidence,
  evidenceReady,
  onSettled,
  pulse = 0,
  onClose,
}: Props) {
  const [q, setQ] = useState("");
  const rc = evidence.recall;
  const precedent = !!rc && !rc.no_history;
  const st = rc?.stats;

  /* The comparable-case count animates. `evidenceReady` then reveals the rows,
     so the number and the cards never disagree mid-count. */
  const total = st?.similar_cases ?? 0;
  const { n, done } = useCountUp(memoryOn && precedent ? total : 0, 420);
  const signature = `${total}:${st?.approved ?? 0}:${rc?.similar_cases[0]?.id ?? ""}`;
  const firedFor = useRef("");
  useEffect(() => {
    if (!done || firedFor.current === signature) return;
    firedFor.current = signature;
    onSettled?.();
  }, [done, signature, onSettled]);

  const cases = useMemo(() => (precedent ? rc!.similar_cases : []), [precedent, rc]);
  const patterns = useMemo(() => observedPatterns(rc), [rc]);
  const ready = done && evidenceReady;

  /* Every condition genuinely present, ranked by real support. Only the two
     sources that actually carry counts are used — see observedConditions(). */
  const conditions = useMemo(() => observedConditions(rc), [rc]);
  const topCondition = useMemo(() => primaryCondition(rc), [rc]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter(
      (c) =>
        c.id.toLowerCase().includes(needle) ||
        c.invoice_no.toLowerCase().includes(needle) ||
        (c.condition ?? "").toLowerCase().includes(needle) ||
        (c.workaround ?? "").toLowerCase().includes(needle) ||
        c.outcome.includes(needle),
    );
  }, [cases, q]);

  const listState: "off" | "searching" | "empty" | "list" = !memoryOn
    ? "off"
    : !precedent
      ? "empty"
      : ready
        ? "list"
        : "searching";

  const approverEntries = useMemo(
    () => Object.entries(st?.approvers ?? {}).sort((a, b) => b[1] - a[1]),
    [st],
  );

  return (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col">
      {pulse > 0 && memoryOn && (
        <span key={pulse} aria-hidden="true" className="echo-rail-sweep echo-decision-pulse" />
      )}

      {/* ------------------------------------------------ header, pinned */}
      <div className="echo-panel-head">
        <Lbl className="text-ink2">Institutional memory</Lbl>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close memory panel"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-ink4 hover:bg-sunken hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      <div className="echo-panel-sub">
        <label className="relative block">
          <span className="sr-only">Search comparable decisions</span>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink4"
          >
            <circle cx="7.2" cy="7.2" r="4.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="m10.6 10.6 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search comparable decisions…"
            className="echo-filter h-9 w-full rounded-[10px] border border-line bg-sunken pl-8 pr-8 text-[13px] text-ink outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-ink4 hover:text-ink"
            >
              ✕
            </button>
          )}
        </label>

        <div className="mt-2.5 flex items-baseline gap-2 px-[2px]">
          <span className="font-mono text-[13px] font-medium tabular-nums text-ink2">
            {listState === "off" ? "—" : n}
          </span>
          <span className="text-[12px] text-ink4">
            comparable {total === 1 ? "case" : "cases"}
          </span>
        </div>
      </div>

      {/* ----------------------------- the one scroll: three sections + rows */}
      <div className="echo-scroll px-3 pb-8 pt-3">
        {listState === "off" ? (
          <MemoryState
            title="Memory is off"
            text="Institutional memory is disabled for this investigation. Nothing was recalled, so Echo is working from the written policy alone."
          />
        ) : (
          <div className="space-y-2.5">
            {/* ------------------------------------------------ 1. MEMORY */}
            <Section
              title="Memory"
              meta={<ProvenanceChip kind="computed" />}
            >
              {listState === "searching" ? (
                <div className="space-y-2" aria-hidden="true">
                  <div className="echo-skeleton h-[16px] w-[60%] rounded-[8px]" />
                  <div className="echo-skeleton h-[12px] w-[85%] rounded-[8px]" />
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[22px] font-semibold leading-none tabular-nums text-ink">
                      {n}
                    </span>
                    <span className="text-[12px] text-ink3">
                      comparable {total === 1 ? "case" : "cases"}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-[1.6] text-ink2">
                    <span className="font-mono tabular-nums text-ink">
                      {st?.approved ?? 0}/{total}
                    </span>{" "}
                    approved
                    {st?.confidence ? ` · ${st.confidence}` : ""}
                  </p>
                  {approverEntries.length > 0 && (
                    <p className="mt-1.5 text-[11px] leading-[1.6] text-ink4">
                      {approverEntries
                        .map(([name, c]) => `${name} ×${c}`)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
            </Section>

            {/* ------------------------------------- 2. OBSERVED PATTERN */}
            <Section
              title="Observed pattern"
              meta={<ProvenanceChip kind={patterns.length > 0 ? "evidence" : "computed"} />}
            >
              {!precedent ? (
                <>
                  <div className="text-[14px] font-semibold leading-none text-ink2">No pattern</div>
                  <p className="mt-2 text-[12px] leading-[1.6] text-ink4">
                    No institutional precedent was found.
                  </p>
                </>
              ) : patterns.length > 0 ? (
                /* Real pattern memory, joined on case id. */
                <ul className="space-y-2">
                  {patterns.map((p) => (
                    <PatternRow key={p.pattern_id} p={p} />
                  ))}
                </ul>
              ) : (
                /* No pattern document is readable for this family. Fall back to a
                   deterministic grouping of the cases actually on screen, and say
                   that is what this is. */
                <ul className="space-y-2">
                  <DerivedPatternRow
                    family={rc?.issue_family || "comparable exceptions"}
                    condition={topCondition}
                    support={total}
                    approved={st?.approved ?? 0}
                  />
                </ul>
              )}
            </Section>

            {/* -------------------------------------------- 3. CONDITION */}
            <Section
              title="Condition"
              meta={<ProvenanceChip kind="evidence" />}
            >
              {!precedent ? (
                <>
                  <div className="text-[14px] font-semibold leading-none text-ink2">
                    No comparable cases
                  </div>
                  <p className="mt-2 text-[12px] leading-[1.6] text-ink4">
                    No institutional precedent was found. Written policy is therefore the
                    available guidance.
                  </p>
                </>
              ) : conditions.length === 0 ? (
                <>
                  <div className="text-[14px] font-semibold leading-none text-ink2">
                    No comparable condition recorded
                  </div>
                  <p className="mt-2 text-[12px] leading-[1.6] text-ink4">
                    These {total} comparable {total === 1 ? "decision" : "decisions"} recorded
                    no condition.
                  </p>
                </>
              ) : (
                <>
                  <ul className="space-y-2">
                    {conditions.map(({ label, count }) => {
                      const primary = topCondition === label;
                      return (
                        <li
                          key={label}
                          className="rounded-[10px] border border-line bg-sunken px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.45] text-ink2">
                              {label}
                            </span>
                            <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink4">
                              ×{count}
                            </span>
                          </div>
                          {primary && (
                            <p className="mt-1.5 text-[11px] leading-[1.5] text-ink3">
                              Approval pattern observed under this condition.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 text-[11px] leading-[1.6] text-ink4">
                    The condition associated with these comparable decisions.
                  </p>
                </>
              )}
            </Section>

            {/* ------------------------------- the comparable decisions */}
            <Section title="Comparable decisions" meta={`${visible.length} shown`}>
              {listState === "searching" ? (
                <ul className="space-y-2.5">
                  {[0, 1, 2].map((i) => (
                    <CardSkeleton key={i} />
                  ))}
                </ul>
              ) : visible.length === 0 ? (
                <p className="px-1 py-6 text-[12px] leading-[1.6] text-ink4">
                  {q.trim() ? `No comparable decision matches “${q.trim()}”.` : "No comparable cases."}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {visible.map((c) => (
                    <CaseCard key={c.id} c={c} />
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </div>

      {/* --------------------------------------- source footer, pinned below */}
      {rc && (
        <div className="shrink-0 border-t border-line px-4 py-3">
          <p className="font-mono text-[11px] tracking-[0.08em] text-ink4">
            SOURCE · {rc.memory_source === "hindsight" ? "HINDSIGHT" : "LOCAL"}
          </p>
        </div>
      )}
    </aside>
  );
}
