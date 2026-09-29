"use client";
// ActionButton — the one button in Echo.
//
// Every control in the product is 44px tall, padded 16px, rounded 12px, set at
// 14px. Nothing is oversized, including the primary: "Approve & Remember" is the
// same size as everything else and is distinguished by colour alone, because a
// larger button would imply a larger decision than the one being made.

import type { ReactNode } from "react";
import { cx } from "./ui";

export type ButtonState = "idle" | "loading" | "success";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  /** `primary` decides, `secondary` acts, `ghost` offers, `govern` records policy. */
  variant?: "primary" | "secondary" | "ghost" | "govern";
  /** Hue on hover. Shape and size never change. */
  tone?: "amber" | "red";
  icon?: ReactNode;
  state?: ButtonState;
  successLabel?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="echo-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.22" />
      <path
        d="M14 8A6 6 0 0 0 8 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.4 6.5 11.4 12.5 4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TONE: Record<string, string> = {
  amber: "hover:border-brass-soft hover:text-brass",
  red: "hover:border-stop/50 hover:text-stop",
};

export default function ActionButton({
  children,
  onClick,
  variant = "secondary",
  tone,
  icon,
  state = "idle",
  successLabel,
  disabled = false,
  className,
  title,
  ariaLabel,
}: Props) {
  const loading = state === "loading";
  const success = state === "success";
  const off = disabled || loading;
  const primary = variant === "primary";
  const bare = variant === "ghost";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cx(
        "echo-btn inline-flex h-[44px] shrink-0 items-center justify-center gap-2 rounded-[12px] px-4",
        "text-[14px] font-medium",
        bare
          ? "text-ink3 hover:text-ink"
          : primary
            ? "bg-teal text-accent-ink hover:bg-teal/90"
            : variant === "govern"
              ? "border border-brass-soft bg-brass-wash text-brass"
              : "border border-line2 bg-surface-2 text-ink2",
        !bare && !primary && !success && tone && TONE[tone],
        success && !primary && "border border-good/50 bg-good/10 text-good",
        off && "pointer-events-none opacity-45",
        className,
      )}
    >
      {loading ? <Spinner /> : success ? <Check /> : icon}
      <span>{success && successLabel ? successLabel : children}</span>
    </button>
  );
}
