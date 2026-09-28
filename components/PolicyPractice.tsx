"use client";
// PolicyVsPractice — the discovery.
// This is the sentence the whole product exists to produce: what the document
// says, what the company actually did, and the distance between them.
//
// Not two cards. Two columns on a shared axis, with the divergence called out
// underneath in the one colour reserved for exactly this meaning.

import type { RecallResult } from "./echoTypes";
import { cx } from "./ui";

function Divergence() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-brass">
      <path
        d="M7 1.6 13 12.4H1L7 1.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7 5.8v2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7" cy="10.6" r="0.75" fill="currentColor" />
    </svg>
  );
}

function Documented({ route }: { route: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full border border-line2" />
        <span className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.15em] text-ink3">
          Documented
        </span>
      </div>
      <p className="mt-2.5 text-[13px] leading-[1.6] text-ink2">{route}</p>
    </div>
  );
}

function Observed({ recall }: { recall: RecallResult }) {
  const st = recall.stats;
  const has = st.similar_cases > 0;
  const pct = has ? Math.round((st.approved / st.similar_cases) * 100) : null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-teal" />
        <span className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.15em] text-ink3">
          Observed
        </span>
      </div>

      {has ? (
        <>
          <p className="mt-2.5 text-[13px] leading-[1.6] text-ink">
            {st.approved} of {st.similar_cases} comparable decisions were approved
            {pct !== null && pct < 100 ? ` (${pct}%)` : ""}.
          </p>
          {st.top_condition && (
            <p className="mt-2 border-l-2 border-teal-soft pl-2.5 text-[12px] leading-[1.55] text-ink2">
              {st.top_condition.label}
              <span className="ml-1.5 font-mono text-[10.5px] text-ink4">
                ×{st.top_condition.count}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-2.5 text-[13px] leading-[1.6] text-ink2">
          No comparable decisions on record.
        </p>
      )}
    </div>
  );
}

export default function PolicyVsPractice({ recall }: { recall?: RecallResult }) {
  /* Memory off, or nothing recalled yet: only the documented side is honest. */
  if (!recall) {
    return (
      <div className="rounded-[7px] border border-dashed border-line2 bg-sunken/40 px-4 py-5">
        <Documented route="Written policy only — organisational memory was not searched for this answer." />
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
      <div className="flex items-stretch gap-3">
        <Documented route={recall.written_policy_route} />

        <div
          className="hidden w-7 shrink-0 flex-col items-center sm:flex"
          aria-hidden="true"
        >
          <span className="w-px flex-1 bg-line" />
          <span className="my-1.5 rounded-[3px] border border-line bg-surface px-1 py-[2px] font-mono text-[9px] uppercase tracking-[0.1em] text-ink4">
            vs
          </span>
          <span className="w-px flex-1 bg-line" />
        </div>

        <Observed recall={recall} />
      </div>

      {gap && (
        <div
          className={cx(
            "echo-rise mt-4 flex items-start gap-2.5 rounded-[7px] border border-brass-soft bg-brass-wash px-3.5 py-3",
          )}
        >
          <span className="mt-[2px]">
            <Divergence />
          </span>
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.15em] text-brass">
              Observed gap
            </div>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-ink2">{gap}</p>
          </div>
        </div>
      )}

      {recall.no_history && (
        <p className="mt-3 text-[11.5px] leading-[1.6] text-ink3">
          Nothing in memory matches this vendor and exception type, so the
          observed column stays empty. Echo is advising from the written policy
          alone.
        </p>
      )}
    </div>
  );
}
