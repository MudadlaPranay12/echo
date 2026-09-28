"use client";
// ActionButton — the one button in Echo.
// Carries every state the brief asks for: default, hover, focus, pressed,
// loading, success, disabled.

import type { ReactNode } from "react";
import { cx } from "./ui";

export type ButtonState = "idle" | "loading" | "success";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="echo-spin">
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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

const VARIANT: Record<string, string> = {
  primary:
    "border-teal bg-teal text-white shadow-soft hover:border-teal-deep hover:bg-teal-deep hover:shadow-raise",
  secondary:
    "border-line2 bg-surface text-ink shadow-soft hover:border-ink4 hover:bg-sunken hover:shadow-raise",
  ghost: "border-transparent bg-transparent text-ink2 hover:bg-sunken hover:text-ink",
};

export default function ActionButton({
  children,
  onClick,
  variant = "secondary",
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex h-[30px] items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        success
          ? "border-good bg-good text-white shadow-soft"
          : VARIANT[variant],
        off && "pointer-events-none translate-y-0 opacity-45 shadow-none",
        className,
      )}
    >
      {loading ? <Spinner /> : success ? <Check /> : icon}
      <span>{success && successLabel ? successLabel : children}</span>
    </button>
  );
}
