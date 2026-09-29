"use client";
// Shared primitives.
//
// Deliberately few, and deliberately rigid. Every label in the product is the
// same size; every stage hangs from the same hairline; the memory frames are one
// component so they cannot drift apart. Spacing comes from the 4/8/12/16/24/32
// rhythm and nothing else.

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------- labels */

/** The one label style. 11px, uppercase, tracked. */
export function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-ink3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cx("transition-transform duration-200 ease-out", open && "rotate-90", className)}
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------- spine */

/** The hairline every stage in the investigation hangs from. */
export function Spine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("echo-spine", className)}>{children}</div>;
}

/**
 * One stage of the enquiry. The node on the spine is the only state: unlit
 * before it is reached, teal once it exists. The body is collapsible — the
 * header toggles that stage alone, and a header chevron shows its state.
 */
export function Stage({
  n,
  label,
  aside,
  state = "done",
  children,
  className,
  style,
  defaultOpen = true,
}: {
  n: string;
  label: string;
  aside?: ReactNode;
  state?: "todo" | "active" | "done";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Whether the section body is expanded on first render. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("echo-stage", className)} data-state={state} style={style}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 text-left"
      >
        <span className="font-mono text-[12px] font-semibold tabular-nums leading-none text-ink4 group-hover:text-ink2">
          {n}
        </span>
        <Chevron open={open} className="shrink-0 text-ink4 group-hover:text-ink2" />
        <Lbl className="shrink-0 text-ink2">{label}</Lbl>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        {aside && <span className="shrink-0">{aside}</span>}
      </button>
      <div
        className={cx(
          "echo-disclose grid",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- disclosure */

/** Smooth expand/collapse: instant height, animated opacity. */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex min-h-[44px] w-full items-center gap-2 py-2 text-left"
      >
        <Chevron open={open} className="shrink-0 text-ink4 group-hover:text-ink2" />
        <span className="truncate text-[13px] text-ink2 group-hover:text-ink">{title}</span>
        {meta && <span className="ml-auto shrink-0 font-mono text-[12px] text-ink4">{meta}</span>}
      </button>
      <div
        className={cx(
          "echo-disclose grid",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- hooks */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** Counts from 0 to `target`, then reports done. Under reduced motion it jumps. */
export function useCountUp(target: number, duration = 400) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (target <= 0) {
      setN(0);
      setDone(true);
      return;
    }
    if (reduced) {
      setN(target);
      setDone(true);
      return;
    }
    setN(0);
    setDone(false);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return { n, done };
}
