"use client";
// ResolveRememberModal — the decision confirmation modal.
//
// Opens when the user clicks "Resolve & Remember" in the decision bar.
// Captures: Decision, Reason, Evidence, Notes.
// Frontend-only state; backend integration via existing save_resolution tool.

import { useState, useEffect, useRef } from "react";
import ActionButton from "./ActionButton";
import type { ButtonState } from "./ActionButton";
import { cx } from "./ui";

type Decision = "approve" | "reject" | "escalate";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: ResolveData) => void;
  defaultDecision?: Decision;
  approverName?: string;
  busy?: boolean;
};

type ResolveData = {
  decision: Decision;
  reason: string;
  evidence: string;
  notes: string;
  approver: string;
};

const DECISION_OPTIONS: { value: Decision; label: string; icon: React.ReactNode }[] = [
  { value: "approve", label: "Approve", icon: <CheckIcon /> },
  { value: "escalate", label: "Escalate", icon: <EscalateIcon /> },
  { value: "reject", label: "Reject", icon: <RejectIcon /> },
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.4 6.5 11.4 12.5 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EscalateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 11 11 5M6 5h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RejectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ResolveRememberModal({
  open,
  onClose,
  onConfirm,
  defaultDecision = "approve",
  approverName,
  busy = false,
}: Props) {
  const [decision, setDecision] = useState<Decision>(defaultDecision);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [notes, setNotes] = useState("");
  const [approver, setApprover] = useState(approverName ?? "");
  const [formState, setFormState] = useState<ButtonState>("idle");
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      focusRef.current?.focus();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDecision(defaultDecision);
      setReason("");
      setEvidence("");
      setNotes("");
      setApprover(approverName ?? "");
      setFormState("idle");
    }
  }, [open, defaultDecision, approverName]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!reason.trim() || !approver.trim()) return;
    setFormState("loading");
    onConfirm({ decision, reason, evidence, notes, approver });
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] rounded-[16px] border border-line bg-surface shadow-panel overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[16px] font-semibold text-ink">Resolve & Remember</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={busy || formState === "loading"}
              className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] text-ink4 hover:bg-sunken hover:text-ink disabled:opacity-40"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Decision */}
            <fieldset className="space-y-3">
              <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">Decision</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Decision">
                {DECISION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={decision === opt.value}
                    onClick={() => setDecision(opt.value)}
                    className={cx(
                      "flex h-[56px] flex-col items-center justify-center gap-2 rounded-[12px] border border-line bg-sunken transition-colors",
                      "text-[12px] font-medium",
                      decision === opt.value
                        ? "border-teal bg-teal-wash text-teal"
                        : "text-ink3 hover:border-teal-soft hover:text-ink2",
                    )}
                  >
                    <span className="text-teal">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Approver */}
            <div className="space-y-1.5">
              <label htmlFor="approver" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">
                Approver
              </label>
              <input
                id="approver"
                type="text"
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
                placeholder="e.g. Suresh Iyer"
                className="w-full h-[44px] rounded-[12px] border border-line bg-sunken px-4 text-[14px] text-ink outline-none placeholder:text-ink4 focus:border-teal"
                required
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label htmlFor="reason" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">
                Reason <span className="text-stop">*</span>
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this decision? Reference the policy, the evidence, the condition that decided it..."
                rows={3}
                className="w-full min-h-[80px] rounded-[12px] border border-line bg-sunken px-4 py-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-ink4 focus:border-teal resize-none"
                required
              />
            </div>

            {/* Evidence */}
            <div className="space-y-1.5">
              <label htmlFor="evidence" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">
                Evidence
              </label>
              <textarea
                id="evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Case IDs, policy clauses, vendor history, amounts..."
                rows={2}
                className="w-full min-h-[64px] rounded-[12px] border border-line bg-sunken px-4 py-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-ink4 focus:border-teal resize-none"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3">
                Notes (internal)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else the team should know..."
                rows={2}
                className="w-full min-h-[64px] rounded-[12px] border border-line bg-sunken px-4 py-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-ink4 focus:border-teal resize-none"
              />
            </div>
          </form>

          {/* Actions */}
          <div className="border-t border-line px-5 py-4 flex justify-end gap-3">
            <ActionButton
              variant="ghost"
              onClick={onClose}
              disabled={busy || formState === "loading"}
            >
              Cancel
            </ActionButton>
            <ActionButton
              variant="primary"
              state={formState}
              onClick={handleSubmit}
              disabled={busy || !reason.trim() || !approver.trim() || formState === "loading"}
              successLabel="Saved"
            >
              Save to Memory
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}