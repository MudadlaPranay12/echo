"use client";
// InvestigationProgress — the signature interaction.
// While Echo works the user sees the real steps of the investigation move
// forward on a single rail, then the dossier fills in underneath. The rail
// settles to ✓ before the answer lands. Stages never fake a long wait.

import { cx } from "./ui";

const STAGES_WITH_MEMORY = [
  "Reading the invoice",
  "Checking written policy",
  "Searching institutional memory",
  "Comparing precedent",
  "Forming recommendation",
];

const STAGES_POLICY_ONLY = [
  "Reading the invoice",
  "Checking written policy",
  "Forming recommendation",
];

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
  const stages = memoryOn ? STAGES_WITH_MEMORY : STAGES_POLICY_ONLY;

  return (
    <div className="rounded-[8px] border border-line bg-surface px-4 py-3.5 shadow-soft">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cx(
            "h-[6px] w-[6px] shrink-0 rounded-full",
            done ? "bg-good" : "echo-live bg-teal",
          )}
        />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-ink2">
          {done ? "Investigation complete" : "Echo is investigating"}
        </span>
      </div>

      <ol className="mt-3" aria-live="polite">
        {stages.map((s, i) => {
          const state = done || i < stage ? "done" : i === stage ? "active" : "todo";
          const last = i === stages.length - 1;
          return (
            <li key={s} className="flex gap-2.5">
              {/* rail */}
              <span className="flex w-[9px] shrink-0 flex-col items-center" aria-hidden="true">
                {state === "done" ? (
                  <span className="mt-[3px] flex h-[13px] w-[13px] items-center justify-center rounded-full bg-teal/12 text-teal">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.4 6.3 4.8 8.7 9.6 3.6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : state === "active" ? (
                  <span className="echo-live mt-[6px] h-[6px] w-[6px] rounded-full bg-teal" />
                ) : (
                  <span className="mt-[7px] h-[5px] w-[5px] rounded-full border border-line2" />
                )}
                {!last && (
                  <span
                    className={cx(
                      "w-px flex-1 transition-colors duration-300",
                      state === "done" ? "bg-teal-soft" : "bg-line",
                    )}
                  />
                )}
              </span>

              <span
                className={cx(
                  "pb-2.5 text-[12.5px] leading-[1.35] transition-colors duration-200 last:pb-0",
                  state === "done" ? "text-ink2" : state === "active" ? "text-ink" : "text-ink4",
                )}
              >
                {s}
              </span>
            </li>
          );
        })}
      </ol>

      {!memoryOn && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-[1.55] text-ink3">
          Memory is off — institutional memory is not being searched, so this
          answer rests on the written policy alone.
        </p>
      )}

      {done && <span className="sr-only">All {stages.length} stages complete.</span>}
    </div>
  );
}
