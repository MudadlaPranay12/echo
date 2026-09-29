"use client";
// MemoryRail — zone 3, institutional memory.
//
// 360px, a 48px header, and exactly three frames: MEMORY, OBSERVED PATTERN, CONDITION.
// They are one component, so they cannot end up different widths, radii,
// borders, padding or heading sizes. Three equal windows onto the same thing.
//
// Memory off is a finished state, not a set of empty slots: each frame states
// plainly that memory was not searched, and no placeholder dashes appear.

import { useEffect, useRef } from "react";
import type { Evidence, SimilarCase } from "./echoTypes";
import { Frame, useCountUp } from "./ui";
import ProvenanceChip from "./ProvenanceChip";
import ConfidenceRing from "./ConfidenceRing";

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
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

/* ------------------------------------------------------------------- frame 1: MEMORY */

function MemoryFrame({
  memoryOn,
  searched,
  cases,
  approved,
  signature,
  onSettled,
}: {
  memoryOn: boolean;
  searched: boolean;
  cases: number;
  approved: number;
  signature: string;
  onSettled?: () => void;
}) {
  const { n, done } = useCountUp(cases, 400);

  const firedFor = useRef("");
  useEffect(() => {
    if (!done || firedFor.current === signature) return;
    firedFor.current = signature;
    onSettled?.();
  }, [done, signature, onSettled]);

  if (!memoryOn) {
    return (
      <Frame title="MEMORY" meta="off">
        <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink2">
          Written policy only
        </div>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink3">
          Institutional memory is disabled for this investigation.
        </p>
      </Frame>
    );
  }

  return (
    <Frame title="MEMORY" meta={<span className="flex items-center gap-1.5"><span aria-hidden="true" className="echo-live h-[5px] w-[5px] rounded-full bg-teal" />active</span>}>
      <div className="flex items-center gap-4 mb-3">
        <ConfidenceRing confidence={cases > 0 ? (cases >= 6 ? "higher" : cases >= 3 ? "medium (small sample)" : "low (very small sample)") : "none"} cases={cases} approved={approved} />
        <div className="flex flex-col justify-center">
          <p className="text-[13px] leading-[1.6] text-ink3">
            <ProvenanceChip kind="computed" />
            {cases > 0 ? (cases >= 6 ? "HIGHER" : cases >= 3 ? "MEDIUM (SMALL SAMPLE)" : "LOW (VERY SMALL SAMPLE)") : "NONE"}
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] text-ink4">
            {cases} comparable case{cases === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink">
        Memory active
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[12px] tabular-nums text-teal">{n}</span>
        <span className="text-[12px] text-ink3">
          {searched ? (cases === 1 ? "historical case" : "historical cases") : "cases found"}
        </span>
        {done && cases > 0 && (
          <span className="ml-auto font-mono text-[12px] tabular-nums text-ink4">
            {approved}/{cases} approved
          </span>
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------- frame 2: OBSERVED PATTERN */

function PatternFrame({ text, approved, total }: { text?: string; approved: number; total: number }) {
  if (text) {
    return (
      <Frame title="OBSERVED PATTERN" meta={<span className="flex items-center gap-2"><ProvenanceChip kind="evidence" /><span className="font-mono text-[12px] tabular-nums text-teal">{approved}/{total} approved</span></span>}>
        <p className="text-[12px] leading-[1.6] text-ink2">{text}</p>
      </Frame>
    );
  }
  return (
    <Frame title="OBSERVED PATTERN" meta={<ProvenanceChip kind="evidence" />}>
      <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink2">
        No pattern
      </div>
      <p className="mt-2 text-[12px] leading-[1.6] text-ink3">
        Nothing was searched, so no pattern was produced.
      </p>
    </Frame>
  );
}

/* ------------------------------------------------------------------- frame 3: CONDITION */

function ConditionFrame({
  cases,
  ready,
  memoryOn,
  topCondition,
}: {
  cases: SimilarCase[];
  ready: boolean;
  memoryOn: boolean;
  topCondition?: { label: string; count: number } | null;
}) {
  if (!memoryOn) {
    return (
      <Frame title="CONDITION" meta={<ProvenanceChip kind="evidence" />}>
        <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink2">
          Memory off
        </div>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink3">
          Institutional memory is disabled for this investigation.
        </p>
      </Frame>
    );
  }

  if (cases.length === 0) {
    return (
      <Frame title="CONDITION" meta={<ProvenanceChip kind="evidence" />}>
        <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink2">
          No comparable cases
        </div>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink3">
          Echo found no relevant historical cases. Written policy is therefore the available guidance.
        </p>
      </Frame>
    );
  }

const conditionMeta = (
    <span className="flex items-center gap-2">
      <ProvenanceChip kind="evidence" />
      <span className="font-mono text-[12px] tabular-nums text-teal">{cases.length} cases</span>
    </span>
  );

const frameContent = (
      !ready ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="echo-skeleton h-[12px] rounded-[8px]" />
          ))}
        </div>
      ) : (
        <>
          {topCondition && (
            <div className="mb-3 p-3 rounded-[8px] border border-line bg-sunken">
              <div className="flex items-center gap-2">
                <span className="echo-provenance echo-provenance--evidence">EVIDENCE</span>
                <span className="text-[12px] font-semibold text-ink2">{topCondition.label}</span>
                <span className="ml-auto font-mono text-[12px] text-ink4">×{topCondition.count}</span>
              </div>
              <p className="mt-1 text-[12px] leading-[1.6] text-ink3">
                The condition that decided {topCondition.count} of {cases.length} comparable decisions.
              </p>
            </div>
          )}
          <ul className="space-y-1.5">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={
                    c.outcome === "approved" ? "h-[5px] w-[5px] shrink-0 rounded-full bg-good" : "h-[5px] w-[5px] shrink-0 rounded-full bg-stop"
                  }
                />
                <span className="font-mono text-[12px] text-ink2">{c.id}</span>
                <span className="truncate text-[12px] text-ink4">{c.approver}</span>
                <span className="ml-auto shrink-0 font-mono text-[12px] text-ink4">{day(c.date)}</span>
              </li>
            ))}
          </ul>
        </>
      )
    );

  return <Frame title="CONDITION" meta={conditionMeta}>{frameContent}</Frame>;
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
  const rc = evidence.recall;
  const precedent = !!rc && !rc.no_history;
  const cases = precedent ? rc!.similar_cases : [];
  const st = rc?.stats;
  const topCondition = st?.top_condition ?? null;

  // One-line memory story above the frames
  const memoryStory = memoryOn
    ? precedent
      ? `Echo found ${st?.similar_cases} comparable historical cases. ${st?.approved} of ${st?.similar_cases} approved under the ${topCondition?.label ?? "observed"} condition.`
      : "No institutional precedent was found. Written policy is the only available guidance."
    : "Written policy only. Institutional memory is disabled for this investigation.";

  return (
    <aside className="flex min-h-0 w-[360px] shrink-0 flex-col border-l border-line bg-rail">
      {/* one sweep, once, when a human decision has actually been recorded */}
      {pulse > 0 && memoryOn && <span key={pulse} aria-hidden="true" className="echo-rail-sweep echo-decision-pulse" />}

      <div
        className={
          memoryOn
            ? "echo-rail-live flex h-[48px] shrink-0 items-center gap-2 border-b border-line px-4"
            : "flex h-[48px] shrink-0 items-center gap-2 border-b border-line px-4"
        }
      >
        <h2 className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-ink2">
          Institutional memory
        </h2>
        <span className="ml-auto font-mono text-[12px] text-ink4">
          {memoryOn ? (st ? `${st.similar_cases} found` : "ready") : "off"}
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close memory panel"
            className="-mr-2 flex h-[44px] w-[44px] items-center justify-center text-[13px] leading-none text-ink4 hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {/* One-line memory story */}
      <div className="shrink-0 px-3 pb-3">
        <div className={`echo-memory-story ${memoryOn ? "" : "echo-memory-story--off"}`}>
          {memoryStory}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          <MemoryFrame
            memoryOn={memoryOn}
            searched={!!st}
            cases={st?.similar_cases ?? 0}
            approved={st?.approved ?? 0}
            signature={`${st?.similar_cases ?? 0}:${st?.approved ?? 0}:${cases[0]?.id ?? ""}`}
            onSettled={onSettled}
          />

          <PatternFrame
            text={memoryOn ? rc?.pattern_insight ?? undefined : undefined}
            approved={st?.approved ?? 0}
            total={st?.similar_cases ?? 0}
          />

          <ConditionFrame
            cases={cases}
            ready={evidenceReady}
            memoryOn={memoryOn}
            topCondition={topCondition}
          />
        </div>
      </div>

      {rc && (
        <div className="shrink-0 border-t border-line px-4 py-3">
          <p className="font-mono text-[12px] tracking-[0.08em] text-ink4">
            {rc.memory_source === "hindsight" ? "SOURCE · HINDSIGHT" : "SOURCE · LOCAL"}
          </p>
        </div>
      )}
    </aside>
  );
}
