"use client";
// Investigation — zone 2, the investigation itself.
//
// This is the page's centre of gravity and it is not a document. It is one line
// of enquiry running down a spine inside a single 800px measure:
//
//   case → exception → policy against practice → what Echo remembers
//        → evidence → recommendation → a human decides
//
// Nothing here is boxed. Sections are separated by 32px of air, the ledger sits
// directly in the workspace, and the case identity follows one fixed hierarchy:
// an 11px eyebrow, a 28px case id, a 16px vendor, 13px metadata. The parser below
// is unchanged: it only reads sections the model actually wrote.

import { useMemo } from "react";
import EchoMarkdown, { splitSections } from "./echoMarkdown";
import CaseFacts from "./CaseFacts";
import PolicyVsPractice from "./PolicyPractice";
import EvidenceTrail from "./EvidenceTrail";
import InvestigationProgress from "./InvestigationProgress";
import EchoMark from "./EchoMark";
import ConfidenceRing from "./ConfidenceRing";
import ConditionChain from "./ConditionChain";
import ProvenanceChip from "./ProvenanceChip";
import ReplayPanel from "./ReplayPanel";
import { Disclosure, Lbl, Spine, Stage } from "./ui";
import type { CaseItem, Turn } from "./echoTypes";

type Props = {
  c: CaseItem | null;
  log: Turn[];
  memoryOn: boolean;
  busy: boolean;
  stage: number;
  /** The last request to this case failed. The investigation stays open. */
  failed: boolean;
};

const MEASURE = "mx-auto w-full max-w-[800px] px-6";

/* ------------------------------------------------------------- reply parsing */

const RECOMMEND = /recommend|action|next step|what i suggest|do this/i;
const RATIONALE = /policy|practice|gap|why|route|condition|reason/i;

type Labelled = { label: string; body: string[] };

type Parsed = {
  lead: string[];
  recommendation: Labelled | null;
  rationale: Labelled[];
  details: Labelled[];
};

function parseAnswer(content: string): Parsed {
  const lead: string[] = [];
  const labeled: Labelled[] = [];
  for (const s of splitSections(content)) {
    if (s.label === null) lead.push(s.body.join("\n"));
    else labeled.push({ label: s.label, body: s.body });
  }

  const i = labeled.findIndex((s) => RECOMMEND.test(s.label));
  const others = labeled.filter((_, n) => n !== i);
  return {
    lead,
    recommendation: i >= 0 ? labeled[i] : null,
    rationale: others.filter((s) => RATIONALE.test(s.label)),
    details: others.filter((s) => !RATIONALE.test(s.label)),
  };
}

/* ------------------------------------------------------------------ states */

function Request({ text }: { text: string }) {
  return (
    <p className="rounded-[12px] border border-line bg-sunken px-4 py-3 text-[13px] leading-[1.6] text-ink3">
      {text}
    </p>
  );
}

function Recommendation({ label, body }: { label: string; body: string[] }) {
  return (
    <div className="rounded-[12px] border border-teal-soft bg-teal-wash px-4 py-3">
      <div className="flex items-center gap-2">
        <EchoMark size={14} className="shrink-0 text-teal" accent="#45cbb6" />
        <Lbl className="text-teal">{label}</Lbl>
      </div>
      <div className="mt-2 text-[16px] leading-[1.6] text-ink">
        <EchoMarkdown text={body.join("\n")} />
      </div>
    </div>
  );
}

/** The analysis service did not answer. Said plainly, without provider detail. */
function Unavailable() {
  return (
    <div className="rounded-[12px] border border-line bg-sunken px-4 py-4">
      <Lbl className="text-ink2">Echo could not complete this analysis</Lbl>
      <p className="mt-2 text-[13px] leading-[1.6] text-ink3">
        The investigation remains open. Try again when the analysis service is available.
      </p>
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="echo-stage" data-state="todo">
          <div className="flex items-center gap-3">
            <div className="echo-skeleton h-[10px] w-[16px] rounded-[8px]" />
            <div className="echo-skeleton h-[10px] w-[120px] rounded-[8px]" />
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-3 space-y-2">
            <div className="echo-skeleton h-[12px] w-full rounded-[8px]" />
            <div className="echo-skeleton h-[12px] w-[80%] rounded-[8px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-[48px] w-[48px] items-center justify-center rounded-[16px] border border-line bg-sunken">
        <EchoMark size={24} className="text-ink3" accent="#8b97a8" />
      </span>
      <h1 className="mt-6 text-[20px] font-semibold tracking-[-0.02em] text-ink">
        Open an exception to begin
      </h1>
      <p className="mt-3 max-w-[48ch] text-[14px] leading-[1.6] text-ink3">
        Echo reads the written policy, searches every decision your team has already made, and
        shows you where the two disagree. It advises — a person decides.
      </p>
    </div>
  );
}

/** What the workspace says about its own state. Never invented. */
function phaseLabel(memoryOn: boolean, busy: boolean, answered: boolean) {
  if (busy) return memoryOn ? "Recalling memory" : "Reading written policy";
  return answered ? "Comparison complete" : "Awaiting a case";
}

/* --------------------------------------------------------------------- view */

export default function Investigation({ c, log, memoryOn, busy, stage, failed }: Props) {
  const last = useMemo(() => [...log].reverse().find((t) => t.role === "assistant"), [log]);
  const brief = log.find((t) => t.role === "user")?.content;

  const parts = useMemo(() => (last ? parseAnswer(last.content) : null), [last]);

  const followUps = useMemo(() => {
    const firstUser = log.findIndex((t) => t.role === "user");
    const out: { q: string; a?: Turn }[] = [];
    for (let i = firstUser + 1; i < log.length; i++) {
      if (log[i].role !== "user") continue;
      out.push({
        q: log[i].content,
        a: log[i + 1]?.role === "assistant" ? log[i + 1] : undefined,
      });
    }
    return out;
  }, [log]);

  const recall = memoryOn ? last?.ev?.recall : undefined;
  const hasHistory = !!recall && !recall.no_history;
  const trail = hasHistory ? recall!.similar_cases : [];
  const phase = phaseLabel(memoryOn, busy, !!last);

  // State flags for special states
  const showNoHistory = memoryOn && recall?.no_history;
  const showMemoryOff = !memoryOn;
  const showError = failed;

  // Build investigation summary from backend facts
  const investigationSummary = useMemo(() => {
    if (!c || !recall) return null;
    if (recall.no_history) {
      return "No institutional precedent was found. Written policy is the only available guidance.";
    }
    const { stats, written_policy_route } = recall;
    const topCondition = stats.top_condition?.label;
    const conditionText = topCondition ? ` under the ${topCondition} condition` : "";
    return `Policy requires ${written_policy_route.toLowerCase()}. Historical practice shows ${stats.approved} of ${stats.similar_cases} comparable approvals${conditionText}.`;
  }, [recall, c]);

  if (!c) return <Empty />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------------------------------------ the case */}
      <header className={`shrink-0 pt-6 ${MEASURE}`}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal">
            Active investigation
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
          <span className="flex items-center gap-2">
            {busy && (
              <span aria-hidden="true" className="echo-live h-[5px] w-[5px] rounded-full bg-teal" />
            )}
            <span className="text-[13px] text-ink3">{phase}</span>
          </span>
        </div>

        {/* one fixed hierarchy: 11 / 28 / 16 / 13 */}
        <div className="mt-4 font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
          {c.invoiceNo}
        </div>
        <div className="mt-2 text-[16px] font-medium leading-none text-ink2">{c.vendor}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="text-ink3">{c.invoiceNo}</span>
          <span className="text-ink4">against</span>
          <span className="font-mono text-ink3">{c.poRef ?? "no PO"}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line2" />
          <span className="text-ink3">{c.exception.replace(/_/g, " ")}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line2" />
          <span className="font-mono tabular-nums text-ink3">{c.label}</span>
        </div>
      </header>

      {/* ---------------------------------------------------------- investigation summary */}
      {investigationSummary && (
        <div className={`shrink-0 ${MEASURE}`}>
          <div className="echo-investigation-summary">
            {investigationSummary}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- special states */}
      {showError && (
        <div className={`shrink-0 ${MEASURE}`}>
          <div className="echo-error">
            <div className="echo-error__title">Echo could not complete this analysis</div>
            <p className="echo-error__text">
              The investigation remains open. No new historical conclusion was produced.
            </p>
          </div>
        </div>
      )}
      {showNoHistory && (
        <div className={`shrink-0 ${MEASURE}`}>
          <div className="echo-memory-off">
            <div className="echo-memory-off__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="echo-memory-off__title">No institutional precedent</div>
            <p className="echo-memory-off__text">
              No relevant historical memory was found. Written policy is the only available guidance.
            </p>
          </div>
        </div>
      )}
      {showMemoryOff && !showNoHistory && !showError && (
        <div className={`shrink-0 ${MEASURE}`}>
          <div className="echo-memory-off echo-memory-off--off">
            <div className="echo-memory-off__title">Written policy only</div>
            <p className="echo-memory-off__text">
              Institutional memory is disabled for this investigation. No historical evidence is shown.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- the ledger */}
      <div className={`shrink-0 pb-6 pt-6 ${MEASURE}`}>
        <CaseFacts c={c} />
      </div>

      {/* --------------------------------------------------------- the enquiry */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`pb-16 ${MEASURE}`}>
          {busy ? (
            <div className="mb-8">
              <InvestigationProgress stage={stage} done={false} memoryOn={memoryOn} />
            </div>
          ) : null}

          {showError ? (
            <Unavailable />
          ) : !last && !busy ? (
            <Empty />
          ) : (
            <>
              <Spine className="space-y-8">
                {brief && !busy && (
                  <Stage n="01" label="The exception" state="done">
                    <Request text={brief} />
                    {parts && parts.lead.length > 0 && (
                      <div className="mt-3 text-[14px] leading-[1.6] text-ink2">
                        <EchoMarkdown text={parts.lead.join("\n\n")} />
                      </div>
                    )}
                  </Stage>
                )}

                {busy ? (
                  <DossierSkeleton />
                ) : (
                  parts && (
                    <>
                      <Stage
                        n="02"
                        label="Policy against practice"
                        state="done"
                        aside={
                          recall?.no_history ? (
                            <span className="font-mono text-[12px] tracking-[0.1em] text-brass">
                              NO PRECEDENT
                            </span>
                          ) : undefined
                        }
                      >
                        <PolicyVsPractice recall={recall} />
                        {parts.rationale.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {parts.rationale.map((s, i) => (
                              <div key={i}>
                                <Lbl>{s.label}</Lbl>
                                <div className="mt-2 text-[14px] leading-[1.6] text-ink2">
                                  <EchoMarkdown text={s.body.join("\n")} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Stage>

                      {/* -------------------------------------------- what it remembers */}
                      <Stage
                        n="03"
                        label="What Echo remembers"
                        state="done"
                        aside={
                          memoryOn ? (
                            hasHistory ? (
                              <span className="font-mono text-[12px] text-ink3">
                                {recall!.stats.similar_cases} CASES
                              </span>
                            ) : (
                              <span className="font-mono text-[12px] tracking-[0.1em] text-ink4">
                                POLICY ONLY
                              </span>
                            )
                          ) : (
                            <span className="font-mono text-[12px] tracking-[0.1em] text-ink4">
                              MEMORY OFF
                            </span>
                          )
                        }
                      >
                        {!memoryOn ? (
                          <p className="text-[14px] leading-[1.6] text-ink3">
                            Memory is off. Nothing was recalled, so this investigation rests on the
                            written policy alone.
                          </p>
                        ) : recall?.pattern_insight ? (
                          <div className="text-[14px] leading-[1.6] text-ink2">
                            <EchoMarkdown text={recall.pattern_insight.slice(0, 320)} />
                            {recall.pattern_insight.length > 320 && "…"}
                            <p className="mt-2 text-[12px] text-ink4">
                              The full synthesis is in the memory rail.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[14px] leading-[1.6] text-ink3">
                            {recall
                              ? "The recall returned no narrative synthesis for this exception."
                              : "Institutional memory has not been searched yet."}
                          </p>
                        )}
                      </Stage>

                      {/* ------------------------------------------------------ evidence */}
                      <Stage
                        n="04"
                        label="Evidence"
                        state="done"
                        aside={
                          hasHistory ? (
                            <span className="font-mono text-[12px] text-ink3">
                              {recall!.stats.approved}/{recall!.stats.similar_cases} APPROVED
                            </span>
                          ) : undefined
                        }
                      >
                        {trail.length > 0 && recall ? (
                          <>
                            {/* ---- Confidence Ring & Condition Chain */}
                            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                              <div className="flex items-start gap-4">
                                <ConfidenceRing
                                  confidence={recall.stats.confidence}
                                  cases={recall.stats.similar_cases}
                                  approved={recall.stats.approved}
                                />
                                <div className="flex flex-col justify-center">
                                  <p className="text-[13px] leading-[1.6] text-ink3">
                                    <span className="echo-provenance echo-provenance--computed">COMPUTED</span>
                                    {recall.stats.confidence}
                                  </p>
                                  <p className="mt-1 text-[12px] leading-[1.6] text-ink4">
                                    {recall.stats.similar_cases} comparable case{recall.stats.similar_cases === 1 ? "" : "s"}
                                  </p>
                                </div>
                              </div>
                              {recall.stats.top_condition && (
                                <ConditionChain
                                  exceptionPattern={recall.issue_family ?? ""}
                                  condition={recall.stats.top_condition.label}
                                  caseCount={recall.stats.similar_cases}
                                  approvedCount={recall.stats.approved}
                                  totalCases={recall.stats.similar_cases}
                                />
                              )}
                            </div>

                            <EvidenceTrail cases={trail} />
                            {recall.stats.top_condition && (
                              <p className="mt-4 text-[13px] leading-[1.6] text-ink3">
                                {recall.stats.approved} of {recall.stats.similar_cases} comparable
                                decisions were approved. The condition that decided them most often
                                was <span className="text-ink2">{recall.stats.top_condition.label}</span>.
                              </p>
                            )}
                          </>
                        ) : recall?.no_history ? (
                          <div className="echo-memory-off">
                            <div className="echo-memory-off__icon">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 8v4M12 16h.01" />
                              </svg>
                            </div>
                            <div className="echo-memory-off__title">No institutional precedent</div>
                            <p className="echo-memory-off__text">
                              Echo found no relevant historical cases. Written policy is therefore the available guidance.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[14px] leading-[1.6] text-ink3">
                            {!memoryOn
                              ? "No evidence trail — memory is off, so nothing was recalled."
                              : "No evidence surfaced yet."}
                          </p>
                        )}
                      </Stage>

                      {parts.recommendation && (
                        <Stage n="05" label="Recommendation" state="done">
                          <Recommendation
                            label={parts.recommendation.label}
                            body={parts.recommendation.body}
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <ProvenanceChip kind="synthesized" />
                            <p className="text-[12px] leading-[1.6] text-ink4">
                              Advisory. Nothing is approved or paid automatically — the decision below
                              is yours.
                            </p>
                          </div>
                        </Stage>
                      )}

                      {/* --------------------------------------------------- replay */}
                      {recall && hasHistory && (
                        <Stage n="06" label="Echo Replay" state="done">
                          <ReplayPanel
                            cases={trail.map((c) => ({
                              id: c.id,
                              outcome: c.outcome,
                              condition: c.condition,
                            }))}
                            currentCondition={recall.stats.top_condition?.label}
                          />
                        </Stage>
                      )}

                      {parts.details.length > 0 && (
                        <Stage n="07" label="Further analysis" state="done">
                          <div className="space-y-4">
                            {parts.details.map((s, i) => (
                              <div key={i}>
                                <Lbl>{s.label}</Lbl>
                                <div className="mt-2 text-[14px] leading-[1.6] text-ink2">
                                  <EchoMarkdown text={s.body.join("\n")} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </Stage>
                      )}
                    </>
                  )
                )}
              </Spine>

              {last?.tools && last.tools.length > 0 && !busy && (
                <p className="mt-8 border-t border-line pt-3 font-mono text-[12px] text-ink4">
                  {last.tools.join("  →  ")}
                </p>
              )}

              {followUps.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center gap-3 border-b border-line pb-3">
                    <Lbl className="text-ink2">Correspondence</Lbl>
                    <span className="font-mono text-[12px] text-ink4">
                      {followUps.length} question{followUps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2">
                    {followUps.map((f, i) => {
                      const p = f.a ? parseAnswer(f.a.content) : null;
                      return (
                        <Disclosure
                          key={i}
                          title={f.q.length > 76 ? `${f.q.slice(0, 76)}…` : f.q}
                          meta={i === followUps.length - 1 ? "current" : undefined}
                        >
                          {p ? (
                            <div className="space-y-3">
                              {p.lead.map((b, n) => (
                                <EchoMarkdown key={n} text={b} />
                              ))}
                              {p.recommendation && (
                                <Recommendation
                                  label={p.recommendation.label}
                                  body={p.recommendation.body}
                                />
                              )}
                              {[...p.rationale, ...p.details].map((s, n) => (
                                <div key={n}>
                                  <Lbl>{s.label}</Lbl>
                                  <div className="mt-2 text-[14px] leading-[1.6] text-ink2">
                                    <EchoMarkdown text={s.body.join("\n")} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[13px] text-ink3">No answer recorded.</p>
                          )}
                        </Disclosure>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
