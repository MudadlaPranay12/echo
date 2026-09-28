"use client";
// Investigation — zone 2, the active investigation.
//
// This is a case file, not a chat transcript. It opens with the numbers, states
// the disagreement between documented and observed practice, gives the
// recommendation, and keeps the correspondence trail underneath. Nothing about
// how the agent reasons lives here; this only presents what came back.

import { useMemo } from "react";
import EchoMarkdown, { splitSections } from "./echoMarkdown";
import CaseFacts from "./CaseFacts";
import PolicyVsPractice from "./PolicyPractice";
import InvestigationProgress from "./InvestigationProgress";
import EchoMark from "./EchoMark";
import { Disclosure, Lbl, Section } from "./ui";
import type { CaseItem, Turn } from "./echoTypes";

type Props = {
  c: CaseItem | null;
  log: Turn[];
  memoryOn: boolean;
  busy: boolean;
  stage: number;
};

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

/* ------------------------------------------------------------------ pieces */

function Request({ text }: { text: string }) {
  return (
    <div className="border-l-2 border-line2 pl-3.5">
      <Lbl>Request</Lbl>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-ink2">{text}</p>
    </div>
  );
}

function AnswerBlocks({ parts }: { parts: Parsed }) {
  return (
    <>
      {parts.lead.map((body, i) => (
        <EchoMarkdown key={i} text={body} />
      ))}
      {parts.rationale.map((s, i) => (
        <div key={i} className="mt-3">
          <Lbl>{s.label}</Lbl>
          <div className="mt-1.5 text-[12.5px] leading-[1.65] text-ink2">
            <EchoMarkdown text={s.body.join("\n")} />
          </div>
        </div>
      ))}
    </>
  );
}

function Recommendation({ label, body }: { label: string; body: string[] }) {
  return (
    <div className="rounded-[8px] border border-teal-soft bg-teal-wash px-4 py-3.5">
      <div className="flex items-center gap-2">
        <EchoMark size={14} className="shrink-0 text-teal" accent="#0c615c" />
        <Lbl className="text-teal">{label}</Lbl>
      </div>
      <div className="mt-2.5 text-[13.5px] leading-[1.65] text-ink">
        <EchoMarkdown text={body.join("\n")} />
      </div>
    </div>
  );
}

function DossierSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-t border-line pt-4">
          <div className="flex items-center gap-2.5">
            <div className="echo-skeleton h-[9px] w-[18px] rounded-[3px]" />
            <div className="echo-skeleton h-[9px] w-[92px] rounded-[3px]" />
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-3.5 space-y-2">
            <div className="echo-skeleton h-[12px] w-full rounded-[4px]" />
            <div className="echo-skeleton h-[12px] w-[88%] rounded-[4px]" />
            {i === 0 && <div className="echo-skeleton mt-3 h-[46px] w-full rounded-[7px]" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-14 text-center">
      <EchoMark size={38} className="text-ink3" accent="#0c615c" />
      <h1 className="mt-5 text-[18px] font-semibold tracking-tight text-ink">
        Open an exception to begin
      </h1>
      <p className="mt-2.5 max-w-[46ch] text-[13px] leading-[1.7] text-ink3">
        Echo reads the written policy, searches every decision your team has
        already made, and shows you where the two disagree. It advises — a person
        decides.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- view */

export default function Investigation({ c, log, memoryOn, busy, stage }: Props) {
  const last = useMemo(
    () => [...log].reverse().find((t) => t.role === "assistant"),
    [log],
  );
  const brief = log.find((t) => t.role === "user")?.content;

  const parts = useMemo(
    () => (last ? parseAnswer(last.content) : null),
    [last],
  );

  const followUps = useMemo(() => {
    const firstUser = log.findIndex((t) => t.role === "user");
    const out: { q: string; a?: Turn }[] = [];
    for (let i = firstUser + 1; i < log.length; i++) {
      if (log[i].role !== "user") continue;
      out.push({ q: log[i].content, a: log[i + 1]?.role === "assistant" ? log[i + 1] : undefined });
    }
    return out;
  }, [log]);

  if (!c) return <Empty />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* --------------------------------------------------------- case head */}
      <div className="echo-rise shrink-0 border-b border-line bg-surface px-6 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {c.vendor}
          </h1>
          <span className="font-mono text-[11.5px] text-ink3">{c.invoiceNo}</span>
          <span className="rounded-[4px] border border-line bg-sunken px-1.5 py-[2px] font-mono text-[10px] text-ink2">
            {c.exception}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {busy && (
              <span aria-hidden="true" className="echo-live h-[6px] w-[6px] rounded-full bg-teal" />
            )}
            <span className="text-[10.5px] text-ink3">
              {busy ? "Investigating" : last ? "Investigation complete" : "Ready"}
            </span>
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------ metric strip */}
      <CaseFacts c={c} />

      {/* ----------------------------------------------------------- dossier */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 py-6">
          {!last && !busy ? (
            <Empty />
          ) : (
            <div className="space-y-7">
              {brief && !busy && <Request text={brief} />}

              {busy ? (
                <>
                  <InvestigationProgress stage={stage} done={false} memoryOn={memoryOn} />
                  <DossierSkeleton />
                </>
              ) : (
                parts && (
                  <>
                    {parts.lead.length > 0 && (
                      <div className="text-[14px] leading-[1.7] text-ink">
                        <EchoMarkdown text={parts.lead.join("\n\n")} />
                      </div>
                    )}

                    <Section
                      n="01"
                      label="Policy vs practice"
                      aside={
                        last?.ev?.recall?.no_history ? (
                          <span className="font-mono text-[9px] tracking-[0.1em] text-brass">
                            NO PRECEDENT
                          </span>
                        ) : undefined
                      }
                    >
                      <PolicyVsPractice recall={memoryOn ? last?.ev?.recall : undefined} />
                      {parts.rationale.length > 0 && (
                        <div className="mt-4">
                          <AnswerBlocks parts={{ ...parts, lead: [], rationale: parts.rationale }} />
                        </div>
                      )}
                    </Section>

                    {parts.recommendation && (
                      <Section n="02" label="Recommendation">
                        <Recommendation
                          label={parts.recommendation.label}
                          body={parts.recommendation.body}
                        />
                        <p className="mt-2.5 text-[11px] leading-[1.6] text-ink4">
                          Advisory. Nothing is approved or paid automatically — the
                          decision below is yours.
                        </p>
                      </Section>
                    )}

                    {parts.details.length > 0 && (
                      <Section n="03" label="Further analysis">
                        <div className="space-y-3.5">
                          {parts.details.map((s, i) => (
                            <div key={i}>
                              <Lbl>{s.label}</Lbl>
                              <div className="mt-1.5 text-[12.5px] leading-[1.65] text-ink2">
                                <EchoMarkdown text={s.body.join("\n")} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {last?.tools && last.tools.length > 0 && (
                      <p className="border-t border-line pt-3 font-mono text-[9.5px] text-ink4">
                        {last.tools.join("  →  ")}
                      </p>
                    )}
                  </>
                )
              )}

              {followUps.length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
                    <Lbl className="text-ink2">Correspondence</Lbl>
                    <span className="font-mono text-[10px] text-ink4">
                      {followUps.length} question{followUps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-2 text-[10.5px] text-ink4">
                    The current answer is the investigation above; earlier exchanges
                    are kept here as the record.
                  </p>
                  <div className="mt-1.5">
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
                                  <div className="mt-1.5 text-[12.5px] leading-[1.65] text-ink2">
                                    <EchoMarkdown text={s.body.join("\n")} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px] text-ink3">No answer recorded.</p>
                          )}
                        </Disclosure>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
