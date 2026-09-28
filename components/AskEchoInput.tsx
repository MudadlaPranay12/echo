"use client";
// AskEchoInput — the generative layer.
// A single composer scoped to the open case. It grows with its content, sends on
// Enter, and only lights up when there is something to send. Deliberately quiet:
// this is the follow-up channel, not the centre of the product.

import { useEffect, useRef } from "react";
import { cx } from "./ui";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  contextLabel?: string | null;
  placeholder?: string;
};

function SendArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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

export default function AskEchoInput({
  value,
  onChange,
  onSend,
  busy,
  contextLabel,
  placeholder = "Ask a follow-up about this exception…",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = value.trim().length > 0 && !busy;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  return (
    <div className="shrink-0 border-t border-line bg-surface px-6 pb-4 pt-3">
      <div className="mx-auto max-w-[760px]">
        {contextLabel && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-ink4">
              Scoped to
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-sunken px-1.5 py-[2px] font-mono text-[10.5px] text-ink2">
              <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-teal" />
              {contextLabel}
            </span>
          </div>
        )}

        <div
          className={cx(
            "flex items-end gap-2 rounded-[8px] border bg-base px-2 py-2",
            "shadow-[inset_0_1px_2px_rgba(23,24,26,0.04)]",
            "transition-[border-color,box-shadow,background-color] duration-200",
            value
              ? "border-teal-soft bg-surface"
              : "border-line focus-within:border-teal-soft focus-within:bg-surface",
          )}
        >
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            aria-label="Ask Echo a follow-up about this exception"
            className="max-h-[150px] min-h-[26px] flex-1 resize-none bg-transparent px-1 py-[3px] text-[13px] leading-[1.55] text-ink outline-none placeholder:text-ink4"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!ready}
            aria-label="Send to Echo"
            className={cx(
              "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] transition-all duration-200",
              ready
                ? "bg-teal text-white shadow-[0_0_0_3px_rgba(12,97,92,0.10)] hover:bg-teal-deep active:scale-95"
                : "bg-line text-ink4",
            )}
          >
            <SendArrow />
          </button>
        </div>
      </div>
    </div>
  );
}
