"use client";
// MemoryRail — zone 3, Institutional Memory.
// Everything Echo remembered, in one column: the synthesised pattern, how much
// weight the evidence carries, the actual decisions on record, and who made them.
// This is where the historical detail lives, so the investigation in the centre
// can stay about this invoice.

import { useEffect, useRef, useState } from "react";
import type { Evidence, Owner, SimilarCase } from "./echoTypes";
import KnowledgeOwner from "./KnowledgeOwner";
import EchoMarkdown from "./echoMarkdown";
import { Chevron, Disclosure, Lbl, cx, useCountUp } from "./ui";

type Props = {
  memoryOn: boolean;
  evidence: Evidence;
  /** Rows are held back until the recall counter has settled. */
  evidenceReady: boolean;
  /** Fired once the outcome tally finishes counting, so rows can be revealed. */
  onSettled?: () => void;
  onClose?: () => void;
};

const day = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

/* ------------------------------------------------------------------ pattern */

/** Reflect returns a long advisory narrative. Lead with its opening claim and
 *  keep the rest one keystroke away, so the rail stays scannable. */
function splitLead(text: string): [string, string] {
  const sentences = text.match(/[^.!?]*[.!?]+[\s]*|[^.!?]+$/g) ?? [text];
  let lead = "";
  for (const s of sentences) {
    if ((lead + s).length > 300) break;
    lead += s;
  }
  if (!lead.trim() || lead.trim().length >= text.trim().length) return [text.trim(), ""];
  return [lead.trim(), text.trim().slice(lead.trim().length).trim()];
}

function Pattern({ text }: { text: string }) {
  const [lead, rest] = splitLead(text);
  return (
    <div className="echo-reveal border-b border-line bg-teal-wash/45 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <Lbl>Synthesised pattern</Lbl>
        <span
          className="rounded-[3px] border border-teal-soft px-1.5 py-[1px] font-mono text-[9px] font-medium uppercase tracking-[0.11em] text-teal"
          title="Produced by Hindsight Reflect over the recalled memories"
        >
          Reflect
        </span>
      </div>

      <div className="mt-2 text-[12px] leading-[1.65] text-ink2">
        <EchoMarkdown text={lead} />
      </div>

      {rest && (
        <Disclosure title="Full synthesised pattern">
          <div className="text-[12px] leading-[1.65] text-ink2">
            <EchoMarkdown text={rest} />
          </div>
        </Disclosure>
      )}

      <p className="mt-2.5 text-[10.5px] leading-[1.5] text-ink4">
        Advisory synthesis, not arithmetic. The counts below are computed
        separately and are what to rely on.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- confidence */

const TIERS = {
  none: { label: "No comparable cases", bar: "bg-ink4", text: "text-ink2" },
  low: { label: "Low confidence", bar: "bg-brass", text: "text-brass" },
  medium: { label: "Medium confidence", bar: "bg-teal", text: "text-ink" },
  higher: { label: "Higher confidence", bar: "bg-teal-deep", text: "text-ink" },
} as const;

type Tier = keyof typeof TIERS;
const SEGS = 5;
const tierOf = (c?: string): Tier =>
  c?.startsWith("low")
    ? "low"
    : c?.startsWith("medium")
      ? "medium"
      : c?.startsWith("higher")
        ? "higher"
        : "none";

/** The backend qualifies confidence (e.g. "medium (small sample)"). Show it as-is. */
const qualifierOf = (c?: string): string | null => {
  const m = /\(([^)]+)\)/.exec(c ?? "");
  return m ? m[1].trim() : null;
};

function Confidence({ confidence, cases }: { confidence?: string; cases: number }) {
  const tier = TIERS[tierOf(confidence)];
  const fill = Math.max(0, Math.min(SEGS, cases));
  const qualifier = qualifierOf(confidence);

  return (
    <div className="border-b border-line px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <Lbl>Confidence</Lbl>
        <span className="font-mono text-[10px] text-ink4">
          {cases} case{cases === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: SEGS }, (_, i) => (
            <span
              key={i}
              className={cx(
                "h-[14px] w-[3px] rounded-full transition-colors duration-500 ease-out",
                i < fill ? tier.bar : "bg-line",
              )}
              style={{ transitionDelay: `${i * 45}ms` }}
            />
          ))}
        </div>
        <span className={cx("text-[12px]", tier.text)}>{tier.label}</span>
      </div>
      {qualifier && (
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] leading-[1.5] text-ink4">
          <span
            aria-hidden="true"
            className="block h-[1px] w-2.5 shrink-0 bg-brass/60"
          />
          {qualifier}
        </p>
      )}
      <span className="sr-only">{confidence}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ tally */

function Tally({
  approved,
  total,
  signature,
  onSettled,
}: {
  approved: number;
  total: number;
  /** changes whenever a new recall lands, so the reveal can replay per case */
  signature: string;
  onSettled?: () => void;
}) {
  const { n, done } = useCountUp(approved, 900);
  const pct = total > 0 ? Math.min(100, (n / total) * 100) : 0;

  const firedFor = useRef("");
  useEffect(() => {
    if (!done || firedFor.current === signature) return;
    firedFor.current = signature;
    onSettled?.();
  }, [done, signature, onSettled]);

  return (
    <div className="border-b border-line px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <Lbl>Outcome on record</Lbl>
        <span
          className={cx(
            "font-mono text-[12px] tabular-nums transition-colors duration-300",
            done ? "text-ink" : "text-ink3",
          )}
        >
          {n} / {total}
        </span>
      </div>
      <div
        className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={n}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Approved comparable decisions"
      >
        <div
          className="h-full rounded-full bg-teal transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[11.5px] text-ink3" aria-live="polite">
        {done ? `${approved} of ${total} approved` : "reading historical decisions…"}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- decisions */

function DecisionRow({ c, delay }: { c: SimilarCase; delay: number }) {
  const [open, setOpen] = useState(false);
  const approved = c.outcome === "approved";

  return (
    <li className="echo-rise border-b border-line last:border-b-0" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-sunken/70"
      >
        <span className="mt-[1px] flex w-[26px] shrink-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cx("h-[6px] w-[6px] shrink-0 rounded-full", approved ? "bg-good" : "bg-stop")}
          />
          <span className="font-mono text-[10.5px] text-ink2">{c.id}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cx("text-[11.5px] capitalize", approved ? "text-good" : "text-stop")}>
              {c.outcome}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink4">{day(c.date)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] leading-[1.45] text-ink2">
            {c.workaround}
          </span>
        </span>

        <Chevron
          open={open}
          className="mt-[2px] shrink-0 text-ink4 transition-colors group-hover:text-ink2"
        />
      </button>

      <div
        className={cx(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <dl className="mx-4 mb-3 grid grid-cols-[68px_1fr] gap-x-3 gap-y-[5px] border-t border-dashed border-line pt-2.5 text-[11px] leading-[1.45]">
            <dt className="text-ink4">Approver</dt>
            <dd className="text-ink2">{c.approver}</dd>

            <dt className="text-ink4">Invoice</dt>
            <dd className="font-mono text-ink2">
              {c.invoice_no}
              {c.diff_pct !== null && (
                <span className="ml-1.5 text-ink4">
                  {c.diff_pct > 0 ? "+" : ""}
                  {c.diff_pct}%
                </span>
              )}
            </dd>

            <dt className="text-ink4">Resolved</dt>
            <dd className="text-ink2">
              in {c.days} day{c.days === 1 ? "" : "s"}
            </dd>
          </dl>
        </div>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------- empty states */

function Quiet({ title, body, footnote }: { title: string; body: string; footnote?: string }) {
  return (
    <div className="echo-fade px-4 py-8 text-center">
      <p className="text-[12.5px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[30ch] text-[11.5px] leading-[1.6] text-ink3">{body}</p>
      {footnote && <p className="mt-3 text-[11px] leading-[1.6] text-ink4">{footnote}</p>}
    </div>
  );
}

/* --------------------------------------------------------------------- rail */

export default function MemoryRail({
  memoryOn,
  evidence,
  evidenceReady,
  onSettled,
  onClose,
}: Props) {
  const rc = evidence.recall;
  const owners: Owner[] = memoryOn ? (evidence.owner?.owners ?? []) : [];
  const precedent = !!rc && !rc.no_history;

  return (
    <div className="flex h-full min-h-0 flex-col bg-rail">
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink">
          Institutional Memory
        </h2>
        <div className="flex items-center gap-1.5">
          {!memoryOn && <span className="font-mono text-[9px] tracking-[0.1em] text-teal">POLICY ONLY</span>}
          {memoryOn && precedent && (
            <span className="font-mono text-[9.5px] text-ink3">
              {rc!.stats.similar_cases} FOUND
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close memory panel"
              className="-mr-1 rounded px-1 text-[13px] leading-none text-ink4 transition-colors hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!memoryOn && (
          <div className="echo-fade px-4 py-4">
            <div className="rounded-[7px] border border-teal-soft bg-teal-wash px-3 py-2.5">
              <Lbl className="text-teal">Memory is off</Lbl>
              <p className="mt-1.5 text-[12px] leading-[1.55] text-ink2">
                Echo is answering from the written policy only. No historical
                decision is searched, so nothing here can be treated as precedent.
              </p>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-ink3">
              Turn memory on to compare the documented route against what the
              company actually did.
            </p>
          </div>
        )}

        {memoryOn && !rc && (
          <Quiet
            title="No search yet"
            body="Open an exception from the queue and Echo will search institutional memory for comparable decisions."
          />
        )}

        {memoryOn && rc?.no_history && (
          <>
            <Quiet
              title="No historical precedent"
              body="Echo found no comparable historical exception for this vendor and exception type."
              footnote="This is a real answer, not a failure — the company has no precedent here, so the written policy is the whole basis."
            />
            <Confidence confidence={rc.stats.confidence} cases={rc.stats.similar_cases} />
            <div className="border-b border-line px-4 py-3.5">
              <Lbl>Basis of this answer</Lbl>
              <p className="mt-1.5 flex items-center gap-2 text-[12px] text-ink2">
                <span className="rounded-[3px] border border-line2 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.11em] text-ink3">
                  Written policy fallback
                </span>
              </p>
              <p className="mt-2 text-[11.5px] leading-[1.6] text-ink3">
                {rc.written_policy_route}
              </p>
            </div>
          </>
        )}

        {memoryOn && precedent && rc && (
          <>
            {rc.pattern_insight && <Pattern text={rc.pattern_insight} />}
            <Confidence confidence={rc.stats.confidence} cases={rc.stats.similar_cases} />
            <Tally
              approved={rc.stats.approved}
              total={rc.stats.similar_cases}
              signature={`${rc.stats.similar_cases}:${rc.stats.approved}:${rc.similar_cases[0]?.id ?? ""}`}
              onSettled={onSettled}
            />

            <div className="px-4 pb-1 pt-3.5">
              <Lbl>Comparable decisions</Lbl>
            </div>

            {!evidenceReady ? (
              <div className="space-y-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="echo-skeleton h-[34px] rounded-[5px]" />
                ))}
              </div>
            ) : rc.similar_cases.length === 0 ? (
              <Quiet title="No comparable decisions" body="The search ran but matched nothing." />
            ) : (
              <ul>
                {rc.similar_cases.map((c, i) => (
                  <DecisionRow key={c.id} c={c} delay={i * 45} />
                ))}
              </ul>
            )}

            {owners.length > 0 && (
              <>
                <div className="border-b border-line px-4 py-3.5">
                  <Lbl>Decided before</Lbl>
                </div>
                <div className="px-4 py-3.5">
                  <KnowledgeOwner owners={owners} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {memoryOn && rc && (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-2.5">
          <p
            className={cx(
              "font-mono text-[9px] leading-[1.5] tracking-[0.08em]",
              rc.memory_source === "hindsight" ? "text-ink4" : "text-brass",
            )}
          >
            {rc.memory_source === "hindsight"
              ? "SOURCE · HINDSIGHT CLOUD"
              : "SOURCE · LOCAL FALLBACK"}
          </p>
        </div>
      )}
    </div>
  );
}
