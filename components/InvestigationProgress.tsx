"use client";
// InvestigationProgress — the wait, without a spinner.
//
// Four stages, one hairline, one travelling segment. The stages are
// presentational: they show the shape of the work, not tool events. The line that
// states what is actually happening lives in the case header, and it is driven
// only by real request state.

import { cx } from "./ui";

const WITH_MEMORY = [
  "Understanding exception",
  "Recalling memory",
  "Comparing policy",
  "Forming recommendation",
];

const POLICY_ONLY = ["Understanding exception", "Comparing policy", "Forming recommendation"];

export default function InvestigationProgress({
  stage,
  done,
  memoryOn,
}: {
  /** Index of the running stage; equal to the stage count once finished. */
  stage: number;
  done: boolean;
  memoryOn: boolean;
}) {
  const stages = memoryOn ? WITH_MEMORY : POLICY_ONLY;

  return (
    <div aria-live="polite">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {stages.map((s, i) => {
          const state = done || i < stage ? "done" : i === stage ? "active" : "todo";
          return (
            <li key={s} className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                {state === "done" ? (
                  <span className="h-[6px] w-[6px] rounded-full bg-teal" />
                ) : state === "active" ? (
                  <span aria-hidden="true" className="echo-live h-[6px] w-[6px] rounded-full bg-teal" />
                ) : (
                  <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-line2" />
                )}
                <span
                  className={cx(
                    "text-[13px] leading-none",
                    state === "done" ? "text-ink3" : state === "active" ? "text-ink" : "text-ink4",
                  )}
                >
                  {s}
                </span>
              </span>
              {i < stages.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cx("h-px w-6", state === "done" ? "bg-teal-soft" : "bg-line")}
                />
              )}
            </li>
          );
        })}
      </ol>

      {!memoryOn && (
        <p className="mt-3 text-[13px] leading-[1.6] text-ink3">
          Memory is off — institutional memory is not being searched, so this answer rests on the
          written policy alone.
        </p>
      )}
    </div>
  );
}
