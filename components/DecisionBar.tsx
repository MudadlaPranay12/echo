"use client";
// DecisionBar — the human decision area.
// Echo advises. A person decides. The resolution is then recorded on purpose,
// never silently. This sits directly under the investigation because that is
// where a decision is actually made: with the evidence still in view.

import ActionButton from "./ActionButton";
import type { ButtonState } from "./ActionButton";
import type { PromoteResult } from "./echoTypes";
import { Chip, Lbl, cx } from "./ui";

type Props = {
  /** A request is in flight. Actions must not be silently dropped, so they
   *  are disabled rather than accepting a click that would do nothing. */
  busy?: boolean;
  approve: ButtonState;
  escalate: ButtonState;
  reject: ButtonState;
  onApprove: () => void;
  onEscalate: () => void;
  onReject: () => void;

  recorded: boolean;
  remember: "idle" | "confirm" | "saving";
  onRemember: () => void;
  onRememberConfirm: () => void;
  onRememberCancel: () => void;

  promo?: PromoteResult;
  promote: ButtonState;
  onPromote: () => void;
};

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Loop() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 8a5 5 0 1 1-1.6-3.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 2v3.4H9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Draft() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
  remember,
  onRemember,
  onRememberConfirm,
  onRememberCancel,
  promo,
  promote,
  onPromote,
}: Props) {
  return (
    <div className="shrink-0 border-t border-line bg-base px-6 py-3">
      <div className="mx-auto max-w-[760px]">
        {/* confirmation for the memory write — inline, never a modal */}
        {remember !== "idle" && (
          <div className="echo-rise mb-2.5 flex flex-wrap items-center gap-2 rounded-[7px] border border-teal-soft bg-teal-wash px-3 py-2">
            <span className="text-[12px] text-ink2">
              Record this decision in Echo&rsquo;s institutional memory?
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <ActionButton variant="ghost" onClick={onRememberCancel} disabled={remember === "saving"}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                state={remember === "saving" ? "loading" : "idle"}
                onClick={onRememberConfirm}
              >
                Confirm
              </ActionButton>
            </div>
          </div>
        )}

        {/* draft policy — always framed as human review */}
        {promo && (
          <div className="echo-rise mb-2.5 rounded-[7px] border border-brass-soft bg-brass-wash px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Lbl className="text-brass">Draft policy</Lbl>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-brass">
                human review required
              </span>
            </div>
            {promo.eligible ? (
              <>
                <p className="mt-1.5 text-[12px] leading-[1.55] text-ink2">
                  {promo.draft_rule_basis}
                </p>
                {!!promo.evidence_case_ids?.length && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-ink4">Supporting cases</span>
                    {promo.evidence_case_ids.map((id) => (
                      <Chip key={id} mono brass>
                        {id}
                      </Chip>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-[12px] leading-[1.55] text-ink3">{promo.reason}</p>
            )}
          </div>
        )}

        {recorded ? (
          <div className="echo-rise flex flex-wrap items-center gap-2.5">
            <span className="echo-settle flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-good/12 text-good">
              <Check />
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink">Resolution recorded</div>
              <div className="text-[11.5px] leading-[1.45] text-ink3">
                Echo will remember this decision for future similar exceptions.
              </div>
            </div>
            {!promo && (
              <div className="ml-auto">
                <ActionButton state={promote} onClick={onPromote} icon={<Draft />}>
                  Propose as policy
                </ActionButton>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-ink3">Record a decision</span>
              {busy && (
                <span className="font-mono text-[10px] text-ink4">
                  waiting for Echo&rsquo;s answer…
                </span>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <ActionButton
                  variant="primary"
                  state={approve}
                  successLabel="Approved"
                  disabled={busy}
                  onClick={onApprove}
                  icon={<Check />}
                >
                  Approve
                </ActionButton>
                <ActionButton
                  state={escalate}
                  successLabel="Escalated"
                  disabled={busy}
                  onClick={onEscalate}
                  icon={<ArrowOut />}
                >
                  Escalate
                </ActionButton>
                <ActionButton
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

            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="text-ink4">
                <Loop />
              </span>
              <span className="text-[11px] text-ink3">Already settled this one?</span>
              <button
                type="button"
                onClick={onRemember}
                disabled={busy || remember !== "idle"}
                aria-disabled={busy || remember !== "idle"}
                className={cx(
                  "text-[11.5px] font-medium text-teal underline decoration-teal-soft underline-offset-2",
                  "transition-colors hover:decoration-teal",
                  (busy || remember !== "idle") && "pointer-events-none text-ink4 no-underline",
                )}
              >
                Resolve &amp; Remember
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
