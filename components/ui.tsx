"use client";
// Small shared primitives: class helper, micro-labels, chips, disclosure, the
// numbered section block the investigation is built from, and the two hooks the
// motion layer needs.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------- labels */

export function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "text-[9.5px] font-semibold uppercase leading-none tracking-[0.15em] text-ink3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  accent = false,
  brass = false,
  mono = false,
  className,
}: {
  children: ReactNode;
  accent?: boolean;
  brass?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[2px] text-[10.5px] leading-[1.35]",
        mono && "font-mono",
        accent
          ? "border-teal-soft bg-teal-wash text-teal"
          : brass
            ? "border-brass-soft bg-brass-wash text-brass"
            : "border-line bg-sunken text-ink2",
        className,
      )}
    >
      {children}
    </span>
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

/* ------------------------------------------------------------------ section */

/**
 * A numbered block in the investigation file: step number, label, and a rule
 * that runs to the right margin. Sections are separated by rules rather than
 * boxed in cards, so a long dossier stays readable as one document.
 */
export function Section({
  n,
  label,
  aside,
  children,
  className,
}: {
  n: string;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("border-t border-line pt-4 first:border-t-0 first:pt-0", className)}>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] tabular-nums leading-none text-ink4">{n}</span>
        <Lbl className="shrink-0 text-ink2">{label}</Lbl>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        {aside && <span className="shrink-0">{aside}</span>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A label/value row. Used in dense read-only fact blocks. */
export function Fact({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <dt className="shrink-0 text-[11px] text-ink3">{k}</dt>
      <dd className={cx("min-w-0 text-right text-[11.5px] text-ink2", mono && "font-mono")}>{v}</dd>
    </div>
  );
}

/* -------------------------------------------------------------- disclosure */

/** Smooth expand/collapse using the grid-rows technique. */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
  right,
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
        >
          <Chevron open={open} className="shrink-0 text-ink4 transition-colors group-hover:text-ink2" />
          <span className="truncate text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink2 transition-colors group-hover:text-ink">
            {title}
          </span>
          {meta && <span className="shrink-0 font-mono text-[10px] text-ink4">{meta}</span>}
        </button>
        {right}
      </div>
      <div
        className={cx(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-3.5">{children}</div>
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

/**
 * Counts from 0 to `target`, then reports done. Under reduced motion it jumps
 * straight to the final value.
 */
export function useCountUp(target: number, duration = 900) {
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
