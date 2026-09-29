"use client";
// DecisionBar — the human decision area.
//
// Echo advises. A person decides. The bar lives in the investigation's normal
// document flow, at the true end of the case content (after the last section),
// so it only comes into view once the user has scrolled all the way down.
//
// It is a strip, not a card — a single hairline and 16px of air. Every control is
// 44px, including "Approve & Remember", because the size of a button should not
// imply a bigger decision than the one on the table. On success the strip changes
// state in place: a check settles, the memory rail sweeps, and the controls
// become a record of what was decided.

import { useState } from "react";
import ActionButton from "./ActionButton";
import type { ButtonState } from "./ActionButton";
import type { PromoteResult } from "./echoTypes";
import ResolveRememberModal from "./ResolveRememberModal";
import { Lbl, cx } from "./ui";

type Props = {
  /** A request is in flight. Actions are disabled rather than silently dropped. */
  busy?: boolean;
  approve: ButtonState;
  escalate: ButtonState;
  reject: ButtonState;
  onApprove: () => void;
  onEscalate: () => void;
  onReject: () => void;

  recorded: boolean;
  onRememberConfirm: (data: {
    decision: "approve" | "reject" | "escalate";
    reason: string;
    evidence: string;
    notes: string;
    approver: string;
  }) => void;

  promo?: PromoteResult;
  promote: ButtonState;
  onPromote: () => void;
};

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.4 6.5 11.4 12.5 4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5 11 11 5M6 5h5v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Draft() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 2.5h6l3 3v8h-9v-11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 2.5v3.2h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export default function DecisionBar({
  busy = false,
  approve,
  escalate,
  reject,
  onApprove,
  onEscalate,
  onReject,
  recorded,
  onRememberConfirm,
  promo,
  promote,
  onPromote,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="border-t border-line bg-base px-6 py-2">
      <div className="mx-auto max-w-[800px]">
        {/* draft policy — always framed as human review */}
        {promo && (
          <div className="mb-2 border-l-2 border-brass-soft pl-3">
            <div className="flex items-center gap-2">
              <Lbl className="text-brass">Draft policy</Lbl>
              <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-brass/80">
                human review required
              </span>
            </div>
            {promo.eligible ? (
              <>
                <p className="mt-2 text-[13px] leading-[1.6] text-ink2">{promo.draft_rule_basis}</p>
                {!!promo.evidence_case_ids?.length && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-ink4">Supporting cases</span>
                    {promo.evidence_case_ids.map((id) => (
                      <span
                        key={id}
                        className="rounded-[8px] border border-brass-soft px-2 py-1 font-mono text-[12px] text-brass"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-[13px] leading-[1.6] text-ink3">{promo.reason}</p>
            )}
          </div>
        )}

        {recorded ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="echo-settle flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
              <Check />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ink">Decision recorded</div>
              <div className="text-[12px] leading-[1.6] text-ink3">
                Echo has learned from this. It will be part of the next comparable investigation.
              </div>
            </div>
            {!promo && (
              <div className="ml-auto">
                <ActionButton variant="govern" state={promote} onClick={onPromote} icon={<Draft />}>
                  Propose as policy
                </ActionButton>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <Lbl className="shrink-0">Human decision</Lbl>
              {busy && <span className="shrink-0 text-[12px] text-ink4">waiting for Echo…</span>}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[12px] text-ink4">Already settled this one?</span>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  disabled={busy}
                  className={cx(
                    "flex min-h-[32px] items-center px-1 text-[12px] font-medium text-teal",
                    "hover:underline hover:decoration-teal-soft hover:underline-offset-2",
                    busy && "pointer-events-none text-ink4",
                  )}
                >
                  Resolve & Remember
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  variant="primary"
                  state={approve}
                  successLabel="Approved"
                  disabled={busy}
                  onClick={onApprove}
                  icon={<Check />}
                >
                  Approve & Remember
                </ActionButton>
                <ActionButton
                  tone="amber"
                  state={escalate}
                  successLabel="Escalated"
                  disabled={busy}
                  onClick={onEscalate}
                  icon={<ArrowOut />}
                >
                  Escalate
                </ActionButton>
                <ActionButton
                  tone="red"
                  state={reject}
                  successLabel="Rejected"
                  disabled={busy}
                  onClick={onReject}
                  icon={<Cross />}
                >
                  Reject
                </ActionButton>
              </div>
            </div>
          </>
        )}

        {/* Resolve & Remember Modal */}
        <ResolveRememberModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={(data) => {
            onRememberConfirm(data);
            setModalOpen(false);
          }}
          defaultDecision="approve"
          busy={busy}
        />
      </div>
    </div>
  );
}