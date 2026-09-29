"use client";
// AskEchoInput — where the investigation continues.
//
// 52px tall, full width of the investigation column, 16px radius, 16px padding.
// It is exactly the same size idle and focused: the gradient edge is a masked
// pseudo-element, so the border gains luminance without the control moving a
// single pixel. The textarea grows only as a question gets longer, and only
// upward from a fixed base.

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called with an explicit question when a suggestion chip is used. */
  onSend: (v?: string) => void;
  busy: boolean;
  /** The case this composer is scoped to; null when nothing is open. */
  contextLabel?: string | null;
  placeholder?: string;
};

/** Only ever offered while the composer is empty and idle. */
const SUGGESTIONS = [
  "Who else has handled this?",
  "Should this become policy?",
  "What if the annexure is missing?",
];

function SendArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3.4M3.8 7.6 8 3.4l4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuggestionChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-line bg-sunken px-3 py-1.5 text-[12px] text-ink3 hover:border-teal-soft hover:text-ink transition-colors"
    >
      <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-teal/50" />
      {text}
    </button>
  );
}

export default function AskEchoInput({
  value,
  onChange,
  onSend,
  busy,
  contextLabel,
  placeholder = "Ask Echo a follow-up about this exception…",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(false);
  const [focused, setFocused] = useState(false);
  const ready = value.trim().length > 0 && !busy;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [value]);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 400);
    return () => clearTimeout(t);
  }, [sent]);

  const submit = (v?: string) => {
    if (busy) return;
    if (v !== undefined ? v.trim().length > 0 : ready) {
      setSent(true);
      onSend(v);
    }
  };

  /* Nothing open: an invitation, not an input that would be thrown away. */
  if (!contextLabel) {
    return (
      <div className="shrink-0 border-t border-line px-6 py-6 text-center">
        <p className="text-[13px] text-ink4">Open a case from the queue to ask a follow-up.</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-line px-6 py-4">
      <div className="mx-auto max-w-[800px]">
        <div className="mb-2 flex h-[24px] items-center gap-2">
          {busy ? (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="echo-pending-line h-px w-[64px] rounded-full" />
              <span className="text-[12px] text-ink3">Echo is working through it…</span>
            </span>
          ) : focused && !value ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink4">
                Try asking
              </span>
              {SUGGESTIONS.map((q) => (
                <SuggestionChip key={q} text={q} onClick={() => submit(q)} />
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink4">
                Scoped to
              </span>
              <span className="font-mono text-[12px] text-ink2">{contextLabel}</span>
            </span>
          )}
        </div>

        <div
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
          className="echo-compose flex min-h-[52px] items-center gap-2 rounded-[16px] px-4 py-3"
        >
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            aria-label="Ask Echo a follow-up about this exception"
            className="max-h-[176px] min-h-[20px] flex-1 resize-none bg-transparent text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink4"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={!ready}
            aria-label="Send to Echo"
            className={cx(
              "echo-send flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px]",
              sent && "echo-pulse-once",
              ready ? "bg-teal text-[#04140f]" : "bg-line2 text-ink4",
            )}
          >
            <SendArrow />
          </button>
        </div>
      </div>
    </div>
  );
}
