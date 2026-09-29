"use client";
// PolicyVsPractice — the sentence the whole product exists to produce.
//
// One comparison, mathematically balanced: a 1fr / 1px / 1fr grid, identical
// padding on both sides, one heading size, one body size, and the rule exactly in
// the middle. When the two disagree the rule turns brass and a single dot opens
// in it. When there is no practice, the practice column is a compact, finished
// statement of that fact — not an empty rectangle left behind by missing data.

import type { RecallResult } from "./echoTypes";
import { cx } from "./ui";
import ProvenanceChip from "./ProvenanceChip";

/** Both columns use this, so neither can grow a heading of its own. */
function ColumnHead({ title, dot, meta }: { title: string; dot: "empty" | "filled"; meta: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cx(
          "h-[6px] w-[6px] shrink-0 rounded-full",
          dot === "filled" ? "bg-teal" : "border border-line2",
        )}
      />
      <h3 className="text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-ink3">
        {title}
      </h3>
      <span className="ml-auto font-mono text-[12px] text-ink4">{meta}</span>
    </div>
  );
}

function EmptyPractice() {
  return (
    <div>
      <h4 className="text-[12px] font-semibold uppercase leading-none tracking-[0.12em] text-ink3">
        No institutional precedent
      </h4>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink3">
        Written policy remains the only available guidance.
      </p>
    </div>
  );
}

function GapIndicator({ gapText }: { gapText: string }) {
  return (
    <div className="echo-gap-indicator echo-gap-indicator--animate">
      {gapText}
    </div>
  );
}

export default function PolicyVsPractice({ recall }: { recall?: RecallResult }) {
  /* Memory off, or nothing recalled yet: only the documented side is honest. */
  if (!recall) {
    return (
      <div className="echo-split min-h-[112px]">
        <div className="flex flex-col justify-center px-6">
          <ColumnHead title="Policy" dot="empty" meta="written rule" />
          <p className="mt-3 text-[14px] leading-[1.6] text-ink2">
            Institutional memory was not searched for this answer, so the written
            route is the whole of it.
          </p>
        </div>
        <div aria-hidden="true" className="echo-split-rule" />
        <div className="flex flex-col justify-center px-6">
          <ColumnHead title="Practice" dot="empty" meta="not searched" />
          <p className="mt-3 text-[14px] leading-[1.6] text-ink4">
            Nothing was recalled, so there is no practice column to compare.
          </p>
        </div>
      </div>
    );
  }

  const st = recall.stats;
  const top = st.top_condition;
  const has = st.similar_cases > 0;
  const gap =
    has && top
      ? `The written route never mentions ${top.label}, yet that condition decided ${st.approved} of ${st.similar_cases} comparable cases.`
      : null;

  return (
    <div>
      <div className="echo-split min-h-[112px]">
        <div className="flex flex-col justify-center px-6">
          <ColumnHead title="Policy" dot="empty" meta="written rule" />
          <p className="mt-3 text-[14px] leading-[1.6] text-ink2">{recall.written_policy_route}</p>
        </div>

        {/* the rule between them: neutral until a gap exists, then it is the
            most important thing in the comparison */}
        <div aria-hidden={!gap} className={cx("echo-split-rule relative", gap && "echo-gap-rule")}>
          {gap && (
            <span
              className="echo-gap-dot"
              role="img"
              aria-label="A gap was found between policy and practice"
            />
          )}
        </div>

        <div className="flex flex-col justify-center px-6">
          {has ? (
            <>
              <ColumnHead title="Practice" dot="filled" meta="historical precedent" />
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {st.similar_cases}
                </span>
                <span className="text-[14px] leading-[1.6] text-ink2">
                  {st.similar_cases === 1 ? "case" : "cases"}
                </span>
                <span className="ml-auto font-mono text-[14px] tabular-nums text-teal">
                  {st.approved}/{st.similar_cases} approved
                </span>
              </div>
              {top && (
                <div className="mt-2 flex items-center gap-2">
                  <ProvenanceChip kind="evidence" />
                  <p className="text-[12px] leading-[1.6] text-ink3">
                    Condition · <span className="text-ink2">{top.label}</span> ×{top.count}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <ColumnHead title="Practice" dot="empty" meta="no record" />
              <EmptyPractice />
            </>
          )}
        </div>
      </div>

      {gap && (
        <GapIndicator gapText={gap} />
      )}
    </div>
  );
}
